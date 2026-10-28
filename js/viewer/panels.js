// 3D Cave Viewer — framework pannelli flottanti / bottom-sheet mobile.
// I pannelli si registrano con registerPanel(panel, closeFn): le funzioni
// anyPanelOpen/closeOtherPanelsMobile/placePanel operano sul registro, così
// un nuovo pannello si integra senza modificare questo modulo.

import { isSmallScreen, haptic, _t } from './utils.js';
import { panelBackdrop, panelMiniBar, panelMiniIcon, panelMiniLabel } from './dom.js';

// Registro dei pannelli: { panel: HTMLElement, close: Function }
const panelRegistry = [];

let minimizedPanel = null; // { panel } quando un pannello è ridotto a mini-bar

/**
 * Registra un pannello flottante nel framework.
 * @param {HTMLElement} panel - L'elemento del pannello
 * @param {Function} close - Funzione che chiude il pannello (toggle inclusi)
 */
export function registerPanel(panel, close) {
  if (!panel || typeof close !== 'function') return;
  panelRegistry.push({ panel, close });
}

export function showPanelBackdrop() {
  if (panelBackdrop) panelBackdrop.classList.add('visible');
}

export function hidePanelBackdrop() {
  if (panelBackdrop) panelBackdrop.classList.remove('visible');
}

export function anyPanelOpen() {
  return panelRegistry.some(({ panel }) => panel.style.display === 'block');
}

export function minimizePanelMobile(panel, labelText, iconText) {
  if (!isSmallScreen() || !panelMiniBar) return;
  // Scarta eventuale altro pannello già minimizzato
  if (minimizedPanel && minimizedPanel.panel !== panel) {
    minimizedPanel.panel.style.display = 'none';
    minimizedPanel = null;
  }
  panel.style.display = 'none';
  hidePanelBackdrop();
  minimizedPanel = { panel };
  if (panelMiniIcon) panelMiniIcon.textContent = iconText;
  if (panelMiniLabel) panelMiniLabel.textContent = labelText;
  panelMiniBar.classList.add('visible');
  panelMiniBar.setAttribute('aria-hidden', 'false');
  panelMiniBar.removeAttribute('tabindex');
  panelMiniBar.setAttribute(
    'aria-label',
    _t('common.restorePanel', 'Ripristina') + ' ' + labelText
  );
  haptic(8);
}

export function restoreMinimizedPanel() {
  if (!minimizedPanel || !panelMiniBar) return;
  minimizedPanel.panel.style.display = 'block';
  panelMiniBar.classList.remove('visible');
  panelMiniBar.setAttribute('aria-hidden', 'true');
  panelMiniBar.setAttribute('tabindex', '-1');
  showPanelBackdrop();
  minimizedPanel = null;
  haptic(8);
}

export function clearMinimizedState(panel) {
  if (minimizedPanel && minimizedPanel.panel === panel) {
    minimizedPanel = null;
    if (panelMiniBar) {
      panelMiniBar.classList.remove('visible');
      panelMiniBar.setAttribute('aria-hidden', 'true');
      panelMiniBar.setAttribute('tabindex', '-1');
    }
  }
}

// Chiude tutti i pannelli aperti o minimizzati tranne quello specificato (solo mobile)
export function closeOtherPanelsMobile(exceptPanel) {
  if (!isSmallScreen()) return;
  // Rimuovi pill se si riferisce a un pannello diverso
  if (minimizedPanel && minimizedPanel.panel !== exceptPanel) {
    minimizedPanel.panel.style.display = 'none';
    minimizedPanel = null;
    if (panelMiniBar) panelMiniBar.classList.remove('visible');
  }
  panelRegistry.forEach(({ panel, close }) => {
    if (panel !== exceptPanel && panel.style.display === 'block') close();
  });
}

// Resetta posizione pannello (rimuove inline styles dal drag)
export function resetPanelPosition(panel) {
  if (!panel) return;
  panel.style.left = '';
  panel.style.top = '';
  panel.style.right = '';
  panel.style.bottom = '';
}

// On desktop, place a panel below all currently open panels instead of overlapping them.
// On mobile the bottom-sheet layout takes over via CSS, so we just reset.
export function placePanel(panel) {
  if (!panel) return;
  panel.style.left = '';
  panel.style.bottom = '';
  if (isSmallScreen()) {
    panel.style.top = '';
    panel.style.right = '';
    return;
  }
  const GAP = 10;
  const DEFAULT_TOP = 100;
  const RIGHT = 20;
  let maxBottom = 0;
  panelRegistry.forEach(({ panel: p }) => {
    if (p && p !== panel && p.offsetHeight > 0) {
      const rect = p.getBoundingClientRect();
      if (rect.bottom > maxBottom) maxBottom = rect.bottom;
    }
  });
  panel.style.top = (maxBottom > 0 ? maxBottom + GAP : DEFAULT_TOP) + 'px';
  panel.style.right = RIGHT + 'px';
}

