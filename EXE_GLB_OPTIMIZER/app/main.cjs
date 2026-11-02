// GLB Optimizer — applicazione desktop (Electron).
//
// La finestra è solo l'interfaccia: l'elaborazione la fa lo stesso server di
// glb-optimizer/ (copiato in server/ da scripts/prepare.mjs), eseguito come
// processo separato con il Node.js incluso nel pacchetto (resources/runtime/
// node.exe). Così valgono gli stessi limiti di `npm start` (heap fino a
// 16 GB): dentro Electron la memoria JavaScript è limitata a 4 GB.
//
// Il server ascolta solo su 127.0.0.1, su una porta libera scelta qui:
// niente richiesta del firewall di Windows e nessun accesso dalla rete.

'use strict';

const { app, BrowserWindow, Menu, dialog, shell, session } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(APP_ROOT, 'server', 'server.js');
const ICON = path.join(__dirname, 'icon.png');
const PROJECT_URL = 'https://github.com/davide-brugnoni/3DCaveViewer';
const START_TIMEOUT_MS = 60_000;
const LOG_LINES = 400;

let mainWindow = null;
let serverProc = null;
let serverUrl = null;
let quitting = false;
const logBuffer = [];
let logStream = null;

// ── Registro ────────────────────────────────────────────────────────────────
function logFilePath() {
  return path.join(app.getPath('logs'), 'glb-optimizer.log');
}

function writeLog(text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const stamped = `${new Date().toISOString()} ${line}`;
    logBuffer.push(stamped);
    if (logBuffer.length > LOG_LINES) logBuffer.shift();
    logStream?.write(stamped + os.EOL);
  }
}

// ── Server ──────────────────────────────────────────────────────────────────
// Node.js da usare: quello incluso nel pacchetto; in sviluppo (`npm start`)
// quello di sistema, o GLBOPT_NODE.
function nodeExecutable() {
  if (process.env.GLBOPT_NODE) return process.env.GLBOPT_NODE;
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
  }
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

// Stesso tetto di `npm start` (16 GB), ma mai oltre il 75% della RAM: su un
// PC da 8 GB un heap da 16 GB porterebbe Windows a usare il disco come
// memoria fino a bloccarsi, invece di un errore chiaro.
function heapLimitMB() {
  const ramMB = Math.floor(os.totalmem() / 1024 / 1024);
  return Math.max(2048, Math.min(16384, Math.floor(ramMB * 0.75)));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url, proc) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (proc.spawnError) throw new Error(`impossibile avviare il motore di elaborazione (${proc.spawnError.code || proc.spawnError.message}): reinstalla il programma`);
    if (proc.exitCode !== null) throw new Error(`il motore di elaborazione si è chiuso subito (codice ${proc.exitCode})`);
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch { /* non ancora in ascolto */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`il motore di elaborazione non ha risposto entro ${START_TIMEOUT_MS / 1000} secondi`);
}

async function startServer() {
  const port = await freePort();
  const heap = heapLimitMB();
  const node = nodeExecutable();
  writeLog(`[app] avvio server: ${node} (heap ${heap} MB, porta ${port})`);

  const proc = spawn(node, [`--max-old-space-size=${heap}`, SERVER_ENTRY], {
    cwd: path.dirname(SERVER_ENTRY),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => writeLog(d));
  proc.stderr.on('data', (d) => writeLog(d));
  proc.on('error', (err) => {
    proc.spawnError = err;
    writeLog(`[app] impossibile avviare il server: ${err.message}`);
  });
  proc.on('exit', (code, signal) => {
    writeLog(`[app] server terminato (codice ${code}, segnale ${signal})`);
    if (serverProc === proc) serverProc = null;
    // Durante l'avvio l'errore lo riporta startServer(); qui solo i crash dopo.
    if (!quitting && serverUrl) showError('Il motore di elaborazione si è chiuso inaspettatamente (memoria esaurita?). Chiudi e riapri il programma.', 'Elaborazione interrotta');
  });
  serverProc = proc;

  const url = `http://127.0.0.1:${port}`;
  await waitForHealth(url, proc);
  return url;
}

function stopServer() {
  if (!serverProc) return;
  const proc = serverProc;
  serverProc = null;
  try { proc.kill(); } catch { /* già chiuso */ }
}

async function activeJobs() {
  if (!serverUrl || !serverProc) return 0;
  try {
    const res = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(1500) });
    return (await res.json()).activeJobs || 0;
  } catch {
    return 0;
  }
}

