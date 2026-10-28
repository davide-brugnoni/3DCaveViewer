<?php
declare(strict_types=1);

/*
  3D Cave Viewer - robots.txt dinamico
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

// La direttiva Sitemap richiede un URL assoluto: lo costruiamo
// dall'host reale così il file resta valido su qualunque dominio.

sendSecurityHeaders();
header('Content-Type: text/plain; charset=UTF-8');

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

echo "User-agent: *\n";
echo "Allow: /\n";
echo "Disallow: " . ($scriptDir === '' ? '' : $scriptDir) . "/status.php\n";
echo "Disallow: " . ($scriptDir === '' ? '' : $scriptDir) . "/save_social_preview.php\n";
echo "Disallow: " . ($scriptDir === '' ? '' : $scriptDir) . "/setup.php\n";
echo "Disallow: " . ($scriptDir === '' ? '' : $scriptDir) . "/js/\n";
echo "\n";
echo "Sitemap: " . $baseUrl . "sitemap.xml\n";
