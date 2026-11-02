<?php
declare(strict_types=1);

/*
  3D Cave Viewer - Pannello di amministrazione (logica)
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

// Tutto ciò che il pannello scrive è dato dell'installazione e vive in
// custom/admin/ (mai toccato da un aggiornamento, escluso da git):
//
//   users.php      account (hash bcrypt/argon, ruolo, nome visualizzato)
//   history.php    storico delle modifiche, una riga JSON per evento
//   throttle.php   tentativi di accesso falliti (anti forza bruta)
//   uploads/       caricamenti a blocchi in corso (<id>.part + <id>.php)
//   trash/         modelli eliminati e versioni sostituite dei file 3D
//
// I file di dati hanno estensione .php e cominciano con ADMIN_GUARD: anche
// su un server che ignora .htaccess (nginx) chiederli dal browser esegue
// solo quella riga, che risponde 404. La cartella riceve comunque il suo
// .htaccess "Require all denied" come seconda difesa.

require_once __DIR__ . '/config.php';

const ADMIN_DATA_DIR = 'custom/admin';
const ADMIN_GUARD = "<?php http_response_code(404); exit; ?>\n";

/** Ruoli, dal più ampio: admin gestisce anche utenti, cestino ed eliminazioni. */
const ADMIN_ROLES = ['admin', 'editor'];

/** Sessione scaduta dopo due ore senza richieste. */
const ADMIN_SESSION_IDLE = 7200;

/** Al più 5 accessi falliti ogni 15 minuti per indirizzo IP. */
const ADMIN_LOGIN_WINDOW = 900;
const ADMIN_LOGIN_MAX_FAILS = 5;

const ADMIN_PASSWORD_MIN = 10;

/** Caricamenti interrotti eliminati dopo un giorno. */
const ADMIN_UPLOAD_TTL = 86400;

/** Limite di un modello 3D caricato dal pannello. */
const ADMIN_MAX_MODEL_BYTES = 4 * 1024 * 1024 * 1024;

const ADMIN_MODEL_EXTENSIONS = ['glb', 'gltf'];

const ADMIN_MAX_SOCIAL_BYTES = 10 * 1024 * 1024;
const ADMIN_MAX_SOCIAL_SIDE = 10000;
/** L'anteprima social si ridimensiona oltre questa larghezza (1200×630 è lo standard). */
const ADMIN_SOCIAL_MAX_WIDTH = 1600;

const ADMIN_DESCRIPTION_MAX = 5000;
const ADMIN_NAME_MAX = 200;

// ============================================================
// ARCHIVIO SU FILE
// ============================================================

/**
 * Percorso assoluto dentro custom/admin/.
 */
function adminDataPath(string $rel = ''): string {
    return __DIR__ . '/' . ADMIN_DATA_DIR . ($rel !== '' ? '/' . $rel : '');
}

/**
 * Crea custom/admin/ (ed eventualmente una sua sottocartella) con le
 * protezioni dal web. False se custom/ non è scrivibile.
 */
function adminEnsureDir(string $rel = ''): bool {
    $root = adminDataPath();
    if (!is_dir($root) && !@mkdir($root, 0775, true) && !is_dir($root)) {
        return false;
    }
    if (!is_file($root . '/.htaccess')) {
        @file_put_contents($root . '/.htaccess', "# Dati del pannello di amministrazione: mai serviti dal web\nRequire all denied\n");
    }
    if (!is_file($root . '/index.html')) {
        @file_put_contents($root . '/index.html', '');
    }
    if ($rel !== '') {
        $dir = adminDataPath($rel);
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            return false;
        }
        if (!is_file($dir . '/index.html')) {
            @file_put_contents($dir . '/index.html', '');
        }
    }
    return is_writable($root);
}

/**
 * True se il pannello può salvare i propri dati.
 */
function adminStorageWritable(): bool {
    return adminEnsureDir();
}

/**
 * Scrittura atomica: file temporaneo nella stessa cartella e rename().
 */
function adminAtomicWrite(string $file, string $content): bool {
    try {
        $suffix = bin2hex(random_bytes(4));
    } catch (Exception $e) {
        $suffix = (string) mt_rand();
    }
    $tmp = $file . '.tmp.' . getmypid() . '.' . $suffix;
    if (@file_put_contents($tmp, $content) === false) {
        @unlink($tmp);
        return false;
    }
    if (!@rename($tmp, $file)) {
        @unlink($tmp);
        return false;
    }
    return true;
}

/**
 * Toglie la riga di guardia da un file di dati.
 */
function adminStripGuard(string $raw): string {
    return strncmp($raw, ADMIN_GUARD, strlen(ADMIN_GUARD)) === 0
        ? (string) substr($raw, strlen(ADMIN_GUARD))
        : $raw;
}

/**
 * Legge un archivio JSON protetto (custom/admin/<name>.php).
 */
function adminReadStore(string $name): array {
    $file = adminDataPath($name . '.php');
    if (!is_file($file)) {
        return [];
    }
    $raw = @file_get_contents($file);
    if ($raw === false) {
        return [];
    }
    $data = json_decode(adminStripGuard($raw), true);
    return is_array($data) ? $data : [];
}

/**
 * Scrive un archivio JSON protetto.
 */
function adminWriteStore(string $name, array $data): bool {
    $dir = dirname($name);
    if (!adminEnsureDir($dir === '.' ? '' : $dir)) {
        return false;
    }
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }
    return adminAtomicWrite(adminDataPath($name . '.php'), ADMIN_GUARD . $json . "\n");
}

/**
 * Esegue $fn con un lock esclusivo sui dati del pannello, così due
 * richieste contemporanee non si sovrascrivono a vicenda (leggi-modifica-
 * scrivi su utenti e tentativi di accesso).
 *
 * @template T
 * @param callable(): T $fn
 * @return T
 */
