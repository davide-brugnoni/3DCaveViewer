<?php
declare(strict_types=1);

// Carica la configurazione
require_once __DIR__ . '/config.php';

// Installazione guidata: finché non è stata completata, il sito è l'installer
redirectToSetupIfNeeded();

// Carica il sistema i18n
require_once __DIR__ . '/i18n/loader.php';
$lang = getCurrentLang();

// Security headers
sendSecurityHeaders("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' https:; frame-src 'none'; object-src 'none';");
?>
<!DOCTYPE html>
<!--
  3D Cave Viewer
  https://github.com/davide-brugnoni/3DCaveViewer/
  https://www.3dcaveviewer.com

  Copyright (C) 2025 Davide Brugnoni

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
  <meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover" />
  <title><?= e(__t('status.pageTitle', 'Stato Cache Offline')); ?> - <?= e(config('branding.appName')); ?></title>

  <!-- Meta Description -->
  <meta name="description" content="<?= e(__t('status.metaDescription', 'Gestisci i file salvati offline e monitora lo spazio utilizzato dalla cache del 3D Cave Viewer.')); ?>" />

  <!-- Open Graph / Social Media -->
  <meta property="og:type" content="website" />
  <meta property="og:title" content="<?= e(__t('status.pageTitle', 'Stato Cache Offline')); ?> - <?= e(config('branding.appName')); ?>" />
  <meta property="og:description" content="<?= e(__t('status.pageDescription', 'Gestisci i file salvati offline e monitora lo spazio utilizzato.')); ?>" />
  <?php // Icone risolte da config.php: custom/ vince su img/, '' se assenti
  $icon192 = assetUrl(iconPath(192));
  $icon512 = assetUrl(iconPath(512)); ?>
  <?php if ($icon512 !== ''): ?>
  <meta property="og:image" content="<?= e($icon512); ?>" />
  <?php endif; ?>
  <meta property="og:locale" content="<?= e($lang); ?>_<?= e(strtoupper($lang)); ?>" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="<?= e(__t('status.pageTitle', 'Stato Cache Offline')); ?> - <?= e(config('branding.appName')); ?>" />
  <meta name="twitter:description" content="<?= e(__t('status.pageDescription', 'Gestisci i file salvati offline.')); ?>" />

  <!-- Theme and Icons -->
  <meta name="theme-color" content="<?= e(config('theme.themeColor', '#0d1117')); ?>" />
  <?php if ($icon192 !== ''): ?>
  <link rel="icon" type="image/png" sizes="192x192" href="<?= e($icon192); ?>" />
  <?php endif; ?>
  <?php if ($icon512 !== ''): ?>
  <link rel="icon" type="image/png" sizes="512x512" href="<?= e($icon512); ?>" />
  <?php endif; ?>
  <?php if ($icon192 !== ''): ?>
  <link rel="apple-touch-icon" href="<?= e($icon192); ?>" />
  <?php endif; ?>
  <link rel="manifest" href="manifest.json" />

  <!-- Fonts (locali) -->
  <link rel="stylesheet" href="lib/fonts/poppins.css" />

  <!-- Stylesheet -->
  <link rel="stylesheet" href="css/status.css" />
