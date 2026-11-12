const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const { FtpSrv, FileSystem, ftpErrors } = require('ftp-srv');

let win = null;
let server = null;
let startedAt = null;
const clients = new Map(); // id -> { id, ip, user, since }
const stats = { downloads: 0, uploads: 0, bytesOut: 0, bytesIn: 0 };

// ---------- settings ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const defaultSettings = () => ({
  root: fs.existsSync(path.join(os.homedir(), 'Public'))
    ? path.join(os.homedir(), 'Public')
    : os.homedir(),
  port: 2121,
  anonymous: true,
  username: 'user',
  password: '',
  readOnly: false,
  launchAtStartup: false,
  autoStartServer: false,
});
function loadSettings() {
  try {
    return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    return defaultSettings();
  }
}
function saveSettings(s) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}

// ---------- network helpers ----------
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address, netmask: a.netmask });
    }
  }
  return out;
}
const ipToInt = (ip) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
// Choose the local interface on the same subnet as the client (for PASV replies).
function pasvAddressFor(clientIp) {
  const ip = (clientIp || '').replace(/^::ffff:/, '');
  const addrs = lanAddresses();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    if (ip.startsWith('127.')) return '127.0.0.1';
    const c = ipToInt(ip);
    const match = addrs.find((a) => {
      const m = ipToInt(a.netmask);
      return (ipToInt(a.address) & m) === (c & m);
    });
    if (match) return match.address;
  }
  return addrs[0]?.address || '127.0.0.1';
}

// ---------- UI messaging ----------
function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
function log(type, message, extra = {}) {
  send('ftp:log', { type, message, time: Date.now(), ...extra });
}
function pushState() {
  send('ftp:state', getState());
  updateTray();
}
function getState() {
  return {
    running: !!server,
    startedAt,
    clients: [...clients.values()],
    stats,
    addresses: lanAddresses(),
  };
}

// ---------- file system with byte counting + optional read-only ----------
function makeFsClass(readOnly) {
  const deny = () => {
    throw new ftpErrors.FileSystemError('Server is read-only');
  };
  return class AppFS extends FileSystem {
    read(fileName, opts) {
      return super.read(fileName, opts).then((res) => {
        res.stream.on('data', (chunk) => (stats.bytesOut += chunk.length));
        return res;
      });
    }
    write(fileName, opts) {
      if (readOnly) deny();
      const res = super.write(fileName, opts);
      const origWrite = res.stream.write.bind(res.stream);
      res.stream.write = (chunk, ...rest) => {
        stats.bytesIn += chunk.length;
        return origWrite(chunk, ...rest);
      };
      return res;
    }
    delete(p) { if (readOnly) deny(); return super.delete(p); }
    mkdir(p) { if (readOnly) deny(); return super.mkdir(p); }
    rename(a, b) { if (readOnly) deny(); return super.rename(a, b); }
    chmod(p, m) { if (readOnly) deny(); return super.chmod(p, m); }
  };
}

function quietLogger() {
  try {
    const bunyan = require('bunyan');
    return bunyan.createLogger({ name: 'ftp', level: 'fatal' });
  } catch {
    return undefined;
  }
}

