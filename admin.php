<?php
declare(strict_types=1);

/*
  3D Cave Viewer - Pannello di amministrazione
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

// Pagine (?p=): models (default), edit (&m=cartella), new, history,
// stats (&r=intervallo, &m=cartella, &export=csv), trash, users, account. Ogni modifica arriva in POST con "action", token
// CSRF di sessione e controllo di origine; dopo un salvataggio riuscito si
// torna in GET (Post/Redirect/Get) con un messaggio flash.

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/i18n/loader.php';
require_once __DIR__ . '/admin_lib.php';
require_once __DIR__ . '/stats_lib.php';

redirectToSetupIfNeeded();

$lang = getCurrentLang();

// Import map dell'anteprima 3D (scheda Orientamento): è uno <script> in
// linea, ammesso dalla CSP solo con il suo hash. Draco e KTX2 decodificano in
// WebAssembly dentro worker creati da blob:, e GLTFLoader legge le texture
// incorporate da URL blob:.
const ADMIN_IMPORT_MAP = '{"imports":{"three":"./lib/three/build/three.module.js","three/addons/":"./lib/three/examples/jsm/"}}';
$adminImportMapHash = "'sha256-" . base64_encode(hash('sha256', ADMIN_IMPORT_MAP, true)) . "'";
sendSecurityHeaders("default-src 'self'; script-src 'self' $adminImportMapHash 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' blob: data:; worker-src 'self' blob:; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none';");
header('Cache-Control: no-store, private');
header('X-Robots-Tag: noindex, nofollow');

adminStartSession(dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/admin.php')));

// ------------------------------------------------------------
// Testi e messaggi
// ------------------------------------------------------------

/**
 * Testo tradotto del pannello (chiavi "admin.*" in i18n/[lang].json).
 */
function at(string $key, string $fallback, array $params = []): string {
    $text = __t('admin.' . $key, $fallback);
    foreach ($params as $name => $value) {
        $text = str_replace('{' . $name . '}', (string) $value, $text);
    }
    return $text;
}

/**
 * Messaggio leggibile per un codice d'errore o di esito.
 */
function adminMessage(string $code, array $params = []): string {
    $messages = [
        // esiti
        'saved' => at('msg.saved', 'Modifiche salvate.'),
        'published' => at('msg.published', '«{name}» è pubblicato: ora è visibile sul sito.'),
        'unpublished' => at('msg.unpublished', '«{name}» è tornato in bozza: non è più visibile sul sito.'),
        'created' => at('msg.created', 'Modello «{name}» creato.'),
        'nothing_changed' => at('msg.nothingChanged', 'Nessuna modifica da salvare.'),
        'deleted' => at('msg.deleted', 'Modello «{name}» spostato nel cestino.'),
        'restored' => at('msg.restored', 'Ripristino completato.'),
        'purged' => at('msg.purged', 'Elemento eliminato definitivamente.'),
        'user_created' => at('msg.userCreated', 'Utente «{name}» creato.'),
        'user_updated' => at('msg.userUpdated', 'Utente aggiornato.'),
        'user_deleted' => at('msg.userDeleted', 'Utente eliminato.'),
        'password_changed' => at('msg.passwordChanged', 'Password cambiata.'),
        'account_saved' => at('msg.accountSaved', 'Profilo aggiornato.'),
        'logged_out' => at('msg.loggedOut', 'Sei uscito dal pannello.'),
        'session_expired' => at('msg.sessionExpired', 'La sessione è scaduta: accedi di nuovo.'),
        'welcome' => at('msg.welcome', 'Account amministratore creato. Benvenuto!'),
        // errori
        'csrf' => at('err.csrf', 'Richiesta non valida o scaduta: ricarica la pagina e riprova.'),
        'forbidden' => at('err.forbidden', 'Non hai i permessi per questa operazione.'),
        'invalid' => at('err.invalidLogin', 'Nome utente o password non corretti.'),
        'throttled' => at('err.throttled', 'Troppi tentativi falliti: riprova fra qualche minuto.'),
        'install_key' => at('err.installKey', 'Chiave di configurazione non corretta.'),
        'no_install_key' => at('err.noInstallKey', 'Questa installazione non ha una chiave di configurazione (custom/.installed): riapri l\'installazione guidata per generarne una.'),
        'not_writable' => at('err.notWritable', 'La cartella custom/ non è scrivibile dal server: il pannello non può salvare i propri dati.'),
        'models_not_writable' => at('err.modelsNotWritable', 'La cartella dei modelli non è scrivibile dal server.'),
        'write_failed' => at('err.writeFailed', 'Scrittura su disco non riuscita.'),
        'conflict' => at('err.conflict', 'Il modello è stato modificato da {name} mentre lo stavi modificando. Ricontrolla i valori qui sotto e salva di nuovo.'),
        'model_missing' => at('err.modelMissing', 'Modello non trovato.'),
        'folder_invalid' => at('err.folderInvalid', 'Nome della cartella non valido: usa lettere minuscole, numeri, _ e - (max 64).'),
        'folder_exists' => at('err.folderExists', 'Esiste già una cartella con questo nome.'),
        'model_required' => at('err.modelRequired', 'Carica il file 3D del modello (GLB).'),
        'model_bad_type' => at('err.modelBadType', 'Formato non supportato: carica un file .glb (o .gltf autocontenuto).'),
        'model_invalid' => at('err.modelInvalid', 'Il file non è un modello glTF valido.'),
        'model_version' => at('err.modelVersion', 'Il file è in glTF 1.0: serve glTF 2.0.'),
        'model_truncated' => at('err.modelTruncated', 'Il file GLB è incompleto o danneggiato (dimensione diversa da quella dichiarata).'),
        'model_external' => at('err.modelExternal', 'Il file .gltf fa riferimento a file esterni (.bin, texture): esportalo come GLB.'),
        'model_too_large' => at('err.modelTooLarge', 'Il file è troppo grande.'),
        'model_too_large_direct' => at('err.modelTooLargeDirect', 'Il file supera il limite di caricamento del server: abilita JavaScript per il caricamento a blocchi.'),
        'upload_missing' => at('err.uploadMissing', 'Il caricamento del file non è più disponibile: selezionalo di nuovo.'),
        'upload_incomplete' => at('err.uploadIncomplete', 'Il caricamento del file non è completo: selezionalo di nuovo.'),
        'upload_failed' => at('err.uploadFailed', 'Caricamento non riuscito.'),
        'disk_full' => at('err.diskFull', 'Spazio su disco insufficiente sul server.'),
        'image_too_large' => at('err.imageTooLarge', 'L\'immagine è troppo grande (max 10 MB).'),
        'image_bad_format' => at('err.imageBadFormat', 'Immagine non valida: usa JPEG, PNG o WebP.'),
        'no_gd' => at('err.noGd', 'L\'estensione GD di PHP non è disponibile: impossibile elaborare l\'immagine.'),
        'confirm_mismatch' => at('err.confirmMismatch', 'Per confermare scrivi esattamente il nome della cartella.'),
        'trash_missing' => at('err.trashMissing', 'Elemento non trovato nel cestino.'),
        'model_gone' => at('err.modelGone', 'Il modello a cui apparteneva il file non esiste più: ripristina prima il modello.'),
        'file_exists' => at('err.fileExists', 'Nella cartella del modello esiste già un file con lo stesso nome.'),
        'username_invalid' => at('err.usernameInvalid', 'Nome utente non valido: 3-32 caratteri fra minuscole, numeri, punto, - e _.'),
        'username_taken' => at('err.usernameTaken', 'Nome utente già in uso.'),
        'role_invalid' => at('err.roleInvalid', 'Ruolo non valido.'),
        'password_short' => at('err.passwordShort', 'La password deve avere almeno {min} caratteri.', ['min' => ADMIN_PASSWORD_MIN]),
        'password_long' => at('err.passwordLong', 'Password troppo lunga.'),
        'password_mismatch' => at('err.passwordMismatch', 'Le due password non coincidono.'),
        'password_wrong' => at('err.passwordWrong', 'La password attuale non è corretta.'),
        'user_missing' => at('err.userMissing', 'Utente non trovato.'),
        'last_admin' => at('err.lastAdmin', 'Deve restare almeno un amministratore attivo.'),
        'self' => at('err.self', 'Non puoi farlo sul tuo stesso account.'),
        'fields' => at('err.fields', 'Controlla i campi evidenziati.'),
    ];
    $text = $messages[$code] ?? at('err.generic', 'Operazione non riuscita ({code}).', ['code' => $code]);
    foreach ($params as $name => $value) {
        $text = str_replace('{' . $name . '}', (string) $value, $text);
    }
    return $text;
}

function adminFlash(string $type, string $code, array $params = []): void {
    $_SESSION['flash'][] = ['type' => $type, 'code' => $code, 'params' => $params];
}

/**
 * Torna in GET su una pagina del pannello.
 */
function adminRedirect(array $query = []): void {
    $url = 'admin.php' . ($query !== [] ? '?' . http_build_query($query) : '');
    header('Location: ' . $url, true, 303);
    exit;
}

/**
 * Etichetta di un campo dei metadati (storico e messaggi).
 */
function adminFieldLabel(string $field): string {
    $labels = [
        'name' => at('field.name', 'Nome'),
        'description' => at('field.description', 'Descrizione'),
        'lat' => at('field.lat', 'Latitudine'),
        'lon' => at('field.lon', 'Longitudine'),
        'rotation' => at('field.rotation', 'Rotazione'),
        'file' => at('field.file', 'File 3D'),
        'rotX' => at('field.rotX', 'Rotazione X'),
        'rotY' => at('field.rotY', 'Rotazione Y'),
        'rotZ' => at('field.rotZ', 'Rotazione Z'),
        'folder' => at('field.folder', 'Cartella'),
        'published' => at('field.published', 'Visibilità'),
    ];
    return $labels[$field] ?? $field;
}

/**
 * Valore dei metadati in forma leggibile per lo storico.
 */
