const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage } = require('electron');
const { execFile } = require('node:child_process');
function parseLaunchArgs(argv) {
  const parsed = {
    repoPath: null,
    baseRef: null,
    headRef: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--repo' && i + 1 < argv.length) {
      parsed.repoPath = argv[++i] || null;
    } else if (arg === '--base' && i + 1 < argv.length) {
      parsed.baseRef = argv[++i] || null;
    } else if (arg === '--head' && i + 1 < argv.length) {
      parsed.headRef = argv[++i] || null;
    }
  }
  return parsed;
}

const launchFromArgs = parseLaunchArgs(process.argv);
const fallbackInitialLaunch = {
  repoPath: launchFromArgs.repoPath || process.env.DIFFY_REPO_PATH || null,
  baseRef: launchFromArgs.baseRef || process.env.DIFFY_BASE_REF || null,
  headRef: launchFromArgs.headRef || process.env.DIFFY_HEAD_REF || null,
};
const initialLogPath = path.join(process.cwd(), 'diffy-desktop.log');
const initialLaunch = fallbackInitialLaunch;

let logPath = initialLogPath;

// Set app identity as early as possible for macOS menu/dock labeling.
app.setName('Diffy');

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
  // Keep startup background stable; renderer applies the exact themed surface.
  return '#1a1b26';
}

function createAppIcon() {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0%" stop-color="#7aa2f7"/><stop offset="100%" stop-color="#bb9af7"/>',
    '</linearGradient></defs>',
    '<rect x="20" y="20" width="216" height="216" rx="52" fill="#1f2029"/>',
    '<rect x="20" y="20" width="216" height="216" rx="52" fill="none" stroke="url(#g)" stroke-width="10"/>',
    '<path d="M74 90h108M74 128h80M74 166h52" stroke="#c0caf5" stroke-width="14" stroke-linecap="round"/>',
    '<circle cx="192" cy="166" r="18" fill="#9ece6a"/>',
    '</svg>',
  ].join('');
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

function installApplicationMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload Diff',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            if (win && !win.isDestroyed()) win.webContents.reloadIgnoringCache();
          },
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'front' },
      ],
    },
  ];

  if (process.env.NODE_ENV !== 'production') {
    template[3].submenu.splice(0, 0, { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(launchContext = fallbackInitialLaunch) {
  const appIcon = createAppIcon();
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: getWindowBackgroundColor(),
    icon: appIcon,
    autoHideMenuBar: process.platform !== 'darwin',
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

function runGitWithAllowedExitCodes(args, cwd, allowedExitCodes = []) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
      if (error) {
        const code = typeof error.code === 'number' ? error.code : null;
        if (code !== null && allowedExitCodes.includes(code)) {
          resolve(stdout);
          return;
        }
        const message = stderr?.trim() || error.message;
        reject(new Error(message));
        return;
      }
      resolve(stdout);
    });
  });
}

function runGitBuffer(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, encoding: 'buffer', maxBuffer: 1024 * 1024 * 40 }, (error, stdout, stderr) => {
      if (error) {
        const stderrText = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr || '');
        const message = stderrText.trim() || error.message;
        reject(new Error(message));
        return;
      }
      resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || '', 'utf8'));
    });
  });
}

async function resolveRepoRoot(repoPath) {
  await runGit(['rev-parse', '--is-inside-work-tree'], repoPath);
  return (await runGit(['rev-parse', '--show-toplevel'], repoPath)).trim();
}

function resolveRepoFilePath(repoRoot, relativePath) {
  const target = path.resolve(repoRoot, relativePath);
  const safeRoot = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;
  if (target !== repoRoot && !target.startsWith(safeRoot)) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }
  return target;
}

async function hasRef(repoRoot, ref, filePath) {
  if (!ref) return false;
  try {
    await runGit(['cat-file', '-e', `${ref}:${filePath}`], repoRoot);
    return true;
  } catch {
    return false;
  }
}

async function readTextFromRef(repoRoot, ref, filePath) {
  return runGit(['show', `${ref}:${filePath}`], repoRoot);
}

async function readBinaryFromRef(repoRoot, ref, filePath) {
  return runGitBuffer(['show', `${ref}:${filePath}`], repoRoot);
}

function readTextFromWorkingTree(repoRoot, filePath) {
  const abs = resolveRepoFilePath(repoRoot, filePath);
  return fs.readFileSync(abs, 'utf8');
}

function readBinaryFromWorkingTree(repoRoot, filePath) {
  const abs = resolveRepoFilePath(repoRoot, filePath);
  return fs.readFileSync(abs);
}

