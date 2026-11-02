; Installer Windows di GLB Optimizer (Inno Setup 6).
; Si compila con scripts/build-installer.mjs (npm run dist), che passa le
; versioni con /D; i valori qui sotto sono solo un ripiego.
; Prima va eseguito `npm run pack`, che crea dist\win-unpacked.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef NodeVersion
  #define NodeVersion "22"
#endif

#define AppName "GLB Optimizer"
#define AppExe  "GLB Optimizer.exe"
#define Src     "..\dist\win-unpacked"

[Setup]
; AppId identifica il programma per aggiornamenti e disinstallazione:
; non cambiarlo mai, altrimenti Windows lo vede come un programma diverso.
AppId={{8490FCDE-51D0-47A8-A987-03CEAA84126C}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Davide Brugnoni — Buio Verticale (CAI Gubbio)
AppPublisherURL=https://www.3dcaveviewer.com/
AppSupportURL=https://github.com/davide-brugnoni/3DCaveViewer/issues
AppUpdatesURL=https://github.com/davide-brugnoni/3DCaveViewer/releases
AppComments=Prepara i modelli 3D (GLB, GLTF, OBJ) per 3DCaveViewer
AppCopyright=© Davide Brugnoni — GNU GPL v3
VersionInfoVersion={#AppVersion}
VersionInfoDescription=Installazione di {#AppName}
; Installazione per l'utente corrente senza permessi di amministratore;
; dalla finestra iniziale si può scegliere "per tutti gli utenti".
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DefaultDirName={autopf}\{#AppName}
DisableProgramGroupPage=yes
DisableWelcomePage=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
InfoBeforeFile=info-prima.txt
InfoAfterFile=info-dopo.txt
ShowComponentSizes=yes
SetupIconFile=..\build\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
WizardStyle=modern
CloseApplications=yes
Compression=lzma2/max
SolidCompression=yes
OutputDir=..\dist
OutputBaseFilename=GLB-Optimizer-Setup-{#AppVersion}

[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"

[Messages]
italian.WelcomeLabel2=Questa procedura installa [name/ver] sul computer.%n%nGLB Optimizer prepara i modelli 3D delle grotte (GLB, GLTF, OBJ) per il visualizzatore 3DCaveViewer: comprime geometria e texture così che si aprano velocemente anche su telefono.%n%nNella pagina successiva trovi cosa viene installato e a cosa serve ogni componente.
italian.SelectComponentsDesc=Componenti di GLB Optimizer
italian.SelectComponentsLabel2=Questi sono gli elementi che verranno installati, tutti nella stessa cartella. Sono tutti necessari al funzionamento del programma.

[Types]
Name: "full"; Description: "Installazione completa"

[Components]
Name: "app";    Description: "GLB Optimizer — finestra e interfaccia del programma"; Types: full; Flags: fixed
Name: "engine"; Description: "Motore di elaborazione (Node.js {#NodeVersion}, copia privata)"; Types: full; Flags: fixed
Name: "libs";   Description: "Librerie 3D: glTF Transform, Draco, sharp/libvips, obj2gltf"; Types: full; Flags: fixed

[Tasks]
Name: "desktopicon"; Description: "Crea un'icona sul desktop"; GroupDescription: "Collegamenti:"

[Files]
Source: "{#Src}\*"; DestDir: "{app}"; Excludes: "\resources\runtime,\resources\app\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: app
Source: "{#Src}\resources\runtime\*"; DestDir: "{app}\resources\runtime"; Flags: ignoreversion recursesubdirs; Components: engine
Source: "{#Src}\resources\app\node_modules\*"; DestDir: "{app}\resources\app\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: libs
Source: "info-dopo.txt"; DestDir: "{app}"; DestName: "LEGGIMI.txt"; Flags: ignoreversion; Components: app

[InstallDelete]
; Un aggiornamento sostituisce interamente codice e librerie: niente file
; rimasti da una versione precedente.
Type: filesandordirs; Name: "{app}\resources\app"
Type: filesandordirs; Name: "{app}\resources\runtime"

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"; Comment: "Prepara i modelli 3D per 3DCaveViewer"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon; Comment: "Prepara i modelli 3D per 3DCaveViewer"

[Run]
Filename: "{app}\{#AppExe}"; Description: "Avvia GLB Optimizer"; Flags: nowait postinstall skipifsilent
