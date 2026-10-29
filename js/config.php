<?php
/**
 * 3D Cave Viewer - Configuration File (served as JavaScript)
 * https://github.com/davide-brugnoni/3DCaveViewer/
 *
 * Questo file è l'unica sorgente di verità per la configurazione condivisa
 * tra backend e frontend. I valori vengono letti direttamente da config.php
 * e serializzati in JavaScript.
 *
 * Le impostazioni specifiche del frontend (viewer 3D, mappa, tema CSS completo)
 * sono definite staticamente in questo file.
 *
 * ⚠️ IMPORTANTE - LICENZA E ATTRIBUZIONE:
 * Questo software è rilasciato sotto licenza GNU GPL v3.
 * L'autore originale (Davide Brugnoni) DEVE essere sempre citato nel footer
 * o in altra posizione visibile dell'applicazione, anche in caso di fork
 * o personalizzazione per altre organizzazioni.
 */

declare(strict_types=1);

// Carica la configurazione PHP (unica sorgente di verità)
require_once __DIR__ . '/../config.php';

// Serve come JavaScript
header('Content-Type: application/javascript; charset=UTF-8');

// Cache basata sulla data di modifica di config.php e delle personalizzazioni
// locali (custom/settings.ini, custom/config.local.php), così un'edit
// dell'utente si vede subito.
// Contano anche questo stesso file (un aggiornamento dell'app che tocca solo
// i default frontend) e i file di branding, i cui URL emessi qui portano
// ?v=<filemtime>: sostituire il logo deve cambiare anche questa risposta.
$lastModified = max((int) filemtime(__DIR__ . '/../config.php'), (int) filemtime(__FILE__));
$localFiles = array_merge(
    [__DIR__ . '/../custom/settings.ini', __DIR__ . '/../custom/config.local.php'],
    glob(__DIR__ . '/../custom/logo.*') ?: [],
    glob(__DIR__ . '/../custom/icon-*') ?: [],
    glob(__DIR__ . '/../custom/generated/*') ?: []
);
foreach ($localFiles as $localFile) {
    if (is_readable($localFile)) {
        $lastModified = max($lastModified, (int) filemtime($localFile));
    }
}
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $lastModified) . ' GMT');
// no-cache = rivalida sempre, non "non memorizzare": con Last-Modified
// corretto la risposta è quasi sempre un 304 vuoto, e un salvataggio
// dell'installazione guidata si vede subito invece che dopo un'ora.
header('Cache-Control: no-cache');

// Estrae le sezioni condivise
$branding       = $CONFIG['branding']       ?? [];
$texts          = $CONFIG['texts']          ?? [];
$theme          = $CONFIG['theme']          ?? [];
$pwa            = $CONFIG['pwa']            ?? [];
$paths          = $CONFIG['paths']          ?? [];
$originalAuthor = $CONFIG['originalAuthor'] ?? [];