function inferImageMime(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.bmp') return 'image/bmp';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

async function buildUntrackedDiff(repoRoot) {
  const untrackedRaw = await runGit(['ls-files', '--others', '--exclude-standard', '-z'], repoRoot);
  const untrackedFiles = untrackedRaw.split('\0').filter(Boolean);
  if (untrackedFiles.length === 0) return '';

  const patches = [];
  for (const filePath of untrackedFiles) {
    const patch = await runGitWithAllowedExitCodes(
      ['diff', '--no-color', '--no-index', '--', '/dev/null', filePath],
      repoRoot,
      [1]
    );
    if (patch.trim()) patches.push(patch);
  }
  return patches.join('\n');
}

async function buildRepoDiff(repoPath, baseRef, headRef) {
  if (!repoPath) {
    throw new Error('Repository path is required.');
  }

  const repoRoot = await resolveRepoRoot(repoPath);

  if (baseRef && headRef) {
    return runGit(['diff', '--no-color', `${baseRef}...${headRef}`], repoRoot);
  }

  const hasHead = await runGit(['rev-parse', '--verify', 'HEAD'], repoRoot)
    .then(() => true)
    .catch(() => false);

  if (hasHead) {
    const tracked = await runGit(['diff', '--no-color', 'HEAD'], repoRoot);
    const untracked = await buildUntrackedDiff(repoRoot);
    return [tracked, untracked].filter(Boolean).join('\n');
  }

  const staged = await runGit(['diff', '--no-color', '--cached'], repoRoot);
  const unstaged = await runGit(['diff', '--no-color'], repoRoot);
  const untracked = await buildUntrackedDiff(repoRoot);
  return [staged, unstaged, untracked].filter(Boolean).join('\n');
}

async function buildFilePreview({
  repoPath,
  baseRef,
  headRef,
  oldPath,
  newPath,
  fileType,
  diffType,
}) {
  const repoRoot = await resolveRepoRoot(repoPath);
  const hasHead = await runGit(['rev-parse', '--verify', 'HEAD'], repoRoot)
    .then(() => true)
    .catch(() => false);

  const readText = async (side) => {
    const isLeft = side === 'left';
    const targetPath = isLeft ? oldPath : newPath;
    if (!targetPath) return null;
    if (isLeft && diffType === 'added') return null;
    if (!isLeft && diffType === 'deleted') return null;

    const ref = isLeft ? baseRef : headRef;
    if (ref && await hasRef(repoRoot, ref, targetPath)) {
      return readTextFromRef(repoRoot, ref, targetPath);
    }

    if (!isLeft) {
      try {
        return readTextFromWorkingTree(repoRoot, targetPath);
      } catch {
        // Fall through to HEAD fallback.
      }
    }

    if (hasHead && await hasRef(repoRoot, 'HEAD', targetPath)) {
      return readTextFromRef(repoRoot, 'HEAD', targetPath);
    }

    return null;
  };

  const readImage = async (side) => {
    const isLeft = side === 'left';
    const targetPath = isLeft ? oldPath : newPath;
    if (!targetPath) return null;
    if (isLeft && diffType === 'added') return null;
    if (!isLeft && diffType === 'deleted') return null;

    const ref = isLeft ? baseRef : headRef;
    let data = null;
    if (ref && await hasRef(repoRoot, ref, targetPath)) {
      data = await readBinaryFromRef(repoRoot, ref, targetPath);
    } else if (!isLeft) {
      try {
        data = readBinaryFromWorkingTree(repoRoot, targetPath);
      } catch {
        // Fall through to HEAD fallback.
      }
    }

    if (!data && hasHead && await hasRef(repoRoot, 'HEAD', targetPath)) {
      data = await readBinaryFromRef(repoRoot, 'HEAD', targetPath);
    }
    if (!data) return null;

    return {
      src: `data:${inferImageMime(targetPath)};base64,${data.toString('base64')}`,
      path: targetPath,
    };
  };

  if (fileType === 'markdown') {
    return {
      kind: 'markdown',
      left: await readText('left'),
      right: await readText('right'),
    };
  }

  if (fileType === 'image') {
    return {
      kind: 'image',
      left: await readImage('left'),
      right: await readImage('right'),
    };
  }

  throw new Error(`Unsupported preview file type: ${fileType}`);
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

ipcMain.handle('repo:preview-file', async (_event, request) => {
  return buildFilePreview(request || {});
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
  const appIcon = createAppIcon();
  app.setAboutPanelOptions({
    applicationName: 'Diffy',
  });
  if (process.platform === 'darwin' && app.dock && !appIcon.isEmpty()) {
    app.dock.setIcon(appIcon);
  }
  installApplicationMenu();
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
