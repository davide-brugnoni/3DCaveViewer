// 3D Cave Viewer — sistema di misurazione distanze (punti, linee, label,
// snap ai vertici, modifica punti, pannello UI, export CSV).
// Le dipendenze dallo stato del viewer (modello, camera, renderer, sezioni)
// sono iniettate con initMeasureUI(deps) tramite getter, così il modulo non
// dipende dall'ordine di inizializzazione di viewer.js.

import * as THREE from 'three';
import {
  _t, isTouch, isSmallScreen, haptic, showToast,
  disposeThreeObject, disposeThreeObjects, restoreOriginalColor, eventManager
} from './utils.js';
import {
  measureEnableInput, measureClearBtn, measureListContainer, measureHintText,
  measurePanel, measurePanelHeader, measurePanelClose, measureAddBtn,
  screenshotBtn
} from './dom.js';
import {
  closeOtherPanelsMobile, placePanel, clearMinimizedState,
  showPanelBackdrop, hidePanelBackdrop, anyPanelOpen, initPanelDrag,
  minimizePanelMobile
} from './panels.js';

// Dipendenze dallo stato del viewer (impostate da initMeasureUI)
let deps = null;

// ======= STATO MISURAZIONE =======
let measureEnabled = false;
let measurePoints = []; // Punti temporanei per la misurazione corrente
const measureRaycaster = new THREE.Raycaster();
let measureSphereTemp = null; // Sfera temporanea per il primo punto
const measurements = []; // Array di tutte le misurazioni completate
let measureIdCounter = 0; // Contatore per ID univoci
const MEASURE_SPHERE_RADIUS = 0.035; // Sfere più grandi per visibilità
const MEASURE_LINE_COLOR = 0xffcc00; // Giallo brillante
const MEASURE_LINE_COLOR_GLOW = 0xffa500; // Arancione per glow
const MEASURE_POINT_COLOR = 0xff3333; // Rosso vivace
const MEASURE_LABEL_COLORS = ['#ffcc00', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8'];
// Anteprima linea in tempo reale
let measurePreviewLine = null;
// Snap ai vertici (sempre attivo)
const MEASURE_SNAP_RADIUS = 0.15; // Raggio di snap in unità del modello
// Modifica punti esistenti
let editingMeasurement = null; // { measurementId, pointIndex: 0|1 }
const MEASURE_EDIT_COLOR = 0x00ff00; // Verde per punto in modifica
// Modalità aggiunta punti (attivata dal pulsante +)
let isAddingPoints = false;

// === OTTIMIZZAZIONI PERFORMANCE ===
// Throttling mousemove (30 fps max)
let lastMeasureMouseMoveTime = 0;
const MEASURE_MOUSEMOVE_THROTTLE = 33; // ~30fps
// Geometrie riutilizzabili per preview (evita allocazioni continue)
let reusablePreviewLineMaterial = null;
let reusablePreviewSphereGeometry = null;
let reusablePreviewGlowGeometry = null;
// Cache rect del renderer (aggiornato solo su resize)
let cachedRendererRect = null;
let cachedRendererRectTime = 0;
const RENDERER_RECT_CACHE_TIME = 100; // ms
// Sfera di anteprima riutilizzabile
let editPreviewSphere = null;

// Vector2 riutilizzabile per raycaster (evita allocazioni)
const reusableMouseVec2 = new THREE.Vector2();
// Vector3 riutilizzabili per updateMeasureLabels (evita allocazioni nel loop di render)
const reusableMidLocal = new THREE.Vector3();
const reusableMidWorld = new THREE.Vector3();
const reusableProjected = new THREE.Vector3();

// Accessor comodi sulle dipendenze (null-safe prima di initMeasureUI)
function depModel()    { return deps ? deps.getCurrentModel() : null; }
function depScene()    { return deps ? deps.getScene() : null; }
function depCamera()   { return deps ? deps.getCamera() : null; }
function depRenderer() { return deps ? deps.getRenderer() : null; }
function depIsFP()     { return deps ? deps.getIsFP() : false; }
function depPointVisible(localPoint) {
  return deps && deps.isPointVisibleWithSection ? deps.isPointVisibleWithSection(localPoint) : true;
}

// ======= FUNZIONI MISURAZIONE =======

export function updateMeasureControlsState() {
  const hasModel = !!depModel();
  if (measureEnableInput) {
    measureEnableInput.disabled = !hasModel;
    measureEnableInput.checked = hasModel && measureEnabled;
  }
  if (measureClearBtn) {
    // Il pulsante clear è attivo se ci sono misurazioni completate o punti temporanei
    measureClearBtn.disabled = !hasModel || (measurements.length === 0 && measurePoints.length === 0);
  }
  const measureExportBtn = document.getElementById('measure-export');
  if (measureExportBtn) {
    measureExportBtn.disabled = !hasModel || measurements.length === 0;
  }
  if (screenshotBtn) {
    screenshotBtn.disabled = !hasModel;
  }
}

function updateMeasureHint() {
  if (!measureHintText) return;
  if (!measureEnabled) {
    measureHintText.textContent = _t('measure.hint', 'Abilita per iniziare a misurare');
  } else if (editingMeasurement) {
    // Modalità modifica punto esistente
    measureHintText.textContent = _t('measure.hintEditPoint', 'Clicca per spostare il punto');
  } else if (isAddingPoints) {
    // In modalità aggiunta punti
    if (measurePoints.length === 0) {
      measureHintText.textContent = _t('measure.hintFirst', 'Clicca sul modello per il primo punto');
    } else if (measurePoints.length === 1) {
      measureHintText.textContent = _t('measure.hintSecond', 'Clicca sul modello per il secondo punto');
    }
  } else {
    // Non in modalità aggiunta - indica come procedere
    if (measurements.length > 0) {
      measureHintText.textContent = _t('measure.hintClickPoint', 'Clicca su un punto per spostarlo, o premi + per aggiungere');
    } else {
      measureHintText.textContent = _t('measure.hintPressAdd', 'Premi + per iniziare a misurare');
    }
  }
}

function updateMeasureAddButton() {
  if (!measureAddBtn) return;
  if (isAddingPoints) {
    measureAddBtn.classList.add('active');
    measureAddBtn.setAttribute('aria-pressed', 'true');
  } else {
    measureAddBtn.classList.remove('active');
    measureAddBtn.setAttribute('aria-pressed', 'false');
  }
}

function toggleAddingPoints() {
  if (isAddingPoints) {
    // Disattiva modalità aggiunta
    isAddingPoints = false;
    // Cancella eventuali punti temporanei
    clearTempSphere();
    clearMeasurePreviewLine();
    measurePoints = [];
    document.body.classList.remove('adding-points');
  } else {
    // Attiva modalità aggiunta
    isAddingPoints = true;
    document.body.classList.add('adding-points');
    // Su telefono il bottom sheet e il suo backdrop coprono il modello: il
    // tocco sul modello finiva sul backdrop, che chiudeva il pannello e
    // spegneva la misura. Si riduce il pannello a pillola (che toglie anche
    // il backdrop) e lo si riapre dalla pillola.
    if (isSmallScreen() && measurePanel?.style.display === 'block') {
      minimizePanelMobile(measurePanel, _t('measure.listTitle', 'Misurazioni'), '📐');
    }
  }
  updateMeasureAddButton();
  updateMeasureHint();
  updateMeasureControlsState();
}

function createMeasureSphere(position, color = MEASURE_POINT_COLOR) {
  const geometry = new THREE.SphereGeometry(MEASURE_SPHERE_RADIUS, 24, 24);
  const material = new THREE.MeshBasicMaterial({ color: color, depthTest: false, transparent: true, opacity: 0.95 });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.copy(position);
  sphere.renderOrder = 999;
  sphere.userData.isMeasureObject = true; // Marca per escludere dal raycast
  // Aggiungi un alone esterno per maggiore visibilità
  const glowGeom = new THREE.SphereGeometry(MEASURE_SPHERE_RADIUS * 1.5, 16, 16);
  const glowMat = new THREE.MeshBasicMaterial({ color: color, depthTest: false, transparent: true, opacity: 0.3 });
  const glow = new THREE.Mesh(glowGeom, glowMat);
  glow.renderOrder = 998;
  glow.userData.isMeasureObject = true; // Marca per escludere dal raycast
  sphere.add(glow);
  const currentModel = depModel();
  if (currentModel) {
    currentModel.add(sphere);
  } else if (depScene()) {
    depScene().add(sphere);
  }
  return sphere;
}

function createMeasureLine(pointA, pointB, color = MEASURE_LINE_COLOR) {
  const group = new THREE.Group();
  group.userData.isMeasureObject = true; // Marca per escludere dal raycast
  // Linea principale più visibile
  const geometry = new THREE.BufferGeometry().setFromPoints([pointA, pointB]);
  const material = new THREE.LineBasicMaterial({ color: color, depthTest: false, transparent: true, opacity: 1, linewidth: 3 });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 998;
  line.userData.isMeasureObject = true;
  group.add(line);
  // Linea di glow esterna
  const glowGeom = new THREE.BufferGeometry().setFromPoints([pointA, pointB]);
  const glowMat = new THREE.LineBasicMaterial({ color: MEASURE_LINE_COLOR_GLOW, depthTest: false, transparent: true, opacity: 0.4, linewidth: 6 });
  const glowLine = new THREE.Line(glowGeom, glowMat);
  glowLine.renderOrder = 997;
  glowLine.userData.isMeasureObject = true;
  group.add(glowLine);
  group.renderOrder = 998;
  const currentModel = depModel();
  if (currentModel) {
    currentModel.add(group);
  } else if (depScene()) {
    depScene().add(group);
  }
  return group;
}

// Crea o aggiorna la linea di preview tratteggiata (riutilizza geometria)
function updateMeasurePreviewLine(startPoint, endPoint) {
  if (!startPoint || !endPoint) {
    clearMeasurePreviewLine();
    return;
  }

  // Crea materiale riutilizzabile se non esiste
  if (!reusablePreviewLineMaterial) {
    reusablePreviewLineMaterial = new THREE.LineDashedMaterial({
      color: 0xffff00,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
      dashSize: 0.08,
      gapSize: 0.04,
      linewidth: 2
    });
  }

  // Aggiorna clipping planes
  reusablePreviewLineMaterial.clippingPlanes = deps && deps.getSectionPlaneArray ? deps.getSectionPlaneArray() : null;

  if (measurePreviewLine) {
    // Riutilizza la linea esistente, aggiorna solo la geometria
    const positions = measurePreviewLine.geometry.attributes.position.array;
    positions[0] = startPoint.x;
    positions[1] = startPoint.y;
    positions[2] = startPoint.z;
    positions[3] = endPoint.x;
    positions[4] = endPoint.y;
    positions[5] = endPoint.z;
    measurePreviewLine.geometry.attributes.position.needsUpdate = true;
    measurePreviewLine.geometry.computeBoundingSphere();
    measurePreviewLine.computeLineDistances();
  } else {
    // Crea nuova linea solo la prima volta
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6); // 2 punti x 3 coordinate
    positions[0] = startPoint.x;
    positions[1] = startPoint.y;
    positions[2] = startPoint.z;
    positions[3] = endPoint.x;
    positions[4] = endPoint.y;
    positions[5] = endPoint.z;
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    measurePreviewLine = new THREE.Line(geometry, reusablePreviewLineMaterial);
    measurePreviewLine.computeLineDistances();
    measurePreviewLine.renderOrder = 996;
    measurePreviewLine.userData.isMeasureObject = true;

    const currentModel = depModel();
    if (currentModel) {
      currentModel.add(measurePreviewLine);
    } else if (depScene()) {
      depScene().add(measurePreviewLine);
    }
  }
}

