# GLB Optimizer

App web locale (Node.js + Express) che prepara i modelli per 3DCaveViewer:
ottimizza file `.glb`/`.gltf` e converte modelli `.obj` in GLB ottimizzati.
Tutta l'elaborazione avviene sul tuo computer: i file non vengono inviati a
servizi esterni.

Trasformazioni disponibili (basate su [glTF Transform](https://gltf-transform.dev/)):

| Opzione | Default | Cosa fa |
|---|---|---|
| **Draco** | attiva | Compressione della geometria (tipicamente −70–90%). Slider *Velocità* 0–10 (default 5): valori bassi comprimono di più ma sono più lenti. Quantizzazione su volume di scena (niente fessure tra mesh adiacenti) e UV a 14 bit. |
| **Unisci vertici** (weld) | disattiva | Fonde i vertici duplicati. Slider *Tolleranza* da 1e-6 a 1e-1 (default 1e-4). |
| **Deduplica** (dedup) | attiva | Rimuove mesh, texture e materiali identici. |
| **Prune** | attiva | Elimina nodi, accessor e dati inutilizzati. |
| **Texture → Formato output** | Stesso formato | *WebP* (massima compressione) o *JPEG* (massima compatibilità), con slider *Qualità* 1–100 (default 80). Le texture usate per la trasparenza non diventano JPEG. |
| **Texture → Lato massimo** | 4096 px | Riduce le texture più grandi mantenendo le proporzioni (*Originale*, 8192, 4096, 2048 px); quelle già entro il limite non vengono toccate. Vale anche con *Stesso formato*. |

## Avvio

Richiede **Node.js ≥ 22**.

```bash
cd glb-optimizer
npm install
npm start
```

Apri il browser su **http://localhost:3000**.

`npm start` esegue `node --max-old-space-size=16384 server.js` (heap fino a
16 GB, per i file molto grandi). Variabili d'ambiente opzionali:

| Variabile | Default | Effetto |
|---|---|---|
| `PORT` | `3000` | Porta HTTP del server |
| `MAX_CONCURRENT` | `3` | Elaborazioni contemporanee; oltre, il server risponde `503` "Server occupato" |
| `DRACO_MAX_VERTS` | `4000000` (min 100 000) | Vertici massimi per primitiva prima della suddivisione per Draco |

Esempio: `PORT=8080 MAX_CONCURRENT=1 npm start`.
`GET /health` restituisce lo stato del server e i job attivi.

## Utilizzo

1. Trascina i file nella zona di drop (oppure cliccala per sceglierli):
   - un `.glb` o un `.gltf` da ottimizzare, **oppure**
   - un `.obj` insieme ai suoi `.mtl` e alle immagini delle texture
     (`.png`, `.jpg`/`.jpeg`, `.webp`, `.bmp`, `.tga`) — trascina tutto insieme,
     i file vengono riconosciuti automaticamente; MTL e texture si possono
     aggiungere anche con i selettori dedicati.
2. Scegli le ottimizzazioni.
3. Clicca il pulsante di avvio: il file viene scaricato automaticamente
   (`<nome>_optimized.glb` per GLB/GLTF, `<nome>_converted.glb` per OBJ),
   e un riquadro mostra la dimensione prima/dopo.

Per un `.gltf` vale una limitazione: si carica un solo file, quindi il GLTF
deve avere buffer e immagini incorporati (data URI). Un GLTF con `.bin` o
texture esterne va prima convertito in GLB (ad es. da Blender).

Se l'OBJ non contiene la direttiva `mtllib` per gli MTL caricati, il tool la
aggiunge da sé.

## Texture: cosa consigliamo per il visualizzatore

Le texture pesano sul telefono molto più della geometria: un'immagine
8192×8192 occupa 256 MB di RAM decodificata, qualunque sia il peso del file.
Per questo 3DCaveViewer, su smartphone e tablet, **ridimensiona le texture al
momento della decodifica** (lato massimo 4096 px e un budget di 24 megapixel
per modello, ridotti a 2048 px / 8 MP sui dispositivi con ≤ 2 GB di RAM;
configurabili con `textureMaxSizeMobile` e `textureBudgetMPMobile` in
`custom/settings.ini`). Su desktop le texture restano a piena risoluzione.

- **Usa JPEG o WebP, non PNG**: il browser non sa decodificare un PNG a
  dimensione ridotta, quindi un PNG grande costa la sua piena dimensione in
  memoria su ogni telefono, qualunque limite sia impostato. Scegli
  *Texture → WebP* o *JPEG* qui (salvo texture con trasparenza, per cui serve
  il PNG).
- **Lato massimo 4096 px** se il modello deve girare bene anche su mobile:
  è il default di *Texture → Lato massimo*. Le texture da 8192 px sono la
  causa più frequente dei modelli che su iPhone si caricano ma restano neri.
- Per le conversioni da OBJ usa texture **JPEG/PNG/WebP**: BMP e TGA vengono
  accettati in upload ma non sono formati glTF validi e la ricompressione
  WebP/JPEG non li legge.

## File di grandi dimensioni

Il tool supporta file grandi (fino a **5 GB** per file caricato). Requisiti e limiti:

- **Node.js ≥ 22** (obbligatorio): le versioni precedenti non possono leggere
  file oltre ~4 GB in un singolo buffer.
- **OBJ fino a 5 GB**: oltre i 400 MB la conversione usa un parser streaming
  con typed array (al posto di `obj2gltf`); la memoria richiesta è circa
  2–3× la dimensione del file (consigliati 16 GB di RAM per un OBJ da 5 GB).
  Il parser streaming legge dei materiali solo colore, opacità e texture
  diffusa (`Kd`, `d`, `map_Kd`).
- **GLB fino a 4,29 GB**: è un limite della *specifica* GLB (le lunghezze
  interne sono uint32), non del tool. Un "GLB" più grande è fuori standard e
  va riesportato come OBJ e convertito. Anche l'output deve restare sotto
  questa soglia: senza Draco, un risultato troppo grande viene rifiutato con
  un messaggio invece di produrre un file corrotto.
- I GLB già compressi con Draco vengono letti a memoria costante, una mesh
  alla volta, invece di decodificarle tutte insieme.
- Le mesh con decine di milioni di vertici vengono suddivise automaticamente
  in più primitive prima della codifica Draco (l'encoder è WASM a 32 bit);
  il risultato è identico alla vista in Three.js. La soglia è `DRACO_MAX_VERTS`.
- Per file > 2 GB, Prune e Dedup vengono disabilitati automaticamente.
- Se dopo l'ottimizzazione la geometria risulta sparita (o il file è
  sospettosamente piccolo) l'elaborazione si interrompe con un errore che
  suggerisce di disattivare Prune e Dedup.

## Alternativa senza Node.js: `glb-optimizer-static/`

[`glb-optimizer-static/index.html`](../glb-optimizer-static/index.html) è una
pagina HTML unica che fa il lavoro interamente nel browser: si apre
direttamente nel browser, nessuna installazione, i file non lasciano il computer (le
librerie vengono caricate da CDN, quindi serve la connessione la prima volta).

Rispetto alla versione server:

- accetta `.glb` oppure `.obj` + `.mtl` + texture (non `.gltf`);
- offre Draco, Unisci vertici, Deduplica e Prune, senza slider di
  velocità/tolleranza;
- per le texture offre *Lato massimo* (default 4096 px) e *PNG → JPEG*
  (attivo; le PNG usate per la trasparenza restano PNG), ma non WebP né lo
  slider di qualità (JPEG al 90%);
- nella conversione da OBJ le texture vengono incorporate come **PNG**
  (comportamento di `GLTFExporter`): lascia attivo *PNG → JPEG*;
- è limitata dalla memoria del browser: oltre ~100 MB l'elaborazione è lenta,
  e gli OBJ oltre ~500 MB possono fallire. Per i file grandi usa il server.

## Compatibilità output

I file ottimizzati con Draco sono compatibili con Three.js (DRACOLoader già
configurato nel 3DCaveViewer); le texture WebP sono dichiarate con
l'estensione `EXT_texture_webp`, supportata dal visualizzatore.

Il GLB risultante va copiato in `modelli/<nome_cartella>/<nome_cartella>.glb`
insieme al file di metadati `.json` (vedi il README principale).