function adminFormatValue($value): string {
    if ($value === null || $value === '') {
        return '—';
    }
    if (is_bool($value)) {
        return $value ? at('common.yes', 'sì') : at('common.no', 'no');
    }
    if (is_array($value)) {
        if (isset($value['x']) || isset($value['y']) || isset($value['z'])) {
            return sprintf('X %s° · Y %s° · Z %s°', (string) ($value['x'] ?? 0), (string) ($value['y'] ?? 0), (string) ($value['z'] ?? 0));
        }
        return (string) json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    $text = (string) $value;
    $short = function_exists('mb_strimwidth') ? mb_strimwidth($text, 0, 160, '…', 'UTF-8') : substr($text, 0, 160);
    return $short;
}

function adminActionLabel(string $action): string {
    $labels = [
        'login' => at('action.login', 'Accesso'),
        'login_failed' => at('action.loginFailed', 'Accesso fallito'),
        'logout' => at('action.logout', 'Uscita'),
        'admin.bootstrap' => at('action.bootstrap', 'Primo amministratore creato'),
        'admin.setup' => at('action.setupAdmin', 'Primo amministratore creato (installazione guidata)'),
        'model.create' => at('action.modelCreate', 'Modello creato'),
        'model.update' => at('action.modelUpdate', 'Informazioni modificate'),
        'model.file' => at('action.modelFile', 'File 3D sostituito'),
        'model.social' => at('action.modelSocial', 'Anteprima social caricata'),
        'model.social_delete' => at('action.modelSocialDelete', 'Anteprima social eliminata'),
        'model.delete' => at('action.modelDelete', 'Modello eliminato (cestino)'),
        'model.restore' => at('action.modelRestore', 'Modello ripristinato'),
        'model.file_restore' => at('action.modelFileRestore', 'Versione precedente del file ripristinata'),
        'model.publish' => at('action.modelPublish', 'Modello pubblicato'),
        'model.unpublish' => at('action.modelUnpublish', 'Modello ritirato (bozza)'),
        'trash.purge' => at('action.trashPurge', 'Eliminato definitivamente'),
        'user.create' => at('action.userCreate', 'Utente creato'),
        'user.update' => at('action.userUpdate', 'Utente modificato'),
        'user.password' => at('action.userPassword', 'Password reimpostata'),
        'user.delete' => at('action.userDelete', 'Utente eliminato'),
        'account.update' => at('action.accountUpdate', 'Profilo modificato'),
        'account.password' => at('action.accountPassword', 'Password cambiata'),
    ];
    return $labels[$action] ?? $action;
}

/**
 * Motivo per cui un modello non compare sul sito (vedi adminListModels()).
 */
function adminProblemLabel(string $problem): string {
    $labels = [
        'meta_missing' => at('problem.meta_missing', 'metadati mancanti'),
        'meta_invalid' => at('problem.meta_invalid', 'JSON non valido'),
        'name_missing' => at('problem.name_missing', 'nome mancante'),
        'file_missing' => at('problem.file_missing', 'file 3D mancante'),
    ];
    return $labels[$problem] ?? $problem;
}

function adminVisibilityLabel(bool $published): string {
    return $published ? at('visibility.published', 'Pubblicato') : at('visibility.draft', 'Bozza');
}

/**
 * Indirizzo del modello nel visualizzatore: le bozze si aprono in anteprima
 * (viewer.php le mostra solo a chi è entrato nel pannello).
 */
function adminViewerUrl(string $folder, bool $published): string {
    return 'viewer.php?m=' . rawurlencode($folder) . ($published ? '' : '&preview=1');
}

function adminRoleLabel(string $role): string {
    return $role === 'admin' ? at('role.admin', 'Amministratore') : at('role.editor', 'Editor');
}

function adminDate(int $ts): string {
    return $ts > 0 ? date('d/m/Y H:i', $ts) : '—';
}

/**
 * Dettaglio di un evento dello storico, come elenco HTML (già escapato).
 */
function adminRenderDetails(array $entry): string {
    $details = is_array($entry['details'] ?? null) ? $entry['details'] : [];
    if ($details === []) {
        return '';
    }
    $items = [];
    if (isset($details['changes']) && is_array($details['changes'])) {
        foreach ($details['changes'] as $field => $pair) {
            if (!is_array($pair) || count($pair) !== 2) {
                continue;
            }
            $format = $field === 'published'
                ? static fn($v): string => $v === null ? '' : adminVisibilityLabel($v !== false)
                : 'adminFormatValue';
            // Campo nuovo (creazione): solo il valore, senza "— →"
            $old = $pair[0] === null || $pair[0] === ''
                ? '' : '<span class="adm-old">' . e($format($pair[0])) . '</span> → ';
            $items[] = '<li><strong>' . e(adminFieldLabel((string) $field)) . '</strong>: '
                . $old . '<span class="adm-new">' . e($format($pair[1])) . '</span></li>';
        }
    }
    $simple = [
        'file' => at('field.file', 'File 3D'),
        'original' => at('detail.original', 'File caricato'),
        'size' => at('detail.size', 'Dimensione'),
        'username' => at('detail.username', 'Nome utente'),
        'role' => at('detail.role', 'Ruolo'),
        'name' => at('field.name', 'Nome'),
        'replaced' => at('detail.replaced', 'Sostituito'),
        'previous' => at('detail.previous', 'Versione precedente'),
        'disabled' => at('detail.disabled', 'Disattivato'),
        'type' => at('detail.type', 'Tipo'),
    ];
    foreach ($simple as $key => $label) {
        if (!array_key_exists($key, $details)) {
            continue;
        }
        $value = $details[$key];
        if ($key === 'size' && is_numeric($value)) {
            $value = adminFormatBytes((int) $value);
        } elseif ($key === 'role' && is_string($value)) {
            $value = adminRoleLabel($value);
        }
        $items[] = '<li><strong>' . e($label) . '</strong>: ' . e(adminFormatValue($value)) . '</li>';
    }
    return $items === [] ? '' : '<ul class="adm-changes">' . implode('', $items) . '</ul>';
}

// ------------------------------------------------------------
// Stato della richiesta
// ------------------------------------------------------------
$user = adminCurrentUser();
$hasUsers = adminHasUsers();
$page = preg_replace('/[^a-z]/', '', (string) ($_GET['p'] ?? 'models'));
$storageOk = adminStorageWritable();

// Stato del modulo modello quando va ripresentato (errori, conflitto)
$form = null;

// ------------------------------------------------------------
// Azioni (POST)
// ------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = (string) ($_POST['action'] ?? '');

    // Un caricamento oltre post_max_size arriva con $_POST vuoto: senza
    // questo controllo sembrerebbe un CSRF fallito.
    if ($_POST === [] && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
        adminFlash('error', 'model_too_large_direct');
        adminRedirect($_GET);
    }

    if (!adminCheckRequest((string) ($_POST['csrf'] ?? ''))) {
        http_response_code(403);
        adminFlash('error', 'csrf');
        adminRedirect($user !== null ? ['p' => $page] : []);
    }

    // --- Primo amministratore -------------------------------------------
    if ($action === 'bootstrap' && !$hasUsers) {
        $key = trim((string) ($_POST['key'] ?? ''));
        $stored = installKey();
        $username = strtolower(trim((string) ($_POST['username'] ?? '')));
        $password = (string) ($_POST['password'] ?? '');
        if (!$storageOk) {
            adminFlash('error', 'not_writable');
        } elseif ($stored === '') {
            adminFlash('error', 'no_install_key');
        } elseif ($key === '' || !hash_equals($stored, $key)) {
            adminRecordLoginFailure();
            adminFlash('error', 'install_key');
        } elseif ($password !== (string) ($_POST['password2'] ?? '')) {
            adminFlash('error', 'password_mismatch');
        } else {
            $error = adminCreateUser($username, (string) ($_POST['displayName'] ?? ''), $password, 'admin', '');
            if ($error !== '') {
                adminFlash('error', $error);
            } else {
                adminLog('admin.bootstrap', $username, ['username' => $username], $username);
                adminLogin($username, $password);
                adminFlash('success', 'welcome');
            }
        }
        adminRedirect();
    }

    // --- Accesso ----------------------------------------------------------
    if ($action === 'login') {
        $error = adminLogin((string) ($_POST['username'] ?? ''), (string) ($_POST['password'] ?? ''));
        if ($error !== '') {
            adminFlash('error', $error);
            adminRedirect();
        }
        $next = preg_replace('/[^a-z]/', '', (string) ($_POST['next'] ?? ''));
        adminRedirect($next !== '' && $next !== 'login' ? ['p' => $next] : []);
    }

    if ($user === null) {
        adminFlash('error', 'session_expired');
        adminRedirect();
    }
    $username = (string) $user['username'];

    if ($action === 'logout') {
        adminLog('logout', '');
        adminEndSession();
        adminFlash('info', 'logged_out');
        adminRedirect();
    }

    // --- Salvataggio di un modello (nuovo o esistente) ---------------------
    if ($action === 'model_save') {
        if (!adminCan($user, 'models.edit')) {
            adminFlash('error', 'forbidden');
            adminRedirect();
        }
        $isNew = ($_POST['mode'] ?? '') === 'new';
        $collected = adminCollectModelFields($_POST);
        $errors = $collected['errors'];
        $uploadId = (string) ($_POST['upload_id'] ?? '');
        $formError = '';
        $formParams = [];

        if ($isNew) {
            $folder = strtolower(trim((string) ($_POST['folder'] ?? '')));
            if ($folder === '') {
                $folder = adminSuggestFolder($collected['values']['name']);
            }
            $loaded = null;
            if (!adminValidNewFolder($folder)) {
                $errors['folder'] = 'invalid';
            } elseif (file_exists(adminModelsDir() . '/' . $folder)) {
                $errors['folder'] = 'exists';
            }
        } else {
            $folder = (string) ($_POST['folder'] ?? '');
            $loaded = adminLoadModel($folder);
            if ($loaded === null) {
                adminFlash('error', 'model_missing');
                adminRedirect();
            }
            // Qualcun altro ha salvato dopo che il modulo è stato aperto.
            // Fusione a tre vie: i campi che questo utente non ha toccato
            // prendono il valore appena salvato dall'altro, quelli toccati da
            // entrambi restano i suoi ma vengono evidenziati. Senza, salvare di
            // nuovo dopo il conflitto annullerebbe in silenzio le modifiche altrui.
            if (($_POST['rev'] ?? '') !== $loaded['rev']) {
                $last = adminHistory(['target' => $folder, 'action' => 'model.'])[0] ?? null;
                $formError = 'conflict';
                $formParams = ['name' => $last !== null ? (string) ($last['name'] ?: $last['user']) : '?'];
                $base = json_decode((string) ($_POST['base'] ?? ''), true);
                $theirs = adminFormValues($loaded['meta']);
                if (is_array($base)) {
                    foreach ($theirs as $field => $value) {
                        $mine = $collected['values'][$field] ?? '';
                        $original = (string) ($base[$field] ?? '');
                        if ($mine === $original) {
                            $collected['values'][$field] = $value;
                        } elseif ($value !== $original && $value !== $mine) {
                            $errors[$field] = 'conflict_field';
                        }
                    }
                }
            }
        }

        $upload = ['ok' => true, 'path' => '', 'error' => ''];
        if ($errors === [] && $formError === '') {
            $upload = adminTakeModelUpload($username, $uploadId, $_FILES['model_file'] ?? []);
            if (!$upload['ok']) {
                $errors['model_file'] = $upload['error'];
                if ($upload['error'] !== 'upload_incomplete') {
                    $uploadId = '';
                }
            } elseif ($isNew && $upload['path'] === '') {
                $errors['model_file'] = 'model_required';
            }
        }

        if ($errors !== [] || $formError !== '') {
            $form = [
                'isNew' => $isNew,
                'folder' => $folder,
                'values' => $collected['values'],
                'errors' => $errors,
                'error' => $formError !== '' ? $formError : (isset($errors['model_file']) && count($errors) === 1 ? $errors['model_file'] : 'fields'),
                'params' => $formParams,
                'uploadId' => $uploadId,
                'rev' => $loaded['rev'] ?? '',
            ];
            $page = $isNew ? 'new' : 'edit';
            $_GET['m'] = $folder;
            http_response_code(422);
        } elseif ($isNew) {
            // --- Nuovo modello
            $dir = adminModelsDir() . '/' . $folder;
            if (!is_dir(adminModelsDir())) {
                @mkdir(adminModelsDir(), 0775, true);
            }
            if (!@mkdir($dir, 0775)) {
                adminFlash('error', 'models_not_writable');
                adminRedirect(['p' => 'new']);
            }
            $fileName = adminInstallModelFile($upload, $folder, false);
            $meta = adminApplyModelFields(['name' => '', 'folder' => $folder], $collected['data'], $folder);
            $meta['file'] = $fileName;
            if ($fileName === '' || !adminSaveModelMeta($folder, $meta)) {
                adminRemoveTree($dir);
                adminFlash('error', 'write_failed');
                adminRedirect(['p' => 'new']);
            }
            adminLog('model.create', $folder, [
                // Alla creazione non c'è un "prima": solo i valori scelti
                'changes' => array_map(static fn(array $pair): array => [null, $pair[1]], adminDiffMeta(['published' => false], $meta)
                    + (isModelPublished($meta) ? [] : ['published' => [null, false]])),
                'original' => $upload['original'],
                'size' => $upload['size'],
            ]);
            $socialError = adminSaveSocialImage($_FILES['social_image'] ?? [], $folder);
            if ($socialError !== '') {
                adminFlash('error', $socialError);
            } elseif ((int) ($_FILES['social_image']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
                adminLog('model.social', $folder);
            }
            adminFlash('success', 'created', ['name' => $meta['name']]);
            adminRedirect(['p' => 'edit', 'm' => $folder]);
        } else {
            // --- Modello esistente
            $old = $loaded['meta'];
            $meta = adminApplyModelFields($old, $collected['data'], $folder);
            $changed = false;

            if ($upload['path'] !== '') {
                $previous = adminModelFileName($folder, $old);
                $fileName = adminInstallModelFile($upload, $folder, true);
                if ($fileName === '') {
                    adminFlash('error', 'write_failed');
                    adminRedirect(['p' => 'edit', 'm' => $folder]);
                }
                $meta['file'] = $fileName;
                if (!adminSaveModelMeta($folder, $meta)) {
                    @unlink(adminModelsDir() . '/' . $folder . '/' . $fileName);
                    adminFlash('error', 'write_failed');
                    adminRedirect(['p' => 'edit', 'm' => $folder]);
                }
                // La versione precedente va nel cestino: si può tornare indietro
                $trashed = $previous !== $fileName && is_file(adminModelsDir() . '/' . $folder . '/' . $previous)
                    ? adminTrashFile($folder, $previous, $username) : '';
                adminLog('model.file', $folder, [
                    'file' => $fileName,
                    'previous' => $previous,
                    'original' => $upload['original'],
                    'size' => $upload['size'],
                ]);
                // Il resto delle modifiche (senza il campo file) va in una voce sua
                $diff = adminDiffMeta($old, $meta);
                unset($diff['file']);
                if ($diff !== []) {
                    adminLog('model.update', $folder, ['changes' => $diff]);
                }
                $changed = true;
            } else {
                $diff = adminDiffMeta($old, $meta);
                if ($diff !== [] || !$loaded['valid']) {
                    if (!adminSaveModelMeta($folder, $meta)) {
                        adminFlash('error', 'write_failed');
                        adminRedirect(['p' => 'edit', 'm' => $folder]);
                    }
                    adminLog('model.update', $folder, ['changes' => $diff]);
                    $changed = true;
                }
            }

            $social = adminModelsDir() . '/' . $folder . '/' . $folder . '_social.jpg';
            if (!empty($_POST['social_delete']) && is_file($social)) {
                // Nessun cestino: il viewer la rigenera da solo alla prossima visita
                @unlink($social);
                adminLog('model.social_delete', $folder);
                $changed = true;
            }
            $socialError = adminSaveSocialImage($_FILES['social_image'] ?? [], $folder);
            if ($socialError !== '') {
                adminFlash('error', $socialError);
            } elseif ((int) ($_FILES['social_image']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
                adminLog('model.social', $folder);
                $changed = true;
            }

            adminFlash($changed ? 'success' : 'info', $changed ? 'saved' : 'nothing_changed');
            adminRedirect(['p' => 'edit', 'm' => $folder]);
        }
    }

    // --- Eliminazione di un modello (nel cestino) ----------------------------
    // --- Pubblica / ritira (dall'elenco, senza aprire il modulo) -----------
    if ($action === 'model_publish') {
        $folder = (string) ($_POST['folder'] ?? '');
        $back = ($_POST['back'] ?? '') === 'edit' ? ['p' => 'edit', 'm' => $folder] : array_filter(['s' => preg_replace('/[^a-z]/', '', (string) ($_POST['s'] ?? ''))]);
        if (!adminCan($user, 'models.edit')) {
            adminFlash('error', 'forbidden');
            adminRedirect($back);
        }
        $loaded = adminLoadModel($folder);
        if ($loaded === null || !$loaded['valid']) {
            adminFlash('error', 'model_missing');
            adminRedirect($back);
        }
        $publish = ($_POST['publish'] ?? '') === '1';
        $meta = $loaded['meta'];
        $name = is_string($meta['name'] ?? null) && $meta['name'] !== '' ? $meta['name'] : $folder;
        if (isModelPublished($meta) !== $publish) {
            if ($publish) {
                unset($meta['published']);
            } else {
                $meta['published'] = false;
            }
            if (!adminSaveModelMeta($folder, $meta)) {
                adminFlash('error', 'write_failed');
                adminRedirect($back);
            }
            adminLog($publish ? 'model.publish' : 'model.unpublish', $folder, ['name' => $name]);
        }
        adminFlash('success', $publish ? 'published' : 'unpublished', ['name' => $name]);
        adminRedirect($back);
    }

    if ($action === 'model_delete') {
        $folder = (string) ($_POST['folder'] ?? '');
        if (!adminCan($user, 'models.delete')) {
            adminFlash('error', 'forbidden');
            adminRedirect(['p' => 'edit', 'm' => $folder]);
        }
        $loaded = adminLoadModel($folder);
        if ($loaded === null) {
            adminFlash('error', 'model_missing');
            adminRedirect();
        }
        if (trim((string) ($_POST['confirm'] ?? '')) !== $folder) {
            adminFlash('error', 'confirm_mismatch');
            adminRedirect(['p' => 'edit', 'm' => $folder]);
        }
        $name = is_string($loaded['meta']['name'] ?? null) ? $loaded['meta']['name'] : $folder;
        $trashId = adminTrashModel($folder, $username);
        if ($trashId === '') {
            adminFlash('error', 'write_failed');
            adminRedirect(['p' => 'edit', 'm' => $folder]);
        }
        adminLog('model.delete', $folder, ['name' => $name]);
        adminFlash('success', 'deleted', ['name' => $name]);
        adminRedirect();
    }

    // --- Cestino -------------------------------------------------------------
    if ($action === 'trash_restore' || $action === 'trash_purge') {
        if (!adminCan($user, 'trash.manage')) {
            adminFlash('error', 'forbidden');
            adminRedirect();
        }
        $id = (string) ($_POST['id'] ?? '');
        $item = adminTrashItem($id);
        if ($item === null) {
            adminFlash('error', 'trash_missing');
            adminRedirect(['p' => 'trash']);
        }
        if ($action === 'trash_restore') {
            $result = adminTrashRestore($id, $username);
            if (!$result['ok']) {
                adminFlash('error', $result['error']);
                adminRedirect(['p' => 'trash']);
            }
            if (($item['type'] ?? '') === 'model') {
                adminLog('model.restore', (string) $item['folder'], ['name' => (string) ($item['name'] ?? '')]);
            } else {
                adminLog('model.file_restore', (string) $item['folder'], [
                    'file' => (string) ($item['file'] ?? ''),
                    'replaced' => (string) ($result['item']['replaced'] ?? ''),
                ]);
            }
            adminFlash('success', 'restored');
            adminRedirect(['p' => 'edit', 'm' => (string) $item['folder']]);
        }
        if (!adminTrashPurge($id)) {
            adminFlash('error', 'write_failed');
            adminRedirect(['p' => 'trash']);
        }
        adminLog('trash.purge', (string) ($item['folder'] ?? ''), [
            'type' => (string) ($item['type'] ?? ''),
            'file' => (string) ($item['file'] ?? ''),
            'name' => (string) ($item['name'] ?? ''),
            'size' => (int) ($item['size'] ?? 0),
        ]);
        adminFlash('success', 'purged');
        adminRedirect(['p' => 'trash']);
    }

    // --- Utenti --------------------------------------------------------------
    if (strpos($action, 'user_') === 0) {
        if (!adminCan($user, 'users.manage')) {
            adminFlash('error', 'forbidden');
            adminRedirect();
        }
        $target = strtolower(trim((string) ($_POST['username'] ?? '')));

        if ($action === 'user_create') {
            $password = (string) ($_POST['password'] ?? '');
            $role = (string) ($_POST['role'] ?? 'editor');
            $error = adminCreateUser($target, (string) ($_POST['displayName'] ?? ''), $password, $role, $username);
            if ($error !== '') {
                adminFlash('error', $error);
            } else {
                adminLog('user.create', $target, ['username' => $target, 'role' => $role]);
                adminFlash('success', 'user_created', ['name' => $target]);
            }
            adminRedirect(['p' => 'users']);
        }

        $targetUser = adminUser($target);
        if ($targetUser === null) {
            adminFlash('error', 'user_missing');
            adminRedirect(['p' => 'users']);
        }

        if ($action === 'user_update') {
            $changes = [
                'displayName' => (string) ($_POST['displayName'] ?? ''),
                'role' => (string) ($_POST['role'] ?? ''),
                'disabled' => !empty($_POST['disabled']),
            ];
            if ($target === $username && ($changes['role'] !== $targetUser['role'] || $changes['disabled'])) {
                adminFlash('error', 'self');
                adminRedirect(['p' => 'users']);
            }
            $before = [
                'displayName' => (string) ($targetUser['displayName'] ?? ''),
                'role' => (string) ($targetUser['role'] ?? ''),
                'disabled' => !empty($targetUser['disabled']),
            ];
            // Senza cambi niente scrittura: riattivare invaliderebbe le sessioni
            if ($before['disabled'] === $changes['disabled']) {
                unset($changes['disabled']);
            }
            $error = adminUpdateUser($target, $changes);
            if ($error !== '') {
                adminFlash('error', $error);
                adminRedirect(['p' => 'users']);
            }
            $after = adminUser($target) ?? [];
            $diff = [];
            foreach ($before as $key => $value) {
                $new = $key === 'disabled' ? !empty($after[$key]) : (string) ($after[$key] ?? '');
                if ($new !== $value) {
                    $diff[$key === 'displayName' ? 'name' : $key] = $key === 'role'
                        ? [adminRoleLabel($value), adminRoleLabel((string) $new)]
                        : [$value, $new];
                }
            }
            if ($diff !== []) {
                adminLog('user.update', $target, ['changes' => $diff]);
            }
            adminFlash('success', 'user_updated');
            adminRedirect(['p' => 'users']);
        }

        if ($action === 'user_password') {
            $error = adminUpdateUser($target, ['password' => (string) ($_POST['password'] ?? '')]);
            if ($error !== '') {
                adminFlash('error', $error);
            } else {
                adminLog('user.password', $target);
                if ($target === $username) {
                    adminRefreshSessionVersion($username);
                }
                adminFlash('success', 'password_changed');
            }
            adminRedirect(['p' => 'users']);
        }

        if ($action === 'user_delete') {
            if ($target === $username) {
                adminFlash('error', 'self');
                adminRedirect(['p' => 'users']);
            }
            $error = adminDeleteUser($target);
            if ($error !== '') {
                adminFlash('error', $error);
            } else {
                adminLog('user.delete', $target, ['username' => $target, 'name' => (string) ($targetUser['displayName'] ?? '')]);
                adminFlash('success', 'user_deleted');
            }
            adminRedirect(['p' => 'users']);
        }
    }

    // --- Il proprio account ----------------------------------------------------
    if ($action === 'account_save') {
        $displayName = (string) ($_POST['displayName'] ?? '');
        $before = (string) ($user['displayName'] ?? '');
        if (adminCleanLine($displayName, 80) !== $before) {
            $error = adminUpdateUser($username, ['displayName' => $displayName]);
            if ($error !== '') {
                adminFlash('error', $error);
                adminRedirect(['p' => 'account']);
            }
            adminLog('account.update', $username, ['changes' => ['name' => [$before, adminCleanLine($displayName, 80)]]]);
        }

        $newPassword = (string) ($_POST['newPassword'] ?? '');
        if ($newPassword !== '') {
            if (!password_verify((string) ($_POST['currentPassword'] ?? ''), (string) ($user['hash'] ?? ''))) {
                adminFlash('error', 'password_wrong');
                adminRedirect(['p' => 'account']);
            }
            if ($newPassword !== (string) ($_POST['newPassword2'] ?? '')) {
                adminFlash('error', 'password_mismatch');
                adminRedirect(['p' => 'account']);
            }
            $error = adminUpdateUser($username, ['password' => $newPassword]);
            if ($error !== '') {
                adminFlash('error', $error);
                adminRedirect(['p' => 'account']);
            }
            adminRefreshSessionVersion($username);
            adminLog('account.password', $username);
            adminFlash('success', 'password_changed');
        } else {
            adminFlash('success', 'account_saved');
        }
        adminRedirect(['p' => 'account']);
    }

    // Il modulo modello con errori si ripresenta qui sotto, senza redirect
    if ($form === null) {
        adminRedirect();
    }
}

// ------------------------------------------------------------
// Pagina da mostrare
// ------------------------------------------------------------
if ($user === null) {
    $page = $hasUsers ? 'login' : 'bootstrap';
} elseif (!in_array($page, ['models', 'edit', 'new', 'history', 'stats', 'trash', 'users', 'account'], true)) {
    $page = 'models';
}
if (($page === 'trash' && !adminCan($user, 'trash.manage')) || ($page === 'users' && !adminCan($user, 'users.manage'))
    || ($page === 'stats' && !adminCan($user, 'stats.view'))) {
    $page = 'models';
}

// Statistiche in CSV: un giorno e un modello per riga, per un foglio di calcolo
if ($page === 'stats' && ($_GET['export'] ?? '') === 'csv') {
    $names = [];
    foreach (adminListModels() as $model) {
        $names[$model['folder']] = $model['name'];
    }
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="statistiche-' . date('Y-m-d') . '.csv"');
    echo "\xEF\xBB\xBF" . statsCsv(statsLoadDays(), $names);
    exit;
}

$flashes = (array) ($_SESSION['flash'] ?? []);
unset($_SESSION['flash']);
if ($form !== null) {
    $flashes[] = ['type' => 'error', 'code' => $form['error'], 'params' => $form['params']];
}

// Dati del modulo modello
$editModel = null;
if ($page === 'edit') {
    $editFolder = (string) ($_GET['m'] ?? '');
    $editModel = adminLoadModel($editFolder);
    if ($editModel === null) {
        $flashes[] = ['type' => 'error', 'code' => 'model_missing', 'params' => []];
        $page = 'models';
    }
}

$csrf = adminCsrfToken();
$appName = (string) config('branding.appName', '3D Cave Viewer');
$pageTitles = [
    'login' => at('login.title', 'Accesso'),
    'bootstrap' => at('bootstrap.title', 'Primo accesso'),
    'models' => at('nav.models', 'Modelli'),
    'edit' => at('edit.title', 'Modifica modello'),
    'new' => at('new.title', 'Nuovo modello'),
    'history' => at('nav.history', 'Storico'),
    'stats' => at('nav.stats', 'Statistiche'),
    'trash' => at('nav.trash', 'Cestino'),
    'users' => at('nav.users', 'Utenti'),
    'account' => at('nav.account', 'Il mio account'),
];
$modelsUrl = config('paths.modelsFolder', 'modelli');

/**
 * Campo di testo del modulo modello.
 */
function adminInput(string $name, string $label, string $value, array $errors, array $attrs = [], string $hint = ''): void {
    $id = (string) ($attrs['id'] ?? 'f-' . $name);
    unset($attrs['id']);
    $error = $errors[$name] ?? '';
    echo '<p class="adm-field' . ($error !== '' ? ' adm-field-error' : '') . '">';
    echo '<label for="' . e($id) . '">' . e($label) . '</label>';
    echo '<input id="' . e($id) . '" name="' . e($name) . '" value="' . e($value) . '"';
    if (!isset($attrs['type'])) {
        echo ' type="text"';
    }
    foreach ($attrs as $attr => $attrValue) {
        echo ' ' . e($attr) . ($attrValue === true ? '' : '="' . e((string) $attrValue) . '"');
    }
    if ($error !== '') {
        echo ' aria-invalid="true"';
    }
    echo ' />';
    if ($error !== '') {
        echo '<span class="adm-error-text">' . e(adminFieldError($name, $error)) . '</span>';
    } elseif ($hint !== '') {
        echo '<span class="adm-hint">' . e($hint) . '</span>';
    }
    echo '</p>';
}

function adminFieldError(string $field, string $code): string {
    switch ($code) {
        case 'required':
            return at('err.required', 'Campo obbligatorio.');
        case 'range':
            if ($field === 'lat') {
                return at('err.latRange', 'Latitudine fra -90 e 90.');
            }
            if ($field === 'lon') {
                return at('err.lonRange', 'Longitudine fra -180 e 180.');
            }
            return at('err.rotRange', 'Angolo in gradi fra -360 e 360.');
        case 'pair':
            return at('err.coordPair', 'Indica sia la latitudine sia la longitudine (o nessuna delle due).');
        case 'conflict_field':
            return at('err.conflictField', 'Modificato anche dall\'altro utente: controlla quale valore tenere.');
        case 'invalid':
            return adminMessage('folder_invalid');
        case 'exists':
            return adminMessage('folder_exists');
        default:
            return adminMessage($code);
    }
}

$langMeta = getLanguagesMeta();
?>
<!DOCTYPE html>
<html lang="<?= e($lang); ?>">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover" />
  <meta name="robots" content="noindex, nofollow" />
  <title><?= e($pageTitles[$page] ?? ''); ?> · <?= e(at('title', 'Amministrazione')); ?> - <?= e($appName); ?></title>
  <meta name="theme-color" content="<?= e((string) config('theme.themeColor', '#0d1117')); ?>" />
  <?php $icon192 = assetUrl(iconPath(192)); ?>
  <?php if ($icon192 !== ''): ?>
  <link rel="icon" type="image/png" sizes="192x192" href="<?= e($icon192); ?>" />
  <?php endif; ?>
  <link rel="stylesheet" href="lib/fonts/poppins.css" />
  <?php if ($page === 'edit' || $page === 'new'): ?>
  <link rel="stylesheet" href="lib/leaflet/leaflet.css" />
  <?php endif; ?>
  <link rel="stylesheet" href="<?= e(assetUrl('css/admin.css')); ?>" />
</head>
<body class="adm-page-<?= e($page); ?>">
  <header class="adm-header">
    <a class="adm-brand" href="index.php" title="<?= e(at('backToSite', 'Torna al sito')); ?>">
      <?= logoPicture('adm-logo', $appName); ?>
      <span class="adm-brand-text">
        <span class="adm-brand-app"><?= e($appName); ?></span>
        <span class="adm-brand-sub"><?= e(at('title', 'Amministrazione')); ?></span>
      </span>
    </a>
    <?php if ($user !== null): ?>
    <nav class="adm-nav" aria-label="<?= e(at('nav.label', 'Sezioni del pannello')); ?>">
      <a href="admin.php" class="<?= in_array($page, ['models', 'edit', 'new'], true) ? 'active' : ''; ?>"><?= e(at('nav.models', 'Modelli')); ?></a>
      <a href="admin.php?p=history" class="<?= $page === 'history' ? 'active' : ''; ?>"><?= e(at('nav.history', 'Storico')); ?></a>
      <?php if (adminCan($user, 'stats.view')): ?>
      <a href="admin.php?p=stats" class="<?= $page === 'stats' ? 'active' : ''; ?>"><?= e(at('nav.stats', 'Statistiche')); ?></a>
      <?php endif; ?>
      <?php if (adminCan($user, 'trash.manage')): ?>
      <a href="admin.php?p=trash" class="<?= $page === 'trash' ? 'active' : ''; ?>"><?= e(at('nav.trash', 'Cestino')); ?></a>
      <?php endif; ?>
      <?php if (adminCan($user, 'users.manage')): ?>
      <a href="admin.php?p=users" class="<?= $page === 'users' ? 'active' : ''; ?>"><?= e(at('nav.users', 'Utenti')); ?></a>
      <?php endif; ?>
    </nav>
    <div class="adm-userbox">
      <a href="admin.php?p=account" class="adm-user <?= $page === 'account' ? 'active' : ''; ?>" title="<?= e(at('nav.account', 'Il mio account')); ?>">
        <span class="adm-avatar" aria-hidden="true"><?= e(strtoupper(substr((string) $user['username'], 0, 1))); ?></span>
        <span><?= e(adminDisplayName((string) $user['username'])); ?></span>
        <span class="adm-role"><?= e(adminRoleLabel((string) $user['role'])); ?></span>
      </a>
      <form method="post" action="admin.php" class="adm-inline">
        <input type="hidden" name="csrf" value="<?= e($csrf); ?>" />
        <input type="hidden" name="action" value="logout" />
        <button type="submit" class="adm-btn adm-btn-ghost"><?= e(at('logout', 'Esci')); ?></button>
      </form>
    </div>
    <?php endif; ?>
  </header>

  <main class="adm-main">
    <?php foreach ($flashes as $flash): ?>
    <div class="adm-flash adm-flash-<?= e((string) ($flash['type'] ?? 'info')); ?>" role="<?= ($flash['type'] ?? '') === 'error' ? 'alert' : 'status'; ?>">
      <?= e(adminMessage((string) ($flash['code'] ?? ''), (array) ($flash['params'] ?? []))); ?>
    </div>
    <?php endforeach; ?>

    <?php if (!$storageOk): ?>
    <div class="adm-flash adm-flash-error" role="alert"><?= e(adminMessage('not_writable')); ?></div>
    <?php endif; ?>

<?php if ($page === 'bootstrap'): ?>
    <section class="adm-card adm-narrow">
      <h1><?= e(at('bootstrap.title', 'Primo accesso')); ?></h1>
      <p><?= e(at('bootstrap.intro', 'Non esiste ancora nessun account. Crea il primo amministratore: per dimostrare di gestire questa installazione serve la chiave di configurazione, quella mostrata (e fatta scaricare) alla fine dell\'installazione guidata e salvata nel file custom/.installed.')); ?></p>
      <form method="post" action="admin.php" class="adm-form" autocomplete="off" data-key-file>
        <input type="hidden" name="csrf" value="<?= e($csrf); ?>" />
        <input type="hidden" name="action" value="bootstrap" />
        <p class="adm-field">
          <label for="f-key"><?= e(at('bootstrap.key', 'Chiave di configurazione')); ?></label>
          <input type="password" id="f-key" name="key" required autocomplete="off" spellcheck="false" />
          <span class="adm-hint"><?= e(at('bootstrap.keyHint', 'Puoi anche scegliere il file salvato: viene letto nel browser, non caricato.')); ?></span>
          <input type="file" id="f-key-file" accept=".installed,.txt,text/plain" class="adm-file-small" />
        </p>
        <?php adminInput('username', at('user.username', 'Nome utente'), '', [], ['required' => true, 'autocomplete' => 'username', 'pattern' => '[a-z0-9][a-z0-9._\-]{2,31}', 'maxlength' => 32], at('user.usernameHint', 'Minuscole, numeri, punto, - e _ (3-32 caratteri).')); ?>
        <?php adminInput('displayName', at('user.displayName', 'Nome visualizzato'), '', [], ['maxlength' => 80, 'autocomplete' => 'name'], at('user.displayNameHint', 'Come appare nello storico, es. «Mario Rossi».')); ?>
        <?php adminInput('password', at('user.password', 'Password'), '', [], ['type' => 'password', 'required' => true, 'minlength' => ADMIN_PASSWORD_MIN, 'autocomplete' => 'new-password'], at('user.passwordHint', 'Almeno {min} caratteri.', ['min' => ADMIN_PASSWORD_MIN])); ?>
        <?php adminInput('password2', at('user.password2', 'Ripeti la password'), '', [], ['type' => 'password', 'required' => true, 'minlength' => ADMIN_PASSWORD_MIN, 'autocomplete' => 'new-password']); ?>
        <p class="adm-actions"><button type="submit" class="adm-btn adm-btn-primary"><?= e(at('bootstrap.submit', 'Crea amministratore')); ?></button></p>
      </form>
    </section>

<?php elseif ($page === 'login'): ?>
    <section class="adm-card adm-narrow">
      <h1><?= e(at('login.title', 'Accesso')); ?></h1>
      <form method="post" action="admin.php" class="adm-form">
        <input type="hidden" name="csrf" value="<?= e($csrf); ?>" />
        <input type="hidden" name="action" value="login" />
        <input type="hidden" name="next" value="<?= e((string) preg_replace('/[^a-z]/', '', (string) ($_GET['p'] ?? ''))); ?>" />
        <?php adminInput('username', at('user.username', 'Nome utente'), '', [], ['required' => true, 'autocomplete' => 'username', 'autofocus' => true, 'autocapitalize' => 'none', 'spellcheck' => 'false']); ?>
        <?php adminInput('password', at('user.password', 'Password'), '', [], ['type' => 'password', 'required' => true, 'autocomplete' => 'current-password']); ?>
        <p class="adm-actions"><button type="submit" class="adm-btn adm-btn-primary"><?= e(at('login.submit', 'Entra')); ?></button></p>
      </form>
      <p class="adm-hint"><?= e(at('login.forgot', 'Password dimenticata? Chiedi a un amministratore di reimpostarla.')); ?></p>
    </section>

<?php elseif ($page === 'models'): ?>
    <?php
    $allModels = adminListModels();
    $lastChanges = adminLastChanges();
    $draftCount = count(array_filter($allModels, static fn(array $m): bool => !$m['published']));
    $statusFilter = in_array($_GET['s'] ?? '', ['published', 'draft'], true) ? (string) $_GET['s'] : '';
    $models = $statusFilter === ''
        ? $allModels
        : array_values(array_filter($allModels, static fn(array $m): bool => $m['published'] === ($statusFilter === 'published')));
    $statusTabs = [
        '' => [at('models.filterAll', 'Tutti'), count($allModels)],
        'published' => [at('models.filterPublished', 'Pubblicati'), count($allModels) - $draftCount],
        'draft' => [at('models.filterDraft', 'Bozze'), $draftCount],
    ];
    ?>
    <section class="adm-toolbar">
      <h1><?= e(at('nav.models', 'Modelli')); ?> <span class="adm-count"><?= count($allModels); ?></span></h1>
      <nav class="adm-segmented" aria-label="<?= e(at('field.published', 'Visibilità')); ?>">
        <?php foreach ($statusTabs as $key => [$label, $count]): ?>
        <a href="admin.php<?= $key !== '' ? '?s=' . e($key) : ''; ?>" class="<?= $statusFilter === $key ? 'active' : ''; ?>"<?= $statusFilter === $key ? ' aria-current="page"' : ''; ?>><?= e($label); ?> <span class="adm-count"><?= (int) $count; ?></span></a>
        <?php endforeach; ?>
      </nav>
      <input type="search" id="adm-model-filter" class="adm-search" placeholder="<?= e(at('models.search', 'Cerca per nome o cartella…')); ?>" aria-label="<?= e(at('models.search', 'Cerca per nome o cartella…')); ?>" />
      <?php if (adminCan($user, 'models.edit')): ?>
      <a href="admin.php?p=new" class="adm-btn adm-btn-primary">+ <?= e(at('models.new', 'Nuovo modello')); ?></a>
      <?php endif; ?>
    </section>
    <?php if ($models === []): ?>
    <section class="adm-card adm-empty">
      <p><?= e($allModels === []
          ? at('models.empty', 'Non ci sono ancora modelli. Inizia caricando il primo.')
          : ($statusFilter === 'draft' ? at('models.emptyDraft', 'Nessun modello in bozza.') : at('models.emptyPublished', 'Nessun modello pubblicato.'))); ?></p>
    </section>
    <?php else: ?>
    <div class="adm-table-wrap">
    <table class="adm-table" id="adm-model-table">
      <thead>
        <tr>
          <th><?= e(at('models.colName', 'Modello')); ?></th>
          <th><?= e(at('models.colPosition', 'Posizione')); ?></th>
          <th><?= e(at('models.colFile', 'File 3D')); ?></th>
          <th><?= e(at('models.colLastChange', 'Ultima modifica')); ?></th>
          <th class="adm-col-actions"><span class="adm-sr"><?= e(at('models.colActions', 'Azioni')); ?></span></th>
        </tr>
      </thead>
      <tbody>
      <?php foreach ($models as $model): $last = $lastChanges[$model['folder']] ?? null; ?>
        <tr data-filter="<?= e(strtolower($model['name'] . ' ' . $model['folder'])); ?>"<?= $model['published'] ? '' : ' class="adm-row-draft"'; ?>>
          <td>
            <a class="adm-model-name" href="admin.php?p=edit&amp;m=<?= e(rawurlencode($model['folder'])); ?>"><?= e($model['name'] !== '' ? $model['name'] : $model['folder']); ?></a>
            <?php if (!$model['published']): ?>
            <span class="adm-badge adm-badge-draft" title="<?= e(at('visibility.draftHint', 'Salvato ma non visibile sul sito')); ?>"><?= e(adminVisibilityLabel(false)); ?></span>
            <?php endif; ?>
            <span class="adm-folder"><?= e($model['folder']); ?></span>
            <?php if ($model['problem'] !== ''): ?>
            <span class="adm-badge adm-badge-warn" title="<?= e(at('models.hiddenHint', 'Il modello non compare sul sito finché il problema non è risolto.')); ?>"><?= e(adminProblemLabel($model['problem'])); ?></span>
            <?php endif; ?>
          </td>
          <td><?= $model['lat'] !== null && $model['lon'] !== null
              ? e(sprintf('%.5f, %.5f', $model['lat'], $model['lon']))
              : '<span class="adm-muted">' . e(at('models.noPosition', 'non sulla mappa')) . '</span>'; ?></td>
          <td>
            <?= e($model['size'] > 0 ? adminFormatBytes($model['size']) : '—'); ?>
            <?php if ($model['hasSocial']): ?><span class="adm-badge" title="<?= e(at('models.hasSocial', 'Anteprima social presente')); ?>">IMG</span><?php endif; ?>
          </td>
          <td>
            <?php if ($last !== null): ?>
            <span><?= e(adminDate((int) $last['ts'])); ?></span>
            <span class="adm-muted"><?= e(at('models.by', 'da {name}', ['name' => (string) ($last['name'] ?: $last['user'])])); ?></span>
            <?php else: ?>
            <span><?= e(adminDate($model['mtime'])); ?></span>
            <?php endif; ?>
          </td>
          <td class="adm-col-actions">
            <a class="adm-btn adm-btn-small" href="admin.php?p=edit&amp;m=<?= e(rawurlencode($model['folder'])); ?>"><?= e(at('models.edit', 'Modifica')); ?></a>
            <?php if ($model['problem'] === ''): ?>
            <a class="adm-btn adm-btn-small adm-btn-ghost" href="<?= e(adminViewerUrl($model['folder'], $model['published'])); ?>" target="_blank" rel="noopener"><?= e($model['published'] ? at('models.view', 'Apri') : at('models.preview', 'Anteprima')); ?></a>
            <?php endif; ?>
            <?php if (adminCan($user, 'models.edit') && $model['problem'] !== 'meta_missing' && $model['problem'] !== 'meta_invalid'): ?>
            <form method="post" action="admin.php" class="adm-inline">
              <input type="hidden" name="csrf" value="<?= e($csrf); ?>" />
              <input type="hidden" name="action" value="model_publish" />
              <input type="hidden" name="folder" value="<?= e($model['folder']); ?>" />
              <input type="hidden" name="s" value="<?= e($statusFilter); ?>" />
              <?php if ($model['published']): ?>
              <button type="submit" name="publish" value="0" class="adm-btn adm-btn-small adm-btn-ghost" data-confirm="<?= e(at('models.unpublishConfirm', 'Ritirare «{name}» dal sito? Resterà salvato come bozza.', ['name' => $model['name'] !== '' ? $model['name'] : $model['folder']])); ?>"><?= e(at('models.unpublish', 'Ritira')); ?></button>
              <?php else: ?>
              <button type="submit" name="publish" value="1" class="adm-btn adm-btn-small adm-btn-publish"><?= e(at('models.publish', 'Pubblica')); ?></button>
              <?php endif; ?>
            </form>
            <?php endif; ?>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    </div>
    <p class="adm-hint adm-hidden" id="adm-filter-empty"><?= e(at('models.noMatch', 'Nessun modello corrisponde alla ricerca.')); ?></p>
    <?php endif; ?>

<?php elseif ($page === 'edit' || $page === 'new'): ?>
    <?php
    $isNew = $page === 'new';
    $folder = $isNew ? (string) ($form['folder'] ?? '') : (string) $_GET['m'];
    $meta = $isNew ? [] : $editModel['meta'];
    $values = $form['values'] ?? adminFormValues($meta);
    $errors = $form['errors'] ?? [];
    $rev = $isNew ? '' : (string) $editModel['rev'];
    $currentFile = $isNew ? '' : adminModelFileName($folder, $meta);
    $currentPath = adminModelsDir() . '/' . $folder . '/' . $currentFile;
    $socialPath = adminModelsDir() . '/' . $folder . '/' . $folder . '_social.jpg';
    $pendingUpload = (string) ($form['uploadId'] ?? '');
    $pendingMeta = $pendingUpload !== '' ? adminReadStore('uploads/' . $pendingUpload) : [];
    $mapCenter = (array) config('map.center', [43.351726, 12.579768]);
    // Stato salvato su disco (il badge in alto), non quello scelto nel modulo
    $isPublished = $isNew || isModelPublished($meta);
    ?>
    <section class="adm-toolbar">
      <h1>
        <?= e($isNew ? at('new.title', 'Nuovo modello') : ($values['name'] !== '' ? $values['name'] : $folder)); ?>
        <?php if (!$isNew): ?><span class="adm-folder"><?= e($folder); ?></span><?php endif; ?>
        <?php if (!$isNew && !$isPublished): ?><span class="adm-badge adm-badge-draft"><?= e(adminVisibilityLabel(false)); ?></span><?php endif; ?>
      </h1>
      <a href="admin.php" class="adm-btn adm-btn-ghost">← <?= e(at('edit.back', 'Tutti i modelli')); ?></a>
      <?php if (!$isNew && is_file($currentPath)): ?>
      <a href="<?= e(adminViewerUrl($folder, $isPublished)); ?>" class="adm-btn" target="_blank" rel="noopener"><?= e($isPublished ? at('edit.openViewer', 'Apri nel visualizzatore') : at('edit.preview', 'Anteprima nel visualizzatore')); ?> ↗</a>
      <?php endif; ?>
    </section>

    <?php if (!$isNew && !$editModel['valid'] && $editModel['exists']): ?>
    <div class="adm-flash adm-flash-warn"><?= e(at('edit.invalidJson', 'Il file dei metadati di questo modello non è un JSON valido: salvando, verrà riscritto con i valori di questo modulo.')); ?></div>
    <?php endif; ?>

    <?php
    // Schede del modulo: le prime stanno dentro il <form> (un solo
    // salvataggio per tutte), Storico ed Elimina sono pannelli a sé.
    // Senza JavaScript le sezioni restano tutte visibili una sotto l'altra.
    $recent = $isNew ? [] : array_slice(adminHistory(['target' => $folder, 'action' => 'model.']), 0, 15);
    $tabs = [
        'info' => at('edit.info', 'Informazioni'),
        'position' => at('tab.position', 'Posizione'),
        'file' => at('edit.modelFile', 'File 3D'),
        'orientation' => at('edit.orientation', 'Orientamento'),
        'social' => at('tab.social', 'Anteprima'),
    ];
    if (!$isNew) {
        $tabs['history'] = at('nav.history', 'Storico');
        if (adminCan($user, 'models.delete')) {
            $tabs['delete'] = at('tab.delete', 'Elimina');
        }
    }
    ?>
    <div class="adm-tabbed" data-tabs data-default-tab="info"
         data-msg-unsaved="<?= e(at('tab.unsaved', 'Ci sono modifiche non salvate: uscendo andranno perse.')); ?>">
    <nav class="adm-tabs" role="tablist" aria-label="<?= e(at('tab.label', 'Sezioni del modello')); ?>" hidden>
      <?php foreach ($tabs as $tabId => $tabLabel): ?>
      <button type="button" role="tab" id="tab-btn-<?= e($tabId); ?>" aria-controls="tab-<?= e($tabId); ?>" aria-selected="false" tabindex="-1" data-tab="<?= e($tabId); ?>" class="adm-tab<?= $tabId === 'delete' ? ' adm-tab-danger' : ''; ?>">
        <span><?= e($tabLabel); ?></span>
        <?php if ($tabId === 'history' && $recent !== []): ?><span class="adm-tab-count"><?= count($recent) >= 15 ? '15+' : count($recent); ?></span><?php endif; ?>
        <?php if ($tabId === 'file' && $isNew): ?><span class="adm-tab-required" aria-hidden="true">*</span><?php endif; ?>
        <span class="adm-tab-dot" aria-hidden="true"></span>
      </button>
      <?php endforeach; ?>
    </nav>
    <form method="post" action="admin.php?p=<?= e($page); ?><?= $isNew ? '' : '&amp;m=' . e(rawurlencode($folder)); ?>" enctype="multipart/form-data" class="adm-form adm-card adm-tab-host" id="adm-model-form"
          <?= $isNew ? 'data-wizard="1" data-msg-step="' . e(at('tab.stepOf', 'Passo {n} di {total}')) . '"' : ''; ?>
          data-upload-url="api/admin_upload.php"
          data-csrf="<?= e($csrf); ?>"
          data-max-bytes="<?= ADMIN_MAX_MODEL_BYTES; ?>"
          data-msg-uploading="<?= e(at('upload.uploading', 'Caricamento del file 3D: {percent}% ({done} di {total})')); ?>"
          data-msg-saving="<?= e(at('upload.saving', 'File caricato, salvataggio in corso…')); ?>"
          data-msg-error="<?= e(at('upload.error', 'Caricamento interrotto: {error}')); ?>"
          data-msg-leave="<?= e(at('upload.leave', 'Il caricamento è in corso: uscendo andrà perso.')); ?>"
          data-messages="<?= e((string) json_encode(array_combine(
              $jsCodes = ['model_bad_type', 'model_too_large', 'model_invalid', 'model_version', 'disk_full', 'not_writable', 'write_failed', 'session_expired', 'csrf', 'forbidden', 'upload_missing'],
              array_map('adminMessage', $jsCodes)
          ), JSON_UNESCAPED_UNICODE)); ?>">
      <input type="hidden" name="csrf" value="<?= e($csrf); ?>" />
      <input type="hidden" name="action" value="model_save" />
      <input type="hidden" name="mode" value="<?= $isNew ? 'new' : 'edit'; ?>" />
      <input type="hidden" name="rev" value="<?= e($rev); ?>" />
      <input type="hidden" name="base" value="<?= e((string) json_encode($isNew ? [] : adminFormValues($meta), JSON_UNESCAPED_UNICODE)); ?>" />
      <input type="hidden" name="upload_id" id="f-upload-id" value="<?= e($pendingUpload); ?>" />

      <section class="adm-tab-panel" id="tab-info" role="tabpanel" aria-labelledby="tab-btn-info" data-panel="info">
        <h2 class="adm-panel-title"><?= e(at('edit.info', 'Informazioni')); ?></h2>
        <?php adminInput('name', at('field.name', 'Nome'), $values['name'], $errors, ['required' => true, 'maxlength' => ADMIN_NAME_MAX], at('edit.nameHint', 'Mostrato su mappa, elenco e selettore del visualizzatore.')); ?>
        <?php if ($isNew): ?>
        <?php adminInput('folder', at('field.folder', 'Cartella'), $folder, $errors, ['maxlength' => 64, 'pattern' => '[a-z0-9][a-z0-9_\-]{0,63}', 'data-auto-slug' => '1', 'spellcheck' => 'false'], at('edit.folderHint', 'Identifica il modello negli indirizzi (viewer.php?m=…): non si può cambiare dopo. Proposta in automatico dal nome.')); ?>
        <?php else: ?>
        <input type="hidden" name="folder" value="<?= e($folder); ?>" />
        <?php endif; ?>
        <p class="adm-field<?= isset($errors['description']) ? ' adm-field-error' : ''; ?>">
          <label for="f-description"><?= e(at('field.description', 'Descrizione')); ?></label>
          <textarea id="f-description" name="description" rows="5" maxlength="<?= ADMIN_DESCRIPTION_MAX; ?>"><?= e($values['description']); ?></textarea>
          <?php if (isset($errors['description'])): ?>
          <span class="adm-error-text"><?= e(adminFieldError('description', $errors['description'])); ?></span>
          <?php else: ?>
          <span class="adm-hint"><?= e(at('edit.descriptionHint', 'Testo del popup sulla mappa, delle informazioni del modello e delle anteprime social.')); ?></span>
          <?php endif; ?>
        </p>
        <div class="adm-field adm-visibility" role="radiogroup" aria-labelledby="f-published-label">
          <span class="adm-label" id="f-published-label"><?= e(at('field.published', 'Visibilità')); ?></span>
          <label class="adm-choice">
            <input type="radio" name="published" value="1" <?= $values['published'] === '1' ? 'checked' : ''; ?> />
            <span><strong><?= e(adminVisibilityLabel(true)); ?></strong>
              <span class="adm-hint"><?= e(at('visibility.publishedHint', 'Visibile sulla mappa, nell\'elenco e nel visualizzatore.')); ?></span></span>
          </label>
          <label class="adm-choice">
            <input type="radio" name="published" value="0" <?= $values['published'] === '0' ? 'checked' : ''; ?> />
            <span><strong><?= e(adminVisibilityLabel(false)); ?></strong>
              <span class="adm-hint"><?= e(at('visibility.draftHintLong', 'Salvato con tutti i suoi file ma nascosto al pubblico: lo vedi solo dal pannello, in anteprima. Pubblicalo quando è pronto.')); ?></span></span>
          </label>
        </div>
      </section>

      <section class="adm-tab-panel" id="tab-position" role="tabpanel" aria-labelledby="tab-btn-position" data-panel="position">
        <h2 class="adm-panel-title"><?= e(at('edit.position', 'Posizione sulla mappa')); ?></h2>
        <div class="adm-row">
          <?php adminInput('lat', at('field.lat', 'Latitudine'), $values['lat'], $errors, ['inputmode' => 'decimal', 'placeholder' => '43.35172']); ?>
          <?php adminInput('lon', at('field.lon', 'Longitudine'), $values['lon'], $errors, ['inputmode' => 'decimal', 'placeholder' => '12.57976']); ?>
        </div>
        <div id="adm-map" class="adm-map"
             data-center="<?= e(json_encode([(float) ($mapCenter[0] ?? 43.35), (float) ($mapCenter[1] ?? 12.58)])); ?>"
             data-tile-url="<?= e((string) config('map.tileUrl', 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')); ?>"
             data-attribution="&amp;copy; &lt;a href=&quot;https://www.openstreetmap.org/copyright&quot;&gt;OpenStreetMap&lt;/a&gt;"
             aria-label="<?= e(at('edit.mapLabel', 'Mappa: fai clic per posizionare il modello')); ?>"></div>
        <p class="adm-hint">
          <?= e(at('edit.mapHint', 'Fai clic sulla mappa o trascina il segnaposto. Senza coordinate il modello non compare sulla mappa, ma resta nel selettore del visualizzatore.')); ?>
          <button type="button" class="adm-link" id="adm-clear-position"><?= e(at('edit.clearPosition', 'Togli la posizione')); ?></button>
        </p>
      </section>

      <section class="adm-tab-panel" id="tab-file" role="tabpanel" aria-labelledby="tab-btn-file" data-panel="file">
        <h2 class="adm-panel-title"><?= e(at('edit.modelFile', 'File 3D')); ?></h2>
        <?php if (!$isNew): ?>
        <p class="adm-current">
          <?php if (is_file($currentPath)): ?>
          <strong><?= e($currentFile); ?></strong> · <?= e(adminFormatBytes((int) filesize($currentPath))); ?> · <?= e(adminDate((int) filemtime($currentPath))); ?>
          <?php else: ?>
          <span class="adm-badge adm-badge-warn"><?= e(at('problem.file_missing', 'file 3D mancante')); ?></span> <?= e($currentFile); ?>
          <?php endif; ?>
        </p>
        <?php endif; ?>
        <p class="adm-field<?= isset($errors['model_file']) ? ' adm-field-error' : ''; ?>">
          <label for="f-model-file"><?= e($isNew ? at('edit.uploadFile', 'Carica il file (GLB)') : at('edit.replaceFile', 'Sostituisci con un nuovo file')); ?></label>
          <span class="adm-dropzone" id="adm-dropzone"
                data-msg-none="<?= e(at('drop.none', 'Nessun file selezionato')); ?>"
                data-msg-chosen="<?= e(at('drop.chosen', 'File scelto: {name} ({size})')); ?>">
            <input type="file" id="f-model-file" name="model_file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" <?= $isNew && $pendingUpload === '' ? 'required' : ''; ?> />
            <?php // Interfaccia di trascinamento: mostrata da js/admin.js, senza JavaScript resta il campo classico ?>
            <span class="adm-dropzone-ui" aria-hidden="true">
              <span class="adm-dropzone-icon">⬆</span>
              <span class="adm-dropzone-title"><?= e(at('drop.title', 'Trascina qui il file GLB')); ?></span>
              <span class="adm-dropzone-or"><?= e(at('drop.or', 'oppure')); ?></span>
              <span class="adm-btn adm-btn-small adm-dropzone-pick"><?= e(at('drop.pick', 'Scegli un file dal computer')); ?></span>
              <span class="adm-dropzone-file" id="adm-dropzone-file"></span>
            </span>
          </span>
          <?php if (isset($errors['model_file'])): ?>
          <span class="adm-error-text"><?= e(adminMessage($errors['model_file'])); ?></span>
          <?php endif; ?>
          <?php if ($pendingMeta !== [] && is_file(adminDataPath('uploads/' . $pendingUpload . '.part'))): ?>
          <span class="adm-hint adm-pending" id="adm-pending-upload"><?= e(at('edit.pendingUpload', 'Già caricato: {name} ({size}). Salva per usarlo, o scegli un altro file.', ['name' => (string) ($pendingMeta['name'] ?? ''), 'size' => adminFormatBytes((int) ($pendingMeta['size'] ?? 0))])); ?></span>
          <?php endif; ?>
          <span class="adm-hint"><?= e($isNew
              ? at('edit.uploadHint', 'GLB consigliato, meglio se ottimizzato con il GLB Optimizer (Draco, texture JPEG/WebP). I file grandi vengono caricati a blocchi.')
              : at('edit.replaceHint', 'Il file attuale non viene cancellato: finisce nel cestino, da dove un amministratore può ripristinarlo.')); ?></span>
        </p>
        <div class="adm-progress adm-hidden" id="adm-upload-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="adm-progress-bar"></div>
          <span class="adm-progress-text"></span>
          <button type="button" class="adm-link" id="adm-upload-cancel"><?= e(at('upload.cancel', 'Annulla')); ?></button>
        </div>
      </section>

      <section class="adm-tab-panel" id="tab-orientation" role="tabpanel" aria-labelledby="tab-btn-orientation" data-panel="orientation">
        <h2 class="adm-panel-title"><?= e(at('edit.orientation', 'Orientamento')); ?></h2>
        <div class="adm-row adm-row-3">
          <?php adminInput('rotX', at('field.rotX', 'Rotazione X'), $values['rotX'], $errors, ['inputmode' => 'decimal', 'placeholder' => '0']); ?>
          <?php adminInput('rotY', at('field.rotY', 'Rotazione Y'), $values['rotY'], $errors, ['inputmode' => 'decimal', 'placeholder' => '0']); ?>
          <?php adminInput('rotZ', at('field.rotZ', 'Rotazione Z'), $values['rotZ'], $errors, ['inputmode' => 'decimal', 'placeholder' => '0']); ?>
        </div>
        <p class="adm-hint"><?= e(at('edit.orientationHint', 'In gradi. Serve ai modelli esportati con l\'asse Z verso l\'alto (es. CloudCompare): di solito X = -90.')); ?></p>
        <?php
        // Anteprima 3D: il file salvato (una bozza passa dal pannello, la
        // sua cartella è chiusa al web) o quello appena scelto in "File 3D".
        // Costruita da js/admin-orientation.js; senza JavaScript resta nascosta.
        $previewExt = strtolower((string) pathinfo($currentFile, PATHINFO_EXTENSION));
        $previewUrl = '';
        $previewSize = 0;
        if (!$isNew && is_file($currentPath) && ($previewExt === 'glb' || $previewExt === 'gltf')) {
            $previewUrl = $isPublished
                ? $modelsUrl . '/' . rawurlencode($folder) . '/' . rawurlencode($currentFile)
                : 'api/admin_model.php?m=' . rawurlencode($folder) . '&f=' . rawurlencode($currentFile);
            $previewSize = (int) filesize($currentPath);
        }
        ?>
        <div class="adm-orient" id="adm-orient" hidden
             data-model-url="<?= e($previewUrl); ?>"
             data-model-size="<?= $previewSize; ?>"
             data-auto-bytes="<?= 60 * 1024 * 1024; ?>"
             data-msg-loading="<?= e(at('edit.orientLoading', 'Caricamento del modello… {percent}%')); ?>"
             data-msg-parsing="<?= e(at('edit.orientParsing', 'Preparazione del modello…')); ?>"
             data-msg-error="<?= e(at('edit.orientError', 'Impossibile mostrare il modello: {error}')); ?>"
             data-msg-none="<?= e(at('edit.orientNone', 'Carica un file 3D (scheda «File 3D») per vedere qui l\'anteprima.')); ?>"
             data-msg-unsupported="<?= e(at('edit.orientUnsupported', 'L\'anteprima è disponibile solo per i file GLB/glTF.')); ?>"
             data-msg-big="<?= e(at('edit.orientBig', 'Il modello pesa {size}: caricalo solo se serve.')); ?>"
             data-msg-local="<?= e(at('edit.orientLocal', 'Anteprima del file scelto ({name}), non ancora salvato.')); ?>"
             data-msg-nowebgl="<?= e(at('edit.orientNoWebgl', 'Il browser non supporta WebGL: imposta i gradi a mano.')); ?>">
          <div class="adm-orient-stage">
            <div class="adm-orient-canvas" id="adm-orient-canvas" role="img" aria-label="<?= e(at('edit.orientCanvas', 'Anteprima 3D del modello con la griglia del pavimento')); ?>"></div>
            <div class="adm-orient-status" id="adm-orient-status">
              <span class="adm-orient-status-text"></span>
              <button type="button" class="adm-btn adm-btn-small" id="adm-orient-load" hidden><?= e(at('edit.orientLoad', 'Carica l\'anteprima 3D')); ?></button>
            </div>
            <div class="adm-orient-views" role="group" aria-label="<?= e(at('edit.orientViews', 'Punto di vista')); ?>">
              <button type="button" class="adm-btn adm-btn-small" data-orient-view="viewer" aria-pressed="true" title="<?= e(at('edit.orientViewViewerTitle', 'Il punto di vista con cui il visualizzatore apre il modello')); ?>"><?= e(at('edit.orientViewViewer', 'Visualizzatore')); ?></button>
              <button type="button" class="adm-btn adm-btn-small" data-orient-view="iso" aria-pressed="false"><?= e(at('edit.orientViewIso', '3D')); ?></button>
              <button type="button" class="adm-btn adm-btn-small" data-orient-view="front" aria-pressed="false"><?= e(at('edit.orientViewFront', 'Fronte')); ?></button>
              <button type="button" class="adm-btn adm-btn-small" data-orient-view="side" aria-pressed="false"><?= e(at('edit.orientViewSide', 'Lato')); ?></button>
              <button type="button" class="adm-btn adm-btn-small" data-orient-view="top" aria-pressed="false"><?= e(at('edit.orientViewTop', 'Alto')); ?></button>
            </div>
            <span class="adm-orient-up" aria-hidden="true">↑ <?= e(at('edit.orientUp', 'alto')); ?></span>
            <p class="adm-orient-local" id="adm-orient-local" hidden></p>
            <p class="adm-orient-viewnote" id="adm-orient-viewnote" hidden><?= e(at('edit.orientViewNote', 'Vista di controllo: non viene salvata. Torna a «Visualizzatore» per scegliere come si apre il modello.')); ?></p>
          </div>
          <div class="adm-orient-tools">
            <?php foreach (['x' => 'rotX', 'y' => 'rotY', 'z' => 'rotZ'] as $axis => $field): ?>
            <div class="adm-orient-axis adm-orient-axis-<?= $axis; ?>">
              <span class="adm-orient-axis-name"><?= strtoupper($axis); ?></span>
              <button type="button" class="adm-btn adm-btn-small" data-orient-turn="<?= $axis; ?>" data-orient-deg="-90" title="<?= e(at('edit.orientTurn', 'Ruota di {deg}° attorno all\'asse {axis}', ['deg' => '-90', 'axis' => strtoupper($axis)])); ?>">↺ 90°</button>
              <input type="range" min="-180" max="180" step="1" value="0" data-orient-slider="<?= e($field); ?>" aria-label="<?= e(at('field.' . $field, 'Rotazione ' . strtoupper($axis))); ?>" />
              <button type="button" class="adm-btn adm-btn-small" data-orient-turn="<?= $axis; ?>" data-orient-deg="90" title="<?= e(at('edit.orientTurn', 'Ruota di {deg}° attorno all\'asse {axis}', ['deg' => '+90', 'axis' => strtoupper($axis)])); ?>">↻ 90°</button>
            </div>
            <?php endforeach; ?>
            <p class="adm-orient-actions">
              <button type="button" class="adm-btn adm-btn-small" data-orient-preset="zup"><?= e(at('edit.orientZup', 'Z in alto → Y in alto')); ?></button>
              <button type="button" class="adm-btn adm-btn-small adm-btn-ghost" data-orient-preset="zero"><?= e(at('edit.orientZero', 'Azzera')); ?></button>
              <button type="button" class="adm-btn adm-btn-small adm-btn-ghost" data-orient-preset="saved"><?= e(at('edit.orientRevert', 'Ripristina i valori salvati')); ?></button>
            </p>
            <p class="adm-hint"><?= e(at('edit.orientHint', 'Nella vista «Visualizzatore» vedi esattamente come il visualizzatore aprirà il modello: trascina per girare il modello (non la camera) finché l\'ingresso o la parte che vuoi mostrare è inquadrata come preferisci, il pavimento della grotta è parallelo alla griglia e l\'alto è verso l\'alto, poi salva. Si salvano solo i gradi dei campi qui sopra, e il visualizzatore riparte sempre da questa vista. Le viste 3D, Fronte, Lato e Alto servono a controllare il risultato: lì trascinare gira la camera e non cambia nulla di ciò che viene salvato. I pulsanti ruotano attorno agli assi del mondo: rosso X, verde Y (verticale), blu Z.')); ?></p>
          </div>
        </div>
      </section>

      <section class="adm-tab-panel" id="tab-social" role="tabpanel" aria-labelledby="tab-btn-social" data-panel="social">
        <h2 class="adm-panel-title"><?= e(at('edit.social', 'Anteprima social')); ?></h2>
        <?php if (!$isNew && is_file($socialPath)): ?>
        <figure class="adm-social">
          <?php // Bozza: cartella chiusa al web, l'immagine passa dal pannello
          $socialUrl = $isPublished
              ? $modelsUrl . '/' . rawurlencode($folder) . '/' . rawurlencode($folder . '_social.jpg') . '?v=' . (int) filemtime($socialPath)
              : 'api/admin_model.php?m=' . rawurlencode($folder) . '&f=' . rawurlencode($folder . '_social.jpg') . '&v=' . (int) filemtime($socialPath); ?>
          <img src="<?= e($socialUrl); ?>" alt="" loading="lazy" />
          <figcaption>
            <label class="adm-check"><input type="checkbox" name="social_delete" value="1" /> <?= e(at('edit.socialDelete', 'Elimina (il visualizzatore ne genera una nuova alla prossima visita)')); ?></label>
          </figcaption>
        </figure>
        <?php endif; ?>
        <p class="adm-field">
          <label for="f-social"><?= e(at('edit.socialUpload', 'Carica un\'immagine')); ?></label>
          <input type="file" id="f-social" name="social_image" accept="image/jpeg,image/png,image/webp" />
          <span class="adm-hint"><?= e(at('edit.socialHint', 'Facoltativa, idealmente 1200×630. Se manca viene generata automaticamente dal visualizzatore.')); ?></span>
        </p>
      </section>

      <?php if ($isNew): ?>
      <?php // Nuovo modello: procedura a passi. Con JavaScript "Crea modello"
            // compare solo all'ultimo passo (prima c'è "Avanti"); senza, il
            // modulo è una pagina unica con il solo pulsante di creazione. ?>
      <p class="adm-actions adm-sticky-actions adm-wizard-actions">
        <a href="admin.php" class="adm-btn adm-btn-ghost"><?= e(at('edit.cancel', 'Annulla')); ?></a>
        <span class="adm-tab-steps" hidden>
          <span class="adm-step-count" id="adm-step-count" aria-live="polite"></span>
          <button type="button" class="adm-btn adm-btn-ghost" data-tab-step="-1">← <?= e(at('tab.prev', 'Indietro')); ?></button>
          <button type="button" class="adm-btn adm-btn-primary" data-tab-step="1"><?= e(at('tab.next', 'Avanti')); ?> →</button>
        </span>
        <button type="submit" class="adm-btn adm-btn-primary" id="adm-save"><?= e(at('new.submit', 'Crea modello')); ?></button>
      </p>
      <?php else: ?>
      <p class="adm-actions adm-sticky-actions">
        <button type="submit" class="adm-btn adm-btn-primary" id="adm-save"><?= e(at('edit.submit', 'Salva modifiche')); ?></button>
        <a href="admin.php" class="adm-btn adm-btn-ghost"><?= e(at('edit.cancel', 'Annulla')); ?></a>
        <span class="adm-unsaved" id="adm-unsaved" hidden><?= e(at('tab.unsavedShort', 'Modifiche non salvate')); ?></span>
        <span class="adm-tab-steps" hidden>
          <button type="button" class="adm-btn adm-btn-ghost adm-btn-small" data-tab-step="-1">← <?= e(at('tab.prev', 'Indietro')); ?></button>
          <button type="button" class="adm-btn adm-btn-small" data-tab-step="1"><?= e(at('tab.next', 'Avanti')); ?> →</button>
        </span>
      </p>
      <?php endif; ?>
    </form>

    <?php if (!$isNew): ?>
    <section class="adm-tab-panel adm-card" id="tab-history" role="tabpanel" aria-labelledby="tab-btn-history" data-panel="history">
      <h2 class="adm-panel-title"><?= e(at('edit.recent', 'Modifiche recenti')); ?></h2>
      <?php if ($recent === []): ?>
      <p class="adm-muted"><?= e(at('history.emptyModel', 'Nessuna modifica registrata dal pannello per questo modello.')); ?></p>
      <?php else: ?>
      <ol class="adm-timeline">
        <?php foreach ($recent as $entry): ?>
        <li>
          <span class="adm-when"><?= e(adminDate((int) $entry['ts'])); ?> · <?= e((string) ($entry['name'] ?: $entry['user'])); ?></span>
          <span class="adm-what"><?= e(adminActionLabel((string) $entry['action'])); ?></span>
          <?= adminRenderDetails($entry); ?>
        </li>
        <?php endforeach; ?>
      </ol>
      <p><a href="admin.php?p=history&amp;m=<?= e(rawurlencode($folder)); ?>"><?= e(at('edit.fullHistory', 'Storico completo')); ?> →</a></p>
      <?php endif; ?>
    </section>

    <?php if (adminCan($user, 'models.delete')): ?>
    <section class="adm-tab-panel adm-card adm-danger" id="tab-delete" role="tabpanel" aria-labelledby="tab-btn-delete" data-panel="delete">
      <h2 class="adm-panel-title"><?= e(at('edit.delete', 'Elimina modello')); ?></h2>
      <p class="adm-hint"><?= e(at('edit.deleteHint', 'Il modello sparisce dal sito e finisce nel cestino con tutti i suoi file: si può ripristinare.')); ?></p>
      <form method="post" action="admin.php" class="adm-form adm-delete-form">
        <input type="hidden" name="csrf" value="<?= e($csrf); ?>" />
        <input type="hidden" name="action" value="model_delete" />
        <input type="hidden" name="folder" value="<?= e($folder); ?>" />
        <p class="adm-field">
          <label for="f-confirm"><?= e(at('edit.deleteConfirm', 'Per confermare scrivi {folder}', ['folder' => $folder])); ?></label>
          <input type="text" id="f-confirm" name="confirm" required autocomplete="off" spellcheck="false" />
        </p>
        <p class="adm-actions"><button type="submit" class="adm-btn adm-btn-danger"><?= e(at('edit.deleteSubmit', 'Sposta nel cestino')); ?></button></p>
      </form>
    </section>
    <?php endif; ?>
    <?php endif; ?>
    </div>

