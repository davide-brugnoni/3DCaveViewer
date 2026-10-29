<?php
/**
 * 3D Cave Viewer - Configuration File (PHP)
 * https://github.com/davide-brugnoni/3DCaveViewer/
 *
 * Modifica questo file per personalizzare l'applicazione.
 * Questo file contiene le configurazioni usate dal backend PHP.
 *
 * ⚠️ IMPORTANTE - LICENZA E ATTRIBUZIONE:
 * Questo software è rilasciato sotto licenza GNU GPL v3.
 * L'autore originale (Davide Brugnoni) DEVE essere sempre citato nel footer
 * o in altra posizione visibile dell'applicazione, anche in caso di fork
 * o personalizzazione per altre organizzazioni.
 * Esempio: "Basato su 3D Cave Viewer di Davide Brugnoni"
 */

declare(strict_types=1);

// Previeni accesso diretto
if (!defined('CONFIG_LOADED')) {
    define('CONFIG_LOADED', true);
}

// Versione dell'applicazione (Semantic Versioning, vedi CHANGELOG.md).
// Va aggiornata a ogni release insieme al tag git corrispondente.
const APP_VERSION = '1.1.0';

/**
 * Configurazione dell'applicazione
 */
$CONFIG = [

    // ============================================================
    // AUTORE ORIGINALE - NON MODIFICARE
    // ============================================================
    // ⚠️ Questa sezione NON deve essere modificata.
    // L'autore originale deve sempre essere citato nel footer.
    'originalAuthor' => [
        'name' => 'Davide Brugnoni',
        'email' => 'davide.brugnoni@gmail.com',
        'website' => 'https://github.com/davide-brugnoni/3DCaveViewer/',
        // Progetto originale, richiamato dal piccolo badge nel footer
        'projectName' => '3DCaveViewer',
        'projectUrl' => 'https://3dcaveviewer.com/',
    ],

    // ============================================================
    // BRANDING - Informazioni sull'organizzazione
    // ============================================================
    // Puoi personalizzare questi valori per la tua organizzazione.
    // NOTA: L'autore originale deve comunque essere citato nel footer.
    'branding' => [
        // Nome completo dell'applicazione
        'appName' => '3D Cave Viewer',
        // Nome breve (usato nella PWA)
        'appShortName' => '3D Cave',
        // Nome dell'organizzazione che usa l'applicazione
        'organizationName' => '3DCaveViewer',
        // URL del sito dell'organizzazione
        'organizationUrl' => 'https://www.3dcaveviewer.com/',
        // Email di contatto dell'organizzazione
        'contactEmail' => '',
        // Testo copyright nel footer - DEVE includere l'autore originale
        // Esempio per fork: "Davide Brugnoni | Personalizzato da [Tua Organizzazione]"
        'copyrightHolder' => 'Davide Brugnoni – 3DCaveViewer',
        // Descrizione dell'app per meta tag e PWA
        'appDescription' => 'Esplora la mappa interattiva e visualizza i modelli 3D delle cavità rilevate',
    ],

    // ============================================================
    // TESTI UI - Testi dell'interfaccia utente
    // ============================================================
    // Questi sono i testi di default dell'applicazione: le traduzioni in
    // i18n/*.json hanno la precedenza su di essi. Se invece imposti uno di
    // questi testi in custom/config.local.php, la tua versione vince su
    // tutto (vedi "PERSONALIZZAZIONI LOCALI" in fondo al file).
    //
    // Segnaposto disponibili in tutti i testi:
    //   {organization} → branding.organizationName
    //   {app}          → branding.appName
    //   {year}         → anno corrente
    'texts' => [
        // Homepage
        'pageTitle' => 'Mappa delle cavità in 3D',
        'pageSubtitle' => 'Esplora la mappa e visualizza i modelli 3D delle cavità {organization}',
        'sidebarTitle' => 'Cavità Disponibili',

        // Viewer
        'viewerDefaultTitle' => 'Visualizzatore cavità 3D',
        'viewerDefaultDescription' => 'Esplora i modelli 3D. {organization}',
    ],

    // ============================================================
    // TEMA - Colori e stile visivo
    // ============================================================
    'theme' => [
        // Colore tema per PWA e browser
        'themeColor' => '#0b0d10',
        // Colore sfondo PWA
        'pwaBackgroundColor' => '#0f1b2a',
    ],

    // ============================================================
    // PWA - Configurazione Progressive Web App
    // ============================================================
    // Questi sono i loghi *di default del progetto*, in img/.
    // I file di una singola installazione vanno in custom/ (custom/logo.png,
    // custom/icon-192.png, …): vengono rilevati da soli e hanno sempre la
    // precedenza su img/, senza bisogno di configurare nulla qui.
    'pwa' => [
        // Icona 192x192 (percorso relativo)
        'icon192' => 'img/icon-192.png',
        // Icona 512x512 (percorso relativo)
        'icon512' => 'img/icon-512.png',
        // Logo mostrato nell'header e nel viewer (percorso relativo)
        'logo' => 'img/logo.png',
        // Versione WebP del logo. Vuoto = cercata accanto al logo risolto
        // (stesso nome, estensione .webp) e usata solo se non più vecchia.
        'logoWebp' => '',
    ],

    // ============================================================
    // PATHS - Percorsi dei file
    // ============================================================
    'paths' => [
        // Cartella modelli
        'modelsFolder' => 'modelli',
    ],

    // ============================================================
    // SICUREZZA - Content Security Policy
    // ============================================================
    'security' => [
        // Host aggiuntivi consentiti in connect-src dalla CSP del viewer
        // (es: ['https://example.org']). Vuoto per la maggior parte delle installazioni.
        'extraConnectSrc' => [],

        // Domini autorizzati a incorporare il viewer in un iframe (?embed=1).
        // Vuoto = qualsiasi dominio, così il codice generato dal pannello
        // "Incorpora" funziona ovunque senza configurare il server.
        // Es: ['https://www.miosito.it', 'https://*.miosito.it'].
        // Il viewer normale resta comunque limitato allo stesso dominio.
        'allowedEmbedOrigins' => [],
    ],

    // ============================================================
    // LINGUA - Configurazione multilingua
    // ============================================================
    // La lingua dell'applicazione viene definita qui.
    // Per cambiare lingua, modifica il valore 'default' con il codice
    // della lingua desiderata (es: 'en', 'fr', 'es').
    // Le lingue disponibili sono nella cartella i18n/ (file .json).
    'language' => [
        // Lingua dell'applicazione (codice ISO 639-1: it, en, fr, es, de, ecc.)
        'default' => 'it',
    ],
];

