// 3D Cave Viewer — parsing GLB a memoria contenuta e tetto alle texture.
//
// Il download a copia singola (model-loader.js) non bastava: molti modelli
// che mandano in crash la scheda sui telefoni non sono nemmeno grandi. Un GLB
// da 8 MB con una texture JPEG 8192×8192 diventa, una volta decodificata,
// 256 MB di pixel in RAM più ~340 MB sulla GPU (mipmap comprese), e Three.js
// tiene entrambe le copie finché il modello resta a schermo. Cinque texture
// 4096×4096 fanno lo stesso effetto. Qui si interviene in due punti:
//
// 1. Texture: su mobile le immagini vengono decodificate direttamente alla
//    risoluzione che il dispositivo può permettersi (lato massimo e budget
//    complessivo di pixel per modello), invece di caricarle intere e lasciare
//    che sia il sistema operativo a chiudere la scheda.
//
// 2. Parsing: GLTFLoader.parse(ArrayBuffer) copia l'intero chunk binario del
//    GLB (`data.slice()` in GLTFBinaryExtension) prima di cominciare, quindi
//    per un file da 100 MB se ne tengono in memoria 200. Qui l'intestazione
//    GLB viene letta a mano, gli offset dei bufferView vengono spostati
//    sull'intero file e il loader riceve direttamente quel buffer: la copia
//    del chunk non avviene più.
//
// Tutto passa da un plugin di GLTFLoader che sostituisce, sulla sola istanza
// del parser del caricamento in corso, loadBuffer() e loadImageSource().
// Three.js è fissato alla r160 (lib/three/), di cui si replicano i contratti.

import { Texture } from 'three';
import { logDiagnostic } from './diagnostics.js';

const GLB_MAGIC = 0x46546C67;       // 'glTF'
const GLB_CHUNK_JSON = 0x4E4F534A;  // 'JSON'
const GLB_CHUNK_BIN = 0x004E4942;   // 'BIN\0'
const MESHOPT_EXTENSIONS = ['EXT_meshopt_compression', 'KHR_meshopt_compression'];
const PLUGIN_NAME = 'CAVEVIEWER_memory';
const MIN_BUDGET_SIDE = 1024;

// Lavoro del parse in corso. GLTFLoader.parse() invoca i plugin in modo
// sincrono, quindi il valore impostato subito prima viene consumato dallo
// stesso parse e da nessun altro.
let pendingJob = null;
const pluginInstalled = new WeakSet();

// ---------------------------------------------------------------------------
// Contenitore GLB
// ---------------------------------------------------------------------------

function splitGlb(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20) return null;
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) return null;

  const length = Math.min(view.getUint32(8, true), buffer.byteLength);
  let offset = 12;
  let json = null;
  let binStart = -1;

  while (offset + 8 <= length) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + chunkLength > length) return null;
    if (chunkType === GLB_CHUNK_JSON && json === null) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, chunkLength)));
    } else if (chunkType === GLB_CHUNK_BIN && binStart < 0) {
      binStart = start;
    }
    offset = start + chunkLength;
  }

  return json ? { json, binStart } : null;
}

