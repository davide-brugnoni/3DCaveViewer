<?php
declare(strict_types=1);

/*
  3D Cave Viewer - Installazione guidata
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
require_once __DIR__ . '/setup_lib.php';

$lang = getCurrentLang();

sendSecurityHeaders("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' https:; frame-src 'none'; object-src 'none';");

// ------------------------------------------------------------
// Accesso
// ------------------------------------------------------------
// Prima dell'installazione il wizard è aperto: è l'unica pagina del sito.
// Dopo, si rientra con la chiave conservata in custom/.installed — digitata
// nel form della schermata di blocco, ricaricata da lì come file, oppure
// passata in ?key= — o cancellando quel file via FTP.
$installed  = isInstalled();
$storedKey  = installKey();
$requestKey = trim((string) ($_POST['key'] ?? $_GET['key'] ?? ''));

// La chiave arriva anche via POST proprio per non lasciarla nella barra
// degli indirizzi, nella cronologia e nei log del server.
$keyAccepted = $storedKey !== '' && $requestKey !== '' && hash_equals($storedKey, $requestKey);
$unlocked    = !$installed || $keyAccepted;

// Chiave sbagliata: la schermata di blocco lo dice invece di limitarsi a
// ripresentare il form vuoto.
$keyRejected = $installed && !$keyAccepted && $requestKey !== '';

if (!$unlocked) {
    http_response_code($keyRejected ? 401 : 403);
}

// ------------------------------------------------------------
// Salvataggio
// ------------------------------------------------------------
$saved      = false;
$savedIni   = '';
$saveError  = '';
$fieldErrors = [];
$newKey     = '';

// Solo il form del wizard dichiara action=save. Senza questo controllo la
// POST di sblocco — che porta la sola chiave — verrebbe presa per un
// salvataggio e riscriverebbe settings.ini con un form vuoto.
$isSaveRequest = $_SERVER['REQUEST_METHOD'] === 'POST'
    && ($_POST['action'] ?? '') === 'save';

if ($unlocked && $isSaveRequest) {
    // Difesa CSRF stateless, come in save_social_preview.php: i browser
    // inviano sempre Origin su una POST cross-site.
    $originHeader = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
    $serverHost   = $_SERVER['HTTP_HOST'] ?? '';
    $requestHost  = (string) (parse_url($originHeader, PHP_URL_HOST) ?: '');
    $originPort   = parse_url($originHeader, PHP_URL_PORT);
    if ($originPort !== null && $originPort !== false) {
        $requestHost .= ':' . $originPort;
    }

    $sameOrigin = $originHeader !== '' && $serverHost !== '' && (
        strcasecmp($requestHost, $serverHost) === 0
        || strcasecmp($requestHost, (string) preg_replace('/:\d+$/', '', $serverHost)) === 0
    );

    if (!$sameOrigin) {
        http_response_code(403);
        $saveError = 'csrf';
    } else {
        $collected   = collectSetupValues($_POST);
        $fieldErrors = $collected['errors'];

        $logo = handleLogoUpload($_FILES['logo'] ?? []);
        if (!$logo['ok']) {
            $fieldErrors['logo'] = $logo['error'];
        }

        $result   = writeSettingsIni($collected['values']);
        $saved    = $result['ok'];
        $savedIni = $result['ini'];
        if (!$saved) {
            $saveError = $result['error'];
        } else {
            // Chi rientra nel wizard e salva di nuovo mantiene la chiave che
            // ha già conservato: rigenerarla renderebbe muto il file salvato.
            $newKey = ensureInstallKey();
        }
    }
}

$requirements = setupRequirements();
$canWrite     = setupCanWrite();
$center       = setupCurrentCenter();
$projectName  = (string) config('originalAuthor.projectName', '3DCaveViewer');
$projectUrl   = (string) config('originalAuthor.projectUrl', 'https://www.3dcaveviewer.com/');
$formKey      = $requestKey;

// Chiave proposta quando custom/ non è scrivibile: il marker non si può
// scrivere da qui, quindi il wizard fa scaricare il file già pronto da
// caricare via FTP come custom/.installed.
$manualKey    = $storedKey !== '' ? $storedKey : newInstallKey();

/**
 * Etichetta tradotta di una voce del wizard.
 */
function setupText(string $key, string $fallback): string {
    return __t('setup.' . $key, $fallback);
}

/**
 * Spiegazione in chiaro di un valore scartato dalla validazione.
 * I casi che hanno una regola non ovvia (vincolo GPL, coerenza fra i valori
 * della mappa, logo rifiutato) meritano una frase invece del solo nome del
 * campo; per tutti gli altri resta l'elenco dei nomi.
 *
 * @param string $name Nome del campo o del gruppo che ha fallito
 * @param string $detail Valore o codice d'errore associato
 * @return string '' quando non c'è niente da aggiungere
 */