// ============================================================
// PERSONALIZZAZIONI LOCALI
// ============================================================
// Due file, entrambi in custom/ (un aggiornamento dell'applicazione non li
// tocca mai). settings.ini è tracciato da git con i default già attivi e
// ogni installazione lo modifica sul posto; config.local.php è opzionale e
// ignorato da git:
//
//   1. custom/settings.ini       → solo variabili, niente codice PHP.
//                                  È il modo consigliato: un errore di
//                                  sintassi non può rompere il sito.
//   2. custom/config.local.php   → per casi avanzati; ha la precedenza
//                                  sui valori di settings.ini.
//
// I valori impostati qui hanno la precedenza anche sulle traduzioni di
// i18n/*.json (vedi uiText() in i18n/loader.php): sono personalizzazioni
// esplicite dell'utente, quindi vincono su tutto. Per questo teniamo
// memoria di quali chiavi arrivano dai file locali ($CONFIG_LOCAL).

/**
 * Sezioni ammesse in custom/settings.ini.
 * Le sezioni sconosciute (e 'originalAuthor', vedi licenza GPL v3)
 * vengono ignorate invece di rompere la configurazione.
 */
const SETTINGS_SECTIONS = [
    'branding', 'texts', 'theme', 'pwa', 'paths',
    'language', 'security', 'viewer', 'map', 'social',
];

/**
 * Normalizza un valore letto da settings.ini.
 * I valori vuoti diventano null e vengono scartati, così una riga
 * lasciata a metà non cancella il default dell'applicazione.
 *
 * @param mixed $value
 * @return mixed|null null se il valore è vuoto
 */
function normalizeSettingValue($value) {
    if (is_array($value)) {
        $clean = [];
        foreach ($value as $key => $item) {
            $item = normalizeSettingValue($item);
            if ($item !== null) {
                $clean[$key] = $item;
            }
        }
        return $clean === [] ? null : $clean;
    }

    if (is_string($value)) {
        $value = trim($value);
        return $value === '' ? null : $value;
    }

    return $value; // int/float/bool convertiti da INI_SCANNER_TYPED
}

/**
 * Legge custom/settings.ini e restituisce l'array di override.
 * Un file assente, illeggibile o con errori di sintassi non è mai fatale:
 * restituisce un array vuoto e l'applicazione usa i default.
 *
 * @param string $file Percorso assoluto del file .ini
 * @return array
 */
function loadSettingsIni(string $file): array {
    if (!is_readable($file)) {
        return [];
    }

    $parsed = @parse_ini_file($file, true, INI_SCANNER_TYPED);
    if (!is_array($parsed)) {
        error_log('3DCaveViewer: custom/settings.ini non valido, personalizzazioni ignorate');
        return [];
    }

    $settings = [];
    foreach ($parsed as $section => $values) {
        if (!is_array($values) || !in_array($section, SETTINGS_SECTIONS, true)) {
            continue;
        }
        $values = normalizeSettingValue($values);
        if (is_array($values)) {
            $settings[$section] = $values;
        }
    }

    return $settings;
}