<?php elseif ($page === 'history'): ?>
    <?php
    $filter = [
        'target' => isValidModelFolder((string) ($_GET['m'] ?? '')) ? (string) $_GET['m'] : '',
        'user' => adminValidUsername((string) ($_GET['u'] ?? '')) ? (string) $_GET['u'] : '',
        'action' => in_array($_GET['a'] ?? '', ['model.', 'user.', 'login', 'account.'], true) ? (string) $_GET['a'] : '',
    ];
    $entries = adminHistory($filter);
    $perPage = 50;
    $total = count($entries);
    $pages = max(1, (int) ceil($total / $perPage));
    $current = min($pages, max(1, (int) ($_GET['page'] ?? 1)));
    $entries = array_slice($entries, ($current - 1) * $perPage, $perPage);
    $allModels = adminListModels();
    $allUsers = adminUsers();
    // Anche gli utenti eliminati compaiono nel filtro, se hanno lasciato tracce
    $historyUsers = [];
    foreach (adminHistory() as $entry) {
        if (($entry['user'] ?? '') !== '') {
            $historyUsers[(string) $entry['user']] = (string) ($entry['name'] ?: $entry['user']);
        }
    }
    foreach ($allUsers as $name => $data) {
        $historyUsers[$name] = adminDisplayName($name);
    }
    asort($historyUsers);
    ?>
    <section class="adm-toolbar">
      <h1><?= e(at('nav.history', 'Storico')); ?> <span class="adm-count"><?= $total; ?></span></h1>
    </section>
    <form method="get" action="admin.php" class="adm-filters adm-card">
      <input type="hidden" name="p" value="history" />
      <label><?= e(at('history.model', 'Modello')); ?>
        <select name="m">
          <option value=""><?= e(at('history.all', 'Tutti')); ?></option>
          <?php foreach ($allModels as $model): ?>
          <option value="<?= e($model['folder']); ?>" <?= $filter['target'] === $model['folder'] ? 'selected' : ''; ?>><?= e($model['name'] !== '' ? $model['name'] : $model['folder']); ?></option>
          <?php endforeach; ?>
          <?php if ($filter['target'] !== '' && !in_array($filter['target'], array_column($allModels, 'folder'), true)): ?>
          <option value="<?= e($filter['target']); ?>" selected><?= e($filter['target']); ?></option>
          <?php endif; ?>
        </select>
      </label>
      <label><?= e(at('history.user', 'Utente')); ?>
        <select name="u">
          <option value=""><?= e(at('history.all', 'Tutti')); ?></option>
          <?php foreach ($historyUsers as $name => $label): ?>
          <option value="<?= e($name); ?>" <?= $filter['user'] === $name ? 'selected' : ''; ?>><?= e($label); ?> (<?= e($name); ?>)</option>
          <?php endforeach; ?>
        </select>
      </label>
      <label><?= e(at('history.type', 'Tipo')); ?>
        <select name="a">
          <option value=""><?= e(at('history.all', 'Tutti')); ?></option>
          <option value="model." <?= $filter['action'] === 'model.' ? 'selected' : ''; ?>><?= e(at('history.typeModels', 'Modelli')); ?></option>
          <option value="user." <?= $filter['action'] === 'user.' ? 'selected' : ''; ?>><?= e(at('history.typeUsers', 'Utenti')); ?></option>
          <option value="account." <?= $filter['action'] === 'account.' ? 'selected' : ''; ?>><?= e(at('history.typeAccount', 'Profili')); ?></option>
          <option value="login" <?= $filter['action'] === 'login' ? 'selected' : ''; ?>><?= e(at('history.typeLogin', 'Accessi')); ?></option>
        </select>
      </label>
      <button type="submit" class="adm-btn"><?= e(at('history.filter', 'Filtra')); ?></button>
      <?php if (array_filter($filter) !== []): ?>
      <a href="admin.php?p=history" class="adm-link"><?= e(at('history.reset', 'Azzera filtri')); ?></a>
      <?php endif; ?>
    </form>
    <?php if ($entries === []): ?>
    <section class="adm-card adm-empty"><p><?= e(at('history.empty', 'Nessun evento registrato.')); ?></p></section>
    <?php else: ?>
    <div class="adm-table-wrap">
    <table class="adm-table adm-history">
      <thead>
        <tr>
          <th><?= e(at('history.when', 'Quando')); ?></th>
          <th><?= e(at('history.who', 'Chi')); ?></th>
          <th><?= e(at('history.what', 'Cosa')); ?></th>
          <th><?= e(at('history.target', 'Su')); ?></th>
          <th><?= e(at('history.details', 'Dettagli')); ?></th>
        </tr>
      </thead>
      <tbody>
      <?php foreach ($entries as $entry):
          $action = (string) ($entry['action'] ?? '');
          $target = (string) ($entry['target'] ?? '');
          $isModel = strpos($action, 'model.') === 0 || $action === 'trash.purge'; ?>
        <tr class="adm-action-<?= e(str_replace(['.', '_'], '-', $action)); ?>">
          <td class="adm-nowrap"><?= e(adminDate((int) ($entry['ts'] ?? 0))); ?></td>
          <td>
            <?php if (($entry['user'] ?? '') !== ''): ?>
            <a href="admin.php?p=history&amp;u=<?= e(rawurlencode((string) $entry['user'])); ?>"><?= e((string) ($entry['name'] ?: $entry['user'])); ?></a>
            <?php else: ?><span class="adm-muted">—</span><?php endif; ?>
          </td>
          <td><?= e(adminActionLabel($action)); ?></td>
          <td>
            <?php if ($target !== '' && $isModel): ?>
            <a href="admin.php?p=history&amp;m=<?= e(rawurlencode($target)); ?>"><?= e($target); ?></a>
            <?php elseif ($target !== ''): ?>
            <?= e($target); ?>
            <?php endif; ?>
          </td>
          <td><?= adminRenderDetails($entry); ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    </div>
    <?php if ($pages > 1): ?>
    <nav class="adm-pager" aria-label="<?= e(at('history.pages', 'Pagine')); ?>">
      <?php for ($i = 1; $i <= $pages; $i++): ?>
      <?php if ($i === $current): ?>
      <span class="active"><?= $i; ?></span>
      <?php else: ?>
      <a href="admin.php?<?= e(http_build_query(array_filter(['p' => 'history', 'm' => $filter['target'], 'u' => $filter['user'], 'a' => $filter['action'], 'page' => $i]))); ?>"><?= $i; ?></a>
      <?php endif; ?>
      <?php endfor; ?>
    </nav>
    <?php endif; ?>
    <?php endif; ?>