function adminLocked(callable $fn) {
    adminEnsureDir();
    $handle = @fopen(adminDataPath('.lock'), 'c');
    if ($handle !== false) {
        flock($handle, LOCK_EX);
    }
    try {
        return $fn();
    } finally {
        if ($handle !== false) {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }
}

/**
 * Stringa casuale esadecimale ('' se il generatore non è disponibile).
 */
function adminRandomHex(int $bytes = 16): string {
    try {
        return bin2hex(random_bytes($bytes));
    } catch (Exception $e) {
        return '';
    }
}

// ============================================================
// UTENTI
// ============================================================

/**
 * @return array<string, array> username => dati
 */
function adminUsers(): array {
    $users = adminReadStore('users')['users'] ?? [];
    return is_array($users) ? $users : [];
}

function adminSaveUsers(array $users): bool {
    ksort($users);
    return adminWriteStore('users', ['users' => $users]);
}

function adminUser(string $username): ?array {
    $users = adminUsers();
    return isset($users[$username]) && is_array($users[$username])
        ? $users[$username] + ['username' => $username]
        : null;
}

function adminHasUsers(): bool {
    return adminUsers() !== [];
}

/**
 * Nome utente: minuscole, cifre, punto, trattino, underscore; 3-32 caratteri.
 */
function adminValidUsername(string $username): bool {
    return preg_match('/^[a-z0-9][a-z0-9._-]{2,31}$/', $username) === 1;
}

/**
 * '' se la password va bene, altrimenti il codice del problema.
 */
function adminPasswordProblem(string $password): string {
    $length = function_exists('mb_strlen') ? mb_strlen($password, 'UTF-8') : strlen($password);
    if ($length < ADMIN_PASSWORD_MIN) {
        return 'password_short';
    }
    if (strlen($password) > 200) {
        return 'password_long';
    }
    return '';
}

/**
 * Nome visualizzato di un utente nello storico (il nome utente se manca,
 * o se l'account è stato eliminato).
 */
function adminDisplayName(string $username): string {
    $user = adminUser($username);
    $name = $user !== null ? trim((string) ($user['displayName'] ?? '')) : '';
    return $name !== '' ? $name : $username;
}

/**
 * Crea un account. Torna '' oppure un codice d'errore.
 */
function adminCreateUser(string $username, string $displayName, string $password, string $role, string $createdBy): string {
    if (!adminValidUsername($username)) {
        return 'username_invalid';
    }
    if (!in_array($role, ADMIN_ROLES, true)) {
        return 'role_invalid';
    }
    $problem = adminPasswordProblem($password);
    if ($problem !== '') {
        return $problem;
    }

    return adminLocked(static function () use ($username, $displayName, $password, $role, $createdBy): string {
        $users = adminUsers();
        if (isset($users[$username])) {
            return 'username_taken';
        }
        $users[$username] = [
            'displayName' => adminCleanLine($displayName, 80),
            'role' => $role,
            'hash' => password_hash($password, PASSWORD_DEFAULT),
            'passwordChanged' => time(),
            'created' => time(),
            'createdBy' => $createdBy,
            'lastLogin' => 0,
            'disabled' => false,
        ];
        return adminSaveUsers($users) ? '' : 'write_failed';
    });
}

/**
 * Aggiorna un account con le sole chiavi date (displayName, role,
 * password, disabled). Torna '' oppure un codice d'errore.
 */
function adminUpdateUser(string $username, array $changes): string {
    if (isset($changes['role']) && !in_array($changes['role'], ADMIN_ROLES, true)) {
        return 'role_invalid';
    }
    if (isset($changes['password'])) {
        $problem = adminPasswordProblem((string) $changes['password']);
        if ($problem !== '') {
            return $problem;
        }
    }

    return adminLocked(static function () use ($username, $changes): string {
        $users = adminUsers();
        if (!isset($users[$username])) {
            return 'user_missing';
        }
        $user = $users[$username];

        // Deve restare almeno un amministratore attivo, altrimenti nessuno
        // potrebbe più gestire gli account dal pannello.
        $losesAdmin = ($user['role'] ?? '') === 'admin' && empty($user['disabled'])
            && ((isset($changes['role']) && $changes['role'] !== 'admin') || !empty($changes['disabled']));
        if ($losesAdmin && adminCountActiveAdmins($users) <= 1) {
            return 'last_admin';
        }

        if (isset($changes['displayName'])) {
            $user['displayName'] = adminCleanLine((string) $changes['displayName'], 80);
        }
        if (isset($changes['role'])) {
            $user['role'] = $changes['role'];
        }
        if (array_key_exists('disabled', $changes)) {
            $user['disabled'] = (bool) $changes['disabled'];
            // Riattivare un account non riapre le sessioni chiuse alla disattivazione
            $user['passwordChanged'] = time();
        }
        if (isset($changes['password'])) {
            $user['hash'] = password_hash((string) $changes['password'], PASSWORD_DEFAULT);
            // Invalida le sessioni aperte con la password precedente
            $user['passwordChanged'] = time();
        }
        if (isset($changes['lastLogin'])) {
            $user['lastLogin'] = (int) $changes['lastLogin'];
        }
        if (isset($changes['hash'])) {
            $user['hash'] = (string) $changes['hash'];
        }
        $users[$username] = $user;
        return adminSaveUsers($users) ? '' : 'write_failed';
    });
}

function adminDeleteUser(string $username): string {
    return adminLocked(static function () use ($username): string {
        $users = adminUsers();
        if (!isset($users[$username])) {
            return 'user_missing';
        }
        if (($users[$username]['role'] ?? '') === 'admin' && empty($users[$username]['disabled'])
            && adminCountActiveAdmins($users) <= 1) {
            return 'last_admin';
        }
        unset($users[$username]);
        return adminSaveUsers($users) ? '' : 'write_failed';
    });
}

function adminCountActiveAdmins(array $users): int {
    $count = 0;
    foreach ($users as $user) {
        if (is_array($user) && ($user['role'] ?? '') === 'admin' && empty($user['disabled'])) {
            $count++;
        }
    }
    return $count;
}

/**
 * Riga singola, senza caratteri di controllo, troncata a $max caratteri.
 */
function adminCleanLine(string $value, int $max): string {
    $value = trim((string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $value));
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

/**
 * Testo su più righe: normalizza gli a capo e toglie gli altri caratteri di controllo.
 */
function adminCleanText(string $value, int $max): string {
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    $value = trim((string) preg_replace('/[\x00-\x08\x0B-\x1F\x7F]+/u', '', $value));
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

// ============================================================
// SESSIONE, ACCESSO, CSRF
// ============================================================

/**
 * Avvia la sessione del pannello. $basePath è la cartella dell'app vista
 * dal browser (es. "/" oppure "/3d/"): il cookie vale solo lì.
 */
function adminStartSession(string $basePath): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $basePath = '/' . trim($basePath, '/');
    $basePath = $basePath === '/' ? '/' : $basePath . '/';

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('cvadmin');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => $basePath,
        'secure' => isHttpsRequest(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

/**
 * Utente della sessione corrente, o null. Ricontrolla ogni volta l'account:
 * un utente eliminato, disattivato o con la password cambiata altrove
 * perde subito l'accesso.
 */
function adminCurrentUser(): ?array {
    static $checked = false;
    static $current = null;
    if ($checked) {
        return $current;
    }
    $checked = true;

    $username = (string) ($_SESSION['user'] ?? '');
    if ($username === '') {
        return null;
    }

    $user = adminUser($username);
    $last = (int) ($_SESSION['seen'] ?? 0);
    $valid = $user !== null
        && empty($user['disabled'])
        && (int) ($_SESSION['pv'] ?? -1) === (int) ($user['passwordChanged'] ?? 0)
        && time() - $last <= ADMIN_SESSION_IDLE;

    if (!$valid) {
        adminEndSession();
        $_SESSION['flash'][] = ['type' => 'info', 'code' => 'session_expired'];
        return null;
    }

    $_SESSION['seen'] = time();
    $current = $user;
    return $current;
}

/**
 * Chiave anonima dell'IP per il conteggio dei tentativi (nessun IP in chiaro su disco).
 */
function adminClientKey(): string {
    return substr(hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . __DIR__), 0, 24);
}

function adminLoginThrottled(): bool {
    $key = adminClientKey();
    $data = adminReadStore('throttle');
    $fails = array_filter(
        (array) ($data[$key] ?? []),
        static fn($ts): bool => is_int($ts) && $ts > time() - ADMIN_LOGIN_WINDOW
    );
    return count($fails) >= ADMIN_LOGIN_MAX_FAILS;
}

function adminRecordLoginFailure(): void {
    adminLocked(static function (): void {
        $now = time();
        $data = adminReadStore('throttle');
        foreach ($data as $key => $list) {
            $data[$key] = array_values(array_filter(
                (array) $list,
                static fn($ts): bool => is_int($ts) && $ts > $now - ADMIN_LOGIN_WINDOW
            ));
            if ($data[$key] === []) {
                unset($data[$key]);
            }
        }
        $data[adminClientKey()][] = $now;
        adminWriteStore('throttle', $data);
    });
}

/**
 * Verifica le credenziali e apre la sessione.
 * Torna '' oppure 'throttled' / 'invalid'.
 */
function adminLogin(string $username, string $password): string {
    if (adminLoginThrottled()) {
        return 'throttled';
    }

    $username = strtolower(trim($username));
    $user = adminValidUsername($username) ? adminUser($username) : null;

    // Con un utente inesistente si verifica comunque un hash, così i tempi
    // di risposta non dicono quali nomi utente esistono.
    $hash = $user !== null ? (string) ($user['hash'] ?? '') : '$2y$10$7BDGwZP8QhSFzTHT.XZU3eb7uj9Nz7Pecaav2kipphKCKlktdDsv.';
    $ok = password_verify($password, $hash) && $user !== null && empty($user['disabled']);

    if (!$ok) {
        adminRecordLoginFailure();
        adminLog('login_failed', '', ['username' => adminCleanLine($username, 40)], '');
        return 'invalid';
    }

    $changes = ['lastLogin' => time()];
    if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
        $changes['hash'] = password_hash($password, PASSWORD_DEFAULT);
    }
    adminUpdateUser($username, $changes);

    session_regenerate_id(true);
    $_SESSION['user'] = $username;
    $_SESSION['pv'] = (int) ($user['passwordChanged'] ?? 0);
    $_SESSION['seen'] = time();
    $_SESSION['csrf'] = adminRandomHex();
    adminLog('login', '', [], $username);
    return '';
}

/**
 * Dopo un cambio della propria password la sessione resta valida.
 */
function adminRefreshSessionVersion(string $username): void {
    $user = adminUser($username);
    if ($user !== null) {
        $_SESSION['pv'] = (int) ($user['passwordChanged'] ?? 0);
    }
}

function adminEndSession(): void {
    unset($_SESSION['user'], $_SESSION['pv'], $_SESSION['seen']);
    session_regenerate_id(true);
    $_SESSION['csrf'] = adminRandomHex();
}

function adminCsrfToken(): string {
    if (empty($_SESSION['csrf']) || !is_string($_SESSION['csrf'])) {
        $_SESSION['csrf'] = adminRandomHex();
    }
    return (string) $_SESSION['csrf'];
}

/**
 * Token CSRF della sessione più controllo di stessa origine (lo stesso di
 * save_social_preview.php e setup.php), su ogni richiesta che modifica.
 */
function adminCheckRequest(string $token): bool {
    $expected = (string) ($_SESSION['csrf'] ?? '');
    return $expected !== '' && $token !== '' && hash_equals($expected, $token) && adminSameOrigin();
}

function adminSameOrigin(): bool {
    $originHeader = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
    $serverHost = $_SERVER['HTTP_HOST'] ?? '';
    if ($originHeader === '' || $serverHost === '') {
        return false;
    }
    $requestHost = (string) (parse_url($originHeader, PHP_URL_HOST) ?: '');
    $originPort = parse_url($originHeader, PHP_URL_PORT);
    if ($originPort !== null && $originPort !== false) {
        $requestHost .= ':' . $originPort;
    }
    return strcasecmp($requestHost, $serverHost) === 0
        || strcasecmp($requestHost, (string) preg_replace('/:\d+$/', '', $serverHost)) === 0;
}

/**
 * Permessi: l'editor crea e modifica i modelli; l'amministratore inoltre
 * elimina, ripristina dal cestino e gestisce gli account.
 */
function adminCan(?array $user, string $permission): bool {
    if ($user === null) {
        return false;
    }
    $role = (string) ($user['role'] ?? '');
    switch ($permission) {
        case 'models.edit':
        case 'history.view':
            return in_array($role, ADMIN_ROLES, true);
        case 'models.delete':
        case 'trash.manage':
        case 'users.manage':
            return $role === 'admin';
        default:
            return false;
    }
}

// ============================================================
// STORICO
// ============================================================

/**
 * Aggiunge un evento allo storico: chi (nome utente e nome visualizzato in
 * quel momento), quando, cosa e su quale modello/utente, con il dettaglio
 * dei campi cambiati (valore precedente → nuovo).
 *
 * @param string|null $username null = utente della sessione corrente
 */
function adminLog(string $action, string $target, array $details = [], ?string $username = null): void {
    if ($username === null) {
        $current = adminCurrentUser();
        $username = $current !== null ? (string) $current['username'] : '';
    }
    if (!adminEnsureDir()) {
        return;
    }

    $entry = [
        'ts' => time(),
        'user' => $username,
        'name' => $username !== '' ? adminDisplayName($username) : '',
        'action' => $action,
        'target' => $target,
    ];
    if ($details !== []) {
        $entry['details'] = $details;
    }

    $line = json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($line === false) {
        return;
    }

    $file = adminDataPath('history.php');
    $handle = @fopen($file, 'a');
    if ($handle === false) {
        error_log('3DCaveViewer: impossibile scrivere lo storico del pannello');
        return;
    }
    flock($handle, LOCK_EX);
    clearstatcache(true, $file);
    if ((int) filesize($file) === 0) {
        fwrite($handle, ADMIN_GUARD);
    }
    fwrite($handle, $line . "\n");
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

/**
 * Eventi dello storico, dal più recente, filtrati per modello, utente o azione.
 *
 * @param array{target?: string, user?: string, action?: string} $filter
 * @return array<int, array>
 */
function adminHistory(array $filter = []): array {
    $file = adminDataPath('history.php');
    if (!is_readable($file)) {
        return [];
    }
    $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return [];
    }

    $entries = [];
    for ($i = count($lines) - 1; $i >= 0; $i--) {
        $line = $lines[$i];
        if ($line === '' || $line[0] !== '{') {
            continue;
        }
        $entry = json_decode($line, true);
        if (!is_array($entry)) {
            continue;
        }
        if (($filter['target'] ?? '') !== '' && ($entry['target'] ?? '') !== $filter['target']) {
            continue;
        }
        if (($filter['user'] ?? '') !== '' && ($entry['user'] ?? '') !== $filter['user']) {
            continue;
        }
        if (($filter['action'] ?? '') !== '' && strpos((string) ($entry['action'] ?? ''), $filter['action']) !== 0) {
            continue;
        }
        $entries[] = $entry;
    }
    return $entries;
}

/**
 * Ultima modifica di ciascun modello, per l'elenco: folder => evento.
 *
 * @return array<string, array>
 */
function adminLastChanges(): array {
    $last = [];
    foreach (adminHistory(['action' => 'model.']) as $entry) {
        $target = (string) ($entry['target'] ?? '');
        if ($target !== '' && !isset($last[$target])) {
            $last[$target] = $entry;
        }
    }
    return $last;
}

// ============================================================
// MODELLI
// ============================================================

function adminModelsDir(): string {
    return __DIR__ . '/' . config('paths.modelsFolder', 'modelli');
}

/**
 * Il catalogo si rigenera già da solo quando un JSON è più recente della
 * cache, ma con la risoluzione al secondo di filemtime() una modifica
 * fatta nello stesso secondo della cache passerebbe inosservata.
 */
function adminInvalidateCatalog(): void {
    foreach (['catalogo.cache.json', 'catalogo.cache.hash'] as $name) {
        $file = adminModelsDir() . '/' . $name;
        if (is_file($file)) {
            @unlink($file);
        }
    }
}

/**
 * Cartella proposta per un nuovo modello a partire dal nome:
 * minuscole ASCII, underscore al posto di spazi e punteggiatura.
 */
function adminSuggestFolder(string $name): string {
    $slug = $name;
    if (function_exists('iconv')) {
        $converted = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name);
        if (is_string($converted) && $converted !== '') {
            $slug = $converted;
        }
    }
    $slug = strtolower($slug);
    $slug = (string) preg_replace('/[^a-z0-9]+/', '_', $slug);
    $slug = trim($slug, '_');
    return substr($slug, 0, 64);
}

/**
 * Nome di cartella accettato per un modello nuovo: più stretto di
 * isValidModelFolder(), che accetta anche le cartelle create a mano.
 */
function adminValidNewFolder(string $folder): bool {
    return preg_match('/^[a-z0-9][a-z0-9_-]{0,63}$/', $folder) === 1;
}

/**
 * Metadati di un modello esistente.
 *
 * @return array{meta: array, rev: string, valid: bool, exists: bool}|null null se la cartella non esiste
 */
function adminLoadModel(string $folder): ?array {
    if (!isValidModelFolder($folder)) {
        return null;
    }
    $dir = adminModelsDir() . '/' . $folder;
    if (!is_dir($dir)) {
        return null;
    }
    $file = $dir . '/' . $folder . '.json';
    $raw = is_readable($file) ? @file_get_contents($file) : false;
    $meta = $raw !== false ? json_decode($raw, true) : null;

    return [
        'meta' => is_array($meta) ? $meta : [],
        'rev' => $raw !== false ? sha1($raw) : '',
        'valid' => is_array($meta),
        'exists' => $raw !== false,
    ];
}

/**
 * Nome del file 3D del modello, come lo risolve api/catalogo.php.
 */
function adminModelFileName(string $folder, array $meta): string {
    if (isset($meta['file']) && is_string($meta['file']) && $meta['file'] !== '') {
        return basename($meta['file']);
    }
    if (isset($meta['obj']) && is_string($meta['obj']) && $meta['obj'] !== '') {
        return basename($meta['obj']);
    }
    return $folder . '.glb';
}

/**
 * Elenco per il pannello: anche le cartelle che il catalogo scarta
 * (JSON mancante o rotto, file 3D assente), segnalate invece di nascoste.
 *
 * @return array<int, array>
 */
function adminListModels(): array {
    $base = adminModelsDir();
    if (!is_dir($base)) {
        return [];
    }
    $models = [];
    foreach (new DirectoryIterator($base) as $item) {
        if ($item->isDot() || !$item->isDir()) {
            continue;
        }
        $folder = $item->getFilename();
        if ($folder[0] === '.' || !isValidModelFolder($folder)) {
            continue;
        }
        $loaded = adminLoadModel($folder);
        if ($loaded === null) {
            continue;
        }
        $meta = $loaded['meta'];
        $fileName = adminModelFileName($folder, $meta);
        $filePath = $base . '/' . $folder . '/' . $fileName;
        $hasFile = is_file($filePath);
        $social = $base . '/' . $folder . '/' . $folder . '_social.jpg';

        $problem = '';
        if (!$loaded['exists']) {
            $problem = 'meta_missing';
        } elseif (!$loaded['valid']) {
            $problem = 'meta_invalid';
        } elseif (!isset($meta['name']) || !is_string($meta['name']) || $meta['name'] === '') {
            $problem = 'name_missing';
        } elseif (!$hasFile) {
            $problem = 'file_missing';
        }

        $models[] = [
            'folder' => $folder,
            'name' => is_string($meta['name'] ?? null) ? $meta['name'] : '',
            'lat' => is_numeric($meta['lat'] ?? null) ? (float) $meta['lat'] : null,
            'lon' => is_numeric($meta['lon'] ?? null) ? (float) $meta['lon'] : null,
            'file' => $fileName,
            'size' => $hasFile ? (int) filesize($filePath) : 0,
            'hasSocial' => is_file($social),
            'mtime' => (int) max(@filemtime($base . '/' . $folder . '/' . $folder . '.json') ?: 0, $hasFile ? (int) filemtime($filePath) : 0),
            'problem' => $problem,
            'published' => isModelPublished($meta),
        ];
    }
    usort($models, static function (array $a, array $b): int {
        $nameA = $a['name'] !== '' ? $a['name'] : $a['folder'];
        $nameB = $b['name'] !== '' ? $b['name'] : $b['folder'];
        return strcasecmp($nameA, $nameB);
    });
    return $models;
}

/**
 * Campi del modulo di un modello, con il valore attuale nei metadati.
 *
 * @return array<string, string>
 */
function adminFormValues(array $meta): array {
    $num = static function ($value): string {
        if (!is_numeric($value)) {
            return '';
        }
        $text = rtrim(rtrim(sprintf('%.8F', (float) $value), '0'), '.');
        return $text === '-0' ? '0' : $text;
    };
    $rotation = is_array($meta['rotation'] ?? null) ? $meta['rotation'] : [];
    return [
        'name' => is_string($meta['name'] ?? null) ? $meta['name'] : '',
        'description' => is_string($meta['description'] ?? null) ? $meta['description'] : '',
        'lat' => $num($meta['lat'] ?? null),
        'lon' => $num($meta['lon'] ?? null),
        'rotX' => $num($rotation['x'] ?? null),
        'rotY' => $num($rotation['y'] ?? null),
        'rotZ' => $num($rotation['z'] ?? null),
        'published' => isModelPublished($meta) ? '1' : '0',
    ];
}

/**
 * Legge e valida i campi del modulo.
 *
 * @return array{values: array<string, string>, data: array, errors: array<string, string>}
 *         values = testo da ripresentare, data = valori tipizzati per il JSON
 */
function adminCollectModelFields(array $post): array {
    $values = [
        'name' => adminCleanLine((string) ($post['name'] ?? ''), ADMIN_NAME_MAX),
        'description' => adminCleanText((string) ($post['description'] ?? ''), ADMIN_DESCRIPTION_MAX),
        'lat' => trim((string) ($post['lat'] ?? '')),
        'lon' => trim((string) ($post['lon'] ?? '')),
        'rotX' => trim((string) ($post['rotX'] ?? '')),
        'rotY' => trim((string) ($post['rotY'] ?? '')),
        'rotZ' => trim((string) ($post['rotZ'] ?? '')),
        // Senza la scelta (modulo vecchio, client che non la manda) resta pubblicato
        'published' => ($post['published'] ?? '1') === '0' ? '0' : '1',
    ];
    $errors = [];
    $data = [
        'name' => $values['name'],
        'description' => $values['description'],
        'published' => $values['published'] === '1',
    ];

    if ($values['name'] === '') {
        $errors['name'] = 'required';
    }

    // Il separatore decimale italiano (virgola) è accettato
    $number = static function (string $text, float $min, float $max, string $field) use (&$errors): ?float {
        if ($text === '') {
            return null;
        }
        $text = str_replace(',', '.', $text);
        if (!is_numeric($text) || (float) $text < $min || (float) $text > $max) {
            $errors[$field] = 'range';
            return null;
        }
        return round((float) $text, 8);
    };

    $data['lat'] = $number($values['lat'], -90, 90, 'lat');
    $data['lon'] = $number($values['lon'], -180, 180, 'lon');
    if (($data['lat'] === null) !== ($data['lon'] === null) && !isset($errors['lat']) && !isset($errors['lon'])) {
        $errors[$data['lat'] === null ? 'lat' : 'lon'] = 'pair';
    }
    $data['rotation'] = [
        'x' => $number($values['rotX'], -360, 360, 'rotX') ?? 0.0,
        'y' => $number($values['rotY'], -360, 360, 'rotY') ?? 0.0,
        'z' => $number($values['rotZ'], -360, 360, 'rotZ') ?? 0.0,
    ];

    return ['values' => $values, 'data' => $data, 'errors' => $errors];
}

/**
 * Applica i campi validati ai metadati esistenti. Le chiavi che il
 * pannello non gestisce (obj, mtl, campi aggiunti a mano) restano com'erano.
 */
function adminApplyModelFields(array $meta, array $data, string $folder): array {
    $meta['name'] = $data['name'];
    $meta['folder'] = $folder;
    if ($data['description'] !== '') {
        $meta['description'] = $data['description'];
    } else {
        unset($meta['description']);
    }
    $meta['lat'] = $data['lat'];
    $meta['lon'] = $data['lon'];
    // Pubblicato = nessuna chiave (come i JSON scritti a mano), bozza = false
    if ($data['published']) {
        unset($meta['published']);
    } else {
        $meta['published'] = false;
    }

    $rotation = $data['rotation'];
    $isZero = $rotation['x'] == 0 && $rotation['y'] == 0 && $rotation['z'] == 0;
    if ($isZero && !isset($meta['rotation'])) {
        // nessuna rotazione prima, nessuna adesso: il JSON resta pulito
    } else {
        $meta['rotation'] = $rotation;
    }
    return $meta;
}

/**
 * Campi cambiati fra due versioni dei metadati: chiave => [prima, dopo].
 */
function adminDiffMeta(array $old, array $new): array {
    $changes = [];
    $keys = array_unique(array_merge(array_keys($old), array_keys($new)));
    foreach ($keys as $key) {
        if ($key === 'folder') {
            continue;
        }
        if ($key === 'published') {
            // Chiave assente = pubblicato: conta solo lo stato
            if (isModelPublished($old) !== isModelPublished($new)) {
                $changes['published'] = [isModelPublished($old), isModelPublished($new)];
            }
            continue;
        }
        $before = $old[$key] ?? null;
        $after = $new[$key] ?? null;
        if (is_array($before) || is_array($after)) {
            $same = json_encode($before) === json_encode($after);
            // {x:0,y:0,z:0} e una rotazione assente sono la stessa cosa
            if (!$same && $key === 'rotation') {
                $zero = static fn($r): bool => $r === null
                    || (is_array($r) && (float) ($r['x'] ?? 0) == 0 && (float) ($r['y'] ?? 0) == 0 && (float) ($r['z'] ?? 0) == 0);
                $same = $zero($before) && $zero($after)
                    || (is_array($before) && is_array($after)
                        && (float) ($before['x'] ?? 0) == (float) ($after['x'] ?? 0)
                        && (float) ($before['y'] ?? 0) == (float) ($after['y'] ?? 0)
                        && (float) ($before['z'] ?? 0) == (float) ($after['z'] ?? 0));
            }
        } elseif (is_numeric($before) && is_numeric($after)) {
            $same = (float) $before == (float) $after;
        } else {
            $same = $before === $after;
        }
        if (!$same) {
            $changes[$key] = [$before, $after];
        }
    }
    return $changes;
}

/**
 * Scrive il JSON dei metadati (atomico) e invalida la cache del catalogo.
 */
function adminSaveModelMeta(string $folder, array $meta): bool {
    $json = json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }
    $ok = adminAtomicWrite(adminModelsDir() . '/' . $folder . '/' . $folder . '.json', $json . "\n");
    if ($ok) {
        // Bozza: file chiusi al web subito, senza aspettare il catalogo
        syncDraftProtection(adminModelsDir() . '/' . $folder, !isModelPublished($meta));
        adminInvalidateCatalog();
    }
    return $ok;
}

