import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { Document } from '@gltf-transform/core';
import { MAX_DRACO_VERTS } from './split-large-primitives.js';

const STREAM_THRESHOLD = 400 * 1024 * 1024;

// Dimensione di un chunk di FloatList: 2^22 float (16 MB per chunk).
// Deve essere una potenza di due per l'aritmetica bitwise in push/get.
const CHUNK_SHIFT  = 22;
const CHUNK_FLOATS = 1 << CHUNK_SHIFT;
const CHUNK_MASK   = CHUNK_FLOATS - 1;

// Lista di float accresciuta a chunk di Float32Array. Gli ArrayBuffer vivono
// fuori dall'heap V8 (memoria "external"), quindi non sono soggetti a
// --max-old-space-size e occupano 4 byte per valore invece degli 8+ di un
// array JS di double: è ciò che rende gestibili OBJ da svariati GB.
class FloatList {
  constructor() { this.chunks = []; this.length = 0; }

  push(v) {
    const ci = this.length >>> CHUNK_SHIFT;
    let c = this.chunks[ci];
    if (!c) c = this.chunks[ci] = new Float32Array(CHUNK_FLOATS);
    c[this.length & CHUNK_MASK] = v;
    this.length++;
  }

  push3(a, b, c) { this.push(a); this.push(b); this.push(c); }
  push2(a, b)    { this.push(a); this.push(b); }

  get(i) { return this.chunks[i >>> CHUNK_SHIFT][i & CHUNK_MASK]; }

  // Copia [startFloat, startFloat+countFloats) in un Float32Array contiguo.
  slice(startFloat, countFloats) {
    const out = new Float32Array(countFloats);
    let written = 0;
    while (written < countFloats) {
      const src = startFloat + written;
      const ci  = src >>> CHUNK_SHIFT;
      const off = src & CHUNK_MASK;
      const n   = Math.min(CHUNK_FLOATS - off, countFloats - written);
      out.set(this.chunks[ci].subarray(off, off + n), written);
      written += n;
    }
    return out;
  }

  clear() { this.chunks = []; this.length = 0; }
}

// Triangle soup di un gruppo materiale. POSITION/NORMAL/TEXCOORD_0 restano
// sempre allineati (stesso numero di vertici): i valori mancanti sono 0.
class GroupSoup {
  constructor() {
    this.pos  = new FloatList();
    this.norm = new FloatList();
    this.uv   = new FloatList();
    this.verts   = 0;
    this.hasNorm = false;
    this.hasUV   = false;
  }

  addVertex(px, py, pz, nx, ny, nz, hasN, u, v, hasU) {
    this.pos.push3(px, py, pz);
    if (hasN && !this.hasNorm) {
      this.hasNorm = true;
      for (let i = 0; i < this.verts * 3; i++) this.norm.push(0);
    }
    if (this.hasNorm) this.norm.push3(hasN ? nx : 0, hasN ? ny : 0, hasN ? nz : 0);
    if (hasU && !this.hasUV) {
      this.hasUV = true;
      for (let i = 0; i < this.verts * 2; i++) this.uv.push(0);
    }
    if (this.hasUV) this.uv.push2(hasU ? u : 0, hasU ? v : 0);
    this.verts++;
  }

  clear() { this.pos.clear(); this.norm.clear(); this.uv.clear(); }
}

function logMemory(prefix) {
  const m = process.memoryUsage();
  console.log(`${prefix} — RSS ${(m.rss / 1e9).toFixed(1)} GB, external ${(m.external / 1e9).toFixed(1)} GB`);
}

export function needsStreamConvert(filePath) {
  return fs.statSync(filePath).size > STREAM_THRESHOLD;
}

