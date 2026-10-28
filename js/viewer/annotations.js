// 3D Cave Viewer — annotazioni / punti di interesse (POI) persistenti.
// I POI sono salvati in localStorage per cartella modello (coordinate locali
// al modello, lo stesso spazio dei punti misura: sopravvivono al
// ricentraggio/scala di centerScaleAndLight). Pannello con lista, vai-al-punto,
// rinomina, elimina, export/import JSON.

import * as THREE from 'three';
import {
  _t, isSmallScreen, haptic, showToast, disposeThreeObject, eventManager
} from './utils.js';
import {
  poiToggle, poiPanel, poiPanelHeader, poiPanelClose, poiPanelMinimize,
  poiAddBtn, poiHintText, poiList, poiExportBtn, poiImportBtn, poiImportFile
} from './dom.js';
import {
  registerPanel, closeOtherPanelsMobile, placePanel, clearMinimizedState,
  showPanelBackdrop, hidePanelBackdrop, anyPanelOpen, initPanelDrag,
  minimizePanelMobile
} from './panels.js';
import { isMeasureObject, getCachedRendererRect } from './measure.js';

// Dipendenze dallo stato del viewer (impostate da initPoiUI)
let deps = null;

const POI_STORAGE_PREFIX = 'poi:';
const POI_MARKER_COLOR = 0x1ebfd7; // Accento ciano del tema
const POI_SPHERE_RADIUS = 0.04;

let currentFolder = null;
let pois = []; // { id, name, p:{x,y,z}, createdAt, sphere, labelEl }
let poiEnabled = false;     // Modalità POI attiva (pannello aperto)
let isAddingPoi = false;    // Prossimo click sul modello crea un POI
let poiIdCounter = 0;

const poiRaycaster = new THREE.Raycaster();
const reusableMouseVec2 = new THREE.Vector2();
const reusablePoiWorld = new THREE.Vector3();
const reusablePoiProjected = new THREE.Vector3();

function depModel()  { return deps ? deps.getCurrentModel() : null; }
function depCamera() { return deps ? deps.getCamera() : null; }

// ======= STORAGE =======

function storageKey(folder) {
  return POI_STORAGE_PREFIX + folder;
}

function loadStored(folder) {
  try {
    const raw = localStorage.getItem(storageKey(folder));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPoiShape);
  } catch (e) {
    return [];
  }
}

function persist() {
  if (!currentFolder) return;
  try {
    const data = pois.map(p => ({ id: p.id, name: p.name, p: p.p, createdAt: p.createdAt }));
    localStorage.setItem(storageKey(currentFolder), JSON.stringify(data));
  } catch (e) {
    // Quota piena o storage non disponibile: il POI resta solo in sessione
  }
}

function isValidPoiShape(item) {
  return item && typeof item === 'object'
    && typeof item.name === 'string'
    && item.p && typeof item.p === 'object'
    && Number.isFinite(item.p.x) && Number.isFinite(item.p.y) && Number.isFinite(item.p.z);
}

// ======= MARKER 3D + LABEL =======

function createPoiMarker(localPoint) {
  const geometry = new THREE.SphereGeometry(POI_SPHERE_RADIUS, 20, 20);
  const material = new THREE.MeshBasicMaterial({ color: POI_MARKER_COLOR, depthTest: false, transparent: true, opacity: 0.95 });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.set(localPoint.x, localPoint.y, localPoint.z);
  sphere.renderOrder = 999;
  // isMeasureObject esclude il marker dai raycast di misure e POI
  sphere.userData.isMeasureObject = true;
  sphere.userData.isPoi = true;
  const glowGeom = new THREE.SphereGeometry(POI_SPHERE_RADIUS * 1.6, 14, 14);
  const glowMat = new THREE.MeshBasicMaterial({ color: POI_MARKER_COLOR, depthTest: false, transparent: true, opacity: 0.25 });
  const glow = new THREE.Mesh(glowGeom, glowMat);
  glow.renderOrder = 998;
  glow.userData.isMeasureObject = true;
  glow.userData.isPoi = true;
  sphere.add(glow);
  const model = depModel();
  if (model) model.add(sphere);
  return sphere;
}