// ============================================================
// CARICAMENTO DEI FILE 3D (A BLOCCHI)
// ============================================================
// Un GLB da 100 MB supera di molto upload_max_filesize/post_max_size di
// qualunque hosting condiviso. Il browser lo manda quindi a blocchi
// (api/admin_upload.php) che si accodano in custom/admin/uploads/<id>.part;
// il modulo del modello, al salvataggio, porta solo l'id del caricamento.

/**
 * Converte "8M", "1G", "512K" in byte (0 = illimitato).
 */
function adminIniBytes(string $value): int {
    $value = trim($value);
    if ($value === '') {
        return 0;
    }
    $unit = strtolower(substr($value, -1));
    $number = (int) $value;
    switch ($unit) {
        case 'g':
            return $number * 1024 * 1024 * 1024;
        case 'm':
            return $number * 1024 * 1024;
        case 'k':
            return $number * 1024;
        default:
            return $number;
    }
}

/**
 * Dimensione di un blocco: sotto post_max_size con un margine, fra 256 KB
 * e 8 MB. Il browser la dimezza da solo se un proxy rifiuta la richiesta.
 */
function adminChunkSize(): int {
    $limit = adminIniBytes((string) ini_get('post_max_size'));
    $size = $limit > 0 ? $limit - 128 * 1024 : 8 * 1024 * 1024;
    return max(256 * 1024, min(8 * 1024 * 1024, $size));
}

