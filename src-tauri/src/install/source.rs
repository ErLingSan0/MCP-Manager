// 源码安装：git clone + 依赖安装 + 入口探测
//
// 只在 node 项目上用。默认关掉生命周期脚本（`--ignore-scripts`），
// 因为 postinstall 等于「贴个链接就同意执行任意代码」。装不起来时
// 由用户在确认弹窗里显式放开，而不是我们默认替他决定。

use crate::source::CodeRepoRef;
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PackageManager {
    Npm,
    Pnpm,
    Yarn,
    Bun,
}

impl PackageManager {
    pub fn binary(self) -> &'static str {
        match self {
            PackageManager::Npm => "npm",
            PackageManager::Pnpm => "pnpm",
            PackageManager::Yarn => "yarn",
            PackageManager::Bun => "bun",
        }
    }

    /// 安装生产依赖的参数（不含 ignore-scripts）
    pub fn install_args(self) -> Vec<&'static str> {
        match self {
            PackageManager::Npm => vec!["install", "--omit=dev"],
            PackageManager::Pnpm => vec!["install", "--prod"],
            PackageManager::Yarn => vec!["install", "--production"],
            PackageManager::Bun => vec!["install", "--production"],
        }
    }

    pub fn build_args(self) -> Vec<&'static str> {
        match self {
            PackageManager::Bun => vec!["run", "build"],
            _ => vec!["run", "build"],
        }
    }
}

/// 按 lockfile 判断包管理器；都没有就用 npm
pub fn detect_package_manager(app_dir: &Path) -> PackageManager {
    if app_dir.join("pnpm-lock.yaml").exists() {
        return PackageManager::Pnpm;
    }
    if app_dir.join("bun.lockb").exists() || app_dir.join("bun.lock").exists() {
        return PackageManager::Bun;
    }
    if app_dir.join("yarn.lock").exists() {
        return PackageManager::Yarn;
    }
    PackageManager::Npm
}

/// 从 package.json 声明里读入口（bin 优先，其次 main）
pub fn declared_entry(pkg: &Value) -> Option<String> {
    // bin 可以是字符串，也可以是 { name: path }
    match pkg.get("bin") {
        Some(Value::String(path)) => {
            if !path.trim().is_empty() {
                return Some(path.trim().to_string());
            }
        }
        Some(Value::Object(map)) => {
            // 取第一个非空值；bin 的键是命令名，值是真正的脚本路径
            for (_, path) in map {
                if let Some(path) = path.as_str() {
                    if !path.trim().is_empty() {
                        return Some(path.trim().to_string());
                    }
                }
            }
        }
        _ => {}
    }

    if let Some(main) = pkg.get("main").and_then(|v| v.as_str()) {
        if !main.trim().is_empty() {
            return Some(main.trim().to_string());
        }
    }

    None
}

pub fn has_build_script(pkg: &Value) -> bool {
    pkg.get("scripts")
        .and_then(|v| v.get("build"))
        .and_then(|v| v.as_str())
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
}

/// 没有声明入口时按常见布局找
const ENTRY_CANDIDATES: &[&str] = &[
    "src/server.js",
    "server.js",
    "src/index.js",
    "index.js",
    "dist/index.js",
    "dist/server.js",
    "build/index.js",
    "build/server.js",
    "src/main.js",
    "main.js",
    "src/index.mjs",
    "index.mjs",
];

