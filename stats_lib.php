<?php
declare(strict_types=1);

/*
  3D Cave Viewer - Statistiche delle visite
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

// Contatori anonimi: nessun cookie, nessun indirizzo IP, nessun
// identificativo del visitatore. Si salvano solo dei totali per giorno,
// in custom/admin/stats/AAAA-MM.php (un file per mese, così ogni visita
// riscrive un file piccolo):
//
//   { "2026-11-09": { "v": 12, "m": { "cartella": 7 }, "e": { "cartella": 2 } } }
//
//   v  visite al sito (una per sessione del browser, js/stats.js)
//   m  aperture di ciascun modello (una per modello per sessione),
//      incorporamenti compresi
//   e  di cui dentro un iframe di un altro sito (?embed=1)
//
// La deduplicazione per sessione avviene nel browser (sessionStorage):
// il server non sa nulla di chi visita, quindi non c'è niente da
// dichiarare in un banner dei cookie.

require_once __DIR__ . '/admin_lib.php';

const STATS_DIR = 'stats';

/** Periodi del riepilogo, in giorni (0 = da sempre). */
const STATS_PERIODS = ['7d' => 7, '30d' => 30, '365d' => 365, 'all' => 0];

/** Intervalli del grafico. */
const STATS_RANGES = ['7d', '30d', '12m', 'all'];

function statsEnabled(): bool {
    return config('stats.enabled', true) !== false;
}

/**
 * Programmi automatici che eseguono JavaScript (anteprime dei link,
 * crawler con browser headless, strumenti di test).
 */
function statsIsBot(string $userAgent): bool {
    if ($userAgent === '') {
        return true;
    }
    return preg_match('/bot\b|bot\/|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|facebookexternalhit|embedly|curl|wget|python|java\/|httpclient|phantom|puppeteer|playwright/i', $userAgent) === 1;
}

/**
 * Registra una visita. $type: 'visit' (sito) o 'model'.
 */
function statsRecordHit(string $type, string $folder = '', bool $embed = false, ?int $ts = null): bool {
    if (!adminEnsureDir(STATS_DIR)) {
        return false;
    }
    $ts = $ts ?? time();
    $day = date('Y-m-d', $ts);
    $store = STATS_DIR . '/' . date('Y-m', $ts);

    $handle = @fopen(adminDataPath(STATS_DIR . '/.lock'), 'c');
    if ($handle !== false) {
        flock($handle, LOCK_EX);
    }
    try {
        $data = adminReadStore($store);
        $entry = is_array($data[$day] ?? null) ? $data[$day] : [];
        if ($type === 'visit') {
            $entry['v'] = (int) ($entry['v'] ?? 0) + 1;
        } else {
            $entry['m'][$folder] = (int) ($entry['m'][$folder] ?? 0) + 1;
            if ($embed) {
                $entry['e'][$folder] = (int) ($entry['e'][$folder] ?? 0) + 1;
            }
        }
        $data[$day] = $entry;
        ksort($data);
        return adminWriteStore($store, $data);
    } finally {
        if ($handle !== false) {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }
}

/**
 * Tutti i giorni registrati, in ordine: 'AAAA-MM-GG' => voce.
 *
 * @return array<string, array{v?: int, m?: array<string, int>, e?: array<string, int>}>
 */
function statsLoadDays(): array {
    $days = [];
    $files = (array) @glob(adminDataPath(STATS_DIR) . '/[0-9][0-9][0-9][0-9]-[0-9][0-9].php');
    sort($files);
    foreach ($files as $file) {
        $month = basename((string) $file, '.php');
        foreach (adminReadStore(STATS_DIR . '/' . $month) as $day => $entry) {
            if (is_string($day) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $day) === 1 && is_array($entry)) {
                $days[$day] = $entry;
            }
        }
    }
    ksort($days);
    return $days;
}

/**
 * Primo giorno da cui si contano le visite, o '' se non ce n'è ancora.
 */
function statsFirstDay(array $days): string {
    return $days === [] ? '' : (string) array_key_first($days);
}

/**
 * Totali per periodo: sito, modelli nel complesso e ciascun modello.
 *
 * @return array{site: array<string,int>, models: array<string,int>, perModel: array<string, array<string,int>>, embed: array<string,int>, lastDay: array<string,string>}
 */
function statsSummary(array $days, ?int $now = null): array {
    $now = $now ?? time();
    $today = strtotime(date('Y-m-d', $now) . ' 00:00:00');
    $since = [];
    foreach (STATS_PERIODS as $key => $length) {
        // "Ultimi 7 giorni" = oggi e i sei giorni prima
        $since[$key] = $length > 0 ? date('Y-m-d', (int) strtotime('-' . ($length - 1) . ' days', $today)) : '';
    }

    $site = array_fill_keys(array_keys(STATS_PERIODS), 0);
    $models = $site;
    $perModel = [];
    $embed = [];
    $lastDay = [];
    foreach ($days as $day => $entry) {
        $visits = (int) ($entry['v'] ?? 0);
        $modelHits = is_array($entry['m'] ?? null) ? $entry['m'] : [];
        foreach ($since as $key => $from) {
            if ($from !== '' && $day < $from) {
                continue;
            }
            $site[$key] += $visits;
            foreach ($modelHits as $folder => $count) {
                $folder = (string) $folder;
                $perModel[$folder] = $perModel[$folder] ?? array_fill_keys(array_keys(STATS_PERIODS), 0);
                $perModel[$folder][$key] += (int) $count;
                $models[$key] += (int) $count;
            }
        }
        foreach ($modelHits as $folder => $count) {
            if ((int) $count > 0) {
                $lastDay[(string) $folder] = (string) $day;
            }
        }
        foreach ((is_array($entry['e'] ?? null) ? $entry['e'] : []) as $folder => $count) {
            $embed[(string) $folder] = ($embed[(string) $folder] ?? 0) + (int) $count;
        }
    }
    return ['site' => $site, 'models' => $models, 'perModel' => $perModel, 'embed' => $embed, 'lastDay' => $lastDay];
}