function createPoiLabel(name) {
  const label = document.createElement('div');
  label.className = 'poi-3d-label';
  const pin = document.createElement('span');
  pin.className = 'poi-label-pin';
  pin.textContent = '📍';
  const text = document.createElement('span');
  text.className = 'poi-label-name';
  text.textContent = name; // textContent: il nome è input utente
  label.appendChild(pin);
  label.appendChild(text);
  document.body.appendChild(label);
  return label;
}

// Aggiorna la posizione delle label POI (chiamata nel loop di render)
export function updatePoiLabels() {
  const model = depModel();
  const camera = depCamera();
  if (!model || !camera || pois.length === 0) return;

  // Serve solo la matrixWorld della radice (i POI sono in spazio locale della
  // radice): aggiorna genitori + radice, non i figli.
  const rect = getCachedRendererRect();
  model.updateWorldMatrix(true, false);

  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i];
    if (!poi.labelEl) continue;

    reusablePoiWorld.set(poi.p.x, poi.p.y, poi.p.z).applyMatrix4(model.matrixWorld);
    reusablePoiProjected.copy(reusablePoiWorld).project(camera);

    if (reusablePoiProjected.z > 1) {
      if (poi.labelEl.style.display !== 'none') {
        poi.labelEl.style.display = 'none';
      }
    } else {
      const x = ((reusablePoiProjected.x * 0.5 + 0.5) * rect.width + rect.left) | 0;
      const y = ((-reusablePoiProjected.y * 0.5 + 0.5) * rect.height + rect.top) | 0;
      if (poi.labelEl.style.display !== 'flex') {
        poi.labelEl.style.display = 'flex';
      }
      // Dirty-check: aggiorna solo se la posizione è cambiata
      if (poi._lastX !== x || poi._lastY !== y) {
        poi.labelEl.style.left = x + 'px';
        poi.labelEl.style.top = y + 'px';
        poi._lastX = x;
        poi._lastY = y;
      }
    }
  }
}

// ======= LIFECYCLE =======

// Carica i POI salvati per il modello corrente e crea marker/label
export function loadPoisForModel(folder) {
  unloadPois();
  currentFolder = folder || null;
  if (!currentFolder) return;
  const stored = loadStored(currentFolder);
  poiIdCounter = 0;
  stored.forEach(item => {
    poiIdCounter++;
    pois.push({
      id: poiIdCounter,
      name: item.name,
      p: { x: item.p.x, y: item.p.y, z: item.p.z },
      createdAt: item.createdAt || Date.now(),
      sphere: createPoiMarker(item.p),
      labelEl: createPoiLabel(item.name)
    });
  });
  updatePoiList();
  updatePoiControlsState();
}

// Rimuove marker e label dal modello corrente (lo storage resta intatto)
export function unloadPois() {
  pois.forEach(poi => {
    disposeThreeObject(poi.sphere);
    if (poi.labelEl && poi.labelEl.parentNode) poi.labelEl.parentNode.removeChild(poi.labelEl);
  });
  pois = [];
  currentFolder = null;
  isAddingPoi = false;
  document.body.classList.remove('adding-poi');
  updatePoiAddButton();
  updatePoiList();
  updatePoiControlsState();
}

export function updatePoiControlsState() {
  const hasModel = !!depModel();
  if (poiToggle) {
    poiToggle.disabled = !hasModel;
    poiToggle.checked = hasModel && poiEnabled;
  }
  if (poiExportBtn) poiExportBtn.disabled = pois.length === 0;
  if (poiAddBtn) poiAddBtn.disabled = !hasModel;
}

// ======= PANNELLO =======

