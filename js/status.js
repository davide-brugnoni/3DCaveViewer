// Cache name will be detected automatically from service worker
let CACHE_NAME = null;

// Core assets - fetched dynamically from service worker file
let CORE_ASSETS = [];

// Consenso al pre-download dei modelli 3D (stessa chiave di pwa-register.js)
const MODELS_CONSENT_KEY = 'pwa-models-download-consent';

function setModelsConsent(value) {
  try {
    if (value === null) {
      localStorage.removeItem(MODELS_CONSENT_KEY);
    } else {
      localStorage.setItem(MODELS_CONSENT_KEY, value);
    }
  } catch {
    // localStorage non disponibile (es. navigazione privata)
  }
  updateModelsConsentUI();
}

function getModelsConsentState() {
  try {
    const value = localStorage.getItem(MODELS_CONSENT_KEY);
    if (value === 'granted') return 'granted';
    if (value && value.startsWith('denied:')) return 'denied';
  } catch {}
  return 'ask';
}

// Traduzione con fallback (window.t è definito da js/i18n.js)
function trStatus(key, fallback) {
  return (typeof window.t === 'function') ? window.t(key, fallback) : fallback;
}

function updateModelsConsentUI() {
  const stateEl = document.getElementById('models-consent-state');
  const toggleBtn = document.getElementById('models-consent-toggle');
  if (!stateEl) return;

  const consent = getModelsConsentState();
  const labels = {
    granted: trStatus('status.modelsConsentOn', 'attivo'),
    denied: trStatus('status.modelsConsentOff', 'disattivato'),
    ask: trStatus('status.modelsConsentAsk', 'da chiedere')
  };
  stateEl.textContent = labels[consent];

  if (toggleBtn) {
    toggleBtn.textContent = consent === 'granted'
      ? trStatus('status.modelsConsentDisable', 'disattiva')
      : trStatus('status.modelsConsentEnable', 'attiva');
  }
}

// ============================================================================
// DOWNLOAD MANAGER - Gestione avanzata dei download
// ============================================================================
class DownloadManager {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 5; // Download paralleli
    this.maxRetries = options.maxRetries || 3;   // Tentativi per file
    this.retryDelay = options.retryDelay || 1000; // Delay base in ms
    this.timeout = options.timeout || 120000;    // Timeout per file (2 minuti default)

    // Stato interno
    this.queue = [];
    this.activeDownloads = new Map();
    this.completed = [];
    this.failed = [];
    this.isRunning = false;
    this.isCancelled = false;
    this.isPaused = false;

    // Statistiche
    this.stats = {
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      totalBytes: 0,
      downloadedBytes: 0,
      startTime: null,
      currentFile: null,
      speed: 0, // bytes/sec
      estimatedTimeRemaining: 0
    };

    // Callbacks
    this.onProgress = options.onProgress || (() => {});
    this.onFileStart = options.onFileStart || (() => {});
    this.onFileComplete = options.onFileComplete || (() => {});
    this.onFileFailed = options.onFileFailed || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onCancelled = options.onCancelled || (() => {});

    // Cache reference
    this.cache = null;