// Copia dei default del progetto prima di applicare le personalizzazioni:
// serve a riconoscere un'installazione già configurata (vedi
// looksAlreadyConfigured()) confrontando i due array.
$CONFIG_DEFAULTS = $CONFIG;

$CONFIG_LOCAL = loadSettingsIni(__DIR__ . '/custom/settings.ini');

$localConfigFile = __DIR__ . '/custom/config.local.php';
if (is_readable($localConfigFile)) {
    $localConfig = require $localConfigFile;
    if (is_array($localConfig)) {
        // L'autore originale non è mai sovrascrivibile (licenza GPL v3).
        unset($localConfig['originalAuthor']);
        $CONFIG_LOCAL = array_replace_recursive($CONFIG_LOCAL, $localConfig);
    }
}

if ($CONFIG_LOCAL !== []) {
    $CONFIG = array_replace_recursive($CONFIG, $CONFIG_LOCAL);
}

/**
 * Funzione helper per ottenere valori dalla configurazione
 *
 * @param string $key Chiave nel formato "section.key" (es: "branding.appName")
 * @param mixed $default Valore di default se la chiave non esiste
 * @return mixed
 */
function config(string $key, $default = null) {
    global $CONFIG;

    $parts = explode('.', $key);
    $value = $CONFIG;

    foreach ($parts as $part) {
        if (!is_array($value) || !isset($value[$part])) {
            return $default;
        }
        $value = $value[$part];
    }

    return $value;
}

/**
 * Valore impostato esplicitamente in custom/config.local.php.
 * Restituisce null se la chiave non è personalizzata dall'utente.
 *
 * @param string $key Chiave nel formato "section.key"
 * @return mixed|null
 */
function configCustom(string $key) {
    global $CONFIG_LOCAL;

    $value = $CONFIG_LOCAL;

    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !isset($value[$part])) {
            return null;
        }
        $value = $value[$part];
    }

    return $value;
}

/**
 * Normalizza un testo di configurazione in stringa.
 * Accetta sia una stringa singola sia un array per lingua, es:
 *   'pageTitle' => ['it' => 'Mappa 3D', 'en' => '3D Map']
 *
 * @param mixed $value Stringa o array lingua => testo
 * @param string|null $lang Lingua richiesta (default: language.default)
 * @return string
 */
function textValue($value, ?string $lang = null): string {
    if (is_string($value)) {
        return $value;
    }

    if (!is_array($value) || $value === []) {
        return '';
    }

    $fallbackLang = config('language.default', 'it');

    foreach ([$lang, $fallbackLang] as $candidate) {
        if (is_string($candidate) && isset($value[$candidate]) && is_string($value[$candidate])) {
            return $value[$candidate];
        }
    }

    foreach ($value as $text) {
        if (is_string($text)) {
            return $text;
        }
    }

    return '';
}

/**
 * Sostituisce i segnaposto nei testi configurabili.
 * Disponibili: {organization}, {app}, {year}
 *
 * @param string $text
 * @return string
 */
function formatText(string $text): string {
    if (strpos($text, '{') === false) {
        return $text;
    }

    return strtr($text, [
        '{organization}' => (string) config('branding.organizationName', ''),
        '{app}'          => (string) config('branding.appName', ''),
        '{year}'         => date('Y'),
    ]);
}

/**
 * Verifica che un asset locale esista davvero.
 * Gli URL assoluti (http://, https://, //) sono considerati sempre validi.
 *
 * @param string $path
 * @return bool
 */
function assetExists(string $path): bool {
    if ($path === '') {
        return false;
    }
    if (preg_match('#^(https?:)?//#i', $path) === 1) {
        return true;
    }
    return is_file(__DIR__ . '/' . ltrim($path, '/'));
}

/**
 * Timestamp di modifica di un asset locale, usato per il cache busting.
 * Senza, un logo sostituito resta invisibile per mesi: .htaccess serve le
 * immagini con "max-age 1 anno" e il service worker le tiene in cache.
 *
 * @param string $path Percorso relativo alla root dell'applicazione
 * @return string Percorso con ?v=<timestamp>, o invariato se non locale
 */
function assetUrl(string $path): string {
    if ($path === '' || preg_match('#^(https?:)?//#i', $path) === 1) {
        return $path;
    }

    $mtime = @filemtime(__DIR__ . '/' . ltrim($path, '/'));
    if ($mtime === false) {
        return $path;
    }

    return $path . (strpos($path, '?') === false ? '?' : '&') . 'v=' . $mtime;
}