/**
 * Il più grande file accettato senza JavaScript (caricamento classico).
 */
function adminDirectUploadLimit(): int {
    $limits = array_filter([
        adminIniBytes((string) ini_get('upload_max_filesize')),
        adminIniBytes((string) ini_get('post_max_size')),
    ]);
    return $limits === [] ? 0 : min($limits);
}

function adminValidUploadId(string $id): bool {
    return preg_match('/^[a-f0-9]{32}$/', $id) === 1;
}

/**
 * Elimina i caricamenti abbandonati da più di ADMIN_UPLOAD_TTL.
 */
function adminCleanupUploads(): void {
    $dir = adminDataPath('uploads');
    if (!is_dir($dir)) {
        return;
    }
    foreach ((array) @glob($dir . '/*') as $file) {
        if (!is_string($file) || basename($file) === 'index.html') {
            continue;
        }
        if ((int) @filemtime($file) < time() - ADMIN_UPLOAD_TTL) {
            @unlink($file);
        }
    }
}

/**
 * Apre un caricamento a blocchi.
 *
 * @return array{ok: bool, error: string, id: string}
 */
function adminUploadStart(string $username, string $filename, int $size): array {
    $ext = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));
    if (!in_array($ext, ADMIN_MODEL_EXTENSIONS, true)) {
        return ['ok' => false, 'error' => 'model_bad_type', 'id' => ''];
    }
    if ($size <= 12) {
        return ['ok' => false, 'error' => 'model_invalid', 'id' => ''];
    }
    if ($size > ADMIN_MAX_MODEL_BYTES) {
        return ['ok' => false, 'error' => 'model_too_large', 'id' => ''];
    }
    if (!adminEnsureDir('uploads')) {
        return ['ok' => false, 'error' => 'not_writable', 'id' => ''];
    }
    adminCleanupUploads();

    $free = @disk_free_space(adminDataPath('uploads'));
    if ($free !== false && $free < $size * 1.05 + 50 * 1024 * 1024) {
        return ['ok' => false, 'error' => 'disk_full', 'id' => ''];
    }

    $id = adminRandomHex();
    if ($id === '') {
        return ['ok' => false, 'error' => 'write_failed', 'id' => ''];
    }
    $meta = [
        'user' => $username,
        'name' => adminCleanLine(basename($filename), 200),
        'ext' => $ext,
        'size' => $size,
        'created' => time(),
    ];
    if (!adminWriteStore('uploads/' . $id, $meta) || @file_put_contents(adminDataPath('uploads/' . $id . '.part'), '') === false) {
        return ['ok' => false, 'error' => 'write_failed', 'id' => ''];
    }
    return ['ok' => true, 'error' => '', 'id' => $id];
}

