//! IPC commands called from the browser-chrome UI.
//!
//! Each tab is a real native webview created as a *child* of the main
//! window (Tauri multi-webview). Rust owns them so it can observe
//! navigations, page loads, title changes, new-window requests and
//! downloads, and forward everything to the UI as `see-tab-event` events.

use serde::{Deserialize, Serialize};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl, Window};

use crate::engine::{self, BrowserEngine, ViewConfig};
use crate::tabs::TabManager;

#[derive(Debug, Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TabOptions {
    pub user_agent: Option<String>,
    pub force_dark: bool,
    pub ad_block: bool,
    pub custom_css: Option<String>,
    pub zoom: f64,
    pub private: bool,
}

impl From<&TabOptions> for ViewConfig {
    fn from(o: &TabOptions) -> Self {
        ViewConfig {
            user_agent: o.user_agent.clone(),
            force_dark: o.force_dark,
            ad_block: o.ad_block,
            custom_css: o.custom_css.clone(),
            zoom: if o.zoom > 0.0 { o.zoom } else { 1.0 },
            private: o.private,
        }
    }
}

/// Payload of the `see-tab-event` channel consumed by the chrome UI.
#[derive(Clone, Serialize)]
struct TabEvent {
    label: String,
    #[serde(rename = "type")]
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(rename = "canGoBack", skip_serializing_if = "Option::is_none")]
    can_go_back: Option<bool>,
    #[serde(rename = "canGoForward", skip_serializing_if = "Option::is_none")]
    can_go_forward: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    success: Option<bool>,
}

impl TabEvent {
    fn new(label: &str, kind: &str) -> Self {
        Self {
            label: label.to_string(),
            kind: kind.to_string(),
            url: None,
            title: None,
            can_go_back: None,
            can_go_forward: None,
            path: None,
            success: None,
        }
    }
    fn url(mut self, url: String) -> Self {
        self.url = Some(url);
        self
    }
}

fn emit(app: &AppHandle, ev: TabEvent) {
    let _ = app.emit("see-tab-event", ev);
}

/// Minimal percent-decoder for download file names (`my%20file.zip`).
fn decode_pct(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(v) = u8::from_str_radix(hex, 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Make a file name safe on every OS (Windows forbids `<>:"/\|?*`).
fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "download".to_string()
    } else {
        trimmed.chars().take(180).collect()
    }
}

/// Chrome-style de-duplication: `file.zip` → `file (1).zip` → `file (2).zip`.
fn unique_path(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (name.to_string(), String::new()),
    };
    for n in 1..1000 {
        let c = dir.join(format!("{stem} ({n}){ext}"));
        if !c.exists() {
            return c;
        }
    }
    candidate
}

fn parse_url(url: &str) -> Result<tauri::Url, String> {
    let u = if url.trim().is_empty() { "about:blank" } else { url.trim() };
    tauri::Url::parse(u).map_err(|e| e.to_string())
}

fn get(app: &AppHandle, label: &str) -> Result<Webview, String> {
    app.get_webview(label).ok_or_else(|| format!("no such tab: {label}"))
}

/* ------------------------------ tab create ------------------------------ */