/**
 * Primo file esistente tra una lista di glob, valutati nell'ordine ricevuto.
 *
 * @param array $patterns Glob relativi alla root (es: 'custom/logo.png')
 * @return string Percorso relativo del primo file trovato, o ''
 */
function firstExistingAsset(array $patterns): string {
    foreach ($patterns as $pattern) {
        foreach ((array) glob(__DIR__ . '/' . $pattern) as $match) {
            if (is_file($match)) {
                return str_replace('\\', '/', substr($match, strlen(__DIR__) + 1));
            }
        }
    }

    return '';
}

/**
 * Risolve un asset di branding in quest'ordine:
 *   1. percorso scelto esplicitamente dall'utente (custom/settings.ini), se esiste
 *   2. file dell'utente in custom/ (qualsiasi formato: basta il nome giusto)
 *   3. default dell'applicazione (img/), dal valore di configurazione
 *   4. altri formati del default in img/
 *   5. '' → nessun asset disponibile, chi chiama non renderizza nulla
 *
 * Il valore impostato dall'utente si distingue dal default dell'app tramite
 * configCustom(): così un file lasciato in custom/ vince sempre sul default
 * di img/, anche senza scrivere una riga di configurazione.
 *
 * @param string $configKey Chiave di configurazione (es: "pwa.logo")
 * @param array $customPatterns Glob dei file utente, in ordine di preferenza
 * @param array $defaultPatterns Glob dei file di default dell'applicazione
 * @return string Percorso esistente, o '' se non c'è nessun file
 */
function brandingAsset(string $configKey, array $customPatterns, array $defaultPatterns): string {
    $chosen = configCustom($configKey);
    if (is_string($chosen) && $chosen !== '' && assetExists($chosen)) {
        return $chosen;
    }

    $custom = firstExistingAsset($customPatterns);
    if ($custom !== '') {
        return $custom;
    }

    $default = (string) config($configKey, '');
    if ($default !== '' && assetExists($default)) {
        return $default;
    }

    return firstExistingAsset($defaultPatterns);
}

/**
 * Estensioni cercate per il logo, in ordine di preferenza.
 */
const LOGO_PATTERNS = ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.svg', 'logo.webp', 'logo.*'];

/**
 * Percorso del file logo (senza cache busting), '' se non esiste.
 * I file dell'utente in custom/ hanno la precedenza sui default in img/.
 *
 * @return string
 */
function logoPath(): string {
    static $resolved = null;
    if ($resolved === null) {
        $prefix = static fn(string $dir): array => array_map(
            static fn(string $name): string => $dir . '/' . $name,
            LOGO_PATTERNS
        );
        $resolved = brandingAsset('pwa.logo', $prefix('custom'), $prefix('img'));
    }
    return $resolved;
}

/**
 * URL del logo configurato, pronto per l'HTML (con cache busting).
 *
 * @return string
 */
function logoUrl(): string {
    return assetUrl(logoPath());
}

/**
 * Cartella delle icone PWA generate automaticamente dal logo (cache
 * derivata, mai tracciata — vedi generatedIconPath()).
 */
const GENERATED_ICON_DIR = 'custom/generated';

/**
 * Percorso di un'icona quadrata generata dal logo, '' se non generabile
 * (nessun logo, GD assente, o logo in un formato che GD non sa decodificare
 * come SVG). Rigenerata automaticamente quando il logo è più recente della
 * versione già in cache.
 *
 * @param int $size 192 o 512
 * @return string
 */
function generatedIconPath(int $size): string {
    static $cache = [];
    if (isset($cache[$size])) {
        return $cache[$size];
    }

    $logo = logoPath();
    if ($logo === '' || !extension_loaded('gd')) {
        return $cache[$size] = '';
    }

    $target = GENERATED_ICON_DIR . '/icon-' . $size . '.png';
    $targetAbs = __DIR__ . '/' . $target;
    $logoAbs = __DIR__ . '/' . $logo;

    // L'icona dipende dal logo ma anche da pwa.iconBackground: anche un file
    // di impostazioni più recente dell'icona la fa rigenerare.
    $sourceTime = @filemtime($logoAbs);
    foreach (['custom/settings.ini', 'custom/config.local.php'] as $settingsFile) {
        $settingsTime = @filemtime(__DIR__ . '/' . $settingsFile);
        if ($sourceTime !== false && $settingsTime !== false) {
            $sourceTime = max($sourceTime, $settingsTime);
        }
    }
    $targetTime = @filemtime($targetAbs);
    if ($sourceTime !== false && $targetTime !== false && $targetTime >= $sourceTime) {
        return $cache[$size] = $target;
    }

    return $cache[$size] = generateSquareIconFile($logoAbs, $targetAbs, $size) ? $target : '';
}

