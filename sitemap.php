<?php
declare(strict_types=1);

/*
  3D Cave Viewer - Sitemap XML
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

sendSecurityHeaders();
header('Content-Type: application/xml; charset=UTF-8');

/**
 * Base URL dell'applicazione, costruita come in viewer.php
 * (validazione di HTTP_HOST contro host header injection).
 */
function sitemapBaseUrl(): string {
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] === '443');
    $scheme = $isHttps ? 'https' : 'http';

    $httpHost = $_SERVER['HTTP_HOST'] ?? '';
    if ($httpHost !== '' && preg_match('/^[a-zA-Z0-9.-]+(:[0-9]+)?$/', $httpHost)) {
        $host = $httpHost;
    } else {
        $host = $_SERVER['SERVER_NAME'] ?? 'localhost';
    }

    $scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? ''));
    if ($scriptDir === '.' || $scriptDir === '\\' || $scriptDir === '/') {
        $scriptDir = '';
    }
    $baseUrl = $scheme . '://' . $host . $scriptDir;
    if (substr($baseUrl, -1) !== '/') {
        $baseUrl .= '/';
    }
    return $baseUrl;
}

$baseUrl = sitemapBaseUrl();
$modelsRoot = __DIR__ . '/' . config('paths.modelsFolder', 'modelli');

// Raccoglie i modelli pubblicati: cartelle valide con metadata JSON
$entries = [];
$dirs = glob($modelsRoot . '/*', GLOB_ONLYDIR) ?: [];
foreach ($dirs as $dir) {
    $folder = basename($dir);
    if (!isValidModelFolder($folder)) {
        continue;
    }
    $metadataPath = $dir . '/' . $folder . '.json';
    if (!is_file($metadataPath)) {
        continue;
    }
    // Stesso criterio di catalogo.php: senza file 3D il modello non è pubblicato,
    // quindi non deve comparire in sitemap con un URL che fallisce il caricamento.
    $metadata = json_decode((string) file_get_contents($metadataPath), true);
    $modelFile = (is_array($metadata) && isset($metadata['file']) && is_string($metadata['file']) && $metadata['file'] !== '')
        ? basename($metadata['file'])
        : $folder . '.glb';
    $modelPath = $dir . '/' . $modelFile;
    if (!is_file($modelPath)) {
        continue;
    }
    $lastmod = filemtime($metadataPath) ?: time();
    $modelTime = filemtime($modelPath);
    if ($modelTime !== false && $modelTime > $lastmod) {
        $lastmod = $modelTime;
    }
    $entries[] = [
        'loc' => $baseUrl . 'viewer.php?m=' . rawurlencode($folder),
        'lastmod' => $lastmod,
    ];
}

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";

// Homepage
echo "  <url>\n";
echo '    <loc>' . e($baseUrl) . "</loc>\n";
echo "    <changefreq>weekly</changefreq>\n";
echo "    <priority>1.0</priority>\n";
echo "  </url>\n";

foreach ($entries as $entry) {
    echo "  <url>\n";
    echo '    <loc>' . e($entry['loc']) . "</loc>\n";
    echo '    <lastmod>' . date('Y-m-d', $entry['lastmod']) . "</lastmod>\n";
    echo "    <changefreq>monthly</changefreq>\n";
    echo "    <priority>0.8</priority>\n";
    echo "  </url>\n";
}

echo "</urlset>\n";
