const CACHE_VERSION = 'pwa-offline-v64';
const CACHE_PREFIX = 'pwa-offline-'; // Prefisso per identificare le cache dell'app
const FETCH_TIMEOUT = 15000; // 15 secondi (aumentato per connessioni lente)
// I modelli 3D (GLB/GLTF) possono superare i 100MB: con FETCH_TIMEOUT il download
// veniva abortito e ricominciato da capo su connessioni lente/mobili, raddoppiando
// i tempi di caricamento (o facendo fallire il caricamento su iPhone/Safari, dove
// il buffering della response clonata per la cache è più pesante in memoria).
const MODEL_FETCH_TIMEOUT = 180000; // 3 minuti
const ASSETS_VERSION_KEY = 'assets-version'; // Key per memorizzare la versione assets
const MAX_CONCURRENT_FETCHES = 4; // Limita le fetch parallele per non saturare la connessione

// Dimensione oltre la quale un modello va trattato come "grande": scaricato uno
// alla volta e mai clonato in memoria mentre la pagina lo sta già scaricando.
const LARGE_MODEL_BYTES = 32 * 1024 * 1024;
// NOTA: Rimosso CACHE_MAX_ITEMS per permettere cache persistente senza limiti arbitrari

// Asset locali
const LOCAL_ASSETS = [
  './',
  'index.php',
  'viewer.php',
  'status.php',
  'offline.html',
  'css/index.css',
  'css/viewer.css',
  'css/status.css',
  'manifest.json',
  'js/config.php',
  'js/i18n.js',
  'js/lang-selector.js',
  'js/pwa-register.js',
  'js/pwa-service-worker.js',
  'js/index.js',
  'js/status.js',
  'js/viewer-pwa.js',
  'js/viewer.js',
  'js/viewer/utils.js',
  'js/viewer/dom.js',
  'js/viewer/loader-ui.js',
  'js/viewer/panels.js',
  'js/viewer/measure.js',
  'js/viewer/annotations.js',
  'js/viewer/embed.js',
  'js/viewer/pivot-orbit.js',
  'js/viewer/model-loader.js',
  'js/viewer/gltf-memory.js',
  'js/viewer/diagnostics.js',
  'api/catalogo.php',
  'api/catalogo_assets.php',
  // File traduzioni i18n
  'i18n/it.json',
  'i18n/en.json',
  'i18n/es.json',
  'i18n/fr.json',
  // Librerie locali - Font Poppins
  'lib/fonts/poppins.css',
  'lib/fonts/files/poppins-latin-400-normal.woff2',
  'lib/fonts/files/poppins-latin-400-normal.woff',
  'lib/fonts/files/poppins-latin-600-normal.woff2',
  'lib/fonts/files/poppins-latin-600-normal.woff',
  'lib/fonts/files/poppins-latin-700-normal.woff2',
  'lib/fonts/files/poppins-latin-700-normal.woff',
  // Librerie locali - Leaflet
  'lib/leaflet/leaflet.css',
  'lib/leaflet/leaflet.js',
  // Librerie locali - Three.js
  'lib/three/build/three.module.js',
  'lib/three/examples/jsm/loaders/OBJLoader.js',
  'lib/three/examples/jsm/loaders/MTLLoader.js',
  'lib/three/examples/jsm/loaders/GLTFLoader.js',
  'lib/three/examples/jsm/loaders/DRACOLoader.js',
  'lib/three/examples/jsm/loaders/KTX2Loader.js',
  'lib/three/examples/jsm/libs/meshopt_decoder.module.js',
  'lib/three/examples/jsm/libs/ktx-parse.module.js',
  'lib/three/examples/jsm/libs/zstddec.module.js',
  'lib/three/examples/jsm/utils/WorkerPool.js',
  'lib/three/examples/jsm/utils/BufferGeometryUtils.js',
  'lib/three/examples/jsm/libs/draco/gltf/draco_decoder.js',
  'lib/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm',
  'lib/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js',
  'lib/three/examples/jsm/libs/basis/basis_transcoder.js',
  'lib/three/examples/jsm/libs/basis/basis_transcoder.wasm',
  'lib/three/examples/jsm/controls/OrbitControls.js',
  'lib/three/examples/jsm/controls/PointerLockControls.js',
  'lib/three/examples/jsm/webxr/VRButton.js',
  // Librerie locali - three-mesh-bvh (collisioni accelerate)
  'lib/three-mesh-bvh/index.module.js'
];

// Asset di branding (logo + icone PWA): i percorsi dipendono dai file
// presenti in custom/ e dalle impostazioni dell'utente, quindi vengono letti
// da js/config.php invece di essere scritti qui. Se il file non è
// raggiungibile (es. aggiornamento del service worker da offline) si usano i
// default del progetto, che stanno in img/.
// Cartella dei modelli (paths.modelsFolder), letta da config.php qui sotto
let MODELS_FOLDER = 'modelli/';

const DEFAULT_BRANDING_ASSETS = [
  'img/logo.png',
  'img/icon-192.png',
  'img/icon-512.png',
];

