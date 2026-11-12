// Keep download links pointing at the newest GitHub release, and highlight the visitor's OS.
(function () {
  const REPO = 'itssmfaisal/lanshare-ftp';

  const MATCHERS = {
    'win-setup': /win-setup\.exe$/i,
    'win-portable': /win-portable\.exe$/i,
    'mac-arm64': /mac-arm64\.dmg$/i,
    'mac-x64': /mac-x64\.dmg$/i,
    appimage: /\.AppImage$/i,
    deb: /\.deb$/i,
  };

  const fmtSize = (b) => (b >= 1048576 ? `${Math.round(b / 1048576)} MB` : `${Math.round(b / 1024)} KB`);

  function detectOS() {
    const ua = navigator.userAgent || '';
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/android|iphone|ipad|ipod/i.test(ua)) return null; // mobile: desktop app not applicable
    if (/win/i.test(platform) || /windows/i.test(ua)) return 'windows';
    if (/mac/i.test(platform) || /mac os x/i.test(ua)) return 'mac';
    if (/linux|x11/i.test(platform) || /linux/i.test(ua)) return 'linux';
    return null;
  }

  const os = detectOS();
  const PRIMARY = { windows: 'win-setup', mac: 'mac-arm64', linux: 'appimage' };
  const LABEL = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };

  function updateHero() {
    if (!os) return;
    const link = document.querySelector(`[data-asset="${PRIMARY[os]}"]`);
    const hero = document.getElementById('heroDownload');
    if (link && hero) {
      hero.href = link.href;
      document.getElementById('heroDownloadText').textContent = `Download for ${LABEL[os]}`;
    }
  }

  if (os) {
    const card = document.querySelector(`.dl[data-os="${os}"]`);
    if (card) card.classList.add('recommended');
  }

  // Intel Mac detection where supported (Chromium only); default is Apple Silicon.
  if (os === 'mac' && navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    navigator.userAgentData.getHighEntropyValues(['architecture']).then((v) => {
      if (v.architecture === 'x86') {
        PRIMARY.mac = 'mac-x64';
        updateHero();
      }
    }).catch(() => {});
  }

  updateHero();

  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((rel) => {
      for (const [key, re] of Object.entries(MATCHERS)) {
        const asset = (rel.assets || []).find((a) => re.test(a.name));
        if (!asset) continue;
        document.querySelectorAll(`[data-asset="${key}"]`).forEach((a) => (a.href = asset.browser_download_url));
        document.querySelectorAll(`[data-size="${key}"]`).forEach((s) => (s.textContent = `· ${fmtSize(asset.size)}`));
      }
      const v = rel.tag_name;
      const date = new Date(rel.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      document.getElementById('relInfo').textContent = `Latest release: ${v} · ${date}`;
      document.getElementById('versionPill').textContent = `${v} is out · Free & open source`;
      updateHero();
    })
    .catch(() => { /* keep the built-in v1.1.0 links */ });
})();
