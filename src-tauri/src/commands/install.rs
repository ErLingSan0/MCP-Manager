// 本地安装 Commands
//
// 把代码仓库地址变成「一条能直接用的 stdio 配置」。
// 分成两步，中间由用户确认：
//   plan_install  —— 只读探测，告诉用户「打算怎么装、会执行哪些命令」
//   install_local —— 真正下手，全程推送进度
//
// 安装方式按安全性排序：Release 预编译包 > 源码克隆（默认关生命周期脚本）。

use crate::install::{self, python, release, source, InstallKind};
use crate::source::{parse_code_repo_url, CodeRepoRef};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// 安装计划（给 UI 展示，不执行任何写操作）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub repo: String,
    /// 建议的服务名：一律用 Git 仓库名，不做任何缩写或后缀裁剪，
    /// 这样用户回到列表里能按仓库名一眼找到
    pub suggested_name: String,
    /// 安装目录
    pub target_dir: String,
    pub kind: InstallKind,
    /// Release tag
    pub version: Option<String>,
    pub asset_name: Option<String>,
    pub asset_size: Option<u64>,
    /// 源码安装时预计的入口文件
    pub entry: Option<String>,
    pub package_manager: Option<String>,
    /// 将要执行的命令（原样展示给用户确认）
    pub commands: Vec<String>,
    /// 风险提示与说明
    pub notes: Vec<String>,
}

/// 安装结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub kind: InstallKind,
    /// 建议的服务名（= Git 仓库名）
    pub suggested_name: String,
    pub dir: String,
    /// 启动脚本绝对路径，直接作为 MCP 配置的 command
    pub command: String,
    pub args: Vec<String>,
    pub log: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallProgress {
    stage: String,
    message: String,
    percent: u8,
}

fn emit(app: &AppHandle, stage: &str, message: &str, percent: u8) {
    let _ = app.emit(
        "install:progress",
        InstallProgress {
            stage: stage.to_string(),
            message: message.to_string(),
            percent,
        },
    );
}

fn megabytes(bytes: u64) -> String {
    format!("{:.1} MB", bytes as f64 / 1_048_576.0)
}

fn parse_repo(url: &str) -> Result<CodeRepoRef, String> {
    parse_code_repo_url(url).ok_or_else(|| "这不是代码仓库地址".to_string())
}

/// 服务名一律取 Git 仓库名，原样照抄。
///
/// 不要在这里做「去掉 -mcp 后缀」「取首个单词」之类的美化：名字是用户回到
/// 智能体配置里检索服务的唯一线索，跟仓库名不一致就会找不到。
fn suggested_name(repo: &CodeRepoRef) -> String {
    repo.repo.clone()
}