/**
 * Accoda un blocco (corpo grezzo della richiesta) a un caricamento.
 * L'offset deve coincidere con quanto già ricevuto: se no si risponde con
 * la dimensione attuale e il browser riprende da lì (blocco ripetuto dopo
 * un timeout, per esempio).
 *
 * @return array{ok: bool, error: string, received: int, size: int}
 */
function adminUploadChunk(string $username, string $id, int $offset): array {
    $fail = static fn(string $error, int $received = 0): array => ['ok' => false, 'error' => $error, 'received' => $received, 'size' => 0];
    if (!adminValidUploadId($id)) {
        return $fail('upload_missing');
    }
    $meta = adminReadStore('uploads/' . $id);
    $part = adminDataPath('uploads/' . $id . '.part');
    if ($meta === [] || ($meta['user'] ?? '') !== $username || !is_file($part)) {
        return $fail('upload_missing');
    }
    $size = (int) $meta['size'];

    $handle = @fopen($part, 'r+b');
    if ($handle === false) {
        return $fail('write_failed');
    }
    flock($handle, LOCK_EX);
    clearstatcache(true, $part);
    $received = (int) filesize($part);

    if ($offset !== $received) {
        flock($handle, LOCK_UN);
        fclose($handle);
        return ['ok' => false, 'error' => 'offset_mismatch', 'received' => $received, 'size' => $size];
    }

    $input = @fopen('php://input', 'rb');
    if ($input === false) {
        flock($handle, LOCK_UN);
        fclose($handle);
        return $fail('write_failed', $received);
    }
    fseek($handle, $received);
    // Mai oltre la dimensione dichiarata né oltre un blocco
    $max = min($size - $received, adminChunkSize() + 1024 * 1024);
    $written = stream_copy_to_stream($input, $handle, $max);
    fclose($input);
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    if ($written === false) {
        return $fail('write_failed', $received);
    }
    @touch(adminDataPath('uploads/' . $id . '.php'));
    return ['ok' => true, 'error' => '', 'received' => $received + (int) $written, 'size' => $size];
}