    // Speed calculation
    this.speedSamples = [];
    this.lastSpeedUpdate = 0;
  }

  // Priorità file: core > modelli > esterni > altri
  getPriority(url) {
    if (url.includes('.php') || url.includes('manifest.json')) return 1;
    if (url.includes('.js') || url.includes('.css')) return 2;
    if (url.includes('modelli/') || url.endsWith('.glb') || url.endsWith('.gltf')) return 3;
    if (url.includes('unpkg.com') || url.includes('googleapis.com')) return 4;
    return 5;
  }

  // Ordina la coda per priorità
  sortQueue() {
    this.queue.sort((a, b) => this.getPriority(a.url) - this.getPriority(b.url));
  }

  // Aggiungi file alla coda
  addToQueue(assets) {
    const newItems = assets.map(url => ({
      url: normalizeAsset(url),
      retries: 0,
      status: 'pending'
    }));
    this.queue.push(...newItems);
    this.stats.totalFiles = this.queue.length + this.completed.length;
    this.sortQueue();
  }

  // Calcola velocità media
  updateSpeed(bytesDownloaded, duration) {
    if (duration <= 0) return;

    const speed = bytesDownloaded / (duration / 1000);
    this.speedSamples.push(speed);

    // Mantieni solo gli ultimi 10 campioni
    if (this.speedSamples.length > 10) {
      this.speedSamples.shift();
    }

    // Media mobile
    this.stats.speed = this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length;

    // Stima tempo rimanente
    const remainingBytes = this.stats.totalBytes - this.stats.downloadedBytes;
    if (this.stats.speed > 0) {
      this.stats.estimatedTimeRemaining = Math.ceil(remainingBytes / this.stats.speed);
    }
  }

  // Formatta tempo rimanente
  formatTimeRemaining(seconds) {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return '—';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }

  // Formatta velocità
  formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '—';
    if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
  }

  // Fetch con timeout per gestire file grandi
  async fetchWithTimeout(request, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(request, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Timeout: download troppo lento');
      }
      throw error;
    }
  }

  // Download singolo file con retry
  async downloadFile(item) {
    const startTime = Date.now();
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (this.isCancelled) {
        throw new Error('Download annullato');
      }

      while (this.isPaused) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (this.isCancelled) throw new Error('Download annullato');
      }

      try {
        this.stats.currentFile = getAssetFileName(item.url);
        this.onFileStart(item.url, attempt);

        // Verifica se già in cache
        const existing = await this.cache.match(item.url);
        if (existing) {
          const size = await this.getResponseSize(existing);
          return { success: true, size, cached: true };
        }

        // Download con fetch e timeout
        const isSameOrigin = item.url.startsWith(window.location.origin);
        const request = isSameOrigin
          ? item.url
          : new Request(item.url, { mode: 'no-cors' });

        // Timeout dinamico: file grandi stimati in base all'estensione
        const isLargeFile = /\.(glb|gltf|obj|zip|pdf)$/i.test(item.url);
        const fileTimeout = isLargeFile ? this.timeout * 3 : this.timeout; // 6 min per file grandi

        const response = await this.fetchWithTimeout(request, fileTimeout);

        if (!response.ok && isSameOrigin) {
          throw new Error(`HTTP ${response.status}`);
        }

        // Niente clone(): il ramo non letto di un clone resta in memoria per
        // intero, e con più modelli da 100 MB in parallelo il telefono
        // chiude la scheda. La dimensione si legge prima dagli header.
        const size = Number(response.headers.get('Content-Length')) || 0;
        await this.cache.put(item.url, response);
        const duration = Date.now() - startTime;
        this.updateSpeed(size, duration);

        return { success: true, size, cached: false };

      } catch (error) {
        lastError = error;

        if (attempt < this.maxRetries && !this.isCancelled) {
          // Backoff esponenziale: 1s, 2s, 4s
          const delay = this.retryDelay * Math.pow(2, attempt);
          console.warn(`Retry ${attempt + 1}/${this.maxRetries} per ${item.url} tra ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Download fallito');
  }

  // Ottieni dimensione response
  async getResponseSize(response) {
    const contentLength = response.headers.get('Content-Length');
    if (contentLength) {
      return parseInt(contentLength, 10) || 0;
    }
    // Un blob() su un modello senza Content-Length lo caricherebbe tutto in
    // memoria solo per misurarlo
    if (/\.(glb|gltf|obj|bin)$/i.test(response.url || '')) return 0;
    try {
      const blob = await response.clone().blob();
      return blob.size;
    } catch {
      return 0;
    }
  }

  // Worker per processare la coda
  async worker(workerId) {
    while (this.queue.length > 0 && !this.isCancelled) {
      const item = this.queue.shift();
      if (!item) break;

      this.activeDownloads.set(workerId, item);

      try {
        const result = await this.downloadFile(item);

        this.completed.push(item.url);
        this.stats.completedFiles++;
        this.stats.downloadedBytes += result.size;
        state.failedAssets.delete(item.url);

        this.onFileComplete(item.url, result);

      } catch (error) {
        if (!this.isCancelled) {
          this.failed.push({ url: item.url, error: error.message });
          this.stats.failedFiles++;
          state.failedAssets.add(item.url);

          this.onFileFailed(item.url, error);
        }
      } finally {
        this.activeDownloads.delete(workerId);
        this.emitProgress();
      }
    }
  }

  // Emetti evento progresso
  emitProgress() {
    const progress = {
      completed: this.stats.completedFiles,
      failed: this.stats.failedFiles,
      total: this.stats.totalFiles,
      percent: this.stats.totalFiles > 0
        ? Math.round((this.stats.completedFiles / this.stats.totalFiles) * 100)
        : 0,
      currentFile: this.stats.currentFile,
      speed: this.stats.speed,
      speedFormatted: this.formatSpeed(this.stats.speed),
      timeRemaining: this.stats.estimatedTimeRemaining,
      timeRemainingFormatted: this.formatTimeRemaining(this.stats.estimatedTimeRemaining),
      downloadedBytes: this.stats.downloadedBytes,
      activeDownloads: Array.from(this.activeDownloads.values()).map(i => i.url)
    };

    this.onProgress(progress);
  }

  // Avvia i download
  async start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.isCancelled = false;
    this.isPaused = false;
    this.stats.startTime = Date.now();

    try {
      this.cache = await caches.open(CACHE_NAME);

      // Stima dimensione totale (basata su tipo file)
      this.stats.totalBytes = this.queue.reduce((total, item) => {
        const isLargeFile = /\.(glb|gltf|obj)$/i.test(item.url);
        const isMediumFile = /\.(jpg|jpeg|png|webp|pdf)$/i.test(item.url);
        if (isLargeFile) return total + 5000000;  // ~5MB per modelli 3D
        if (isMediumFile) return total + 200000;  // ~200KB per immagini
        return total + 50000;                     // ~50KB per altri file
      }, 0);

      // Avvia worker paralleli
      const workers = [];
      for (let i = 0; i < Math.min(this.concurrency, this.queue.length); i++) {
        workers.push(this.worker(i));
      }

      await Promise.all(workers);

      if (!this.isCancelled) {
        this.onComplete({
          completed: this.completed.length,
          failed: this.failed.length,
          total: this.stats.totalFiles
        });
      }

    } finally {
      this.isRunning = false;
      this.stats.currentFile = null;
    }
  }

  // Metti in pausa
  pause() {
    this.isPaused = true;
  }

  // Riprendi
  resume() {
    this.isPaused = false;
  }

  // Annulla tutti i download
  cancel() {
    this.isCancelled = true;
    this.queue = [];
    this.activeDownloads.clear();
    this.onCancelled();
  }

  // Reset stato
  reset() {
    this.queue = [];
    this.completed = [];
    this.failed = [];
    this.activeDownloads.clear();
    this.isRunning = false;
    this.isCancelled = false;
    this.isPaused = false;
    this.speedSamples = [];
    this.stats = {
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      totalBytes: 0,
      downloadedBytes: 0,
      startTime: null,
      currentFile: null,
      speed: 0,
      estimatedTimeRemaining: 0
    };
  }
}

// Istanza globale del DownloadManager
let downloadManager = null;

// ============================================================================

// Detect active cache name from caches API
async function detectCacheName() {
  if (!('caches' in window)) {
    console.warn('Cache API non supportata');
    return null;
  }

  try {
    const keys = await caches.keys();
    // Find the most recent pwa-offline-v* cache
    const pwaCaches = keys.filter(k => k.startsWith('pwa-offline-v'));
    if (pwaCaches.length > 0) {
      // Sort to get the latest version
      pwaCaches.sort((a, b) => {
        const vA = parseInt(a.replace('pwa-offline-v', '')) || 0;
        const vB = parseInt(b.replace('pwa-offline-v', '')) || 0;
        return vB - vA;
      });
      return pwaCaches[0];
    }
  } catch (error) {
    console.warn('Errore nel rilevamento cache:', error);
  }

  return null;
}

// Fetch and parse service worker to extract assets list
async function fetchServiceWorkerAssets() {
  try {
    const response = await fetch('js/pwa-service-worker.js', { cache: 'no-store' });
    if (!response.ok) throw new Error('Service worker non trovato');

    const text = await response.text();

    // Extract CACHE_VERSION
    const versionMatch = text.match(/const\s+CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (versionMatch) {
      CACHE_NAME = versionMatch[1];
    }

    // Extract LOCAL_ASSETS array
    const localMatch = text.match(/const\s+LOCAL_ASSETS\s*=\s*\[([\s\S]*?)\];/);
    const localAssets = localMatch ? parseAssetArray(localMatch[1]) : [];

    // Extract EXTERNAL_ASSETS array
    const externalMatch = text.match(/const\s+EXTERNAL_ASSETS\s*=\s*\[([\s\S]*?)\];/);
    const externalAssets = externalMatch ? parseAssetArray(externalMatch[1]) : [];

    CORE_ASSETS = [...localAssets, ...externalAssets];

    console.log(`Cache rilevata: ${CACHE_NAME}, ${CORE_ASSETS.length} asset core`);
  } catch (error) {
    console.warn('Errore parsing service worker:', error);
    // Fallback: detect from caches API
    CACHE_NAME = await detectCacheName();
  }
}

// Parse asset array from JS source
function parseAssetArray(arrayContent) {
  const assets = [];
  // Match strings in quotes (both single and double)
  const regex = /['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(arrayContent)) !== null) {
    // Skip comments
    if (!match[1].startsWith('//')) {
      assets.push(match[1]);
    }
  }
  return assets;
}

// LocalStorage keys
const STORAGE_KEYS = {
  filter: 'caveviewer_status_filter',
  sort: 'caveviewer_status_sort',
  lastSync: 'caveviewer_last_sync',
  celebrationShown: 'caveviewer_celebration_shown'
};

// State management
const state = {
  assets: [],
  selectedAssets: new Set(),
  currentFilter: localStorage.getItem(STORAGE_KEYS.filter) || 'all',
  currentSort: localStorage.getItem(STORAGE_KEYS.sort) || 'name-asc',
  searchTerm: '',
  failedAssets: new Set(),
  lastSyncTime: localStorage.getItem(STORAGE_KEYS.lastSync) || null,
  originalTitle: document.title
};

// DOM elements
const els = {
  totalCount: document.getElementById('total-count'),
  totalSize: document.getElementById('total-size'),
  completionPercent: document.getElementById('completion-percent'),
  storageQuota: document.getElementById('storage-quota'),
  progressBar: document.getElementById('progress-bar'),
  progressBarBg: document.querySelector('.progress-bar-bg'),
  progressPercentage: document.getElementById('progress-percentage'),
  progressText: document.getElementById('progress-text'),
  progressDetails: document.getElementById('progress-details'),
  statusMessage: document.getElementById('status-message'),
  assetGroups: document.getElementById('asset-groups'),
  searchInput: document.getElementById('search-input'),
  refreshBtn: document.getElementById('refresh'),
  downloadBtn: document.getElementById('download'),
  clearCacheBtn: document.getElementById('clear-cache'),
  retryFailedBtn: document.getElementById('retry-failed'),
  selectAllBtn: document.getElementById('select-all'),
  downloadSelectedBtn: document.getElementById('download-selected'),
  deleteSelectedBtn: document.getElementById('delete-selected'),
  loadingOverlay: document.getElementById('loading-overlay'),
  loadingStatus: document.getElementById('loading-status'),
  filterTabs: document.querySelectorAll('.filter-tab'),
  sortSelect: document.getElementById('sort-select'),
  syncInfo: document.getElementById('sync-info'),
  lastSyncText: document.getElementById('last-sync-text'),
  cacheVersion: document.getElementById('cache-version'),
  scrollTopBtn: document.getElementById('scroll-top'),
  celebrationOverlay: document.getElementById('celebration-overlay'),
  // Nuovi elementi per download avanzato
  downloadDetails: document.getElementById('download-details'),
  currentFile: document.getElementById('current-file'),
  downloadSpeed: document.getElementById('download-speed'),
  timeRemaining: document.getElementById('time-remaining'),
  activeDownloads: document.getElementById('active-downloads'),
  pauseDownloadBtn: document.getElementById('pause-download'),
  cancelDownloadBtn: document.getElementById('cancel-download')
};

// Utility functions
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[index]}`;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'mai';

  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'pochi secondi fa';
  if (minutes < 60) return `${minutes} minut${minutes === 1 ? 'o' : 'i'} fa`;
  if (hours < 24) return `${hours} or${hours === 1 ? 'a' : 'e'} fa`;
  if (days < 7) return `${days} giorn${days === 1 ? 'o' : 'i'} fa`;

  const date = new Date(timestamp);
  return date.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function updatePageTitle(cachedCount, totalCount) {
  if (totalCount === 0) {
    document.title = state.originalTitle;
    return;
  }

  const percent = Math.round((cachedCount / totalCount) * 100);
  document.title = `(${percent}%) ${state.originalTitle}`;
}

function updateLastSync() {
  const now = Date.now();
  state.lastSyncTime = now;
  localStorage.setItem(STORAGE_KEYS.lastSync, now.toString());

  if (els.lastSyncText) {
    els.lastSyncText.textContent = `Ultima sincronizzazione: ${formatRelativeTime(now)}`;
  }
  if (els.syncInfo) {
    els.syncInfo.classList.add('synced');
  }
}

function displayLastSync() {
  if (els.lastSyncText && state.lastSyncTime) {
    els.lastSyncText.textContent = `Ultima sincronizzazione: ${formatRelativeTime(parseInt(state.lastSyncTime))}`;
  }
}

function displayCacheVersion() {
  if (els.cacheVersion && CACHE_NAME) {
    // Extract version number from cache name (e.g., 'pwa-offline-v9' -> 'v9')
    const version = CACHE_NAME.replace('pwa-offline-', '');
    const strong = document.createElement('strong');
    strong.textContent = version;
    els.cacheVersion.replaceChildren('Cache: ', strong);
    els.cacheVersion.title = `Nome completo: ${CACHE_NAME}`;
  }
}

function sortAssets(assets) {
  const sorted = [...assets];

  switch (state.currentSort) {
    case 'name-asc':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name-desc':
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'size-asc':
      sorted.sort((a, b) => a.size - b.size);
      break;
    case 'size-desc':
      sorted.sort((a, b) => b.size - a.size);
      break;
    case 'status':
      const statusOrder = { 'cached': 0, 'missing': 1, 'failed': 2 };
      sorted.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
      break;
  }

  return sorted;
}

function triggerCelebration() {
  if (!els.celebrationOverlay) return;

  // Create confetti
  const colors = ['#3fb950', '#0696af', '#1ebfd7', '#d29922', '#f85149', '#fff'];
  const shapes = ['circle', 'square', 'ribbon'];
  const confettiCount = 100;

  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    confetti.className = `confetti ${shapes[Math.floor(Math.random() * shapes.length)]}`;
    confetti.style.left = `${Math.random() * 100}%`;
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animationDelay = `${Math.random() * 0.5}s`;
    confetti.style.animationDuration = `${2 + Math.random() * 2}s`;

    els.celebrationOverlay.appendChild(confetti);
  }

  // Add pulse effect to stats card
  const statsCard = document.querySelector('.card');
  if (statsCard) {
    statsCard.classList.add('celebration-pulse');
    setTimeout(() => statsCard.classList.remove('celebration-pulse'), 600);
  }

  // Clean up confetti after animation
  setTimeout(() => {
    els.celebrationOverlay.replaceChildren();
  }, 4000);
}

function checkAndCelebrate(cachedCount, totalCount) {
  if (cachedCount === totalCount && totalCount > 0) {
    const lastCelebration = localStorage.getItem(STORAGE_KEYS.celebrationShown);
    const cacheKey = `${CACHE_NAME}-${totalCount}`;

    // Only celebrate once per cache version
    if (lastCelebration !== cacheKey) {
      localStorage.setItem(STORAGE_KEYS.celebrationShown, cacheKey);
      setTimeout(triggerCelebration, 500);
    }
  }
}

function handleScroll() {
  if (!els.scrollTopBtn) return;

  if (window.scrollY > 300) {
    els.scrollTopBtn.classList.add('visible');
  } else {
    els.scrollTopBtn.classList.remove('visible');
  }
}

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function updateRetryButtonVisibility() {
  if (!els.retryFailedBtn) return;

  const failedCount = state.assets.filter(a => a.status === 'failed' || a.status === 'missing').length;
  els.retryFailedBtn.style.display = failedCount > 0 ? 'inline-flex' : 'none';
}

async function retryFailedAssets() {
  const failedAssets = state.assets.filter(a => a.status === 'failed' || a.status === 'missing');

  if (failedAssets.length === 0) {
    showMessage('Nessun file da riprovare.', 'info');
    return;
  }

  if (!confirm(`Vuoi riprovare il download di ${failedAssets.length} file falliti/mancanti?`)) return;

  setButtonsDisabled(true);
  const assets = failedAssets.map(a => a.url);

  try {
    // Usa DownloadManager con più tentativi per i retry
    downloadManager = new DownloadManager({
      concurrency: 3, // Meno paralleli per i retry
      maxRetries: 5,  // Più tentativi
      retryDelay: 2000, // Delay più lungo

      onProgress: (progress) => {
        updateDownloadUI(progress);
      },

      onComplete: async (result) => {
        hideDownloadDetails();
        setButtonsDisabled(false);

        if (result.failed === 0) {
          showMessage(`✅ Tutti i ${result.completed} file sono stati scaricati con successo!`, 'success');
        } else if (result.completed > 0) {
          showMessage(`${result.completed} file scaricati, ${result.failed} ancora falliti.`, 'warning');
        } else {
          showMessage('Nessun file scaricato. Controlla la connessione.', 'error');
        }

        await loadAssets();
      },

      onCancelled: () => {
        hideDownloadDetails();
        setButtonsDisabled(false);
        showMessage('Retry annullato.', 'info');
      }
    });

    downloadManager.addToQueue(assets);
    showDownloadDetails();
    await downloadManager.start();

  } catch (error) {
    hideDownloadDetails();
    setButtonsDisabled(false);
    showMessage(`Errore durante il retry: ${error.message}`, 'error');
  }
}

function normalizeAsset(asset) {
  try {
    return new URL(asset, window.location.href).toString();
  } catch (error) {
    return asset;
  }
}

function getAssetIcon(url) {
  const ext = url.split('.').pop().toLowerCase();
  const icons = {
    'php': '🐘',
    'js': '📜',
    'css': '🎨',
    'jpg': '🖼️',
    'png': '🖼️',
    'json': '📋',
    'glb': '🗿',
    'gltf': '🗿',
    'obj': '🗿',
    'mtl': '🎨',
    'html': '📄'
  };
  if (url.includes('font')) return '🔤';
  if (url.includes('three')) return '📦';
  if (url.includes('leaflet')) return '🗺️';
  return icons[ext] || '📄';
}

function getAssetCategory(url) {
  if (url.includes('unpkg.com') || url.includes('googleapis.com') || url.includes('gstatic.com')) {
    return 'Librerie Esterne';
  }
  if (url.includes('modelli/') || url.endsWith('.glb') || url.endsWith('.gltf') || url.endsWith('.obj')) {
    return 'Modelli 3D';
  }
  if (url.includes('.php') || url.includes('.js') || url.includes('.css') || url.includes('manifest.json')) {
    return 'Core Application';
  }
  return 'Altri Asset';
}

function getAssetFileName(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const parts = path.split('/');
    return parts[parts.length - 1] || urlObj.hostname;
  } catch {
    return url.split('/').pop() || url;
  }
}

function showMessage(message, type = 'info') {
  els.statusMessage.className = `status-message ${type}`;
  els.statusMessage.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
    <span>${message}</span>
  `;
  els.statusMessage.style.display = 'flex';

  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      els.statusMessage.style.display = 'none';
    }, 5000);
  }
}

function updateProgress(current, total, message = '') {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  els.progressBar.style.width = `${percent}%`;
  els.progressPercentage.textContent = `${percent}%`;

  // Update ARIA attributes for accessibility
  if (els.progressBarBg) {
    els.progressBarBg.setAttribute('aria-valuenow', percent);
  }

  if (message) {
    els.progressText.textContent = message;
  }

  if (total > 0) {
    els.progressDetails.textContent = `${current} / ${total}`;
  }
}

function setButtonsDisabled(disabled) {
  els.refreshBtn.disabled = disabled;
  els.downloadBtn.disabled = disabled;
  els.clearCacheBtn.disabled = disabled;
}

function hideLoadingOverlay() {
  if (els.loadingOverlay) {
    els.loadingOverlay.classList.add('hidden');
  }
}

function updateLoadingStatus(message) {
  if (els.loadingStatus) {
    els.loadingStatus.textContent = message;
  }
}

async function getModelAssets() {
  try {
    const response = await fetch('api/catalogo_assets.php', { cache: 'no-store' });
    if (!response.ok) throw new Error('Errore nel caricamento dell\'elenco asset.');
    const data = await response.json();
    if (!data || typeof data !== 'object' || !Array.isArray(data.assets)) {
      throw new Error('Formato elenco asset non valido.');
    }
    // Supporta sia il vecchio formato (array di stringhe) che il nuovo (array di oggetti)
    return data.assets.map(asset => typeof asset === 'string' ? asset : asset.path);
  } catch (error) {
    if (!('caches' in window)) throw error;
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match('api/catalogo_assets.php');
    if (!cached) throw error;
    const data = await cached.json();
    if (!data || typeof data !== 'object' || !Array.isArray(data.assets)) throw error;
    // Supporta sia il vecchio formato che il nuovo anche per la cache
    return data.assets.map(asset => typeof asset === 'string' ? asset : asset.path);
  }
}

async function getAllAssets() {
  const modelAssets = await getModelAssets();
  const combined = [...CORE_ASSETS, ...modelAssets];
  const unique = new Set(combined.map(normalizeAsset));
  return Array.from(unique);
}

async function getStorageQuota() {
  if (!navigator.storage || !navigator.storage.estimate) {
    return { usage: 0, quota: 0 };
  }
  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0
    };
  } catch {
    return { usage: 0, quota: 0 };
  }
}

async function addToCache(cache, asset) {
  const assetUrl = normalizeAsset(asset);
  const isSameOrigin = assetUrl.startsWith(window.location.origin);
  const request = isSameOrigin ? assetUrl : new Request(assetUrl, { mode: 'no-cors' });
  await cache.add(request);
}

async function analyzeAsset(cache, asset) {
  try {
    const match = await cache.match(asset);
    const status = match ? 'cached' : (state.failedAssets.has(asset) ? 'failed' : 'missing');

    let size = 0;
    if (match) {
      // Prova prima Content-Length header, più veloce di blob()
      const contentLength = match.headers.get('Content-Length');
      if (contentLength) {
        size = parseInt(contentLength, 10) || 0;
      } else if (!/\.(glb|gltf|obj|bin)$/i.test(asset)) {
        // Fallback a blob() solo se necessario, mai sui modelli: leggerebbe
        // in memoria l'intero file solo per misurarlo
        const blob = await match.blob();
        size = blob.size;
      }
    }

    return {
      url: asset,
      name: getAssetFileName(asset),
      category: getAssetCategory(asset),
      icon: getAssetIcon(asset),
      size,
      status
    };
  } catch (error) {
    console.warn('Errore analisi asset:', asset, error);
    return {
      url: asset,
      name: getAssetFileName(asset),
      category: getAssetCategory(asset),
      icon: getAssetIcon(asset),
      size: 0,
      status: 'failed'
    };
  }
}

async function loadAssets() {
  setButtonsDisabled(true);
  els.assetGroups.innerHTML = '<div class="skeleton" style="height: 200px; margin: 20px;"></div>';
  updateProgress(0, 100, 'Caricamento asset...');
  updateLoadingStatus('Rilevamento versione cache...');

  // Timeout di sicurezza per nascondere l'overlay dopo 10 secondi
  const safetyTimeout = setTimeout(() => {
    hideLoadingOverlay();
  }, 10000);

  if (!('caches' in window)) {
    showMessage('Cache Storage non supportata in questo browser.', 'error');
    setButtonsDisabled(false);
    clearTimeout(safetyTimeout);
    hideLoadingOverlay();
    return;
  }

  try {
    // Initialize cache name and core assets from service worker
    if (!CACHE_NAME || CORE_ASSETS.length === 0) {
      updateLoadingStatus('Rilevamento configurazione service worker...');
      await fetchServiceWorkerAssets();

      // Fallback: detect from existing caches
      if (!CACHE_NAME) {
        CACHE_NAME = await detectCacheName();
      }

      if (!CACHE_NAME) {
        throw new Error('Impossibile rilevare la versione della cache. Service Worker non installato?');
      }

      // Display cache version in UI
      displayCacheVersion();
    }

    updateLoadingStatus('Recupero elenco asset...');
    const allAssets = await getAllAssets();
    updateLoadingStatus('Apertura cache...');

    // Esegui in parallelo apertura cache e quota storage
    const [cache, storageInfo] = await Promise.all([
      caches.open(CACHE_NAME),
      getStorageQuota()
    ]);

    updateLoadingStatus('Analisi file in parallelo...');
    updateProgress(0, allAssets.length, 'Analisi file in corso...');

    // Analizza tutti gli asset in parallelo (batch per non sovraccaricare)
    const BATCH_SIZE = 20;
    const assetData = [];

    for (let i = 0; i < allAssets.length; i += BATCH_SIZE) {
      const batch = allAssets.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(asset => analyzeAsset(cache, asset))
      );
      assetData.push(...batchResults);

      const progress = Math.min(i + BATCH_SIZE, allAssets.length);
      updateProgress(progress, allAssets.length, 'Analisi file in corso...');
      updateLoadingStatus(`Analizzati ${progress} di ${allAssets.length} file...`);
    }

    // Calcola statistiche
    let totalBytes = 0;
    let cachedCount = 0;
    assetData.forEach(asset => {
      if (asset.status === 'cached') {
        totalBytes += asset.size;
        cachedCount++;
      }
    });

    state.assets = assetData;

    // Update statistics
    const completionPercent = allAssets.length > 0 ? Math.round((cachedCount / allAssets.length) * 100) : 0;
    els.totalCount.textContent = `${cachedCount} / ${allAssets.length}`;
    els.totalSize.textContent = formatBytes(totalBytes);
    els.completionPercent.textContent = `${completionPercent}%`;

    if (storageInfo.quota > 0) {
      const quotaUsed = storageInfo.usage;
      const quotaTotal = storageInfo.quota;
      const quotaPercent = Math.round((quotaUsed / quotaTotal) * 100);
      els.storageQuota.textContent = `${formatBytes(quotaUsed)} / ${formatBytes(quotaTotal)} (${quotaPercent}%)`;
    } else {
      els.storageQuota.textContent = 'N/D';
    }

    updateProgress(cachedCount, allAssets.length, cachedCount === allAssets.length ? 'Cache completa' : 'Cache parziale');
    renderAssets();

    // Update page title with completion badge
    updatePageTitle(cachedCount, allAssets.length);

    // Update last sync time
    updateLastSync();

    // Update retry button visibility
    updateRetryButtonVisibility();

    // Check for celebration (100% complete)
    checkAndCelebrate(cachedCount, allAssets.length);

    if (cachedCount === 0) {
      showMessage('Nessun file in cache. Usa "Scarica tutto" per salvare i file offline.', 'info');
    } else if (cachedCount === allAssets.length) {
      showMessage(`Tutti i ${cachedCount} file sono stati salvati offline con successo!`, 'success');
    } else {
      showMessage(`${cachedCount} su ${allAssets.length} file in cache. Mancano ${allAssets.length - cachedCount} file.`, 'warning');
    }

  } catch (error) {
    showMessage(`Errore durante il caricamento: ${error.message}`, 'error');
    els.assetGroups.replaceChildren(createEmptyListMessage('Impossibile caricare i dati della cache.'));
  } finally {
    clearTimeout(safetyTimeout);
    setButtonsDisabled(false);
    hideLoadingOverlay();
  }
}

function createEmptyListMessage(text) {
  const p = document.createElement('p');
  p.style.cssText = 'text-align: center; padding: 40px; color: var(--text-muted);';
  p.textContent = text;
  return p;
}

function filterAssets() {
  return state.assets.filter(asset => {
    // Filter by status
    if (state.currentFilter !== 'all' && asset.status !== state.currentFilter) {
      return false;
    }

    // Filter by search term
    if (state.searchTerm) {
      const searchLower = state.searchTerm.toLowerCase();
      return asset.name.toLowerCase().includes(searchLower) ||
             asset.url.toLowerCase().includes(searchLower) ||
             asset.category.toLowerCase().includes(searchLower);
    }

    return true;
  });
}

function renderAssets() {
  const filteredAssets = filterAssets();

  if (filteredAssets.length === 0) {
    els.assetGroups.replaceChildren(createEmptyListMessage('Nessun file trovato con i filtri selezionati.'));
    return;
  }

  // Sort assets
  const sortedAssets = sortAssets(filteredAssets);

  // Group assets by category
  const grouped = {};
  sortedAssets.forEach(asset => {
    if (!grouped[asset.category]) {
      grouped[asset.category] = [];
    }
    grouped[asset.category].push(asset);
  });

  // Render groups
  let html = '';
  const categoryOrder = ['Core Application', 'Modelli 3D', 'Librerie Esterne', 'Altri Asset'];

  categoryOrder.forEach(category => {
    if (!grouped[category]) return;

    const assets = grouped[category];
    const cachedCount = assets.filter(a => a.status === 'cached').length;

    const groupId = `group-${category.toLowerCase().replace(/\s+/g, '-')}`;
    html += `
      <div class="asset-group" role="region" aria-labelledby="${groupId}-header">
        <div class="group-header" id="${groupId}-header" onclick="toggleGroup(this)" tabindex="0" role="button" aria-expanded="true" aria-controls="${groupId}-list" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleGroup(this);}">
          <span class="group-title">${category}</span>
          <span class="group-badge" aria-label="${cachedCount} di ${assets.length} file in cache">${cachedCount} / ${assets.length}</span>
        </div>
        <ul class="asset-list" id="${groupId}-list" role="list">
          ${assets.map((asset, idx) => `
            <li class="asset-item" data-url="${escapeHtml(asset.url)}" data-status="${asset.status}" role="listitem">
              <input type="checkbox" class="asset-checkbox" data-url="${escapeHtml(asset.url)}" data-status="${asset.status}"
                     id="checkbox-${groupId}-${idx}"
                     aria-label="Seleziona ${escapeHtml(asset.name)}">
              <span class="asset-icon" aria-hidden="true">${asset.icon}</span>
              <div class="asset-info">
                <div class="asset-name" title="${escapeHtml(asset.url)}">${escapeHtml(asset.name)}</div>
                <div class="asset-url">${escapeHtml(asset.url)}</div>
              </div>
              <span class="asset-size" aria-label="Dimensione: ${formatBytes(asset.size)}">${formatBytes(asset.size)}</span>
              <span class="asset-status ${asset.status}" role="status">
                ${asset.status === 'cached' ? '<span aria-hidden="true">✅</span> In cache' : asset.status === 'failed' ? '<span aria-hidden="true">❌</span> Errore' : '<span aria-hidden="true">⚠️</span> Mancante'}
              </span>
              <div class="asset-actions">
                ${asset.status !== 'cached' ?
                  `<button type="button" class="asset-btn" onclick="downloadAsset('${escapeHtml(asset.url)}')" aria-label="Scarica ${escapeHtml(asset.name)}"><span aria-hidden="true">⬇️</span></button>` :
                  `<button type="button" class="asset-btn secondary" onclick="deleteAsset('${escapeHtml(asset.url)}')" aria-label="Elimina ${escapeHtml(asset.name)} dalla cache"><span aria-hidden="true">🗑️</span></button>`
                }
              </div>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  });

  els.assetGroups.innerHTML = html;

  // Add checkbox event listeners
  document.querySelectorAll('.asset-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleCheckboxChange);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleCheckboxChange(e) {
  const url = e.target.dataset.url;
  if (e.target.checked) {
    state.selectedAssets.add(url);
  } else {
    state.selectedAssets.delete(url);
  }
  updateSelectionButtons();
}

function updateSelectionButtons() {
  const hasSelection = state.selectedAssets.size > 0;

  // Conta file selezionati per stato
  let cachedCount = 0;
  let missingCount = 0;
  state.selectedAssets.forEach(url => {
    const asset = state.assets.find(a => a.url === url);
    if (asset) {
      if (asset.status === 'cached') cachedCount++;
      else missingCount++;
    }
  });

  // Abilita/disabilita pulsanti in base allo stato dei file selezionati
  els.downloadSelectedBtn.disabled = missingCount === 0;
  els.deleteSelectedBtn.disabled = cachedCount === 0;

  // Aggiorna testo pulsanti con conteggio
  if (missingCount > 0) {
    els.downloadSelectedBtn.innerHTML = `<span aria-hidden="true">⬇️</span> Scarica (${missingCount})`;
  } else {
    els.downloadSelectedBtn.innerHTML = '<span aria-hidden="true">⬇️</span> Scarica selezionati';
  }

  if (cachedCount > 0) {
    els.deleteSelectedBtn.innerHTML = `<span aria-hidden="true">🗑️</span> Elimina (${cachedCount})`;
  } else {
    els.deleteSelectedBtn.innerHTML = '<span aria-hidden="true">🗑️</span> Elimina selezionati';
  }

  els.selectAllBtn.innerHTML = hasSelection
    ? '<span aria-hidden="true">☐</span> Deseleziona tutti'
    : '<span aria-hidden="true">☑️</span> Seleziona tutti';
  els.selectAllBtn.setAttribute('aria-pressed', hasSelection ? 'true' : 'false');
}

function toggleGroup(header) {
  const list = header.nextElementSibling;
  const isExpanded = list.style.display !== 'none';

  if (isExpanded) {
    list.style.display = 'none';
    header.style.opacity = '0.7';
    header.setAttribute('aria-expanded', 'false');
  } else {
    list.style.display = 'block';
    header.style.opacity = '1';
    header.setAttribute('aria-expanded', 'true');
  }
}

async function downloadAsset(url) {
  try {
    showMessage(`Download in corso: ${getAssetFileName(url)}...`, 'info');
    const cache = await caches.open(CACHE_NAME);
    await addToCache(cache, url);
    state.failedAssets.delete(url);
    showMessage(`✅ Download completato: ${getAssetFileName(url)}`, 'success');
    await loadAssets();
  } catch (error) {
    state.failedAssets.add(url);
    showMessage(`❌ Errore download: ${getAssetFileName(url)} - ${error.message}`, 'error');
    await loadAssets();
  }
}

async function deleteAsset(url) {
  if (!confirm(`Vuoi eliminare "${getAssetFileName(url)}" dalla cache?`)) return;

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(url);
    showMessage(`🗑️ File eliminato: ${getAssetFileName(url)}`, 'success');
    await loadAssets();
  } catch (error) {
    showMessage(`❌ Errore eliminazione: ${error.message}`, 'error');
  }
}

// Event listeners
els.refreshBtn.addEventListener('click', loadAssets);

// Funzioni per gestione UI download avanzato
function showDownloadDetails() {
  if (els.downloadDetails) {
    els.downloadDetails.style.display = 'block';
    els.downloadDetails.classList.remove('paused');
  }
  if (els.progressBar) {
    els.progressBar.classList.add('downloading');
  }
}

function hideDownloadDetails() {
  if (els.downloadDetails) {
    els.downloadDetails.style.display = 'none';
  }
  if (els.progressBar) {
    els.progressBar.classList.remove('downloading');
  }
}

function updateDownloadUI(progress) {
  // Aggiorna progress bar principale
  updateProgress(progress.completed, progress.total, `Download in corso... ${progress.failed > 0 ? `(${progress.failed} errori)` : ''}`);

  // Aggiorna pannello dettagli
  if (els.currentFile) {
    els.currentFile.textContent = progress.currentFile || '—';
    els.currentFile.title = progress.currentFile || '';
  }
  if (els.downloadSpeed) {
    els.downloadSpeed.textContent = progress.speedFormatted;
    els.downloadSpeed.classList.toggle('pulsing', progress.speed > 0);
  }
  if (els.timeRemaining) {
    els.timeRemaining.textContent = progress.timeRemainingFormatted;
  }
  if (els.activeDownloads) {
    els.activeDownloads.textContent = progress.activeDownloads.length;
  }
}

function createDownloadManager(assets, onComplete) {
  downloadManager = new DownloadManager({
    // 3 invece di 5: su telefono più download paralleli di modelli grandi
    // passano tutti dal service worker e si sommano in memoria
    concurrency: 3,
    maxRetries: 3,
    retryDelay: 1000,

    onProgress: (progress) => {
      updateDownloadUI(progress);
    },

    onFileStart: (url, attempt) => {
      if (attempt > 0) {
        console.log(`Retry ${attempt} per ${getAssetFileName(url)}`);
      }
    },

    onFileComplete: (url, result) => {
      console.log(`✓ ${getAssetFileName(url)} ${result.cached ? '(già in cache)' : ''}`);
    },

    onFileFailed: (url, error) => {
      console.warn(`✗ ${getAssetFileName(url)}: ${error.message}`);
    },

    onComplete: (result) => {
      hideDownloadDetails();
      setButtonsDisabled(false);

      // Sincronizzazione incrementale, non CACHE_ALL: quella forzata
      // riscaricava da capo ogni modello appena salvato da questa pagina.
      // Il worker riconosce i file già presenti e ne registra solo la versione.
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CACHE_MODELS', force: false });
      }

      if (result.failed > 0) {
        showMessage(`Download completato: ${result.completed} file OK, ${result.failed} errori su ${result.total} file.`, 'warning');
      } else {
        showMessage(`✅ Tutti i ${result.completed} file sono stati scaricati con successo!`, 'success');
      }

      if (onComplete) onComplete(result);
    },

    onCancelled: () => {
      hideDownloadDetails();
      setButtonsDisabled(false);
      showMessage('Download annullato.', 'info');
    }
  });

  // Filtra solo gli asset non già in cache
  const assetsToDownload = assets.filter(url => {
    const asset = state.assets.find(a => a.url === url);
    return !asset || asset.status !== 'cached';
  });

  downloadManager.addToQueue(assetsToDownload);
  return downloadManager;
}

els.downloadBtn.addEventListener('click', async () => {
  if (!confirm('Vuoi scaricare tutti i file per l\'uso offline? Questa operazione potrebbe richiedere alcuni minuti.')) return;

  // Un download completo esplicito vale come consenso al pre-download dei modelli
  setModelsConsent('granted');

  setButtonsDisabled(true);
  updateProgress(0, 100, 'Preparazione download...');

  try {
    const assets = await getAllAssets();

    // Crea e avvia il DownloadManager
    createDownloadManager(assets, async () => {
      await loadAssets();
    });

    showDownloadDetails();
    await downloadManager.start();

  } catch (error) {
    hideDownloadDetails();
    setButtonsDisabled(false);
    showMessage(`Errore durante il download: ${error.message}`, 'error');
  }
});

els.clearCacheBtn.addEventListener('click', async () => {
  if (!confirm('Sei sicuro di voler svuotare completamente la cache? Tutti i file scaricati offline verranno eliminati.')) return;

  setButtonsDisabled(true);
  updateProgress(0, 100, 'Pulizia cache in corso...');

  try {
    if ('caches' in window) {
      await caches.delete(CACHE_NAME);
    }
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
    }
    state.failedAssets.clear();
    // Azzera il consenso: alla prossima visita l'app chiederà di nuovo
    setModelsConsent(null);
    showMessage('🗑️ Cache svuotata con successo.', 'success');
  } catch (error) {
    showMessage(`Errore durante la pulizia della cache: ${error.message}`, 'error');
  } finally {
    setButtonsDisabled(false);
    await loadAssets();
  }
});

els.selectAllBtn.addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('.asset-checkbox:not(:disabled)');
  const shouldSelect = state.selectedAssets.size === 0;

  checkboxes.forEach(checkbox => {
    checkbox.checked = shouldSelect;
    const url = checkbox.dataset.url;
    if (shouldSelect) {
      state.selectedAssets.add(url);
    } else {
      state.selectedAssets.delete(url);
    }
  });

  updateSelectionButtons();
});

els.downloadSelectedBtn.addEventListener('click', async () => {
  if (state.selectedAssets.size === 0) return;

  // Filtra solo i file non in cache
  const assetsToDownload = Array.from(state.selectedAssets).filter(url => {
    const asset = state.assets.find(a => a.url === url);
    return asset && asset.status !== 'cached';
  });

  if (assetsToDownload.length === 0) {
    showMessage('Tutti i file selezionati sono già in cache.', 'info');
    return;
  }

  if (!confirm(`Vuoi scaricare ${assetsToDownload.length} file mancanti?`)) return;

  setButtonsDisabled(true);
  const assets = assetsToDownload;

  try {
    createDownloadManager(assets, async () => {
      state.selectedAssets.clear();
      await loadAssets();
    });

    showDownloadDetails();
    await downloadManager.start();

  } catch (error) {
    hideDownloadDetails();
    setButtonsDisabled(false);
    showMessage(`Errore durante il download: ${error.message}`, 'error');
  }
});

els.deleteSelectedBtn.addEventListener('click', async () => {
  if (state.selectedAssets.size === 0) return;

  // Filtra solo i file in cache
  const assetsToDelete = Array.from(state.selectedAssets).filter(url => {
    const asset = state.assets.find(a => a.url === url);
    return asset && asset.status === 'cached';
  });

  if (assetsToDelete.length === 0) {
    showMessage('Nessuno dei file selezionati è in cache.', 'info');
    return;
  }

  if (!confirm(`Sei sicuro di voler eliminare ${assetsToDelete.length} file dalla cache?`)) return;

  setButtonsDisabled(true);
  const assets = assetsToDelete;
  let deleted = 0;

  try {
    const cache = await caches.open(CACHE_NAME);

    for (const asset of assets) {
      try {
        await cache.delete(asset);
        deleted++;
        updateProgress(deleted, assets.length, 'Eliminazione in corso...');
      } catch (error) {
        console.warn('Errore eliminazione:', asset, error);
      }
    }

    showMessage(`🗑️ ${deleted} file eliminati dalla cache.`, 'success');
    state.selectedAssets.clear();
  } catch (error) {
    showMessage(`Errore durante l'eliminazione: ${error.message}`, 'error');
  } finally {
    setButtonsDisabled(false);
    await loadAssets();
  }
});

