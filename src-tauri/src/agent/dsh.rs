// DeepSeek Harness (DSH) MCP 配置读写
//
// DSH 不用常见的 mcpServers 映射，而是把每个 MCP server 作为
// ~/.dsh/profiles/desktop/cordis.patch.yml 里的一条插件记录：
//
// - id: mcp-github
//   name: '@deepseek-ai/dsh-mcp-client'
//   config:
//     serverName: github
//     transport: stdio | streamable-http
//     command / args / env / url / headers
//
// 因此这里单独实现读取、写入和删除。

use crate::agent::types::McpServerConfig;
use crate::format::yaml::{json_to_yaml, read_yaml};
use serde_json::{json, Map, Value};
use std::fs;
use std::path::Path;
use yaml_rust2::YamlEmitter;

pub const PLUGIN_NAME: &str = "@deepseek-ai/dsh-mcp-client";

/// macOS 上以 App 是否存在判断安装，避免卸载后残留的 ~/.dsh 造成误报
pub fn is_installed() -> bool {
    #[cfg(target_os = "macos")]
    {
        let mut candidates = vec!["/Applications/DeepSeek Harness.app".to_string()];
        if let Some(home) = dirs::home_dir() {
            candidates.push(
                home.join("Applications/DeepSeek Harness.app")
                    .to_string_lossy()
                    .to_string(),
            );
        }
        candidates.iter().any(|path| Path::new(path).exists())
    }
    #[cfg(not(target_os = "macos"))]
    {
        dirs::home_dir()
            .map(|home| home.join(".dsh").exists())
            .unwrap_or(false)
    }
}

fn read_entries(file_path: &str) -> Vec<Value> {
    match read_yaml(file_path) {
        Value::Array(entries) => entries,
        _ => Vec::new(),
    }
}