/**
 * Genera da $sourceAbs un'icona PNG quadrata di lato $size, ridimensionata
 * in "contain" (nessun ritaglio) e centrata su sfondo trasparente (o sul
 * colore opzionale "pwa.iconBackground" per loghi senza canale alpha).
 * Scrive prima su un file temporaneo e rinomina in modo atomico, così una
 * richiesta concorrente non legge mai un PNG a metà.
 *
 * @param string $sourceAbs Percorso assoluto del logo sorgente
 * @param string $destAbs Percorso assoluto dell'icona da scrivere
 * @param int $size Lato dell'icona quadrata in pixel
 * @return bool
 */
function generateSquareIconFile(string $sourceAbs, string $destAbs, int $size): bool {
    $data = @file_get_contents($sourceAbs);
    $source = $data === false ? false : @imagecreatefromstring($data);
    if ($source === false) {
        return false;
    }

    $srcW = imagesx($source);
    $srcH = imagesy($source);
    if ($srcW <= 0 || $srcH <= 0) {
        imagedestroy($source);
        return false;
    }

    $canvas = imagecreatetruecolor($size, $size);
    if ($canvas === false) {
        imagedestroy($source);
        return false;
    }

    imagealphablending($canvas, false);
    imagesavealpha($canvas, true);
    $bg = (string) config('pwa.iconBackground', '');
    if ($bg !== '' && preg_match('/^#?([0-9a-f]{6})$/i', $bg, $m) === 1) {
        [$r, $g, $b] = sscanf($m[1], '%02x%02x%02x');
        $fill = imagecolorallocate($canvas, $r, $g, $b);
    } else {
        $fill = imagecolorallocatealpha($canvas, 0, 0, 0, 127);
    }
    imagefill($canvas, 0, 0, $fill);

    $scale = min($size / $srcW, $size / $srcH);
    $dstW = max(1, (int) round($srcW * $scale));
    $dstH = max(1, (int) round($srcH * $scale));
    $dstX = (int) (($size - $dstW) / 2);
    $dstY = (int) (($size - $dstH) / 2);

    imagealphablending($canvas, true);
    imagecopyresampled($canvas, $source, $dstX, $dstY, 0, 0, $dstW, $dstH, $srcW, $srcH);
    imagedestroy($source);

    $dir = dirname($destAbs);
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        imagedestroy($canvas);
        return false;
    }

    $tmp = $destAbs . '.tmp.' . getmypid();
    $ok = imagepng($canvas, $tmp) && @rename($tmp, $destAbs);
    if (!$ok) {
        @unlink($tmp);
    }
    imagedestroy($canvas);

    return $ok;
}

/**
 * Percorso di un'icona PWA (senza cache busting), '' se non esiste.
 * Come per il logo, custom/ vince su img/; se manca un file dedicato viene
 * generata automaticamente un'icona quadrata dal logo (vedi
 * generatedIconPath()), prima di cadere sul placeholder generico di img/.
 *
 * @param int $size 192 o 512
 * @return string
 */
function iconPath(int $size): string {
    $key = $size === 512 ? 'pwa.icon512' : 'pwa.icon192';
    $name = 'icon-' . $size;

    $chosen = configCustom($key);
    if (is_string($chosen) && $chosen !== '' && assetExists($chosen)) {
        return $chosen;
    }

    $custom = firstExistingAsset(['custom/' . $name . '.png', 'custom/' . $name . '.*']);
    if ($custom !== '') {
        return $custom;
    }

    $generated = generatedIconPath($size);
    if ($generated !== '') {
        return $generated;
    }

    $default = (string) config($key, '');
    if ($default !== '' && assetExists($default)) {
        return $default;
    }

    return firstExistingAsset(['img/' . $name . '.png', 'img/' . $name . '.*']);
}

/**
 * Percorso della versione WebP del logo, '' se non utilizzabile.
 *
 * Se l'utente non indica un percorso esplicito si cerca il "fratello" del
 * logo risolto (stessa cartella, stesso nome, estensione .webp): così un
 * img/logo.webp non può mai sostituirsi a un custom/logo.jpg.
 *
 * Il WebP viene scartato se è più vecchio del logo principale: è il caso
 * tipico di chi sostituisce solo il file principale e continuerebbe a
 * vedere il logo precedente.
 *
 * @return string
 */
