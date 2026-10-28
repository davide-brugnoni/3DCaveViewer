import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { draco, dedup, prune, textureCompress, weld } from '@gltf-transform/functions';
import draco3d from 'draco3d';
import sharp from 'sharp';
import fs from 'fs';
import readline from 'readline';
import os from 'os';
import { constants as bufferConstants } from 'buffer';
import obj2gltf from 'obj2gltf';
import { needsStreamConvert, streamConvertOBJ } from './obj-stream-converter.js';
import { splitLargePrimitives, MAX_DRACO_VERTS } from './split-large-primitives.js';
import { KHRDracoMeshCompressionStreaming } from './draco-streaming-read.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT) || 3;
let activeJobs = 0;

// Node.js non può allocare un singolo Buffer più grande di questo.
// Da Node 22 il limite è 2^53-1 (di fatto illimitato); su versioni precedenti
// è ~4 GB e i file oltre soglia non sono leggibili con fs.readFileSync().
const MAX_NODEJS_BUFFER = bufferConstants.MAX_LENGTH;

// Limite del formato GLB: header e chunk length sono uint32, quindi un GLB
// valido non può superare questa dimensione (né in input né in output).
const GLB_MAX_SIZE = 4_294_967_295;

// Sopra questa soglia prune() e dedup() vengono disabilitati automaticamente:
// su file molto grandi queste trasformazioni rischiano di rimuovere tutta la
// geometria quando il documento gltf-transform è in uno stato parzialmente caricato.
const LARGE_FILE_THRESHOLD = 2 * 1024 * 1024 * 1024; // 2 GB

function fmtMB(bytes) { return (bytes / 1024 / 1024).toFixed(1) + ' MB'; }

// Sposta un file (rename) con fallback alla copia se sorgente e destinazione
// stanno su filesystem diversi: evita di duplicare su disco upload multi-GB.
function moveFile(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.copyFileSync(src, dest);
    fs.rmSync(src, { force: true });
  }
}

function getDocumentStats(document) {
  const root = document.getRoot();
  const meshes = root.listMeshes();
  let totalVertices = 0;
  const primitives = meshes.reduce((n, m) => {
    for (const prim of m.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (pos) totalVertices += pos.getCount();
    }
    return n + m.listPrimitives().length;
  }, 0);
  return {
    meshes:     meshes.length,
    primitives,
    accessors:  root.listAccessors().length,
    buffers:    root.listBuffers().length,
    nodes:      root.listNodes().length,
    vertices:   totalVertices,
  };
}

function concurrencyGuard(req, res, next) {
  if (activeJobs >= MAX_CONCURRENT) {
    return res.status(503).json({ error: `Server occupato (${activeJobs}/${MAX_CONCURRENT} job attivi). Riprova tra poco.` });
  }
  activeJobs++;
  let released = false;
  const release = () => { if (!released) { released = true; activeJobs--; } };
  res.on('finish', release);
  res.on('close',  release);
  next();
}

