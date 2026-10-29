# Changelog

Tutte le modifiche rilevanti di 3DCaveViewer. Il formato segue
[Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e le versioni il
[Semantic Versioning](https://semver.org/lang/it/). La versione in uso è
`APP_VERSION` in `config.php`, mostrata in fondo a `status.php`.

## [Non rilasciato]

### Modificato
- Rotazione col mouse come in CloudCompare: trackball virtuale centrata sul
  punto cliccato, il modello segue il cursore senza blocchi in verticale
  (`viewer.mouseRotation = "turntable"` ripristina la rotazione precedente,
  `viewer.mouseRotateSpeed` ne regola la sensibilità). "Reset vista" e le
  viste predefinite raddrizzano l'orizzonte; i link condivisi e il codice da
  incorporare conservano l'inclinazione con il parametro `up`

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
- Rotazione col mouse attorno al punto del modello sotto il cursore
  (rispettando la sezione attiva), doppio clic per centrare un punto, zoom
  della rotella verso il cursore
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
