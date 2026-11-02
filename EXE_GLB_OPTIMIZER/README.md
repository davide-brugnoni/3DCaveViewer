# EXE_GLB_OPTIMIZER — GLB Optimizer per Windows

Il [GLB Optimizer](../glb-optimizer/README.md) come programma Windows vero e
proprio: un installer guidato in italiano e una finestra propria, senza
terminale, senza installare Node.js e senza aprire il browser.

## Per chi lo usa

1. Scarica `GLB-Optimizer-Setup-<versione>.exe` (dalla pagina *Releases* del
   repository, o dagli *Artifacts* della build, vedi sotto).
2. Avvialo. L'installazione guidata mostra, pagina per pagina:
   - **a cosa serve** il programma;
   - **cosa viene installato**: la finestra del programma, il motore di
     elaborazione (una copia privata di Node.js), le librerie 3D (glTF
     Transform, Draco, sharp/libvips, obj2gltf), i collegamenti;
   - **i requisiti**: Windows 10/11 a 64 bit, circa 600 MB di disco e
     8 GB di RAM (16 o più per i file oltre 1–2 GB);
   - la cartella di destinazione, l'icona sul desktop (facoltativa) e, alla
     fine, come si usa.
3. Non servono permessi di amministratore: di default si installa per
   l'utente corrente in `%LOCALAPPDATA%\Programs\GLB Optimizer`. Dalla
   prima finestra si può scegliere "per tutti gli utenti" (in `Programmi`).

Poi si apre **GLB Optimizer** dal menu Start, si trascina il file nella
finestra e alla fine si sceglie dove salvare il GLB ottimizzato.

> Windows può mostrare l'avviso blu di SmartScreen ("PC protetto da
> Windows"): l'installer non è firmato digitalmente. Clic su *Ulteriori
> informazioni* → *Esegui comunque*. L'avviso sparisce solo con un
> certificato di firma del codice (a pagamento).

Disinstallazione: *Impostazioni → App → GLB Optimizer → Disinstalla*.
Il registro del programma (utile per le segnalazioni) si apre da
*Aiuto → Apri il registro*.

## Come funziona

```
GLB Optimizer.exe (Electron: finestra, menu, salvataggio file)
   └─ avvia resources\runtime\node.exe  resources\app\server\server.js
        └─ lo stesso server di glb-optimizer/, solo su 127.0.0.1:<porta libera>
```

- Il codice dell'optimizer **non è duplicato**: `scripts/prepare.mjs` copia
  `glb-optimizer/` in `server/` al momento della build. Una correzione fatta
  in `glb-optimizer/` finisce nel prossimo installer.
- Il server gira su un **Node.js separato** (scaricato da nodejs.org,
  SHA-256 verificato) e non dentro Electron, perché Electron limita la
  memoria JavaScript a 4 GB, mentre i modelli grandi ne chiedono fino a 16:
  l'app passa `--max-old-space-size` pari al 75% della RAM, al massimo
  16 GB come `npm start`.
- Il server ascolta solo su `127.0.0.1` (`HOST`), su una porta libera:
  niente richiesta del firewall di Windows, nessun accesso dalla rete.
- Chiudere la finestra durante un'elaborazione chiede conferma; il motore
  viene sempre chiuso insieme alla finestra.

| File | Ruolo |
|---|---|
| `app/main.cjs` | Processo principale Electron: avvio del server, finestra, menu, download, registro |
| `app/splash.html` | Schermata di avvio e di errore (con le ultime righe del registro) |
| `scripts/prepare.mjs` | Copia il server, controlla le dipendenze, genera l'icona, scarica `node.exe` |
| `scripts/build-installer.mjs` | Compila l'installer con Inno Setup |
| `installer/glb-optimizer.iss` | Installer Inno Setup: pagine, componenti, collegamenti |
| `installer/info-prima.txt` | Pagina "cosa stai installando e a cosa serve" |
| `installer/info-dopo.txt` | Pagina finale "come si usa" (copiata anche come `LEGGIMI.txt`) |
| `build-windows.bat` | Build completa con doppio clic su un PC Windows |

`server/`, `runtime/`, `build/`, `dist/` e `app/icon.png` sono generati e
non vanno nel repository.

## Creare l'installer

### Automaticamente su GitHub (consigliato)

Il workflow [`.github/workflows/glb-optimizer-windows.yml`](../.github/workflows/glb-optimizer-windows.yml)
compila l'installer su un PC Windows di GitHub:

- a ogni push che modifica `EXE_GLB_OPTIMIZER/` o `glb-optimizer/`;
- a mano: scheda **Actions** → *GLB Optimizer per Windows* → **Run workflow**.

L'installer si scarica dalla pagina della run, sezione **Artifacts**
(`GLB-Optimizer-Setup`, uno zip che contiene l'`.exe`).

Per pubblicarlo in una release: aggiorna `version` in `package.json` e crea
un tag `glb-optimizer-v<versione>`:

```bash
git tag glb-optimizer-v1.0.0
```

```bash
git push origin glb-optimizer-v1.0.0
```

### In locale su Windows

Servono [Node.js 22+](https://nodejs.org) e
[Inno Setup 6](https://jrsoftware.org/isdl.php). Doppio clic su
`build-windows.bat`, oppure:

```bash
npm ci
```

```bash
npm run dist
```

Il risultato è `dist\GLB-Optimizer-Setup-<versione>.exe`.

### Provare l'app durante lo sviluppo

Su qualunque sistema (usa il Node.js installato invece di quello incluso):

```bash
npm start
```

## Aggiornare le dipendenze

`dependencies` in questo `package.json` deve essere identico a quello di
`glb-optimizer/package.json`: `prepare.mjs` ferma la build se non lo è.
Dopo averle cambiate in entrambi, `npm install` aggiorna `package-lock.json`.
Il ramo di Node.js incluso è il 22 LTS (l'ultima versione disponibile al
momento della build); `NODE_LINE=24` ne sceglie un altro.
