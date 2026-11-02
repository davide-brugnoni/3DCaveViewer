@echo off
rem Crea l'installer di GLB Optimizer su un PC Windows.
rem Servono: Node.js 22 o piu' recente (https://nodejs.org) e
rem Inno Setup 6 (https://jrsoftware.org/isdl.php).
rem Risultato: dist\GLB-Optimizer-Setup-<versione>.exe
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (
  echo Node.js non trovato: installalo da https://nodejs.org e riprova.
  pause & exit /b 1
)

echo === 1/3 Dipendenze ===
call npm ci || goto :error
echo === 2/3 Applicazione ===
call npm run pack || goto :error
echo === 3/3 Installer ===
call node scripts\build-installer.mjs || goto :error

echo.
echo Fatto: l'installer e' nella cartella dist\
explorer dist
pause
exit /b 0

:error
echo.
echo Build non riuscita: leggi i messaggi qui sopra.
pause
exit /b 1
