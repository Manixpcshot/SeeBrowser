// SeeBrowser — browser chrome (UI) logic.
// Tabs, omnibox, bookmarks, history, downloads, internal pages (see://…),
// theming/customization, find-in-page, zoom, shortcuts.
import "./style.css";
import { host, type Bounds, type TabEvent } from "./bridge";
import {
  store, normalizeInput, faviconFor, hostnameOf, prettyTitle,
  SEARCH_ENGINES, UA_STRINGS, FORCE_DARK_CSS, ACCENTS, DEFAULT_SETTINGS,
  type Settings,
} from "./store";
import { i18n } from "./i18n";

type InternalPage = "newtab" | "settings" | "history" | "bookmarks" | "downloads" | "about" | "shortcuts";
interface Tab {
  id: string;
  kind: "web" | "internal";
  page: InternalPage;
  url: string;
  title: string;
  loading: boolean;
  pinned: boolean;
  isPrivate: boolean;
  created: boolean; // native webview exists
  canBack: boolean;
  canFwd: boolean;
  zoom: number;
  blocked: number;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const tabsEl = $("#tabs"), anchorEl = $("#webview-anchor"), internalEl = $("#internal-page");
const omni = $("#omni-input") as HTMLInputElement;
const omniIcon = $("#omni-icon"), omniBox = $("#omnibox"), omniEngine = $("#omni-engine");
const suggestEl = $("#omni-suggest"), menuEl = $("#main-menu"), tabMenuEl = $("#tab-menu");
const tabSearchEl = $("#tab-search"), siteInfoEl = $("#site-info"), ghostEl = $("#page-ghost");

let tabs: Tab[] = [];
let activeId = "";
let closedStack: { url: string; pinned: boolean; isPrivate: boolean }[] = [];
let editingOmni = false;
let suggestIndex = -1;
let unseenDownloads = 0;
let clockTimer = 0;
let cachedEngine = "";
const ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

const active = () => tabs.find((t) => t.id === activeId);
const newId = () => Math.random().toString(36).slice(2, 10);
const t = (k: Parameters<typeof i18n.t>[0]) => i18n.t(k);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function toast(msg: string) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2200);
}

/* ------------------------------ bounds ------------------------------ */
function contentBounds(): Bounds {
  const r = anchorEl.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) };
}
let rafPending = false;
function syncBounds() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    const a = active();
    if (a && a.kind === "web" && a.created) host.setBounds(a.id, contentBounds()).catch(() => {});
  });
}

/* --------------------------- overlays --------------------------- */
function overlayOpen() {
  return [suggestEl, menuEl, tabMenuEl, tabSearchEl, siteInfoEl].some((el) => !el.classList.contains("hidden"));
}
function syncWebviewVisibility() {
  const a = active();
  const over = overlayOpen();
  for (const tab of tabs) {
    if (tab.kind !== "web" || !tab.created) continue;
    host.setVisible(tab.id, tab.id === a?.id && !over).catch(() => {});
  }
  // While a menu covers the (hidden) native page view, show a calm
  // placeholder instead of a blank void (Chrome-like: page still "there").
  const showGhost = !!a && a.kind === "web" && over;
  ghostEl.classList.toggle("hidden", !showGhost);
  if (showGhost && a) {
    $("#ghost-title").textContent = a.title;
    $("#ghost-url").textContent = a.url;
  }
}
function hidePopups() {
  for (const el of [suggestEl, menuEl, tabMenuEl, tabSearchEl, siteInfoEl]) el.classList.add("hidden");
  syncWebviewVisibility();
}
function markDownloadsSeen() {
  unseenDownloads = 0;
  $("#dl-badge").classList.add("hidden");
}
function bumpDownloadsBadge() {
  unseenDownloads++;
  const b = $("#dl-badge");
  b.textContent = String(unseenDownloads);
  b.classList.remove("hidden");
}

/* ------------------------------ tabs ------------------------------ */
function tabOptions() {
  const s = store.settings;
  return {
    userAgent: UA_STRINGS[s.userAgent],
    forceDark: s.forceDarkWebsites,
    adBlock: s.adBlock,
    customCss: s.customCss,
    zoom: s.defaultZoom,
    private: false,
  };
}

async function ensureWebview(tab: Tab) {
  if (tab.kind !== "web" || tab.created) return;
  // Mark as created *before* awaiting so concurrent callers (activate +
  // navigate in the same tick) don't create the same webview twice.
  tab.created = true;
  const isActiveTab = tab.id === activeId;
  const bounds = isActiveTab ? contentBounds() : { x: 0, y: 0, width: 1, height: 1 };
  try {
    await host.createTab(tab.id, tab.url, bounds, { ...tabOptions(), private: tab.isPrivate, zoom: tab.zoom });
    if (!isActiveTab) await host.setVisible(tab.id, false).catch(() => {});
    syncWebviewVisibility();
  } catch (e) {
    tab.created = false; // allow a retry on next activation
    console.error("createTab failed", e);
  }
}

