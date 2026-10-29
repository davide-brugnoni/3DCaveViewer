document.addEventListener('DOMContentLoaded', async function() {
    // Inizializza i18n
    if (window.i18n) {
        await window.i18n.init();
    }

    // Helper per ottenere traduzione con fallback a config
    const getText = (i18nKey, configKey, defaultValue) => {
        if (window.t) {
            const translated = window.t(i18nKey);
            if (translated && translated !== i18nKey) return translated;
        }
        const cfg = window.APP_CONFIG || {};
        const parts = configKey.split('.');
        let value = cfg;
        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return defaultValue;
            }
        }
        return value || defaultValue;
    };

    // Carica configurazione (con fallback ai valori di default)
    const cfg = window.APP_CONFIG || {};
    const mapCfg = cfg.map || {};
    const pathsCfg = cfg.paths || {};

    // Valori dalla configurazione con fallback
    const mapCenter = mapCfg.center || [43.351726, 12.579768];
    const defaultZoom = mapCfg.defaultZoom || 16;
    const minZoom = mapCfg.minZoom || 8;
    const flyToZoom = mapCfg.flyToZoom || 17;
    const bounds = Array.isArray(mapCfg.bounds) ? mapCfg.bounds : null;
    const tileUrl = mapCfg.tileUrl || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const attribution = mapCfg.attribution || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    const catalogApi = pathsCfg.catalogApi || 'api/catalogo.php';
    const modelsFolder = String(pathsCfg.modelsFolder || 'modelli').replace(/^\/+|\/+$/g, '');

    // Testi con supporto i18n
    const popupLinkText = getText('homepage.popupLinkText', 'texts.popupLinkText', 'Apri Modello 3D');
    const emptyCatalogMessage = getText('homepage.emptyCatalogMessage', 'texts.emptyCatalogMessage', 'Non ci sono ancora modelli 3D.');
    const noCoordinatesText = getText('homepage.noCoordinates', 'texts.noCoordinatesText', 'Posizione GPS non disponibile');
    const loadErrorMessage = getText('homepage.loadErrorMessage', 'texts.loadErrorMessage', 'Impossibile caricare i dati dei modelli.');

    // 1. Inizializzazione della mappa Leaflet
    // I limiti sono il rettangolo oltre il quale la mappa non si sposta — è
    // quello che promette la sezione [map] di custom/settings.ini — quindi
    // vanno passati a setMaxBounds, non a un fitBounds che la riga successiva
    // annullerebbe comunque con setView. Senza limiti configurati la mappa
    // resta libera: un rettangolo di default bloccherebbe fuori dai propri
    // confini chi ha le cavità altrove.
    const mapOptions = bounds
        ? { maxBounds: L.latLngBounds(bounds), maxBoundsViscosity: 0.7 }
        : {};
    const map = L.map('map', mapOptions);
    map.setMinZoom(minZoom);
    map.setView(mapCenter, defaultZoom);

    // 2. Aggiunta del layer della mappa (tile layer)
    // maxZoom esplicito: oltre il 19 le tessere di OpenStreetMap non esistono
    // e senza questo limite Leaflet si fermerebbe al suo default (18).
    const tileLayer = L.tileLayer(tileUrl, {
        attribution: attribution,
        maxZoom: mapCfg.maxZoom || 19
    }).addTo(map);

    // Mappa offline: solo la vista standard (centro e zoom configurati, cioè
    // quella che si vede aprendo la pagina), con un margine di una tessera per
    // coprire la rotazione dello schermo. Le zone viste spostando o zoomando
    // la mappa non vengono salvate: crescerebbero senza limite e la policy di
    // OpenStreetMap non consente di scaricarne in blocco.
    // Il calcolo avviene adesso, prima di qualsiasi interazione.
    function standardViewTileUrls() {
        const zoom = map.getZoom();
        const tileSize = tileLayer.getTileSize();
        const bounds = map.getPixelBounds();
        const maxIndex = Math.pow(2, zoom) - 1;
        const minX = Math.max(0, Math.floor(bounds.min.x / tileSize.x) - 1);
        const maxX = Math.min(maxIndex, Math.floor(bounds.max.x / tileSize.x) + 1);
        const minY = Math.max(0, Math.floor(bounds.min.y / tileSize.y) - 1);
        const maxY = Math.min(maxIndex, Math.floor(bounds.max.y / tileSize.y) + 1);
        const urls = [];
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const coords = L.point(x, y);
                coords.z = zoom;
                urls.push(tileLayer.getTileUrl(coords));
            }
        }
        return urls;
    }
    if ('serviceWorker' in navigator) {
        let tileUrls = [];
        try { tileUrls = standardViewTileUrls(); } catch { tileUrls = []; }
        // Tetto di sicurezza: uno schermo molto grande non deve trasformarsi
        // in un download di centinaia di tessere
        if (tileUrls.length > 0 && tileUrls.length <= 80) {
            navigator.serviceWorker.ready.then((registration) => {
                registration.active?.postMessage({ type: 'CACHE_MAP_TILES', urls: tileUrls });
            }).catch(() => {});
        }
    }

    const poiList = document.getElementById('poi-list');
    const searchInput = document.getElementById('cave-search');
    const searchClear = document.getElementById('cave-search-clear');
    const markers = {};

    // Prefetch del modello 3D quando l'utente apre il popup di una cavità:
    // anticipa il download prima della navigazione verso viewer.php
    const prefetchedFolders = new Set();
    function prefetchModel(poi) {
        if (!poi.folder || !poi.file || !/\.(glb|gltf)$/i.test(poi.file)) return;
        if (prefetchedFolders.has(poi.folder)) return;
        // Rispetta risparmio dati e connessioni lente
        const conn = navigator.connection;
        if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return;
        // Su telefono e tablet il prefetch parte solo con Wi-Fi accertato: un
        // modello può pesare 100 MB, e basterebbe aprire un popup per
        // consumarli dal piano dati (spesso per poi non aprire il viewer)
        const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (coarse && (!conn || conn.type !== 'wifi')) return;
        prefetchedFolders.add(poi.folder);
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'fetch';
        link.crossOrigin = 'anonymous';
        link.href = `${modelsFolder}/${encodeURIComponent(poi.folder)}/${encodeURIComponent(poi.file)}`;
        document.head.appendChild(link);
    }

    // Testi ricerca con supporto i18n
    const noResultsMessage = getText('homepage.noResults', 'texts.noResults', 'Nessuna cavità trovata.');

    // Array per tenere traccia di tutti i POI renderizzati (per il filtro)
    const poiEntries = [];

    // Testi stato caricamento/errore con supporto i18n
    const loadingMessage = getText('homepage.loading', 'texts.loading', 'Caricamento cavità…');
    const retryLabel = getText('homepage.retry', 'texts.retry', 'Riprova');

    // Placeholder con spinner mostrato durante il fetch del catalogo
    function showListLoading() {
        poiList.textContent = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'poi-loading';
        const spinner = document.createElement('span');
        spinner.className = 'poi-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        wrapper.appendChild(spinner);
        const msg = document.createElement('p');
        msg.textContent = loadingMessage;
        wrapper.appendChild(msg);
        poiList.appendChild(wrapper);
    }

    // Messaggio di errore con pulsante Riprova
    function showListError() {
        poiList.textContent = '';
        const errWrapper = document.createElement('div');
        errWrapper.className = 'poi-item poi-error';
        const errMsg = document.createElement('p');
        errMsg.textContent = loadErrorMessage;
        errWrapper.appendChild(errMsg);
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'retry-btn';
        retryBtn.textContent = retryLabel;
        retryBtn.addEventListener('click', loadCatalog);
        errWrapper.appendChild(retryBtn);
        poiList.appendChild(errWrapper);
    }

    // 3. Caricamento dei dati dal catalogo dei modelli (richiamabile dal pulsante Riprova)
    function loadCatalog() {
        showListLoading();

        // Rimuovi marker ed entry di un eventuale tentativo precedente
        poiEntries.forEach(entry => {
            if (map.hasLayer(entry.marker)) {
                map.removeLayer(entry.marker);
            }
        });
        poiEntries.length = 0;

        fetch(catalogApi)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                poiList.textContent = '';
                // Nella lista entrano tutti i modelli; solo quelli con
                // coordinate GPS valide hanno anche un marker sulla mappa.
                const pois = (Array.isArray(data) ? data : [])
                    .filter(poi => poi && typeof poi.folder === 'string' && poi.folder !== '')
                    .map(poi => ({ ...poi, name: String(poi.name || poi.folder) }));
                // Ordina le cavità in ordine alfabetico per nome
                pois.sort((a, b) => a.name.localeCompare(b.name));

                if (pois.length === 0) {
                    poiList.textContent = '';
                    const emptyWrapper = document.createElement('div');
                    emptyWrapper.className = 'poi-item';
                    const emptyMsg = document.createElement('p');
                    emptyMsg.textContent = emptyCatalogMessage;
                    emptyWrapper.appendChild(emptyMsg);
                    poiList.appendChild(emptyWrapper);
                    return;
                }

                pois.forEach(poi => {
                    const hasCoords = Number.isFinite(poi.lat) && Number.isFinite(poi.lon);

                    // Link per aprire il viewer 3D con il modello corretto
                    const viewerLink = `viewer.php?m=${encodeURIComponent(poi.folder)}`;

                    if (!hasCoords) {
                        // Senza coordinate: niente marker, il click apre
                        // direttamente il viewer.
                        const listItem = document.createElement('a');
                        listItem.className = 'poi-item poi-item-no-coords';
                        listItem.href = viewerLink;
                        listItem.setAttribute('data-folder', poi.folder);

                        const listTitle = document.createElement('h3');
                        listTitle.textContent = poi.name;
                        listItem.appendChild(listTitle);

                        const listNote = document.createElement('p');
                        listNote.textContent = noCoordinatesText;
                        listItem.appendChild(listNote);

                        poiList.appendChild(listItem);
                        poiEntries.push({
                            name: poi.name.toLowerCase(),
                            description: (poi.description || '').toLowerCase(),
                            folder: poi.folder,
                            element: listItem,
                            marker: null
                        });
                        return;
                    }

                    const position = [poi.lat, poi.lon];

                    // 4. Creazione sicura del contenuto per il popup del marker (XSS protection)
                    const popupDiv = document.createElement('div');

                    const popupTitle = document.createElement('h3');
                    popupTitle.textContent = poi.name;
                    popupDiv.appendChild(popupTitle);

                    if (poi.description) {
                        const popupDesc = document.createElement('p');
                        popupDesc.textContent = poi.description;
                        popupDiv.appendChild(popupDesc);
                    }

                    const popupLink = document.createElement('a');
                    popupLink.href = viewerLink;
                    popupLink.className = 'popup-link';
                    popupLink.textContent = popupLinkText;
                    popupDiv.appendChild(popupLink);

                    // 5. Creazione del marker sulla mappa
                    const marker = L.marker(position)
                        .addTo(map)
                        .bindPopup(popupDiv);

                    // Il popup aperto segnala l'intento di visitare il viewer
                    marker.on('popupopen', () => prefetchModel(poi));

                    // Salva il riferimento al marker
                    markers[poi.folder] = marker;

                    // 6. Creazione sicura dell'elemento nella lista laterale (XSS protection)
                    const listItem = document.createElement('div');
                    listItem.className = 'poi-item';
                    listItem.setAttribute('data-folder', poi.folder);

                    const listTitle = document.createElement('h3');
                    listTitle.textContent = poi.name;
                    listItem.appendChild(listTitle);

                    const listCoords = document.createElement('p');
                    listCoords.textContent = `GPS: ${poi.lat.toFixed(4)}, ${poi.lon.toFixed(4)}`;
                    listItem.appendChild(listCoords);

                    // Aggiungi un evento click per centrare la mappa e aprire il popup
                    listItem.addEventListener('click', () => {
                        map.flyTo(position, flyToZoom);
                        marker.openPopup();
                    });

                    poiList.appendChild(listItem);

                    // Salva riferimento per il filtro ricerca
                    poiEntries.push({
                        name: poi.name.toLowerCase(),
                        description: (poi.description || '').toLowerCase(),
                        folder: poi.folder,
                        element: listItem,
                        marker: marker
                    });
                });
            })
            .catch(error => {
                console.error('Errore nel caricamento dei modelli:', error);
                showListError();
            });
    }

    loadCatalog();

    // 7. Logica di ricerca e filtro
    let noResultsEl = null;

    function filterCaves(query) {
        const q = query.toLowerCase().trim();

        // Mostra/nascondi pulsante clear
        if (searchClear) {
            searchClear.classList.toggle('visible', q.length > 0);
        }

        // Rimuovi messaggio "nessun risultato" precedente
        if (noResultsEl) {
            noResultsEl.remove();
            noResultsEl = null;
        }

        if (poiEntries.length === 0) return;

        let visibleCount = 0;

        poiEntries.forEach(entry => {
            const matches = q === '' || entry.name.includes(q) || entry.description.includes(q);

            // Mostra/nascondi elemento nella lista
            entry.element.style.display = matches ? '' : 'none';

            if (matches) visibleCount++;

            // Mostra/nascondi marker sulla mappa (i modelli senza
            // coordinate non ne hanno)
            if (!entry.marker) return;
            if (matches) {
                if (!map.hasLayer(entry.marker)) {
                    entry.marker.addTo(map);
                }
            } else {
                if (map.hasLayer(entry.marker)) {
                    map.removeLayer(entry.marker);
                }
            }
        });

        // Mostra messaggio se nessun risultato
        if (visibleCount === 0 && q !== '') {
            noResultsEl = document.createElement('div');
            noResultsEl.className = 'no-results-message';
            noResultsEl.textContent = noResultsMessage;
            poiList.appendChild(noResultsEl);
        }
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            filterCaves(searchInput.value);
        });
    }

    if (searchClear) {
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            filterCaves('');
            searchInput.focus();
        });
    }

    // Cache status indicator
    updateCacheStatus();
});

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