// Drag generico per pannelli flottanti (ottimizzato con rAF)
export function initPanelDrag(panel, header, closeBtn) {
  if (!header || !panel) return;

  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragRAF = null;
  let pendingX = 0;
  let pendingY = 0;
  let cachedWidth = 0;
  let cachedHeight = 0;

  function startDrag(e) {
    if (closeBtn && e.target === closeBtn) return;
    if (isSmallScreen()) return; // Bottom sheet su mobile: nessun drag libero
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    const rect = panel.getBoundingClientRect();
    cachedWidth = rect.width;
    cachedHeight = rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragOffsetX = clientX - rect.left;
    dragOffsetY = clientY - rect.top;
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', stopDrag);
  }

  function drag(e) {
    if (!dragging) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Calcola posizione senza leggere dal DOM
    pendingX = Math.max(0, Math.min(clientX - dragOffsetX, window.innerWidth - cachedWidth));
    pendingY = Math.max(0, Math.min(clientY - dragOffsetY, window.innerHeight - cachedHeight));

    // Usa requestAnimationFrame per batch degli aggiornamenti DOM
    if (!dragRAF) {
      dragRAF = requestAnimationFrame(() => {
        panel.style.left = pendingX + 'px';
        panel.style.top = pendingY + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        dragRAF = null;
      });
    }
  }

  function stopDrag() {
    dragging = false;
    if (dragRAF) {
      cancelAnimationFrame(dragRAF);
      dragRAF = null;
    }
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', drag);
    document.removeEventListener('touchend', stopDrag);
  }

  header.addEventListener('mousedown', startDrag);
  header.addEventListener('touchstart', startDrag, { passive: false });

  // Swipe-to-dismiss su mobile (bottom sheet): trascina header verso il basso per chiudere
  initBottomSheetSwipe(panel, header, closeBtn);
}

// Swipe verticale verso il basso sull'header del bottom sheet → chiude il pannello.
// Soglia: 25% dell'altezza del pannello o velocità >0.6 px/ms.
export function initBottomSheetSwipe(panel, header, closeBtn) {
  if (!header || !panel) return;
  let startY = 0;
  let startTime = 0;
  let currentDY = 0;
  let active = false;
  let panelHeight = 0;

  function onStart(e) {
    if (!isSmallScreen()) return;
    // Ignora se il touch parte da un bottone dell'header
    const t = e.target;
    if (t && (t.closest('.floating-panel-close') || t.closest('.floating-panel-minimize'))) return;
    if (!e.touches || e.touches.length !== 1) return;
    active = true;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    currentDY = 0;
    panelHeight = panel.getBoundingClientRect().height || 1;
    panel.style.transition = 'none';
  }

  function onMove(e) {
    if (!active) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) {
      // Resistenza per swipe verso l'alto (non vogliamo permetterlo)
      currentDY = Math.max(dy / 4, -16);
    } else {
      currentDY = dy;
      e.preventDefault();
    }
    panel.style.transform = `translateY(${currentDY}px)`;
  }

  function onEnd() {
    if (!active) return;
    active = false;
    const dt = Math.max(1, Date.now() - startTime);
    const velocity = currentDY / dt; // px/ms
    const shouldClose = currentDY > panelHeight * 0.25 || velocity > 0.6;
    panel.style.transition = 'transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)';
    if (shouldClose) {
      haptic(8);
      panel.style.transform = `translateY(${panelHeight}px)`;
      // Aspetta la fine dell'animazione poi delega al close esistente
      setTimeout(() => {
        panel.style.transition = '';
        panel.style.transform = '';
        if (closeBtn) closeBtn.click();
      }, 180);
    } else {
      panel.style.transform = '';
      setTimeout(() => { panel.style.transition = ''; }, 200);
    }
  }

  header.addEventListener('touchstart', onStart, { passive: true });
  header.addEventListener('touchmove', onMove, { passive: false });
  header.addEventListener('touchend', onEnd);
  header.addEventListener('touchcancel', onEnd);
}

// Swipe verso l'alto sulla pill → ripristina il pannello minimizzato (il tap resta attivo)
export function initMiniBarSwipe(bar) {
  if (!bar) return;
  let startY = 0;
  let startTime = 0;
  let currentDY = 0;
  let active = false;
  let swiped = false;

  function onStart(e) {
    if (!e.touches || e.touches.length !== 1) return;
    active = true;
    swiped = false;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    currentDY = 0;
    bar.style.transition = 'none';
  }

  function onMove(e) {
    if (!active) return;
    const dy = e.touches[0].clientY - startY;
    if (dy < 0) {
      // Segui il dito verso l'alto (max -24px)
      currentDY = Math.max(dy, -24);
      e.preventDefault();
    } else {
      currentDY = 0;
    }
    bar.style.transform = `translateX(-50%) translateY(${currentDY}px)`;
  }

  function onEnd() {
    if (!active) return;
    active = false;
    const dt = Math.max(1, Date.now() - startTime);
    const velocity = -currentDY / dt; // px/ms verso l'alto
    const shouldRestore = currentDY < -20 || velocity > 0.6;
    bar.style.transition = '';
    bar.style.transform = '';
    if (shouldRestore) {
      swiped = true;
      restoreMinimizedPanel();
      // Il click sintetico potrebbe non arrivare: resetta comunque il flag
      setTimeout(() => { swiped = false; }, 400);
    }
  }

  bar.addEventListener('touchstart', onStart, { passive: true });
  bar.addEventListener('touchmove', onMove, { passive: false });
  bar.addEventListener('touchend', onEnd);
  bar.addEventListener('touchcancel', onEnd);
  // Evita il doppio ripristino (swipe + click sintetico)
  bar.addEventListener('click', (e) => {
    if (swiped) { swiped = false; e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
}

/* ===== Utility: binding "tap-friendly" ai bottoni ===== */
export function multiBindClose(btn, handler) {
  ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(type => {
    btn.addEventListener(type, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (type === 'click' || type === 'pointerup' || type === 'touchend') handler();
    }, { passive: false });
  });
}