function showPoiPanel() {
  if (!poiPanel) return;
  closeOtherPanelsMobile(poiPanel);
  placePanel(poiPanel);
  poiPanel.style.display = 'block';
  if (isSmallScreen()) {
    if (deps && deps.closeMobileMenu) deps.closeMobileMenu();
    showPanelBackdrop();
  }
}

function hidePoiPanel() {
  if (!poiPanel) return;
  poiPanel.style.display = 'none';
  clearMinimizedState(poiPanel);
  if (isSmallScreen() && !anyPanelOpen()) hidePanelBackdrop();
}

function closePoiMode() {
  poiEnabled = false;
  isAddingPoi = false;
  document.body.classList.remove('adding-poi');
  if (poiToggle) poiToggle.checked = false;
  updatePoiAddButton();
  hidePoiPanel();
}

function updatePoiHint() {
  if (!poiHintText) return;
  if (isAddingPoi) {
    poiHintText.textContent = _t('poi.hintClick', 'Clicca sul modello per aggiungere un punto');
  } else {
    poiHintText.textContent = _t('poi.hint', 'Premi + e clicca sul modello');
  }
}

function updatePoiAddButton() {
  if (!poiAddBtn) return;
  poiAddBtn.classList.toggle('active', isAddingPoi);
  poiAddBtn.setAttribute('aria-pressed', isAddingPoi ? 'true' : 'false');
  updatePoiHint();
}

// ======= LISTA =======

function updatePoiList() {
  if (!poiList) return;
  poiList.replaceChildren();
  if (pois.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'measure-list-empty';
    empty.textContent = _t('poi.noPois', 'Nessun punto di interesse');
    poiList.appendChild(empty);
    return;
  }
  pois.forEach(poi => {
    const row = document.createElement('div');
    row.className = 'measure-list-item poi-list-item';
    row.dataset.id = String(poi.id);

    const name = document.createElement('span');
    name.className = 'poi-list-name';
    name.textContent = poi.name; // input utente: mai innerHTML

    const gotoBtn = document.createElement('button');
    gotoBtn.className = 'poi-list-action poi-list-goto';
    gotoBtn.dataset.id = String(poi.id);
    gotoBtn.title = _t('poi.goto', 'Vai al punto');
    gotoBtn.textContent = '🎯';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'poi-list-action poi-list-rename';
    renameBtn.dataset.id = String(poi.id);
    renameBtn.title = _t('poi.rename', 'Rinomina');
    renameBtn.textContent = '✏';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'measure-list-delete poi-list-delete';
    deleteBtn.dataset.id = String(poi.id);
    deleteBtn.title = _t('poi.delete', 'Elimina');
    deleteBtn.textContent = '×';

    row.append(name, gotoBtn, renameBtn, deleteBtn);
    poiList.appendChild(row);
  });
  updatePoiControlsState();
}

function findPoi(id) {
  return pois.find(p => p.id === id);
}

function deletePoi(id) {
  const idx = pois.findIndex(p => p.id === id);
  if (idx === -1) return;
  const poi = pois[idx];
  disposeThreeObject(poi.sphere);
  if (poi.labelEl && poi.labelEl.parentNode) poi.labelEl.parentNode.removeChild(poi.labelEl);
  pois.splice(idx, 1);
  persist();
  updatePoiList();
  showToast(_t('poi.deleted', 'Punto eliminato'));
}

// Rinomina inline: sostituisce il nome con un input fino a Invio/blur
function startRenamePoi(id) {
  const poi = findPoi(id);
  if (!poi || !poiList) return;
  const row = poiList.querySelector(`.poi-list-item[data-id="${id}"]`);
  if (!row) return;
  const nameEl = row.querySelector('.poi-list-name');
  if (!nameEl) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'poi-rename-input';
  input.value = poi.name;
  input.maxLength = 60;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const newName = input.value.trim();
    if (save && newName) {
      poi.name = newName;
      if (poi.labelEl) {
        const labelName = poi.labelEl.querySelector('.poi-label-name');
        if (labelName) labelName.textContent = newName;
      }
      persist();
    }
    updatePoiList();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    e.stopPropagation();
  });
  input.addEventListener('blur', () => finish(true));
}

