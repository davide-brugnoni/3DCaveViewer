<?php
declare(strict_types=1);

// Carica la configurazione
require_once __DIR__ . '/config.php';

// Installazione guidata: finché non è stata completata, il sito è l'installer
redirectToSetupIfNeeded();

// Carica il sistema i18n
require_once __DIR__ . '/i18n/loader.php';
$lang = getCurrentLang();

// ============================================================
// MODALITÀ INCORPORATA (?embed=1)
// ============================================================
// Interfaccia ridotta pensata per un iframe dentro un articolo esterno
// (es. WordPress). Il codice HTML si genera dal pannello "Condividi →
// Incorpora" del visualizzatore completo.
$isEmbed = isset($_GET['embed']) && (string) $_GET['embed'] === '1';

// Strumenti opzionali richiamabili con ?ui=... (whitelist rigida:
// i token sconosciuti vengono scartati). Assente => set minimo.
const EMBED_UI_TOKENS  = ['scale', 'title', 'fs', 'info', 'measure', 'sections', 'screenshot', 'lang', 'pov'];
const EMBED_UI_DEFAULT = ['scale', 'title', 'fs'];

$embedUi = [];
if ($isEmbed) {
    if (isset($_GET['ui'])) {
        $requestedUi = explode(',', (string) $_GET['ui']);
        $embedUi = array_values(array_intersect(EMBED_UI_TOKENS, array_map('trim', $requestedUi)));
    } else {
        $embedUi = EMBED_UI_DEFAULT;
    }
}

// Security headers. Eventuali host extra per connect-src si configurano
// in config.php (security.extraConnectSrc), niente domini hardcoded.
$extraConnectSrc = array_filter((array) config('security.extraConnectSrc', []), 'is_string');
$connectSrc = trim("'self' blob: " . implode(' ', $extraConnectSrc));
$viewerCsp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; connect-src $connectSrc; frame-src 'none'; object-src 'none'; worker-src 'self' blob:;";
// Solo le risposte incorporate sono inquadrabili da domini terzi; il
// visualizzatore completo resta limitato allo stesso dominio.
sendSecurityHeaders($viewerCsp, $isEmbed ? embedFrameAncestors() : null);

// Testi personalizzabili da custom/config.local.php (sezione 'texts')
$defaultTitle = uiText('texts.viewerDefaultTitle', 'viewer.defaultTitle', 'Visualizzatore cavità 3D');
$defaultDescription = uiText('texts.viewerDefaultDescription', 'viewer.defaultDescription', 'Esplora i modelli 3D.');

$requestedFolder = isset($_GET['m']) ? (string) $_GET['m'] : '';
$modelFolder = null;
$modelData = null;

// Validate folder name (Unicode letters, numbers, underscore, hyphen; no path traversal)
if (isValidModelFolder($requestedFolder)) {
    $modelFolder = $requestedFolder;
    $metadataPath = modelDir($modelFolder) . '/' . $modelFolder . '.json';
    if (is_readable($metadataPath)) {
        $metadataRaw = file_get_contents($metadataPath);
        if ($metadataRaw !== false) {
            $decoded = json_decode($metadataRaw, true);
            if (is_array($decoded)) {
                $modelData = $decoded;
                $modelData['folder'] = $modelData['folder'] ?? $modelFolder;
            }
        }
    }
}

$pageTitle = $defaultTitle;
$pageDescription = $defaultDescription;
$pageImage = '';

if (is_array($modelData)) {
    $pageTitle = isset($modelData['name']) && $modelData['name'] !== '' ? (string) $modelData['name'] : $pageTitle;
    $pageDescription = isset($modelData['description']) && $modelData['description'] !== '' ? (string) $modelData['description'] : $pageDescription;
    $modelFolder = $modelData['folder'] ?? $modelFolder;
}

// Early hint: precarica il file 3D così il download parte insieme al caricamento dei moduli JS
$preloadModelUrl = null;
$preloadModelMedia = null;
if (is_array($modelData) && is_string($modelFolder)
    && isValidModelFolder($modelFolder)
    && isset($modelData['file']) && is_string($modelData['file'])
    && preg_match('/^[\pL\pN _.()-]+\.(glb|gltf)$/u', $modelData['file'])
    && strpos($modelData['file'], '..') === false) {
    $candidatePath = modelDir($modelFolder) . '/' . $modelData['file'];
    if (is_file($candidatePath)) {
        $preloadModelUrl = rawurlencode((string) config('paths.modelsFolder', 'modelli')) . '/' . rawurlencode($modelFolder) . '/' . rawurlencode($modelData['file']);
        // Un file precaricato resta nella memory cache del browser finché la
        // fetch del viewer non lo consuma, e quella ne costruisce la propria
        // copia: per un GLB grande sono due copie intere in RAM, quanto basta
        // a far chiudere la scheda su un telefono. Sopra i 32 MB il preload si
        // limita ai dispositivi con puntatore fine (desktop/portatili).
        $preloadModelSize = @filesize($candidatePath);
        $preloadModelMedia = ($preloadModelSize !== false && $preloadModelSize > 32 * 1024 * 1024)
            ? '(pointer: fine)'
            : null;
    }
}

