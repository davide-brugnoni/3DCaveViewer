<?php
/**
 * 3D Cave Viewer - i18n Loader (PHP)
 * https://github.com/davide-brugnoni/3DCaveViewer/
 *
 * Carica le traduzioni per il rendering server-side.
 * La lingua viene rilevata in quest'ordine: parametro ?lang=, cookie "lang",
 * default da config.php ('language.default').
 *
 * AGGIUNGERE UNA NUOVA LINGUA:
 * 1. Copia template.json e rinominalo con il codice lingua (es: de.json per tedesco)
 * 2. Traduci tutte le stringhe nel nuovo file
 *
 * CONFIGURAZIONE:
 * La lingua di default è configurabile in config.php nella sezione 'language.default'.
 */

declare(strict_types=1);

if (!defined('I18N_LOADED')) {
    define('I18N_LOADED', true);
}

// Legge la lingua di default da config.php (se disponibile)
$_i18nDefaultLang = 'it';

if (function_exists('config')) {
    $_i18nDefaultLang = config('language.default', 'it');
}

$_translations = null;
$_currentLang = null;
$_supportedLangs = null;

/**
 * Rileva automaticamente le lingue supportate dalla cartella i18n
 * Cerca tutti i file .json escludendo template.json
 */
function discoverSupportedLangs(): array {
    global $_supportedLangs, $_i18nDefaultLang;

    if ($_supportedLangs !== null) {
        return $_supportedLangs;
    }

    $_supportedLangs = [];
    $dir = __DIR__;

    foreach (glob($dir . '/*.json') as $file) {
        $filename = basename($file, '.json');
        // Escludi template e file che iniziano con _
        if ($filename !== 'template' && $filename[0] !== '_') {
            $_supportedLangs[] = $filename;
        }
    }

    // Assicura che la lingua di default sia sempre presente e prima
    if (!in_array($_i18nDefaultLang, $_supportedLangs, true)) {
        array_unshift($_supportedLangs, $_i18nDefaultLang);
    } else {
        // Sposta la lingua di default all'inizio
        $_supportedLangs = array_diff($_supportedLangs, [$_i18nDefaultLang]);
        array_unshift($_supportedLangs, $_i18nDefaultLang);
    }

    return $_supportedLangs;
}

/**
 * Verifica che un codice lingua sia valido e supportato
 */
function isValidLang(string $lang): bool {
    return preg_match('/^[a-z]{2}$/', $lang) === 1
        && in_array($lang, discoverSupportedLangs(), true);
}

/**
 * Ottiene la lingua configurata
 * Priorità: parametro ?lang= (persistito in cookie) → cookie "lang" → config.php
 */
function detectLanguage(): string {
    global $_i18nDefaultLang;

    $supportedLangs = discoverSupportedLangs();

    // 1. Parametro GET ?lang= (whitelist sulle lingue scoperte)
    $requested = isset($_GET['lang']) ? (string) $_GET['lang'] : '';
    if ($requested !== '' && isValidLang($requested)) {
        if (!headers_sent()) {
            setcookie('lang', $requested, [
                'expires'  => time() + 31536000, // 1 anno
                'path'     => '/',
                'samesite' => 'Lax',
            ]);
        }
        return $requested;
    }

    // 2. Cookie "lang" (scelta precedente dell'utente)
    $cookieLang = isset($_COOKIE['lang']) ? (string) $_COOKIE['lang'] : '';
    if ($cookieLang !== '' && isValidLang($cookieLang)) {
        return $cookieLang;
    }

    // 3. Lingua configurata in config.php
    if (in_array($_i18nDefaultLang, $supportedLangs, true)) {
        return $_i18nDefaultLang;
    }

    // Fallback alla prima lingua disponibile
    return $supportedLangs[0] ?? 'it';
}

/**
 * Carica il file di traduzione per una lingua
 */
function loadTranslations(string $lang): array {
    global $_i18nDefaultLang, $_translations, $_currentLang;

    $supportedLangs = discoverSupportedLangs();

    if (!in_array($lang, $supportedLangs, true)) {
        $lang = $_i18nDefaultLang;
    }

    $filePath = __DIR__ . '/' . $lang . '.json';

    if (!file_exists($filePath)) {
        if ($lang !== $_i18nDefaultLang) {
            return loadTranslations($_i18nDefaultLang);
        }
        return [];
    }

    $content = file_get_contents($filePath);
    if ($content === false) {
        return [];
    }

    $data = json_decode($content, true);
    if (!is_array($data)) {
        return [];
    }

    $_translations = $data;
    $_currentLang = $lang;

    return $data;
}

