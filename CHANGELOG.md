# Changelog

Tutte le modifiche rilevanti di 3DCaveViewer. Il formato segue
[Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e le versioni il
[Semantic Versioning](https://semver.org/lang/it/). La versione in uso è
`APP_VERSION` in `config.php`, mostrata in fondo a `status.php`.

## [Non rilasciato]

### Corretto
- Su iPhone un modello che la GPU non riesce a contenere non lascia più lo
  schermo nero senza spiegazioni: dopo il primo frame il viewer legge
  `gl.getError()` e, se trova `OUT_OF_MEMORY`, ricarica il modello con
  texture più piccole (fino a ×4) e poi, se non basta, mostra il messaggio
  di memoria insufficiente

### Aggiunto
- GLB optimizer (server e versione statica): opzione *Texture → Lato
  massimo* (default 4096 px) che riduce le texture da 8192 px, la causa più
  frequente dei modelli neri su iPhone. La versione statica converte anche le
  PNG opache in JPEG
- `viewer.php?debug=1`: riquadro diagnostico (vertici, texture, limiti,
  errori GL, perdite del contesto) da fotografare sui telefoni, dove la
  console non è raggiungibile

## [1.0.0] — prima release pubblica

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

### Installazione pulita
- Il repository non contiene più modelli 3D: `modelli/` arriva vuota
  (solo `.gitkeep`) e il suo contenuto è ignorato da git
- Nessun dato personale come default: l'email di contatto parte vuota e,
  finché resta tale, il footer non mostra il link
- Aggiunti `LICENSE` (GPL v3), `THIRD_PARTY_LICENSES.md` e la licenza OFL
  del font Poppins; rimossi i file del font mai usati

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