function internalPageOf(url: string): InternalPage {
  const p = url.replace("see://", "").split(/[/?#]/)[0];
  return (["newtab", "settings", "history", "bookmarks", "downloads", "about", "shortcuts"].includes(p) ? p : "newtab") as InternalPage;
}

function openTab(rawUrl = "see://newtab", opts: { activate?: boolean; pinned?: boolean; isPrivate?: boolean } = {}) {
  const url = normalizeInput(rawUrl, store.settings.searchEngine);
  const internal = url.startsWith("see://");
  const tab: Tab = {
    id: newId(),
    kind: internal ? "internal" : "web",
    page: internalPageOf(url),
    url,
    title: internal ? pageTitle(internalPageOf(url)) : prettyTitle(url),
    loading: !internal,
    pinned: !!opts.pinned,
    isPrivate: !!opts.isPrivate,
    created: false,
    canBack: false, canFwd: false,
    zoom: store.settings.defaultZoom,
    blocked: 0,
  };
  // Chrome: a new tab opens right after the current one (pinned tabs stay first).
  const cur = active();
  let at = tabs.length;
  if (tab.pinned) at = tabs.filter((x) => x.pinned).length;
  else if (cur && !cur.pinned) at = tabs.indexOf(cur) + 1;
  else if (cur && cur.pinned) at = tabs.filter((x) => x.pinned).length;
  tabs.splice(at, 0, tab);
  if (opts.activate !== false) activateTab(tab.id);
  else { renderTabs(); ensureWebview(tab); }
  saveSession();
  return tab;
}

function pageTitle(p: InternalPage): string {
  switch (p) {
    case "settings": return t("settings");
    case "history": return t("history");
    case "bookmarks": return t("bookmarks");
    case "downloads": return t("downloads");
    case "about": return "SeeBrowser";
    case "shortcuts": return t("shortcuts");
    default: return t("newtabTitle");
  }
}

function sortPinned() {
  tabs = [...tabs.filter((x) => x.pinned), ...tabs.filter((x) => !x.pinned)];
}

function activateTab(id: string) {
  activeId = id;
  const tab = active();
  hidePopups();
  if (!tab) return;
  if (tab.kind === "internal") {
    internalEl.classList.remove("hidden");
    renderInternal(tab);
  } else {
    internalEl.classList.add("hidden");
    ensureWebview(tab).then(() => syncBounds());
  }
  renderTabs();
  updateToolbar();
  syncWebviewVisibility();
}

async function closeTab(id: string) {
  const i = tabs.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [tab] = tabs.splice(i, 1);
  closedStack.push({ url: tab.url, pinned: tab.pinned, isPrivate: tab.isPrivate });
  if (tab.created) host.close(tab.id).catch(() => {});
  if (tabs.length === 0) { openTab("see://newtab"); return; }
  if (activeId === id) activateTab(tabs[Math.min(i, tabs.length - 1)].id);
  else { renderTabs(); syncWebviewVisibility(); }
  saveSession();
}

function navigate(tab: Tab, raw: string) {
  const url = normalizeInput(raw, store.settings.searchEngine);
  const internal = url.startsWith("see://");
  tab.url = url;
  tab.blocked = 0;
  if (internal) {
    tab.kind = "internal";
    tab.page = internalPageOf(url);
    tab.title = pageTitle(tab.page);
    tab.loading = false;
    if (tab.id === activeId) activateTab(tab.id);
  } else {
    const wasInternal = tab.kind === "internal";
    tab.kind = "web";
    tab.loading = true;
    tab.title = prettyTitle(url);
    if (wasInternal || !tab.created) {
      if (tab.id === activeId) activateTab(tab.id);
      else ensureWebview(tab);
    } else {
      host.navigate(tab.id, url).catch(() => {});
    }
    if (!tab.isPrivate) store.addHistory(url, tab.title);
  }
  renderTabs();
  updateToolbar();
  saveSession();
}

function saveSession() {
  store.session = tabs.filter((x) => !x.isPrivate).map((x) => ({ url: x.url, pinned: x.pinned, private: false }));
  store.save();
}

/* --------------------------- tab strip UI --------------------------- */
function renderTabs() {
  tabsEl.innerHTML = "";
  for (const tab of tabs) {
    const el = document.createElement("div");
    el.className = `tab${tab.id === activeId ? " active" : ""}${tab.pinned ? " pinned" : ""}${tab.isPrivate ? " private" : ""}`;
    el.draggable = true;
    el.dataset.id = tab.id;
    el.title = `${tab.title}\n${tab.url}`;
    const fav = tab.kind === "internal"
      ? `<svg class="ic sm tab-fav-svg"><use href="#i-eye"/></svg>`
      : tab.loading
        ? `<span class="spinner"></span>`
        : `<img class="tab-fav" src="${faviconFor(tab.url)}" alt="">`;
    el.innerHTML = `
      ${tab.isPrivate ? `<svg class="ic sm priv-ic"><use href="#i-incog"/></svg>` : fav}
      <span class="tab-title">${esc(tab.title)}</span>
      ${tab.pinned ? "" : `<button class="tab-close" title="${t("closeTab")}"><svg class="ic xs"><use href="#i-x"/></svg></button>`}`;
    const img = el.querySelector<HTMLImageElement>(".tab-fav");
    if (img) img.addEventListener("error", () => {
      const s = document.createElement("span");
      s.innerHTML = `<svg class="ic sm"><use href="#i-globe"/></svg>`;
      img.replaceWith(s);
    }, { once: true });
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".tab-close")) closeTab(tab.id);
      else activateTab(tab.id);
    });
    el.addEventListener("auxclick", (e) => { if (e.button === 1) closeTab(tab.id); });
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); showTabMenu(tab, e.clientX, e.clientY); });
    el.addEventListener("dragstart", (e) => e.dataTransfer?.setData("text/plain", tab.id));
    el.addEventListener("dragover", (e) => e.preventDefault());
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      const dragId = e.dataTransfer?.getData("text/plain");
      if (!dragId || dragId === tab.id) return;
      const from = tabs.findIndex((x) => x.id === dragId);
      const to = tabs.findIndex((x) => x.id === tab.id);
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      sortPinned(); renderTabs(); saveSession();
    });
    tabsEl.appendChild(el);
  }
}

/* ----------------------------- toolbar ----------------------------- */
function updateToolbar() {
  const tab = active();
  if (!tab) return;
  ($("#btn-back") as HTMLButtonElement).disabled = !(tab.kind === "web" && tab.canBack);
  ($("#btn-fwd") as HTMLButtonElement).disabled = !(tab.kind === "web" && tab.canFwd);
  $("#btn-reload").innerHTML = tab.loading
    ? `<svg class="ic"><use href="#i-x"/></svg>` : `<svg class="ic"><use href="#i-reload"/></svg>`;
  ($("#btn-reload") as HTMLButtonElement).title = tab.loading ? t("stop") : t("reload");
  omniBox.classList.toggle("loading", tab.loading);
  if (!editingOmni) omni.value = tab.url;
  const secure = tab.url.startsWith("https://");
  omniIcon.innerHTML = tab.kind === "internal"
    ? `<svg class="ic sm"><use href="#i-eye"/></svg>`
    : secure ? `<svg class="ic sm ok"><use href="#i-lock"/></svg>` : `<svg class="ic sm"><use href="#i-globe"/></svg>`;
  omniEngine.textContent = SEARCH_ENGINES[store.settings.searchEngine].name;
  const zc = $("#omni-zoom");
  const showZoom = tab.kind === "web" && Math.abs(tab.zoom - 1) > 0.001;
  zc.classList.toggle("hidden", !showZoom);
  if (showZoom) zc.textContent = `${Math.round(tab.zoom * 100)}%`;
  const bm = tab.kind === "web" && store.isBookmarked(tab.url);
  $("#btn-star").innerHTML = `<svg class="ic sm"><use href="#i-star${bm ? "-f" : ""}"/></svg>`;
  $("#btn-star").classList.toggle("on", bm);
  const badge = $("#shield-count");
  badge.textContent = String(tab.blocked);
  badge.classList.toggle("hidden", tab.blocked === 0);
  $("#btn-shield").classList.toggle("on", store.settings.adBlock);
  document.title = tab.title ? `${tab.title} — SeeBrowser` : "SeeBrowser";
}

function renderBookmarksBar() {
  const bar = $("#bookmarks-bar");
  bar.classList.toggle("hidden", !store.settings.showBookmarksBar);
  bar.innerHTML = store.bookmarks.slice(0, 24).map((b) =>
    `<button class="bm-item" data-url="${esc(b.url)}" title="${esc(b.url)}"><img src="${faviconFor(b.url)}" alt="" onerror="this.style.display='none'"><span>${esc(b.title)}</span></button>`
  ).join("") || `<span class="bm-empty">${t("noBookmarks")}</span>`;
  bar.querySelectorAll<HTMLButtonElement>(".bm-item").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const url = btn.dataset.url!;
      if (e.ctrlKey || e.metaKey) openTab(url, { activate: false });
      else { const a = active(); if (a) navigate(a, url); }
    }));
  syncBounds();
}

/* ------------------------- host (Rust) events ------------------------- */
function onTabEvent(e: TabEvent) {
  // Native menu accelerators (they work even when the page has focus).
  if (e.type === "shortcut") { handleShortcut(e.label); return; }
  const id = e.label.replace(/^tab-/, "");
  const tab = tabs.find((x) => x.id === id);
  if (e.type === "new-tab" && e.url) { openTab(e.url); return; }
  if (e.type === "download-start" && e.url) {
    store.downloads.unshift({ id: newId(), url: e.url, path: e.path ?? "", time: Date.now(), success: null });
    store.save(); toast(`⬇ ${hostnameOf(e.url)}`); bumpDownloadsBadge();
    if (active()?.page === "downloads") renderInternal(active()!);
    return;
  }
  if (e.type === "download-done" && e.url) {
    const d = store.downloads.find((x) => x.url === e.url && x.success === null);
    if (d) { d.success = !!e.success; d.path = e.path ?? d.path; }
    store.save();
    if (active()?.page === "downloads") renderInternal(active()!);
    return;
  }
  if (!tab) return;
  if (e.url && e.url !== "about:blank") tab.url = e.url;
  switch (e.type) {
    case "navigate":
      if (e.canGoBack !== undefined) tab.canBack = e.canGoBack;
      if (e.canGoForward !== undefined) tab.canFwd = e.canGoForward;
      tab.loading = true;
      if (!tab.isPrivate && tab.url.startsWith("http")) store.addHistory(tab.url, tab.title);
      break;
    case "title":
      if (e.title) { tab.title = e.title; if (!tab.isPrivate) store.addHistory(tab.url, e.title); }
      break;
    case "loading": tab.loading = true; break;
    case "finished": tab.loading = false; break;
    case "blocked": tab.blocked++; break;
  }
  renderTabs();
  if (tab.id === activeId) updateToolbar();
}