// Rimuove la linea di preview
function clearMeasurePreviewLine() {
  if (measurePreviewLine) {
    if (measurePreviewLine.parent) measurePreviewLine.parent.remove(measurePreviewLine);
    if (measurePreviewLine.geometry) measurePreviewLine.geometry.dispose();
    // Non disponiamo il materiale riutilizzabile
    measurePreviewLine = null;
  }
}

// Lo snap ai vertici usava una cache con un THREE.Vector3 per ogni vertice
// del modello più una griglia spaziale a chiavi stringa: su un modello da
// mezzo milione di vertici voleva dire decine di MB di heap e un blocco del
// thread principale all'attivazione della misura, proprio sui telefoni dove la
// memoria era già al limite. Ora lo snap considera i tre vertici del
// triangolo colpito dal raggio, che il raycast (accelerato dal BVH) fornisce
// già: nessuna memoria aggiuntiva e nessun tempo di preparazione.

// Verifica se un oggetto o uno dei suoi parent è un oggetto di misurazione
export function isMeasureObject(obj) {
  let current = obj;
  while (current) {
    if (current.userData && current.userData.isMeasureObject) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

// Vertice del triangolo colpito più vicino al punto (coordinate locali del
// modello), entro maxDistance e rispettando la sezione attiva
const snapTmp = new THREE.Vector3();
const snapMatrix = new THREE.Matrix4();
function findNearestVertex(point, intersect, maxDistance = MEASURE_SNAP_RADIUS) {
  const currentModel = depModel();
  const face = intersect?.face;
  const posAttr = intersect?.object?.geometry?.getAttribute?.('position');
  if (!currentModel || !face || !posAttr) return null;

  // Da spazio della mesh a spazio locale del modello
  snapMatrix.copy(currentModel.matrixWorld).invert().multiply(intersect.object.matrixWorld);

  let nearestVertex = null;
  let nearestDistance = maxDistance;
  for (const index of [face.a, face.b, face.c]) {
    snapTmp.fromBufferAttribute(posAttr, index).applyMatrix4(snapMatrix);
    if (!depPointVisible(snapTmp)) continue;
    const dist = point.distanceTo(snapTmp);
    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestVertex = snapTmp.clone();
    }
  }
  return nearestVertex;
}

// Funzione per ottenere il rect del renderer con cache
export function getCachedRendererRect() {
  const now = performance.now();
  if (!cachedRendererRect || (now - cachedRendererRectTime) > RENDERER_RECT_CACHE_TIME) {
    cachedRendererRect = depRenderer().domElement.getBoundingClientRect();
    cachedRendererRectTime = now;
  }
  return cachedRendererRect;
}

// Invalida il rect cachato (chiamare su resize)
export function invalidateRendererRect() {
  cachedRendererRect = null;
}

// Handler per il movimento del mouse durante la misurazione (con throttling)
function handleMeasureMouseMove(event) {
  const currentModel = depModel();
  if (!measureEnabled || !currentModel || depIsFP()) return;

  // Throttling: limita a ~30 fps
  const now = performance.now();
  if (now - lastMeasureMouseMoveTime < MEASURE_MOUSEMOVE_THROTTLE) return;
  lastMeasureMouseMoveTime = now;

  // Mostra preview sia durante nuova misurazione che durante modifica
  const isNewMeasure = measurePoints.length === 1;
  const isEditing = editingMeasurement !== null;

  if (!isNewMeasure && !isEditing) return;

  // Usa rect cachato
  const rect = getCachedRendererRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // Riutilizza Vector2 invece di crearne uno nuovo
  reusableMouseVec2.set(x, y);
  measureRaycaster.setFromCamera(reusableMouseVec2, depCamera());
  const intersects = measureRaycaster.intersectObject(currentModel, true);

  // Trova la prima intersezione visibile (rispetta la sezione attiva e escludi oggetti di misurazione)
  let validIntersect = null;
  currentModel.updateMatrixWorld(true);
  for (const intersect of intersects) {
    // Escludi gli oggetti di misurazione (sfere, linee, preview)
    if (isMeasureObject(intersect.object)) {
      continue;
    }
    const worldPoint = intersect.point.clone();
    const localPoint = currentModel.worldToLocal(worldPoint.clone());
    const isVisible = depPointVisible(localPoint);
    if (isVisible) {
      validIntersect = { worldPoint, localPoint, intersect };
      break;
    }
  }

  if (validIntersect) {
    let localPoint = validIntersect.localPoint;

    // Applica snap ai vertici
    const snappedPoint = findNearestVertex(localPoint, validIntersect.intersect);
    if (snappedPoint) {
      localPoint = snappedPoint;
    }

    if (isNewMeasure) {
      // Preview per nuova misurazione
      updateMeasurePreviewLine(measurePoints[0], localPoint);
      clearEditPreviewSphere();
    } else if (isEditing) {
      // Preview per modifica punto esistente
      const m = measurements.find(m => m.id === editingMeasurement.measurementId);
      if (m) {
        const otherPointIndex = editingMeasurement.pointIndex === 0 ? 1 : 0;
        // Mostra linea tratteggiata dall'altro punto alla nuova posizione
        updateMeasurePreviewLine(m.points[otherPointIndex], localPoint);
        // Mostra sfera di preview ancorata al mouse
        updateEditPreviewSphere(localPoint);
      }
    }
  } else {
    clearMeasurePreviewLine();
    clearEditPreviewSphere();
  }
}

// Controlla se il click è vicino a un punto di misurazione esistente
function checkClickOnMeasureSphere(event) {
  const currentModel = depModel();
  if (!currentModel || measurements.length === 0) return null;

  const rect = getCachedRendererRect();

  // Soglia di click in pixel (più grande = più facile cliccare; più ampia su touch)
  const clickThresholdPx = isTouch ? 36 : 20;

  currentModel.updateMatrixWorld(true);

  // Per ogni punto di misurazione, calcola la distanza in pixel dal click
  let closest = null;
  let closestDistPx = Infinity;

  measurements.forEach(m => {
    if (!m.points || m.points.length < 2) return;

    for (let i = 0; i < 2; i++) {
      const localPoint = m.points[i];
      // Converti in coordinate mondo
      const worldPoint = localPoint.clone().applyMatrix4(currentModel.matrixWorld);
      // Proietta sullo schermo
      const projected = worldPoint.clone().project(depCamera());

      // Salta se dietro la camera
      if (projected.z > 1) continue;

      // Converti in pixel
      const screenX = (projected.x * 0.5 + 0.5) * rect.width;
      const screenY = (-projected.y * 0.5 + 0.5) * rect.height;

      // Calcola distanza dal click
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      const distPx = Math.sqrt((screenX - clickX) ** 2 + (screenY - clickY) ** 2);

      if (distPx < closestDistPx && distPx < clickThresholdPx) {
        closestDistPx = distPx;
        closest = { measurementId: m.id, pointIndex: i };
      }
    }
  });

  return closest;
}

// Inizia la modifica di un punto esistente
function startEditingPoint(measurementId, pointIndex) {
  const m = measurements.find(m => m.id === measurementId);
  if (!m) return;

  // Se stiamo già modificando lo stesso punto, annulla
  if (editingMeasurement &&
      editingMeasurement.measurementId === measurementId &&
      editingMeasurement.pointIndex === pointIndex) {
    cancelEditingPoint();
    return;
  }

  // Annulla eventuale modifica precedente
  cancelEditingPoint();

  editingMeasurement = { measurementId, pointIndex };

  // Attiva il cursore crosshair per la modifica
  document.body.classList.add('editing-point');

  // Evidenzia la sfera in modifica (verde)
  const sphere = pointIndex === 0 ? m.sphereA : m.sphereB;
  if (sphere) {
    sphere.traverse(child => {
      if (child.material) {
        child.userData.originalColor = child.material.color.getHex();
        child.material.color.setHex(MEASURE_EDIT_COLOR);
      }
    });
  }

  // Annulla eventuale nuova misurazione in corso
  clearTempSphere();
  clearMeasurePreviewLine();
  clearEditPreviewSphere();
  measurePoints = [];

  updateMeasureHint();
}

// Crea/aggiorna la sfera di preview durante la modifica (riutilizza geometrie)
function updateEditPreviewSphere(localPoint) {
  if (!editingMeasurement) return;

  const m = measurements.find(m => m.id === editingMeasurement.measurementId);
  if (!m) return;

  // Usa lo stesso colore della misurazione
  const colorIdx = (m.id - 1) % MEASURE_LABEL_COLORS.length;
  const colorHex = parseInt(MEASURE_LABEL_COLORS[colorIdx].replace('#', '0x'), 16);

  if (editPreviewSphere) {
    // Riutilizza la sfera esistente, aggiorna solo posizione e colore
    editPreviewSphere.position.copy(localPoint);
    editPreviewSphere.material.color.setHex(colorHex);
    // Aggiorna anche il glow se esiste
    if (editPreviewSphere.children[0]) {
      editPreviewSphere.children[0].material.color.setHex(colorHex);
    }
  } else {
    // Crea geometrie riutilizzabili se non esistono
    if (!reusablePreviewSphereGeometry) {
      reusablePreviewSphereGeometry = new THREE.SphereGeometry(MEASURE_SPHERE_RADIUS, 16, 16); // Ridotto da 24x24
    }
    if (!reusablePreviewGlowGeometry) {
      reusablePreviewGlowGeometry = new THREE.SphereGeometry(MEASURE_SPHERE_RADIUS * 1.5, 12, 12); // Ridotto da 16x16
    }

    // Crea materiali
    const material = new THREE.MeshBasicMaterial({
      color: colorHex,
      depthTest: false,
      transparent: true,
      opacity: 0.7
    });

    editPreviewSphere = new THREE.Mesh(reusablePreviewSphereGeometry, material);
    editPreviewSphere.position.copy(localPoint);
    editPreviewSphere.renderOrder = 999;
    editPreviewSphere.userData.isMeasureObject = true;

    // Aggiungi un alone esterno
    const glowMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      depthTest: false,
      transparent: true,
      opacity: 0.25
    });
    const glow = new THREE.Mesh(reusablePreviewGlowGeometry, glowMat);
    glow.renderOrder = 998;
    glow.userData.isMeasureObject = true;
    editPreviewSphere.add(glow);

    const currentModel = depModel();
    if (currentModel) {
      currentModel.add(editPreviewSphere);
    } else if (depScene()) {
      depScene().add(editPreviewSphere);
    }
  }
}