// ── Finestra ────────────────────────────────────────────────────────────────
function showError(message, title = 'Avvio non riuscito') {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const tail = logBuffer.slice(-40).join('\n');
  mainWindow.loadFile(path.join(__dirname, 'splash.html'), {
    query: { title, error: message, log: tail, logFile: logFilePath() },
  });
}

function isAppUrl(url) {
  return (serverUrl && url.startsWith(serverUrl + '/')) || url.startsWith('file://');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 900,
    minWidth: 720,
    minHeight: 560,
    title: 'GLB Optimizer',
    icon: fs.existsSync(ICON) ? ICON : undefined,
    backgroundColor: '#0f1117',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Un file trascinato fuori dalla zona di rilascio farebbe navigare la
  // finestra verso il file stesso: si resta sempre sull'interfaccia.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !isAppUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Chiudere durante un'elaborazione la interromperebbe: si chiede prima.
  mainWindow.on('close', async (event) => {
    if (quitting) return;
    event.preventDefault();
    const jobs = await activeJobs();
    if (jobs > 0) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Chiudi comunque', 'Annulla'],
        defaultId: 1,
        cancelId: 1,
        title: 'Elaborazione in corso',
        message: 'Un modello è ancora in elaborazione.',
        detail: 'Chiudendo ora l\'elaborazione viene interrotta e il file non viene salvato.',
      });
      if (response !== 0) return;
    }
    quitting = true;
    mainWindow.destroy();
  });

  mainWindow.loadFile(path.join(__dirname, 'splash.html'));
}

// Il file ottimizzato arriva come download: finestra "Salva con nome" che
// propone la cartella Download.
function setupDownloads() {
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      title: 'Salva il modello ottimizzato',
      defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
      filters: [{ name: 'Modello glTF binario', extensions: ['glb'] }],
    });
    item.once('done', (_e, state) => {
      if (state === 'completed') writeLog(`[app] salvato: ${item.getSavePath()}`);
    });
  });
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Apri la cartella Download', click: () => shell.openPath(app.getPath('downloads')) },
        { type: 'separator' },
        { label: 'Esci', click: () => mainWindow?.close() },
      ],
    },
    {
      label: 'Visualizza',
      submenu: [
        { label: 'Ricarica', role: 'reload' },
        { type: 'separator' },
        { label: 'Zoom avanti', role: 'zoomIn' },
        { label: 'Zoom indietro', role: 'zoomOut' },
        { label: 'Dimensione reale', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Schermo intero', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Aiuto',
      submenu: [
        { label: 'Guida (README)', click: () => shell.openExternal(`${PROJECT_URL}/blob/main/glb-optimizer/README.md`) },
        { label: 'Apri il registro', click: () => shell.openPath(logFilePath()) },
        { label: 'Strumenti per sviluppatori', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Informazioni su GLB Optimizer', click: showAbout },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Informazioni',
    message: `GLB Optimizer ${app.getVersion()}`,
    detail:
      'Prepara i modelli 3D per 3DCaveViewer: comprime la geometria (Draco), ' +
      'ricomprime le texture (WebP/JPEG) e converte i file OBJ in GLB.\n' +
      'Tutto avviene su questo computer, nessun file viene inviato in rete.\n\n' +
      '© Davide Brugnoni — Buio Verticale, Gruppo Speleologico CAI Gubbio\n' +
      'Software libero, licenza GNU GPL v3.\n' +
      PROJECT_URL,
    buttons: ['OK', 'Sito del progetto'],
  }).then(({ response }) => { if (response === 1) shell.openExternal(PROJECT_URL); });
}

// ── Avvio ───────────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    fs.mkdirSync(app.getPath('logs'), { recursive: true });
    logStream = fs.createWriteStream(logFilePath(), { flags: 'w' });
    writeLog(`[app] GLB Optimizer ${app.getVersion()} — ${os.platform()} ${os.release()}, RAM ${Math.round(os.totalmem() / 2 ** 30)} GB`);

    buildMenu();
    setupDownloads();
    createWindow();
    try {
      serverUrl = await startServer();
      writeLog(`[app] interfaccia: ${serverUrl}`);
      if (!mainWindow.isDestroyed()) await mainWindow.loadURL(serverUrl);
    } catch (err) {
      writeLog(`[app] errore di avvio: ${err.message}`);
      showError(`Il programma non è riuscito a partire: ${err.message}.`);
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', stopServer);
  process.on('exit', stopServer);
}