function setupErrorNote(string $name, string $detail): string {
    switch ($name) {
        case 'copyrightHolder':
            return setupText('error.copyright', 'Il testo del copyright deve continuare a citare l\'autore originale (licenza GPL v3): è stato mantenuto quello predefinito.');

        case 'bounds':
            return setupText('error.boundsDropped', 'I limiti di spostamento scritti in custom/settings.ini non contenevano il nuovo centro: sono stati disattivati e la mappa resta libera.');

        case 'minZoom':
            return setupText('error.minZoom', 'Lo zoom minimo era più stretto di quello iniziale: è stato mantenuto quello predefinito.');

        case 'mapLat':
            return setupText('error.mapCenter', 'Le coordinate del centro della mappa non erano valide: è stato mantenuto il centro predefinito.');

        case 'logo':
            return setupText('error.logo.' . $detail, setupText('error.logo.generic', 'Il logo non è stato salvato: riprova a caricarlo dalla configurazione.'));
    }

    return '';
}

/**
 * Campo di testo del wizard.
 *
 * @param string $name Nome del campo in setupFields()
 * @param string $label Etichetta già tradotta
 * @param string $hint Testo di aiuto già tradotto ('' per ometterlo)
 * @param string $type Tipo dell'input HTML
 * @param array $attrs Attributi extra (name => value). La chiave speciale
 *              'fieldClass' finisce sul contenitore invece che sull'input.
 */
function setupInput(string $name, string $label, string $hint = '', string $type = 'text', array $attrs = []): void {
    $id         = 'f-' . $name;
    $value      = setupCurrentValue($name);
    $fieldClass = (string) ($attrs['fieldClass'] ?? '');
    unset($attrs['fieldClass']);

    echo '<p class="setup-field' . ($fieldClass !== '' ? ' ' . e($fieldClass) : '') . '">';
    echo '<label for="' . e($id) . '">' . e($label) . '</label>';
    echo '<input type="' . e($type) . '" id="' . e($id) . '" name="' . e($name) . '" value="' . e($value) . '"';
    foreach ($attrs as $attr => $attrValue) {
        echo ' ' . e($attr) . '="' . e((string) $attrValue) . '"';
    }
    echo ' />';
    if ($hint !== '') {
        echo '<span class="setup-hint">' . e($hint) . '</span>';
    }
    echo '</p>';
}

/**
 * Selettore di colore del wizard: input nativo più il valore esadecimale
 * accanto, tenuto aggiornato da js/setup.js.
 */
function setupColor(string $name, string $label, string $cssVar): void {
    $id    = 'f-' . $name;
    $value = setupCurrentValue($name);
    if (preg_match('/^#[0-9a-f]{6}$/i', $value) !== 1) {
        $value = '#000000';
    }

    echo '<p class="setup-field setup-color">';
    echo '<label for="' . e($id) . '">' . e($label) . '</label>';
    echo '<span class="setup-color-row">';
    echo '<input type="color" id="' . e($id) . '" name="' . e($name) . '" value="' . e($value) . '"';
    echo ' data-css-var="' . e($cssVar) . '" />';
    echo '<code class="setup-color-value">' . e($value) . '</code>';
    echo '</span>';
    echo '</p>';
}
?>
<!DOCTYPE html>
<html lang="<?= e($lang); ?>">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover" />
    <meta name="robots" content="noindex, nofollow" />
    <title><?= e(setupText('pageTitle', 'Installazione guidata')) ?> - <?= e($projectName) ?></title>
    <link rel="stylesheet" href="lib/fonts/poppins.css" />
    <link rel="stylesheet" href="lib/leaflet/leaflet.css" />
    <link rel="stylesheet" href="css/setup.css" />
    <script src="lib/leaflet/leaflet.js"></script>
</head>