els.searchInput.addEventListener('input', (e) => {
  state.searchTerm = e.target.value;
  renderAssets();
});

// Filter tabs with accessibility support and localStorage persistence
function activateFilterTab(tab) {
  els.filterTabs.forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
    t.setAttribute('tabindex', '-1');
  });
  tab.classList.add('active');
  tab.setAttribute('aria-selected', 'true');
  tab.setAttribute('tabindex', '0');
  tab.focus();
  state.currentFilter = tab.dataset.filter;
  localStorage.setItem(STORAGE_KEYS.filter, state.currentFilter);
  renderAssets();
}

els.filterTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateFilterTab(tab));

  // Keyboard navigation for tabs (arrow keys)
  tab.addEventListener('keydown', (e) => {
    let targetIndex = index;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      targetIndex = (index + 1) % els.filterTabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      targetIndex = (index - 1 + els.filterTabs.length) % els.filterTabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIndex = els.filterTabs.length - 1;
    } else {
      return;
    }

    activateFilterTab(els.filterTabs[targetIndex]);
  });
});

// Sort select event listener
if (els.sortSelect) {
  // Restore saved sort preference
  els.sortSelect.value = state.currentSort;

  els.sortSelect.addEventListener('change', (e) => {
    state.currentSort = e.target.value;
    localStorage.setItem(STORAGE_KEYS.sort, state.currentSort);
    renderAssets();
  });
}

