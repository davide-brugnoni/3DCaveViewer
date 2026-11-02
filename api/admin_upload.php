<?php
declare(strict_types=1);

/*
  3D Cave Viewer - Pannello di amministrazione: caricamento a blocchi
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

// Riceve i file 3D a blocchi per js/admin.js (vedi "CARICAMENTO DEI FILE
// 3D" in admin_lib.php). Tre azioni, tutte POST, tutte con sessione del
// pannello, token CSRF nell'header X-CSRF-Token e controllo di origine:
//   ?action=start   corpo JSON {name, size}        → {id, chunkSize}
//   ?action=chunk   &id=…&offset=N, corpo grezzo   → {received, size}
//   ?action=cancel  &id=…                          → {}
// Il file completo resta in custom/admin/uploads/ finché il modulo del
// modello non viene salvato da admin.php, che lo valida e lo sposta.

require_once __DIR__ . '/../admin_lib.php';

sendSecurityHeaders();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

/**
 * Risposta JSON e uscita.
 */
function uploadRespond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    uploadRespond(405, ['ok' => false, 'error' => 'method']);
}

adminStartSession(dirname(dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/api/x.php'))));
$user = adminCurrentUser();
// Chiude subito la sessione: i blocchi di un file grande arrivano uno dopo
// l'altro e con la sessione aperta ogni richiesta del pannello (anche in
// un'altra scheda) aspetterebbe il lock del file di sessione.
$token = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
$validRequest = adminCheckRequest($token);
session_write_close();

if ($user === null) {
    uploadRespond(401, ['ok' => false, 'error' => 'session_expired']);
}
if (!$validRequest) {
    uploadRespond(403, ['ok' => false, 'error' => 'csrf']);
}
if (!adminCan($user, 'models.edit')) {
    uploadRespond(403, ['ok' => false, 'error' => 'forbidden']);
}

$username = (string) $user['username'];
$action = (string) ($_GET['action'] ?? '');

switch ($action) {
    case 'start':
        $body = json_decode((string) file_get_contents('php://input'), true);
        $name = is_array($body) ? (string) ($body['name'] ?? '') : '';
        $size = is_array($body) && is_numeric($body['size'] ?? null) ? (int) $body['size'] : 0;
        $result = adminUploadStart($username, $name, $size);
        if (!$result['ok']) {
            uploadRespond($result['error'] === 'disk_full' ? 507 : 400, ['ok' => false, 'error' => $result['error']]);
        }
        uploadRespond(200, ['ok' => true, 'id' => $result['id'], 'chunkSize' => adminChunkSize()]);
        break;

    case 'chunk':
        @set_time_limit(300);
        $id = (string) ($_GET['id'] ?? '');
        $offset = isset($_GET['offset']) && ctype_digit((string) $_GET['offset']) ? (int) $_GET['offset'] : -1;
        $result = adminUploadChunk($username, $id, $offset);
        if (!$result['ok']) {
            // offset_mismatch non è un errore vero: dice da dove riprendere
            $status = $result['error'] === 'offset_mismatch' ? 409 : ($result['error'] === 'upload_missing' ? 404 : 500);
            uploadRespond($status, $result);
        }
        uploadRespond(200, $result);
        break;

    case 'cancel':
        $id = (string) ($_GET['id'] ?? '');
        $meta = adminValidUploadId($id) ? adminReadStore('uploads/' . $id) : [];
        if (($meta['user'] ?? '') === $username) {
            adminUploadDiscard($id);
        }
        uploadRespond(200, ['ok' => true]);
        break;

    default:
        uploadRespond(400, ['ok' => false, 'error' => 'action']);
}
