<?php
declare(strict_types=1);

/*
  3D Cave Viewer - Registrazione anonima di una visita (vedi stats_lib.php)
  https://github.com/davide-brugnoni/3DCaveViewer/
  Copyright (C) 2025 Davide Brugnoni davide.brugnoni@gmail.com
  Licensed under GNU GPL v3
*/

// Chiamato da js/stats.js con navigator.sendBeacon(): POST con
//   t = visit | model
//   m = cartella del modello (solo t=model)
//   e = 1 se il viewer è dentro un iframe (?embed=1)
// Risponde sempre 204 senza corpo: il browser non legge la risposta.

require_once __DIR__ . '/../stats_lib.php';

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    exit;
}

// Solo dalle pagine di questo sito (anche dentro un iframe altrui la
// pagina del viewer resta di questo dominio, e il suo Origin con lei)
if (!statsEnabled() || !adminSameOrigin() || statsIsBot((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''))) {
    http_response_code(204);
    exit;
}

$type = (string) ($_POST['t'] ?? '');
if ($type === 'visit') {
    statsRecordHit('visit');
    http_response_code(204);
    exit;
}

if ($type !== 'model') {
    http_response_code(400);
    exit;
}

// Si contano solo modelli esistenti e pubblicati: niente cartelle inventate
// che gonfino il file, niente anteprime delle bozze
$folder = (string) ($_POST['m'] ?? '');
if (!isValidModelFolder($folder) || strlen($folder) > 128) {
    http_response_code(400);
    exit;
}
$metaFile = dirname(__DIR__) . '/' . config('paths.modelsFolder', 'modelli') . '/' . $folder . '/' . $folder . '.json';
$raw = is_file($metaFile) ? @file_get_contents($metaFile) : false;
$meta = $raw !== false ? json_decode($raw, true) : null;
if (!is_array($meta) || !isModelPublished($meta)) {
    http_response_code(404);
    exit;
}

statsRecordHit('model', $folder, ($_POST['e'] ?? '') === '1');
http_response_code(204);
