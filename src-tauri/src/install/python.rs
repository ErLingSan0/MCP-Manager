// Python 项目安装
//
// 只做「本地 venv + 把仓库装进去」这一条路：
//   git clone → 建虚拟环境 → pip install <repo> → 用 venv 里的 console script 启动
//
// 不做 Docker（要拉镜像、要守护进程）也不做 PyPI 在线运行（uvx），因为目标仓库
// 往往根本没发布到 PyPI。venv 的好处是依赖隔离、卸载就是删目录。
//
// 注意：Python 没有 npm 那种 `--ignore-scripts` 开关。`pip install` 必然要跑
// 项目的构建后端（setuptools/hatchling），所以「执行代码」是这条路的固有成本，
// 只能在确认弹窗里如实告知，不能假装可以关掉。

use std::path::{Path, PathBuf};
use tokio::process::Command;
/// 从 pyproject.toml / setup.py 里读出来的项目信息
#[derive(Debug, Clone, Default)]
pub struct PythonProject {
    /// console_scripts 里的命令名，装完会出现在 venv/bin 下
    pub console_script: Option<String>,
    /// 模块名，用于 `python -m <module>` 兜底
    pub module: Option<String>,
    /// Requires-Python 声明，仅用于提示
    pub requires_python: Option<String>,
    /// 依赖里是否有 playwright（需要额外下载 Chromium）
    pub needs_playwright: bool,
}

/// Python 最低版本要求
pub const MIN_PYTHON: (u32, u32) = (3, 10);

/// 从 pyproject.toml 文本解析
pub fn parse_pyproject(text: &str) -> PythonProject {
    let Ok(doc) = text.parse::<toml::Value>() else {
        return PythonProject::default();
    };

    let mut project = PythonProject::default();

    // [project] 是 PEP 621 标准；[tool.poetry] 是 poetry 的老写法
    let table = doc.get("project").or_else(|| doc.get("tool").and_then(|t| t.get("poetry")));

    if let Some(table) = table {
        // console script：优先 [project.scripts]，其次 [tool.poetry.scripts]
        let scripts = table
            .get("scripts")
            .and_then(|s| s.as_table())
            .or_else(|| doc.get("tool").and_then(|t| t.get("poetry")).and_then(|p| p.get("scripts")).and_then(|s| s.as_table()));

        if let Some(scripts) = scripts {
            if let Some((name, _)) = scripts.iter().next() {
                project.console_script = Some(name.to_string());
            }
        }

        if let Some(requires) = table.get("requires-python").and_then(|v| v.as_str()) {
            project.requires_python = Some(requires.to_string());
        }

        // 依赖里有没有 playwright
        if let Some(deps) = table.get("dependencies").and_then(|v| v.as_array()) {
            project.needs_playwright = deps.iter().any(|dep| {
                dep.as_str()
                    .map(|d| d.to_lowercase().contains("playwright"))
                    .unwrap_or(false)
            });
        }

        // 模块名：包名里的 - 换成 _
        if project.module.is_none() {
            if let Some(name) = table.get("name").and_then(|v| v.as_str()) {
                project.module = Some(name.replace('-', "_"));
            }
        }
    }

    project
}

/// 跑一个命令并把输出收集起来；失败带出最后几行
pub async fn run_logged(program: &str, args: &[&str], cwd: Option<&Path>) -> Result<String, String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    crate::runtime::apply_runtime_path_to_command(&mut cmd);
    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }
    // pip / uv 的输出有进度条，关掉更干净
    cmd.env("PIP_DISABLE_PIP_VERSION_CHECK", "1");

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("无法执行 {program}: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        return Ok(format!("{stdout}\n{stderr}").trim().to_string());
    }

    let tail: Vec<&str> = stderr
        .lines()
        .chain(stdout.lines())
        .filter(|line| !line.trim().is_empty())
        .collect();
    let start = tail.len().saturating_sub(12);

    Err(format!(
        "退出码 {:?}\n{}",
        output.status.code(),
        if tail.is_empty() { "（无输出）".to_string() } else { tail[start..].join("\n") }
    ))
}

