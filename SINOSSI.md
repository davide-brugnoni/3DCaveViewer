# 3D Cave Viewer — Sinossi del Progetto

**Autore:** Davide Brugnoni — [Buio Verticale, Gruppo Speleologico CAI Gubbio](https://www.buioverticale.it/)
**Licenza:** GNU GPL v3
**Repository:** https://github.com/davide-brugnoni/3DCaveViewer

> Questo documento è la descrizione di riferimento del progetto, pensata per essere
> condivisa con stampa, addetti ai lavori e collaboratori, e per servire da base
> testuale per articoli, infografiche, presentazioni e materiali PDF.

---

## Scheda sintetica

| | |
|---|---|
| **Nome** | 3D Cave Viewer |
| **Tipologia** | Applicazione web progressiva (PWA) open source |
| **Scopo** | Esplorazione interattiva di rilievi 3D di grotte e cavità dal browser |
| **Autore** | Davide Brugnoni |
| **Nato per** | Buio Verticale — Gruppo Speleologico CAI Gubbio |
| **Licenza** | GNU GPL v3 (software libero) |
| **Tecnologie** | PHP, Three.js (WebGL), Leaflet/OpenStreetMap, WebXR |
| **Formati 3D supportati** | GLB (consigliato), GLTF, OBJ |
| **Lingue dell'interfaccia** | Italiano, Inglese, Francese, Spagnolo |
| **Requisiti per l'utente** | Solo un browser moderno — nessuna installazione |
| **Requisiti per chi lo installa** | Un comune hosting PHP — configurazione guidata, senza toccare il codice |
| **Sito del progetto** | https://www.3dcaveviewer.com |
| **Sito del gruppo** | https://www.buioverticale.it |
| **Contatto** | davide.brugnoni@gmail.com |

---

## In breve (abstract per la stampa)

**3D Cave Viewer** è un'applicazione web open source che permette a chiunque di
esplorare i rilievi tridimensionali di grotte e cavità direttamente dal browser,
senza installare nulla: dall'esterno come una maquette, in prima persona come uno
speleologo, o in realtà virtuale con un visore. Sviluppata da Davide Brugnoni per
il Gruppo Speleologico Buio Verticale del CAI di Gubbio, integra strumenti
professionali di misurazione, sezione e annotazione, funziona offline come app
installabile, gira anche su smartphone con modelli pesanti e permette di
incorporare una grotta navigabile dentro un articolo online. Grazie alla licenza
GNU GPL v3 e a una procedura di installazione guidata, qualsiasi gruppo
speleologico può pubblicare la propria versione, con il proprio nome, senza
scrivere una riga di codice.

---

## Sinossi estesa

Chi esplora una grotta porta con sé torce, corde e strumenti di rilievo. Chi la studia dopo, invece, si trova spesso davanti a planimetrie bidimensionali su carta o file CAD che restituiscono solo parzialmente la complessità di quegli ambienti. **3D Cave Viewer** nasce da una domanda semplice: e se chiunque potesse entrare in una grotta dal proprio browser, senza installare nulla, anche senza mai averla visitata?

Il progetto è un'applicazione web open source nata per il Gruppo Speleologico Buio Verticale del CAI di Gubbio. Il suo scopo è rendere accessibili i rilievi tridimensionali delle cavità — ottenuti con scanner e strumenti di rilevamento speleo — trasformandoli in esperienze interattive fruibili da chiunque: speleologi, ricercatori, studenti, appassionati o semplici curiosi.

Il valore del progetto sta nell'unire due mondi che raramente si incontrano: da un lato il rigore documentale del rilievo speleologico, dall'altro l'immediatezza di una tecnologia web accessibile a tutti. Ogni modello pubblicato non è una ricostruzione artistica ma il rilievo reale di una cavità vera, georeferenziato sulla mappa e fedele nelle proporzioni.

---

## Come funziona

### La homepage: mappa e catalogo

L'applicazione si apre su una homepage che presenta il catalogo delle cavità in due modi complementari: una **mappa interattiva** (basata su Leaflet e OpenStreetMap) con i marker GPS reali di ogni rilievo, e un **elenco con ricerca** ordinato alfabeticamente, che si filtra mentre si digita il nome. Un click — sul marker o nella lista — apre il visualizzatore 3D corrispondente. Il catalogo si aggiorna automaticamente: per pubblicare una nuova cavità basta caricare sul server una cartella con il modello e un piccolo file di metadati (nome, coordinate, descrizione). Anche dentro il visualizzatore un menu a tendina con ricerca permette di passare da una cavità all'altra.

### Tre modi di esplorare una cavità

Il visualizzatore è costruito su **Three.js** (WebGL) e offre tre modalità di esplorazione, in ordine crescente di immersività:

1. **Modalità orbitale** — quella classica: ci si muove attorno alla grotta, la si ruota, la si ingrandisce, la si studia dall'esterno come si farebbe con una maquette fisica. Su mobile le stesse operazioni si fanno con gesti a uno o due dita: un dito ruota la vista, due dita fanno pinch-zoom e pan.

2. **Modalità POV (prima persona)** — quella che cambia prospettiva: ci si trova letteralmente dentro la cavità, ci si muove con la tastiera (WASD) o, su mobile, con un **joystick virtuale** mentre l'altro pollice guarda intorno, e il sistema di **rilevamento delle collisioni** impedisce di attraversare le pareti, restituendo per quanto possibile la sensazione fisica dello spazio. Un mirino centrale aiuta l'orientamento; su mobile un doppio tocco fa avanzare di un passo.

3. **Realtà virtuale (WebXR)** — per chi dispone di un visore VR: si entra nella cavità in scala 1:1, ci si muove con gli stick dei controller, si ruota la visuale in modo continuo e, con un doppio click del grilletto, si torna in un attimo al punto di partenza. L'ambiente VR include uno sky dome con il gradiente di sfondo dell'applicazione, e la scala 1:1 garantisce che le proporzioni della cavità corrispondano a quelle reali. Non è un gioco: è il rilievo reale di una cavità vera.

---

## Strumenti per chi lavora sul campo

Oltre all'esplorazione, il visualizzatore mette a disposizione strumenti pensati per chi usa i modelli in modo professionale: speleologi, geologi, soccorso speleologico, progettisti.

### Misurazioni 3D

È possibile posizionare punti sul modello e ottenere in tempo reale **misurazioni tridimensionali** con etichette colorate. Il sistema offre:

- **snap automatico ai vertici** della mesh per la massima precisione;
- **otto colori distinti** per gestire più misurazioni in parallelo;
- unità formattate automaticamente in centimetri, metri o chilometri;
- **editing dei punti**: un click su una misurazione permette di spostarne un estremo;
- **export in CSV** dell'elenco completo, riutilizzabile in fogli di calcolo o relazioni.

È utile per verificare misure, pianificare interventi o documentare morfologie senza tornare fisicamente in grotta.

### Annotazioni (punti di interesse)

Un sistema di **annotazioni persistenti** permette di apporre punti di interesse con etichette descrittive sulla cavità, rinominarli ed eliminarli: le annotazioni vengono salvate nel browser per ciascun modello e possono essere **esportate e importate in formato JSON** per condividerle con altri o conservarle nel tempo.

### Sezioni, viste e scala

- I **piani di sezione** lungo gli assi X, Y e Z — regolabili con slider e con inversione del lato di taglio — permettono di tagliare virtualmente la cavità e osservarne la struttura interna, come in una tomografia.
- **Sei viste ortogonali predefinite** (dall'alto, dal basso, fronte, retro e i due lati) consentono di passare rapidamente da una prospettiva all'altra con animazioni fluide.
- La **barra di scala** si adatta dinamicamente al livello di zoom per offrire sempre un riferimento metrico leggibile.

### Interfaccia pensata per il lavoro reale

Su desktop i pannelli degli strumenti sono **finestre flottanti trascinabili** sullo schermo. Su smartphone diventano **bottom-sheet** che si riducono a una piccola pillola per non ingombrare la visuale e si ripristinano con un tocco o uno swipe verso l'alto, accompagnato da un breve feedback aptico. Il layout mobile resta attivo anche con il telefono in orizzontale, dove la barra degli strumenti desktop non entrerebbe.

### Esportazione immagini

Un pulsante fotocamera nella toolbar permette di esportare in un click la vista corrente come **file PNG**: l'immagine include le sezioni attive, le misurazioni con le loro etichette, la barra di scala e il logo del gruppo. Questo la rende immediatamente utilizzabile in relazioni tecniche, presentazioni o pubblicazioni senza necessità di ulteriori elaborazioni.

---

## Accessibilità e diffusione

Il progetto è pensato per **abbattere le barriere tecniche** all'accesso ai rilievi speleologici.

### Nessuna installazione, funziona ovunque — anche offline

Non richiede installazioni, funziona su qualsiasi browser moderno — desktop e mobile — ed è installabile come **Progressive Web App**: i modelli già visitati restano disponibili **anche offline**, una caratteristica preziosa in zone montane con copertura di rete scarsa o assente. Il download di tutti i modelli per l'offline parte solo con il consenso di chi visita, chiesto con un banner discreto. Una **pagina dedicata di gestione offline** permette di scegliere quali cavità scaricare in anticipo — anche tutte insieme, con un download in blocco che si mette in pausa da solo quando si sta guardando un modello — di vedere lo spazio occupato e di ripulire i dati. Anche la vista standard della mappa della homepage resta consultabile senza rete. Quando viene pubblicata una nuova versione dell'applicazione, un banner discreto avvisa l'utente e propone di aggiornare subito o di rimandare, senza mai forzare un riavvio.

### Quattro lingue

L'interfaccia è disponibile in **italiano, inglese, francese e spagnolo**, con un selettore di lingua accessibile direttamente dall'interfaccia — sia sulla homepage che nel visualizzatore — e la scelta mantenuta per un anno. Aggiungere una nuova lingua richiede la traduzione di un singolo file JSON: il sistema la rileva automaticamente.

### Esperienza mobile curata

Tutti i pulsanti rispettano i tap target minimi di 44 px raccomandati dalle linee guida di accessibilità, i layout tengono conto delle aree safe-area dei dispositivi con notch, e le interazioni principali (joystick, punti di misurazione, ingresso in prima persona, apertura e chiusura dei pannelli) restituiscono un breve feedback aptico. I due pollici — joystick per camminare e trascinamento per guardarsi intorno — vengono seguiti in modo indipendente. Al primo avvio un breve messaggio introduttivo spiega come muoversi e può essere nascosto una volta per tutte; un toast di conferma accompagna ogni ingresso in modalità POV (prima persona) con le istruzioni di controllo.

### Rilievi pesanti anche sullo smartphone

Un rilievo da cento megabyte, o un modello con texture fotografiche ad altissima risoluzione, può facilmente esaurire la memoria di un telefono. Il visualizzatore è stato riprogettato proprio per questo: scarica il modello **in un'unica copia in memoria** invece di due, sospende i download offline in background mentre si sta guardando una cavità, e sui dispositivi mobili **ridimensiona automaticamente le texture** al momento della decodifica, in base alla memoria disponibile. Il risultato è che anche i rilievi più dettagliati si aprono su smartphone senza far chiudere la pagina, mentre su desktop restano a piena risoluzione.

### Robustezza

Il caricamento del catalogo e del modello 3D include stati di errore visibili: se il server non risponde, un messaggio localizzato con pulsante "Riprova" compare al posto del contenuto, senza lasciare l'utente davanti a una schermata vuota. Un watchdog anti-blocco interviene dopo 60 secondi se il caricamento non si conclude, proponendo di tornare alla mappa. Anche la perdita del contesto grafico WebGL — che può capitare su dispositivi con poca memoria video — viene gestita: l'utente riceve un messaggio localizzato invece di una schermata nera, e il rendering riprende automaticamente quando il contesto viene ripristinato.

### Condivisione

Il **link di condivisione** del visualizzatore include la posizione esatta della camera e il punto osservato: chi riceve il link vede la stessa inquadratura di chi lo ha condiviso. Ogni modello genera inoltre automaticamente un'**anteprima ottimizzata per i social network** (formato 1200×630, lo standard delle piattaforme) — completa del nome della cavità e della firma del gruppo — rendendo semplice diffondere e far conoscere le esplorazioni svolte su Facebook, WhatsApp, Telegram o via email.

### Una grotta dentro l'articolo

Dal pannello di condivisione, la scheda **"Incorpora"** genera il codice HTML da incollare in un articolo online (WordPress e simili): la cavità appare dentro la pagina come un riquadro navigabile e responsive, che parte esattamente dall'inquadratura scelta da chi l'ha preparato — eventualmente già sezionata — con un'interfaccia essenziale. Chi incorpora sceglie le proporzioni del riquadro e quali strumenti lasciare visibili (barra di scala, nome del modello, schermo intero, informazioni, misure, sezioni, screenshot, lingua, prima persona), e può aprirne un'anteprima prima di copiare il codice. Un giornale o un blog può così raccontare un'esplorazione mostrando la grotta vera, non una sua foto.

---

## Preparare i modelli

Poiché i rilievi grezzi prodotti da scanner e software CAD tendono a essere pesanti, il progetto include **due strumenti dedicati alla loro ottimizzazione**, entrambi open source e pronti all'uso:

- un piccolo **server locale in Node.js** che si avvia con un comando e accetta i file tramite drag-and-drop nel browser — lo strumento completo, adatto anche ai rilievi più grandi e a un'istanza condivisa in un team;
- una **singola pagina HTML** che esegue l'ottimizzazione interamente nel browser, senza server né programmi da installare — ideale per l'uso occasionale e per chi vuole che i file non lascino il proprio computer.

Entrambi applicano compressione **Draco** della geometria, fusione dei vertici duplicati, deduplicazione delle risorse ed eliminazione dei dati inutilizzati, producendo file compatibili con il visualizzatore, e supportano la **conversione diretta da OBJ**: è sufficiente trascinare insieme il file `.obj`, uno o più file `.mtl` e le immagini delle texture. La versione server ricomprime inoltre le **texture in WebP o JPEG** — il formato consigliato per il visualizzatore, che sugli smartphone può così ridimensionarle senza sprecare memoria.

La versione server gestisce anche **rilievi molto pesanti, fino a 5 GB**: la conversione da OBJ avviene con un parser streaming, la lettura dei file già compressi procede a memoria costante e le mesh con decine di milioni di vertici vengono suddivise automaticamente prima della compressione, senza alterare il risultato visivo.

I modelli che presentano problemi di orientamento — ad esempio i file esportati da CloudCompare con asse Z verticale invece di Y — possono essere corretti direttamente nel file di metadati JSON della cavità, specificando una rotazione in gradi sui tre assi, senza rielaborare il file 3D.

L'obiettivo è permettere a **qualsiasi gruppo speleologico** di pubblicare i propri rilievi senza dipendere da strumenti professionali a pagamento.

---

## Un'installazione per ogni gruppo

3D Cave Viewer non è un servizio centralizzato: ogni gruppo può installare la propria copia sul proprio spazio web. Al primo accesso una **procedura guidata** in pochi passaggi — identità del gruppo e logo, colori, mappa — accompagna la configurazione direttamente dal browser: si sceglie il centro della mappa cercando un indirizzo o spostando una mini-mappa, si caricano il logo e i testi, si scelgono i colori del proprio gruppo. Le icone dell'app installabile vengono generate da sole a partire dal logo, senza bisogno di strumenti di grafica.

Le scelte vengono salvate in un semplice file di impostazioni, che si può modificare anche a mano in seguito; a configurazione conclusa la procedura si blocca e si riapre solo con una chiave personale consegnata al termine. La struttura del progetto separa nettamente il codice dell'applicazione dai contenuti di ciascun gruppo (rilievi 3D e personalizzazioni): un aggiornamento alla versione successiva si applica quindi senza mai rischiare di perdere i propri dati o le proprie personalizzazioni.

---

## A chi si rivolge

- **Gruppi speleologici e CAI** — per documentare, archiviare e condividere i propri rilievi in una forma immediatamente fruibile, e per riusare liberamente la piattaforma con il proprio nome, logo e colori.
- **Ricercatori e geologi** — per studiare morfologie, effettuare misurazioni e produrre sezioni senza software CAD specialistici.
- **Soccorso speleologico** — per familiarizzare con la geometria di una cavità prima di un intervento.
- **Scuole e divulgazione** — per portare "dentro una grotta" studenti e pubblico, anche in VR, senza alcun rischio e senza attrezzatura.
- **Stampa e comunicazione** — per raccontare le esplorazioni con immagini, link condivisibili, anteprime social generate automaticamente e cavità navigabili incorporate negli articoli.

---

## Aspetti tecnici rilevanti

Dal punto di vista dello sviluppo, il progetto è volutamente essenziale: backend in **PHP senza framework**, rendering 3D con **Three.js**, mappe con **Leaflet**, **zero passaggi di build**. Nessun bundler, nessuna transpilazione — solo file PHP, JavaScript ES6 nativo e CSS. Questa scelta, apparentemente conservativa, ha una ragione precisa: garantire che il progetto possa essere installato su un comune hosting PHP e possa essere mantenuto, modificato e distribuito da qualsiasi gruppo speleologico, anche senza un team di sviluppo dedicato.

Le collisioni in prima persona e in VR sono accelerate da una struttura BVH (bounding volume hierarchy, tramite la libreria three-mesh-bvh), che mantiene fluida la navigazione anche su rilievi con milioni di poligoni.

Requisiti lato server: PHP 7.4+ con estensione GD e Apache — l'infrastruttura più diffusa ed economica esistente; HTTPS per le funzioni da app installabile e offline. Lato utente: un browser aggiornato — Chrome, Edge, Firefox o Safari nelle versioni recenti, browser mobili inclusi. La modalità VR richiede un browser/dispositivo compatibile WebXR.

Il codice è rilasciato sotto licenza **GNU GPL v3** e progettato per essere riusabile: qualsiasi altra organizzazione può adottarlo, personalizzarlo — nome, logo, colori, testi e mappa sono tutti configurabili — e pubblicare i propri rilievi, mantenendo la citazione dell'autore originale e il richiamo al progetto, come richiesto dalla licenza.

---

## Il progetto in numeri

Dati pronti per infografiche e materiali grafici:

| Numero | Cosa rappresenta |
|:---:|---|
| **3** | modalità di esplorazione: orbitale, POV (prima persona), realtà virtuale |
| **4** | lingue dell'interfaccia (IT, EN, FR, ES) |
| **3** | assi dei piani di sezione (X, Y, Z) |
| **6** | viste ortogonali predefinite (alto, basso, fronte, retro, lati) |
| **8** | colori per misurazioni simultanee |
| **3** | formati 3D supportati (GLB, GLTF, OBJ) |
| **2** | strumenti di ottimizzazione modelli inclusi (server Node e pagina browser-only) |
| **5 GB** | dimensione massima dei rilievi gestiti dall'ottimizzatore |
| **1** | blocco di codice HTML da copiare e incollare per incorporare una grotta in un articolo |
| **0** | installazioni richieste all'utente |
| **0** | righe di codice da modificare per installarlo con il proprio branding |
| **0** | passaggi di build per lo sviluppatore |
| **100%** | open source (GNU GPL v3) |

Messaggi chiave per la comunicazione:

- *"Entrare in una grotta dal browser, senza installare nulla."*
- *"Non è un gioco: è il rilievo reale di una cavità vera."*
- *"Funziona offline, anche dove la rete non arriva."*
- *"La grotta dentro l'articolo, non una sua foto."*
- *"Software libero: ogni gruppo speleologico può riusarlo con il proprio nome."*

---

## Contatti e materiali

**Davide Brugnoni** — Buio Verticale, Gruppo Speleologico CAI Gubbio
📧 davide.brugnoni@gmail.com
🌐 https://www.buioverticale.it
🐙 https://github.com/davide-brugnoni/3DCaveViewer

Per articoli, interviste, richieste di immagini o demo, contattare l'autore via email. Screenshot ad alta risoluzione possono essere generati direttamente dal visualizzatore (pulsante fotocamera) per qualsiasi cavità pubblicata, e ogni cavità può essere incorporata in una pagina web dalla scheda "Incorpora".
