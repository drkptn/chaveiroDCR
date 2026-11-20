/**
 * Processo principal do Além-Mar (Electron).
 *
 * Por que Electron: WebRTC idêntico ao Chrome, captura de tela/janela com
 * seletor próprio, áudio do sistema no Windows (loopback), aceleração de
 * vídeo por hardware e integração com o SO (bandeja, atalhos globais,
 * notificações, início automático e atualizações).
 */
import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  nativeImage,
  net,
  powerMonitor,
  protocol,
  safeStorage,
  session,
  shell,
  screen,
} from 'electron';
import { isPinned } from './pinning';
import { currentPins, hostAvailable, hostStatus, loadPins, onHostStatus, setBadges, startHost, stopHost, trustServer } from './host';

declare const __VL_PINS__: Record<string, string> | undefined;
const PINS: Record<string, string> = typeof __VL_PINS__ === 'undefined' ? {} : __VL_PINS__;
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KNOWN_GAMES } from './games';

const isDev = process.argv.includes('--dev');
const startHidden = process.argv.includes('--hidden');
const APP_ORIGIN = 'app://vinlancord';
const RENDERER_DIR = resolve(__dirname, '..', 'renderer');
const ASSETS_DIR = resolve(__dirname, '..', 'build');

app.setAppUserModelId('com.vinlancord.app');
// O app virou "Além-Mar", mas a pasta de dados continua a de antes ("Vinlancord"): contas salvas,
// servidores confiáveis e o banco do modo anfitrião continuam onde estavam depois da atualização.
// VINLANCORD_USER_DATA: pasta alternativa (modo portátil / testes automatizados).
app.setPath('userData', process.env.VINLANCORD_USER_DATA ? resolve(process.env.VINLANCORD_USER_DATA) : join(app.getPath('appData'), 'Vinlancord'));
app.setName('Além-Mar');

/* ───────────── configurações locais do desktop ───────────── */

interface DesktopSettings {
  openAtLogin: boolean;
  minimizeToTray: boolean;
  hardwareAcceleration: boolean;
}
const settingsFile = () => join(app.getPath('userData'), 'desktop-settings.json');
function readSettings(): DesktopSettings {
  const defaults: DesktopSettings = { openAtLogin: false, minimizeToTray: true, hardwareAcceleration: true };
  try {
    return { ...defaults, ...JSON.parse(readFileSync(settingsFile(), 'utf8')) };
  } catch {
    return defaults;
  }
}
function writeSettings(s: DesktopSettings) {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}
let settings = readSettings();
if (!settings.hardwareAcceleration) app.disableHardwareAcceleration();

// Captura de tela via PipeWire no Linux/Wayland (preparação para suporte futuro)
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
// Windows: captura de tela pelo Windows.Graphics.Capture (funciona em notebooks com duas placas de vídeo,
// onde a captura DXGI falha com "Could not start video source")
if (process.platform === 'win32') app.commandLine.appendSwitch('enable-features', 'AllowWgcScreenCapturer,AllowWgcWindowCapturer');

/* ───────────── instância única e links vinlancord:// ───────────── */

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient('vinlancord', process.execPath, [resolve(process.argv[1]!)]);
else app.setAsDefaultProtocolClient('vinlancord');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

let win: BrowserWindow | null = null;
let splash: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let pendingDeepLink: string | null = null;

function handleDeepLink(url: string) {
  if (!url.startsWith('vinlancord://')) return;
  if (win && !win.webContents.isLoading()) win.webContents.send('deep-link', url);
  else pendingDeepLink = url;
  showWindow();
}

app.on('second-instance', (_e, argv) => {
  const link = argv.find((a) => a.startsWith('vinlancord://'));
  if (link) handleDeepLink(link);
  showWindow();
});
app.on('open-url', (e, url) => {
  e.preventDefault();
  handleDeepLink(url);
});

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/* ───────────── janelas ───────────── */

const stateFile = () => join(app.getPath('userData'), 'window-state.json');
function loadBounds() {
  try {
    const b = JSON.parse(readFileSync(stateFile(), 'utf8')) as { x: number; y: number; width: number; height: number; maximized: boolean };
    const visible = screen.getAllDisplays().some((d) => b.x >= d.bounds.x - 50 && b.y >= d.bounds.y - 50 && b.x < d.bounds.x + d.bounds.width && b.y < d.bounds.y + d.bounds.height);
    return visible ? b : null;
  } catch {
    return null;
  }
}

