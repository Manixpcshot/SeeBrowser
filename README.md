<div align="center">
  <img src="website/assets/logo.png" width="130" alt="SeeBrowser logo" />
  <h1>SeeBrowser</h1>
  <p><b>مرورگر وب اوپن‌سورس، سریع و کاملاً قابل شخصی‌سازی — ساخته‌شده با Rust</b></p>
  <p>A fast, fully-customizable, open-source web browser built with <b>Rust</b> — pluggable <b>Servo</b> / Chromium rendering engines, dark mode everywhere, Google &amp; Brave search.</p>
  <p>
    <a href="https://github.com/Manixpcshot/SeeBrowser/releases"><img alt="Release" src="https://img.shields.io/github/v/release/Manixpcshot/SeeBrowser?display_name=tag&style=flat-square"></a>
    <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-2dd4bf?style=flat-square">
    <img alt="Rust" src="https://img.shields.io/badge/Rust-%F0%9F%A6%80-orange?style=flat-square">
    <img alt="Platforms" src="https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-8b5cf6?style=flat-square">
  </p>
  <p>
    <a href="https://github.com/Manixpcshot/SeeBrowser/releases">⬇️ <b>دانلود نسخهٔ آماده (exe / dmg / AppImage)</b></a> ·
    <a href="https://manixpcshot.github.io/SeeBrowser/">🌐 وب‌سایت</a> ·
    <a href="#-بیلد-از-روی-سورس‌کد">🛠️ بیلد از سورس</a> ·
    <a href="docs/SERVO.md">🦀 موتور Servo</a>
  </p>
</div>

---

## ✨ امکانات

- 🗂️ **تب‌های واقعی مثل کروم** — هر تب یک وب‌ویو نیتیو؛ سنجاق، جابه‌جایی با Drag، بازگردانی تب بسته‌شده، تب خصوصی، تب‌های عمودی
- 🌙 **حالت تیره در همه‌جا** — پوستهٔ تیره/روشن/سیستمی + تیره‌کردن اجباری همهٔ وب‌سایت‌ها (Force Dark Mode)
- 🔎 **جستجو با Google و Brave** — قابل انتخاب بین Google، Brave Search، DuckDuckGo و Bing؛ با پیشنهاد از تاریخچه و نشانک‌ها
- 🧭 **همهٔ وب‌سایت‌ها و اسکریپت‌ها** — موتور Chromium (WebView2 در ویندوز) یعنی سازگاری کامل مثل کروم: HTML5، CSS3، JavaScript، WebGL، ویدیو و وب‌اپ‌ها
- 🦀 **موتور اوپن‌سورس Servo** — معماری موتور قابل‌تعویض؛ Servo از طریق `libservo` در سورس (feature آزمایشی، مستندات در [docs/SERVO.md](docs/SERVO.md))
- 🛡️ **مسدودکنندهٔ تبلیغات و ردیاب‌ها** + شمارندهٔ موارد مسدودشده
- ⭐ **نشانک‌ها، تاریخچه و دانلودها** با صفحهٔ مدیریت و جستجو؛ بازیابی نشست قبلی
- 🎨 **شخصی‌سازی عمیق** — رنگ اصلی دلخواه، تراکم رابط، موقعیت تب‌ها، صفحهٔ اصلی، زوم پیش‌فرض، User-Agent، و **تزریق CSS سفارشی** به همهٔ سایت‌ها
- 👁️ **رابط فارسی (RTL) و انگلیسی**
- ⌨️ **میانبرهای کامل** — `Ctrl+T/W/L/F/H/J/D`، زوم، یافتن در صفحه، DevTools با `F12`
- ⚡ **سبک** — هستهٔ Rust + Tauri؛ بدون Electron و مصرف رم سنگین

## ⬇️ دانلود

