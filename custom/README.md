# custom/ — le tue personalizzazioni

Questa cartella contiene **i dati della tua installazione**: non fa parte
del codice dell'applicazione e non viene mai sovrascritta da un
aggiornamento (l'opposto di `img/`, che è codice e va sovrascritta a ogni
aggiornamento — vedi `img/README.md`). Quando aggiorni, copia il nuovo
codice ovunque tranne che in `custom/` e `modelli/`.

## Cosa contiene

| File | Tracciato da git | Ruolo |
|---|:---:|---|
| `settings.ini` | ✅ sì | Il file che modifichi: valori di default già attivi, pronto all'uso. È anche quello che scrive l'installazione guidata |
| `settings.example.ini` | ✅ sì | Solo riferimento, mai letto dall'app: documenta **ogni** opzione con il suo default |
| `config.local.php` | ❌ no | Override PHP avanzati, opzionali — vince su `settings.ini` |
| `config.local.example.php` | ✅ sì | Template da copiare per creare `config.local.php` |
| `logo.*` | ❌ no | Il tuo logo (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`); il wizard lo salva come `logo.png` |
| `icon-192.*`, `icon-512.*` | ❌ no | Icone PWA dedicate, **opzionali**: senza, vengono generate dal logo |
| `generated/` | ❌ no | Cache delle icone PWA generate dal logo; si può cancellare, si ricrea da sola |
| `.installed` | ❌ no | Marker di installazione completata, con la chiave che riapre il wizard |
| `settings.ini.bak` | ❌ no | Copia di sicurezza scritta dal wizard prima di riscrivere `settings.ini` |

> 🧭 **Quasi sempre basta `settings.ini`.** È un file di sole variabili:
> niente codice PHP, quindi un errore di battitura non può rompere il sito
> — valori vuoti e sezioni sconosciute vengono ignorati, e un errore di
> sintassi fa ignorare l'intero file (con un avviso nel log del server)
> invece di bloccare il sito. Usa `config.local.php` solo per valori
> calcolati o strutture che l'INI non può esprimere.

`settings.ini` è tracciato da git perché un'installazione appena clonata
funzioni subito: per il resto trattalo come un tuo dato, non come codice.
Le modifiche che fai lì restano tue anche se aggiorni l'applicazione.

## Precedenza

Il merge avviene in quest'ordine (l'ultimo vince):

1. i default del progetto (`config.php` e, per mappa, viewer, social e
   colori dell'interfaccia, `js/config.php`);
2. `custom/settings.ini` — sovrascrive solo le chiavi che imposta;
3. `custom/config.local.php`, se presente — vince su tutto il resto.

`originalAuthor` (attribuzione richiesta dalla licenza GNU GPL v3) e il
badge "Powered by 3DCaveViewer" non sono sovrascrivibili da nessuno dei due
file.

## Installazione guidata e chiave

Finché `.installed` non esiste, le pagine del sito (homepage, viewer,
pagina cache) rimandano a `setup.php`, il wizard che compila
`settings.ini` al posto tuo e può caricare il logo. Un'installazione già
personalizzata che aggiorna il codice non lo vede: il marker viene creato
in silenzio.

A fine installazione il wizard mostra la **chiave di configurazione** e fa
scaricare un file di testo identico a `.installed` (commenti + chiave
nell'ultima riga). Per rientrare nel wizard apri `setup.php`: incolla la
chiave nel form di sblocco oppure scegli quel file (viene letto nel
browser, non caricato). Se hai perso il file, la chiave si legge
nell'ultima riga di `custom/.installed`; in alternativa cancella
`.installed` e il wizard torna aperto senza chiave. Un nuovo salvataggio
conserva la chiave esistente.

Se `custom/` non è scrivibile dal server, il wizard mostra il testo di
`settings.ini` e il file della chiave da caricare a mano via FTP (la
chiave va caricata come `custom/.installed`).

## Loghi e icone

Basta lasciare il tuo logo come `custom/logo.png` (o un altro formato tra
quelli sopra): vince sempre sul segnaposto di `img/` e le icone PWA
quadrate vengono generate da lì (serve PHP GD; un logo SVG non può essere
convertito). Ordine di precedenza e dettagli in `img/README.md` e in
[`docs/PERSONALIZZAZIONE.md`](../docs/PERSONALIZZAZIONE.md#-logo-e-icone).