export async function streamConvertOBJ(objPath, tempDir) {
  console.log('[stream-convert] File OBJ grande — uso parser streaming');

  const positions = new FloatList();
  const normals   = new FloatList();
  const uvs       = new FloatList();

  const groups    = new Map();
  let currentMat  = '';
  const mtlLibs   = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(objPath, { encoding: 'utf8', highWaterMark: 256 * 1024 }),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  let facceScartate = 0;
  for await (const line of rl) {
    lineCount++;
    if (lineCount % 5_000_000 === 0)
      logMemory(`[stream-convert]   ${(lineCount / 1e6).toFixed(0)}M righe`);

    if (line.length === 0 || line.charCodeAt(0) === 35) continue;

    const c0 = line.charCodeAt(0);
    const c1 = line.charCodeAt(1);

    if (c0 === 118) {
      if (c1 === 32 || c1 === 9) {
        const p = line.split(/\s+/);
        positions.push3(+p[1], +p[2], +p[3]);
      } else if (c1 === 110) {
        const p = line.split(/\s+/);
        normals.push3(+p[1], +p[2], +p[3]);
      } else if (c1 === 116) {
        const p = line.split(/\s+/);
        // OBJ ha l'origine delle UV in basso a sinistra, glTF in alto a
        // sinistra: la V va ribaltata, come fa obj2gltf sull'altro percorso.
        // Senza questo i triangoli campionano lo specchio del proprio chart,
        // e dove l'atlante è vuoto compaiono chiazze del colore di riempimento.
        uvs.push2(+p[1], 1 - (+p[2] || 0));
      }
    } else if (c0 === 102 && (c1 === 32 || c1 === 9)) {
      if (!groups.has(currentMat))
        groups.set(currentMat, new GroupSoup());
      const g = groups.get(currentMat);

      const parts = line.trimEnd().split(/\s+/);
      const verts = [];
      for (let i = 1; i < parts.length; i++) {
        const s = parts[i].split('/');
        verts.push(
          parseInt(s[0]) || 0,
          s.length > 1 ? (parseInt(s[1]) || 0) : 0,
          s.length > 2 ? (parseInt(s[2]) || 0) : 0,
        );
      }

      const nv = (parts.length - 1);
      const numPos = positions.length / 3;
      for (let i = 1; i < nv - 1; i++) {
        // Un solo vertice scartato lascerebbe la soup con un numero di vertici
        // non multiplo di 3, e da lì in poi ogni triangolo verrebbe costruito
        // con la tripla sbagliata: o si emette il triangolo intero, o niente.
        if (!resolveIndex(verts[0], numPos) ||
            !resolveIndex(verts[i * 3], numPos) ||
            !resolveIndex(verts[(i + 1) * 3], numPos)) { facceScartate++; continue; }
        expandVertex(g, positions, normals, uvs, verts, 0);
        expandVertex(g, positions, normals, uvs, verts, i);
        expandVertex(g, positions, normals, uvs, verts, i + 1);
      }
    } else if (c0 === 117 && line.startsWith('usemtl ')) {
      currentMat = line.substring(7).trim();
    } else if (c0 === 109 && line.startsWith('mtllib ')) {
      mtlLibs.push(...line.substring(7).trim().split(/\s+/));
    }
  }

  const numVerts = positions.length / 3;
  let totalTris  = 0;
  for (const g of groups.values()) totalTris += g.verts / 3;
  console.log(`[stream-convert] ${numVerts.toLocaleString()} vertici, ${totalTris.toLocaleString()} triangoli, ${groups.size} materiali`);
  if (facceScartate > 0)
    console.warn(`[stream-convert] ⚠ ${facceScartate.toLocaleString()} facce scartate: indice di vertice fuori range`);

  // Le liste globali v/vn/vt servono solo durante il parsing (la soup è già
  // stata espansa nei gruppi): liberarle riduce il picco di memoria.
  positions.clear();
  normals.clear();
  uvs.clear();

  const materials = new Map();
  for (const mtlName of mtlLibs) {
    const mtlPath = resolveAssetPath(tempDir, mtlName);
    if (mtlPath) await parseMTL(mtlPath, materials);
    else console.warn(`[stream-convert] ⚠ file MTL non trovato: ${mtlName}`);
  }

  const doc   = new Document();
  const scene = doc.createScene();
  const buf   = doc.createBuffer();
  const texCache = new Map();

  for (const [matName, g] of groups) {
    const matDef = materials.get(matName);
    // Un materiale c'è sempre, anche senza voce MTL: il default glTF è
    // metallico e a faccia singola, cioè nero in un renderer PBR e bucato
    // dal lato sbagliato. Un OBJ non è PBR, quindi metallic = 0.
    const mat = doc.createMaterial()
      .setName(matName || 'default')
      .setMetallicFactor(0)
      .setRoughnessFactor(1)
      .setDoubleSided(true);
    if (matDef) {
      if (matDef.Kd) mat.setBaseColorFactor([...matDef.Kd, matDef.d ?? 1]);
      if (matDef.map_Kd) {
        const tex = loadTexture(doc, tempDir, matDef.map_Kd, texCache);
        if (tex) mat.setBaseColorTexture(tex);
      }
    }

    const mesh = doc.createMesh();
    if (matName) mesh.setName(matName);

    // Una primitive ogni MAX_DRACO_VERTS vertici (multiplo di 3): le mesh
    // giganti vanno suddivise perché l'encoder Draco (WASM a 32 bit) non può
    // codificare centinaia di milioni di vertici in una singola primitive.
    const chunkVerts = Math.max(3, Math.floor(MAX_DRACO_VERTS / 3) * 3);
    for (let start = 0; start < g.verts; start += chunkVerts) {
      const count = Math.min(chunkVerts, g.verts - start);

      const prim = doc.createPrimitive().setAttribute('POSITION',
        doc.createAccessor().setType('VEC3')
          .setArray(g.pos.slice(start * 3, count * 3)).setBuffer(buf));

      if (g.hasNorm) {
        prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3')
          .setArray(g.norm.slice(start * 3, count * 3)).setBuffer(buf));
      }
      if (g.hasUV) {
        prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2')
          .setArray(g.uv.slice(start * 2, count * 2)).setBuffer(buf));
      }
      prim.setMaterial(mat);
      mesh.addPrimitive(prim);
    }

    scene.addChild(doc.createNode().setMesh(mesh));
    g.clear();
  }

  logMemory('[stream-convert] Documento glTF costruito');
  return doc;
}