#[tauri::command]
pub fn tab_create(
    app: AppHandle,
    window: Window,
    label: String,
    url: String,
    bounds: Bounds,
    options: TabOptions,
) -> Result<(), String> {
    // Already created (duplicate call): a no-op. Navigating here could
    // reload the page unexpectedly — explicit navigation goes through
    // `tab_navigate` instead.
    if app.get_webview(&label).is_some() {
        return Ok(());
    }

    let parsed = parse_url(&url)?;
    let cfg: ViewConfig = (&options).into();
    let script = engine::injection_script(&cfg);
    let ad_block = options.ad_block;
    let zoom = cfg.zoom;

    let app_nav = app.clone();
    let app_load = app.clone();
    let app_title = app.clone();
    let app_new = app.clone();
    let app_dl = app.clone();
    let label_nav = label.clone();

    let mut builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed))
        .devtools(true)
        .initialization_script(&script)
        // --- top-level navigation: ad-block + back/forward bookkeeping ---
        .on_navigation(move |url| {
            let lbl = label_nav.as_str();
            if ad_block && url.host_str().map(engine::is_blocked_host).unwrap_or(false) {
                emit(&app_nav, TabEvent::new(lbl, "blocked").url(url.to_string()));
                return false;
            }
            let mgr = app_nav.state::<TabManager>();
            let (back, fwd) = mgr.record_nav(lbl, &url.to_string());
            let mut ev = TabEvent::new(lbl, "navigate").url(url.to_string());
            ev.can_go_back = Some(back);
            ev.can_go_forward = Some(fwd);
            emit(&app_nav, ev);
            true
        })
        // --- load lifecycle for the progress bar / spinner ---
        .on_page_load(move |webview, payload| {
            let lbl = webview.label().to_string();
            let kind = match payload.event() {
                PageLoadEvent::Started => "loading",
                PageLoadEvent::Finished => "finished",
            };
            emit(&app_load, TabEvent::new(&lbl, kind).url(payload.url().to_string()));
        })
        .on_document_title_changed(move |webview, title| {
            let mut ev = TabEvent::new(webview.label(), "title");
            ev.title = Some(title);
            emit(&app_title, ev);
        })
        // --- target=_blank / window.open -> open a new SeeBrowser tab ---
        .on_new_window(move |url, _features| {
            emit(&app_new, TabEvent::new("", "new-tab").url(url.to_string()));
            NewWindowResponse::Deny
        })
        // --- downloads -> OS Downloads folder + notify the UI ---
        .on_download(move |webview, event| {
            let lbl = webview.label().to_string();
            match event {
                DownloadEvent::Requested { url, destination } => {
                    if let Ok(dir) = app_dl.path().download_dir() {
                        let raw_name = url
                            .path_segments()
                            .and_then(|mut s| s.next_back())
                            .filter(|s| !s.is_empty())
                            .unwrap_or("download");
                        let name = sanitize_file_name(&decode_pct(raw_name));
                        *destination = unique_path(&dir, &name);
                    }
                    let mut ev = TabEvent::new(&lbl, "download-start").url(url.to_string());
                    ev.path = Some(destination.display().to_string());
                    emit(&app_dl, ev);
                    true
                }
                DownloadEvent::Finished { url, path, success } => {
                    let mut ev = TabEvent::new(&lbl, "download-done").url(url.to_string());
                    ev.path = path.map(|p| p.display().to_string());
                    ev.success = Some(success);
                    emit(&app_dl, ev);
                    true
                }
                _ => true,
            }
        });

    if let Some(ua) = &options.user_agent {
        if !ua.trim().is_empty() {
            builder = builder.user_agent(ua);
        }
    }

    // Private tabs must not share cookies/storage with normal tabs.
    // (In portable mode this also stays inside the portable data folder.)
    if options.private {
        if let Ok(mut dir) = crate::store::data_dir(&app) {
            dir.push("ephemeral");
            dir.push(&label);
            builder = builder.data_directory(dir).incognito(true);
        }
    }

    let webview = window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)),
        )
        .map_err(|e| e.to_string())?;

    if (zoom - 1.0).abs() > f64::EPSILON {
        let _ = webview.set_zoom(zoom);
    }
    Ok(())
}

/* --------------------------- tab operations --------------------------- */