// Sposta gli offset che puntano al buffer interno del GLB (il buffer 0 senza
// uri) dall'inizio del chunk BIN all'inizio del file. Oltre ai bufferView
// servono quelli di meshopt, che leggono dal buffer con offset propri.
function rebaseGlbOffsets(json, binStart) {
  const internal = json.buffers?.[0];
  if (!internal || internal.uri !== undefined) return false;
  if (binStart < 0) return false;

  for (const bufferView of json.bufferViews || []) {
    if (bufferView.buffer === 0) {
      bufferView.byteOffset = (bufferView.byteOffset || 0) + binStart;
    }
    for (const name of MESHOPT_EXTENSIONS) {
      const ext = bufferView.extensions?.[name];
      if (ext && ext.buffer === 0) ext.byteOffset = (ext.byteOffset || 0) + binStart;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Dimensioni delle immagini lette dall'intestazione (niente decodifica)
// ---------------------------------------------------------------------------

export function readImageSize(buffer) {
  const bytes = ArrayBuffer.isView(buffer)
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(buffer.byteLength, 1 << 20))
    : new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1 << 20));
  const n = bytes.length;
  const u16be = (i) => (bytes[i] << 8) | bytes[i + 1];
  const u32be = (i) => ((bytes[i] << 24) >>> 0) + ((bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]);
  const u24le = (i) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);

  // PNG: IHDR è sempre il primo chunk
  if (n >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return { width: u32be(16), height: u32be(20) };
  }

  // JPEG: si scorrono i segmenti fino al primo SOFn
  if (n >= 4 && bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let i = 2;
    while (i + 9 < n) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xFF) { i++; continue; }
      if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
      const isSof = marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
      if (isSof) return { width: u16be(i + 7), height: u16be(i + 5) };
      i += 2 + u16be(i + 2);
    }
    return null;
  }

  // WebP: RIFF....WEBP seguito da VP8 / VP8L / VP8X
  if (n >= 30 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    const fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (fourcc === 'VP8 ') {
      return { width: (bytes[26] | (bytes[27] << 8)) & 0x3FFF, height: (bytes[28] | (bytes[29] << 8)) & 0x3FFF };
    }
    if (fourcc === 'VP8L') {
      const b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
      return {
        width: 1 + (((b1 & 0x3F) << 8) | bytes[21]),
        height: 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
      };
    }
    if (fourcc === 'VP8X') {
      return { width: 1 + u24le(24), height: 1 + u24le(27) };
    }
  }

  return null;
}

// Dimensione di destinazione di ogni immagine: prima un fattore comune che
// porta il totale dei pixel sotto il budget del modello, poi il tetto sul
// lato più lungo. null = l'immagine resta com'è.
function planTargetSizes(sizes, { maxSize, maxPixels }) {
  const total = sizes.reduce((sum, s) => sum + (s ? s.width * s.height : 0), 0);
  const shared = maxPixels > 0 && total > maxPixels ? Math.sqrt(maxPixels / total) : 1;
  const valid = (size) => size && size.width && size.height;
  const scaleFor = (size, withFloor) => {
    const longest = Math.max(size.width, size.height);
    let scale = withFloor ? Math.max(shared, Math.min(1, MIN_BUDGET_SIDE / longest)) : shared;
    if (maxSize > 0 && longest * scale > maxSize) scale = maxSize / longest;
    return scale;
  };

  // Le texture piccole non sono il problema: il budget non le scende sotto
  // MIN_BUDGET_SIDE, per non sfocare dettagli che costano poco. Ma con molte
  // texture grandi quel pavimento sfora il budget da solo (26 immagini da
  // 1024² sono già 26 MP) e rende inutile il nuovo tentativo a texture
  // ridotte dopo un OUT_OF_MEMORY: in quel caso vale solo il fattore comune.
  const flooredTotal = sizes.reduce((sum, s) => {
    if (!valid(s)) return sum;
    const k = Math.min(1, scaleFor(s, true));
    return sum + s.width * s.height * k * k;
  }, 0);
  const useFloor = !(maxPixels > 0) || flooredTotal <= maxPixels * 1.001;

  return sizes.map((size) => {
    if (!valid(size)) return null;
    const scale = scaleFor(size, useFloor);
    if (scale >= 0.999) return null;
    return {
      width: Math.max(1, Math.floor(size.width * scale)),
      height: Math.max(1, Math.floor(size.height * scale))
    };
  });
}

// ---------------------------------------------------------------------------
// Decodifica ridotta
// ---------------------------------------------------------------------------

function loadImageElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Immagine non decodificabile')); };
    img.src = url;
  });
}

// release() libera la sorgente subito dopo il disegno: altrimenti l'immagine
// intera (256 MB per un 8192²), il canvas e la bitmap finale restano vivi
// tutti insieme fino alla fine della conversione.
async function drawScaled(source, width, height, release) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // null quando Safari su iOS ha esaurito la memoria dei canvas
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    release?.();
    throw new Error('Canvas 2D non disponibile');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  release?.();

  // Da canvas a ImageBitmap: Safari su iOS ha un tetto complessivo alla
  // memoria dei canvas della pagina, e tenere lì le texture lo esaurirebbe.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(canvas);
      canvas.width = canvas.height = 0;
      return bitmap;
    } catch { /* si tiene il canvas */ }
  }
  return canvas;
}

