<?php
declare(strict_types=1);

/*
  3D Cave Viewer - Pannello di amministrazione: file dei modelli in bozza
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

// GET ?m=<cartella>&f=<file>: consegna un file di un modello a chi è entrato
// nel pannello (editor o amministratore). Serve alle bozze, la cui cartella
// è chiusa al web dal .htaccess di syncDraftProtection(): l'anteprima nel
// visualizzatore (viewer.php?preview=1) e la miniatura dell'anteprima social
// nel pannello passano da qui. Solo file 3D e immagini, solo nella cartella
// del modello, mai in cache condivise.

require_once __DIR__ . '/../admin_lib.php';

sendSecurityHeaders();

/**
 * Risposta d'errore senza corpo utile e uscita.
 */
function modelFileFail(int $status): void {
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo $status === 404 ? 'Not found' : 'Forbidden';
    exit;
}

if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    modelFileFail(405);
}

adminStartSession(dirname(dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/api/x.php'))));
$user = adminCurrentUser();
// Un GLB da centinaia di MB impiega minuti: la sessione non va tenuta bloccata
session_write_close();

if (!adminCan($user, 'models.edit')) {
    modelFileFail(403);
}

$folder = (string) ($_GET['m'] ?? '');
$name = (string) ($_GET['f'] ?? '');
$types = [
    'glb' => 'model/gltf-binary',
    'gltf' => 'model/gltf+json',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'webp' => 'image/webp',
];
$ext = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));

// Solo un nome di file semplice (niente percorsi) con un'estensione ammessa
if (!isValidModelFolder($folder) || $name === '' || $name !== basename($name)
    || $name[0] === '.' || preg_match('/^[\pL\pN _.()-]+$/u', $name) !== 1 || !isset($types[$ext])) {
    modelFileFail(404);
}

$path = adminModelsDir() . '/' . $folder . '/' . $name;
$real = realpath($path);
$base = realpath(adminModelsDir() . '/' . $folder);
if ($real === false || $base === false || strpos($real, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($real)) {
    modelFileFail(404);
}

@set_time_limit(0);
while (ob_get_level() > 0) {
    ob_end_clean();
}

$size = (int) filesize($real);
header('Content-Type: ' . $types[$ext]);
header('Content-Length: ' . $size);
// Privato: mai nella cache di un proxy, mai salvato dal browser fra una sessione e l'altra
header('Cache-Control: private, no-store');
header('X-Robots-Tag: noindex, nofollow');
header('Content-Disposition: inline; filename="' . str_replace('"', '', $name) . '"');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
    exit;
}
readfile($real);