<?php elseif ($page === 'stats'): ?>
    <?php
    $statsDays = statsLoadDays();
    $summary = statsSummary($statsDays);
    $statsModels = adminListModels();
    $modelNames = [];
    foreach ($statsModels as $model) {
        $modelNames[$model['folder']] = $model['name'] !== '' ? $model['name'] : $model['folder'];
    }
    // Anche i modelli eliminati restano nelle statistiche, con il nome della cartella
    foreach (array_keys($summary['perModel']) as $folder) {
        $modelNames[$folder] = $modelNames[$folder] ?? $folder;
    }
    $range = in_array($_GET['r'] ?? '', STATS_RANGES, true) ? (string) $_GET['r'] : '30d';
    $chartFolder = (string) ($_GET['m'] ?? '');
    if (!isset($modelNames[$chartFolder])) {
        $chartFolder = '';
    }
    $series = statsSeries($statsDays, $range, $chartFolder);
    $firstDay = statsFirstDay($statsDays);
    $created = statsModelCreated();
    $sortKey = array_key_exists($_GET['s'] ?? '', STATS_PERIODS) ? (string) $_GET['s'] : 'all';

    $periodLabels = [
        '7d' => at('stats.period7d', 'Ultimi 7 giorni'),
        '30d' => at('stats.period30d', 'Ultimi 30 giorni'),
        '365d' => at('stats.period365d', 'Ultimo anno'),
        'all' => at('stats.periodAll', 'Totale'),
    ];
    $rangeLabels = [
        '7d' => at('stats.range7d', '7 giorni'),
        '30d' => at('stats.range30d', '30 giorni'),
        '12m' => at('stats.range12m', '12 mesi'),
        'all' => at('stats.rangeAll', 'Da sempre'),
    ];
    $empty = array_fill_keys(array_keys(STATS_PERIODS), 0);
    $rows = [];
    foreach ($modelNames as $folder => $name) {
        $rows[] = [
            'folder' => (string) $folder,
            'name' => $name,
            'counts' => $summary['perModel'][$folder] ?? $empty,
            'embed' => (int) ($summary['embed'][$folder] ?? 0),
            'created' => (int) ($created[$folder] ?? 0),
            'last' => (string) ($summary['lastDay'][$folder] ?? ''),
            'exists' => in_array((string) $folder, array_column($statsModels, 'folder'), true),
        ];
    }
    usort($rows, static function (array $a, array $b) use ($sortKey): int {
        return [$b['counts'][$sortKey], $b['counts']['all']] <=> [$a['counts'][$sortKey], $a['counts']['all']]
            ?: strcasecmp($a['name'], $b['name']);
    });
    $maxTotal = max(array_merge([1], array_map(static fn(array $r): int => (int) $r['counts'][$sortKey], $rows)));
    $fmt = static fn(int $n): string => number_format($n, 0, ',', '.');
    $dayLabel = static function (string $key): string {
        return strlen($key) === 7
            ? substr($key, 5, 2) . '/' . substr($key, 0, 4)
            : substr($key, 8, 2) . '/' . substr($key, 5, 2) . '/' . substr($key, 0, 4);
    };
    $statsUrl = static function (array $params) use ($range, $chartFolder, $sortKey): string {
        $query = array_filter(['p' => 'stats', 'r' => $range !== '30d' ? $range : '', 'm' => $chartFolder, 's' => $sortKey !== 'all' ? $sortKey : ''] , 'strlen');
        $query = array_filter(array_merge($query, $params), 'strlen');
        return 'admin.php?' . http_build_query($query);
    };
    $seriesNames = [
        'visits' => at('stats.siteVisits', 'Visite al sito'),
        'models' => $chartFolder !== ''
            ? at('stats.modelViewsOf', 'Aperture di «{name}»', ['name' => $modelNames[$chartFolder]])
            : at('stats.modelViews', 'Modelli aperti'),
    ];
    $chartData = [
        'range' => $range,
        'lang' => $lang,
        'points' => $series,
        'series' => $chartFolder !== ''
            ? [['key' => 'models', 'name' => $seriesNames['models'], 'slot' => 2]]
            : [['key' => 'visits', 'name' => $seriesNames['visits'], 'slot' => 1], ['key' => 'models', 'name' => $seriesNames['models'], 'slot' => 2]],
        'empty' => at('stats.chartEmpty', 'Nessuna visita registrata in questo periodo.'),
        // L'ultimo punto (oggi o il mese in corso) è ancora parziale
        'partial' => at('stats.partial', 'in corso'),
    ];
    ?>
    <section class="adm-toolbar">
      <h1><?= e(at('nav.stats', 'Statistiche')); ?></h1>
      <?php if ($statsDays !== []): ?>
      <a href="<?= e($statsUrl(['export' => 'csv'])); ?>" class="adm-btn adm-btn-ghost" download><?= e(at('stats.exportCsv', 'Esporta CSV')); ?></a>
      <?php endif; ?>
    </section>

    <?php if (!statsEnabled()): ?>
    <div class="adm-flash adm-flash-warn" role="status"><?= e(at('stats.disabled', 'Il conteggio delle visite è disattivato ([stats] enabled = false in custom/settings.ini): qui sotto restano i dati raccolti finora.')); ?></div>
    <?php endif; ?>

    <section class="adm-stats-kpis">
      <?php foreach (['site' => [at('stats.siteVisits', 'Visite al sito'), at('stats.siteVisitsHint', 'Una per sessione del browser, da qualsiasi pagina del sito')], 'models' => [at('stats.modelViews', 'Modelli aperti'), at('stats.modelViewsHint', 'Aperture dei modelli 3D, anche incorporati in altri siti')]] as $kpi => [$title, $hint]): ?>
      <div class="adm-card adm-kpi-card">
        <h2><?= e($title); ?></h2>
        <p class="adm-hint"><?= e($hint); ?></p>
        <dl class="adm-kpis">
          <?php foreach ($periodLabels as $key => $label): ?>
          <div class="adm-kpi<?= $key === 'all' ? ' adm-kpi-total' : ''; ?>">
            <dt><?= e($label); ?></dt>
            <dd><?= e($fmt((int) $summary[$kpi][$key])); ?></dd>
          </div>
          <?php endforeach; ?>
        </dl>
      </div>
      <?php endforeach; ?>
    </section>

    <section class="adm-card adm-chart-card">
      <div class="adm-chart-head">
        <h2><?= e(at('stats.trend', 'Andamento')); ?></h2>
        <nav class="adm-segmented" aria-label="<?= e(at('stats.rangeLabel', 'Intervallo del grafico')); ?>">
          <?php foreach ($rangeLabels as $key => $label): ?>
          <a href="<?= e($statsUrl(['r' => $key === '30d' ? '' : $key])); ?>" class="<?= $range === $key ? 'active' : ''; ?>"<?= $range === $key ? ' aria-current="page"' : ''; ?>><?= e($label); ?></a>
          <?php endforeach; ?>
        </nav>
        <form method="get" action="admin.php" class="adm-chart-filter">
          <input type="hidden" name="p" value="stats" />
          <?php if ($range !== '30d'): ?><input type="hidden" name="r" value="<?= e($range); ?>" /><?php endif; ?>
          <?php if ($sortKey !== 'all'): ?><input type="hidden" name="s" value="<?= e($sortKey); ?>" /><?php endif; ?>
          <label class="adm-sr" for="f-stats-model"><?= e(at('history.model', 'Modello')); ?></label>
          <select id="f-stats-model" name="m" data-autosubmit>
            <option value=""><?= e(at('stats.allModels', 'Tutto il sito')); ?></option>
            <?php foreach ($modelNames as $folder => $name): ?>
            <option value="<?= e((string) $folder); ?>" <?= $chartFolder === (string) $folder ? 'selected' : ''; ?>><?= e($name); ?></option>
            <?php endforeach; ?>
          </select>
          <noscript><button type="submit" class="adm-btn adm-btn-small"><?= e(at('history.filter', 'Filtra')); ?></button></noscript>
        </form>
      </div>
      <?php if (count($chartData['series']) > 1): ?>
      <ul class="adm-legend">
        <?php foreach ($chartData['series'] as $item): ?>
        <li><span class="adm-swatch adm-series-<?= (int) $item['slot']; ?>" aria-hidden="true"></span><?= e($item['name']); ?></li>
        <?php endforeach; ?>
      </ul>
      <?php else: ?>
      <p class="adm-chart-sub"><span class="adm-swatch adm-series-2" aria-hidden="true"></span><?= e($seriesNames['models']); ?></p>
      <?php endif; ?>
      <div class="adm-chart" id="adm-stats-chart" data-chart="<?= e((string) json_encode($chartData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); ?>" role="img" aria-label="<?= e(at('stats.chartLabel', 'Grafico dell\'andamento: i valori sono nella tabella qui sotto')); ?>"></div>
      <details class="adm-chart-table">
        <summary><?= e(at('stats.showTable', 'Mostra i dati in tabella')); ?></summary>
        <div class="adm-table-wrap">
        <table class="adm-table adm-table-compact">
          <thead>
            <tr>
              <th><?= e(strlen((string) ($series[0]['key'] ?? '')) === 7 ? at('stats.month', 'Mese') : at('stats.day', 'Giorno')); ?></th>
              <?php foreach ($chartData['series'] as $item): ?><th class="adm-num"><?= e($item['name']); ?></th><?php endforeach; ?>
            </tr>
          </thead>
          <tbody>
            <?php foreach (array_reverse($series) as $point): ?>
            <tr>
              <td><?= e($dayLabel($point['key'])); ?></td>
              <?php foreach ($chartData['series'] as $item): ?><td class="adm-num"><?= e($fmt((int) $point[$item['key']])); ?></td><?php endforeach; ?>
            </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
        </div>
      </details>
    </section>

    <section class="adm-card">
      <h2><?= e(at('stats.perModel', 'Visite per modello')); ?></h2>
      <?php if ($rows === []): ?>
      <p class="adm-muted"><?= e(at('models.empty', 'Non ci sono ancora modelli. Inizia caricando il primo.')); ?></p>
      <?php else: ?>
      <div class="adm-table-wrap">
      <table class="adm-table adm-stats-table">
        <thead>
          <tr>
            <th><?= e(at('models.colName', 'Modello')); ?></th>
            <?php foreach ($periodLabels as $key => $label): ?>
            <th class="adm-num"><a href="<?= e($statsUrl(['s' => $key === 'all' ? '' : $key])); ?>" class="adm-sort<?= $sortKey === $key ? ' active' : ''; ?>"<?= $sortKey === $key ? ' aria-sort="descending"' : ''; ?>><?= e($label); ?></a></th>
            <?php endforeach; ?>
            <th class="adm-num" title="<?= e(at('stats.embedHint', 'Aperture dentro un iframe in un altro sito (codice «Incorpora»), comprese nel totale')); ?>"><?= e(at('stats.embedded', 'Incorporato')); ?></th>
            <th><?= e(at('stats.uploaded', 'Caricato il')); ?></th>
            <th><?= e(at('stats.lastView', 'Ultima apertura')); ?></th>
          </tr>
        </thead>
        <tbody>
        <?php foreach ($rows as $row): ?>
          <tr<?= $chartFolder === $row['folder'] ? ' class="adm-row-selected"' : ''; ?>>
            <td>
              <a class="adm-model-name" href="<?= e($statsUrl(['m' => $row['folder']])); ?>#adm-stats-chart" title="<?= e(at('stats.showTrend', 'Mostra l\'andamento nel grafico')); ?>"><?= e($row['name']); ?></a>
              <?php if (!$row['exists']): ?><span class="adm-badge adm-badge-warn"><?= e(at('stats.deleted', 'eliminato')); ?></span><?php endif; ?>
            </td>
            <?php foreach (array_keys($periodLabels) as $key): ?>
            <td class="adm-num<?= $sortKey === $key ? ' adm-stat-sorted' : ''; ?>">
              <?= e($fmt((int) $row['counts'][$key])); ?>
              <?php if ($sortKey === $key && $row['counts'][$key] > 0): ?>
              <span class="adm-stat-bar" aria-hidden="true"><span style="width: <?= round(100 * $row['counts'][$key] / $maxTotal, 1); ?>%"></span></span>
              <?php endif; ?>
            </td>
            <?php endforeach; ?>
            <td class="adm-num"><?= e($fmt($row['embed'])); ?></td>
            <td><?= $row['created'] > 0 ? e(date('d/m/Y', $row['created'])) : '<span class="adm-muted">—</span>'; ?></td>
            <td><?= $row['last'] !== '' ? e($dayLabel($row['last'])) : '<span class="adm-muted">' . e(at('stats.never', 'mai')) . '</span>'; ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      </div>
      <?php endif; ?>
    </section>

    <p class="adm-hint adm-stats-note">
      <?= e($firstDay !== ''
          ? at('stats.since', 'Visite contate dal {date}.', ['date' => $dayLabel($firstDay)])
          : at('stats.noData', 'Nessuna visita registrata finora: il conteggio parte dalla prima visita al sito.')); ?>
      <?= e(at('stats.privacy', 'Il conteggio è anonimo: niente cookie, niente indirizzi IP, solo totali per giorno. Una visita vale una sessione del browser e ogni modello si conta una volta per sessione; bot e anteprime delle bozze sono esclusi.')); ?>
    </p>