/**
 * Annulla un caricamento.
 */
function adminUploadDiscard(string $id): void {
    if (adminValidUploadId($id)) {
        @unlink(adminDataPath('uploads/' . $id . '.part'));
        @unlink(adminDataPath('uploads/' . $id . '.php'));
    }
}

/**
 * Controlla che il file sia davvero un modello che il viewer sa aprire.
 * GLB: intestazione "glTF", versione 2 e lunghezza dichiarata uguale a
 * quella del file. GLTF: JSON con asset.version 2 e senza riferimenti a
 * file esterni (.bin, texture), che il pannello non carica: va usato il GLB.
 *
 * @return string '' se valido, altrimenti il codice d'errore
 */
function adminValidateModelFile(string $path, string $ext): string {
    $size = (int) @filesize($path);
    if ($ext === 'glb') {
        $handle = @fopen($path, 'rb');
        $header = $handle !== false ? (string) fread($handle, 12) : '';
        if ($handle !== false) {
            fclose($handle);
        }
        if (strlen($header) !== 12 || substr($header, 0, 4) !== 'glTF') {
            return 'model_invalid';
        }
        $fields = unpack('Vversion/Vlength', substr($header, 4, 8));
        if (!is_array($fields) || (int) $fields['version'] !== 2) {
            return 'model_version';
        }
        if ((int) $fields['length'] !== $size) {
            return 'model_truncated';
        }
        return '';
    }

    if ($ext === 'gltf') {
        if ($size > 256 * 1024 * 1024) {
            return 'model_too_large';
        }
        $json = json_decode((string) @file_get_contents($path), true);
        if (!is_array($json) || !isset($json['asset']['version']) || strpos((string) $json['asset']['version'], '2') !== 0) {
            return 'model_invalid';
        }
        foreach (['buffers', 'images'] as $section) {
            foreach ((array) ($json[$section] ?? []) as $item) {
                $uri = is_array($item) ? (string) ($item['uri'] ?? '') : '';
                if ($uri !== '' && strpos($uri, 'data:') !== 0) {
                    return 'model_external';
                }
            }
        }
        return '';
    }

    return 'model_bad_type';
}

/**
 * Prende in carico un file 3D pronto: caricamento a blocchi completato
 * (id) oppure file classico da $_FILES. Il file torna già validato.
 *
 * @return array{ok: bool, error: string, path: string, ext: string, size: int, original: string, cleanup: callable|null}
 */
