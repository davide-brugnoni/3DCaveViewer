/*
  3D Cave Viewer - Installazione guidata (interfaccia)
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

(function () {
    'use strict';

    // Segnala subito che JS è attivo: la classe governa sia la navigazione a
    // passi sia i comandi che senza JS non funzionerebbero (.setup-js-only).
    document.body.classList.add('setup-js');

    // ------------------------------------------------------------
    // Copia negli appunti e download di un testo
    // ------------------------------------------------------------
    function flash(button) {
        const original = button.textContent;
        button.textContent = '✓';
        setTimeout(function () { button.textContent = original; }, 1500);
    }

    function copyText(button, text, selectable) {
        if (selectable && selectable.select) {
            selectable.select();
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { flash(button); }, function () {});
        } else if (document.execCommand('copy')) {
            flash(button);
        }
    }

    // Il file nasce da un Blob invece che da un data: URI perché la CSP della
    // pagina non ammette sorgenti esterne e i download da data: sono bloccati
    // da diversi browser.
    function downloadText(filename, text) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    // ------------------------------------------------------------
    // Salvataggio manuale: copia e download dell'INI
    // ------------------------------------------------------------
    const manualIni = document.getElementById('manual-ini');
    const copyBtn = document.getElementById('copy-ini');
    if (copyBtn && manualIni) {
        copyBtn.addEventListener('click', function () {
            copyText(copyBtn, manualIni.value, manualIni);
        });
    }

    const downloadIniBtn = document.getElementById('download-ini');
    if (downloadIniBtn && manualIni) {
        downloadIniBtn.addEventListener('click', function () {
            downloadText(downloadIniBtn.dataset.filename || 'settings.ini', manualIni.value);
            flash(downloadIniBtn);
        });
    }

    // ------------------------------------------------------------
    // Chiave di configurazione: copia e download
    // ------------------------------------------------------------
    // Il file scaricato è identico a custom/.installed: le righe di commento
    // spiegano a cosa serve, l'ultima riga è la chiave. Può essere ricaricato
    // qui nella schermata di blocco oppure messo sul server così com'è.
    const keyEl = document.getElementById('install-key');
    const keyFileEl = document.getElementById('install-key-file');

    const copyKeyBtn = document.getElementById('copy-key');
    if (copyKeyBtn && keyEl) {
        copyKeyBtn.addEventListener('click', function () {
            copyText(copyKeyBtn, keyEl.textContent.trim(), null);
        });
    }

    const downloadKeyBtn = document.getElementById('download-key');
    if (downloadKeyBtn && keyFileEl) {
        downloadKeyBtn.addEventListener('click', function () {
            downloadText(downloadKeyBtn.dataset.filename || 'chiave.txt', keyFileEl.value);
            flash(downloadKeyBtn);
        });
    }

    // ------------------------------------------------------------
    // Schermata di blocco: la chiave si digita o si ricarica da file
    // ------------------------------------------------------------
    // Il file non viene inviato al server: si legge qui e si compila il campo,
    // così il form resta una POST normale senza allegati.
    const unlockFile = document.getElementById('unlock-file');
    const unlockKey = document.getElementById('unlock-key');
    const unlockFileState = document.getElementById('unlock-file-state');
    if (unlockFile && unlockKey) {
        unlockFile.addEventListener('change', function () {
            const file = unlockFile.files && unlockFile.files[0];
            if (!file) {
                return;
            }
            const reader = new FileReader();
            reader.onload = function () {
                // Stesso formato letto da parseInstallKey() in config.php:
                // la prima riga che non sia vuota né un commento.
                const lines = String(reader.result).split(/\r\n|\r|\n/);
                let found = '';
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line && line[0] !== ';' && line[0] !== '#') {
                        found = line;
                        break;
                    }
                }
                unlockKey.value = found;
                if (unlockFileState) {
                    unlockFileState.dataset.state = found ? 'ok' : 'error';
                    unlockFileState.textContent = found
                        ? (unlockFile.dataset.okText || 'Chiave letta dal file.')
                        : (unlockFile.dataset.errorText || 'Nessuna chiave trovata nel file.');
                }
            };
            reader.readAsText(file);
        });
    }

    const form = document.getElementById('setup-form');
    if (!form) {
        return;
    }

    // ------------------------------------------------------------
    // Navigazione tra i passi
    // ------------------------------------------------------------
    const steps = Array.prototype.slice.call(form.querySelectorAll('.setup-step'));
    const chips = Array.prototype.slice.call(document.querySelectorAll('.setup-chip'));
    const progress = document.getElementById('setup-progress');
    const prevBtn = document.getElementById('setup-prev');
    const nextBtn = document.getElementById('setup-next');
    let current = 0;

    function showStep(index) {
        current = Math.max(0, Math.min(steps.length - 1, index));

        steps.forEach(function (step, i) {
            step.classList.toggle('is-active', i === current);
        });
        chips.forEach(function (chip, i) {
            chip.classList.toggle('is-active', i === current);
            chip.setAttribute('aria-selected', i === current ? 'true' : 'false');
        });

        if (progress) {
            progress.style.width = ((current + 1) / steps.length * 100) + '%';
        }
        if (prevBtn) {
            prevBtn.disabled = current === 0;
        }
        if (nextBtn) {
            nextBtn.hidden = current === steps.length - 1;
        }

        if (steps[current] && steps[current].dataset.step === 'map') {
            initMap();
        }
        if (steps[current] && steps[current].dataset.step === 'summary') {
            buildSummary();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    chips.forEach(function (chip, i) {
        chip.addEventListener('click', function () {
            validateStep(steps[current]);
            showStep(i);
        });
    });
    if (prevBtn) {
        prevBtn.addEventListener('click', function () { showStep(current - 1); });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', function () {
            // Avanti solo con il passo corrente in ordine: correggere adesso
            // costa meno che accorgersi alla fine che un valore è stato
            // scartato. Le linguette in alto restano libere.
            const bad = validateStep(steps[current]);
            if (bad) {
                if (bad.focus) {
                    bad.focus();
                }
                return;
            }
            showStep(current + 1);
        });
    }

    // ------------------------------------------------------------
    // Colori: anteprima dal vivo sulla pagina stessa
    // ------------------------------------------------------------
    const PRESETS = {
        dark: {
            accentColor: '#0696af', accentHover: '#1ebfd7', bgColor: '#0d1117',
            panelBgSolid: '#161b22', textColor: '#e0e0e0',
            themeColor: '#0b0d10', pwaBackground: '#0f1b2a'
        },
        blue: {
            accentColor: '#4c7dff', accentHover: '#7aa0ff', bgColor: '#0b1020',
            panelBgSolid: '#141b33', textColor: '#e6e9f5',
            themeColor: '#0b1020', pwaBackground: '#141b33'
        },
        warm: {
            accentColor: '#d98324', accentHover: '#f0a04b', bgColor: '#171310',
            panelBgSolid: '#241d18', textColor: '#efe6dc',
            themeColor: '#171310', pwaBackground: '#241d18'
        }
    };

    const colorInputs = Array.prototype.slice.call(form.querySelectorAll('input[type="color"]'));

    function applyColor(input) {
        const cssVar = input.dataset.cssVar;
        if (cssVar) {
            document.documentElement.style.setProperty(cssVar, input.value);
        }
        const label = input.parentNode.querySelector('.setup-color-value');
        if (label) {
            label.textContent = input.value;
        }
    }

    colorInputs.forEach(function (input) {
        applyColor(input);
        input.addEventListener('input', function () { applyColor(input); });
    });

    document.querySelectorAll('.setup-preset').forEach(function (button) {
        button.addEventListener('click', function () {
            const preset = PRESETS[button.dataset.preset];
            if (!preset) {
                return;
            }
            Object.keys(preset).forEach(function (name) {
                const input = document.getElementById('f-' + name);
                if (input) {
                    input.value = preset[name];
                    applyColor(input);
                }
            });
        });
    });

    // ------------------------------------------------------------
    // Anteprima del logo scelto
    // ------------------------------------------------------------
    const logoInput = document.getElementById('f-logo');
    const logoPreview = document.getElementById('logo-preview');
    const logoPreviewImg = document.getElementById('logo-preview-img');
    if (logoInput && logoPreview && logoPreviewImg) {
        logoInput.addEventListener('change', function () {
            const file = logoInput.files && logoInput.files[0];
            if (!file) {
                logoPreview.hidden = true;
                return;
            }
            const reader = new FileReader();
            reader.onload = function () {
                logoPreviewImg.src = String(reader.result);
                logoPreview.hidden = false;
            };
            reader.readAsDataURL(file);
        });
    }

    // ------------------------------------------------------------
    // Mappa: il centro si sceglie qui, i tre zoom si provano dal vivo
    // ------------------------------------------------------------
    // I limiti di spostamento non si impostano più da questo passo: la mappa
    // serve a dire "il mio gruppo lavora qui", non a chiudere la homepage
    // dentro un rettangolo.
    const mapEl = document.getElementById('setup-map');
    const latField = document.getElementById('f-mapLat');
    const lonField = document.getElementById('f-mapLon');
    const zoomState = document.getElementById('map-zoom-state');
    const centerState = document.getElementById('map-center-state');
    const zoomInputs = Array.prototype.slice.call(document.querySelectorAll('[data-zoom-field]'));
    let map = null;
    let marker = null;
    let maxZoom = 19;

    // Campo di zoom che la mappa sta mostrando, e bandierina per non
    // riscrivere quel campo mentre è lui a muovere la mappa (chi sta ancora
    // digitando si vedrebbe cambiare il numero sotto le dita).
    let activeZoom = null;
    let zoomFromField = false;

    function round(value) {
        return Math.round(value * 1e6) / 1e6;
    }

    function clampZoom(value) {
        const number = Number(String(value).trim());
        if (value === '' || !isFinite(number)) {
            return null;
        }
        return Math.max(0, Math.min(maxZoom, Math.round(number)));
    }

    function zoomLabel(input) {
        const label = input.parentNode ? input.parentNode.querySelector('label') : null;
        return label ? label.textContent.trim() : '';
    }

    // Il numero da solo non dice niente: la mappa mostra il livello, questa
    // riga dice qual è e a quale dei tre campi corrisponde.
    function updateReadout() {
        if (zoomState) {
            const zoom = map ? map.getZoom() : null;
            zoomState.textContent = zoom === null
                ? ''
                : ((zoomState.dataset.label || '') + ' ' + zoom
                    + (activeZoom ? ' · ' + zoomLabel(activeZoom) : ''));
        }
        if (centerState && latField && lonField) {
            centerState.textContent = (centerState.dataset.label || '')
                + ' ' + latField.value + ', ' + lonField.value;
        }
    }

    function markActiveZoom() {
        zoomInputs.forEach(function (input) {
            const field = input.closest('.setup-field');
            if (field) {
                field.classList.toggle('is-zoom-active', input === activeZoom);
            }
        });
    }

    // Porta la mappa sul livello scritto nel campo: è l'anteprima che rende
    // leggibile un numero come "8".
    function previewZoom(input) {
        activeZoom = input;
        markActiveZoom();

        const zoom = clampZoom(input.value);
        if (map && zoom !== null && zoom !== map.getZoom()) {
            zoomFromField = true;
            map.setZoom(zoom);
        }
        updateReadout();
    }

    zoomInputs.forEach(function (input) {
        input.addEventListener('focus', function () { previewZoom(input); });
        input.addEventListener('input', function () { previewZoom(input); });
        const field = input.closest('.setup-field');
        if (field) {
            field.addEventListener('click', function () { previewZoom(input); });
        }
    });

    function initMap() {
        if (map || !mapEl || typeof L === 'undefined') {
            if (map) {
                map.invalidateSize();
            }
            return;
        }

        const lat = parseFloat(mapEl.dataset.lat) || 0;
        const lon = parseFloat(mapEl.dataset.lon) || 0;
        const zoom = parseInt(mapEl.dataset.zoom, 10) || 16;

        maxZoom = parseInt(mapEl.dataset.maxZoom, 10) || 19;

        map = L.map(mapEl).setView([lat, lon], Math.min(zoom, maxZoom));
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: maxZoom
        }).addTo(map);
        marker = L.marker([lat, lon]).addTo(map);

        map.on('move', function () {
            const center = map.getCenter();
            latField.value = String(round(center.lat));
            lonField.value = String(round(center.lng));
            marker.setLatLng(center);
            updateReadout();
        });

        // Zoom della mappa (rotella, pulsanti, risultato di una ricerca): il
        // campo che si sta guardando segue. Non quando è lui ad aver mosso la
        // mappa: il valore lo sta scrivendo l'utente.
        map.on('zoom', function () {
            if (activeZoom && !zoomFromField) {
                activeZoom.value = String(map.getZoom());
                setFieldError(activeZoom, fieldMessage(activeZoom));
            }
            updateReadout();
        });
        map.on('zoomend', function () {
            zoomFromField = false;
            refreshMapValidation();
        });
        map.on('moveend', refreshMapValidation);

        activeZoom = zoomInputs[0] || null;
        markActiveZoom();
        updateReadout();

        // Il contenitore è appena diventato visibile: Leaflet deve rimisurarlo.
        setTimeout(function () { map.invalidateSize(); }, 60);
    }

    // ------------------------------------------------------------
    // Ricerca dell'indirizzo: il centro senza dover conoscere le coordinate
    // ------------------------------------------------------------
    // Geocodifica di OpenStreetMap (Nominatim). La sua politica d'uso chiede
    // una richiesta al secondo e nessun completamento automatico a ogni
    // tasto: si cerca solo quando l'utente lo chiede, con una pausa fra due
    // richieste. Se la rete non c'è, il passo resta usabile a mano.
    const searchInput = document.getElementById('map-search');
    const searchGo = document.getElementById('map-search-go');
    const searchState = document.getElementById('map-search-state');
    const searchResults = document.getElementById('map-search-results');
    const SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
    const SEARCH_MIN_INTERVAL = 1200;
    let searchTimer = null;
    let lastSearchAt = 0;

    function setSearchState(text, state) {
        if (!searchState) {
            return;
        }
        searchState.dataset.state = state || '';
        searchState.textContent = text;
    }

    function clearResults() {
        if (searchResults) {
            searchResults.textContent = '';
            searchResults.hidden = true;
        }
    }

    function goToPlace(place) {
        if (!map) {
            return;
        }
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        if (!isFinite(lat) || !isFinite(lon)) {
            return;
        }

        // Il riquadro del risultato inquadra il paese invece di piantare la
        // mappa su un punto: lo zoom che ne esce finisce nel campo attivo,
        // dove resta modificabile.
        const box = place.boundingbox;
        if (Array.isArray(box) && box.length === 4 && box.every(function (v) { return isFinite(Number(v)); })) {
            map.fitBounds(
                [[Number(box[0]), Number(box[2])], [Number(box[1]), Number(box[3])]],
                { maxZoom: Math.min(17, maxZoom) }
            );
        } else {
            map.setView([lat, lon], map.getZoom());
        }

        clearResults();
        setSearchState(String(place.display_name || ''), 'ok');
    }

    function renderResults(places) {
        if (!searchResults) {
            return;
        }
        searchResults.textContent = '';
        places.forEach(function (place) {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'setup-search-hit';
            button.textContent = String(place.display_name || '');
            button.addEventListener('click', function () { goToPlace(place); });
            item.appendChild(button);
            searchResults.appendChild(item);
        });
        searchResults.hidden = places.length === 0;
    }

    function fetchPlaces(query) {
        lastSearchAt = Date.now();

        const url = SEARCH_ENDPOINT
            + '?format=jsonv2&limit=5&q=' + encodeURIComponent(query)
            + '&accept-language=' + encodeURIComponent((mapEl && mapEl.dataset.lang) || 'en');

        fetch(url, { headers: { Accept: 'application/json' } })
            .then(function (response) {
                return response.ok ? response.json() : Promise.reject(new Error('http'));
            })
            .then(function (places) {
                if (!Array.isArray(places) || places.length === 0) {
                    clearResults();
                    setSearchState(searchInput.dataset.empty || '', 'error');
                    return;
                }
                setSearchState('', '');
                renderResults(places);
            })
            .catch(function () {
                clearResults();
                setSearchState(searchInput.dataset.failed || '', 'error');
            });
    }

    function runSearch() {
        if (!searchInput || !map) {
            return;
        }
        const query = searchInput.value.trim();
        if (query.length < 3) {
            return;
        }

        clearTimeout(searchTimer);
        setSearchState(searchInput.dataset.searching || '', '');
        const wait = Math.max(0, SEARCH_MIN_INTERVAL - (Date.now() - lastSearchAt));
        searchTimer = setTimeout(function () { fetchPlaces(query); }, wait);
    }

    if (searchGo) {
        searchGo.addEventListener('click', runSearch);
    }
    if (searchInput) {
        // Invio nel campo di ricerca: cerca, non salva il wizard.
        searchInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                runSearch();
            }
        });
    }

    // ------------------------------------------------------------
    // Validazione: gli stessi controlli che rifà setup_lib.php
    // ------------------------------------------------------------
    // Lato server un valore non valido viene scartato in silenzio e la voce
    // torna al default. Qui lo si dice prima, così l'utente può correggere
    // invece di scoprire a cose fatte che il suo valore non è stato preso.
    const MSG = form.dataset;

    function fieldMessage(input) {
        const value = input.value.trim();

        if (value === '') {
            return '';   // campo vuoto = "usa il default", è una scelta valida
        }

        if (input.type === 'url' && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value)) {
            return MSG.msgUrl || '';
        }
        if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return MSG.msgEmail || '';
        }
        if (input.type === 'number') {
            const number = Number(value);
            if (!isFinite(number) || value !== String(value).trim() || Number.isNaN(number)) {
                return MSG.msgNumber || '';
            }
            const min = input.min === '' ? -Infinity : Number(input.min);
            const max = input.max === '' ? Infinity : Number(input.max);
            if (number < min || number > max) {
                return (MSG.msgRange || '')
                    .replace('{min}', input.min)
                    .replace('{max}', input.max);
            }
        }

        // Vincolo GPL v3 sul testo del copyright: deve continuare a citare
        // l'autore originale, esattamente come fa validateSetupValue().
        const mustContain = input.dataset.mustContain;
        if (mustContain && value.toLowerCase().indexOf(mustContain.toLowerCase()) === -1) {
            return (MSG.msgCopyright || '').replace('{author}', mustContain);
        }

        return '';
    }

    function setFieldError(input, message) {
        const field = input.closest('.setup-field');
        if (!field) {
            return;
        }
        let box = field.querySelector('.setup-error');
        if (message === '') {
            if (box) {
                box.remove();
            }
            field.classList.remove('has-error');
            input.removeAttribute('aria-invalid');
            return;
        }
        if (!box) {
            box = document.createElement('span');
            box.className = 'setup-error';
            field.appendChild(box);
        }
        box.textContent = message;
        field.classList.add('has-error');
        input.setAttribute('aria-invalid', 'true');
    }

    function numberOf(id) {
        const input = document.getElementById(id);
        if (!input || input.value.trim() === '') {
            return null;
        }
        const value = Number(input.value);
        return isFinite(value) ? value : null;
    }

    // Controlli che coinvolgono più campi insieme: da soli sarebbero tutti
    // validi, è la combinazione a non stare in piedi.
    function crossFieldErrors() {
        const found = [];

        const minZoom = numberOf('f-minZoom');
        const ceiling = [numberOf('f-defaultZoom'), numberOf('f-flyToZoom')]
            .filter(function (value) { return value !== null; });
        if (minZoom !== null && ceiling.length && minZoom > Math.min.apply(null, ceiling)) {
            found.push({ input: document.getElementById('f-minZoom'), message: MSG.msgMinZoom || '' });
        }

        return found;
    }

    function validateStep(step) {
        let firstBad = null;

        step.querySelectorAll('input').forEach(function (input) {
            if (input.type === 'hidden' || input.type === 'file' || !input.name) {
                return;
            }
            const message = fieldMessage(input);
            setFieldError(input, message);
            if (message && !firstBad) {
                firstBad = input;
            }
        });

        crossFieldErrors().forEach(function (problem) {
            if (problem.input && step.contains(problem.input)) {
                setFieldError(problem.input, problem.message);
                if (!firstBad) {
                    firstBad = problem.input;
                }
            }
        });

        return firstBad;
    }

    // La mappa scrive nei campi nascosti del centro e nel campo dello zoom
    // attivo: la coerenza va ricontrollata a mano, l'evento "input" del form
    // non scatta per un valore cambiato da codice.
    function refreshMapValidation() {
        const mapStep = form.querySelector('.setup-step[data-step="map"]');
        if (mapStep) {
            validateStep(mapStep);
        }
    }

    function validateAll() {
        let firstBadStep = -1;
        let firstBad = null;

        steps.forEach(function (step, index) {
            const bad = validateStep(step);
            if (bad && firstBadStep === -1) {
                firstBadStep = index;
                firstBad = bad;
            }
        });

        if (firstBadStep !== -1) {
            showStep(firstBadStep);
            if (firstBad && firstBad.focus) {
                firstBad.focus();
            }
            return false;
        }

        return true;
    }

    // L'errore sparisce mentre si corregge, non solo al cambio di passo.
    form.addEventListener('input', function (event) {
        const input = event.target;
        if (input.tagName === 'INPUT' && input.type !== 'hidden' && input.type !== 'file') {
            setFieldError(input, fieldMessage(input));
        }
    });

    form.addEventListener('submit', function (event) {
        if (!validateAll()) {
            event.preventDefault();
        }
    });

    // ------------------------------------------------------------
    // Riepilogo finale
    // ------------------------------------------------------------
    const summary = document.getElementById('setup-summary');

    function buildSummary() {
        if (!summary) {
            return;
        }
        summary.textContent = '';

        steps.forEach(function (step) {
            if (step.dataset.step === 'summary') {
                return;
            }
            step.querySelectorAll('input, select').forEach(function (input) {
                if (input.type === 'hidden' || input.type === 'file' || !input.name) {
                    return;
                }
                const label = step.querySelector('label[for="' + input.id + '"]');
                if (!label) {
                    return;
                }

                let value = input.value;
                if (input.type === 'checkbox') {
                    value = input.checked ? '✓' : '—';
                }
                if (!value) {
                    return;
                }

                const dt = document.createElement('dt');
                dt.textContent = label.textContent.trim();
                const dd = document.createElement('dd');
                dd.textContent = value;
                summary.appendChild(dt);
                summary.appendChild(dd);
            });
        });

        if (latField && lonField && latField.value && lonField.value) {
            const dt = document.createElement('dt');
            dt.textContent = 'lat, lon';
            const dd = document.createElement('dd');
            dd.textContent = latField.value + ', ' + lonField.value;
            summary.appendChild(dt);
            summary.appendChild(dd);
        }
    }

    // ------------------------------------------------------------
    // mod_rewrite: verifica lato client quando PHP non sa rispondere
    // ------------------------------------------------------------
    const rewriteCheck = document.querySelector('.setup-check[data-check="rewrite"][data-status="probe"]');
    if (rewriteCheck) {
        fetch('manifest.json', { headers: { Accept: 'application/json' } })
            .then(function (response) {
                const type = response.headers.get('content-type') || '';
                const ok = response.ok && type.indexOf('json') !== -1;
                rewriteCheck.dataset.status = ok ? 'ok' : 'warn';
                const detail = rewriteCheck.querySelector('.setup-check-detail');
                if (detail) {
                    detail.textContent = ok ? 'mod_rewrite' : '—';
                }
            })
            .catch(function () {
                rewriteCheck.dataset.status = 'warn';
            });
    }

    showStep(0);
})();