<?php elseif ($page === 'trash'): ?>
    <?php $items = adminTrashList(); $trashSize = array_sum(array_map(static fn(array $i): int => (int) ($i['size'] ?? 0), $items)); ?>
    <section class="adm-toolbar">
      <h1><?= e(at('nav.trash', 'Cestino')); ?> <span class="adm-count"><?= count($items); ?></span></h1>
      <?php if ($items !== []): ?><span class="adm-muted"><?= e(at('trash.size', 'Spazio occupato: {size}', ['size' => adminFormatBytes($trashSize)])); ?></span><?php endif; ?>
    </section>
    <p class="adm-hint"><?= e(at('trash.intro', 'Qui finiscono i modelli eliminati e le versioni dei file 3D sostituite. Ripristinare una versione la rende di nuovo il file attivo del modello (quello attuale finisce a sua volta nel cestino).')); ?></p>
    <?php if ($items === []): ?>
    <section class="adm-card adm-empty"><p><?= e(at('trash.empty', 'Il cestino è vuoto.')); ?></p></section>
    <?php else: ?>
    <div class="adm-table-wrap">
    <table class="adm-table">
      <thead>
        <tr>
          <th><?= e(at('trash.item', 'Elemento')); ?></th>
          <th><?= e(at('trash.deleted', 'Eliminato')); ?></th>
          <th><?= e(at('detail.size', 'Dimensione')); ?></th>
          <th class="adm-col-actions"><span class="adm-sr"><?= e(at('models.colActions', 'Azioni')); ?></span></th>
        </tr>
      </thead>
      <tbody>
      <?php foreach ($items as $item): ?>
        <tr>
          <td>
            <?php if (($item['type'] ?? '') === 'model'): ?>
            <span class="adm-badge"><?= e(at('trash.typeModel', 'Modello')); ?></span>
            <strong><?= e((string) ($item['name'] ?? '')); ?></strong>
            <span class="adm-folder"><?= e((string) ($item['folder'] ?? '')); ?></span>
            <?php else: ?>
            <span class="adm-badge"><?= e(at('trash.typeFile', 'Versione precedente')); ?></span>
            <strong><?= e((string) ($item['file'] ?? '')); ?></strong>
            <span class="adm-folder"><?= e(at('trash.of', 'di {folder}', ['folder' => (string) ($item['folder'] ?? '')])); ?></span>
            <?php endif; ?>
          </td>
          <td><?= e(adminDate((int) ($item['deleted'] ?? 0))); ?> <span class="adm-muted"><?= e(at('models.by', 'da {name}', ['name' => adminDisplayName((string) ($item['deletedBy'] ?? ''))])); ?></span></td>
          <td><?= e(adminFormatBytes((int) ($item['size'] ?? 0))); ?></td>
          <td class="adm-col-actions">
            <form method="post" action="admin.php" class="adm-inline">
              <input type="hidden" name="csrf" value="<?= e($csrf); ?>" />
              <input type="hidden" name="id" value="<?= e((string) $item['id']); ?>" />
              <button type="submit" name="action" value="trash_restore" class="adm-btn adm-btn-small"><?= e(at('trash.restore', 'Ripristina')); ?></button>
              <button type="submit" name="action" value="trash_purge" class="adm-btn adm-btn-small adm-btn-danger" data-confirm="<?= e(at('trash.purgeConfirm', 'Eliminare definitivamente? L\'operazione non si può annullare.')); ?>"><?= e(at('trash.purge', 'Elimina per sempre')); ?></button>
            </form>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    </div>
    <?php endif; ?>