/**
 * Serie del grafico: un punto per giorno (7d, 30d) o per mese (12m, all).
 * Con $folder conta solo quel modello.
 *
 * @return array<int, array{key: string, visits: int, models: int}>
 */
function statsSeries(array $days, string $range, string $folder = '', ?int $now = null): array {
    $now = $now ?? time();
    $today = strtotime(date('Y-m-d', $now) . ' 00:00:00');
    $buckets = [];

    if ($range === '7d' || $range === '30d') {
        $length = $range === '7d' ? 7 : 30;
        for ($i = $length - 1; $i >= 0; $i--) {
            $buckets[date('Y-m-d', (int) strtotime("-$i days", $today))] = ['visits' => 0, 'models' => 0];
        }
        $keyOf = static fn(string $day): string => $day;
    } else {
        $first = date('Y-m', $now);
        if ($range === 'all' && $days !== []) {
            $first = substr((string) array_key_first($days), 0, 7);
        }
        $start = $range === '12m'
            ? (int) strtotime(date('Y-m-01', $now) . ' -11 months')
            : (int) strtotime($first . '-01');
        // Almeno 12 mesi anche con dati recenti: il grafico non si riduce a un punto
        $start = min($start, (int) strtotime(date('Y-m-01', $now) . ' -11 months'));
        for ($month = $start; $month <= $now; $month = (int) strtotime('+1 month', $month)) {
            $buckets[date('Y-m', $month)] = ['visits' => 0, 'models' => 0];
        }
        $keyOf = static fn(string $day): string => substr($day, 0, 7);
    }

    foreach ($days as $day => $entry) {
        $key = $keyOf((string) $day);
        if (!isset($buckets[$key])) {
            continue;
        }
        $modelHits = is_array($entry['m'] ?? null) ? $entry['m'] : [];
        if ($folder !== '') {
            $buckets[$key]['models'] += (int) ($modelHits[$folder] ?? 0);
        } else {
            $buckets[$key]['visits'] += (int) ($entry['v'] ?? 0);
            $buckets[$key]['models'] += array_sum(array_map('intval', $modelHits));
        }
    }

    $series = [];
    foreach ($buckets as $key => $values) {
        $series[] = ['key' => (string) $key] + $values;
    }
    return $series;
}

/**
 * Data di caricamento di ciascun modello, dallo storico del pannello:
 * la creazione o, per i modelli caricati via FTP, il primo evento
 * registrato. Cartella => timestamp.
 *
 * @return array<string, int>
 */
function statsModelCreated(): array {
    $created = [];
    $first = [];
    // adminHistory() parte dal più recente: l'ultimo visto è il più vecchio
    foreach (adminHistory(['action' => 'model.']) as $entry) {
        $target = (string) ($entry['target'] ?? '');
        $first[$target] = (int) ($entry['ts'] ?? 0);
        if (($entry['action'] ?? '') === 'model.create') {
            $created[$target] = (int) ($entry['ts'] ?? 0);
        }
    }
    return $created + $first;
}

/**
 * Esporta i dati giornalieri in CSV (una riga per giorno e modello).
 */
function statsCsv(array $days, array $names): string {
    $out = fopen('php://temp', 'r+');
    $row = static function (array $fields) use ($out): void {
        // Un nome che comincia con = + - @ verrebbe preso per una formula dal foglio di calcolo
        $fields = array_map(static fn($v) => is_string($v) && $v !== '' && strpos('=+-@', $v[0]) !== false ? "'" . $v : $v, $fields);
        fputcsv($out, $fields, ',', '"', '\\');
    };
    $row(['date', 'site_visits', 'model_folder', 'model_name', 'model_views', 'embed_views']);
    foreach ($days as $day => $entry) {
        $modelHits = is_array($entry['m'] ?? null) ? $entry['m'] : [];
        $embedHits = is_array($entry['e'] ?? null) ? $entry['e'] : [];
        $row([$day, (int) ($entry['v'] ?? 0), '', '', '', '']);
        foreach ($modelHits as $folder => $count) {
            $folder = (string) $folder;
            $row([$day, '', $folder, $names[$folder] ?? '', (int) $count, (int) ($embedHits[$folder] ?? 0)]);
        }
    }
    rewind($out);
    $csv = (string) stream_get_contents($out);
    fclose($out);
    return $csv;
}
