#!/usr/bin/env bash
# GLB Optimizer — avvio per macOS e Linux (lo chiamano avvia-mac.command e
# avvia-linux.sh). Usa il Node.js di sistema se è >= 22; altrimenti scarica
# una copia portatile di Node.js 22 in glb-optimizer/.runtime/ (nessun
# permesso di amministratore, niente installato nel sistema), verificata con
# lo SHA-256 pubblicato da nodejs.org. Poi passa a launcher.mjs.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
RUNTIME="$ROOT/.runtime"
NODE_LINE=22

say()  { printf '[GLB Optimizer] %s\n' "$*"; }
die()  { printf '\n[GLB Optimizer] ERRORE: %s\n\n' "$*" >&2; exit 1; }

node_ok() {
  local major
  major="$("$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null)" || return 1
  [ "${major:-0}" -ge "$NODE_LINE" ]
}

fetch() { # fetch URL DEST
  if command -v curl >/dev/null 2>&1; then curl -fL --retry 3 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then wget -q -O "$2" "$1"
  else die "serve curl o wget per scaricare Node.js."; fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

install_portable_node() {
  local os arch base tmp sums file expected
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux)  os=linux ;;
    *) die "sistema operativo non supportato: $(uname -s). Installa Node.js $NODE_LINE da https://nodejs.org" ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64)  arch=x64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) die "processore non supportato: $(uname -m). Installa Node.js $NODE_LINE da https://nodejs.org" ;;
  esac

  say "Node.js $NODE_LINE non trovato: scarico una copia portatile (solo la prima volta)…"
  base="https://nodejs.org/dist/latest-v$NODE_LINE.x"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  fetch "$base/SHASUMS256.txt" "$tmp/SHASUMS256.txt" || die "impossibile contattare nodejs.org. Controlla la connessione a Internet."
  file="$(grep -oE "node-v[0-9.]+-$os-$arch\.tar\.gz" "$tmp/SHASUMS256.txt" | head -n1)"
  [ -n "$file" ] || die "nessun Node.js $NODE_LINE per $os-$arch su nodejs.org."
  expected="$(awk -v f="$file" '$2 == f {print $1}' "$tmp/SHASUMS256.txt")"

  fetch "$base/$file" "$tmp/$file" || die "download di $file non riuscito."
  [ "$(sha256 "$tmp/$file")" = "$expected" ] || die "il file scaricato è danneggiato (SHA-256 diverso). Riprova."

  rm -rf "$RUNTIME/node"
  mkdir -p "$RUNTIME"
  tar -xzf "$tmp/$file" -C "$tmp"
  mv "$tmp/${file%.tar.gz}" "$RUNTIME/node"
  say "Node.js ${file#node-} pronto."
}

NODE=""
if [ -x "$RUNTIME/node/bin/node" ] && node_ok "$RUNTIME/node/bin/node"; then
  NODE="$RUNTIME/node/bin/node"
elif command -v node >/dev/null 2>&1 && node_ok node; then
  NODE="$(command -v node)"
else
  install_portable_node
  NODE="$RUNTIME/node/bin/node"
  node_ok "$NODE" || die "il Node.js scaricato non si avvia su questo computer."
fi

cd "$ROOT"
exec "$NODE" "$HERE/launcher.mjs"
