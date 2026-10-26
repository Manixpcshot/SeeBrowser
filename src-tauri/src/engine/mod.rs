//! Pluggable rendering-engine layer.
//!
//! SeeBrowser is built around a `BrowserEngine` abstraction so the page
//! renderer can be swapped without touching the browser chrome:
//!
//! * [`webview::WebViewEngine`] — the platform WebView. On Windows this is
//!   Microsoft Edge WebView2, which embeds the **Chromium** engine (the same
//!   core as Google Chrome / Brave), so effectively every website, script
//!   and media codec works. macOS uses WKWebView (WebKit), Linux WebKitGTK.
//!   This is the engine used by the official release builds.
//!
//! * [`servo::ServoEngine`] — **Servo** (https://servo.org), the open-source
//!   web rendering engine written in Rust, embedded through `libservo`.
//!   Servo is a parallel, memory-safe engine developed under Linux
//!   Foundation Europe. It is still maturing (not every site renders
//!   perfectly yet) and must be built with Servo's own toolchain, so this
//!   backend is opt-in via the Cargo feature `servo-engine`
//!   (build guide: `docs/SERVO.md`).

pub mod servo;
pub mod webview;

/// Configuration handed to an engine when a tab view is created.
#[derive(Debug, Clone, Default)]
pub struct ViewConfig {
    pub user_agent: Option<String>,
    pub force_dark: bool,
    pub ad_block: bool,
    pub custom_css: Option<String>,
    pub zoom: f64,
    pub private: bool,
}

/// The contract every rendering backend implements. The WebView backend is
/// realized with Tauri/WRY webviews in `commands.rs`; the Servo backend
/// implements it with `libservo` (see `servo.rs`).
pub trait BrowserEngine: Send + Sync {
    /// Human-readable engine name shown in Settings / About.
    fn name(&self) -> &'static str;
    /// Whether this engine is usable in the current build.
    fn available(&self) -> bool;
    /// Why the engine is (un)available — shown in the UI.
    fn note(&self) -> String;
}

/// CSS used for "force dark mode" on websites that have no dark theme
/// (same technique as Chrome's "Darken websites" / auto-dark).
pub const FORCE_DARK_CSS: &str = r#"
  html { filter: invert(1) hue-rotate(180deg) !important; background: #111 !important; }
  img, video, picture, canvas, [style*="background-image"], svg image {
    filter: invert(1) hue-rotate(180deg) !important;
  }
"#;

/// Cosmetic filters: hide well-known ad / tracker elements.
pub const ADBLOCK_CSS: &str = r#"
  ins.adsbygoogle, [id^="google_ads"], [class*="adsbygoogle"],
  iframe[src*="doubleclick.net"], iframe[src*="googlesyndication.com"],
  iframe[src*="amazon-adsystem.com"], div[id^="div-gpt-ad"],
  [class*="_ad_"], [class*="-ad-"], [data-ad-slot], .ad-banner, .ads-banner,
  #ad-container, .sponsored-post { display: none !important; }
"#;

/// Hosts whose *top-level* navigations are blocked when the blocker is on
/// (popup/redirect networks). Page resources are additionally handled by the
/// cosmetic CSS above and the engine's own policies.
const BLOCKED_HOSTS: &[&str] = &[
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "adservice.google.com",
    "amazon-adsystem.com",
    "ads.yahoo.com",
    "adnxs.com",
    "popads.net",
    "popcash.net",
    "adsterra.com",
];

pub fn is_blocked_host(host: &str) -> bool {
    let h = host.to_ascii_lowercase();
    BLOCKED_HOSTS
        .iter()
        .any(|b| h == *b || h.ends_with(&format!(".{b}")))
}

/// JavaScript injected into every page at creation time (both engines):
/// applies force-dark, the ad cosmetic filter and the user's custom CSS.
pub fn injection_script(cfg: &ViewConfig) -> String {
    let force_dark = if cfg.force_dark { FORCE_DARK_CSS } else { "" };
    let adblock = if cfg.ad_block { ADBLOCK_CSS } else { "" };
    let custom = cfg.custom_css.as_deref().unwrap_or("");
    format!(
        r#"(function() {{
  try {{
    window.__SEE_BROWSER__ = true;
    function addStyle(id, css) {{
      if (!css) return;
      var s = document.createElement('style');
      s.setAttribute('data-see', id);
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    }}
    function ready() {{
      addStyle('force-dark', {force_dark});
      addStyle('adblock', {adblock});
      addStyle('custom', {custom});
    }}
    addStyle('force-dark-early', {force_dark});
    if (document.readyState === 'loading') {{
      document.addEventListener('DOMContentLoaded', ready);
    }} else {{ ready(); }}
  }} catch (e) {{ /* never break the page */ }}
}})();"#,
        force_dark = serde_json::to_string(force_dark).unwrap(),
        adblock = serde_json::to_string(adblock).unwrap(),
        custom = serde_json::to_string(custom).unwrap(),
    )
}

/// Name of the engine that renders tabs in this build.
pub fn active_engine_name() -> &'static str {
    #[cfg(feature = "servo-engine")]
    {
        if servo::ServoEngine.available() {
            return "Servo (libservo)";
        }
    }
    webview::WebViewEngine.name()
}
