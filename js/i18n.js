/**
 * 3D Cave Viewer - Internationalization (i18n) Module
 * https://github.com/davide-brugnoni/3DCaveViewer/
 *
 * Sistema leggero per la gestione delle traduzioni multilingua.
 * La lingua viene definita lato server tramite config.php.
 *
 * AGGIUNGERE UNA NUOVA LINGUA:
 * 1. Copia i18n/template.json e rinominalo con il codice lingua (es: de.json per tedesco)
 * 2. Traduci tutte le stringhe nel nuovo file
 * 3. Modifica config.php per impostare la nuova lingua come default
 */

(function() {
  'use strict';

  const DEFAULT_LANG = 'it';

  // Lista delle lingue supportate
  const SUPPORTED_LANGS = ['it', 'en', 'fr', 'es'];

  let currentLang = DEFAULT_LANG;
  let translations = {};
  let isLoaded = false;
  let loadPromise = null;

  /**
   * Ottiene la lingua configurata dal server
   * Legge l'attributo lang dell'elemento HTML (impostato dal PHP)
   */
  function getConfiguredLanguage() {
    const htmlLang = document.documentElement.lang;
    if (htmlLang && SUPPORTED_LANGS.includes(htmlLang)) {
      return htmlLang;
    }
    return DEFAULT_LANG;
  }

  /**
   * Carica il file di traduzione per una lingua
   */
  async function loadTranslations(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) {
      lang = DEFAULT_LANG;
    }

    try {
      const response = await fetch(`i18n/${lang}.json`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      translations = data;
      currentLang = lang;
      isLoaded = true;

      // Aggiorna l'attributo lang dell'HTML se necessario
      document.documentElement.lang = lang;
      document.documentElement.dir = data.dir || 'ltr';

      // Emetti evento per notificare il caricamento
      window.dispatchEvent(new CustomEvent('languageLoaded', { detail: { lang, translations: data } }));

      return data;
    } catch (error) {
      console.error(`[i18n] Error loading translations for '${lang}':`, error);

      // Fallback alla lingua di default se non è già quella
      if (lang !== DEFAULT_LANG) {
        console.log(`[i18n] Falling back to default language '${DEFAULT_LANG}'`);
        return loadTranslations(DEFAULT_LANG);
      }

      throw error;
    }
  }

  /**
   * Inizializza il sistema i18n
   */
  function init() {
    if (loadPromise) return loadPromise;

    const configuredLang = getConfiguredLanguage();
    loadPromise = loadTranslations(configuredLang);
    return loadPromise;
  }

  /**
   * Ottiene una traduzione dato il percorso della chiave (es: "viewer.resetView")
   * @param {string} key - Chiave nel formato "section.key" o "section.subsection.key"
   * @param {string} [fallback] - Valore di fallback se la chiave non esiste
   * @returns {string} La traduzione o il fallback
   */
  function t(key, fallback) {
    if (!isLoaded || !translations) {
      return fallback !== undefined ? fallback : key;
    }

    const parts = key.split('.');
    let value = translations;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return fallback !== undefined ? fallback : key;
      }
    }

    return typeof value === 'string' ? value : (fallback !== undefined ? fallback : key);
  }

  /**
   * Ottiene la lingua corrente
   * @returns {string} Codice lingua corrente
   */
  function getLanguage() {
    return currentLang;
  }

  /**
   * Ottiene le lingue supportate
   * @returns {string[]} Array di codici lingua
   */
  function getSupportedLanguages() {
    return [...SUPPORTED_LANGS];
  }

  /**
   * Ottiene l'oggetto traduzioni completo
   * @returns {object} Oggetto traduzioni
   */
  function getTranslations() {
    return translations;
  }

  /**
   * Verifica se il sistema è stato inizializzato
   * @returns {boolean}
   */
  function isReady() {
    return isLoaded;
  }

  /**
   * Aggiorna gli elementi DOM con attributo data-i18n
   * Formato: data-i18n="key" per textContent
   *          data-i18n-attr="attr:key" per attributi (es: "placeholder:viewer.selectModel")
   */
  function updateDOM() {
    // Aggiorna textContent
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const value = t(key);
      if (value && value !== key) {
        el.textContent = value;
      }
    });

    // Aggiorna attributi
    document.querySelectorAll('[data-i18n-attr]').forEach(el => {
      const attrDef = el.getAttribute('data-i18n-attr');
      const [attr, key] = attrDef.split(':');
      if (attr && key) {
        const value = t(key);
        if (value && value !== key) {
          el.setAttribute(attr, value);
        }
      }
    });
  }

  // Esponi l'API globalmente
  window.i18n = {
    init,
    t,
    getLanguage,
    getSupportedLanguages,
    getTranslations,
    isReady,
    updateDOM,
    DEFAULT_LANG,
    SUPPORTED_LANGS
  };

  // Alias globale per comodità
  window.t = t;

})();
