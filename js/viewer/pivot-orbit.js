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
// La rotazione predefinita è una trackball virtuale come quella di
// CloudCompare ('trackball'): il cursore "afferra" una sfera centrata sul
// pivot proiettato a schermo e il modello segue la mano, senza un asse
// verticale privilegiato né blocchi ai poli (la vista può quindi inclinarsi:
// camera.up segue la camera, e "Reset vista" la raddrizza). Dal centro al
// bordo della vista sono 90°. Con viewer.mouseRotation = 'turntable' resta
// la rotazione a "piatto girevole" attorno alla verticale del mondo.
//
// Solo mouse: il touch e la penna mantengono i gesti di viewer.js.
// Come gli altri moduli, lo stato del viewer arriva per iniezione
// (initPivotOrbit(deps)) tramite getter.

import * as THREE from 'three';
import { eventManager } from './utils.js';
import { isMeasureObject } from './measure.js';

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
const qInv = new THREE.Quaternion();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const tbLast = new THREE.Vector3();
const tbCur = new THREE.Vector3();
const tbAxis = new THREE.Vector3();
const tbCenter = new THREE.Vector3();

// Margine dalla verticale: guardando esattamente in alto/basso lookAt()
// degenera e la vista ruoterebbe su sé stessa
const PITCH_EPS = 0.001;
const DBLCLICK_DURATION = 350; // ms
// Movimento minimo (px) prima che il trascinamento ruoti: sotto è un clic,
// che con misure o POI attivi deve solo posare il punto
const DRAG_THRESHOLD = 4;
// Il click che chiude una rotazione non deve arrivare a misure/POI
const CLICK_SUPPRESS_MS = 400;

let drag = null;           // { pointerId, startX, startY, lastX, lastY, moved, prevAutoRotate, cx, cy }
let suppressClickUntil = 0;
const modelBox = new THREE.Box3();
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
    // Linee e sprite, marker di misure e POI, mesh nascoste
    if (!hit.object.isMesh || !hit.object.visible || isMeasureObject(hit.object)) continue;
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

/** Ruota camera e target attorno a center con un quaternione nel mondo. */
function applyWorldRotation(q, camera, controls, center = pivot) {
  camera.position.sub(center).applyQuaternion(q).add(center);
  controls.target.sub(center).applyQuaternion(q).add(center);
  camera.quaternion.premultiply(q);
  // lookAt() di controls.update() ricostruisce l'orientamento da camera.up:
  // deve essere il "su" attuale della camera, altrimenti annullerebbe
  // l'inclinazione della trackball (e degenererebbe guardando in verticale)
  camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  controls.update();
}

function rotateTurntable(dx, dy) {
  const camera = deps.getCamera();
  const controls = deps.getControls();
  const h = deps.domElement.clientHeight || 1;
  // Stessa scala di OrbitControls (un'altezza di schermo = un giro)
  const k = (2 * Math.PI * controls.rotateSpeed * rotateSpeed()) / h;
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
  applyWorldRotation(qRot, camera, controls);
}

/**
 * Centro della sfera virtuale in pixel (relativi al canvas): il pivot
 * proiettato, tenuto nella metà centrale della vista come fa CloudCompare,
 * così anche un pivot vicino al bordo lascia spazio per ruotare.
 */
function trackballCenter(camera, w, h) {
  tbCenter.copy(pivot).project(camera);
  let cx = w / 2, cy = h / 2;
  if (tbCenter.z > -1 && tbCenter.z < 1) {
    cx = THREE.MathUtils.clamp((tbCenter.x + 1) / 2 * w, w / 4, 3 * w / 4);
    cy = THREE.MathUtils.clamp((1 - tbCenter.y) / 2 * h, h / 4, 3 * h / 4);
  }
  return { cx, cy };
}

/**
 * Punto della sfera virtuale sotto il cursore, nello spazio camera
 * (x a destra, y in alto, z verso chi guarda). Raggio: mezza vista per
 * asse; fuori dalla sfera il punto scivola sul suo bordo, e lì il
 * trascinamento diventa una rotazione attorno all'asse di vista.
 */
