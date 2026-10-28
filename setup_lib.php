<?php
declare(strict_types=1);

/*
  3D Cave Viewer - Installazione guidata (funzioni di supporto)
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

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/i18n/loader.php';

/** Lunghezza massima di un valore di testo scritto nell'INI. */
const SETUP_MAX_TEXT = 300;

/** Dimensione massima del logo caricato (byte). */
const SETUP_MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** Lato massimo accettato per il logo caricato (pixel). */
const SETUP_MAX_LOGO_SIDE = 4000;

/**
 * Zoom massimo proponibile per la mappa della homepage.
 * Oltre questo livello le tessere di OpenStreetMap non esistono: proporre
 * uno zoom più alto significherebbe far scegliere una mappa grigia.
 */
const SETUP_MAX_ZOOM = 19;

/**
 * Schema dei campi gestiti dall'installazione guidata.
 * È l'unica fonte di verità: la stessa struttura genera il form, valida
 * il POST e scrive custom/settings.ini. Aggiungere un'opzione al wizard
 * significa aggiungere una riga qui.
 *
 * Ogni voce: [sezione INI, chiave INI, tipo, step, opzioni]
 * Le opzioni ammesse sono 'default' (valore di fallback per le sezioni che
 * non esistono in config.php), 'min', 'max', 'values' (whitelist) e
 * 'prefill' => 'custom' (precompila il campo solo con quello che l'utente ha
 * già scelto, senza proporre il default dell'applicazione).
 *
 * @return array<string, array{section: string, key: string, type: string, step: string, options: array}>
 */
function setupFields(): array {
    static $fields = null;
    if ($fields !== null) {
        return $fields;
    }

    $raw = [
        // Step "benvenuto": la lingua scelta diventa quella predefinita
        'languageDefault'  => ['language', 'default',            'lang',   'welcome',  []],

        // Step "identità"
        'appName'          => ['branding', 'appName',            'string',    'identity', []],
        'appShortName'     => ['branding', 'appShortName',       'string',    'identity', []],
        'organizationName' => ['branding', 'organizationName',   'string',    'identity', []],
        'organizationUrl'  => ['branding', 'organizationUrl',    'url',       'identity', []],
        'contactEmail'     => ['branding', 'contactEmail',       'email',     'identity', []],
        'copyrightHolder'  => ['branding', 'copyrightHolder',    'copyright', 'identity', []],
        'appDescription'   => ['branding', 'appDescription',     'string',    'identity', []],

        // Step "identità", blocco avanzato: i testi dell'interfaccia.
        // 'prefill' => 'custom' li lascia vuoti finché l'utente non ne scrive
        // uno: precompilarli col default di config.php vorrebbe dire scriverlo
        // attivo nell'INI al primo salvataggio, e da lì in poi quel testo — in
        // una lingua sola — vincerebbe su tutte le traduzioni.
        'pageTitle'        => ['texts',    'pageTitle',          'string',    'identity', ['prefill' => 'custom']],
        'pageSubtitle'     => ['texts',    'pageSubtitle',       'string',    'identity', ['prefill' => 'custom']],
        'sidebarTitle'     => ['texts',    'sidebarTitle',       'string',    'identity', ['prefill' => 'custom']],

        // Step "colori"
        'accentColor'      => ['theme',    'accentColor',        'color',  'theme',    []],
        'accentHover'      => ['theme',    'accentHover',        'color',  'theme',    []],
        'bgColor'          => ['theme',    'bgColor',            'color',  'theme',    []],
        'panelBgSolid'     => ['theme',    'panelBgSolid',       'color',  'theme',    []],
        'textColor'        => ['theme',    'textColor',          'color',  'theme',    []],
        'themeColor'       => ['theme',    'themeColor',         'color',  'theme',    []],
        'pwaBackground'    => ['theme',    'pwaBackgroundColor', 'color',  'theme',    []],

        // Step "mappa" (il centro è gestito a parte: è un array lat/lon).
        // I limiti di spostamento non stanno qui apposta: la mappa del
        // wizard serve a scegliere il centro, non a chiudere la mappa del
        // sito dentro un rettangolo. Chi li vuole li scrive a mano in
        // custom/settings.ini.
        'defaultZoom'      => ['map',      'defaultZoom',        'int',    'map', ['default' => 16, 'min' => 1,  'max' => SETUP_MAX_ZOOM]],
        'minZoom'          => ['map',      'minZoom',            'int',    'map', ['default' => 8,  'min' => 0,  'max' => SETUP_MAX_ZOOM]],
        'flyToZoom'        => ['map',      'flyToZoom',          'int',    'map', ['default' => 17, 'min' => 1,  'max' => SETUP_MAX_ZOOM]],

        // Step "mappa", blocco avanzato: visualizzatore 3D
        'fpBaseSpeed'      => ['viewer',   'fpBaseSpeed',        'float',  'map', ['default' => 1.2, 'min' => 0.1, 'max' => 20]],
        'scaleBarUnit'     => ['viewer',   'scaleBarUnit',       'string', 'map', ['default' => 'm', 'values' => ['m', 'ft']]],
        'skyDomeEnabled'   => ['viewer',   'skyDomeEnabled',     'bool',   'map', ['default' => true]],
    ];

    $fields = [];
    foreach ($raw as $name => [$section, $key, $type, $step, $options]) {
        $fields[$name] = [
            'section' => $section,
            'key'     => $key,
            'type'    => $type,
            'step'    => $step,
            'options' => $options,
        ];
    }

    return $fields;
}

