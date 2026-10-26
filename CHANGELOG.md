# Changelog

## v1.0.0 — 2026-10-26

First release of SeeBrowser 🎉

- Chrome-like multi-tab browsing — one native webview per tab (Tauri multi-webview, Rust)
- Pluggable rendering engines: **Chromium/WebKit WebView** (default) + **Servo/libservo** (experimental)
- Dark mode everywhere: dark/light/system UI + forced dark mode for websites
- Search engines: **Google** & **Brave** (+ DuckDuckGo, Bing) with omnibox suggestions
- Bookmarks, history, downloads managers; bookmarks bar; session restore
- Ad & tracker blocker with per-page counter
- Private tabs (isolated storage, no history)
- Deep customization: accent color, density, vertical tabs, homepage, startup mode,
  default zoom, User-Agent presets, custom CSS injection
- Persian (RTL) + English UI
- Find-in-page, zoom, print, DevTools (F12), full keyboard shortcuts
- Installers for Windows (.exe/.msi), macOS (.dmg), Linux (.AppImage/.deb) via GitHub Actions