try {
  // Percorso relativo al service worker (js/), non alla root del sito
  importScripts('./config.php');
  if (typeof CONFIG !== 'undefined' && CONFIG.paths && typeof CONFIG.paths.modelsFolder === 'string' && CONFIG.paths.modelsFolder !== '') {
    MODELS_FOLDER = CONFIG.paths.modelsFolder.replace(/^\/+|\/+$/g, '') + '/';
  }
  const pwaConfig = (typeof CONFIG !== 'undefined' && CONFIG.pwa) ? CONFIG.pwa : null;
  const brandingAssets = pwaConfig
    ? [pwaConfig.logo, pwaConfig.logoWebp, pwaConfig.icon192, pwaConfig.icon512]
        .filter(asset => typeof asset === 'string' && asset !== '')
    : [];
  LOCAL_ASSETS.push(...(brandingAssets.length ? brandingAssets : DEFAULT_BRANDING_ASSETS));
} catch (error) {
  console.warn('PWA: config.php non caricato, uso i percorsi di branding di default');
  LOCAL_ASSETS.push(...DEFAULT_BRANDING_ASSETS);
}

// ===== MAPPA OFFLINE: SOLO LA VISTA STANDARD =====
// La homepage invia (CACHE_MAP_TILES) le tessere della vista con cui si apre
// la mappa: centro e zoom configurati, più una tessera di margine. Solo quelle
// vengono salvate, in una cache a parte e senza prefisso CACHE_PREFIX, così la
// migrazione tra versioni non la tocca e non occupa lo spazio dei modelli.
// Le zone viste spostando o zoomando la mappa non si salvano: prima finivano
// in cache come risposte opache (~7 MB l'una nella quota di Chrome) e senza
// limite. Qui le tessere si scaricano in CORS, con la loro dimensione reale.
const TILE_CACHE = 'pwa-map-tiles';
const TILE_MAX = 80;
const TILE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // rinnovate dopo 30 giorni
const TILE_SAVED_AT = 'X-Tile-Saved-At';

async function cacheMapTiles(urls) {
  const wanted = new Set(urls);
  const cache = await caches.open(TILE_CACHE);

  // La vista standard è cambiata (centro/zoom in settings.ini, schermo
  // diverso): via le tessere che non ne fanno più parte
  for (const request of await cache.keys()) {
    if (!wanted.has(request.url)) await cache.delete(request);
  }

  const now = Date.now();
  for (const url of wanted) {
    try {
      const existing = await cache.match(url);
      const savedAt = Number(existing?.headers.get(TILE_SAVED_AT)) || 0;
      if (existing && now - savedAt < TILE_MAX_AGE_MS) continue;

      // CORS: un fornitore di tessere senza CORS fallisce qui, e la tessera
      // semplicemente non è disponibile offline (online resta com'era)
      const response = await fetchWithTimeout(new Request(url, { mode: 'cors', credentials: 'omit' }));
      if (!response.ok || response.type === 'opaque') continue;
      const body = await response.blob();
      await cache.put(url, new Response(body, {
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'image/png',
          [TILE_SAVED_AT]: String(now)
        }
      }));
    } catch {
      // Rete assente o quota: si riproverà alla prossima apertura della mappa
    }
  }
}

function isValidTileList(urls) {
  return Array.isArray(urls) && urls.length > 0 && urls.length <= TILE_MAX &&
    urls.every((u) => {
      if (typeof u !== 'string') return false;
      try {
        const parsed = new URL(u);
        return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
          parsed.origin !== self.location.origin;
      } catch {
        return false;
      }
    });
}

// Tessera della vista standard dalla sua cache, altrimenti la strategia
// generica per le richieste cross-origin
async function mapTileOrNetwork(request, event) {
  try {
    const cache = await caches.open(TILE_CACHE);
    const tile = await cache.match(request.url);
    if (tile) return tile;
  } catch {}
  return staleWhileRevalidate(request, event);
}

// Asset esterni (CDN) - ora vuoto perché tutte le librerie sono in locale
const EXTERNAL_ASSETS = [];

// Utility per fetch con timeout
async function fetchWithTimeout(request, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Verifica se una risposta può essere messa in cache
// Le risposte opaque redirect e error non possono essere cachate
function isCacheable(response) {
  if (!response) return false;

  // Opaque redirect e error non possono essere cachati
  if (response.type === 'opaqueredirect' || response.type === 'error') {
    return false;
  }

  // Risposte opache (cross-origin no-cors, es. le tile della mappa): Chrome
  // le conteggia ~7 MB l'una nella quota, quindi poche centinaia di tile
  // bastano a esaurire lo spazio destinato ai modelli. Non si salvano.
  if (response.type === 'opaque') {
    return false;
  }

  // Solo risposte complete: un 206 (Range) fa fallire cache.put()
  return response.status === 200;
}

// Helper per cache.put() con gestione errori
// Evita che errori di rete/CORS causino eccezioni non gestite
async function safeCachePut(cache, key, response, { rethrowQuota = false } = {}) {
  if (!isCacheable(response)) {
    return false;
  }

  try {
    await cache.put(key, response);
    return true;
  } catch (error) {
    if (rethrowQuota && isQuotaError(error)) throw error;
    // Cache.put() può fallire per:
    // - Risposta con redirect cross-origin
    // - Errori di quota storage
    // - Risposte con body già consumato
    // Non logghiamo questi errori per evitare spam in console
    return false;
  }
}

function isQuotaError(error) {
  return error?.name === 'QuotaExceededError' || error?.code === 22;
}

// Spazio libero stimato nella quota dell'origine (Infinity se non misurabile)
async function freeStorageBytes() {
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return quota > 0 ? quota - usage : Infinity;
  } catch {
    return Infinity;
  }
}