/**
 * Valore attualmente in vigore per un campo del wizard, da usare come
 * precompilazione. L'ordine è quello della configurazione: quello che
 * l'utente ha impostato, poi il default dell'applicazione, poi il default
 * dichiarato nello schema (per le sezioni che vivono solo in js/config.php).
 *
 * I campi con 'prefill' => 'custom' si fermano al primo passo: proporre il
 * default dell'applicazione li farebbe salvare come valori scelti, e per i
 * testi dell'interfaccia significherebbe imporre una lingua a tutte le altre.
 *
 * @param string $name Nome del campo nello schema
 * @return string Valore già pronto per un attributo HTML value=""
 */
function setupCurrentValue(string $name): string {
    $field = setupFields()[$name] ?? null;
    if ($field === null) {
        return '';
    }

    $path  = $field['section'] . '.' . $field['key'];
    $value = configCustom($path);
    if ($value === null && ($field['options']['prefill'] ?? '') !== 'custom') {
        $value = config($path, $field['options']['default'] ?? null);
    }

    if ($value === null) {
        return '';
    }
    if (is_bool($value)) {
        return $value ? '1' : '';
    }
    if (is_array($value)) {
        // Testi per lingua: mostra quello della lingua corrente
        return textValue($value, getCurrentLang());
    }

    return (string) $value;
}

/**
 * Centro attuale della mappa come [lat, lon], con i default del progetto
 * quando non è configurato.
 *
 * @return array{0: float, 1: float}
 */
function setupCurrentCenter(): array {
    $center = configCustom('map.center') ?? config('map.center');
    if (is_array($center) && count($center) >= 2 && is_numeric($center[0]) && is_numeric($center[1])) {
        return [(float) $center[0], (float) $center[1]];
    }
    return [43.351726, 12.579768];
}

/**
 * I quattro lati dei limiti di spostamento, se l'installazione li ha già
 * configurati a mano. Il wizard non li imposta più: li legge soltanto, per
 * accorgersi quando il nuovo centro finirebbe fuori dal rettangolo.
 *
 * @return array{0: float, 1: float, 2: float, 3: float}|null
 */
function setupConfiguredBounds(): ?array {
    $sides  = ['boundsSouth', 'boundsWest', 'boundsNorth', 'boundsEast'];
    $values = [];
    foreach ($sides as $side) {
        $value = configCustom('map.' . $side);
        if (!is_numeric($value)) {
            return null;
        }
        $values[] = (float) $value;
    }

    return [$values[0], $values[1], $values[2], $values[3]];
}

/**
 * Ripulisce una stringa destinata a un file .ini.
 * parse_ini_file() non ha un escaping affidabile per le virgolette, quindi
 * conviene normalizzare in ingresso invece di provare a codificarle.
 *
 * @param string $value
 * @return string
 */
function iniEscape(string $value): string {
    $value = (string) preg_replace('/[\x00-\x1F\x7F]/u', ' ', $value);
    $value = str_replace(['"', '\\'], ['', ''], $value);
    $value = trim((string) preg_replace('/\s+/u', ' ', $value));

    // Senza mbstring si tronca per caratteri con una regex UTF-8
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, SETUP_MAX_TEXT);
    }
    return preg_match('/^.{0,' . SETUP_MAX_TEXT . '}/us', $value, $m) === 1 ? $m[0] : $value;
}

