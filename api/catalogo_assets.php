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

require_once __DIR__ . '/../config.php';

if (extension_loaded('zlib') && !ini_get('zlib.output_compression')) {
    ob_start('ob_gzhandler');
}

// Security headers
sendSecurityHeaders();
header('Content-Type: application/json; charset=utf-8');

$modelsFolder = config('paths.modelsFolder', 'modelli');
$baseDir = __DIR__ . '/../' . $modelsFolder;
$assets = [];
$allFiletimes = [];

try {
    // Cartella dei modelli ancora assente (installazione nuova): nessun asset.
    $iterator = is_dir($baseDir)
        ? new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($baseDir, FilesystemIterator::SKIP_DOTS)
        )
        : [];
} catch (UnexpectedValueException $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Impossibile leggere la directory dei modelli.',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

foreach ($iterator as $item) {
    if (!$item->isFile()) {
        continue;
    }

    $filename = $item->getFilename();
    if ($filename !== '' && $filename[0] === '.') {
        continue;
    }

    // Skip log files and other unwanted files
    if ($filename === 'error_log' || $filename === '.htaccess' || $filename === 'Thumbs.db') {
        continue;
    }

    $extension = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));
    if (in_array($extension, ['php', 'cache', 'hash', 'log', 'md', 'txt'], true)) {
        continue;
    }

    $relativePath = substr($item->getPathname(), strlen($baseDir) + 1);
    if ($relativePath === false) {
        continue;
    }

    $path = $modelsFolder . '/' . str_replace(DIRECTORY_SEPARATOR, '/', $relativePath);
    $mtime = $item->getMTime();
    $size = $item->getSize();

    // Versione per singolo file: hash di mtime + size
    // Questo permette di invalidare solo i file che cambiano
    $fileVersion = substr(md5($mtime . '|' . $size), 0, 8);

    $assets[] = [
        'path' => $path,
        'version' => $fileVersion,
        'size' => $size
    ];

    $allFiletimes[] = $mtime;
}

// Ordina per path
usort($assets, function($a, $b) {
    return strcmp($a['path'], $b['path']);
});

sort($allFiletimes);

// Versione globale del catalogo: include anche la versione per-file, così
// cambia sia quando un file viene aggiunto/rimosso sia quando viene modificato
$catalogVersion = md5(implode('|', array_map(
    static fn(array $a): string => $a['path'] . ':' . $a['version'],
    $assets
)));

// Caching HTTP: il service worker interroga spesso questo endpoint,
// una risposta 304 evita di rigenerare e ritrasmettere il payload
$etag = 'W/"' . $catalogVersion . '"';
header('Cache-Control: public, max-age=60, stale-while-revalidate=300');
header('ETag: ' . $etag);

$ifNoneMatch = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
if ($ifNoneMatch !== '' && trim($ifNoneMatch) === $etag) {
    http_response_code(304);
    exit;
}

echo json_encode(
    [
        'version' => $catalogVersion,
        'assets' => $assets
    ],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);