/// 解析出真实存在的入口文件
pub fn resolve_entry(app_dir: &Path, pkg: Option<&Value>) -> Option<PathBuf> {
    if let Some(declared) = pkg.and_then(declared_entry) {
        let candidate = app_dir.join(&declared);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    for relative in ENTRY_CANDIDATES {
        let candidate = app_dir.join(relative);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

/// 读磁盘上的 package.json
pub fn read_manifest(app_dir: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(app_dir.join("package.json")).ok()?;
    serde_json::from_str(&text).ok()
}

/// clone 到目标目录（浅克隆，省时间省流量）
pub async fn clone(repo: &CodeRepoRef, app_dir: &Path) -> Result<(), String> {
    let url = format!("https://{}/{}/{}.git", repo.host, repo.owner, repo.repo);

    // 目标目录可能已存在（重装），git clone 要求它为空或不存在
    if app_dir.exists() {
        std::fs::remove_dir_all(app_dir).map_err(|e| format!("清理旧目录失败: {e}"))?;
    }
    if let Some(parent) = app_dir.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }

    let target = app_dir.to_string_lossy().to_string();
    run_logged("git", &["clone", "--depth", "1", &url, &target], None)
        .await
        .map(|_| ())
        .map_err(|e| format!("git clone 失败: {e}"))
}

/// 安装生产依赖。allow_scripts=false 时不跑 postinstall。
pub async fn install_deps(
    app_dir: &Path,
    manager: PackageManager,
    allow_scripts: bool,
) -> Result<String, String> {
    let mut args = manager.install_args();
    if !allow_scripts && manager != PackageManager::Yarn {
        // yarn 没有等价的开关，只能靠 yarnrc；这里只在 npm/pnpm/bun 上加
        args.push("--ignore-scripts");
    }

    run_logged(manager.binary(), &args, Some(app_dir))
        .await
        .map_err(|e| format!("{} 失败: {e}", manager.binary()))
}

/// 跑构建脚本（入口在 dist/build 里、源码是 TS 时才需要）
pub async fn run_build(app_dir: &Path, manager: PackageManager) -> Result<String, String> {
    run_logged(manager.binary(), &manager.build_args(), Some(app_dir))
        .await
        .map_err(|e| format!("{} run build 失败: {e}", manager.binary()))
}

/// 解析 node 的绝对路径。GUI 启动时 PATH 里通常没有 nvm 的 node，
/// 所以要写进配置的必须是绝对路径，不能只写 "node"。
pub fn resolve_node() -> Result<PathBuf, String> {
    crate::runtime::ensure_runtime_path_env();
    which::which("node").map_err(|_| "未找到 Node.js，请先安装 Node 18+".to_string())
}

/// 执行命令并收集输出；失败时把最后几行带出来
async fn run_logged(program: &str, args: &[&str], cwd: Option<&Path>) -> Result<String, String> {
    let mut cmd = tokio::process::Command::new(program);
    cmd.args(args);
    crate::runtime::apply_runtime_path_to_command(&mut cmd);
    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("无法执行 {program}: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        return Ok(format!("{stdout}\n{stderr}").trim().to_string());
    }

    // 只留最后 12 行，够定位问题又不会把界面刷爆
    let tail: Vec<&str> = stderr
        .lines()
        .chain(stdout.lines())
        .filter(|line| !line.trim().is_empty())
        .collect();
    let start = tail.len().saturating_sub(12);
    let detail = tail[start..].join("\n");

    Err(format!(
        "退出码 {:?}\n{}",
        output.status.code(),
        if detail.is_empty() { "（无输出）".to_string() } else { detail }
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_bin_object_entry() {
        let pkg = json!({ "bin": { "moonvy-ui-mcp": "src/server.js" } });
        assert_eq!(declared_entry(&pkg), Some("src/server.js".to_string()));
    }

    #[test]
    fn reads_bin_string_entry() {
        let pkg = json!({ "bin": "cli.js" });
        assert_eq!(declared_entry(&pkg), Some("cli.js".to_string()));
    }

    #[test]
    fn falls_back_to_main() {
        let pkg = json!({ "main": "dist/index.js" });
        assert_eq!(declared_entry(&pkg), Some("dist/index.js".to_string()));
    }

    #[test]
    fn prefers_bin_over_main() {
        // 有 bin 时 bin 才是真正的 MCP 入口，main 可能只是库导出
        let pkg = json!({ "bin": { "srv": "src/server.js" }, "main": "src/index.js" });
        assert_eq!(declared_entry(&pkg), Some("src/server.js".to_string()));
    }

    #[test]
    fn returns_none_without_entry_fields() {
        assert_eq!(declared_entry(&json!({})), None);
        assert_eq!(declared_entry(&json!({ "bin": "" })), None);
        // 声明了但文件不存在时也不能认
        let dir = std::env::temp_dir();
        assert!(resolve_entry(&dir, Some(&json!({ "bin": "definitely-missing.js" }))).is_none());
    }

    #[test]
    fn finds_conventional_entry_on_disk() {
        let dir = std::env::temp_dir().join(format!("mcpm-entry-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::write(dir.join("src/server.js"), "// x").unwrap();

        let found = resolve_entry(&dir, None).unwrap();
        assert!(found.ends_with("src/server.js"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn detects_build_script() {
        assert!(has_build_script(&json!({ "scripts": { "build": "tsc" } })));
        assert!(!has_build_script(&json!({ "scripts": { "test": "node --test" } })));
        assert!(!has_build_script(&json!({})));
    }

    #[test]
    fn picks_package_manager_by_lockfile() {
        let dir = std::env::temp_dir().join(format!("mcpm-pm-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        assert_eq!(detect_package_manager(&dir), PackageManager::Npm);
        std::fs::write(dir.join("pnpm-lock.yaml"), "").unwrap();
        assert_eq!(detect_package_manager(&dir), PackageManager::Pnpm);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn npm_install_args_can_disable_scripts() {
        let mut args = PackageManager::Npm.install_args();
        args.push("--ignore-scripts");
        assert!(args.contains(&"--ignore-scripts"));
        assert!(args.contains(&"--omit=dev"));
    }
}