/**
 * Formatta un valore PHP come letterale .ini, seguendo le regole scritte
 * in testa a custom/settings.ini: testo tra virgolette, numeri e booleani
 * senza virgolette.
 *
 * @param mixed $value
 * @return string
 */
function iniFormatValue($value): string {
    if (is_bool($value)) {
        return $value ? 'true' : 'false';
    }
    if (is_int($value)) {
        return (string) $value;
    }
    if (is_float($value)) {
        $formatted = rtrim(rtrim(number_format($value, 7, '.', ''), '0'), '.');
        return $formatted === '' || $formatted === '-' ? '0' : $formatted;
    }

    return '"' . iniEscape((string) $value) . '"';
}

/**
 * Valida un valore inviato dal wizard secondo il tipo dichiarato nello schema.
 *
 * @param mixed $raw Valore grezzo dal POST
 * @param array $field Voce di setupFields()
 * @return array{0: bool, 1: mixed} [valido, valore normalizzato]
 */
function validateSetupValue($raw, array $field): array {
    $options = $field['options'];

    if ($field['type'] === 'bool') {
        return [true, $raw !== null && $raw !== '' && $raw !== '0'];
    }

    $raw = is_string($raw) ? trim($raw) : $raw;
    if ($raw === null || $raw === '') {
        // Campo svuotato: la riga viene commentata e il valore torna al default
        return [true, null];
    }
    if (!is_scalar($raw)) {
        return [false, null];
    }
    $raw = (string) $raw;

    switch ($field['type']) {
        case 'string':
            $clean = iniEscape($raw);
            if (isset($options['values']) && !in_array($clean, $options['values'], true)) {
                return [false, null];
            }
            return $clean === '' ? [false, null] : [true, $clean];

        case 'copyright':
            // Licenza GPL v3: il testo del copyright resta modificabile, ma
            // deve continuare a citare l'autore originale. Se non lo fa il
            // valore viene scartato come qualunque altro dato non valido, e
            // la voce torna al default del progetto.
            $clean  = iniEscape($raw);
            $author = (string) config('originalAuthor.name', '');
            if ($clean === '') {
                return [false, null];
            }
            $found  = function_exists('mb_stripos')
                ? mb_stripos($clean, $author)
                : stripos($clean, $author);
            if ($author !== '' && $found === false) {
                return [false, null];
            }
            return [true, $clean];

        case 'url':
            $clean = iniEscape($raw);
            if (filter_var($clean, FILTER_VALIDATE_URL) === false) {
                return [false, null];
            }
            $scheme = strtolower((string) parse_url($clean, PHP_URL_SCHEME));
            return in_array($scheme, ['http', 'https'], true) ? [true, $clean] : [false, null];

        case 'email':
            $clean = iniEscape($raw);
            return filter_var($clean, FILTER_VALIDATE_EMAIL) === false ? [false, null] : [true, $clean];

        case 'color':
            return preg_match('/^#[0-9a-f]{6}$/i', $raw) === 1 ? [true, strtolower($raw)] : [false, null];

        case 'lang':
            return isValidLang($raw) ? [true, $raw] : [false, null];

        case 'int':
        case 'float':
            if (!is_numeric($raw)) {
                return [false, null];
            }
            $number = $field['type'] === 'int' ? (int) $raw : (float) $raw;
            if (isset($options['min']) && $number < $options['min']) {
                return [false, null];
            }
            if (isset($options['max']) && $number > $options['max']) {
                return [false, null];
            }
            return [true, $number];
    }

    return [false, null];
}

/**
 * Trasforma il POST del wizard nell'array di valori da scrivere nell'INI.
 * Un campo non valido non blocca il salvataggio: viene scartato e segnalato,
 * così l'applicazione torna semplicemente al suo default — stessa filosofia
 * di normalizeSettingValue() in config.php.
 *
 * @param array $post
 * @return array{values: array<string, array<string, mixed>>, errors: array<string, string>}
 */
