@echo off
rem GLB Optimizer - doppio clic per avviarlo su Windows.
rem Al primo avvio installa cio' che serve (Node.js portatile in .runtime\
rem e i componenti npm), poi avvia il programma e apre il browser.
rem Chiudi questa finestra per spegnerlo.
setlocal
chcp 65001 >nul
title GLB Optimizer
cd /d "%~dp0"

set "NODE="
set "PORTABLE=%CD%\.runtime\node\node.exe"

if exist "%PORTABLE%" call :check "%PORTABLE%"
if defined NODE goto run
where node >nul 2>&1
if not errorlevel 1 call :check node
if defined NODE goto run

powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\launcher\installa-node.ps1"
if errorlevel 1 goto fail
call :check "%PORTABLE%"
if not defined NODE (
  echo [GLB Optimizer] ERRORE: il Node.js scaricato non si avvia su questo computer.
  goto fail
)

:run
"%NODE%" "%CD%\launcher\launcher.mjs"
if errorlevel 1 goto fail
exit /b 0

:check
"%~1" -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)" >nul 2>&1
if not errorlevel 1 set "NODE=%~1"
exit /b 0

:fail
echo.
pause
exit /b 1
