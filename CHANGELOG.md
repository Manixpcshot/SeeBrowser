# Changelog

## v1.3.0 — 2026-10-28

Chrome-refresh UI + fixes:

- **Window controls fixed & moved to the top-right** — minimize,
  maximize/restore and close now run through dedicated Rust commands
  (no JS Window-API capability chain to fail silently), and the buttons
  are pinned to the physical top-right corner like Chrome on Windows in
  both LTR and RTL languages. Fullscreen (⋮ menu / F11) uses the same path.
- **New-tab (+) button right next to the tabs**, Chrome-style: the tab
  strip now shrink-wraps to its content instead of stretching, and tabs
  use the modern Chrome "floating pill" style with an accent underline
  for the active tab.
- **Search reliability** — navigation/page-open failures are no longer
  swallowed silently; a toast is shown and the tab can be retried. In the
  web-demo preview, Google/Brave searches (which block iframing) are
  routed through a frame-friendly endpoint and YouTube watch pages use
  the official embed player, so search visibly works there too.
- Removed the drag-region attribute from the tab bar container (it could
  swallow clicks); double-clicking the empty title-bar area now toggles
  maximization like Chrome; the active tab is auto-scrolled into view
  when the strip overflows.

## v1.2.0 — 2026-10-27

Portable builds + bug fixes:

- **Portable builds (no installation)** — `SeeBrowser_*_x64-portable.zip`
  (Windows) and `SeeBrowser_*_linux-portable.tar.gz`: unzip and run.
  A `portable.txt` marker makes the app keep *all* data (settings,
  bookmarks, history, profiles) in a `data/` folder next to the
  executable — nothing is written to `%APPDATA%`/home. The About page
  shows a "Portable" badge in this mode.
- **`SeeBrowser-website.zip`** is attached to every release so the site
  can be hosted on any static host/domain; the Pages workflow is now
  manual-only (`workflow_dispatch`).
- **Privacy fix:** a private tab's on-disk profile (`ephemeral/<tab>`)
  is now wiped when the tab closes.
- **Downloads:** percent-encoded file names are decoded, unsafe
  characters sanitized, and existing files are no longer overwritten
  (`file.zip` → `file (1).zip`, like Chrome).
- **Fix:** duplicate `tab_create` calls could reload a page; creation is
  now guarded on both the JS and Rust sides.
- History/bookmarks list clicks navigate the current tab (like Chrome);
  Ctrl/Cmd+click still opens a background tab.

## v1.1.0 — 2026-10-26

Chrome-polish & bugfix release:

- **Keyboard shortcuts now work while a web page has focus** (hidden native
  accelerator menu in Rust: Ctrl+T/W/L/F/H/J/D/R/P, zoom, Ctrl+Tab, Ctrl+1–9,
  F11 fullscreen, F12, …) with double-fire protection
- **Tab search** dropdown (button + `Ctrl+Shift+A`): open tabs & recently closed
- **Site information** popup from the lock icon: connection security, blocked
  count, engine, Copy URL / Open in system browser
- New tabs open **right after the current tab** (like Chrome); `Alt+Enter`
  opens the typed address in a new tab; "Switch to this tab" omnibox suggestion
- Omnibox **zoom chip** (click to reset), downloads **unseen badge**, first-click
  select-all in the address bar, `Esc` stops loading
- Speed Dial on the New Tab page is now editable (add/remove shortcuts)
- Tabs: close button on hover/active only, narrower minimum width, thin
  scrollbars, globe fallback icon, drag the window by the empty tab strip
- Fixes: toast was hidden behind the native page view (now shown in the chrome
  strip); ghost placeholder while menus cover the page; New-Tab clock timer
  leak; internal tab titles now follow language changes; choosing the Servo
  engine explains its custom-build requirement

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