$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] === '443');
$scheme = $isHttps ? 'https' : 'http';

// Validate HTTP_HOST to prevent host header injection attacks
$httpHost = $_SERVER['HTTP_HOST'] ?? '';
if ($httpHost !== '' && preg_match('/^[a-zA-Z0-9.-]+(:[0-9]+)?$/', $httpHost)) {
    $host = $httpHost;
} else {
    // Fallback to SERVER_NAME if HTTP_HOST is invalid
    $host = $_SERVER['SERVER_NAME'] ?? 'localhost';
}

$requestUri = $_SERVER['REQUEST_URI'] ?? '/viewer.php';
$pageUrl = $scheme . '://' . $host . $requestUri;

$scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? ''));
if ($scriptDir === '.' || $scriptDir === '\\' || $scriptDir === '/') {
    $scriptDir = '';
}
$baseUrl = $scheme . '://' . $host . $scriptDir;
if (substr($baseUrl, -1) !== '/') {
    $baseUrl .= '/';
}

if ($modelFolder) {
    // Use the social preview generator endpoint
    $pageImage = $baseUrl . 'generate_social_preview.php?m=' . urlencode($modelFolder);
}

// URL del visualizzatore completo, per il pulsante "Apri nel visualizzatore"
// della modalità incorporata. Ricostruito da parametri validati uno per uno,
// mai concatenando la query string ricevuta.
$fullViewerUrl = $baseUrl . 'viewer.php';
if ($isEmbed) {
    $fullParams = [];
    if (is_string($modelFolder) && $modelFolder !== '') {
        $fullParams['m'] = $modelFolder;
    }
    foreach (['cam', 'tgt'] as $vecParam) {
        $vecValue = isset($_GET[$vecParam]) ? (string) $_GET[$vecParam] : '';
        if (preg_match('/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){2}$/', $vecValue) === 1) {
            $fullParams[$vecParam] = $vecValue;
        }
    }
    $secValue = isset($_GET['sec']) ? (string) $_GET['sec'] : '';
    // asse, posizione 0-100, lato invertito — stessi limiti di
    // parseSectionParam() in js/viewer.js
    if (preg_match('/^[xyz],(?:100(?:\.0+)?|\d{1,2}(?:\.\d+)?),[01]$/', $secValue) === 1) {
        $fullParams['sec'] = $secValue;
    }
    $fullParams['lang'] = $lang;
    $fullViewerUrl .= '?' . http_build_query($fullParams);
}

