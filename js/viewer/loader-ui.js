// 3D Cave Viewer — overlay di caricamento modello (barra progresso, stato errore, watchdog)

import { formatBytes, _t } from './utils.js';
import {
  overlay, overlayFill, overlayPct, overlayName, overlayStatusText,
  overlayStatusIcon, overlayFileSize, overlayErrorMessage, loaderErrorBox
} from './dom.js';

// Watchdog: mostra errore se il caricamento resta fermo troppo a lungo
let loaderWatchdog = null;
const LOADER_WATCHDOG_MS = 60000;

// Mostra loader con opzioni avanzate
export function showLoader(pct = 0, options = {}) {
  const { loaded = 0, total = 0, isProcessing = false, isIndeterminate = false } = options;

  overlay.style.display = 'flex';
  overlay.classList.remove('error');
  // L'attributo hidden garantisce che il blocco errore resti nascosto
  // anche se il client ha in cache una versione di viewer.css priva
  // della regola .loader-error { display: none }
  if (loaderErrorBox) loaderErrorBox.hidden = true;
  overlay.classList.toggle('processing', isProcessing);
  overlay.classList.toggle('indeterminate', isIndeterminate);

  // Aggiorna barra di progresso
  if (!isIndeterminate) {
    overlayFill.style.width = pct + '%';
    overlayPct.textContent = pct + '%';
  } else {
    overlayPct.textContent = '—';
  }

  // Aggiorna stato (download/processing)
  if (overlayStatusText) {
    const downloadText = overlayStatusText.dataset.downloading || 'Download in corso...';
    const processingText = overlayStatusText.dataset.processing || 'Elaborazione...';
    overlayStatusText.textContent = isProcessing ? processingText : downloadText;
  }
  if (overlayStatusIcon) {
    overlayStatusIcon.textContent = isProcessing ? '⚙' : '⬇';
  }

  // Mostra dimensione file se disponibile
  if (overlayFileSize) {
    if (total > 0 && !isProcessing) {
      overlayFileSize.textContent = `${formatBytes(loaded)} / ${formatBytes(total)}`;
    } else if (loaded > 0 && !isProcessing) {
      overlayFileSize.textContent = formatBytes(loaded);
    } else {
      overlayFileSize.textContent = '';
    }
  }
}

// L'overlay sta mostrando un errore: il LoadingManager segnala comunque "tutto
// caricato" quando l'ultimo item termina, anche se quell'item è fallito, e
// senza questo controllo il messaggio sparirebbe appena comparso.
export function isLoaderError() {
  return overlay.classList.contains('error');
}

export function hideLoader() {
  if (isLoaderError()) return;
  clearLoaderWatchdog();
  showLoader(100, { isProcessing: false });
  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.classList.remove('processing', 'indeterminate', 'error');
    overlayFill.style.width = '0%';
    overlayPct.textContent = '0%';
    overlayName.textContent = '—';
    if (overlayFileSize) overlayFileSize.textContent = '';
  }, 300);
}

// Trasforma l'overlay di caricamento in stato errore (messaggio + Riprova)
export function showLoaderError(message) {
  clearLoaderWatchdog();
  overlay.style.display = 'flex';
  overlay.classList.remove('processing', 'indeterminate');
  overlay.classList.add('error');
  if (loaderErrorBox) loaderErrorBox.hidden = false;
  if (overlayErrorMessage) {
    overlayErrorMessage.textContent = message || _t('loader.errorGeneric', 'Si è verificato un errore durante il caricamento del modello.');
  }
}

// Sceglie il messaggio in base al tipo di errore (memoria vs rete/HTTP vs elaborazione).
// fetchBinaryModel() marca i propri errori con err.code; per tutto il resto si
// ricade sull'analisi del messaggio.
export function modelLoadErrorMessage(err) {
  const code = err?.code;
  if (code === 'memory') {
    return _t('loader.errorMemory', 'Il modello è troppo grande per la memoria di questo dispositivo. Chiudi le altre schede e riprova.');
  }
  if (code === 'http' || code === 'truncated') {
    return _t('loader.errorNetwork', 'Impossibile scaricare il modello. Controlla la connessione e riprova.');
  }

  const msg = String(err?.message || err || '');
  // Chrome/Safari segnalano così l'allocazione fallita di un ArrayBuffer grande
  if (err instanceof RangeError || /out of memory|allocation failed|array buffer allocation/i.test(msg)) {
    return _t('loader.errorMemory', 'Il modello è troppo grande per la memoria di questo dispositivo. Chiudi le altre schede e riprova.');
  }
  if (/fetch|network|404|403|500|http|failed to load/i.test(msg)) {
    return _t('loader.errorNetwork', 'Impossibile scaricare il modello. Controlla la connessione e riprova.');
  }
  return _t('loader.errorGeneric', 'Si è verificato un errore durante il caricamento del modello.');
}

export function resetLoaderWatchdog() {
  clearTimeout(loaderWatchdog);
  loaderWatchdog = setTimeout(() => {
    showLoaderError(_t('loader.errorNetwork', 'Impossibile scaricare il modello. Controlla la connessione e riprova.'));
  }, LOADER_WATCHDOG_MS);
}

export function clearLoaderWatchdog() {
  clearTimeout(loaderWatchdog);
  loaderWatchdog = null;
}
