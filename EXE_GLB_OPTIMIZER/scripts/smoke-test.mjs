// Prova di funzionamento dell'optimizer impacchettato: avvia il server con il
// Node.js incluso nel pacchetto (come fa l'app) e gli fa ottimizzare un GLB
// con texture di tipi diversi, in tutte le modalità texture dell'interfaccia.
// Serve a scoprire in CI i problemi che compaiono solo sulla piattaforma di
// destinazione (librerie native di sharp/libvips), prima che lo faccia l'utente.
//
// Uso:  node scripts/smoke-test.mjs [cartella-app-impacchettata]
//   senza argomento usa server/ e il Node.js di sistema (dopo prepare.mjs);
//   con la cartella (es. dist/win-unpacked) usa resources/runtime/node.exe e
//   resources/app/server.

import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv[2] ? path.resolve(process.argv[2]) : null;
const serverEntry = packaged
  ? path.join(packaged, 'resources', 'app', 'server', 'server.js')
  : path.join(ROOT, 'server', 'server.js');
const nodeExe = packaged
  ? path.join(packaged, 'resources', 'runtime', process.platform === 'win32' ? 'node.exe' : 'node')
  : process.execPath;

if (!fs.existsSync(serverEntry)) { console.error(`server non trovato: ${serverEntry}`); process.exit(1); }
if (!fs.existsSync(nodeExe)) { console.error(`Node.js non trovato: ${nodeExe}`); process.exit(1); }

// ── Texture di prova: i casi che libvips tratta in modo diverso ─────────────
async function textures() {
  const rgb = () => sharp({ create: { width: 512, height: 256, channels: 3, background: '#a0603a' } });
  const rgba = () => sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 40, g: 120, b: 200, alpha: 0.5 } } });
  return {
    'jpeg-rgb': ['image/jpeg', await rgb().jpeg().toBuffer()],
    'jpeg-icc-p3': ['image/jpeg', await rgb().withIccProfile('p3').jpeg().toBuffer()],
    'jpeg-cmyk': ['image/jpeg', await rgb().toColourspace('cmyk').jpeg().toBuffer()],
    'jpeg-grey': ['image/jpeg', await rgb().toColourspace('b-w').jpeg().toBuffer()],
    'png-rgba': ['image/png', await rgba().png().toBuffer()],
    'png-palette': ['image/png', await rgb().png({ palette: true }).toBuffer()],
    'png-grey-alpha': ['image/png', await rgba().toColourspace('b-w').png().toBuffer()],
    'png-16bit': ['image/png', await rgb().toColourspace('rgb16').png().toBuffer()],
    'png-grey16': ['image/png', await rgb().toColourspace('grey16').png().toBuffer()],
    'jpeg-big': ['image/jpeg', await sharp({ create: { width: 4608, height: 2304, channels: 3, background: '#556677' } }).jpeg().toBuffer()],
  };
}

async function buildGlb(name, mimeType, image) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const pos = doc.createAccessor().setType('VEC3').setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const uv = doc.createAccessor().setType('VEC2').setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1]));
  const texture = doc.createTexture(name).setMimeType(mimeType).setImage(image)
    .setURI(`${name}.${mimeType === 'image/png' ? 'png' : 'jpg'}`);
  const material = doc.createMaterial().setBaseColorTexture(texture);
  const prim = doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('TEXCOORD_0', uv).setMaterial(material);
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(prim)));
  return new NodeIO().writeBinary(doc);
}

// ── Server ──────────────────────────────────────────────────────────────────
const port = await new Promise((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});
const url = `http://127.0.0.1:${port}`;
const serverLog = [];
const proc = spawn(nodeExe, [serverEntry], {
  cwd: path.dirname(serverEntry),
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
proc.stdout.on('data', (d) => serverLog.push(String(d)));
proc.stderr.on('data', (d) => serverLog.push(String(d)));

let failures = 0;
try {
  for (let i = 0; ; i++) {
    if (proc.exitCode !== null) throw new Error(`server terminato (codice ${proc.exitCode})`);
    try { if ((await fetch(`${url}/health`)).ok) break; } catch { /* non ancora pronto */ }
    if (i > 120) throw new Error('il server non risponde');
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`server pronto: ${nodeExe} ${serverEntry}`);

  const modes = [
    { texture: 'webp', textureMaxSize: '4096' },
    { texture: 'jpeg', textureMaxSize: '4096' },
    { texture: 'same', textureMaxSize: '2048' },
  ];
  for (const [name, [mime, image]] of Object.entries(await textures())) {
    const glb = await buildGlb(name, mime, image);
    for (const mode of modes) {
      const fd = new FormData();
      fd.append('file', new Blob([glb]), `${name}.glb`);
      for (const [k, v] of Object.entries({ draco: 'true', dracoSpeed: '5', weld: 'false', weldTolerance: '0.0001',
        dedup: 'true', prune: 'true', textureQuality: '80', ...mode })) fd.append(k, v);
      const res = await fetch(`${url}/optimize`, { method: 'POST', body: fd });
      const body = Buffer.from(await res.arrayBuffer());
      const ok = res.ok && body.subarray(0, 4).toString('latin1') === 'glTF';
      const label = `${name.padEnd(15)} → ${mode.texture.padEnd(4)} max ${mode.textureMaxSize}`;
      if (ok) {
        console.log(`  ok    ${label}`);
      } else {
        failures++;
        let msg = body.toString('utf8');
        try { msg = JSON.parse(msg).error; } catch { /* non JSON */ }
        console.log(`  ERR   ${label}: HTTP ${res.status} ${msg}`);
      }
    }
  }
} catch (err) {
  failures++;
  console.error(`ERRORE: ${err.message}`);
} finally {
  proc.kill();
}

if (failures) {
  console.log(`\n${failures} prove fallite. Registro del server:\n${serverLog.join('')}`);
  process.exit(1);
}
console.log('\nTutte le prove superate.');
