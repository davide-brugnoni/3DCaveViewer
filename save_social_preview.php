<?php
declare(strict_types=1);

/*
  3D Cave Viewer - Save Social Preview
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

// Security headers
sendSecurityHeaders();
header("Content-Type: application/json");

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Same-origin check (stateless CSRF defense): browsers always send Origin on
// cross-site POST, so a foreign Origin/Referer host means a forged request.
$originHeader = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
if ($originHeader === '') {
    // Fail-closed: i browser inviano sempre Origin sulle POST cross-site,
    // una richiesta senza Origin né Referer non proviene dal viewer.
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Missing Origin/Referer header']);
    exit;
}
$requestHost = (string) (parse_url($originHeader, PHP_URL_HOST) ?: '');
$originPort = parse_url($originHeader, PHP_URL_PORT);
if ($originPort !== null && $originPort !== false) {
    $requestHost .= ':' . $originPort;
}
$serverHost = $_SERVER['HTTP_HOST'] ?? '';
if ($requestHost !== '' && $serverHost !== '' && strcasecmp($requestHost, $serverHost) !== 0
    && strcasecmp($requestHost, (string) preg_replace('/:\d+$/', '', $serverHost)) !== 0) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Cross-origin request rejected']);
    exit;
}

// Get model folder parameter
$requestedFolder = isset($_POST['model']) ? (string) $_POST['model'] : '';

// Validate folder name
if (!isValidModelFolder($requestedFolder)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid model name']);
    exit;
}

// Get image data
$imageData = isset($_POST['image']) ? (string) $_POST['image'] : '';
if ($imageData === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No image data provided']);
    exit;
}

// Decode base64 image (remove data:image/... prefix if present)
if (preg_match('/^data:image\/\w+;base64,/', $imageData)) {
    $imageData = substr($imageData, strpos($imageData, ',') + 1);
}

// Size limits: 5MB decoded (base64 inflates ~4/3, so cap the encoded payload too)
$MAX_IMAGE_BYTES = 5 * 1024 * 1024;
if (strlen($imageData) > (int) ($MAX_IMAGE_BYTES * 4 / 3) + 1024) {
    http_response_code(413);
    echo json_encode(['success' => false, 'error' => 'Image too large']);
    exit;
}

$imageData = base64_decode($imageData, true);
if ($imageData === false) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid image data']);
    exit;
}

if (strlen($imageData) > $MAX_IMAGE_BYTES) {
    http_response_code(413);
    echo json_encode(['success' => false, 'error' => 'Image too large']);
    exit;
}

// Cheap pre-filter: only common raster formats are accepted
// (fileinfo può mancare: il wizard lo segnala solo come avviso, quindi si
// ripiega su getimagesizefromstring() invece di andare in errore fatale)
if (function_exists('finfo_open')) {
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_buffer($finfo, $imageData);
    finfo_close($finfo);
} else {
    $imageInfo = @getimagesizefromstring($imageData);
    $mimeType = is_array($imageInfo) ? (string) ($imageInfo['mime'] ?? '') : '';
}

if (!in_array($mimeType, ['image/jpeg', 'image/png', 'image/webp'], true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Data is not a supported image']);
    exit;
}

// Prepare file path
$modelFolder = $requestedFolder;
$modelDir = modelDir($modelFolder);

// Check if model directory exists
if (!is_dir($modelDir)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Model directory not found']);
    exit;
}

// Save the image
$socialPreviewPath = $modelDir . '/' . $modelFolder . '_social.jpg';

// Un'anteprima esistente si sostituisce solo se il modello 3D è più recente
// (rilievo aggiornato). Così un'immagine preparata a mano non viene mai
// sovrascritta dallo screenshot di un visitatore, e chi chiama questo
// endpoint senza browser non può rimpiazzare a piacere le anteprime.
if (is_file($socialPreviewPath)) {
    $previewTime = (int) filemtime($socialPreviewPath);
    $modelTime = 0;
    // (niente GLOB_BRACE: non esiste su alcune piattaforme, es. musl)
    foreach (['glb', 'gltf', 'obj'] as $ext) {
        foreach (glob($modelDir . '/*.' . $ext) ?: [] as $modelFile) {
            $modelTime = max($modelTime, (int) filemtime($modelFile));
        }
    }
    if ($previewTime >= $modelTime) {
        echo json_encode(['success' => true, 'skipped' => true, 'message' => 'Preview already up to date']);
        exit;
    }
}

// Re-encode through GD so the stored file is always a clean JPEG
// (strips any polyglot/script payload hidden in the uploaded bytes)
$gdImage = @imagecreatefromstring($imageData);
if ($gdImage === false) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid image data']);
    exit;
}

$result = imagejpeg($gdImage, $socialPreviewPath, 90);
imagedestroy($gdImage);

if ($result === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to save image']);
    exit;
}

// Success
echo json_encode([
    'success' => true,
    'message' => 'Social preview saved successfully',
    'path' => $modelFolder . '/' . $modelFolder . '_social.jpg'
]);
