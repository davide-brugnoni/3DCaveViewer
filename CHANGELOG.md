# Changelog

Tutte le modifiche rilevanti di 3DCaveViewer. Il formato segue
[Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e le versioni il
[Semantic Versioning](https://semver.org/lang/it/). La versione in uso è
`APP_VERSION` in `config.php`, mostrata in fondo a `status.php`.

## [Non rilasciato]

### Aggiunto
- `EXE_GLB_OPTIMIZER/`: il GLB Optimizer come programma per Windows, con
  installazione guidata in italiano (a cosa serve, cosa viene installato,
  requisiti; per l'utente corrente, senza permessi di amministratore) e una
  finestra propria. Include il proprio Node.js: non serve installare nulla.
  L'installer è compilato dal workflow GitHub `glb-optimizer-windows.yml`.
- `glb-optimizer/`: variabile `HOST` per scegliere l'indirizzo di ascolto
  (`127.0.0.1` = raggiungibile solo dal computer stesso).
- `EXE_GLB_OPTIMIZER/scripts/smoke-test.mjs` (`npm test`): ottimizza GLB con
  texture di molti tipi usando il programma impacchettato; il workflow lo
  esegue su Windows prima di creare l'installer.

### Corretto
- `glb-optimizer/`: una texture che sharp/libvips non riesce a ricomprimere
  (es. "colourspace: parameter space not set" su Windows) faceva fallire
  l'intero file. Ora ogni texture è elaborata a sé: quella problematica resta
  com'era, il resto del modello viene ottimizzato, l'interfaccia mostra un
  avviso e il registro descrive l'immagine (formato, spazio colore, canali,
  profilo ICC).

### Corretto
- Modelli compressi Draco che non si aprivano offline (o con il server che
  risponde 503) anche con tutti i file scaricati: il service worker metteva
  in cache il decoder da `libs/draco/gltf/`, mentre il viewer lo carica da
  `libs/draco/`.
- Una pagina (es. `viewer.php?m=…`) a cui il server risponde con un errore
  5xx viene servita dalla copia in cache invece di mostrare l'errore.

## [1.1.0] — 2026-11-02 — pannello di amministrazione

I modelli si gestiscono dal browser: caricamento, modifica, orientamento,
bozze, cestino e storico, con più utenti, senza FTP e senza scrivere JSON
a mano. Aggiornare dalla 1.0.0 non richiede nulla: si sovrascrive il codice
come sempre (preservando `modelli/` e `custom/`) e si crea il primo
amministratore aprendo `admin.php` con la chiave di `custom/.installed`.

### Aggiunto
- Pannello di amministrazione (`admin.php`) per gestire i modelli dal
  browser, senza FTP:
  - caricamento di nuovi modelli (GLB/GLTF) con nome, descrizione,
    posizione scelta su mappa, rotazione e anteprima social; i file grandi
    vanno a blocchi (`api/admin_upload.php`), oltre i limiti di
    `upload_max_filesize`/`post_max_size`
  - modifica dei modelli esistenti e sostituzione del file 3D: la nuova
    versione prende un nome nuovo (la cache "immutable" e il service worker
    non mostrerebbero altrimenti quella vecchia), la precedente va nel cestino
  - cestino: modelli eliminati e versioni sostituite si ripristinano o si
    eliminano definitivamente
  - più account con ruoli (editor, amministratore); il primo amministratore
    si crea nell'installazione guidata (nuovo passo **Amministratore**,
    facoltativo, che a fine installazione lascia già dentro il pannello)
    oppure dopo, da `admin.php`, con la chiave di configurazione di
    `custom/.installed`
  - storico di chi ha modificato cosa e quando, con il dettaglio dei campi
    (valore precedente → nuovo), filtrabile per modello, utente e tipo
  - salvataggi contemporanei di due utenti sullo stesso modello rilevati:
    i campi toccati da uno solo si uniscono, quelli toccati da entrambi
    vengono segnalati invece di sovrascriversi in silenzio
  - pagina del modello divisa in schede (Informazioni, Posizione,
    File 3D, Orientamento, Anteprima, Storico, Elimina) con un solo
    salvataggio per tutte: la scheda con un errore si apre da sola, quelle
    modificate e non salvate sono segnalate, e dopo il salvataggio si
    torna alla scheda in cui si era
  - scheda Orientamento con anteprima 3D del modello su una griglia
    orizzontale (il pavimento, con gli assi colorati): pulsanti per ruotarlo
    di ±90° attorno agli assi, cursori per la regolazione fine, scorciatoia
    "Z in alto → Y in alto", viste fronte/lato/alto. I gradi finiscono nei
    campi Rotazione X/Y/Z e si salvano con il modulo; il modello si scarica
    solo all'apertura della scheda (sopra i 60 MB su richiesta) e un file
    appena scelto in "File 3D" si vede subito, prima di salvarlo
  - bozze: un modello può essere salvato senza pubblicarlo
    (`"published": false` nei metadati). Resta in `modelli/` ma catalogo,
    mappa, visualizzatore, sitemap, anteprime social e download offline lo
    ignorano; dal pannello si apre in anteprima (`viewer.php?…&preview=1`,
    solo con una sessione del pannello) e si pubblica o ritira con un clic.
    I file di una bozza sono bloccati da un `.htaccess` generato nella sua
    cartella (403 anche a chi conosce l'indirizzo esatto, su Apache) e
    l'anteprima li riceve da `api/admin_model.php`
  - dati in `custom/admin/` (escluso da git, mai toccato dagli aggiornamenti)
  - link **Gestione** al pannello nel footer di homepage, visualizzatore e
    `status.php` (nascosto nella modalità incorporata)
- PWA: i file dei modelli non più pubblicati vengono tolti dalla cache
  offline degli utenti — modelli eliminati, GLB sostituiti (che prendono un
  nome nuovo) e modelli tornati in bozza. La pulizia avviene a ogni
  download completo dei modelli e, per chi ha in cache solo quelli aperti
  nel visualizzatore, quando una pagina chiede il catalogo (al massimo ogni
  10 minuti); un elenco vuoto non cancella nulla

### Modificato
- Rotazione senza rollio, col mouse e col touch: il modello gira attorno
  alla verticale e si inclina solo su/giù, l'orizzonte resta sempre dritto.
  La rotazione libera (trackball) resta disponibile con
  `viewer.mouseRotation = "trackball"` / `viewer.touchRotation = "trackball"`

### Corretto
- Pannello Condividi del visualizzatore: nella scheda «Link» comparivano
  sotto i pulsanti social anche le opzioni della scheda «Incorpora»
- Scheda Orientamento: il modello si apriva nel visualizzatore diverso da
  come era stato sistemato nell'anteprima. Trascinare l'anteprima girava la
  camera, che non viene salvata: si salvano solo i gradi di rotazione. Ora
  nella vista «Visualizzatore» il trascinamento gira il modello (e scrive i
  gradi), senza zoom, così ciò che si vede è ciò che si apre; le altre viste
  sono dichiarate "di controllo, non salvata". Inoltre `api/catalogo.php`
  era in cache nel browser fino a 6 minuti (`max-age=60,
  stale-while-revalidate=300`): subito dopo un salvataggio il visualizzatore
  usava ancora i valori vecchi. Ora è `no-cache` (sempre riconvalidato, di
  norma con un 304 vuoto) e `If-None-Match` prevale sulla data
- PWA installata senza rete: non partiva nulla, solo la pagina "offline".
  All'installazione il service worker non salvava le pagine PHP (`index.php`,
  `viewer.php`, `status.php`), `js/config.php` né il catalogo, e la prima
  pagina visitata non passa dal worker: finivano in cache solo a una visita
  successiva. Su iPhone la web app installata ha una memoria separata da
  Safari, quindi il suo primo avvio era proprio quel caso. Ora sono salvati
  subito (online restano sempre aggiornati), insieme alle icone dei
  segnaposto della mappa
- PWA su mobile: con il service worker attivo il modello 3D non viene più
  letto due volte a ogni apertura del viewer. Il preload del GLB non veniva
  mai riusato dalla fetch del viewer (Chrome non abbina un preload a una
  richiesta servita dal worker), lasciava una copia intera del file
  inutilizzata in memoria e, su rete lenta, poteva far partire un secondo
  download: ora è emesso solo quando la pagina non è controllata dal worker
- Rotazione con un dito su smartphone e tablet: ora la camera ruota attorno
  al punto toccato, come col mouse, con l'orizzonte dritto
  (`viewer.touchRotation = "trackball"` per la rotazione libera). Prima il
  trascinamento orizzontale ruotava il modello attorno alla sua origine e
  quello verticale orbitava attorno a un altro punto: sui modelli grandi o
  a più livelli la zona inquadrata usciva dalla vista, e i modelli con una
  `rotation.x` nei metadati si ribaltavano
- Modelli con molte texture grandi (es. 26 × 4096²) su smartphone: il lato
  minimo di 1024 px non fa più sforare il budget di pixel per modello, e il
  nuovo tentativo dopo `GL_OUT_OF_MEMORY` riduce davvero le texture invece di
  ricaricarle identiche
- Modelli che chiudevano la pagina sugli smartphone (es. sala_fossa_2):
  - i pixel delle texture vengono liberati dalla RAM appena copiati sulla
    GPU, e il decoder Draco viene chiuso a fine caricamento invece di restare
    in memoria per tutta la visita
  - se la scheda viene chiusa dal sistema durante il caricamento, alla
    riapertura il modello riparte con texture a risoluzione più bassa (con un
    avviso), e il livello che ha funzionato viene ricordato per quel modello
    su quel dispositivo per 30 giorni

## [1.0.0] — 2026-10-29 — prima release pubblica

Prima versione distribuita perché altri gruppi speleologici possano
installarla senza modificare il codice.

### Funzionalità
- Mappa interattiva (Leaflet + OpenStreetMap) con ricerca delle cavità
- Visualizzatore 3D (Three.js) con navigazione orbitale, in prima persona e
  in realtà virtuale (WebXR)
- Misure di distanza con esportazione CSV, piani di sezione X/Y/Z,
  annotazioni (POI) con esportazione/importazione JSON
- Screenshot PNG, link di condivisione con la vista della camera,
  generatore di codice `<iframe>` per incorporare un modello in un articolo
- Interfaccia in italiano, inglese, francese e spagnolo
- PWA con funzionamento offline, download dei modelli su consenso e pagina
  di stato della cache
- Gestione della memoria per modelli e texture pesanti su smartphone
- Installazione guidata al primo avvio (`setup.php`) con chiave per riaprirla
- Rotazione col mouse come in CloudCompare: trackball virtuale centrata sul
  punto del modello sotto il cursore (rispettando la sezione attiva), senza
  blocchi in verticale; doppio clic per centrare un punto, zoom della rotella
  verso il cursore. `viewer.mouseRotation = "turntable"` ripristina la
  rotazione attorno all'asse verticale, `viewer.mouseRotateSpeed` ne regola
  la sensibilità. "Reset vista" e le viste predefinite raddrizzano
  l'orizzonte; link condivisi e codice da incorporare conservano
  l'inclinazione con il parametro `up`
- I modelli senza coordinate GPS compaiono nella lista della homepage, senza
  marker sulla mappa
- GLB optimizer (server e versione statica) con riduzione delle texture a un
  lato massimo (default 4096 px)
- `viewer.php?debug=1`: riquadro diagnostico per i problemi visibili solo
  sui telefoni

### Installazione pulita
- Il repository non contiene più modelli 3D: `modelli/` arriva vuota
  (solo `.gitkeep`) e il suo contenuto è ignorato da git
- Nessun dato personale come default: l'email di contatto parte vuota e,
  finché resta tale, il footer non mostra il link
- Aggiunti `LICENSE` (GPL v3), `THIRD_PARTY_LICENSES.md` e la licenza OFL
  del font Poppins; rimossi i file del font mai usati
- README: installazione semplice via ZIP + FTP

### Correzioni
- Catalogo: una cartella `modelli/` assente dà un catalogo vuoto invece di
  un errore 500; un errore di scrittura della cache non corrompe più il JSON;
  un modello senza campo `file` usa `<cartella>.glb` anche nel viewer; i
  modelli solo OBJ + MTL non vengono più scartati
- `paths.modelsFolder` è rispettato ovunque (viewer, homepage, service worker)
- Homepage e viewer spiegano un catalogo vuoto, un modello inesistente e un
  catalogo in errore
- Aiuto desktop: si trasla con il tasto destro del mouse, non il centrale
- `[social]` in `custom/settings.ini` nasconde davvero i pulsanti spenti
- Le anteprime social esistenti (anche fatte a mano) non vengono più
  sovrascritte, se non dopo un aggiornamento del modello
- Icone PWA rigenerate anche quando cambia `pwa.iconBackground`;
  `js/config.php` si rinnova quando cambiano il file stesso o il logo
- Embed: aggiunta l'opzione "Prima persona"; il parametro `sec` non accetta
  più valori oltre 100
- Il wizard non va più in errore senza `mbstring`/`fileinfo` e, se non può
  scrivere `custom/.installed`, offre il file della chiave da caricare
- `.htaccess`: impostazioni PHP applicate anche con `mod_php7`
- Su iPhone un modello troppo grande per la GPU non lascia più lo schermo
  nero: il viewer ricarica con texture più piccole e, se non basta, mostra
  il messaggio di memoria insufficiente