/// 算出安装计划：先看有没有 Release 预编译包，没有再看是不是 Node 项目
async fn build_plan(repo: &CodeRepoRef) -> Result<InstallPlan, String> {
    let dir = install::server_dir(&repo.slug());
    let dir_text = dir.to_string_lossy().to_string();
    let mut notes: Vec<String> = Vec::new();

    // ① Release 预编译包：不执行任何脚本，安全等级最高
    match release::probe(repo).await {
        Ok(Some(info)) => {
            let commands = vec![
                format!(
                    "下载 {}（{}）",
                    info.asset.name,
                    megabytes(info.asset.size)
                ),
                if info.asset.digest.is_some() {
                    "校验 sha256".to_string()
                } else {
                    "解包（该 Release 未提供 digest，跳过校验）".to_string()
                },
                format!("解包到 {dir_text}/app"),
                format!("生成启动脚本 {dir_text}/run"),
            ];

            if info.asset.digest.is_none() {
                notes.push("该 Release 没有提供 sha256 digest，无法校验完整性".to_string());
            }

            return Ok(InstallPlan {
                repo: repo.slug(),
                suggested_name: suggested_name(repo),
                target_dir: dir_text,
                kind: InstallKind::Release,
                version: Some(info.tag),
                asset_name: Some(info.asset.name),
                asset_size: Some(info.asset.size),
                entry: None,
                package_manager: None,
                commands,
                notes,
            });
        }
        Ok(None) => notes.push("该仓库没有可用的 Release 预编译包".to_string()),
        Err(err) => notes.push(err),
    }

    // ② Python 项目：clone + venv + pip install
    let client = crate::commands::source::http_client();
    let pyproject = crate::commands::source::fetch_text_file(&client, repo, "pyproject.toml").await;
    let setup_py = if pyproject.is_none() {
        crate::commands::source::fetch_text_file(&client, repo, "setup.py").await
    } else {
        None
    };

    if let Some(text) = pyproject.as_deref() {
        let project = python::parse_pyproject(text);

        let mut commands = vec![
            format!(
                "git clone --depth 1 https://{}/{}/{}.git {dir_text}/app",
                repo.host, repo.owner, repo.repo
            ),
            format!("在 {dir_text}/venv 创建虚拟环境（需要 Python 3.10+）"),
            format!("把 app 装进虚拟环境（pip install，走本项目自己的构建后端）"),
        ];
        if project.needs_playwright {
            commands.push("playwright install chromium（下载约 150 MB）".to_string());
        }
        commands.push(format!("生成启动脚本 {dir_text}/run"));

        notes.push(
            "Python 没有 npm 那种 --ignore-scripts 开关：pip install 必然要执行该项目的构建后端，这是这条路的固有成本"
                .to_string(),
        );
        if let Some(requires) = &project.requires_python {
            notes.push(format!("仓库声明 {requires}"));
        }
        if project.console_script.is_none() && project.module.is_none() {
            notes.push("没能从 pyproject.toml 读出入口命令，装完会再按仓库内容找一次".to_string());
        }

        return Ok(InstallPlan {
            repo: repo.slug(),
            suggested_name: suggested_name(repo),
            target_dir: dir_text,
            kind: InstallKind::Python,
            version: None,
            asset_name: None,
            asset_size: None,
            entry: project.console_script.clone().or(project.module.clone()),
            package_manager: Some("pip".to_string()),
            commands,
            notes,
        });
    }

    if setup_py.is_some() {
        notes.push("检测到 setup.py（老式 Python 打包），按 Python 项目安装".to_string());
        // 先拼好命令，避免在结构体字面量里先 move dir_text 又去借用它
        let commands = vec![
            format!(
                "git clone --depth 1 https://{}/{}/{}.git {dir_text}/app",
                repo.host, repo.owner, repo.repo
            ),
            format!("在 {dir_text}/venv 创建虚拟环境（需要 Python 3.10+）"),
            "把 app 装进虚拟环境（pip install）".to_string(),
            format!("生成启动脚本 {dir_text}/run"),
        ];
        return Ok(InstallPlan {
            repo: repo.slug(),
            suggested_name: suggested_name(repo),
            target_dir: dir_text,
            kind: InstallKind::Python,
            version: None,
            asset_name: None,
            asset_size: None,
            entry: None,
            package_manager: Some("pip".to_string()),
            commands,
            notes,
        });
    }

    // ③ Node 项目
    let manifest = crate::commands::source::fetch_manifest(&client, repo).await;
    let Some(manifest) = manifest else {
        return Err(
            "该仓库既没有可用的 Release 预编译包，也没有 package.json 或 pyproject.toml（不是 Node / Python 项目），暂不支持自动安装"
                .to_string(),
        );
    };

    let entry = source::declared_entry(&manifest);
    let has_build = source::has_build_script(&manifest);
    // plan 阶段还没 clone，只能按 lockfile 惯例猜；真正安装在 clone 后重算
    let manager = "npm";

    let mut commands = vec![
        format!("git clone --depth 1 https://{}/{}/{}.git {dir_text}/app", repo.host, repo.owner, repo.repo),
        format!("{manager} install --omit=dev --ignore-scripts"),
    ];
    if has_build {
        commands.push(format!("{manager} run build（入口在 dist/build 里时才执行）"));
    }
    commands.push(format!("生成启动脚本 {dir_text}/run"));

    notes.push(
        "源码安装会跑依赖安装；默认关闭 postinstall（--ignore-scripts），装不起来时才需要考虑放开"
            .to_string(),
    );

    Ok(InstallPlan {
        repo: repo.slug(),
        suggested_name: suggested_name(repo),
        target_dir: dir_text,
        kind: InstallKind::Source,
        version: None,
        asset_name: None,
        asset_size: None,
        entry,
        package_manager: Some(manager.to_string()),
        commands,
        notes,
    })
}

/// 只读探测：这个仓库能不能本地安装、打算怎么装
#[tauri::command]
pub async fn plan_install(url: String) -> Result<InstallPlan, String> {
    let repo = parse_repo(&url)?;
    build_plan(&repo).await
}