// ---------- server control ----------
async function startServer(settings) {
  if (server) return getState();
  const s = { ...loadSettings(), ...settings };
  if (!fs.existsSync(s.root) || !fs.statSync(s.root).isDirectory()) {
    throw new Error('Shared folder does not exist');
  }
  if (!s.anonymous && (!s.username || !s.password)) {
    throw new Error('Username and password are required when anonymous access is off');
  }
  saveSettings(s);

  const AppFS = makeFsClass(s.readOnly);
  const port = Number(s.port) || 2121;
  const srv = new FtpSrv({
    url: `ftp://0.0.0.0:${port}`,
    pasv_url: (clientIp) => pasvAddressFor(clientIp),
    pasv_min: 50000,
    pasv_max: 50100,
    anonymous: s.anonymous,
    greeting: ['Welcome to LanShare FTP'],
    log: quietLogger(),
  });

  srv.on('connect', ({ connection, id }) => {
    const ip = (connection.ip || '').replace(/^::ffff:/, '');
    clients.set(id, { id, ip, user: null, since: Date.now() });
    log('connect', `Client connected from ${ip}`);
    pushState();
  });

  srv.on('disconnect', ({ id }) => {
    const c = clients.get(id);
    clients.delete(id);
    if (c) log('disconnect', `${c.user ? c.user + '@' : ''}${c.ip} disconnected`);
    pushState();
  });

  srv.on('login', ({ connection, username, password }, resolve, reject) => {
    const ip = (connection.ip || '').replace(/^::ffff:/, '');
    const ok = s.anonymous
      ? true
      : username === s.username && password === s.password;
    if (!ok) {
      log('error', `Failed login for "${username}" from ${ip}`);
      return reject(new Error('Invalid username or password'));
    }
    const c = clients.get(connection.id);
    if (c) c.user = username || 'anonymous';
    log('login', `${username || 'anonymous'} logged in from ${ip}`);
    pushState();

    connection.on('RETR', (err, filePath) => {
      if (err) return log('error', `Download failed: ${err.message || err}`);
      stats.downloads++;
      log('download', `${ip} downloaded ${path.basename(filePath)}`, { file: filePath });
      pushState();
    });
    connection.on('STOR', (err, fileName) => {
      if (err) return log('error', `Upload failed: ${err.message || err}`);
      stats.uploads++;
      log('upload', `${ip} uploaded ${path.basename(fileName)}`, { file: fileName });
      pushState();
    });

    resolve({ fs: new AppFS(connection, { root: s.root, cwd: '/' }) });
  });

  srv.on('client-error', ({ error }) => {
    if (error && error.code !== 'ECONNRESET') log('error', `Client error: ${error.message || error}`);
  });

  await srv.listen();
  server = srv;
  startedAt = Date.now();
  log('server', `Server started on port ${port} sharing ${s.root}`);
  pushState();
  return getState();
}

async function stopServer() {
  if (!server) return getState();
  const srv = server;
  server = null;
  startedAt = null;
  try {
    await srv.close();
  } catch { /* ignore */ }
  clients.clear();
  log('server', 'Server stopped');
  pushState();
  return getState();
}

// ---------- IPC ----------
ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:save', (_e, s) => {
  const prev = loadSettings();
  const next = { ...prev, ...s };
  if (next.launchAtStartup !== prev.launchAtStartup) {
    try {
      applyLoginItem(next.launchAtStartup);
    } catch (err) {
      log('error', `Could not update startup setting: ${err.message}`);
      next.launchAtStartup = prev.launchAtStartup;
    }
  }
  saveSettings(next);
  return next;
});
ipcMain.handle('state:get', () => getState());
ipcMain.handle('server:start', async (_e, s) => {
  try {
    return { ok: true, state: await startServer(s) };
  } catch (err) {
    const msg = err.code === 'EADDRINUSE' ? `Port ${s.port} is already in use`
      : err.code === 'EACCES' ? `Permission denied for port ${s.port} (use a port above 1024)`
      : err.message;
    log('error', msg);
    return { ok: false, error: msg };
  }
});
ipcMain.handle('server:stop', () => stopServer());
ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('folder:open', (_e, p) => shell.openPath(p));
ipcMain.handle('clipboard:write', (_e, t) => clipboard.writeText(t));
ipcMain.handle('qr:make', (_e, text) =>
  QRCode.toDataURL(text, { margin: 1, width: 240, color: { dark: '#0b1020', light: '#ffffff' } })
);

// ---------- launch at system startup ----------
const HIDDEN_FLAG = '--hidden';
const autostartFile = () => path.join(os.homedir(), '.config', 'autostart', 'lanshare-ftp.desktop');