function collectSetupValues(array $post): array {
    $values = [];
    $errors = [];

    foreach (setupFields() as $name => $field) {
        // Una checkbox assente dal POST significa "false", non "campo saltato"
        if (!array_key_exists($name, $post) && $field['type'] !== 'bool') {
            continue;
        }

        [$ok, $value] = validateSetupValue($post[$name] ?? null, $field);
        if (!$ok) {
            $errors[$name] = (string) ($post[$name] ?? '');
            continue;
        }
        $values[$field['section']][$field['key']] = $value;
    }

    // Il centro della mappa è l'unico valore composto: due campi del form,
    // una sola chiave array nell'INI (center[] = lat, center[] = lon).
    $lat = isset($post['mapLat']) ? trim((string) $post['mapLat']) : '';
    $lon = isset($post['mapLon']) ? trim((string) $post['mapLon']) : '';
    if ($lat !== '' || $lon !== '') {
        if (is_numeric($lat) && is_numeric($lon)
            && abs((float) $lat) <= 90 && abs((float) $lon) <= 180) {
            $values['map']['center'] = [(float) $lat, (float) $lon];
        } else {
            $errors['mapLat'] = $lat . ', ' . $lon;
        }
    }

    // Il wizard non imposta i limiti di spostamento, ma un'installazione può
    // averli scritti a mano in settings.ini: se il nuovo centro cade fuori da
    // quel rettangolo la homepage si troverebbe a rimbalzare da sola contro i
    // suoi stessi limiti. In quel caso le quattro righe vengono commentate e
    // la mappa torna libera — l'unica volta in cui il wizard le tocca.
    $existingBounds = setupConfiguredBounds();
    if ($existingBounds !== null && isset($values['map']['center'])) {
        [$south, $west, $north, $east] = $existingBounds;
        [$centerLat, $centerLon] = $values['map']['center'];

        $unusable = $south >= $north || $west >= $east
            || $centerLat < $south || $centerLat > $north
            || $centerLon < $west || $centerLon > $east;

        if ($unusable) {
            foreach (['boundsSouth', 'boundsWest', 'boundsNorth', 'boundsEast'] as $side) {
                $values['map'][$side] = null;
            }
            $errors['bounds'] = 'dropped';
        }
    }

    // Zoom coerenti fra loro: uno zoom minimo più stretto di quello iniziale
    // (o di quello usato per volare su una cavità) bloccherebbe la mappa
    // appena caricata. Lo si scarta e torna al default, come ogni altro
    // valore non valido.
    $ceiling = [];
    foreach (['defaultZoom', 'flyToZoom'] as $zoomKey) {
        if (isset($values['map'][$zoomKey]) && is_int($values['map'][$zoomKey])) {
            $ceiling[] = $values['map'][$zoomKey];
        }
    }
    if (isset($values['map']['minZoom']) && is_int($values['map']['minZoom'])
        && $ceiling !== [] && $values['map']['minZoom'] > min($ceiling)) {
        $errors['minZoom'] = (string) $values['map']['minZoom'];
        $values['map']['minZoom'] = null;
    }

    return ['values' => $values, 'errors' => $errors];
}

/**
 * Riscrive il contenuto di settings.ini applicando i valori del wizard.
 * Lavora riga per riga sul file esistente invece di rigenerarlo da un
 * template: così i commenti che documentano ogni voce — e le eventuali
 * modifiche manuali dell'utente — restano al loro posto.
 *
 * Un valore null commenta la riga: la chiave torna al default dell'applicazione
 * ma resta visibile nel file come suggerimento.
 *
 * @param string $existing Contenuto attuale del file
 * @param array<string, array<string, mixed>> $values
 * @return string Nuovo contenuto
 */
function renderSettingsIni(string $existing, array $values): string {
    $lines   = preg_split('/\r\n|\r|\n/', $existing) ?: [];
    $section = '';
    $out     = [];
    $written = [];
    $arrays  = [];

    foreach ($lines as $line) {
        if (preg_match('/^\s*\[([A-Za-z0-9_]+)\]\s*$/', $line, $m) === 1) {
            $section = $m[1];
            $out[] = $line;
            continue;
        }

        $isSetting = $section !== ''
            && preg_match('/^\s*;?\s*([A-Za-z_][A-Za-z0-9_]*)\s*(\[[^\]]*\])?\s*=/', $line, $m) === 1
            && array_key_exists($m[1], $values[$section] ?? []);

        if (!$isSetting) {
            $out[] = $line;
            continue;
        }

        $key   = $m[1];
        $id    = $section . '.' . $key;
        $value = $values[$section][$key];

        if (is_array($value)) {
            // Chiave array: si rimuovono tutte le occorrenze e si riemette
            // il set completo alla posizione della prima.
            if (isset($arrays[$id])) {
                continue;
            }
            $arrays[$id] = true;
            foreach ($value as $item) {
                $out[] = $key . '[] = ' . iniFormatValue($item);
            }
        } elseif ($value === null) {
            $trimmed = ltrim($line);
            $out[] = ($trimmed !== '' && $trimmed[0] === ';') ? $line : ';' . $trimmed;
        } else {
            $out[] = $key . ' = ' . iniFormatValue($value);
        }

        $written[$id] = true;
    }

    // Chiavi che nel file non c'erano: inserite in coda alla loro sezione,
    // creando la sezione se manca.
    foreach ($values as $sectionName => $keys) {
        foreach ($keys as $key => $value) {
            if (isset($written[$sectionName . '.' . $key]) || $value === null) {
                continue;
            }

            $newLines = is_array($value)
                ? array_map(static fn($item) => $key . '[] = ' . iniFormatValue($item), $value)
                : [$key . ' = ' . iniFormatValue($value)];

            $at = array_search('[' . $sectionName . ']', array_map('trim', $out), true);
            if ($at === false) {
                $out[] = '';
                $out[] = '[' . $sectionName . ']';
                array_push($out, ...$newLines);
            } else {
                array_splice($out, $at + 1, 0, $newLines);
            }
        }
    }

    return rtrim(implode("\n", $out), "\n") . "\n";
}