function logoWebpPath(): string {
    $logo = logoPath();
    if ($logo === '') {
        return '';
    }

    $chosen = configCustom('pwa.logoWebp');
    if (is_string($chosen) && $chosen !== '') {
        $webp = $chosen;
    } else {
        $configured = (string) config('pwa.logoWebp', '');
        $webp = $configured !== ''
            ? $configured
            : preg_replace('/\.[^.\/]+$/', '', $logo) . '.webp';
    }

    if ($webp === '' || $webp === $logo || !assetExists($webp)) {
        return '';
    }

    $webpTime = (int) @filemtime(__DIR__ . '/' . ltrim($webp, '/'));
    $logoTime = (int) @filemtime(__DIR__ . '/' . ltrim($logo, '/'));

    return $webpTime >= $logoTime ? $webp : '';
}

/**
 * Markup <picture> del logo, con sorgente WebP opzionale.
 * Restituisce '' se nessun logo è disponibile: meglio niente logo che
 * l'icona di immagine rotta.
 *
 * La sorgente WebP viene scelta da logoWebpPath().
 *
 * @param string $class Classe CSS applicata all'<img>
 * @param string|null $alt Testo alternativo (default: "Logo <organizzazione>")
 * @return string HTML già escapato
 */
function logoPicture(string $class = 'logo', ?string $alt = null): string {
    $logo = logoPath();
    if ($logo === '') {
        return '';
    }

    $webp = logoWebpPath();
    $altText = $alt ?? trim('Logo ' . (string) config('branding.organizationName', ''));

    $html = '<picture>';
    if ($webp !== '') {
        $html .= '<source srcset="' . e(assetUrl($webp)) . '" type="image/webp">';
    }
    $html .= '<img src="' . e(assetUrl($logo)) . '" alt="' . e($altText) . '" class="' . e($class)
        . '" decoding="async" />';
    $html .= '</picture>';

    return $html;
}

/**
 * Badge discreto nel footer che rimanda al progetto originale 3DCaveViewer.
 * Fa parte dell'attribuzione richiesta dalla licenza GPL v3: non è
 * personalizzabile da custom/config.local.php.
 *
 * @return string HTML già escapato
 */
function projectRibbon(): string {
    $name = (string) config('originalAuthor.projectName', '3DCaveViewer');
    $url  = (string) config('originalAuthor.projectUrl', 'https://3dcaveviewer.com/');
    $label = function_exists('__t') ? __t('footer.poweredBy', 'Powered by') : 'Powered by';

    $icon = '<svg class="project-ribbon-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" '
        . 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        . '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>'
        . '<polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';

    // title + aria-label: su mobile il badge si riduce alla sola icona
    return '<a class="project-ribbon" href="' . e($url) . '" target="_blank" rel="noopener noreferrer" '
        . 'title="' . e($label . ' ' . $name) . '" aria-label="' . e($label . ' ' . $name) . '">'
        . $icon
        . '<span class="project-ribbon-label">' . e($label) . '</span>'
        . '<strong class="project-ribbon-name">' . e($name) . '</strong>'
        . '</a>';
}

/**
 * Funzione helper per escape HTML
 *
 * @param string $value
 * @return string
 */
function e(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Rileva se la richiesta corrente è servita via HTTPS.
 *
 * @return bool
 */
function isHttpsRequest(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] === '443');
}

/**
 * Invia gli header di sicurezza comuni a tutte le risposte.
 * HSTS viene aggiunto solo quando la richiesta è già su HTTPS.
 *
 * @param string|null $csp Content-Security-Policy della pagina;
 *                         null usa una policy minima adatta agli endpoint API.
 * @param string|null $frameAncestors Valore per la direttiva CSP frame-ancestors.
 *                         null (default) mantiene il comportamento storico:
 *                         X-Frame-Options: SAMEORIGIN e nessuna direttiva aggiunta.
 *                         Se valorizzato, X-Frame-Options non viene inviato
 *                         (non ha una forma con allowlist: ALLOW-FROM è deprecato
 *                         in tutti i browser) e la direttiva viene accodata alla CSP.
 */
function sendSecurityHeaders(?string $csp = null, ?string $frameAncestors = null): void {
    $policy = $csp ?? "default-src 'none'; frame-ancestors 'self'";
    if ($frameAncestors !== null) {
        $policy = rtrim(trim($policy), ';') . '; frame-ancestors ' . $frameAncestors . ';';
    } else {
        header('X-Frame-Options: SAMEORIGIN');
    }
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
    header('Content-Security-Policy: ' . $policy);
    if (isHttpsRequest()) {
        header('Strict-Transport-Security: max-age=31536000');
    }
}

/**
 * Valore della direttiva CSP frame-ancestors per le risposte in modalità
 * incorporata (?embed=1), costruito da security.allowedEmbedOrigins.
 *
 * Tre casi, distinti apposta:
 *  - lista non configurata → '*': è il default voluto, il codice generato dal
 *    pannello "Incorpora" funziona su qualsiasi sito senza toccare il server;
 *  - lista con voci valide → "'self' <voci>";
 *  - lista configurata ma senza nemmeno una voce valida → "'self'". Qui c'è un
 *    errore di battitura: si chiude invece di aprire a tutti, così lo sbaglio
 *    si nota (l'embed smette di funzionare) e non diventa silenziosamente una
 *    policy più permissiva di quella che si voleva scrivere.
 *
 * @return string
 */