function createSplash() {
  splash = new BrowserWindow({
    width: 340,
    height: 380,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  splash.loadFile(join(ASSETS_DIR, 'splash.html'));
  splash.once('ready-to-show', () => splash?.show());
}

function createWindow() {
  const bounds = loadBounds();
  win = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 800,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 940,
    minHeight: 560,
    show: false,
    frame: process.platform === 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    backgroundColor: '#02060f',
    icon: join(ASSETS_DIR, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    title: 'Além-Mar',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      additionalArguments: [`--vl-version=${app.getVersion()}`],
    },
  });
  if (bounds?.maximized) win.maximize();

  win.loadURL(isDev && process.env.VINLANCORD_DEV_URL ? process.env.VINLANCORD_DEV_URL : `${APP_ORIGIN}/index.html`);

  const started = Date.now();
  win.once('ready-to-show', () => {
    const wait = Math.max(0, 1200 - (Date.now() - started));
    setTimeout(() => {
      if (!startHidden) win?.show();
      splash?.destroy();
      splash = null;
      if (pendingDeepLink) {
        win?.webContents.send('deep-link', pendingDeepLink);
        pendingDeepLink = null;
      }
    }, wait);
  });

  // segurança: nada de navegar para fora do app; links externos abrem no navegador
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_ORIGIN) && !(isDev && process.env.VINLANCORD_DEV_URL && url.startsWith(process.env.VINLANCORD_DEV_URL))) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('maximize', () => win?.webContents.send('maximize-change', true));
  win.on('unmaximize', () => win?.webContents.send('maximize-change', false));
  win.on('close', (e) => {
    if (win) {
      const b = win.getNormalBounds();
      try {
        writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
      } catch {
        /* ignora */
      }
    }
    if (!quitting && settings.minimizeToTray) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.on('closed', () => {
    win = null;
  });
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
}

/* ───────────── protocolo app:// (arquivos do renderer) ───────────── */

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  'img-src * data: blob:',
  'media-src * blob:',
  "font-src 'self' data:",
  'connect-src *',
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

function registerAppProtocol() {
  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = normalize(join(RENDERER_DIR, rel));
    if (!file.startsWith(RENDERER_DIR + sep) || !existsSync(file)) return new Response('Não encontrado', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    if (file.endsWith('.html')) headers.set('Content-Security-Policy', CSP);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(res.body, { status: res.status, headers });
  });
}

/* ───────────── mídia: permissões e compartilhamento de tela ───────────── */

let screenSelection: { id: string; audio: boolean } | null = null;

function setupMedia() {
  const allowed = new Set(['media', 'display-capture', 'notifications', 'fullscreen', 'clipboard-sanitized-write', 'speaker-selection']);
  const fromApp = (origin: string) => origin.startsWith(APP_ORIGIN) || (isDev && !!process.env.VINLANCORD_DEV_URL && origin.startsWith(process.env.VINLANCORD_DEV_URL));
  // servidor só com IP e certificado próprio: confia apenas no certificado fixado no build
  // (+ servidores de amigos que você aceitou pelo link de convite, e o seu próprio no modo anfitrião)
  loadPins(PINS);
  session.defaultSession.setCertificateVerifyProc((req, cb) => cb(req.errorCode !== 0 && isPinned(req.hostname, req.certificate.data, currentPins()) ? 0 : -3));
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(allowed.has(permission) && fromApp(wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => allowed.has(permission) && fromApp(origin));

  // O renderer escolhe a fonte no seletor próprio do Além-Mar e então chama getDisplayMedia.
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
        const sel = screenSelection;
        screenSelection = null;
        const source = sources.find((s) => s.id === sel?.id) ?? sources.find((s) => s.id.startsWith('screen:'));
        if (!source) return callback({});
        // áudio do sistema (loopback) é suportado pelo Chromium no Windows
        callback({ video: source, ...(sel?.audio && process.platform === 'win32' ? { audio: 'loopback' as const } : {}) });
      } catch {
        callback({});
      }
    },
    { useSystemPicker: false },
  );
}

/* ───────────── atividade (jogos) ───────────── */

function listProcesses(): Promise<string[]> {
  return new Promise((resolveList) => {
    if (process.platform === 'win32') {
      execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
        if (err) return resolveList([]);
        const names = out
          .split(/\r?\n/)
          .map((l) => /^"([^"]+)"/.exec(l)?.[1])
          .filter((n): n is string => !!n);
        resolveList([...new Set(names)]);
      });
    } else {
      execFile('ps', ['-A', '-o', 'comm='], { maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
        if (err) return resolveList([]);
        resolveList([...new Set(out.split('\n').map((l) => l.trim().split('/').pop()!).filter(Boolean))]);
      });
    }
  });
}