/**
 * Inizializza il sistema i18n
 */
function i18nInit(): array {
    global $_translations, $_currentLang;

    if ($_translations !== null) {
        return $_translations;
    }

    $detectedLang = detectLanguage();
    return loadTranslations($detectedLang);
}

/**
 * Ottiene una traduzione dato il percorso della chiave
 * @param string $key Chiave nel formato "section.key"
 * @param string|null $fallback Valore di fallback
 * @return string
 */
function __t(string $key, ?string $fallback = null): string {
    global $_translations;

    if ($_translations === null) {
        i18nInit();
    }

    $parts = explode('.', $key);
    $value = $_translations;

    foreach ($parts as $part) {
        if (is_array($value) && isset($value[$part])) {
            $value = $value[$part];
        } else {
            return $fallback ?? $key;
        }
    }

    return is_string($value) ? $value : ($fallback ?? $key);
}

/**
 * Testo dell'interfaccia con priorità: personalizzazione dell'utente in
 * custom/config.local.php → traduzione in i18n/[lang].json → default di
 * config.php → fallback passato al metodo.
 *
 * Il valore in custom/config.local.php può essere una stringa singola
 * oppure un array lingua => testo, es:
 *   'texts' => ['pageTitle' => ['it' => 'Mappa 3D', 'en' => '3D Map']]
 *
 * @param string $configKey Chiave di config.php (es: "texts.pageTitle")
 * @param string $i18nKey Chiave di traduzione (es: "homepage.pageTitle")
 * @param string $fallback Testo usato se non c'è nient'altro
 * @return string
 */
function uiText(string $configKey, string $i18nKey, string $fallback = ''): string {
    if (!function_exists('config')) {
        return __t($i18nKey, $fallback);
    }

    $lang = getCurrentLang();

    // 1. Personalizzazione esplicita dell'utente: vince su tutto
    $custom = textValue(configCustom($configKey), $lang);
    if ($custom !== '') {
        return formatText($custom);
    }

    // 2. Traduzione, con il default di config.php come fallback
    $default = textValue(config($configKey, $fallback), $lang);

    return formatText(__t($i18nKey, $default !== '' ? $default : $fallback));
}

/**
 * Ottiene la lingua corrente
 */
function getCurrentLang(): string {
    global $_currentLang, $_i18nDefaultLang;
    return $_currentLang ?? $_i18nDefaultLang;
}

/**
 * Ottiene la lingua di default configurata
 */
function getDefaultLang(): string {
    global $_i18nDefaultLang;
    return $_i18nDefaultLang;
}

/**
 * Ottiene le lingue supportate
 */
function getSupportedLangs(): array {
    return discoverSupportedLangs();
}

/**
 * Metadati delle lingue supportate per il selettore lingua
 * Legge "langName" e "langFlag" da ogni file JSON
 * @return array<string, array{name: string, flag: string}>
 */
function getLanguagesMeta(): array {
    static $meta = null;

    if ($meta !== null) {
        return $meta;
    }

    $meta = [];
    foreach (discoverSupportedLangs() as $code) {
        $name = strtoupper($code);
        $flag = '';
        $filePath = __DIR__ . '/' . $code . '.json';
        if (is_readable($filePath)) {
            $content = file_get_contents($filePath);
            $data = $content !== false ? json_decode($content, true) : null;
            if (is_array($data)) {
                if (isset($data['langName']) && is_string($data['langName'])) {
                    $name = $data['langName'];
                }
                if (isset($data['langFlag']) && is_string($data['langFlag'])) {
                    $flag = $data['langFlag'];
                }
            }
        }
        $meta[$code] = ['name' => $name, 'flag' => $flag];
    }

    return $meta;
}

/**
 * Costruisce l'URL della pagina corrente con il parametro lang impostato,
 * preservando gli altri parametri GET (es. m, cam, tgt)
 */
function buildLangURL(string $lang): string {
    $params = $_GET;
    $params['lang'] = $lang;
    return '?' . http_build_query($params);
}

// Inizializza automaticamente
i18nInit();