/* --------------------------- omnibox --------------------------- */
interface Suggestion { label: string; sub: string; url: string; icon: string; tabId?: string }
function currentSuggestions(q: string): Suggestion[] {
  const out: Suggestion[] = [];
  const query = q.trim();
  if (!query) return out;
  out.push({ label: query, sub: `${t("searchWith")} ${SEARCH_ENGINES[store.settings.searchEngine].name}`, url: query, icon: "i-search" });
  const low = query.toLowerCase();
  // Chrome-style "Switch to this tab" for pages that are already open.
  for (const tb of tabs) {
    if (tb.id === activeId) continue;
    if ((tb.title + " " + tb.url).toLowerCase().includes(low)) {
      out.splice(1, 0, { label: tb.title, sub: t("switchToTab"), url: tb.url, icon: "i-eye", tabId: tb.id });
      break;
    }
  }
  const seen = new Set<string>();
  for (const b of store.bookmarks) {
    if ((b.title + b.url).toLowerCase().includes(low) && !seen.has(b.url)) {
      seen.add(b.url); out.push({ label: b.title, sub: b.url, url: b.url, icon: "i-bookmark" });
    }
  }
  for (const h of store.history) {
    if (out.length >= 8) break;
    if ((h.title + h.url).toLowerCase().includes(low) && !seen.has(h.url)) {
      seen.add(h.url); out.push({ label: h.title, sub: h.url, url: h.url, icon: "i-history" });
    }
  }
  return out;
}

function showSuggestions() {
  const items = currentSuggestions(omni.value);
  if (!items.length || document.activeElement !== omni) { suggestEl.classList.add("hidden"); syncWebviewVisibility(); return; }
  const r = omniBox.getBoundingClientRect();
  suggestEl.style.left = `${r.left}px`;
  suggestEl.style.top = `${r.bottom + 6}px`;
  suggestEl.style.width = `${r.width}px`;
  suggestEl.innerHTML = items.map((s, i) =>
    `<div class="suggest-item${i === suggestIndex ? " sel" : ""}" data-i="${i}">
       <svg class="ic sm"><use href="#${s.icon}"/></svg>
       <span class="s-label">${esc(s.label)}</span><span class="s-sub${s.tabId ? " switch" : ""}">${esc(s.sub)}</span>
     </div>`).join("");
  suggestEl.classList.remove("hidden");
  suggestEl.querySelectorAll<HTMLElement>(".suggest-item").forEach((el) =>
    el.addEventListener("mousedown", (ev) => { ev.preventDefault(); pickSuggestion(items[Number(el.dataset.i)]); }));
  syncWebviewVisibility();
}

function goOmni(value: string, inNewTab = false) {
  hidePopups(); editingOmni = false; omni.blur();
  if (inNewTab) { openTab(value); return; }
  const tab = active(); if (!tab) return;
  navigate(tab, value);
}
function pickSuggestion(s: Suggestion | undefined) {
  if (!s) return;
  if (s.tabId) { hidePopups(); editingOmni = false; omni.blur(); activateTab(s.tabId); }
  else goOmni(s.url);
}

// Chrome behavior: the first click into the omnibox selects the whole URL,
// a second click places the caret.
let omniFreshFocus = false;
omni.addEventListener("focus", () => { editingOmni = true; omniFreshFocus = true; omni.select(); showSuggestions(); });
omni.addEventListener("mouseup", (e) => {
  if (omniFreshFocus) { e.preventDefault(); omni.select(); omniFreshFocus = false; }
});
omni.addEventListener("input", () => { suggestIndex = -1; omniFreshFocus = false; showSuggestions(); });
omni.addEventListener("blur", () => window.setTimeout(() => { editingOmni = false; suggestEl.classList.add("hidden"); updateToolbar(); syncWebviewVisibility(); }, 120));
omni.addEventListener("keydown", (e) => {
  const items = currentSuggestions(omni.value);
  if (e.key === "Enter") {
    const sel = suggestIndex >= 0 ? items[suggestIndex] : undefined;
    if (e.altKey) { goOmni(sel?.url ?? omni.value, true); return; } // Alt+Enter: new tab
    if (sel) pickSuggestion(sel);
    else goOmni(omni.value);
  } else if (e.key === "ArrowDown") { e.preventDefault(); suggestIndex = Math.min(items.length - 1, suggestIndex + 1); showSuggestions(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); suggestIndex = Math.max(-1, suggestIndex - 1); showSuggestions(); }
  else if (e.key === "Escape") { omni.value = active()?.url ?? ""; omni.blur(); }
});
$("#omni-zoom").addEventListener("click", () => zoomStep(0));

/* ------------------------------ menus ------------------------------ */
interface MenuItem { label?: string; icon?: string; shortcut?: string; action?: () => void; sep?: boolean; checked?: boolean }
function showMenu(el: HTMLElement, items: MenuItem[], x: number, y: number) {
  hidePopups();
  el.innerHTML = items.map((m) => m.sep ? `<div class="menu-sep"></div>` :
    `<button class="menu-item">${m.icon ? `<svg class="ic sm"><use href="#${m.icon}"/></svg>` : `<span class="mi-ic"></span>`}
       <span class="mi-label">${esc(m.label ?? "")}${m.checked ? " ✓" : ""}</span>
       ${m.shortcut ? `<span class="mi-sc">${m.shortcut}</span>` : ""}</button>`).join("");
  el.querySelectorAll<HTMLButtonElement>(".menu-item").forEach((btn, i) => {
    const real = items.filter((m) => !m.sep)[i];
    btn.addEventListener("click", () => { hidePopups(); real.action?.(); });
  });
  el.classList.remove("hidden");
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = `${Math.max(6, Math.min(x, window.innerWidth - w - 8))}px`;
  el.style.top = `${Math.max(6, Math.min(y, window.innerHeight - h - 8))}px`;
  syncWebviewVisibility();
}

function showTabMenu(tab: Tab, x: number, y: number) {
  showMenu(tabMenuEl, [
    { label: t("mNewTab"), icon: "i-plus", action: () => openTab() },
    { label: tab.pinned ? t("unpin") : t("pin"), icon: "i-pin", action: () => { tab.pinned = !tab.pinned; sortPinned(); renderTabs(); saveSession(); } },
    { label: t("duplicate"), icon: "i-copy", action: () => openTab(tab.url, { isPrivate: tab.isPrivate }) },
    { label: t("copyUrl"), icon: "i-copy", action: () => { navigator.clipboard?.writeText(tab.url); toast(t("copied")); } },
    { label: t("reload"), icon: "i-reload", action: () => host.reload(tab.id).catch(() => {}) },
    { sep: true },
    { label: t("closeOther"), action: () => { [...tabs].filter((x) => x.id !== tab.id && !x.pinned).forEach((x) => closeTab(x.id)); } },
    { label: t("closeTab"), icon: "i-x", shortcut: "Ctrl+W", action: () => closeTab(tab.id) },
  ], x, y);
}

function zoomStep(dir: 1 | -1 | 0) {
  const tab = active(); if (!tab || tab.kind !== "web") return;
  if (dir === 0) tab.zoom = 1;
  else {
    const i = ZOOMS.findIndex((z) => Math.abs(z - tab.zoom) < 0.01);
    tab.zoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 5 : i) + dir))];
  }
  host.setZoom(tab.id, tab.zoom).catch(() => {});
  toast(`${Math.round(tab.zoom * 100)}%`);
}

