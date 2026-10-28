// 3D Cave Viewer — utility condivise del viewer (funzioni pure e helper autonomi)

// Use pointer: coarse media query to reliably detect touch-primary devices.
// navigator.maxTouchPoints > 0 is NOT sufficient because modern desktop browsers
// (e.g. Chrome on Windows) can report maxTouchPoints >= 1 even without a touch screen,
// causing the mobile joystick to appear and WASD movement to break on desktop.
export const isTouch = window.matchMedia
  ? window.matchMedia('(pointer: coarse)').matches
  : (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));

// Layout "telefono": schermi stretti, e telefoni in orizzontale (puntatore
// touch e altezza ridotta), dove la toolbar desktop non entra. Deve restare
// identica alle media query di css/viewer.css.
export const SMALL_SCREEN_QUERY = '(max-width: 640px), (pointer: coarse) and (max-height: 500px)';
export function isSmallScreen() {
  return window.matchMedia ? window.matchMedia(SMALL_SCREEN_QUERY).matches : window.innerWidth <= 640;
}

// Helper per ottenere traduzione con fallback (window.t è esposto da i18n.js)
export const _t = (key, fallback) => {
  if (window.t) {
    const translated = window.t(key);
    if (translated && translated !== key) return translated;
  }
  return fallback;
};

// Debounce utility per ottimizzare eventi frequenti come resize
export function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function showToast(text, duration = 1500) {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.style.display = 'none'; }, duration);
}

// Feedback aptico breve sui dispositivi touch (no-op dove non supportato, es. iOS)
export function haptic(pattern = 10) {
  if (!isTouch || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch (e) { /* ignora */ }
}

/**
 * Toggle di un popover con gestione aria-expanded
 * @param {HTMLElement} popover - L'elemento popover
 * @param {HTMLElement} toggle - Il pulsante toggle
 * @param {boolean} show - Se mostrare (true) o nascondere (false), se undefined fa toggle
 * @returns {boolean} - Lo stato finale (true = aperto)
 */
export function togglePopover(popover, toggle, show) {
  if (!popover || !toggle) return false;
  const isOpen = popover.style.display === 'block';
  const shouldShow = show !== undefined ? show : !isOpen;

  popover.style.display = shouldShow ? 'block' : 'none';
  toggle.setAttribute('aria-expanded', shouldShow ? 'true' : 'false');

  return shouldShow;
}

/**
 * Rimuove un oggetto Three.js dalla scena e dispone tutte le sue risorse
 * @param {THREE.Object3D} obj - L'oggetto da rimuovere e disporre
 * @param {Object} options - Opzioni aggiuntive
 * @param {boolean} options.disposeMaterials - Se disporre i materiali (default: true)
 * @param {boolean} options.disposeGeometries - Se disporre le geometrie (default: true)
 * @param {boolean} options.disposeTextures - Se disporre le textures (default: true)
 */
export function disposeThreeObject(obj, options = {}) {
  if (!obj) return;
  const { disposeMaterials = true, disposeGeometries = true, disposeTextures = true } = options;

  // Rimuovi dal parent
  if (obj.parent) obj.parent.remove(obj);

  // Traverse e disponi risorse
  obj.traverse(child => {
    if (disposeGeometries && child.geometry) {
      if (child.geometry.boundsTree && typeof child.geometry.disposeBoundsTree === 'function') {
        child.geometry.disposeBoundsTree();
      }
      child.geometry.dispose();
    }
    if (disposeMaterials && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(mat => {
        if (!mat) return;
        if (disposeTextures) {
          // Disponi tutte le texture associate al materiale
          for (const key in mat) {
            const value = mat[key];
            if (value && value.isTexture) {
              value.dispose();
              // dispose() libera solo la GPU: la ImageBitmap decodificata
              // (64 MB per una 4096²) aspetterebbe il garbage collector, e
              // passando da un modello grande all'altro resterebbero vive
              // entrambe. Il modello viene buttato, quindi chiuderla è sicuro.
              const data = value.source?.data;
              if (data && typeof data.close === 'function') {
                try { data.close(); } catch { /* già chiusa */ }
              }
            }
          }
        }
        mat.dispose();
      });
    }
  });
}

/**
 * Dispone un array di oggetti Three.js
 * @param {THREE.Object3D[]} objects - Array di oggetti da disporre
 * @param {Object} options - Opzioni per disposeThreeObject
 */
export function disposeThreeObjects(objects, options = {}) {
  if (!objects || !Array.isArray(objects)) return;
  objects.forEach(obj => disposeThreeObject(obj, options));
}

/**
 * Ripristina il colore originale di un oggetto salvato in userData
 * @param {THREE.Object3D} obj - L'oggetto di cui ripristinare il colore
 */
export function restoreOriginalColor(obj) {
  if (!obj) return;
  obj.traverse(child => {
    if (child.material && child.userData.originalColor !== undefined) {
      child.material.color.setHex(child.userData.originalColor);
    }
  });
}

// ======= EVENT MANAGER =======
// Gestisce i listener con cleanup automatico per prevenire memory leak
export const eventManager = {
  _listeners: [],

  /**
   * Aggiunge un event listener e lo traccia per cleanup successivo
   * @param {EventTarget} target - L'elemento su cui aggiungere il listener
   * @param {string} type - Il tipo di evento
   * @param {Function} handler - La funzione handler
   * @param {Object|boolean} options - Opzioni del listener
   * @param {string} group - Gruppo opzionale per cleanup selettivo
   */
  add(target, type, handler, options = false, group = 'default') {
    if (!target || !type || !handler) return;
    target.addEventListener(type, handler, options);
    this._listeners.push({ target, type, handler, options, group });
  },

  /**
   * Rimuove tutti i listener di un gruppo specifico
   * @param {string} group - Il gruppo di listener da rimuovere
   */
  removeGroup(group) {
    this._listeners = this._listeners.filter(l => {
      if (l.group === group) {
        l.target.removeEventListener(l.type, l.handler, l.options);
        return false;
      }
      return true;
    });
  },

  /**
   * Rimuove tutti i listener tracciati
   */
  removeAll() {
    this._listeners.forEach(l => {
      l.target.removeEventListener(l.type, l.handler, l.options);
    });
    this._listeners = [];
  },

  /**
   * Rimuove i listener associati a un target specifico
   * @param {EventTarget} target - L'elemento di cui rimuovere i listener
   */
  removeByTarget(target) {
    this._listeners = this._listeners.filter(l => {
      if (l.target === target) {
        l.target.removeEventListener(l.type, l.handler, l.options);
        return false;
      }
      return true;
    });
  }
};

// ======= FORMATTAZIONE NUMERI =======

export function niceNumber(x) {
  if (!isFinite(x) || x <= 0) return 1;
  const e = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, e);
  let nf;
  if (f < 1.5) nf = 1;
  else if (f < 3.5) nf = 2;
  else if (f < 7.5) nf = 5;
  else { nf = 1; return nf * Math.pow(10, e + 1); }
  return nf * Math.pow(10, e);
}

export function formatUnits(v) { return (Math.round(v * 1000) / 1000).toString(); }

// Formatta bytes in formato leggibile (KB, MB)
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