function trackballVector(out, x, y, w, h) {
  out.set(
    THREE.MathUtils.clamp((x - drag.cx) / (w / 2), -1, 1),
    THREE.MathUtils.clamp(-(y - drag.cy) / (h / 2), -1, 1),
    0
  );
  const d2 = out.x * out.x + out.y * out.y;
  if (d2 > 1) out.multiplyScalar(1 / Math.sqrt(d2));
  else out.z = Math.sqrt(1 - d2);
  return out;
}

function rotateTrackball(x, y) {
  const camera = deps.getCamera();
  const controls = deps.getControls();
  const w = deps.domElement.clientWidth || 1;
  const h = deps.domElement.clientHeight || 1;
  trackballVector(tbCur, x, y, w, h);
  const dot = THREE.MathUtils.clamp(tbLast.dot(tbCur), -1, 1);
  tbAxis.crossVectors(tbLast, tbCur);
  const len = tbAxis.length();
  tbLast.copy(tbCur);
  if (len < 1e-9) return;
  // Il modello ruota da tbLast a tbCur (segue il cursore): la camera fa la
  // rotazione inversa attorno al pivot. Asse dallo spazio camera al mondo.
  // mouseRotateSpeed scala l'angolo, non la sfera: cambiarne il raggio
  // sposterebbe il bordo (dove il trascinamento diventa rollio)
  const angle = Math.atan2(len, dot) * rotateSpeed();
  tbAxis.multiplyScalar(1 / len).applyQuaternion(camera.quaternion);
  qInv.setFromAxisAngle(tbAxis, -angle);
  applyWorldRotation(qInv, camera, controls);
}

function rotateSpeed() {
  const s = Number(deps.rotateSpeed);
  return Number.isFinite(s) && s > 0 ? s : 1;
}

function isTrackball() {
  return deps.rotationMode !== 'turntable';
}

/** Posizione del puntatore relativa al canvas. */
function localXY(e) {
  const rect = deps.domElement.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/**
 * Esaurisce l'inerzia di OrbitControls (pan o rotazione touch appena
 * finiti): controls.update() la applicherebbe a ogni passo della trackball
 * e il punto afferrato scivolerebbe via dal cursore.
 */
function stopInertia(camera, controls) {
  if (!controls.enableDamping) return;
  tmpLocal.copy(camera.position);
  tmpRight.copy(controls.target);
  const autoRotate = controls.autoRotate;
  controls.enableDamping = false;
  controls.autoRotate = false;
  controls.update(); // consuma e azzera i delta residui
  controls.enableDamping = true;
  controls.autoRotate = autoRotate;
  camera.position.copy(tmpLocal);
  controls.target.copy(tmpRight);
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
  if (modifierGesture) {
    // Un Ctrl+trascina finito senza pointerup (finestra che perde il fuoco)
    modifierGesture = false;
    controls.mouseButtons.LEFT = null;
  }
  stopInertia(deps.getCamera(), controls);
  const hit = pickPoint(e);
  if (hit) {
    pivot.copy(hit);
    alignTargetDepth(deps.getCamera(), controls);
  } else {
    // Clic nel vuoto: il target, finché sta nel modello. Lo zoom verso il
    // cursore sullo sfondo lo porta lontano, e il modello uscirebbe dalla
    // vista: allora, come CloudCompare, si ruota attorno al suo centro
    pivot.copy(controls.target);
    const model = deps.getModel();
    if (model) {
      modelBox.setFromObject(model);
      if (!modelBox.isEmpty() && !modelBox.containsPoint(pivot)) modelBox.getCenter(pivot);
    }
  }
  // Anche fuori dal canvas il trascinamento continua ad arrivare qui
  try { deps.domElement.setPointerCapture(e.pointerId); } catch (_) { /* puntatore già rilasciato */ }
  drag = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    moved: false,
    prevAutoRotate: controls.autoRotate,
    cx: 0,
    cy: 0,
  };
  if (isTrackball()) {
    const camera = deps.getCamera();
    const el = deps.domElement;
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    // Il centro della sfera resta fisso per tutto il trascinamento: se
    // seguisse il pivot a ogni passo, la rotazione non sarebbe reversibile
    // (tornando al punto di partenza la vista non tornerebbe uguale)
    Object.assign(drag, trackballCenter(camera, w, h));
    const p = localXY(e);
    trackballVector(tbLast, p.x, p.y, w, h);
  }
  // L'autorotazione combatterebbe con il trascinamento
  controls.autoRotate = false;
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  // Sinistro già rilasciato: con un altro tasto premuto Chrome lo segnala
  // con un pointermove, non con pointerup; o il pointerup è andato perso
  if (!deps.canOrbit() || !(e.buttons & 1)) { endDrag(); return; }
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
    drag.moved = true;
    showMarker(true);
  }
  const dx = e.clientX - drag.lastX;
  const dy = e.clientY - drag.lastY;
  drag.lastX = e.clientX;
  drag.lastY = e.clientY;
  if (!dx && !dy) return;
  if (isTrackball()) {
    const p = localXY(e);
    rotateTrackball(p.x, p.y);
  } else {
    rotateTurntable(dx, dy);
  }
}