function embedFrameAncestors(): string {
    $configured = (array) config('security.allowedEmbedOrigins', []);
    if ($configured === []) {
        return '*';
    }

    $origins = [];
    foreach ($configured as $origin) {
        if (!is_string($origin)) {
            continue;
        }
        $origin = trim($origin);
        // https://host, http://host:8080, https://*.dominio.it
        if (preg_match('#^https?://(\*\.)?[a-zA-Z0-9.-]+(:[0-9]{1,5})?$#', $origin) === 1) {
            $origins[] = $origin;
        } elseif ($origin !== '') {
            error_log('3DCaveViewer: origine non valida in security.allowedEmbedOrigins, ignorata: ' . $origin);
        }
    }

    if ($origins === []) {
        return "'self'";
    }
    return "'self' " . implode(' ', array_unique($origins));
}

/**
 * Valida il nome di una cartella modello.
 * Consente lettere Unicode, numeri, underscore e trattino;
 * esclude . / \ e altri caratteri pericolosi (path traversal).
 *
 * @param string $name
 * @return bool
 */
function isValidModelFolder(string $name): bool {
    return $name !== '' && preg_match('/^[\pL\pN_-]+$/u', $name) === 1;
}

/**
 * Percorso assoluto della cartella di un modello.
 * Il nome deve essere già validato con isValidModelFolder().
 *
 * @param string $folder
 * @return string
 */
function modelDir(string $folder): string {
    return __DIR__ . '/' . config('paths.modelsFolder', 'modelli') . '/' . $folder;
}

// ============================================================
// INSTALLAZIONE GUIDATA
// ============================================================
// Finché il marker custom/.installed non esiste, le pagine HTML
// rimandano a setup.php (vedi redirectToSetupIfNeeded()). Il marker sta
// dentro custom/ — è dato dell'installazione, non codice — ed è un file
// nascosto, quindi già negato dal web da .htaccess.
//
// Non si può usare "esiste settings.ini" come marker: quel file è
// tracciato da git e arriva sempre presente, con i default del progetto.
//
// Il marker contiene la chiave che riapre il wizard: righe di commento che
// spiegano il file e, in fondo, la chiave (vedi installMarkerContent()).
// Il wizard fa scaricare quello stesso testo, così l'utente conserva la
// chiave e può rimetterla sul server come custom/.installed se serve.

/** Marker di installazione completata, relativo alla root del progetto. */
const INSTALL_MARKER = 'custom/.installed';

/**
 * Percorso assoluto del marker di installazione.
 *
 * @return string
 */
function installMarkerPath(): string {
    return __DIR__ . '/' . INSTALL_MARKER;
}

/**
 * True se l'installazione guidata è già stata completata.
 *
 * @return bool
 */
function isInstalled(): bool {
    return is_file(installMarkerPath());
}

/**
 * Chiave di riapertura salvata nel marker ('' se assente o illeggibile).
 * Serve a rientrare nel wizard dopo l'installazione senza passare dall'FTP.
 *
 * @return string
 */
function installKey(): string {
    if (!is_readable(installMarkerPath())) {
        return '';
    }
    $content = @file_get_contents(installMarkerPath());
    return $content === false ? '' : parseInstallKey($content);
}

/**
 * Estrae la chiave dal contenuto di un marker: la prima riga non vuota che
 * non sia un commento (";" o "#").
 *
 * Il formato tollera i commenti perché il file che l'installazione guidata
 * fa scaricare all'utente spiega nelle prime righe a cosa serve: così quel
 * file può essere ricaricato tale e quale come custom/.installed, senza
 * doverlo ripulire. Un marker che contiene solo la chiave — il formato
 * scritto dalle versioni precedenti — continua a funzionare.
 *
 * @param string $content
 * @return string
 */
function parseInstallKey(string $content): string {
    foreach (preg_split('/\R/', $content) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === ';' || $line[0] === '#') {
            continue;
        }
        return $line;
    }

    return '';
}

/**
 * Genera una nuova chiave di riapertura ('' se il generatore casuale non
 * è disponibile: meglio nessuna chiave che una prevedibile).
 *
 * @return string
 */
function newInstallKey(): string {
    try {
        return bin2hex(random_bytes(16));
    } catch (Exception $e) {
        error_log('3DCaveViewer: impossibile generare la chiave di installazione');
        return '';
    }
}

