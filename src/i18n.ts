// Simple FA/EN i18n for the SeeBrowser chrome UI.
export type Lang = "fa" | "en";

const fa = {
  newTab: "تب جدید", back: "عقب", forward: "جلو", reload: "بارگذاری مجدد", stop: "توقف",
  home: "صفحهٔ اصلی", bookmark: "نشانک", menu: "منوی اصلی", downloads: "دانلودها",
  adblock: "مسدودکنندهٔ تبلیغات و ردیاب‌ها", toggleTheme: "تیره / روشن",
  omniboxPh: "جستجو یا وارد کردن آدرس وب‌سایت…", findPh: "یافتن در صفحه…",
  searchWith: "جستجو با", mNewTab: "تب جدید", mNewPrivate: "تب خصوصی جدید",
  mHistory: "تاریخچه", mBookmarks: "نشانک‌ها", mDownloads: "دانلودها",
  mFind: "یافتن در صفحه", mZoomIn: "بزرگ‌نمایی", mZoomOut: "کوچک‌نمایی", mZoomReset: "بازنشانی بزرگ‌نمایی",
  mCustomize: "شخصی‌سازی مرورگر", mSettings: "تنظیمات", mDevtools: "ابزار توسعه‌دهنده",
  mAbout: "دربارهٔ SeeBrowser", mPrint: "چاپ…", mSavePage: "ذخیرهٔ صفحه",
  settings: "تنظیمات", appearance: "ظاهر", search: "جستجو", privacy: "حریم خصوصی و امنیت",
  engine: "موتور نمایش (رندرینگ)", general: "عمومی", advanced: "پیشرفته",
  theme: "پوسته", themeDark: "تیره", themeLight: "روشن", themeSystem: "هماهنگ با سیستم",
  accent: "رنگ اصلی (Accent)", forceDark: "تیره‌کردن اجباری همهٔ وب‌سایت‌ها (Force Dark Mode)",
  forceDarkDesc: "حتی سایت‌هایی که حالت تیره ندارند، تیره نمایش داده می‌شوند.",
  density: "تراکم رابط کاربری", comfortable: "راحت", compact: "فشرده",
  tabPosition: "موقعیت تب‌ها", tabTop: "بالا (مثل کروم)", tabSide: "کنار (عمودی)",
  showBookmarksBar: "نمایش نوار نشانک‌ها", language: "زبان رابط کاربری",
  searchEngine: "موتور جستجوی پیش‌فرض", searchEngineDesc: "جستجوهایی که در نوار آدرس انجام می‌دهید با این موتور انجام می‌شود.",
  homepage: "صفحهٔ اصلی (Homepage)", startup: "هنگام شروع مرورگر", startupRestore: "تب‌های قبلی باز شوند",
  startupNewtab: "صفحهٔ تب جدید باز شود", startupHome: "صفحهٔ اصلی باز شود",
  newTabPage: "صفحهٔ تب جدید", adBlock: "مسدودکنندهٔ تبلیغات و ردیاب‌ها", adBlockDesc: "دامنه‌ها و عناصر تبلیغاتی شناخته‌شده مسدود/مخفی می‌شوند.",
  blockedCount: "مورد در این صفحه مسدود شد", clearHistory: "پاک‌کردن تاریخچه", clearAll: "پاک‌کردن همه",
  history: "تاریخچه", bookmarks: "نشانک‌ها", noHistory: "هنوز چیزی در تاریخچه نیست.",
  noBookmarks: "هنوز نشانکی ندارید. روی ستارهٔ نوار آدرس کلیک کنید.", noDownloads: "هنوز دانلودی انجام نشده است.",
  searchHistory: "جستجو در تاریخچه…", searchBookmarks: "جستجو در نشانک‌ها…",
  customCss: "CSS سفارشی برای همهٔ سایت‌ها", customCssDesc: "این استایل به همهٔ صفحات وب تزریق می‌شود (مثل userChrome.css فایرفاکس).",
  userAgent: "User-Agent", userAgentDesc: "مرورگر با این هویت به وب‌سایت‌ها معرفی می‌شود. «پیش‌فرض» یعنی همان هویت موتور.",
  uaDefault: "پیش‌فرض موتور", uaChrome: "Google Chrome (ویندوز)", uaFirefox: "Firefox", uaSafari: "Safari (مک)", uaMobile: "موبایل (اندروید)",
  defaultZoom: "بزرگ‌نمایی پیش‌فرض صفحه", applyNewTabs: "تغییرات موتور روی تب‌های جدید اعمال می‌شود.",
  engineWebView: "WebView سیستمی — Chromium / WebKit", engineWebViewDesc: "در ویندوز: Microsoft Edge WebView2 (هستهٔ Chromium، سازگار با همهٔ سایت‌ها مثل کروم) — در مک: WKWebView — در لینوکس: WebKitGTK.",
  engineServo: "Servo (موتور اوپن‌سورس راست) — آزمایشی", engineServoDesc: "موتور رندرینگ اوپن‌سورس Servo نوشته‌شده با Rust. برای فعال‌سازی باید نسخهٔ مخصوص با libservo بیلد شود (docs/SERVO.md). در نسخه‌های آمادهٔ انتشار، تا بلوغ کامل Servo، موتور Chromium فعال است تا همهٔ وب‌سایت‌ها بدون مشکل باز شوند.",
  servoBadge: "نیازمند بیلد اختصاصی", activeEngine: "موتور فعال در این نسخه",
  greetingMorning: "صبح بخیر", greetingNoon: "ظهر بخیر", greetingEvening: "عصر بخیر", greetingNight: "شب بخیر",
  speedDial: "دسترسی سریع", mostVisited: "پربازدیدترین‌ها", searchWeb: "جستجو در وب…",
  addedBookmark: "به نشانک‌ها اضافه شد", removedBookmark: "از نشانک‌ها حذف شد",
  copied: "کپی شد", closedTabReopened: "تب بسته‌شده بازگردانده شد",
  pin: "سنجاق‌کردن تب", unpin: "برداشتن سنجاق", duplicate: "تکثیر تب", closeTab: "بستن تب",
  closeOther: "بستن بقیهٔ تب‌ها", copyUrl: "کپی آدرس", openNewTab: "بازکردن در تب جدید",
  privateBadge: "خصوصی", privateTab: "تب خصوصی", privateDesc: "در تب خصوصی، تاریخچه ذخیره نمی‌شود.",
  today: "امروز", yesterday: "دیروز", older: "قدیمی‌تر", remove: "حذف",
  open: "باز کردن", showInFolder: "نمایش در پوشه", done: "تمام‌شده", failed: "ناموفق", inProgress: "در حال انجام",
  demoBanner: "شما در حالت دموی وب هستید — برای تجربهٔ کامل (موتور Chromium/Servo و همهٔ امکانات) نسخهٔ دسکتاپ SeeBrowser را دانلود کنید.",
  demoIframe: "نکته: بعضی سایت‌ها اجازهٔ نمایش داخل قاب (iframe) در دموی وب را نمی‌دهند؛ در نسخهٔ دسکتاپ همهٔ سایت‌ها باز می‌شوند.",
  shortcuts: "میانبرهای صفحه‌کلید", version: "نسخه", resetSettings: "بازنشانی همهٔ تنظیمات",
  resetConfirm: "همهٔ تنظیمات به حالت اول برگردد؟", openExternal: "بازکردن در مرورگر سیستم",
  searchTabs: "جستجوی تب‌ها", searchTabsPh: "جستجو در تب‌های باز…", openTabs: "تب‌های باز",
  recentlyClosed: "اخیراً بسته‌شده", switchToTab: "رفتن به این تب", siteInfo: "اطلاعات سایت",
  secureConn: "اتصال امن است (HTTPS)", notSecureConn: "اتصال امن نیست (HTTP)",
  internalInfo: "صفحهٔ داخلی SeeBrowser", addShortcut: "افزودن میانبر", removeShortcut: "حذف میانبر",
  enterUrlPrompt: "آدرس وب‌سایت را وارد کنید:", enterTitlePrompt: "عنوان میانبر (اختیاری):",
  fullscreen: "تمام‌صفحه", copiedUrl: "آدرس صفحه کپی شد",
  notFoundInPage: "یافت نشد", newtabTitle: "تب جدید", untitled: "بدون عنوان", loading: "در حال بارگذاری…",
  aboutEngine: "موتور نمایش صفحات", aboutText: "SeeBrowser یک مرورگر وب اوپن‌سورس است که با زبان Rust و چارچوب Tauri ساخته شده و معماری موتور قابل‌تعویض دارد: موتور اوپن‌سورس Servo (libservo) و موتور WebView سیستمی (Chromium WebView2 در ویندوز). سریع، سبک، امن و کاملاً قابل شخصی‌سازی.",
} as const;

