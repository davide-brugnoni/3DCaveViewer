/*
  3D Cave Viewer - Pannello di amministrazione: anteprima dell'orientamento
  https://github.com/davide-brugnoni/3DCaveViewer/
  https://www.3dcaveviewer.com

  Copyright (C) 2025 Davide Brugnoni davide.brugnoni@gmail.com

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program. If not, see https://www.gnu.org/licenses/.
*/

// Scheda "Orientamento" del modulo modello: mostra il modello su una
// griglia orizzontale (il pavimento, Y in alto come nel visualizzatore) e
// lo ruota con i gradi dei campi rotX/rotY/rotZ. I campi restano la sola
// fonte del valore salvato: qui si legge e si scrive solo lì, con un evento
// "input" che fa scattare il segno di modifica non salvata di js/admin.js.
//
// La rotazione si applica come in applyModelRotation() di js/viewer.js
// (Euler XYZ in gradi sull'oggetto), così l'anteprima e il visualizzatore
// coincidono. Anche il punto di vista di partenza è quello del
// visualizzatore (vista "viewer": camera a 60° di campo, da +Z verso il
// centro del modello ruotato, inquadratura di computeFrame() con margine
// 1.2) e si ricalcola a ogni rotazione, come fa il visualizzatore quando
// apre il modello: ciò che si vede qui è ciò che vedrà il pubblico.
// Per questo in quella vista il trascinamento gira il MODELLO (cioè i
// gradi salvati) e non la camera, e la rotella non fa zoom: una vista
// costruita girando la camera non verrebbe salvata, e il visualizzatore
// aprirebbe il modello in un altro modo. Le altre viste (3D, Fronte, Lato,
// Alto) sono solo di controllo: lì si gira la camera, e lo si dice.
// Il modello si carica solo quando la scheda diventa visibile:
// aprire il modulo per cambiare la descrizione non deve scaricare 100 MB.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { fetchBinaryModel } from './viewer/model-loader.js';
import { parseGltfLean } from './viewer/gltf-memory.js';

const root = document.getElementById('adm-orient');
const fields = {
  x: document.getElementById('f-rotX'),
  y: document.getElementById('f-rotY'),
  z: document.getElementById('f-rotZ'),
};

if (root && fields.x && fields.y && fields.z) {
  initOrientation();
}

