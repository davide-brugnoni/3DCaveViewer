    import * as THREE from 'three';
    import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
    import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
    import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
    import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
    import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
       import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
    import { VRButton } from 'three/addons/webxr/VRButton.js';
    import {
      isTouch, isSmallScreen, SMALL_SCREEN_QUERY, debounce, showToast, haptic, togglePopover,
      disposeThreeObject, disposeThreeObjects, restoreOriginalColor,
      eventManager, niceNumber, formatUnits, formatBytes, _t
    } from './viewer/utils.js';
    import {
      showLoader, hideLoader, showLoaderError, modelLoadErrorMessage, isLoaderError,
      resetLoaderWatchdog, clearLoaderWatchdog
    } from './viewer/loader-ui.js';
    import { fetchBinaryModel } from './viewer/model-loader.js';
    import { parseGltfLean } from './viewer/gltf-memory.js';
    import { checkGpuUpload, collectModelStats, showDiagnostics, logDiagnostic } from './viewer/diagnostics.js';
    import {
      registerPanel, showPanelBackdrop, hidePanelBackdrop, anyPanelOpen,
      minimizePanelMobile, restoreMinimizedPanel, clearMinimizedState,
      closeOtherPanelsMobile, resetPanelPosition, placePanel,
      initPanelDrag, initBottomSheetSwipe, initMiniBarSwipe, multiBindClose
    } from './viewer/panels.js';
    import {
      initPoiUI, updatePoiLabels, loadPoisForModel, unloadPois
    } from './viewer/annotations.js';
    import {
      initMeasureUI, updateMeasureControlsState, updateMeasureLabels,
      invalidateRendererRect,
      resetMeasureState, clearAllMeasurements, disableMeasureMode,
      hasMeasurements, getMeasurements, formatMeasureDistance,
      toggleMeasureMode, hideMeasurePanel
    } from './viewer/measure.js';
    import {
      modelSelectorWrapper, modelSelectorToggle, modelSelectorLabel, modelSelectorDropdown,
      modelSelectorSearch, modelSelectorList, modelSelectorEmpty,
      resetViewBtn, autoRotateToggle, enterFPToggle, infoOpenBtn, helpOpenBtn,
      menuToggle, controlsContainer,
      viewsToggle, viewsPanel, viewsPanelHeader, viewsPanelClose, shareBtn, screenshotBtn,
      sectionToggle, sectionPanel, sectionPanelHeader, sectionPanelClose,
      sectionEnableInput, sectionSlider, sectionValue, sectionAxisButtons, sectionInvertBtn,
      measureEnableInput, measureClearBtn, measureListContainer, measureHintText,
      measurePanel, measurePanelHeader, measurePanelClose, measureAddBtn,
      panelBackdrop, panelMiniBar, panelMiniIcon, panelMiniLabel,
      measurePanelMinimize, sectionPanelMinimize, viewsPanelMinimize,
      scaleBarEl, scaleLabelEl,
      overlay, overlayFill, overlayPct, overlayName, overlayStatusText, overlayStatusIcon,
      overlayFileSize, overlayErrorMessage, loaderErrorBox, loaderRetryBtn,
      crosshair, vrVignette, armHint, toast,
      infoOverlay, infoTitle, infoCoords, infoDesc, infoCloseBtn,
      helpOverlay, helpSubtitle, helpContent, helpCloseBtn, helpDontShow,
      onboard, onboardClose, onboardDont, coachBubble,
      joystick, stickEl, embedFullscreenBtn, poiPanel, poiPanelClose
    } from './viewer/dom.js';
    import { initEmbedUI, refreshEmbedCode, resetShareTabs } from './viewer/embed.js';

    // Carica configurazione (con fallback ai valori di default)
    const cfg = window.APP_CONFIG || {};
    const viewerCfg = cfg.viewer || {};
    // Cartella dei modelli (paths.modelsFolder), senza barre agli estremi
    const MODELS_FOLDER = String(cfg.paths?.modelsFolder || 'modelli').replace(/^\/+|\/+$/g, '');
    const DEBUG = !!viewerCfg.debug;

    // ===== Modalità incorporata (?embed=1) =====
    // viewer.php marca il body; qui serve solo per spegnere ciò che in un
    // iframe dentro un articolo di terzi non ha senso (onboarding, riscrittura
    // dell'URL, rigenerazione dell'anteprima social).
    const isEmbed = document.body.classList.contains('embed-mode');
    const embedUi = new Set((document.body.dataset.embedUi || '').split(/\s+/).filter(Boolean));
    const embedHas = (token) => embedUi.has(token);

    // isTouch è rilevato in ./viewer/utils.js (pointer: coarse media query)
    const pointerLockSupported = ('pointerLockElement' in document) || ('mozPointerLockElement' in document);
    document.documentElement.classList.toggle('touch', isTouch);
    document.body.classList.toggle('touch', isTouch);

    // iOS/iPadOS (iPadOS 13+ si presenta come "MacIntel" ma è touch):
    // usato per disattivare l'MSAA, molto costoso sulle GPU Apple mobile
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // ===== Rendering on-demand =====
    // Renderizza solo quando la scena può essere cambiata (input, damping,
    // animazioni, autorotate, FP, VR). A scena ferma il loop esce subito e la
    // GPU resta a riposo: su mobile evita il throttling termico che rende la
    // webapp progressivamente lenta dopo pochi minuti di utilizzo.
    const RENDER_IDLE_GRACE_MS = 3000; // margine dopo l'ultima attività
    let lastRenderActivity = performance.now();
    function requestRender() { lastRenderActivity = performance.now(); }

    let scene, camera, renderer, controls;
    let fpControls = null, isFP = false;
    let currentModel = null, currentModelInfo = null, modelsData = [];
    // Vista camera richiesta dai parametri URL cam/tgt (consumata una sola volta dopo il load)
    let pendingCameraFromURL = null;
    // Piano di sezione richiesto dal parametro URL sec (stessa logica one-shot)
    let pendingSectionFromURL = null;
    let isFraming = false;
    let interiorRig = null;
    let cameraRig = null;
    let skyDome = null;
    const skyDomeTmpVec = new THREE.Vector3();

    // Posizione iniziale della vista e orientamento del modello
    let initialCamPos = null, initialTarget = null, initialNear = viewerCfg.defaultNear || 0.1, initialFar = viewerCfg.defaultFar || 2000, initialModelQuat = null;

    let gltfLoader;
    const vrPrevTarget = new THREE.Vector3();
    const vrPrevCameraPos = new THREE.Vector3();
    const tmpVecA = new THREE.Vector3();
    const tmpVecB = new THREE.Vector3();
    const tmpVecC = new THREE.Vector3();
    const vrMoveVector = new THREE.Vector3();
    const vrTempDirection = new THREE.Vector3();
    const vrTempQuaternion = new THREE.Quaternion();
    const vrCollisionVector = new THREE.Vector3();
    // Vettori riutilizzabili per il loop di movimento FP (evita allocazioni ogni frame)
    const fpForward = new THREE.Vector3();
    const fpRight = new THREE.Vector3();
    const fpMove = new THREE.Vector3();
    const fpUp = new THREE.Vector3(0, 1, 0);
    // Vettori riutilizzabili per collision detection
    const collideDir = new THREE.Vector3();
    // Vettori riutilizzabili per VR yaw compensation
    const vrHeadPosBefore = new THREE.Vector3();
    const vrHeadPosAfter = new THREE.Vector3();
    const VR_MOVE_SPEED = viewerCfg.vrMoveSpeed || 2.0;
    const VR_YAW_SPEED = viewerCfg.vrYawSpeed || 1.8;
    const VR_DEAD_ZONE = viewerCfg.vrDeadZone || 0.15;

    // VR: Posizione iniziale del rig quando si entra in VR
    const vrInitialRigPos = new THREE.Vector3();
    const vrInitialRigRot = new THREE.Euler();

    // VR: Doppio click grilletto
    let lastTriggerTime = 0;
    let triggerWasPressed = false;
    const DOUBLE_CLICK_THRESHOLD = viewerCfg.vrDoubleClickThreshold || 400; // ms

    // VR: Comfort vignette
    let vignetteIntensity = 0;
    const VIGNETTE_MAX_INTENSITY = viewerCfg.vrVignetteMaxIntensity || 0.6;
    const VIGNETTE_FADE_SPEED = viewerCfg.vrVignetteFadeSpeed || 3.0;

    // _t (traduzione con fallback) è in ./viewer/utils.js

    // Gli elementi DOM sono cachati in ./viewer/dom.js
    let modelSelectorValue = ''; // tracks the currently selected model name
    let autoRotateTimer = null;

    menuToggle.setAttribute('aria-label', _t('menu.open', 'Apri menu'));
    menuToggle.setAttribute('aria-expanded', 'false');

    // Carica le traduzioni client-side (guida, toast, etichette dinamiche):
    // senza init() window.t non ha dati e _t() ricade sempre sul fallback italiano
    if (window.i18n) {
      window.i18n.init().then(() => {
        menuToggle.setAttribute('aria-label', _t('menu.open', 'Apri menu'));
      }).catch(() => {});
    }

    // Desktop: move model selector into controls-container as the first item (original single-row layout).
    // Va rifatto (e disfatto) a ogni cambio di layout: ruotando il telefono
    // dopo il caricamento la top-bar restava nascosta in verticale, con
    // hamburger e selettori irraggiungibili, o vuota in orizzontale.
    const chromeTopBar = document.getElementById('top-bar');
    const chromeLang = document.getElementById('language-selector');
    const chromeHome = [modelSelectorWrapper, chromeLang]
      .filter(Boolean)
      .map((el) => ({ el, parent: el.parentNode, next: el.nextSibling }));
    let chromeSelectorGroup = null;
    function applyChromeLayout() {
      if (!controlsContainer) return;
      if (!isSmallScreen()) {
        if (modelSelectorWrapper) {
          if (!chromeSelectorGroup) {
            chromeSelectorGroup = document.createElement('div');
            chromeSelectorGroup.className = 'menu-group menu-group-selector';
          }
          if (chromeSelectorGroup.parentNode !== controlsContainer) controlsContainer.prepend(chromeSelectorGroup);
          chromeSelectorGroup.appendChild(modelSelectorWrapper);
        }
        // Sposta anche il selettore lingua dalla top-bar ai pulsanti secondari
        const footerGroup = controlsContainer.querySelector('.menu-group-footer');
        if (chromeLang && footerGroup) footerGroup.appendChild(chromeLang);
        if (chromeTopBar) chromeTopBar.style.display = 'none';
      } else if (!isEmbed) {
        chromeHome.forEach(({ el, parent, next }) => {
          if (!parent || el.parentNode === parent) return;
          parent.insertBefore(el, next && next.parentNode === parent ? next : null);
        });
        chromeSelectorGroup?.remove();
        if (chromeTopBar) chromeTopBar.style.display = '';
        controlsContainer.classList.remove('open');
      }
    }
    applyChromeLayout();
    if (window.matchMedia) {
      const smallScreenMql = window.matchMedia(SMALL_SCREEN_QUERY);
      const onLayoutChange = () => { applyChromeLayout(); requestRender(); };
      if (smallScreenMql.addEventListener) smallScreenMql.addEventListener('change', onLayoutChange);
      else smallScreenMql.addListener?.(onLayoutChange);
    }

    // Nella pagina incorporata la top-bar è sempre nascosta: il selettore
    // lingua, se richiesto con ?ui=lang, va comunque spostato fra i pulsanti
    // secondari, altrimenti su mobile resterebbe irraggiungibile.
    if (isEmbed) {
      const langSelector = document.getElementById('language-selector');
      const footerGroup = controlsContainer?.querySelector('.menu-group-footer');
      if (langSelector && footerGroup && !footerGroup.contains(langSelector)) {
        footerGroup.appendChild(langSelector);
      }
    }

    let viewsGrid       = document.getElementById('views-grid');

    // Logo sovrapposto agli screenshot: il percorso arriva risolto da
    // config.php (stringa vuota se il file non esiste, niente 404).
    const _exportLogoImg = new Image();
    const _exportLogoSrc = window.APP_CONFIG?.pwa?.logo || '';
    if (_exportLogoSrc) _exportLogoImg.src = _exportLogoSrc;
    const DESIRED_BAR_PX = viewerCfg.scaleBarWidth || 150;
    // Unità della barra di scala. Il calcolo lavora sempre in metri e
    // converte solo per l'etichetta: senza il fattore, scegliere "ft"
    // rietichetterebbe i metri come piedi invece di convertirli.
    const UNIT_TABLE = { m: { label: 'm', factor: 1 }, ft: { label: 'ft', factor: 3.28084 } };
    const SCALE_UNIT = UNIT_TABLE[viewerCfg.scaleBarUnit] || UNIT_TABLE.m;
    let lastScaleBarPx = -1;
    let lastScaleLabelText = '';

    let sectionEnabled = false;
    let sectionDirty = false;
    let sectionAxis = 'y';
    let sectionInvert = true;
    let sectionBoundsLocal = null;
    let sectionLocalPlane = null;
    let sectionPlane = null;
    let sectionPlaneArray = null;
    const sectionNormalMatrix = new THREE.Matrix3();
    const sectionTempMatrix = new THREE.Matrix4();
    const sectionTempBox = new THREE.Box3();
    const sectionTempBox2 = new THREE.Box3();

    // Lo stato e le funzioni di misurazione sono in ./viewer/measure.js

    // Loader overlay e watchdog sono in ./viewer/loader-ui.js
    let lastRequestedModelName = '';

    const LS_KEY_DONT_HELP  = 'dontShowFPHelp';
    let helpTimer = null;

    const LS_KEY_DONT_ONBOARD = 'dontShowOnboard';

    // Movement FP
    const clock = new THREE.Clock();
    let moveForward=false, moveBackward=false, moveLeft=false, moveRight=false;
    let boost=false;
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const FP_BASE_SPEED = viewerCfg.fpBaseSpeed || 1.2;
    const FP_BOOST_MULT = viewerCfg.fpBoostMultiplier || 3.0;

    // Joystick
    let joyActive=false, joyX=0, joyY=0, joyRadius=0, activePointerId=null;

    // Funzione di debug globale per verificare lo stato del joystick
    // (disponibile solo con viewer.debug = true in config)
    if (DEBUG) {
    window.debugJoystick = function() {
      console.log('=== DEBUG JOYSTICK ===');
      console.log('isTouch:', isTouch);
      console.log('Elemento joystick:', joystick);
      console.log('Classi body:', document.body.className);
      console.log('enterFPToggle.checked:', enterFPToggle?.checked);
      console.log('isFP:', isFP);
      if (joystick) {
        const computed = window.getComputedStyle(joystick);
        console.log('display:', computed.display);
        console.log('position:', computed.position);
        console.log('z-index:', computed.zIndex);
        console.log('opacity:', computed.opacity);
        console.log('visibility:', computed.visibility);
      }
      console.log('======================');
    };
    }

    // Touch-look (mobile FP fallback)
    let lookActive = false, lookPointerId = null, lastLX = 0, lastLY = 0;
    // Doppio tap (mobile FP): ogni doppio tocco sul canvas fa un passo in avanti
    const TAP_STEP_DISTANCE   = viewerCfg.tapStepDistance || 1.0; // unità (metri) per passo
    const TAP_STEP_SPEED_MULT = 2.5;  // velocità del passo rispetto a fpBaseSpeed
    const TAP_MAX_DURATION    = 250;  // ms: tocchi più lunghi sono drag/hold
    const TAP_MAX_MOVE_PX     = 24;   // px: oltre questa soglia il tocco è un drag
    const TAP_DOUBLE_DELAY    = 300;  // ms massimi tra i due tocchi
    const TAP_DOUBLE_DIST_PX  = 60;   // px massimi tra le posizioni dei due tocchi
    let lookStartX = 0, lookStartY = 0, lookStartTime = 0, lookMultiTouch = false;
    let lastTapTime = 0, lastTapX = 0, lastTapY = 0;
    let tapStepRemaining = 0; // distanza del passo ancora da percorrere
    const LOOK_SENS_BASE = viewerCfg.lookSensitivity || 0.004;
    // Su touch: scala la sensibilità inversamente alla viewport (schermo più stretto → gesto più ampio)
    function getLookSens() {
      if (!isTouch) return LOOK_SENS_BASE;
      const scale = Math.max(0.4, Math.min(1.0, window.innerWidth / 800));
      return LOOK_SENS_BASE / scale;
    }

    // BVH per accelerare i raycast (collisioni FP/VR a ogni frame):
    // acceleratedRaycast usa il boundsTree quando presente, altrimenti
    // ricade sul raycast standard di Three.js.
    THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
    THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
    THREE.Mesh.prototype.raycast = acceleratedRaycast;

    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true; // usato solo per le collisioni: basta il primo hit
    const COLLISION_PAD = viewerCfg.collisionPadding || 0.05;
