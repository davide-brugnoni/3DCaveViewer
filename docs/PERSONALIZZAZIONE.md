# 🛠️ Guida alla Personalizzazione del Viewer

Questa guida spiega, passo per passo, come adattare 3D Cave Viewer alla tua
organizzazione — nome, testi, logo, colori, mappa e comportamento del
visualizzatore 3D — **senza toccare una riga di codice** e senza perdere le
tue modifiche al prossimo aggiornamento dell'applicazione.

Per la struttura generale del progetto vedi il [`README.md`](../README.md)
principale; questa guida approfondisce solo la parte di personalizzazione,
con esempi pronti all'uso.

---

## 🧭 Primo passo: l'installazione guidata

Alla prima apertura di un'installazione nuova il sito non mostra la mappa
ma un wizard (`setup.php`) che raccoglie in cinque passi le scelte più
comuni:

1. **Benvenuto** — controlli tecnici del server e lingua predefinita;
2. **Identità** — nome, nome breve, gruppo, sito, email, copyright,
   descrizione e **logo** (PNG, JPEG o WebP, fino a 5 MB e 4000 px di
   lato); in un blocco avanzato, titolo, sottotitolo e intestazione
   dell'elenco della homepage;
3. **Colori** — accento, sfondo, pannelli, testo, barra del browser e
   splash della PWA, con anteprima dal vivo;
4. **Mappa** — il **centro**, scelto trascinando la mappa o cercando un
   indirizzo, e i tre livelli di zoom provati sulla mappa stessa; in un
   blocco avanzato, velocità di camminata, unità della barra di scala e
   cupola del cielo del visualizzatore 3D;
5. **Fine** — riepilogo e salvataggio.

Al salvataggio scrive le stesse chiavi di `custom/settings.ini` descritte
in questa guida, riga per riga, lasciando intatti i commenti del file (la
versione precedente resta in `custom/settings.ini.bak`). Il logo finisce in
`custom/logo.png` e le icone della PWA vengono rigenerate da lì. I valori
non validi vengono scartati e il wizard li elenca nella schermata finale;
uno zoom minimo più alto dello zoom iniziale o di quello sulla cavità
viene rifiutato, perché bloccherebbe la mappa.

