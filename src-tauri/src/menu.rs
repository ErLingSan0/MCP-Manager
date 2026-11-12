// macOS 菜单栏：菜单文案跟随界面语言

use tauri::menu::{Menu, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};

fn l(language: &str, zh: &'static str, en: &'static str) -> &'static str {
    if language == "en" {
        en
    } else {
        zh
    }
}

pub fn build_menu<R: Runtime>(app: &AppHandle<R>, language: &str) -> tauri::Result<Menu<R>> {
    let app_menu = Submenu::with_items(
        app,
        "MCP Manager",
        true,
        &[
            &PredefinedMenuItem::about(
                app,
                Some(l(language, "关于 MCP Manager", "About MCP Manager")),
                None,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(
                app,
                Some(l(language, "隐藏 MCP Manager", "Hide MCP Manager")),
            )?,
            &PredefinedMenuItem::hide_others(app, Some(l(language, "隐藏其他", "Hide Others")))?,
            &PredefinedMenuItem::show_all(app, Some(l(language, "显示全部", "Show All")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(
                app,
                Some(l(language, "退出 MCP Manager", "Quit MCP Manager")),
            )?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        l(language, "文件", "File"),
        true,
        &[&PredefinedMenuItem::close_window(
            app,
            Some(l(language, "关闭窗口", "Close Window")),
        )?],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        l(language, "编辑", "Edit"),
        true,
        &[
            &PredefinedMenuItem::undo(app, Some(l(language, "撤销", "Undo")))?,
            &PredefinedMenuItem::redo(app, Some(l(language, "重做", "Redo")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(l(language, "剪切", "Cut")))?,
            &PredefinedMenuItem::copy(app, Some(l(language, "复制", "Copy")))?,
            &PredefinedMenuItem::paste(app, Some(l(language, "粘贴", "Paste")))?,
            &PredefinedMenuItem::select_all(app, Some(l(language, "全选", "Select All")))?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        l(language, "视图", "View"),
        true,
        &[&PredefinedMenuItem::fullscreen(
            app,
            Some(l(language, "进入全屏幕", "Enter Full Screen")),
        )?],
    )?;

    let window_menu = Submenu::with_items(
        app,
        l(language, "窗口", "Window"),
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some(l(language, "最小化", "Minimize")))?,
            &PredefinedMenuItem::maximize(app, Some(l(language, "缩放", "Zoom")))?,
        ],
    )?;

    Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu],
    )
}
