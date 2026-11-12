// 本地安装模块
//
// 把「一个代码仓库地址」变成「一条能跑起来的本地 MCP Server 配置」。
// 两条路径，按安全性排序：
//
//   1. Release 预编译包 —— 首选。下载 + sha256 校验 + 解包落位，全程不执行任何脚本。
//   2. 源码安装 —— 兜底。git clone + 依赖安装，优先 `--ignore-scripts` 关掉
//      postinstall（那等于任意代码执行），装不起来时再由用户显式放开。
//
// 产物统一落在 `~/.mcpm/servers/<owner>-<repo>/`：
//
//   app/     实际内容（解包结果或 clone 下来的仓库）
//   run      包装脚本，供 MCP 配置的 command 指向
//
// 为什么要这层包装：MCP 的 stdio 配置**没有 cwd 字段**，进程会继承启动方的
// 工作目录。而不少 server 靠 `process.cwd()` 找 `.env`（dotenv 就是这么工作的），
// 直接写 `node /abs/path/server.js` 会读错目录。包装脚本先 cd 再 exec，绕开这个限制。

pub mod python;
pub mod release;
pub mod source;

use serde::Serialize;
use std::path::{Path, PathBuf};

/// 安装方式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallKind {
    /// GitHub Release 预编译包
    Release,
    /// Node 源码克隆 + 依赖安装
    Source,
    /// Python 源码克隆 + venv 安装
    Python,
}

impl InstallKind {
    /// 落盘时的标识，用于日志与「重新安装」时的判断
    pub fn as_str(self) -> &'static str {
        match self {
            InstallKind::Release => "release",
            InstallKind::Source => "source",
            InstallKind::Python => "python",
        }
    }
}

/// 托管目录根：`~/.mcpm/servers`
///
/// 特意没用 `~/Library/Application Support/MCP Manager`——那个路径带空格，
/// 命令解析按空格切分时会被拆坏，而这里要作为 command 的唯一路径。
pub fn servers_root() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".mcpm")
        .join("servers")
}

/// `owner/repo` → 单层目录名。只保留文件名安全字符，防止仓库名里的怪字符越界。
pub fn server_dir_name(slug: &str) -> String {
    let name: String = slug
        .replace('/', "-")
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();

    if name.is_empty() {
        "mcp-server".to_string()
    } else {
        name
    }
}

pub fn server_dir(slug: &str) -> PathBuf {
    servers_root().join(server_dir_name(slug))
}

/// 单引号包裹，内部单引号用 '\'' 转义
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r#"'\''"#))
}

/// 写启动脚本，返回脚本路径
///
/// `workdir` 是运行时的当前目录，`program` 是要 exec 的可执行文件，
/// `args` 是固定附加的参数（node 需要入口文件，python 可能需要 `-m <module>`）。
pub fn write_launcher(
    dir: &Path,
    workdir: &Path,
    program: &Path,
    args: &[String],
) -> std::io::Result<PathBuf> {
    let program_str = program.to_string_lossy().to_string();

    let mut body = String::from("#!/bin/sh\n");
    body.push_str("# 由 MCP Manager 生成，重新安装会覆盖，请勿手工修改\n");
    body.push_str(&format!("cd {} || exit 1\n", shell_quote(&workdir.to_string_lossy())));
    body.push_str(&format!("exec {}", shell_quote(&program_str)));
    for arg in args {
        body.push_str(&format!(" {}", shell_quote(arg)));
    }
    body.push_str(" \"$@\"\n");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.join("run");
        std::fs::write(&path, body)?;
        let mut perms = std::fs::metadata(&path)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&path, perms)?;
        Ok(path)
    }

    #[cfg(not(unix))]
    {
        // Windows 用 .cmd，路径用双引号
        let path = dir.join("run.cmd");
        let mut cmd_body = String::from("@echo off\r\n");
        cmd_body.push_str(&format!("cd /d \"{}\"\r\n", workdir.display()));
        cmd_body.push_str(&format!("\"{}\"", program.display()));
        for arg in args {
            cmd_body.push_str(&format!(" \"{}\"", arg));
        }
        cmd_body.push_str(" %*\r\n");
        std::fs::write(&path, cmd_body)?;
        Ok(path)
    }
}