// Interrompe una fetch il cui corpo smette di arrivare: il timeout di
// fetchWithTimeout copre solo gli header, e con un segnale mobile debole un
// download di 100 MB può restare appeso a metà finché il worker non viene
// ucciso, bloccando l'intera sincronizzazione offline.
async function fetchWithIdleTimeout(request, headerTimeout, idleTimeout) {
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), headerTimeout);
  const response = await fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
  if (!response.body) return response;

  timer = setTimeout(() => controller.abort(), idleTimeout);
  const watchdog = new TransformStream({
    transform(chunk, ctrl) {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), idleTimeout);
      ctrl.enqueue(chunk);
    },
    flush() { clearTimeout(timer); }
  });
  return new Response(response.body.pipeThrough(watchdog), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

const BODY_IDLE_TIMEOUT = 30000;

// ===== PRESSIONE DI MEMORIA SUI MODELLI GRANDI =====
// response.clone() non duplica i byte già scaricati, ma sdoppia lo stream: il
// ramo destinato alla cache viene bufferizzato finché cache.put() non l'ha
// scritto su disco. Con un GLB da 100 MB significa tenerne una copia qui
// mentre la pagina ne sta costruendo un'altra per il parsing: su telefono è
// abbastanza da far terminare la scheda al sistema operativo.
// Su desktop il margine c'è, quindi il comportamento resta quello di prima.

function cloneBudgetBytes() {
  // deviceMemory è in GB e non esiste su Safari (dove il problema è più acuto):
  // se manca si assume il caso peggiore.
  const memoryGb = (typeof navigator !== 'undefined') ? navigator.deviceMemory : undefined;
  if (typeof memoryGb !== 'number') return LARGE_MODEL_BYTES;
  if (memoryGb >= 8) return Infinity;
  if (memoryGb >= 4) return 2 * LARGE_MODEL_BYTES;
  return LARGE_MODEL_BYTES;
}

function declaredSize(response) {
  const length = Number(response?.headers?.get('Content-Length'));
  return Number.isFinite(length) && length > 0 ? length : 0;
}

// URL dei modelli serviti senza copia in cache, da riprovare a salvare quando
// la pagina ha finito di elaborarli (vedi il messaggio MODEL_LOAD_END)
// (in memoria: se il worker viene fermato durante il parsing il Set si perde,
// per questo MODEL_LOAD_END ritenta comunque, vedi il gestore dei messaggi)
const deferredModelCache = new Set();

// Finestra in cui il viewer sta scaricando un modello: il download di massa per
// l'uso offline si mette in pausa, altrimenti i due download si sommano.
// È un limite temporale e non un semaforo, così un client che si chiude a metà
// download non lascia la cache bloccata per sempre.
let viewerBusyUntil = 0;
// Il viewer ripete MODEL_LOAD_START durante il download (vedi viewer.js), quindi
// la finestra può essere breve: scade presto se la pagina sparisce.
const VIEWER_BUSY_MAX_MS = 2 * 60 * 1000;

function viewerIsDownloading() {
  return Date.now() < viewerBusyUntil;
}

async function waitWhileViewerDownloads() {
  while (viewerIsDownloading()) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Salva un modello servito senza clone attingendo alla cache HTTP del browser:
// i GLB sono immutable con max-age lungo (vedi .htaccess), quindi quando il
// browser li ha conservati la copia non costa un byte di rete. Se non li ha
// (i file molto grandi vengono scartati dalla cache HTTP) si rinuncia: meglio
// un modello non disponibile offline di un secondo download non richiesto,
// che resta comunque possibile dal banner di consenso o da status.php.
async function cacheDeferredModel(url) {
  deferredModelCache.delete(url);
  try {
    const cache = await caches.open(CACHE_VERSION);
    if (await cache.match(url, { ignoreVary: true })) return;

    const response = await fetch(url, { mode: 'same-origin', cache: 'only-if-cached' });
    if (isCacheable(response)) {
      await safeCachePut(cache, url, response);
    }
  } catch {
    // Non nella cache HTTP: si riproverà alla prossima visita del modello
  }
}

// Utility per eseguire fetch con limite di concorrenza
async function fetchWithConcurrencyLimit(items, fetchFn, maxConcurrent = MAX_CONCURRENT_FETCHES) {
  const results = [];
  const executing = new Set();

  for (const item of items) {
    const promise = fetchFn(item).then(result => {
      executing.delete(promise);
      return result;
    }).catch(error => {
      executing.delete(promise);
      return { success: false, item, error };
    });

    results.push(promise);
    executing.add(promise);

    // Se abbiamo raggiunto il limite, aspetta che una completi
    if (executing.size >= maxConcurrent) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

// Migra i dati dalle cache precedenti alla nuova versione
// Questo preserva tutti i file scaricati dall'utente tra gli aggiornamenti del SW
async function migrateFromOldCaches(newCache) {
  const keys = await caches.keys();
  let migratedCount = 0;

  for (const key of keys) {
    // Salta la cache corrente e cache non nostre
    if (key === CACHE_VERSION || !key.startsWith(CACHE_PREFIX)) {
      continue;
    }

    try {
      const oldCache = await caches.open(key);
      const oldRequests = await oldCache.keys();

      for (const request of oldRequests) {
        // Verifica se l'elemento esiste già nella nuova cache
        const existsInNew = await newCache.match(request, { ignoreVary: true });
        if (!existsInNew) {
          // Copia dalla vecchia cache alla nuova
          const response = await oldCache.match(request);
          // Le tessere della mappa salvate dalle versioni precedenti sono
          // risposte opache: non si portano nella nuova cache (la vista
          // standard ha ora la sua, vedi TILE_CACHE)
          if (response && response.type !== 'opaque') {
            await newCache.put(request, response);
            migratedCount++;
          }
        }
        // Rimuove subito la voce copiata: con un catalogo offline di qualche
        // GB copiare tutto prima di cancellare richiederebbe il doppio dello
        // spazio, e a metà strada cache.put() fallirebbe per quota
        await oldCache.delete(request);
      }

      // Elimina la vecchia cache solo DOPO aver migrato tutti i dati
      await caches.delete(key);
      console.log(`PWA: Cache ${key} migrata e rimossa`);
    } catch (error) {
      console.warn(`PWA: Errore migrazione cache ${key}:`, error.message);
    }
  }

  if (migratedCount > 0) {
    console.log(`PWA: Migrati ${migratedCount} elementi dalle cache precedenti`);
  }

  return migratedCount;
}

// Cache asset locali con limite di concorrenza
async function cacheLocalAssets(cache) {
  // Filtra i file PHP che devono essere sempre fetchati freschi (non cachare all'install)
  const staticAssets = LOCAL_ASSETS.filter(asset => !asset.endsWith('.php'));

  const fetchAsset = async (asset) => {
    try {
      // Use service worker scope as base URL to ensure correct path resolution
      const baseUrl = self.registration.scope;
      const url = new URL(asset, baseUrl);
      const urlString = url.toString();

      // Use same-origin mode to prevent CORS issues with local assets.
      // cache: 'no-cache' rivalida con il server: senza, un bump di
      // CACHE_VERSION ricopierebbe nella nuova cache gli asset vecchi
      // presi dalla cache HTTP del browser (CSS/JS hanno max-age 1 mese)
      const request = new Request(urlString, {
        mode: 'same-origin',
        credentials: 'same-origin',
        cache: 'no-cache'
      });

      // Usa fetchWithTimeout anche per asset locali
      const response = await fetchWithTimeout(request);

      // Verifica se la risposta può essere cachata
      if (!isCacheable(response)) {
        // Non loggare errori per redirect (www/non-www) - sono comuni
        if (response?.type !== 'opaqueredirect') {
          console.warn(`PWA: Asset locale non disponibile (${response?.status || response?.type}): ${asset}`);
        }
        return { success: false, asset, error: `HTTP ${response?.status || response?.type}` };
      }

      // Salva usando l'URL come chiave per match consistente
      const cached = await safeCachePut(cache, urlString, response);
      return { success: cached, asset };
    } catch (error) {
      // Don't log CORS errors for local assets - they're expected in some configurations
      if (error.name !== 'TypeError' || !error.message?.includes('CORS')) {
        console.warn(`PWA: Errore caching asset locale ${asset}:`, error.message);
      }
      return { success: false, asset, error };
    }
  };

  const results = await fetchWithConcurrencyLimit(staticAssets, fetchAsset);
  const successful = results.filter(r => r?.success).length;
  console.log(`PWA: Cached ${successful}/${staticAssets.length} asset locali statici`);
}

// Cache asset esterni con limite di concorrenza
async function cacheExternalAssets(cache) {
  const fetchAsset = async (asset) => {
    try {
      const request = new Request(asset, { mode: 'cors', cache: 'default' });
      const response = await fetchWithTimeout(request);

      // Verifica se la risposta può essere cachata
      if (!isCacheable(response)) {
        // Non loggare errori per redirect - sono comuni con CDN
        if (response?.type !== 'opaqueredirect') {
          console.warn(`PWA: Asset esterno non disponibile (${response?.status || response?.type}): ${asset}`);
        }
        return { success: false, asset, error: `HTTP ${response?.status || response?.type}` };
      }

      // Salva usando l'URL come chiave per match consistente
      const cached = await safeCachePut(cache, asset, response);
      return { success: cached, asset };
    } catch (error) {
      // CORS o network errors - non bloccanti, non logghiamo per evitare spam
      return { success: false, asset, error };
    }
  };

  const results = await fetchWithConcurrencyLimit(EXTERNAL_ASSETS, fetchAsset);
  const successful = results.filter(r => r?.success).length;
  console.log(`PWA: Cached ${successful}/${EXTERNAL_ASSETS.length} asset esterni`);
}

// Chiave per memorizzare le versioni dei singoli file
const FILE_VERSIONS_KEY = 'file-versions';

// Invia un messaggio a tutte le pagine controllate (per progresso download modelli)
async function broadcastToClients(message) {
  try {
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => client.postMessage(message));
  } catch {
    // Nessun client raggiungibile - non bloccante
  }
}

// Cache asset del catalogo modelli con versioning per singolo file
// Scarica solo i file nuovi o modificati, preservando quelli già in cache
async function cacheCatalogAssets(cache, force = false) {
  try {
    // Use service worker scope as base URL
    const baseUrl = self.registration.scope;
    const catalogUrl = new URL('api/catalogo_assets.php', baseUrl);
    const catalogUrlString = catalogUrl.toString();

    const response = await fetchWithTimeout(
      new Request(catalogUrlString, {
        mode: 'same-origin',
        credentials: 'same-origin',
        cache: 'no-store'
      })
    );

    if (!response.ok) {
      console.warn('PWA: Catalogo assets non disponibile');
      return;
    }

    const data = await response.json();
    if (!data || typeof data !== 'object' || !data.version || !Array.isArray(data.assets)) {
      console.warn('PWA: Formato catalogo assets non valido');
      return;
    }

    // Carica le versioni dei file già in cache
    const versionsUrlString = new URL(FILE_VERSIONS_KEY, baseUrl).toString();
    let cachedVersions = {};
    try {
      const cachedVersionsResponse = await cache.match(versionsUrlString, { ignoreVary: true });
      if (cachedVersionsResponse) {
        cachedVersions = await cachedVersionsResponse.json();
      }
    } catch {
      cachedVersions = {};
    }

    // Determina quali file devono essere scaricati
    // - Nuovi file (non in cache)
    // - File con versione cambiata (modificati sul server)
    const assetsToDownload = [];
    const newVersions = {};

    for (const asset of data.assets) {
      // Supporta sia il vecchio formato (string) che il nuovo (object con path/version/size)
      const assetPath = typeof asset === 'string' ? asset : asset.path;
      const assetVersion = typeof asset === 'object' ? asset.version : null;
      const assetSize = (typeof asset === 'object' && typeof asset.size === 'number') ? asset.size : 0;

      // Verifica se il file è già in cache con la stessa versione
      const assetUrl = new URL(assetPath, baseUrl).toString();
      const cachedVersion = cachedVersions[assetPath];

      if (!force) {
        const existing = await cache.match(assetUrl, { ignoreVary: true });
        // Già in cache con la stessa versione, oppure in cache senza versione
        // registrata (salvato aprendolo nel viewer, o da una sincronizzazione
        // interrotta) ma con la stessa dimensione: non serve riscaricarlo
        const sameVersion = assetVersion && cachedVersion === assetVersion;
        const unversionedMatch = !cachedVersion && assetSize > 0 && declaredSize(existing) === assetSize;
        if (existing && (sameVersion || unversionedMatch)) {
          if (assetVersion) newVersions[assetPath] = assetVersion;
          continue;
        }
      }

      // File nuovo o modificato, aggiungi alla lista da scaricare
      assetsToDownload.push({ path: assetPath, version: assetVersion, size: assetSize, changed: !!cachedVersion });
    }

    if (assetsToDownload.length === 0) {
      console.log('PWA: Tutti gli asset sono già in cache e aggiornati');
      broadcastToClients({ type: 'MODELS_CACHE_DONE', downloaded: 0, failed: 0, total: 0 });
      return;
    }

    console.log(`PWA: Scaricamento ${assetsToDownload.length}/${data.assets.length} asset (solo nuovi/modificati)`);

    // Le versioni si salvano file per file e non solo a fine giro: su telefono
    // il worker viene fermato a metà di una sincronizzazione lunga (app in
    // background, limite di durata dell'evento) e senza questo alla visita
    // successiva tutti i modelli già scaricati sarebbero riscaricati da capo.
    const savedVersions = { ...cachedVersions, ...newVersions };
    let versionsWrite = Promise.resolve();
    const persistVersions = () => {
      versionsWrite = versionsWrite.then(() => cache.put(
        versionsUrlString,
        new Response(JSON.stringify(savedVersions), { headers: { 'Content-Type': 'application/json' } })
      )).catch(() => {});
      return versionsWrite;
    };
    await persistVersions();
    let quotaExceeded = false;

    // Progresso del download comunicato alle pagine aperte (banner consenso / status)
    let progressDone = 0;
    let progressBytes = 0;
    const progressBytesTotal = assetsToDownload.reduce((sum, a) => sum + (a.size || 0), 0);
    const reportProgress = (downloadedBytes) => {
      progressDone++;
      progressBytes += downloadedBytes;
      broadcastToClients({
        type: 'MODELS_CACHE_PROGRESS',
        done: progressDone,
        total: assetsToDownload.length,
        bytesDone: progressBytes,
        bytesTotal: progressBytesTotal
      });
    };

    const fetchAsset = async (asset) => {
      try {
        // Il viewer ha la precedenza: sommare questo download a quello del
        // modello aperto dall'utente raddoppierebbe la memoria occupata e su
        // telefono farebbe terminare la scheda
        await waitWhileViewerDownloads();
        if (quotaExceeded) {
          reportProgress(0);
          return { success: false, asset: asset.path, error: 'quota' };
        }

        // Spazio insufficiente: inutile scaricare 100 MB per poi buttarli
        if (asset.size > 0 && await freeStorageBytes() < asset.size * 1.2) {
          quotaExceeded = true;
          reportProgress(0);
          return { success: false, asset: asset.path, error: 'quota' };
        }

        // Resolve asset URL against service worker scope
        const assetUrl = new URL(asset.path, baseUrl);
        const assetUrlString = assetUrl.toString();
        const request = new Request(assetUrlString, {
          mode: 'same-origin',
          credentials: 'same-origin',
          // I GLB sono serviti immutable: per un file cambiato sul server la
          // cache HTTP restituirebbe i byte vecchi sotto la versione nuova
          cache: asset.changed ? 'reload' : 'default'
        });
        const assetResponse = await fetchWithIdleTimeout(request, MODEL_FETCH_TIMEOUT, BODY_IDLE_TIMEOUT);

        // Verifica se la risposta può essere cachata
        if (!isCacheable(assetResponse)) {
          reportProgress(0);
          return { success: false, asset: asset.path, error: `HTTP ${assetResponse?.status || assetResponse?.type}` };
        }

        // Salva usando l'URL come chiave per match consistente
        const cached = await safeCachePut(cache, assetUrlString, assetResponse, { rethrowQuota: true });
        if (cached && asset.version) {
          // Aggiorna la versione del file
          newVersions[asset.path] = asset.version;
          savedVersions[asset.path] = asset.version;
          await persistVersions();
        }
        reportProgress(cached ? (asset.size || 0) : 0);
        return { success: cached, asset: asset.path };
      } catch (error) {
        if (isQuotaError(error)) quotaExceeded = true;
        reportProgress(0);
        return { success: false, asset: asset.path, error };
      }
    };

    // Limite di concorrenza ridotto per i modelli 3D (file più grandi); i
    // modelli molto grandi vanno uno alla volta, perché cache.put() ne tiene il
    // corpo in memoria finché non è scritto su disco e due insieme bastano a
    // esaurire quella di un telefono.
    const smallAssets = assetsToDownload.filter(a => (a.size || 0) < LARGE_MODEL_BYTES);
    const largeAssets = assetsToDownload.filter(a => (a.size || 0) >= LARGE_MODEL_BYTES);
    const results = [
      ...await fetchWithConcurrencyLimit(smallAssets, fetchAsset, 2),
      ...await fetchWithConcurrencyLimit(largeAssets, fetchAsset, 1)
    ];
    const successful = results.filter(r => r?.success).length;
    console.log(`PWA: Cached ${successful}/${assetsToDownload.length} modelli 3D (nuovi/modificati)`);

    broadcastToClients({
      type: 'MODELS_CACHE_DONE',
      downloaded: successful,
      failed: assetsToDownload.length - successful,
      total: assetsToDownload.length,
      quotaExceeded
    });

    const finalVersions = savedVersions;
    await persistVersions();

    // Memorizza anche la versione del catalogo (per sapere se ci sono nuovi file)
    const versionUrlString = new URL(ASSETS_VERSION_KEY, baseUrl).toString();
    await cache.put(
      versionUrlString,
      new Response(data.version, { headers: { 'Content-Type': 'text/plain' } })
    );

    console.log(`PWA: Cache modelli aggiornata - ${Object.keys(finalVersions).length} file totali`);
  } catch (error) {
    console.warn('PWA: Errore nel caching dei modelli', error);
  }
}

// Una sola sincronizzazione alla volta: ogni pagina aperta invia CACHE_MODELS,
// e passando da index a viewer e ritorno partirebbero più giri paralleli che
// scaricano gli stessi file (non ancora in cache) più volte.
let catalogRun = null;
function runCatalogSync(cache, force) {
  if (!catalogRun) {
    catalogRun = cacheCatalogAssets(cache, force).finally(() => { catalogRun = null; });
  }
  return catalogRun;
}

// Event: Install - OTTIMIZZATO per startup veloce ma con supporto offline completo
self.addEventListener('install', (event) => {
  console.log('PWA: Service Worker installing...');

  // Attiva immediatamente il nuovo service worker (non aspettare il caching)
  self.skipWaiting();

  // Cache asset locali e CDN in parallelo (non bloccante - usa allSettled)
  // I modelli 3D vengono cachati in background dopo l'attivazione
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_VERSION);

        // Cache asset locali e CDN essenziali in parallelo
        // allSettled non blocca se qualcosa fallisce
        await Promise.allSettled([
          cacheLocalAssets(cache),
          cacheExternalAssets(cache)
        ]);

        console.log('PWA: Service Worker installato (modelli su consenso)');
      } catch (error) {
        console.warn('PWA: Installazione parziale:', error.message);
        // Non rilancia l'errore - permetti l'installazione anche con cache parziale
      }
    })()
  );
});