</head>
<body>
  <!-- Loading Overlay -->
  <div class="loading-overlay" id="loading-overlay" role="status" aria-live="polite" aria-label="<?= e(__t('common.loading', 'Caricamento...')); ?>">
    <div class="loading-spinner" aria-hidden="true"></div>
    <p class="loading-text"><?= e(__t('status.loadingCache', 'Caricamento cache...')); ?></p>
    <p class="loading-subtext" id="loading-status"><?= e(__t('status.initializingSW', 'Inizializzazione Service Worker')); ?></p>
  </div>

  <!-- Noscript Fallback -->
  <noscript>
    <div class="noscript-message" role="alert">
      <h2><?= e(__t('status.jsRequired', 'JavaScript Richiesto')); ?></h2>
      <p>
        <?= e(__t('status.jsRequiredMessage', 'Questa pagina richiede JavaScript per funzionare correttamente.')); ?>
        <br />
        <?= e(__t('status.jsRequiredHint', 'Abilita JavaScript nel tuo browser per gestire la cache offline del 3D Cave Viewer.')); ?>
      </p>
      <p>
        <a href="index.php"><?= e(__t('status.backToHome', 'Torna alla home')); ?></a>
      </p>
    </div>
  </noscript>

  <div class="container">
    <!-- Header -->
    <header>
      <?php $logoMarkup = logoPicture('logo', (string) config('branding.appName', '') . ' Logo'); ?>
      <?php if ($logoMarkup !== ''): ?>
      <a href="index.php" title="<?= e(__t('status.backToHome', 'Torna alla home')); ?>">
        <?= $logoMarkup; ?>
      </a>
      <?php endif; ?>
      <div class="title-section">
        <h1><?= e(__t('status.header', 'Gestione Cache Offline')); ?></h1>
        <p><?= e(__t('status.headerSubtitle', 'Gestisci i file salvati offline e monitora lo spazio utilizzato')); ?></p>
      </div>
    </header>

    <!-- Status Message -->
    <div id="status-message" role="alert" aria-live="polite" style="display: none;"></div>

    <!-- Statistics Card -->
    <section class="card" aria-labelledby="stats-heading">
      <div class="card-header">
        <span id="stats-heading">
          <span aria-hidden="true">📊</span> <?= e(__t('status.statsTitle', 'Statistiche Cache')); ?>
        </span>
        <div class="btn-group" role="group" aria-label="<?= e(__t('status.statsTitle', 'Azioni cache')); ?>">
          <button id="refresh" type="button" aria-label="<?= e(__t('status.refresh', 'Aggiorna')); ?>">
            <span class="icon" aria-hidden="true">🔄</span> <?= e(__t('status.refresh', 'Aggiorna')); ?>
          </button>
          <button id="download" type="button" aria-label="<?= e(__t('status.downloadAll', 'Scarica tutto')); ?>">
            <span class="icon" aria-hidden="true">⬇️</span> <?= e(__t('status.downloadAll', 'Scarica tutto')); ?>
          </button>
          <button id="retry-failed" type="button" aria-label="<?= e(__t('status.retryFailed', 'Riprova falliti')); ?>" style="display: none;">
            <span class="icon" aria-hidden="true">🔁</span> <?= e(__t('status.retryFailed', 'Riprova falliti')); ?>
          </button>
          <button id="clear-cache" type="button" class="secondary" aria-label="<?= e(__t('status.clearCache', 'Svuota cache')); ?>">
            <span class="icon" aria-hidden="true">🗑️</span> <?= e(__t('status.clearCache', 'Svuota cache')); ?>
          </button>
        </div>
      </div>
      <div class="card-body">
        <div class="stats-grid" role="list" aria-label="<?= e(__t('status.statsTitle', 'Statistiche cache')); ?>">
          <div class="stat-card" role="listitem">
            <div class="stat-label" id="label-total-count"><?= e(__t('status.filesInCache', 'File in Cache')); ?></div>
            <div class="stat-value" id="total-count" aria-labelledby="label-total-count">—</div>
          </div>
          <div class="stat-card" role="listitem">
            <div class="stat-label" id="label-total-size"><?= e(__t('status.spaceUsed', 'Spazio Occupato')); ?></div>
            <div class="stat-value small" id="total-size" aria-labelledby="label-total-size">—</div>
          </div>
          <div class="stat-card" role="listitem">
            <div class="stat-label" id="label-completion"><?= e(__t('status.completionPercent', 'Percentuale Completamento')); ?></div>
            <div class="stat-value" id="completion-percent" aria-labelledby="label-completion">—</div>
          </div>
          <div class="stat-card" role="listitem">
            <div class="stat-label" id="label-quota"><?= e(__t('status.availableQuota', 'Quota Disponibile')); ?></div>
            <div class="stat-value small" id="storage-quota" aria-labelledby="label-quota">—</div>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="progress-container" role="group" aria-label="<?= e(__t('status.completionPercent', 'Progresso cache')); ?>">
          <div class="progress-info">
            <span id="progress-text"><?= e(__t('status.loading', 'Caricamento...')); ?></span>
            <span id="progress-details">—</span>
          </div>
          <div class="progress-bar-bg" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" aria-label="<?= e(__t('status.completionPercent', 'Progresso completamento cache')); ?>">
            <div class="progress-bar-fill" id="progress-bar" style="width: 0%">
              <span id="progress-percentage">0%</span>
            </div>
          </div>
          <!-- Download Details Panel (visibile durante download) -->
          <div id="download-details" class="download-details" style="display: none;" role="status" aria-live="polite">
            <div class="download-stats">
              <div class="download-stat">
                <span class="download-stat-icon" aria-hidden="true">📄</span>
                <span class="download-stat-label"><?= e(__t('status.currentFile', 'File corrente:')); ?></span>
                <span class="download-stat-value" id="current-file">—</span>
              </div>
              <div class="download-stat">
                <span class="download-stat-icon" aria-hidden="true">⚡</span>
                <span class="download-stat-label"><?= e(__t('status.speed', 'Velocità:')); ?></span>
                <span class="download-stat-value" id="download-speed">—</span>
              </div>
              <div class="download-stat">
                <span class="download-stat-icon" aria-hidden="true">⏱️</span>
                <span class="download-stat-label"><?= e(__t('status.estimatedTime', 'Tempo stimato:')); ?></span>
                <span class="download-stat-value" id="time-remaining">—</span>
              </div>
              <div class="download-stat">
                <span class="download-stat-icon" aria-hidden="true">🔄</span>
                <span class="download-stat-label"><?= e(__t('status.activeDownloads', 'Download attivi:')); ?></span>
                <span class="download-stat-value" id="active-downloads">0</span>
              </div>
            </div>
            <div class="download-actions">
              <button id="pause-download" type="button" class="download-action-btn" aria-label="<?= e(__t('status.pause', 'Pausa')); ?>" data-pause="<?= e(__t('status.pause', 'Pausa')); ?>" data-resume="<?= e(__t('status.resume', 'Riprendi')); ?>">
                <span class="icon" aria-hidden="true">⏸️</span> <?= e(__t('status.pause', 'Pausa')); ?>
              </button>
              <button id="cancel-download" type="button" class="download-action-btn secondary" aria-label="<?= e(__t('status.cancel', 'Annulla')); ?>">
                <span class="icon" aria-hidden="true">❌</span> <?= e(__t('status.cancel', 'Annulla')); ?>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Asset List Card -->
    <section class="card" aria-labelledby="files-heading">
      <div class="card-header">
        <span id="files-heading">
          <span aria-hidden="true">📁</span> <?= e(__t('status.filesTitle', 'File in Cache')); ?>
        </span>
        <div class="btn-group" role="group" aria-label="<?= e(__t('status.filesTitle', 'Azioni file selezionati')); ?>">
          <button id="select-all" type="button" class="asset-btn" aria-pressed="false">
            <span aria-hidden="true">☑️</span> <?= e(__t('status.selectAll', 'Seleziona tutti')); ?>
          </button>
          <button id="download-selected" type="button" class="asset-btn" disabled aria-label="<?= e(__t('status.downloadSelected', 'Scarica selezionati')); ?>">
            <span aria-hidden="true">⬇️</span> <?= e(__t('status.downloadSelected', 'Scarica selezionati')); ?>
          </button>
          <button id="delete-selected" type="button" class="asset-btn secondary" disabled aria-label="<?= e(__t('status.deleteSelected', 'Elimina selezionati')); ?>">
            <span aria-hidden="true">🗑️</span> <?= e(__t('status.deleteSelected', 'Elimina selezionati')); ?>
          </button>
        </div>
      </div>
      <div class="card-body">
        <!-- Last Sync Info -->
        <div class="sync-info" id="sync-info" role="status" aria-live="polite">
          <span class="sync-icon" aria-hidden="true">🕐</span>
          <span id="last-sync-text"><?= e(__t('status.lastSync', 'Ultima sincronizzazione:')); ?> <?= e(__t('status.never', 'mai')); ?></span>
          <span class="sync-separator" aria-hidden="true">|</span>
          <span class="cache-version" id="cache-version" title="<?= e(__t('status.cacheVersion', 'Versione cache service worker')); ?>"><?= e(__t('status.cacheVersion', 'Cache:')); ?> <strong>—</strong></span>
          <span class="sync-separator" aria-hidden="true">|</span>
          <span class="models-consent" id="models-consent" title="<?= e(__t('status.modelsAutoDownloadHint', 'Se attivo, tutti i modelli 3D vengono scaricati e aggiornati automaticamente per l\'uso offline')); ?>">
            <?= e(__t('status.modelsAutoDownload', 'Download automatico modelli:')); ?>
            <strong id="models-consent-state">—</strong>
            <button id="models-consent-toggle" type="button" class="consent-toggle-btn"><?= e(__t('status.modelsConsentChange', 'cambia')); ?></button>
          </span>
        </div>

        <!-- Search and Filters -->
        <div class="filter-section">
          <div class="search-box">
            <label for="search-input" class="sr-only"><?= e(__t('status.searchPlaceholder', 'Cerca file')); ?></label>
            <input type="search" id="search-input" placeholder="<?= e(__t('status.searchPlaceholder', 'Cerca file...')); ?>" aria-describedby="search-hint" />
            <span id="search-hint" class="sr-only"><?= e(__t('status.searchPlaceholder', 'Digita per filtrare i file nella lista')); ?></span>
          </div>
          <div class="filter-tabs" role="tablist" aria-label="<?= e(__t('status.filterAll', 'Filtra per stato')); ?>">
            <button type="button" class="filter-tab active" data-filter="all" role="tab" aria-selected="true" tabindex="0">
              <?= e(__t('status.filterAll', 'Tutti')); ?>
            </button>
            <button type="button" class="filter-tab" data-filter="cached" role="tab" aria-selected="false" tabindex="-1">
              <span aria-hidden="true">✅</span> <?= e(__t('status.filterCached', 'In cache')); ?>
            </button>
            <button type="button" class="filter-tab" data-filter="missing" role="tab" aria-selected="false" tabindex="-1">
              <span aria-hidden="true">⚠️</span> <?= e(__t('status.filterMissing', 'Mancanti')); ?>
            </button>
            <button type="button" class="filter-tab" data-filter="failed" role="tab" aria-selected="false" tabindex="-1">
              <span aria-hidden="true">❌</span> <?= e(__t('status.filterErrors', 'Errori')); ?>
            </button>
          </div>
          <div class="sort-section">
            <label for="sort-select" class="sr-only"><?= e(__t('status.sortNameAsc', 'Ordina per')); ?></label>
            <select id="sort-select" aria-label="<?= e(__t('status.sortNameAsc', 'Ordina file per')); ?>">
              <option value="name-asc"><?= e(__t('status.sortNameAsc', 'Nome (A-Z)')); ?></option>
              <option value="name-desc"><?= e(__t('status.sortNameDesc', 'Nome (Z-A)')); ?></option>
              <option value="size-desc"><?= e(__t('status.sortSizeDesc', 'Dimensione (↓)')); ?></option>
              <option value="size-asc"><?= e(__t('status.sortSizeAsc', 'Dimensione (↑)')); ?></option>
              <option value="status"><?= e(__t('status.sortStatus', 'Stato')); ?></option>
            </select>
          </div>
        </div>

        <!-- Asset Groups Container -->
        <div id="asset-groups" role="region" aria-label="<?= e(__t('status.filesTitle', 'Lista file')); ?>" aria-live="polite"></div>
      </div>
    </section>

    <!-- Footer -->
    <footer role="contentinfo">
      <p>
        <strong><?= e(config('branding.appName')); ?></strong> © <?= date('Y'); ?>
        · 3DCaveViewer v<?= e(APP_VERSION); ?>
        <a href="<?= e(config('originalAuthor.website')); ?>" target="_blank" rel="noopener noreferrer">GitHub</a> |
        <a href="<?= e(config('branding.organizationUrl')); ?>" target="_blank" rel="noopener noreferrer"><?= e(config('branding.organizationName')); ?></a>
        <br />
        <?= e(__t('status.license', 'Rilasciato sotto licenza GNU GPL v3')); ?>
      </p>
      <p class="footer-ribbon">
        <?= projectRibbon(); ?>
      </p>
    </footer>
  </div>

  <!-- Scroll to Top Button -->
  <button id="scroll-top" type="button" class="scroll-top-btn" aria-label="<?= e(__t('status.scrollToTop', 'Torna all\'inizio della pagina')); ?>" title="<?= e(__t('status.scrollToTop', 'Torna su')); ?>">
    <span aria-hidden="true">⬆️</span>
  </button>

  <!-- Celebration Overlay (confetti) -->
  <div id="celebration-overlay" class="celebration-overlay" aria-hidden="true"></div>

  <script src="js/config.php"></script>
  <script src="js/i18n.js"></script>
  <script src="js/status.js"></script>
  <script src="js/pwa-register.js"></script>
</body>
</html>
