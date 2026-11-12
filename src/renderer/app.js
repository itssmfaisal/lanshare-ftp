const $ = (id) => document.getElementById(id);

const ICONS = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  device: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  server: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/></svg>',
  connect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  login: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  disconnect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M6 10l6 6 6-6M5 20h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V8M6 14l6-6 6 6M5 4h14"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>',
  emptyDevices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/></svg>',
  emptyLog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
};

let settings = {};
let state = { running: false, clients: [], stats: {}, addresses: [] };
let selectedAddr = null;
let uptimeTimer = null;
let busy = false;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtBytes(n = 0) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i ? 1 : 0)} ${u[i]}`;
}
const pad = (n) => String(n).padStart(2, '0');
function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function ago(t) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

let toastTimer;
function toast(msg, err = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast' + (err ? ' err' : '')), 2600);
}

// ---------- settings form ----------
function readForm() {
  return {
    root: settings.root,
    port: Number($('port').value) || 2121,
    anonymous: $('anonymous').checked,
    username: $('username').value.trim(),
    password: $('password').value,
    readOnly: $('readOnly').checked,
    launchAtStartup: $('launchAtStartup').checked,
    autoStartServer: $('autoStartServer').checked,
    updateNotifications: $('updateNotifications').checked,
    closeBehavior: $('closeBehavior').value,
  };
}
function fillForm() {
  $('folderPath').textContent = '\u200E' + settings.root + '\u200E';
  $('folderPath').title = settings.root;
  $('port').value = settings.port;
  $('anonymous').checked = settings.anonymous;
  $('username').value = settings.username;
  $('password').value = settings.password;
  $('readOnly').checked = settings.readOnly;
  $('launchAtStartup').checked = settings.launchAtStartup;
  $('autoStartServer').checked = settings.autoStartServer;
  $('updateNotifications').checked = settings.updateNotifications !== false;
  $('closeBehavior').value = settings.closeBehavior || 'ask';
  updateCredVisibility();
}
function updateCredVisibility() {
  $('credBox').classList.toggle('hidden-cred', $('anonymous').checked);
}
async function persist() {
  settings = await window.api.saveSettings(readForm());
  renderAddresses();
}

// ---------- rendering ----------
function urlFor(ip) {
  const s = readForm();
  const user = s.anonymous ? '' : `${encodeURIComponent(s.username)}@`;
  return `ftp://${user}${ip}:${s.port}`;
}

async function renderAddresses() {
  const list = $('addrList');
  const addrs = state.addresses || [];
  if (!addrs.length) {
    list.innerHTML = '<div class="addr disabled"><code>No network connection</code></div>';
    setQR(null);
    return;
  }
  if (!selectedAddr || !addrs.some((a) => a.address === selectedAddr)) selectedAddr = addrs[0].address;

  list.innerHTML = addrs
    .map((a) => `
      <div class="addr ${state.running ? '' : 'disabled'} ${a.address === selectedAddr && state.running ? 'active' : ''}" data-ip="${esc(a.address)}">
        <div style="flex:1;min-width:0">
          <code>${esc(urlFor(a.address))}</code>
          <div class="iface">${esc(a.name)}</div>
        </div>
        <button class="copy" title="Copy address">${ICONS.copy}</button>
      </div>`)
    .join('');

  list.querySelectorAll('.addr').forEach((el) => {
    const ip = el.dataset.ip;
    el.addEventListener('click', () => { selectedAddr = ip; renderAddresses(); });
    el.querySelector('.copy').addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.api.copy(urlFor(ip));
      toast('Address copied to clipboard');
    });
  });

  setQR(state.running ? urlFor(selectedAddr) : null);
}

let lastQR = null;
async function setQR(text) {
  if (text === lastQR) return;
  lastQR = text;
  const box = $('qrBox');
  if (!text) { box.classList.remove('ready'); return; }
  $('qrImg').src = await window.api.qr(text);
  box.classList.add('ready');
}

