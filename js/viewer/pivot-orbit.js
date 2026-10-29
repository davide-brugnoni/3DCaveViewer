// 3D Cave Viewer — rotazione col mouse attorno al punto cliccato.
//
// OrbitControls ruota sempre attorno a controls.target, che dopo un pan o
// una vista salvata può stare nel vuoto o lontano da ciò che si guarda. Qui
// il tasto sinistro del mouse fa un raycast sul modello e ruota la camera
// attorno al punto colpito (come Sketchfab o Potree); un clic nel vuoto
// ruota attorno al target di sempre. Il doppio clic porta il punto al centro
// dello schermo.
//
// La vista non scatta all'inizio del trascinamento: camera e target ruotano
// insieme attorno al pivot, quindi il target resta sull'asse di vista e il
// lookAt() di controls.update() ritrova lo stesso orientamento.
//
// Solo mouse: il touch e la penna mantengono i gesti di viewer.js.
// Come gli altri moduli, lo stato del viewer arriva per iniezione
// (initPivotOrbit(deps)) tramite getter.

import * as THREE from 'three';
import { eventManager } from './utils.js';

// Dipendenze dallo stato del viewer (impostate da initPivotOrbit)
let deps = null;

const pickRaycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pivot = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpLocal = new THREE.Vector3();
const qYaw = new THREE.Quaternion();
const qPitch = new THREE.Quaternion();
const qRot = new THREE.Quaternion();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Margine dalla verticale: guardando esattamente in alto/basso lookAt()
// degenera e la vista ruoterebbe su sé stessa
const PITCH_EPS = 0.001;
const DBLCLICK_DURATION = 350; // ms

let drag = null;           // { pointerId, lastX, lastY, moved, prevAutoRotate }
let modifierGesture = false;
let marker = null;
let recenterAnim = 0;

/** Punto del modello sotto il cursore (rispetta la sezione attiva) o null. */
function pickPoint(event) {
  const model = deps.getModel();
  const camera = deps.getCamera();
  if (!model || !camera) return null;
  const rect = deps.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  ndc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  pickRaycaster.setFromCamera(ndc, camera);
  // Senza sezione basta il primo hit (veloce col BVH); con la sezione
  // servono tutti, per scartare quelli nella parte tagliata via
  const sectioned = deps.isSectionActive();
  pickRaycaster.firstHitOnly = !sectioned;
  const hits = pickRaycaster.intersectObject(model, true);
  for (const hit of hits) {
    if (!hit.object.isMesh) continue; // linee delle misure, sprite
    if (sectioned) {
      tmpLocal.copy(hit.point);
      model.worldToLocal(tmpLocal);
      if (!deps.isPointVisible(tmpLocal)) continue;
    }
    return hit.point;
  }
  return null;
}

/** Segnaposto del pivot, visibile solo durante la rotazione. */
function createMarker() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(0.018); // frazione dell'altezza della vista
  sprite.renderOrder = 999;
  sprite.visible = false;
  sprite.name = 'pivot-marker';
  return sprite;
}

function showMarker(visible) {
  if (!marker) return;
  if (visible) marker.position.copy(pivot);
  if (marker.visible === visible) return;
  marker.visible = visible;
  deps.requestRender();
}

/**
 * Porta controls.target alla profondità del pivot, lungo l'asse di vista:
 * l'inquadratura non cambia, ma zoom e pan (che OrbitControls scala sulla
 * distanza dal target) seguono la superficie su cui si è cliccato.
 */
function alignTargetDepth(camera, controls) {
  camera.getWorldDirection(tmpDir);
  const depth = tmpDir.dot(tmpRight.subVectors(pivot, camera.position));
  if (depth > controls.minDistance) {
    controls.target.copy(camera.position).addScaledVector(tmpDir, depth);
  }
}

function rotateAroundPivot(dx, dy) {
  const camera = deps.getCamera();
  const controls = deps.getControls();
  const h = deps.domElement.clientHeight || 1;
  // Stessa scala di OrbitControls (un'altezza di schermo = un giro)
  const k = (2 * Math.PI * controls.rotateSpeed) / h;
  const yaw = -dx * k;
  let pitch = -dy * k;

  // Limita l'inclinazione appena prima della verticale
  camera.getWorldDirection(tmpDir);
  const elevation = Math.asin(THREE.MathUtils.clamp(tmpDir.y, -1, 1));
  const maxElevation = Math.PI / 2 - PITCH_EPS;
  pitch = THREE.MathUtils.clamp(elevation + pitch, -maxElevation, maxElevation) - elevation;

  tmpRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  qPitch.setFromAxisAngle(tmpRight, pitch);
  qYaw.setFromAxisAngle(WORLD_UP, yaw);
  qRot.multiplyQuaternions(qYaw, qPitch);

  camera.position.sub(pivot).applyQuaternion(qRot).add(pivot);
  controls.target.sub(pivot).applyQuaternion(qRot).add(pivot);
  camera.quaternion.premultiply(qRot);
  controls.update();
}

