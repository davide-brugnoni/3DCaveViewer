<?php
declare(strict_types=1);

/*
  3D Cave Viewer - Social Preview Generator
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

// Get model folder parameter
$requestedFolder = isset($_GET['m']) ? (string) $_GET['m'] : '';

// Validate folder name (Unicode letters, numbers, underscore, hyphen; no path traversal)
if (!isValidModelFolder($requestedFolder)) {
    // Return a default placeholder image
    servePlaceholder();
    exit;
}

$modelFolder = $requestedFolder;
$modelDir = modelDir($modelFolder);

// Check if model directory exists
if (!is_dir($modelDir)) {
    servePlaceholder();
    exit;
}

// Priority order for social preview images:
// 1. Auto-generated social preview (modelname_social.jpg)
// 2. Static preview (modelname.jpg)
// 3. Placeholder

$socialPreview = $modelDir . '/' . $modelFolder . '_social.jpg';
$staticPreview = $modelDir . '/' . $modelFolder . '.jpg';

if (file_exists($socialPreview) && is_readable($socialPreview)) {
    // Serve the auto-generated social preview
    serveImage($socialPreview);
} elseif (file_exists($staticPreview) && is_readable($staticPreview)) {
    // Serve the static preview
    serveImage($staticPreview);
} else {
    // Generate and serve a placeholder
    servePlaceholder();
}

exit;

/**
 * Serve an image file with proper headers
 */
function serveImage(string $filePath): void {
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $filePath);
    finfo_close($finfo);

    // Security: Only allow image mime types
    if (!str_starts_with($mimeType, 'image/')) {
        servePlaceholder();
        return;
    }

    $fileSize = filesize($filePath);
    $lastModified = filemtime($filePath);

    // Cache headers
    header('Content-Type: ' . $mimeType);
    header('Content-Length: ' . $fileSize);
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $lastModified) . ' GMT');
    header('Cache-Control: public, max-age=86400'); // 24 hours
    header('Expires: ' . gmdate('D, d M Y H:i:s', time() + 86400) . ' GMT');

    // Check if client has cached version
    if (isset($_SERVER['HTTP_IF_MODIFIED_SINCE'])) {
        $ifModifiedSince = strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']);
        if ($ifModifiedSince >= $lastModified) {
            header('HTTP/1.1 304 Not Modified');
            exit;
        }
    }

    readfile($filePath);
}

/**
 * Generate and serve a placeholder image
 */
function servePlaceholder(): void {
    // Create a 1200x630 image (optimal for social media)
    $width = 1200;
    $height = 630;

    $image = imagecreatetruecolor($width, $height);
    if ($image === false) {
        header('HTTP/1.1 500 Internal Server Error');
        exit;
    }

    // Background gradient (dark theme)
    $colorTop = imagecolorallocate($image, 26, 26, 46);
    $colorBottom = imagecolorallocate($image, 13, 13, 23);

    // Create gradient
    for ($i = 0; $i < $height; $i++) {
        $ratio = $i / $height;
        $r = (int)(26 + ($ratio * (13 - 26)));
        $g = (int)(26 + ($ratio * (13 - 26)));
        $b = (int)(46 + ($ratio * (23 - 46)));
        $color = imagecolorallocate($image, $r, $g, $b);
        imagefilledrectangle($image, 0, $i, $width, $i, $color);
    }

    // Text color
    $textColor = imagecolorallocate($image, 255, 255, 255);
    $subtextColor = imagecolorallocate($image, 180, 180, 180);

    // Testi letti dalla configurazione (personalizzabili da custom/settings.ini)
    $title = (string) config('branding.appName', '3D Cave Viewer');
    $subtitle = (string) config('branding.organizationName', '');

    // Use built-in font (font 5 is the largest built-in)
    $font = 5;
    $titleWidth = imagefontwidth($font) * strlen($title);
    $titleHeight = imagefontheight($font);
    $subtitleWidth = imagefontwidth($font) * strlen($subtitle);

    // Center text
    $titleX = (int)(($width - $titleWidth) / 2);
    $titleY = (int)(($height - $titleHeight) / 2 - 20);
    $subtitleX = (int)(($width - $subtitleWidth) / 2);
    $subtitleY = (int)(($height - $titleHeight) / 2 + 20);

    imagestring($image, $font, $titleX, $titleY, $title, $textColor);
    imagestring($image, $font, $subtitleX, $subtitleY, $subtitle, $subtextColor);

    // Add a simple 3D cave icon (simple rectangle representing a cave entrance)
    // Sopra i testi: con nomi lunghi il riquadro finiva per coprire il titolo.
    $accentColor = imagecolorallocate($image, 100, 150, 255);
    $caveX = (int)($width / 2 - 60);
    $caveY = (int)($height / 2 - 170);
    $caveWidth = 120;
    $caveHeight = 80;

    // Draw rounded rectangle for cave
    imagefilledrectangle($image, $caveX + 10, $caveY, $caveX + $caveWidth - 10, $caveY + $caveHeight, $accentColor);
    imagefilledellipse($image, $caveX + 60, $caveY + 10, 100, 20, $accentColor);

    // Output image
    header('Content-Type: image/jpeg');
    header('Cache-Control: public, max-age=3600'); // 1 hour for placeholder

    imagejpeg($image, null, 85);
    imagedestroy($image);
}
