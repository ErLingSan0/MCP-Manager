// MCP Manager — Tauri 后端入口
// 负责插件注册、命令注册、系统托盘、进程管理状态注入

mod agent;
mod commands;
mod format;
mod install;
mod menu;
mod process;
mod registry;
mod runtime;
mod source;
mod tray;

use process::ProcessManager;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Arc::new(ProcessManager::new()))
        .setup(|app| {
            // 初始化系统托盘
            tray::setup_tray(app)?;
            // 默认中文菜单，前端挂载后会按当前语言重建
            if let Ok(menu) = menu::build_menu(app.handle(), "zh") {
                let _ = app.set_menu(menu);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // 点击关闭按钮直接退出：先停掉所有托管的 MCP 进程，再结束应用
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle().clone();
                let process_manager = app.state::<Arc<ProcessManager>>().inner().clone();
                tauri::async_runtime::spawn(async move {
                    process_manager.stop_all().await;
                    app.exit(0);
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Agent 相关
            commands::agent::get_agents_with_servers,
            commands::agent::list_all_agents,
            // Server 配置管理
            commands::server::add_mcp_server,
            commands::server::remove_mcp_server,
            commands::server::sync_servers,
            // 进程管理
            commands::process::start_server_process,
            commands::process::stop_server_process,
            commands::process::get_server_statuses,
            commands::process::send_jsonrpc,
            // Registry 搜索
            commands::registry::search_mcp_registry,
            // 服务源探测
            commands::source::inspect_source,
            // 代码仓库本地安装
            commands::install::plan_install,
            commands::install::install_local,
            // 环境检测
            commands::config::detect_runtimes,
            commands::config::get_config_preview,
            commands::config::set_app_menu,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            {
                // macOS: 窗口被隐藏（Cmd+H）时点击 Dock 图标只会触发 Reopen，需要手动把窗口显示出来
                if let tauri::RunEvent::Reopen {
                    has_visible_windows,
                    ..
                } = event
                {
                    if !has_visible_windows {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app_handle, event);
        });
}