/* ------------------------- site info popup ------------------------- */
function showSiteInfo() {
  const tab = active(); if (!tab) return;
  if (!siteInfoEl.classList.contains("hidden")) { hidePopups(); return; }
  hidePopups();
  const secure = tab.url.startsWith("https://");
  const title = tab.kind === "internal" ? t("internalInfo") : hostnameOf(tab.url);
  const conn = tab.kind === "internal" ? "" : secure
    ? `<div class="si-line"><svg class="ic sm ok"><use href="#i-lock"/></svg> ${t("secureConn")}</div>`
    : `<div class="si-line"><svg class="ic sm bad"><use href="#i-globe"/></svg> ${t("notSecureConn")}</div>`;
  siteInfoEl.innerHTML = `
    <div class="si-head"><svg class="ic"><use href="#i-${tab.kind === "internal" ? "eye" : secure ? "lock" : "globe"}"/></svg><span class="si-host">${esc(title)}</span></div>
    ${conn}
    ${tab.kind === "web" && store.settings.adBlock ? `<div class="si-line"><svg class="ic sm"><use href="#i-shield"/></svg> ${tab.blocked} ${t("blockedCount")}</div>` : ""}
    ${tab.kind === "web" && Math.abs(tab.zoom - 1) > 0.001 ? `<div class="si-line">🔍 ${Math.round(tab.zoom * 100)}%</div>` : ""}
    ${cachedEngine ? `<div class="si-line"><svg class="ic sm"><use href="#i-code"/></svg> <span dir="ltr">${esc(cachedEngine)}</span></div>` : ""}
    <div class="si-actions">
      <button class="btn sm" id="si-copy">${t("copyUrl")}</button>
      ${tab.kind === "web" ? `<button class="btn sm" id="si-ext">${t("openExternal")}</button>` : ""}
    </div>`;
  const r = omniBox.getBoundingClientRect();
  siteInfoEl.classList.remove("hidden");
  const rtl = document.documentElement.dir === "rtl";
  siteInfoEl.style.left = `${Math.max(6, rtl ? r.right - siteInfoEl.offsetWidth : r.left)}px`;
  siteInfoEl.style.top = `${r.bottom + 6}px`;
  siteInfoEl.querySelector("#si-copy")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(tab.url); hidePopups(); toast(t("copiedUrl"));
  });
  siteInfoEl.querySelector("#si-ext")?.addEventListener("click", () => {
    host.openExternal(tab.url).catch(() => {}); hidePopups();
  });
  syncWebviewVisibility();
}
omniIcon.addEventListener("click", showSiteInfo);

/* --------------------------- tab search --------------------------- */
function renderTabSearch(filter: string) {
  const list = $("#tab-search-list");
  const q = filter.trim().toLowerCase();
  const match = (title: string, url: string) => !q || (title + " " + url).toLowerCase().includes(q);
  const openItems = tabs.filter((tb) => match(tb.title, tb.url)).map((tb) => `
    <button class="ts-item" data-act="${tb.id}">
      ${tb.kind === "internal" ? `<svg class="ic sm"><use href="#i-eye"/></svg>` : `<img src="${faviconFor(tb.url)}" alt="" onerror="this.style.display='none'">`}
      <span class="ts-t">${esc(tb.title)}</span><span class="ts-h2">${esc(hostnameOf(tb.url))}</span>
      <span class="ts-x" data-close="${tb.id}" title="${t("closeTab")}"><svg class="ic xs"><use href="#i-x"/></svg></span>
    </button>`).join("");
  const closedItems = [...closedStack].reverse().slice(0, 8)
    .filter((c) => match(prettyTitle(c.url), c.url)).map((c) => `
    <button class="ts-item" data-reopen="${esc(c.url)}">
      <svg class="ic sm"><use href="#i-history"/></svg>
      <span class="ts-t">${esc(prettyTitle(c.url))}</span><span class="ts-h2">${esc(hostnameOf(c.url))}</span>
    </button>`).join("");
  list.innerHTML =
    (openItems ? `<div class="ts-h">${t("openTabs")} · ${tabs.length}</div>` + openItems : "") +
    (closedItems ? `<div class="ts-h">${t("recentlyClosed")}</div>` + closedItems : "");
  list.querySelectorAll<HTMLElement>("[data-act]").forEach((el) =>
    el.addEventListener("click", (e) => {
      const x = (e.target as HTMLElement).closest("[data-close]") as HTMLElement | null;
      if (x) { e.stopPropagation(); closeTab(x.dataset.close!); renderTabSearch(filter); return; }
      hidePopups(); activateTab(el.dataset.act!);
    }));
  list.querySelectorAll<HTMLElement>("[data-reopen]").forEach((el) =>
    el.addEventListener("click", () => { hidePopups(); openTab(el.dataset.reopen!); }));
}
function toggleTabSearch() {
  if (!tabSearchEl.classList.contains("hidden")) { hidePopups(); return; }
  hidePopups();
  const input = $("#tab-search-input") as HTMLInputElement;
  input.value = "";
  renderTabSearch("");
  const r = $("#btn-tabsearch").getBoundingClientRect();
  const rtl = document.documentElement.dir === "rtl";
  tabSearchEl.classList.remove("hidden");
  tabSearchEl.style.left = `${Math.max(6, rtl ? r.right - tabSearchEl.offsetWidth : r.left)}px`;
  tabSearchEl.style.top = `${r.bottom + 6}px`;
  syncWebviewVisibility();
  input.focus();
}
$("#btn-tabsearch").addEventListener("click", toggleTabSearch);
($("#tab-search-input") as HTMLInputElement).addEventListener("input", (e) => renderTabSearch((e.target as HTMLInputElement).value));
($("#tab-search-input") as HTMLInputElement).addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const first = tabSearchEl.querySelector<HTMLElement>("[data-act],[data-reopen]");
    first?.click();
  }
  if (e.key === "Escape") hidePopups();
});

$("#btn-menu").addEventListener("click", (e) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const rtl = document.documentElement.dir === "rtl";
  const tab = active();
  showMenu(menuEl, [
    { label: t("mNewTab"), icon: "i-plus", shortcut: "Ctrl+T", action: () => openTab() },
    { label: t("mNewPrivate"), icon: "i-incog", shortcut: "Ctrl+Shift+P", action: () => openTab("see://newtab", { isPrivate: true }) },
    { sep: true },
    { label: t("mHistory"), icon: "i-history", shortcut: "Ctrl+H", action: () => openTab("see://history") },
    { label: t("mBookmarks"), icon: "i-bookmark", action: () => openTab("see://bookmarks") },
    { label: t("mDownloads"), icon: "i-download", shortcut: "Ctrl+J", action: () => openTab("see://downloads") },
    { sep: true },
    { label: t("mFind"), icon: "i-search", shortcut: "Ctrl+F", action: openFind },
    { label: `${t("mZoomIn")} (${Math.round((tab?.zoom ?? 1) * 100)}%)`, icon: "i-plus", shortcut: "Ctrl++", action: () => zoomStep(1) },
    { label: t("mZoomOut"), icon: "i-min", shortcut: "Ctrl+-", action: () => zoomStep(-1) },
    { label: t("mPrint"), shortcut: "Ctrl+P", action: () => { if (tab) host.print(tab.id).catch(() => {}); } },
    { sep: true },
    { label: t("adBlock"), icon: "i-shield", checked: store.settings.adBlock, action: () => { store.settings.adBlock = !store.settings.adBlock; store.save(true); applySettings(false); } },
    { label: t("mCustomize"), icon: "i-palette", action: () => openTab("see://settings") },
    { label: t("mSettings"), icon: "i-gear", action: () => openTab("see://settings") },
    { label: t("mDevtools"), icon: "i-code", shortcut: "F12", action: () => { if (tab) host.devtools(tab.id).catch(() => {}); } },
    { sep: true },
    { label: t("shortcuts"), action: () => openTab("see://shortcuts") },
    { label: t("mAbout"), icon: "i-eye", action: () => openTab("see://about") },
  ], rtl ? r.left : r.right - 280, r.bottom + 6);
});