// Command that relaunches this exact build (AppImage, installed package, or dev checkout).
function launchCommand() {
  if (process.env.APPIMAGE) return [process.env.APPIMAGE];
  if (app.isPackaged) return [process.execPath];
  return [process.execPath, app.getAppPath(), '--no-sandbox'];
}

function applyLoginItem(enabled) {
  if (process.platform === 'linux') {
    const file = autostartFile();
    if (!enabled) return fs.rmSync(file, { force: true });
    // Desktop Entry Exec quoting: wrap in double quotes, escape " ` $ \
    const q = (a) => (/[\s"'`$\\]/.test(a) ? `"${a.replace(/(["`$\\])/g, '\\$1')}"` : a);
    const exec = [...launchCommand(), HIDDEN_FLAG].map(q).join(' ');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, [
      '[Desktop Entry]',
      'Type=Application',
      'Name=LanShare FTP',
      'Comment=Share files across your local network',
      `Exec=${exec}`,
      `Icon=${path.join(__dirname, 'renderer', 'icon.png')}`,
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      '',
    ].join('\n'));
  } else {
    const [exe, ...args] = launchCommand();
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true, // macOS
      path: exe, // Windows
      args: [...args, HIDDEN_FLAG], // Windows
    });
  }
}

function launchedAtLogin() {
  if (process.argv.includes(HIDDEN_FLAG)) return true;
  if (process.platform === 'darwin') {
    const s = app.getLoginItemSettings();
    return !!(s.wasOpenedAtLogin || s.wasOpenedAsHidden);
  }
  return false;
}

// ---------- tray ----------
let tray = null;
let quitting = false;

function showWindow() {
  if (!win || win.isDestroyed()) createWindow(true);
  else { win.show(); win.focus(); }
}

function createTray() {
  try {
    const icon = nativeImage
      .createFromPath(path.join(__dirname, 'renderer', 'icon.png'))
      .resize({ width: process.platform === 'darwin' ? 18 : 22 });
    tray = new Tray(icon);
    tray.setToolTip('LanShare FTP');
    tray.on('click', showWindow);
    updateTray();
  } catch {
    tray = null;
  }
}

function updateTray() {
  if (!tray) return;
  const running = !!server;
  const addr = lanAddresses()[0]?.address;
  const port = loadSettings().port;
  tray.setToolTip(running ? `LanShare FTP — running on ftp://${addr || 'localhost'}:${port}` : 'LanShare FTP — stopped');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: running ? `● Running — ftp://${addr || 'localhost'}:${port}` : '○ Server stopped', enabled: false },
    { type: 'separator' },
    { label: 'Open LanShare FTP', click: showWindow },
    running
      ? { label: 'Stop server', click: () => stopServer() }
      : { label: 'Start server', click: () => startServer({}).catch((e) => log('error', e.message)) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}

// ---------- window ----------
function createWindow(show = true) {
  win = new BrowserWindow({
    show: false,
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 660,
    backgroundColor: '#0b1020',
    title: 'LanShare FTP',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (show) win.once('ready-to-show', () => win.show());

  // While sharing, closing the window keeps the server running in the tray.
  win.on('close', (e) => {
    if (!quitting && server && tray) {
      e.preventDefault();
      win.hide();
    }
  });
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(async () => {
    const s = loadSettings();
    // Refresh the startup entry in case the app was moved or updated.
    if (s.launchAtStartup) {
      try { applyLoginItem(true); } catch { /* ignore */ }
    }
    createTray();

    const atLogin = launchedAtLogin();
    // Launched at login: stay in the tray if we're going to share; otherwise show the window.
    const startHidden = atLogin && s.autoStartServer && !!tray;
    createWindow(!startHidden);

    if (s.autoStartServer) {
      win.webContents.once('did-finish-load', () => {
        startServer({}).catch((err) => log('error', `Auto-start failed: ${err.message}`));
      });
    }
  });
}

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', async () => {
  await stopServer();
  app.quit();
});
app.on('activate', showWindow);
