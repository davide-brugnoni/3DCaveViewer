/**
 * 3D Cave Viewer - Language Selector
 * https://github.com/davide-brugnoni/3DCaveViewer/
 *
 * Gestisce apertura/chiusura del dropdown lingua renderizzato lato server.
 * Il cambio lingua avviene tramite link ?lang=XX (persistito in cookie da i18n/loader.php).
 */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const selector = document.getElementById('language-selector');
    if (!selector) return;
    const btn = selector.querySelector('.lang-selector-btn');
    if (!btn) return;

    function setOpen(open) {
      selector.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!selector.classList.contains('open'));
    });

    // Chiudi cliccando fuori dal selettore
    document.addEventListener('click', (e) => {
      if (!selector.contains(e.target)) setOpen(false);
    });

    // Chiudi con Escape riportando il focus sul pulsante
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && selector.classList.contains('open')) {
        setOpen(false);
        btn.focus();
      }
    });
  });
})();
