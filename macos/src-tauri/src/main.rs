#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Wry,
};

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let about = PredefinedMenuItem::about(
        app,
        Some("About GhostShrinkr"),
        Some(AboutMetadata::default()),
    )?;
    let check_updates = MenuItem::with_id(
        app,
        "check_for_updates",
        "Check for Updates…",
        true,
        None::<&str>,
    )?;
    let services = PredefinedMenuItem::services(app, None)?;
    let hide = PredefinedMenuItem::hide(app, None)?;
    let hide_others = PredefinedMenuItem::hide_others(app, None)?;
    let show_all = PredefinedMenuItem::show_all(app, None)?;
    let quit = PredefinedMenuItem::quit(app, None)?;

    let app_menu = Submenu::with_items(
        app,
        "GhostShrinkr",
        true,
        &[
            &about,
            &PredefinedMenuItem::separator(app)?,
            &check_updates,
            &PredefinedMenuItem::separator(app)?,
            &services,
            &PredefinedMenuItem::separator(app)?,
            &hide,
            &hide_others,
            &show_all,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &undo,
            &redo,
            &PredefinedMenuItem::separator(app)?,
            &cut,
            &copy,
            &paste,
            &select_all,
        ],
    )?;

    let minimize = PredefinedMenuItem::minimize(app, None)?;
    let close_window = PredefinedMenuItem::close_window(app, None)?;
    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[&minimize, &close_window],
    )?;

    Menu::with_items(app, &[&app_menu, &edit_menu, &window_menu])
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .menu(|handle| build_menu(handle))
        .on_menu_event(|app, event| {
            if event.id().0 == "check_for_updates" {
                let _ = app.emit("menu-check-updates", ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