/* ───────────── bandeja ───────────── */

function createTray() {
  const icon = nativeImage.createFromPath(join(ASSETS_DIR, process.platform === 'win32' ? 'icon.ico' : 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Além-Mar');
  const send = (action: string) => win?.webContents.send('shortcut', action);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir o Além-Mar', click: showWindow },
      { type: 'separator' },
      { label: 'Silenciar/ativar microfone', click: () => send('toggleMute') },
      { label: 'Desativar/ativar áudio', click: () => send('toggleDeafen') },
      { type: 'separator' },
      {
        label: 'Sair',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', showWindow);
}

/* ───────────── atualizações ───────────── */

type UpdateState = { state: string; version?: string; progress?: number; message?: string };
let updateState: UpdateState = { state: 'idle' };
let autoUpdater: typeof import('electron-updater').autoUpdater | null = null;

function emitUpdate(s: UpdateState) {
  updateState = s;
  win?.webContents.send('update-status', s);
}

async function setupUpdates() {
  // só em builds instaladas e com feed configurado (app-update.yml gerado pelo electron-builder)
  const feed = join(process.resourcesPath, 'app-update.yml');
  if (!app.isPackaged || !existsSync(feed)) {
    updateState = { state: 'disabled' };
    return;
  }
  try {
    autoUpdater = (await import('electron-updater')).autoUpdater;
  } catch {
    updateState = { state: 'disabled' };
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => emitUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => emitUpdate({ state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', () => emitUpdate({ state: 'none' }));
  autoUpdater.on('download-progress', (p) => emitUpdate({ state: 'downloading', progress: p.percent / 100, version: updateState.version }));
  autoUpdater.on('update-downloaded', (i) => {
    emitUpdate({ state: 'ready', version: i.version });
    if (Notification.isSupported()) new Notification({ title: 'Atualização pronta', body: `O Além-Mar ${i.version} será instalado ao reiniciar.` }).show();
  });
  autoUpdater.on('error', (e) => emitUpdate({ state: 'error', message: e.message }));
  setTimeout(() => void autoUpdater?.checkForUpdates().catch(() => {}), 10_000);
  setInterval(() => void autoUpdater?.checkForUpdates().catch(() => {}), 6 * 3600_000);
}

/* ───────────── IPC (API exposta pelo preload) ───────────── */

function setupIpc() {
  ipcMain.on('window:minimize', () => win?.minimize());
  ipcMain.on('window:toggleMaximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.on('window:close', () => win?.close());
  ipcMain.on('window:focus', showWindow);
  ipcMain.handle('window:isMaximized', () => win?.isMaximized() ?? false);

  const secureFile = (key: string) => join(app.getPath('userData'), `secure-${key.replace(/[^a-z0-9_-]/gi, '_')}.bin`);
  ipcMain.handle('secure:get', (_e, key: string) => {
    try {
      const buf = readFileSync(secureFile(key));
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    } catch {
      return null;
    }
  });
  ipcMain.handle('secure:set', (_e, key: string, value: string) => {
    mkdirSync(app.getPath('userData'), { recursive: true });
    const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(String(value)) : Buffer.from(String(value));
    writeFileSync(secureFile(key), data, { mode: 0o600 });
  });
  ipcMain.handle('secure:delete', (_e, key: string) => {
    try {
      writeFileSync(secureFile(key), '');
    } catch {
      /* ignora */
    }
  });

  ipcMain.handle('screen:getSources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
    return sources
      // esconde a própria janela do app (o nome antigo cobre a versão anterior ainda aberta)
      .filter((s) => !/^(Além-Mar|Vinlancord)/.test(s.name))
      .map((s) => ({
        id: s.id,
        name: s.name,
        type: s.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: s.thumbnail.toDataURL(),
        appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
      }));
  });
  ipcMain.handle('screen:select', (_e, id: string, audio: boolean) => {
    screenSelection = { id: String(id), audio: !!audio };
  });

  ipcMain.on('notify:badge', (_e, count: number) => {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (process.platform === 'win32') {
      if (n > 0) win?.setOverlayIcon(nativeImage.createFromPath(join(ASSETS_DIR, 'badge.png')), `${n} menções não lidas`);
      else win?.setOverlayIcon(null, '');
    } else app.setBadgeCount(n);
    tray?.setToolTip(n ? `Além-Mar — ${n} menções` : 'Além-Mar');
  });
  ipcMain.on('notify:flash', () => {
    if (win && !win.isFocused()) win.flashFrame(true);
  });

  ipcMain.handle('shortcuts:register', (_e, binds: Record<string, string>) => {
    globalShortcut.unregisterAll();
    const result: Record<string, boolean> = {};
    for (const [action, accel] of Object.entries(binds ?? {})) {
      if (!accel) continue;
      try {
        result[action] = globalShortcut.register(accel, () => win?.webContents.send('shortcut', action));
      } catch {
        result[action] = false;
      }
    }
    return result;
  });

  ipcMain.handle('activity:listProcesses', async () => (await listProcesses()).sort((a, b) => a.localeCompare(b)));
  ipcMain.handle('activity:detect', async (_e, custom: { process: string; name: string }[]) => {
    const running = new Set((await listProcesses()).map((p) => p.toLowerCase()));
    const found: { name: string; process: string }[] = [];
    for (const c of custom ?? []) if (running.has(String(c.process).toLowerCase())) found.push({ name: String(c.name).slice(0, 128), process: c.process });
    for (const [proc, name] of Object.entries(KNOWN_GAMES)) if (running.has(proc)) found.push({ name, process: proc });
    return found;
  });

  // modo anfitrião
  onHostStatus((st) => win?.webContents.send('host-status', st));
  ipcMain.handle('host:available', () => hostAvailable());
  ipcMain.handle('host:status', () => hostStatus());
  ipcMain.handle('host:start', (_e, opts: { network?: string; upnp?: boolean }) => startHost(opts ?? {}));
  ipcMain.handle('host:stop', () => stopHost());
  ipcMain.handle('host:setBadges', (_e, username: string, badges: string[]) => setBadges(String(username), Array.isArray(badges) ? badges.map(String) : []));
  ipcMain.handle('servers:trust', (_e, url: string, pin: string) => {
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) throw new Error('Endereço inválido.');
    trustServer(url, String(pin));
  });
  ipcMain.handle('idle:get', () => powerMonitor.getSystemIdleTime());

  ipcMain.handle('settings:get', () => ({ ...settings, openAtLogin: app.getLoginItemSettings().openAtLogin }));
  ipcMain.handle('settings:set', (_e, patch: Partial<DesktopSettings>) => {
    settings = { ...settings, ...patch };
    writeSettings(settings);
    if (patch.openAtLogin !== undefined) app.setLoginItemSettings({ openAtLogin: !!patch.openAtLogin, args: ['--hidden'] });
    return { ...settings, openAtLogin: app.getLoginItemSettings().openAtLogin };
  });

  ipcMain.handle('updates:check', async () => {
    if (!autoUpdater) return updateState;
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      emitUpdate({ state: 'error', message: (e as Error).message });
    }
    return updateState;
  });
  ipcMain.on('updates:install', () => {
    quitting = true;
    autoUpdater?.quitAndInstall();
  });

  ipcMain.on('open-external', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
}

/* ───────────── inicialização ───────────── */

/**
 * Quem ativou "Iniciar com o Windows" na versão com o nome antigo tem o registro apontando para
 * Vinlancord.exe, que a atualização removeu: regrava apontando para o executável atual.
 */
function migrateLoginItem() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  try {
    const items = app.getLoginItemSettings({ args: ['--hidden'] }).launchItems ?? [];
    if (items.some((i) => /vinlancord\.exe$/i.test(i.path) && i.path.toLowerCase() !== process.execPath.toLowerCase())) {
      app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
    }
  } catch {
    /* sem acesso ao registro: dá para religar em Configurações */
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  migrateLoginItem();
  registerAppProtocol();
  setupMedia();
  setupIpc();
  if (!startHidden) createSplash();
  createWindow();
  createTray();
  void setupUpdates();
  const link = process.argv.find((a) => a.startsWith('vinlancord://'));
  if (link) handleDeepLink(link);
});

let hostStopped = false;
app.on('before-quit', (e) => {
  quitting = true;
  // desliga o servidor do anfitrião (e o banco) antes de sair
  if (!hostStopped && hostStatus().state !== 'stopped' && hostStatus().state !== 'error') {
    e.preventDefault();
    hostStopped = true;
    void stopHost().finally(() => app.quit());
  }
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => (win ? showWindow() : createWindow()));
