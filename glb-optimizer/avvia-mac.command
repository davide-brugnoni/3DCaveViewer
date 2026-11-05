#!/bin/bash
# GLB Optimizer — doppio clic per avviarlo su macOS.
# Installa al primo avvio ciò che serve (Node.js portatile e componenti),
# avvia il programma e apre il browser. Chiudi la finestra per spegnerlo.
cd "$(dirname "$0")" || exit 1
bash ./launcher/avvia.sh
status=$?
if [ $status -ne 0 ]; then
  echo
  read -r -p "Premi Invio per chiudere…" _
fi
exit $status
