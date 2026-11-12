const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  getState: () => ipcRenderer.invoke('state:get'),
  start: (s) => ipcRenderer.invoke('server:start', s),
  stop: () => ipcRenderer.invoke('server:stop'),
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  openFolder: (p) => ipcRenderer.invoke('folder:open', p),
  copy: (t) => ipcRenderer.invoke('clipboard:write', t),
  qr: (t) => ipcRenderer.invoke('qr:make', t),
  onState: (cb) => ipcRenderer.on('ftp:state', (_e, s) => cb(s)),
  onLog: (cb) => ipcRenderer.on('ftp:log', (_e, l) => cb(l)),
});
