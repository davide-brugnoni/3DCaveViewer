// 3D Cave Viewer — controllo dell'upload sulla GPU e pannello diagnostico.
//
// Su iPhone un modello troppo pesante per la GPU non sempre fa perdere il
// contesto WebGL: spesso gl.bufferData()/texImage2D() falliscono con
// GL_OUT_OF_MEMORY e Three.js, che non legge gl.getError(), continua a
// disegnare buffer vuoti. Il risultato è una scena nera senza alcun errore.
// checkGpuUpload() fa un render esplicito e legge l'errore subito dopo.
//
// Con ?debug=1 nell'URL il viewer mostra un riquadro con i numeri del
// modello e del dispositivo, da fotografare quando un problema si presenta
// solo su un telefono (dove la console non è raggiungibile).

const GL_ERRORS = {
  0x0500: 'INVALID_ENUM',
  0x0501: 'INVALID_VALUE',
  0x0502: 'INVALID_OPERATION',
  0x0505: 'OUT_OF_MEMORY',
  0x0506: 'INVALID_FRAMEBUFFER_OPERATION',
  0x9242: 'CONTEXT_LOST_WEBGL'
};
const GL_OUT_OF_MEMORY = 0x0505;

export const debugEnabled = new URLSearchParams(location.search).get('debug') === '1';

// Svuota la coda degli errori GL (getError ne restituisce uno per chiamata)
function drainGlErrors(gl) {
  const errors = [];
  for (let i = 0; i < 16; i++) {
    const err = gl.getError();
    if (err === gl.NO_ERROR) break;
    errors.push(err);
  }
  return errors;
}

/**
 * Disegna un frame e riporta gli errori GL che ha prodotto. È il primo render
 * dopo il caricamento a caricare geometrie e texture sulla GPU.
 * getError() costa un giro completo con il processo GPU: va chiamata una volta
 * per modello, non nel loop di rendering.
 */
export function checkGpuUpload(renderer, scene, camera) {
  const gl = renderer.getContext();
  if (!gl || gl.isContextLost?.()) return { outOfMemory: false, errors: [] };
  drainGlErrors(gl);
  renderer.render(scene, camera);
  const errors = drainGlErrors(gl);
  return {
    outOfMemory: errors.includes(GL_OUT_OF_MEMORY),
    errors: errors.map((e) => GL_ERRORS[e] || `0x${e.toString(16)}`)
  };
}

export function collectModelStats(root) {
  let meshes = 0, vertices = 0, triangles = 0, largestBuffer = 0, geometryBytes = 0;
  const textures = new Map();
  const seenArrays = new Set();
  root.traverse((ch) => {
    if (!ch.isMesh || !ch.geometry) return;
    meshes++;
    const g = ch.geometry;
    const pos = g.attributes.position;
    if (pos) vertices += pos.count;
    triangles += Math.floor((g.index ? g.index.count : (pos?.count || 0)) / 3);
    [g.index, ...Object.values(g.attributes)].forEach((attr) => {
      const array = attr?.array || attr?.data?.array;
      if (!array || seenArrays.has(array)) return;
      seenArrays.add(array);
      geometryBytes += array.byteLength;
      largestBuffer = Math.max(largestBuffer, array.byteLength);
    });
    const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
    mats.forEach((m) => {
      ['map', 'lightMap', 'alphaMap'].forEach((key) => {
        const tex = m?.[key];
        const img = tex?.image;
        if (img && !textures.has(img)) textures.set(img, tex.userData?.decodedSize || `${img.width}×${img.height}`);
      });
    });
  });
  return { meshes, vertices, triangles, largestBuffer, geometryBytes, textures: [...textures.values()] };
}

let panel = null;
let baseLines = [];
const events = [];

function renderPanel() {
  if (!debugEnabled) return;
  if (!panel) {
    panel = document.createElement('pre');
    panel.id = 'debug-panel';
    panel.style.cssText = 'position:fixed;left:8px;top:80px;z-index:9999;max-width:calc(100vw - 16px);' +
      'max-height:60vh;overflow:auto;margin:0;padding:8px;font:11px/1.35 monospace;white-space:pre-wrap;' +
      'color:#fff;background:rgba(0,0,0,.75);border-radius:6px;pointer-events:auto;';
    document.body.appendChild(panel);
  }
  panel.textContent = [...baseLines, ...events].filter(Boolean).join('\n');
}

// Righe fisse (dispositivo, modello corrente): sostituiscono le precedenti
export function showDiagnostics(lines) {
  baseLines = lines;
  renderPanel();
}

// Eventi (perdita del contesto, errori GPU…): si accumulano sotto
export function logDiagnostic(message) {
  if (!debugEnabled) return;
  const t = (performance.now() / 1000).toFixed(1);
  events.push(`[${t}s] ${message}`);
  if (events.length > 20) events.shift();
  renderPanel();
}
