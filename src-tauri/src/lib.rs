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

mod commands;
mod engine;
mod store;
mod tabs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(tabs::TabManager::default())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running SeeBrowser");
}