/// 清空并重建目录（重装时避免上一版残留干扰）
pub fn reset_dir(dir: &Path) -> std::io::Result<PathBuf> {
    if dir.exists() {
        std::fs::remove_dir_all(dir)?;
    }
    let app = dir.join("app");
    std::fs::create_dir_all(&app)?;
    Ok(app)
}

/// 递归找可执行文件，用于从解包结果里定位真正的二进制
pub fn find_executables(root: &Path, depth: usize) -> Vec<PathBuf> {
    let mut found = Vec::new();
    if depth == 0 {
        return found;
    }
    let Ok(entries) = std::fs::read_dir(root) else {
        return found;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            found.extend(find_executables(&path, depth - 1));
            continue;
        }
        if is_executable_candidate(&path) {
            found.push(path);
        }
    }
    found
}

/// 判断是不是「像可执行文件」：有执行位，且不是文档/校验文件
fn is_executable_candidate(path: &Path) -> bool {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    if name.ends_with(".md")
        || name.ends_with(".txt")
        || name.ends_with(".json")
        || name.ends_with(".sha256")
        || name.ends_with(".sig")
        || name.ends_with(".asc")
        || name.ends_with(".toml")
        || name.ends_with(".yml")
        || name.ends_with(".yaml")
        || name.ends_with(".png")
        || name.ends_with(".svg")
        || name.starts_with('.')
    {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let Ok(meta) = std::fs::metadata(path) else {
            return false;
        };
        meta.is_file() && meta.permissions().mode() & 0o111 != 0
    }

    #[cfg(not(unix))]
    {
        path.is_file() && (name.ends_with(".exe") || !name.contains('.'))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_dir_name_is_filesystem_safe() {
        assert_eq!(server_dir_name("Cc-Zzh1/moonvy-ui-mcp"), "Cc-Zzh1-moonvy-ui-mcp");
        // 斜杠与怪字符不能逃出目标目录
        assert_eq!(server_dir_name("a/b"), "a-b");
        assert!(!server_dir_name("../../etc/passwd").contains('/'));
        assert!(!server_dir_name("x y/z").contains(' '));
        assert_eq!(server_dir_name(""), "mcp-server");
    }

    #[test]
    fn quotes_shell_arguments() {
        assert_eq!(shell_quote("/a/b"), "'/a/b'");
        // 路径里带单引号时不能把脚本写坏
        assert_eq!(shell_quote("/a/b'c"), r#"'/a/b'\''c'"#);
    }

    #[test]
    fn launcher_cds_before_exec() {
        let dir = std::env::temp_dir().join(format!("mcpm-launcher-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let app = dir.join("app");
        std::fs::create_dir_all(&app).unwrap();

        let run = write_launcher(
            &dir,
            &app,
            Path::new("/usr/bin/node"),
            &["/x/y.js".to_string()],
        )
        .unwrap();
        let text = std::fs::read_to_string(&run).unwrap();

        assert!(text.starts_with("#!/bin/sh"));
        assert!(text.contains(&format!("cd '{}'", app.display())));
        assert!(text.contains("exec '/usr/bin/node' '/x/y.js' \"$@\""));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn launcher_keeps_multiple_arguments() {
        let dir = std::env::temp_dir().join(format!("mcpm-launcher2-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        // python -m <module> 是两个参数，不能被吞掉
        let run = write_launcher(
            &dir,
            &dir,
            Path::new("/v/bin/python"),
            &["-m".to_string(), "lanhu_mcp_server".to_string()],
        )
        .unwrap();
        let text = std::fs::read_to_string(&run).unwrap();
        assert!(text.contains("exec '/v/bin/python' '-m' 'lanhu_mcp_server' \"$@\""));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn finds_only_executable_candidates() {
        let dir = std::env::temp_dir().join(format!("mcpm-find-test-{}", std::process::id()));
        let nested = dir.join("pkg-linux");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(dir.join("README.md"), "docs").unwrap();
        std::fs::write(dir.join("checksum.sha256"), "abc").unwrap();
        std::fs::write(nested.join("mcp-server"), "binary").unwrap();

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let path = nested.join("mcp-server");
            let mut perms = std::fs::metadata(&path).unwrap().permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&path, perms).unwrap();
        }

        let found = find_executables(&dir, 3);
        assert_eq!(found.len(), 1, "只应认出真正的二进制: {found:?}");
        assert!(found[0].ends_with("mcp-server"));

        std::fs::remove_dir_all(&dir).ok();
    }
}