const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `glbopt_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB per file

// Multer per file GLB/GLTF
const uploadGLB = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(glb|gltf)$/i))
      return cb(new Error('Solo file .glb e .gltf sono supportati'));
    cb(null, true);
  },
});

// Multer per OBJ + MTL + texture
const uploadOBJ = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(obj|mtl|png|jpg|jpeg|bmp|tga|webp|gif)$/i))
      return cb(new Error(`Formato non supportato: ${path.extname(file.originalname)}`));
    cb(null, true);
  },
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', activeJobs, maxConcurrent: MAX_CONCURRENT });
});

// NodeIO singleton con moduli Draco. La variante "streaming" della lettura
// Draco sostituisce quella di serie, che tiene tutte le mesh decodificate in
// memoria WASM contemporaneamente e abortisce sui GLB con molti vertici.
let io = null;
async function getIO() {
  if (!io) {
    const encoder = await draco3d.createEncoderModule();
    const decoder = await draco3d.createDecoderModule();
    // ALL_EXTENSIONS e non KHRONOS_EXTENSIONS: quest'ultimo contiene solo le
    // KHR_, quindi EXT_texture_webp non veniva registrato e textureCompress
    // produceva GLB con immagini image/webp agganciate a textures[].source
    // senza dichiarare l'estensione — fuori specifica, e invisibili a molti
    // visualizzatori. È il warning "Some extensions were not registered for I/O".
    io = new NodeIO()
      .registerExtensions([
        ...ALL_EXTENSIONS.filter((E) => E !== KHRDracoMeshCompression),
        KHRDracoMeshCompressionStreaming,
      ])
      .registerDependencies({ 'draco3d.encoder': encoder, 'draco3d.decoder': decoder });
  }
  return io;
}

// Un abort del WASM Draco (esaurimento memoria) rende inutilizzabile il
// modulo: il singleton va ricreato alla richiesta successiva, e all'utente
// va spiegato il problema invece di mostrare "Aborted()".
function handleWasmAbort(err) {
  if (!(err instanceof WebAssembly.RuntimeError)) return err;
  io = null;
  return new Error(
    'Memoria del codec Draco esaurita durante l\'elaborazione: il modello ha troppa geometria ' +
    'per essere processato in un blocco solo. Riprova, oppure riduci il modello prima di ottimizzarlo.'
  );
}

async function applyTransforms(document, opts, fileSizeBytes = 0) {
  const isLarge = fileSizeBytes > LARGE_FILE_THRESHOLD;
  const skipped = [];
  const transforms = [];
  const applied = [];

  if (opts.weld === 'true') {
    const tolerance = parseFloat(opts.weldTolerance);
    const t = isFinite(tolerance) ? tolerance : 1e-4;
    transforms.push(weld({ tolerance: t }));
    applied.push(`weld(${t})`);
  }

  if (opts.dedup === 'true') {
    if (isLarge) { skipped.push('dedup'); }
    else { transforms.push(dedup()); applied.push('dedup'); }
  }
  if (opts.prune === 'true') {
    if (isLarge) { skipped.push('prune'); }
    else { transforms.push(prune()); applied.push('prune'); }
  }

  if (opts.texture === 'webp' || opts.texture === 'jpeg') {
    const quality = Math.max(1, Math.min(100, parseInt(opts.textureQuality) || (opts.texture === 'webp' ? 80 : 85)));
    transforms.push(textureCompress({ encoder: sharp, targetFormat: opts.texture, quality }));
    applied.push(`texture(${opts.texture} q${quality})`);
  }

  if (opts.draco === 'true') {
    const speed = Math.max(0, Math.min(10, parseInt(opts.dracoSpeed) || 5));
    // quantizationVolume di serie è 'mesh': ogni mesh (qui ogni tile) avrebbe
    // la propria griglia, e i vertici in comune fra due tile finirebbero in
    // punti diversi — fessure sottili lungo le giunzioni. 'scene' ne usa una
    // sola. Le UV a 12 bit lasciano frange ai bordi dei chart su un atlante 8K:
    // 14 bit costano pochissimo e le tolgono.
    transforms.push(draco({
      encodeSpeed: speed,
      decodeSpeed: speed,
      quantizationVolume: 'scene',
      quantizeTexcoord: 14,
    }));
    applied.push(`draco(speed=${speed}, volume=scene, uv=14bit)`);
  }

  if (isLarge && skipped.length > 0)
    console.warn(`  ⚠ File grande (${fmtMB(fileSizeBytes)}) — disabilitati automaticamente: ${skipped.join(', ')}`);

  if (transforms.length > 0) {
    console.log(`  Transforms: ${applied.join(', ')}`);
    await document.transform(...transforms);
  }

  // L'encoder Draco (WASM a 32 bit) non riesce a codificare primitive con
  // troppe decine di milioni di vertici: le suddivide in blocchi più piccoli.
  if (opts.draco === 'true') {
    const nSplit = splitLargePrimitives(document);
    if (nSplit > 0)
      console.log(`  ⚙ ${nSplit} primitive oltre ${MAX_DRACO_VERTS.toLocaleString('it-IT')} vertici suddivise per la codifica Draco`);
  }
}

// La compressione Draco avviene in fase di scrittura, quindi la dimensione
// dell'output non compresso è stimabile solo quando Draco è disattivato: in
// quel caso, se supererebbe il limite uint32 del formato GLB, meglio fallire
// subito con un messaggio chiaro invece di scrivere un file corrotto.
function assertGLBWritable(document, opts) {
  if (opts.draco === 'true') return;
  const root = document.getRoot();
  let bytes = 0;
  for (const a of root.listAccessors())
    bytes += a.getCount() * a.getElementSize() * a.getComponentSize();
  for (const t of root.listTextures())
    bytes += t.getImage()?.byteLength || 0;
  if (bytes >= GLB_MAX_SIZE * 0.98) {
    throw new Error(
      `L'output non compresso (~${fmtMB(bytes)}) supererebbe il limite del formato GLB (4,29 GB). ` +
      `Abilita la compressione Draco e riprova.`
    );
  }
}