function renderStatus() {
  const on = state.running;
  $('powerBtn').classList.toggle('on', on);
  $('statusPill').className = 'status-pill ' + (on ? 'on' : 'off');
  $('statusText').textContent = on ? 'Online' : 'Offline';
  $('heroTitle').textContent = on ? 'Server is running' : 'Server is offline';
  $('heroSub').textContent = on
    ? `Sharing “${settings.root.split(/[\\/]/).pop() || settings.root}” ${settings.readOnly ? '(read-only)' : 'with read & write access'}`
    : 'Press the button to start sharing your folder.';
  $('settingsCard').classList.toggle('locked', on);
  $('lockBadge').classList.toggle('hidden', !on);
  $('uptime').classList.toggle('hidden', !on);

  clearInterval(uptimeTimer);
  if (on && state.startedAt) {
    const tick = () => ($('uptimeVal').textContent = fmtDuration(Date.now() - state.startedAt));
    tick();
    uptimeTimer = setInterval(tick, 1000);
  }
}

function renderStats() {
  const s = state.stats || {};
  $('stClients').textContent = state.clients.length;
  $('stDown').textContent = s.downloads || 0;
  $('stUp').textContent = s.uploads || 0;
  $('stOut').textContent = fmtBytes(s.bytesOut);
  $('stIn').textContent = fmtBytes(s.bytesIn);
}

function renderClients() {
  const list = $('clientList');
  $('clientCount').textContent = state.clients.length;
  if (!state.clients.length) {
    list.innerHTML = `<div class="empty">${ICONS.emptyDevices}<div>${state.running ? 'Waiting for devices to connect…' : 'Start the server to accept connections'}</div></div>`;
    return;
  }
  list.innerHTML = state.clients
    .map((c) => `
      <div class="client">
        <div class="avatar">${ICONS.device}</div>
        <div style="min-width:0">
          <div class="ip">${esc(c.ip)}</div>
          <div class="meta">${esc(c.user || 'authenticating…')} · connected ${ago(c.since)}</div>
        </div>
      </div>`)
    .join('');
}

function render() {
  renderStatus();
  renderStats();
  renderClients();
  renderAddresses();
}

// ---------- activity log ----------
const MAX_LOGS = 300;
function addLog(l) {
  const list = $('logList');
  list.querySelector('.empty')?.remove();
  const el = document.createElement('div');
  el.className = `log ${l.type}`;
  el.innerHTML = `<div class="ic">${ICONS[l.type] || ICONS.connect}</div><div class="msg">${esc(l.message)}</div><div class="time">${fmtTime(l.time)}</div>`;
  list.prepend(el);
  while (list.children.length > MAX_LOGS) list.lastChild.remove();
}
function clearLog() {
  $('logList').innerHTML = `<div class="empty">${ICONS.emptyLog}<div>No activity yet</div></div>`;
}

// ---------- actions ----------
async function togglePower() {
  if (busy) return;
  busy = true;
  $('powerBtn').classList.add('busy');
  try {
    if (state.running) {
      state = await window.api.stop();
    } else {
      const res = await window.api.start(readForm());
      if (!res.ok) toast(res.error, true);
      else { state = res.state; settings = await window.api.getSettings(); toast('Server started'); }
    }
  } finally {
    busy = false;
    $('powerBtn').classList.remove('busy');
    render();
  }
}

// ---------- updates ----------
let currentUpdate = null;
let laterVersion = null; // "Remind me later" hides the card for this session

function fmtUpdateSub(u, current) {
  const size = u.size ? ` · ${fmtBytes(u.size)}` : '';
  return `Version ${u.version} is ready to download. You have ${current}.${size}`;
}

function showUpdate(info, { force = false } = {}) {
  const u = info && info.update;
  currentUpdate = u;
  if (info && info.current) $('appVersion').textContent = info.current;
  if (!u) {
    $('updateChip').classList.add('hidden');
    $('updateCard').classList.remove('show');
    return;
  }
  $('updateChipText').textContent = `Update v${u.version}`;
  $('updateChip').classList.remove('hidden');
  $('updTitle').textContent = `LanShare FTP ${u.version} is available`;
  $('updSub').textContent = fmtUpdateSub(u, info.current);
  if (force || laterVersion !== u.version) $('updateCard').classList.add('show');
}