export type Dict = { [K in keyof typeof fa]: string };
const en: Dict = {
  newTab: "New tab", back: "Back", forward: "Forward", reload: "Reload", stop: "Stop",
  home: "Home", bookmark: "Bookmark this page", menu: "Main menu", downloads: "Downloads",
  adblock: "Ad & tracker blocker", toggleTheme: "Toggle dark / light",
  omniboxPh: "Search or type a URL…", findPh: "Find in page…",
  searchWith: "Search with", mNewTab: "New tab", mNewPrivate: "New private tab",
  mHistory: "History", mBookmarks: "Bookmarks", mDownloads: "Downloads",
  mFind: "Find in page", mZoomIn: "Zoom in", mZoomOut: "Zoom out", mZoomReset: "Reset zoom",
  mCustomize: "Customize SeeBrowser", mSettings: "Settings", mDevtools: "Developer tools",
  mAbout: "About SeeBrowser", mPrint: "Print…", mSavePage: "Save page",
  settings: "Settings", appearance: "Appearance", search: "Search", privacy: "Privacy & security",
  engine: "Rendering engine", general: "General", advanced: "Advanced",
  theme: "Theme", themeDark: "Dark", themeLight: "Light", themeSystem: "Match system",
  accent: "Accent color", forceDark: "Force dark mode on all websites",
  forceDarkDesc: "Even sites without a dark theme are shown dark.",
  density: "UI density", comfortable: "Comfortable", compact: "Compact",
  tabPosition: "Tab position", tabTop: "Top (like Chrome)", tabSide: "Side (vertical tabs)",
  showBookmarksBar: "Show bookmarks bar", language: "Interface language",
  searchEngine: "Default search engine", searchEngineDesc: "Searches from the address bar use this engine.",
  homepage: "Homepage", startup: "On startup", startupRestore: "Reopen previous tabs",
  startupNewtab: "Open the New Tab page", startupHome: "Open the homepage",
  newTabPage: "New Tab page", adBlock: "Ad & tracker blocker", adBlockDesc: "Known ad/tracker domains and elements are blocked or hidden.",
  blockedCount: "blocked on this page", clearHistory: "Clear history", clearAll: "Clear all",
  history: "History", bookmarks: "Bookmarks", noHistory: "No history yet.",
  noBookmarks: "No bookmarks yet. Click the star in the address bar.", noDownloads: "No downloads yet.",
  searchHistory: "Search history…", searchBookmarks: "Search bookmarks…",
  customCss: "Custom CSS for all sites", customCssDesc: "Injected into every web page (like Firefox userChrome.css).",
  userAgent: "User-Agent", userAgentDesc: "How the browser identifies itself to websites. “Default” = the engine's own UA.",
  uaDefault: "Engine default", uaChrome: "Google Chrome (Windows)", uaFirefox: "Firefox", uaSafari: "Safari (macOS)", uaMobile: "Mobile (Android)",
  defaultZoom: "Default page zoom", applyNewTabs: "Engine changes apply to new tabs.",
  engineWebView: "System WebView — Chromium / WebKit", engineWebViewDesc: "Windows: Microsoft Edge WebView2 (Chromium core — every site works, like Chrome) · macOS: WKWebView · Linux: WebKitGTK.",
  engineServo: "Servo (open-source Rust engine) — experimental", engineServoDesc: "The open-source Servo rendering engine written in Rust. Requires a special build with libservo (see docs/SERVO.md). Release builds use the Chromium engine until Servo fully matures, so every website just works.",
  servoBadge: "Needs custom build", activeEngine: "Engine active in this build",
  greetingMorning: "Good morning", greetingNoon: "Good afternoon", greetingEvening: "Good evening", greetingNight: "Good night",
  speedDial: "Speed dial", mostVisited: "Most visited", searchWeb: "Search the web…",
  addedBookmark: "Bookmark added", removedBookmark: "Bookmark removed",
  copied: "Copied", closedTabReopened: "Closed tab reopened",
  pin: "Pin tab", unpin: "Unpin tab", duplicate: "Duplicate tab", closeTab: "Close tab",
  closeOther: "Close other tabs", copyUrl: "Copy URL", openNewTab: "Open in new tab",
  privateBadge: "Private", privateTab: "Private tab", privateDesc: "Private tabs don't save history.",
  today: "Today", yesterday: "Yesterday", older: "Older", remove: "Remove",
  open: "Open", showInFolder: "Show in folder", done: "Done", failed: "Failed", inProgress: "In progress",
  demoBanner: "You're in the web demo — download the SeeBrowser desktop app for the full Chromium/Servo experience.",
  demoIframe: "Note: some sites refuse to be shown inside an iframe in the web demo; in the desktop app every site works.",
  shortcuts: "Keyboard shortcuts", version: "Version", resetSettings: "Reset all settings",
  resetConfirm: "Reset all settings to defaults?", openExternal: "Open in system browser",
  searchTabs: "Search tabs", searchTabsPh: "Search open tabs…", openTabs: "Open tabs",
  recentlyClosed: "Recently closed", switchToTab: "Switch to this tab", siteInfo: "Site information",
  secureConn: "Connection is secure (HTTPS)", notSecureConn: "Connection is not secure (HTTP)",
  internalInfo: "SeeBrowser internal page", addShortcut: "Add shortcut", removeShortcut: "Remove shortcut",
  enterUrlPrompt: "Enter the website URL:", enterTitlePrompt: "Shortcut title (optional):",
  fullscreen: "Full screen", copiedUrl: "Page URL copied",
  notFoundInPage: "Not found", newtabTitle: "New Tab", untitled: "Untitled", loading: "Loading…",
  aboutEngine: "Rendering engine", aboutText: "SeeBrowser is an open-source web browser built with Rust and Tauri with a pluggable engine architecture: the open-source Servo engine (libservo) and the system WebView (Chromium WebView2 on Windows). Fast, light, secure and completely customizable.",
};

export class I18n {
  lang: Lang = "fa";
  dict: Dict = fa;
  set(lang: Lang) {
    this.lang = lang;
    this.dict = lang === "fa" ? fa : en;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
    document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
      const k = el.dataset.i18nTitle as keyof Dict;
      if (this.dict[k]) el.title = this.dict[k];
    });
    document.querySelectorAll<HTMLInputElement>("[data-i18n-ph]").forEach((el) => {
      const k = el.dataset.i18nPh as keyof Dict;
      if (this.dict[k]) el.placeholder = this.dict[k];
    });
  }
  t(k: keyof Dict): string { return this.dict[k] ?? k; }
}
export const i18n = new I18n();