از صفحهٔ **[Releases](https://github.com/Manixpcshot/SeeBrowser/releases)**:

| سیستم‌عامل | فایل |
|---|---|
| 🪟 Windows 10/11 (64-bit) | `SeeBrowser_*_x64-setup.exe` (نصاب) یا `.msi` |
| 🍎 macOS (Intel + Apple Silicon) | `.dmg` |
| 🐧 Linux | `.AppImage` (همهٔ توزیع‌ها) یا `.deb` |

> همهٔ فایل‌ها خودکار با GitHub Actions از روی همین سورس ساخته می‌شوند.

## 🛠️ بیلد از روی سورس‌کد

پیش‌نیاز: [Rust](https://rustup.rs) (stable) و Node.js 20+ — در لینوکس همچنین `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`

```bash
git clone https://github.com/Manixpcshot/SeeBrowser.git
cd SeeBrowser
npm install

npm run tauri dev      # اجرای حالت توسعه
npm run tauri build    # ساخت فایل نصبی (exe/dmg/deb/AppImage)
```

راهنمای کامل: [docs/BUILD.md](docs/BUILD.md) — ساخت نسخهٔ Servo: [docs/SERVO.md](docs/SERVO.md)

## 🏗️ معماری

```
SeeBrowser
├─ src/                 # رابط کاربری مرورگر (TypeScript/CSS) — تب‌ها، نوار آدرس، تنظیمات…
│  ├─ bridge.ts         #  پل Rust: در اپ = فراخوانی نیتیو، در دمو وب = iframe
│  ├─ store.ts          #  تنظیمات/نشانک/تاریخچه/دانلود
│  └─ i18n.ts           #  فارسی (RTL) + انگلیسی
├─ src-tauri/           # هستهٔ Rust (Tauri 2)
│  └─ src/
│     ├─ commands.rs    #  ساخت/کنترل وب‌ویو هر تب، رویدادها، دانلود
│     ├─ engine/
│     │  ├─ webview.rs  #  موتور سیستمی: Chromium WebView2 / WKWebView / WebKitGTK
│     │  └─ servo.rs    #  موتور Servo از طریق libservo (feature = servo-engine)
│     ├─ tabs.rs        #  پشتهٔ عقب/جلو برای هر تب
│     └─ store.rs       #  ذخیرهٔ JSON در پوشهٔ دادهٔ برنامه
├─ website/             # وب‌سایت معرفی (GitHub Pages)
└─ .github/workflows/   # بیلد خودکار، انتشار و دیپلوی وب‌سایت
```

### موتور نمایش: چرا دو موتور؟

| موتور | وضعیت | توضیح |
|---|---|---|
| **Chromium / WebKit (WebView سیستم)** | ✅ پیش‌فرض نسخه‌های انتشار | در ویندوز همان هستهٔ کروم (WebView2) است؛ پس **همهٔ سایت‌ها** دقیقاً مثل Chrome/Brave کار می‌کنند و همیشه به‌روز است. |
| **Servo (libservo)** | 🧪 آزمایشی، در سورس | موتور اوپن‌سورس موازیِ نوشته‌شده با Rust ([servo.org](https://servo.org)). هنوز در حال بلوغ است و همهٔ سایت‌های واقعی را کامل رندر نمی‌کند؛ و بیلدش تولچین اختصاصی (`./mach`) می‌خواهد، پس به‌صورت feature اختیاری آمده تا مسیر مهاجرت کامل باز باشد. |

## 🗺️ نقشهٔ راه

- [ ] فعال‌سازی کامل رندر Servo در نسخهٔ جداگانه (وقتی libservo پکیج باینری پایدار بدهد)
- [ ] سینک نشانک/تنظیمات (فایل یا حساب اختیاری)
- [ ] پشتیبانی از افزونه‌ها (WebExtensions)
- [ ] به‌روزرسانی خودکار (Tauri Updater با امضای دیجیتال)
- [ ] حالت مطالعه (Reader Mode) و اسکرین‌شات صفحه

## 📄 مجوز

MIT — آزاد برای استفاده، تغییر و انتشار. ساخته‌شده با ❤️ و Rust.

---

<div align="center"><sub>SeeBrowser is not affiliated with Google Chrome, Brave, Mozilla or the Servo project. Servo® is a project of Linux Foundation Europe.</sub></div>
