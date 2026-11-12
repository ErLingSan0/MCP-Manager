// JSON 格式配置文件读写
// 参考: add-mcp/src/formats/json.ts

use serde_json::{Map, Value};
use std::fs;
use std::path::Path;

/// 读取 JSON 配置文件，不存在则返回空对象
pub fn read_json(file_path: &str) -> Value {
    if !Path::new(file_path).exists() {
        return Value::Object(Map::new());
    }
    match fs::read_to_string(file_path) {
        Ok(content) => {
            if content.trim().is_empty() {
                return Value::Object(Map::new());
            }
            // 先按严格 JSON 解析；失败则按 JSONC 容错重试（opencode.jsonc 等）
            let parsed = serde_json::from_str::<Value>(&content)
                .ok()
                .or_else(|| serde_json::from_str::<Value>(&strip_jsonc(&content)).ok());
            match parsed {
                Some(v) if v.is_object() => v,
                _ => Value::Object(Map::new()),
            }
        }
        Err(_) => Value::Object(Map::new()),
    }
}

/// 去掉 JSONC 的行注释、块注释与尾随逗号，便于用标准 JSON 解析器读取。
///
/// 注意：写回时统一输出标准 JSON，原文件中的注释不会保留。
fn strip_jsonc(content: &str) -> String {
    let chars: Vec<char> = content.chars().collect();
    let mut out = String::with_capacity(content.len());
    let mut i = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    let mut pending_comma = false;

    while i < chars.len() {
        let c = chars[i];

        if in_string {
            out.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }

        // 逗号先挂起，看后面是不是 } 或 ]（尾随逗号）
        if pending_comma {
            if c.is_whitespace() {
                i += 1;
                continue;
            }
            if c == '}' || c == ']' {
                pending_comma = false;
                out.push(c);
                i += 1;
                continue;
            }
            out.push(',');
            pending_comma = false;
            continue;
        }

        match c {
            '"' => {
                in_string = true;
                out.push(c);
                i += 1;
            }
            ',' => {
                pending_comma = true;
                i += 1;
            }
            '/' if i + 1 < chars.len() && chars[i + 1] == '/' => {
                i += 2;
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
            }
            '/' if i + 1 < chars.len() && chars[i + 1] == '*' => {
                i += 2;
                while i + 1 < chars.len() && !(chars[i] == '*' && chars[i + 1] == '/') {
                    i += 1;
                }
                i = (i + 2).min(chars.len());
            }
            _ => {
                out.push(c);
                i += 1;
            }
        }
    }

    out
}

/// 写入 JSON 配置文件（合并模式）
pub fn write_json(
    file_path: &str,
    config_key: &str,
    server_name: &str,
    server_config: &Value,
) -> Result<(), String> {
    let mut config = read_json(file_path);
    if !config.is_object() {
        config = Value::Object(Map::new());
    }

    let root = config.as_object_mut().ok_or("Config is not an object")?;

    // 导航/创建嵌套 key（如 "mcpServers" 或 "a.b.c"）
    let parts: Vec<&str> = config_key.split('.').collect();
    let mut current = root;

    for (i, part) in parts.iter().enumerate() {
        if i == parts.len() - 1 {
            // 最后一级：插入 server
            let servers = current
                .entry(part.to_string())
                .or_insert_with(|| Value::Object(Map::new()));
            if !servers.is_object() {
                *servers = Value::Object(Map::new());
            }
            if let Some(servers_map) = servers.as_object_mut() {
                servers_map.insert(server_name.to_string(), server_config.clone());
            }
        } else {
            let next = current
                .entry(part.to_string())
                .or_insert_with(|| Value::Object(Map::new()));
            if !next.is_object() {
                *next = Value::Object(Map::new());
            }
            current = next.as_object_mut().unwrap();
        }
    }

    // 确保目录存在
    if let Some(parent) = Path::new(file_path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json_str = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(file_path, format!("{}\n", json_str)).map_err(|e| e.to_string())
}

/// 从 JSON 配置中删除指定 Server
pub fn remove_json_key(
    file_path: &str,
    config_key: &str,
    server_name: &str,
) -> Result<bool, String> {
    if !Path::new(file_path).exists() {
        return Ok(false);
    }

    let mut config = read_json(file_path);
    let root = config.as_object_mut().ok_or("Config is not an object")?;

    // 导航到嵌套位置
    let parts: Vec<&str> = config_key.split('.').collect();
    let mut current = root;

    for (i, part) in parts.iter().enumerate() {
        if i == parts.len() - 1 {
            if let Some(servers) = current.get_mut(*part) {
                if let Some(servers_map) = servers.as_object_mut() {
                    if servers_map.remove(server_name).is_some() {
                        let json_str =
                            serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
                        fs::write(file_path, format!("{}\n", json_str))
                            .map_err(|e| e.to_string())?;
                        return Ok(true);
                    }
                }
            }
            return Ok(false);
        } else {
            match current.get_mut(*part) {
                Some(v) if v.is_object() => {
                    current = v.as_object_mut().unwrap();
                }
                _ => return Ok(false),
            }
        }
    }

    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_jsonc_removes_comments_and_trailing_commas() {
        let src = r#"{
            // 行注释
            "$schema": "https://opencode.ai/config.json",
            /* 块注释 */
            "mcp": {
                "servers": {
                    "a": { "url": "https://x/y?a=1//not-a-comment" },
                },
            },
        }"#;

        let parsed: Value = serde_json::from_str(&strip_jsonc(src)).unwrap();

        assert_eq!(
            parsed["mcp"]["servers"]["a"]["url"],
            "https://x/y?a=1//not-a-comment"
        );
    }

    #[test]
    fn read_json_accepts_jsonc_file() {
        let dir = std::env::temp_dir().join("mcpm-jsonc-test");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("opencode.jsonc");
        fs::write(
            &path,
            "{\n  // 注释\n  \"mcp\": { \"servers\": {} },\n}\n",
        )
        .unwrap();

        let value = read_json(path.to_str().unwrap());

        assert_eq!(value["mcp"]["servers"], serde_json::json!({}));
        let _ = fs::remove_file(&path);
    }
}