fn write_entries(file_path: &str, entries: &[Value]) -> Result<(), String> {
    // 保留文件顶部的注释说明，避免覆盖用户 profile 里的上下文
    let existing = fs::read_to_string(file_path).unwrap_or_default();
    let header = existing
        .lines()
        .take_while(|line| line.trim_start().starts_with('#') || line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    let doc = json_to_yaml(&Value::Array(entries.to_vec()));
    let mut out = String::new();
    {
        let mut emitter = YamlEmitter::new(&mut out);
        emitter
            .dump(&doc)
            .map_err(|error| format!("YAML emit error: {}", error))?;
    }
    if !header.trim().is_empty() {
        out = format!("{}\n{}", header.trim_end(), out);
    }

    if let Some(parent) = Path::new(file_path).parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(file_path, out).map_err(|error| error.to_string())
}

fn entry_server_name(entry: &Value) -> Option<&str> {
    entry
        .get("config")
        .and_then(|config| config.get("serverName"))
        .and_then(Value::as_str)
}

/// 读取 DSH patch 中由 MCP Manager 写入的 server，转成统一配置
pub fn read_servers(file_path: &str) -> Vec<(String, Value)> {
    let mut servers = Vec::new();

    for entry in read_entries(file_path) {
        if entry.get("name").and_then(Value::as_str) != Some(PLUGIN_NAME) {
            continue;
        }
        let Some(config) = entry.get("config") else {
            continue;
        };
        let Some(server_name) = config.get("serverName").and_then(Value::as_str) else {
            continue;
        };

        let transport = config
            .get("transport")
            .and_then(Value::as_str)
            .unwrap_or("stdio");

        let normalized = if transport.contains("http") {
            let mut map = Map::new();
            map.insert("type".to_string(), json!("http"));
            if let Some(url) = config.get("url") {
                map.insert("url".to_string(), url.clone());
            }
            if let Some(headers) = config.get("headers") {
                map.insert("headers".to_string(), headers.clone());
            }
            Value::Object(map)
        } else {
            let mut map = Map::new();
            if let Some(command) = config.get("command") {
                map.insert("command".to_string(), command.clone());
            }
            if let Some(args) = config.get("args") {
                map.insert("args".to_string(), args.clone());
            }
            if let Some(env) = config.get("env") {
                map.insert("env".to_string(), env.clone());
            }
            Value::Object(map)
        };

        servers.push((server_name.to_string(), normalized));
    }

    servers
}

/// 新增或更新一个 MCP server
pub fn upsert_server(
    file_path: &str,
    server_name: &str,
    config: &McpServerConfig,
) -> Result<(), String> {
    let mut entries = read_entries(file_path);

    let mut plugin_config = Map::new();
    plugin_config.insert("serverName".to_string(), json!(server_name));

    if config.is_remote() {
        plugin_config.insert("transport".to_string(), json!("streamable-http"));
        if let Some(url) = &config.url {
            plugin_config.insert("url".to_string(), json!(url));
        }
        if let Some(headers) = &config.headers {
            if !headers.is_empty() {
                plugin_config.insert("headers".to_string(), json!(headers));
            }
        }
    } else {
        plugin_config.insert("transport".to_string(), json!("stdio"));
        if let Some(command) = &config.command {
            plugin_config.insert("command".to_string(), json!(command));
        }
        if let Some(args) = &config.args {
            if !args.is_empty() {
                plugin_config.insert("args".to_string(), json!(args));
            }
        }
        if let Some(env) = &config.env {
            if !env.is_empty() {
                plugin_config.insert("env".to_string(), json!(env));
            }
        }
    }

    let entry = json!({
        "id": format!("mcp-{}", sanitize_id(server_name)),
        "name": PLUGIN_NAME,
        "config": Value::Object(plugin_config),
    });

    let mut replaced = false;
    for existing in entries.iter_mut() {
        if existing.get("name").and_then(Value::as_str) == Some(PLUGIN_NAME)
            && entry_server_name(existing) == Some(server_name)
        {
            *existing = entry.clone();
            replaced = true;
            break;
        }
    }
    if !replaced {
        entries.push(entry);
    }

    write_entries(file_path, &entries)
}

/// 删除指定 server，返回是否真的删掉了
pub fn remove_server(file_path: &str, server_name: &str) -> Result<bool, String> {
    let entries = read_entries(file_path);
    let before = entries.len();
    let remaining: Vec<Value> = entries
        .into_iter()
        .filter(|entry| {
            !(entry.get("name").and_then(Value::as_str) == Some(PLUGIN_NAME)
                && entry_server_name(entry) == Some(server_name))
        })
        .collect();

    if remaining.len() == before {
        return Ok(false);
    }

    write_entries(file_path, &remaining)?;
    Ok(true)
}

fn sanitize_id(server_name: &str) -> String {
    server_name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn temp_file(name: &str) -> String {
        std::env::temp_dir()
            .join(format!("mcpm-dsh-{}-{}.yml", std::process::id(), name))
            .to_string_lossy()
            .to_string()
    }

    #[test]
    fn writes_reads_and_removes_stdio_servers() {
        let file = temp_file("stdio");
        let _ = fs::remove_file(&file);

        let config = McpServerConfig {
            command: Some("npx".to_string()),
            args: Some(vec!["-y".to_string(), "server-github".to_string()]),
            env: Some(HashMap::from([(
                "GITHUB_TOKEN".to_string(),
                "token".to_string(),
            )])),
            ..Default::default()
        };

        upsert_server(&file, "github", &config).unwrap();
        let servers = read_servers(&file);
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].0, "github");
        assert_eq!(servers[0].1["command"], "npx");

        assert!(remove_server(&file, "github").unwrap());
        assert!(read_servers(&file).is_empty());
        let _ = fs::remove_file(&file);
    }

    #[test]
    fn writes_streamable_http_servers() {
        let file = temp_file("http");
        let _ = fs::remove_file(&file);

        let config = McpServerConfig {
            url: Some("https://mcp.notion.com/mcp".to_string()),
            headers: Some(HashMap::from([(
                "Authorization".to_string(),
                "Bearer token".to_string(),
            )])),
            ..Default::default()
        };

        upsert_server(&file, "notion", &config).unwrap();
        let servers = read_servers(&file);
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].1["type"], "http");
        assert_eq!(servers[0].1["url"], "https://mcp.notion.com/mcp");
        let _ = fs::remove_file(&file);
    }
}