/// 解析 `Python 3.12.1` 这样的版本输出
fn parse_version(text: &str) -> Option<(u32, u32)> {
    let token = text.split_whitespace().find(|t| t.chars().next().is_some_and(|c| c.is_ascii_digit()))?;
    let mut parts = token.split('.');
    let major = parts.next()?.parse::<u32>().ok()?;
    let minor = parts.next()?.parse::<u32>().ok()?;
    Some((major, minor))
}

/// 找一个 >= 3.10 的 Python。
///
/// 不能直接信任 `python3`：macOS 自带的是 3.9，而多数 MCP server 要求 3.10+。
async fn find_python() -> Option<(PathBuf, String)> {
    crate::runtime::ensure_runtime_path_env();

    for name in ["python3.13", "python3.12", "python3.11", "python3.10", "python3"] {
        let Ok(path) = which::which(name) else {
            continue;
        };
        let Ok(output) = Command::new(&path).arg("--version").output().await else {
            continue;
        };
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        if let Some(version) = parse_version(&text) {
            if version >= MIN_PYTHON {
                return Some((path, format!("{}.{}", version.0, version.1)));
            }
        }
    }
    None
}

fn find_uv() -> Option<PathBuf> {
    crate::runtime::ensure_runtime_path_env();
    which::which("uv").ok()
}

/// venv 里的 python 可执行文件
pub fn venv_python(venv: &Path) -> PathBuf {
    #[cfg(unix)]
    {
        venv.join("bin").join("python")
    }
    #[cfg(not(unix))]
    {
        venv.join("Scripts").join("python.exe")
    }
}

/// venv 里的 console script
pub fn venv_script(venv: &Path, name: &str) -> PathBuf {
    #[cfg(unix)]
    {
        venv.join("bin").join(name)
    }
    #[cfg(not(unix))]
    {
        venv.join("Scripts").join(format!("{name}.exe"))
    }
}

/// 建虚拟环境。优先用本机已装好的 Python；本机没有 3.10+ 时让 uv 去下载一个。
pub async fn create_venv(venv: &Path) -> Result<String, String> {
    if let Some((python, version)) = find_python().await {
        let venv_text = venv.to_string_lossy().to_string();
        run_logged(
            &python.to_string_lossy(),
            &["-m", "venv", "--clear", &venv_text],
            None,
        )
        .await
        .map_err(|e| format!("创建虚拟环境失败（Python {version}）: {e}"))?;
        return Ok(format!("Python {version}"));
    }

    // 本机没有够新的 Python：uv 可以托管一个
    if let Some(uv) = find_uv() {
        let venv_text = venv.to_string_lossy().to_string();
        run_logged(
            &uv.to_string_lossy(),
            &["venv", "--python", "3.12", &venv_text],
            None,
        )
        .await
        .map_err(|e| format!("uv 创建虚拟环境失败: {e}"))?;
        return Ok("Python 3.12（由 uv 下载）".to_string());
    }

    Err(format!(
        "未找到 Python {}.{}+。请先安装 Python 或 uv（brew install uv）",
        MIN_PYTHON.0, MIN_PYTHON.1
    ))
}

/// 把仓库装进虚拟环境
pub async fn install_package(venv: &Path, app_dir: &Path) -> Result<(), String> {
    let python = venv_python(venv);
    let app_text = app_dir.to_string_lossy().to_string();

    if let Some(uv) = find_uv() {
        run_logged(
            &uv.to_string_lossy(),
            &[
                "pip",
                "install",
                "--python",
                &python.to_string_lossy(),
                &app_text,
            ],
            None,
        )
        .await
        .map_err(|e| format!("uv pip install 失败: {e}"))?;
        return Ok(());
    }

    let python_text = python.to_string_lossy().to_string();
    run_logged(&python_text, &["-m", "pip", "install", "--upgrade", "pip"], None)
        .await
        .ok();

    run_logged(&python_text, &["-m", "pip", "install", &app_text], None)
        .await
        .map(|_| ())
        .map_err(|e| format!("pip install 失败: {e}"))
}