/* ---------------------------- find bar ---------------------------- */
function openFind() {
  $("#find-bar").classList.remove("hidden");
  ($("#find-input") as HTMLInputElement).focus();
  syncBounds();
}
function closeFind() { $("#find-bar").classList.add("hidden"); syncBounds(); }
let findTimer = 0;
($("#find-input") as HTMLInputElement).addEventListener("input", (e) => {
  window.clearTimeout(findTimer);
  findTimer = window.setTimeout(() => {
    const tab = active(); const v = (e.target as HTMLInputElement).value;
    if (tab && v) host.find(tab.id, v, true).catch(() => {});
  }, 180);
});
($("#find-input") as HTMLInputElement).addEventListener("keydown", (e) => {
  const tab = active(); if (!tab) return;
  if (e.key === "Enter") host.find(tab.id, (e.target as HTMLInputElement).value, !e.shiftKey).catch(() => {});
  if (e.key === "Escape") closeFind();
});
$("#find-next").addEventListener("click", () => { const a = active(); if (a) host.find(a.id, ($("#find-input") as HTMLInputElement).value, true).catch(() => {}); });
$("#find-prev").addEventListener("click", () => { const a = active(); if (a) host.find(a.id, ($("#find-input") as HTMLInputElement).value, false).catch(() => {}); });
$("#find-close").addEventListener("click", closeFind);

/* --------------------------- internal pages --------------------------- */
function renderInternal(tab: Tab) {
  internalEl.scrollTop = 0;
  switch (tab.page) {
    case "settings": return renderSettings();
    case "history": return renderHistory();
    case "bookmarks": return renderBookmarksPage();
    case "downloads": return renderDownloads();
    case "about": return renderAbout();
    case "shortcuts": return renderShortcuts();
    default: return renderNewtab(tab);
  }
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? t("greetingNight") : h < 12 ? t("greetingMorning") : h < 15 ? t("greetingNoon") : h < 19 ? t("greetingEvening") : t("greetingNight");
}

function renderNewtab(tab: Tab) {
  const s = store.settings;
  const most = [...store.history].sort((a, b) => b.visits - a.visits).slice(0, 6);
  internalEl.innerHTML = `
  <div class="newtab">
    <div class="nt-hero">
      <svg class="nt-logo"><use href="#i-eye"/></svg>
      <h1>${greeting()} <span class="grad">SeeBrowser</span></h1>
      <div class="nt-clock" id="nt-clock"></div>
      ${tab.isPrivate ? `<div class="nt-priv"><svg class="ic sm"><use href="#i-incog"/></svg> ${t("privateDesc")}</div>` : ""}
      <form id="nt-search" class="nt-search">
        <svg class="ic"><use href="#i-search"/></svg>
        <input id="nt-input" placeholder="${t("searchWeb")} (${SEARCH_ENGINES[s.searchEngine].name})" autocomplete="off">
      </form>
      ${host.kind === "demo" ? `<p class="nt-note">${t("demoIframe")}</p>` : ""}
    </div>
    <h2 class="nt-h">${t("speedDial")}</h2>
    <div class="nt-grid">
      ${s.speedDial.map((d, i) => `
        <button class="nt-tile" data-url="${esc(d.url)}">
          <span class="nt-del" data-del="${i}" title="${t("removeShortcut")}"><svg class="ic xs"><use href="#i-x"/></svg></span>
          <img src="${faviconFor(d.url)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'nt-letter',textContent:'${esc(d.title[0] ?? "?")}'}))">
          <span>${esc(d.title)}</span>
        </button>`).join("")}
      <button class="nt-tile nt-add" id="nt-add">
        <svg class="ic"><use href="#i-plus"/></svg><span>${t("addShortcut")}</span>
      </button>
    </div>
    ${most.length ? `<h2 class="nt-h">${t("mostVisited")}</h2>
    <div class="nt-most">${most.map((m) => `
      <button class="nt-most-item" data-url="${esc(m.url)}"><img src="${faviconFor(m.url)}" alt="" onerror="this.style.display='none'"><span class="nt-most-t">${esc(m.title)}</span><span class="nt-most-h">${esc(hostnameOf(m.url))}</span></button>`).join("")}
    </div>` : ""}
  </div>`;
  const clock = () => { const c = document.getElementById("nt-clock"); if (c) c.textContent = new Date().toLocaleTimeString(i18n.lang === "fa" ? "fa-IR" : "en-US", { hour: "2-digit", minute: "2-digit" }); };
  clock(); clockTimer = window.setInterval(clock, 15000);
  $("#nt-search").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = ($("#nt-input") as HTMLInputElement).value;
    if (v.trim()) navigate(tab, v);
  });
  internalEl.querySelectorAll<HTMLElement>("[data-url]").forEach((el) =>
    el.addEventListener("click", (e) => {
      const del = (e.target as HTMLElement).closest("[data-del]") as HTMLElement | null;
      if (del) {
        e.stopPropagation();
        store.settings.speedDial.splice(Number(del.dataset.del), 1);
        store.save(true); renderNewtab(tab);
        return;
      }
      const url = el.dataset.url!;
      if ((e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey) openTab(url, { activate: false });
      else navigate(tab, url);
    }));
  $("#nt-add").addEventListener("click", () => {
    const raw = window.prompt(t("enterUrlPrompt"), "https://");
    if (!raw?.trim()) return;
    const url = normalizeInput(raw, store.settings.searchEngine);
    if (url.startsWith("see://")) return;
    const title = window.prompt(t("enterTitlePrompt"), hostnameOf(url)) || hostnameOf(url);
    store.settings.speedDial.push({ title, url });
    store.save(true); renderNewtab(tab);
  });
  ($("#nt-input") as HTMLInputElement).focus();
}

function settingRow(label: string, desc: string, control: string) {
  return `<div class="set-row"><div class="set-txt"><div class="set-label">${label}</div>${desc ? `<div class="set-desc">${desc}</div>` : ""}</div><div class="set-ctl">${control}</div></div>`;
}
function select(id: string, value: string, opts: [string, string][]) {
  return `<select id="${id}" class="ctl-select">${opts.map(([v, l]) => `<option value="${v}"${v === value ? " selected" : ""}>${l}</option>`).join("")}</select>`;
}
function toggle(id: string, on: boolean) {
  return `<label class="switch"><input type="checkbox" id="${id}"${on ? " checked" : ""}><span></span></label>`;
}