/**
 * Scrive custom/settings.ini con i valori del wizard.
 * Il file generato viene riletto con parse_ini_file() prima di sostituire
 * l'originale: se non fosse leggibile, l'installazione resta com'era.
 * L'originale viene comunque salvato in custom/settings.ini.bak.
 *
 * @param array<string, array<string, mixed>> $values
 * @return array{ok: bool, ini: string, error: string}
 */
function writeSettingsIni(array $values): array {
    $file     = __DIR__ . '/custom/settings.ini';
    $existing = is_readable($file) ? (string) file_get_contents($file) : '';
    $ini      = renderSettingsIni($existing, $values);

    $dir = __DIR__ . '/custom';
    if (!is_dir($dir) || !is_writable($dir) || (is_file($file) && !is_writable($file))) {
        return ['ok' => false, 'ini' => $ini, 'error' => 'not_writable'];
    }

    $tmp = $file . '.tmp.' . getmypid();
    if (@file_put_contents($tmp, $ini, LOCK_EX) === false) {
        @unlink($tmp);
        return ['ok' => false, 'ini' => $ini, 'error' => 'write_failed'];
    }

    // Guardia: se il file generato non è parsabile non si tocca l'originale.
    if (!is_array(@parse_ini_file($tmp, true, INI_SCANNER_TYPED))) {
        @unlink($tmp);
        return ['ok' => false, 'ini' => $ini, 'error' => 'invalid_ini'];
    }

    if (is_file($file)) {
        @copy($file, $file . '.bak');
    }

    if (!@rename($tmp, $file)) {
        @unlink($tmp);
        return ['ok' => false, 'ini' => $ini, 'error' => 'write_failed'];
    }

    return ['ok' => true, 'ini' => $ini, 'error' => ''];
}

/**
 * Salva il logo caricato dal wizard in custom/logo.png.
 * Riusa la stessa catena di irrobustimento di save_social_preview.php:
 * limite di dimensione, controllo MIME con finfo e ri-codifica attraverso
 * GD, così il file scritto è sempre un PNG pulito.
 *
 * @param array $file Voce di $_FILES
 * @return array{ok: bool, error: string} error vuoto se non è stato caricato nulla
 */
