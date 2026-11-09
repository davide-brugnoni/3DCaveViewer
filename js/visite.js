/*
  3D Cave Viewer - Statistiche anonime delle visite
  https://github.com/davide-brugnoni/3DCaveViewer/
  https://www.3dcaveviewer.com

  Copyright (C) 2025 Davide Brugnoni davide.brugnoni@gmail.com
  Licensed under GNU GPL v3
*/

// Conta una visita al sito per sessione del browser e un'apertura per
// modello per sessione (api/visita.php, riepilogo in admin.php?p=visite).
// Nessun cookie e nessun identificativo: la sessione vive solo in
// sessionStorage di questa scheda. Offline la richiesta fallisce in
// silenzio e quella visita semplicemente non si conta.
(function () {
  'use strict';

  const cfg = (window.APP_CONFIG && window.APP_CONFIG.stats) || {};
  const endpoint = new URL('api/visita.php', document.baseURI).href;
  const embed = document.body && document.body.classList.contains('embed-mode');

  function enabled() {
    if (cfg.enabled === false) return false;
    // Browser automatizzati (test, crawler che eseguono JavaScript)
    if (navigator.webdriver) return false;
    return true;
  }

  // true la prima volta che una chiave compare in questa sessione
  function firstTime(key) {
    try {
      const k = 'caveviewer.stats.' + key;
      if (sessionStorage.getItem(k)) return false;
      sessionStorage.setItem(k, '1');
      return true;
    } catch (e) {
      // sessionStorage non disponibile (iframe con storage bloccato):
      // si conta comunque, una sola volta per pagina
      const seen = (window.__caveStatsSeen = window.__caveStatsSeen || {});
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }
  }

  function send(params) {
    const body = new URLSearchParams(params);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint, body)) return;
    } catch (e) { /* si prova con fetch */ }
    try {
      fetch(endpoint, { method: 'POST', body, keepalive: true, credentials: 'omit' }).catch(() => {});
    } catch (e) { /* niente da fare */ }
  }

  const api = {
    // Visita al sito: una per sessione, non dentro un iframe di un altro sito
    visit() {
      if (!enabled() || embed || !firstTime('visit')) return;
      send({ t: 'visit' });
    },
    // Apertura di un modello: una per modello per sessione
    model(folder) {
      if (!enabled() || typeof folder !== 'string' || folder === '') return;
      if (!firstTime('model.' + folder)) return;
      send({ t: 'model', m: folder, e: embed ? '1' : '0' });
    },
  };

  window.CaveStats = api;
  api.visit();
})();