#[tauri::command]
pub fn tab_navigate(app: AppHandle, label: String, url: String) -> Result<(), String> {
    get(&app, &label)?.navigate(parse_url(&url)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tab_go_back(app: AppHandle, label: String) -> Result<(), String> {
    get(&app, &label)?.eval("history.back()").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tab_go_forward(app: AppHandle, label: String) -> Result<(), String> {
    get(&app, &label)?.eval("history.forward()").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tab_reload(app: AppHandle, label: String) -> Result<(), String> {
    get(&app, &label)?.eval("location.reload()").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tab_stop(app: AppHandle, label: String) -> Result<(), String> {
    get(&app, &label)?.eval("window.stop()").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tab_set_bounds(app: AppHandle, label: String, bounds: Bounds) -> Result<(), String> {
    let wv = get(&app, &label)?;
    wv.set_position(LogicalPosition::new(bounds.x, bounds.y)).map_err(|e| e.to_string())?;
    wv.set_size(LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0))).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tab_set_visible(app: AppHandle, label: String, visible: bool) -> Result<(), String> {
    let wv = get(&app, &label)?;
    if visible {
        wv.show().map_err(|e| e.to_string())
    } else {
        wv.hide().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn tab_set_zoom(app: AppHandle, label: String, zoom: f64) -> Result<(), String> {
    get(&app, &label)?.set_zoom(zoom).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tab_find(app: AppHandle, label: String, text: String, forward: bool) -> Result<(), String> {
    let q = serde_json::to_string(&text).unwrap();
    let js = format!("window.find({q}, false, {}, true)", if forward { "false" } else { "true" });
    get(&app, &label)?.eval(&js).map_err(|e| e.to_string())
}

/// Inject or remove a named <style> in the page (force-dark / custom CSS).
#[tauri::command]
pub fn tab_apply_style(app: AppHandle, label: String, tag: String, css: Option<String>) -> Result<(), String> {
    let tag_js = serde_json::to_string(&tag).unwrap();
    let css_js = serde_json::to_string(&css).unwrap();
    let js = format!(
        "(function(){{try{{var t={tag_js},c={css_js};\
         var s=document.querySelector('style[data-see=\"'+t+'\"]');\
         var e=document.querySelector('style[data-see=\"'+t+'-early\"]'); if(!c&&e)e.remove();\
         if(c){{if(!s){{s=document.createElement('style');s.setAttribute('data-see',t);\
         (document.head||document.documentElement).appendChild(s);}}s.textContent=c;}}\
         else if(s){{s.remove();}}}}catch(_ee){{}}}})();"
    );
    get(&app, &label)?.eval(&js).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tab_devtools(app: AppHandle, label: String) -> Result<(), String> {
    let wv = get(&app, &label)?;
    if wv.is_devtools_open() {
        wv.close_devtools();
    } else {
        wv.open_devtools();
    }
    Ok(())
}

#[tauri::command]
pub fn tab_print(app: AppHandle, label: String) -> Result<(), String> {
    get(&app, &label)?.eval("window.print()").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tab_close(app: AppHandle, label: String) -> Result<(), String> {
    app.state::<TabManager>().forget(&label);
    if let Some(wv) = app.get_webview(&label) {
        wv.close().map_err(|e| e.to_string())?;
    }
    // Privacy fix: a private tab's on-disk profile must not outlive the tab.
    // The engine may hold file locks for a moment after close, so retry.
    if let Ok(mut dir) = crate::store::data_dir(&app) {
        dir.push("ephemeral");
        dir.push(&label);
        if dir.exists() {
            std::thread::spawn(move || {
                for _ in 0..10 {
                    if std::fs::remove_dir_all(&dir).is_ok() {
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(250));
                }
            });
        }
    }
    Ok(())
}

/* ------------------------- window controls ------------------------- */
// Implemented as Rust commands (not the JS Window API) so the custom
// title-bar buttons always work regardless of capability/permission
// configuration — commands are invoked from our own chrome UI only.

#[tauri::command]
pub fn window_minimize(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(window: Window) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_close(window: Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_fullscreen(window: Window) -> Result<(), String> {
    let fs = window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(!fs).map_err(|e| e.to_string())
}

/* ------------------------------ misc ------------------------------ */

#[tauri::command]
pub fn store_read(app: AppHandle) -> serde_json::Value {
    crate::store::read(&app)
}

#[tauri::command]
pub fn store_write(app: AppHandle, data: serde_json::Value) -> Result<(), String> {
    crate::store::write(&app, &data)
}

#[tauri::command]
pub fn open_external(target: String) -> Result<(), String> {
    open::that(&target).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    engine: String,
    servo_available: bool,
    servo_note: String,
    version: String,
    os: String,
    arch: String,
    /// True when running in portable mode (data stored next to the exe).
    portable: bool,
}

#[tauri::command]
pub fn engine_info() -> EngineInfo {
    let servo = engine::servo::ServoEngine;
    EngineInfo {
        engine: engine::active_engine_name().to_string(),
        servo_available: servo.available(),
        servo_note: servo.note(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        portable: crate::store::portable_mode(),
    }
}