// Event: Activate - Avvia caching in background dopo l'attivazione
// IMPORTANTE: Migra i dati dalle cache precedenti invece di eliminarli
self.addEventListener('activate', (event) => {
  console.log('PWA: Service Worker activating...');

  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_VERSION);

        // Navigation preload: la richiesta della pagina parte mentre il worker
        // si avvia, invece di aspettarlo (100-500 ms a ogni navigazione su telefono)
        try {
          await self.registration.navigationPreload?.enable();
        } catch {}

        // Prendi il controllo subito: durante la migrazione cacheFirst() legge
        // anche le cache precedenti (caches.match), quindi un modello aperto
        // in quel momento non resta in attesa né viene riscaricato
        await self.clients.claim();

        // MIGRAZIONE: Copia tutti i file dalle cache precedenti
        // Questo preserva i file scaricati dall'utente tra gli aggiornamenti
        const migratedCount = await migrateFromOldCaches(cache);
        if (migratedCount > 0) {
          console.log(`PWA: Migrazione completata - ${migratedCount} file preservati`);
        }

        console.log('PWA: Service Worker attivato con successo');

        // Notifica i client dell'aggiornamento
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: CACHE_VERSION
          });
        });

        // NOTA: il pre-download di massa dei modelli 3D NON parte più in automatico.
        // Con cataloghi grandi occuperebbe molto spazio senza consenso dell'utente.
        // Parte solo su messaggio CACHE_MODELS / CACHE_ALL, inviato da
        // pwa-register.js dopo il consenso (banner) o manualmente da status.php.
        // I singoli modelli visitati nel viewer restano cachati on-demand (cacheFirst).

      } catch (error) {
        console.warn('PWA: Errore durante attivazione:', error.message);
      }
    })()
  );
});