// ─── Endpoint: Ottimizza GLB / GLTF ─────────────────────────────────────────
app.post('/optimize', concurrencyGuard, uploadGLB.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });

  const t0 = Date.now();
  const inputPath  = req.file.path;
  const outputPath = inputPath.replace(/(\.\w+)$/, '_opt.glb');
  const inputSize  = req.file.size;
  console.log(`[optimize] ${req.file.originalname} (${fmtMB(inputSize)})`);

  try {
    // Il formato GLB usa lunghezze uint32: un file oltre questa soglia è per
    // forza fuori specifica (o corrotto) e non può essere letto correttamente.
    if (inputSize > GLB_MAX_SIZE && /\.glb$/i.test(req.file.originalname)) {
      const err = new Error(
        `Il file (${fmtMB(inputSize)}) supera il limite del formato GLB (4,29 GB, lunghezze uint32): ` +
        `è fuori specifica e non può essere letto correttamente. ` +
        `Riesporta il modello come OBJ e usa la conversione OBJ → GLB di questo tool.`
      );
      err.statusCode = 400;
      throw err;
    }

    // Safety per versioni di Node < 22: fs.readFileSync non può leggere file
    // più grandi del massimo allocabile in un singolo Buffer.
    if (inputSize >= MAX_NODEJS_BUFFER) {
      throw new Error(
        `File troppo grande per essere elaborato (${fmtMB(inputSize)}). ` +
        `Questa versione server non può leggere file >= ${fmtMB(MAX_NODEJS_BUFFER)} in un singolo buffer: ` +
        `aggiorna Node.js alla versione 22 o superiore.`
      );
    }

    const nodeIO   = await getIO();
    const document = await nodeIO.read(inputPath);

    // Verifica che il documento contenga effettivamente della geometria
    const statsIn = getDocumentStats(document);
    console.log(`  Letto: ${statsIn.meshes} mesh, ${statsIn.primitives} primitive, ${statsIn.vertices} vertici, ${statsIn.accessors} accessor, ${statsIn.buffers} buffer`);
    if (statsIn.meshes === 0 || statsIn.vertices === 0) {
      throw new Error(
        `Il file GLB non contiene geometria (${statsIn.meshes} mesh, ${statsIn.vertices} vertici). ` +
        'Il file potrebbe essere corrotto, vuoto, o essere un GLTF con risorse esterne mancanti.'
      );
    }

    await applyTransforms(document, req.body, inputSize);

    // Verifica post-trasformazione: se tutte le mesh sono sparite, c'è un problema
    const statsOut = getDocumentStats(document);
    console.log(`  Dopo transforms: ${statsOut.meshes} mesh, ${statsOut.primitives} primitive, ${statsOut.vertices} vertici, ${statsOut.accessors} accessor`);
    if (statsOut.vertices === 0 && statsIn.vertices > 0) {
      throw new Error(
        `Tutta la geometria è stata persa durante l\'ottimizzazione (${statsIn.vertices} vertici → 0). ` +
        `Prova a disabilitare Prune e Dedup, oppure riduci il file con Blender prima di ottimizzarlo.`
      );
    }

    assertGLBWritable(document, req.body);
    await nodeIO.write(outputPath, document);

    const outputSize = fs.statSync(outputPath).size;

    // Sanity check dimensione output: se è < 0.5% dell'input su file grandi,
    // quasi certamente la geometria è andata persa.
    const MIN_RATIO = 0.005;
    if (inputSize > 10 * 1024 * 1024 && outputSize < inputSize * MIN_RATIO) {
      throw new Error(
        `Output sospettosamente piccolo (${fmtMB(outputSize)} da ${fmtMB(inputSize)}). ` +
        `La geometria potrebbe essere andata persa. ` +
        `Prova a disabilitare Prune e Dedup e riprova.`
      );
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const pct     = Math.round((1 - outputSize / inputSize) * 100);
    console.log(`[optimize] Done in ${elapsed}s — ${fmtMB(inputSize)} → ${fmtMB(outputSize)} (${pct > 0 ? '-' : '+'}${Math.abs(pct)}%)`);

    res.setHeader('X-Input-Size',  inputSize);
    res.setHeader('X-Output-Size', outputSize);
    res.setHeader('X-Elapsed-Ms',  Date.now() - t0);
    res.setHeader('Access-Control-Expose-Headers', 'X-Input-Size, X-Output-Size, X-Elapsed-Ms');

    const outputName = req.file.originalname.replace(/\.(glb|gltf)$/i, '_optimized.glb');
    res.download(outputPath, outputName, () => {
      fs.rmSync(inputPath,  { force: true });
      fs.rmSync(outputPath, { force: true });
    });

  } catch (rawErr) {
    const err = handleWasmAbort(rawErr);
    fs.rmSync(inputPath, { force: true });
    if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });
    console.error(`[optimize] Error after ${((Date.now() - t0) / 1000).toFixed(1)}s:`, err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Errore durante l\'ottimizzazione' });
  }
});