// Scroll to top button
if (els.scrollTopBtn) {
  els.scrollTopBtn.addEventListener('click', scrollToTop);
}

// Scroll event for showing/hiding scroll-to-top button
window.addEventListener('scroll', handleScroll, { passive: true });

// Retry failed button
if (els.retryFailedBtn) {
  els.retryFailedBtn.addEventListener('click', retryFailedAssets);
}

// Pause download button
if (els.pauseDownloadBtn) {
  els.pauseDownloadBtn.addEventListener('click', () => {
    if (!downloadManager) return;

    if (downloadManager.isPaused) {
      downloadManager.resume();
      els.pauseDownloadBtn.innerHTML = '<span class="icon" aria-hidden="true">⏸️</span> Pausa';
      els.downloadDetails.classList.remove('paused');
      showMessage('Download ripreso.', 'info');
    } else {
      downloadManager.pause();
      els.pauseDownloadBtn.innerHTML = '<span class="icon" aria-hidden="true">▶️</span> Riprendi';
      els.downloadDetails.classList.add('paused');
      showMessage('Download in pausa.', 'info');
    }
  });
}

// Cancel download button
if (els.cancelDownloadBtn) {
  els.cancelDownloadBtn.addEventListener('click', () => {
    if (!downloadManager) return;

    if (confirm('Sei sicuro di voler annullare il download in corso?')) {
      downloadManager.cancel();
      // Il resto viene gestito dal callback onCancelled
    }
  });
}