async function decodeScaled(bytes, mimeType, width, height) {
  const blob = new Blob([bytes], { type: mimeType });

  if (typeof createImageBitmap === 'function') {
    let bitmap = null;
    try {
      // Stesse opzioni dell'ImageBitmapLoader usato da GLTFLoader, più la
      // riduzione: dove è supportata il pixel intero non resta mai in memoria
      bitmap = await createImageBitmap(blob, {
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'high'
      });
    } catch {
      bitmap = null;
    }
    if (bitmap) {
      if (bitmap.width === width && bitmap.height === height) return bitmap;
      // Opzioni di ridimensionamento ignorate: si riduce a mano
      logDiagnostic(`resize ignorato: ${bitmap.width}×${bitmap.height} → ${width}×${height}`);
      const full = bitmap;
      return drawScaled(full, width, height, () => full.close?.());
    }
  }

  const img = await loadImageElement(blob);
  return drawScaled(img, width, height, () => img.removeAttribute('src'));
}

function abortError() {
  const err = new Error('Caricamento sostituito da un altro modello');
  err.name = 'AbortError';
  return err;
}

// Texture grigia 1×1: ultima risorsa quando nemmeno la versione ridotta si
// riesce a decodificare. Un modello senza colori è meglio di una scheda chiusa.
function placeholderTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, 0, 1, 1);
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

function patchBuffer(parser, glb) {
  const original = parser.loadBuffer;
  parser.loadBuffer = function (bufferIndex) {
    if (bufferIndex === 0 && this.json.buffers?.[0]?.uri === undefined) {
      return Promise.resolve(glb);
    }
    return original.call(this, bufferIndex);
  };
}

function patchImages(parser, limits, glb, isStale) {
  const images = parser.json.images || [];
  if (images.length === 0) return;

  const original = parser.loadImageSource;
  let plan = null;

  // Le decodifiche ridotte vanno in fila, una alla volta. GLTFLoader chiede
  // tutte le texture insieme, e il browser (Chrome su Android, Safari quando
  // ignora resizeWidth) decodifica comunque l'immagine intera prima di
  // ridurla: 22 texture 8192² in parallelo erano 22 × 256 MB nello stesso
  // istante, quasi 3 GB al picco per un modello che a regime ne usa 600.
  let decodeQueue = Promise.resolve();
  const enqueueDecode = (task) => {
    const run = decodeQueue.then(task, task);
    decodeQueue = run.catch(() => {});
    return run;
  };

  // Byte dell'immagine letti direttamente dal file scaricato. getDependency
  // ('bufferView') ne fa una copia (buffer.slice) che resta nella cache del
  // parser fino alla fine: per una PNG da 86 MB sono 86 MB in più al picco.
  const imageBytes = (def) => {
    const bv = parser.json.bufferViews?.[def.bufferView];
    if (glb && bv && bv.buffer === 0 && !bv.extensions) {
      return Promise.resolve(new Uint8Array(glb, bv.byteOffset || 0, bv.byteLength));
    }
    return parser.getDependency('bufferView', def.bufferView);
  };

  const getPlan = () => {
    if (!plan) {
      plan = Promise.all(images.map((def) => {
        if (def.bufferView === undefined) return null;
        return imageBytes(def)
          .then((view) => readImageSize(view))
          .catch(() => null);
      })).then((sizes) => planTargetSizes(sizes, limits));
    }
    return plan;
  };

  parser.loadImageSource = function (sourceIndex, loader) {
    const cached = this.sourceCache[sourceIndex];
    if (cached !== undefined) return cached.then((texture) => texture.clone());

    const def = this.json.images[sourceIndex];
    // KTX2/Basis (loader dedicato) e immagini esterne: percorso standard
    if (!def || def.bufferView === undefined || loader !== this.textureLoader) {
      return original.call(this, sourceIndex, loader);
    }

    const promise = getPlan().then((targets) => {
      const target = targets[sourceIndex];
      if (!target) {
        // Nessuna riduzione: il percorso originale registra la propria
        // promessa nella cache, che altrimenti troverebbe questa (e la
        // aspetterebbe all'infinito)
        delete this.sourceCache[sourceIndex];
        return original.call(this, sourceIndex, loader);
      }
      const mimeType = def.mimeType || 'image/jpeg';
      const decode = async () => {
        // Il modello è già stato sostituito da un altro: inutile decodificare
        // (e tenere in memoria) una texture che verrebbe buttata
        if (isStale?.()) throw abortError();
        const bytes = await imageBytes(def);
        try {
          return await decodeScaled(bytes, mimeType, target.width, target.height);
        } catch (err) {
          if (isStale?.()) throw abortError();
          // Memoria insufficiente anche per la riduzione: si riprova a metà.
          // Tornare all'immagine intera, come si faceva prima, voleva dire
          // 256 MB di pixel proprio sul dispositivo che li aveva appena rifiutati.
          console.warn('Riduzione texture non riuscita, riprovo a metà risoluzione:', err);
          logDiagnostic(`texture ${sourceIndex}: riduzione fallita (${err?.message || err}), riprovo a metà`);
          try {
            return await decodeScaled(bytes, mimeType,
              Math.max(1, target.width >> 1), Math.max(1, target.height >> 1));
          } catch (err2) {
            console.warn('Texture non caricabile su questo dispositivo:', err2);
            logDiagnostic(`texture ${sourceIndex}: sostituita da grigio (${err2?.message || err2})`);
            return placeholderTexture();
          }
        }
      };
      return enqueueDecode(decode).then((image) => {
        const texture = new Texture(image);
        texture.needsUpdate = true;
        texture.userData.mimeType = def.mimeType;
        return texture;
      });
    });

    this.sourceCache[sourceIndex] = promise;
    return promise;
  };
}