// Event: Fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Gestisci solo richieste GET
  if (request.method !== 'GET') {
    return;
  }

  try {
    const url = new URL(request.url);

    // Richieste cross-origin (CDN, fonts, etc)
    if (url.origin !== self.location.origin) {
      event.respondWith(mapTileOrNetwork(request, event));
      return;
    }

    // Catalogo modelli (API dinamica): network-first per vedere subito i nuovi modelli
    // NOTA: la base è lo scope del SW, non l'origin: con l'app installata in una
    // sottocartella (es. /3d/) l'origin darebbe /api/ invece di /3d/api/ e le
    // richieste non verrebbero riconosciute.
    const apiPathPrefix = new URL('api/', self.registration.scope).pathname;
    if (url.pathname === apiPathPrefix + 'catalogo.php' ||
        url.pathname === apiPathPrefix + 'catalogo_assets.php') {
      event.respondWith(networkFirst(request, event));
      return;
    }

    // Modelli 3D (file statici GLB/JSON/immagini): cache-first per performance
    const modelPathPrefix = new URL(MODELS_FOLDER, self.registration.scope).pathname;
    if (url.pathname.startsWith(modelPathPrefix)) {
      event.respondWith(cacheFirst(request, event));
      return;
    }

    // Navigazione: network-first con fallback a cache
    if (request.mode === 'navigate') {
      event.respondWith(networkFirst(request, event, event.preloadResponse));
      return;
    }

    // Asset statici: stale-while-revalidate
    event.respondWith(staleWhileRevalidate(request, event));
  } catch (error) {
    event.respondWith(fetch(request));
  }
});