function endDrag() {
  const controls = deps.getControls();
  if (modifierGesture) {
    modifierGesture = false;
    controls.mouseButtons.LEFT = null;
  }
  if (!drag) return;
  if (drag.prevAutoRotate) controls.autoRotate = true;
  if (drag.moved) suppressClickUntil = performance.now() + CLICK_SUPPRESS_MS;
  drag = null;
  showMarker(false);
}

function onPointerUp(e) {
  if (drag && e.pointerId !== drag.pointerId) return;
  endDrag();
}

/** Il click di fine rotazione non posa punti di misura o POI. */
function onClickCapture(e) {
  if (performance.now() > suppressClickUntil) return;
  suppressClickUntil = 0;
  if (e.target === deps.domElement) e.stopImmediatePropagation();
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
 *   requestRender(),
 *   rotationMode      — 'trackball' (default, come CloudCompare) o 'turntable',
 *   rotateSpeed       — moltiplicatore della sensibilità (default 1)
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
  eventManager.add(el, 'lostpointercapture', onPointerUp, false, 'renderer');
  eventManager.add(window, 'blur', endDrag, false, 'renderer');
  // Sulla window in capture: arriva prima dei listener click di misure e POI
  eventManager.add(window, 'click', onClickCapture, { capture: true }, 'renderer');
  eventManager.add(el, 'dblclick', onDblClick, false, 'renderer');
}

/**
 * Riporta camera.up alla verticale del mondo (o a endUp) durante
 * un'animazione (Reset vista, viste predefinite): chiamata all'inizio,
 * restituisce la funzione da chiamare a ogni passo con k ∈ [0, 1]. Senza,
 * la vista resterebbe inclinata.
 */
export function cameraUpBlend(camera, endUp = WORLD_UP) {
  const startUp = camera.up.clone();
  const q = new THREE.Quaternion();
  const step = new THREE.Quaternion();
  if (startUp.dot(endUp) < -0.999) {
    // Vista capovolta: setFromUnitVectors sceglierebbe un asse qualsiasi e
    // la vista girerebbe di traverso; si raddrizza attorno all'asse di vista
    q.setFromAxisAngle(camera.getWorldDirection(new THREE.Vector3()), Math.PI);
  } else {
    q.setFromUnitVectors(startUp, endUp);
  }
  return (k) => {
    step.identity().slerp(q, k);
    camera.up.copy(startUp).applyQuaternion(step).normalize();
  };
}

/** true se la vista è inclinata rispetto alla verticale del mondo. */
export function isCameraRolled(camera) {
  return camera.up.distanceToSquared(WORLD_UP) > 1e-6;
}

/**
 * Un passo di autorotazione attorno al "su" della camera, passante per il
 * target. OrbitControls ruoterebbe sempre attorno alla Y del mondo: con la
 * vista inclinata l'orizzonte oscillerebbe e, oltre 90°, lookAt() la
 * capovolgerebbe di colpo.
 */
export function autoRotateAroundUp(camera, controls, angle) {
  qRot.setFromAxisAngle(tmpDir.copy(camera.up), angle);
  tbCenter.copy(controls.target);
  applyWorldRotation(qRot, camera, controls, tbCenter);
}

/** Raddrizza subito la camera (prima persona, VR): niente rollio residuo. */
export function levelCamera(camera, controls) {
  if (camera.up.distanceToSquared(WORLD_UP) < 1e-12) return;
  camera.up.copy(WORLD_UP);
  if (controls) {
    controls.update();
  } else {
    camera.getWorldDirection(tmpDir);
    camera.lookAt(tmpRight.copy(camera.position).add(tmpDir));
  }
}