function onPointerDown(e) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || !deps.canOrbit()) return;
  const controls = deps.getControls();
  cancelAnimationFrame(recenterAnim);
  // Ctrl/Shift/Cmd + sinistro: lascia a OrbitControls il pan di sempre
  // (con un modificatore la sua azione ROTATE diventa PAN)
  if (e.ctrlKey || e.metaKey || e.shiftKey) {
    modifierGesture = true;
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    return;
  }
  const hit = pickPoint(e);
  pivot.copy(hit || controls.target);
  if (hit) alignTargetDepth(deps.getCamera(), controls);
  // Anche fuori dal canvas il trascinamento continua ad arrivare qui
  try { deps.domElement.setPointerCapture(e.pointerId); } catch (_) { /* puntatore già rilasciato */ }
  drag = {
    pointerId: e.pointerId,
    lastX: e.clientX,
    lastY: e.clientY,
    moved: false,
    prevAutoRotate: controls.autoRotate,
  };
  // L'autorotazione combatterebbe con il trascinamento
  controls.autoRotate = false;
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (!deps.canOrbit()) { endDrag(); return; }
  const dx = e.clientX - drag.lastX;
  const dy = e.clientY - drag.lastY;
  drag.lastX = e.clientX;
  drag.lastY = e.clientY;
  if (!dx && !dy) return;
  if (!drag.moved) {
    drag.moved = true;
    showMarker(true);
  }
  rotateAroundPivot(dx, dy);
}

function endDrag() {
  const controls = deps.getControls();
  if (modifierGesture) {
    modifierGesture = false;
    controls.mouseButtons.LEFT = null;
  }
  if (!drag) return;
  if (drag.prevAutoRotate) controls.autoRotate = true;
  drag = null;
  showMarker(false);
}

function onPointerUp(e) {
  if (drag && e.pointerId !== drag.pointerId) return;
  endDrag();
}

/** Doppio clic: il punto sotto il cursore va al centro, stessa distanza. */
function onDblClick(e) {
  if (!deps.canOrbit() || deps.isPickingTool()) return;
  const hit = pickPoint(e);
  if (!hit) return;
  const camera = deps.getCamera();
  const controls = deps.getControls();
  camera.getWorldDirection(tmpDir);
  const depth = Math.max(tmpDir.dot(tmpRight.subVectors(hit, camera.position)), controls.minDistance);
  const endTarget = hit.clone();
  const endPos = hit.clone().addScaledVector(tmpDir, -depth);
  const startTarget = controls.target.clone();
  const startPos = camera.position.clone();
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  cancelAnimationFrame(recenterAnim);
  const step = (now) => {
    const t = Math.min(1, (now - start) / DBLCLICK_DURATION);
    const k = ease(t);
    camera.position.lerpVectors(startPos, endPos, k);
    controls.target.lerpVectors(startTarget, endTarget, k);
    controls.update();
    if (t < 1) recenterAnim = requestAnimationFrame(step);
  };
  recenterAnim = requestAnimationFrame(step);
}

/**
 * deps: {
 *   domElement, scene,
 *   getCamera(), getControls(), getModel(),
 *   canOrbit()        — false in prima persona, in VR o durante un'animazione,
 *   isPickingTool()   — true se un clic sul modello serve a misure/POI,
 *   isSectionActive(), isPointVisible(localPoint),
 *   requestRender()
 * }
 */
export function initPivotOrbit(d) {
  deps = d;
  // Il sinistro non ruota più via OrbitControls: lo gestisce questo modulo.
  // Destro (pan) e rotella (zoom) restano a OrbitControls.
  deps.getControls().mouseButtons.LEFT = null;
  marker = createMarker();
  deps.scene.add(marker);

  const el = deps.domElement;
  // In capture: deve girare prima del pointerdown di OrbitControls, che
  // legge mouseButtons.LEFT per decidere l'azione
  eventManager.add(el, 'pointerdown', onPointerDown, { capture: true }, 'renderer');
  eventManager.add(el, 'pointermove', onPointerMove, false, 'renderer');
  eventManager.add(window, 'pointerup', onPointerUp, false, 'renderer');
  eventManager.add(window, 'pointercancel', onPointerUp, false, 'renderer');
  eventManager.add(el, 'dblclick', onDblClick, false, 'renderer');
}
