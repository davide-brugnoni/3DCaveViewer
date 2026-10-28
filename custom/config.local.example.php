<?php
/**
 * 3D Cave Viewer - Personalizzazioni locali (template)
 * https://github.com/davide-brugnoni/3DCaveViewer/
 *
 * ⚠️ NELLA MAGGIOR PARTE DEI CASI NON SERVE QUESTO FILE.
 * Per personalizzare branding, testi, logo, colori, mappa e viewer usa
 * custom/settings.ini: contiene solo valori, niente codice PHP, quindi un
 * errore di battitura non può rompere il sito.
 *
 *   cp custom/settings.example.ini custom/settings.ini
 *
 * Questo file resta per i casi avanzati (valori calcolati, strutture
 * complesse) e ha la precedenza su settings.ini.
 *
 * Copia questo file in "config.local.php" (stessa cartella) e modifica
 * solo i valori che ti servono: quelli omessi restano ai default definiti
 * in config.php. Questo file NON è tracciato da git, quindi un
 * aggiornamento dell'applicazione non lo tocca mai.
 *
 *   cp custom/config.local.example.php custom/config.local.php
 *
 * ⚠️ IMPORTANTE - LICENZA E ATTRIBUZIONE:
 * Il blocco "originalAuthor" di config.php non è sovrascrivibile da qui:
 * l'autore originale (Davide Brugnoni) deve sempre restare citato nel
 * footer, come richiesto dalla licenza GNU GPL v3. Vale lo stesso per il
 * piccolo badge "Powered by 3DCaveViewer" mostrato nel footer.
 */

declare(strict_types=1);

return [

    // ============================================================
    // BRANDING - Informazioni sull'organizzazione
    // ============================================================
    'branding' => [
        // 'appName' => 'Nome della tua applicazione',
        // 'appShortName' => 'Nome breve',
        // 'organizationName' => 'Nome della tua organizzazione',
        // 'organizationUrl' => 'https://www.tuaorganizzazione.it/',
        // 'contactEmail' => 'info@tuaorganizzazione.it',
        // Il testo del copyright nel footer (la "©" è aggiunta dal template).
        // Supporta i segnaposto {organization}, {app} e {year}.
        // 'copyrightHolder' => 'Davide Brugnoni – Personalizzato da Tua Organizzazione',
        // 'appDescription' => 'Descrizione della tua applicazione',
    ],

    // ============================================================
    // TESTI UI - Testi dell'interfaccia utente
    // ============================================================
    // I testi impostati qui hanno la precedenza su tutto, comprese le
    // traduzioni in i18n/*.json: sono la tua personalizzazione esplicita.
    //
    // Segnaposto disponibili:
    //   {organization} → branding.organizationName
    //   {app}          → branding.appName
    //   {year}         → anno corrente
    //
    // Ogni testo può essere una stringa singola:
    //   'pageTitle' => 'Le grotte del mio gruppo',
    // oppure un array lingua => testo, se il sito è multilingua:
    //   'pageTitle' => [
    //       'it' => 'Le grotte del mio gruppo',
    //       'en' => 'Our caves',
    //   ],
    // Le lingue non elencate ricadono su quella di default ('language.default').
    'texts' => [
        // Titolo grande nell'header della homepage
        // 'pageTitle' => 'Mappa delle cavità in 3D',
        // Sottotitolo sotto al titolo, nell'header della homepage
        // 'pageSubtitle' => 'Esplora la mappa e visualizza i modelli 3D delle cavità {organization}',
        // Intestazione della colonna con l'elenco delle cavità
        // 'sidebarTitle' => 'Cavità Disponibili',
        // Titolo del viewer quando nessun modello è selezionato
        // 'viewerDefaultTitle' => 'Visualizzatore cavità 3D',
        // Descrizione del viewer (usata anche nelle anteprime social)
        // 'viewerDefaultDescription' => 'Esplora i modelli 3D. {organization}',
    ],

    // ============================================================
    // TEMA - Colori e stile visivo
    // ============================================================
    'theme' => [
        // 'themeColor' => '#0b0d10',
        // 'pwaBackgroundColor' => '#0f1b2a',
    ],

    // ============================================================
    // LOGO E ICONE
    // ============================================================
    // I default del progetto stanno in img/ (img/logo.png,
    // img/icon-192.png, img/icon-512.png). Basta un solo file: metti il
    // tuo logo in custom/ (custom/logo.png, ...), viene rilevato da solo
    // e vince sul default. Le icone PWA (custom/icon-192.png,
    // custom/icon-512.png) sono OPZIONALI: se assenti vengono generate
    // automaticamente dal logo (quadrate, centrate su sfondo trasparente,
    // in cache in custom/generated/). Indica un percorso qui sotto solo se
    // usi nomi di file diversi o vuoi fornire icone fatte a mano.
    // Il logo è quello mostrato nell'header della homepage, nella pagina
    // di stato cache e in basso a destra nel viewer 3D.
    'pwa' => [
        // 'icon192' => 'custom/mia-icona-192.png',
        // 'icon512' => 'custom/mia-icona-512.png',
        // 'logo' => 'custom/mio-logo.png',
        // Versione WebP del logo. Se lasciato vuoto viene cercata accanto
        // al logo (stesso nome, estensione .webp).
        // 'logoWebp' => '',
        // Colore di sfondo (hex) per le icone PWA generate dal logo,
        // utile se il logo non ha un canale alpha. Vuoto = trasparente.
        // 'iconBackground' => '#0b0d10',
    ],

    // ============================================================
    // SICUREZZA - Content Security Policy
    // ============================================================
    'security' => [
        // 'extraConnectSrc' => ['https://example.org'],

        // Domini autorizzati a incorporare un modello in un iframe
        // (pannello "Condividi → Incorpora"). Array vuoto = qualsiasi
        // dominio, così il codice generato funziona ovunque senza
        // configurazione. Il visualizzatore completo resta comunque
        // limitato al tuo dominio.
        // 'allowedEmbedOrigins' => ['https://www.miosito.it', 'https://*.miosito.it'],
    ],

    // ============================================================
    // LINGUA - Lingua predefinita dell'applicazione
    // ============================================================
    'language' => [
        // 'default' => 'it',
    ],

];