// Helper: serializza un valore PHP in letterale JavaScript
function jsVal(mixed $value): string {
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

// Helper: normalizza un testo configurabile (stringa o array lingua => testo)
// e risolve i segnaposto {organization}, {app}, {year}.
// Questo file è cacheabile e quindi indipendente dalla lingua scelta a runtime:
// usa sempre language.default. Le traduzioni per lingua arrivano da i18n/.
function jsText(mixed $value, string $fallback = ''): string {
    $text = textValue($value);
    return formatText($text !== '' ? $text : $fallback);
}

// Override utente per le sezioni definite staticamente qui sotto (tema CSS,
// viewer 3D, mappa, social). Arrivano da custom/settings.ini (o dal file
// avanzato custom/config.local.php) e vengono applicati in coda all'oggetto
// CONFIG: i default restano quelli di questo file, l'utente cambia solo le
// chiavi che gli servono senza toccare il codice.
// Il WebP del logo è risolto da config.php (accanto al logo scelto, e solo
// se non è più vecchio di quello): qui arriva già verificato.
$webpPath = logoWebpPath();

$frontendOverrides = [];
foreach (['theme', 'viewer', 'map', 'social', 'texts'] as $section) {
    $override = $CONFIG_LOCAL[$section] ?? null;
    if (!is_array($override) || $override === []) {
        continue;
    }
    if ($section === 'map') {
        // I file .ini non hanno array annidati: i limiti della mappa si
        // impostano come quattro lati e qui tornano [[sud, ovest], [nord, est]].
        $sides = ['boundsSouth', 'boundsWest', 'boundsNorth', 'boundsEast'];
        $hasAllSides = count(array_intersect_key($override, array_flip($sides))) === count($sides);
        if ($hasAllSides) {
            $override['bounds'] = [
                [(float) $override['boundsSouth'], (float) $override['boundsWest']],
                [(float) $override['boundsNorth'], (float) $override['boundsEast']],
            ];
        }
        $override = array_diff_key($override, array_flip($sides));
        if ($override === []) {
            continue;
        }
    }
    if ($section === 'texts') {
        // I testi possono essere array lingua => testo: qui serve la stringa
        // della lingua di default, con i segnaposto già risolti.
        $override = array_map(static fn($value) => jsText($value), $override);
        $override = array_filter($override, static fn($value) => $value !== '');
        if ($override === []) {
            continue;
        }
    }
    $frontendOverrides[$section] = $override;
}
?>
/*
 * 3D Cave Viewer - Configurazione Frontend
 * Generato dinamicamente da js/config.php — non modificare questo output.
 * Per cambiare i valori condivisi, modificare config.php nella root.
 */

const CONFIG = {

  // ============================================================
  // AUTORE ORIGINALE - NON MODIFICARE
  // ============================================================
  originalAuthor: {
    name:        <?= jsVal($originalAuthor['name']        ?? 'Davide Brugnoni') ?>,
    email:       <?= jsVal($originalAuthor['email']       ?? 'davide.brugnoni@gmail.com') ?>,
    website:     <?= jsVal($originalAuthor['website']     ?? 'https://github.com/davide-brugnoni/3DCaveViewer/') ?>,
    projectName: <?= jsVal($originalAuthor['projectName'] ?? '3DCaveViewer') ?>,
    projectUrl:  <?= jsVal($originalAuthor['projectUrl']  ?? 'https://3dcaveviewer.com/') ?>,
  },

  // ============================================================
  // BRANDING — letto da config.php (unica sorgente di verità)
  // ============================================================
  branding: {
    appName:          <?= jsVal($branding['appName']          ?? '3D Cave Viewer') ?>,
    appShortName:     <?= jsVal($branding['appShortName']     ?? '3D Cave') ?>,
    organizationName: <?= jsVal($branding['organizationName'] ?? '') ?>,
    organizationUrl:  <?= jsVal($branding['organizationUrl']  ?? '') ?>,
    contactEmail:     <?= jsVal($branding['contactEmail']     ?? '') ?>,
    copyrightHolder:  <?= jsVal($branding['copyrightHolder']  ?? '') ?>,
    appDescription:   <?= jsVal($branding['appDescription']   ?? '') ?>,
  },

  // ============================================================
  // TESTI UI — letti da config.php + testi esclusivamente frontend
  // ============================================================
  texts: {
    // Letti da config.php (personalizzabili da custom/config.local.php)
    pageTitle:               <?= jsVal(jsText($texts['pageTitle']              ?? null, 'Mappa delle cavità in 3D')) ?>,
    pageSubtitle:            <?= jsVal(jsText($texts['pageSubtitle']           ?? null)) ?>,
    sidebarTitle:            <?= jsVal(jsText($texts['sidebarTitle']           ?? null)) ?>,
    viewerDefaultTitle:      <?= jsVal(jsText($texts['viewerDefaultTitle']     ?? null, 'Visualizzatore cavità 3D')) ?>,
    viewerDefaultDescription:<?= jsVal(jsText($texts['viewerDefaultDescription']?? null, 'Esplora i modelli 3D.')) ?>,

    // Testi esclusivamente frontend (non presenti in config.php)
    popupLinkText:   'Apri Modello 3D',
    noModelsMessage: 'Nessun modello con coordinate GPS trovato.',
    noCoordinatesText: 'Posizione GPS non disponibile',
    emptyCatalogMessage: 'Non ci sono ancora modelli 3D. Per aggiungerne uno crea una cartella in modelli/ con il file .glb e il suo .json (vedi README).',
    loadErrorMessage:'Impossibile caricare i dati dei modelli. Controlla i file JSON nelle cartelle di `modelli/` e la console per errori.',
    loadingText:     'Caricamento modello…',

    // Onboarding
    onboardingTitle: 'Benvenuto nel Visualizzatore 3D',
    onboardingSteps: [
      'Seleziona un <strong>Modello</strong> per iniziare.',
      'Usa il mouse o le dita per ruotare/zoomare.',
      'Attiva <em>POV</em> (prima persona) per esplorare (su mobile appare il joystick).'
    ],

    // Coach bubble
    coachHint: 'Seleziona un modello per iniziare',
  },

  // ============================================================
  // MAPPA - Configurazione Leaflet/OpenStreetMap (solo frontend)
  // ============================================================
  map: {
    center:      [43.351726, 12.579768],
    defaultZoom: 16,
    minZoom:     8,
    // Oltre il 19 OpenStreetMap non ha tessere: alzarlo darebbe una mappa
    // grigia, ed è il tetto che propone anche l'installazione guidata.
    maxZoom:     19,
    flyToZoom:   17,
    // Limiti oltre i quali la mappa non si sposta. Nessuno di default: una
    // mappa che rimbalza contro un rettangolo scelto da qualcun altro è più
    // un difetto che una funzione. Chi li vuole li imposta come quattro lati
    // (boundsSouth/West/North/East) nella sezione [map] di settings.ini —
    // l'installazione guidata non li tocca.
    bounds:      null,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    tileUrl:     'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  },

  // ============================================================
  // TEMA — themeColor/pwaBackgroundColor letti da config.php,
  //        variabili CSS complete definite qui
  // ============================================================
  theme: {
    // Letti da config.php
    themeColor:         <?= jsVal($theme['themeColor']         ?? '#0b0d10') ?>,
    pwaBackgroundColor: <?= jsVal($theme['pwaBackgroundColor'] ?? '#0f1b2a') ?>,

    // Variabili CSS (solo frontend)
    bgColor:       '#0d1117',
    panelBg:       'rgba(22, 27, 34, 0.95)',
    panelBgSolid:  '#161b22',
    borderColor:   'rgba(60, 60, 80, 0.5)',
    textColor:     '#e0e0e0',
    accentColor:   '#0696af',
    accentHover:   '#1ebfd7',
    accentAlt:     '#8b949e',
    successColor:  '#2ea043',
    glassBlur:     'blur(12px)',

    // Gradiente di sfondo della scena (CSS + sky dome WebGL/VR)
    // Stesso ordine: dal centro/orizzonte (più chiaro) al bordo/zenit (più scuro)
    sceneGradient:      ['#1a2a33', '#0f181f', '#080d13', '#04070b'],
    sceneGradientStops: [0.0, 0.45, 0.70, 1.0],
  },

  // ============================================================
  // VIEWER 3D - Impostazioni del visualizzatore (solo frontend)
  // ============================================================
  viewer: {
    debug:                 false, // abilita helper di debug in console (es. debugJoystick)
    fpBaseSpeed:           1.2,
    fpBoostMultiplier:     3.0,
    tapStepDistance:       1.0,   // metri percorsi per ogni doppio tap (mobile FP)
    lookSensitivity:       0.004,
    collisionPadding:      0.05,
    vrMoveSpeed:           2.0,
    vrYawSpeed:            1.8,
    vrDeadZone:            0.15,
    vrDoubleClickThreshold:400,
    vrVignetteMaxIntensity:0.6,
    vrVignetteFadeSpeed:   3.0,
    scaleBarWidth:         150,
    scaleBarUnit:          'm',
    defaultNear:           0.1,
    defaultFar:            2000,
    skyDomeEnabled:        true,
    skyDomeRadius:         1000,  // metri; deve restare < camera.far in VR
    pixelRatioMax:         2,
    pixelRatioMaxMobile:   1.5,   // tetto DPR su touch/mobile (anti-throttling termico)
    pinchLockThresholdPx:  10,    // px per classificare il gesto a due dita: pinch (zoom) o pan
    // Texture dei modelli: lato massimo (px) e budget complessivo per modello
    // (megapixel). Su mobile evitano che una texture 8192×8192 (256 MB
    // decodificata) faccia chiudere la scheda; 0 = nessun limite.
    textureMaxSizeMobile:  4096,
    textureBudgetMPMobile: 24,
    textureMaxSize:        0,     // desktop: 0 = solo il limite della GPU
    textureBudgetMP:       0,
  },

  // ============================================================
  // PWA — percorsi icone letti da config.php + opzioni frontend
  // ============================================================
  pwa: {
    // Percorsi risolti da config.php: già verificati sul disco e con
    // ?v=<timestamp> per invalidare cache browser e service worker quando
    // il file viene sostituito. Le stringhe vuote indicano "file assente".
    icon192:  <?= jsVal(assetUrl(iconPath(192))) ?>,
    icon512:  <?= jsVal(assetUrl(iconPath(512))) ?>,
    logo:     <?= jsVal(logoUrl()) ?>,
    logoWebp: <?= jsVal($webpPath !== '' ? assetUrl($webpPath) : '') ?>,

    // Opzioni solo frontend
    categories:  ['education', 'entertainment', 'utilities'],
    lang:        'it',
    dir:         'ltr',
    orientation: 'any',
    display:     'standalone',
  },

  // ============================================================
  // SOCIAL - Configurazione condivisione (solo frontend)
  // ============================================================
  social: {
    enableFacebook: true,
    enableWhatsApp: true,
    enableTelegram: true,
    enableEmail:    true,
  },

  // ============================================================
  // PATHS — cartella modelli letta da config.php + percorsi frontend
  // ============================================================
  paths: {
    // Letto da config.php
    modelsFolder: <?= jsVal($paths['modelsFolder'] ?? 'modelli') ?>,

    // Percorsi solo frontend
    catalogApi: 'api/catalogo.php',
    cssFolder:  'css',
  },

};

// ============================================================
// PERSONALIZZAZIONI UTENTE (custom/settings.ini)
// ============================================================
// Sovrascrivono solo le chiavi impostate dall'utente: tutto il resto
// resta ai default definiti sopra.
function applyOverrides(target, overrides) {
  Object.entries(overrides || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)
        && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      applyOverrides(target[key], value);
    } else if (value !== null && value !== undefined && value !== '') {
      target[key] = value;
    }
  });
}

