// Prepara i file che l'applicazione Windows impacchetta, senza duplicare il
// codice dell'optimizer nel repository:
//   1. copia il server da ../glb-optimizer/ in server/ (sorgente unica:
//      il pacchetto .exe esegue esattamente lo stesso codice di `npm start`);
//   2. controlla che le dipendenze di package.json coincidano con quelle di
//      ../glb-optimizer/package.json (altrimenti la build si ferma);
//   3. genera build/icon.ico dall'icona del progetto (img/icon-512.png);
//   4. scarica il runtime Node.js per Windows (runtime/node.exe), verificando
//      lo SHA-256 pubblicato da nodejs.org. Il server gira su questo Node e
//      non dentro Electron: Electron limita la memoria JavaScript a 4 GB,
//      mentre i modelli grandi ne chiedono fino a 16.
//
// Uso: node scripts/prepare.mjs [--no-runtime]
// Variabili: NODE_LINE (default "22": ramo LTS di Node.js da scaricare).

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(ROOT, '..', 'glb-optimizer');
const SERVER = path.join(ROOT, 'server');
const BUILD = path.join(ROOT, 'build');
const RUNTIME = path.join(ROOT, 'runtime');
const NODE_LINE = process.env.NODE_LINE || '22';
const skipRuntime = process.argv.includes('--no-runtime');

function log(msg) { console.log(`[prepare] ${msg}`); }
function fail(msg) { console.error(`[prepare] ERRORE: ${msg}`); process.exit(1); }

// ── 1. Server ───────────────────────────────────────────────────────────────
function copyServer() {
  if (!fs.existsSync(path.join(SRC, 'server.js'))) fail(`server non trovato in ${SRC}`);
  fs.rmSync(SERVER, { recursive: true, force: true });
  fs.mkdirSync(SERVER, { recursive: true });
  for (const name of fs.readdirSync(SRC)) {
    if (name.endsWith('.js')) fs.copyFileSync(path.join(SRC, name), path.join(SERVER, name));
  }
  fs.cpSync(path.join(SRC, 'public'), path.join(SERVER, 'public'), { recursive: true });
  log(`server copiato da glb-optimizer/ (${fs.readdirSync(SERVER).join(', ')})`);
}

// ── 2. Dipendenze allineate ─────────────────────────────────────────────────
function checkDependencies() {
  const ours = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).dependencies;
  const theirs = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8')).dependencies;
  const diff = [...new Set([...Object.keys(ours), ...Object.keys(theirs)])]
    .filter((k) => ours[k] !== theirs[k])
    .map((k) => `  ${k}: glb-optimizer ${theirs[k] ?? '(assente)'} ≠ EXE_GLB_OPTIMIZER ${ours[k] ?? '(assente)'}`);
  if (diff.length) {
    fail('le dipendenze di EXE_GLB_OPTIMIZER/package.json non coincidono con quelle di ' +
      `glb-optimizer/package.json:\n${diff.join('\n')}\nAllinea "dependencies" e rilancia npm install.`);
  }
  log('dipendenze allineate con glb-optimizer/package.json');
}

// ── 3. Icona .ico (contenitore ICO con immagini PNG, supportato da Vista in poi)
async function makeIcon() {
  const { default: sharp } = await import('sharp');
  const src = path.resolve(ROOT, '..', 'img', 'icon-512.png');
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(sizes.map((s) => sharp(src).resize(s, s).png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);            // riservato
  header.writeUInt16LE(1, 2);            // tipo: icona
  header.writeUInt16LE(sizes.length, 4); // numero di immagini
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(s >= 256 ? 0 : s, e);     // 0 = 256 px
    header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt16LE(1, e + 4);             // piani colore
    header.writeUInt16LE(32, e + 6);            // bit per pixel
    header.writeUInt32LE(pngs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  fs.mkdirSync(BUILD, { recursive: true });
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), Buffer.concat([header, ...pngs]));
  fs.copyFileSync(path.join(SRC, '..', 'img', 'icon-512.png'), path.join(ROOT, 'app', 'icon.png'));
  log('icona generata: build/icon.ico, app/icon.png');
}

// ── 4. Runtime Node.js per Windows ──────────────────────────────────────────
async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchRuntime() {
  const base = `https://nodejs.org/dist/latest-v${NODE_LINE}.x`;
  const sums = (await download(`${base}/SHASUMS256.txt`)).toString('utf8');
  const version = sums.match(/node-(v\d+\.\d+\.\d+)\.tar\.gz/)?.[1];
  const expected = sums.split('\n').find((l) => l.endsWith('  win-x64/node.exe'))?.split(/\s+/)[0];
  if (!version || !expected) fail(`SHASUMS256.txt di ${base} non riconosciuto`);

  const exe = path.join(RUNTIME, 'node.exe');
  const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
  fs.mkdirSync(RUNTIME, { recursive: true });
  if (fs.existsSync(exe) && sha256(fs.readFileSync(exe)) === expected) {
    log(`runtime già presente: Node.js ${version} (win-x64)`);
  } else {
    log(`scarico Node.js ${version} per Windows x64…`);
    const buf = await download(`https://nodejs.org/dist/${version}/win-x64/node.exe`);
    if (sha256(buf) !== expected) fail('SHA-256 di node.exe non corrisponde a SHASUMS256.txt');
    fs.writeFileSync(exe, buf);
  }
  const license = await download(`https://raw.githubusercontent.com/nodejs/node/${version}/LICENSE`);
  fs.writeFileSync(path.join(RUNTIME, 'LICENSE-nodejs.txt'), license);
  return version;
}

// ── main ────────────────────────────────────────────────────────────────────
checkDependencies();
copyServer();
await makeIcon();

const versions = {
  app: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version,
  node: skipRuntime ? null : await fetchRuntime(),
};
fs.writeFileSync(path.join(BUILD, 'versions.json'), JSON.stringify(versions, null, 2));
log(`pronto (${JSON.stringify(versions)})`);
