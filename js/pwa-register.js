/**
 * PWA Service Worker Registration Handler
 * Gestisce registrazione, aggiornamenti e notifiche del service worker
 */

(function () {
  'use strict';

  // Configurazione
  const SW_PATH = 'js/pwa-service-worker.js';
  const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // Controlla aggiornamenti ogni ora
  const SHOW_UPDATE_NOTIFICATION = true;

  // Consenso al pre-download di massa dei modelli 3D
  // 'granted'            → scarica/aggiorna i modelli a ogni avvio (incrementale)
  // 'denied:<timestamp>' → non chiedere di nuovo prima di CONSENT_RETRY_MS
  // assente              → mostra il banner di consenso
  const MODELS_CONSENT_KEY = 'pwa-models-download-consent';
  const CONSENT_RETRY_MS = 7 * 24 * 60 * 60 * 1000; // Riproponi dopo 7 giorni
  const CONSENT_BANNER_DELAY = 10000; // Attesa dalla visita della pagina prima di proporre il download
  const CATALOG_ASSETS_URL = 'api/catalogo_assets.php';

  // Momento di caricamento dello script: il ritardo del banner di consenso
  // si misura da qui, non da quando il service worker è pronto
  const PAGE_LOAD_TIME = Date.now();

  let registration = null;
  let refreshing = false;
  // Riferimento al worker in attesa, usato dal pulsante "Aggiorna"
  let pendingWorker = null;
  // Una volta che l'utente ha premuto "Aggiorna" (o chiuso l'avviso) non
  // riproporre più la notifica di aggiornamento in questa sessione: evita
  // che il banner riappaia in loop dopo aver avviato l'aggiornamento
  let updateHandled = false;
  // Traccia se c'era già un controller al momento della registrazione:
  // evita di mostrare il banner al primo install (quando non c'è aggiornamento reale)
  let hadController = !!navigator.serviceWorker.controller;

  // Verifica supporto Service Worker
  if (!('serviceWorker' in navigator)) {
    console.warn('PWA: Service Worker non supportato in questo browser');
    return;
  }

  // Traduzione con fallback (window.t è definito da js/i18n.js, caricato prima)
  function tr(key, fallback) {
    return (typeof window.t === 'function') ? window.t(key, fallback) : fallback;
  }

  /**
   * Mostra una notifica di aggiornamento discreta (status bar poco invasiva).
   * L'aggiornamento del service worker avviene comunque in background: questo
   * avviso serve solo a proporre il ricaricamento per vedere la nuova versione.
   * @param {ServiceWorker|null} waitingWorker - Il worker in attesa (se presente)
   */
  function showUpdateNotification(waitingWorker) {
    if (!SHOW_UPDATE_NOTIFICATION) return;

    // Una volta gestito (aggiornamento avviato o avviso chiuso) o mentre la
    // pagina si sta ricaricando, non riproporre più l'avviso: evita che il
    // banner riappaia in loop dopo aver premuto "Aggiorna"
    if (updateHandled || refreshing) return;

    // Aggiorna il riferimento al worker in attesa (potrebbe essere cambiato)
    if (waitingWorker) {
      pendingWorker = waitingWorker;
    }

    // Evita banner duplicati: se ne è già presente uno, non creare un nuovo banner
    if (document.getElementById('sw-update-banner')) return;

    // Non sovrapporre al banner dei modelli: se è visibile, rimuovilo per
    // fare spazio all'avviso di aggiornamento. Il consenso al download non va
    // perso (è salvato in localStorage) e verrà eventualmente riproposto alla
    // prossima visita; il download avviato prosegue comunque in background.
    const modelsBanner = document.getElementById('sw-models-consent-banner');
    if (modelsBanner) modelsBanner.remove();

    // Status bar discreta: una piccola "pillola" in basso, poco invasiva
    const banner = document.createElement('div');
    banner.id = 'sw-update-banner';
    banner.style.cssText = `
      position: fixed;
      bottom: calc(56px + env(safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%);
      background: rgba(20, 24, 33, 0.92);
      -webkit-backdrop-filter: blur(8px);
      backdrop-filter: blur(8px);
      color: rgba(255,255,255,0.92);
      padding: 5px 6px 5px 13px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 999px;
      box-shadow: 0 3px 12px rgba(0,0,0,0.26);
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12.5px;
      max-width: calc(100% - 24px);
      animation: slideUp 0.3s ease-out;
      pointer-events: auto;
    `;

    banner.innerHTML = `
      <span id="sw-update-text" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${tr('pwa.updateAvailable', 'Nuova versione disponibile!')}</span>
      <button id="sw-update-btn" style="
        flex:none;
        background: rgba(255,255,255,0.14);
        color: white;
        border: none;
        padding: 4px 12px;
        border-radius: 999px;
        cursor: pointer;
        font-weight: 600;
        font-size: 12.5px;
        min-height: 28px;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        pointer-events: auto;
      ">${tr('pwa.update', 'Aggiorna')}</button>
      <button id="sw-dismiss-btn" aria-label="${tr('pwa.later', 'Dopo')}" style="
        flex:none;
        background: transparent;
        color: rgba(255,255,255,0.65);
        border: none;
        width: 28px;
        height: 28px;
        line-height: 1;
        font-size: 16px;
        border-radius: 999px;
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        pointer-events: auto;
      ">×</button>
    `;

    ensureBannerAnimationStyle();

    document.body.appendChild(banner);

    const updateBtn = banner.querySelector('#sw-update-btn');
    const dismissBtn = banner.querySelector('#sw-dismiss-btn');
    const updateText = banner.querySelector('#sw-update-text');

    // Gestione click su "Aggiorna"
    updateBtn.addEventListener('click', async () => {
      // Segna subito come gestito e blocca il listener globale di
      // controllerchange: così l'avviso non viene ricreato durante il
      // cambio di controller mentre attendiamo il ricaricamento
      updateHandled = true;
      refreshing = true;

      // Stato "in corso" discreto, la pillola resta visibile ma non invasiva
      updateBtn.remove();
      dismissBtn.remove();
      if (updateText) {
        updateText.textContent = tr('pwa.updating', 'Aggiornamento…');
      }

      try {
        // Se c'è un worker in attesa, dì esplicitamente di prendere il controllo.
        // Questo risolve i casi in cui skipWaiting() durante l'install non è bastato.
        const worker = pendingWorker || (registration && registration.waiting);
        if (worker) {
          // Aspetta che il controller cambi (conferma che il nuovo SW è attivo)
          // prima di ricaricare, con timeout di fallback a 2 secondi
          await Promise.race([
            new Promise(resolve => {
              navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
              worker.postMessage({ type: 'SKIP_WAITING' });
            }),
            new Promise(resolve => setTimeout(resolve, 2000))
          ]);
        }
      } catch (e) {
        // Ignora errori: ricarichiamo comunque
      }

      reloadPage();
    });

    // Gestione chiusura: non riproporre l'avviso in questa sessione
    // (l'aggiornamento è comunque attivo in background al prossimo avvio)
    dismissBtn.addEventListener('click', () => {
      updateHandled = true;
      banner.remove();
    });
  }

  // ===== CONSENSO DOWNLOAD MODELLI 3D =====

  // localStorage può non essere disponibile (es. navigazione privata)
  function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }

  /**
   * Stato del consenso: 'granted' | 'wait' (rifiutato di recente) | 'ask'
   */
  function getModelsConsent() {
    const value = storageGet(MODELS_CONSENT_KEY);
    if (value === 'granted') return 'granted';
    if (value && value.startsWith('denied:')) {
      const deniedAt = parseInt(value.slice(7), 10);
      if (!Number.isNaN(deniedAt) && (Date.now() - deniedAt) < CONSENT_RETRY_MS) {
        return 'wait';
      }
      return 'ask'; // Rifiuto scaduto: riproponi
    }
    return 'ask';
  }

  /**
   * Formatta i byte in MB/GB leggibili
   */
  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return (mb / 1024).toFixed(1).replace('.', ',') + ' GB';
    }
    return Math.max(1, Math.round(mb)) + ' MB';
  }

  /**
   * Legge dal catalogo quanti modelli ci sono e quanto spazio occupano.
   * Restituisce null se il catalogo non è raggiungibile (il banner
   * viene mostrato comunque, senza cifre).
   */
  async function fetchModelsInfo() {
    try {
      const response = await fetch(CATALOG_ASSETS_URL, { credentials: 'same-origin' });
      if (!response.ok) return null;
      const data = await response.json();
      if (!data || !Array.isArray(data.assets)) return null;

      let modelCount = 0;
      let totalBytes = 0;
      for (const asset of data.assets) {
        if (typeof asset !== 'object' || !asset.path) continue;
        totalBytes += (typeof asset.size === 'number') ? asset.size : 0;
        if (/\.(glb|gltf|obj)$/i.test(asset.path)) modelCount++;
      }
      if (modelCount === 0) return null;
      return { modelCount, totalBytes };
    } catch {
      return null;
    }
  }

  /**
   * Invia al SW la richiesta di scaricare/aggiornare i modelli.
   * force:false → aggiornamento incrementale (scarica solo file nuovi/modificati)
   */
  function requestModelsDownload() {
    const message = { type: 'CACHE_MODELS', force: false };
    if (registration && registration.active) {
      registration.active.postMessage(message);
      return true;
    }
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
      return true;
    }
    return false;
  }

  /**
   * Chiede al browser di non sfrattare la cache sotto pressione di spazio:
   * senza, Chrome tratta lo storage come "best effort" e può cancellare i
   * modelli scaricati per l'uso offline senza avvisare. Va chiamata durante
   * un gesto dell'utente (il clic sul consenso), dove è più probabile che
   * venga concessa.
   */
  function requestPersistentStorage() {
    try {
      navigator.storage?.persist?.().catch(() => {});
    } catch {}
  }

  /**
   * Stile condiviso dell'animazione dei banner (iniettato una sola volta)
   */
  function ensureBannerAnimationStyle() {
    if (document.getElementById('sw-banner-animation')) return;
    const style = document.createElement('style');
    style.id = 'sw-banner-animation';
    style.textContent = `
      @keyframes slideUp {
        from { transform: translateX(-50%) translateY(100px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Sostituisce il contenuto del banner con un breve messaggio che rimanda alla
   * pagina della cache per seguire l'avanzamento, poi lo fa scomparire.
   * Il download vero e proprio prosegue in background nel service worker: qui
   * non mostriamo alcuna barra di avanzamento (la si vede in «Stato cache»).
   */
  function showDownloadStartedMessage(banner) {
    const ask = banner.querySelector('#sw-models-ask');
    if (ask) ask.style.display = 'none';
    const meta = banner.querySelector('#sw-models-meta');
    if (meta) meta.style.display = 'none';

    const title = banner.querySelector('#sw-models-title');
    if (title) title.textContent = '✓ ' + tr('pwa.modelsDownloadStarted', 'Download avviato');

    const hint = banner.querySelector('#sw-models-hint');
    if (hint) {
      hint.textContent = '';
      const link = document.createElement('a');
      link.href = 'status.php';
      link.style.cssText = 'color:inherit; text-decoration:underline;';
      link.textContent = tr('pwa.modelsDownloadStartedHint', "Puoi seguire l'avanzamento nella pagina «Stato cache».");
      hint.appendChild(link);
    }

    setTimeout(() => {
      banner.style.transition = 'opacity 0.5s';
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 500);
    }, 4000);
  }

  /**
   * Mostra il banner dei modelli 3D.
   * Stile coerente con il banner di aggiornamento (showUpdateNotification).
   * @param {{modelCount: number, totalBytes: number}|null} info
   */
  function showModelsConsentBanner(info) {
    // Evita duplicati
    if (document.getElementById('sw-models-consent-banner')) return;
    // Se il banner di aggiornamento è già visibile, rimuovilo per evitare
    // sovrapposizioni: l'aggiornamento verrà riproposto al prossimo avvio
    const updateBanner = document.getElementById('sw-update-banner');
    if (updateBanner) updateBanner.remove();
    // Su status.php c'è già la gestione completa della cache: niente banner
    if (document.getElementById('models-consent')) return;

    const sizeLabel = info ? formatBytes(info.totalBytes) : '';
    const metaText = info
      ? tr('pwa.modelsConsentInfo', '{count} modelli · ~{size} di spazio')
          .replace('{count}', String(info.modelCount))
          .replace('{size}', sizeLabel)
      : '';
    const acceptLabel = tr('pwa.modelsConsentAccept', 'Scarica tutto') + (sizeLabel ? ` (${sizeLabel})` : '');

    const banner = document.createElement('div');
    banner.id = 'sw-models-consent-banner';
    banner.style.cssText = `
      position: fixed;
      bottom: calc(56px + env(safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%);
      background: rgba(20, 24, 33, 0.92);
      -webkit-backdrop-filter: blur(8px);
      backdrop-filter: blur(8px);
      color: rgba(255,255,255,0.92);
      padding: 10px 12px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      box-shadow: 0 3px 12px rgba(0,0,0,0.26);
      z-index: 10000;
      width: min(340px, calc(100% - 24px));
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12.5px;
      animation: slideUp 0.3s ease-out;
      pointer-events: auto;
    `;

    banner.innerHTML = `
      <div style="min-width:0;">
        <div id="sw-models-title" style="font-weight:600; line-height:1.3;">${tr('pwa.modelsConsentTitle', "Vuoi salvare i modelli 3D per l'uso offline?")}</div>
        <div id="sw-models-meta" style="margin-top:2px; font-size:11.5px; opacity:0.75; font-variant-numeric:tabular-nums;">${metaText}</div>
        <div id="sw-models-hint" style="margin-top:2px; font-size:11px; opacity:0.6;">${tr('pwa.modelsConsentHint', 'Potrai esplorare le grotte anche senza connessione.')}</div>
      </div>
      <div id="sw-models-ask">
        <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
          <button id="sw-models-accept-btn" style="
            background: rgba(255,255,255,0.16); color: #fff; border: none;
            padding: 6px 12px; border-radius: 8px; cursor: pointer;
            font-weight: 600; font-size: 12.5px; min-height: 32px;
            touch-action: manipulation; user-select: none; -webkit-user-select: none;
            pointer-events: auto;
          ">${acceptLabel}</button>
          <button id="sw-models-later-btn" style="
            background: transparent; color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.22);
            padding: 6px 12px; border-radius: 8px; cursor: pointer;
            font-size: 12.5px; min-height: 32px;
            touch-action: manipulation; user-select: none; -webkit-user-select: none;
            pointer-events: auto;
          ">${tr('pwa.modelsConsentLater', 'Non ora')}</button>
        </div>
      </div>
    `;

    ensureBannerAnimationStyle();

    document.body.appendChild(banner);

    banner.querySelector('#sw-models-accept-btn').addEventListener('click', () => {
      storageSet(MODELS_CONSENT_KEY, 'granted');
      requestPersistentStorage();

      // Avvia il download (se il SW non è ancora pronto, partirà al prossimo
      // avvio: il consenso è comunque salvato). Non mostriamo la barra di
      // avanzamento: l'utente può seguirla nella pagina «Stato cache».
      requestModelsDownload();
      showDownloadStartedMessage(banner);
    });

    banner.querySelector('#sw-models-later-btn').addEventListener('click', () => {
      storageSet(MODELS_CONSENT_KEY, 'denied:' + Date.now());
      banner.remove();
    });
  }

  /**
   * Applica lo stato del consenso all'avvio:
   * - granted → aggiornamento incrementale silenzioso dei modelli
   * - ask     → mostra il banner (con conteggio e peso dal catalogo)
   * - wait    → non fare nulla (rifiutato di recente)
   */
  async function handleModelsConsent() {
    const consent = getModelsConsent();

    if (consent === 'granted') {
      requestModelsDownload();
      return;
    }
    if (consent !== 'ask') return;

    const info = await fetchModelsInfo();
    // Mostra il banner CONSENT_BANNER_DELAY ms dopo la visita della pagina
    // (al netto del tempo già trascorso per registrazione SW e fetch catalogo)
    const remainingDelay = Math.max(0, CONSENT_BANNER_DELAY - (Date.now() - PAGE_LOAD_TIME));
    setTimeout(() => showModelsConsentBanner(info), remainingDelay);
  }

  /**
   * Ricarica la pagina
   */
  function reloadPage() {
    refreshing = true;
    window.location.reload();
  }

  /**
   * Gestisce l'evento di aggiornamento del SW
   */
  function onUpdateFound(reg) {
    const newWorker = reg.installing;

    console.log('PWA: Nuova versione del Service Worker in installazione...');

    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // Nuovo service worker installato, c'è ancora uno vecchio attivo
        console.log('PWA: Nuova versione pronta!');
        showUpdateNotification(newWorker);
      } else if (newWorker.state === 'activated') {
        console.log('PWA: Service Worker aggiornato e attivato');
      }
    });
  }

  /**
   * Gestisce messaggi dal Service Worker
   */
  function handleServiceWorkerMessage(event) {
    if (!event.data || !event.data.type) return;

    console.log('PWA: Messaggio ricevuto dal SW:', event.data.type);

    switch (event.data.type) {
      case 'SW_UPDATED':
        console.log('PWA: Service Worker aggiornato alla versione:', event.data.version);
        break;

      case 'CACHE_UPDATED':
        console.log('PWA: Cache aggiornata');
        break;

      case 'MODELS_CACHE_PROGRESS':
        // Nessuna barra di avanzamento in-app: il download prosegue in
        // background e l'utente può seguirlo nella pagina «Stato cache».
        console.log('PWA: Download modelli', event.data.done, '/', event.data.total);
        break;

      case 'MODELS_CACHE_DONE':
        if (event.data.quotaExceeded) {
          console.warn('PWA: Spazio di archiviazione esaurito, alcuni modelli non sono disponibili offline');
        }
        console.log('PWA: Download modelli completato');
        break;

      default:
        console.log('PWA: Messaggio sconosciuto:', event.data);
    }
  }

  /**
   * Controlla aggiornamenti del Service Worker
   */
  async function checkForUpdates() {
    if (!registration) return;

    try {
      await registration.update();
      console.log('PWA: Controllo aggiornamenti completato');
    } catch (error) {
      console.warn('PWA: Errore controllo aggiornamenti:', error);
    }
  }

  /**
   * Registra il Service Worker
   */
  async function registerServiceWorker() {
    try {
      registration = await navigator.serviceWorker.register(SW_PATH, {
        scope: './', // Scope relativo alla cartella corrente (evita problemi CORS con www/non-www)
        updateViaCache: 'none' // Forza sempre il controllo di aggiornamenti
      });

      console.log('PWA: Service Worker registrato con successo');

      // Gestione aggiornamenti
      registration.addEventListener('updatefound', () => onUpdateFound(registration));

      // Controlla se c'è già un aggiornamento in attesa (es. tab riaperta dopo un update)
      if (registration.waiting) {
        console.log('PWA: Service Worker in attesa rilevato');
        showUpdateNotification(registration.waiting);
      }

      // Controlla aggiornamenti periodicamente
      setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);

      // Ascolta messaggi dal Service Worker
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

      // Gestione cambio controller
      // NON ricaricare automaticamente: l'utente potrebbe avere lavoro non salvato
      // (es. misurazioni in corso nel viewer 3D)
      // Mostra il banner SOLO se c'era già un controller precedente (aggiornamento reale,
      // non primo install)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        console.log('PWA: Controller cambiato, nuova versione attiva');
        if (hadController) {
          showUpdateNotification(null);
        }
        // Aggiorna il flag: d'ora in poi qualsiasi cambio è un aggiornamento reale
        hadController = true;
      });

      // Dopo la registrazione, il controller è impostato (o lo sarà presto)
      // Aggiorna il flag al momento opportuno
      if (navigator.serviceWorker.controller) {
        hadController = true;
      }

      return registration;
    } catch (error) {
      console.error('PWA: Errore registrazione Service Worker:', error);
      throw error;
    }
  }

  /**
   * Inizializza la PWA
   */
  async function init() {
    try {
      await registerServiceWorker();

      // Attendi che il service worker sia pronto
      const reg = await navigator.serviceWorker.ready;
      console.log('PWA: Service Worker pronto');

      // Consenso download modelli: aggiorna se già concesso, altrimenti chiedi
      handleModelsConsent();

      // Esporta funzioni utili per debug
      if (typeof window !== 'undefined') {
        window.pwaDebug = {
          registration: reg,
          checkUpdates: checkForUpdates,
          unregister: async () => {
            const result = await reg.unregister();
            console.log('PWA: Service Worker disregistrato:', result);
            return result;
          },
          cacheModels: () => {
            if (reg.active) {
              reg.active.postMessage({ type: 'CACHE_MODELS' });
              console.log('PWA: Richiesta cache modelli inviata');
            }
          },
          cacheAll: () => {
            if (reg.active) {
              reg.active.postMessage({ type: 'CACHE_ALL' });
              console.log('PWA: Richiesta cache completa inviata');
            }
          },
          clearCache: () => {
            if (reg.active) {
              reg.active.postMessage({ type: 'CLEAR_CACHE' });
              console.log('PWA: Richiesta pulizia cache inviata');
            }
          },
          resetModelsConsent: () => {
            try { localStorage.removeItem(MODELS_CONSENT_KEY); } catch {}
            console.log('PWA: Consenso download modelli azzerato');
          }
        };
        console.log('PWA: Debug utilities disponibili in window.pwaDebug');
      }
    } catch (error) {
      console.error('PWA: Errore inizializzazione:', error);
    }
  }

  // Avvia quando il DOM è pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
