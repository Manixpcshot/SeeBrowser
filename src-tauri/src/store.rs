//! JSON document store — one file in the app-data directory holding
//! settings, bookmarks, history, downloads and the saved session.

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("seebrowser-store.json"))
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