// Indice OBJ (1-based, negativo = relativo alla fine) → indice 1-based valido,
// oppure 0 se fuori range. Unico punto in cui si interpretano gli indici.
function resolveIndex(raw, count) {
  const i = raw < 0 ? count + raw + 1 : raw;
  return (i > 0 && i <= count) ? i : 0;
}

function expandVertex(g, positions, normals, uvs, verts, idx) {
  const base = idx * 3;
  const vti = verts[base + 1], vni = verts[base + 2];

  const numPos = positions.length / 3;
  const vi = resolveIndex(verts[base], numPos);
  if (!vi) return; // già filtrato a monte: la faccia non sarebbe stata emessa

  const pi = (vi - 1) * 3;
  const px = positions.get(pi), py = positions.get(pi + 1), pz = positions.get(pi + 2);

  const numNorm = normals.length / 3;
  const ni_ = resolveIndex(vni, numNorm);
  const hasN = ni_ > 0;
  let nx = 0, ny = 0, nz = 0;
  if (hasN) {
    const ni = (ni_ - 1) * 3;
    nx = normals.get(ni); ny = normals.get(ni + 1); nz = normals.get(ni + 2);
  }

  const numUV = uvs.length / 2;
  const ti_ = resolveIndex(vti, numUV);
  const hasU = ti_ > 0;
  let u = 0, v = 0;
  if (hasU) {
    const ui = (ti_ - 1) * 2;
    u = uvs.get(ui); v = uvs.get(ui + 1);
  }

  g.addVertex(px, py, pz, nx, ny, nz, hasN, u, v, hasU);
}

// Un MTL scritto su Windows usa i backslash, può puntare a una sottocartella
// che qui non esiste (le texture arrivano tutte nella stessa directory) e può
// avere maiuscole diverse dal file reale. Si prova il percorso dichiarato, poi
// il solo nome del file, poi il confronto senza distinzione di maiuscole —
// la stessa catena di ripieghi che usa obj2gltf sull'altro percorso.
const dirCache = new Map();
export function resolveAssetPath(dir, ref) {
  const norm = ref.replace(/\\/g, '/');
  for (const cand of [norm, path.basename(norm)]) {
    const p = path.join(dir, cand);
    if (fs.existsSync(p)) return p;
  }
  if (!dirCache.has(dir)) {
    try { dirCache.set(dir, fs.readdirSync(dir)); } catch { dirCache.set(dir, []); }
  }
  const target = path.basename(norm).toLowerCase();
  const hit = dirCache.get(dir).find((name) => name.toLowerCase() === target);
  return hit ? path.join(dir, hit) : null;
}

function loadTexture(doc, dir, filename, cache) {
  const resolved = resolveAssetPath(dir, filename);
  if (!resolved) {
    console.warn(`[stream-convert] ⚠ texture non trovata: ${filename}`);
    return null;
  }
  if (cache.has(resolved)) return cache.get(resolved);

  const data = fs.readFileSync(resolved);
  const ext  = path.extname(resolved).toLowerCase();
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                 '.webp': 'image/webp', '.bmp': 'image/bmp' }[ext] || 'image/jpeg';

  const tex = doc.createTexture().setImage(data).setMimeType(mime);
  cache.set(resolved, tex);
  return tex;
}

async function parseMTL(mtlPath, materials) {
  const rl = readline.createInterface({
    input: fs.createReadStream(mtlPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let current = null;
  for await (const line of rl) {
    const t = line.trim();
    if (t.startsWith('newmtl ')) {
      current = {};
      materials.set(t.substring(7).trim(), current);
    } else if (current) {
      if (t.startsWith('Kd ')) {
        const p = t.split(/\s+/);
        current.Kd = [+p[1], +p[2], +p[3]];
      } else if (t.startsWith('d ')) {
        current.d = +t.split(/\s+/)[1];
      } else if (t.startsWith('map_Kd ')) {
        // "map_Kd -s 1 1 1 la mia texture.jpg": si tolgono le opzioni iniziali
        // (-xxx e i loro argomenti numerici) e si tiene tutto il resto, così
        // un nome di file con spazi dentro sopravvive.
        let rest = t.slice(7).trim();
        while (rest.startsWith('-')) {
          const m = rest.match(/^-\S+((\s+-?[\d.]+)*)\s*/);
          if (!m || !m[0].trim()) break;
          rest = rest.slice(m[0].length);
        }
        current.map_Kd = rest.trim();
      }
    }
  }
}