// Rimuove la sfera di preview della modifica
function clearEditPreviewSphere() {
  if (editPreviewSphere) {
    if (editPreviewSphere.parent) editPreviewSphere.parent.remove(editPreviewSphere);
    // Disponi solo i materiali, non le geometrie riutilizzabili
    if (editPreviewSphere.material) editPreviewSphere.material.dispose();
    editPreviewSphere.children.forEach(child => {
      if (child.material) child.material.dispose();
    });
    editPreviewSphere = null;
  }
}

// Annulla la modifica del punto
function cancelEditingPoint() {
  if (!editingMeasurement) return;

  const m = measurements.find(m => m.id === editingMeasurement.measurementId);
  if (m) {
    // Ripristina il colore originale della sfera
    const sphere = editingMeasurement.pointIndex === 0 ? m.sphereA : m.sphereB;
    restoreOriginalColor(sphere);
  }

  editingMeasurement = null;
  document.body.classList.remove('editing-point');
  clearMeasurePreviewLine();
  clearEditPreviewSphere();
  updateMeasureHint();
}

// Completa la modifica spostando il punto
function finishEditingPoint(newLocalPoint) {
  if (!editingMeasurement) return;

  const m = measurements.find(m => m.id === editingMeasurement.measurementId);
  if (!m) {
    cancelEditingPoint();
    return;
  }

  const pointIndex = editingMeasurement.pointIndex;
  const oldSphere = pointIndex === 0 ? m.sphereA : m.sphereB;

  // Rimuovi la vecchia sfera
  disposeThreeObject(oldSphere);

  // Aggiorna il punto
  m.points[pointIndex] = newLocalPoint.clone();

  // Crea la nuova sfera
  const colorIdx = (m.id - 1) % MEASURE_LABEL_COLORS.length;
  const colorHex = parseInt(MEASURE_LABEL_COLORS[colorIdx].replace('#', '0x'), 16);
  const newSphere = createMeasureSphere(newLocalPoint, colorHex);

  if (pointIndex === 0) {
    m.sphereA = newSphere;
  } else {
    m.sphereB = newSphere;
  }

  // Aggiorna la linea
  disposeThreeObject(m.line);
  m.line = createMeasureLine(m.points[0], m.points[1], colorHex);

  // Ricalcola la distanza
  const rawDistance = m.points[0].distanceTo(m.points[1]);
  const originalScale = depModel().userData.originalScale || new THREE.Vector3(1, 1, 1);
  m.distance = rawDistance * originalScale.x;

  // Aggiorna l'etichetta
  if (m.labelEl) {
    const distSpan = m.labelEl.querySelector('.measure-label-dist');
    if (distSpan) {
      distSpan.textContent = formatMeasureDistance(m.distance);
    }
  }

  // Aggiorna la lista UI
  updateMeasureList();

  // Reset stato modifica
  editingMeasurement = null;
  document.body.classList.remove('editing-point');
  clearMeasurePreviewLine();
  clearEditPreviewSphere();
  updateMeasureHint();
}

