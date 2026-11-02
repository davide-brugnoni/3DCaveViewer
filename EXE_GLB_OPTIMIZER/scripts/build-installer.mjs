// Compila l'installer Windows (installer/glb-optimizer.iss) con Inno Setup 6.
// Va eseguito dopo `npm run pack` (che crea dist/win-unpacked), su Windows.
// ISCC.exe viene cercato in ISCC (variabile d'ambiente), nel PATH e nelle
// cartelle d'installazione standard di Inno Setup 6.

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => { console.error(`[installer] ERRORE: ${msg}`); process.exit(1); };

if (process.platform !== 'win32') fail('l\'installer si compila solo su Windows (Inno Setup).');
if (!fs.existsSync(path.join(ROOT, 'dist', 'win-unpacked', 'GLB Optimizer.exe'))) {
  fail('dist\\win-unpacked non trovato: esegui prima "npm run pack".');
}

const candidates = [
  process.env.ISCC,
  ...['ProgramFiles(x86)', 'ProgramFiles', 'LOCALAPPDATA'].map((v) => process.env[v] && (
    v === 'LOCALAPPDATA'
      ? path.join(process.env[v], 'Programs', 'Inno Setup 6', 'ISCC.exe')
      : path.join(process.env[v], 'Inno Setup 6', 'ISCC.exe'))),
].filter(Boolean);
let iscc = candidates.find((p) => fs.existsSync(p));
if (!iscc && spawnSync('where', ['ISCC.exe'], { shell: true }).status === 0) iscc = 'ISCC.exe';
if (!iscc) fail('Inno Setup 6 non trovato. Installalo da https://jrsoftware.org/isdl.php oppure indica ISCC.exe nella variabile ISCC.');

const versions = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'versions.json'), 'utf8'));
if (!versions.node) fail('runtime Node.js mancante: esegui "npm run pack" (senza --no-runtime).');

const args = [
  `/DAppVersion=${versions.app}`,
  `/DNodeVersion=${versions.node.replace(/^v/, '')}`,
  path.join(ROOT, 'installer', 'glb-optimizer.iss'),
];
console.log(`[installer] ${iscc} ${args.join(' ')}`);
const res = spawnSync(iscc, args, { stdio: 'inherit' });
if (res.status !== 0) fail(`ISCC terminato con codice ${res.status}`);
console.log(`[installer] pronto: dist\\GLB-Optimizer-Setup-${versions.app}.exe`);