<?php elseif ($page === 'users'): ?>
    <?php $users = adminUsers(); ?>
    <section class="adm-toolbar">
      <h1><?= e(at('nav.users', 'Utenti')); ?> <span class="adm-count"><?= count($users); ?></span></h1>
    </section>
    <p class="adm-hint"><?= e(at('users.roles', 'Editor: carica e modifica i modelli. Amministratore: inoltre elimina e ripristina i modelli e gestisce gli utenti.')); ?></p>
    <div class="adm-user-grid">
      <?php foreach ($users as $name => $data): $isSelf = $name === $user['username']; ?>
      <section class="adm-card adm-user-card<?= !empty($data['disabled']) ? ' adm-disabled' : ''; ?>">
        <h2>
          <span class="adm-avatar" aria-hidden="true"><?= e(strtoupper(substr($name, 0, 1))); ?></span>
          <?= e(adminDisplayName($name)); ?>
          <span class="adm-folder"><?= e($name); ?></span>
          <?php if (!empty($data['disabled'])): ?><span class="adm-badge adm-badge-warn"><?= e(at('users.disabled', 'disattivato')); ?></span><?php endif; ?>
          <?php if ($isSelf): ?><span class="adm-badge"><?= e(at('users.you', 'tu')); ?></span><?php endif; ?>
        </h2>
        <p class="adm-muted"><?= e(at('users.lastLogin', 'Ultimo accesso: {date}', ['date' => adminDate((int) ($data['lastLogin'] ?? 0))])); ?> · <a href="admin.php?p=history&amp;u=<?= e(rawurlencode($name)); ?>"><?= e(at('users.activity', 'attività')); ?></a></p>
        <form method="post" action="admin.php" class="adm-form">
          <input type="hidden" name="csrf" value="<?= e($csrf); ?>" />
          <input type="hidden" name="action" value="user_update" />
          <input type="hidden" name="username" value="<?= e($name); ?>" />
          <div class="adm-row">
            <p class="adm-field">
              <label for="dn-<?= e($name); ?>"><?= e(at('user.displayName', 'Nome visualizzato')); ?></label>
              <input type="text" id="dn-<?= e($name); ?>" name="displayName" value="<?= e((string) ($data['displayName'] ?? '')); ?>" maxlength="80" />
            </p>
            <p class="adm-field">
              <label for="role-<?= e($name); ?>"><?= e(at('detail.role', 'Ruolo')); ?></label>
              <select id="role-<?= e($name); ?>" name="role" <?= $isSelf ? 'disabled' : ''; ?>>
                <?php foreach (ADMIN_ROLES as $role): ?>
                <option value="<?= e($role); ?>" <?= ($data['role'] ?? '') === $role ? 'selected' : ''; ?>><?= e(adminRoleLabel($role)); ?></option>
                <?php endforeach; ?>
              </select>
              <?php if ($isSelf): ?><input type="hidden" name="role" value="<?= e((string) $data['role']); ?>" /><?php endif; ?>
            </p>
          </div>
          <?php if (!$isSelf): ?>
          <label class="adm-check"><input type="checkbox" name="disabled" value="1" <?= !empty($data['disabled']) ? 'checked' : ''; ?> /> <?= e(at('users.disable', 'Account disattivato (non può accedere)')); ?></label>
          <?php endif; ?>
          <p class="adm-actions"><button type="submit" class="adm-btn adm-btn-small"><?= e(at('users.save', 'Salva')); ?></button></p>
        </form>
        <details class="adm-details">
          <summary><?= e(at('users.more', 'Password ed eliminazione')); ?></summary>
          <form method="post" action="admin.php" class="adm-form">
            <input type="hidden" name="csrf" value="<?= e($csrf); ?>" />
            <input type="hidden" name="action" value="user_password" />
            <input type="hidden" name="username" value="<?= e($name); ?>" />
            <p class="adm-field">
              <label for="pw-<?= e($name); ?>"><?= e(at('users.newPassword', 'Nuova password')); ?></label>
              <input type="password" id="pw-<?= e($name); ?>" name="password" minlength="<?= ADMIN_PASSWORD_MIN; ?>" required autocomplete="new-password" />
            </p>
            <p class="adm-actions"><button type="submit" class="adm-btn adm-btn-small"><?= e(at('users.resetPassword', 'Reimposta password')); ?></button></p>
          </form>
          <?php if (!$isSelf): ?>
          <form method="post" action="admin.php" class="adm-form">
            <input type="hidden" name="csrf" value="<?= e($csrf); ?>" />
            <input type="hidden" name="action" value="user_delete" />
            <input type="hidden" name="username" value="<?= e($name); ?>" />
            <p class="adm-actions"><button type="submit" class="adm-btn adm-btn-small adm-btn-danger" data-confirm="<?= e(at('users.deleteConfirm', 'Eliminare l\'utente {name}? Lo storico delle sue modifiche resta.', ['name' => $name])); ?>"><?= e(at('users.delete', 'Elimina utente')); ?></button></p>
          </form>
          <?php endif; ?>
        </details>
      </section>
      <?php endforeach; ?>

      <section class="adm-card adm-user-card adm-user-new">
        <h2><?= e(at('users.new', 'Nuovo utente')); ?></h2>
        <form method="post" action="admin.php" class="adm-form" autocomplete="off">
          <input type="hidden" name="csrf" value="<?= e($csrf); ?>" />
          <input type="hidden" name="action" value="user_create" />
          <?php adminInput('username', at('user.username', 'Nome utente'), '', [], ['required' => true, 'pattern' => '[a-z0-9][a-z0-9._\-]{2,31}', 'maxlength' => 32, 'autocomplete' => 'off', 'id' => 'f-new-username'], at('user.usernameHint', 'Minuscole, numeri, punto, - e _ (3-32 caratteri).')); ?>
          <?php adminInput('displayName', at('user.displayName', 'Nome visualizzato'), '', [], ['maxlength' => 80]); ?>
          <?php adminInput('password', at('user.password', 'Password'), '', [], ['type' => 'password', 'required' => true, 'minlength' => ADMIN_PASSWORD_MIN, 'autocomplete' => 'new-password'], at('users.passwordHint', 'Almeno {min} caratteri: comunicala all\'utente, potrà cambiarla dal suo profilo.', ['min' => ADMIN_PASSWORD_MIN])); ?>
          <p class="adm-field">
            <label for="f-role"><?= e(at('detail.role', 'Ruolo')); ?></label>
            <select id="f-role" name="role">
              <option value="editor"><?= e(adminRoleLabel('editor')); ?></option>
              <option value="admin"><?= e(adminRoleLabel('admin')); ?></option>
            </select>
          </p>
          <p class="adm-actions"><button type="submit" class="adm-btn adm-btn-primary"><?= e(at('users.create', 'Crea utente')); ?></button></p>
        </form>
      </section>
    </div>

