<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/logo-dark.png">
  <img src="docs/img/logo-light.png" alt="3DCaveViewer by Buio Verticale" width="420">
</picture>

# 3D Cave Viewer

### Visualizzatore Interattivo di Cavità Sotterranee

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Three.js](https://img.shields.io/badge/Three.js-v0.160.0-000000?logo=three.js)](https://threejs.org/)
[![PHP](https://img.shields.io/badge/PHP-7.4+-777BB4?logo=php&logoColor=white)](https://www.php.net/)
[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa)](https://web.dev/progressive-web-apps/)

**Sviluppato da [Davide Brugnoni](mailto:davide.brugnoni@gmail.com)**
**[Buio Verticale - Gruppo Speleologico CAI Gubbio](https://www.buioverticale.it)**

[🌐 Sito Web](https://www.buioverticale.it) • [📧 Contatti](mailto:davide.brugnoni@gmail.com) • [🐙 Repository](https://github.com/davide-brugnoni/3DCaveViewer) • [💛 Dona via PayPal](https://www.paypal.com/paypalme/DavideBrugnoni92)

---

</div>

## 📋 Descrizione

**3D Cave Viewer** è un'applicazione web Progressive (PWA) che permette di esplorare modelli 3D di grotte e cavità naturali/artificiali direttamente dal browser.

### ✨ Caratteristiche Principali

| Funzionalità | Descrizione |
|:------------:|-------------|
| 🗺️ **Mappa Interattiva** | Visualizzazione geolocalizzata con ricerca e filtro cavità |
| 🎮 **Visualizzatore 3D** | Basato su Three.js con supporto GLB/GLTF e OBJ |
| 🔍 **Selettore Modelli** | Dropdown ricercabile per selezionare rapidamente il modello |
| 🚶 **Modalità POV (Prima Persona)** | Esplorazione immersiva con rilevamento collisioni, crosshair e indicatore braccia |
| 🥽 **VR (WebXR)** | Locomozione con gli stick e rilevamento collisioni, ritorno al punto di partenza con doppio grilletto, vignetta comfort |
| 🔧 **Strumenti di Analisi** | Piani di sezione X/Y/Z (con inversione lato), 6 viste ortogonali, barra di scala dinamica |
| 🌌 **Sfondo a Gradiente** | Cupola del cielo con gradiente configurabile e bagliore d'orizzonte stabile per il comfort VR |
| 📏 **Misurazione 3D** | Punti multipli colorati con snap ai vertici, editing, formattazione automatica cm/m/km ed export CSV |
| 📍 **Annotazioni POI** | Punti di interesse persistenti con etichette, salvati in locale per modello, con export/import JSON |
| 🧭 **Pannelli Flottanti** | Pannelli strumenti trascinabili liberamente sullo schermo |
| 🌍 **Multilingua** | Interfaccia disponibile in Italiano, Inglese, Francese e Spagnolo |
| 📱 **Progressive Web App** | Installabile e utilizzabile offline con bottom-sheet e minimizzazione a pill |
| 🔗 **Condivisione Social** | Link alla vista corrente (camera e inquadratura) via Facebook, WhatsApp, Telegram, email, con anteprime automatiche |
| 📰 **Codice da Incorporare** | Generatore di `<iframe>` responsive per articoli esterni (WordPress e simili), con interfaccia ridotta, vista e sezione congelate e rimando al visualizzatore completo |
| 📸 **Screenshot PNG** | Esporta la vista 3D corrente in PNG con sezioni, misurazioni, barra scala e logo sovrapposti |
| 🖼️ **Anteprima Social** | Generazione automatica immagine 1200×630 con watermark per condivisione |
| 💡 **Onboarding Guidato** | Popup introduttivo al primo accesso con opzione "Non mostrare più" |
| 📲 **Modelli grandi su mobile** | Download a copia singola e texture ridotte automaticamente su telefoni e tablet, per non far chiudere la scheda del browser |
| 🧭 **Installazione guidata** | Al primo avvio un wizard in cinque passi configura nome, logo, colori e mappa, senza toccare file |
| 🛠️ **Ottimizzatore GLB Incluso** | Due strumenti (Node server e pagina browser-only) per comprimere i modelli, con supporto a file fino a 5 GB |

---

## 💛 Supporta il Progetto

☕ Offri un caffè a Davide: potrebbe eliminare bug, aggiungere funzionalità e restare sveglio fino alle 3 di notte. Sui bug in meno non garantiamo nulla.

<div align="center">

[![Dona con PayPal](https://img.shields.io/badge/Dona%20con-PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.com/paypalme/DavideBrugnoni92)

</div>

---

## 🚀 Funzionalità

### 🗺️ Mappa Interattiva (`index.php`)

- Visualizzazione su **Leaflet/OpenStreetMap**
- Lista delle cavità ordinata alfabeticamente con ricerca e filtro (per nome e descrizione)
- Click su marker o lista per aprire il visualizzatore 3D
- Sulla mappa compaiono solo i modelli con coordinate `lat`/`lon`; quelli senza restano comunque raggiungibili dal selettore del visualizzatore
- Offline resta disponibile la **vista standard** della mappa (centro e zoom configurati); le tessere viste spostando o zoomando non vengono salvate, come richiesto dalla policy di OpenStreetMap

### 🎨 Visualizzatore 3D (`viewer.php`)

<table>
<tr>
<td width="50%">

**🎮 Controlli**
- Controlli orbitali (ruota, zoom, pan)
- Modalità POV / prima persona (WASD + mouse) con crosshair e indicatore braccia
- Joystick virtuale per mobile (joystick e sguardo seguiti in modo indipendente, uno per pollice)
- Look-mode touch su desktop senza pointer-lock
- Dropdown ricercabile per selezione modello
- Toolbar compatta a icone raggruppate (strumenti pannello / modalità di navigazione) con tooltip; su mobile menu con icone ed etichette
- Reset vista rapido

</td>
<td width="50%">

**🔧 Strumenti**
- 6 viste ortogonali predefinite con animazione fluida
- Piani di sezione X/Y/Z con slider e inversione lato
- Rotazione automatica (toggle)
- Barra di scala metrica dinamica
- Sfondo a cupola con gradiente del cielo (comfort VR)
- Screenshot PNG della vista corrente (con overlays)
- Pannelli flottanti trascinabili (misurazioni, sezioni, viste)
- Pannelli mobile a bottom-sheet con minimizzazione a pill
- Su telefono il layout mobile resta anche in orizzontale
- Errori di caricamento con pulsante «Riprova», watchdog dopo 60 s e ripristino automatico del contesto WebGL perso

</td>
</tr>
</table>

### 📏 Sistema di Misurazione 3D

Il visualizzatore include un sistema completo per misurare distanze all'interno del modello:

<table>
<tr>
<td width="50%">

**🎯 Funzionamento**
- Click sul modello per aggiungere punti
- **Snap automatico ai vertici** della mesh per massima precisione
- Sfere colorate 3D indicano i punti
- Linee di connessione con effetto glow
- Etichette 3D con ID e distanza

</td>
<td width="50%">

**📊 Pannello Misurazioni**
- Lista misurazioni con distanze
- Formato intelligente (cm/m/km)
- **Editing punti**: click su una misurazione per spostare un estremo
- Pulsante elimina per ogni misurazione
- **Export CSV** dell'elenco misurazioni
- Pannello trascinabile

</td>
</tr>
</table>

```
🎨 8 colori disponibili per misurazioni multiple simultanee
📐 Precisione basata su coordinate world del modello
🧲 Raggio di snap fisso di 0.15 unità modello
```

### 📍 Annotazioni (Punti di Interesse)

<table>
<tr>
<td width="50%">

**🎯 Funzionamento**
- Pulsante **POI** nella toolbar per aprire il pannello
- **+** e poi click sul modello per aggiungere un punto
- Marker 3D con etichetta sempre leggibile sullo schermo
- Con un piano di sezione attivo si possono aggiungere punti solo sulla parte visibile del modello

</td>
<td width="50%">

**📋 Pannello POI**
- Lista dei punti con **Vai al punto** (volo animato della camera)
- **Rinomina** (`Invio` conferma, `Esc` annulla) ed elimina
- Salvataggio automatico nel browser (`localStorage`), separato per modello
- **Export/Import JSON** (`poi_<cartella>.json`) per condividerli: l'import aggiunge i punti a quelli esistenti

</td>
</tr>
</table>

### 🌍 Internazionalizzazione (i18n)

L'applicazione supporta 4 lingue, selezionabili direttamente dall'interfaccia (homepage e visualizzatore) tramite un menu a tendina con bandierine (emoji dichiarate in ogni file `i18n/*.json`):

| Lingua | Codice | Flag |
|--------|:------:|:----:|
| Italiano | `it` | 🇮🇹 |
| English | `en` | 🇬🇧 |
| Français | `fr` | 🇫🇷 |
| Español | `es` | 🇪🇸 |

```
✓ Selettore lingua in-app (persistito nel cookie "lang" per 1 anno)
✓ Lingua predefinita configurabile in custom/settings.ini (sezione [language]) o dall'installazione guidata
✓ Caricamento traduzioni lato server (PHP) e lato client (JS)
✓ Fallback alla lingua predefinita se il file non è disponibile
✓ Nessun rilevamento automatico dalla lingua del browser
```

> ⚙️ La lingua viene risolta in quest'ordine: parametro `?lang=XX` → cookie `lang` → `language.default` di `config.php`. Per cambiare la lingua **predefinita** imposta `default = "it"` nella sezione `[language]` di `custom/settings.ini`, così la scelta resta intatta a ogni aggiornamento (vedi [Aggiornare all'ultima versione](#-aggiornare-allultima-versione)).

### 📸 Screenshot e Condivisione

<table>
<tr>
<td width="50%">

**📷 Screenshot PNG (vista corrente)**
- Pulsante fotocamera nella toolbar
- Cattura la vista 3D con lo sfondo della scena (trasparente se la cupola del cielo è disattivata)
- Overlays inclusi: sezioni attive, misurazioni, barra scala, logo
- Logo del gruppo inserito mantenendo le proporzioni originali (mai deformato)
- Download immediato come file PNG

</td>
<td width="50%">

**🖼️ Anteprima Social (1200×630)**
- Cattura automatica per condivisione
- Downscaling a 1200×630px (standard social)
- Watermark automatico con nome modello e firma
- Salvataggio lato server

</td>
</tr>
<tr>
<td width="50%">

**🔗 Condivisione Social**
- Link che riapre il modello **con la stessa inquadratura** (`?m=…&cam=…&tgt=…`)
- Facebook
- WhatsApp
- Telegram
- Email
- Pulsanti attivabili/disattivabili da `[social]` in `custom/settings.ini`

</td>
<td width="50%">

**📰 Incorpora in un articolo**
- Scheda «Incorpora» del pannello Condividi
- Genera un `<iframe>` responsive da incollare in un blocco HTML
- Parte dalla vista corrente e dal piano di sezione attivo, per raccontare un punto preciso della grotta
- Proporzioni a scelta (16:9, 4:3, 1:1, 21:9)
- Interfaccia ridotta configurabile (barra di scala, nome del modello, schermo intero, informazioni, misure, sezioni, screenshot, lingua, prima persona)
- Pulsante «Anteprima» che apre la pagina incorporata in una nuova scheda prima di copiare il codice
- Pulsante «Apri nel visualizzatore» sempre presente
- Domini autorizzati limitabili con `[security] allowedEmbedOrigins[]` (vuoto = qualsiasi sito)
- In modalità incorporata non vengono generate anteprime social, né mostrati onboarding e service worker

</td>
</tr>
</table>

### ❓ Sistema di Aiuto e Onboarding

<table>
<tr>
<td width="50%">

**📖 Help popup**
- Sezioni a **fisarmonica** (accordion)
- Tab Desktop / Mobile / VR
- Controlli dettagliati per ogni modalità
- Apertura rapida con tasto `H`

</td>
<td width="50%">

**🎯 Onboarding**
- Popup introduttivo al primo accesso
- Spiega le modalità di navigazione di base
- Checkbox "Non mostrare più"
- Preferenza salvata in `localStorage`

</td>
</tr>
</table>

### 📱 Progressive Web App (PWA)

```
✓ Installabile su dispositivi mobili e desktop
✓ Funzionamento offline dei modelli già aperti nel visualizzatore
✓ Download di tutti i modelli per l'offline solo su consenso (banner, riproposto dopo 7 giorni se rifiutato)
✓ Offline anche la vista standard della mappa in homepage
✓ Service worker per caching intelligente
✓ Icone e manifest configurati
✓ Notifiche di aggiornamento disponibile
✓ Gestione cache tramite pagina status.php
```

> 📲 **Modelli grandi su telefono.** Un GLB da 100 MB, o anche un file
> piccolo con una texture 8192×8192, basta a far chiudere la scheda del
> browser su un telefono. Il visualizzatore scarica il modello in un unico
> buffer, mette in pausa il download offline in background mentre carica,
> e su dispositivi touch o con poca memoria riduce le texture già in fase di
> decodifica (lato massimo 4096 px e budget di 24 megapixel per modello,
> regolabili con `textureMaxSizeMobile`/`textureBudgetMPMobile` nella sezione
> `[viewer]`). Le texture **PNG** non si possono decodificare ridotte: per i
> modelli destinati al mobile usa texture **JPEG o WebP**.

<table>
<tr>
<td width="50%">

**💾 Gestione Cache**
- Pagina dedicata (`status.php`)
- Elenco dei file con ricerca, filtri (in cache, mancanti, errori) e ordinamento per nome, dimensione o stato
- Download di tutti i modelli o solo di quelli selezionati, con pausa/ripresa, velocità, tempo stimato e «Riprova falliti»
- Interruttore del download automatico dei modelli (lo stesso consenso del banner)
- Spazio usato e quota disponibile
- Eliminazione dei file selezionati o pulizia completa della cache

</td>
<td width="50%">

**🔔 Aggiornamenti**
- Service worker rileva nuove versioni automaticamente
- Banner slide-up discreto in basso
- Pulsante **Aggiorna** (skipWaiting + reload)
- Pulsante **Dopo** per rimandare senza forzare il riavvio

</td>
</tr>
</table>

---

## 📁 Struttura del Progetto

```
3DCaveViewer/
├── 🌐 index.php                   # Homepage con mappa interattiva
├── 🎨 viewer.php                  # Visualizzatore 3D principale
├── 📊 status.php                  # Pagina di stato e gestione cache PWA
├── 🧭 setup.php                   # Installazione guidata (primo avvio)
├── 🧩 setup_lib.php               # Campi, validazione e scrittura settings.ini del wizard
├── 🗺️  sitemap.php                 # Sitemap.xml dinamica (via rewrite)
├── 🤖 robots.php                  # Robots.txt dinamico (via rewrite)
├── ⚙️  config.php                  # Configurazione backend (branding, temi, testi)
├── 📱 manifest.php                # Manifest PWA dinamico (servito come manifest.json via rewrite)
├── 📄 offline.html                # Pagina di fallback offline
├── 📝 SINOSSI.md                  # Sinossi dettagliata per stampa, articoli e infografiche
├── 📜 LICENSE                     # Testo della licenza GNU GPL v3
├── 📜 THIRD_PARTY_LICENSES.md     # Licenze delle librerie incluse in lib/
├── 🗒️  CHANGELOG.md                # Novità di ogni versione
├── 📘 docs/PERSONALIZZAZIONE.md   # Guida passo passo alla personalizzazione
├── 📖 CLAUDE.md                   # Guida per AI assistant
├── 🔒 .htaccess                   # Configurazione Apache e header di sicurezza
├── 🖼️  generate_social_preview.php # Generatore anteprime social (PHP GD)
├── 💾 save_social_preview.php     # Salvataggio lato server delle anteprime
│
├── 🔌 api/
│   ├── catalogo.php               # API catalogo modelli (JSON)
│   └── catalogo_assets.php        # API assets/risorse dei modelli
│
├── 🔒 custom/                      # Personalizzazioni — MAI toccata da un aggiornamento
│   ├── README.md                  # Spiegazione dei quattro file (tracciato)
│   ├── settings.ini               # Le tue impostazioni: valori attivi e già pronti (tracciato)
│   ├── settings.example.ini       # Riferimento completo di tutte le opzioni, tracciato
│   ├── config.local.php           # Override avanzati in PHP, opzionale (gitignored)
│   ├── config.local.example.php   # Template del file avanzato
│   ├── .installed                 # Marker di installazione + chiave del wizard (gitignored)
│   ├── settings.ini.bak           # Copia di sicurezza scritta dal wizard (gitignored)
│   ├── generated/                 # Icone PWA generate dal logo (gitignored, automatica)
│   ├── icon-192.png               # La tua icona PWA 192x192, opzionale (gitignored)
│   ├── icon-512.png               # La tua icona PWA 512x512, opzionale (gitignored)
│   └── logo.png / logo.webp       # Il tuo logo (gitignored)
│
├── 🎨 css/
│   ├── index.css                  # Stili homepage
│   ├── viewer.css                 # Stili visualizzatore
│   ├── status.css                 # Stili pagina status
│   └── setup.css                  # Stili installazione guidata
│
├── 📜 js/
│   ├── config.php                 # Configurazione frontend (PHP servito come JS; legge i valori condivisi da config.php)
│   ├── pwa-register.js            # Registrazione service worker
│   ├── pwa-service-worker.js      # Service worker per caching e versioning
│   ├── i18n.js                    # Sistema internazionalizzazione lato client
│   ├── lang-selector.js           # Apertura/chiusura del selettore lingua
│   ├── index.js                   # Logica homepage/mappa (con ricerca)
│   ├── viewer.js                  # Engine Three.js del visualizzatore (~3.800 righe)
│   ├── viewer/                    # Moduli ES6 estratti da viewer.js
│   │   ├── utils.js               # Helper puri, eventManager, dispose
│   │   ├── dom.js                 # Cache centralizzata degli elementi DOM
│   │   ├── loader-ui.js           # Overlay di caricamento + watchdog
│   │   ├── panels.js              # Framework pannelli flottanti / bottom-sheet
│   │   ├── measure.js             # Sistema di misurazione + export CSV
│   │   ├── annotations.js         # Annotazioni POI persistenti (export/import JSON)
│   │   ├── embed.js               # Generatore del codice <iframe> (scheda «Incorpora»)
│   │   ├── model-loader.js        # Download del GLB in un unico buffer, interrompibile
│   │   └── gltf-memory.js         # Parsing GLB senza copie e texture ridotte su mobile
│   ├── viewer-pwa.js              # Gestione PWA nel viewer
│   ├── setup.js                   # Interfaccia dell'installazione guidata
│   └── status.js                  # Logica pagina status (~1.700 righe)
│
├── 🌍 i18n/
│   ├── it.json                    # Traduzioni Italiano (default)
│   ├── en.json                    # Traduzioni English
│   ├── fr.json                    # Traduzioni Français
│   ├── es.json                    # Traduzioni Español
│   ├── template.json              # Template per nuove lingue
│   └── loader.php                 # Loader PHP con auto-discovery
│
├── 🚩 img/                         # Immagini di default del progetto (aggiornabili)
│   ├── README.md                  # Loghi di default e ordine di precedenza
│   ├── logo.png / logo.webp       # Logo di 3DCaveViewer (default)
│   ├── icon-192.png               # Icona PWA di default
│   └── icon-512.png               # Icona PWA di default
│
├── 🗿 modelli/                     # Solo dati — MAI toccata da un aggiornamento
│   ├── catalogo.cache.json        # Cache auto-generata (non modificare)
│   ├── catalogo.cache.hash        # Hash di validazione cache (auto-generato)
│   └── [nome_cavita]/             # Cartella per ogni modello
│       ├── [nome].json            # Metadati del modello
│       ├── [nome].glb             # Modello 3D (GLTF Binary)
│       └── [nome]_social.jpg      # Anteprima per social
│
├── 📚 lib/                         # Librerie vendored (non modificare)
│   ├── three/                     # Three.js v0.160.0
│   ├── three-mesh-bvh/            # BVH per collisioni e raycast accelerati
│   ├── leaflet/                   # Leaflet v1.9.4
│   └── fonts/                     # Font Poppins self-hosted
│
├── 🛠️  glb-optimizer/              # Ottimizzatore GLB — server Node/Express
│   ├── package.json
│   ├── server.js                  # Server Express con upload via browser
│   ├── obj-stream-converter.js    # Conversione OBJ→GLB in streaming (file grandi)
│   ├── draco-streaming-read.js    # Lettura GLB Draco a memoria costante
│   ├── split-large-primitives.js  # Suddivisione mesh enormi per l'encoder Draco
│   ├── public/index.html          # Interfaccia web dell'ottimizzatore
│   └── README.md
│
└── 🛠️  glb-optimizer-static/       # Ottimizzatore GLB — versione browser-only
    └── index.html                 # Pagina HTML singola, nessun server necessario
```

---

## 💻 Requisiti Tecnici

### 🖥️ Server

| Componente | Requisito |
|------------|-----------|
| **PHP** | 7.4+ con estensioni `json`, `gd`, `mbstring` e `fileinfo` |
| **Web Server** | Apache con `mod_rewrite` abilitato e `AllowOverride All` (per `.htaccess`) |
| **Protocollo** | HTTPS (necessario per service worker/PWA e per la VR) |
| **Permessi** | `custom/` e `modelli/` scrivibili dal web server (impostazioni del wizard, icone generate, cache del catalogo, anteprime social) |

> ℹ️ Il primo passo dell'installazione guidata controlla da solo questi
> requisiti (versione PHP, GD, fileinfo, cartelle scrivibili, HTTPS,
> mod_rewrite) e segnala quello che manca.

### 🌐 Browser Supportati

| Browser | Versione Minima |
|---------|----------------|
| 🟦 Chrome/Edge | 90+ |
| 🟧 Firefox | 85+ |
| 🟦 Safari | 14+ |
| 📱 iOS Safari | 14+ |
| 📱 Chrome Android | Ultima versione |

### 📚 Librerie Esterne (vendored in `lib/`)

- [Three.js](https://threejs.org/) **v0.160.0** - Engine 3D WebGL
- [Leaflet](https://leafletjs.com/) **v1.9.4** - Mappe interattive
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) - BVH per raycast e collisioni accelerate

---

## ⚙️ Installazione

Non serve saper programmare né usare la riga di comando: basta un hosting
con PHP (quasi tutti quelli condivisi vanno bene, vedi [Requisiti
Tecnici](#-requisiti-tecnici)) e un programma FTP come
[FileZilla](https://filezilla-project.org/) (gratuito). Non c'è nessun passo
di build: i file si caricano così come sono.

### 🔧 Installazione in 5 passi (FTP)

1️⃣ **Scarica il programma**
- Vai alla pagina
  [Releases](https://github.com/davide-brugnoni/3DCaveViewer/releases) e
  scarica lo ZIP dell'ultima versione;
- se lì non c'è ancora nessuna versione pubblicata, dalla
  [pagina del progetto](https://github.com/davide-brugnoni/3DCaveViewer)
  clicca il pulsante verde **Code** → **Download ZIP**.

Estrai lo ZIP sul tuo computer: ottieni una cartella (es.
`3DCaveViewer-main`) che contiene `index.php`, `viewer.php`, le cartelle
`css/`, `js/`, `lib/`, `custom/`, `modelli/` e così via.

2️⃣ **Carica i file sul server via FTP**
- Collegati al tuo spazio web con FileZilla (host, utente e password te li
  dà il provider dell'hosting);
- apri sul server la cartella del sito (di solito `public_html/`, `www/` o
  `htdocs/`), oppure una sua sottocartella se vuoi il viewer su un
  indirizzo tipo `https://tuodominio.it/grotte/`;
- trascina lì **il contenuto** della cartella estratta (non la cartella
  stessa, altrimenti il sito finisce in `…/3DCaveViewer-main/`).

> ⚠️ Controlla che sia arrivato anche il file **`.htaccess`**: inizia con
> un punto, quindi alcuni programmi lo nascondono. In FileZilla attiva
> *Server → Forza la visualizzazione dei file nascosti*. Senza quel file il
> sito non è protetto e alcuni indirizzi non funzionano.

3️⃣ **Rendi scrivibili `custom/` e `modelli/`**

Su molti hosting lo sono già, e il primo passo dell'installazione guidata
te lo dice. Se segnala un problema: in FileZilla clic destro sulla cartella
→ **Permessi file…** → valore `755` (se non basta, `775`), spunta
*Ricorsione nelle sottocartelle* e conferma. Fallo per `custom/` e per
`modelli/`.

4️⃣ **Apri il sito: parte l'installazione guidata**

Visita `https://tuodominio.it/` (o la sottocartella che hai scelto). Alla
prima visita non compare la mappa ma un installer in cinque passi
(benvenuto e requisiti tecnici, identità del gruppo con il logo, colori,
mappa, riepilogo). A fine installazione il sito riparte normalmente dalla
mappa. Dettagli in [🧭 Installazione
guidata](#-installazione-guidata-setupphp).

> 🔒 **Completa subito l'installazione guidata.** Finché non è conclusa,
> chiunque raggiunga il sito può aprirla e configurarlo. Nell'ultima
> schermata **scarica il file della chiave** e conservalo: serve per
> rientrare nell'installer più avanti.

5️⃣ **Aggiungi i tuoi modelli**

Carica via FTP in `modelli/` una cartella per ogni cavità, con dentro il
file `.glb` e il file `.json` dei dati — vedi [📦 Aggiungere un Nuovo
Modello 3D](#-aggiungere-un-nuovo-modello-3d). Finché non ne aggiungi uno
la mappa resta senza segnaposti e lo dice.

Fatto. Gli indirizzi utili:
- 🏠 Homepage: `https://tuodominio.it/`
- 🎨 Viewer diretto: `https://tuodominio.it/viewer.php?m=nome_cartella`
- 📊 Stato cache offline: `https://tuodominio.it/status.php`

### 🧑‍💻 Per utenti esperti (git, server propri)

<details>
<summary>Installazione con git, permessi da terminale, nginx</summary>

Clona il repository direttamente nella cartella del sito:
```bash
git clone https://github.com/davide-brugnoni/3DCaveViewer.git
```

Punta il document root alla cartella del progetto e verifica che
`.htaccess` sia abilitato (`AllowOverride All`) e che il sito sia in HTTPS.

Se i file appartengono a un utente diverso da quello del web server,
assegna le due cartelle scrivibili al web server oppure al suo gruppo:
```bash
sudo chown -R www-data:www-data modelli/ custom/
```
```bash
chmod -R g+rwX modelli/ custom/
```

Per aggiornare basta `git pull`: `custom/settings.ini` è tracciato, quindi
se l'hai modificato git fonderà le tue modifiche con quelle eventuali del
progetto; il resto di `custom/` e `modelli/` è ignorato da git.

> ⚠️ **Server senza `.htaccess`** (nginx, o Apache con `AllowOverride None`):
> le regole che proteggono `custom/` non vengono applicate e file come
> `custom/settings.ini` e `custom/.installed` (che contiene la chiave per
> riaprire l'installer) sarebbero scaricabili. Blocca l'accesso a mano, per
> nginx ad esempio:
> ```nginx
> location ~ ^/custom/(?!generated/|logo\.|icon-) { deny all; }
> location ~ /\.(?!well-known) { deny all; }
> location ~ \.(ini|bak|log|cache|hash|md)$ { deny all; }
> ```

</details>

---

## 🧭 Installazione guidata (`setup.php`)

Finché il file `custom/.installed` non esiste, le pagine del sito
(`index.php`, `viewer.php`, `status.php`) rimandano a `setup.php`; le API,
il manifest, `robots.txt` e la sitemap continuano invece a rispondere. Il
wizard raccoglie le impostazioni in cinque passi — **Benvenuto** (requisiti
e lingua predefinita), **Identità** (nomi, sito, email, copyright, logo e,
nel blocco avanzato, i testi della homepage), **Colori**, **Mappa** (centro,
zoom e, nel blocco avanzato, velocità di camminata, unità della barra di
scala e cupola del cielo), **Fine** — e le scrive in
`custom/settings.ini`, riscrivendo solo le righe che cambiano: i commenti
che documentano ogni voce restano al loro posto, e una copia di sicurezza
del file precedente resta in `custom/settings.ini.bak`.

Il logo caricato viene salvato come `custom/logo.png` e le icone della PWA
vengono generate automaticamente da lì.

I valori inseriti vengono controllati due volte: mentre si compila il form
(il wizard segnala l'errore sotto al campo e non fa proseguire) e di nuovo
sul server, che scarta quello che non torna e lascia la voce al suo default
elencando a fine installazione cosa ha ignorato. I controlli comprendono
anche le combinazioni: lo zoom minimo non può essere più stretto di quello
iniziale, e il testo del copyright deve continuare a citare l'autore
originale (licenza GPL v3).

Nel passo della mappa il centro si sceglie trascinandola oppure cercando un
indirizzo (i luoghi arrivano da OpenStreetMap), e i tre livelli di zoom si
provano sulla mappa stessa: il campo su cui sei porta la mappa a quel
livello, e se poi la zoomi il valore lo segue. I limiti oltre i quali la
mappa non si sposta non si impostano da qui — di serie non ce ne sono e la
mappa resta libera; chi li vuole li scrive nella sezione `[map]` di
`custom/settings.ini`.

> ⚠️ **Esegui l'installazione subito dopo aver caricato i file.** Come per
> l'installer di WordPress, finché non è stata completata chiunque
> raggiunga il sito può configurarlo. Se preferisci evitare del tutto quella
> finestra, crea a mano un file `custom/.installed` prima di pubblicare,
> con dentro una chiave a tua scelta (una riga di almeno 32 caratteri
> casuali): il sito parte configurato con i valori dell'INI e l'installer
> resta muto, e quella chiave lo riapre. Un marker vuoto funziona lo
> stesso, ma senza chiave: per riaprire il wizard andrà cancellato.

**La chiave di configurazione.** L'ultima schermata mostra la chiave che
riapre il wizard e offre il pulsante per scaricarla come file di testo.
Scaricalo: è lo stesso file che sta sul server in `custom/.installed`
(qualche riga di commento che spiega cos'è, e in fondo la chiave), quindi
volendo si può anche ricaricare tale e quale al suo posto. La chiave non
cambia se rientri nel wizard e salvi di nuovo, così il file che hai
conservato resta valido.

**Riaprire il wizard più tardi.** A installazione conclusa `setup.php`
risponde `403` e mostra il form di sblocco. Per rientrarci ci sono tre
strade:

- incollare la chiave nel campo di quel form;
- ricaricare lì il file della chiave scaricato a fine installazione (viene
  letto dal browser, non viene inviato al server, e compila il campo);
- cancellare `custom/.installed` dal server via FTP o dal pannello
  dell'hosting — è la via d'uscita se la chiave è andata persa.

Resta valido anche `setup.php?key=CHIAVE`, ma il form è preferibile: la
chiave viaggia in POST invece di finire nella barra degli indirizzi, nella
cronologia e nei log del server.

**Se `custom/` non è scrivibile** il wizard funziona lo stesso: al
salvataggio fa scaricare `settings.ini` (o lo mostra da copiare) e il file
della chiave da caricare a mano come `custom/.installed`.

**Aggiornamenti.** Un'installazione già in uso non rivede l'installer: la
presenza di `custom/config.local.php`, di un logo in `custom/`, o di un
qualsiasi valore di `settings.ini` diverso dal default del progetto basta a
riconoscerla, e il marker viene ricreato in silenzio.

---

## 🔄 Aggiornare all'ultima versione

La regola è semplice: **preserva `modelli/` e `custom/`, sovrascrivi tutto
il resto**.

| Cartella/File | Contenuto | Da fare in un aggiornamento |
|---|---|---|
| `modelli/` | I tuoi modelli 3D (GLB + metadati JSON) | ❌ Non toccare |
| `custom/` | I tuoi loghi, le tue icone e `settings.ini` | ❌ Non toccare |
| Tutto il resto | Codice dell'applicazione (PHP, JS, CSS, librerie) | ✅ Sovrascrivi interamente |

### 📝 Procedura

1. Scarica lo ZIP della nuova versione (come al [passo 1
   dell'installazione](#-installazione-in-5-passi-ftp)) ed estrailo sul
   computer
2. **Elimina** dalla cartella estratta `modelli/` e `custom/`, così non
   rischi di caricarle per sbaglio
3. Carica via FTP tutto il resto sopra la tua installazione esistente;
   quando FileZilla chiede cosa fare con i file già presenti scegli
   **Sovrascrivi** (spunta *Usa sempre questa azione*)
4. Svuota la cache del browser o attendi il banner di aggiornamento PWA

> 💡 **Nota**: la cartella `custom/` va sempre esclusa dalla copia, quindi
> sopravvive intatta a ogni aggiornamento — il tuo `settings.ini` già
> personalizzato, `config.local.php`, i tuoi loghi e le tue icone. I loghi di
> default del progetto stanno invece in `img/`, che è codice e va
> sovrascritta normalmente.

---

## 🗂️ La cartella `custom/`: cosa contiene e come si usa

Tutte le personalizzazioni della tua installazione — testi, colori, mappa,
loghi, icone — vivono in un unico posto: la cartella `custom/`. È **tua**:
un aggiornamento dell'applicazione non la tocca mai (vedi [Aggiornare
all'ultima versione](#-aggiornare-allultima-versione)). Contiene quattro
file di configurazione, più — se li aggiungi — i tuoi loghi e le tue icone
(questi ultimi coperti nel dettaglio più sotto, in [🎨 Personalizzare Loghi
e Icone](#-personalizzare-loghi-e-icone)).

| File | Tracciato da git? | A cosa serve |
|---|:---:|---|
| `settings.ini` | ✅ sì | Il file che **modifichi davvero**: arriva già pronto con i valori di default attivi |
| `settings.example.ini` | ✅ sì | Copia di **sola consultazione**, commentata, con ogni opzione disponibile (anche quelle non attive di default) |
| `config.local.php` | ❌ no (gitignored) | Override **avanzati** in PHP, solo per i pochi casi che l'INI non può esprimere |
| `config.local.example.php` | ✅ sì | Template da copiare per creare `config.local.php` |
| `.installed` | ❌ no (gitignored) | Marker di [installazione completata](#-installazione-guidata-setupphp); contiene la chiave per riaprire il wizard |

### 🧭 Quale file modifico?

| Cosa vuoi fare | File da usare |
|---|---|
| Cambiare nome, testi, colori, mappa, lingua, social | `custom/settings.ini` |
| Vedere tutte le opzioni disponibili, anche quelle non attive di default | `custom/settings.example.ini` (solo da leggere; copiala se vuoi ripartire da zero) |
| Un valore calcolato o una struttura che l'INI non può esprimere | `custom/config.local.php` (copia `config.local.example.php` per iniziare) |
| Cambiare logo o icone | Vedi [🎨 Personalizzare Loghi e Icone](#-personalizzare-loghi-e-icone) |

Nella grande maggioranza dei casi basta `settings.ini`: è un file di **sole
variabili, niente codice**, quindi un errore di battitura non può rompere
il sito — le righe non valide vengono semplicemente ignorate.

> ⚙️ **Precedenza:** i valori di `config.php` (i default del progetto)
> vengono sovrascritti da `settings.ini`, che a sua volta viene sovrascritto
> da `config.local.php`, se presente. In pratica: l'ultimo file che tocca
> una voce è quello che vince.

> 🔒 **Perché due file sono tracciati e due no?** `settings.ini` e i due
> `.example` restano nel repository, così che un clone/fork appena scaricato
> funzioni subito, con i default del progetto attivi. `config.local.php`
> invece resta gitignored: contiene le personalizzazioni più specifiche di
> ogni singola installazione, che non ha senso condividere nel codice del
> progetto. La stessa distinzione vale per i tuoi loghi e le tue icone in
> `custom/`, anch'essi sempre gitignored.

> ℹ️ La cartella include anche un proprio `custom/README.md` con lo stesso
> riepilogo, comodo se la stai esplorando direttamente da un editor di
> codice o via FTP.

---

## 📦 Aggiungere un Nuovo Modello 3D

### 🛠️ Procedura in 4 Passi

**1️⃣ Crea la cartella** del modello (usa `snake_case`):
```bash
mkdir modelli/nuova_cavita
```

**2️⃣ Aggiungi il modello 3D** in formato GLB (consigliato) dentro la cartella:
```
modelli/nuova_cavita/nuova_cavita.glb
```

**3️⃣ Crea il file metadati** `nuova_cavita.json`:
```json
{
  "name": "Nome della Cavità",
  "folder": "nuova_cavita",
  "file": "nuova_cavita.glb",
  "lat": 43.12345,
  "lon": 12.54321,
  "description": "Descrizione della cavità (opzionale)",
  "rotation": { "x": 0, "y": 0, "z": 0 }
}
```

Il file JSON deve chiamarsi come la cartella (`modelli/nuova_cavita/nuova_cavita.json`).

| Campo | Obbligatorio | Note |
|---|:---:|---|
| `name` | ✅ | Nome mostrato su mappa, elenco e selettore. Senza, il modello viene scartato |
| `file` | ✅ | Nome del file `.glb`/`.gltf` nella cartella. Se il file non esiste il modello viene escluso dal catalogo |
| `lat`, `lon` | consigliati | Numeri. Senza (o con `null`) il modello non compare sulla mappa, ma resta nel selettore del visualizzatore |
| `description` | — | Testo nel popup della mappa, nelle informazioni del modello e nelle anteprime social |
| `rotation` | — | `x`/`y`/`z` in gradi: corregge l'orientamento di modelli esportati con convenzione Z-up (es. CloudCompare) invece di Y-up come Three.js |
| `folder` | — | Ignorato: viene sempre preso dal nome della cartella |

> 🧱 **Modelli OBJ (legacy)**: indica i file con i campi `obj` e `mtl`
> (es. `"obj": "grotta.obj", "mtl": "grotta.mtl"`) e metti in `file` il nome
> del file `.obj`, che serve al catalogo per verificare che il modello
> esista. Il GLB resta comunque la scelta consigliata.

**4️⃣ [Opzionale]** Aggiungi anteprima social `nuova_cavita_social.jpg` (1200x630px)

> ℹ️ Se manca, l'anteprima social viene **generata automaticamente** dal
> visualizzatore dopo il primo caricamento del modello. Un'anteprima già
> presente (anche preparata a mano) non viene più toccata, a meno che il
> file del modello 3D non sia più recente di lei: aggiornando il rilievo,
> l'anteprima si rigenera alla visita successiva.

> 💡 **Nota**: Il catalogo (`api/catalogo.php`) si aggiorna da solo leggendo
> le cartelle in `modelli/`; la cache `modelli/catalogo.cache.json` si
> rigenera quando un JSON cambia o una cartella viene aggiunta o rimossa, e
> non va modificata a mano.

---

## 🛠️ Personalizzare con `custom/settings.ini`

Tutto ciò che si personalizza sta in **un solo file di variabili**:
`custom/settings.ini`. Non contiene codice, quindi non c'è modo di rompere
l'applicazione modificandolo. Arriva già pronto nel repository con i valori
di default del progetto attivi: modificalo direttamente, non serve copiarlo
da nessun template.

Cambia il valore delle righe che ti interessano:

```ini
[branding]
appName = "Le grotte del mio gruppo"
organizationName = "Gruppo Speleo Esempio"

[texts]
pageTitle = "Mappa delle nostre cavità"
pageSubtitle = "I rilievi 3D di {organization}"

[theme]
accentColor = "#ff8800"

[map]
center[] = 43.351726
center[] = 12.579768
defaultZoom = 15

[viewer]
fpBaseSpeed = 1.6

[language]
default = "it"
```

### 📐 Le tre regole

| Regola | Esempio |
|---|---|
| Le righe che iniziano con `;` sono commenti (disattivate) | `;appName = "..."` |
| I testi vanno tra virgolette | `appName = "Le mie grotte"` |
| Numeri e `true`/`false` vanno senza virgolette | `defaultZoom = 16` |

### 📚 Cosa si può cambiare

| Sezione | Contenuto |
|---|---|
| `[branding]` | Nome app, organizzazione, sito, email, copyright, descrizione |
| `[texts]` | Titolo e sottotitolo homepage, intestazione elenco, testi del viewer |
| `[pwa]` | Percorsi di logo e icone |
| `[theme]` | Colori dell'interfaccia e gradiente della scena 3D |
| `[map]` | Centro, zoom (iniziale, minimo, al click) e limiti facoltativi `boundsSouth`/`boundsWest`/`boundsNorth`/`boundsEast` |
| `[viewer]` | Velocità di movimento, sensibilità, VR, barra di scala (m/ft), cielo, limiti delle texture su mobile |
| `[social]` | Quali pulsanti di condivisione mostrare |
| `[language]` | Lingua predefinita |
| `[paths]` | Cartella dei modelli (default `modelli`) |
| `[security]` | Domini esterni consentiti, siti autorizzati a incorporare il viewer (avanzato) |

Ogni voce non attiva di default in `settings.ini` è comunque elencata e
commentata, con spiegazione, dentro `custom/settings.example.ini`. Per una
guida passo passo con esempi pronti vedi
[`docs/PERSONALIZZAZIONE.md`](docs/PERSONALIZZAZIONE.md).

### 🧯 A prova di errore

- Sezioni o chiavi sconosciute → ignorate.
- Righe lasciate vuote → resta il valore predefinito.
- File con errori di sintassi → l'applicazione parte lo stesso con i suoi
  default e registra un avviso nel log del server.
- La sezione `originalAuthor` e il badge *Powered by 3DCaveViewer* non sono
  modificabili da qui (licenza GPL v3).

> ⚙️ **Per casi avanzati** resta disponibile `custom/config.local.php`, che
> vince su `settings.ini` — vedi [🗂️ La cartella
> `custom/`](#-la-cartella-custom-cosa-contiene-e-come-si-usa) per il
> confronto tra tutti e quattro i file.

---

## 🎨 Personalizzare Loghi e Icone

L'applicazione utilizza diversi loghi e icone che possono essere personalizzati per adattarsi alla tua organizzazione.

### 🖼️ Due cartelle, una regola

| Cartella | Cosa contiene | In un aggiornamento |
|---|---|---|
| `img/` | I loghi **di default del progetto** (3DCaveViewer) | ✅ Sovrascritta |
| `custom/` | **I tuoi** loghi e icone | ❌ Mai toccata |

I file in `custom/` **vincono sempre** su quelli di `img/`: basta metterceli,
non serve configurare niente.

| File da mettere in `custom/` | Dimensioni | Utilizzo | Formato |
|------|------------|----------|---------|
| `custom/icon-192.png` | 192x192px | Icona PWA (piccola) — **opzionale**, generata dal logo se assente | PNG |
| `custom/icon-512.png` | 512x512px | Icona PWA (grande) — **opzionale**, generata dal logo se assente | PNG |
| `custom/logo.png` | Variabili | Logo principale nell'interfaccia — **l'unico file davvero necessario** | PNG/JPG/SVG/WebP |
| `custom/logo.webp` | Variabili | Versione WebP del logo (opzionale) | WebP |

> ℹ️ I file in `img/` sono il logo di **3DCaveViewer**: compaiono finché
> l'installazione non carica il proprio (vedi `img/README.md`).

> 🪄 **Basta un solo file.** Se in `custom/` metti solo `logo.*` e non fornisci
> `icon-192.png`/`icon-512.png`, l'applicazione genera da sola le due icone
> PWA quadrate a partire dal logo (ridimensionato in "contain", centrato su
> sfondo trasparente, senza deformarlo né ritagliarlo) e le tiene in cache in
> `custom/generated/`, rigenerandole automaticamente ogni volta che sostituisci
> il logo. Richiede l'estensione PHP GD (già tra i prerequisiti). Se il logo è
> in un formato che GD non decodifica (es. SVG) o GD non è installata, si
> ricade sulle icone di 3DCaveViewer in `img/` — nessun errore, nessuna immagine rotta.
> Fornire `icon-192.png`/`icon-512.png` resta utile solo se vuoi un ritaglio o
> un artwork diverso da quello generato automaticamente.

L'ordine di ricerca di ogni icona PWA è: percorso indicato in
`custom/settings.ini` → file dedicato in `custom/` → icona generata dal logo
(`custom/generated/`) → default in `img/` → nessuna immagine (mai
un'immagine rotta). Per il logo, che non viene mai generato, si passa
direttamente dal file in `custom/` al default in `img/`.

### 📝 Procedura di Personalizzazione

**1️⃣ Copia il tuo logo in `custom/`**

Nella maggior parte dei casi basta questo: le icone PWA quadrate vengono
generate automaticamente dal logo (vedi il riquadro "Basta un solo file"
sopra).

```bash
cp /percorso/tuo_logo.jpg custom/logo.jpg
```

**1️⃣bis Icone PWA fatte a mano (opzionale)**

Solo se vuoi un ritaglio o un artwork diverso da quello generato
automaticamente, prepara tu le icone quadrate, ad esempio con ImageMagick:

```bash
# Esempio con ImageMagick per creare icone quadrate
convert tuo_logo.png -resize 192x192 -background transparent -gravity center -extent 192x192 icon-192.png
convert tuo_logo.png -resize 512x512 -background transparent -gravity center -extent 512x512 icon-512.png
```

**2️⃣ Sostituisci i file nella cartella `custom/`**

```bash
# Backup dei file originali (opzionale)
cp custom/icon-192.png custom/icon-192.png.backup
cp custom/icon-512.png custom/icon-512.png.backup
cp custom/logo.jpg custom/logo.jpg.backup

# Copia i nuovi file (icon-*.png solo se non vuoi quelle generate automaticamente)
cp /percorso/icon-192.png custom/
cp /percorso/icon-512.png custom/
cp /percorso/tuo_logo.jpg custom/logo.jpg
```

**3️⃣ Cambiare formato o nome del file (opzionale)**

Se il tuo logo è in un altro formato basta lasciarlo in `custom/` con il
nome `logo`: `custom/logo.png`, `custom/logo.svg`, `custom/logo.webp` e
`custom/logo.jpg` vengono rilevati automaticamente, senza configurare nulla
(l'ordine di preferenza è PNG → JPG → JPEG → SVG → WebP).

Per un nome completamente diverso, indica i percorsi in
`custom/settings.ini` (sezione `[pwa]`) invece di modificare
`manifest.json`, che è generato dinamicamente da `manifest.php`:

```ini
[pwa]
icon192 = "custom/mia-icona-192.png"
icon512 = "custom/mia-icona-512.png"
logo = "custom/mio-logo.png"
; Versione WebP del logo: usata solo se il file esiste ed è aggiornato
; quanto il logo principale. Lascia commentato se hai un formato solo.
;logoWebp = "custom/mio-logo.webp"
; Colore di sfondo (hex) per le icone PWA generate automaticamente dal logo,
; utile se il logo non ha un canale alpha. Senza, lo sfondo è trasparente.
;iconBackground = "#0b0d10"
```

> ⚠️ Se un percorso indicato qui non esiste, l'applicazione ricade sui file
> presenti in `custom/`, poi sui default di `img/`; se non trova nulla, il
> logo non viene proprio mostrato (niente immagine rotta).

**4️⃣ Cache: non serve fare niente**

I loghi e le icone sono serviti con un `?v=<data-modifica>` calcolato dal
server: appena sostituisci un file, browser e PWA scaricano la versione
nuova da soli. Le icone PWA generate automaticamente dal logo si rigenerano
allo stesso modo, non serve cancellare nulla a mano in `custom/generated/`.
Se hai comunque una vecchia versione in cache:
- **Desktop**: `Ctrl+Shift+R` (Windows/Linux) o `Cmd+Shift+R` (Mac)
- **Mobile**: apri `status.php` e svuota la cache offline

### 💡 Consigli per i Loghi

```
✓ Usa immagini con sfondo trasparente (PNG) per le icone PWA
✓ Mantieni un design semplice e riconoscibile
✓ Assicurati che il logo sia leggibile anche a 192x192px
✓ Per il logo principale (logo.jpg), usa dimensioni proporzionate
✓ Ottimizza le immagini per il web (compressione)
```

### 🔄 Dove Appaiono i Loghi

- **icon-192.png / icon-512.png**:
  - Schermata home quando l'app è installata
  - Splash screen durante il caricamento
  - Task switcher del sistema operativo

- **logo.png / logo.webp**:
  - Header della homepage (`index.php`)
  - Header della pagina di stato cache (`status.php`)
  - Riquadro in basso a destra nel visualizzatore 3D (`viewer.php`)
  - Screenshot PNG esportati dal viewer

---

## ✏️ Personalizzare i Testi dell'Interfaccia

I testi principali dell'interfaccia (titolo e sottotitolo della homepage,
intestazione dell'elenco cavità, titolo e descrizione del viewer) si
personalizzano nella sezione `[texts]` di `custom/settings.ini` (i primi tre
anche dall'installazione guidata), insieme al branding della sezione
`[branding]`:

```ini
[branding]
organizationName = "Gruppo Speleologico Esempio"
organizationUrl = "https://www.esempio.it/"
; Testo del copyright nel footer (la © è aggiunta dal template);
; deve continuare a citare l'autore originale (GPL v3)
copyrightHolder = "Davide Brugnoni – Gruppo Speleologico Esempio"

[texts]
pageTitle = "Le grotte del nostro gruppo"
pageSubtitle = "Rilievi e modelli 3D a cura di {organization}"
sidebarTitle = "Elenco grotte"
viewerDefaultTitle = "Visualizzatore cavità 3D"
viewerDefaultDescription = "Esplora i modelli 3D. {organization}"
```

**Segnaposto disponibili in tutti i testi:**

| Segnaposto | Sostituito con |
|---|---|
| `{organization}` | `branding.organizationName` |
| `{app}` | `branding.appName` |
| `{year}` | Anno corrente |

**Siti multilingua:** ogni testo può avere una variante per lingua; le
lingue non elencate ricadono su quella impostata in `language.default`.

```ini
[texts]
pageTitle[it] = "Le grotte del nostro gruppo"
pageTitle[en] = "Our caves"
```

(In `custom/config.local.php` la stessa cosa si scrive come array
`'pageTitle' => ['it' => '…', 'en' => '…']`.)

> ⚙️ **Precedenza:** un testo impostato in `custom/settings.ini` (o in
> `custom/config.local.php`) vince su tutto, comprese le traduzioni di
> `i18n/*.json` — anche nelle lingue per cui non hai scritto una variante.
> Se invece lo lasci commentato, l'applicazione usa la traduzione della
> lingua attiva.

> ℹ️ Nel footer resta sempre visibile un piccolo badge **Powered by
> 3DCaveViewer** che rimanda a [3dcaveviewer.com](https://3dcaveviewer.com/),
> insieme all'attribuzione all'autore originale richiesta dalla licenza
> GNU GPL v3.

---

## 🗿 Formati Modelli Supportati

| Formato | Estensioni | Stato | Note |
|---------|------------|:-----:|------|
| **GLTF Binary** | `.glb` | ✅ Consigliato | Compatto, include texture embedded |
| **GLTF** | `.gltf` + assets | ✅ Supportato | Con texture e geometrie esterne |
| **OBJ** | `.obj` + `.mtl` | ⚠️ Legacy | Texture separate, meno efficiente |

### ⚡ Ottimizzazione Modelli

```
✓ Compressione Draco (o Meshopt) per le geometrie
✓ Texture JPEG/WebP (o KTX2), non PNG: su mobile vengono ridotte in decodifica
✓ Risoluzione texture: fino a 4096x4096px per restare leggeri su telefono
✓ Poligoni: < 500k per dispositivi mobili
```

> 💡 Il progetto include **due strumenti pronti all'uso** per preparare e
> comprimere i modelli GLB. Vedi la sezione successiva.

---

## 🛠️ Ottimizzazione Modelli GLB

Il repository include due ottimizzatori GLB pronti all'uso, pensati per
aiutare qualsiasi gruppo speleologico a ridurre il peso dei propri rilievi
prima di pubblicarli nel visualizzatore. Entrambi applicano compressione
**Draco**, fusione di vertici duplicati (**weld**), deduplicazione
(**dedup**) e rimozione delle risorse inutilizzate (**prune**), e producono
file compatibili con il viewer. Solo la versione server ricomprime inoltre
le texture in **WebP/JPEG** (consigliate per il mobile).

### 🌐 `glb-optimizer/` — Server Node.js

Un piccolo server Express con interfaccia web: si avvia in locale, accetta
i file GLB via drag-and-drop nel browser e restituisce il file ottimizzato.
Utile quando si devono processare diversi modelli in sequenza o quando si
vuole mantenere un'istanza condivisa all'interno di un team.

Supporta anche la conversione di **modelli OBJ** con texture: basta
trascinare insieme il file `.obj`, i file `.mtl` (anche più di uno) e
le immagini texture associate.

Gestisce anche **file di grandi dimensioni** (upload fino a **5 GB**, con
Node.js ≥ 22): la conversione OBJ usa un parser streaming, la lettura dei
GLB Draco avviene a memoria costante e le mesh con decine di milioni di
vertici vengono suddivise automaticamente prima della codifica Draco.
Dettagli e limiti in `glb-optimizer/README.md`.

```bash
cd glb-optimizer
npm install
npm start
# → apri http://localhost:3000 nel browser
```

### 💻 `glb-optimizer-static/` — Pagina HTML singola

Un'unica pagina HTML che esegue l'ottimizzazione **interamente nel
browser**, senza server né dipendenze da installare (le librerie vengono
caricate da CDN, quindi serve una connessione a Internet; i file invece non
lasciano il computer). Non ricomprime le texture: per quelle usa la
versione server o convertile prima di esportare. Ideale per chi vuole
ottimizzare occasionalmente un modello senza configurare Node.js, o per
mantenere i file in locale per motivi di privacy.

Supporta drag-and-drop di **OBJ + MTL + texture** in un'unica operazione.

```
Apri semplicemente glb-optimizer-static/index.html nel browser.
Nessun upload verso server esterni.
```

### 🤔 Quale scegliere?

| Esigenza | Strumento consigliato |
|----------|----------------------|
| Ottimizzazione saltuaria, zero setup | `glb-optimizer-static/` |
| Ambiente condiviso / batch ripetuti | `glb-optimizer/` (server Node) |
| Massima privacy (nessun upload) | Entrambi: anche il server Node gira in locale |
| Ricompressione texture WebP/JPEG | `glb-optimizer/` (server Node) |
| File molto grandi (fino a 5 GB) | `glb-optimizer/` (server Node) |
| Integrazione in workflow automatizzati | `glb-optimizer/` (API HTTP) |

---

## 🎮 Controlli

### 🖥️ Desktop

| Azione | Controllo | Tasto/Mouse |
|--------|-----------|-------------|
| 🔄 Ruota vista | Mouse | `Click sinistro + Trascina` |
| 🔍 Zoom | Mouse | `Rotella` |
| ↔️ Pan | Mouse | `Click destro + Trascina` (o `Ctrl`/`Shift` + trascina) |
| 🏠 Reset vista | Tastiera | `R` |
| 📏 Misurazione | Tastiera | `M` (toggle, non in POV) |
| 🚶 POV (prima persona) | Tastiera | `P` (toggle) |
| 🖱️ Guarda intorno FP | Mouse | Click sul canvas per bloccare il puntatore, poi muovi il mouse |
| ⬆️⬇️⬅️➡️ Movimento FP | Tastiera | `W` `A` `S` `D` |
| ⚡ Corsa FP | Tastiera | `Shift` (tenuto) |
| ❓ Aiuto | Tastiera | `H` |
| ℹ️ Info modello | Tastiera | `I` |
| ❌ Rilascia il puntatore | Tastiera | `Esc` |
| 🔎 Selettore modelli | Tastiera | Scrivi per filtrare, `Invio` per aprire, `Esc` per chiudere |

### 📱 Mobile/Touch

| Azione | Gesto | Descrizione |
|--------|-------|-------------|
| 🔄 Ruota vista | 👆 | 1 dito trascina |
| 🔍 Zoom | 👆👆 | Pinch (2 dita avvicina/allontana) |
| ↔️ Pan | 👆👆 | 2 dita trascina |
| 🚶 Movimento FP | 🕹️ | Joystick virtuale (sinistra) |
| 🚶 Passo avanti FP | 👆👆 | Doppio tocco sullo schermo |
| 👀 Look FP | 👆 | Trascina schermo (area destra) |

### 🥽 VR (WebXR)

```
🕹️  Stick avanti/indietro   → Cammina nella direzione dello sguardo (con rilevamento collisioni)
🔄  Stick a destra/sinistra  → Rotazione continua della visuale
🔁  Doppio grilletto destro → Torna alla posizione di partenza
🅱️  Pulsante B (destro)     → Esci dalla sessione VR
```

> 🥽 In VR il modello viene mostrato in **scala reale** (1:1), mentre nel
> browser viene adattato allo schermo.

> 🌫️ **Vignetta comfort**: durante i movimenti i bordi della visione vengono
> oscurati dolcemente per ridurre il rischio di motion sickness. Intensità e
> velocità si regolano con `vrVignetteMaxIntensity` e `vrVignetteFadeSpeed`
> nella sezione `[viewer]` di `custom/settings.ini`.

### 📐 Viste Predefinite

Accesso rapido a 6 viste ortogonali del modello:

| Vista | Icona | Descrizione |
|-------|:-----:|-------------|
| **Front** | 🔲 | Vista frontale |
| **Back** | 🔲 | Vista posteriore |
| **Left** | 🔲 | Vista laterale sinistra |
| **Right** | 🔲 | Vista laterale destra |
| **Top** | 🔲 | Vista dall'alto (pianta) |
| **Bottom** | 🔲 | Vista dal basso |

```
✓ Animazione smooth tra le viste (500ms con easing)
✓ Calcolo automatico della distanza ottimale
✓ Selezione tramite icone cubo 3D interattive
```

### 🛡️ Collision Detection

Il sistema rileva automaticamente le collisioni durante la navigazione:

- **POV (prima persona)**: il movimento viene bloccato dalla geometria
- **VR**: collisioni gestite anche in modalità immersiva
- **Padding configurabile**: margine di sicurezza dalle pareti
- **Accelerate con BVH** (three-mesh-bvh): raycast rapidi anche su modelli con milioni di poligoni

### 🔭 Elementi Visuali della Modalità POV

In modalità POV (prima persona) vengono mostrati elementi UI dedicati per facilitare l'orientamento:

- 🎯 **Crosshair** centrale per puntamento preciso
- 🖐️ **Indicatore braccia** (`fp-arm-hint`) che simula la presenza fisica dell'utente
- 🕹️ **Joystick virtuale** su touch device, fallback look-mode su desktop senza pointer-lock

---

## 🔗 Parametri URL del Visualizzatore

| Parametro | Esempio | Effetto |
|---|---|---|
| `m` | `viewer.php?m=grotta_rossa` | Apre direttamente il modello della cartella indicata |
| `cam`, `tgt` | `&cam=1.20,0.50,3.00&tgt=0.00,0.00,0.00` | Posizione della camera e punto osservato (generati dal pulsante Condividi) |
| `sec` | `&sec=y,40,0` | Piano di sezione: asse `x`/`y`/`z`, posizione 0–100, lato invertito `0`/`1` |
| `lang` | `&lang=en` | Lingua dell'interfaccia (memorizzata poi nel cookie `lang`) |
| `embed` | `&embed=1` | Modalità incorporata, con interfaccia ridotta, per gli `<iframe>` |
| `ui` | `&ui=scale,title,fs,measure` | Solo con `embed=1`: strumenti visibili fra `scale`, `title`, `fs`, `info`, `measure`, `sections`, `screenshot`, `lang`, `pov` (default `scale,title,fs`; `none` = nessuno) |

Non serve scriverli a mano: il pannello **Condividi** genera sia il link
(scheda «Link») sia il codice `<iframe>` (scheda «Incorpora»). Le pagine
incorporate possono essere inquadrate da altri siti solo in modalità
`embed=1`; per limitarle ad alcuni domini usa `allowedEmbedOrigins[]` nella
sezione `[security]` di `custom/settings.ini`.

---

## ⚙️ Configurazione Avanzata

Questa sezione elenca i valori **di default** del progetto, utili come
riferimento tecnico: le tue personalizzazioni vanno in
`custom/settings.ini` (o, per i casi avanzati, in `custom/config.local.php`)
— vedi [🗂️ La cartella
`custom/`](#-la-cartella-custom-cosa-contiene-e-come-si-usa) per come
funzionano. Le impostazioni specifiche del frontend (viewer 3D, mappa, tema
CSS completo) sono definite in `js/config.php`, che legge automaticamente i
valori condivisi da `config.php`:

### 🎨 Personalizzazione Tema

```javascript
theme: {
  bgColor: '#0d1117',        // Sfondo principale
  accentColor: '#0696af',    // Colore accent (ciano)
  textColor: '#e0e0e0',      // Colore testo
  panelBg: 'rgba(22, 27, 34, 0.95)', // Sfondo pannelli
  sceneGradient: ['#1a2a33', '#0f181f', '#080d13', '#04070b'], // Gradiente cupola cielo
  sceneGradientStops: [0.0, 0.45, 0.70, 1.0], // Posizioni dei colori del gradiente
}
```

### 🗺️ Configurazione Mappa

```javascript
map: {
  center: [43.351726, 12.579768], // Centro mappa
  defaultZoom: 16,               // Zoom iniziale
  minZoom: 8,                    // Zoom minimo consentito
  maxZoom: 19,                   // Oltre il 19 OpenStreetMap non ha tessere
  flyToZoom: 17,                 // Zoom al click
  bounds: null,                  // Nessun limite di spostamento di default
}
```

### 🎮 Impostazioni Viewer 3D

| Parametro | Default | Descrizione |
|-----------|:-------:|-------------|
| `fpBaseSpeed` | 1.2 | Velocità movimento prima persona (unità/s) |
| `fpBoostMultiplier` | 3.0 | Moltiplicatore corsa (Shift) |
| `tapStepDistance` | 1.0 | Passo avanti con doppio tap su mobile |
| `lookSensitivity` | 0.004 | Sensibilità dello sguardo touch |
| `collisionPadding` | 0.05 | Margine collisioni |
| `pinchLockThresholdPx` | 10 | Pixel per distinguere pinch (zoom) da pan nel gesto a due dita |
| `vrMoveSpeed` / `vrYawSpeed` | 2.0 / 1.8 | Velocità di movimento e rotazione in VR |
| `vrDeadZone` | 0.15 | Zona morta degli stick VR |
| `vrDoubleClickThreshold` | 400 | Millisecondi entro cui due grilletti contano come doppio click (ritorno al punto di partenza) |
| `vrVignetteMaxIntensity` / `vrVignetteFadeSpeed` | 0.6 / 3.0 | Intensità e velocità della vignetta comfort in VR |
| `scaleBarWidth` | 150 | Larghezza barra scala (px) |
| `scaleBarUnit` | `m` | Unità della barra di scala (`m` o `ft`) |
| `defaultNear` / `defaultFar` | 0.1 / 2000 | Piani di clip vicino/lontano della camera |
| `skyDomeEnabled` | true | Attiva la cupola del cielo a gradiente |
| `skyDomeRadius` | 1000 | Raggio cupola in metri (deve restare < `defaultFar` in VR) |
| `pixelRatioMax` / `pixelRatioMaxMobile` | 2 / 1.5 | Tetto della densità di pixel del rendering (desktop / touch) |
| `textureMaxSizeMobile` | 4096 | Lato massimo delle texture su telefoni/tablet (px, 0 = nessun limite) |
| `textureBudgetMPMobile` | 24 | Budget complessivo texture per modello su mobile (megapixel) |
| `textureMaxSize` / `textureBudgetMP` | 0 / 0 | Stessi limiti su desktop (0 = solo il limite della GPU) |
| `debug` | false | Helper di debug nella console del browser |

### 🌐 Social Network

```javascript
social: {
  enableFacebook: true,
  enableWhatsApp: true,
  enableTelegram: true,
  enableEmail: true,
}
```

### 🏢 Branding

Nome, logo e informazioni dell'organizzazione si personalizzano nella
sezione `[branding]` di `custom/settings.ini` (o, per i casi avanzati,
`branding` in `custom/config.local.php`) — vedi [🛠️ Personalizzare con
`custom/settings.ini`](#-personalizzare-con-customsettingsini).

> ⚠️ **Nota**: L'autore originale (Davide Brugnoni) deve sempre essere citato nel footer dell'applicazione, come richiesto dalla licenza GPL v3.

---

## 🌍 Aggiungere una Nuova Lingua

### 📝 Procedura

**1️⃣ Copia il template**
```bash
cp i18n/template.json i18n/[codice_lingua].json
```

**2️⃣ Traduci tutte le stringhe** nel nuovo file JSON (mantieni invariate le chiavi)

**3️⃣ Imposta `langName` e `langFlag`** nel nuovo file JSON: la lingua comparirà automaticamente nel selettore in-app (il loader scopre da solo i file in `i18n/`)

**4️⃣ [Opzionale]** Per renderla la lingua **predefinita**, imposta `default = "[codice_lingua]"` nella sezione `[language]` di `custom/settings.ini` (o sceglila nel primo passo dell'installazione guidata)

### 📂 Struttura File Traduzione

```json
{
  "nav": {
    "title": "Visualizzatore Cavità 3D",
    "help": "Aiuto"
  },
  "viewer": {
    "loading": "Caricamento modello...",
    "selectModel": "Seleziona un modello"
  },
  "controls": {
    "firstPerson": "POV",
    "autoRotate": "Rotazione automatica"
  }
}
```

---

## 📄 Licenza

```
3D Cave Viewer
https://github.com/davide-brugnoni/3DCaveViewer/
https://www.buioverticale.it

Copyright (C) 2025-2026 Davide Brugnoni <davide.brugnoni@gmail.com>
Buio Verticale - Gruppo Speleologico CAI Gubbio

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
```

**📜 Licenza**: [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0)

---

## 📞 Contatti

<div align="center">

### Davide Brugnoni
**Buio Verticale - Gruppo Speleologico CAI Gubbio**

[![Email](https://img.shields.io/badge/Email-davide.brugnoni%40gmail.com-red?logo=gmail&logoColor=white)](mailto:davide.brugnoni@gmail.com)
[![Website](https://img.shields.io/badge/Website-www.buioverticale.it-blue?logo=googlechrome&logoColor=white)](https://www.buioverticale.it)
[![GitHub](https://img.shields.io/badge/GitHub-3DCaveViewer-181717?logo=github)](https://github.com/davide-brugnoni/3DCaveViewer)

</div>

---

<div align="center">

**Realizzato con ❤️ per la comunità speleologica**

🏔️ *Esplorando le profondità, un modello 3D alla volta* 🏔️

</div>
