// SeeBrowser website: FA/EN toggle + live download links from GitHub Releases.
(function () {
  const REPO = "Manixpcshot/SeeBrowser";
  let lang = localStorage.getItem("see-lang") || "fa";

  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
    document.querySelectorAll("[data-fa]").forEach((el) => {
      el.textContent = el.dataset[lang];
    });
    document.getElementById("lang-btn").textContent = lang === "fa" ? "EN" : "فا";
    localStorage.setItem("see-lang", lang);
  }
  document.getElementById("lang-btn").addEventListener("click", () => {
    lang = lang === "fa" ? "en" : "fa";
    applyLang();
  });
  applyLang();

  // Point the download cards at the real assets of the latest GitHub release.
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((rel) => {
      const info = document.getElementById("rel-info");
      const ver = rel.tag_name || rel.name || "";
      if (info && ver) info.textContent += " " + ver;
      const find = (...keys) =>
        (rel.assets || []).find((a) => keys.some((k) => a.name.toLowerCase().includes(k)));
      const set = (id, asset) => {
        const el = document.getElementById(id);
        if (el && asset) el.href = asset.browser_download_url;
      };
      const win = find("setup.exe", ".exe");
      set("dl-win", win);
      const hero = document.getElementById("dl-hero");
      if (hero && win) hero.href = win.browser_download_url;
      set("dl-mac", find(".dmg"));
      set("dl-linux", find(".appimage", ".deb"));
    })
    .catch(() => { /* keep the fallback links to the releases page */ });
})();