// Crea l'etichetta HTML per una misurazione
function createMeasureLabel(id, distance, color) {
  const label = document.createElement('div');
  label.className = 'measure-3d-label';
  label.dataset.measureId = id;
  label.innerHTML = `<span class="measure-label-id" style="background:${color}">${id}</span><span class="measure-label-dist">${formatMeasureDistance(distance)}</span>`;
  document.body.appendChild(label);
  return label;
}

// Aggiorna la posizione delle etichette 3D (ottimizzato)
export function updateMeasureLabels() {
  const currentModel = depModel();
  const camera = depCamera();
  if (!currentModel || !camera || measurements.length === 0) return;

  // Usa rect cachato. Serve solo la matrixWorld della radice (i punti sono
  // in spazio locale della radice): aggiorna genitori + radice, non i figli,
  // evitando il ricalcolo dell'intero albero a ogni frame.
  const rect = getCachedRendererRect();
  currentModel.updateWorldMatrix(true, false);

  for (let i = 0; i < measurements.length; i++) {
    const m = measurements[i];
    if (!m.labelEl || !m.points || m.points.length < 2) continue;

    // Riutilizza Vector3 invece di crearne di nuovi
    reusableMidLocal.addVectors(m.points[0], m.points[1]).multiplyScalar(0.5);
    reusableMidWorld.copy(reusableMidLocal).applyMatrix4(currentModel.matrixWorld);
    reusableProjected.copy(reusableMidWorld).project(camera);

    // Verifica se è dietro la camera
    if (reusableProjected.z > 1) {
      if (m.labelEl.style.display !== 'none') {
        m.labelEl.style.display = 'none';
      }
    } else {
      const x = ((reusableProjected.x * 0.5 + 0.5) * rect.width + rect.left) | 0;
      const y = ((-reusableProjected.y * 0.5 + 0.5) * rect.height + rect.top) | 0;
      if (m.labelEl.style.display !== 'flex') {
        m.labelEl.style.display = 'flex';
      }
      // Dirty-check: aggiorna posizione solo se cambiata (arrotondata a pixel interi)
      if (m._lastX !== x || m._lastY !== y) {
        m.labelEl.style.left = x + 'px';
        m.labelEl.style.top = y + 'px';
        m._lastX = x;
        m._lastY = y;
      }
    }
  }
}

