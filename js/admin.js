/*
  3D Cave Viewer - Pannello di amministrazione
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

// Tutto è un miglioramento progressivo: senza JavaScript il pannello
// funziona lo stesso (il file 3D va allora con il caricamento classico,
// entro upload_max_filesize del server).
(function () {
  'use strict';

  // ===== Conferme (data-confirm sui pulsanti) =====
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-confirm]');
    if (button && !window.confirm(button.dataset.confirm)) {
      event.preventDefault();
    }
  });

  // ===== Filtro dell'elenco modelli =====
  const filter = document.getElementById('adm-model-filter');
  const table = document.getElementById('adm-model-table');
  if (filter && table) {
    const rows = Array.from(table.tBodies[0].rows);
    const empty = document.getElementById('adm-filter-empty');
    const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    filter.addEventListener('input', () => {
      const query = normalize(filter.value.trim());
      let visible = 0;
      rows.forEach((row) => {
        const match = query === '' || normalize(row.dataset.filter || '').includes(query);
        row.hidden = !match;
        if (match) visible++;
      });
      if (empty) empty.classList.toggle('adm-hidden', visible > 0);
    });
  }

  // ===== Chiave di configurazione letta da file (primo accesso) =====
  // Stesso formato di parseInstallKey() in config.php: la prima riga non
  // vuota che non sia un commento. Il file non lascia il browser.
  const keyFile = document.getElementById('f-key-file');
  const keyInput = document.getElementById('f-key');
  if (keyFile && keyInput) {
    keyFile.addEventListener('change', () => {
      const file = keyFile.files && keyFile.files[0];
      if (!file || file.size > 64 * 1024) return;
      const reader = new FileReader();
      reader.onload = () => {
        const line = String(reader.result || '').split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l !== '' && l[0] !== ';' && l[0] !== '#');
        if (line) keyInput.value = line;
      };
      reader.readAsText(file);
    });
  }

  // ===== Statistiche: selettore che si invia da solo =====
  document.querySelectorAll('select[data-autosubmit]').forEach((select) => {
    select.addEventListener('change', () => select.form && select.form.submit());
  });

  // ===== Statistiche: grafico dell'andamento =====
  // SVG disegnato qui alla larghezza reale del riquadro (testi leggibili
  // anche sul telefono); senza JavaScript restano la tabella dei dati e
  // i riepiloghi, già nella pagina.
  const chartBox = document.getElementById('adm-stats-chart');
  if (chartBox) {
    let chart = null;
    try {
      chart = JSON.parse(chartBox.dataset.chart || 'null');
    } catch (e) {
      chart = null;
    }
    if (chart && Array.isArray(chart.points) && chart.points.length) {
      setupChart(chartBox, chart);
    }
  }

  function setupChart(box, chart) {
    const SVG = 'http://www.w3.org/2000/svg';
    const points = chart.points;
    const series = chart.series;
    const monthly = points[0].key.length === 7;
    const locale = chart.lang || document.documentElement.lang || 'it';
    const num = new Intl.NumberFormat(locale);
    const dateOf = (key) => new Date(monthly ? key + '-01T12:00:00' : key + 'T12:00:00');
    const shortFmt = monthly
      ? new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' })
      : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
    const longFmt = monthly
      ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
      : new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

    const tip = document.createElement('div');
    tip.className = 'adm-chart-tip';
    tip.hidden = true;
    tip.setAttribute('aria-hidden', 'true');

    function el(name, attrs, parent) {
      const node = document.createElementNS(SVG, name);
      Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
      if (parent) parent.appendChild(node);
      return node;
    }

    // Massimo "tondo" dell'asse e passo delle tacche (1, 2, 5 × 10^n)
    function niceScale(max) {
      if (max <= 0) return { max: 4, step: 1 };
      const rough = max / 4;
      const power = Math.pow(10, Math.floor(Math.log10(rough)));
      const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) || power * 10;
      const niceStep = Math.max(1, step);
      return { max: Math.ceil(max / niceStep) * niceStep, step: niceStep };
    }

    function render() {
      const width = Math.max(260, box.clientWidth);
      const height = box.clientHeight || 260;
      const small = width < 520;
      const m = { top: 10, right: small ? 8 : 14, bottom: 28, left: 0 };
      const maxValue = Math.max(0, ...points.flatMap((p) => series.map((s) => p[s.key] || 0)));
      const scale = niceScale(maxValue);
      // Margine sinistro su misura dell'etichetta più lunga
      m.left = Math.max(28, num.format(scale.max).length * 7 + 12);
      const plotW = width - m.left - m.right;
      const plotH = height - m.top - m.bottom;
      const n = points.length;
      const x = (i) => m.left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
      const y = (v) => m.top + plotH - (v / scale.max) * plotH;

      box.textContent = '';
      const svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false' }, box);

      // Griglia e asse Y
      const grid = el('g', { class: 'adm-grid' }, svg);
      const axis = el('g', { class: 'adm-axis' }, svg);
      for (let v = 0; v <= scale.max + 1e-9; v += scale.step) {
        const yy = Math.round(y(v)) + 0.5;
        if (v > 0) el('line', { x1: m.left, x2: width - m.right, y1: yy, y2: yy }, grid);
        const label = el('text', { x: m.left - 8, y: yy + 4, 'text-anchor': 'end' }, axis);
        label.textContent = num.format(v);
      }
      el('line', { class: 'adm-baseline', x1: m.left, x2: width - m.right, y1: y(0) + 0.5, y2: y(0) + 0.5 }, svg);

      // Asse X: etichette diradate perché non si tocchino
      const labelW = monthly ? 52 : 50;
      const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / labelW))));
      for (let i = 0; i < n; i += every) {
        // Con poche etichette si ancora l'ultima a destra, la prima a sinistra
        const anchor = n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
        const label = el('text', { x: x(i), y: height - 8, 'text-anchor': anchor }, axis);
        label.textContent = shortFmt.format(dateOf(points[i].key));
      }

      // Serie: area tenue + linea da 2 px
      series.forEach((s) => {
        const g = el('g', { class: 'adm-series-' + s.slot }, svg);
        const coords = points.map((p, i) => [x(i), y(p[s.key] || 0)]);
        const line = coords.map(([cx, cy], i) => (i ? 'L' : 'M') + cx.toFixed(1) + ' ' + cy.toFixed(1)).join(' ');
        if (n > 1) {
          el('path', { class: 'adm-area', d: `${line} L${x(n - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z` }, g);
          el('path', { class: 'adm-line', d: line }, g);
        }
        // Pochi punti (7 giorni): marcatori sempre visibili
        if (n <= 12) {
          coords.forEach(([cx, cy]) => el('circle', { class: 'adm-dot', cx, cy, r: 4 }, g));
        }
      });

      if (maxValue === 0) {
        const msg = document.createElement('div');
        msg.className = 'adm-chart-empty';
        msg.textContent = chart.empty || '';
        box.appendChild(msg);
      }

      // Livello del passaggio del mouse: linea verticale, punti e riquadro
      const hover = el('g', { visibility: 'hidden' }, svg);
      const cross = el('line', { class: 'adm-crosshair', y1: m.top, y2: m.top + plotH }, hover);
      const dots = series.map((s) => el('circle', { class: 'adm-dot adm-series-' + s.slot, r: 5 }, hover));
      // Area sensibile più grande del tracciato
      const hit = el('rect', { x: m.left - 10, y: 0, width: plotW + 20, height: height, fill: 'transparent' }, svg);
      box.appendChild(tip);

      function show(i) {
        const p = points[i];
        cross.setAttribute('x1', x(i));
        cross.setAttribute('x2', x(i));
        series.forEach((s, k) => {
          dots[k].setAttribute('cx', x(i));
          dots[k].setAttribute('cy', y(p[s.key] || 0));
        });
        hover.setAttribute('visibility', 'visible');

        tip.textContent = '';
        const title = document.createElement('strong');
        title.textContent = longFmt.format(dateOf(p.key)) + (i === n - 1 && chart.partial ? ` (${chart.partial})` : '');
        tip.appendChild(title);
        series.forEach((s) => {
          const row = document.createElement('span');
          row.className = 'adm-series-' + s.slot;
          const sw = document.createElement('i');
          sw.className = 'adm-swatch';
          const name = document.createElement('em');
          name.style.fontStyle = 'normal';
          name.textContent = s.name;
          const value = document.createElement('b');
          value.textContent = num.format(p[s.key] || 0);
          row.append(sw, name, value);
          tip.appendChild(row);
        });
        tip.hidden = false;
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        let left = x(i) + 12;
        if (left + tw > width) left = x(i) - tw - 12;
        left = Math.max(0, left);
        const top = Math.max(0, Math.min(height - th, y(Math.max(...series.map((s) => p[s.key] || 0))) - th / 2));
        tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      }

      function hide() {
        hover.setAttribute('visibility', 'hidden');
        tip.hidden = true;
      }

      function nearest(event) {
        const rect = svg.getBoundingClientRect();
        const px = event.clientX - rect.left;
        if (n === 1) return 0;
        return Math.max(0, Math.min(n - 1, Math.round(((px - m.left) / plotW) * (n - 1))));
      }

      hit.addEventListener('pointermove', (event) => show(nearest(event)));
      hit.addEventListener('pointerdown', (event) => show(nearest(event)));
      hit.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'mouse') hide();
      });
    }

    render();
    let frame = 0;
    let lastWidth = box.clientWidth;
    const onResize = () => {
      if (box.clientWidth === lastWidth) return;
      lastWidth = box.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };
    if ('ResizeObserver' in window) {
      new ResizeObserver(onResize).observe(box);
    } else {
      window.addEventListener('resize', onResize);
    }
  }

  const form = document.getElementById('adm-model-form');
  if (!form) return;

  // ===== Schede del modulo modello =====
  // Un solo <form> con più pannelli: si salva tutto insieme da qualsiasi
  // scheda, e la scheda aperta resta nell'indirizzo (#tab=…, che non corrisponde a
  // nessun id: il browser non salta al pannello) così dopo il
  // salvataggio (redirect) si torna dove si era.
  const tabbed = document.querySelector('[data-tabs]');
  let showTab = () => {};
  if (tabbed) {
    const tabBar = tabbed.querySelector('.adm-tabs');
    const tabs = Array.from(tabbed.querySelectorAll('[role="tab"]'));
    const panels = new Map(tabs.map((tab) => [tab.dataset.tab, document.getElementById(tab.getAttribute('aria-controls'))]));
    const formTabs = tabs.filter((tab) => form.contains(panels.get(tab.dataset.tab)));
    const steps = form.querySelector('.adm-tab-steps');
    const unsaved = document.getElementById('adm-unsaved');
    const baseAction = form.getAttribute('action').split('#')[0];
    // Nuovo modello: procedura a passi, "Crea modello" solo all'ultimo.
    // Se il server ha rimandato il modulo con errori (o un caricamento è
    // fallito) il pulsante resta visibile ovunque: i dati ci sono già.
    const wizard = form.dataset.wizard === '1';
    const saveBtn = document.getElementById('adm-save');
    const stepCount = document.getElementById('adm-step-count');
    let wizardOpen = wizard && !!form.querySelector('.adm-field-error');
    let current = '';

    const tabOf = (el) => {
      const panel = el && el.closest('[data-panel]');
      return panel ? panel.dataset.panel : '';
    };

    // Su schermi stretti la barra scorre in orizzontale: porta in vista la
    // scheda attiva (scrollIntoView sposterebbe anche la pagina)
    const revealTab = (tab) => {
      const margin = 24;
      const left = tab.offsetLeft;
      const right = left + tab.offsetWidth;
      if (left - margin < tabBar.scrollLeft) {
        tabBar.scrollLeft = Math.max(0, left - margin);
      } else if (right + margin > tabBar.scrollLeft + tabBar.clientWidth) {
        tabBar.scrollLeft = right + margin - tabBar.clientWidth;
      }
    };

    showTab = (name, opts = {}) => {
      if (!panels.has(name)) return;
      current = name;
      tabs.forEach((tab) => {
        const active = tab.dataset.tab === name;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
        tab.classList.toggle('active', active);
        panels.get(tab.dataset.tab).hidden = !active;
        if (active && opts.focus) tab.focus();
        if (active) revealTab(tab);
      });
      // Storico ed Elimina stanno fuori dal modulo: lo si nasconde del tutto
      const inForm = formTabs.some((tab) => tab.dataset.tab === name);
      form.hidden = !inForm;
      if (steps) {
        const index = formTabs.findIndex((tab) => tab.dataset.tab === name);
        steps.querySelector('[data-tab-step="-1"]').disabled = index <= 0;
        steps.querySelector('[data-tab-step="1"]').disabled = index < 0 || index >= formTabs.length - 1;
        if (wizard) {
          const last = index === formTabs.length - 1;
          steps.querySelector('[data-tab-step="1"]').hidden = last;
          if (saveBtn) saveBtn.hidden = !(last || wizardOpen);
          if (stepCount && index >= 0) {
            stepCount.textContent = (form.dataset.msgStep || '{n} / {total}')
              .replace('{n}', String(index + 1)).replace('{total}', String(formTabs.length));
          }
        }
      }
      if (opts.remember !== false) {
        try { history.replaceState(null, '', `#tab=${name}`); } catch (e) { /* file:// o sandbox */ }
      }
      if (!opts.keepAction) form.setAttribute('action', `${baseAction}#tab=${name}`);
      document.dispatchEvent(new CustomEvent('adm:tabshown', { detail: name }));
    };

    tabBar.hidden = false;
    tabbed.classList.add('adm-tabs-ready');
    if (steps) steps.hidden = false;

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => showTab(tab.dataset.tab));
      tab.addEventListener('keydown', (event) => {
        const index = tabs.indexOf(tab);
        let next = -1;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        if (next >= 0) {
          event.preventDefault();
          showTab(tabs[next].dataset.tab, { focus: true });
        }
      });
    });

    if (steps) {
      steps.addEventListener('click', (event) => {
        const button = event.target.closest('[data-tab-step]');
        if (!button) return;
        const index = formTabs.findIndex((tab) => tab.dataset.tab === current);
        const step = Number(button.dataset.tabStep);
        // Nella procedura si va avanti solo con i campi del passo validi
        if (wizard && step > 0 && !panelValid(panels.get(current))) return;
        const target = formTabs[index + step];
        if (target) showTab(target.dataset.tab);
      });
    }

    const panelValid = (panel) => {
      const fields = Array.from(panel ? panel.querySelectorAll('input, textarea, select') : []);
      const invalid = fields.find((field) => !field.disabled && field.willValidate && !field.checkValidity());
      if (invalid) invalid.reportValidity();
      return !invalid;
    };

    // Invio in un campo, a metà procedura, passa al passo successivo
    // invece di creare il modello con le schede successive ancora da vedere
    if (wizard && steps) {
      form.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.isComposing) return;
        const target = event.target;
        if (!target.matches('input') || ['button', 'submit', 'checkbox', 'radio', 'file', 'range'].includes(target.type)) return;
        if (saveBtn && !saveBtn.hidden) return;
        event.preventDefault();
        steps.querySelector('[data-tab-step="1"]').click();
      });
      // Caricamento fallito o altro errore: da lì in poi si può creare da ogni passo
      document.addEventListener('adm:wizardopen', () => {
        wizardOpen = true;
        if (saveBtn) saveBtn.hidden = false;
      });
    }

    // Segni sulle schede: errori dal server e modifiche non ancora salvate
    const markErrors = () => {
      tabs.forEach((tab) => {
        tab.classList.toggle('has-error', !!panels.get(tab.dataset.tab).querySelector('.adm-field-error'));
      });
    };
    markErrors();

    let dirty = false;
    const markDirty = (event) => {
      const name = tabOf(event.target);
      // Il campo nascosto dell'upload e simili non contano
      if (!name || event.target.type === 'hidden') return;
      const tab = tabs.find((t) => t.dataset.tab === name);
      if (tab) tab.classList.add('is-dirty');
      dirty = true;
      if (unsaved) unsaved.hidden = false;
    };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);
    // La mappa scrive lat/lon via JS, senza eventi: li segnala lei
    document.addEventListener('adm:fieldchanged', (event) => markDirty({ target: event.detail }));

    window.addEventListener('beforeunload', (event) => {
      if (!dirty || form.dataset.submitting === '1') return undefined;
      event.preventDefault();
      event.returnValue = tabbed.dataset.msgUnsaved;
      return tabbed.dataset.msgUnsaved;
    });
    form.addEventListener('submit', () => { form.dataset.submitting = '1'; });

    // Un campo obbligatorio in una scheda nascosta: la si apre, altrimenti
    // il browser non può mostrare il messaggio e il clic su Salva "non fa niente"
    let invalidShown = false;
    form.addEventListener('invalid', (event) => {
      if (invalidShown) return;
      invalidShown = true;
      const name = tabOf(event.target);
      if (name && name !== current) {
        showTab(name);
        setTimeout(() => event.target.reportValidity(), 0);
      }
      setTimeout(() => { invalidShown = false; }, 0);
    }, true);

    // Scheda iniziale: quella con un errore, poi quella nell'indirizzo
    const errorTab = tabs.find((tab) => tab.classList.contains('has-error'));
    const hashTab = (location.hash.match(/^#tab=([a-z]+)$/) || [])[1];
    const start = errorTab ? errorTab.dataset.tab
      : (hashTab && panels.has(hashTab) ? hashTab : tabbed.dataset.defaultTab);
    showTab(start, { remember: !!(errorTab || hashTab) });
  }

  // ===== Cartella proposta dal nome =====
  const nameInput = document.getElementById('f-name');
  const folderInput = document.getElementById('f-folder');
  if (nameInput && folderInput && folderInput.dataset.autoSlug) {
    const slug = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
    let manual = folderInput.value !== '' && folderInput.value !== slug(nameInput.value);
    folderInput.addEventListener('input', () => { manual = folderInput.value !== ''; });
    nameInput.addEventListener('input', () => {
      if (!manual) folderInput.value = slug(nameInput.value);
    });
  }

  // ===== Mappa per la posizione =====
  const mapEl = document.getElementById('adm-map');
  const latInput = document.getElementById('f-lat');
  const lonInput = document.getElementById('f-lon');
  if (mapEl && latInput && lonInput && window.L) {
    const parse = (input) => {
      const value = parseFloat(String(input.value).replace(',', '.'));
      return Number.isFinite(value) ? value : null;
    };
    // Stessa mappa della homepage (js/config.php, personalizzabile da settings.ini)
    const mapCfg = (window.APP_CONFIG && window.APP_CONFIG.map) || {};
    let center = [43.35, 12.58];
    try { center = JSON.parse(mapEl.dataset.center); } catch (e) { /* default */ }
    if (Array.isArray(mapCfg.center) && mapCfg.center.length === 2) center = mapCfg.center;

    const map = L.map(mapEl, { scrollWheelZoom: false });
    L.tileLayer(mapCfg.tileUrl || mapEl.dataset.tileUrl, {
      maxZoom: Math.min(19, Number(mapCfg.maxZoom) || 19),
      attribution: mapCfg.attribution || mapEl.dataset.attribution,
    }).addTo(map);
    // La rotella zooma solo dopo un clic: scorrendo la pagina non si finisce dentro la mappa
    map.on('focus click', () => map.scrollWheelZoom.enable());
    map.on('blur mouseout', () => map.scrollWheelZoom.disable());

    let marker = null;
    const placeMarker = (lat, lon, pan) => {
      if (!marker) {
        marker = L.marker([lat, lon], { draggable: true, keyboard: true }).addTo(map);
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          writeInputs(pos.lat, pos.lng);
        });
      } else {
        marker.setLatLng([lat, lon]);
      }
      if (pan) map.setView([lat, lon], Math.max(map.getZoom() || 0, 15));
    };
    const writeInputs = (lat, lon) => {
      latInput.value = lat.toFixed(6);
      lonInput.value = L.Util.wrapNum(lon, [-180, 180], true).toFixed(6);
      document.dispatchEvent(new CustomEvent('adm:fieldchanged', { detail: latInput }));
    };
    const syncFromInputs = (pan) => {
      const lat = parse(latInput);
      const lon = parse(lonInput);
      if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        placeMarker(lat, lon, pan);
      } else if (marker && latInput.value === '' && lonInput.value === '') {
        marker.remove();
        marker = null;
      }
    };

    const lat0 = parse(latInput);
    const lon0 = parse(lonInput);
    if (lat0 !== null && lon0 !== null) {
      map.setView([lat0, lon0], 15);
      placeMarker(lat0, lon0, false);
    } else {
      map.setView(center, 12);
    }

    map.on('click', (event) => {
      writeInputs(event.latlng.lat, event.latlng.lng);
      placeMarker(event.latlng.lat, event.latlng.lng, false);
    });
    latInput.addEventListener('change', () => syncFromInputs(true));
    lonInput.addEventListener('change', () => syncFromInputs(true));

    // Creata dentro una scheda nascosta la mappa misura 0×0: va
    // ricalcolata (e ricentrata) quando la scheda diventa visibile
    document.addEventListener('adm:tabshown', (event) => {
      if (event.detail !== 'position') return;
      map.invalidateSize();
      if (marker) map.setView(marker.getLatLng(), map.getZoom());
    });

    const clear = document.getElementById('adm-clear-position');
    if (clear) {
      clear.addEventListener('click', () => {
        latInput.value = '';
        lonInput.value = '';
        syncFromInputs(false);
        document.dispatchEvent(new CustomEvent('adm:fieldchanged', { detail: latInput }));
      });
    }
  }

  // ===== Caricamento a blocchi del file 3D =====
  const fileInput = document.getElementById('f-model-file');
  const uploadIdInput = document.getElementById('f-upload-id');
  const progress = document.getElementById('adm-upload-progress');
  const saveButton = document.getElementById('adm-save');
  if (!fileInput || !uploadIdInput || !progress || !window.fetch) return;

  const progressBar = progress.querySelector('.adm-progress-bar');
  const progressText = progress.querySelector('.adm-progress-text');
  const cancelButton = document.getElementById('adm-upload-cancel');
  const uploadUrl = form.dataset.uploadUrl;
  const csrf = form.dataset.csrf;
  const maxBytes = Number(form.dataset.maxBytes) || Infinity;
  let messages = {};
  try { messages = JSON.parse(form.dataset.messages || '{}'); } catch (e) { /* nessuna traduzione */ }

  const MIN_CHUNK = 256 * 1024;
  const MAX_RETRIES = 6;
  let controller = null;
  let uploading = false;

  const format = (template, values) => template.replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m));
  const bytes = (n) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const showProgress = (done, total) => {
    const percent = total > 0 ? Math.floor((done / total) * 100) : 0;
    progress.classList.remove('adm-hidden', 'adm-progress-error');
    progressBar.style.width = `${percent}%`;
    progress.setAttribute('aria-valuenow', String(percent));
    progressText.textContent = format(form.dataset.msgUploading, { percent, done: bytes(done), total: bytes(total) });
  };
  const showError = (code) => {
    progress.classList.remove('adm-hidden');
    progress.classList.add('adm-progress-error');
    progressText.textContent = format(form.dataset.msgError, { error: messages[code] || code });
  };
  const fail = (code) => { const error = new Error(code); error.code = code; return error; };

  const api = (action, query, options) => fetch(`${uploadUrl}?action=${action}${query}`, Object.assign({
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-CSRF-Token': csrf },
  }, options));

  // Un GLB comincia con "glTF": controllarlo subito evita di caricare
  // 100 MB per sentirsi dire alla fine che il file era sbagliato.
  const checkHeader = async (file) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext !== 'glb' && ext !== 'gltf') throw fail('model_bad_type');
    if (file.size > maxBytes) throw fail('model_too_large');
    if (ext === 'glb') {
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (String.fromCharCode(...head) !== 'glTF') throw fail('model_invalid');
    }
  };

  const upload = async (file) => {
    const startRes = await api('start', '', {
      headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, size: file.size }),
      signal: controller.signal,
    });
    const start = await startRes.json().catch(() => ({}));
    if (!startRes.ok || !start.id) throw fail(start.error || `HTTP ${startRes.status}`);

    const id = start.id;
    let chunk = Math.max(MIN_CHUNK, Number(start.chunkSize) || MIN_CHUNK);
    let offset = 0;
    let retries = 0;
    showProgress(0, file.size);

    while (offset < file.size) {
      const end = Math.min(file.size, offset + chunk);
      let res;
      try {
        res = await api('chunk', `&id=${id}&offset=${offset}`, {
          headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/octet-stream' },
          body: file.slice(offset, end),
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) throw error;
        // Rete caduta: si riprova con attesa crescente
        if (++retries > MAX_RETRIES) throw fail('network');
        await sleep(1000 * retries);
        continue;
      }
      const data = await res.json().catch(() => ({}));

      // Un proxy (nginx: client_max_body_size) rifiuta il blocco: si dimezza
      if (res.status === 413 && chunk > MIN_CHUNK) {
        chunk = Math.max(MIN_CHUNK, Math.floor(chunk / 2));
        continue;
      }
      // Il server ha già una parte diversa (blocco ripetuto): si riprende da lì
      if (res.status === 409 && typeof data.received === 'number') {
        offset = data.received;
        continue;
      }
      if (!res.ok) {
        if (res.status >= 500 && ++retries <= MAX_RETRIES) {
          await sleep(1000 * retries);
          continue;
        }
        throw fail(data.error || `HTTP ${res.status}`);
      }
      retries = 0;
      offset = Number(data.received) || end;
      showProgress(offset, file.size);
    }
    return id;
  };

  const leaveGuard = (event) => {
    event.preventDefault();
    event.returnValue = form.dataset.msgLeave;
    return form.dataset.msgLeave;
  };

  // ===== Trascinamento del file =====
  // Il campo file resta nel modulo (e nel DOM) ma è coperto da un'area in
  // cui trascinare il file o fare clic per sceglierlo. Un file lasciato
  // cadere in qualsiasi punto della pagina va qui, invece di far aprire
  // il file al browser abbandonando il modulo.
  const dropzone = document.getElementById('adm-dropzone');
  const dropFile = document.getElementById('adm-dropzone-file');
  const showChosen = () => {
    if (!dropzone || !dropFile) return;
    const file = fileInput.files && fileInput.files[0];
    dropzone.classList.toggle('has-file', !!file);
    dropFile.textContent = file
      ? format(dropzone.dataset.msgChosen, { name: file.name, size: bytes(file.size) })
      : dropzone.dataset.msgNone;
  };
  const hasFiles = (event) => !!event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files');
  if (dropzone && typeof DataTransfer === 'function') {
    dropzone.classList.add('adm-dropzone-ready');
    showChosen();
    let depth = 0;
    const setOver = (on) => {
      dropzone.classList.toggle('is-over', on);
      document.body.classList.toggle('adm-dragging', on);
    };
    document.addEventListener('dragenter', (event) => {
      if (!hasFiles(event)) return;
      depth++;
      setOver(true);
    });
    document.addEventListener('dragleave', (event) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    });
    document.addEventListener('dragover', (event) => {
      if (!hasFiles(event)) return;
      // Sul campo dell'immagine social il browser fa da sé
      if (event.target.matches && event.target.matches('input[type="file"]') && event.target !== fileInput) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = uploading ? 'none' : 'copy';
    });
    document.addEventListener('drop', (event) => {
      depth = 0;
      setOver(false);
      if (!hasFiles(event)) return;
      if (event.target.matches && event.target.matches('input[type="file"]') && event.target !== fileInput) return;
      event.preventDefault();
      if (uploading) return;
      const file = event.dataTransfer.files[0];
      if (!file) return;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      fileInput.files = transfer.files;
      showTab('file');
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  fileInput.addEventListener('change', () => {
    progress.classList.add('adm-hidden');
    showChosen();
    const pending = document.getElementById('adm-pending-upload');
    if (pending && fileInput.files.length > 0) pending.classList.add('adm-muted');
    const file = fileInput.files[0];
    if (file) checkHeader(file).catch((error) => showError(error.code || error.message));
  });

  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      if (controller) controller.abort();
    });
  }

  form.addEventListener('submit', async (event) => {
    const file = fileInput.files && fileInput.files[0];
    if (!file || uploading) {
      if (uploading) event.preventDefault();
      return;
    }
    event.preventDefault();

    uploading = true;
    // La barra di avanzamento sta nella scheda "File 3D"
    // (senza cambiare la scheda a cui si torna dopo il salvataggio)
    showTab('file', { remember: false, keepAction: true });
    // Nella procedura del nuovo modello il pulsante resta visibile (e,
    // se il caricamento fallisce, lo si può ripetere da qui)
    document.dispatchEvent(new CustomEvent('adm:wizardopen'));
    controller = new AbortController();
    saveButton.disabled = true;
    cancelButton.hidden = false;
    window.addEventListener('beforeunload', leaveGuard);

    let id = '';
    try {
      await checkHeader(file);
      id = await upload(file);
    } catch (error) {
      window.removeEventListener('beforeunload', leaveGuard);
      uploading = false;
      saveButton.disabled = false;
      delete form.dataset.submitting;
      if (controller.signal.aborted) {
        progress.classList.add('adm-hidden');
      } else {
        showError(error.code || error.message);
      }
      return;
    }

    window.removeEventListener('beforeunload', leaveGuard);
    uploadIdInput.value = id;
    progressText.textContent = form.dataset.msgSaving;
    cancelButton.hidden = true;
    // Il file è già sul server: il modulo parte senza, con il solo id
    fileInput.removeAttribute('name');
    fileInput.required = false;
    form.submit();
  });
})();
