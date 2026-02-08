const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  pickRepository: () => ipcRenderer.invoke('repo:pick'),
  getRepositoryDiff: (repoPath, baseRef, headRef) => ipcRenderer.invoke('repo:diff', repoPath, baseRef, headRef),
  getInitialRepository: () => ipcRenderer.invoke('repo:initial'),
  getThemePreference: () => ipcRenderer.invoke('prefs:get-theme'),
  setThemePreference: theme => ipcRenderer.invoke('prefs:set-theme', theme),
  logEvent: (level, message, meta) => ipcRenderer.invoke('app:log', level, message, meta),
});