// Event: Message
self.addEventListener('message', (event) => {
  if (!event.data || !event.data.type) {
    return;
  }

  console.log('PWA: Ricevuto messaggio:', event.data.type);

  switch (event.data.type) {
    case 'SKIP_WAITING':
      // Forza l'attivazione del nuovo service worker
      self.skipWaiting();
      break;

    case 'MODEL_LOAD_START':
      // Il viewer sta scaricando un modello: sospende il download di massa per
      // l'uso offline, che altrimenti occuperebbe memoria in parallelo
      viewerBusyUntil = Date.now() + VIEWER_BUSY_MAX_MS;
      break;

    case 'MODEL_LOAD_END':
      viewerBusyUntil = 0;
      // Il modello è stato consegnato ed elaborato: ora la copia in cache può
      // essere tentata senza sommarsi ai buffer della pagina
      // Non si controlla deferredModelCache: se il worker è stato fermato
      // durante il parsing il Set è vuoto, e cacheDeferredModel() esce subito
      // da sola quando il file è già in cache
      if (typeof event.data.url === 'string' && isModelUrl(event.data.url)) {
        event.waitUntil(cacheDeferredModel(event.data.url));
      }
      break;

    case 'CACHE_MODELS':
      // Aggiorna la cache dei modelli.
      // force=true (default per retrocompatibilità) riscarica tutto;
      // force=false scarica solo i file nuovi o modificati (sync incrementale
      // a ogni avvio quando il consenso è già stato concesso)
      event.waitUntil(
        (async () => {
          try {
            const cache = await caches.open(CACHE_VERSION);
            await runCatalogSync(cache, event.data.force !== false);
            console.log('PWA: Cache modelli aggiornata');
          } catch (error) {
            // Errore aggiornamento cache modelli
          }
        })()
      );
      break;

    case 'CACHE_ALL':
      // Ricarica tutta la cache (forzata)
      event.waitUntil(
        (async () => {
          try {
            const cache = await caches.open(CACHE_VERSION);
            await Promise.all([
              cacheLocalAssets(cache),
              cacheExternalAssets(cache),
              runCatalogSync(cache, event.data.force !== false) // force=true (default) per aggiornamento manuale
            ]);
            console.log('PWA: Cache completa aggiornata');
          } catch (error) {
            // Errore aggiornamento cache completa
          }
        })()
      );
      break;

    case 'CACHE_MAP_TILES':
      if (isValidTileList(event.data.urls)) {
        event.waitUntil(cacheMapTiles(event.data.urls));
      }
      break;

    case 'CLEAR_CACHE':
      // Pulisci la cache
      event.waitUntil(
        (async () => {
          try {
            await caches.delete(CACHE_VERSION);
            await caches.delete(TILE_CACHE);
            console.log('PWA: Cache eliminata');
          } catch (error) {
            // Errore eliminazione cache
          }
        })()
      );
      break;

    default:
      console.warn('PWA: Tipo messaggio sconosciuto:', event.data.type);
  }
});