// In un iframe ogni link interno navigherebbe dentro il riquadro:
// in modalità incorporata si aprono tutti in una scheda nuova.
$linkTarget = $isEmbed ? ' target="_blank" rel="noopener"' : '';
?>
<!DOCTYPE html>
<!--
  3D Cave Viewer
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
-->
<html lang="<?= e($lang); ?>">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no,viewport-fit=cover" />
  <meta name="description" content="<?= htmlspecialchars($pageDescription, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="<?= htmlspecialchars($pageTitle, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" />
  <meta property="og:description" content="<?= htmlspecialchars($pageDescription, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" />
  <meta property="og:image" content="<?= htmlspecialchars($pageImage, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" />
  <meta property="og:url" content="<?= htmlspecialchars($pageUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="<?= htmlspecialchars($pageTitle, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" />
  <meta name="twitter:description" content="<?= htmlspecialchars($pageDescription, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" />
  <meta name="twitter:image" content="<?= htmlspecialchars($pageImage, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" />
  <title><?= htmlspecialchars($pageTitle, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></title>
  <meta name="theme-color" content="<?= e(config('theme.themeColor', '#0b0d10')); ?>" />
<?php if ($isEmbed): ?>
  <!-- La pagina incorporata è un duplicato ridotto del visualizzatore:
       fuori dall'indice, con canonical sulla versione completa. -->
  <meta name="robots" content="noindex, follow" />
  <link rel="canonical" href="<?= e($fullViewerUrl); ?>" />
<?php else: ?>
  <link rel="manifest" href="manifest.json">
<?php endif; ?>
  <link rel="stylesheet" href="lib/fonts/poppins.css">
  <link rel="stylesheet" href="css/viewer.css">
  <script type="importmap">
    {
      "imports": {
        "three": "./lib/three/build/three.module.js",
        "three/addons/": "./lib/three/examples/jsm/",
        "three-mesh-bvh": "./lib/three-mesh-bvh/index.module.js"
      }
    }
  </script>
  <link rel="modulepreload" href="lib/three/build/three.module.js" />
  <link rel="modulepreload" href="js/viewer.js" />
  <link rel="modulepreload" href="lib/three/examples/jsm/loaders/GLTFLoader.js" />
  <link rel="modulepreload" href="lib/three/examples/jsm/loaders/OBJLoader.js" />
  <link rel="modulepreload" href="lib/three/examples/jsm/loaders/MTLLoader.js" />
  <link rel="modulepreload" href="lib/three/examples/jsm/loaders/DRACOLoader.js" />
  <link rel="modulepreload" href="lib/three/examples/jsm/loaders/KTX2Loader.js" />
  <link rel="modulepreload" href="lib/three/examples/jsm/libs/meshopt_decoder.module.js" />
  <link rel="modulepreload" href="lib/three/examples/jsm/controls/OrbitControls.js" />
  <link rel="modulepreload" href="lib/three/examples/jsm/controls/PointerLockControls.js" />
  <link rel="modulepreload" href="lib/three/examples/jsm/webxr/VRButton.js" />
  <link rel="modulepreload" href="lib/three/examples/jsm/utils/BufferGeometryUtils.js" />
  <link rel="modulepreload" href="lib/three/examples/jsm/utils/WorkerPool.js" />
  <link rel="modulepreload" href="lib/three/examples/jsm/libs/ktx-parse.module.js" />
  <link rel="modulepreload" href="lib/three/examples/jsm/libs/zstddec.module.js" />
<?php if ($preloadModelUrl !== null): ?>
  <link rel="preload" as="fetch" href="<?= e($preloadModelUrl); ?>" crossorigin="anonymous"<?= $preloadModelMedia !== null ? ' media="' . e($preloadModelMedia) . '"' : ''; ?> />
<?php endif; ?>
</head>
<body<?= $isEmbed ? ' class="embed-mode" data-embed-ui="' . e(implode(' ', $embedUi)) . '"' : ''; ?>>
  <!-- Top bar: hamburger (mobile) + selettore modello sempre visibile -->
  <div id="top-bar">
    <button id="menu-toggle" class="icon-btn" aria-label="<?= e(__t('menu.open')); ?>" aria-expanded="false" aria-controls="controls-container">
      <span class="hamburger" aria-hidden="true"></span>
    </button>
    <div id="model-selector-wrapper" class="model-selector-wrapper">
      <button type="button" id="model-selector-toggle" class="model-selector-toggle" aria-haspopup="listbox" aria-expanded="false">
        <span id="model-selector-label"><?= e(__t('viewer.selectModel')); ?></span>
        <span class="model-selector-arrow">&#9662;</span>
      </button>
      <div id="model-selector-dropdown" class="model-selector-dropdown" style="display:none;">
        <div class="model-selector-search-wrap">
          <svg class="model-selector-search-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="model-selector-search" class="model-selector-search" placeholder="<?= e(__t('viewer.searchModel')); ?>" autocomplete="off" />
        </div>
        <ul id="model-selector-list" class="model-selector-list" role="listbox"></ul>
        <div id="model-selector-empty" class="model-selector-empty" style="display:none;"><?= e(__t('viewer.noModelResults')); ?></div>
      </div>
    </div>
    <?php $langsMeta = getLanguagesMeta(); ?>
    <div class="language-selector" id="language-selector">
      <button type="button" class="lang-selector-btn" id="lang-selector-btn" aria-haspopup="listbox" aria-expanded="false" title="<?= e(__t('language.select', 'Seleziona lingua')) ?>">
        <span class="lang-flag lang-flag-<?= e($lang) ?>" aria-hidden="true"></span>
        <span class="lang-code"><?= e(strtoupper($lang)) ?></span>
        <span class="lang-arrow" aria-hidden="true">&#9662;</span>
      </button>
      <div class="lang-dropdown" role="listbox" aria-label="<?= e(__t('language.label', 'Lingua')) ?>">
        <?php foreach ($langsMeta as $code => $meta): ?>
        <a class="lang-option" role="option" aria-selected="<?= $code === $lang ? 'true' : 'false' ?>" href="<?= e(buildLangURL($code)) ?>" hreflang="<?= e($code) ?>" lang="<?= e($code) ?>" aria-label="<?= e($meta['name']) ?>" title="<?= e($meta['name']) ?>">
          <span class="lang-flag lang-flag-<?= e($code) ?>" aria-hidden="true"></span>
          <span class="lang-code"><?= e(strtoupper($code)) ?></span>
        </a>
        <?php endforeach; ?>
      </div>
    </div>
  </div>
  <!-- Comandi -->
  <div id="controls-container">
    <!-- Pulsanti azione principali -->
    <div class="menu-group menu-group-actions">
      <a id="back-to-map" class="btn tool-btn" href="index.php"<?= $linkTarget; ?> title="<?= e(__t('loader.backToMap', 'Torna alla mappa')); ?>" aria-label="<?= e(__t('loader.backToMap', 'Torna alla mappa')); ?>">
        <svg class="tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
        <span class="lbl"><?= e(__t('viewer.mapShort', 'Mappa')); ?></span>
      </a>
      <button id="reset-view" title="<?= e(__t('viewer.resetView')); ?> (R)" class="btn tool-btn" aria-label="<?= e(__t('viewer.resetView')); ?>">
        <svg class="tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="7"/><line x1="22" y1="12" x2="19" y2="12"/><line x1="5" y1="12" x2="2" y2="12"/><line x1="12" y1="5" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="19"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>
        <span class="lbl"><?= e(__t('viewer.resetView')); ?></span>
      </button>
    </div>

    <!-- Strumenti che aprono un pannello -->
    <div class="menu-group menu-group-tools">
      <label class="switch" for="views-toggle" title="<?= e(__t('viewer.views')); ?>">
        <svg class="tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
        <span class="lbl"><?= e(__t('viewer.views')); ?></span>
        <input id="views-toggle" type="checkbox" role="switch" aria-checked="false" />
      </label>
      <label class="switch" for="section-toggle" title="<?= e(__t('viewer.sections')); ?>">
        <svg class="tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="3 3"/></svg>
        <span class="lbl"><?= e(__t('viewer.sections')); ?></span>
        <input id="section-toggle" type="checkbox" role="switch" aria-checked="false" />
      </label>
      <label class="switch" for="measure-enable" title="<?= e(__t('measure.enable')); ?> (M)">
        <svg class="tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><path d="M2 16l6 6L22 8l-6-6L2 16z"/><line x1="6.5" y1="11.5" x2="8.5" y2="13.5"/><line x1="10" y1="8" x2="12" y2="10"/><line x1="13.5" y1="4.5" x2="15.5" y2="6.5"/></svg>
        <span class="lbl"><?= e(__t('viewer.measureShort')); ?></span>
        <input id="measure-enable" type="checkbox" role="switch" aria-checked="false" disabled />
      </label>
      <label class="switch" for="poi-toggle" title="<?= e(__t('poi.listTitle', 'Punti di interesse')); ?>">
        <svg class="tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span class="lbl"><?= e(__t('poi.toggleShort', 'POI')); ?></span>
        <input id="poi-toggle" type="checkbox" role="switch" aria-checked="false" disabled />
      </label>
    </div>

    <!-- Modalità di navigazione -->
    <div class="menu-group menu-group-modes">
      <label class="switch" for="auto-rotate-toggle" title="<?= e(__t('viewer.autoRotate')); ?>">
        <svg class="tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        <span class="lbl"><?= e(__t('viewer.autoRotate')); ?></span>
        <input id="auto-rotate-toggle" type="checkbox" role="switch" aria-checked="false" />
      </label>
      <label class="switch" for="enter-fp-toggle" title="<?= e(__t('viewer.firstPerson')); ?> &#8211; <?= e(__t('viewer.firstPersonFull')); ?> (P / Esc)">
        <svg class="tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        <span class="lbl"><?= e(__t('viewer.firstPerson')); ?></span>
        <input id="enter-fp-toggle" type="checkbox" role="switch" aria-checked="false" />
      </label>
    </div>

    <!-- Pulsanti secondari -->
    <div class="menu-group menu-group-footer">
      <button id="info-open" class="icon-btn" title="<?= e(__t('viewer.info')); ?>" aria-label="<?= e(__t('viewer.showInfo')); ?>">i</button>
      <button id="help-open" class="icon-btn" title="<?= e(__t('viewer.help')); ?> (H)" aria-label="<?= e(__t('viewer.openHelp')); ?>">?</button>
      <button id="share-link" class="btn tool-btn" title="<?= e(__t('viewer.share')); ?>" aria-label="<?= e(__t('viewer.share')); ?>">
        <svg class="tool-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="8.59" y1="10.49" x2="15.41" y2="6.51"/></svg>
        <span class="lbl"><?= e(__t('viewer.share')); ?></span>
      </button>
      <button id="screenshot-btn" class="icon-btn" disabled title="<?= e(__t('viewer.screenshotTitle')); ?>" aria-label="<?= e(__t('viewer.screenshot')); ?>"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button>
    </div>
  </div>

  <!-- Overlay caricamento -->
  <div id="loader-overlay" aria-live="polite" role="status">
    <div class="panel">
      <div class="title"><?= e(__t('viewer.loadingModel')); ?></div>
      <div class="model-name">—</div>
      <div class="loader-status">
        <span class="status-icon">⬇</span>
        <span class="status-text" data-downloading="<?= e(__t('loader.downloading', 'Download in corso...')); ?>" data-processing="<?= e(__t('loader.processing', 'Elaborazione...')); ?>"><?= e(__t('loader.downloading', 'Download in corso...')); ?></span>
      </div>
      <div class="track"><div class="fill"></div></div>
      <div class="loader-details">
        <span class="percent">0%</span>
        <span class="file-size"></span>
      </div>
      <div class="loader-error" id="loader-error" hidden>
        <div class="loader-error-title"><?= e(__t('loader.errorTitle', 'Errore di caricamento')); ?></div>
        <div class="loader-error-message" id="loader-error-message"></div>
        <div class="loader-error-actions">
          <button type="button" id="loader-retry" class="btn"><?= e(__t('loader.retry', 'Riprova')); ?></button>
          <a href="index.php" class="btn loader-back-link"><?= e(__t('loader.backToMap', 'Torna alla mappa')); ?></a>
        </div>
      </div>
    </div>
  </div>

  <!-- Logo (percorso configurabile da custom/settings.ini: [pwa] logo)
       Il riquadro non viene proprio renderizzato se il file non esiste. -->
  <?php $logoMarkup = logoPicture('logo-img'); ?>
  <?php if ($logoMarkup !== ''): ?>
  <a href="index.php"<?= $linkTarget; ?> title="<?= e(__t('common.backToHome', 'Torna alla Home')); ?>">
    <div id="logo-box"><?= $logoMarkup; ?></div>
  </a>
  <?php endif; ?>

  <!-- Barra di scala -->
  <div id="scalebar">
    <div class="bar"></div>
    <div class="label">—</div>
  </div>

<?php if ($isEmbed): ?>
  <!-- Barra della modalità incorporata: nome del modello e rimando al
       visualizzatore completo. Il link funziona anche senza JavaScript. -->
  <div id="embed-bar">
    <span id="embed-title"><?= e($pageTitle); ?></span>
    <?php if (in_array('fs', $embedUi, true)): ?>
    <button type="button" id="embed-fullscreen" class="icon-btn" title="<?= e(__t('embed.fullscreen', 'Schermo intero')); ?>" aria-label="<?= e(__t('embed.fullscreen', 'Schermo intero')); ?>">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
    </button>
    <?php endif; ?>
    <a id="embed-open-full" class="btn" href="<?= e($fullViewerUrl); ?>" target="_blank" rel="noopener">
      <span><?= e(__t('embed.openFull', 'Apri nel visualizzatore')); ?></span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    </a>
  </div>
<?php endif; ?>

  <!-- Copyright -->
  <div id="copyright">
<?php $contactEmail = (string) config('branding.contactEmail', ''); ?>
<?php if ($contactEmail !== ''): ?>
    <a href="mailto:<?= e($contactEmail); ?>">© <?= e(formatText((string) config('branding.copyrightHolder', ''))); ?></a>
<?php else: ?>
    <span>© <?= e(formatText((string) config('branding.copyrightHolder', ''))); ?></span>
<?php endif; ?>
    <span class="footer-separator">|</span>
    <a href="status.php" class="cache-status-link" title="<?= e(__t('footer.cacheStatus', 'Stato cache offline')); ?>">
      <span class="cache-status-dot" id="cache-status-dot"></span>
      <span class="cache-status-text"><?= e(__t('footer.cache', 'Cache')); ?></span>
    </a>
    <span class="footer-separator footer-separator-ribbon">|</span>
    <?= projectRibbon(); ?>
  </div>

  <!-- Joystick (solo touch + FP attivo) -->
  <div id="joystick" aria-label="Joystick WSAD"><div class="stick"></div></div>

  <!-- Backdrop pannelli mobili -->
  <div id="panel-backdrop" aria-hidden="true"></div>

  <!-- Mini-bar pannello ridotto (solo mobile) -->
  <button type="button" id="panel-mini-bar" aria-hidden="true" tabindex="-1">
    <span id="panel-mini-icon" aria-hidden="true"></span>
    <span id="panel-mini-label"></span>
    <span class="panel-mini-expand" aria-hidden="true">&#8679;</span>
  </button>

  <!-- Pannello Misurazioni (flottante, trascinabile) -->
  <div id="measure-panel" class="floating-panel" role="dialog" aria-labelledby="measure-panel-title" aria-modal="false" style="display:none;">
    <div class="floating-panel-header" id="measure-panel-header">
      <span class="floating-panel-title" id="measure-panel-title"><?= e(__t('measure.listTitle')); ?></span>
      <div class="floating-panel-actions">
        <button type="button" class="floating-panel-minimize" id="measure-panel-minimize" aria-label="<?= e(__t('common.minimize', 'Minimizza')); ?>" title="<?= e(__t('common.minimize', 'Minimizza')); ?>">&#8722;</button>
        <button type="button" class="floating-panel-close" id="measure-panel-close" aria-label="<?= e(__t('common.close')); ?>" title="<?= e(__t('common.close')); ?>">&times;</button>
      </div>
    </div>
    <div class="floating-panel-body">
      <button type="button" id="measure-add-btn" class="btn measure-add-btn">
        <span class="measure-add-icon">+</span>
        <span><?= e(__t('measure.addPoints', 'Aggiungi punti')); ?></span>
      </button>
      <div class="measure-hint-inline">
        <span id="measure-hint-text"><?= e(__t('measure.hint')); ?></span>
      </div>
      <div id="measure-list" class="measure-list">
        <div class="measure-list-empty"><?= e(__t('measure.noMeasurements')); ?></div>
      </div>
      <button type="button" id="measure-clear" class="btn measure-clear" disabled><?= e(__t('measure.clearAll')); ?></button>
      <button type="button" id="measure-export" class="btn measure-export" disabled><?= e(__t('measure.exportCsv', 'Esporta CSV')); ?></button>
    </div>
  </div>

  <!-- Pannello Punti di interesse (flottante, trascinabile) -->
  <div id="poi-panel" class="floating-panel" role="dialog" aria-labelledby="poi-panel-title" aria-modal="false" style="display:none;">
    <div class="floating-panel-header" id="poi-panel-header">
      <span class="floating-panel-title" id="poi-panel-title"><?= e(__t('poi.listTitle', 'Punti di interesse')); ?></span>
      <div class="floating-panel-actions">
        <button type="button" class="floating-panel-minimize" id="poi-panel-minimize" aria-label="<?= e(__t('common.minimize', 'Minimizza')); ?>" title="<?= e(__t('common.minimize', 'Minimizza')); ?>">&#8722;</button>
        <button type="button" class="floating-panel-close" id="poi-panel-close" aria-label="<?= e(__t('common.close')); ?>" title="<?= e(__t('common.close')); ?>">&times;</button>
      </div>
    </div>
    <div class="floating-panel-body">
      <button type="button" id="poi-add-btn" class="btn measure-add-btn" disabled>
        <span class="measure-add-icon">+</span>
        <span><?= e(__t('poi.addPoint', 'Aggiungi punto')); ?></span>
      </button>
      <div class="measure-hint-inline">
        <span id="poi-hint-text"><?= e(__t('poi.hint', 'Premi + e clicca sul modello')); ?></span>
      </div>
      <div id="poi-list" class="measure-list poi-list">
        <div class="measure-list-empty"><?= e(__t('poi.noPois', 'Nessun punto di interesse')); ?></div>
      </div>
      <div class="poi-actions-row">
        <button type="button" id="poi-export" class="btn" disabled><?= e(__t('poi.export', 'Esporta JSON')); ?></button>
        <button type="button" id="poi-import" class="btn"><?= e(__t('poi.import', 'Importa JSON')); ?></button>
        <input type="file" id="poi-import-file" accept="application/json,.json" hidden />
      </div>
    </div>
  </div>

  <!-- Pannello Viste (flottante) -->
  <div id="views-panel" class="floating-panel" role="dialog" aria-labelledby="views-panel-title" aria-modal="false" style="display:none;">
    <div class="floating-panel-header" id="views-panel-header">
      <span class="floating-panel-title" id="views-panel-title"><?= e(__t('views.title')); ?></span>
      <div class="floating-panel-actions">
        <button type="button" class="floating-panel-minimize" id="views-panel-minimize" aria-label="<?= e(__t('common.minimize', 'Minimizza')); ?>" title="<?= e(__t('common.minimize', 'Minimizza')); ?>">&#8722;</button>
        <button type="button" class="floating-panel-close" id="views-panel-close" aria-label="<?= e(__t('common.close')); ?>" title="<?= e(__t('common.close')); ?>">&times;</button>
      </div>
    </div>
    <div class="floating-panel-body">
      <div id="views-grid"></div>
    </div>
  </div>

  <!-- Pannello Sezioni (flottante) -->
  <div id="section-panel" class="floating-panel" role="dialog" aria-labelledby="section-panel-title" aria-modal="false" style="display:none;">
    <div class="floating-panel-header" id="section-panel-header">
      <span class="floating-panel-title" id="section-panel-title"><?= e(__t('viewer.sections')); ?></span>
      <div class="floating-panel-actions">
        <button type="button" class="floating-panel-minimize" id="section-panel-minimize" aria-label="<?= e(__t('common.minimize', 'Minimizza')); ?>" title="<?= e(__t('common.minimize', 'Minimizza')); ?>">&#8722;</button>
        <button type="button" class="floating-panel-close" id="section-panel-close" aria-label="<?= e(__t('common.close')); ?>" title="<?= e(__t('common.close')); ?>">&times;</button>
      </div>
    </div>
    <div class="floating-panel-body">
      <div class="section-group">
        <label class="section-enable">
          <input type="checkbox" id="section-enable" disabled />
          <span><?= e(__t('viewer.enableSection')); ?></span>
        </label>
      </div>
      <div class="section-group">
        <span class="section-label"><?= e(__t('viewer.axis')); ?></span>
        <div class="section-axes">
          <button type="button" class="btn section-axis-btn" data-section-axis="x" disabled>X</button>
          <button type="button" class="btn section-axis-btn active" data-section-axis="y" disabled>Y</button>
          <button type="button" class="btn section-axis-btn" data-section-axis="z" disabled>Z</button>
        </div>
      </div>
      <div class="section-group">
        <div class="section-slider-row">
          <label for="section-slider"><?= e(__t('viewer.position')); ?></label>
          <span id="section-value" class="section-value">—</span>
        </div>
        <input type="range" id="section-slider" min="0" max="100" value="50" step="1" disabled />
      </div>
      <div class="section-group">
        <button type="button" id="section-invert" class="btn section-invert" aria-pressed="false" disabled><?= e(__t('viewer.invertSide')); ?></button>
      </div>
    </div>
  </div>

  <!-- Crosshair -->
  <div id="crosshair"><div class="h"></div><div class="v"></div><div class="dot"></div></div>

  <!-- VR Comfort Vignette -->
  <div id="vr-vignette"></div>

  <!-- Hint arming (desktop) -->
  <div id="fp-arm-hint"><?= __t('viewer.fpHint'); ?></div>

  <!-- INFO OVERLAY -->
  <div id="info-overlay" role="dialog" aria-modal="true" aria-labelledby="info-title">
    <div class="panel">
      <div class="info-header">
        <span class="info-icon">📍</span>
        <div class="title" id="info-title"></div>
      </div>
      <div class="info-section coords-section">
        <span class="section-icon">🌍</span>
        <div class="coords" id="info-coords"></div>
      </div>
      <div class="info-section description-section">
        <span class="section-icon">📄</span>
        <div class="description" id="info-description"></div>
      </div>
      <div class="row">
        <div class="right"><button id="info-close" class="btn" aria-label="<?= e(__t('common.close')); ?>"><?= e(__t('common.close')); ?></button></div>
      </div>
    </div>
  </div>

  <!-- POPUP AIUTO -->
  <div id="help-overlay" role="dialog" aria-modal="true" aria-labelledby="help-title" aria-describedby="help-content">
    <div class="panel">
      <div class="title" id="help-title"><?= e(__t('help.title')); ?></div>
      <div class="subtitle" id="help-subtitle">—</div>
      <div id="help-content"></div>
      <div class="row">
        <label class="left"><input type="checkbox" id="help-dontshow" /><span><?= e(__t('common.dontShowAgain')); ?></span></label>
        <div class="right"><button id="help-close" class="btn" title="<?= e(__t('common.close')); ?> (H)"><?= e(__t('common.close')); ?> (H)</button></div>
      </div>
    </div>
  </div>

  <!-- ONBOARDING -->
  <div id="onboard" role="dialog" aria-modal="true" aria-labelledby="onboard-title" aria-describedby="onboard-steps">
    <div class="panel">
      <div class="title" id="onboard-title"><?= e(__t('onboarding.title')); ?></div>
      <div class="steps" id="onboard-steps">
        <p><strong>1)</strong> <?= __t('onboarding.step1'); ?></p>
        <p><strong>2)</strong> <?= __t('onboarding.step2'); ?></p>
        <p><strong>3)</strong> <?= __t('onboarding.step3'); ?></p>
      </div>
      <div class="row">
        <label class="left"><input type="checkbox" id="onboard-dontshow" /><span><?= e(__t('common.dontShowAgain')); ?></span></label>
        <div class="right"><button id="onboard-close" class="btn"><?= e(__t('common.ok')); ?></button></div>
      </div>
    </div>
  </div>

  <!-- SHARE OVERLAY -->
  <div id="share-overlay" role="dialog" aria-modal="true" aria-labelledby="share-title">
    <div class="panel">
      <div class="title" id="share-title"><?= e(__t('share.title')); ?></div>

      <div id="share-tabs" role="tablist" aria-label="<?= e(__t('share.title')); ?>">
        <button type="button" id="share-tab-social" class="share-tab active" role="tab" aria-selected="true" aria-controls="share-pane-social"><?= e(__t('embed.shareTab', 'Link')); ?></button>
        <button type="button" id="share-tab-embed" class="share-tab" role="tab" aria-selected="false" aria-controls="share-pane-embed"><?= e(__t('embed.tab', 'Incorpora')); ?></button>
      </div>

      <div id="share-pane-social" role="tabpanel" aria-labelledby="share-tab-social">
        <div id="share-grid">
