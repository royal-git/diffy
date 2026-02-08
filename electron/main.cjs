const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { execFile } = require('node:child_process');
const fallbackInitialLaunch = {
  repoPath: process.env.DIFFY_REPO_PATH || null,
  baseRef: process.env.DIFFY_BASE_REF || null,
  headRef: process.env.DIFFY_HEAD_REF || null,
};
const initialLogPath = path.join(process.cwd(), 'diffy-desktop.log');
const initialLaunch = fallbackInitialLaunch;

let logPath = initialLogPath;

function log(level, message, meta) {
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      pid: process.pid,
      level,
      message,
      ...(meta ? { meta } : {}),
    });
    fs.appendFile(logPath, `${line}\n`, 'utf8', () => {});
  } catch {
    // Avoid crashing if logging itself fails.
  }
}

function getPrefsPath() {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function readPrefs() {
  try {
    const raw = fs.readFileSync(getPrefsPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writePrefs(next) {
  try {
    fs.mkdirSync(path.dirname(getPrefsPath()), { recursive: true });
    fs.writeFileSync(getPrefsPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (error) {
    log('error', 'Failed to write preferences', { error: String(error) });
  }
}

function getWindowBackgroundColor() {
  const theme = readPrefs().theme;
  if (theme === 'light' || theme === 'sand') return '#ffffff';
  return '#1a1b26';
}

function createWindow(launchContext = fallbackInitialLaunch) {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: getWindowBackgroundColor(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.on('did-start-loading', () => {
    log('info', 'Renderer start loading', { windowId: mainWindow.id });
  });
  mainWindow.webContents.on('did-finish-load', () => {
    log('info', 'Renderer finished loading', { windowId: mainWindow.id });
    if (!mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, desc, url, isMainFrame) => {
    log('error', 'Renderer failed loading', {
      windowId: mainWindow.id,
      code,
      desc,
      url,
      isMainFrame,
    });
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log('error', 'Renderer process gone', { windowId: mainWindow.id, details });
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (typeof message === 'string') {
      if (message.includes('Unable to preventDefault inside passive event listener invocation.')) return;
      if (message.includes('Electron Security Warning')) return;
    }
    log('renderer', 'Console message', { windowId: mainWindow.id, level, message, line, sourceId });
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr?.trim() || error.message;
        reject(new Error(message));
        return;
      }
      resolve(stdout);
    });
  });
}

async function buildRepoDiff(repoPath, baseRef, headRef) {
  if (!repoPath) {
    throw new Error('Repository path is required.');
  }

  await runGit(['rev-parse', '--is-inside-work-tree'], repoPath);
  const repoRoot = (await runGit(['rev-parse', '--show-toplevel'], repoPath)).trim();

  if (baseRef && headRef) {
    return runGit(['diff', '--no-color', `${baseRef}...${headRef}`], repoRoot);
  }

  const hasHead = await runGit(['rev-parse', '--verify', 'HEAD'], repoRoot)
    .then(() => true)
    .catch(() => false);

  if (hasHead) {
    return runGit(['diff', '--no-color', 'HEAD'], repoRoot);
  }

  const staged = await runGit(['diff', '--no-color', '--cached'], repoRoot);
  const unstaged = await runGit(['diff', '--no-color'], repoRoot);
  return [staged, unstaged].filter(Boolean).join('\n');
}

ipcMain.handle('repo:pick', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Git Repository',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('repo:diff', async (_event, repoPath, baseRef, headRef) => {
  return buildRepoDiff(repoPath, baseRef, headRef);
});

ipcMain.handle('repo:initial', async (event) => {
  if (!initialLaunch?.repoPath) return null;
  try {
    await runGit(['rev-parse', '--is-inside-work-tree'], initialLaunch.repoPath);
    const repoRoot = (await runGit(['rev-parse', '--show-toplevel'], initialLaunch.repoPath)).trim();
    return {
      repoPath: repoRoot || null,
      baseRef: initialLaunch.baseRef,
      headRef: initialLaunch.headRef,
    };
  } catch {
    return null;
  }
});

ipcMain.handle('prefs:get-theme', async () => {
  const prefs = readPrefs();
  return typeof prefs.theme === 'string' ? prefs.theme : null;
});

ipcMain.handle('prefs:set-theme', async (_event, theme) => {
  const prefs = readPrefs();
  writePrefs({ ...prefs, theme });
  log('info', 'Theme preference saved', { theme });
  return true;
});

ipcMain.handle('app:log', async (_event, level, message, meta) => {
  log(level || 'info', String(message || ''), meta || undefined);
  return true;
});

process.on('uncaughtException', error => {
  log('fatal', 'Uncaught exception in main process', { error: String(error), stack: error?.stack });
});

process.on('unhandledRejection', reason => {
  log('fatal', 'Unhandled rejection in main process', { reason: String(reason) });
});

app.whenReady().then(() => {
  logPath = path.join(app.getPath('userData'), 'diffy-desktop.log');
  log('info', 'App ready', {
    initialRepoPath: initialLaunch.repoPath,
    initialBaseRef: initialLaunch.baseRef,
    initialHeadRef: initialLaunch.headRef,
    logPath,
  });
  createWindow(initialLaunch);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  log('info', 'All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
