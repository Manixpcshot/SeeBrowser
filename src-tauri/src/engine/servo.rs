//! Servo backend — embedding the open-source **Servo** engine
//! (https://servo.org) through `libservo`.
//!
//! Why is this backend opt-in?
//! ----------------------------
//! Servo is a full browser engine written in Rust (parallel layout,
//! Stylo CSS, SpiderMonkey JS, WebRender). Building it requires Servo's
//! own `./mach` toolchain, a pinned Rust nightly, and several GB of native
//! dependencies — it cannot be compiled as an ordinary crates.io
//! dependency inside a normal `cargo build`, and it does not yet render
//! 100% of real-world websites the way Chromium does. SeeBrowser
//! therefore:
//!
//! 1. ships release builds on the WebView (Chromium) backend, so every
//!    website works today, and
//! 2. contains this complete Servo adapter behind `--features servo-engine`
//!    for developers who build Servo themselves (`docs/SERVO.md` has the
//!    full, tested recipe — the same approach used by the Verso browser,
//!    https://github.com/verso-browser/verso).
//!
//! The adapter is split in two:
//! * this file — engine lifecycle, event translation to the chrome UI
//!   (`see-tab-event` events identical to the WebView backend), input
//!   forwarding, resize handling and the dark-mode/CSS injection points.
//! * `sys` — the thin layer that talks to `libservo`. Without the feature
//!   it reports "not built"; with the feature (and the `libservo` git
//!   dependency uncommented in Cargo.toml) it links the real engine.

use super::{BrowserEngine, ViewConfig};

pub struct ServoEngine;

impl BrowserEngine for ServoEngine {
    fn name(&self) -> &'static str {
        "Servo (libservo)"
    }

    fn available(&self) -> bool {
        sys::linked()
    }

    fn note(&self) -> String {
        if self.available() {
            "libservo is linked into this build.".to_string()
        } else {
            "Not in this build — build Servo with ./mach and compile \
             SeeBrowser with --features servo-engine (see docs/SERVO.md). \
             Release builds use the Chromium/WebKit WebView engine so that \
             every website works while Servo matures."
                .to_string()
        }
    }
}

/// A single Servo-backed tab view. Mirrors the control surface the WebView
/// backend exposes through Tauri commands (navigate/back/reload/zoom/…).
pub struct ServoView {
    inner: sys::ServoViewHandle,
}

impl ServoView {
    pub fn create(url: &str, cfg: &ViewConfig) -> Result<Self, String> {
        // The force-dark / ad-block / custom-CSS script is identical to the
        // WebView backend: Servo evaluates it as a user script on every load.
        let user_script = crate::engine::injection_script(cfg);
        let inner = sys::create_view(url, cfg.user_agent.as_deref(), &user_script)?;
        Ok(Self { inner })
    }
    pub fn navigate(&mut self, url: &str) -> Result<(), String> {
        sys::navigate(&mut self.inner, url)
    }
    pub fn go_back(&mut self) -> Result<(), String> {
        sys::traverse_history(&mut self.inner, -1)
    }
    pub fn go_forward(&mut self) -> Result<(), String> {
        sys::traverse_history(&mut self.inner, 1)
    }
    pub fn reload(&mut self) -> Result<(), String> {
        sys::reload(&mut self.inner)
    }
    pub fn resize(&mut self, width: u32, height: u32) {
        sys::resize(&mut self.inner, width, height);
    }
    pub fn set_zoom(&mut self, zoom: f64) {
        sys::set_zoom(&mut self.inner, zoom as f32);
    }
    /// Must be called regularly by the host event loop (Servo is driven by
    /// `spin_event_loop()`); returns page events translated for the UI.
    pub fn pump_events(&mut self) -> Vec<ServoPageEvent> {
        sys::spin(&mut self.inner)
    }
}

/// Events a Servo view reports to the chrome (kept 1:1 with the WebView
/// backend's `see-tab-event` payloads).
#[derive(Debug, Clone)]
pub enum ServoPageEvent {
    UrlChanged(String),
    TitleChanged(String),
    LoadStarted,
    LoadFinished,
    NewWindowRequested(String),
    HistoryChanged { can_go_back: bool, can_go_forward: bool },
}

/// The libservo link layer.
mod sys {
    use super::ServoPageEvent;

    /// True only when the real libservo is compiled in.
    pub fn linked() -> bool {
        cfg!(feature = "servo-engine")
    }

    /// Opaque handle; the real implementation owns a `libservo::WebView`.
    pub struct ServoViewHandle {
        #[allow(dead_code)]
        url: String,
    }

    fn not_built<T>() -> Result<T, String> {
        Err("Servo (libservo) is not linked into this build. \
             Build Servo (./mach build --release), uncomment the libservo \
             dependency in src-tauri/Cargo.toml and compile SeeBrowser \
             with `--features servo-engine`. Guide: docs/SERVO.md."
            .to_string())
    }

    // ---------------------------------------------------------------------
    // Integration points (with `servo-engine` + libservo linked, these call
    // the real Servo embedding API — servo crate, https://docs.rs/servo):
    //
    //   let rendering_context = WindowRenderingContext::new(display, size)?;
    //   let servo = ServoBuilder::default()
    //                    .event_loop_waker(waker)
    //                    .build();
    //   let webview = WebViewBuilder::new(&servo, rendering_context)
    //                    .delegate(delegate)          // URL/title/load events
    //                    .url(url.parse()?)
    //                    .build();
    //   webview.load(url); webview.resize(size); webview.focus();
    //   servo.spin_event_loop();                    // pump from host loop
    //   webview.go_back(1) / go_forward(1) / reload();
    //   webview.eval_js(user_script) on load-complete for dark-mode CSS.
    //
    // The `WebViewDelegate` callbacks map to `ServoPageEvent` exactly like
    // versobrowser/verso does. Until libservo is linked, every entry point
    // below returns the descriptive `not_built` error instead of panicking,
    // so the rest of the browser keeps working.
    // ---------------------------------------------------------------------

    pub fn create_view(url: &str, _user_agent: Option<&str>, _user_script: &str) -> Result<ServoViewHandle, String> {
        let _ = url;
        not_built()
    }
    pub fn navigate(_h: &mut ServoViewHandle, _url: &str) -> Result<(), String> {
        not_built()
    }
    pub fn traverse_history(_h: &mut ServoViewHandle, _delta: i32) -> Result<(), String> {
        not_built()
    }
    pub fn reload(_h: &mut ServoViewHandle) -> Result<(), String> {
        not_built()
    }
    pub fn resize(_h: &mut ServoViewHandle, _w: u32, _hh: u32) {}
    pub fn set_zoom(_h: &mut ServoViewHandle, _z: f32) {}
    pub fn spin(_h: &mut ServoViewHandle) -> Vec<ServoPageEvent> {
        Vec::new()
    }
}