Il wizard **non imposta** i limiti di spostamento della mappa (vedi
[🗺️ Mappa](#%EF%B8%8F-mappa-homepage)): se li hai scritti a mano e il nuovo
centro cade fuori dal rettangolo, li commenta e la mappa torna libera.

### 🔑 La chiave per riaprirlo

L'ultima schermata mostra la **chiave di configurazione** e il pulsante per
scaricarla come file di testo: conservalo. Da quel momento `setup.php`
mostra un form di sblocco: incolla lì la chiave, oppure scegli il file
scaricato (viene letto nel browser, non caricato sul server). Salvando di
nuovo la chiave resta la stessa, quindi il file conservato continua a
valere.

- **Chiave persa?** È l'ultima riga di `custom/.installed` sul server;
  oppure cancella quel file e il wizard torna aperto senza chiave.
- **`custom/` non scrivibile?** Il wizard mostra il testo di
  `settings.ini` e il file della chiave da caricare via FTP (la chiave
  come `custom/.installed`).
- **Installazione già personalizzata** che aggiorna il codice: il wizard
  non compare, il marker viene creato in silenzio (la chiave è comunque
  nell'ultima riga di `custom/.installed`).

Dettagli nel [`README.md`](../README.md#-installazione-guidata-setupphp).
Per tutto ciò che il wizard non copre — e per chi preferisce l'editor di
testo — vale la procedura manuale che segue.

---

## 📌 Il concetto in una frase

> Tutto ciò che personalizzi vive in **`custom/settings.ini`**, un file di
> sole variabili che è tuo: un aggiornamento dell'applicazione non lo
> sovrascrive.

Non serve copiare nulla: `custom/settings.ini` è già presente nel
repository con i valori di default. Le voci principali sono già attive:
basta cambiarne il valore. Le altre sono commentate: togli il `;` davanti
alla riga che ti interessa. Se un'opzione non c'è, copiala da
`custom/settings.example.ini`, che le elenca tutte, nella stessa sezione.

```ini
; Prima (valore di default del progetto)
appName = "3D Cave Viewer"

; Dopo
appName = "Le Grotte del Gruppo Speleo Esempio"
```

Salva, ricarica la pagina: fatto. Nessun riavvio, nessuna cache da svuotare,
nessun rischio di rompere il sito — vedi [✅ Verificare le
modifiche](#-verificare-le-modifiche).

---

## 🚀 Quick start manuale (5 minuti)

1. Apri `custom/settings.ini` con un editor di testo qualsiasi.
2. Nella sezione `[branding]`, imposta il nome della tua organizzazione:
   ```ini
   [branding]
   organizationName = "Gruppo Speleologico Esempio"
   organizationUrl = "https://www.tuogruppo.it/"
   contactEmail = "info@tuogruppo.it"
   ```
3. Copia il tuo logo in `custom/logo.png` (o `.jpg`/`.svg`/`.webp`) — le
   icone della PWA vengono generate da sole a partire da questo file, non
   serve preparare nient'altro (vedi [🎨 Logo e icone](#-logo-e-icone)).
4. Ricarica la pagina. Il logo, il nome e i link puntano già alla tua
   organizzazione.

Il resto di questa guida copre ogni sezione in dettaglio.

---

## 🗂️ Quale file modifico?

| Cosa vuoi fare | File |
|---|---|
| Le scelte più comuni, guidato passo per passo | `setup.php` — l'installazione guidata, che scrive in `custom/settings.ini` |
| Cambiare nome, testi, colori, mappa, viewer, lingua, social | `custom/settings.ini` — **usa questo nella quasi totalità dei casi** |
| Vedere **tutte** le opzioni disponibili, anche quelle non attive di default, con spiegazione | `custom/settings.example.ini` (sola consultazione) |
| Cambiare logo o icone | `custom/logo.*` (le icone si generano da sole); `custom/icon-192.*`, `custom/icon-512.*` solo se le vuoi diverse |
| Un valore calcolato o una struttura che l'INI non può esprimere (raro) | `custom/config.local.php` — copia `config.local.example.php` per iniziare |

`custom/settings.ini` è un file di **sole variabili**: niente codice PHP,
quindi impossibile romperlo con un errore di sintassi. `config.local.php` è
la valvola di sfogo avanzata e vince su `settings.ini` se entrambi
impostano la stessa chiave — vedi [⚙️ Quando serve
`config.local.php`](#%EF%B8%8F-quando-serve-configlocalphp) più sotto.

---

## 🏢 Branding — chi sei

Sezione `[branding]` di `settings.ini`:

```ini
[branding]
appName = "Le Grotte del Gruppo Speleo Esempio"
appShortName = "Grotte GSE"
organizationName = "Gruppo Speleologico Esempio"
organizationUrl = "https://www.tuogruppo.it/"
contactEmail = "info@tuogruppo.it"
copyrightHolder = "Davide Brugnoni – Personalizzato da Gruppo Speleologico Esempio"
appDescription = "Esplora la mappa interattiva e i modelli 3D delle nostre grotte"
```

| Campo | Dove appare |
|---|---|
| `appName` | Titolo di pagina, nome della PWA installata, condivisioni social |
| `appShortName` | Etichetta sotto l'icona quando la PWA è installata sul telefono |
| `organizationName` | Footer, sottotitoli, watermark degli screenshot esportati |
| `organizationUrl` | Il logo in alto a sinistra rimanda qui |
| `contactEmail` | Link "mailto:" nel footer |
| `copyrightHolder` | Testo del copyright nel footer (la "©" è aggiunta automaticamente) |
| `appDescription` | Meta tag SEO, anteprime social |

> ⚠️ `copyrightHolder` deve continuare a citare l'autore originale, Davide
> Brugnoni: è un requisito della licenza GNU GPL v3 (vedi [🔒 Cosa non è
> personalizzabile](#-cosa-non-è-personalizzabile) più sotto).
> L'installazione guidata rifiuta un testo che non lo nomina.

---

## ✏️ Testi dell'interfaccia

Sezione `[texts]`: titoli e sottotitoli mostrati nell'homepage e nel
viewer.

```ini
[texts]
pageTitle = "Mappa delle nostre cavità"
pageSubtitle = "I rilievi 3D di {organization}"
sidebarTitle = "Cavità del gruppo"
viewerDefaultTitle = "Visualizzatore 3D"
viewerDefaultDescription = "Esplora i rilievi di {organization}"
```

**Segnaposto disponibili in ogni testo:**

| Segnaposto | Sostituito con |
|---|---|
| `{organization}` | `branding.organizationName` |
| `{app}` | `branding.appName` |
| `{year}` | Anno corrente |

> ⚠️ Un testo impostato qui **vince sulle traduzioni**. Scritto in forma
> semplice (`pageTitle = "..."`), lo vede chi visita il sito in qualsiasi
> lingua. Per questo in `settings.ini` le righe di `[texts]` arrivano
> commentate: finché restano così, ogni lingua usa la sua traduzione da
> `i18n/[lingua].json`. L'installazione guidata scrive questi testi solo
> se li compili, e in forma semplice: valgono quindi per tutte le lingue.

**Sito multilingua?** Scrivi una variante per lingua invece di un valore
unico:

```ini
pageTitle[it] = "Mappa delle nostre cavità"
pageTitle[en] = "Our cave map"
pageTitle[fr] = "Carte de nos cavités"
pageTitle[es] = "Mapa de nuestras cavidades"
```

Elenca **tutte** le lingue del sito: una lingua non elencata non torna alla
traduzione integrata, ma riceve la variante della lingua predefinita (o, se
manca anche quella, la prima scritta).

---

## 🎨 Logo e icone

**Basta un solo file.** Copia il tuo logo in `custom/`, con uno di questi
nomi:

```
custom/logo.png   (oppure .jpg, .jpeg, .svg, .webp)
```

Viene rilevato automaticamente e **vince sempre** sul logo di default di
default in `img/`. Le icone quadrate della PWA (`icon-192.png`,
`icon-512.png`, quelle che appaiono sulla home screen del telefono quando
l'app è installata) sono **opzionali**: se non le fornisci, l'applicazione
le genera da sola a partire dal logo — ridimensionato in "contain" (senza
ritagli né deformazioni) e centrato su sfondo trasparente — e le tiene in
cache in `custom/generated/`, rigenerandole automaticamente ogni volta che
sostituisci il logo.

```bash
cp /percorso/del/tuo/logo.png custom/logo.png
```

Ricarica la pagina: fatto. Non serve svuotare cache, il server aggiunge da
solo un parametro di versione (`?v=...`) che forza browser e PWA a
scaricare il file aggiornato.

In alternativa caricalo dal passo **Identità** dell'installazione guidata:
accetta PNG, JPEG o WebP (fino a 5 MB e 4000 px di lato), lo salva come
`custom/logo.png` dopo averlo ricodificato, cancella gli altri
`custom/logo.*` e fa rigenerare le icone.

La generazione delle icone richiede l'estensione PHP GD. Un logo **SVG**
funziona nell'header ma non può essere convertito: in quel caso, o senza
GD, la PWA usa le icone di 3DCaveViewer in `img/` finché non fornisci
`custom/icon-192.png` e `custom/icon-512.png`.

### Icone fatte a mano (opzionale)

Serve solo se vuoi un ritaglio o un artwork diverso da quello generato
automaticamente:

```bash
convert tuo_logo.png -resize 192x192 -background transparent -gravity center -extent 192x192 custom/icon-192.png
convert tuo_logo.png -resize 512x512 -background transparent -gravity center -extent 512x512 custom/icon-512.png
```

### Nomi di file diversi

Se preferisci un nome diverso da `logo.*`, indicalo in `settings.ini`:

```ini
[pwa]
logo = "custom/mio-logo-ufficiale.png"
icon192 = "custom/mia-icona-192.png"
icon512 = "custom/mia-icona-512.png"
; Colore di sfondo (hex a 6 cifre) per le icone generate, utile se il
; logo non ha trasparenza. Senza, lo sfondo resta trasparente.
;iconBackground = "#0b0d10"
```

Un percorso che non esiste viene ignorato e si passa al file successivo
(`custom/logo.*`, poi `img/`), invece di mostrare un'immagine rotta. Le
icone generate si rigenerano quando cambia il logo, non quando cambi
`iconBackground`: in quel caso cancella `custom/generated/`.

> ℹ️ Dettagli completi (formati supportati, ordine di precedenza tra i
> file) nella sezione "🎨 Personalizzare Loghi e Icone" del `README.md`
> principale e in `img/README.md`.

---

## 🌈 Colori e tema

Sezione `[theme]`. I colori vanno tra virgolette, in formato hex o `rgba()`:

```ini
[theme]
accentColor = "#ff8800"
accentHover = "#ffab40"
bgColor = "#0d1117"
textColor = "#e0e0e0"
```

| Campo | Cosa colora |
|---|---|
| `themeColor` | Barra del browser mobile e della PWA installata |
| `pwaBackgroundColor` | Schermata di splash della PWA |
| `bgColor` | Sfondo generale dell'interfaccia |
| `panelBg` / `panelBgSolid` | Pannelli flottanti (versione trasparente e piena) |
| `borderColor` / `textColor` | Bordi e testo generale |
| `accentColor` / `accentHover` | Colore principale: pulsanti attivi, link, evidenziazioni |
| `accentAlt` / `successColor` | Colori secondari e di conferma |
| `glassBlur` | Intensità della sfocatura "vetro" dei pannelli (es. `"blur(12px)"`) |

### Sfondo della scena 3D (sky dome)

Il visualizzatore avvolge il modello in una cupola con un gradiente dal
colore dell'orizzonte (chiaro) allo zenit (scuro), utile anche per il
comfort in VR. Servono **esattamente quattro colori**, uno per riga:

```ini
sceneGradient[] = "#2a3a44"
sceneGradient[] = "#18242c"
sceneGradient[] = "#0a1015"
sceneGradient[] = "#04070b"
```

La posizione dei quattro colori nel gradiente si regola con
`sceneGradientStops[]` (quattro numeri da 0 a 1, default `0.0`, `0.45`,
`0.70`, `1.0`). Puoi disattivare del tutto la cupola nella sezione
`[viewer]`, vedi sotto.

I colori principali (accento, sfondo, pannelli, testo, barra del browser e
splash) si scelgono anche dal passo **Colori** dell'installazione guidata,
con anteprima dal vivo.

---

## 🗺️ Mappa (homepage)

Sezione `[map]`. Utile se le tue cavità sono concentrate in una zona
diversa dal centro Italia (default del progetto).

```ini
[map]
center[] = 43.351726
center[] = 12.579768
defaultZoom = 15
minZoom = 8
flyToZoom = 17

; I quattro lati del rettangolo oltre cui la mappa non si sposta.
; Facoltativi: di serie non ci sono e la mappa resta libera. Se li vuoi,
; vanno impostati tutti e quattro insieme, e devono contenere il centro.
; L'installazione guidata non li tocca: sono una scelta da fare qui.
boundsSouth = 42.35
boundsWest = 11.85
boundsNorth = 43.80
boundsEast = 13.35
```

`center` è `[latitudine, longitudine]` del punto su cui la mappa si apre;
`defaultZoom` il livello di zoom iniziale (più alto = più vicino);
`flyToZoom` lo zoom usato quando si clicca una cavità nell'elenco;
`minZoom` quanto ci si può allontanare — non deve superare gli altri due,
o la mappa si blocca all'apertura. `maxZoom` (default `19`) è il limite
opposto: oltre il 19 OpenStreetMap non ha tessere.

Centro e zoom si scelgono anche dal passo **Mappa** dell'installazione
guidata. I limiti invece vanno scritti qui: se ne indichi solo alcuni
vengono ignorati tutti.

Per chi vuole un altro server di tessere ci sono `tileUrl` e
`attribution` (avanzato, vedi `settings.example.ini`): rispettane le
condizioni d'uso e aggiorna l'attribuzione. Offline viene conservata solo
la vista iniziale della mappa.

---

## 🎮 Comportamento del visualizzatore 3D

Sezione `[viewer]` — numeri e `true`/`false` **senza** virgolette.

```ini
[viewer]
; Velocità di camminata in prima persona (unità/secondo) e moltiplicatore
; quando si tiene premuto Shift ("corsa")
fpBaseSpeed = 1.2
fpBoostMultiplier = 3.0

; Passo avanti col doppio tap su mobile, in modalità prima persona
tapStepDistance = 1.0

; Sensibilità di rotazione trascinando col dito su mobile
lookSensitivity = 0.004

; Margine di sicurezza delle collisioni con le pareti (minore = più
; permissivo, il modello va toccato ai bordi delle mesh per bloccarsi)
collisionPadding = 0.05

; VR: velocità di movimento, di rotazione (yaw) e zona morta della levetta
vrMoveSpeed = 2.0
vrYawSpeed = 1.8
vrDeadZone = 0.15

; Barra di scala: larghezza in pixel e unità mostrata
scaleBarWidth = 150
scaleBarUnit = "m"

; Piani di taglio della telecamera (near/far, in unità del modello)
defaultNear = 0.1
defaultFar = 2000

; Cupola del cielo intorno alla scena: attiva/disattiva e raggio
skyDomeEnabled = true
skyDomeRadius = 1000

; Texture su telefoni, tablet e dispositivi con poca memoria: lato
; massimo (px) e budget per modello (megapixel); 0 = nessun limite
textureMaxSizeMobile = 4096
textureBudgetMPMobile = 24
; Stessi limiti sul desktop (0 = solo il limite della scheda video)
textureMaxSize = 0
textureBudgetMP = 0
```

Altre voci meno comuni — densità di pixel del rendering
(`pixelRatioMax`, `pixelRatioMaxMobile`), soglia del gesto a due dita
(`pinchLockThresholdPx`), doppio clic e vignettatura in VR
(`vrDoubleClickThreshold`, `vrVignetteMaxIntensity`,
`vrVignetteFadeSpeed`) e `debug` — sono documentate in
`custom/settings.example.ini`. Velocità di camminata, unità della barra di
scala e cupola si impostano anche dal blocco avanzato del passo **Mappa**
dell'installazione guidata.

**Consigli pratici:**

- Se i tuoi modelli sono in scala **non metrica**, o particolarmente grandi
  o piccoli, `fpBaseSpeed`, `collisionPadding` e `defaultNear`/`defaultFar`
  vanno regolati di conseguenza (un modello 10× più grande del solito vuole
  velocità e margini circa 10× maggiori).
- `skyDomeRadius` deve restare **minore** di `defaultFar`, altrimenti la
  cupola viene tagliata dal piano di clip in VR.
- `scaleBarUnit = "ft"` converte davvero le distanze in piedi, non si
  limita a cambiare l'etichetta.
- Se un modello fa chiudere la scheda sul telefono, la causa tipica sono
  texture enormi: i limiti `texture*Mobile` le riducono al caricamento,
  senza toccare il file (con 2 GB di RAM o meno scendono comunque a
  2048 px e 8 MP). Le texture incorporate conviene che siano JPEG o WebP:
  un PNG non può essere decodificato a dimensione ridotta.
- Se un modello ha problemi di orientamento (es. asse Z verticale invece di
  Y, tipico degli export da CloudCompare), la correzione si fa nel file
  `.json` di quel singolo modello con il campo `rotation` — non è
  un'impostazione globale, vedi la sezione "Aggiungere un Nuovo Modello 3D"
  del `README.md`.

---

## 🔗 Condivisione social

Sezione `[social]`: mostra o nasconde i pulsanti di condivisione nel
viewer.

```ini
[social]
enableFacebook = true
enableWhatsApp = true
enableTelegram = true
enableEmail = false
```

---

## 📰 Incorporare un modello in un articolo

Serve a raccontare **un punto preciso della grotta** dentro un articolo
(WordPress, Blogger, un sito qualsiasi): il lettore vede il 3D già
inquadrato su ciò di cui stai scrivendo, e ha un pulsante per aprire il
visualizzatore completo con tutte le funzioni.

Non richiede alcuna configurazione. Nel visualizzatore:

1. Inquadra il punto o attiva il piano di sezione sulla porzione di rilievo
   che ti interessa.
2. Apri **Condividi → Incorpora**.
3. Scegli cosa mostrare: proporzioni del riquadro, se partire dalla vista
   attuale, se includere la sezione, quali strumenti lasciare (barra di
   scala, nome del modello, schermo intero, misure, sezioni…).
4. Premi **Copia codice** e incolla il risultato in un blocco *HTML
   personalizzato* dell'articolo.

Il codice è un `<iframe>` dentro un contenitore responsive: si adatta alla
colonna dell'articolo e al telefono senza uscire dai margini.

> **WordPress**: usa il blocco «HTML personalizzato» (non «Paragrafo», che
> mostrerebbe il codice come testo). Serve un utente con permessi di
> pubblicazione HTML — su WordPress.com i piani base rimuovono gli iframe.

### Limitare i domini che possono incorporare

Di default il codice generato funziona su qualsiasi sito, così basta
copiarlo e incollarlo. Se preferisci autorizzare solo i tuoi domini,
elencali nella sezione `[security]`:

```ini
[security]
allowedEmbedOrigins[] = "https://www.miosito.it"
allowedEmbedOrigins[] = "https://*.miosito.it"
```

Ogni voce è schema + dominio, con porta facoltativa e senza percorso né
`/` finale; `*.` vale per tutti i sottodomini. Le voci scritte male
vengono ignorate (con un avviso nel log del server) e, se nessuna è
valida, l'incorporamento resta bloccato ovunque tranne che sul tuo dominio:
è voluto, così un errore di battitura si nota invece di aprire a tutti.

Il visualizzatore completo resta comunque incorporabile solo dal tuo
dominio, in entrambi i casi.

---

## 🌍 Lingua predefinita

Sezione `[language]`:

```ini
[language]
default = "it"
```

Si sceglie anche dal primo passo dell'installazione guidata. Vale come
lingua di apertura per chi visita il sito per la prima volta; chi
visita può comunque cambiarla in ogni momento dal selettore in alto (la
scelta resta salvata per un anno). Le lingue disponibili sono quelle con un
file in `i18n/` (`it`, `en`, `fr`, `es` di default) — per aggiungerne una
nuova vedi la sezione "🌍 Aggiungere una Nuova Lingua" del `README.md`.

---

## 📁 Cartella dei modelli

Sezione `[paths]`, utile solo se rinomini `modelli/`:

```ini
[paths]
modelsFolder = "modelli"
```

---

## 🔒 Sicurezza (avanzato)

Sezione `[security]`: `extraConnectSrc[]` serve solo se il visualizzatore
3D deve contattare domini esterni non già previsti (es. un servizio di
analytics, un CDN aggiuntivo): vengono aggiunti alla direttiva
`connect-src` della sua Content Security Policy.

```ini
[security]
extraConnectSrc[] = "https://tuoservizio.esempio.org"
```

La stessa sezione ospita `allowedEmbedOrigins[]`, che limita i domini
autorizzati a incorporare un modello in un iframe: vedi
[Incorporare un modello in un articolo](#-incorporare-un-modello-in-un-articolo).

---

## ⚙️ Quando serve `config.local.php`

Nella grande maggioranza dei casi `settings.ini` basta. `custom/config.local.php`
resta disponibile per i pochi casi che un file di sole variabili non può
esprimere: valori calcolati, o strutture particolari. Se lo crei, vince su
`settings.ini` per le chiavi che imposta.

```bash
cp custom/config.local.example.php custom/config.local.php
```

```php
return [
    'branding' => [
        'organizationName' => 'Gruppo Speleologico Esempio',
    ],
    'texts' => [
        'pageTitle' => [
            'it' => 'Le grotte del nostro gruppo',
            'en' => 'Our caves',
        ],
    ],
];
```

Non è tracciato da git e un aggiornamento dell'applicazione non lo tocca
mai. `originalAuthor` viene scartato anche da qui. Basta la sua presenza
perché un aggiornamento non mostri l'installazione guidata.

**Ordine con cui i valori vengono combinati** (l'ultimo vince):

1. i default del progetto in `config.php`;
2. `custom/settings.ini`, se presente;
3. `custom/config.local.php`, se presente.

---

## 🔒 Cosa non è personalizzabile

Per rispetto della licenza **GNU GPL v3** con cui il progetto è
distribuito, due elementi restano fissi indipendentemente dai file di
configurazione:

- la citazione dell'autore originale, **Davide Brugnoni**, nel footer;
- il badge **"Powered by 3DCaveViewer"** nel footer, che rimanda al
  progetto upstream.

Tutto il resto — nome, logo, colori, testi, mappa, comportamento del
viewer — è pensato per essere completamente tuo.

---

## ✅ Verificare le modifiche

- **`settings.ini` / `config.local.php`**: basta ricaricare la pagina, non
  c'è nessuna cache da svuotare.
- **Logo/icone**: idem — il server aggiunge da solo un parametro di
  versione che invalida la cache del browser e della PWA. Se su mobile vedi
  ancora la versione vecchia, apri `status.php` e svuota la cache offline.
- **Errori in `settings.ini`**: valori vuoti e sezioni sconosciute vengono
  ignorati; un errore di sintassi (es. una virgoletta non chiusa) fa
  ignorare **l'intero file** e il sito riparte con i default del progetto.
  L'avviso finisce nel log del server (`error_log`), mai in una pagina
  rotta per chi visita il sito: se le tue modifiche sembrano sparite
  tutte insieme, controlla lì.

---

## 📚 Approfondimenti

- [`README.md`](../README.md) — panoramica completa del progetto,
  installazione, struttura file, procedura di aggiornamento
- [`custom/README.md`](../custom/README.md) — cosa contiene la cartella
  `custom/`, precedenza dei file e chiave dell'installazione guidata
- [`img/README.md`](../img/README.md) — dettaglio sui loghi di default e
  sull'ordine di precedenza delle icone
- [`custom/settings.example.ini`](../custom/settings.example.ini) —
  riferimento commentato con **ogni** opzione disponibile
- [`CLAUDE.md`](../CLAUDE.md) — guida tecnica per chi sviluppa sul progetto
