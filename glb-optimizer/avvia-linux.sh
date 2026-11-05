#!/bin/bash
# GLB Optimizer — avvio su Linux: ./avvia-linux.sh (o "Esegui" dal file manager).
# Installa al primo avvio ciò che serve (Node.js portatile e componenti),
# avvia il programma e apre il browser. Ctrl+C per spegnerlo.
cd "$(dirname "$0")" || exit 1
exec bash ./launcher/avvia.sh