function adminTakeModelUpload(string $username, string $uploadId, array $file): array {
    $none = ['ok' => true, 'error' => '', 'path' => '', 'ext' => '', 'size' => 0, 'original' => '', 'cleanup' => null];
    $fail = static fn(string $error): array => ['ok' => false, 'error' => $error, 'path' => '', 'ext' => '', 'size' => 0, 'original' => '', 'cleanup' => null];

    if ($uploadId !== '') {
        if (!adminValidUploadId($uploadId)) {
            return $fail('upload_missing');
        }
        $meta = adminReadStore('uploads/' . $uploadId);
        $part = adminDataPath('uploads/' . $uploadId . '.part');
        if ($meta === [] || ($meta['user'] ?? '') !== $username || !is_file($part)) {
            return $fail('upload_missing');
        }
        clearstatcache(true, $part);
        if ((int) filesize($part) !== (int) $meta['size']) {
            return $fail('upload_incomplete');
        }
        $ext = (string) $meta['ext'];
        $error = adminValidateModelFile($part, $ext);
        if ($error !== '') {
            adminUploadDiscard($uploadId);
            return $fail($error);
        }
        return [
            'ok' => true, 'error' => '', 'path' => $part, 'ext' => $ext,
            'size' => (int) $meta['size'], 'original' => (string) ($meta['name'] ?? ''),
            'cleanup' => static function () use ($uploadId): void { adminUploadDiscard($uploadId); },
        ];
    }

    $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error === UPLOAD_ERR_NO_FILE) {
        return $none;
    }
    if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
        return $fail('model_too_large_direct');
    }
    $tmp = (string) ($file['tmp_name'] ?? '');
    if ($error !== UPLOAD_ERR_OK || $tmp === '' || !is_uploaded_file($tmp)) {
        return $fail('upload_failed');
    }
    $original = basename((string) ($file['name'] ?? ''));
    $ext = strtolower((string) pathinfo($original, PATHINFO_EXTENSION));
    if (!in_array($ext, ADMIN_MODEL_EXTENSIONS, true)) {
        return $fail('model_bad_type');
    }
    $error = adminValidateModelFile($tmp, $ext);
    if ($error !== '') {
        return $fail($error);
    }
    return [
        'ok' => true, 'error' => '', 'path' => $tmp, 'ext' => $ext,
        'size' => (int) filesize($tmp), 'original' => adminCleanLine($original, 200), 'cleanup' => null,
    ];
}

/**
 * Sposta il file 3D nella cartella del modello e restituisce il nome usato.
 *
 * Il primo file di un modello si chiama <cartella>.<ext>, come da
 * convenzione. Una sostituzione riceve invece un nome nuovo
 * (<cartella>_<data>.<ext>): .htaccess serve i GLB come "immutable" per sei
 * mesi e il service worker li tiene cache-first per URL, quindi un file
 * nuovo con lo stesso nome non arriverebbe mai a chi ha già visto il vecchio.
 *
 * @return string '' se lo spostamento fallisce
 */
function adminInstallModelFile(array $upload, string $folder, bool $replacing): string {
    $dir = adminModelsDir() . '/' . $folder;
    $name = $folder . '.' . $upload['ext'];
    if ($replacing || is_file($dir . '/' . $name)) {
        $stamp = date('Ymd_His');
        $name = $folder . '_' . $stamp . '.' . $upload['ext'];
        $n = 2;
        while (is_file($dir . '/' . $name)) {
            $name = $folder . '_' . $stamp . '_' . $n++ . '.' . $upload['ext'];
        }
    }
    $dest = $dir . '/' . $name;
    $moved = is_uploaded_file($upload['path'])
        ? @move_uploaded_file($upload['path'], $dest)
        : @rename($upload['path'], $dest);
    if (!$moved) {
        return '';
    }
    @chmod($dest, 0644);
    if (is_callable($upload['cleanup'])) {
        ($upload['cleanup'])();
    }
    return $name;
}

// ============================================================
// ANTEPRIMA SOCIAL
// ============================================================

/**
 * Salva l'anteprima social caricata come <cartella>_social.jpg, con la
 * stessa catena di save_social_preview.php: limite di dimensione, MIME con
 * finfo, ri-codifica GD (niente payload nascosti nel file scritto).
 *
 * @return string '' se salvata o se non è stato caricato nulla, altrimenti il codice d'errore
 */
function adminSaveSocialImage(array $file, string $folder): string {
    $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error === UPLOAD_ERR_NO_FILE) {
        return '';
    }
    if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
        return 'image_too_large';
    }
    $tmp = (string) ($file['tmp_name'] ?? '');
    if ($error !== UPLOAD_ERR_OK || $tmp === '' || !is_uploaded_file($tmp)) {
        return 'upload_failed';
    }
    if ((int) filesize($tmp) > ADMIN_MAX_SOCIAL_BYTES) {
        return 'image_too_large';
    }
    if (!extension_loaded('gd')) {
        return 'no_gd';
    }
    if (class_exists('finfo')) {
        $mime = (string) (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            return 'image_bad_format';
        }
    }
    $info = @getimagesize($tmp);
    if ($info === false || $info[0] < 1 || $info[1] < 1 || $info[0] > ADMIN_MAX_SOCIAL_SIDE || $info[1] > ADMIN_MAX_SOCIAL_SIDE) {
        return 'image_bad_format';
    }
    $data = @file_get_contents($tmp);
    $image = $data === false ? false : @imagecreatefromstring($data);
    if ($image === false) {
        return 'image_bad_format';
    }

    $width = imagesx($image);
    $height = imagesy($image);
    if ($width > ADMIN_SOCIAL_MAX_WIDTH) {
        $newHeight = (int) round($height * ADMIN_SOCIAL_MAX_WIDTH / $width);
        $resized = imagecreatetruecolor(ADMIN_SOCIAL_MAX_WIDTH, max(1, $newHeight));
        imagecopyresampled($resized, $image, 0, 0, 0, 0, ADMIN_SOCIAL_MAX_WIDTH, max(1, $newHeight), $width, $height);
        imagedestroy($image);
        $image = $resized;
    } else {
        // Le trasparenze di un PNG diventano nere in JPEG: si appoggia su fondo scuro
        $flat = imagecreatetruecolor($width, $height);
        imagefill($flat, 0, 0, imagecolorallocate($flat, 11, 13, 16));
        imagecopy($flat, $image, 0, 0, 0, 0, $width, $height);
        imagedestroy($image);
        $image = $flat;
    }

    $dest = adminModelsDir() . '/' . $folder . '/' . $folder . '_social.jpg';
    $tmpDest = $dest . '.tmp.' . getmypid();
    $ok = imagejpeg($image, $tmpDest, 88) && @rename($tmpDest, $dest);
    imagedestroy($image);
    if (!$ok) {
        @unlink($tmpDest);
        return 'write_failed';
    }
    return '';
}

// ============================================================
// CESTINO
// ============================================================
// Nulla viene cancellato subito: un modello eliminato e il file 3D che una
// sostituzione rimpiazza finiscono in custom/admin/trash/<id>/, con le
// informazioni in trash/<id>.php. Da lì un amministratore li ripristina (per
// un file: torna a essere il modello attivo, cioè un ritorno alla versione
// precedente) o li elimina definitivamente.

function adminValidTrashId(string $id): bool {
    return preg_match('/^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$/', $id) === 1;
}