// Rimuove la sfera temporanea (primo punto non completato)
function clearTempSphere() {
  if (measureSphereTemp) {
    disposeThreeObject(measureSphereTemp);
    measureSphereTemp = null;
  }
}

// Rimuove una singola misurazione per ID
function removeMeasurement(id) {
  const idx = measurements.findIndex(m => m.id === id);
  if (idx === -1) return;
  const m = measurements[idx];
  // Rimuovi oggetti 3D
  disposeThreeObjects([m.sphereA, m.sphereB, m.line]);
  // Rimuovi label HTML
  if (m.labelEl && m.labelEl.parentNode) {
    m.labelEl.parentNode.removeChild(m.labelEl);
  }
  measurements.splice(idx, 1);
  updateMeasureList();
  updateMeasureControlsState();
}

// Cancella tutte le misurazioni
export function clearAllMeasurements() {
  // Prima rimuovi la sfera temporanea e la preview line
  clearTempSphere();
  clearMeasurePreviewLine();
  clearEditPreviewSphere();
  editingMeasurement = null; // Annulla eventuale modifica in corso
  isAddingPoints = false;
  measurePoints = [];
  // Rimuovi le classi CSS del cursore
  document.body.classList.remove('adding-points');
  document.body.classList.remove('editing-point');
  updateMeasureAddButton();
  // Poi rimuovi tutte le misurazioni completate
  while (measurements.length > 0) {
    const m = measurements.pop();
    disposeThreeObjects([m.sphereA, m.sphereB, m.line]);
    if (m.labelEl && m.labelEl.parentNode) {
      m.labelEl.parentNode.removeChild(m.labelEl);
    }
  }
  measureIdCounter = 0;
  updateMeasureList();
  updateMeasureControlsState();
  updateMeasureHint();
}