function memoryPlugin(parser) {
  const job = pendingJob;
  pendingJob = null;
  if (job) {
    if (job.glb) patchBuffer(parser, job.glb);
    if (job.textureLimits) patchImages(parser, job.textureLimits, job.glb, job.isStale);
  }
  return { name: PLUGIN_NAME };
}

/**
 * Parsing di un GLB/GLTF con le due ottimizzazioni descritte in testa al file.
 *
 * @param {import('three/addons/loaders/GLTFLoader.js').GLTFLoader} loader
 * @param {ArrayBuffer} buffer
 * @param {string} path
 * @param {{ maxSize: number, maxPixels: number } | null} textureLimits
 *        null o valori 0 = nessun tetto alle texture
 * @param {(gltf: object) => void} onLoad
 * @param {(err: Error) => void} onError
 * @param {() => boolean} [isStale] true quando il caricamento è stato
 *        sostituito da un altro: le texture non ancora decodificate vengono
 *        saltate e il parse termina con un AbortError
 */
export function parseGltfLean(loader, buffer, path, textureLimits, onLoad, onError, isStale) {
  if (!pluginInstalled.has(loader)) {
    loader.register(memoryPlugin);
    pluginInstalled.add(loader);
  }

  let data = buffer;
  let glb = null;
  try {
    const split = splitGlb(buffer);
    if (split && (split.json.buffers?.length ? rebaseGlbOffsets(split.json, split.binStart) : true)) {
      data = split.json;
      glb = split.json.buffers?.length ? buffer : null;
    }
  } catch {
    // Intestazione illeggibile: ci pensa GLTFLoader, con i suoi errori
    data = buffer;
    glb = null;
  }

  const hasLimits = textureLimits && (textureLimits.maxSize > 0 || textureLimits.maxPixels > 0);
  pendingJob = { glb, textureLimits: hasLimits ? textureLimits : null, isStale };
  try {
    loader.parse(data, path, onLoad, onError);
  } finally {
    // parse() può uscire prima di invocare i plugin (asset non valido)
    pendingJob = null;
  }
}