// ─── Endpoint: Converti OBJ → GLB ───────────────────────────────────────────
app.post('/convert', concurrencyGuard, (req, res) => {
  uploadOBJ.fields([
    { name: 'obj',      maxCount: 1   },
    { name: 'mtl',      maxCount: 100 },
    { name: 'textures', maxCount: 200 },
  ])(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files?.obj?.[0])
      return res.status(400).json({ error: 'Nessun file OBJ caricato' });

    const t0 = Date.now();
    const objFile     = req.files.obj[0];
    const mtlFiles    = req.files?.mtl || [];
    const texFiles    = req.files?.textures || [];
    const allUploaded = [objFile, ...mtlFiles, ...texFiles];
    console.log(`[convert] ${objFile.originalname} (${(objFile.size/1024/1024).toFixed(1)} MB) + ${mtlFiles.length} MTL + ${texFiles.length} textures`);

    const tempDir       = path.join(os.tmpdir(), `obj2glb_${Date.now()}`);
    const objDest       = path.join(tempDir, objFile.originalname);
    const rawGlbPath    = path.join(tempDir, 'raw.glb');
    const optimizedPath = path.join(tempDir, 'optimized.glb');

    const cleanup = () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      for (const f of allUploaded) fs.rmSync(f.path, { force: true });
    };

    try {
      fs.mkdirSync(tempDir, { recursive: true });

      // Copia tutti i file con il nome originale nella stessa directory
      for (const m of mtlFiles)
        fs.copyFileSync(m.path, path.join(tempDir, m.originalname));
      for (const t of texFiles)
        fs.copyFileSync(t.path, path.join(tempDir, t.originalname));

      // Scansiona le prime righe dell'OBJ per trovare le direttive mtllib
      // esistenti, senza caricare l'intero file in memoria (supporta OBJ >512MB).
      if (mtlFiles.length > 0) {
        const refSet = new Set();
        const rl = readline.createInterface({
          input: fs.createReadStream(objFile.path, { encoding: 'utf8' }),
          crlfDelay: Infinity,
        });
        for await (const line of rl) {
          const m = line.match(/^\s*mtllib\s+(.+)$/i);
          if (m) m[1].trim().split(/\s+/).forEach(n => refSet.add(n));
        }
        const missing = mtlFiles
          .map(m => m.originalname)
          .filter(n => !refSet.has(n));
        if (missing.length > 0) {
          const header = `mtllib ${missing.join(' ')}\n`;
          fs.writeFileSync(objDest, header);
          await new Promise((resolve, reject) => {
            const src = fs.createReadStream(objFile.path);
            const dst = fs.createWriteStream(objDest, { flags: 'a' });
            src.pipe(dst);
            dst.on('finish', resolve);
            dst.on('error', reject);
          });
        } else {
          moveFile(objFile.path, objDest);
        }
      } else {
        moveFile(objFile.path, objDest);
      }

      const nodeIO = await getIO();
      let gltfDoc;

      if (needsStreamConvert(objDest)) {
        gltfDoc = await streamConvertOBJ(objDest, tempDir);
      } else {
        const glbBuffer = await obj2gltf(objDest, { binary: true });
        fs.writeFileSync(rawGlbPath, glbBuffer);
        gltfDoc = await nodeIO.read(rawGlbPath);
      }

      // Verifica geometria prima delle trasformazioni
      const statsIn = getDocumentStats(gltfDoc);
      console.log(`  Convertito: ${statsIn.meshes} mesh, ${statsIn.primitives} primitive, ${statsIn.vertices} vertici, ${statsIn.accessors} accessor`);
      if (statsIn.meshes === 0 || statsIn.vertices === 0) {
        throw new Error(
          `Il file OBJ non contiene geometria leggibile (${statsIn.meshes} mesh, ${statsIn.vertices} vertici). ` +
          `Verificare che il file non sia vuoto o corrotto.`
        );
      }

      await applyTransforms(gltfDoc, req.body, objFile.size);

      const statsOut = getDocumentStats(gltfDoc);
      console.log(`  Dopo transforms: ${statsOut.meshes} mesh, ${statsOut.primitives} primitive, ${statsOut.vertices} vertici, ${statsOut.accessors} accessor`);
      if (statsOut.vertices === 0 && statsIn.vertices > 0) {
        throw new Error(
          `Tutta la geometria è stata persa durante l\'ottimizzazione (${statsIn.vertices} vertici → 0). ` +
          `Prova a disabilitare Prune e Dedup.`
        );
      }

      assertGLBWritable(gltfDoc, req.body);
      await nodeIO.write(optimizedPath, gltfDoc);

      const inputSize  = objFile.size;
      const outputSize = fs.statSync(optimizedPath).size;

      // Sanity check: output sospettosamente piccolo rispetto all'input
      const MIN_RATIO = 0.005;
      if (inputSize > 10 * 1024 * 1024 && outputSize < inputSize * MIN_RATIO) {
        throw new Error(
          `Output sospettosamente piccolo (${fmtMB(outputSize)} da OBJ di ${fmtMB(inputSize)}). ` +
          `La geometria potrebbe essere andata persa. ` +
          `Prova a disabilitare Prune e Dedup e riprova.`
        );
      }

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[convert] Done in ${elapsed}s — OBJ ${fmtMB(inputSize)} → GLB ${fmtMB(outputSize)}`);

      res.setHeader('X-Input-Size',  inputSize);
      res.setHeader('X-Output-Size', outputSize);
      res.setHeader('X-Elapsed-Ms',  Date.now() - t0);
      res.setHeader('Access-Control-Expose-Headers', 'X-Input-Size, X-Output-Size, X-Elapsed-Ms');

      const outputName = objFile.originalname.replace(/\.obj$/i, '_converted.glb');
      res.download(optimizedPath, outputName, () => cleanup());

    } catch (rawErr) {
      const err = handleWasmAbort(rawErr);
      cleanup();
      console.error(`[convert] Error after ${((Date.now() - t0) / 1000).toFixed(1)}s:`, err.message);
      res.status(500).json({ error: err.message || 'Errore durante la conversione OBJ → GLB' });
    }
  });
});

// Gestione errori multer
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ error: 'File troppo grande (max 5 GB)' });
  res.status(400).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`\n✓ GLB Optimizer pronto → http://localhost:${PORT} (max ${MAX_CONCURRENT} job concorrenti)\n`));

// Il default di Node (300 s) tronca gli upload multi-GB su reti lente
// (5 GB a 100 Mbps ≈ 7 minuti): nessun timeout sulla ricezione della request.
server.requestTimeout = 0;

if (MAX_NODEJS_BUFFER < MAX_FILE_SIZE) {
  console.warn(
    `⚠ Questa versione di Node.js legge al massimo ${fmtMB(MAX_NODEJS_BUFFER)} per file: ` +
    `per supportare GLB fino al limite di formato (4,29 GB) serve Node.js >= 22.`
  );
}

function shutdown(signal) {
  console.log(`\n${signal} ricevuto — chiusura in corso…`);
  server.close(() => {
    console.log('Server chiuso.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
