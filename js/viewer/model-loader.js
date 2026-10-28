// 3D Cave Viewer — scaricamento del modello 3D a impronta di memoria minima.
//
// Perché non basta gltfLoader.load(): il FileLoader di Three.js legge la
// risposta a chunk, li accumula in un array e solo alla fine li concatena in
// un unico ArrayBuffer. Per un GLB da 100 MB significa tenerne in memoria
// ~200 MB prima ancora di iniziare il parsing: su telefono il sistema
// operativo termina la scheda (la pagina "va in errore" e si ricarica) prima
// che il modello compaia. Qui il buffer definitivo viene allocato una volta
// sola a partire da Content-Length e i chunk ci vengono scritti dentro, così
// il picco durante il download è pari alla dimensione del file.
//
// In più la fetch è interrompibile: cambiare modello mentre il precedente sta
// ancora scaricando libera subito il buffer invece di lasciarlo crescere.

function emitProgress(onProgress, loaded, total) {
  if (typeof onProgress !== 'function') return;
  try {
    onProgress(loaded, total);
  } catch {
    // Un errore nell'aggiornamento della UI non deve fermare il download
  }
}

// Allocazione con errore riconoscibile: su un dispositivo a corto di memoria
// il messaggio generico "errore di caricamento" non aiuterebbe nessuno.
function allocate(bytes) {
  try {
    return new Uint8Array(bytes);
  } catch (cause) {
    const error = new Error(`Allocazione di ${bytes} byte rifiutata`);
    error.code = 'memory';
    error.cause = cause;
    throw error;
  }
}

/**
 * Scarica un file binario restituendo un ArrayBuffer, tenendone in memoria
 * una sola copia quando il server dichiara Content-Length.
 *
 * @param {string} url
 * @param {{ onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal }} [options]
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchBinaryModel(url, options = {}) {
  const { onProgress, signal } = options;

  // mode resta il 'cors' di default e credentials 'same-origin', gli stessi
  // valori che usava il FileLoader di Three.js: sono quelli con cui viewer.php
  // dichiara <link rel="preload" as="fetch" crossorigin="anonymous">, e una
  // richiesta che non combacia con il preload fa scaricare il file due volte.
  const response = await fetch(url, { signal, credentials: 'same-origin' });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} — ${url}`);
    error.code = 'http';
    error.status = response.status;
    throw error;
  }

  // Content-Length è attendibile solo se il corpo non è codificato: con
  // gzip/brotli dichiara i byte compressi mentre lo stream ne consegna di più.
  // I GLB non vengono compressi (vedi .htaccess), ma un proxy potrebbe farlo.
  const encoding = (response.headers.get('Content-Encoding') || '').toLowerCase();
  const declared = Number(response.headers.get('Content-Length'));
  const total = (encoding === '' || encoding === 'identity') && Number.isFinite(declared) && declared > 0
    ? declared
    : 0;

  const canStream = total > 0 && response.body && typeof response.body.getReader === 'function';

  if (!canStream) {
    // Senza dimensione dichiarata non si può preallocare: si delega al
    // browser, che resta comunque più parsimonioso dell'accumulo a chunk.
    emitProgress(onProgress, 0, 0);
    const buffer = await response.arrayBuffer();
    emitProgress(onProgress, buffer.byteLength, buffer.byteLength);
    return buffer;
  }

  const buffer = allocate(total);
  const reader = response.body.getReader();
  let filled = 0;          // byte scritti in buffer
  let received = 0;        // byte ricevuti in tutto
  let overflow = null;     // chunk oltre Content-Length (server che dichiara il falso)

  emitProgress(onProgress, 0, total);

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      if (!overflow && filled + value.byteLength <= buffer.length) {
        buffer.set(value, filled);
        filled += value.byteLength;
      } else {
        (overflow || (overflow = [])).push(value);
      }
      received += value.byteLength;
      emitProgress(onProgress, received, Math.max(total, received));
    }
  } catch (err) {
    try { await reader.cancel(); } catch { /* stream già chiuso */ }
    throw err;
  }

  if (!overflow && filled === total) {
    return buffer.buffer;
  }

  if (!overflow && filled < total) {
    // Connessione caduta a metà: meglio un errore esplicito di un GLB troncato,
    // che arriverebbe al parser come coda di zeri con un messaggio incomprensibile.
    const error = new Error(`Download incompleto: ${filled}/${total} byte`);
    error.code = 'truncated';
    throw error;
  }

  // Caso raro (Content-Length più piccolo del corpo): ricompone i byte nella
  // misura giusta. Costa una seconda copia, ma solo quando il server sbaglia.
  const merged = allocate(received);
  merged.set(buffer.subarray(0, filled), 0);
  let offset = filled;
  for (const chunk of overflow) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}
