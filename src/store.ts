// store.ts — settings, bookmarks, history, downloads and session data.
// Persisted through the Rust side (a JSON document in the app data dir)
// or localStorage in the web demo.
import { host } from "./bridge";
import type { Lang } from "./i18n";

export type ThemeMode = "dark" | "light" | "system";
export type SearchEngineId = "google" | "brave" | "duckduckgo" | "bing";
export type EngineId = "webview" | "servo";
export type Density = "comfortable" | "compact";
export type TabPosition = "top" | "side";
export type StartupMode = "restore" | "newtab" | "homepage";
export type UAPreset = "default" | "chrome" | "firefox" | "safari" | "mobile";

export interface Settings {
  theme: ThemeMode;
  accent: string;
  language: Lang;
  searchEngine: SearchEngineId;
  homepage: string;
  startup: StartupMode;
  showBookmarksBar: boolean;
  forceDarkWebsites: boolean;
  adBlock: boolean;
  density: Density;
  tabPosition: TabPosition;
  engine: EngineId;
  userAgent: UAPreset;
  defaultZoom: number;
  customCss: string;
  speedDial: { title: string; url: string }[];
}

export interface Bookmark { id: string; title: string; url: string; addedAt: number }
export interface HistoryEntry { url: string; title: string; time: number; visits: number }
export interface DownloadItem { id: string; url: string; path: string; time: number; success: boolean | null }
export interface SessionTab { url: string; pinned: boolean; private: boolean }

export const SEARCH_ENGINES: Record<SearchEngineId, { name: string; url: (q: string) => string; home: string }> = {
  google:    { name: "Google",     url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,  home: "https://www.google.com" },
  brave:     { name: "Brave",      url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`, home: "https://search.brave.com" },
  duckduckgo:{ name: "DuckDuckGo", url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,          home: "https://duckduckgo.com" },
  bing:      { name: "Bing",       url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,     home: "https://www.bing.com" },
};

export const UA_STRINGS: Record<UAPreset, string | undefined> = {
  default: undefined,
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  safari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  mobile: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
};

export const FORCE_DARK_CSS = `
  html { filter: invert(1) hue-rotate(180deg) !important; background: #111 !important; }
  img, video, picture, canvas, [style*="background-image"], svg image {
    filter: invert(1) hue-rotate(180deg) !important;
  }
`;

export const ACCENTS = ["#2dd4bf", "#8b5cf6", "#3b82f6", "#f59e0b", "#ef4444", "#22c55e", "#ec4899", "#f97316"];

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  accent: "#2dd4bf",
  language: "fa",
  searchEngine: "google",
  homepage: "see://newtab",
  startup: "restore",
  showBookmarksBar: true,
  forceDarkWebsites: true,
  adBlock: true,
  density: "comfortable",
  tabPosition: "top",
  engine: "webview",
  userAgent: "default",
  defaultZoom: 1,
  customCss: "",
  speedDial: [
    { title: "Google", url: "https://www.google.com" },
    { title: "Brave Search", url: "https://search.brave.com" },
    { title: "YouTube", url: "https://www.youtube.com" },
    { title: "GitHub", url: "https://github.com" },
    { title: "Wikipedia", url: "https://www.wikipedia.org" },
    { title: "Servo", url: "https://servo.org" },
    { title: "Rust", url: "https://www.rust-lang.org" },
    { title: "X", url: "https://x.com" },
  ],
};

export class Store {
  settings: Settings = { ...DEFAULT_SETTINGS };
  bookmarks: Bookmark[] = [];
  history: HistoryEntry[] = [];
  downloads: DownloadItem[] = [];
  session: SessionTab[] = [];
  private saveTimer: number | undefined;

  async load() {
    const raw = await host.readStore().catch(() => ({} as Record<string, unknown>));
    const r = raw as Partial<{ settings: Settings; bookmarks: Bookmark[]; history: HistoryEntry[]; downloads: DownloadItem[]; session: SessionTab[] }>;
    this.settings = { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) };
    this.bookmarks = r.bookmarks ?? [];
    this.history = r.history ?? [];
    this.downloads = r.downloads ?? [];
    this.session = r.session ?? [];
  }

  save(immediate = false) {
    const write = () => {
      host.writeStore({
        settings: this.settings, bookmarks: this.bookmarks,
        history: this.history.slice(0, 2000), downloads: this.downloads.slice(0, 300),
        session: this.session,
      }).catch(() => {});
    };
    if (immediate) { write(); return; }
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(write, 250);
  }

  addHistory(url: string, title: string) {
    if (!url.startsWith("http")) return;
    const ex = this.history.find((h) => h.url === url);
    if (ex) { ex.time = Date.now(); ex.visits++; if (title) ex.title = title; }
    else this.history.unshift({ url, title: title || url, time: Date.now(), visits: 1 });
    this.history.sort((a, b) => b.time - a.time);
    this.save();
  }
  isBookmarked(url: string) { return this.bookmarks.some((b) => b.url === url); }
  toggleBookmark(url: string, title: string): boolean {
    const i = this.bookmarks.findIndex((b) => b.url === url);
    if (i >= 0) { this.bookmarks.splice(i, 1); this.save(); return false; }
    this.bookmarks.unshift({ id: crypto.randomUUID(), title: title || url, url, addedAt: Date.now() });
    this.save();
    return true;
  }
}
export const store = new Store();

/** Turn something typed in the omnibox into a URL (or an internal page). */
export function normalizeInput(raw: string, engine: SearchEngineId): string {
  const s = raw.trim();
  if (!s) return "see://newtab";
  if (s.startsWith("see://")) return s;
  if (/^(https?|file|about|data):/i.test(s)) return s;
  const looksLikeUrl =
    /^localhost(:\d+)?(\/.*)?$/.test(s) ||
    /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(s) ||
    /^[^\s]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(s);
  if (looksLikeUrl) return `https://${s}`;
  return SEARCH_ENGINES[engine].url(s);
}

export function faviconFor(url: string): string {
  try {
    const h = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${h}&sz=32`;
  } catch { return ""; }
}
export function hostnameOf(url: string): string {
  try { return new URL(url).hostname || url; } catch { return url; }
}
export function prettyTitle(url: string, title?: string): string {
  if (title && title.trim()) return title.trim();
  if (url.startsWith("see://")) return url.replace("see://", "See · ").replace("newtab", "New Tab");
  return hostnameOf(url) || url;
}