<?php elseif ($page === 'account'): ?>
    <section class="adm-card adm-narrow">
      <h1><?= e(at('nav.account', 'Il mio account')); ?></h1>
      <p class="adm-muted"><?= e(at('account.info', 'Nome utente: {username} · Ruolo: {role}', ['username' => (string) $user['username'], 'role' => adminRoleLabel((string) $user['role'])])); ?></p>
      <form method="post" action="admin.php" class="adm-form">
        <input type="hidden" name="csrf" value="<?= e($csrf); ?>" />
        <input type="hidden" name="action" value="account_save" />
        <?php adminInput('displayName', at('user.displayName', 'Nome visualizzato'), (string) ($user['displayName'] ?? ''), [], ['maxlength' => 80, 'autocomplete' => 'name'], at('user.displayNameHint', 'Come appare nello storico, es. «Mario Rossi».')); ?>
        <fieldset>
          <legend><?= e(at('account.changePassword', 'Cambia password')); ?></legend>
          <p class="adm-hint"><?= e(at('account.passwordHint', 'Lascia vuoto per non cambiarla. Le altre sessioni aperte con questo account verranno chiuse.')); ?></p>
          <?php adminInput('currentPassword', at('account.currentPassword', 'Password attuale'), '', [], ['type' => 'password', 'autocomplete' => 'current-password']); ?>
          <?php adminInput('newPassword', at('users.newPassword', 'Nuova password'), '', [], ['type' => 'password', 'minlength' => ADMIN_PASSWORD_MIN, 'autocomplete' => 'new-password']); ?>
          <?php adminInput('newPassword2', at('user.password2', 'Ripeti la password'), '', [], ['type' => 'password', 'minlength' => ADMIN_PASSWORD_MIN, 'autocomplete' => 'new-password']); ?>
        </fieldset>
        <p class="adm-actions"><button type="submit" class="adm-btn adm-btn-primary"><?= e(at('users.save', 'Salva')); ?></button></p>
      </form>
    </section>
<?php endif; ?>
  </main>

  <footer class="adm-footer">
    <span class="adm-langs">
      <?php foreach ($langMeta as $code => $meta): ?>
      <a href="<?= e(buildLangURL($code)); ?>" class="<?= $code === $lang ? 'active' : ''; ?>" hreflang="<?= e($code); ?>" title="<?= e($meta['name']); ?>"><?= e($meta['flag'] !== '' ? $meta['flag'] : strtoupper($code)); ?></a>
      <?php endforeach; ?>
    </span>
    <span><?= e($appName); ?> <?= e(APP_VERSION); ?></span>
    <?= projectRibbon(); ?>
  </footer>

  <?php if ($page === 'edit' || $page === 'new'): ?>
  <script src="lib/leaflet/leaflet.js"></script>
  <?php endif; ?>
  <script src="js/config.php"></script>
  <script src="<?= e(assetUrl('js/admin.js')); ?>" defer></script>
  <?php if ($page === 'edit' || $page === 'new'): ?>
  <script type="importmap"><?= ADMIN_IMPORT_MAP; ?></script>
  <script type="module" src="<?= e(assetUrl('js/admin-orientation.js')); ?>"></script>
  <?php endif; ?>
</body>
</html>
