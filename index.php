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

// Testi personalizzabili da custom/config.local.php (sezione 'texts')
$pageTitle    = uiText('texts.pageTitle', 'homepage.pageTitle', 'Mappa delle cavità in 3D');
$pageSubtitle = uiText('texts.pageSubtitle', 'homepage.pageSubtitle');
$sidebarTitle = uiText('texts.sidebarTitle', 'homepage.sidebarTitle', 'Cavità Disponibili');
?>
<!DOCTYPE html>
<html lang="<?= e($lang); ?>">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover" />
    <title><?= e($pageTitle) ?> - <?= e(config('branding.organizationName')) ?></title>
    <meta name="description" content="<?= e(formatText((string) config('branding.appDescription', ''))) ?> <?= e(config('branding.organizationName')) ?>">

    <!-- PWA Meta Tags -->
    <meta name="theme-color" content="<?= e(config('theme.themeColor')) ?>">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="application-name" content="<?= e(config('branding.appName')) ?>">

    <!-- iOS Safari Meta Tags -->
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="<?= e(config('branding.appShortName')) ?>">
    <?php // Icone risolte da config.php: custom/ vince su img/, '' se assenti
    $icon192 = assetUrl(iconPath(192));
    $icon512 = assetUrl(iconPath(512)); ?>
    <?php if ($icon192 !== ''): ?>
    <link rel="apple-touch-icon" href="<?= e($icon192) ?>">
    <?php endif; ?>
    <?php if ($icon512 !== ''): ?>
    <link rel="apple-touch-icon" sizes="512x512" href="<?= e($icon512) ?>">
    <?php endif; ?>

    <!-- PWA Manifest -->
    <link rel="manifest" href="manifest.json">
    <?php if ($icon192 !== ''): ?>
    <link rel="icon" type="image/png" sizes="192x192" href="<?= e($icon192) ?>">
    <?php endif; ?>
    <?php if ($icon512 !== ''): ?>
    <link rel="icon" type="image/png" sizes="512x512" href="<?= e($icon512) ?>">
    <?php endif; ?>

    <link rel="stylesheet" href="lib/fonts/poppins.css">
    <link rel="stylesheet" href="lib/leaflet/leaflet.css" />
    <script src="lib/leaflet/leaflet.js"></script>

    <link rel="stylesheet" href="css/index.css">
</head>

<body>

    <div class="container">
        <header>
            <?php $logoMarkup = logoPicture('logo'); ?>
            <?php if ($logoMarkup !== ''): ?>
            <a href="<?= e(config('branding.organizationUrl')) ?>">
                <?= $logoMarkup ?>
            </a>
            <?php endif; ?>
            <div class="header-text">
                <h1><?= e($pageTitle) ?></h1>
                <p><?= e($pageSubtitle) ?></p>
            </div>
            <?php $langsMeta = getLanguagesMeta(); ?>
            <div class="language-selector-container">
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
        </header>

        <main class="map-layout">
            <div id="map-container" class="panel">
                <div id="map"></div>
            </div>

            <div id="poi-list-container" class="panel">
                <div class="panel-header"><?= e($sidebarTitle) ?></div>
                <div class="search-container">
                    <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" id="cave-search" placeholder="<?= e(__t('homepage.searchPlaceholder', 'Cerca cavità...')) ?>" autocomplete="off" />
                    <button id="cave-search-clear" class="search-clear" type="button" aria-label="<?= e(__t('common.close', 'Chiudi')) ?>">&times;</button>
                </div>
                <div id="poi-list" aria-live="polite">
                </div>
            </div>
        </main>
    </div>

    <footer>
        <div id="copyright">
<?php $contactEmail = (string) config('branding.contactEmail', ''); ?>
<?php if ($contactEmail !== ''): ?>
            <a href="mailto:<?= e($contactEmail) ?>">© <?= e(formatText((string) config('branding.copyrightHolder', ''))) ?></a>
<?php else: ?>
            <span>© <?= e(formatText((string) config('branding.copyrightHolder', ''))) ?></span>
<?php endif; ?>
            <span class="footer-separator">|</span>
            <a href="status.php" class="cache-status-link" title="<?= e(__t('footer.cacheStatus', 'Stato cache offline')) ?>">
                <span class="cache-status-dot" id="cache-status-dot"></span>
                <span class="cache-status-text"><?= e(__t('footer.cache', 'Cache')) ?></span>
            </a>
            <span class="footer-separator footer-separator-ribbon">|</span>
            <?= projectRibbon() ?>
        </div>
    </footer>

    <script src="js/config.php"></script>
    <script src="js/i18n.js"></script>
    <script src="js/index.js" defer></script>
    <script src="js/lang-selector.js" defer></script>
    <script src="js/pwa-register.js" defer></script>

</body>

</html>