<?php
          // [social] in custom/settings.ini: un canale spento resta nel DOM
          // (dom.js e il codice di condivisione lo danno per presente) ma
          // nascosto. Default: tutti attivi, come in js/config.php.
          $shareOff = static fn(string $key): string =>
              configCustom('social.' . $key) === false ? ' hidden' : '';
?>
          <a id="share-fb"   class="share-btn share-fb"   href="#" target="_blank" rel="noopener"<?= $shareOff('enableFacebook'); ?>><?= e(__t('share.facebook')); ?></a>
          <a id="share-wa"   class="share-btn share-wa"   href="#" target="_blank" rel="noopener"<?= $shareOff('enableWhatsApp'); ?>><?= e(__t('share.whatsapp')); ?></a>
          <a id="share-tg"   class="share-btn share-tg"   href="#" target="_blank" rel="noopener"<?= $shareOff('enableTelegram'); ?>><?= e(__t('share.telegram')); ?></a>
          <a id="share-mail" class="share-btn share-mail" href="#"<?= $shareOff('enableEmail'); ?>><?= e(__t('share.email')); ?></a>
        </div>
      </div>

      <!-- Generatore del codice da incollare in un articolo esterno -->
      <div id="share-pane-embed" role="tabpanel" aria-labelledby="share-tab-embed" hidden>
        <p class="embed-hint"><?= e(__t('embed.hint', 'Copia il codice e incollalo in un blocco HTML del tuo articolo.')); ?></p>

        <div class="embed-group">
          <label class="embed-check">
            <input type="checkbox" id="embed-opt-view" checked />
            <span><?= e(__t('embed.includeView', 'Parti dalla vista attuale')); ?></span>
          </label>
          <label class="embed-check">
            <input type="checkbox" id="embed-opt-section" />
            <span><?= e(__t('embed.includeSection', 'Includi il piano di sezione')); ?></span>
          </label>
        </div>

        <div class="embed-group">
          <label class="embed-label" for="embed-opt-ratio"><?= e(__t('embed.ratio', 'Proporzioni')); ?></label>
          <select id="embed-opt-ratio" class="embed-select">
            <option value="16/9" selected>16:9</option>
            <option value="4/3">4:3</option>
            <option value="1/1">1:1</option>
            <option value="21/9">21:9</option>
          </select>
        </div>

        <div class="embed-group">
          <span class="embed-label"><?= e(__t('embed.tools', 'Strumenti visibili')); ?></span>
          <div class="embed-tools">
            <label class="embed-check"><input type="checkbox" data-embed-tool="scale" checked /><span><?= e(__t('embed.toolScale', 'Barra di scala')); ?></span></label>
            <label class="embed-check"><input type="checkbox" data-embed-tool="title" checked /><span><?= e(__t('embed.toolTitle', 'Nome del modello')); ?></span></label>
            <label class="embed-check"><input type="checkbox" data-embed-tool="fs" checked /><span><?= e(__t('embed.toolFullscreen', 'Schermo intero')); ?></span></label>
            <label class="embed-check"><input type="checkbox" data-embed-tool="info" /><span><?= e(__t('embed.toolInfo', 'Informazioni')); ?></span></label>
            <label class="embed-check"><input type="checkbox" data-embed-tool="measure" /><span><?= e(__t('embed.toolMeasure', 'Misure')); ?></span></label>
            <label class="embed-check"><input type="checkbox" data-embed-tool="sections" /><span><?= e(__t('embed.toolSections', 'Sezioni')); ?></span></label>
            <label class="embed-check"><input type="checkbox" data-embed-tool="screenshot" /><span><?= e(__t('embed.toolScreenshot', 'Screenshot')); ?></span></label>
            <label class="embed-check"><input type="checkbox" data-embed-tool="lang" /><span><?= e(__t('embed.toolLang', 'Lingua')); ?></span></label>
            <label class="embed-check"><input type="checkbox" data-embed-tool="pov" /><span><?= e(__t('embed.toolPov', 'Prima persona')); ?></span></label>
          </div>
        </div>

        <div class="embed-group">
          <label class="embed-label" for="embed-code"><?= e(__t('embed.code', 'Codice da incollare')); ?></label>
          <textarea id="embed-code" class="embed-code" rows="6" readonly spellcheck="false" wrap="off"></textarea>
        </div>

        <div class="embed-actions">
          <button type="button" id="embed-copy" class="btn"><?= e(__t('embed.copy', 'Copia codice')); ?></button>
          <a id="embed-preview" class="btn" href="#" target="_blank" rel="noopener"><?= e(__t('embed.preview', 'Anteprima')); ?></a>
        </div>
      </div>

      <div id="share-actions">
        <button id="share-close" aria-label="<?= e(__t('common.close')); ?>"><?= e(__t('common.close')); ?></button>
      </div>
    </div>
  </div>

  <!-- Coachmark -->
  <div id="coach-bubble" role="note" aria-live="polite">
    <div class="arrow"></div>
    <div class="hint"><span><?= e(__t('onboarding.coachHint')); ?></span></div>
  </div>

  <div id="toast" role="status" aria-live="polite" aria-atomic="true"></div>

<script src="js/config.php"></script>
<script src="js/i18n.js"></script>
<script src="js/lang-selector.js" defer></script>
<?php if (!$isEmbed): ?>
<script src="js/pwa-register.js" defer></script>
  <script src="js/viewer-pwa.js" defer></script>
<?php endif; // in un iframe di terzi non si registra il service worker ?>

  <script type="module" src="js/viewer.js"></script>
</body>
</html>