function initOrientation() {
  const AXES = ['x', 'y', 'z'];
  const WORLD_AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  // Le anteprime non servono a ispezionare le texture: tetti bassi, anche
  // su desktop, così aprire un modello pesante non costa centinaia di MB
  const PREVIEW_TEXTURES = { maxSize: 2048, maxPixels: 16e6 };

  const msg = root.dataset;
  const canvasHost = document.getElementById('adm-orient-canvas');
  const stage = root.querySelector('.adm-orient-stage');
  const status = document.getElementById('adm-orient-status');
  const statusText = status.querySelector('.adm-orient-status-text');
  const loadButton = document.getElementById('adm-orient-load');
  const localNote = document.getElementById('adm-orient-local');
  const viewNote = document.getElementById('adm-orient-viewnote');
  const fileInput = document.getElementById('f-model-file');
  const sliders = new Map(AXES.map((axis) => [axis, root.querySelector(`[data-orient-slider="rot${axis.toUpperCase()}"]`)]));
  const autoBytes = Number(msg.autoBytes) || 60 * 1024 * 1024;

  const format = (template, values) => String(template || '').replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m));
  const formatBytes = (n) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  };

  // Valori salvati (per "Ripristina"): il campo nascosto base del modulo
  let saved = { x: 0, y: 0, z: 0 };
  try {
    const base = JSON.parse(document.querySelector('#adm-model-form input[name="base"]')?.value || '{}');
    saved = { x: parseDeg(base.rotX), y: parseDeg(base.rotY), z: parseDeg(base.rotZ) };
  } catch (e) { /* modello nuovo */ }

  root.hidden = false;

  // ===== Campi ⇄ rotazione =====
  function parseDeg(value) {
    const n = parseFloat(String(value ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  // (-180, 180], due decimali, mai "-0"
  function normalizeDeg(value) {
    let v = ((value % 360) + 360) % 360;
    if (v > 180) v -= 360;
    v = Math.round(v * 100) / 100;
    return Object.is(v, -0) || Math.abs(v) < 0.005 ? 0 : v;
  }
  const readDegrees = () => ({ x: parseDeg(fields.x.value), y: parseDeg(fields.y.value), z: parseDeg(fields.z.value) });

  function writeDegrees(deg) {
    AXES.forEach((axis) => {
      const value = normalizeDeg(deg[axis]);
      const text = value === 0 ? '0' : String(value);
      if (fields[axis].value === text) return;
      fields[axis].value = text;
      // bubbles: js/admin.js segna la scheda come modificata
      fields[axis].dispatchEvent(new Event('input', { bubbles: true }));
    });
    syncFromFields();
  }

  function syncSliders(deg) {
    sliders.forEach((slider, axis) => {
      if (slider && document.activeElement !== slider) slider.value = String(Math.round(normalizeDeg(deg[axis])));
    });
  }

  function syncFromFields() {
    const deg = readDegrees();
    syncSliders(deg);
    applyRotation(deg);
  }

  AXES.forEach((axis) => {
    fields[axis].addEventListener('input', syncFromFields);
    fields[axis].addEventListener('change', syncFromFields);
  });
  sliders.forEach((slider, axis) => {
    if (!slider) return;
    slider.addEventListener('input', () => {
      const deg = readDegrees();
      deg[axis] = Number(slider.value);
      writeDegrees(deg);
    });
  });

  // Rotazione di ±90° attorno a un asse del MONDO (non dell'oggetto già
  // ruotato): "giralo sul fianco" fa quello che si vede, qualunque sia la
  // rotazione di partenza. Il risultato torna in Euler XYZ per i campi.
  root.addEventListener('click', (event) => {
    const turn = event.target.closest('[data-orient-turn]');
    if (turn) {
      const deg = readDegrees();
      const current = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(deg.x), THREE.MathUtils.degToRad(deg.y), THREE.MathUtils.degToRad(deg.z), 'XYZ'));
      const step = new THREE.Quaternion().setFromAxisAngle(WORLD_AXIS[turn.dataset.orientTurn],
        THREE.MathUtils.degToRad(Number(turn.dataset.orientDeg) || 0));
      const euler = new THREE.Euler().setFromQuaternion(current.premultiply(step), 'XYZ');
      writeDegrees({
        x: THREE.MathUtils.radToDeg(euler.x),
        y: THREE.MathUtils.radToDeg(euler.y),
        z: THREE.MathUtils.radToDeg(euler.z),
      });
      return;
    }
    const preset = event.target.closest('[data-orient-preset]');
    if (preset) {
      const name = preset.dataset.orientPreset;
      if (name === 'zup') writeDegrees({ x: -90, y: 0, z: 0 });
      else if (name === 'zero') writeDegrees({ x: 0, y: 0, z: 0 });
      else if (name === 'saved') writeDegrees(saved);
      return;
    }
    const view = event.target.closest('[data-orient-view]');
    if (view) setView(view.dataset.orientView);
  });

  syncSliders(readDegrees());

  // ===== Scena (creata alla prima apertura della scheda) =====
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let pivot = null; // porta la rotazione dei campi
  let holder = null; // centra il modello sul pivot
  let grid = null;
  let axesHelper = null;
  let model = null;
  let radius = 1;
  let currentView = 'viewer';
  let visible = false;
  let started = false;

  function setStatus(text, showButton = false) {
    status.hidden = text === '' && !showButton;
    statusText.textContent = text;
    loadButton.hidden = !showButton;
  }

  function createScene() {
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch (e) {
      renderer = null;
      setStatus(msg.msgNowebgl);
      root.querySelectorAll('.adm-orient-views button').forEach((b) => { b.disabled = true; });
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--panel-bg-solid').trim() || '#161b22';
    renderer.setClearColor(new THREE.Color(bg));
    // Misure fissate qui e non solo in css/admin.css: con un foglio di stile
    // vecchio in cache il canvas prenderebbe la sua dimensione intrinseca,
    // il contenitore crescerebbe con lui e il ResizeObserver lo ingrandirebbe
    // di nuovo a ogni giro (pagina lunghissima, modello mai visibile)
    if (stage.clientHeight < 50) stage.style.height = '420px';
    stage.style.position = 'relative';
    stage.style.overflow = 'hidden';
    Object.assign(canvasHost.style, { position: 'absolute', inset: '0' });
    Object.assign(renderer.domElement.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none',
    });
    canvasHost.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    // Stesso campo visivo verticale del visualizzatore (js/viewer.js)
    camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1000);
    camera.position.set(4, 3, 5);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.6));
    // Luce "frontale" che segue la camera: le pareti verso chi guarda sono
    // sempre illuminate, qualunque sia il punto di vista
    const headlight = new THREE.DirectionalLight(0xffffff, 1.4);
    headlight.position.set(0.3, 0.6, 1);
    camera.add(headlight);
    scene.add(camera);

    pivot = new THREE.Group();
    holder = new THREE.Group();
    pivot.add(holder);
    scene.add(pivot);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = true;
    // Chi gira o sposta la vista a mano esce dalla vista "viewer": le
    // rotazioni successive non devono riportarlo indietro di colpo
    controls.addEventListener('start', () => { if (currentView !== 'viewer') markView(null); });
    controls.enabled = currentView !== 'viewer';
    bindModelDrag(renderer.domElement);
    markView(currentView);

    buildGrid(1);
    resize();
    new ResizeObserver(resize).observe(canvasHost);
    return true;
  }

  function niceSize(value) {
    const exp = Math.pow(10, Math.floor(Math.log10(value)));
    const f = value / exp;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
  }

  function buildGrid(r) {
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    if (axesHelper) { scene.remove(axesHelper); axesHelper.geometry.dispose(); axesHelper.material.dispose(); }
    const size = niceSize(r * 3);
    grid = new THREE.GridHelper(size, 20, 0x6a7a90, 0x34404f);
    grid.material.transparent = true;
    grid.material.opacity = 0.85;
    scene.add(grid);
    // Assi del mondo sempre visibili (anche attraverso il modello):
    // rosso X, verde Y = alto, blu Z, come i pulsanti accanto
    axesHelper = new THREE.AxesHelper(r * 0.9);
    axesHelper.material.depthTest = false;
    axesHelper.material.transparent = true;
    axesHelper.renderOrder = 10;
    scene.add(axesHelper);
  }

  function resize() {
    if (!renderer) return;
    const width = canvasHost.clientWidth;
    const height = canvasHost.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (currentView === 'viewer') frameLikeViewer();
  }

  function markView(name) {
    currentView = name;
    root.querySelectorAll('[data-orient-view]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.orientView === name));
    });
    const isViewer = name === 'viewer';
    if (controls) controls.enabled = !isViewer;
    if (renderer) renderer.domElement.style.cursor = isViewer ? 'grab' : '';
    if (viewNote) viewNote.hidden = isViewer;
  }

  // ===== Trascinamento nella vista "Visualizzatore": gira il modello =====
  // La camera del visualizzatore guarda da +Z con l'alto sulla Y: un
  // trascinamento orizzontale gira il modello attorno alla Y del mondo,
  // uno verticale attorno alla X del mondo (l'asse "destra" della camera),
  // come prendere in mano il modello. Il quaternione vivo resta qui durante
  // il gesto, i campi (arrotondati a 0,01°) ne ricevono gli Euler XYZ.
  function bindModelDrag(el) {
    let drag = null;
    const qStep = new THREE.Quaternion();
    const qAxis = new THREE.Quaternion();
    el.addEventListener('pointerdown', (event) => {
      if (currentView !== 'viewer' || !model || event.button > 0) return;
      const deg = readDegrees();
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(
          THREE.MathUtils.degToRad(deg.x), THREE.MathUtils.degToRad(deg.y), THREE.MathUtils.degToRad(deg.z), 'XYZ')),
      };
      el.setPointerCapture(event.pointerId);
      el.style.cursor = 'grabbing';
      event.preventDefault();
    });
    el.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      // Tutta l'altezza dell'anteprima = 180°
      const k = Math.PI / Math.max(el.clientHeight, 1);
      qStep.setFromAxisAngle(WORLD_AXIS.y, dx * k);
      qAxis.setFromAxisAngle(WORLD_AXIS.x, dy * k);
      qStep.multiply(qAxis);
      drag.quat.premultiply(qStep).normalize();
      const euler = new THREE.Euler().setFromQuaternion(drag.quat, 'XYZ');
      writeDegrees({
        x: THREE.MathUtils.radToDeg(euler.x),
        y: THREE.MathUtils.radToDeg(euler.y),
        z: THREE.MathUtils.radToDeg(euler.z),
      });
    });
    const end = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
      el.style.cursor = currentView === 'viewer' ? 'grab' : '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // La vista iniziale del visualizzatore: centerScaleAndLight() centra il
  // modello GIÀ ruotato sul suo box, poi computeFrame() (margine 1.2) mette
  // la camera su +Z alla distanza che fa stare altezza, larghezza e
  // profondità nel campo visivo. Lo stesso calcolo, sul box del pivot.
  const frameBox = new THREE.Box3();
  function frameLikeViewer() {
    if (!camera) return;
    const margin = 1.2;
    const empty = !model || frameBox.setFromObject(pivot).isEmpty();
    const center = empty ? new THREE.Vector3() : frameBox.getCenter(new THREE.Vector3());
    const size = empty ? new THREE.Vector3(radius, radius, radius).multiplyScalar(2) : frameBox.getSize(new THREE.Vector3());
    const halfFovY = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const halfFovX = Math.atan(Math.tan(halfFovY) * (camera.aspect || 1));
    const distance = Math.max(
      (size.y * margin * 0.5) / Math.tan(halfFovY),
      (size.x * margin * 0.5) / Math.tan(halfFovX),
      (size.z * margin * 0.5) / Math.tan(halfFovY),
      1e-3
    );
    const maxSize = Math.max(size.x, size.y, size.z) * margin;
    camera.up.set(0, 1, 0);
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
    camera.near = Math.max(distance - maxSize * 2, distance / 1000, 1e-4);
    camera.far = distance + maxSize * 2 + radius * 20;
    camera.updateProjectionMatrix();
    controls.update();
  }

  const box = new THREE.Box3();
  function applyRotation(deg = readDegrees()) {
    if (!pivot) return;
    pivot.rotation.set(
      THREE.MathUtils.degToRad(deg.x),
      THREE.MathUtils.degToRad(deg.y),
      THREE.MathUtils.degToRad(deg.z),
      'XYZ'
    );
    pivot.updateMatrixWorld(true);
    // La griglia sta sotto il punto più basso del modello ruotato: è il
    // pavimento su cui "appoggia", il riferimento per capire cosa è in alto
    const floor = model && !box.setFromObject(pivot).isEmpty() ? box.min.y : -radius;
    grid.position.y = floor;
    axesHelper.position.set(0, floor, 0);
    // Come il visualizzatore, che reinquadra il modello dopo averlo ruotato
    if (currentView === 'viewer') frameLikeViewer();
  }

  function setView(name) {
    if (!camera) return;
    markView(name);
    if (name === 'viewer') { frameLikeViewer(); return; }
    const dirs = {
      iso: new THREE.Vector3(1, 0.75, 1.3),
      front: new THREE.Vector3(0, 0, 1),
      side: new THREE.Vector3(1, 0, 0),
      top: new THREE.Vector3(0, 1, 0.0001),
    };
    const dir = (dirs[name] || dirs.iso).normalize();
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect));
    const distance = (radius / Math.sin(fit / 2)) * 1.05;
    controls.target.set(0, 0, 0);
    camera.position.copy(dir.multiplyScalar(distance));
    camera.near = Math.max(distance / 1000, radius / 1000);
    camera.far = distance + radius * 20;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function setVisible(isVisible) {
    visible = isVisible;
    if (!renderer) return;
    renderer.setAnimationLoop(visible ? () => {
      controls.update();
      renderer.render(scene, camera);
    } : null);
  }

  function disposeModel() {
    if (!model) return;
    holder.remove(model);
    model.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      const materials = Array.isArray(node.material) ? node.material : (node.material ? [node.material] : []);
      materials.forEach((material) => {
        Object.values(material).forEach((value) => { if (value && value.isTexture) value.dispose(); });
        material.dispose();
      });
    });
    model = null;
  }

  function showModel(object) {
    disposeModel();
    model = object;
    // Si vede anche l'interno delle pareti: le grotte sono spesso mesh aperte
    model.traverse((node) => {
      const materials = Array.isArray(node.material) ? node.material : (node.material ? [node.material] : []);
      materials.forEach((material) => { material.side = THREE.DoubleSide; });
    });
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-3);
    holder.position.copy(center).negate();
    holder.add(model);
    buildGrid(radius);
    applyRotation();
    setView('viewer');
    setStatus('');
  }

  // ===== Caricamento =====
  let loadSeq = 0;
  let abort = null;
  let source = null; // { url, size } | { file }

  function savedSource() {
    return msg.modelUrl ? { url: msg.modelUrl, size: Number(msg.modelSize) || 0 } : null;
  }

  function sourceSize(src) {
    return src.file ? src.file.size : src.size;
  }

  function offer(src) {
    source = src;
    localNote.hidden = !(src && src.file);
    if (src && src.file) localNote.textContent = format(msg.msgLocal, { name: src.file.name });
    if (!src) {
      loadSeq++;
      if (abort) abort.abort();
      disposeModel();
      setStatus(msg.msgNone);
      return;
    }
    if (!renderer) return; // la scheda non è ancora stata aperta
    if (sourceSize(src) > autoBytes) {
      loadSeq++;
      if (abort) abort.abort();
      setStatus(format(msg.msgBig, { size: formatBytes(sourceSize(src)) }), true);
    } else {
      load(src);
    }
  }

  async function load(src) {
    const seq = ++loadSeq;
    const isStale = () => seq !== loadSeq;
    if (abort) abort.abort();
    abort = new AbortController();
    setStatus(format(msg.msgLoading, { percent: 0 }));

    let buffer;
    try {
      if (src.file) {
        buffer = await src.file.arrayBuffer();
      } else {
        buffer = await fetchBinaryModel(src.url, {
          signal: abort.signal,
          onProgress: (loaded, total) => {
            if (!isStale() && total > 0) setStatus(format(msg.msgLoading, { percent: Math.floor((loaded / total) * 100) }));
          },
        });
      }
    } catch (error) {
      if (!isStale() && error.name !== 'AbortError') setStatus(format(msg.msgError, { error: error.message || error }));
      return;
    }
    if (isStale()) return;
    setStatus(msg.msgParsing);

    // Un DRACOLoader per caricamento, eliminato a fine parse: il suo worker
    // WebAssembly non deve restare in memoria dopo l'anteprima
    const draco = new DRACOLoader().setDecoderPath('./lib/three/examples/jsm/libs/draco/');
    const ktx2 = new KTX2Loader().setTranscoderPath('./lib/three/examples/jsm/libs/basis/').detectSupport(renderer);
    const loader = new GLTFLoader()
      .setDRACOLoader(draco)
      .setKTX2Loader(ktx2)
      .setMeshoptDecoder(MeshoptDecoder);
    const gpuMax = renderer.capabilities.maxTextureSize || 4096;
    const limits = { maxSize: Math.min(PREVIEW_TEXTURES.maxSize, gpuMax), maxPixels: PREVIEW_TEXTURES.maxPixels };
    const done = () => { draco.dispose(); ktx2.dispose(); };

    parseGltfLean(loader, buffer, '', limits, (gltf) => {
      done();
      const object = gltf.scene || (gltf.scenes && gltf.scenes[0]);
      if (isStale() || !object) {
        if (!object && !isStale()) setStatus(format(msg.msgError, { error: 'glTF senza scene' }));
        return;
      }
      showModel(object);
    }, (error) => {
      done();
      if (!isStale() && !(error && error.name === 'AbortError')) {
        setStatus(format(msg.msgError, { error: (error && error.message) || error }));
      }
    }, isStale);
  }

  loadButton.addEventListener('click', () => { if (source) load(source); });

  // Un nuovo file scelto nella scheda "File 3D" si vede subito qui,
  // prima ancora di salvarlo
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) { offer(savedSource()); return; }
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (ext !== 'glb' && ext !== 'gltf') {
        offer(null);
        setStatus(msg.msgUnsupported);
        return;
      }
      offer({ file });
    });
  }

  source = savedSource();
  if (!source) setStatus(msg.msgNone);

  // La scheda è nascosta finché non la si apre: niente WebGL né download
  // prima. Funziona anche senza schede (pagina lunga, JavaScript di
  // admin.js assente): conta solo che l'anteprima entri nello schermo.
  new IntersectionObserver((entries) => {
    const isVisible = entries.some((entry) => entry.isIntersecting);
    if (isVisible && !started) {
      started = true;
      if (createScene()) {
        applyRotation();
        offer(source);
        if (!source) setStatus(msg.msgNone);
      }
    }
    setVisible(isVisible);
    if (isVisible) resize();
  }).observe(stage);
}