function adminNewTrashId(): string {
    return date('Ymd-His') . '-' . adminRandomHex(4);
}

/**
 * Sposta un intero modello nel cestino.
 *
 * @return string id dell'elemento nel cestino, '' se non riuscito
 */
function adminTrashModel(string $folder, string $username): string {
    $source = adminModelsDir() . '/' . $folder;
    if (!is_dir($source) || !adminEnsureDir('trash')) {
        return '';
    }
    $loaded = adminLoadModel($folder);
    $id = adminNewTrashId();
    if (!@rename($source, adminDataPath('trash/' . $id))) {
        return '';
    }
    adminWriteStore('trash/' . $id, [
        'type' => 'model',
        'folder' => $folder,
        'name' => is_string($loaded['meta']['name'] ?? null) ? $loaded['meta']['name'] : $folder,
        'deletedBy' => $username,
        'deleted' => time(),
        'size' => adminTreeSize(adminDataPath('trash/' . $id)),
    ]);
    adminInvalidateCatalog();
    return $id;
}

/**
 * Sposta nel cestino un singolo file di un modello (versione sostituita).
 *
 * @return string id, '' se non riuscito
 */
function adminTrashFile(string $folder, string $fileName, string $username): string {
    $source = adminModelsDir() . '/' . $folder . '/' . $fileName;
    if (!is_file($source) || !adminEnsureDir('trash')) {
        return '';
    }
    $id = adminNewTrashId();
    $dir = adminDataPath('trash/' . $id);
    if (!@mkdir($dir, 0775) || !@rename($source, $dir . '/' . $fileName)) {
        @rmdir($dir);
        return '';
    }
    adminWriteStore('trash/' . $id, [
        'type' => 'file',
        'folder' => $folder,
        'file' => $fileName,
        'deletedBy' => $username,
        'deleted' => time(),
        'size' => (int) filesize($dir . '/' . $fileName),
    ]);
    return $id;
}

/**
 * @return array<int, array> elementi del cestino, dal più recente
 */
function adminTrashList(): array {
    $dir = adminDataPath('trash');
    if (!is_dir($dir)) {
        return [];
    }
    $items = [];
    foreach ((array) @glob($dir . '/*.php') as $file) {
        $id = basename((string) $file, '.php');
        if (!adminValidTrashId($id) || !is_dir($dir . '/' . $id)) {
            continue;
        }
        $info = adminReadStore('trash/' . $id);
        if ($info === []) {
            continue;
        }
        $items[] = $info + ['id' => $id];
    }
    usort($items, static fn(array $a, array $b): int => strcmp($b['id'], $a['id']));
    return $items;
}

function adminTrashItem(string $id): ?array {
    if (!adminValidTrashId($id) || !is_dir(adminDataPath('trash/' . $id))) {
        return null;
    }
    $info = adminReadStore('trash/' . $id);
    return $info === [] ? null : $info + ['id' => $id];
}

/**
 * Ripristina un elemento del cestino.
 *
 * Modello: torna nella sua cartella, se nel frattempo non ne è stata creata
 * un'altra con lo stesso nome. File: torna nella cartella del modello e
 * diventa il file attivo; quello che lo aveva sostituito va nel cestino al
 * suo posto, così anche il ripristino si può annullare.
 *
 * @return array{ok: bool, error: string, item: array|null}
 */
function adminTrashRestore(string $id, string $username): array {
    $item = adminTrashItem($id);
    if ($item === null) {
        return ['ok' => false, 'error' => 'trash_missing', 'item' => null];
    }
    $folder = (string) ($item['folder'] ?? '');
    if (!isValidModelFolder($folder)) {
        return ['ok' => false, 'error' => 'trash_missing', 'item' => $item];
    }
    $source = adminDataPath('trash/' . $id);
    $target = adminModelsDir() . '/' . $folder;

    if (($item['type'] ?? '') === 'model') {
        if (file_exists($target)) {
            return ['ok' => false, 'error' => 'folder_exists', 'item' => $item];
        }
        if (!@rename($source, $target)) {
            return ['ok' => false, 'error' => 'write_failed', 'item' => $item];
        }
        @unlink($source . '.php');
        $restored = adminLoadModel($folder);
        if ($restored !== null && $restored['valid']) {
            syncDraftProtection($target, !isModelPublished($restored['meta']));
        }
        adminInvalidateCatalog();
        return ['ok' => true, 'error' => '', 'item' => $item];
    }

    $fileName = basename((string) ($item['file'] ?? ''));
    $loaded = adminLoadModel($folder);
    if ($loaded === null || !$loaded['valid'] || $fileName === '' || !is_file($source . '/' . $fileName)) {
        return ['ok' => false, 'error' => 'model_gone', 'item' => $item];
    }
    if (file_exists($target . '/' . $fileName)) {
        return ['ok' => false, 'error' => 'file_exists', 'item' => $item];
    }
    if (!@rename($source . '/' . $fileName, $target . '/' . $fileName)) {
        return ['ok' => false, 'error' => 'write_failed', 'item' => $item];
    }
    @rmdir($source);
    @unlink($source . '.php');

    $meta = $loaded['meta'];
    $current = adminModelFileName($folder, $meta);
    $meta['file'] = $fileName;
    if (!adminSaveModelMeta($folder, $meta)) {
        @rename($target . '/' . $fileName, $source . '/' . $fileName);
        return ['ok' => false, 'error' => 'write_failed', 'item' => $item];
    }
    if ($current !== $fileName && is_file($target . '/' . $current)) {
        adminTrashFile($folder, $current, $username);
    }
    $item['replaced'] = $current;
    return ['ok' => true, 'error' => '', 'item' => $item];
}

/**
 * Elimina definitivamente un elemento del cestino.
 */
function adminTrashPurge(string $id): bool {
    if (adminTrashItem($id) === null) {
        return false;
    }
    adminRemoveTree(adminDataPath('trash/' . $id));
    @unlink(adminDataPath('trash/' . $id . '.php'));
    return !is_dir(adminDataPath('trash/' . $id));
}

function adminRemoveTree(string $dir): void {
    if (!is_dir($dir) || is_link($dir)) {
        @unlink($dir);
        return;
    }
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($items as $item) {
        if ($item->isDir() && !$item->isLink()) {
            @rmdir($item->getPathname());
        } else {
            @unlink($item->getPathname());
        }
    }
    @rmdir($dir);
}

function adminTreeSize(string $dir): int {
    if (!is_dir($dir)) {
        return 0;
    }
    $size = 0;
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) as $item) {
        if ($item->isFile()) {
            $size += (int) $item->getSize();
        }
    }
    return $size;
}

/**
 * Dimensione leggibile (1.5 MB).
 */
function adminFormatBytes(int $bytes): string {
    if ($bytes < 1024) {
        return $bytes . ' B';
    }
    $units = ['KB', 'MB', 'GB', 'TB'];
    $value = $bytes / 1024;
    $i = 0;
    while ($value >= 1024 && $i < count($units) - 1) {
        $value /= 1024;
        $i++;
    }
    return number_format($value, $value >= 100 ? 0 : 1, ',', '.') . ' ' . $units[$i];
}