function handleLogoUpload(array $file): array {
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return ['ok' => true, 'error' => ''];
    }
    if (($file['error'] ?? 1) !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'error' => 'upload_failed'];
    }

    $tmpName = (string) ($file['tmp_name'] ?? '');
    if ($tmpName === '' || !is_uploaded_file($tmpName)) {
        return ['ok' => false, 'error' => 'upload_failed'];
    }
    if ((int) ($file['size'] ?? 0) > SETUP_MAX_LOGO_BYTES) {
        return ['ok' => false, 'error' => 'logo_too_large'];
    }
    if (!extension_loaded('gd')) {
        return ['ok' => false, 'error' => 'no_gd'];
    }

    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime  = (string) $finfo->file($tmpName);
        if (!in_array($mime, ['image/png', 'image/jpeg', 'image/webp'], true)) {
            return ['ok' => false, 'error' => 'logo_bad_format'];
        }
    }

    $info = @getimagesize($tmpName);
    if ($info === false || $info[0] > SETUP_MAX_LOGO_SIDE || $info[1] > SETUP_MAX_LOGO_SIDE) {
        return ['ok' => false, 'error' => 'logo_bad_format'];
    }

    $data   = @file_get_contents($tmpName);
    $source = $data === false ? false : @imagecreatefromstring($data);
    if ($source === false) {
        return ['ok' => false, 'error' => 'logo_bad_format'];
    }

    $dir = __DIR__ . '/custom';
    if (!is_dir($dir) || !is_writable($dir)) {
        imagedestroy($source);
        return ['ok' => false, 'error' => 'not_writable'];
    }

    imagepalettetotruecolor($source);
    imagealphablending($source, false);
    imagesavealpha($source, true);

    $dest = $dir . '/logo.png';
    $tmp  = $dest . '.tmp.' . getmypid();
    $ok   = imagepng($source, $tmp) && @rename($tmp, $dest);
    if (!$ok) {
        @unlink($tmp);
    }
    imagedestroy($source);

    if (!$ok) {
        return ['ok' => false, 'error' => 'write_failed'];
    }

    // LOGO_PATTERNS ha un ordine fisso (png, jpg, jpeg, svg, webp): un
    // vecchio logo in un altro formato oscurerebbe quello appena caricato.
    foreach ((array) @glob($dir . '/logo.*') as $old) {
        if (is_string($old) && $old !== $dest) {
            @unlink($old);
        }
    }

    // Icone PWA derivate dal logo: si rigenerano da sole al primo caricamento.
    foreach ((array) @glob(__DIR__ . '/' . GENERATED_ICON_DIR . '/*.png') as $icon) {
        if (is_string($icon)) {
            @unlink($icon);
        }
    }

    return ['ok' => true, 'error' => ''];
}

/**
 * Controlli tecnici mostrati nel primo step.
 * Nessun esito impedisce di proseguire: solo custom/ non scrivibile cambia
 * il finale del wizard (istruzioni per il caricamento manuale).
 *
 * @return array<int, array{id: string, status: string, detail: string}> status: ok|warn|fail
 */
function setupRequirements(): array {
    $modelsDir = __DIR__ . '/' . config('paths.modelsFolder', 'modelli');

    $checks = [
        [
            'id'     => 'php',
            'status' => PHP_VERSION_ID >= 70400 ? 'ok' : 'fail',
            'detail' => PHP_VERSION,
        ],
        [
            'id'     => 'gd',
            'status' => extension_loaded('gd') ? 'ok' : 'fail',
            'detail' => extension_loaded('gd') ? 'GD' : '—',
        ],
        [
            'id'     => 'finfo',
            'status' => class_exists('finfo') ? 'ok' : 'warn',
            'detail' => class_exists('finfo') ? 'fileinfo' : '—',
        ],
        [
            'id'     => 'mbstring',
            'status' => extension_loaded('mbstring') ? 'ok' : 'warn',
            'detail' => extension_loaded('mbstring') ? 'mbstring' : '—',
        ],
        [
            'id'     => 'writableCustom',
            'status' => is_writable(__DIR__ . '/custom') ? 'ok' : 'warn',
            'detail' => 'custom/',
        ],
        [
            'id'     => 'writableModels',
            'status' => is_dir($modelsDir) && is_writable($modelsDir) ? 'ok' : 'warn',
            'detail' => basename($modelsDir) . '/',
        ],
        [
            'id'     => 'https',
            'status' => isHttpsRequest() ? 'ok' : 'warn',
            'detail' => isHttpsRequest() ? 'HTTPS' : 'HTTP',
        ],
    ];

    // mod_rewrite non è interrogabile su ogni SAPI: quando non lo è, la
    // verifica la completa js/setup.js chiedendo manifest.json.
    if (function_exists('apache_get_modules')) {
        $hasRewrite = in_array('mod_rewrite', apache_get_modules(), true);
        $checks[] = [
            'id'     => 'rewrite',
            'status' => $hasRewrite ? 'ok' : 'warn',
            'detail' => $hasRewrite ? 'mod_rewrite' : '—',
        ];
    } else {
        $checks[] = ['id' => 'rewrite', 'status' => 'probe', 'detail' => '…'];
    }

    return $checks;
}

/**
 * True se il wizard può scrivere da solo la configurazione.
 *
 * @return bool
 */
function setupCanWrite(): bool {
    return is_dir(__DIR__ . '/custom') && is_writable(__DIR__ . '/custom');
}