/**
 * Contenuto del marker: le righe di commento che spiegano il file e, in
 * fondo, la chiave. È lo stesso testo che il wizard fa scaricare, così il
 * file salvato dall'utente e custom/.installed sono intercambiabili.
 *
 * Il commento resta in italiano e inglese invece di passare da __t():
 * config.php è caricato anche dal service worker e dalle API, dove l'i18n
 * non è disponibile, e il file finisce comunque sul server, non a schermo.
 *
 * @param string $key
 * @return string
 */
function installMarkerContent(string $key): string {
    return "; 3DCaveViewer - chiave di configurazione / configuration key\n"
        . "; Serve per riaprire l'installazione guidata: setup.php la chiede\n"
        . "; all'apertura. Conserva questo file.\n"
        . "; Needed to reopen the setup wizard: setup.php asks for it.\n"
        . "; Keep this file.\n"
        . ";\n"
        . "; Puoi anche caricarlo sul server come custom/.installed\n"
        . "; It can also be uploaded to the server as custom/.installed\n"
        . $key . "\n";
}

/**
 * Scrive il marker con una chiave di riapertura, restituendola.
 * Senza argomento la chiave viene generata; passarne una serve a
 * riscrivere il marker conservando quella già in mano all'utente.
 * Torna '' se la cartella custom/ non è scrivibile (installazione manuale).
 *
 * @param string $key Chiave da conservare ('' per generarne una nuova)
 * @return string
 */
function writeInstallMarker(string $key = ''): string {
    $dir = dirname(installMarkerPath());
    if (!is_dir($dir) || !is_writable($dir)) {
        return '';
    }

    if ($key === '') {
        $key = newInstallKey();
    }
    if ($key === '') {
        return '';
    }

    $tmp = installMarkerPath() . '.tmp.' . getmypid();
    if (@file_put_contents($tmp, installMarkerContent($key)) === false || !@rename($tmp, installMarkerPath())) {
        @unlink($tmp);
        return '';
    }

    return $key;
}

/**
 * Chiave di riapertura da mostrare a fine installazione: quella già in uso
 * se il marker ne contiene una, altrimenti una nuova.
 *
 * Conservarla è voluto: chi rientra nel wizard con la sua chiave e salva di
 * nuovo si ritroverebbe altrimenti con il file scaricato non più valido,
 * senza necessariamente accorgersene.
 *
 * @return string
 */
function ensureInstallKey(): string {
    $existing = installKey();

    return $existing !== '' ? $existing : writeInstallMarker();
}

/**
 * Euristica per riconoscere un'installazione già in uso che aggiorna il
 * codice: non deve ritrovarsi l'installer davanti.
 *
 * I segnali sono tre, tutti impossibili su un repository appena clonato:
 * l'override avanzato in PHP, un logo o un'icona dell'utente (file esclusi
 * da git), e infine un valore di custom/settings.ini che si discosta dal
 * default del progetto — quel file è tracciato e arriva sempre presente,
 * quindi conta cosa contiene, non che esista. La presenza di cartelle sotto
 * modelli/ non direbbe nulla: il repository ne contiene già.
 *
 * @return bool
 */
function looksAlreadyConfigured(): bool {
    global $CONFIG_LOCAL, $CONFIG_DEFAULTS;

    if (is_file(__DIR__ . '/custom/config.local.php')) {
        return true;
    }
    if (firstExistingAsset(['custom/logo.*', 'custom/icon-*']) !== '') {
        return true;
    }

    foreach ($CONFIG_LOCAL as $section => $values) {
        if (!is_array($values) || !isset($CONFIG_DEFAULTS[$section])) {
            continue;
        }
        foreach ($values as $key => $value) {
            // Le sezioni frontend (viewer, map, social) e le chiavi in più
            // non hanno un default qui: non dicono se l'utente è intervenuto.
            if (!array_key_exists($key, $CONFIG_DEFAULTS[$section])) {
                continue;
            }
            $default = $CONFIG_DEFAULTS[$section][$key];
            $changed = is_scalar($value) && is_scalar($default)
                ? (string) $value !== (string) $default
                : $value !== $default;
            if ($changed) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Manda all'installazione guidata finché non è stata completata.
 * Va chiamata dalle sole pagine HTML (index.php, viewer.php, status.php):
 * le API, il manifest e js/config.php devono continuare a rispondere.
 *
 * @return void
 */
function redirectToSetupIfNeeded(): void {
    if (isInstalled()) {
        return;
    }

    // Installazione preesistente che ha solo aggiornato il codice:
    // marker creato in silenzio, nessun installer.
    if (looksAlreadyConfigured()) {
        writeInstallMarker();
        return;
    }

    header('Location: setup.php', true, 302);
    exit;
}
