// NOTA: L'aggiornamento automatico della cache è stato disabilitato.
// La cache si aggiorna solo quando:
// 1. Ci sono modifiche agli asset o modelli (versione cambiata)
// 2. Viene forzata manualmente da status.php
//
// Codice precedente (disabilitato):
// if ('serviceWorker' in navigator) {
//   navigator.serviceWorker.ready.then((registration) => {
//     if (registration.active) {
//       registration.active.postMessage({ type: 'CACHE_MODELS' });
//     }
//   }).catch((error) => {
//     console.warn('PWA: Errore invio messaggio cache modelli:', error);
//   });
// }
