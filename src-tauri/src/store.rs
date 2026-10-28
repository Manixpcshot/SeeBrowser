//! JSON document store — one file holding settings, bookmarks, history,
//! downloads and the saved session.
//!
//! Storage location:
//! - **Portable mode** — if a file named `portable.txt` sits next to the
//!   executable, everything lives in `<exe-dir>/data/` (the whole app can
//!   be carried on a USB stick; nothing is written to the system).
//! - Otherwise the platform app-data directory is used
//!   (`%APPDATA%` on Windows, `~/Library/Application Support` on macOS,
//!   `~/.local/share` on Linux).

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// True when the `portable.txt` marker exists next to the executable.
pub fn portable_mode() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("portable.txt").exists()))
        .unwrap_or(false)
}

/// Base directory for all SeeBrowser data (store, ephemeral profiles, …).
pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if portable_mode() {
        if let Some(dir) = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|d| d.join("data")))
        {
            return Ok(dir);
        }
    }
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("seebrowser-store.json"))
}

pub fn read(app: &AppHandle) -> serde_json::Value {
    let Ok(path) = store_path(app) else {
        return serde_json::json!({});
    };
    let Ok(text) = std::fs::read_to_string(&path) else {
        return serde_json::json!({});
    };
    serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({}))
}

pub fn write(app: &AppHandle, data: &serde_json::Value) -> Result<(), String> {
    let path = store_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Write via a temp file + rename so a crash can't corrupt the store.
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}
