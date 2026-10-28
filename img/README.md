# img/ — immagini di default del progetto

Questa cartella fa parte del **codice dell'applicazione**: viene sovrascritta
a ogni aggiornamento. Le personalizzazioni di una singola installazione vanno
in `custom/` (vedi `custom/README.md`), che non viene mai toccata: non
modificare i file qui, perché il prossimo aggiornamento li riporterebbe
indietro.

## Loghi e icone

| File | Dimensioni | Uso |
|---|---|---|
| `logo.png` | quadrato, ≥ 512×512 | Logo nell'header, nella pagina cache, nel viewer 3D e nella filigrana degli screenshot |
| `logo.webp` | come `logo.png` | Stesso logo, più leggero, servito ai browser che lo supportano |
| `icon-192.png` | 192×192 | Icona PWA piccola |
| `icon-512.png` | 512×512 | Icona PWA grande (anche splash screen) |

Sono il simbolo di **3DCaveViewer** (il cristallo), nella versione per fondo
scuro come il tema dell'app: il logo è trasparente, le icone PWA hanno lo
sfondo pieno `#0b0d10` e il simbolo dentro la zona sicura delle icone
"maskable". Chi gestisce un'installazione non li modifica: mette il proprio
logo in `custom/` (o lo carica dall'installazione guidata) e vince lui.

Le versioni con la scritta, per fondo chiaro e scuro, stanno in `docs/img/`
e servono solo alla documentazione.

I percorsi di default sono quelli della sezione `pwa` di `config.php`
(`img/logo.png`, `img/icon-192.png`, `img/icon-512.png`); se mancano si
cerca un altro formato con lo stesso nome (per il logo nell'ordine `.png`,
`.jpg`, `.jpeg`, `.svg`, `.webp`). Se accanto al logo scelto esiste un file
`.webp` con lo stesso nome e non più vecchio, viene servito come sorgente
più leggera: il WebP di `img/` non può quindi sostituirsi a un logo in
`custom/`.

## Generazione automatica delle icone

`icon-192.*`/`icon-512.*` sono **opzionali** anche in `custom/`: se
un'installazione fornisce solo il proprio logo, `iconPath()` in
`config.php` genera un'icona quadrata per ogni dimensione, ridimensionando
il logo in "contain" (senza ritagliarlo) e centrandolo su sfondo
trasparente — o sul colore `iconBackground` della sezione `[pwa]` di
`custom/settings.ini`. Le icone generate stanno in `custom/generated/` e
vengono rigenerate quando il logo o un file di impostazioni
(`custom/settings.ini`, `custom/config.local.php`, da cui arriva
`iconBackground`) è più recente di loro. Serve l'estensione PHP GD (già un prerequisito del progetto); se manca, o se il logo è in un
formato che GD non sa decodificare (es. SVG), si ricade sulle icone di
questa cartella, senza errori.

## Precedenza

Per ogni icona PWA l'applicazione cerca, in quest'ordine:

1. il percorso indicato in `custom/settings.ini` (sezione `[pwa]`) o in
   `custom/config.local.php`, se il file esiste;
2. il file dedicato dell'utente in `custom/` (`custom/icon-192.*`, `custom/icon-512.*`);
3. l'icona generata automaticamente dal logo (`custom/generated/`);
4. il default di questa cartella (`img/`);
5. nessuna immagine — l'icona semplicemente non viene mostrata.

Per il logo (che non viene mai generato) il passo 3 non esiste: dal file
in `custom/` si passa direttamente al default di `img/`. Quindi **basta
lasciare il proprio logo in `custom/` perché vinca su questi default**,
senza scrivere una riga di configurazione — e le icone PWA si adattano da
sole. Ogni URL riceve un parametro `?v=<data di modifica>`, così un file
sostituito si vede subito nonostante la cache di un anno e il service
worker.