async function manualUpdateCheck() {
  const btn = $('checkUpdatesBtn');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const r = await window.api.checkUpdates(true);
    if (!r.ok) toast("Couldn't check for updates. Are you online?", true);
    else if (!r.update) toast(`You're up to date (v${r.current})`);
    else showUpdate(r, { force: true });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check for updates';
  }
}

function initUpdates() {
  window.api.getUpdate().then((info) => showUpdate(info));
  window.api.onUpdate((info) => showUpdate(info));

  $('updateChip').addEventListener('click', () => $('updateCard').classList.add('show'));
  $('updLater').addEventListener('click', () => {
    laterVersion = currentUpdate && currentUpdate.version;
    $('updateCard').classList.remove('show');
  });
  $('updDownload').addEventListener('click', async () => {
    await window.api.downloadUpdate();
    toast('Download started in your browser. Install it to update.');
    laterVersion = currentUpdate && currentUpdate.version;
    $('updateCard').classList.remove('show');
  });
  $('updNotes').addEventListener('click', () => window.api.openReleaseNotes());
  $('updSkip').addEventListener('click', async () => {
    const v = currentUpdate && currentUpdate.version;
    await window.api.skipUpdate();
    showUpdate({ update: null });
    toast(`Skipped version ${v}`);
  });
  $('checkUpdatesBtn').addEventListener('click', manualUpdateCheck);
  $('updateNotifications').addEventListener('change', async () => {
    await persist();
    if (settings.updateNotifications) window.api.checkUpdates(false);
    else showUpdate({ update: null });
  });

  // Internet came back: check right away
  window.addEventListener('online', () => {
    if (settings.updateNotifications !== false) window.api.checkUpdates(false);
  });
}

// ---------- init ----------
async function init() {
  document.querySelector('.settings').id = 'settingsCard';
  settings = await window.api.getSettings();
  state = await window.api.getState();
  fillForm();
  clearLog();
  render();

  $('powerBtn').addEventListener('click', togglePower);
  $('browseBtn').addEventListener('click', async () => {
    const p = await window.api.pickFolder();
    if (p) { settings.root = p; $('folderPath').textContent = '\u200E' + p + '\u200E'; $('folderPath').title = p; persist(); }
  });
  $('openBtn').addEventListener('click', () => window.api.openFolder(settings.root));
  $('anonymous').addEventListener('change', () => { updateCredVisibility(); persist(); });
  $('readOnly').addEventListener('change', persist);
  $('launchAtStartup').addEventListener('change', async () => {
    const want = $('launchAtStartup').checked;
    await persist();
    $('launchAtStartup').checked = settings.launchAtStartup;
    if (settings.launchAtStartup === want) toast(want ? 'LanShare FTP will launch at startup' : 'Removed from startup');
    else toast('Could not change the startup setting', true);
  });
  $('autoStartServer').addEventListener('change', async () => {
    await persist();
    toast(settings.autoStartServer ? 'Server will start automatically' : 'Auto-start turned off');
  });
  ['port', 'username', 'password'].forEach((id) => $(id).addEventListener('change', persist));
  $('port').addEventListener('input', renderAddresses);
  $('eyeBtn').addEventListener('click', () => {
    const i = $('password');
    i.type = i.type === 'password' ? 'text' : 'password';
  });
  $('clearLog').addEventListener('click', clearLog);
  initUpdates();
  $('closeBehavior').addEventListener('change', async () => {
    await persist();
    const msg = { ask: "I'll ask what to do when you close the window", background: 'The server keeps running in the background when you close the window', quit: 'Closing the window stops the server' };
    toast(msg[settings.closeBehavior]);
  });
  // e.g. "Remember my choice" in the close dialog
  window.api.onSettings((s) => { settings = s; $('closeBehavior').value = s.closeBehavior || 'ask'; });

  window.api.onState(async (s) => {
    const changed = s.running !== state.running;
    state = s;
    if (changed) { settings = await window.api.getSettings(); render(); } // e.g. started from tray / auto-start
    else { renderStats(); renderClients(); }
  });
  window.api.onLog(addLog);

  // refresh "connected x min ago" and network interfaces periodically
  setInterval(async () => {
    state = await window.api.getState();
    renderClients();
    renderAddresses();
  }, 15000);
}

init();
