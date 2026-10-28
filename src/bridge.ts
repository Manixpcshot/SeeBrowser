// bridge.ts — abstraction over the native host.
//
// Inside the SeeBrowser app (Tauri/Rust) every action goes through Rust
// commands that create & control real native webviews (Chromium WebView2 on
// Windows, WKWebView on macOS, WebKitGTK on Linux — or Servo where built).
// When the same UI runs in a normal browser tab (the online demo on the
// website), we fall back to iframes + localStorage so everything is testable.

export interface Bounds { x: number; y: number; width: number; height: number }
export interface TabOptions {
  userAgent?: string;
  forceDark: boolean;
  adBlock: boolean;
  customCss?: string;
  zoom: number;
  private: boolean;
}
export interface TabEvent {
  label: string;
  type: "navigate" | "title" | "loading" | "finished" | "new-tab"
       | "download-start" | "download-done" | "blocked" | "shortcut";
  url?: string;
  title?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  path?: string;
  success?: boolean;
}
export interface EngineInfo {
  engine: string;
  servoAvailable: boolean;
  servoNote: string;
  version: string;
  os: string;
  arch: string;
  portable: boolean;
}

export interface BrowserHost {
  kind: "tauri" | "demo";
  init(onEvent: (e: TabEvent) => void): Promise<void>;
  createTab(id: string, url: string, b: Bounds, o: TabOptions): Promise<void>;
  navigate(id: string, url: string): Promise<void>;
  back(id: string): Promise<void>;
  forward(id: string): Promise<void>;
  reload(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  close(id: string): Promise<void>;
  setBounds(id: string, b: Bounds): Promise<void>;
  setVisible(id: string, visible: boolean): Promise<void>;
  setZoom(id: string, zoom: number): Promise<void>;
  find(id: string, text: string, forward: boolean): Promise<void>;
  applyStyle(id: string, tag: string, css: string | null): Promise<void>;
  devtools(id: string): Promise<void>;
  print(id: string): Promise<void>;
  readStore(): Promise<Record<string, unknown>>;
  writeStore(data: Record<string, unknown>): Promise<void>;
  openExternal(target: string): Promise<void>;
  engineInfo(): Promise<EngineInfo>;
  windowAction(a: "minimize" | "maximize" | "close" | "fullscreen"): Promise<void>;
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const label = (id: string) => `tab-${id}`;

/* ----------------------------- Tauri host ----------------------------- */
class TauriHost implements BrowserHost {
  kind = "tauri" as const;
  private invoke!: typeof import("@tauri-apps/api/core").invoke;
  private win: import("@tauri-apps/api/window").Window | null = null;

  async init(onEvent: (e: TabEvent) => void) {
    const core = await import("@tauri-apps/api/core");
    this.invoke = core.invoke;
    const event = await import("@tauri-apps/api/event");
    await event.listen<TabEvent>("see-tab-event", (ev) => onEvent(ev.payload));
    const wmod = await import("@tauri-apps/api/window");
    this.win = wmod.getCurrentWindow();
  }
  private inv<T>(cmd: string, args?: Record<string, unknown>) {
    return this.invoke<T>(cmd, args).catch((e) => { console.warn(cmd, e); throw e; });
  }
  createTab(id: string, url: string, b: Bounds, o: TabOptions) {
    return this.inv<void>("tab_create", { label: label(id), url, bounds: b, options: o });
  }
  navigate(id: string, url: string) { return this.inv<void>("tab_navigate", { label: label(id), url }); }
  back(id: string) { return this.inv<void>("tab_go_back", { label: label(id) }); }
  forward(id: string) { return this.inv<void>("tab_go_forward", { label: label(id) }); }
  reload(id: string) { return this.inv<void>("tab_reload", { label: label(id) }); }
  stop(id: string) { return this.inv<void>("tab_stop", { label: label(id) }); }
  close(id: string) { return this.inv<void>("tab_close", { label: label(id) }); }
  setBounds(id: string, b: Bounds) { return this.inv<void>("tab_set_bounds", { label: label(id), bounds: b }); }
  setVisible(id: string, v: boolean) { return this.inv<void>("tab_set_visible", { label: label(id), visible: v }); }
  setZoom(id: string, z: number) { return this.inv<void>("tab_set_zoom", { label: label(id), zoom: z }); }
  find(id: string, text: string, forward: boolean) { return this.inv<void>("tab_find", { label: label(id), text, forward }); }
  applyStyle(id: string, tag: string, css: string | null) { return this.inv<void>("tab_apply_style", { label: label(id), tag, css }); }
  devtools(id: string) { return this.inv<void>("tab_devtools", { label: label(id) }); }
  print(id: string) { return this.inv<void>("tab_print", { label: label(id) }); }
  readStore() { return this.inv<Record<string, unknown>>("store_read"); }
  writeStore(data: Record<string, unknown>) { return this.inv<void>("store_write", { data }); }
  openExternal(target: string) { return this.inv<void>("open_external", { target }); }
  engineInfo() { return this.inv<EngineInfo>("engine_info"); }
  async windowAction(a: "minimize" | "maximize" | "close" | "fullscreen") {
    if (!this.win) return;
    if (a === "minimize") await this.win.minimize();
    else if (a === "maximize") await this.win.toggleMaximize();
    else if (a === "fullscreen") await this.win.setFullscreen(!(await this.win.isFullscreen()));
    else await this.win.close();
  }
}

/* ------------------------------ Demo host ------------------------------ */
class DemoHost implements BrowserHost {
  kind = "demo" as const;
  private frames = new Map<string, HTMLIFrameElement>();
  private onEvent: ((e: TabEvent) => void) | null = null;
  private anchor: HTMLElement | null = null;

  async init(onEvent: (e: TabEvent) => void) {
    this.onEvent = onEvent;
    this.anchor = document.getElementById("webview-anchor");
  }
  private emit(e: TabEvent) { this.onEvent?.(e); }
  async createTab(id: string, url: string) {
    const f = document.createElement("iframe");
    f.className = "demo-frame";
    f.setAttribute("referrerpolicy", "no-referrer");
    f.src = url;
    f.addEventListener("load", () => {
      let title = "";
      let realUrl = url;
      try {
        title = f.contentDocument?.title ?? "";
        realUrl = f.contentWindow?.location.href ?? url;
      } catch { /* cross-origin: keep the navigated URL */ }
      this.emit({ label: label(id), type: "finished", url: realUrl });
      if (title) this.emit({ label: label(id), type: "title", title });
    });
    this.anchor?.appendChild(f);
    this.frames.set(id, f);
    this.emit({ label: label(id), type: "loading", url });
  }
  async navigate(id: string, url: string) {
    const f = this.frames.get(id); if (!f) return;
    f.src = url;
    this.emit({ label: label(id), type: "navigate", url, canGoBack: true, canGoForward: false });
    this.emit({ label: label(id), type: "loading", url });
  }
  async back(id: string) { this.frames.get(id)?.contentWindow?.history.back(); }
  async forward(id: string) { this.frames.get(id)?.contentWindow?.history.forward(); }
  async reload(id: string) { const f = this.frames.get(id); if (f) f.src = f.src; }
  async stop() { /* noop */ }
  async close(id: string) { this.frames.get(id)?.remove(); this.frames.delete(id); }
  async setBounds() { /* iframes are laid out by CSS */ }
  async setVisible(id: string, v: boolean) {
    const f = this.frames.get(id); if (f) f.style.display = v ? "block" : "none";
  }
  async setZoom(id: string, z: number) {
    const f = this.frames.get(id); if (f) (f.style as unknown as { zoom: string }).zoom = String(z);
  }
  async find() { /* not available cross-origin in the demo */ }
  async applyStyle(id: string, tag: string, css: string | null) {
    try {
      const doc = this.frames.get(id)?.contentDocument; if (!doc) return;
      const sel = `style[data-see="${tag}"]`;
      doc.querySelector(sel)?.remove();
      if (css) {
        const s = doc.createElement("style");
        s.dataset.see = tag; s.textContent = css; doc.documentElement.appendChild(s);
      }
    } catch { /* cross-origin */ }
  }
  async devtools() { /* noop */ }
  async print(id: string) { this.frames.get(id)?.contentWindow?.print(); }
  async readStore() {
    try { return JSON.parse(localStorage.getItem("seebrowser-store") ?? "{}"); }
    catch { return {}; }
  }
  async writeStore(data: Record<string, unknown>) {
    localStorage.setItem("seebrowser-store", JSON.stringify(data));
  }
  async openExternal(target: string) { window.open(target, "_blank"); }
  async engineInfo(): Promise<EngineInfo> {
    return {
      engine: "Web demo (host browser engine via iframe)",
      servoAvailable: false,
      servoNote: "Servo runs in the desktop build (see docs/SERVO.md).",
      version: "1.2.0", os: "web", arch: "—", portable: false,
    };
  }
  async windowAction() { /* noop */ }
}

export const host: BrowserHost = isTauri ? new TauriHost() : new DemoHost();