// Restore saved filter preference on page load
function restoreSavedPreferences() {
  // Restore filter tab
  if (state.currentFilter !== 'all') {
    const savedTab = document.querySelector(`.filter-tab[data-filter="${state.currentFilter}"]`);
    if (savedTab) {
      els.filterTabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
        t.setAttribute('tabindex', '-1');
      });
      savedTab.classList.add('active');
      savedTab.setAttribute('aria-selected', 'true');
      savedTab.setAttribute('tabindex', '0');
    }
  }

  // Display last sync time
  displayLastSync();
}

// Toggle consenso download automatico modelli
const modelsConsentToggleBtn = document.getElementById('models-consent-toggle');
if (modelsConsentToggleBtn) {
  modelsConsentToggleBtn.addEventListener('click', () => {
    if (getModelsConsentState() === 'granted') {
      setModelsConsent('denied:' + Date.now());
      showMessage(trStatus('status.modelsConsentOffMsg', 'Download automatico dei modelli disattivato.'), 'info');
    } else {
      setModelsConsent('granted');
      if (navigator.serviceWorker?.controller) {
        // force:false → scarica solo i modelli mancanti o modificati
        navigator.serviceWorker.controller.postMessage({ type: 'CACHE_MODELS', force: false });
      }
      showMessage(trStatus('status.modelsConsentOnMsg', 'Download automatico dei modelli attivato: i modelli mancanti verranno scaricati in background.'), 'success');
    }
  });
}

// Initialize
restoreSavedPreferences();
loadAssets();
updateModelsConsentUI();
