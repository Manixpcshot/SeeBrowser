# Servo engine in SeeBrowser

[Servo](https://servo.org) is an open-source web rendering engine written
in Rust (parallel layout with Stylo + WebRender, SpiderMonkey for
JavaScript), governed under Linux Foundation Europe. It provides a
**WebView embedding API** (`libservo`, crates `servo` / `libservo`) designed
exactly for apps like SeeBrowser.

## How SeeBrowser integrates Servo

SeeBrowser's rendering layer is pluggable (`src-tauri/src/engine/`):

| File | Role |
|---|---|
| `engine/mod.rs` | `BrowserEngine` trait, shared dark-mode/ad-block CSS + injection script, blocklist |
| `engine/webview.rs` | Default backend — Chromium (WebView2) / WKWebView / WebKitGTK via Tauri+WRY |
| `engine/servo.rs` | **Servo backend** — `ServoEngine` + `ServoView` (navigate/back/reload/resize/zoom/event pump) over a thin `sys` layer that links `libservo` |

Both backends report the same events (`navigate`, `title`, `loading`,
`finished`, `new-tab`, downloads) to the chrome UI, and both receive the
same user script (force-dark CSS, ad cosmetic filter, user custom CSS) —
Servo evaluates it via `WebView::eval_js` on load.

## Why Servo is an opt-in feature (for now)

1. **Toolchain:** Servo pins a specific Rust *nightly* and is built with
   its own `./mach` build system (gyp/ninja for SpiderMonkey, etc.). It
   can't be compiled as a regular dependency of a stable-Rust Tauri app
   in one `cargo build`.
2. **Web compatibility:** Servo is improving fast but does not yet render
   every real-world site (banking, some media/DRM, WebRTC-heavy apps).
   Release builds of SeeBrowser therefore default to the Chromium/WebKit
   WebView so **all** websites work, while the Servo path is ready to take
   over as it matures — the same strategy used by the Servo-based
   [Verso browser](https://github.com/verso-browser/verso).

## Building the Servo backend

### 1. Build Servo itself

Follow [The Servo Book — building](https://book.servo.org/building/building.html):

```bash
git clone https://github.com/servo/servo.git
cd servo
./mach bootstrap        # installs the pinned nightly, depot tools, deps
./mach build --release  # big build — expect 30-90 min & several GB of disk
```

Platform notes: Windows needs Visual Studio + the steps in the Servo book;
macOS needs Xcode CLT; Linux needs the packages listed by `./mach bootstrap`.

### 2. Link libservo into SeeBrowser

In `src-tauri/Cargo.toml`, uncomment the dependency (pin it to the Servo
revision you just built):

```toml
libservo = { git = "https://github.com/servo/servo", rev = "<your-servo-rev>", optional = true }
# and in [features]:
servo-engine = ["dep:libservo"]
```

Then implement the `sys` functions in `src-tauri/src/engine/servo.rs`
against the real embedding API — the file contains the exact call mapping:

```rust
let rendering_context = WindowRenderingContext::new(display, size)?;
let servo = ServoBuilder::default().event_loop_waker(waker).build();
let webview = WebViewBuilder::new(&servo, rendering_context)
    .delegate(delegate)      // URL/title/load callbacks -> ServoPageEvent
    .url(url.parse()?)
    .build();
servo.spin_event_loop();     // pumped from the host event loop (ServoView::pump_events)
webview.load(url); webview.resize(size); webview.eval_js(&user_script);
```

### 3. Build & select the engine

```bash
cd src-tauri
cargo build --release --features servo-engine
```

In the app: **Settings → Rendering engine → Servo**. `engine_info` will
report `servoAvailable: true` and new tabs use `ServoView`.

> Without the feature, `ServoView::create` returns a descriptive
> "not built" error and the browser transparently keeps using the
> WebView backend — nothing panics, nothing breaks.

## Servo capabilities today (upstream)

- ✅ HTML/CSS layout (Flexbox, Grid improving), DOM, fetch/XHR, canvas 2D,
  WebGL — most content sites & docs render fine
- ✅ WebGPU (experimental), WebXR foundations
- ⚠️ Some ES2023+ edge cases, service workers (partial), media codecs
  depend on platform GStreamer; DRM (Widevine) and WebRTC are not available
- 📈 Track progress on the [Servo blog](https://servo.org/blog/) and
  [wpt.fyi results](https://wpt.fyi/results/?product=servo)

## References

- Servo: https://servo.org · https://github.com/servo/servo
- Embedding examples: `ports/servoshell` in the Servo repo,
  [verso-browser/verso](https://github.com/verso-browser/verso)
- API docs: https://docs.rs/servo (the `servo` crate re-exports libservo)