// ======= GOTO (anima camera verso il POI) =======

function gotoPoi(id) {
  const poi = findPoi(id);
  const model = depModel();
  const camera = depCamera();
  const controls = deps && deps.getControls ? deps.getControls() : null;
  if (!poi || !model || !camera || !controls) return;
  if (deps.getIsFP && deps.getIsFP()) return; // disabilitato in prima persona

  model.updateMatrixWorld(true);
  const targetWorld = new THREE.Vector3(poi.p.x, poi.p.y, poi.p.z).applyMatrix4(model.matrixWorld);

  // Distanza di arrivo: ~15% del raggio del bounding box del modello
  const box = new THREE.Box3().setFromObject(model);
  const radius = box.getSize(new THREE.Vector3()).length() * 0.5 || 1;
  const dist = Math.max(radius * 0.15, 0.5);

  // Mantieni la direzione di vista corrente, avvicinati al punto
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (!isFinite(dir.lengthSq()) || dir.lengthSq() === 0) dir.set(0, 0.4, 1).normalize();
  const targetCamPos = targetWorld.clone().add(dir.multiplyScalar(dist));

  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const duration = 600;
  const start = performance.now();
  const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const k = ease(t);
    camera.position.lerpVectors(startPos, targetCamPos, k);
    controls.target.lerpVectors(startTarget, targetWorld, k);
    controls.update();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  haptic(8);
}

// ======= AGGIUNTA PUNTI (raycast come le misurazioni) =======

function handlePoiClick(event) {
  const model = depModel();
  if (!poiEnabled || !isAddingPoi || !model) return;
  if (deps.getIsFP && deps.getIsFP()) return;
  const renderer = deps.getRenderer ? deps.getRenderer() : null;
  if (!renderer || event.target !== renderer.domElement) return;

  const rect = getCachedRendererRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  reusableMouseVec2.set(x, y);
  poiRaycaster.setFromCamera(reusableMouseVec2, depCamera());
  const intersects = poiRaycaster.intersectObject(model, true);

  // Prima intersezione valida: escludi marker/misure e rispetta la sezione attiva
  let localPoint = null;
  model.updateMatrixWorld(true);
  for (const intersect of intersects) {
    if (isMeasureObject(intersect.object)) continue;
    const lp = model.worldToLocal(intersect.point.clone());
    if (deps.isPointVisibleWithSection && !deps.isPointVisibleWithSection(lp)) continue;
    localPoint = lp;
    break;
  }
  if (!localPoint) return;

  poiIdCounter++;
  const defaultName = _t('poi.defaultName', 'Punto') + ' ' + poiIdCounter;
  const poi = {
    id: poiIdCounter,
    name: defaultName,
    p: { x: localPoint.x, y: localPoint.y, z: localPoint.z },
    createdAt: Date.now(),
    sphere: createPoiMarker(localPoint),
    labelEl: createPoiLabel(defaultName)
  };
  pois.push(poi);
  persist();
  haptic([10, 40, 10]);

  // Disattiva la modalità aggiunta e proponi subito la rinomina
  isAddingPoi = false;
  document.body.classList.remove('adding-poi');
  updatePoiAddButton();
  updatePoiList();
  startRenamePoi(poi.id);
}

// ======= EXPORT / IMPORT JSON =======

