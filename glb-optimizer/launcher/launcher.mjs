// GLB Optimizer — avvio con un clic.
//
// Lo lanciano avvia-windows.bat / avvia-mac.command / avvia-linux.sh dopo
// aver trovato (o scaricato in .runtime/) un Node.js >= 22. Qui:
//   1. installa le dipendenze npm se mancano o se package-lock.json è cambiato;
//   2. avvia server.js su 127.0.0.1 (niente richiesta del firewall, nessun
//      accesso dalla rete) con un heap adatto alla RAM del computer;
//   3. aspetta che /health risponda e apre il browser sull'interfaccia.
// Se un GLB Optimizer è già in esecuzione sulla porta, apre solo il browser.
//
// Variabili opzionali: PORT (default 3000, se occupata ne sceglie un'altra),
// HOST (default 127.0.0.1), GLBOPT_NO_BROWSER=1 (non aprire il browser).

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'server.js');
const LOCK = path.join(ROOT, 'package-lock.json');
const STAMP = path.join(ROOT, 'node_modules', '.glbopt-installed');
const START_TIMEOUT_MS = 90_000;
const HOST = process.env.HOST || '127.0.0.1';

const log = (msg) => console.log(`[GLB Optimizer] ${msg}`);

function fail(msg) {
  console.error(`\n[GLB Optimizer] ERRORE: ${msg}\n`);
  process.exit(1);
}

if (Number(process.versions.node.split('.')[0]) < 22) {
  fail(`serve Node.js 22 o più recente (questo è ${process.version}).`);
}

// ── 1. Dipendenze ────────────────────────────────────────────────────────────
// L'impronta lega node_modules a lockfile, sistema operativo e processore:
// sharp contiene binari nativi, una cartella copiata da un altro computer
// non funzionerebbe.
function depsFingerprint() {
  const lock = fs.existsSync(LOCK) ? fs.readFileSync(LOCK) : fs.readFileSync(path.join(ROOT, 'package.json'));
  return crypto.createHash('sha256').update(lock).update(`${process.platform}-${process.arch}`).digest('hex');
}

// npm-cli.js del Node.js in uso, eseguito con lo stesso node: funziona anche
// con il Node portatile in .runtime/, che non è nel PATH di sistema.
function npmCommand() {
  const dir = path.dirname(process.execPath);
  const candidates = [
    path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),          // Windows
    path.join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), // macOS / Linux
  ];
  const cli = candidates.find((p) => fs.existsSync(p));
  if (cli) return { cmd: process.execPath, pre: [cli], shell: false };
  return { cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm', pre: [], shell: process.platform === 'win32' };
}

function runNpm(args) {
  const npm = npmCommand();
  const env = { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}` };
  const res = spawnSync(npm.cmd, [...npm.pre, ...args], { cwd: ROOT, stdio: 'inherit', env, shell: npm.shell });
  return res.status === 0;
}

function ensureDependencies() {
  const want = depsFingerprint();
  const have = fs.existsSync(STAMP) ? fs.readFileSync(STAMP, 'utf8').trim() : '';
  if (have === want && fs.existsSync(path.join(ROOT, 'node_modules', 'express'))) return;

  log('installo i componenti necessari (solo la prima volta, può richiedere qualche minuto)…');
  const common = ['--omit=dev', '--no-audit', '--no-fund', '--update-notifier=false', '--loglevel=error'];
  const ok = (fs.existsSync(LOCK) && runNpm(['ci', ...common])) || runNpm(['install', ...common]);
  if (!ok) fail('installazione dei componenti non riuscita. Controlla la connessione a Internet e riprova.');
  fs.writeFileSync(STAMP, want + '\n');
  log('componenti installati.');
}

// ── 2. Server ────────────────────────────────────────────────────────────────
// Stesso tetto di `npm start` (16 GB), ma mai oltre il 75% della RAM: su un
// PC da 8 GB un heap da 16 GB farebbe swappare il sistema fino a bloccarlo.
function heapLimitMB() {
  const ramMB = Math.floor(os.totalmem() / 1024 / 1024);
  return Math.max(2048, Math.min(16384, Math.floor(ramMB * 0.75)));
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.listen(port, HOST, () => srv.close(() => resolve(true)));
  });
}

function anyFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, HOST, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function isOptimizer(url) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok && (await res.json()).app === 'glb-optimizer';
  } catch {
    return false;
  }
}

async function waitForHealth(url, proc) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) fail(`il server si è chiuso subito (codice ${proc.exitCode}). Leggi i messaggi qui sopra.`);
    if (await isOptimizer(url)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  fail(`il server non ha risposto entro ${START_TIMEOUT_MS / 1000} secondi.`);
}

// ── 3. Browser ───────────────────────────────────────────────────────────────
function openBrowser(url) {
  if (process.env.GLBOPT_NO_BROWSER === '1') return;
  let cmd, args, opts = { stdio: 'ignore', detached: true };
  if (process.platform === 'win32') {
    cmd = 'cmd.exe';
    args = ['/d', '/s', '/c', `start "" "${url}"`];
    opts = { ...opts, windowsVerbatimArguments: true, windowsHide: true };
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  try {
    const child = spawn(cmd, args, opts);
    child.on('error', () => log(`apri il browser su ${url}`));
    child.unref();
  } catch {
    log(`apri il browser su ${url}`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
ensureDependencies();

const wanted = Number(process.env.PORT) || 3000;
const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
let port = wanted;
if (!(await portFree(wanted))) {
  const existing = `http://${displayHost}:${wanted}`;
  if (await isOptimizer(existing)) {
    log(`GLB Optimizer è già in esecuzione: apro ${existing}`);
    openBrowser(existing);
    process.exit(0);
  }
  port = await anyFreePort();
  log(`la porta ${wanted} è occupata da un altro programma, uso la ${port}.`);
}

const heap = heapLimitMB();
log(`avvio del server (memoria massima ${(heap / 1024).toFixed(1)} GB)…`);
const server = spawn(process.execPath, [`--max-old-space-size=${heap}`, SERVER], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port), HOST },
  stdio: 'inherit',
});
server.on('error', (err) => fail(`impossibile avviare il server: ${err.message}`));

const stop = () => { try { server.kill(); } catch { /* già chiuso */ } };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('SIGHUP', stop);
server.on('exit', (code) => process.exit(code ?? 0));

const url = `http://${displayHost}:${port}`;
await waitForHealth(url, server);
openBrowser(url);
console.log(
  `\n  ▶ GLB Optimizer è aperto nel browser: ${url}\n` +
  `    Se il browser non si apre, copia l'indirizzo qui sopra.\n` +
  `    Lascia aperta questa finestra mentre lavori; chiudila (o premi Ctrl+C) per spegnere il programma.\n`,
);