// Aggiorna la lista delle misurazioni nel popover
function updateMeasureList() {
  if (!measureListContainer) return;
  if (measurements.length === 0) {
    measureListContainer.innerHTML = `<div class="measure-list-empty">${_t('measure.noMeasurements', 'Nessuna misurazione')}</div>`;
    return;
  }
  measureListContainer.innerHTML = measurements.map(m => {
    const colorIdx = (m.id - 1) % MEASURE_LABEL_COLORS.length;
    const color = MEASURE_LABEL_COLORS[colorIdx];
    return `<div class="measure-list-item" data-id="${m.id}">
      <span class="measure-list-id" style="background:${color}">${m.id}</span>
      <span class="measure-list-dist">${formatMeasureDistance(m.distance)}</span>
      <button class="measure-list-delete" data-id="${m.id}" title="${_t('measure.deleteOne', 'Elimina')}">×</button>
    </div>`;
  }).join('');
  // I listener dei bottoni di eliminazione sono gestiti via event delegation
  // su measureListContainer, registrato una volta sola all'inizializzazione.
}

export function resetMeasureState() {
  measureEnabled = false;
  if (measureEnableInput) measureEnableInput.checked = false;
  clearAllMeasurements();
  clearMeasurePreviewLine();
  clearEditPreviewSphere();
  disposeReusablePreviewResources();
  isAddingPoints = false;
  editingMeasurement = null;
  document.body.classList.remove('measure-mode');
  document.body.classList.remove('adding-points');
  document.body.classList.remove('editing-point');
  updateMeasureControlsState();
  updateMeasureAddButton();
}

// Libera le risorse GPU riutilizzabili di preview: vengono ricreate on-demand,
// quindi è sicuro disporle a ogni cambio modello.
function disposeReusablePreviewResources() {
  if (reusablePreviewSphereGeometry) { reusablePreviewSphereGeometry.dispose(); reusablePreviewSphereGeometry = null; }
  if (reusablePreviewGlowGeometry)   { reusablePreviewGlowGeometry.dispose();   reusablePreviewGlowGeometry = null; }
  if (reusablePreviewLineMaterial)   { reusablePreviewLineMaterial.dispose();   reusablePreviewLineMaterial = null; }
}

// Disabilita la modalità misurazione (mantiene le misurazioni esistenti)
export function disableMeasureMode() {
  if (!measureEnabled) return;
  measureEnabled = false;
  if (measureEnableInput) measureEnableInput.checked = false;
  document.body.classList.remove('measure-mode');
  hideMeasurePanel();
  updateMeasureControlsState();
}

export function hasMeasurements() {
  return measurements.length > 0 || measurePoints.length > 0;
}

export function getMeasurements() {
  return measurements;
}

export function formatMeasureDistance(distance) {
  if (distance >= 1000) {
    return (distance / 1000).toFixed(2) + ' km';
  } else if (distance >= 1) {
    return distance.toFixed(2) + ' m';
  } else {
    return (distance * 100).toFixed(1) + ' cm';
  }
}