async function renderSettings() {
  const s = store.settings;
  const info = await host.engineInfo().catch(() => null);
  const tab = active(); if (!tab || tab.page !== "settings") return;
  internalEl.innerHTML = `
  <div class="page">
    <h1 class="page-h"><svg class="ic"><use href="#i-gear"/></svg> ${t("settings")}</h1>

    <section class="card">
      <h2><svg class="ic sm"><use href="#i-palette"/></svg> ${t("appearance")}</h2>
      ${settingRow(t("theme"), "", select("s-theme", s.theme, [["dark", t("themeDark")], ["light", t("themeLight")], ["system", t("themeSystem")]]))}
      ${settingRow(t("accent"), "", `<div class="swatches">${ACCENTS.map((c) => `<button class="sw${c === s.accent ? " sel" : ""}" data-c="${c}" style="background:${c}"></button>`).join("")}<input type="color" id="s-accent" value="${s.accent}"></div>`)}
      ${settingRow(t("forceDark"), t("forceDarkDesc"), toggle("s-forcedark", s.forceDarkWebsites))}
      ${settingRow(t("density"), "", select("s-density", s.density, [["comfortable", t("comfortable")], ["compact", t("compact")]]))}
      ${settingRow(t("tabPosition"), "", select("s-tabpos", s.tabPosition, [["top", t("tabTop")], ["side", t("tabSide")]]))}
      ${settingRow(t("showBookmarksBar"), "", toggle("s-bmbar", s.showBookmarksBar))}
      ${settingRow(t("language"), "", select("s-lang", s.language, [["fa", "فارسی"], ["en", "English"]]))}
    </section>

    <section class="card">
      <h2><svg class="ic sm"><use href="#i-search"/></svg> ${t("search")}</h2>
      ${settingRow(t("searchEngine"), t("searchEngineDesc"), select("s-engine", s.searchEngine,
        (Object.keys(SEARCH_ENGINES) as (keyof typeof SEARCH_ENGINES)[]).map((k) => [k, SEARCH_ENGINES[k].name] as [string, string])))}
    </section>

    <section class="card">
      <h2><svg class="ic sm"><use href="#i-code"/></svg> ${t("engine")}</h2>
      ${settingRow(t("engine"), t("applyNewTabs"), select("s-render", s.engine, [["webview", t("engineWebView")], ["servo", t("engineServo")]]))}
      <div class="engine-info">
        <div><b>${t("activeEngine")}:</b> ${esc(info?.engine ?? "—")}</div>
        <div><b>Servo:</b> ${info?.servoAvailable ? "✓ libservo" : `<span class="chip">${t("servoBadge")}</span> ${esc(info?.servoNote ?? "")}`}</div>
        <p class="muted">${t("engineWebViewDesc")}</p>
        <p class="muted">${t("engineServoDesc")}</p>
        ${settingRow(t("userAgent"), t("userAgentDesc"), select("s-ua", s.userAgent, [["default", t("uaDefault")], ["chrome", t("uaChrome")], ["firefox", t("uaFirefox")], ["safari", t("uaSafari")], ["mobile", t("uaMobile")]]))}
        ${settingRow(t("defaultZoom"), "", select("s-zoom", String(s.defaultZoom), ZOOMS.map((z) => [String(z), `${Math.round(z * 100)}%`] as [string, string])))}
      </div>
    </section>

    <section class="card">
      <h2><svg class="ic sm"><use href="#i-shield"/></svg> ${t("privacy")}</h2>
      ${settingRow(t("adBlock"), t("adBlockDesc"), toggle("s-adblock", s.adBlock))}
      ${settingRow(t("clearHistory"), "", `<button class="btn danger" id="s-clearhist">${t("clearAll")}</button>`)}
    </section>

    <section class="card">
      <h2><svg class="ic sm"><use href="#i-home"/></svg> ${t("general")}</h2>
      ${settingRow(t("homepage"), "", `<input class="ctl-input" id="s-home" value="${esc(s.homepage)}" dir="ltr">`)}
      ${settingRow(t("startup"), "", select("s-startup", s.startup, [["restore", t("startupRestore")], ["newtab", t("startupNewtab")], ["homepage", t("startupHome")]]))}
    </section>

    <section class="card">
      <h2><svg class="ic sm"><use href="#i-code"/></svg> ${t("advanced")}</h2>
      <div class="set-label">${t("customCss")}</div>
      <p class="set-desc">${t("customCssDesc")}</p>
      <textarea id="s-css" class="ctl-css" dir="ltr" placeholder="/* e.g. ::-webkit-scrollbar { width: 10px } */">${esc(s.customCss)}</textarea>
      <div class="row-end"><button class="btn" id="s-applycss">${t("open") === "باز کردن" ? "اعمال CSS" : "Apply CSS"}</button>
      <button class="btn danger" id="s-reset">${t("resetSettings")}</button></div>
    </section>
  </div>`;

  const on = (id: string, ev: string, fn: (el: HTMLInputElement & HTMLSelectElement) => void) => {
    const el = internalEl.querySelector(`#${id}`) as HTMLInputElement & HTMLSelectElement;
    el?.addEventListener(ev, () => fn(el));
  };
  const upd = (rerender = false) => { store.save(true); applySettings(rerender); };
  on("s-theme", "change", (el) => { s.theme = el.value as Settings["theme"]; upd(); });
  on("s-density", "change", (el) => { s.density = el.value as Settings["density"]; upd(); });
  on("s-tabpos", "change", (el) => { s.tabPosition = el.value as Settings["tabPosition"]; upd(); });
  on("s-lang", "change", (el) => { s.language = el.value as Settings["language"]; upd(true); });
  on("s-engine", "change", (el) => { s.searchEngine = el.value as Settings["searchEngine"]; upd(); updateToolbar(); });
  on("s-render", "change", (el) => {
    s.engine = el.value as Settings["engine"]; upd();
    toast(s.engine === "servo" ? `Servo · ${t("servoBadge")} — docs/SERVO.md` : t("applyNewTabs"));
  });
  on("s-ua", "change", (el) => { s.userAgent = el.value as Settings["userAgent"]; upd(); toast(t("applyNewTabs")); });
  on("s-zoom", "change", (el) => { s.defaultZoom = parseFloat(el.value); upd(); });
  on("s-startup", "change", (el) => { s.startup = el.value as Settings["startup"]; upd(); });
  on("s-home", "change", (el) => { s.homepage = el.value.trim() || "see://newtab"; upd(); });
  on("s-forcedark", "change", (el) => { s.forceDarkWebsites = el.checked; upd(); applyPageStyles(); });
  on("s-bmbar", "change", (el) => { s.showBookmarksBar = el.checked; upd(); });
  on("s-adblock", "change", (el) => { s.adBlock = el.checked; upd(); });
  on("s-accent", "input", (el) => { s.accent = el.value; upd(); });
  internalEl.querySelectorAll<HTMLElement>(".sw").forEach((b) => b.addEventListener("click", () => { s.accent = b.dataset.c!; upd(true); }));
  $("#s-applycss").addEventListener("click", () => {
    s.customCss = ($("#s-css") as HTMLTextAreaElement).value; store.save(true); applyPageStyles(); toast("✓ CSS");
  });
  $("#s-clearhist").addEventListener("click", () => { store.history = []; store.save(true); toast("✓ " + t("clearHistory")); });
  $("#s-reset").addEventListener("click", () => {
    if (confirm(t("resetConfirm"))) { store.settings = { ...DEFAULT_SETTINGS }; store.save(true); applySettings(true); }
  });
}

function applyPageStyles() {
  const s = store.settings;
  for (const tab of tabs) {
    if (tab.kind !== "web" || !tab.created) continue;
    host.applyStyle(tab.id, "force-dark", s.forceDarkWebsites ? FORCE_DARK_CSS : null).catch(() => {});
    host.applyStyle(tab.id, "custom", s.customCss || null).catch(() => {});
  }
}

function listPage(kind: "history" | "bookmarks" | "downloads") {
  const icons = { history: "i-history", bookmarks: "i-bookmark", downloads: "i-download" } as const;
  const titles = { history: t("history"), bookmarks: t("bookmarks"), downloads: t("downloads") } as const;
  return `<div class="page">
    <h1 class="page-h"><svg class="ic"><use href="#${icons[kind]}"/></svg> ${titles[kind]}
      <span class="spacer"></span>
      ${kind !== "downloads" ? `<input class="ctl-input page-search" id="page-search" placeholder="${kind === "history" ? t("searchHistory") : t("searchBookmarks")}">` : ""}
      <button class="btn danger" id="page-clear">${t("clearAll")}</button>
    </h1><div id="page-list"></div></div>`;
}
function fmtDay(time: number): string {
  const d = new Date(time), now = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, now)) return t("today");
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (same(d, y)) return t("yesterday");
  return d.toLocaleDateString(i18n.lang === "fa" ? "fa-IR" : "en-US");
}
function fmtTime(time: number) {
  return new Date(time).toLocaleTimeString(i18n.lang === "fa" ? "fa-IR" : "en-US", { hour: "2-digit", minute: "2-digit" });
}

function renderHistory() {
  internalEl.innerHTML = listPage("history");
  const draw = (q = "") => {
    const items = store.history.filter((h) => (h.title + h.url).toLowerCase().includes(q.toLowerCase()));
    const list = $("#page-list");
    if (!items.length) { list.innerHTML = `<div class="empty">${t("noHistory")}</div>`; return; }
    let lastDay = "";
    list.innerHTML = items.map((h) => {
      const day = fmtDay(h.time);
      const head = day !== lastDay ? `<div class="day-h">${day}</div>` : "";
      lastDay = day;
      return head + `<div class="list-item" data-url="${esc(h.url)}">
        <img src="${faviconFor(h.url)}" alt="" onerror="this.style.display='none'">
        <div class="li-main"><div class="li-title">${esc(h.title)}</div><div class="li-sub" dir="ltr">${esc(h.url)}</div></div>
        <span class="li-time">${fmtTime(h.time)}</span>
        <button class="icon-btn li-del" data-del="${esc(h.url)}" title="${t("remove")}"><svg class="ic sm"><use href="#i-trash"/></svg></button>
      </div>`;
    }).join("");
    bindListItems(list, (url) => { store.history = store.history.filter((h) => h.url !== url); store.save(); draw(q); });
  };
  draw();
  ($("#page-search") as HTMLInputElement).addEventListener("input", (e) => draw((e.target as HTMLInputElement).value));
  $("#page-clear").addEventListener("click", () => { store.history = []; store.save(true); draw(); });
}