applyOverrides(CONFIG, <?= jsVal((object) $frontendOverrides) ?>);

// Esporta la configurazione come variabile globale
if (typeof window !== 'undefined') {
  window.APP_CONFIG = CONFIG;

  /**
   * Inietta le variabili CSS del tema dalla configurazione.
   * Chiamata automaticamente al caricamento della pagina.
   */
  function injectThemeVariables() {
    const theme = CONFIG.theme || {};
    const root = document.documentElement;

    const cssVars = {
      '--bg-color':      theme.bgColor,
      '--panel-bg':      theme.panelBg,
      '--panel-bg-solid':theme.panelBgSolid,
      '--border-color':  theme.borderColor,
      '--text-color':    theme.textColor,
      '--accent-color':  theme.accentColor,
      '--accent-hover':  theme.accentHover,
      '--accent-alt':    theme.accentAlt,
      '--success-color': theme.successColor,
      '--glass-blur':    theme.glassBlur,
    };

    Object.entries(cssVars).forEach(([varName, value]) => {
      if (value) {
        root.style.setProperty(varName, value);
      }
    });

    (theme.sceneGradient || []).forEach((color, i) => {
      if (color) {
        root.style.setProperty('--scene-grad-' + i, color);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectThemeVariables);
  } else {
    injectThemeVariables();
  }
}