const manager = new THREE.LoadingManager();
    // Un item fallito fa comunque avanzare il LoadingManager fino a "tutto
    // caricato": senza questi controlli l'overlay tornerebbe verde e poi
    // sparirebbe, cancellando l'errore appena mostrato.
    manager.onProgress = (url, loaded, total) => {
      if (isLoaderError()) return;
      const pct = Math.round((loaded / Math.max(total, 1)) * 100);
      showLoader(pct, { isProcessing: false });
    };
    manager.onLoad = () => {
      if (isLoaderError()) return;
      showLoader(100, { isProcessing: true });
      setTimeout(hideLoader, 300);
    };
    manager.onError = (url) => {
      console.error('Loading error:', url);
      hideLoader();
    };

    let pendingFPStart = false;

    // ======= UTILITY FUNCTIONS =======
    // disposeThreeObject(s), restoreOriginalColor, eventManager e togglePopover
    // sono in ./viewer/utils.js

    function setSectionValuePlaceholder() {
      if (sectionValue) sectionValue.textContent = '—';
    }

    function updateSectionControlsState() {
      const hasModel = !!currentModel;
      if (sectionEnableInput) {
        sectionEnableInput.disabled = !hasModel;
        sectionEnableInput.checked = hasModel && sectionEnabled;
      }
      if (sectionSlider) {
        sectionSlider.disabled = !hasModel || !sectionEnabled;
      }
      if (sectionInvertBtn) {
        sectionInvertBtn.disabled = !hasModel || !sectionEnabled;
        sectionInvertBtn.setAttribute('aria-pressed', sectionInvert ? 'true' : 'false');
      }
      sectionAxisButtons.forEach((btn) => {
        btn.disabled = !hasModel;
        const axis = btn.getAttribute('data-section-axis');
        btn.classList.toggle('active', axis === sectionAxis);
      });
      if (!hasModel) {
        setSectionValuePlaceholder();
      }
    }

  function updateSectionPositionLabel(pos, min, max) {
      if (!sectionValue) return;
      if (!isFinite(pos) || !isFinite(min) || !isFinite(max)) {
        setSectionValuePlaceholder();
        return;
      }
      const range = max - min;
      const percent = range === 0 ? 0 : ((pos - min) / range) * 100;
      sectionValue.textContent = `${pos.toFixed(2)} (${percent.toFixed(0)}%)`;
    }

    function computeSectionBoundsLocal() {
      if (!currentModel) return null;
      currentModel.updateMatrixWorld(true);
      const inverse = sectionTempMatrix.copy(currentModel.matrixWorld).invert();
      const bounds = sectionTempBox.makeEmpty();
      const helperBox = sectionTempBox2;
      let hasBox = false;
      currentModel.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        const geom = child.geometry;
        if (!geom.boundingBox) geom.computeBoundingBox();
        if (!geom.boundingBox) return;
        helperBox.copy(geom.boundingBox);
        helperBox.applyMatrix4(child.matrixWorld);
        helperBox.applyMatrix4(inverse);
        if (!hasBox) {
          bounds.copy(helperBox);
          hasBox = true;
        } else {
          bounds.union(helperBox);
        }
      });
      return hasBox ? bounds.clone() : null;
    }

    function refreshSectionPlane() {
      if (!sectionSlider) return;
      if (!currentModel) {
        sectionBoundsLocal = null;
        sectionLocalPlane = null;
        sectionPlane = null;
        sectionPlaneArray = null;
        setSectionValuePlaceholder();
        return;
      }
      if (!sectionBoundsLocal) {
        sectionBoundsLocal = computeSectionBoundsLocal();
      }
      const bounds = sectionBoundsLocal;
      if (!bounds) {
        setSectionValuePlaceholder();
        return;
      }
      const axis = sectionAxis || 'y';
      const min = bounds.min[axis];
      const max = bounds.max[axis];
      if (!isFinite(min) || !isFinite(max)) {
        setSectionValuePlaceholder();
        return;
      }
      if (!sectionLocalPlane) sectionLocalPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const sliderVal = Number(sectionSlider.value ?? 0);
      const t = THREE.MathUtils.clamp(sliderVal / 100, 0, 1);
      const pos = THREE.MathUtils.lerp(min, max, t);
      const normal = axis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : axis === 'y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
      if (sectionInvert) normal.negate();
      sectionLocalPlane.normal.copy(normal);
      const component = axis === 'x' ? normal.x : axis === 'y' ? normal.y : normal.z;
      sectionLocalPlane.constant = -pos * component;
      sectionDirty = true;
      updateWorldSectionPlane();
      updateSectionPositionLabel(pos, min, max);
    }

    function updateWorldSectionPlane() {
      if (!sectionLocalPlane || !currentModel) return null;
      if (!sectionPlane) sectionPlane = new THREE.Plane();
      // Serve solo la matrice della radice: updateMatrixWorld(true)
      // percorreva l'intero albero del modello a ogni frame
      currentModel.updateWorldMatrix(true, false);
      sectionPlane.copy(sectionLocalPlane);
      sectionNormalMatrix.getNormalMatrix(currentModel.matrixWorld);
      sectionPlane.applyMatrix4(currentModel.matrixWorld, sectionNormalMatrix);
      if (!sectionPlaneArray) sectionPlaneArray = [sectionPlane];
      return sectionPlane;
    }

    function updateSectionClipping() {
      sectionDirty = true;
      requestRender();
      const planeArray = (sectionEnabled && updateWorldSectionPlane()) ? sectionPlaneArray : null;
      if (currentModel) {
        currentModel.traverse((child) => {
          if (!child.isMesh) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => {
            if (!mat) return;
            mat.clippingPlanes = planeArray;
            mat.clipShadows = !!planeArray;
            mat.needsUpdate = true;
          });
        });
      }
      if (renderer) renderer.localClippingEnabled = !!planeArray;
    }

    function applySectionSettings() {
      refreshSectionPlane();
      updateSectionClipping();
    }

    function isSectionPanelOpen() {
      return !!(sectionPanel && sectionPanel.style.display === 'block');
    }

    // Mobile helpers — il framework pannelli (backdrop, minimize, drag, swipe)
    // è in ./viewer/panels.js; i pannelli sono registrati nel registry più sotto.
    function closeMobileMenu() {
      if (!isSmallScreen()) return;
      if (controlsContainer) {
        controlsContainer.classList.remove('open');
        controlsContainer.style.transform = '';
      }
      if (menuToggle) {
        menuToggle.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', _t('menu.open', 'Apri menu'));
      }
      if (!anyPanelOpen()) hidePanelBackdrop();
    }

    // Registrazione nel panel registry (le funzioni di chiusura sono hoisted)
    registerPanel(sectionPanel, () => closeSectionPanel());
    registerPanel(measurePanel, () => hideMeasurePanel());
    // viewsPanel: closeViewsPanel è definita dentro init(); chiusura equivalente qui
    registerPanel(viewsPanel, () => {
      viewsPanel.style.display = 'none';
      clearMinimizedState(viewsPanel);
      if (viewsToggle) { viewsToggle.checked = false; viewsToggle.setAttribute('aria-checked', 'false'); }
    });

    function openSectionPanel() {
      if (!sectionPanel) return;
      closeOtherPanelsMobile(sectionPanel);
      placePanel(sectionPanel);
      sectionPanel.style.display = 'block';
      if (sectionToggle) {
        sectionToggle.checked = true;
        sectionToggle.setAttribute('aria-checked', 'true');
      }
      refreshSectionPlane();
      if (isSmallScreen()) { closeMobileMenu(); showPanelBackdrop(); }
    }

    function closeSectionPanel() {
      if (!sectionPanel) return;
      sectionPanel.style.display = 'none';
      clearMinimizedState(sectionPanel);
      if (sectionToggle) {
        sectionToggle.checked = false;
        sectionToggle.setAttribute('aria-checked', 'false');
      }
      if (isSmallScreen() && !anyPanelOpen()) hidePanelBackdrop();
    }

    function clearSectionClippingFor(obj) {
      if (!obj) return;
      obj.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (!mat) return;
          mat.clippingPlanes = null;
          mat.clipShadows = false;
          mat.needsUpdate = true;
        });
      });
    }

    function resetSectionState() {
      sectionEnabled = false;
      sectionAxis = 'y';
      sectionInvert = true;
      sectionBoundsLocal = null;
      sectionLocalPlane = null;
      sectionPlane = null;
      sectionPlaneArray = null;
      if (sectionEnableInput) sectionEnableInput.checked = false;
      if (sectionSlider) sectionSlider.value = 50;
      if (sectionInvertBtn) sectionInvertBtn.setAttribute('aria-pressed', 'false');
      setSectionValuePlaceholder();
      updateSectionControlsState();
      updateSectionClipping();
    }

    resetSectionState();

    // ======= MISURAZIONE: vedi ./viewer/measure.js =======
    // Resta qui solo isPointVisibleWithSection perché dipende dallo stato sezioni.
    // Verifica se un punto locale è visibile rispetto alla sezione attiva
    function isPointVisibleWithSection(localPoint) {
      if (!sectionEnabled || !sectionLocalPlane) {
        return true;
      }
      // In Three.js il clipping mostra il lato dove distanceToPoint > 0
      // Il piano sectionLocalPlane ha già la normale invertita se sectionInvert=true
      // quindi controlliamo sempre il lato positivo
      const distance = sectionLocalPlane.distanceToPoint(localPoint);
      const isVisible = distance >= -0.01;
      return isVisible;
    }

    /* ======= SKY DOME ======= */
    // Cupola di sfondo: riproduce nella scena WebGL il gradiente CSS della
    // pagina, così è visibile anche nel visore VR (il compositor XR non può
    // mostrare lo sfondo CSS dietro al canvas trasparente).
    function createSkyDome() {
      const gradient = cfg.theme?.sceneGradient || ['#1a2a33', '#0f181f', '#080d13', '#04070b'];
      const stops = cfg.theme?.sceneGradientStops || [0.0, 0.45, 0.70, 1.0];
      const radius = viewerCfg.skyDomeRadius || 1000;
      const colors = gradient.map((c) => new THREE.Color(c));

      const geometry = new THREE.SphereGeometry(1, 32, 24);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColors: { value: colors },
          uStops:  { value: stops },
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            // Forza la profondità sul piano far: la cupola non viene mai
            // tagliata dal frustum qualunque sia camera.far
            gl_Position.z = gl_Position.w * 0.999999;
          }
        `,
        fragmentShader: `
          uniform vec3 uColors[4];
          uniform float uStops[4];
          varying vec3 vDir;
          float seg(float a, float b, float t) {
            return clamp((t - a) / max(b - a, 1e-5), 0.0, 1.0);
          }
          void main() {
            // t = 0 all'orizzonte (colore centrale del gradiente CSS),
            // t = 1 a zenit/nadir (colore del bordo): bagliore d'orizzonte
            // stabile, indipendente dallo sguardo (comfort VR)
            float t = abs(normalize(vDir).y);
            vec3 col = mix(uColors[0], uColors[1], seg(uStops[0], uStops[1], t));
            col = mix(col, uColors[2], seg(uStops[1], uStops[2], t));
            col = mix(col, uColors[3], seg(uStops[2], uStops[3], t));
            gl_FragColor = vec4(col, 1.0);
            // Solo conversione di colorspace, niente tone mapping: i colori
            // resi devono corrispondere esattamente agli hex del CSS
            #include <colorspace_fragment>
          }
        `,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
      });

      const dome = new THREE.Mesh(geometry, material);
      dome.name = 'skyDome';
      dome.scale.setScalar(radius);
      dome.renderOrder = -1000;
      dome.frustumCulled = false;
      return dome;
    }

    function disposeSkyDome() {
      if (!skyDome) return;
      scene.remove(skyDome);
      skyDome.geometry.dispose();
      skyDome.material.dispose();
      skyDome = null;
    }

    /* ======= INIT ======= */
    init();
    renderer.setAnimationLoop(animate);

    // Cache status indicator
    updateCacheStatus();


    function init() {
      scene = new THREE.Scene();
      scene.background = null;

      if (viewerCfg.skyDomeEnabled !== false) {
        skyDome = createSkyDome();
        scene.add(skyDome);
      }

      camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 5000);
      camera.position.set(0, 1, 7);

      cameraRig = new THREE.Group();
      cameraRig.position.set(0, 0, 0);
      cameraRig.rotation.set(0, 0, 0);
      scene.add(cameraRig);
      cameraRig.add(camera);

      // antialias disattivato su iOS: l'MSAA con DPR ≥2 satura la GPU Apple
      // mobile (throttling termico); il DPR elevato già smussa i bordi
      renderer = new THREE.WebGLRenderer({ antialias: !isIOS, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(window.innerWidth, window.innerHeight);
      applyRendererPixelRatio();
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.setClearColor(0x000000, 0);
      document.body.appendChild(renderer.domElement);

      // Perdita del contesto WebGL (tipica su mobile sotto pressione di memoria):
      // preventDefault() consente al browser di ripristinare il contesto e a
      // Three.js di ricaricare le risorse GPU; senza, il viewer resta nero.
      // Su iOS il contesto spesso non torna più: senza un limite di tempo il
      // caricamento indeterminato girerebbe per sempre. E se torna, ricaricare
      // le stesse texture può farlo riperdere: dalla seconda perdita il modello
      // viene ricaricato con texture più piccole.
      let contextLostTimer = null;
      let contextLossCount = 0;
      renderer.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        contextLossCount++;
        logDiagnostic(`webglcontextlost #${contextLossCount}`);
        showLoader(0, { isIndeterminate: true });
        showToast(_t('loader.contextLost', 'Contesto grafico perso: ripristino in corso…'));
        clearTimeout(contextLostTimer);
        contextLostTimer = setTimeout(() => {
          showLoaderError(_t('loader.errorMemory', 'Il modello è troppo grande per la memoria di questo dispositivo. Chiudi le altre schede e riprova.'));
        }, 12000);
      });
      renderer.domElement.addEventListener('webglcontextrestored', () => {
        clearTimeout(contextLostTimer);
        logDiagnostic('webglcontextrestored');
        showToast(_t('loader.contextRestored', 'Contesto grafico ripristinato.'));
        if (contextLossCount >= 2 && lastRequestedModelName) {
          textureReduction = Math.min(textureReduction * 2, 8);
          loadModelByName(lastRequestedModelName);
        } else {
          hideLoader();
        }
        requestRender();
      });

      // Rendering on-demand: qualsiasi input utente (canvas o pannelli UI)
      // riattiva il render loop; listener in capture così vede anche gli
      // eventi fermati con stopPropagation dai singoli widget
      ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown', 'keyup',
       'touchstart', 'touchmove', 'touchend', 'input', 'change'].forEach((type) => {
        document.addEventListener(type, requestRender, { capture: true, passive: true });
      });
      // Rientro da VR e ritorno in foreground: la scena va ridisegnata
      renderer.xr.addEventListener?.('sessionstart', requestRender);
      renderer.xr.addEventListener?.('sessionend', requestRender);
      document.addEventListener('visibilitychange', requestRender);

      // Nella pagina incorporata la VR non è raggiungibile (il pulsante è
      // nascosto) e l'iframe di un articolo non ha il permesso
      // xr-spatial-tracking: interrogare navigator.xr riempirebbe la console
      // del lettore di violazioni di permissions policy, senza scopo.
      if (!isEmbed) {
        renderer.xr.enabled = true;
        if (renderer.xr.setReferenceSpaceType) {
          renderer.xr.setReferenceSpaceType('local-floor');
        }
        // Foveation massima sui visori standalone (default di three r160, reso esplicito)
        renderer.xr.setFoveation?.(1.0);
        const vrButton = VRButton.createButton(renderer);
        vrButton.id = 'vr-button';
        vrButton.classList.add('btn');
        vrButton.title = 'Entra nella modalità visore (Meta Quest, ecc.)';
        vrButton.style.position = '';
        vrButton.style.right = '';
        vrButton.style.bottom = '';
        vrButton.style.display = 'none';

        const showVRButtonInMenu = () => {
          if (!controlsContainer.contains(vrButton)) {
            controlsContainer.appendChild(vrButton);
          }
          vrButton.style.display = '';
        };

        if ('xr' in navigator) {
          const xr = navigator.xr;
          if (xr?.isSessionSupported) {
            xr.isSessionSupported('immersive-vr')
              .then((supported) => {
                if (supported) showVRButtonInMenu();
              })
              .catch(() => {/* ignore */});
          } else if (xr?.supportsSession) {
            xr.supportsSession('immersive-vr')
              .then(() => showVRButtonInMenu())
              .catch(() => {/* ignore */});
          }
        }
      } // fine blocco VR (saltato in modalità incorporata)

      // GLTF toolchain
      const dracoLoader = new DRACOLoader(manager);
      dracoLoader.setDecoderPath('./lib/three/examples/jsm/libs/draco/');
      // Ogni worker Draco ha il proprio heap WebAssembly, che cresce fino alla
      // mesh più grande decodificata e non si restringe più: su mobile ne
      // basta uno, che non moltiplica quella memoria per il numero di core.
      const dracoWorkers = isTouch ? 1 : (navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 4) : 2);
      try { dracoLoader.setWorkerLimit(dracoWorkers); } catch(e) { /* fallback al default */ }
      const ktx2Loader = new KTX2Loader(manager)
        .setTranscoderPath('./lib/three/examples/jsm/libs/basis/')
        .detectSupport(renderer);
      gltfLoader = new GLTFLoader(manager)
        .setDRACOLoader(dracoLoader)
        .setKTX2Loader(ktx2Loader)
        .setMeshoptDecoder(MeshoptDecoder);

      // Luci generali
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const dir = new THREE.DirectionalLight(0xffffff, 0.85); dir.position.set(10, 12, 8); scene.add(dir);
      const fill = new THREE.PointLight(0xffffff, 0.5, 0, 2); fill.position.set(-6, 3, -4); scene.add(fill);
      const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.35); scene.add(hemi);

      // Orbit
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotate = false;
      controls.autoRotateSpeed = -2.0; // rotazione verso sinistra
      controls.minDistance = 0.0001;
      controls.target.set(0, 0, 0);
      // Rendering on-demand: tiene vivo il loop finché la camera si muove
      // davvero (inerzia del damping inclusa, anche oltre il grace period)
      controls.addEventListener('change', requestRender);

      autoRotateToggle.checked = controls.autoRotate;
      autoRotateToggle.setAttribute('aria-checked', controls.autoRotate ? 'true' : 'false');

       // Allow vertical rotation only when dragging primarily up/down
      let dragActive = false;
      let dragLocked = false;
      let startX = 0, startY = 0, initialPolar = 0;
      let lastX = 0, rotatingModel = false;
      let dragPointerId = null;
      let multiTouch = false;
      const activePointers = new Set();
      const domEl = renderer.domElement;

      const onRendererPointerDown = (e) => {
        activePointers.add(e.pointerId);
        if (isFP) return;
        if (activePointers.size > 1) {
          // Secondo dito: il gesto è un pinch/pan di OrbitControls. Annulla
          // l'eventuale rotazione modello in corso e riabilita i controls,
          // altrimenti il modello si sposta involontariamente durante lo zoom.
          multiTouch = true;
          dragActive = false;
          dragLocked = false;
          rotatingModel = false;
          dragPointerId = null;
          if (!renderer.xr.isPresenting) controls.enabled = true;
          return;
        }
        if (multiTouch) return; // dita non ancora tutte sollevate dal gesto precedente
        dragActive = true;
        dragLocked = false;
        rotatingModel = false;
        dragPointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        lastX = e.clientX;
        initialPolar = controls.getPolarAngle();
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = Math.PI;
      };

      const onRendererPointerMove = (e) => {
        if (!dragActive || isFP || multiTouch) return;
        if (e.pointerId !== dragPointerId) return;
        if (rotatingModel) {
          if (currentModel) {
            const delta = e.clientX - lastX;
            currentModel.rotation.y += delta * 0.01;
            lastX = e.clientX;
          }
          return;
        }
        if (dragLocked) return;
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx > dy && dx > 2) {
          controls.enabled = false;
          rotatingModel = true;
          dragLocked = true;
        } else if (dy > dx && dy > 2) {
          controls.minPolarAngle = 0;
          controls.maxPolarAngle = Math.PI;
          dragLocked = true;
        }
      };

      const endDrag = (e) => {
        if (e && e.pointerId !== undefined) activePointers.delete(e.pointerId);
        if (activePointers.size === 0) multiTouch = false;
        if (!dragActive) return;
        dragActive = false;
        rotatingModel = false;
        dragPointerId = null;
        if (!isFP && !renderer.xr.isPresenting) controls.enabled = true;
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = Math.PI;
      };

      // Listener renderer - gruppo 'renderer'
      // In capture: deve girare prima del pointerdown di OrbitControls. Dopo
      // un trascinamento orizzontale i controls sono disattivati, e se il
      // secondo dito di un pinch arrivava a OrbitControls prima che venissero
      // riattivati, quello lo scartava e restava in rotazione a un dito:
      // la camera scattava e girava invece di zoomare.
      eventManager.add(domEl, 'pointerdown', onRendererPointerDown, { capture: true }, 'renderer');
      eventManager.add(domEl, 'pointermove', onRendererPointerMove, false, 'renderer');
      eventManager.add(window, 'pointerup', endDrag, false, 'renderer');
      eventManager.add(window, 'pointerleave', endDrag, false, 'renderer');
      eventManager.add(window, 'pointercancel', endDrag, false, 'renderer');

      // Gesture-lock a due dita: OrbitControls di default esegue zoom e pan
      // insieme (TOUCH.DOLLY_PAN), quindi un pinch non perfettamente simmetrico
      // trascina anche la camera. Qui il gesto viene classificato all'inizio
      // (pinch o pan) e l'altro movimento viene disattivato fino al rilascio.
      const PINCH_LOCK_THRESHOLD = viewerCfg.pinchLockThresholdPx || 10;
      let twoFingerGesture = null;

      const twoFingerMetrics = (touches) => ({
        dist: Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY),
        midX: (touches[0].clientX + touches[1].clientX) / 2,
        midY: (touches[0].clientY + touches[1].clientY) / 2,
      });

      const endTwoFingerGesture = () => {
        if (!twoFingerGesture) return;
        // FP/VR disattivano pan/zoom di proposito: non ripristinarli in quei casi
        if (controls.enabled) {
          controls.enablePan = twoFingerGesture.prevPan;
          controls.enableZoom = twoFingerGesture.prevZoom;
        }
        twoFingerGesture = null;
      };

      const onGestureTouchStart = (e) => {
        if (isFP || renderer.xr.isPresenting) return;
        if (e.touches.length === 2) {
          endTwoFingerGesture();
          const m = twoFingerMetrics(e.touches);
          twoFingerGesture = {
            startDist: m.dist,
            startMidX: m.midX,
            startMidY: m.midY,
            locked: false,
            prevPan: controls.enablePan,
            prevZoom: controls.enableZoom,
          };
        } else {
          endTwoFingerGesture();
        }
      };

      const onGestureTouchMove = (e) => {
        if (!twoFingerGesture || twoFingerGesture.locked || e.touches.length !== 2) return;
        const m = twoFingerMetrics(e.touches);
        const pinchDelta = Math.abs(m.dist - twoFingerGesture.startDist);
        const panDelta = Math.hypot(m.midX - twoFingerGesture.startMidX, m.midY - twoFingerGesture.startMidY);
        if (pinchDelta < PINCH_LOCK_THRESHOLD && panDelta < PINCH_LOCK_THRESHOLD) return;
        twoFingerGesture.locked = true;
        if (pinchDelta >= panDelta) {
          controls.enablePan = false;   // pinch: solo zoom
        } else {
          controls.enableZoom = false;  // pan: solo trascinamento
        }
      };

      const onGestureTouchEnd = (e) => {
        if (e.touches.length < 2) endTwoFingerGesture();
      };

      eventManager.add(domEl, 'touchstart', onGestureTouchStart, {passive:true}, 'renderer');
      eventManager.add(domEl, 'touchmove', onGestureTouchMove, {passive:true}, 'renderer');
      eventManager.add(window, 'touchend', onGestureTouchEnd, {passive:true}, 'renderer');
      eventManager.add(window, 'touchcancel', onGestureTouchEnd, {passive:true}, 'renderer');


      // PointerLock (desktop)
      fpControls = new PointerLockControls(camera, renderer.domElement);
      fpControls.addEventListener('change', requestRender);
      fpControls.addEventListener('lock', ()=>{ 
        isFP = true; 
        controls.enabled = false; controls.enableRotate = false; controls.enablePan = false; controls.enableZoom = false;
        crosshair.style.opacity = '1';
        enterFPToggle.checked = true; enterFPToggle.setAttribute('aria-checked','true');
        updateFPUI();
      });
      fpControls.addEventListener('unlock', ()=>{
        isFP = false;
        controls.enabled = true; controls.enableRotate = true; controls.enablePan = true; controls.enableZoom = true;
        crosshair.style.opacity = '0';
        enterFPToggle.checked = false; enterFPToggle.setAttribute('aria-checked','false');
        joyReset(); updateFPUI(); hideHelp();
      });

      renderer.xr.addEventListener('sessionstart', () => {
        document.body.classList.add('vr');
        vrPrevTarget.copy(controls.target);
        camera.getWorldPosition(vrPrevCameraPos);
        controls.autoRotate = false;
        enterFPToggle.disabled = true;
        enterFPToggle.setAttribute('aria-disabled', 'true');

        cameraRig.position.set(0, 0, 0);
        cameraRig.rotation.set(0, 0, 0);
        cameraRig.updateMatrixWorld(true);

        if (currentModel) {
          // Scala 1:1 PRIMA del posizionamento: computeFrame deve misurare
          // il modello alle dimensioni reali, non a quelle ridotte del browser
          applyModelScaleForMode(currentModel, true);

          const frame = computeFrame(currentModel, 1.2);
          // A scala 1:1 la distanza di inquadratura può essere di centinaia di
          // metri: parti a pochi metri dal centro della grotta
          const startDistance = Math.min(frame.distance, 5);
          // In XR la posa della camera è sovrascritta dal visore a ogni frame:
          // il posizionamento si fa spostando il rig. Con 'local-floor' i piedi
          // sono all'altezza del rig e gli occhi ~1.6m sopra
          const eyeHeight = 1.6;
          const eyeY = Math.max(frame.center.y, eyeHeight);
          cameraRig.position.set(
            frame.center.x,
            eyeY - eyeHeight,
            frame.center.z + startDistance
          );
          cameraRig.updateMatrixWorld(true);
          controls.target.copy(frame.center);

          // Piani di profondità per il modello 1:1 e la cupola di sfondo:
          // il WebXRManager li propaga a depthNear/depthFar della sessione
          camera.near = viewerCfg.defaultNear || 0.1;
          camera.far = Math.max(viewerCfg.defaultFar || 2000, frame.far, (viewerCfg.skyDomeRadius || 1000) * 1.5);
          camera.updateProjectionMatrix();
        } else {
          // Fallback se non c'è modello caricato
          camera.position.set(0, 1.6, 2);
          controls.target.set(0, 1.6, 0);
        }

        // Salva posizione iniziale VR per reset vista
        vrInitialRigPos.copy(cameraRig.position);
        vrInitialRigRot.copy(cameraRig.rotation);

        // Reset stato doppio click grilletto
        lastTriggerTime = 0;
        triggerWasPressed = false;

        autoRotateToggle.checked = false;
        autoRotateToggle.setAttribute('aria-checked', 'false');
        controls.enabled = false; controls.enableRotate = false; controls.enablePan = false; controls.enableZoom = false;
        if (fpControls?.isLocked) {
          try { fpControls.unlock(); } catch (e) {}
        }
        crosshair.style.opacity = '0';
       enterFPToggle.checked = false;
        enterFPToggle.setAttribute('aria-checked', 'false');
        enterFPToggle.disabled = true;
        enterFPToggle.setAttribute('aria-disabled', 'true');
        updateFPUI();

        if (currentModel) {
          updateScaleBar();
          refreshSectionPlane();
          updateSectionControlsState();
          if (sectionEnabled) updateSectionClipping();
        }
      });

      renderer.xr.addEventListener('sessionend', () => {
        document.body.classList.remove('vr');

        // Reset vignette
        vignetteIntensity = 0;
        vrVignette.style.opacity = '0';

        controls.enabled = true; controls.enableRotate = true; controls.enablePan = true; controls.enableZoom = true;
        enterFPToggle.disabled = false;
        enterFPToggle.removeAttribute('aria-disabled');

        const xrCamera = renderer.xr.getCamera(camera);
        const newWorldPos = xrCamera.getWorldPosition(tmpVecA);
        const newWorldQuat = getXRHeadsetQuaternion(vrTempQuaternion, xrCamera);

        cameraRig.position.set(0, 0, 0);
        cameraRig.rotation.set(0, 0, 0);
        camera.position.copy(newWorldPos);
        camera.quaternion.copy(newWorldQuat);
        camera.updateMatrixWorld(true);

        const delta = tmpVecB.copy(newWorldPos).sub(vrPrevCameraPos);
        controls.target.copy(vrPrevTarget).add(delta);
        camera.lookAt(controls.target);
        controls.update();

        if (currentModel) {
          applyModelScaleForMode(currentModel, false);
          const frame = computeFrame(currentModel, 1.2);
          initialTarget = frame.center.clone();
          initialCamPos = frame.center.clone().add(new THREE.Vector3(0,0,1).multiplyScalar(frame.distance));
          initialNear = frame.near;
          initialFar = frame.far;
          // Ripristina i piani di profondità del browser (in VR erano stati
          // ampliati per il modello 1:1)
          camera.near = frame.near;
          camera.far = frame.far;
          camera.updateProjectionMatrix();
          currentModel.updateMatrixWorld(true);
          initialModelQuat = new THREE.Quaternion();
          currentModel.getWorldQuaternion(initialModelQuat);
          updateScaleBar();
          refreshSectionPlane();
          updateSectionControlsState();
          if (sectionEnabled) updateSectionClipping();
        }
      });
      // Eventi UI base - gruppo 'ui'
      eventManager.add(window, 'resize', debounce(onWindowResize, 100), false, 'ui');
      // orientationchange: il browser aggiorna le dimensioni con un leggero ritardo
      eventManager.add(window, 'orientationchange', () => { setTimeout(onWindowResize, 300); }, false, 'ui');
      eventManager.add(window, 'scroll', positionCoachBubble, {passive:true}, 'ui');
      eventManager.add(window, 'keydown', onKeyDown, false, 'ui');
      eventManager.add(window, 'keyup', onKeyUp, false, 'ui');

      // Model selector dropdown open/close/search
      eventManager.add(modelSelectorToggle, 'click', (e) => {
        e.stopPropagation();
        toggleModelDropdown();
      }, false, 'ui');

      eventManager.add(modelSelectorSearch, 'input', () => {
        filterModelList(modelSelectorSearch.value);
      }, false, 'ui');

      eventManager.add(modelSelectorSearch, 'keydown', (e) => {
        if (e.key === 'Escape') { closeModelDropdown(); return; }
        if (e.key === 'Enter') {
          const visible = modelSelectorList.querySelectorAll('li:not([style*="display: none"])');
          if (visible.length === 1) { visible[0].click(); }
        }
      }, false, 'ui');

      eventManager.add(document, 'click', (e) => {
        if (modelSelectorWrapper.classList.contains('open') && !modelSelectorWrapper.contains(e.target)) {
          closeModelDropdown();
        }
      }, false, 'ui');
      eventManager.add(resetViewBtn, 'click', () => { resetToInitialView(600); }, false, 'ui');

      const onAutoRotateChange = () => {
        const enabled = autoRotateToggle.checked;
        if (enabled && enterFPToggle.checked) {
          enterFPToggle.checked = false;
          enterFPToggle.dispatchEvent(new Event('change'));
        }
        autoRotateToggle.checked = enabled;
        autoRotateToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
        // Sul telefono il menu aperto nasconderebbe proprio la rotazione
        if (enabled) closeMobileMenu();

        if (autoRotateTimer) { clearTimeout(autoRotateTimer); autoRotateTimer = null; }
        if (enabled) {
          controls.autoRotate = false;
          resetToInitialView(600);
          autoRotateTimer = setTimeout(() => {
            if (autoRotateToggle.checked) controls.autoRotate = true;
            autoRotateTimer = null;
          }, 600);
        } else {
          controls.autoRotate = false;
        }
      };
      eventManager.add(autoRotateToggle, 'change', onAutoRotateChange, false, 'ui');

      // Toggle FP
      const onEnterFPToggleChange = () => {
        updateFPUI();
        if (enterFPToggle.checked) {
          startFP(true);
        } else {
          pendingFPStart = false;
          isFP = false; document.body.classList.remove('fp');
          controls.enabled = true; controls.enableRotate = true; controls.enablePan = true; controls.enableZoom = true;
          try { fpControls.unlock(); } catch(e) {}
          hideHelp(); lookActive = false; lookPointerId = null;
          tapStepRemaining = 0; lastTapTime = 0;
        }
        enterFPToggle.setAttribute('aria-checked', enterFPToggle.checked ? 'true' : 'false');
      };
      eventManager.add(enterFPToggle, 'change', onEnterFPToggleChange, false, 'ui');

      eventManager.add(helpOpenBtn, 'click', () => showFPHelp(true), false, 'ui');

      eventManager.add(infoOpenBtn, 'click', () => {
        infoOverlay.style.display = 'flex';
        trapModalFocus(infoOverlay);
      }, false, 'ui');
      eventManager.add(infoCloseBtn, 'click', () => {
        releaseModalFocus(infoOverlay);
        infoOverlay.style.display = 'none';
      }, false, 'ui');

      const onMenuToggleClick = () => {
        const open = controlsContainer.classList.toggle('open');
        menuToggle.classList.toggle('open', open);
        menuToggle.setAttribute('aria-label', open ? _t('menu.close', 'Chiudi menu') : _t('menu.open', 'Apri menu'));
        menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (isSmallScreen()) {
          if (open) {
            closeModelDropdown();
            // Misure: usa il pulsante di chiusura per disattivare anche la modalità
            if (measurePanel && measurePanel.style.display === 'block' && measurePanelClose) {
              measurePanelClose.click();
            }
            // Chiude gli altri pannelli registrati (viste, sezioni, POI)
            closeOtherPanelsMobile(null);
            showPanelBackdrop();
          } else {
            if (!anyPanelOpen()) hidePanelBackdrop();
          }
        }
      };
      eventManager.add(menuToggle, 'click', onMenuToggleClick, false, 'ui');

      // Helper per aprire il pannello viste
      function openViewsPanel() {
        if (!viewsPanel) return;
        closeOtherPanelsMobile(viewsPanel);
        placePanel(viewsPanel);
        viewsPanel.style.display = 'block';
        if (viewsToggle) {
          viewsToggle.checked = true;
          viewsToggle.setAttribute('aria-checked', 'true');
        }
        // Costruisci il menu solo se il body è vuoto o contiene solo il grid vuoto
        const panelBody = viewsPanel.querySelector('.floating-panel-body');
        if (panelBody && !panelBody.querySelector('.views-header')) {
          buildViewsMenu();
        }
        if (isSmallScreen()) { closeMobileMenu(); showPanelBackdrop(); }
      }

      // Helper per chiudere il pannello viste
      function closeViewsPanel() {
        if (!viewsPanel) return;
        viewsPanel.style.display = 'none';
        clearMinimizedState(viewsPanel);
        if (viewsToggle) {
          viewsToggle.checked = false;
          viewsToggle.setAttribute('aria-checked', 'false');
        }
        if (isSmallScreen() && !anyPanelOpen()) hidePanelBackdrop();
      }

      // Viste panel toggle (ora è un checkbox)
      if (viewsToggle) {
        const onViewsToggleChange = () => {
          if (viewsToggle.checked) {
            if (isSectionPanelOpen()) closeSectionPanel();
            openViewsPanel();
          } else {
            closeViewsPanel();
          }
        };
        eventManager.add(viewsToggle, 'change', onViewsToggleChange, false, 'ui');
      }

      // Section panel toggle (ora è un checkbox)
      if (sectionToggle && sectionPanel) {
        const onSectionToggleChange = () => {
          if (sectionToggle.checked) {
            closeViewsPanel();
            openSectionPanel();
          } else {
            closeSectionPanel();
          }
        };
        eventManager.add(sectionToggle, 'change', onSectionToggleChange, false, 'ui');
      }

      // Close button handlers per i floating panels
      if (viewsPanelClose) {
        eventManager.add(viewsPanelClose, 'click', closeViewsPanel, false, 'ui');
      }
      if (sectionPanelClose) {
        eventManager.add(sectionPanelClose, 'click', closeSectionPanel, false, 'ui');
      }

      if (sectionEnableInput) {
        const onSectionEnableChange = () => {
          sectionEnabled = !!sectionEnableInput.checked;
          updateSectionControlsState();
          if (sectionEnabled) {
            applySectionSettings();
          } else {
            updateSectionClipping();
          }
        };
        eventManager.add(sectionEnableInput, 'change', onSectionEnableChange, false, 'ui');
      }

      if (sectionSlider) {
        const onSectionSliderInput = () => {
          refreshSectionPlane();
          if (!sectionEnabled) return;
          // Il piano è condiviso con i materiali e Three lo rilegge a ogni
          // frame: basta ridisegnare. updateSectionClipping() percorre tutto il
          // modello e ricompila ogni materiale, e a ogni movimento dello slider
          // su un telefono si sente.
          if (sectionPlaneArray && renderer?.localClippingEnabled) requestRender();
          else updateSectionClipping();
        };
        eventManager.add(sectionSlider, 'input', onSectionSliderInput, false, 'ui');
      }

      sectionAxisButtons.forEach((btn) => {
        const onSectionAxisClick = () => {
          if (!currentModel) return;
          const axis = btn.getAttribute('data-section-axis') || 'y';
          if (axis === sectionAxis) return;
          sectionAxis = axis;
          updateSectionControlsState();
          refreshSectionPlane();
          if (sectionEnabled) updateSectionClipping();
        };
        eventManager.add(btn, 'click', onSectionAxisClick, false, 'ui');
      });

      if (sectionInvertBtn) {
        const onSectionInvertClick = () => {
          if (!currentModel) return;
          sectionInvert = !sectionInvert;
          sectionInvertBtn.setAttribute('aria-pressed', sectionInvert ? 'true' : 'false');
          refreshSectionPlane();
          if (sectionEnabled) updateSectionClipping();
        };
        eventManager.add(sectionInvertBtn, 'click', onSectionInvertClick, false, 'ui');
      }

      // ===== PANNELLI FLOTTANTI DRAGGABLE =====
      // Inizializza il drag per tutti i pannelli flottanti
      // (il drag del pannello misure è inizializzato da initMeasureUI)
      initPanelDrag(viewsPanel, viewsPanelHeader, viewsPanelClose);
      initPanelDrag(sectionPanel, sectionPanelHeader, sectionPanelClose);

      // Backdrop mobile: tap per chiudere il pannello attivo o il menu
      if (panelBackdrop) {
        eventManager.add(panelBackdrop, 'click', () => {
          if (controlsContainer && controlsContainer.classList.contains('open')) {
            closeMobileMenu();
            return;
          }
          if (viewsPanel && viewsPanel.style.display === 'block') closeViewsPanel();
          if (sectionPanel && sectionPanel.style.display === 'block') closeSectionPanel();
          if (measurePanel && measurePanel.style.display === 'block' && measurePanelClose) {
            measurePanelClose.click();
          }
          // Senza questo il tocco sul backdrop con il pannello POI aperto non
          // faceva nulla e l'utente restava bloccato dietro il velo
          if (poiPanel && poiPanel.style.display === 'block' && poiPanelClose) {
            poiPanelClose.click();
          }
        }, false, 'ui');
      }

      // Mini-bar: tap o swipe-up per ripristinare il pannello ridotto
      if (panelMiniBar) {
        initMiniBarSwipe(panelMiniBar);
        eventManager.add(panelMiniBar, 'click', restoreMinimizedPanel, false, 'ui');
      }

      // Pulsante minimizza — Misura
      if (measurePanelMinimize) {
        eventManager.add(measurePanelMinimize, 'click', () => {
          minimizePanelMobile(measurePanel, _t('measure.listTitle', 'Misurazioni'), '📐');
        }, false, 'ui');
      }

      // Pulsante minimizza — Sezioni
      if (sectionPanelMinimize) {
        eventManager.add(sectionPanelMinimize, 'click', () => {
          minimizePanelMobile(sectionPanel, _t('viewer.sections', 'Sezioni'), '◩');
        }, false, 'ui');
      }

      // Pulsante minimizza — Viste
      if (viewsPanelMinimize) {
        eventManager.add(viewsPanelMinimize, 'click', () => {
          minimizePanelMobile(viewsPanel, _t('views.title', 'Viste'), '👁');
        }, false, 'ui');
      }

      // ===== MISURAZIONE =====
      // Wiring UI e raycast del sistema di misurazione (./viewer/measure.js)
      initMeasureUI({
        getCurrentModel: () => currentModel,
        getCurrentModelInfo: () => currentModelInfo,
        getScene: () => scene,
        getCamera: () => camera,
        getRenderer: () => renderer,
        getIsFP: () => isFP,
        isPointVisibleWithSection,
        getSectionPlaneArray: () => (sectionEnabled && sectionPlaneArray) ? sectionPlaneArray : null,
        closeMobileMenu
      });

      // ===== POI / ANNOTAZIONI =====
      initPoiUI({
        getCurrentModel: () => currentModel,
        getCamera: () => camera,
        getRenderer: () => renderer,
        getControls: () => controls,
        getIsFP: () => isFP,
        isPointVisibleWithSection,
        closeMobileMenu
      });

      // ===== SHARE popup
      const shareOverlay = document.getElementById('share-overlay');
      const shareClose   = document.getElementById('share-close');
      const linkFB  = document.getElementById('share-fb');
      const linkWA  = document.getElementById('share-wa');
      const linkTG  = document.getElementById('share-tg');
      const linkML  = document.getElementById('share-mail');

      // Generatore del codice da incorporare (scheda "Incorpora")
      initEmbedUI({
        getModelFolder: () => getCurrentFolder(),
        getModelName:   () => modelSelectorValue || '',
        getCamera:      () => (currentModel ? camera : null),
        getShareTarget: () => (currentModel ? getShareTarget() : null),
        getSectionState,
        getLang:        () => document.documentElement.lang || '',
      });

      // Apri popup con link aggiornati
      const onShareBtnClick = (e) => {
        e.preventDefault();
        if (isSectionPanelOpen()) closeSectionPanel();
        const url = buildShareURL(true);
        openShare(url);
      };
      eventManager.add(shareBtn, 'click', onShareBtnClick, false, 'ui');
      if (screenshotBtn) {
        eventManager.add(screenshotBtn, 'click', exportScreenshotPNG, false, 'ui');
      }

      // ===== Schermo intero (solo nella barra della modalità incorporata).
      // Funziona perché lo snippet generato mette allowfullscreen sull'iframe.
      if (embedFullscreenBtn) {
        const onEmbedFullscreen = () => {
          const root = document.documentElement;
          const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
          if (fsElement) {
            (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
            return;
          }
          const request = root.requestFullscreen || root.webkitRequestFullscreen;
          const supported = (document.fullscreenEnabled || document.webkitFullscreenEnabled) && request;
          if (!supported) {
            // iPhone non ha la Fullscreen API per gli elementi: il pulsante
            // non faceva nulla. Si apre il viewer completo in una nuova scheda,
            // con la stessa vista (cam/tgt/sec restano nell'URL).
            const full = new URL(window.location.href);
            full.searchParams.delete('embed');
            full.searchParams.delete('ui');
            window.open(full.toString(), '_blank', 'noopener');
            return;
          }
          Promise.resolve(request.call(root)).catch(() => {
            showToast(_t('embed.fullscreen', 'Schermo intero'), 1500);
          });
        };
        eventManager.add(embedFullscreenBtn, 'click', onEmbedFullscreen, false, 'ui');
      }

      // Chiudi overlay
      eventManager.add(shareClose, 'click', closeShare, false, 'ui');
      const onShareOverlayClose = (e) => {
        if (e.target === shareOverlay) { e.preventDefault(); e.stopPropagation(); closeShare(); }
      };
      ['click','pointerdown','touchstart'].forEach(t => {
        eventManager.add(shareOverlay, t, onShareOverlayClose, {passive:false}, 'ui');
      });
      const onEscapeCloseShare = (e) => { if(e.key==='Escape' && shareOverlay.style.display==='flex') closeShare(); };
      eventManager.add(window, 'keydown', onEscapeCloseShare, false, 'ui');

      function openShare(url){
        const title = _t('viewer.shareTitle', 'Guarda questo modello 3D');
        updateShareLinks(url, title);
        refreshEmbedCode();
        shareOverlay.style.display = 'flex';
        if (renderer?.domElement) renderer.domElement.style.pointerEvents = 'none';
        document.body.style.overflow = 'hidden';
        trapModalFocus(shareOverlay);
      }
      function closeShare(){
        releaseModalFocus(shareOverlay);
        resetShareTabs();
        shareOverlay.style.display = 'none';
        if (renderer?.domElement) renderer.domElement.style.pointerEvents = '';
        document.body.style.overflow = '';
      }
      function updateShareLinks(url, title){
        const encURL = encodeURIComponent(url);
        const encTXT = encodeURIComponent(title + ' ' + url);
        linkFB.href = `https://www.facebook.com/sharer/sharer.php?u=${encURL}`;
        linkWA.href = `https://wa.me/?text=${encTXT}`;
        linkTG.href = `https://t.me/share/url?url=${encURL}&text=${encodeURIComponent(title)}`;
        linkML.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encTXT}`;
      }

      // Joystick (solo touch) - gruppo 'input'
      if (isTouch && joystick) {
        const onJoyPointerDown = e => { joyStart(e); e.stopPropagation(); };
        const onJoyPointerMove = e => { if (joyActive) { joyMove(e); e.stopPropagation(); }};
        const onJoyPointerUp = e => { if (joyActive) { joyEnd(e); e.stopPropagation(); }};
        const onJoyTouchStart = e => { joyStartTouch(e); e.stopPropagation(); e.stopImmediatePropagation(); };
        const onJoyTouchMove = e => { if (joyActive) { joyMoveTouch(e); e.stopPropagation(); }};
        const onJoyTouchEnd = e => { if (joyActive) { joyEndTouch(e); e.stopPropagation(); }};

        eventManager.add(joystick, 'pointerdown', onJoyPointerDown, {passive:false}, 'input');
        eventManager.add(document, 'pointermove', onJoyPointerMove, {passive:false}, 'input');
        eventManager.add(document, 'pointerup', onJoyPointerUp, {passive:false}, 'input');
        eventManager.add(document, 'pointercancel', onJoyPointerUp, {passive:false}, 'input');
        // Touch Events solo dove mancano i Pointer Events (iOS < 13): non
        // distinguono le dita, quindi alzare il pollice che guarda fermava il
        // joystick, e con due pollici a terra la camera poteva scattare
        if (!window.PointerEvent) {
          eventManager.add(joystick, 'touchstart', onJoyTouchStart, {passive:false}, 'input');
          eventManager.add(document, 'touchmove', onJoyTouchMove, {passive:false}, 'input');
          eventManager.add(document, 'touchend', onJoyTouchEnd, {passive:false}, 'input');
          eventManager.add(document, 'touchcancel', onJoyTouchEnd, {passive:false}, 'input');
        }
      } else if (isTouch && !joystick) {
        console.error('[Joystick Debug] ERRORE: Elemento joystick non trovato nel DOM!');
      }

      // HELP popup - gruppo 'ui'
      multiBindClose(document.getElementById('help-close'), hideHelp);
      const onHelpOverlayClose = (e) => { if (e.target === helpOverlay) { e.preventDefault(); e.stopPropagation(); hideHelp(); }};
      ['click','pointerdown','touchstart'].forEach(t => {
        eventManager.add(helpOverlay, t, onHelpOverlayClose, {passive:false}, 'ui');
      });
      eventManager.add(helpDontShow, 'change', () => {
        localStorage.setItem('dontShowFPHelp', helpDontShow.checked ? '1' : '0');
      }, false, 'ui');

      // Onboarding - gruppo 'ui'
      multiBindClose(onboardClose, hideOnboarding);
      const onOnboardClose = (e) => { if (e.target === onboard) { e.preventDefault(); e.stopPropagation(); hideOnboarding(); }};
      ['click','pointerdown','touchstart'].forEach(t => {
        eventManager.add(onboard, t, onOnboardClose, {passive:false}, 'ui');
      });
      eventManager.add(onboardDont, 'change', () => {
        localStorage.setItem('dontShowOnboard', onboardDont.checked ? '1' : '0');
      }, false, 'ui');

      // Touch-look listeners (mobile FP fallback) - gruppo 'input'
      eventManager.add(renderer.domElement, 'pointerdown', onLookPointerDown, {passive:false}, 'input');
      eventManager.add(document, 'pointermove', onLookPointerMove, {passive:false}, 'input');
      eventManager.add(document, 'pointerup', onLookPointerUp, {passive:false}, 'input');
      eventManager.add(document, 'pointercancel', onLookPointerUp, {passive:false}, 'input');
      // Come per il joystick: Touch Events solo come ripiego
      if (!window.PointerEvent) {
        eventManager.add(renderer.domElement, 'touchstart', onLookTouchStart, {passive:false}, 'input');
        eventManager.add(document, 'touchmove', onLookTouchMove, {passive:false}, 'input');
        eventManager.add(document, 'touchend', onLookTouchEnd, {passive:false}, 'input');
        eventManager.add(document, 'touchcancel', onLookTouchEnd, {passive:false}, 'input');
      }

      updateFPUI();
      animate();

      // Carica elenco modelli + deep link ?m=<cartella>
      fetch('api/catalogo.php')
        .then(r => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(data => {
          modelsData = Array.isArray(data) ? data : [];
          populateSelector();

          const params = new URLSearchParams(location.search);
          const folderParam = params.get('m');
          if (folderParam) {
            const m = modelsData.find(x => x.folder === folderParam);
            if (m) {
              // Vista condivisa via link: ripristinata dopo il caricamento del modello
              const cam = parseVec3Param(params.get('cam'));
              const tgt = parseVec3Param(params.get('tgt'));
              pendingCameraFromURL = (cam && tgt) ? { cam, tgt, folder: folderParam } : null;
              const sec = parseSectionParam(params.get('sec'));
              pendingSectionFromURL = sec ? { ...sec, folder: folderParam } : null;
              selectModelByName(m.name);
              loadModelByName(m.name);
              hideOnboarding();
            } else {
              showToast(_t('viewer.modelNotFound', 'Il modello richiesto non esiste'), 4000);
              showOnboardingIfNeeded();
            }
          } else {
            showOnboardingIfNeeded();
          }
          positionCoachBubble();
        })
        .catch(err => {
          console.error('Errore: impossibile caricare i metadati dei modelli.', err);
          modelsData = [];
          populateSelector();
          showToast(_t('viewer.catalogError', "Impossibile caricare l'elenco dei modelli"), 4000);
          showOnboardingIfNeeded();
          positionCoachBubble();
        });
    }

    /* ===== UI helpers (showToast, haptic, isSmallScreen, debounce in ./viewer/utils.js) ===== */

    // Cartella del modello attualmente selezionato ('' se nessuno)
    function getCurrentFolder(){
      if (!modelSelectorValue) return '';
      const info = modelsData.find(m => m.name === modelSelectorValue);
      return info?.folder || '';
    }

    function buildShareURL(includeCamera = false){
      const base = location.origin + location.pathname;
      const folder = getCurrentFolder();
      let url = base;
      if (folder) {
        url = `${base}?m=${encodeURIComponent(folder)}`;
        if (includeCamera && currentModel) {
          const fmt = v => [v.x, v.y, v.z].map(n => n.toFixed(2)).join(',');
          url += `&cam=${fmt(camera.position)}&tgt=${fmt(getShareTarget())}`;
        }
      }
      // In un iframe l'URL non è visibile e riscriverlo perderebbe i
      // parametri della modalità incorporata (embed, ui, sec).
      if (!isEmbed) history.replaceState(null, '', url);
      return url;
    }

    // Punto osservato da condividere: in orbit coincide con controls.target,
    // in prima persona viene derivato dalla direzione di vista
    function getShareTarget(){
      const dist = Math.max(0.5, camera.position.distanceTo(controls.target));
      return camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(dist).add(camera.position);
    }

    // Parsa un parametro URL nel formato "x,y,z" in Vector3 (null se non valido)
    function parseVec3Param(value){
      if (!value) return null;
      const parts = value.split(',').map(Number);
      if (parts.length !== 3 || !parts.every(Number.isFinite)) return null;
      return new THREE.Vector3(parts[0], parts[1], parts[2]);
    }

    // Applica (una sola volta) la vista camera dai parametri URL dopo il load del modello.
    // Ritorna true se applicata, false se assente o non plausibile per questo modello.
    function consumePendingCameraFromURL(frame){
      const pending = pendingCameraFromURL;
      pendingCameraFromURL = null;
      if (!pending) return false;
      // La vista vale solo per il modello del deep link originario
      if (pending.folder && currentModelInfo?.folder !== pending.folder) return false;
      // Scarta posizioni assurdamente lontane dal modello (link corrotto o di un altro modello)
      const maxDist = Math.max(frame.far, frame.distance * 10);
      if (pending.cam.distanceTo(frame.center) > maxDist) return false;
      camera.position.copy(pending.cam);
      controls.target.copy(pending.tgt);
      // Nella pagina incorporata l'inquadratura scelta per l'articolo diventa
      // anche il punto di ritorno di "Reset vista": chi ha ruotato il modello
      // deve poter tornare a ciò di cui parla l'articolo, non alla vista
      // d'insieme. Nel visualizzatore completo "Reset" mantiene il suo
      // significato abituale (inquadratura complessiva del modello).
      if (isEmbed) {
        initialCamPos = pending.cam.clone();
        initialTarget = pending.tgt.clone();
      }
      camera.near = Math.min(frame.near, viewerCfg.defaultNear || 0.1);
      camera.far = frame.far;
      camera.updateProjectionMatrix();
      controls.update();
      return true;
    }

    // Parsa il parametro URL "asse,posizione,invertito" (es. "y,62,1") che
    // descrive un piano di sezione. Ritorna null se il formato non è valido.
    function parseSectionParam(value){
      if (!value) return null;
      const parts = value.split(',');
      if (parts.length !== 3) return null;
      const axis = parts[0].trim().toLowerCase();
      if (axis !== 'x' && axis !== 'y' && axis !== 'z') return null;
      const pos = Number(parts[1]);
      if (!Number.isFinite(pos) || pos < 0 || pos > 100) return null;
      const invert = parts[2].trim();
      if (invert !== '0' && invert !== '1') return null;
      return { axis, pos, invert: invert === '1' };
    }

    // Applica (una sola volta) il piano di sezione dai parametri URL.
    // Va chiamata dopo resetSectionState(), che gira a ogni caricamento.
    function consumePendingSectionFromURL(){
      const pending = pendingSectionFromURL;
      pendingSectionFromURL = null;
      if (!pending || !sectionSlider) return false;
      // La sezione vale solo per il modello del deep link originario
      if (pending.folder && currentModelInfo?.folder !== pending.folder) return false;
      sectionAxis = pending.axis;
      sectionInvert = pending.invert;
      sectionEnabled = true;
      sectionSlider.value = String(pending.pos);
      if (sectionEnableInput) sectionEnableInput.checked = true;
      updateSectionControlsState();
      refreshSectionPlane();
      updateSectionClipping();
      // Nel visualizzatore completo mostra anche i controlli: altrimenti il
      // modello arriverebbe tagliato senza che si capisca da dove.
      // Nell'iframe di un articolo il pannello resterebbe solo d'ingombro.
      if (!isEmbed) openSectionPanel();
      return true;
    }

    // Stato corrente della sezione, per il generatore del codice da incorporare
    function getSectionState(){
      return {
        enabled: sectionEnabled,
        axis: sectionAxis || 'y',
        pos: Number(sectionSlider?.value ?? 50),
        invert: !!sectionInvert,
      };
    }

    // ===== AUTOMATIC SOCIAL PREVIEW GENERATION
    /**
     * Automatically generate social preview for the current model
     * Runs silently in the background after model is loaded
     */
    async function autoGenerateSocialPreview() {
      if (!currentModel || !renderer || !currentModelInfo || !currentModelInfo.folder) {
        return;
      }
      // Mai dalla modalità incorporata: l'inquadratura scelta per un articolo
      // sovrascriverebbe l'anteprima social del modello per tutti.
      if (isEmbed) return;

      try {
        // Wait a bit for the model to be fully rendered
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Capture screenshot from renderer
        const screenshot = await captureScreenshot();

        // Send to server
        const formData = new FormData();
        formData.append('model', currentModelInfo.folder);
        formData.append('image', screenshot);

        const response = await fetch('save_social_preview.php', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          // Silently skip if server doesn't accept the preview
          return;
        }

        await response.json();
      } catch (error) {
        // Silently ignore errors in social preview generation
        // This is a background feature and shouldn't pollute the console
      }
    }

    /**
     * Capture a screenshot from the Three.js renderer
     * and resize it to optimal social media dimensions (1200x630)
     */
    async function captureScreenshot() {
      return new Promise((resolve, reject) => {
        try {
          if (renderer.xr?.isPresenting) {
            reject(new Error('Screenshot not available during XR session'));
            return;
          }
          // Senza preserveDrawingBuffer il canvas WebGL è leggibile solo
          // nello stesso task di un render: renderizza subito prima del drawImage
          renderer.render(scene, camera);

          // Get the current canvas
          const canvas = renderer.domElement;

          // Create a temporary canvas for resizing
          const targetWidth = 1200;
          const targetHeight = 630;
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = targetWidth;
          tempCanvas.height = targetHeight;
          const ctx = tempCanvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          // Fill with background color (bordo più scuro del gradiente di scena)
          ctx.fillStyle = (cfg.theme?.sceneGradient || [])[3] || '#1a1a2e';
          ctx.fillRect(0, 0, targetWidth, targetHeight);

          // Calculate scaling to fit the 3D view while maintaining aspect ratio
          const sourceAspect = canvas.width / canvas.height;
          const targetAspect = targetWidth / targetHeight;

          let drawWidth, drawHeight, drawX, drawY;

          if (sourceAspect > targetAspect) {
            // Source is wider - fit to width
            drawWidth = targetWidth;
            drawHeight = targetWidth / sourceAspect;
            drawX = 0;
            drawY = (targetHeight - drawHeight) / 2;
          } else {
            // Source is taller - fit to height
            drawHeight = targetHeight;
            drawWidth = targetHeight * sourceAspect;
            drawX = (targetWidth - drawWidth) / 2;
            drawY = 0;
          }

          // Draw the 3D scene
          ctx.drawImage(canvas, drawX, drawY, drawWidth, drawHeight);

          // Add overlay with model info
          const modelName = currentModelInfo?.name || 'Modello 3D';
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(0, targetHeight - 80, targetWidth, 80);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 32px Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(modelName, 30, targetHeight - 45);

          // Firma letta dalla configurazione: chi personalizza il branding
          // vede il proprio nome, senza modificare il codice.
          const brandingCfg = window.APP_CONFIG?.branding || {};
          const signature = [brandingCfg.organizationName, brandingCfg.appName]
            .filter(part => typeof part === 'string' && part.trim() !== '')
            .join(' - ');

          if (signature) {
            ctx.fillStyle = '#cccccc';
            ctx.font = '20px Arial, sans-serif';
            ctx.fillText(signature, 30, targetHeight - 20);
          }

          // Convert to base64
          const dataURL = tempCanvas.toDataURL('image/jpeg', 0.92);
          resolve(dataURL);
        } catch (error) {
          reject(error);
        }
      });
    }

    function exportScreenshotPNG() {
      if (renderer.xr?.isPresenting) return;
      renderer.render(scene, camera);

      const src = renderer.domElement;
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      canvas.width = src.width;
      canvas.height = src.height;
      const ctx = canvas.getContext('2d');

      // 1. Frame WebGL: modello + sezioni + geometrie misure (sfondo trasparente)
      ctx.drawImage(src, 0, 0);

      // 2. Etichette misurazioni (HTML overlay → Canvas 2D)
      const exportMeasurements = getMeasurements();
      if (currentModel && exportMeasurements.length > 0) {
        const v = new THREE.Vector3();
        exportMeasurements.forEach(m => {
          v.copy(m.points[0]).add(m.points[1]).multiplyScalar(0.5);
          currentModel.localToWorld(v);
          v.project(camera);
          if (v.z > 1) return;
          const x = (v.x * 0.5 + 0.5) * src.width;
          const y = (-v.y * 0.5 + 0.5) * src.height;
          const text = `#${m.id}  ${formatMeasureDistance(m.distance)}`;
          const fs = Math.round(13 * dpr);
          ctx.font = `${fs}px Poppins, sans-serif`;
          const tw = ctx.measureText(text).width;
          const pad = 6 * dpr;
          const bw = tw + pad * 2, bh = fs + pad * 2;
          ctx.beginPath();
          ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 4 * dpr);
          ctx.fillStyle = 'rgba(20,25,35,0.92)';
          ctx.fill();
          ctx.strokeStyle = m.color;
          ctx.lineWidth = 1.5 * dpr;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, x, y);
        });
      }

      // 3. Scala metrica — barra bianco/grigio + etichetta (bottom-left 15px)
      const barPx = (parseInt(scaleBarEl?.style.width) || 150) * dpr;
      const barText = scaleLabelEl?.textContent || '';
      const barH = 8 * dpr;
      const barX = 15 * dpr;
      const margin = 15 * dpr;
      // Pre-compute label height so the bar can be anchored above it,
      // preventing the label from being clipped at the canvas bottom edge.
      const labelFs = 13 * dpr;
      const lpad = 8 * dpr, lvpad = 4 * dpr;
      const lh = barText ? labelFs + lvpad * 2 : 0;
      const labelGap = barText ? 4 * dpr : 0;
      const barY = canvas.height - margin - lh - labelGap - barH;
      const patC = document.createElement('canvas');
      patC.width = 16 * dpr; patC.height = barH;
      const pc = patC.getContext('2d');
      pc.fillStyle = '#ffffff'; pc.fillRect(0, 0, 8 * dpr, barH);
      pc.fillStyle = '#888888'; pc.fillRect(8 * dpr, 0, 8 * dpr, barH);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(barX, barY, barPx, barH, 5 * dpr);
      ctx.clip();
      ctx.fillStyle = ctx.createPattern(patC, 'repeat');
      ctx.fillRect(barX, barY, barPx, barH);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barPx, barH, 5 * dpr);
      ctx.stroke();
      if (barText) {
        ctx.font = `${labelFs}px Poppins, sans-serif`;
        const lw = ctx.measureText(barText).width + lpad * 2;
        const ly = barY + barH + labelGap;
        ctx.beginPath();
        ctx.roundRect(barX, ly, lw, lh, 6 * dpr);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(barText, barX + lpad, ly + lvpad);
      }

      // 4. Logo (bottom-right 15px) + download
      const doDownload = () => {
        const sz = 96 * dpr;
        const lx = canvas.width - sz - 15 * dpr;
        const ly = canvas.height - sz - 15 * dpr;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(lx, ly, sz, sz, 12 * dpr);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = dpr;
        ctx.stroke();
        ctx.clip();
        if (_exportLogoImg.complete && _exportLogoImg.naturalWidth > 0) {
          const nw = _exportLogoImg.naturalWidth;
          const nh = _exportLogoImg.naturalHeight;
          const scale = Math.min(sz / nw, sz / nh);
          const dw = nw * scale;
          const dh = nh * scale;
          const dx = lx + (sz - dw) / 2;
          const dy = ly + (sz - dh) / 2;
          ctx.drawImage(_exportLogoImg, dx, dy, dw, dh);
        }
        ctx.restore();

        canvas.toBlob(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const slug = (currentModelInfo?.name || 'modello')
            .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
          a.download = `${slug}_screenshot.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 'image/png');
      };

      if (_exportLogoImg.complete) {
        doDownload();
      } else {
        _exportLogoImg.onload = doDownload;
        _exportLogoImg.onerror = doDownload;
      }
    }

    /* ===== VISTE: cubo SVG con lato evidenziato ===== */
    // Funzione per ottenere VIEW_DEFS con traduzioni
    function getViewDefs() {
      return [
        { key:'front',  label: _t('views.front', 'Fronte'),   desc: _t('views.frontDesc', 'Vista frontale') },
        { key:'back',   label: _t('views.back', 'Retro'),    desc: _t('views.backDesc', 'Vista posteriore') },
        { key:'left',   label: _t('views.left', 'Sinistra'), desc: _t('views.leftDesc', 'Vista laterale sx') },
        { key:'right',  label: _t('views.right', 'Destra'),   desc: _t('views.rightDesc', 'Vista laterale dx') },
        { key:'top',    label: _t('views.top', 'Alto'),     desc: _t('views.topDesc', 'Vista dall\'alto') },
        { key:'bottom', label: _t('views.bottom', 'Basso'),    desc: _t('views.bottomDesc', 'Vista dal basso') },
      ];
    }

    function cubeSVG(view){
      const cx = 48, cy = 36;
      let transform = '';
      let highlight = 'front';
      switch(view){
        case 'front':  highlight = 'front'; break;
        case 'right':  highlight = 'right'; break;
        case 'top':    highlight = 'top';   break;
        case 'back':   transform = `translate(${cx} ${cy}) scale(-1 1) translate(${-cx} ${-cy})`; highlight = 'front'; break;
        case 'left':   transform = `translate(${cx} ${cy}) scale(-1 1) translate(${-cx} ${-cy})`; highlight = 'right'; break;
        case 'bottom': transform = `translate(${cx} ${cy}) scale(1 -1) translate(${-cx} ${-cy})`; highlight = 'top';   break;
      }
      const front = "28,30 60,30 60,58 28,58";
      const top   = "28,30 44,16 76,16 60,30";
      const right = "60,30 76,16 76,44 60,58";

      const colFront = (highlight==='front') ? '#49a6ff' : '#25272a';
      const colTop   = (highlight==='top')   ? '#49a6ff' : '#2d3035';
      const colRight = (highlight==='right') ? '#49a6ff' : '#1f2226';
      const strokeHL = '#bfe8ff';
      const strokeN  = '#6b6f75';

      return `
<svg viewBox="0 0 96 72" width="96" height="72" aria-hidden="true">
  <g transform="${transform}">
    <polygon points="${top}"   fill="${colTop}"   stroke="${highlight==='top'?strokeHL:strokeN}" stroke-width="1"/>
    <polygon points="${right}" fill="${colRight}" stroke="${highlight==='right'?strokeHL:strokeN}" stroke-width="1"/>
    <polygon points="${front}" fill="${colFront}" stroke="${highlight==='front'?strokeHL:strokeN}" stroke-width="1"/>
    <polyline points="28,30 60,30 60,58 28,58 28,30" fill="none" stroke="#888" stroke-width="0.6" opacity="0.35"/>
    <polyline points="28,30 44,16 76,16 60,30" fill="none" stroke="#888" stroke-width="0.6" opacity="0.35"/>
    <polyline points="60,30 76,16 76,44 60,58" fill="none" stroke="#888" stroke-width="0.6" opacity="0.35"/>
  </g>
</svg>`;
    }

    function buildViewsMenu(){
      // Trova il body del floating-panel (non sovrascrivere l'header per mantenere il drag)
      const panelBody = viewsPanel.querySelector('.floating-panel-body');
      if (!panelBody) return;

      panelBody.innerHTML = '';

      // Header descrittivo dentro il body
      const header = document.createElement('div');
      header.className = 'views-header';
      header.innerHTML = `
        <span class="views-header-icon">&#x1F4F7;</span>
        <div class="views-header-text">
          <h3>${_t('views.title', 'Viste Rapide')}</h3>
          <p>${_t('views.subtitle', 'Seleziona un punto di vista predefinito')}</p>
        </div>
      `;
      panelBody.appendChild(header);

      // Griglia delle viste
      const grid = document.createElement('div');
      grid.id = 'views-grid';

      const VIEW_DEFS = getViewDefs();
      VIEW_DEFS.forEach(def=>{
        const btn = document.createElement('button');
        btn.className = 'view-item';
        btn.setAttribute('data-snap', def.key);
        const wrap = document.createElement('div');
        wrap.className = 'icon';
        wrap.innerHTML = cubeSVG(def.key);
        const textWrap = document.createElement('div');
        textWrap.className = 'view-text';
        const label = document.createElement('span');
        label.className = 'view-label';
        label.textContent = def.label;
        const desc = document.createElement('span');
        desc.className = 'view-desc';
        desc.textContent = def.desc;
        textWrap.appendChild(label);
        textWrap.appendChild(desc);
        btn.appendChild(wrap);
        btn.appendChild(textWrap);
        btn.addEventListener('click', ()=>{
          viewsPanel.style.display = 'none';
          clearMinimizedState(viewsPanel);
          if (viewsToggle) {
            viewsToggle.checked = false;
            viewsToggle.setAttribute('aria-checked', 'false');
          }
          if (isSmallScreen() && !anyPanelOpen()) hidePanelBackdrop();
          snapTo(def.key);
        }, {passive:true});
        grid.appendChild(btn);
      });

      panelBody.appendChild(grid);

      // Aggiorna il riferimento a viewsGrid
      viewsGrid = grid;
    }

    /* ===== multiBindClose è in ./viewer/panels.js ===== */

    /* ===== FP: desktop vs mobile ===== */
    function tryPointerLock(){
      if (isTouch || !pointerLockSupported) { activateFPFallbackUI(); return; }
      try { fpControls.lock(); } catch(e) {}
    }

    function activateFPFallbackUI(){ // MOBILE FP FALLBACK
      // Il menu a tendina aperto coprirebbe il joystick
      closeMobileMenu();
      isFP = true;
      tapStepRemaining = 0; lastTapTime = 0;
      document.body.classList.add('fp'); // mostra joystick
      crosshair.style.opacity = '1';
      controls.enabled = false; controls.enableRotate = false; controls.enablePan = false; controls.enableZoom = false;
      updateFPUI();
      // Conferma transitoria del cambio modalità (salta se è già aperto l'aiuto FP)
      if (!helpOverlay || helpOverlay.style.display !== 'flex') {
        showToast(_t('viewer.fpEnterToast', 'POV attivo: joystick per muoverti, trascina per guardarti intorno, doppio tocco per un passo avanti'), 2600);
      }
      haptic(15);
    }

    function startFP(withHelpGate=true){
      const dont = localStorage.getItem(LS_KEY_DONT_HELP) === '1';
      if (isTouch) {
        if (withHelpGate && !dont) { pendingFPStart = false; showFPHelp(true); }
        activateFPFallbackUI();
        return;
      }
      if (!withHelpGate || dont) {
        tryPointerLock();
      } else {
        pendingFPStart = true;
        showFPHelp(true);
      }
    }

    function updateFPUI(){
      const showFP = enterFPToggle.checked || (fpControls && fpControls.isLocked);
      if (showFP) {
        controls.autoRotate = false;
        autoRotateToggle.checked = false;
        autoRotateToggle.setAttribute('aria-checked','false');
      }
      if (isTouch) {
        document.body.classList.toggle('fp', !!showFP);
        crosshair.style.opacity = showFP ? '1' : '0';
        const fpMobile = !!showFP;
        controls.enabled = !fpMobile;
        controls.enableRotate = !fpMobile;
        controls.enablePan = !fpMobile;
        controls.enableZoom = !fpMobile;
      } else {
        document.body.classList.remove('fp');
      }
    }

    /* ===== ACCESSIBILITÀ: focus trap & restore per i modali ===== */
    // Mappa modal -> { previouslyFocused, keydownHandler }
    const modalFocusState = new WeakMap();

    function getFocusableElements(root) {
      if (!root) return [];
      const sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return Array.from(root.querySelectorAll(sel))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
    }

    function trapModalFocus(modalEl) {
      if (!modalEl || modalFocusState.has(modalEl)) return;
      const previouslyFocused = document.activeElement;
      const focusables = getFocusableElements(modalEl);
      const first = focusables[0] || modalEl;
      // Assicura che il modale possa ricevere il focus se non lo ha già nessun child
      if (!modalEl.hasAttribute('tabindex')) modalEl.setAttribute('tabindex', '-1');
      // Sposta il focus dentro al modale
      requestAnimationFrame(() => {
        try { (first || modalEl).focus({ preventScroll: true }); } catch (e) {}
      });

      const onKeyDown = (e) => {
        if (e.key !== 'Tab') return;
        const f = getFocusableElements(modalEl);
        if (f.length === 0) { e.preventDefault(); return; }
        const firstEl = f[0];
        const lastEl = f[f.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && active === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      };
      modalEl.addEventListener('keydown', onKeyDown);
      modalFocusState.set(modalEl, { previouslyFocused, onKeyDown });
    }

    function releaseModalFocus(modalEl) {
      if (!modalEl) return;
      const state = modalFocusState.get(modalEl);
      if (!state) return;
      modalEl.removeEventListener('keydown', state.onKeyDown);
      modalFocusState.delete(modalEl);
      try {
        if (state.previouslyFocused && document.contains(state.previouslyFocused)) {
          state.previouslyFocused.focus({ preventScroll: true });
        }
      } catch (e) {}
    }

    /* ===== HELP POPUP ===== */
    let currentHelpTab = null;

    function buildHelpHTML(){
      // Determina il tab iniziale in base al dispositivo
      const hasVR = navigator.xr !== undefined;
      const initialTab = isTouch ? 'mobile' : 'desktop';
      if (!currentHelpTab) currentHelpTab = initialTab;

      // Helper per generare una sezione accordion
      function makeSection(sectionId, icon, titleHTML, itemsHTML, startOpen) {
        return `
          <div class="help-section${startOpen ? ' open' : ''}" data-section="${sectionId}">
            <h4><span class="section-icon">${icon}</span> ${titleHTML}</h4>
            <div class="help-section-body">
              <div class="help-section-body-inner"><ul>${itemsHTML}</ul></div>
            </div>
          </div>`;
      }

      // Nasconde il subtitle, usiamo i tabs
      helpSubtitle.style.display = 'none';

      // Costruisce i tabs (ARIA tablist)
      const tabBtn = (id, icon, label) => {
        const isActive = currentHelpTab === id;
        return `<button type="button" role="tab" id="help-tab-${id}" aria-controls="help-panel-${id}" aria-selected="${isActive}" tabindex="${isActive ? '0' : '-1'}" class="help-tab ${isActive ? 'active' : ''}" data-tab="${id}">
            <span class="tab-icon" aria-hidden="true">${icon}</span>
            <span class="tab-label">${label}</span>
          </button>`;
      };
      const tabsHTML = `
        <div class="help-tabs" role="tablist" aria-label="${_t('help.tabs.label', 'Modalità')}">
          ${tabBtn('desktop', '🖥️', _t('help.tabs.desktop', 'Desktop'))}
          ${tabBtn('mobile', '📱', _t('help.tabs.mobile', 'Mobile'))}
          ${tabBtn('vr', '🥽', _t('help.tabs.vr', 'VR'))}
        </div>
      `;

      // Contenuti per ogni tab (accordion: solo prima sezione aperta di default)
      const desktopContent =
        makeSection('orbit', '🌐',
          `${_t('help.sections.orbit', 'Vista Orbitale')}`,
          `<li>${_t('help.desktop.orbit1', '<strong>Trascina</strong> con il mouse per ruotare il modello')}</li>
           <li>${_t('help.desktop.orbit2', 'Usa la <strong>rotella</strong> per zoomare')}</li>
           <li>${_t('help.desktop.orbit3', '<strong>Tasto destro</strong> o <kbd>Ctrl</kbd>+trascina per traslare')}</li>`,
          true
        ) +
        makeSection('movement', '🚶',
          `${_t('help.sections.movement', 'Movimento')} <small>(POV)</small>`,
          `<li>${_t('help.desktop.movement1', 'Usa <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> per muoverti')}</li>
           <li>${_t('help.desktop.movement2', 'Tieni premuto <kbd>Shift</kbd> per correre')}</li>`,
          false
        ) +
        makeSection('camera', '👁️',
          `${_t('help.sections.camera', 'Visuale')} <small>(POV)</small>`,
          `<li>${_t('help.desktop.camera1', 'Muovi il <strong>mouse</strong> per guardarti intorno')}</li>
           <li>${_t('help.desktop.camera2', 'Clicca sul canvas per bloccare il puntatore')}</li>`,
          false
        ) +
        makeSection('actions', '⚡',
          `${_t('help.sections.actions', 'Azioni')}`,
          `<li>${_t('help.desktop.action1', 'Premi <kbd>R</kbd> per reimpostare la vista')}</li>
           <li>${_t('help.desktop.action2', 'Premi <kbd>P</kbd> per entrare/uscire dal POV (prima persona)')}</li>
           <li>${_t('help.desktop.action3', 'Premi <kbd>i</kbd> per le informazioni cavità')}</li>
           <li>${_t('help.desktop.action4', 'Premi <kbd>Esc</kbd> per rilasciare il puntatore')}</li>`,
          false
        ) +
        makeSection('tools', '🛠️',
          `${_t('help.sections.tools', 'Strumenti')}`,
          `<li>${_t('help.desktop.tools1', 'Premi <kbd>M</kbd> per attivare/disattivare lo strumento <strong>Misurazione</strong>')}</li>
           <li>${_t('help.desktop.tools2', 'Premi <kbd>H</kbd> per aprire/chiudere questa <strong>Guida</strong>')}</li>
           <li>${_t('help.desktop.tools3', 'Usa il pannello <strong>Viste</strong> per viste predefinite (Fronte, Retro, ecc.)')}</li>
           <li>${_t('help.desktop.tools4', 'Usa il pannello <strong>Sezioni</strong> per tagliare il modello sugli assi X/Y/Z')}</li>
           <li>${_t('help.desktop.toolsPoi', 'Attiva <strong>Punti di interesse</strong> per aggiungere annotazioni al modello (salvate sul dispositivo, con esportazione/importazione JSON)')}</li>
           <li>${_t('help.desktop.tools5', 'Attiva <strong>Rotazione automatica</strong> per far girare il modello')}</li>
           <li>${_t('help.desktop.tools6', 'Usa <strong>Condividi</strong> per inviare il link via social')}</li>
           <li>${_t('help.desktop.toolsScreenshot', 'Usa <strong>Screenshot</strong> per salvare la vista corrente come immagine PNG')}</li>
           <li>${_t('help.desktop.tools7', 'Passa il mouse sulle icone della barra in alto per vederne il nome')}</li>`,
          false
        );

      const mobileContent =
        makeSection('orbit', '🌐',
          `${_t('help.sections.orbit', 'Vista Orbitale')}`,
          `<li>${_t('help.mobile.orbit1', '<strong>Trascina</strong> con un dito per ruotare il modello')}</li>
           <li>${_t('help.mobile.orbit2', '<strong>Pizzica</strong> con due dita per zoomare')}</li>
           <li>${_t('help.mobile.orbit3', '<strong>Trascina</strong> con due dita per traslare')}</li>`,
          true
        ) +
        makeSection('movement', '🚶',
          `${_t('help.sections.movement', 'Movimento')} <small>(POV)</small>`,
          `<li>${_t('help.mobile.movement1', 'Usa il <strong>joystick virtuale</strong> in basso a sinistra')}</li>
           <li>${_t('help.mobile.movement2', 'Spingi il joystick nella direzione desiderata')}</li>
           <li>${_t('help.mobile.movement3', '<strong>Doppio tocco</strong> sullo schermo per fare un passo avanti')}</li>`,
          false
        ) +
        makeSection('camera', '👁️',
          `${_t('help.sections.camera', 'Visuale')} <small>(POV)</small>`,
          `<li>${_t('help.mobile.camera1', 'Trascina il <strong>dito</strong> sullo schermo per guardarti intorno')}</li>
           <li>${_t('help.mobile.camera2', 'Usa due dita per zoomare (pinch)')}</li>`,
          false
        ) +
        makeSection('actions', '⚡',
          `${_t('help.sections.actions', 'Azioni')}`,
          `<li>${_t('help.mobile.action1', 'Tocca <strong>Reset vista</strong> nel menu per reimpostare la vista')}</li>
           <li>${_t('help.mobile.action2', 'Tocca <strong>POV</strong> per entrare/uscire dalla prima persona')}</li>
           <li>${_t('help.mobile.action3', 'Tocca il pulsante <strong>i</strong> per le informazioni')}</li>`,
          false
        ) +
        makeSection('tools', '🛠️',
          `${_t('help.sections.tools', 'Strumenti')}`,
          `<li>${_t('help.mobile.tools1', 'Tocca <strong>Misura</strong> per attivare lo strumento di misurazione')}</li>
           <li>${_t('help.mobile.tools2', 'Tocca <strong>?</strong> per aprire questa guida')}</li>
           <li>${_t('help.mobile.tools3', 'Tocca <strong>Viste</strong> per le viste predefinite (Fronte, Retro, ecc.)')}</li>
           <li>${_t('help.mobile.tools4', 'Tocca <strong>Sezioni</strong> per tagliare il modello sugli assi X/Y/Z')}</li>
           <li>${_t('help.mobile.toolsPoi', 'Tocca <strong>Punti di interesse</strong> per aggiungere annotazioni al modello (con esportazione/importazione JSON)')}</li>
           <li>${_t('help.mobile.tools5', 'Tocca <strong>Rotazione</strong> per attivare la rotazione automatica')}</li>
           <li>${_t('help.mobile.tools6', 'Tocca <strong>Condividi</strong> per inviare il link via social')}</li>
           <li>${_t('help.mobile.toolsScreenshot', 'Tocca <strong>Screenshot</strong> per salvare la vista come immagine PNG')}</li>`,
          false
        );

      const vrContent =
        makeSection('movement', '🚶',
          `${_t('help.sections.movement', 'Movimento')}`,
          `<li>${_t('help.vr.movement1', 'Usa lo <strong>stick analogico</strong> del controller sinistro')}</li>
           <li>${_t('help.vr.movement2', 'Spingi in avanti per camminare, lateralmente per traslare')}</li>`,
          true
        ) +
        makeSection('camera', '👁️',
          `${_t('help.sections.camera', 'Visuale')}`,
          `<li>${_t('help.vr.camera1', 'Ruota la <strong>testa</strong> per guardarti intorno')}</li>
           <li>${_t('help.vr.camera2', 'Lo stick destro ruota la visuale di 45°')}</li>`,
          false
        ) +
        makeSection('actions', '⚡',
          `${_t('help.sections.actions', 'Azioni')}`,
          `<li>${_t('help.vr.action1', 'Premi il <strong>grilletto</strong> per interagire')}</li>
           <li>${_t('help.vr.action2', 'Premi <strong>Menu</strong> per uscire dalla modalità VR')}</li>
           <li>${_t('help.vr.action3', 'Il pulsante <strong>A/X</strong> resetta la posizione')}</li>`,
          false
        );

      const panelAttrs = (id) => `role="tabpanel" id="help-panel-${id}" aria-labelledby="help-tab-${id}" tabindex="0"`;
      helpContent.innerHTML = `
        ${tabsHTML}
        <div class="help-tab-content" ${panelAttrs('desktop')} data-content="desktop" style="${currentHelpTab === 'desktop' ? '' : 'display:none'}">${desktopContent}</div>
        <div class="help-tab-content" ${panelAttrs('mobile')} data-content="mobile" style="${currentHelpTab === 'mobile' ? '' : 'display:none'}">${mobileContent}</div>
        <div class="help-tab-content" ${panelAttrs('vr')} data-content="vr" style="${currentHelpTab === 'vr' ? '' : 'display:none'}">${vrContent}</div>
      `;

      const tabs = Array.from(helpContent.querySelectorAll('[role="tab"]'));
      function activateTab(tab, focusTab) {
        const tabName = tab.dataset.tab;
        currentHelpTab = tabName;
        tabs.forEach(t => {
          const isActive = t === tab;
          t.classList.toggle('active', isActive);
          t.setAttribute('aria-selected', isActive ? 'true' : 'false');
          t.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        helpContent.querySelectorAll('.help-tab-content').forEach(c => c.style.display = 'none');
        const panel = helpContent.querySelector(`[data-content="${tabName}"]`);
        if (panel) panel.style.display = '';
        if (focusTab) tab.focus();
      }

      tabs.forEach(tab => {
        tab.addEventListener('click', () => activateTab(tab, false));
        tab.addEventListener('keydown', (e) => {
          let idx = tabs.indexOf(tab);
          if (e.key === 'ArrowRight') {
            idx = (idx + 1) % tabs.length;
            e.preventDefault();
            activateTab(tabs[idx], true);
          } else if (e.key === 'ArrowLeft') {
            idx = (idx - 1 + tabs.length) % tabs.length;
            e.preventDefault();
            activateTab(tabs[idx], true);
          } else if (e.key === 'Home') {
            e.preventDefault();
            activateTab(tabs[0], true);
          } else if (e.key === 'End') {
            e.preventDefault();
            activateTab(tabs[tabs.length - 1], true);
          }
        });
      });

      // Accordion: click su intestazione sezione apre/chiude il corpo
      helpContent.querySelectorAll('.help-section h4').forEach(h4 => {
        h4.addEventListener('click', () => {
          h4.closest('.help-section').classList.toggle('open');
        });
      });
    }
    function showFPHelp(force=false){
      if (!force && localStorage.getItem(LS_KEY_DONT_HELP) === '1') return;
      buildHelpHTML();
      helpDontShow.checked = false;
      helpOverlay.style.display = 'flex';
      if (renderer?.domElement) renderer.domElement.style.pointerEvents = 'none';
      document.body.style.overflow = 'hidden';
      trapModalFocus(helpOverlay);
    }
    function hideHelp(){
      releaseModalFocus(helpOverlay);
      helpOverlay.style.display = 'none';
      if (renderer?.domElement) renderer.domElement.style.pointerEvents = '';
      document.body.style.overflow = '';
      if (helpDontShow.checked) localStorage.setItem(LS_KEY_DONT_HELP, '1');
      if (!isTouch && pendingFPStart && enterFPToggle.checked && !fpControls.isLocked) { tryPointerLock(); }
      pendingFPStart = false;
    }

    /* Onboarding / coachmark */
    function populateSelector() {
      modelSelectorList.innerHTML = '';
      modelSelectorLabel.textContent = _t('viewer.selectModel', '— Seleziona un modello —');
      modelSelectorValue = '';
      const sorted = (modelsData || [])
        .slice()
        .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
      sorted.forEach(m => {
        if (!m || !m.name) return;
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.setAttribute('data-value', m.name);
        li.textContent = m.name;
        li.addEventListener('click', () => {
          selectModelFromDropdown(m.name);
        });
        modelSelectorList.appendChild(li);
      });
      modelSelectorToggle.classList.add('coach-highlight');
    }

    function toggleModelDropdown() {
      const isOpen = modelSelectorWrapper.classList.contains('open');
      if (isOpen) { closeModelDropdown(); } else { openModelDropdown(); }
    }

    function openModelDropdown() {
      if (isSmallScreen()) closeMobileMenu();
      modelSelectorWrapper.classList.add('open');
      modelSelectorDropdown.style.display = 'flex';
      modelSelectorToggle.setAttribute('aria-expanded', 'true');
      modelSelectorSearch.value = '';
      filterModelList('');
      requestAnimationFrame(() => modelSelectorSearch.focus());
    }

    function closeModelDropdown() {
      modelSelectorWrapper.classList.remove('open');
      modelSelectorDropdown.style.display = 'none';
      modelSelectorToggle.setAttribute('aria-expanded', 'false');
    }

    function filterModelList(query) {
      const q = query.toLowerCase().trim();
      const items = modelSelectorList.querySelectorAll('li');
      let visibleCount = 0;
      items.forEach(li => {
        const name = (li.getAttribute('data-value') || '').toLowerCase();
        const match = q === '' || name.includes(q);
        li.style.display = match ? '' : 'none';
        if (match) visibleCount++;
      });
      modelSelectorEmpty.style.display = visibleCount === 0 ? 'block' : 'none';
    }

    function selectModelFromDropdown(name) {
      modelSelectorValue = name;
      modelSelectorLabel.textContent = name;
      // Mark selected item
      modelSelectorList.querySelectorAll('li').forEach(li => {
        li.classList.toggle('selected', li.getAttribute('data-value') === name);
      });
      closeModelDropdown();
      loadModelByName(name);
      hideOnboarding();
    }

    function selectModelByName(name){
      modelSelectorValue = name;
      modelSelectorLabel.textContent = name;
      modelSelectorList.querySelectorAll('li').forEach(li => {
        li.classList.toggle('selected', li.getAttribute('data-value') === name);
      });
    }

    function showOnboardingIfNeeded(){
      // Nella pagina incorporata l'onboarding coprirebbe il modello dentro
      // l'articolo, e il selettore che indica non è nemmeno visibile.
      if (isEmbed) return;
      const skip = localStorage.getItem(LS_KEY_DONT_ONBOARD) === '1';
      if (skip) return;
      onboard.style.display = 'flex';
      coachBubble.style.display = 'block';
      positionCoachBubble();
      if (renderer?.domElement) renderer.domElement.style.pointerEvents = 'none';
      document.body.style.overflow = 'hidden';
      trapModalFocus(onboard);
    }
    function hideOnboarding(){
      releaseModalFocus(onboard);
      onboard.style.display = 'none';
      coachBubble.style.display = 'none';
      modelSelectorToggle.classList.remove('coach-highlight');
      if (onboardDont.checked) localStorage.setItem('dontShowOnboard', '1');
      if (renderer?.domElement) renderer.domElement.style.pointerEvents = '';
      document.body.style.overflow = '';
    }
    function positionCoachBubble(){
      if (coachBubble.style.display === 'none') return;
      const r = modelSelectorToggle.getBoundingClientRect();
      coachBubble.style.left = `${r.left}px`;
      coachBubble.style.top  = `${r.bottom + 8}px`;
    }

    /* Caricamento modello */
    // ===== DOWNLOAD DEL MODELLO GLB/GLTF =====
    // Il download non passa più da gltfLoader.load(): il FileLoader di Three.js
    // accumula i chunk e poi li concatena, tenendo in memoria il doppio del
    // file. Su un GLB da 100 MB questo bastava a far terminare la scheda dal
    // sistema operativo sui telefoni (la pagina andava in errore e si
    // ricaricava). Con fetchBinaryModel() il buffer è uno solo; qui resta solo
    // il parsing, che il loader fa già a partire da un ArrayBuffer.

    // Download in corso, per poterlo interrompere se si cambia modello
    let modelDownload = null;
    // Numero progressivo del caricamento: un parse che termina dopo che
    // l'utente ha già scelto un altro modello non deve diventare currentModel
    // (finirebbe in scena insieme al nuovo, con i POI e l'anteprima social di
    // quell'altro, e la sua memoria non verrebbe mai liberata)
    let modelLoadSeq = 0;

    function abortModelDownload() {
      if (!modelDownload) return;
      try { modelDownload.controller.abort(); } catch { /* già concluso */ }
      modelDownload = null;
    }

    // Pagina chiusa o lasciata a metà download: libera subito il download
    // offline del worker invece di lasciarlo in pausa fino alla scadenza
    window.addEventListener('pagehide', () => {
      if (modelDownload) notifyServiceWorker({ type: 'MODEL_LOAD_END', url: modelDownload.url });
    });

    // Messaggi al service worker (nessun effetto se non c'è o non controlla
    // ancora la pagina): servono a non far coincidere il download del viewer
    // con quello della cache offline, che raddoppierebbe la memoria occupata.
    function notifyServiceWorker(message) {
      try {
        navigator.serviceWorker?.controller?.postMessage(message);
      } catch { /* service worker non disponibile */ }
    }

    // Tetto alle texture del modello (vedi ./viewer/gltf-memory.js). Una
    // texture 8192×8192 decodificata occupa 256 MB di RAM e ~340 MB di GPU:
    // su un telefono basta da sola a far chiudere la scheda, anche se il GLB
    // pesa pochi MB. Sul desktop resta solo il limite fisico della GPU.
    // Divisore applicato ai limiti dopo perdite ripetute del contesto WebGL
    let textureReduction = 1;

    function textureLimits() {
      const limits = baseTextureLimits();
      if (textureReduction <= 1) return limits;
      const maxSize = limits.maxSize > 0 ? limits.maxSize : 4096;
      const maxPixels = limits.maxPixels > 0 ? limits.maxPixels : 24e6;
      return {
        maxSize: Math.max(512, Math.floor(maxSize / textureReduction)),
        maxPixels: maxPixels / (textureReduction * textureReduction)
      };
    }

    function baseTextureLimits() {
      const gpuMax = renderer?.capabilities?.maxTextureSize || 0;
      const clampToGpu = (size) => {
        if (!(size > 0)) return gpuMax;
        return gpuMax > 0 ? Math.min(size, gpuMax) : size;
      };
      // 0 in configurazione = nessun limite; valori assenti o non validi = default
      const setting = (key, fallback) => {
        const v = Number(viewerCfg[key]);
        return viewerCfg[key] !== undefined && viewerCfg[key] !== null && Number.isFinite(v) && v >= 0 ? v : fallback;
      };
      const memoryGb = navigator.deviceMemory;
      const constrained = isTouch || isIOS || (typeof memoryGb === 'number' && memoryGb < 4);
      if (!constrained) {
        return {
          maxSize: clampToGpu(setting('textureMaxSize', 0)),
          maxPixels: setting('textureBudgetMP', 0) * 1e6
        };
      }
      let maxSize = setting('textureMaxSizeMobile', 4096);
      let budgetMP = setting('textureBudgetMPMobile', 24);
      // deviceMemory esiste solo su Chromium; su iOS resta il default
      if (typeof memoryGb === 'number' && memoryGb <= 2) {
        maxSize = maxSize > 0 ? Math.min(maxSize, 2048) : 2048;
        budgetMP = budgetMP > 0 ? Math.min(budgetMP, 8) : 8;
      }
      return { maxSize: clampToGpu(maxSize), maxPixels: budgetMP * 1e6 };
    }

    function downloadAndParseGltf(modelUrl, basePath, modelInfo, loadSeq) {
      abortModelDownload();
      const isStale = () => loadSeq !== modelLoadSeq;

      const controller = new AbortController();
      const download = { controller, url: modelUrl };
      modelDownload = download;

      // Il LoadingManager non vede più questo download: senza la coppia
      // itemStart/itemEnd manager.onLoad non scatterebbe e l'overlay di
      // caricamento resterebbe sullo schermo per sempre.
      manager.itemStart(modelUrl);
      let itemClosed = false;
      const closeItem = (failed) => {
        if (itemClosed) return;
        itemClosed = true;
        if (failed) manager.itemError(modelUrl);
        manager.itemEnd(modelUrl);
      };

      const fail = (err) => {
        if (modelDownload === download) modelDownload = null;
        // Interruzione volontaria (cambio modello): non è un errore da mostrare.
        // Nessun MODEL_LOAD_END: la finestra "viewer occupato" appartiene ormai
        // al download che ha preso il posto di questo, e chiuderla lo lascerebbe
        // scoperto.
        if (err?.name === 'AbortError') { closeItem(false); return; }
        notifyServiceWorker({ type: 'MODEL_LOAD_END', url: modelUrl });
        console.error('Errore GLB/GLTF:', err);
        // Prima si chiude l'item, poi si mostra l'errore: chiudendolo il
        // LoadingManager fa passare l'overlay per "caricato", che ripulirebbe
        // il messaggio appena scritto.
        closeItem(true);
        showLoaderError(modelLoadErrorMessage(err));
      };

      notifyServiceWorker({ type: 'MODEL_LOAD_START', url: modelUrl });
      // La finestra "viewer occupato" del worker scade da sola (vedi
      // VIEWER_BUSY_MAX_MS): su rete lenta 100 MB durano di più, quindi la si
      // rinnova mentre i byte arrivano
      let lastBusyPing = Date.now();

      fetchBinaryModel(modelUrl, {
        signal: controller.signal,
        onProgress: (loaded, total) => {
          resetLoaderWatchdog();
          if (Date.now() - lastBusyPing > 45000) {
            lastBusyPing = Date.now();
            notifyServiceWorker({ type: 'MODEL_LOAD_START', url: modelUrl });
          }
          if (total > 0) {
            showLoader(Math.round((loaded / total) * 100), {
              loaded, total, isProcessing: false, isIndeterminate: false
            });
          } else {
            // Il server non ha inviato Content-Length: animazione indeterminata
            showLoader(0, { loaded, total: 0, isProcessing: false, isIndeterminate: true });
          }
        }
      }).then((buffer) => {
        // Nel frattempo si è passati a un altro modello: questo va scartato
        // (nessun MODEL_LOAD_END, per lo stesso motivo dell'abort in fail())
        if (modelDownload !== download) { closeItem(false); return; }
        modelDownload = null;

        // Download completato, ora parsing/processing
        clearLoaderWatchdog();
        showLoader(100, { isProcessing: true });

        parseGltfLean(gltfLoader, buffer, basePath, textureLimits(), (gltf) => {
          if (isStale()) {
            // Sostituito da un altro modello durante il parse
            (gltf.scenes || [gltf.scene]).forEach((s) => s && disposeThreeObject(s));
            closeItem(false);
            notifyServiceWorkerLater(modelUrl);
            return;
          }
          try {
            const object = gltf.scene || gltf.scenes?.[0];
            if (!object) throw new Error('GLB/GLTF senza scene');
            applyModelRotation(object, modelInfo);
            centerScaleAndLight(object);
            buildShareURL();
            loadPoisForModel(currentModelInfo?.folder);
            // Auto-generate social preview in background
            autoGenerateSocialPreview();
            closeItem(false);
            verifyGpuUploadLater(loadSeq, buffer.byteLength);
          } catch (err) {
            console.error('Errore elaborazione GLB/GLTF:', err);
            closeItem(true);
            showLoaderError(modelLoadErrorMessage(err));
          }
          // Solo ora il service worker può provare a mettere il modello in
          // cache: il parsing è finito e i buffer del download sono liberi
          notifyServiceWorkerLater(modelUrl);
        }, fail, isStale);
      }).catch(fail);
    }

    // MODEL_LOAD_END dopo il primo frame e un margine: al termine del parse le
    // texture devono ancora essere caricate sulla GPU e i buffer del download
    // non sono stati raccolti. La copia in cache del worker (che su Android
    // gira nello stesso processo) non deve sommarsi a quel picco.
    function notifyServiceWorkerLater(modelUrl) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setTimeout(() => notifyServiceWorker({ type: 'MODEL_LOAD_END', url: modelUrl }), 3000);
      }));
    }

    // Primo frame del modello appena caricato, con lettura di gl.getError().
    // Su iPhone una GPU senza memoria sufficiente non sempre perde il contesto:
    // bufferData/texImage2D falliscono con OUT_OF_MEMORY e la scena resta nera
    // senza alcun messaggio. In quel caso si riprova una volta con texture più
    // piccole (se il modello ne ha), poi si spiega all'utente cosa succede.
    function verifyGpuUploadLater(loadSeq, fileBytes) {
      requestAnimationFrame(() => {
        if (loadSeq !== modelLoadSeq || !currentModel) return;
        const stats = collectModelStats(currentModel);
        const result = checkGpuUpload(renderer, scene, camera);
        const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
        const limits = textureLimits();
        const info = renderer.info;
        showDiagnostics([
          `${currentModelInfo?.name || ''} (${currentModelInfo?.folder || ''})`,
          fileBytes ? `file ${mb(fileBytes)}` : '',
          `mesh ${stats.meshes} · vertici ${stats.vertices.toLocaleString()} · triangoli ${stats.triangles.toLocaleString()}`,
          `geometrie ${mb(stats.geometryBytes)} · buffer max ${mb(stats.largestBuffer)}`,
          `texture ${stats.textures.length}: ${stats.textures.join(', ') || '—'}`,
          `limiti texture ${limits.maxSize || '∞'} px, ${limits.maxPixels ? (limits.maxPixels / 1e6).toFixed(0) + ' MP' : '∞'} (riduzione ×${textureReduction})`,
          `GPU maxTexture ${renderer.capabilities.maxTextureSize} · WebGL${renderer.capabilities.isWebGL2 ? '2' : '1'} · DPR ${renderer.getPixelRatio()}`,
          `render: ${info.render.calls} draw, ${info.render.triangles.toLocaleString()} tri · GPU geo ${info.memory.geometries}, tex ${info.memory.textures}`,
          `deviceMemory ${navigator.deviceMemory ?? '?'} · touch ${isTouch} · iOS ${isIOS}`,
          `errori GL: ${result.errors.join(', ') || 'nessuno'}`,
          navigator.userAgent
        ]);
        if (!result.outOfMemory) return;
        console.error('GPU senza memoria per il modello:', result.errors, stats);
        if (stats.textures.length > 0 && textureReduction < 4 && lastRequestedModelName) {
          textureReduction = Math.min(textureReduction * 2, 8);
          logDiagnostic(`OUT_OF_MEMORY: ricarico con texture ridotte ×${textureReduction}`);
          loadModelByName(lastRequestedModelName);
          return;
        }
        logDiagnostic('OUT_OF_MEMORY: modello troppo grande per la GPU');
        showLoaderError(_t('loader.errorMemory', 'Il modello è troppo grande per la memoria di questo dispositivo. Chiudi le altre schede e riprova.'));
      });
    }

    function loadModelByName(modelName) {
      const modelInfo = modelsData.find(m => m?.name === modelName);
      if (!modelInfo) return;
      lastRequestedModelName = modelName;
      const loadSeq = ++modelLoadSeq;

      // Store current model info globally for use by autoGenerateSocialPreview
      currentModelInfo = modelInfo;

      overlayName.textContent = modelName;
      infoOverlay.style.display = 'none';
      infoOpenBtn.style.display = 'inline-flex';
      infoTitle.textContent = modelInfo.name || '';
      if (modelInfo.lat != null && modelInfo.lon != null) {
        infoCoords.textContent = `${modelInfo.lat}, ${modelInfo.lon}`;
        infoCoords.style.display = '';
      } else {
        infoCoords.style.display = 'none';
      }
  if (modelInfo.description) {
        infoDesc.textContent = modelInfo.description;
        infoDesc.style.display = '';
      } else {
        infoDesc.style.display = 'none';
      }
      showLoader(0);

      // Cleanup listener specifici del modello precedente
      eventManager.removeGroup('model');
      // Interrompe un download ancora in corso: senza, il buffer del modello
      // precedente resterebbe in memoria accanto a quello nuovo
      abortModelDownload();

      if (currentModel) {
        clearSectionClippingFor(currentModel);
        if (interiorRig) { currentModel.remove(interiorRig); interiorRig = null; }
        disposeThreeObject(currentModel);
        currentModel = null;
      } else if (interiorRig) {
        interiorRig = null;
      }

      resetSectionState();
      closeSectionPanel();
      resetMeasureState();
      hideMeasurePanel();
      unloadPois();

      // azzera la vista iniziale
      initialCamPos = null; initialTarget = null; initialModelQuat = null;
      initialNear = viewerCfg.defaultNear || 0.1; initialFar = viewerCfg.defaultFar || 2000;


      const basePath = `${MODELS_FOLDER}/${modelInfo.folder}/`;

      if (modelInfo.file && /\.(glb|gltf)$/i.test(modelInfo.file)) {
        // Mostra loader iniziale
        showLoader(0, { isIndeterminate: true });
        resetLoaderWatchdog();
        // URL assoluto: è la forma con cui il service worker vede la richiesta,
        // e i messaggi MODEL_LOAD_* devono parlare della stessa chiave
        downloadAndParseGltf(new URL(basePath + modelInfo.file, document.baseURI).href, basePath, modelInfo, loadSeq);
        return;
      }

      if (modelInfo.obj && modelInfo.mtl) {
        resetLoaderWatchdog();
        const mtlLoader = new MTLLoader(manager);
        mtlLoader.setPath(basePath);
        mtlLoader.load(modelInfo.mtl, (materials) => {
          materials.preload();
          const objLoader = new OBJLoader(manager);
          objLoader.setMaterials(materials);
          objLoader.setPath(basePath);
          objLoader.load(modelInfo.obj, (object) => {
            if (loadSeq !== modelLoadSeq) { disposeThreeObject(object); return; }
            clearLoaderWatchdog();
            applyModelRotation(object, modelInfo);
            centerScaleAndLight(object);
            buildShareURL();
            loadPoisForModel(currentModelInfo?.folder);
            // Auto-generate social preview in background
            autoGenerateSocialPreview();
            verifyGpuUploadLater(loadSeq, 0);
          }, () => resetLoaderWatchdog(), (err) => {
            console.error('Errore OBJ:', err);
            showLoaderError(modelLoadErrorMessage(err));
          });
        }, () => resetLoaderWatchdog(), (err) => {
          console.error('Errore MTL:', err);
          showLoaderError(modelLoadErrorMessage(err));
        });
        return;
      }

      // Nessun formato riconosciuto nei metadati del modello
      showLoaderError(_t('loader.errorGeneric', 'Si è verificato un errore durante il caricamento del modello.'));
    }

    function applyModelScaleForMode(object, useVRScale = false) {
      if (!object) return 1;
      const baseScale = (object.userData?.originalScale && object.userData.originalScale.isVector3)
        ? object.userData.originalScale.clone()
        : new THREE.Vector3(1, 1, 1);
      const viewerScaleFactor = (object.userData && typeof object.userData.viewerScaleFactor === 'number' && isFinite(object.userData.viewerScaleFactor))
        ? object.userData.viewerScaleFactor
        : 1;
      const baseSize = (object.userData?.originalSize && object.userData.originalSize.isVector3)
        ? object.userData.originalSize.clone()
        : null;

      if (interiorRig) {
        object.remove(interiorRig);
        interiorRig = null;
      }

      const appliedScale = useVRScale ? 1 : viewerScaleFactor;
      object.scale.copy(baseScale).multiplyScalar(appliedScale);
      // Memorizzato per riconvertire le distanze mondo in metri reali
      // (barra di scala): in VR vale 1, nel browser vale viewerScaleFactor
      if (!object.userData) object.userData = {};
      object.userData.appliedScale = appliedScale;

      if (baseSize) {
        const rigSize = baseSize.multiplyScalar(appliedScale);
        interiorRig = buildInteriorLightRig(rigSize);
        object.add(interiorRig);
      }

      object.updateMatrixWorld(true);
      return appliedScale;
    }

    function applyModelRotation(object, info) {
      if (!info || !info.rotation) return;
      const r = info.rotation;
      object.rotation.set(
        THREE.MathUtils.degToRad(r.x || 0),
        THREE.MathUtils.degToRad(r.y || 0),
        THREE.MathUtils.degToRad(r.z || 0)
      );
      object.updateMatrixWorld(true);
    }

    function centerScaleAndLight(object){
      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const diag = size.length();

      object.position.sub(center);
      const originalScale = object.scale.clone();
      const scaleFactor = diag > 0 ? 6 / diag : 1;

      if (!object.userData) object.userData = {};
      object.userData.originalScale = originalScale;
      object.userData.viewerScaleFactor = scaleFactor;
      object.userData.originalSize = size.clone();

      convertMaterialsToUnlit(object);
      makeDoubleSided(object);
      dropUnusedNormals(object);
      buildCollisionBVH(object);

      const useVRScale = renderer?.xr?.isPresenting === true;
      applyModelScaleForMode(object, useVRScale);

      currentModel = object; scene.add(currentModel);
      // Salva il quaternion mondo del modello per le viste relative
      currentModel.updateMatrixWorld(true);
      initialModelQuat = new THREE.Quaternion();
      currentModel.getWorldQuaternion(initialModelQuat);
      const frame = computeFrame(currentModel, 1.2);
      initialTarget = frame.center.clone();
      initialCamPos = frame.center.clone().add(new THREE.Vector3(0,0,1).multiplyScalar(frame.distance));
      initialNear = frame.near; initialFar = frame.far;
      if (!consumePendingCameraFromURL(frame)) {
        frameObjectAnimated(currentModel, 1.2, 450);
      }
      updateScaleBar();
      refreshSectionPlane();
      updateSectionControlsState();
      updateMeasureControlsState();
      // Dopo refreshSectionPlane(): i bounds locali del nuovo modello ci sono
      // già, quindi la sezione del deep link si applica sulla scala giusta.
      if (!consumePendingSectionFromURL() && sectionEnabled) updateSectionClipping();
      // Il load termina in async: l'ultima attività utente può essere lontana
      requestRender();
}
    function buildCollisionBVH(root){
      root.traverse((ch)=>{
        if (!ch.isMesh || !ch.geometry || !ch.geometry.attributes.position) return;
        try {
          ch.geometry.computeBoundsTree();
        } catch (err) {
          console.warn('BVH non costruito per', ch.name || '(mesh)', err);
        }
      });
    }

    function convertMaterialsToUnlit(root){
      const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      root.traverse((ch)=>{
        if (!ch.isMesh) return;
        const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
        const converted = mats.map((mat)=>{
          if (!mat) return mat;
          if (mat.isMeshBasicMaterial) {
            if (mat.map && mat.map.isTexture) {
              mat.map.colorSpace = THREE.SRGBColorSpace;
              mat.map.anisotropy = maxAniso;
            }
            return mat;
          }
          const options = {
            name: mat.name,
            color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
            map: mat.map || null,
            // Modelli colorati per vertice (senza texture): senza questo
            // apparirebbero bianchi
            vertexColors: mat.vertexColors === true,
            side: mat.side,
            transparent: mat.transparent,
            opacity: mat.opacity,
            alphaTest: mat.alphaTest,
            depthWrite: mat.depthWrite,
            depthTest: mat.depthTest,
            blending: mat.blending
          };
          const basic = new THREE.MeshBasicMaterial(options);
          if (basic.map && basic.map.isTexture) {
            basic.map.colorSpace = THREE.SRGBColorSpace;
            basic.map.anisotropy = maxAniso;
          }
          if (mat.lightMap && !basic.lightMap) {
            basic.lightMap = mat.lightMap;
            basic.lightMapIntensity = mat.lightMapIntensity ?? 1;
          }
          if (mat.transparent && mat.alphaMap) {
            basic.alphaMap = mat.alphaMap;
          }
          if (mat.name) basic.name = mat.name;
          // material.dispose() NON libera le texture: rilascia esplicitamente
          // quelle del materiale PBR originale non riusate dal MeshBasicMaterial
          // (normalMap, roughnessMap, metalnessMap, aoMap, emissiveMap, ecc.)
          Object.values(mat).forEach((value) => {
            if (value && value.isTexture &&
                value !== basic.map && value !== basic.lightMap && value !== basic.alphaMap) {
              value.dispose();
            }
          });
          mat.dispose?.();
          return basic;
        });
        ch.material = Array.isArray(ch.material) ? converted : converted[0];
      });
    }

    function buildInteriorLightRig(sized){
      const d = Math.max(sized.x, sized.y, sized.z) || 1;
      const group = new THREE.Group();
      const centerLight = new THREE.PointLight(0xffffff, 0.9, d * 1.5, 2);
      centerLight.position.set(0,0,0);
      group.add(centerLight);
      const offs = d * 0.35;
      [[ offs, 0, 0], [-offs, 0, 0],[ 0, offs, 0],[ 0,-offs, 0],[ 0, 0, offs],[ 0, 0,-offs]].forEach((p) => {
        const L = new THREE.PointLight(0xffffff, 0.55, d * 1.2, 2);
        L.position.set(p[0], p[1], p[2]);
        group.add(L);
      });
      return group;
    }
    function makeDoubleSided(root){
      root.traverse((ch)=>{
        if (!ch.isMesh) return;
        const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
        mats.forEach(m=>{ if (!m) return; m.side = THREE.DoubleSide; m.needsUpdate = true; });
      });
    }
    // Tutti i materiali diventano MeshBasicMaterial, che non legge le normali:
    // ricalcolarle (come si faceva) costava CPU al caricamento e 12 byte per
    // vertice in RAM e altrettanti sulla GPU. Si eliminano.
    function dropUnusedNormals(root){
      root.traverse((ch)=>{
        if (!ch.isMesh || !ch.geometry?.attributes?.normal) return;
        const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
        if (mats.every((m) => m?.isMeshBasicMaterial)) ch.geometry.deleteAttribute('normal');
      });
    }

    /* Fit / viste / loop */
    function computeFrame(object3d, margin = 1.2) {
      const box = new THREE.Box3().setFromObject(object3d);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      // Calcola distanza necessaria per FOV verticale (altezza modello)
      const halfFovY = THREE.MathUtils.degToRad(camera.fov * 0.5);
      const distanceForHeight = (size.y * margin * 0.5) / Math.tan(halfFovY);

      // Calcola distanza necessaria per FOV orizzontale (larghezza modello)
      // Su mobile portrait l'aspect ratio < 1, quindi il FOV orizzontale è più stretto
      const aspect = camera.aspect || 1;
      const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);
      const distanceForWidth = (size.x * margin * 0.5) / Math.tan(halfFovX);

      // Considera anche la profondità
      const distanceForDepth = (size.z * margin * 0.5) / Math.tan(halfFovY);

      // Usa la distanza maggiore per garantire che tutto il modello sia visibile
      const distance = Math.max(distanceForHeight, distanceForWidth, distanceForDepth);

      const maxSize = Math.max(size.x, size.y, size.z) * margin;
      const near = Math.max(distance - maxSize * 2, 0.01);
      const far  = distance + maxSize * 2 + 100;
      return { center, distance, near, far };
    }
     function frameObjectAnimated(object3d, margin = 1.2, duration = 600, customDir = null) {
      if (isFraming) return; isFraming = true;
      const { center, distance, near, far } = computeFrame(object3d, margin);
      const dir = (customDir ? customDir.clone().normalize() : new THREE.Vector3(0,0,1));
      const targetPos = center.clone().add(dir.multiplyScalar(distance));
      const startCamPos = camera.position.clone();
      const startTarget = controls.target.clone();
      const startNear = camera.near, startFar = camera.far;
      const start = performance.now();
      const ease = t => t<0.5 ? 2*t*t : -1+(4-2*t)*t;
      function step(now) {
        const t = Math.min(1, (now - start) / duration);
        const k = ease(t);
        camera.position.lerpVectors(startCamPos, targetPos, k);
        controls.target.lerpVectors(startTarget, center, k);
        camera.near = THREE.MathUtils.lerp(startNear, near, k);
        camera.far  = THREE.MathUtils.lerp(startFar,  far,  k);
        camera.updateProjectionMatrix();
        controls.update();
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          isFraming = false;
        }
      }
      requestAnimationFrame(step);
    }

    function resetToInitialView(duration = 600) {
      if (!currentModel || !initialCamPos || !initialTarget || !initialModelQuat) return;
      if (sectionEnabled || isSectionPanelOpen()) {
        resetSectionState();
        closeSectionPanel();
      }
      // Reset misurazioni
      if (hasMeasurements()) {
        clearAllMeasurements();
      }
      disableMeasureMode();
      if (isFraming) return; isFraming = true;
      const startCamPos = camera.position.clone();
      const startTarget = controls.target.clone();
      const startNear = camera.near, startFar = camera.far;
      const targetPos = initialCamPos.clone();
      const targetTarget = initialTarget.clone();
      const startQuat = currentModel.quaternion.clone();
      const targetQuat = initialModelQuat.clone();
      const start = performance.now();
      const ease = t => t<0.5 ? 2*t*t : -1+(4-2*t)*t;
      function step(now) {
        const t = Math.min(1, (now - start) / duration);
        const k = ease(t);
        camera.position.lerpVectors(startCamPos, targetPos, k);
        controls.target.lerpVectors(startTarget, targetTarget, k);
        camera.near = THREE.MathUtils.lerp(startNear, initialNear, k);
        camera.far  = THREE.MathUtils.lerp(startFar,  initialFar,  k);
        currentModel.quaternion.copy(startQuat).slerp(targetQuat, k);
        camera.updateProjectionMatrix();
        controls.update();
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          isFraming = false;
        }
      }
      requestAnimationFrame(step);
    }
    function snapTo(which){
      if (!currentModel || !initialModelQuat) return;
      if (isFraming) return;
      isFraming = true;

      // Direzioni nello spazio locale del modello iniziale
      const dirs = {
        front:  new THREE.Vector3(0, 0, 1),
        back:   new THREE.Vector3(0, 0,-1),
        right:  new THREE.Vector3(1, 0, 0),
        left:   new THREE.Vector3(-1,0, 0),
        top:    new THREE.Vector3(0, 1, 0),
        bottom: new THREE.Vector3(0,-1, 0)
      };
      let dir = dirs[which] || dirs.front;

      // Trasforma la direzione usando l'orientamento iniziale del modello
      dir = dir.clone().applyQuaternion(initialModelQuat);

      // Calcola frame target
      const { center, distance, near, far } = computeFrame(currentModel, 1.15);
      const targetCamPos = center.clone().add(dir.multiplyScalar(distance));

      // Stato iniziale
      const startCamPos = camera.position.clone();
      const startTarget = controls.target.clone();
      const startNear = camera.near, startFar = camera.far;
      const startQuat = currentModel.quaternion.clone();
      const targetQuat = initialModelQuat.clone();

      const duration = 500;
      const start = performance.now();
      const ease = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;

      function step(now) {
        const t = Math.min(1, (now - start) / duration);
        const k = ease(t);

        // Anima camera
        camera.position.lerpVectors(startCamPos, targetCamPos, k);
        controls.target.lerpVectors(startTarget, center, k);
        camera.near = THREE.MathUtils.lerp(startNear, near, k);
        camera.far = THREE.MathUtils.lerp(startFar, far, k);

        // Anima rotazione modello verso orientamento iniziale
        currentModel.quaternion.copy(startQuat).slerp(targetQuat, k);

        camera.updateProjectionMatrix();
        controls.update();

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          isFraming = false;
        }
      }
      requestAnimationFrame(step);
    }

    // Pixel ratio limitato per le prestazioni; riapplicato a ogni resize
    // così resta corretto dopo cambi di DPI (spostamento tra monitor, zoom).
    // Su touch/mobile il tetto è più basso: a DPR 2 un iPhone renderizza ~4x
    // i pixel della viewport logica e va in throttling termico
    function applyRendererPixelRatio() {
      const maxRatio = isTouch
        ? (viewerCfg.pixelRatioMaxMobile || 1.5)
        : (viewerCfg.pixelRatioMax || 2);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
    }

    let lastViewport = { w: 0, h: 0, dpr: 0 };
    function onWindowResize() {
      const w = window.innerWidth, h = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      // resize e orientationchange arrivano a coppie, e su mobile la barra del
      // browser che si nasconde genera resize a raffica: ogni setSize()
      // rialloca il drawing buffer, quindi si salta quando nulla è cambiato
      if (w === lastViewport.w && h === lastViewport.h && dpr === lastViewport.dpr) return;
      const orientationChanged = lastViewport.w > 0 && (w > h) !== (lastViewport.w > lastViewport.h);
      const widthChanged = w !== lastViewport.w;
      lastViewport = { w, h, dpr };

      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      applyRendererPixelRatio();
      renderer.setSize(w, h);
      invalidateRendererRect();
      requestRender();
      // Reinquadra solo se la forma della vista è cambiata davvero: la barra
      // degli indirizzi che compare/scompare cambia solo l'altezza e non deve
      // buttare via l'inquadratura scelta dall'utente
      // Su touch anche la sola larghezza non basta (tastiera, barre di
      // sistema): conta solo la rotazione del dispositivo
      const reframe = isTouch ? orientationChanged : (orientationChanged || widthChanged);
      if (currentModel && !isFraming && !isFP && reframe) {
        frameObjectAnimated(currentModel, 1.2, 300);
      }
      updateScaleBar();
      positionCoachBubble();
      // Su mobile, passando in landscape con viewport molto bassa chiudi i
      // pannelli per liberare spazio. Solo alla rotazione: in orizzontale la
      // condizione è sempre vera, e ogni resize (barra di Safari, tastiera
      // per rinominare un POI) chiudeva il pannello che si stava usando.
      if (isTouch && orientationChanged && h < 420 && anyPanelOpen()) {
        if (sectionPanel && sectionPanel.style.display === 'block') closeSectionPanel();
        if (measurePanel && measurePanel.style.display === 'block') hideMeasurePanel();
        if (viewsPanel && viewsPanel.style.display === 'block') {
          viewsPanel.style.display = 'none';
          clearMinimizedState(viewsPanel);
          if (viewsToggle) { viewsToggle.checked = false; viewsToggle.setAttribute('aria-checked', 'false'); }
        }
        hidePanelBackdrop();
      }
    }

    function animate() {
      // getDelta() sempre per primo: mantiene il delta per-frame anche
      // durante l'idle, evitando un delta enorme alla ripresa (salti in FP)
      const delta = clock.getDelta();

      // Rendering on-demand: a scena ferma non renderizzare (GPU a riposo).
      // Gli stati "continui" (VR, prima persona, animazioni di framing,
      // autorotate, joystick, passo da doppio tap) forzano sempre il render.
      // In prima persona si ridisegna solo mentre ci si muove (tasti premuti o
      // inerzia residua): guardarsi intorno passa da pointermove, che riattiva
      // già il loop. Prima la GPU girava a pieno regime per tutta la sessione.
      const fpMoving = isFP && (moveForward || moveBackward || moveLeft || moveRight ||
        velocity.lengthSq() > 1e-8);
      const continuousMotion = renderer.xr.isPresenting || fpMoving || isFraming ||
        (controls && controls.autoRotate) || joyActive || tapStepRemaining > 0;
      if (!continuousMotion && (performance.now() - lastRenderActivity) > RENDER_IDLE_GRACE_MS) {
        return;
      }

      if (renderer.xr.isPresenting) {
        handleVRControllers(delta);
      } else if (isFP) {
        // FP movement: WASD + joystick (desktop pointer-lock e mobile fallback)
        // Smorzamento indipendente dal frame rate: con 0.9 fisso per frame si
        // camminava a metà velocità su uno schermo a 120 Hz e al doppio a 30 fps
        const damp = Math.pow(0.9, delta * 60);
        velocity.multiplyScalar(damp);
        if (velocity.lengthSq() < 1e-10) velocity.set(0, 0, 0);
        direction.set(0,0,0);
        if (moveForward)  direction.z += 1;
        if (moveBackward) direction.z -= 1;
        if (moveLeft)     direction.x -= 1;
        if (moveRight)    direction.x += 1;
        if (direction.lengthSq() > 1) direction.normalize();
        const speed = FP_BASE_SPEED * (boost ? FP_BOOST_MULT : 1);
        velocity.addScaledVector(direction, speed * delta * 10);
        camera.getWorldDirection(fpForward).normalize();
        fpRight.crossVectors(fpForward, camera.up).normalize();
        fpMove.set(0, 0, 0)
          .addScaledVector(fpForward, velocity.z * delta)
          .addScaledVector(fpRight,   velocity.x * delta)
          .addScaledVector(fpUp, velocity.y * delta);
        // Joystick (mobile FP)
        if (joyActive && (Math.abs(joyX) > 0 || Math.abs(joyY) > 0)) {
          const jSpeed = FP_BASE_SPEED * (boost ? FP_BOOST_MULT : 1) * 0.6;
          fpMove.addScaledVector(fpForward, (-joyY) * jSpeed * delta);
          fpMove.addScaledVector(fpRight,   joyX * jSpeed * delta);
        }
        // Passo avanti da doppio tap (mobile): consumato in pochi frame, con collisioni
        if (tapStepRemaining > 0) {
          const stepDist = Math.min(tapStepRemaining, FP_BASE_SPEED * TAP_STEP_SPEED_MULT * delta);
          fpMove.addScaledVector(fpForward, stepDist);
          tapStepRemaining -= stepDist;
        }
        if (currentModel) collideMove(camera.position, fpMove, currentModel);
        camera.position.add(fpMove);
        if (!fpControls || !fpControls.isLocked) controls.target.add(fpMove);
      } else {
        controls.update();
      }

      if (sectionEnabled && sectionPlaneArray && currentModel) {
        updateWorldSectionPlane();
        sectionDirty = false;
      }
      // Etichette e barra di scala sono DOM della pagina, invisibili nel visore:
      // in VR (72-90 Hz) aggiornarle era solo lavoro sprecato
      const domVisible = !renderer.xr.isPresenting;
      if (domVisible) {
        updateMeasureLabels();
        updatePoiLabels();
      }
      // La cupola di sfondo segue la camera: l'utente non ne raggiunge mai il bordo
      if (skyDome) skyDome.position.copy(getCameraWorldPosition(skyDomeTmpVec));
      renderer.render(scene, camera);
      if (domVisible) updateScaleBar();
    }

    function handleVRControllers(delta){
      const session = renderer.xr.getSession();
      if (!session || !cameraRig) return;

      let yawInput = 0;
      let forwardInput = 0;
      let isMoving = false;

      session.inputSources.forEach((inputSource) => {
        const gamepad = inputSource?.gamepad;
        const handedness = inputSource?.handedness;

        // Controller destro: pulsante B per uscire da VR
        if (handedness === 'right' && gamepad?.buttons) {
          const bButton = gamepad.buttons[5]; // B button su Quest
          if (bButton?.pressed) {
            // Esci dalla sessione VR
            session.end();
            return;
          }

          // Grilletto destro: doppio click per reset vista
          const trigger = gamepad.buttons[0];
          if (trigger?.pressed) {
            if (!triggerWasPressed) {
              const now = performance.now();
              const timeSinceLastClick = now - lastTriggerTime;

              if (timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
                // Doppio click rilevato! Reset alla vista iniziale
                cameraRig.position.copy(vrInitialRigPos);
                cameraRig.rotation.copy(vrInitialRigRot);
                cameraRig.updateMatrixWorld(true);
                lastTriggerTime = 0; // Reset per evitare tripli click
              } else {
                lastTriggerTime = now;
              }
              triggerWasPressed = true;
            }
          } else {
            triggerWasPressed = false;
          }
        }

        if (!gamepad || !gamepad.axes || gamepad.axes.length === 0) return;

        for (let i = 0; i < gamepad.axes.length; i += 2) {
          const xAxis = gamepad.axes[i];
          const yAxis = gamepad.axes[i + 1] ?? 0;
          yawInput = THREE.MathUtils.clamp(xAxis, -1, 1);
          forwardInput = THREE.MathUtils.clamp(yAxis, -1, 1);
        }
      });

      if (Math.abs(yawInput) >= VR_DEAD_ZONE) {
        const yawDelta = yawInput * VR_YAW_SPEED * delta;

        // Ottieni la posizione della testa nel world space prima della rotazione
        const xrCamera = renderer.xr.getCamera(camera);
        xrCamera.getWorldPosition(vrHeadPosBefore);

        // Applica la rotazione al rig
        cameraRig.rotateY(-yawDelta);
        cameraRig.updateMatrixWorld(true);

        // Calcola dove si è spostata la testa dopo la rotazione
        xrCamera.getWorldPosition(vrHeadPosAfter);

        // Compensa lo spostamento per mantenere la testa nello stesso punto
        cameraRig.position.add(vrHeadPosBefore.sub(vrHeadPosAfter));
        cameraRig.updateMatrixWorld(true);

        isMoving = true;
      }

      if (Math.abs(forwardInput) >= VR_DEAD_ZONE) {
        const xrCamera = renderer.xr.getCamera(camera);
        const magnitude = Math.abs(forwardInput);
        const directionSign = forwardInput < 0 ? 1 : -1;

        const viewDirection = getXRViewDirection(vrTempDirection, xrCamera);
        vrMoveVector
          .copy(viewDirection)
          .multiplyScalar(directionSign * VR_MOVE_SPEED * delta * magnitude);

        cameraRig.getWorldQuaternion(vrTempQuaternion);
        vrMoveVector.applyQuaternion(vrTempQuaternion);

        const headWorldPos = xrCamera.getWorldPosition(tmpVecC);
        const moveAttempt = vrCollisionVector.copy(vrMoveVector);
        const safeMove = currentModel ? collideMove(headWorldPos, moveAttempt, currentModel) : moveAttempt;
        cameraRig.position.add(safeMove);
        cameraRig.updateMatrixWorld(true);
        isMoving = true;
      }

      // Aggiorna comfort vignette
      const targetIntensity = isMoving ? VIGNETTE_MAX_INTENSITY : 0;
      if (vignetteIntensity < targetIntensity) {
        vignetteIntensity = Math.min(targetIntensity, vignetteIntensity + VIGNETTE_FADE_SPEED * delta);
      } else if (vignetteIntensity > targetIntensity) {
        vignetteIntensity = Math.max(targetIntensity, vignetteIntensity - VIGNETTE_FADE_SPEED * delta);
      }
      vrVignette.style.opacity = vignetteIntensity.toString();
    }

    function getXRViewDirection(target, xrCamera) {
      const quaternion = getXRHeadsetQuaternion(vrTempQuaternion, xrCamera);
      return target.set(0, 0, -1).applyQuaternion(quaternion).normalize();
    }

    function getXRHeadsetQuaternion(target, xrCamera) {
      if (xrCamera.cameras && xrCamera.cameras.length > 0) {
        return target.copy(xrCamera.cameras[0].quaternion);
      }
      return target.copy(xrCamera.quaternion);
    }

    function getCameraWorldPosition(out) {
      if (renderer?.xr?.isPresenting) {
        return renderer.xr.getCamera(camera).getWorldPosition(out);
      }
      return out.copy(camera.position);
    }

    function getCameraForward(out) {
      if (renderer?.xr?.isPresenting) {
        return renderer.xr.getCamera(camera).getWorldDirection(out).normalize();
      }
      return camera.getWorldDirection(out).normalize();
    }

    function collideMove(from, move, meshRoot){
      const len = move.length(); if (len < 1e-6) return move.set(0,0,0);
      collideDir.copy(move).normalize();
      raycaster.set(from, collideDir); raycaster.far = len + COLLISION_PAD;
      const hits = raycaster.intersectObject(meshRoot, true);
      if (hits.length > 0) {
        const d = Math.max(0, hits[0].distance - COLLISION_PAD);
        if (d <= 1e-4) return move.set(0,0,0);
        move.copy(collideDir).multiplyScalar(Math.min(len, d));
      }
      return move;
    }

    // Fattore di conversione unità mondo → metri reali. Il modello viene
    // scalato da applyModelScaleForMode: 1 in VR (1:1) e viewerScaleFactor nel
    // browser, dove la grotta è normalizzata a diagonale 6. Le distanze mondo
    // vanno quindi divise per quella scala, coerentemente con le misurazioni
    // (misure = distanza locale × originalScale, vedi viewer/measure.js).
    function metersPerWorldUnit() {
      const applied = currentModel?.userData?.appliedScale;
      return (typeof applied === 'number' && isFinite(applied) && applied > 0)
        ? 1 / applied
        : 1;
    }

    function updateScaleBar() {
      const unitConf = SCALE_UNIT;
      const camPos = getCameraWorldPosition(tmpVecA);
      let target;
      if (renderer?.xr?.isPresenting) {
        const dir = renderer.xr.getCamera(camera).getWorldDirection(tmpVecB);
        target = tmpVecC.copy(camPos).add(dir);
      } else if (isFP) {
        const dir = getCameraForward(tmpVecB);
        target = tmpVecC.copy(camera.position).add(dir);
      } else {
        target = tmpVecC.copy(controls.target);
      }
      const distance = camPos.distanceTo(target);
      const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
      const unitsPerPixel = visibleHeight / renderer.domElement.clientHeight;
      const metersPerPixel = unitsPerPixel * metersPerWorldUnit();
      // Camera sul target (distanza 0) o canvas non ancora dimensionato:
      // lascia l'ultima barra valida invece di scrivere una larghezza NaN
      if (!(metersPerPixel > 0)) return;
      const idealDisplayUnits = (metersPerPixel * DESIRED_BAR_PX) * unitConf.factor;
      const niceDisplayUnits = niceNumber(idealDisplayUnits);
      const niceMeters = niceDisplayUnits / unitConf.factor;
      const px = Math.max(1, Math.round(niceMeters / metersPerPixel));
      // Dirty-check: aggiorna DOM solo se i valori sono cambiati
      if (px !== lastScaleBarPx) {
        scaleBarEl.style.width = px + 'px';
        lastScaleBarPx = px;
      }
      const labelText = `${formatUnits(niceDisplayUnits)} ${unitConf.label}`;
      if (labelText !== lastScaleLabelText) {
        scaleLabelEl.textContent = labelText;
        lastScaleLabelText = labelText;
      }
    }
    // niceNumber, formatUnits e formatBytes sono in ./viewer/utils.js

    // Le funzioni del loader overlay sono in ./viewer/loader-ui.js

    if (loaderRetryBtn) {
      loaderRetryBtn.addEventListener('click', () => {
        if (lastRequestedModelName) loadModelByName(lastRequestedModelName);
      });
    }

    /* ===== Joystick: Pointer/Touch ===== */
    function joyStart(e){
      e.preventDefault();
      const rect = joystick.getBoundingClientRect();
      joyRadius = rect.width * 0.5;
      if (!joyActive) haptic(10);
      joyActive = true;
      if (e.pointerId != null) activePointerId = e.pointerId;
      joyUpdateFromXY(e.clientX, e.clientY, rect);
    }
    function joyMove(e){
      if (!joyActive || (activePointerId != null && e.pointerId !== activePointerId)) return;
      e.preventDefault();
      const rect = joystick.getBoundingClientRect();
      joyUpdateFromXY(e.clientX, e.clientY, rect);
    }
    function joyEnd(e){
      if (e && activePointerId !== null && e.pointerId !== activePointerId) return;
      joyReset();
    }
    function joyStartTouch(e){
      if (!e.touches || e.touches.length === 0) return;
      e.preventDefault();
      const t = e.touches[0];
      const rect = joystick.getBoundingClientRect();
      joyRadius = rect.width * 0.5;
      if (!joyActive) haptic(10);
      joyActive = true;
      joyUpdateFromXY(t.clientX, t.clientY, rect);
    }
    function joyMoveTouch(e){
      if (!joyActive) return;
      e.preventDefault();
      const t = e.touches && e.touches[0];
      if (!t) return;
      const rect = joystick.getBoundingClientRect();
      joyUpdateFromXY(t.clientX, t.clientY, rect);
    }
    function joyEndTouch(){ joyReset(); }

    function joyUpdateFromXY(cx, cy, rect){
      const centerX = rect.left + rect.width/2;
      const centerY = rect.top  + rect.height/2;
      const dx = cx - centerX;
      const dy = cy - centerY;
      const dist = Math.hypot(dx, dy);
      const max = joyRadius - 8;
      const clamped = dist > max ? max : dist;
      const angle = Math.atan2(dy, dx);
      const nx = Math.cos(angle) * (clamped / max);
      const ny = Math.sin(angle) * (clamped / max);
      const DEAD = 0.1;
      const nxx = Math.abs(nx) < DEAD ? 0 : nx;
      const nyy = Math.abs(ny) < DEAD ? 0 : ny;
      joyX = nxx; joyY = nyy;
      const px = nxx * max;
      const py = nyy * max;
      stickEl.style.transform = `translate(${px}px,${py}px)`;
    }
    function joyReset(){ joyActive = false; joyX = 0; joyY = 0; activePointerId = null; stickEl.style.transform = 'translate(0,0)'; }

    /* ==== TOUCH LOOK per FP mobile (drag sul canvas) ==== */
    function isPointInJoystick(x, y){
      const r = joystick.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false; // joystick nascosto
      const inside = (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
      if (!inside) return false;
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const radius = r.width/2;
      return Math.hypot(x - cx, y - cy) <= radius;
    }
    function applyLookDelta(dx, dy){
      camera.rotation.order = 'YXZ';
      const lookSens = getLookSens();
      camera.rotation.y -= dx * lookSens;
      const maxPitch = Math.PI/2 - 0.01;
      const nextPitch = camera.rotation.x - dy * lookSens;
      camera.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, nextPitch));
    }
    // Doppio tap → un passo avanti. Chiamata al rilascio di un tocco sul canvas:
    // scarta drag e gesti multi-dito, poi confronta con il tap precedente.
    function registerLookTap(x, y, cancelled){
      if (cancelled || lookMultiTouch) { lookMultiTouch = false; lastTapTime = 0; return; }
      const now = performance.now();
      if (now - lookStartTime > TAP_MAX_DURATION ||
          Math.hypot(x - lookStartX, y - lookStartY) > TAP_MAX_MOVE_PX) {
        lastTapTime = 0; // era un drag (look), non un tap
        return;
      }
      if (now - lastTapTime < TAP_DOUBLE_DELAY &&
          Math.hypot(x - lastTapX, y - lastTapY) < TAP_DOUBLE_DIST_PX) {
        tapStepRemaining = TAP_STEP_DISTANCE; // doppio tap: un passo avanti
        lastTapTime = 0; // un terzo tap inizia un nuovo conteggio
        haptic(12);
      } else {
        lastTapTime = now; lastTapX = x; lastTapY = y;
      }
    }
    // Pointer Events
    function onLookPointerDown(e){
      if (!isTouch || !document.body.classList.contains('fp')) return;
      if (isPointInJoystick(e.clientX, e.clientY)) return;
      if (e.target !== renderer.domElement) return;
      e.preventDefault();
      if (lookActive) {
        lookMultiTouch = true; // secondo dito sul canvas: non è un tap
      } else {
        lookMultiTouch = false;
        lookStartX = e.clientX; lookStartY = e.clientY;
        lookStartTime = performance.now();
      }
      lookActive = true;
      lookPointerId = e.pointerId ?? null;
      lastLX = e.clientX; lastLY = e.clientY;
    }
    function onLookPointerMove(e){
      if (!lookActive) return;
      if (lookPointerId != null && e.pointerId !== lookPointerId) return;
      e.preventDefault();
      const dx = e.clientX - lastLX;
      const dy = e.clientY - lastLY;
      lastLX = e.clientX; lastLY = e.clientY;
      applyLookDelta(dx, dy);
    }
    function onLookPointerUp(e){
      if (!lookActive) return;
      if (lookPointerId != null && e.pointerId !== lookPointerId) return;
      e.preventDefault();
      lookActive = false; lookPointerId = null;
      registerLookTap(e.clientX, e.clientY, e.type === 'pointercancel');
    }
    // Touch Events
    function onLookTouchStart(e){
      if (!isTouch || !document.body.classList.contains('fp')) return;
      if (!e.touches || e.touches.length === 0) return;
      if (e.target !== renderer.domElement) return;
      const t = e.touches[0];
      if (isPointInJoystick(t.clientX, t.clientY)) return;
      e.preventDefault();
      if (e.touches.length > 1) {
        lookMultiTouch = true;
      } else if (!lookActive) {
        // Fallback per browser senza Pointer Events (altrimenti lo fa onLookPointerDown)
        lookMultiTouch = false;
        lookStartX = t.clientX; lookStartY = t.clientY;
        lookStartTime = performance.now();
      }
      lookActive = true;
      lastLX = t.clientX; lastLY = t.clientY;
    }
    function onLookTouchMove(e){
      if (!lookActive) return;
      if (!e.touches || e.touches.length === 0) return;
      const t = e.touches[0];
      e.preventDefault();
      const dx = t.clientX - lastLX;
      const dy = t.clientY - lastLY;
      lastLX = t.clientX; lastLY = t.clientY;
      applyLookDelta(dx, dy);
    }
    function onLookTouchEnd(e){
      if (!lookActive) return;
      lookActive = false;
      const t = e && e.changedTouches && e.changedTouches[0];
      if (t) registerLookTap(t.clientX, t.clientY, e.type === 'touchcancel');
    }

    // Tasti (shortcut globali h/i)
    const onGlobalKeyDown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'h' || e.key === 'H') {
        if (helpOverlay.style.display === 'flex') {
          hideHelp();
        } else {
          showFPHelp(true);
        }
      } else if (e.key === 'i' || e.key === 'I') {
        if (infoOverlay.style.display === 'flex') {
          releaseModalFocus(infoOverlay);
          infoOverlay.style.display = 'none';
        } else {
          infoOverlay.style.display = 'flex';
          trapModalFocus(infoOverlay);
        }
      }
    };
    eventManager.add(window, 'keydown', onGlobalKeyDown, false, 'ui');


    function onKeyDown(e){
      if (renderer?.xr?.isPresenting) return;
      const tag = e.target.tagName;
      // When pointer lock is active, allow all keys even if an input has DOM focus
      // (this can happen when releaseModalFocus restores focus to the FP toggle checkbox)
      if (!fpControls?.isLocked && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return;
      if ((e.key === 'r' || e.key === 'R') && currentModel) { e.preventDefault(); resetToInitialView(500); }
      if ((e.key === 'm' || e.key === 'M') && currentModel && !isFP) { e.preventDefault(); toggleMeasureMode(); }
      if ((e.key === 'p' || e.key === 'P')) {
        if (!isTouch && fpControls.isLocked) {
          fpControls.unlock();
          enterFPToggle.checked = false; enterFPToggle.setAttribute('aria-checked','false'); updateFPUI();
        } else {
          enterFPToggle.checked = true; enterFPToggle.setAttribute('aria-checked','true'); updateFPUI();
          startFP(true);
        }
      }
      switch (e.code) {
          case 'KeyW': moveForward = true; break;
    case 'KeyS': moveBackward = true; break;
    case 'KeyA': moveLeft = true; break;
    case 'KeyD': moveRight = true; break;
    case 'ShiftLeft':
    case 'ShiftRight': boost = true; break;
      }
    }
    function onKeyUp(e){
      if (renderer?.xr?.isPresenting) return;
      switch (e.code) {
       case 'KeyW': moveForward = false; break;
    case 'KeyS': moveBackward = false; break;
    case 'KeyA': moveLeft = false; break;
    case 'KeyD': moveRight = false; break;
    case 'ShiftLeft':
    case 'ShiftRight': boost = false; break;
      }
    }

    /**
     * Update the cache status indicator dot in the footer
     */
    async function updateCacheStatus() {
        const dot = document.getElementById('cache-status-dot');
        if (!dot) return;

        // Check if Service Worker is supported and registered
        if (!('serviceWorker' in navigator)) {
            dot.classList.add('error');
            dot.title = 'Service Worker non supportato';
            return;
        }

        try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (!registration) {
                dot.title = 'Cache non attiva';
                return;
            }

            // Check if Cache API is available
            if (!('caches' in window)) {
                dot.classList.add('error');
                dot.title = 'Cache API non disponibile';
                return;
            }

            // Check cache status
            const cacheNames = await caches.keys();
            if (cacheNames.length > 0) {
                // Check if there are cached items
                let totalCachedItems = 0;
                for (const cacheName of cacheNames) {
                    const cache = await caches.open(cacheName);
                    const keys = await cache.keys();
                    totalCachedItems += keys.length;
                }

                if (totalCachedItems > 10) {
                    dot.classList.add('active');
                    dot.title = `Cache attiva (${totalCachedItems} file)`;
                } else if (totalCachedItems > 0) {
                    dot.classList.add('partial');
                    dot.title = `Cache parziale (${totalCachedItems} file)`;
                } else {
                    dot.title = 'Cache vuota';
                }
            } else {
                dot.title = 'Cache non inizializzata';
            }
        } catch (error) {
            console.warn('Errore nel controllo stato cache:', error);
            dot.classList.add('error');
            dot.title = 'Errore nel controllo cache';
        }
    }