function renderBookmarksPage() {
  internalEl.innerHTML = listPage("bookmarks");
  const draw = (q = "") => {
    const items = store.bookmarks.filter((b) => (b.title + b.url).toLowerCase().includes(q.toLowerCase()));
    const list = $("#page-list");
    list.innerHTML = items.length ? items.map((b) => `
      <div class="list-item" data-url="${esc(b.url)}">
        <img src="${faviconFor(b.url)}" alt="" onerror="this.style.display='none'">
        <div class="li-main"><div class="li-title">${esc(b.title)}</div><div class="li-sub" dir="ltr">${esc(b.url)}</div></div>
        <button class="icon-btn li-del" data-del="${esc(b.url)}" title="${t("remove")}"><svg class="ic sm"><use href="#i-trash"/></svg></button>
      </div>`).join("") : `<div class="empty">${t("noBookmarks")}</div>`;
    bindListItems(list, (url) => { store.bookmarks = store.bookmarks.filter((b) => b.url !== url); store.save(); renderBookmarksBar(); updateToolbar(); draw(q); });
  };
  draw();
  ($("#page-search") as HTMLInputElement).addEventListener("input", (e) => draw((e.target as HTMLInputElement).value));
  $("#page-clear").addEventListener("click", () => { store.bookmarks = []; store.save(true); renderBookmarksBar(); draw(); });
}

