<?php
declare(strict_types=1);

/*
 * 3D Cave Viewer
 * https://github.com/davide-brugnoni/3DCaveViewer/
 * https://www.3dcaveviewer.com
 *
 * Copyright (C) 2025 Davide Brugnoni davide.brugnoni@gmail.com
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

// Restituisce l'elenco dei modelli disponibili leggendo i metadati
// presenti in ciascuna cartella sotto "modelli". Ogni cartella
// deve contenere un file JSON con lo stesso nome della cartella,
// ad esempio: modelli/grotta_rossa/grotta_rossa.json.

if (extension_loaded('zlib') && !ini_get('zlib.output_compression')) {
    ob_start('ob_gzhandler');
}

require_once __DIR__ . '/../config.php';

// Security headers
sendSecurityHeaders();
header('Content-Type: application/json; charset=utf-8');

$modelsFolder = config('paths.modelsFolder', 'modelli');
$baseDir = __DIR__ . '/../' . $modelsFolder;
$cacheFile = $baseDir . DIRECTORY_SEPARATOR . 'catalogo.cache.json';

// Installazione nuova: la cartella dei modelli può non esistere ancora
// (git non conserva le cartelle vuote). Un catalogo vuoto non è un errore.
if (!is_dir($baseDir)) {
    header('Cache-Control: no-cache');
    echo '[]';
    exit;
}

try {
    $iterator = new DirectoryIterator($baseDir);
} catch (UnexpectedValueException $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Impossibile leggere la directory dei modelli.',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

// Singola iterazione: calcola latestChange e raccoglie i metadati in un solo passaggio
$latestChange = 0;
$models = [];
foreach ($iterator as $item) {
    if ($item->isDot() || !$item->isDir()) {
        continue;
    }

    $folder = $item->getFilename();
    $metadataPath = $baseDir . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR . $folder . '.json';

    if (!is_readable($metadataPath)) {
        continue;
    }

    $latestChange = max($latestChange, (int) filemtime($metadataPath));

    $metadataRaw = file_get_contents($metadataPath);
    if ($metadataRaw === false) {
        continue;
    }

    $metadata = json_decode($metadataRaw, true);
    if (!is_array($metadata)) {
        error_log("Invalid JSON in $metadataPath: " . json_last_error_msg());
        continue;
    }

    // Validate that essential fields exist
    if (!isset($metadata['name']) || !is_string($metadata['name']) || $metadata['name'] === '') {
        error_log("Missing or invalid 'name' field in $metadataPath");
        continue;
    }

    // Escludi i modelli il cui file 3D non esiste (es. cartella con solo metadati):
    // finirebbero nel selettore del viewer e nella sitemap con un URL che fallisce.
    // Il viewer apre "file" (GLB/GLTF) oppure la coppia "obj" + "mtl".
    $modelDirPath = $baseDir . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
    $hasString = static fn(string $key): bool =>
        isset($metadata[$key]) && is_string($metadata[$key]) && $metadata[$key] !== '';

    if ($hasString('obj') && $hasString('mtl') && !$hasString('file')) {
        $missing = array_filter(
            [basename($metadata['obj']), basename($metadata['mtl'])],
            static fn(string $name): bool => !is_file($modelDirPath . $name)
        );
        if ($missing !== []) {
            error_log("Missing OBJ/MTL file '" . implode("', '", $missing) . "' in $folder: excluded from catalog");
            continue;
        }
    } else {
        $modelFile = $hasString('file') ? basename($metadata['file']) : $folder . '.glb';
        if (!is_file($modelDirPath . $modelFile)) {
            error_log("Missing model file '$modelFile' in $folder: excluded from catalog");
            continue;
        }
        // Senza "file" vale <cartella>.glb: va scritto nel catalogo, perché
        // il viewer apre solo quello che trova in questo campo.
        $metadata['file'] = $modelFile;
    }

    // Assicura che il campo folder sia sempre presente.
    $metadata['folder'] = $folder;

    $models[] = $metadata;
}

// Usa la cache se è ancora valida (evita ri-serializzazione).
// Il confronto sui soli mtime non rileva la cancellazione di un modello
// (il max mtime non cala), quindi la validità include anche l'hash
// dell'insieme delle cartelle, salvato in un file affiancato alla cache.
$hashFile = $baseDir . DIRECTORY_SEPARATOR . 'catalogo.cache.hash';
$folderHash = md5(implode('|', array_column($models, 'folder')));

$jsonPayload = null;
if (is_readable($cacheFile)
    && (int) filemtime($cacheFile) >= $latestChange
    && is_readable($hashFile)
    && trim((string) file_get_contents($hashFile)) === $folderHash) {
    $jsonPayload = file_get_contents($cacheFile);
}

if ($jsonPayload === null) {
    $jsonPayload = json_encode(
        $models,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    if ($jsonPayload !== false) {
        // "@": con display_errors attivo il warning di una cartella non
        // scrivibile finirebbe prima del JSON, rendendolo non valido. La
        // cache è solo un'ottimizzazione: senza, il catalogo si rigenera.
        if (@file_put_contents($cacheFile, $jsonPayload, LOCK_EX) === false) {
            error_log("Failed to write cache file: $cacheFile");
        } elseif (@file_put_contents($hashFile, $folderHash, LOCK_EX) === false) {
            error_log("Failed to write cache hash file: $hashFile");
        }
    }
}

if ($jsonPayload === false || $jsonPayload === null) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Errore durante la generazione del catalogo.',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

$etag = 'W/"' . sha1($jsonPayload) . '"';
if ($latestChange === 0 && is_readable($cacheFile)) {
    $latestChange = (int) filemtime($cacheFile);
}
$lastModified = gmdate('D, d M Y H:i:s', $latestChange ?: time()) . ' GMT';

header('Cache-Control: public, max-age=60, stale-while-revalidate=300');
header('ETag: ' . $etag);
header('Last-Modified: ' . $lastModified);

$ifNoneMatch = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
$ifModifiedSince = $_SERVER['HTTP_IF_MODIFIED_SINCE'] ?? '';

$etagMatches = $ifNoneMatch !== '' && trim($ifNoneMatch) === $etag;
$notModified = $ifModifiedSince !== '' && strtotime($ifModifiedSince) >= strtotime($lastModified);

if ($etagMatches || $notModified) {
    http_response_code(304);
    exit;
}

echo $jsonPayload;