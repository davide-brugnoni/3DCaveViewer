# GLB Optimizer - scarica una copia portatile di Node.js 22 per Windows in
# glb-optimizer\.runtime\node\ (lo chiama avvia-windows.bat quando nel
# computer non c'e' un Node.js >= 22). Nessun permesso di amministratore,
# niente installato nel sistema: per rimuoverlo basta cancellare la cartella.
# Il file scaricato viene verificato con lo SHA-256 pubblicato da nodejs.org.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # la barra di Invoke-WebRequest rallenta molto il download
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$NodeLine = 22
$Root = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $Root '.runtime'
$Target = Join-Path $Runtime 'node'

function Fail($msg) {
    Write-Host ""
    Write-Host "[GLB Optimizer] ERRORE: $msg" -ForegroundColor Red
    exit 1
}

$cpu = $env:PROCESSOR_ARCHITEW6432
if (-not $cpu) { $cpu = $env:PROCESSOR_ARCHITECTURE }
switch ($cpu) {
    'AMD64' { $arch = 'x64' }
    'ARM64' { $arch = 'arm64' }
    default { Fail "processore non supportato ($cpu). Installa Node.js $NodeLine da https://nodejs.org" }
}

Write-Host "[GLB Optimizer] Node.js $NodeLine non trovato: scarico una copia portatile (solo la prima volta)..."
$base = "https://nodejs.org/dist/latest-v$NodeLine.x"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("glbopt-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
    try {
        $sums = (Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt").Content
        if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
    } catch {
        Fail "impossibile contattare nodejs.org. Controlla la connessione a Internet."
    }

    $line = ($sums -split "`n") | Where-Object { $_ -match "^([0-9a-f]{64})\s+(node-v[0-9.]+-win-$arch\.zip)\s*$" } | Select-Object -First 1
    if (-not $line) { Fail "nessun Node.js $NodeLine per win-$arch su nodejs.org." }
    $null = $line -match "^([0-9a-f]{64})\s+(node-v[0-9.]+-win-$arch\.zip)"
    $expected = $Matches[1]
    $file = $Matches[2]

    $zip = Join-Path $tmp $file
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "$base/$file" -OutFile $zip
    } catch {
        Fail "download di $file non riuscito."
    }

    $actual = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower()
    if ($actual -ne $expected) { Fail "il file scaricato e' danneggiato (SHA-256 diverso). Riprova." }

    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    if (Test-Path $Target) { Remove-Item -Recurse -Force $Target }
    New-Item -ItemType Directory -Path $Runtime -Force | Out-Null
    Move-Item -Path (Join-Path $tmp ($file -replace '\.zip$', '')) -Destination $Target
    Write-Host "[GLB Optimizer] Node.js $($file -replace '^node-|\.zip$', '') pronto."
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
exit 0
