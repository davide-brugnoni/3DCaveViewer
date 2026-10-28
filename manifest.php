<?php
declare(strict_types=1);

/*
 * 3D Cave Viewer - PWA Manifest dinamico
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

// Servito come manifest.json tramite rewrite in .htaccess: branding, colori
// e icone arrivano da config.php, così un fork non spedisce il branding
// originale nella PWA installata.

require_once __DIR__ . '/config.php';

sendSecurityHeaders();
header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: no-cache');

$manifest = [
    'name' => config('branding.appName', '3D Cave Viewer') . ' - ' . config('branding.organizationName', ''),
    'short_name' => config('branding.appShortName', '3D Cave'),
    'description' => formatText((string) config('branding.appDescription', '')),
    'start_url' => './index.php',
    'scope' => './',
    'display' => 'standalone',
    'orientation' => 'any',
    'background_color' => config('theme.pwaBackgroundColor', '#0f1b2a'),
    'theme_color' => config('theme.themeColor', '#0b0d10'),
    'categories' => ['education', 'entertainment', 'utilities'],
    'lang' => config('language.default', 'it'),
    'dir' => 'ltr',
    'icons' => [],
];

// Icone: solo quelle realmente presenti sul disco (iconPath() ricade sui
// file di custom/ se il percorso configurato non esiste). Il ?v=<mtime>
// evita che un'icona sostituita resti in cache per un anno.
foreach ([192 => '192x192', 512 => '512x512'] as $size => $sizes) {
    $iconPath = iconPath($size);
    if ($iconPath === '') {
        continue;
    }
    $manifest['icons'][] = [
        'src' => assetUrl($iconPath),
        'sizes' => $sizes,
        'type' => 'image/png',
        'purpose' => 'any maskable',
    ];
}

// Screenshot: usa il logo configurato leggendone dimensioni e tipo reali,
// così resta valido anche se l'utente lo sostituisce con un'immagine diversa.
$logoPath = logoPath();
if ($logoPath !== '') {
    $imageInfo = @getimagesize(__DIR__ . '/' . ltrim($logoPath, '/'));
    if (is_array($imageInfo)) {
        $manifest['screenshots'] = [
            [
                'src' => assetUrl($logoPath),
                'sizes' => $imageInfo[0] . 'x' . $imageInfo[1],
                'type' => $imageInfo['mime'] ?? 'image/jpeg',
                'form_factor' => 'wide',
            ],
        ];
    }
}

echo json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