function exportPois() {
  if (pois.length === 0 || !currentFolder) {
    showToast(_t('poi.exportNone', 'Nessun punto da esportare'));
    return;
  }
  const data = pois.map(p => ({ name: p.name, p: p.p, createdAt: p.createdAt }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `poi_${currentFolder}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(_t('poi.exported', 'Punti esportati'));
}

function importPoisFromFile(file) {
  if (!file || !currentFolder) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!Array.isArray(parsed)) throw new Error('not an array');
      const valid = parsed.filter(isValidPoiShape);
      if (valid.length === 0) throw new Error('no valid items');
      valid.forEach(item => {
        poiIdCounter++;
        pois.push({
          id: poiIdCounter,
          name: item.name,
          p: { x: item.p.x, y: item.p.y, z: item.p.z },
          createdAt: item.createdAt || Date.now(),
          sphere: createPoiMarker(item.p),
          labelEl: createPoiLabel(item.name)
        });
      });
      persist();
      updatePoiList();
      showToast(_t('poi.imported', 'Punti importati'));
    } catch (e) {
      showToast(_t('poi.importError', 'File non valido'));
    }
  };
  reader.readAsText(file);
}

// ======= INIZIALIZZAZIONE UI =======

/**
 * Inizializza il sistema POI e il wiring degli eventi.
 * @param {Object} d - Dipendenze dallo stato del viewer:
 *   getCurrentModel, getCamera, getRenderer, getControls, getIsFP,
 *   isPointVisibleWithSection, closeMobileMenu
 */
export function initPoiUI(d) {
  deps = d;

  if (!poiPanel) return;

  registerPanel(poiPanel, closePoiMode);
  initPanelDrag(poiPanel, poiPanelHeader, poiPanelClose);

  // Toggle POI dal menu
  if (poiToggle) {
    eventManager.add(poiToggle, 'change', () => {
      if (!depModel()) {
        poiToggle.checked = false;
        return;
      }
      poiEnabled = !!poiToggle.checked;
      if (poiEnabled) {
        showPoiPanel();
      } else {
        closePoiMode();
      }
    }, false, 'ui');
  }

  // Pulsante chiudi / minimizza
  if (poiPanelClose) {
    eventManager.add(poiPanelClose, 'click', () => { closePoiMode(); }, false, 'ui');
  }
  if (poiPanelMinimize) {
    eventManager.add(poiPanelMinimize, 'click', () => {
      minimizePanelMobile(poiPanel, _t('poi.listTitle', 'Punti di interesse'), '📍');
    }, false, 'ui');
  }

  // Pulsante + (arma la modalità aggiunta)
  if (poiAddBtn) {
    eventManager.add(poiAddBtn, 'click', () => {
      if (!depModel()) return;
      isAddingPoi = !isAddingPoi;
      document.body.classList.toggle('adding-poi', isAddingPoi);
      updatePoiAddButton();
      // Su telefono il backdrop del bottom sheet intercettava il tocco sul
      // modello: il pannello si riduce a pillola per liberare la scena
      if (isAddingPoi && isSmallScreen() && poiPanel?.style.display === 'block') {
        minimizePanelMobile(poiPanel, _t('poi.listTitle', 'Punti di interesse'), '📍');
      }
    }, false, 'ui');
  }

  // Event delegation sulla lista: goto / rename / delete
  if (poiList) {
    eventManager.add(poiList, 'click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      if (!Number.isFinite(id)) return;
      e.stopPropagation();
      if (btn.classList.contains('poi-list-goto')) gotoPoi(id);
      else if (btn.classList.contains('poi-list-rename')) startRenamePoi(id);
      else if (btn.classList.contains('poi-list-delete')) deletePoi(id);
    }, false, 'ui');
  }

  // Export / import
  if (poiExportBtn) {
    eventManager.add(poiExportBtn, 'click', () => { exportPois(); }, false, 'ui');
  }
  if (poiImportBtn && poiImportFile) {
    eventManager.add(poiImportBtn, 'click', () => { poiImportFile.click(); }, false, 'ui');
    eventManager.add(poiImportFile, 'change', () => {
      const file = poiImportFile.files && poiImportFile.files[0];
      importPoisFromFile(file);
      poiImportFile.value = '';
    }, false, 'ui');
  }

  // Click sul canvas per aggiungere un POI
  const renderer = deps.getRenderer ? deps.getRenderer() : null;
  if (renderer) {
    eventManager.add(renderer.domElement, 'click', handlePoiClick, false, 'renderer');
  }

  updatePoiList();
  updatePoiControlsState();
}