// ===== STRATEGIE DI CACHING =====

// Cache-First: Prioritizza la cache, fallback a network
// NOTA: usata solo per gli asset sotto modelli/ (GLB/GLTF/JSON/immagini),
// che possono essere molto grandi: usa MODEL_FETCH_TIMEOUT invece del
// timeout breve di default, altrimenti il download viene abortito e
// ricominciato da capo su connessioni lente (vedi FETCH_TIMEOUT sopra).
function isModelUrl(url) {
  try {
    const { pathname } = new URL(url, self.registration.scope);
    return pathname.startsWith(new URL(MODELS_FOLDER, self.registration.scope).pathname);
  } catch {
    return false;
  }
}

function isModelBinary(url) {
  return /\.(glb|gltf|bin)$/i.test(new URL(url).pathname);
}

async function cacheFirst(request, event) {
  try {
    const cache = await caches.open(CACHE_VERSION);
    // Usa URL per il match per evitare problemi con proprietà Request diverse.
    // Il secondo tentativo cerca nelle altre cache: durante la migrazione
    // dopo un aggiornamento il file può essere ancora in quella precedente.
    const cached = await cache.match(request.url, { ignoreVary: true })
      || await caches.match(request.url, { ignoreVary: true });

    if (cached) {
      return cached;
    }

    const binary = isModelBinary(request.url);
    if (binary) {
      // Il worker vede la richiesta prima del messaggio MODEL_LOAD_START della
      // pagina (es. il <link rel=preload>): sospende subito il download di massa
      viewerBusyUntil = Date.now() + VIEWER_BUSY_MAX_MS;
    }

    // Non in cache, scarica e salva
    const response = await fetchWithTimeout(request, MODEL_FETCH_TIMEOUT);

    // Salva solo se la risposta è cacheable
    if (isCacheable(response)) {
      const size = declaredSize(response);
      // Senza Content-Length (CDN, compressione al volo) la dimensione è
      // ignota: per un GLB si assume il caso peggiore
      const unknownLargeSize = binary && size === 0 && cloneBudgetBytes() !== Infinity;
      if (size > cloneBudgetBytes() || unknownLargeSize) {
        // File troppo grande per essere clonato in memoria mentre la pagina lo
        // sta scaricando: passa intatto e si riproverà a salvarlo dopo, quando
        // i buffer della pagina saranno stati liberati (vedi cacheDeferredModel)
        deferredModelCache.add(request.url);
      } else {
        keepAlive(event, safeCachePut(cache, request.url, response.clone()));
      }
    }

    return response;
  } catch (error) {
    // Non logghiamo errori comuni per evitare spam in console

    // Ultimo tentativo senza timeout
    try {
      return await fetch(request);
    } catch {
      return new Response('Risorsa non disponibile', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    }
  }
}

// Tiene vivo il worker finché una scrittura in cache in background non è
// finita: senza, su iOS il worker viene fermato appena l'app va in background
// e la copia si perde
function keepAlive(event, promise) {
  try {
    event?.waitUntil(promise);
  } catch {
    // waitUntil non più disponibile (evento già concluso): resta best effort
  }
  return promise;
}

// Network-First: Prioritizza la rete, fallback a cache
async function networkFirst(request, event, preloadResponse) {
  const cache = await caches.open(CACHE_VERSION);
  const requestUrl = request.url;

  try {
    const preloaded = preloadResponse ? await preloadResponse.catch(() => null) : null;
    const response = preloaded || await fetchWithTimeout(request);

    // Salva solo se la risposta è cacheable
    if (isCacheable(response)) {
      keepAlive(event, safeCachePut(cache, requestUrl, response.clone()));
      return response;
    }

    // Response non cacheable, prova la cache
    const cached = await cache.match(requestUrl, { ignoreVary: true });
    if (cached) {
      return cached;
    }

    return response;
  } catch (error) {
    // Network fallito, prova la cache usando URL
    const cached = await cache.match(requestUrl, { ignoreVary: true });
    if (cached) {
      console.log('PWA: Usando cache offline per', requestUrl);
      return cached;
    }

    // Prova a rimuovere query params e hash
    try {
      const fallbackUrl = new URL(requestUrl);
      fallbackUrl.search = '';
      fallbackUrl.hash = '';
      const fallback = await cache.match(fallbackUrl.toString(), { ignoreVary: true });

      if (fallback) {
        return fallback;
      }
    } catch {}

    // Nessuna cache disponibile - mostra pagina offline per navigazione
    try {
      const offlineUrl = new URL('offline.html', self.registration.scope).toString();
      const offlinePage = await cache.match(offlineUrl, { ignoreVary: true });
      if (offlinePage) {
        return offlinePage;
      }
    } catch {}

    return new Response('Offline - Risorsa non disponibile', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Stale-While-Revalidate: Restituisci cache immediatamente, aggiorna in background
async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_VERSION);
  const requestUrl = request.url;
  // Usa URL per il match per evitare problemi con proprietà Request diverse
  const cached = await cache.match(requestUrl, { ignoreVary: true });

  // Aggiorna in background (non aspettiamo)
  const fetchPromise = fetchWithTimeout(request)
    .then((response) => {
      // Salva solo se la risposta è cacheable (evita errori con redirect cross-origin)
      if (isCacheable(response)) {
        keepAlive(event, safeCachePut(cache, requestUrl, response.clone()));
      }
      return response;
    })
    .catch(() => {
      // Errori di rete in background - non logghiamo per evitare spam
      return null;
    });

  // Se abbiamo la cache, restituiscila subito (l'aggiornamento avviene in background)
  if (cached) {
    keepAlive(event, fetchPromise);
    return cached;
  }

  // Se non abbiamo cache, aspettiamo il fetch
  const fetchedResponse = await fetchPromise;
  if (fetchedResponse) {
    return fetchedResponse;
  }

  // Ultimo tentativo: fetch diretto senza timeout
  try {
    return await fetch(request);
  } catch {
    return new Response('Risorsa non disponibile', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}