/// macOS 下载回来的二进制会带隔离标记，不摘掉会被 Gatekeeper 拦
async fn strip_quarantine(dir: &std::path::Path) {
    #[cfg(target_os = "macos")]
    {
        let mut cmd = tokio::process::Command::new("xattr");
        cmd.args(["-dr", "com.apple.quarantine", &dir.to_string_lossy()]);
        let _ = cmd.output().await;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = dir;
    }
}

/// 执行安装，返回可直接写进配置的 command
#[tauri::command]
pub async fn install_local(
    app: AppHandle,
    url: String,
    allow_scripts: bool,
) -> Result<InstallResult, String> {
    let repo = parse_repo(&url)?;
    let plan = build_plan(&repo).await?;

    emit(&app, "prepare", "准备安装目录", 5);

    let dir = install::server_dir(&repo.slug());
    let app_dir = install::reset_dir(&dir).map_err(|e| format!("准备目录失败: {e}"))?;
    let mut log: Vec<String> = vec![
        format!("安装方式: {}", plan.kind.as_str()),
        format!("安装目录: {}", dir.display()),
    ];

    let launcher = match plan.kind {
        InstallKind::Release => {
            let info = release::probe(&repo)
                .await?
                .ok_or("该仓库的 Release 已不可用，请重试")?;

            emit(&app, "download", &format!("下载 {}", info.asset.name), 20);
            log.push(format!(
                "下载 {}（{}）",
                info.asset.name,
                megabytes(info.asset.size)
            ));

            // 压缩包放在 app 目录外层，免得被当成可执行文件候选
            let archive = dir.join(&info.asset.name);
            release::download(&info.asset, &archive).await?;
            log.push(if info.asset.digest.is_some() {
                "sha256 校验通过".to_string()
            } else {
                "该 Release 未提供 digest，已跳过校验".to_string()
            });

            emit(&app, "extract", "解包中", 55);
            release::extract(&archive, &app_dir).await?;
            let _ = tokio::fs::remove_file(&archive).await;

            let binary = release::locate_binary(&app_dir, &repo.repo)
                .ok_or("解包后没找到可执行文件")?;
            release::make_executable(&binary);
            log.push(format!("可执行文件: {}", binary.display()));

            emit(&app, "finalize", "生成启动脚本", 85);
            let workdir = binary.parent().unwrap_or(&app_dir).to_path_buf();
            install::write_launcher(&dir, &workdir, &binary, &[])
                .map_err(|e| format!("写启动脚本失败: {e}"))?
        }
        InstallKind::Source => {
            emit(&app, "clone", "克隆仓库", 15);
            source::clone(&repo, &app_dir).await?;
            log.push(format!("已克隆 https://{}/{}/{}", repo.host, repo.owner, repo.repo));

            let manifest = source::read_manifest(&app_dir);
            let manager = source::detect_package_manager(&app_dir);
            log.push(format!("包管理器: {}", manager.binary()));

            emit(
                &app,
                "install",
                &format!("{} 安装依赖", manager.binary()),
                35,
            );
            let output = source::install_deps(&app_dir, manager, allow_scripts).await?;
            if !output.is_empty() {
                log.push(format!("依赖安装完成（{}）", manager.binary()));
            }

            let mut entry = source::resolve_entry(&app_dir, manifest.as_ref());

            // 源码是 TS、入口在 dist 里：需要先构建
            if entry.is_none() && manifest.as_ref().map(source::has_build_script).unwrap_or(false) {
                emit(&app, "build", "入口未就绪，执行构建", 60);
                source::run_build(&app_dir, manager).await?;
                log.push("已执行 build 脚本".to_string());
                entry = source::resolve_entry(&app_dir, manifest.as_ref());
            }

            let entry = entry.ok_or_else(|| {
                if allow_scripts {
                    "没找到入口文件。该仓库可能需要额外的构建步骤，请查看 README".to_string()
                } else {
                    "没找到入口文件。可能是依赖装不全（生命周期脚本被关闭），可重试并允许运行脚本"
                        .to_string()
                }
            })?;

            let node = source::resolve_node()?;
            log.push(format!("入口: {}", entry.display()));
            log.push(format!("运行时: {}", node.display()));

            emit(&app, "finalize", "生成启动脚本", 85);
            install::write_launcher(&dir, &app_dir, &node, &[entry.to_string_lossy().to_string()])
                .map_err(|e| format!("写启动脚本失败: {e}"))?
        }
        InstallKind::Python => {
            emit(&app, "clone", "克隆仓库", 12);
            source::clone(&repo, &app_dir).await?;
            log.push(format!("已克隆 https://{}/{}/{}", repo.host, repo.owner, repo.repo));

            // clone 下来的 pyproject.toml 比探测时拿到的更可信
            let project = std::fs::read_to_string(app_dir.join("pyproject.toml"))
                .map(|text| python::parse_pyproject(&text))
                .unwrap_or_default();
            if let Some(requires) = &project.requires_python {
                log.push(format!("要求: {requires}"));
            }

            let venv = dir.join("venv");
            emit(&app, "venv", "创建虚拟环境", 30);
            let toolchain = python::create_venv(&venv).await?;
            log.push(format!("虚拟环境: {toolchain}"));

            emit(&app, "install", "安装依赖（可能几分钟）", 45);
            python::install_package(&venv, &app_dir).await?;
            log.push("依赖安装完成".to_string());

            if project.needs_playwright {
                emit(&app, "browser", "下载 Chromium", 70);
                match python::install_browser(&venv).await {
                    Ok(()) => log.push("Chromium 已就绪".to_string()),
                    Err(err) => {
                        // 浏览器装不上不算安装失败，服务本身还能起
                        log.push(format!("Chromium 下载失败（可稍后手动执行）: {err}"));
                    }
                }
            }

            emit(&app, "finalize", "生成启动脚本", 88);
            let (entry, args) = python::resolve_entry(&venv, &app_dir, &project)?;
            log.push(format!("入口: {}", entry.display()));
            if !args.is_empty() {
                log.push(format!("参数: {}", args.join(" ")));
            }

            install::write_launcher(&dir, &app_dir, &entry, &args)
                .map_err(|e| format!("写启动脚本失败: {e}"))?
        }
    };

    emit(&app, "done", "安装完成", 100);
    strip_quarantine(&dir).await;

    Ok(InstallResult {
        kind: plan.kind,
        suggested_name: plan.suggested_name,
        dir: dir.to_string_lossy().to_string(),
        command: launcher.to_string_lossy().to_string(),
        // 启动脚本自己处理 cwd 与入口，不需要额外参数
        args: Vec::new(),
        log,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_asset_size() {
        assert_eq!(megabytes(0), "0.0 MB");
        assert_eq!(megabytes(8_790_816), "8.4 MB");
    }

    #[test]
    fn plan_requires_a_repo_url() {
        assert!(parse_repo("https://mcp.linear.app/sse").is_err());
        assert!(parse_repo("https://github.com/Cc-Zzh1/moonvy-ui-mcp").is_ok());
    }

    /// 真实网络验证，默认不跑：cargo test -- --ignored
    #[tokio::test]
    #[ignore = "需要网络，手动执行 cargo test -- --ignored"]
    async fn plans_live_repositories() {
        // 发行过预编译包的仓库：应该识别为 Release 安装，且挑中 darwin 包
        let release_repo = parse_repo("https://github.com/kiko-love/openMoonvy-mcp-rs").unwrap();
        let plan = build_plan(&release_repo).await.unwrap();
        assert_eq!(plan.kind, InstallKind::Release, "应走 Release 路径");
        let asset = plan.asset_name.unwrap();
        assert!(
            asset.contains("darwin") || asset.contains("apple"),
            "挑中的包应适配 macOS，实际是 {asset}"
        );

        // 没发 Release、但有 package.json 的仓库：应该走源码安装并读出 bin 入口
        let source_repo = parse_repo("https://github.com/Cc-Zzh1/moonvy-ui-mcp").unwrap();
        let plan = build_plan(&source_repo).await.unwrap();
        assert_eq!(plan.kind, InstallKind::Source, "应走源码安装路径");
        assert_eq!(plan.entry.as_deref(), Some("src/server.js"));

        // Release 里只有 .whl/.tar.gz 的 Python 仓库：不能被当成预编译二进制，
        // 要落到 Python 安装路径，并从 console_scripts 读出入口
        let python_repo = parse_repo("https://github.com/dsphper/lanhu-mcp").unwrap();
        let plan = build_plan(&python_repo).await.unwrap();
        assert_eq!(plan.kind, InstallKind::Python, "应走 Python 安装路径");
        assert_eq!(plan.suggested_name, "lanhu-mcp", "服务名必须等于仓库名");
        assert_eq!(plan.entry.as_deref(), Some("lanhu-mcp"));
    }
}