function handleMeasureClick(event) {
  const currentModel = depModel();
  if (!measureEnabled || !currentModel || depIsFP()) return;

  // Non processare se il click è su UI
  if (event.target !== depRenderer().domElement) {
    return;
  }

  // Prima controlla se il click è su una sfera esistente
  const sphereHit = checkClickOnMeasureSphere(event);
  if (sphereHit && !editingMeasurement) {
    // Inizia modifica del punto cliccato
    startEditingPoint(sphereHit.measurementId, sphereHit.pointIndex);
    return;
  }

  // Se non siamo in modalità aggiunta punti e non stiamo modificando, non fare nulla
  if (!isAddingPoints && !editingMeasurement) {
    return;
  }

  const rect = getCachedRendererRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  reusableMouseVec2.set(x, y);
  measureRaycaster.setFromCamera(reusableMouseVec2, depCamera());
  const intersects = measureRaycaster.intersectObject(currentModel, true);

  // Trova la prima intersezione visibile (rispetta la sezione attiva e escludi oggetti di misurazione)
  let validIntersect = null;
  currentModel.updateMatrixWorld(true);
  for (const intersect of intersects) {
    // Escludi gli oggetti di misurazione (sfere, linee, preview)
    if (isMeasureObject(intersect.object)) {
      continue;
    }
    const worldPoint = intersect.point.clone();
    const localPoint = currentModel.worldToLocal(worldPoint.clone());
    if (depPointVisible(localPoint)) {
      validIntersect = { worldPoint, localPoint, intersect };
      break;
    }
  }

  if (validIntersect) {
    let localPoint = validIntersect.localPoint;

    // Applica snap ai vertici
    const snappedPoint = findNearestVertex(localPoint, validIntersect.intersect);
    if (snappedPoint) {
      localPoint = snappedPoint;
    }

    // Se stiamo modificando un punto esistente
    if (editingMeasurement) {
      finishEditingPoint(localPoint);
      return;
    }

    if (measurePoints.length === 0) {
      // Primo punto - crea sfera temporanea
      clearTempSphere();
      measurePoints.push(localPoint);
      measureSphereTemp = createMeasureSphere(localPoint);
      updateMeasureHint();
      updateMeasureAddButton();
      haptic(10);
    } else if (measurePoints.length === 1) {
      // Secondo punto - completa la misurazione
      measurePoints.push(localPoint);
      haptic([10, 40, 10]);

      // Rimuovi la linea di preview
      clearMeasurePreviewLine();

      // Calcola la distanza reale
      const rawDistance = measurePoints[0].distanceTo(measurePoints[1]);
      const originalScale = currentModel.userData.originalScale || new THREE.Vector3(1, 1, 1);
      const realDistance = rawDistance * originalScale.x;

      // Crea nuova misurazione
      measureIdCounter++;
      const colorIdx = (measureIdCounter - 1) % MEASURE_LABEL_COLORS.length;
      const color = MEASURE_LABEL_COLORS[colorIdx];
      const colorHex = parseInt(color.replace('#', '0x'), 16);

      // Rimuovi la sfera temporanea del primo punto
      clearTempSphere();

      // Crea gli oggetti 3D permanenti per questa misurazione
      const sphereA = createMeasureSphere(measurePoints[0], colorHex);
      const sphereB = createMeasureSphere(measurePoints[1], colorHex);
      const line = createMeasureLine(measurePoints[0], measurePoints[1], colorHex);
      const labelEl = createMeasureLabel(measureIdCounter, realDistance, color);

      // Salva la misurazione
      const measurement = {
        id: measureIdCounter,
        points: [measurePoints[0].clone(), measurePoints[1].clone()],
        sphereA,
        sphereB,
        line,
        labelEl,
        distance: realDistance,
        color,
        createdAt: Date.now()
      };
      measurements.push(measurement);

      // Aggiorna UI
      updateMeasureList();
      updateMeasureHint();

      // Resetta i punti per una nuova misurazione e disattiva modalità aggiunta
      measurePoints = [];
      isAddingPoints = false;
      document.body.classList.remove('adding-points');
      updateMeasureAddButton();
    }
    updateMeasureControlsState();
  }
}

// Pannello flottante misurazioni
export function showMeasurePanel() {
  if (!measurePanel) return;
  closeOtherPanelsMobile(measurePanel);
  placePanel(measurePanel);
  measurePanel.style.display = 'block';
  if (isSmallScreen()) {
    if (deps && deps.closeMobileMenu) deps.closeMobileMenu();
    showPanelBackdrop();
  }
}

export function hideMeasurePanel() {
  if (!measurePanel) return;
  measurePanel.style.display = 'none';
  clearMinimizedState(measurePanel);
  if (isSmallScreen() && !anyPanelOpen()) hidePanelBackdrop();
}

export function isMeasurePanelVisible() {
  return measurePanel && measurePanel.style.display !== 'none';
}

// Toggle misurazione con shortcut M
export function toggleMeasureMode() {
  if (!depModel()) return;
  measureEnabled = !measureEnabled;
  if (measureEnableInput) measureEnableInput.checked = measureEnabled;
  document.body.classList.toggle('measure-mode', measureEnabled);
  updateMeasureControlsState();
  updateMeasureHint();
  if (measureEnabled) {
    showMeasurePanel();
  } else {
    hideMeasurePanel();
    clearTempSphere();
    clearMeasurePreviewLine();
    clearEditPreviewSphere();
    editingMeasurement = null; // Annulla eventuale modifica in corso
    isAddingPoints = false;
    measurePoints = [];
    // Rimuovi le classi CSS del cursore
    document.body.classList.remove('adding-points');
    document.body.classList.remove('editing-point');
    updateMeasureAddButton();
  }
}

