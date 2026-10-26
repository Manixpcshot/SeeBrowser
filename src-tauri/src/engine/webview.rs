//! System-WebView backend (default).
//!
//! Rendering is performed by the operating system's WebView through
//! Tauri/WRY, which gives SeeBrowser a first-class, always up-to-date
//! engine on every platform:
//!
//! | Platform | WebView                 | Engine                         |
//! |----------|-------------------------|--------------------------------|
//! | Windows  | Microsoft Edge WebView2 | **Chromium** (Blink + V8)      |
//! | macOS    | WKWebView               | WebKit (JavaScriptCore)        |
//! | Linux    | WebKitGTK               | WebKit (JavaScriptCore)        |
//!
//! On Windows this is literally the same rendering core as Google Chrome
//! and Brave, so all HTML/CSS/JS, WebGL, video sites and web apps work.
//! The actual webview objects are created in `commands.rs` (Tauri's
//! multi-webview API); this type describes the backend for the settings UI.

use super::BrowserEngine;

pub struct WebViewEngine;

impl BrowserEngine for WebViewEngine {
    fn name(&self) -> &'static str {
        #[cfg(target_os = "windows")]
        {
            "Chromium — Microsoft Edge WebView2"
        }
        #[cfg(target_os = "macos")]
        {
            "WebKit — WKWebView"
        }
        #[cfg(target_os = "linux")]
        {
            "WebKit — WebKitGTK"
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
        {
            "System WebView"
        }
    }

    fn available(&self) -> bool {
        true
    }

    fn note(&self) -> String {
        "Ships with the OS and stays up to date automatically.".to_string()
    }
}
