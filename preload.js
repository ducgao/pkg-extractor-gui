const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),
  checkPkg: (file) => ipcRenderer.invoke('pkg:check', file),
  pickPkg: (title) => ipcRenderer.invoke('dialog:pkg', title),
  pickDir: (title, def) => ipcRenderer.invoke('dialog:dir', title, def),
  freeSpace: (dir) => ipcRenderer.invoke('fs:free', dir),
  openPath: (p) => ipcRenderer.invoke('shell:open', p),
  start: (payload) => ipcRenderer.invoke('job:start', payload),
  cancel: () => ipcRenderer.invoke('job:cancel'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onEvent: (cb) => ipcRenderer.on('job-event', (_e, ev) => cb(ev)),
});