<body>
    <div class="setup-shell">

        <?php if (!$unlocked) : ?>

            <section class="card setup-locked" aria-labelledby="locked-title">
                <div class="card-header" id="locked-title">
                    <span aria-hidden="true">🔒</span>
                    <?= e(setupText('locked.title', 'Installazione già completata')) ?>
                </div>
                <div class="card-body">
                    <p><?= e(setupText('locked.intro', 'Questo sito è già configurato: l\'installazione guidata resta chiusa per impedire che chiunque possa modificarne le impostazioni.')) ?></p>

                    <?php if ($keyRejected) : ?>
                        <div class="status-message error"><?= e(setupText('locked.wrongKey', 'Chiave non valida. Controlla di aver copiato tutta la riga, senza spazi in più.')) ?></div>
                    <?php endif; ?>

                    <?php if ($storedKey === '') : ?>
                        <div class="status-message warning">
                            <?= e(setupText('locked.noKey', 'Il file custom/.installed non contiene nessuna chiave, quindi non c\'è niente da digitare: per riaprire l\'installazione guidata cancella quel file dal server.')) ?>
                        </div>
                        <p class="setup-actions">
                            <a class="setup-btn" href="index.php"><?= e(setupText('locked.back', 'Torna al sito')) ?></a>
                        </p>
                    <?php else : ?>
                        <p><?= e(setupText('locked.how', 'Per riaprirla, inserisci la chiave di configurazione che hai salvato al termine dell\'installazione:')) ?></p>

                        <form method="post" action="setup.php" class="setup-unlock" id="unlock-form">
                            <input type="hidden" name="action" value="unlock" />

                            <p class="setup-field">
                                <label for="unlock-key"><?= e(setupText('locked.keyLabel', 'Chiave di configurazione')) ?></label>
                                <input type="text" id="unlock-key" name="key" value=""
                                       autocomplete="off" autocapitalize="off" autocorrect="off"
                                       spellcheck="false" required
                                       placeholder="<?= e(setupText('locked.keyPlaceholder', 'incolla qui la chiave')) ?>" />
                                <span class="setup-hint"><?= e(setupText('locked.keyHint', 'È la riga di lettere e numeri mostrata a fine installazione, contenuta anche nel file della chiave che hai scaricato.')) ?></span>
                            </p>

                            <p class="setup-field setup-js-only">
                                <label for="unlock-file"><?= e(setupText('locked.fileLabel', 'Oppure ricarica il file della chiave')) ?></label>
                                <input type="file" id="unlock-file" accept=".txt,.installed,text/plain"
                                       data-ok-text="<?= e(setupText('locked.fileRead', 'Chiave letta dal file: premi il pulsante qui sotto.')) ?>"
                                       data-error-text="<?= e(setupText('locked.fileEmpty', 'Nessuna chiave trovata in questo file: controlla di aver scelto quello giusto.')) ?>" />
                                <span class="setup-hint" id="unlock-file-state"><?= e(setupText('locked.fileHint', 'Il file viene letto qui nel browser e compila il campo qui sopra: non viene caricato sul server.')) ?></span>
                            </p>

                            <p class="setup-actions">
                                <button type="submit" class="setup-btn setup-btn-primary"><?= e(setupText('locked.unlock', 'Apri l\'installazione guidata')) ?></button>
                                <a class="setup-btn" href="index.php"><?= e(setupText('locked.back', 'Torna al sito')) ?></a>
                            </p>
                        </form>

                        <p class="setup-hint"><?= e(setupText('locked.byFile', 'Se hai perso la chiave, cancella il file custom/.installed dal server (FTP o pannello dell\'hosting): l\'installazione guidata torna aperta.')) ?></p>
                    <?php endif; ?>
                </div>
            </section>

        <?php elseif ($saved) : ?>

            <section class="card setup-done" aria-labelledby="done-title">
                <div class="card-header" id="done-title">
                    <span aria-hidden="true">✅</span>
                    <?= e(setupText('done.title', 'Installazione completata')) ?>
                </div>
                <div class="card-body">
                    <p><?= e(setupText('done.intro', 'Le impostazioni sono state salvate in custom/settings.ini. Il sito parte ora dalla mappa delle cavità.')) ?></p>

                    <?php if ($fieldErrors !== []) : ?>
                        <div class="status-message warning">
                            <?= e(setupText('done.skipped', 'Alcuni valori non erano validi e sono stati ignorati: le voci corrispondenti restano ai valori predefiniti.')) ?>
                            <code><?= e(implode(', ', array_keys($fieldErrors))) ?></code>
                            <?php
                            $notes = [];
                            foreach ($fieldErrors as $errorName => $errorDetail) {
                                $note = setupErrorNote($errorName, (string) $errorDetail);
                                if ($note !== '') {
                                    $notes[] = $note;
                                }
                            }
                            ?>
                            <?php if ($notes !== []) : ?>
                                <ul class="setup-error-notes">
                                    <?php foreach ($notes as $note) : ?>
                                        <li><?= e($note) ?></li>
                                    <?php endforeach; ?>
                                </ul>
                            <?php endif; ?>
                        </div>
                    <?php endif; ?>

                    <?php if ($newKey !== '') : ?>
                        <div class="status-message info setup-keybox">
                            <strong><?= e(setupText('done.keyTitle', 'Chiave per riaprire la configurazione')) ?></strong>
                            <code class="setup-key" id="install-key"><?= e($newKey) ?></code>
                            <span><?= e(setupText('done.keyHint', 'Conservala: serve per tornare su setup.php e modificare le impostazioni. Scarica il file qui sotto — è lo stesso che sta in custom/.installed — oppure cancella custom/.installed dal server per riaprire l\'installazione senza chiave.')) ?></span>
                            <span class="setup-actions setup-js-only">
                                <button type="button" class="setup-btn setup-btn-primary" id="download-key"
                                        data-filename="<?= e($projectName) ?>-chiave.txt"><?= e(setupText('done.keyDownload', 'Scarica il file della chiave')) ?></button>
                                <button type="button" class="setup-btn" id="copy-key"><?= e(setupText('done.keyCopy', 'Copia la chiave')) ?></button>
                            </span>
                            <textarea id="install-key-file" hidden readonly><?= e(installMarkerContent($newKey)) ?></textarea>
                        </div>
                    <?php else : ?>
                        <div class="status-message warning setup-keybox">
                            <span><?= e(setupText('done.noMarker', 'Non è stato possibile scrivere custom/.installed. Scarica il file della chiave qui sotto e caricalo via FTP come custom/.installed, altrimenti il sito continuerà a mostrare l\'installazione guidata.')) ?></span>
                            <code class="setup-key" id="install-key"><?= e($manualKey) ?></code>
                            <span class="setup-actions setup-js-only">
                                <button type="button" class="setup-btn setup-btn-primary" id="download-key"
                                        data-filename="<?= e($projectName) ?>-chiave.txt"><?= e(setupText('done.keyDownload', 'Scarica il file della chiave')) ?></button>
                                <button type="button" class="setup-btn" id="copy-key"><?= e(setupText('done.keyCopy', 'Copia la chiave')) ?></button>
                            </span>
                            <textarea id="install-key-file" hidden readonly><?= e(installMarkerContent($manualKey)) ?></textarea>
                        </div>
                    <?php endif; ?>

                    <p class="setup-actions">
                        <a class="setup-btn" href="index.php"><?= e(setupText('done.go', 'Vai al sito')) ?></a>
                    </p>
                </div>
            </section>

        <?php elseif ($saveError === 'not_writable' || $saveError === 'write_failed' || $saveError === 'invalid_ini') : ?>

            <section class="card setup-manual" aria-labelledby="manual-title">
                <div class="card-header" id="manual-title">
                    <span aria-hidden="true">📄</span>
                    <?= e(setupText('manual.title', 'Salvataggio manuale')) ?>
                </div>
                <div class="card-body">
                    <div class="status-message warning">
                        <?= e(setupText('manual.intro', 'La cartella custom/ non è scrivibile dal server, quindi le impostazioni non sono state salvate. Copia il testo qui sotto e caricalo via FTP.')) ?>
                    </div>
                    <ol class="setup-manual-steps">
                        <li><?= e(setupText('manual.step1', 'Salva il contenuto qui sotto come custom/settings.ini (sostituendo il file esistente).')) ?></li>
                        <li><?= e(setupText('manual.step2', 'Se hai scelto un logo, caricalo come custom/logo.png.')) ?></li>
                        <li><?= e(setupText('manual.step3', 'Carica anche il file della chiave come custom/.installed: da quel momento il sito parte dalla mappa, e quella chiave riapre l\'installazione guidata.')) ?></li>
                    </ol>
                    <p class="setup-actions">
                        <button type="button" class="setup-btn setup-btn-primary setup-js-only" id="download-ini"
                                data-filename="settings.ini"><?= e(setupText('manual.download', 'Scarica settings.ini')) ?></button>
                        <button type="button" class="setup-btn" id="copy-ini"><?= e(setupText('manual.copy', 'Copia negli appunti')) ?></button>
                    </p>
                    <textarea id="manual-ini" class="setup-ini" rows="18" readonly spellcheck="false"><?= e($savedIni) ?></textarea>

                    <?php if ($manualKey !== '') : ?>
                        <div class="status-message info setup-keybox">
                            <strong><?= e(setupText('manual.keyTitle', 'Chiave di configurazione')) ?></strong>
                            <code class="setup-key" id="install-key"><?= e($manualKey) ?></code>
                            <span><?= e(setupText('manual.keyHint', 'Scarica questo file e caricalo sul server come custom/.installed, senza rinominarne il contenuto. Conservane una copia: la chiave serve per riaprire l\'installazione guidata.')) ?></span>
                            <span class="setup-actions setup-js-only">
                                <button type="button" class="setup-btn setup-btn-primary" id="download-key"
                                        data-filename="installed.txt"><?= e(setupText('manual.keyDownload', 'Scarica il file della chiave')) ?></button>
                                <button type="button" class="setup-btn" id="copy-key"><?= e(setupText('done.keyCopy', 'Copia la chiave')) ?></button>
                            </span>
                            <textarea id="install-key-file" hidden readonly><?= e(installMarkerContent($manualKey)) ?></textarea>
                        </div>
                    <?php endif; ?>
                </div>
            </section>

        <?php else : ?>

            <header class="setup-head">
                <?php $projectLogo = logoPicture('setup-logo', $projectName); ?>
                <?php if ($projectLogo !== '') : ?>
                    <?= $projectLogo ?>
                <?php endif; ?>
                <div class="setup-head-text">
                    <h1><?= e($projectName) ?></h1>
                    <p><?= e(setupText('tagline', 'Installazione guidata')) ?></p>
                </div>
                <nav class="setup-langs" aria-label="<?= e(__t('language.selector', 'Lingua')) ?>">
                    <?php foreach (getLanguagesMeta() as $code => $meta) : ?>
                        <a href="<?= e(buildLangURL($code)) ?>"
                           class="setup-lang<?= $code === $lang ? ' is-active' : '' ?>"
                           <?= $code === $lang ? 'aria-current="true"' : '' ?>><?= e($meta['flag'] . ' ' . strtoupper($code)) ?></a>
                    <?php endforeach; ?>
                </nav>
            </header>

            <?php if ($saveError === 'csrf') : ?>
                <div class="status-message error"><?= e(setupText('error.csrf', 'Richiesta rifiutata: sembra provenire da un altro sito. Riprova dal wizard.')) ?></div>
            <?php endif; ?>

            <nav class="setup-chips" id="setup-chips" role="tablist" aria-label="<?= e(setupText('stepsLabel', 'Passi dell\'installazione')) ?>">
                <button type="button" class="setup-chip is-active" role="tab" data-target="welcome" aria-selected="true">1. <?= e(setupText('step.welcome', 'Benvenuto')) ?></button>
                <button type="button" class="setup-chip" role="tab" data-target="identity" aria-selected="false">2. <?= e(setupText('step.identity', 'Identità')) ?></button>
                <button type="button" class="setup-chip" role="tab" data-target="theme" aria-selected="false">3. <?= e(setupText('step.theme', 'Colori')) ?></button>
                <button type="button" class="setup-chip" role="tab" data-target="map" aria-selected="false">4. <?= e(setupText('step.map', 'Mappa')) ?></button>
                <button type="button" class="setup-chip" role="tab" data-target="summary" aria-selected="false">5. <?= e(setupText('step.summary', 'Fine')) ?></button>
            </nav>

            <div class="progress-bar-bg" aria-hidden="true">
                <div class="progress-bar-fill" id="setup-progress" style="width:20%"></div>
            </div>

            <?php
            // I messaggi della validazione lato client passano da data-*:
            // js/setup.js non ha accesso alle traduzioni, e un blocco di
            // script inline con del JSON dentro sarebbe una sorpresa in più
            // per la CSP di questa pagina.
            $validationMessages = [
                'url'            => setupText('invalid.url', 'Indirizzo non valido: deve iniziare con http:// o https://'),
                'email'          => setupText('invalid.email', 'Indirizzo email non valido.'),
                'copyright'      => setupText('invalid.copyright', 'Il testo deve continuare a citare {author} (licenza GPL v3).'),
                'range'          => setupText('invalid.range', 'Valore fuori dall\'intervallo consentito ({min}–{max}).'),
                'number'         => setupText('invalid.number', 'Serve un numero.'),
                'minZoom'        => setupText('invalid.minZoom', 'Lo zoom minimo non può essere più stretto dello zoom iniziale o di quello sulla cavità.'),
            ];
            $originalAuthorName = (string) config('originalAuthor.name', '');
            ?>
            <form method="post" action="setup.php" enctype="multipart/form-data" id="setup-form" novalidate
                  <?php foreach ($validationMessages as $msgKey => $msgText) : ?>
                  data-msg-<?= e(strtolower(preg_replace('/([a-z])([A-Z])/', '$1-$2', $msgKey) ?? $msgKey)) ?>="<?= e($msgText) ?>"
                  <?php endforeach; ?>>
                <input type="hidden" name="action" value="save" />
                <input type="hidden" name="key" value="<?= e($formKey) ?>" />
                <input type="hidden" name="languageDefault" value="<?= e($lang) ?>" />

                <!-- ============ 1. Benvenuto ============ -->
                <section class="card setup-step is-active" id="step-welcome" data-step="welcome">
                    <div class="card-header"><span aria-hidden="true">👋</span> <?= e(setupText('welcome.title', 'Benvenuto in 3DCaveViewer')) ?></div>
                    <div class="card-body">
                        <p class="setup-lead"><?= e(setupText('welcome.what', 'Questa applicazione pubblica i rilievi 3D delle cavità: una mappa interattiva con l\'elenco delle grotte, e un visualizzatore che si esplora dal browser, anche con un visore VR.')) ?></p>
                        <ul class="setup-features">
                            <li><?= e(setupText('welcome.feature1', 'Mappa delle cavità con ricerca e schede descrittive')) ?></li>
                            <li><?= e(setupText('welcome.feature2', 'Visualizzatore 3D con navigazione orbitale e in prima persona')) ?></li>
                            <li><?= e(setupText('welcome.feature3', 'Misure, piani di sezione e annotazioni sui punti di interesse')) ?></li>
                            <li><?= e(setupText('welcome.feature4', 'Condivisione, codice da incorporare e funzionamento offline')) ?></li>
                        </ul>
                        <p><?= e(setupText('welcome.intro', 'I prossimi passi servono a personalizzare il sito con i dati del tuo gruppo. Tutto quello che scegli finisce in custom/settings.ini e si può cambiare anche in seguito.')) ?></p>

                        <h2 class="setup-subtitle"><?= e(setupText('welcome.language', 'Lingua del sito')) ?></h2>
                        <p class="setup-hint"><?= e(setupText('welcome.languageHint', 'La lingua scelta qui in alto diventa quella predefinita per chi visita il sito. I visitatori potranno comunque cambiarla dal selettore.')) ?></p>

                        <h2 class="setup-subtitle"><?= e(setupText('welcome.requirements', 'Requisiti tecnici')) ?></h2>
                        <ul class="setup-checks" id="setup-checks">
                            <?php foreach ($requirements as $check) : ?>
                                <li class="setup-check" data-check="<?= e($check['id']) ?>" data-status="<?= e($check['status']) ?>">
                                    <span class="setup-check-icon" aria-hidden="true"></span>
                                    <span class="setup-check-label"><?= e(setupText('check.' . $check['id'], $check['id'])) ?></span>
                                    <code class="setup-check-detail"><?= e($check['detail']) ?></code>
                                </li>
                            <?php endforeach; ?>
                        </ul>
                        <?php if (!$canWrite) : ?>
                            <div class="status-message warning"><?= e(setupText('welcome.notWritable', 'La cartella custom/ non è scrivibile: potrai comunque completare il wizard, ma alla fine dovrai caricare il file generato via FTP.')) ?></div>
                        <?php endif; ?>
                    </div>
                </section>

                <!-- ============ 2. Identità ============ -->
                <section class="card setup-step" id="step-identity" data-step="identity">
                    <div class="card-header"><span aria-hidden="true">🏷️</span> <?= e(setupText('identity.title', 'Il tuo gruppo')) ?></div>
                    <div class="card-body">
                        <?php
                        setupInput('organizationName', setupText('identity.organizationName', 'Nome del gruppo'), setupText('identity.organizationNameHint', 'Compare nel footer, nel titolo delle pagine e nelle anteprime social.'), 'text', ['maxlength' => 120]);
                        setupInput('organizationUrl', setupText('identity.organizationUrl', 'Sito del gruppo'), setupText('identity.organizationUrlHint', 'Il logo in alto a sinistra punterà qui.'), 'url', ['placeholder' => 'https://']);
                        setupInput('contactEmail', setupText('identity.contactEmail', 'Email di contatto'), '', 'email');
                        setupInput('appName', setupText('identity.appName', 'Nome dell\'applicazione'), setupText('identity.appNameHint', 'Titolo delle pagine e nome della PWA.'), 'text', ['maxlength' => 120]);
                        setupInput('appShortName', setupText('identity.appShortName', 'Nome breve'), setupText('identity.appShortNameHint', 'Compare sotto l\'icona quando l\'app viene installata sul telefono.'), 'text', ['maxlength' => 30]);
                        setupInput('appDescription', setupText('identity.appDescription', 'Descrizione'), setupText('identity.appDescriptionHint', 'Usata nei meta tag e nelle condivisioni.'), 'text', ['maxlength' => 200]);
                        ?>

                        <p class="setup-field">
                            <label for="f-logo"><?= e(setupText('identity.logo', 'Logo')) ?></label>
                            <input type="file" id="f-logo" name="logo" accept="image/png,image/jpeg,image/webp" />
                            <span class="setup-hint"><?= e(setupText('identity.logoHint', 'PNG, JPEG o WebP. Viene salvato come custom/logo.png e le icone della PWA vengono generate da qui.')) ?></span>
                        </p>
                        <p class="setup-logo-preview" id="logo-preview" hidden>
                            <img src="" alt="" id="logo-preview-img" />
                        </p>

                        <div class="status-message info">
                            <?= e(setupText('identity.gplNotice', 'Licenza GPL v3: la citazione dell\'autore originale e il badge "Powered by 3DCaveViewer" nel footer devono restare visibili. Il campo qui sotto è modificabile, ma deve continuare a citare Davide Brugnoni.')) ?>
                        </div>
                        <?php setupInput('copyrightHolder', setupText('identity.copyright', 'Testo del copyright'), '', 'text', ['maxlength' => 160, 'data-must-contain' => $originalAuthorName]); ?>

                        <details class="setup-advanced">
                            <summary><?= e(setupText('advanced', 'Opzioni avanzate')) ?></summary>
                            <div class="status-message warning">
                                <?= e(setupText('identity.textsWarning', 'Attenzione: un testo scritto qui vince sulle traduzioni e viene mostrato in tutte le lingue. Lasciando i campi vuoti, ogni lingua usa la sua traduzione.')) ?>
                            </div>
                            <?php
                            setupInput('pageTitle', setupText('identity.pageTitle', 'Titolo della homepage'), '', 'text', ['maxlength' => 120]);
                            setupInput('pageSubtitle', setupText('identity.pageSubtitle', 'Sottotitolo della homepage'), '', 'text', ['maxlength' => 200]);
                            setupInput('sidebarTitle', setupText('identity.sidebarTitle', 'Intestazione dell\'elenco cavità'), '', 'text', ['maxlength' => 120]);
                            ?>
                        </details>
                    </div>
                </section>

                <!-- ============ 3. Colori ============ -->
                <section class="card setup-step" id="step-theme" data-step="theme">
                    <div class="card-header"><span aria-hidden="true">🎨</span> <?= e(setupText('theme.title', 'Colori del sito')) ?></div>
                    <div class="card-body">
                        <p class="setup-lead"><?= e(setupText('theme.intro', 'I colori si applicano subito a questa pagina, così vedi il risultato mentre scegli.')) ?></p>

                        <div class="setup-presets" id="setup-presets">
                            <button type="button" class="setup-btn setup-preset" data-preset="dark"><?= e(setupText('theme.presetDark', 'Scuro (predefinito)')) ?></button>
                            <button type="button" class="setup-btn setup-preset" data-preset="blue"><?= e(setupText('theme.presetBlue', 'Blu notte')) ?></button>
                            <button type="button" class="setup-btn setup-preset" data-preset="warm"><?= e(setupText('theme.presetWarm', 'Caldo')) ?></button>
                        </div>

                        <div class="setup-grid">
                            <?php
                            setupColor('accentColor', setupText('theme.accentColor', 'Colore principale'), '--accent-color');
                            setupColor('accentHover', setupText('theme.accentHover', 'Colore principale (passaggio del mouse)'), '--accent-hover');
                            setupColor('bgColor', setupText('theme.bgColor', 'Sfondo dell\'interfaccia'), '--bg-color');
                            setupColor('panelBgSolid', setupText('theme.panelBgSolid', 'Sfondo dei pannelli'), '--panel-bg-solid');
                            setupColor('textColor', setupText('theme.textColor', 'Colore del testo'), '--text-color');
                            setupColor('themeColor', setupText('theme.themeColor', 'Barra del browser'), '');
                            setupColor('pwaBackground', setupText('theme.pwaBackground', 'Sfondo di avvio della PWA'), '');
                            ?>
                        </div>
                    </div>
                </section>

                <!-- ============ 4. Mappa ============ -->
                <section class="card setup-step" id="step-map" data-step="map">
                    <div class="card-header"><span aria-hidden="true">🗺️</span> <?= e(setupText('map.title', 'Mappa e visualizzatore')) ?></div>
                    <div class="card-body">
                        <p class="setup-lead"><?= e(setupText('map.intro', 'Cerca l\'indirizzo della zona del tuo gruppo, oppure sposta la mappa a mano: il centro della homepage viene preso da qui.')) ?></p>

                        <div class="setup-search setup-js-only">
                            <label for="map-search"><?= e(setupText('map.search', 'Cerca un luogo o un indirizzo')) ?></label>
                            <span class="setup-search-row">
                                <input type="search" id="map-search" autocomplete="off" autocapitalize="off"
                                       spellcheck="false"
                                       placeholder="<?= e(setupText('map.searchPlaceholder', 'es. Gubbio, Perugia')) ?>"
                                       data-searching="<?= e(setupText('map.searching', 'Ricerca in corso…')) ?>"
                                       data-empty="<?= e(setupText('map.searchEmpty', 'Nessun risultato: prova con il nome del comune.')) ?>"
                                       data-failed="<?= e(setupText('map.searchFailed', 'Ricerca non disponibile ora: sposta la mappa a mano.')) ?>" />
                                <button type="button" class="setup-btn" id="map-search-go"><?= e(setupText('map.searchGo', 'Cerca')) ?></button>
                            </span>
                            <span class="setup-hint" id="map-search-state"><?= e(setupText('map.searchHint', 'I luoghi arrivano da OpenStreetMap (Nominatim). Il risultato scelto diventa il centro della mappa.')) ?></span>
                            <ul class="setup-search-results" id="map-search-results" hidden></ul>
                        </div>

                        <div id="setup-map" class="setup-map"
                             data-lat="<?= e((string) $center[0]) ?>"
                             data-lon="<?= e((string) $center[1]) ?>"
                             data-zoom="<?= e(setupCurrentValue('defaultZoom')) ?>"
                             data-max-zoom="<?= e((string) SETUP_MAX_ZOOM) ?>"
                             data-lang="<?= e($lang) ?>"></div>

                        <p class="setup-map-readout">
                            <span class="setup-map-zoom" id="map-zoom-state"
                                  data-label="<?= e(setupText('map.zoomLevel', 'Livello')) ?>"></span>
                            <span class="setup-hint" id="map-center-state"
                                  data-label="<?= e(setupText('map.centerLabel', 'Centro')) ?>"></span>
                        </p>

                        <input type="hidden" name="mapLat" id="f-mapLat" value="<?= e((string) $center[0]) ?>" />
                        <input type="hidden" name="mapLon" id="f-mapLon" value="<?= e((string) $center[1]) ?>" />

                        <p class="setup-hint setup-zoom-lead"><?= e(setupText('map.zoomHint', 'I tre livelli di zoom si provano sulla mappa qui sopra: scegli un campo e la mappa mostra subito quel livello: se poi zoomi la mappa, il valore lo segue.')) ?></p>

                        <div class="setup-grid setup-zoom-grid" id="setup-zoom-grid">
                            <?php
                            setupInput('defaultZoom', setupText('map.defaultZoom', 'Zoom iniziale'), setupText('map.defaultZoomHint', 'Come si apre la mappa della homepage.'), 'number', ['min' => 1, 'max' => SETUP_MAX_ZOOM, 'step' => 1, 'fieldClass' => 'setup-zoom-field', 'data-zoom-field' => 'defaultZoom']);
                            setupInput('minZoom', setupText('map.minZoom', 'Zoom minimo'), setupText('map.minZoomHint', 'Non può essere più stretto dello zoom iniziale.'), 'number', ['min' => 0, 'max' => SETUP_MAX_ZOOM, 'step' => 1, 'fieldClass' => 'setup-zoom-field', 'data-zoom-field' => 'minZoom']);
                            setupInput('flyToZoom', setupText('map.flyToZoom', 'Zoom sulla cavità scelta'), setupText('map.flyToZoomHint', 'Quanto si avvicina la mappa quando si clicca una cavità nell\'elenco.'), 'number', ['min' => 1, 'max' => SETUP_MAX_ZOOM, 'step' => 1, 'fieldClass' => 'setup-zoom-field', 'data-zoom-field' => 'flyToZoom']);
                            ?>
                        </div>

                        <p class="setup-hint"><?= e(setupText('map.boundsNote', 'I limiti oltre i quali la mappa non si sposta non si impostano da qui: la mappa resta libera. Chi ne ha bisogno può scriverli nella sezione [map] di custom/settings.ini.')) ?></p>

                        <details class="setup-advanced">
                            <summary><?= e(setupText('map.viewerAdvanced', 'Visualizzatore 3D')) ?></summary>
                            <div class="setup-grid">
                                <?php setupInput('fpBaseSpeed', setupText('map.fpBaseSpeed', 'Velocità di camminata (unità al secondo)'), '', 'number', ['min' => 0.1, 'max' => 20, 'step' => 0.1]); ?>
                                <p class="setup-field">
                                    <label for="f-scaleBarUnit"><?= e(setupText('map.scaleBarUnit', 'Unità della barra di scala')) ?></label>
                                    <select id="f-scaleBarUnit" name="scaleBarUnit">
                                        <?php $unit = setupCurrentValue('scaleBarUnit'); ?>
                                        <option value="m" <?= $unit === 'ft' ? '' : 'selected' ?>><?= e(setupText('map.unitMeters', 'metri')) ?></option>
                                        <option value="ft" <?= $unit === 'ft' ? 'selected' : '' ?>><?= e(setupText('map.unitFeet', 'piedi')) ?></option>
                                    </select>
                                </p>
                                <p class="setup-field setup-check-field">
                                    <label for="f-skyDomeEnabled">
                                        <input type="checkbox" id="f-skyDomeEnabled" name="skyDomeEnabled" value="1" <?= setupCurrentValue('skyDomeEnabled') === '1' ? 'checked' : '' ?> />
                                        <?= e(setupText('map.skyDome', 'Cupola del cielo attorno alla scena')) ?>
                                    </label>
                                </p>
                            </div>
                        </details>
                    </div>
                </section>

                <!-- ============ 5. Riepilogo ============ -->
                <section class="card setup-step" id="step-summary" data-step="summary">
                    <div class="card-header"><span aria-hidden="true">💾</span> <?= e(setupText('summary.title', 'Riepilogo')) ?></div>
                    <div class="card-body">
                        <p class="setup-lead"><?= e(setupText('summary.intro', 'Controlla i valori e salva. Il file custom/settings.ini viene riscritto mantenendo i suoi commenti, e una copia di sicurezza resta in custom/settings.ini.bak.')) ?></p>
                        <dl class="setup-summary" id="setup-summary"></dl>
                        <?php if (!$canWrite) : ?>
                            <div class="status-message warning"><?= e(setupText('summary.manual', 'La cartella custom/ non è scrivibile: al salvataggio riceverai il file da caricare a mano.')) ?></div>
                        <?php endif; ?>
                        <p class="setup-actions">
                            <button type="submit" class="setup-btn setup-btn-primary"><?= e(setupText('summary.save', 'Salva e avvia il sito')) ?></button>
                        </p>
                    </div>
                </section>

                <nav class="setup-nav" id="setup-nav">
                    <button type="button" class="setup-btn" id="setup-prev" disabled><?= e(setupText('nav.prev', 'Indietro')) ?></button>
                    <button type="button" class="setup-btn setup-btn-primary" id="setup-next"><?= e(setupText('nav.next', 'Avanti')) ?></button>
                </nav>
            </form>

        <?php endif; ?>

        <footer class="setup-foot">
            <a href="<?= e($projectUrl) ?>" target="_blank" rel="noopener"><?= e($projectName) ?></a>
            <span>·</span>
            <span><?= e(setupText('license', 'Software libero rilasciato sotto licenza GNU GPL v3')) ?></span>
            <?= projectRibbon(); ?>
        </footer>
    </div>

    <script src="js/setup.js" defer></script>
</body>

</html>