/// 装 Chromium（playwright 依赖浏览器才能取设计稿）。失败不算致命。
pub async fn install_browser(venv: &Path) -> Result<(), String> {
    let playwright = venv_script(venv, "playwright");
    if !playwright.exists() {
        return Err("venv 里没有 playwright 命令".to_string());
    }
    run_logged(
        &playwright.to_string_lossy(),
        &["install", "chromium"],
        None,
    )
    .await
    .map(|_| ())
}

/// 决定启动方式：console script → python -m → 顶层单文件
///
/// 返回 (要执行的文件, 额外参数)
pub fn resolve_entry(
    venv: &Path,
    app_dir: &Path,
    project: &PythonProject,
) -> Result<(PathBuf, Vec<String>), String> {
    // ① console script：pip install 会在 venv/bin 下生成，最可靠
    if let Some(name) = &project.console_script {
        let script = venv_script(venv, name);
        if script.exists() {
            return Ok((script, Vec::new()));
        }
    }

    let python = venv_python(venv);
    if !python.exists() {
        return Err("虚拟环境里没有 python，安装可能没完成".to_string());
    }

    // ② python -m <module>
    if let Some(module) = &project.module {
        let as_package = app_dir.join(module).join("__init__.py");
        let as_file = app_dir.join(format!("{module}.py"));
        if as_package.exists() || as_file.exists() {
            return Ok((python, vec!["-m".to_string(), module.clone()]));
        }
    }

    // ③ 仓库根下只有明显的主模块
    for name in ["server.py", "main.py", "app.py"] {
        let candidate = app_dir.join(name);
        if candidate.is_file() {
            return Ok((python, vec![candidate.to_string_lossy().to_string()]));
        }
    }

    Err("没找到入口：既没有 console_scripts，也找不到可当主模块的文件".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
[project]
name = "lanhu-mcp-server"
requires-python = ">=3.10"
dependencies = [
  "fastmcp>=3.0.2",
  "playwright>=1.48.0",
]

[project.scripts]
lanhu-mcp = "lanhu_mcp_server:main"
"#;

    #[test]
    fn reads_console_script_and_module() {
        let p = parse_pyproject(SAMPLE);
        assert_eq!(p.console_script.as_deref(), Some("lanhu-mcp"));
        assert_eq!(p.module.as_deref(), Some("lanhu_mcp_server"));
        assert_eq!(p.requires_python.as_deref(), Some(">=3.10"));
        assert!(p.needs_playwright);
    }

    #[test]
    fn handles_poetry_layout() {
        let text = r#"
[tool.poetry]
name = "my-mcp"

[tool.poetry.scripts]
my-mcp = "my_mcp:main"
"#;
        let p = parse_pyproject(text);
        assert_eq!(p.console_script.as_deref(), Some("my-mcp"));
        assert_eq!(p.module.as_deref(), Some("my_mcp"));
    }

    #[test]
    fn tolerates_garbage() {
        let p = parse_pyproject("not toml at all {{{");
        assert!(p.console_script.is_none());
        assert!(!p.needs_playwright);
    }

    #[test]
    fn parses_python_version_strings() {
        assert_eq!(parse_version("Python 3.12.1"), Some((3, 12)));
        assert_eq!(parse_version("Python 3.9.6"), Some((3, 9)));
        // 老版本 Python 把版本打到 stderr 也是这个格式
        assert_eq!(parse_version("Python 3.13.0a1"), Some((3, 13)));
        assert_eq!(parse_version("nonsense"), None);
        assert!((3, 9) < MIN_PYTHON);
    }

    #[test]
    fn venv_paths_follow_platform_layout() {
        let venv = Path::new("/tmp/v");
        #[cfg(unix)]
        {
            assert!(venv_python(venv).ends_with("bin/python"));
            assert!(venv_script(venv, "pw").ends_with("bin/pw"));
        }
    }
}