function bindListItems(list: HTMLElement, onDelete: (url: string) => void) {
  list.querySelectorAll<HTMLElement>(".list-item").forEach((el) =>
    el.addEventListener("click", (e) => {
      const del = (e.target as HTMLElement).closest("[data-del]") as HTMLElement | null;
      if (del) { e.stopPropagation(); onDelete(del.dataset.del!); return; }
      const url = el.dataset.url!;
      if ((e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey) openTab(url, { activate: false });
      else { const a = active(); if (a) navigate(a, url); else openTab(url); }
    }));
}

function renderDownloads() {
  internalEl.innerHTML = listPage("downloads");
  const list = $("#page-list");
  const nameOf = (d: { path: string; url: string }) => (d.path.split(/[\\/]/).pop() || hostnameOf(d.url));
  list.innerHTML = store.downloads.length ? store.downloads.map((d) => `
    <div class="list-item">
      <svg class="ic"><use href="#i-download"/></svg>
      <div class="li-main"><div class="li-title">${esc(nameOf(d))}</div><div class="li-sub" dir="ltr">${esc(d.url)}</div></div>
      <span class="chip ${d.success === null ? "" : d.success ? "ok" : "bad"}">${d.success === null ? t("inProgress") : d.success ? t("done") : t("failed")}</span>
      <span class="li-time">${fmtDay(d.time)} ${fmtTime(d.time)}</span>
      ${d.path ? `<button class="btn sm" data-open="${esc(d.path)}">${t("open")}</button>` : ""}
      <button class="icon-btn li-del" data-del="${d.id}" title="${t("remove")}"><svg class="ic sm"><use href="#i-trash"/></svg></button>
    </div>`).join("") : `<div class="empty">${t("noDownloads")}</div>`;
  list.querySelectorAll<HTMLElement>("[data-open]").forEach((b) => b.addEventListener("click", () => host.openExternal(b.dataset.open!).catch(() => {})));
  list.querySelectorAll<HTMLElement>("[data-del]").forEach((b) => b.addEventListener("click", () => {
    store.downloads = store.downloads.filter((x) => x.id !== b.dataset.del); store.save(); renderDownloads();
  }));
  $("#page-clear").addEventListener("click", () => { store.downloads = []; store.save(true); renderDownloads(); });
}

async function renderAbout() {
  const info = await host.engineInfo().catch(() => null);
  const tab = active(); if (!tab || tab.page !== "about") return;
  internalEl.innerHTML = `
  <div class="page about">
    <svg class="about-logo"><use href="#i-eye"/></svg>
    <h1>See<span class="grad">Browser</span></h1>
    <p class="muted">${t("version")} ${info?.version ?? "1.0.0"} · ${esc(info?.os ?? "")} ${esc(info?.arch ?? "")} · Rust + Tauri${info?.portable ? ` · <span class="chip">${t("portableBadge")}</span>` : ""}</p>
    <p class="about-txt">${t("aboutText")}</p>
    <div class="card">
      <h2>${t("aboutEngine")}</h2>
      <p><b>${esc(info?.engine ?? "—")}</b></p>
      <p class="muted">${t("engineWebViewDesc")}</p>
      <p><b>Servo</b> ${info?.servoAvailable ? "✓" : `<span class="chip">${t("servoBadge")}</span>`}</p>
      <p class="muted">${t("engineServoDesc")}</p>
    </div>
    <div class="about-links">
      <button class="btn" data-ext="https://github.com/Manixpcshot/SeeBrowser">GitHub — SeeBrowser</button>
      <button class="btn" data-ext="https://servo.org">servo.org</button>
      <button class="btn" data-ext="https://www.rust-lang.org">rust-lang.org</button>
      <button class="btn" data-ext="https://tauri.app">tauri.app</button>
    </div>
  </div>`;
  internalEl.querySelectorAll<HTMLElement>("[data-ext]").forEach((b) =>
    b.addEventListener("click", () => openTab(b.dataset.ext!)));
}

function renderShortcuts() {
  const rows: [string, string][] = [
    ["Ctrl+T", t("mNewTab")], ["Ctrl+W", t("closeTab")], ["Ctrl+Shift+T", t("closedTabReopened")],
    ["Ctrl+Tab / Ctrl+Shift+Tab", "← →"], ["Ctrl+1 … Ctrl+9", "Tab #"], ["Ctrl+Shift+A", t("searchTabs")],
    ["Ctrl+L / F6", "Omnibox"], ["Alt+Enter", t("openNewTab")], ["Ctrl+R / F5", t("reload")],
    ["Alt+← / Alt+→", `${t("back")} / ${t("forward")}`], ["Ctrl+F", t("mFind")], ["Ctrl+H", t("mHistory")],
    ["Ctrl+J", t("mDownloads")], ["Ctrl+D", t("bookmark")], ["Ctrl++ / Ctrl+- / Ctrl+0", t("mZoomIn")],
    ["Ctrl+Shift+P", t("mNewPrivate")], ["Ctrl+P", t("mPrint")], ["F11", t("fullscreen")], ["F12", t("mDevtools")],
    ["Esc", t("stop")],
  ];
  internalEl.innerHTML = `<div class="page"><h1 class="page-h">${t("shortcuts")}</h1>
    <div class="card">${rows.map(([k, v]) => `<div class="sc-row"><kbd dir="ltr">${k}</kbd><span>${v}</span></div>`).join("")}</div></div>`;
}

/* --------------------------- settings apply --------------------------- */
function effectiveTheme(): "dark" | "light" {
  const th = store.settings.theme;
  if (th === "system") return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  return th;
}
function applySettings(rerenderInternal: boolean) {
  const s = store.settings;
  i18n.set(s.language);
  document.documentElement.dataset.theme = effectiveTheme();
  document.documentElement.style.setProperty("--accent", s.accent);
  document.body.classList.toggle("compact", s.density === "compact");
  document.body.classList.toggle("tabs-side", s.tabPosition === "side");
  $("#btn-theme").innerHTML = `<svg class="ic"><use href="#i-${effectiveTheme() === "dark" ? "sun" : "moon"}"/></svg>`;
  for (const tb of tabs) if (tb.kind === "internal") tb.title = pageTitle(tb.page);
  renderTabs();
  renderBookmarksBar();
  updateToolbar();
  const a = active();
  if (rerenderInternal && a?.kind === "internal") renderInternal(a);
  window.setTimeout(syncBounds, 60);
}

/* --------------------------- global events --------------------------- */
$("#btn-newtab").addEventListener("click", () => openTab());
$("#drag-region").addEventListener("dblclick", () => openTab());
$("#btn-back").addEventListener("click", () => { const a = active(); if (a) host.back(a.id).then(() => { a.canFwd = true; updateToolbar(); }).catch(() => {}); });
$("#btn-fwd").addEventListener("click", () => { const a = active(); if (a) host.forward(a.id).catch(() => {}); });
$("#btn-reload").addEventListener("click", () => {
  const a = active(); if (!a) return;
  if (a.kind === "internal") renderInternal(a);
  else if (a.loading) host.stop(a.id).catch(() => {});
  else host.reload(a.id).catch(() => {});
});
$("#btn-home").addEventListener("click", () => { const a = active(); if (a) navigate(a, store.settings.homepage); });
$("#btn-star").addEventListener("click", () => {
  const a = active(); if (!a || a.kind !== "web") return;
  const added = store.toggleBookmark(a.url, a.title);
  toast(added ? t("addedBookmark") : t("removedBookmark"));
  renderBookmarksBar(); updateToolbar();
});
$("#btn-downloads").addEventListener("click", () => { markDownloadsSeen(); openTab("see://downloads"); });
$("#btn-theme").addEventListener("click", () => {
  store.settings.theme = effectiveTheme() === "dark" ? "light" : "dark";
  store.save(true); applySettings(false);
});
$("#btn-shield").addEventListener("click", () => {
  const a = active();
  toast(store.settings.adBlock ? `🛡 ${a?.blocked ?? 0} ${t("blockedCount")}` : t("adBlock") + ": ✗");
});
$("#win-min").addEventListener("click", () => host.windowAction("minimize").catch(() => {}));
$("#win-max").addEventListener("click", () => host.windowAction("maximize").catch(() => {}));
$("#win-close").addEventListener("click", () => host.windowAction("close").catch(() => {}));
$("#brand").addEventListener("click", () => openTab("see://about"));

document.addEventListener("mousedown", (e) => {
  const el = e.target as HTMLElement;
  if (!el.closest("#main-menu,#btn-menu,#tab-menu,#omni-suggest,#omnibox,#tab-search,#btn-tabsearch,#site-info")) hidePopups();
});
new ResizeObserver(syncBounds).observe(anchorEl);
window.addEventListener("resize", syncBounds);
tabsEl.addEventListener("wheel", (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { tabsEl.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });

/* ---- Unified shortcuts: DOM keydown + native menu accelerators (Rust)
   feed the same handler; a timestamp guard prevents double-firing. ---- */
let lastShortcutAt = 0;
function handleShortcut(id: string) {
  const now = Date.now();
  if (now - lastShortcutAt < 120 && handleShortcut.last === id) return;
  handleShortcut.last = id; lastShortcutAt = now;
  const a = active();
  const cycle = (d: number) => {
    const i = tabs.findIndex((x) => x.id === activeId);
    const n = tabs[(i + d + tabs.length) % tabs.length];
    if (n) activateTab(n.id);
  };
  const tabNumber = (n: number) => {
    const target = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1];
    if (target) activateTab(target.id);
  };
  switch (id) {
    case "new-tab": openTab(); break;
    case "close-tab": if (a) closeTab(a.id); break;
    case "reopen-closed": {
      const last = closedStack.pop();
      if (last) { openTab(last.url, { pinned: last.pinned, isPrivate: last.isPrivate }); toast(t("closedTabReopened")); }
      break;
    }
    case "private-tab": openTab("see://newtab", { isPrivate: true }); break;
    case "search-tabs": toggleTabSearch(); break;
    case "focus-omnibox": omni.focus(); omni.select(); break;
    case "reload": if (a?.kind === "web") { a.loading = true; updateToolbar(); host.reload(a.id).catch(() => {}); } else if (a) renderInternal(a); break;
    case "find": openFind(); break;
    case "history": openTab("see://history"); break;
    case "downloads": markDownloadsSeen(); openTab("see://downloads"); break;
    case "bookmark": $("#btn-star").click(); break;
    case "print": if (a) host.print(a.id).catch(() => {}); break;
    case "zoom-in": zoomStep(1); break;
    case "zoom-out": zoomStep(-1); break;
    case "zoom-reset": zoomStep(0); break;
    case "next-tab": cycle(1); break;
    case "prev-tab": cycle(-1); break;
    case "go-back": if (a) host.back(a.id).catch(() => {}); break;
    case "go-forward": if (a) host.forward(a.id).catch(() => {}); break;
    case "devtools": if (a) host.devtools(a.id).catch(() => {}); break;
    case "fullscreen": host.windowAction("fullscreen").catch(() => {}); break;
    case "tab-1": tabNumber(1); break;
    case "tab-2": tabNumber(2); break;
    case "tab-3": tabNumber(3); break;
    case "tab-4": tabNumber(4); break;
    case "tab-5": tabNumber(5); break;
    case "tab-6": tabNumber(6); break;
    case "tab-7": tabNumber(7); break;
    case "tab-8": tabNumber(8); break;
    case "tab-9": tabNumber(9); break;
  }
  updateToolbar();
}
handleShortcut.last = "";

document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  let id = "";
  if (mod && e.key === "Tab") id = e.shiftKey ? "prev-tab" : "next-tab";
  else if (mod && k === "t") id = e.shiftKey ? "reopen-closed" : "new-tab";
  else if (mod && k === "w") id = "close-tab";
  else if (mod && k === "a" && e.shiftKey) id = "search-tabs";
  else if (mod && k === "l") id = "focus-omnibox";
  else if (e.key === "F6") id = "focus-omnibox";
  else if (mod && k === "r") id = "reload";
  else if (e.key === "F5") id = "reload";
  else if (mod && k === "f") id = "find";
  else if (mod && k === "h") id = "history";
  else if (mod && k === "j") id = "downloads";
  else if (mod && k === "d") id = "bookmark";
  else if (mod && k === "p") id = e.shiftKey ? "private-tab" : "print";
  else if (mod && (e.key === "+" || e.key === "=")) id = "zoom-in";
  else if (mod && e.key === "-") id = "zoom-out";
  else if (mod && e.key === "0") id = "zoom-reset";
  else if (mod && /^[1-9]$/.test(e.key)) id = `tab-${e.key}`;
  else if (e.altKey && e.key === "ArrowLeft") id = "go-back";
  else if (e.altKey && e.key === "ArrowRight") id = "go-forward";
  else if (e.key === "F12") id = "devtools";
  else if (e.key === "F11") id = "fullscreen";
  else if (e.key === "Escape") {
    if (overlayOpen()) hidePopups();
    else if (!$("#find-bar").classList.contains("hidden")) closeFind();
    else { const a = active(); if (a?.kind === "web" && a.loading) host.stop(a.id).catch(() => {}); }
    return;
  }
  if (id) { e.preventDefault(); handleShortcut(id); }
});

/* ------------------------------- boot ------------------------------- */
async function boot() {
  await host.init(onTabEvent).catch((e) => console.warn("host init", e));
  host.engineInfo().then((i) => { cachedEngine = i.engine; }).catch(() => {});
  await store.load();
  if (host.kind !== "tauri") {
    $("#win-controls").style.display = "none";
    const b = $("#demo-banner");
    b.textContent = t("demoBanner");
    b.classList.remove("hidden");
  }
  const s = store.settings;
  if (s.startup === "restore" && store.session.length) {
    store.session.forEach((st, i) => openTab(st.url, { activate: i === store.session.length - 1, pinned: st.pinned }));
  } else if (s.startup === "homepage" && s.homepage !== "see://newtab") {
    openTab(s.homepage);
  } else {
    openTab("see://newtab");
  }
  applySettings(false);
  window.setTimeout(syncBounds, 120);
}
boot();