// ======= EXPORT CSV =======

function csvEscape(value) {
  const s = String(value);
  return '"' + s.replace(/"/g, '""') + '"';
}

export function exportMeasurementsCSV() {
  if (measurements.length === 0) {
    showToast(_t('measure.exportNone', 'Nessuna misurazione da esportare'));
    return;
  }
  const currentModel = depModel();
  const info = deps && deps.getCurrentModelInfo ? deps.getCurrentModelInfo() : null;
  const folder = info?.folder || 'modello';
  const modelName = info?.name || folder;
  // Coordinate esportate in metri reali (stessa conversione della distanza)
  const scale = currentModel?.userData?.originalScale?.x || 1;

  const header = ['id', 'type', 'value_m', 'ax', 'ay', 'az', 'bx', 'by', 'bz', 'model_folder', 'model_name', 'created_at'];
  const rows = measurements.map(m => {
    const a = m.points[0], b = m.points[1];
    return [
      m.id,
      'distance',
      m.distance.toFixed(3),
      (a.x * scale).toFixed(3), (a.y * scale).toFixed(3), (a.z * scale).toFixed(3),
      (b.x * scale).toFixed(3), (b.y * scale).toFixed(3), (b.z * scale).toFixed(3),
      folder,
      modelName,
      m.createdAt ? new Date(m.createdAt).toISOString() : ''
    ].map(csvEscape).join(',');
  });
  // BOM per Excel + CRLF come da RFC 4180
  const csv = '\ufeff' + header.map(csvEscape).join(',') + '\r\n' + rows.join('\r\n') + '\r\n';

  const date = new Date();
  const ymd = date.getFullYear().toString()
    + String(date.getMonth() + 1).padStart(2, '0')
    + String(date.getDate()).padStart(2, '0');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `misure_${folder}_${ymd}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(_t('measure.exportDone', 'Misurazioni esportate'));
}

// ======= INIZIALIZZAZIONE UI =======

/**
 * Inizializza il sistema di misurazione e il wiring degli eventi.
 * @param {Object} d - Dipendenze dallo stato del viewer:
 *   getCurrentModel, getCurrentModelInfo, getScene, getCamera, getRenderer,
 *   getIsFP, isPointVisibleWithSection, getSectionPlaneArray, closeMobileMenu
 */
export function initMeasureUI(d) {
  deps = d;

  // Drag del pannello flottante
  initPanelDrag(measurePanel, measurePanelHeader, measurePanelClose);

  // Toggle misurazione dal checkbox
  if (measureEnableInput) {
    const onMeasureEnableChange = () => {
      if (!depModel()) {
        measureEnableInput.checked = false;
        return;
      }
      measureEnabled = !!measureEnableInput.checked;
      document.body.classList.toggle('measure-mode', measureEnabled);
      updateMeasureControlsState();
      updateMeasureHint();
      if (measureEnabled) {
        showMeasurePanel();
      } else {
        hideMeasurePanel();
        clearTempSphere();
        measurePoints = [];
        isAddingPoints = false;
        updateMeasureAddButton();
      }
    };
    eventManager.add(measureEnableInput, 'change', onMeasureEnableChange, false, 'ui');
  }

  // Pulsante cancella tutto
  if (measureClearBtn) {
    eventManager.add(measureClearBtn, 'click', () => { clearAllMeasurements(); }, false, 'ui');
  }

  // Pulsante esporta CSV
  const measureExportBtn = document.getElementById('measure-export');
  if (measureExportBtn) {
    eventManager.add(measureExportBtn, 'click', () => { exportMeasurementsCSV(); }, false, 'ui');
  }

  // Event delegation per i bottoni di eliminazione nella lista misurazioni
  // (unico listener sul container persistente anziché un listener per ogni bottone)
  if (measureListContainer) {
    eventManager.add(measureListContainer, 'click', (e) => {
      const btn = e.target.closest('.measure-list-delete');
      if (!btn) return;
      e.stopPropagation();
      const id = parseInt(btn.dataset.id, 10);
      removeMeasurement(id);
    }, false, 'ui');
  }

  // Pulsante aggiungi punti
  if (measureAddBtn) {
    eventManager.add(measureAddBtn, 'click', () => { toggleAddingPoints(); }, false, 'ui');
  }

  // Pulsante chiudi pannello
  if (measurePanelClose) {
    const onMeasurePanelCloseClick = () => {
      // Disabilita misurazione e chiudi pannello
      measureEnabled = false;
      isAddingPoints = false;
      editingMeasurement = null;
      if (measureEnableInput) measureEnableInput.checked = false;
      document.body.classList.remove('measure-mode');
      document.body.classList.remove('adding-points');
      document.body.classList.remove('editing-point');
      hideMeasurePanel();
      clearTempSphere();
      clearMeasurePreviewLine();
      clearEditPreviewSphere();
      measurePoints = [];
      updateMeasureControlsState();
      updateMeasureHint();
      updateMeasureAddButton();
    };
    eventManager.add(measurePanelClose, 'click', onMeasurePanelCloseClick, false, 'ui');
  }

  // Click sul canvas per misurazione - gruppo 'renderer'
  const renderer = depRenderer();
  if (renderer) {
    eventManager.add(renderer.domElement, 'click', handleMeasureClick, false, 'renderer');
    // Mousemove per anteprima linea di misurazione - gruppo 'renderer'
    eventManager.add(renderer.domElement, 'mousemove', handleMeasureMouseMove, false, 'renderer');
  }
}
