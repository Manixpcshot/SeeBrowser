//! SeeBrowser — Rust core.
//!
//! Architecture:
//! - `commands`  : the IPC surface used by the browser chrome UI (tabs are
//!                 native webviews created/controlled from Rust).
//! - `engine`    : pluggable rendering-engine layer. Two backends:
//!                 * `webview` — system WebView (Chromium WebView2 on
//!                   Windows, WKWebView on macOS, WebKitGTK on Linux)
//!                 * `servo`   — the open-source Servo engine via libservo
//!                   (feature `servo-engine`, see docs/SERVO.md)
//! - `store`     : JSON persistence (settings/bookmarks/history/…) in the
//!                 platform app-data directory.
//! - `tabs`      : per-tab navigation state (history stack for back/forward).
//! - native accelerator menu: a hidden OS menu whose shortcuts keep
//!   working even when keyboard focus is inside a web page (the classic
//!   embedded-webview problem). Events are forwarded to the chrome UI as
//!   `see-tab-event` with `type: "shortcut"`.

mod commands;
mod engine;
mod store;
mod tabs;

use tauri::{Emitter, Manager};

/// (id, label, accelerator) — ids are handled by `handleShortcut` in the UI.
const SHORTCUTS: &[(&str, &str, &str)] = &[
    ("new-tab", "New Tab", "CmdOrCtrl+T"),
    ("close-tab", "Close Tab", "CmdOrCtrl+W"),
    ("reopen-closed", "Reopen Closed Tab", "CmdOrCtrl+Shift+T"),
    ("private-tab", "New Private Tab", "CmdOrCtrl+Shift+P"),
    ("search-tabs", "Search Tabs", "CmdOrCtrl+Shift+A"),
    ("focus-omnibox", "Focus Address Bar", "CmdOrCtrl+L"),
    ("reload", "Reload", "CmdOrCtrl+R"),
    ("find", "Find in Page", "CmdOrCtrl+F"),
    ("history", "History", "CmdOrCtrl+H"),
    ("downloads", "Downloads", "CmdOrCtrl+J"),
    ("bookmark", "Bookmark This Page", "CmdOrCtrl+D"),
    ("print", "Print", "CmdOrCtrl+P"),
    ("zoom-in", "Zoom In", "CmdOrCtrl+Equal"),
    ("zoom-out", "Zoom Out", "CmdOrCtrl+Minus"),
    ("zoom-reset", "Reset Zoom", "CmdOrCtrl+Digit0"),
    ("next-tab", "Next Tab", "Control+Tab"),
    ("prev-tab", "Previous Tab", "Control+Shift+Tab"),
    ("go-back", "Back", "Alt+ArrowLeft"),
    ("go-forward", "Forward", "Alt+ArrowRight"),
    ("devtools", "Developer Tools", "F12"),
    ("fullscreen", "Full Screen", "F11"),
    ("tab-1", "Tab 1", "CmdOrCtrl+Digit1"),
    ("tab-2", "Tab 2", "CmdOrCtrl+Digit2"),
    ("tab-3", "Tab 3", "CmdOrCtrl+Digit3"),
    ("tab-4", "Tab 4", "CmdOrCtrl+Digit4"),
    ("tab-5", "Tab 5", "CmdOrCtrl+Digit5"),
    ("tab-6", "Tab 6", "CmdOrCtrl+Digit6"),
    ("tab-7", "Tab 7", "CmdOrCtrl+Digit7"),
    ("tab-8", "Tab 8", "CmdOrCtrl+Digit8"),
    ("tab-9", "Last Tab", "CmdOrCtrl+Digit9"),
];

fn install_shortcut_menu(app: &tauri::App) {
    use tauri::menu::{Menu, MenuItem, Submenu};
    let handle = app.handle();
    let mut items: Vec<MenuItem<tauri::Wry>> = Vec::new();
    for (id, label, accel) in SHORTCUTS {
        // Never fail app startup because of an accelerator string.
        match MenuItem::with_id(handle, *id, *label, true, Some(*accel)) {
            Ok(item) => items.push(item),
            Err(e) => eprintln!("[SeeBrowser] shortcut {id} ({accel}) unavailable: {e}"),
        }
    }
    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>).collect();
    let Ok(submenu) = Submenu::with_items(handle, "SeeBrowser", true, &refs) else {
        return;
    };
    let Ok(menu) = Menu::with_items(handle, &[&submenu]) else {
        return;
    };
    if app.set_menu(menu).is_ok() {
        // Keep the accelerators, hide the visible menu bar (our chrome is
        // custom-drawn). macOS puts it in the system menu bar — keep it there.
        #[cfg(any(target_os = "windows", target_os = "linux"))]
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide_menu();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(tabs::TabManager::default())
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let _ = app.emit(
                "see-tab-event",
                serde_json::json!({ "label": id, "type": "shortcut" }),
            );
        })
        .setup(|app| {
            install_shortcut_menu(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::tab_create,
            commands::tab_navigate,
            commands::tab_go_back,
            commands::tab_go_forward,
            commands::tab_reload,
            commands::tab_stop,
            commands::tab_set_bounds,
            commands::tab_set_visible,
            commands::tab_set_zoom,
            commands::tab_find,
            commands::tab_apply_style,
            commands::tab_devtools,
            commands::tab_print,
            commands::tab_close,
            commands::store_read,
            commands::store_write,
            commands::open_external,
            commands::engine_info,
            commands::window_minimize,
            commands::window_toggle_maximize,
            commands::window_close,
            commands::window_toggle_fullscreen,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SeeBrowser");
}
