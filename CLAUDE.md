# CLAUDE.md — 3DCaveViewer

This file provides guidance for AI assistants (Claude and others) working on this repository.

---

## Project Overview

**3DCaveViewer** is a full-stack Progressive Web App for exploring 3D cave models interactively. It is developed by Davide Brugnoni for [Buio Verticale](https://www.buioverticale.it/), the Speleological Group of CAI Gubbio (Italy). The application is licensed under **GNU GPL v3**.

Core capabilities:
- Interactive map (Leaflet + OpenStreetMap) listing available cave models with search/filter
- WebGL 3D viewer (Three.js) with orbit and first-person navigation modes
- WebXR (VR headset) support
- Distance measurement tools (vertex snap, point editing, CSV export)
- Section (clipping) planes for X/Y/Z axis analysis
- Searchable model dropdown selector in the viewer
- Persistent point-of-interest (POI) annotations with JSON export/import
- 3D screenshot export (PNG) and shareable camera-state links
- Embed-code generator: builds a responsive `<iframe>` snippet for external
  articles (WordPress and the like), pointing at a simplified viewer that
  starts from a frozen camera view and section plane
- Progressive Web App (PWA) with offline support via Service Workers
- Multilingual UI (Italian, English, French, Spanish) with an in-UI language selector
- Server-side social preview image generation
- Mobile-optimized bottom-sheet panels with minimize-to-pill feature

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | PHP 7.4+ (strict types), Apache with mod_rewrite |
| 3D Rendering | Three.js v0.160.0 (vendored in `lib/three/`) |
| Collision acceleration | three-mesh-bvh (vendored in `lib/three-mesh-bvh/`, mapped in the viewer's import map) |
| Mapping | Leaflet v1.9.4 (vendored in `lib/leaflet/`) |
| 3D Model Format | GLB (GLTF Binary), GLTF, OBJ |
| Fonts | Poppins (locally hosted in `lib/fonts/`) |
| Model Optimization | `@gltf-transform/*`, `obj2gltf`, `draco3d`, `sharp` for textures (Node.js ≥ 22, all in `glb-optimizer/`, optional) |
| PWA | Service Workers, Web App Manifest |
| Styling | Vanilla CSS with CSS variables |

There is **no build step** — the project is server-side rendered PHP with ES6 modules. No transpilation, no bundler.

---

## Repository Structure

```
3DCaveViewer/
├── index.php                   # Homepage: interactive map listing caves
├── viewer.php                  # Main 3D viewer page
├── status.php                  # PWA cache status/management dashboard
├── setup.php                   # First-run setup wizard (see below)
├── setup_lib.php               # Wizard field schema, validation, settings.ini writer
├── sitemap.php                 # Dynamic sitemap.xml (served via rewrite)
├── robots.php                  # Dynamic robots.txt (served via rewrite)
├── generate_social_preview.php # Server-side screenshot via PHP GD
├── save_social_preview.php     # Caches social preview images
├── config.php                  # PHP backend configuration (single source)
├── manifest.php                # Dynamic PWA manifest (served as manifest.json via rewrite)
├── offline.html                # Offline fallback page
├── .htaccess                   # Apache rules, security headers, caching
├── .github/FUNDING.yml         # Sponsor link only (no CI workflows)
│
├── api/
│   ├── catalogo.php            # API endpoint: returns model list as JSON
│   └── catalogo_assets.php     # API endpoint: model asset URLs (for PWA caching)
│
├── custom/                     # 🔒 User customizations — NEVER touched by an update
│   ├── README.md                   # Tracked, explains the folder to deployers (Italian)
│   ├── settings.ini                # Variables-only overrides, tracked with working defaults — preferred
│   ├── settings.example.ini        # Tracked reference template, documents every option (mostly commented)
│   ├── config.local.php            # Advanced PHP overrides (gitignored)
│   ├── config.local.example.php    # Tracked template, copy to config.local.php
│   ├── logo.* (png/jpg/webp/svg)   # The deployment's logo; the wizard writes logo.png (gitignored)
│   ├── icon-192.png / icon-512.png # The deployment's PWA icons (gitignored)
│   ├── .installed                  # Setup-completed marker + reopen key (gitignored)
│   ├── settings.ini.bak            # Backup written by the wizard (gitignored)
│   └── generated/                  # PWA icons generated from the logo (gitignored)
│
├── img/                        # Project default images (app code, overwritten by updates)
│   ├── README.md                   # Explains img/ vs custom/ (Italian)
│   ├── logo.png / logo.webp        # 3DCaveViewer crystal symbol (transparent, for dark UI)
│   └── icon-192.png / icon-512.png # PWA icons: symbol on #0b0d10, inside the maskable safe zone
│
├── css/
│   ├── index.css               # Homepage styles
│   ├── viewer.css              # 3D viewer interface styles
│   ├── status.css              # Status page styles
│   └── setup.css               # Setup wizard styles (standalone, no js/config.php)
│
├── js/
│   ├── config.php              # Frontend config (PHP served as JS) + CSS vars
│   ├── i18n.js                 # Client-side translation fallback
│   ├── lang-selector.js        # Language dropdown open/close behavior
│   ├── index.js                # Homepage map logic (with search/filter)
│   ├── viewer.js               # 3D viewer entry point (~3,800 lines)
│   ├── viewer/                 # ES6 modules extracted from viewer.js
│   │   ├── utils.js            # Pure helpers, eventManager, dispose utils
│   │   ├── dom.js              # Centralized DOM element cache
│   │   ├── loader-ui.js        # Loading overlay + watchdog
│   │   ├── panels.js           # Floating-panel framework (panel registry)
│   │   ├── measure.js          # Measurement system + CSV export
│   │   ├── annotations.js      # Persistent POI annotations
│   │   ├── embed.js            # Embed-code generator (share panel tab)
│   │   ├── pivot-orbit.js      # Mouse orbit around the clicked point
│   │   ├── model-loader.js     # Streaming GLB download (single-buffer, abortable)
│   │   ├── gltf-memory.js      # Lean GLB parse + texture downscaling plugin
│   │   └── diagnostics.js      # GPU upload check + ?debug=1 overlay
│   ├── setup.js                # Setup wizard UI (steps, colours, mini-map)
│   ├── status.js               # Cache management UI (~1,700 lines)
│   ├── pwa-register.js         # Service worker registration
│   ├── pwa-service-worker.js   # Offline caching, versioning, background sync
│   └── viewer-pwa.js           # PWA glue code for the viewer
│
├── i18n/
│   ├── it.json                 # Italian translations (default language)
│   ├── en.json                 # English
│   ├── fr.json                 # French
│   ├── es.json                 # Spanish
│   ├── template.json           # Template for adding new languages
│   └── loader.php              # PHP-side i18n loader with auto-discovery
│
├── modelli/                    # 🔒 User-managed 3D model catalog — NEVER touched by an update
│   ├── .gitkeep                # The only tracked file: models are never committed (`modelli/*` gitignored)
│   ├── catalogo.cache.json     # Auto-generated catalog cache (do not edit, gitignored)
│   ├── catalogo.cache.hash     # Folder-list hash validating the cache (gitignored)
│   └── [model_name]/
│       ├── [model_name].json   # Model metadata (name, coords, description)
│       ├── [model_name].glb    # 3D model (GLB binary)
│       └── [model_name]_social.jpg  # Social preview image
│
├── lib/
│   ├── three/                  # Three.js v0.160.0 (vendored)
│   ├── three-mesh-bvh/         # BVH raycasting for collisions (vendored)
│   ├── leaflet/                # Leaflet v1.9.4 (vendored)
│   └── fonts/                  # Poppins, latin 400/600/700 only (vendored, OFL.txt)
│
├── glb-optimizer/              # Optional Node.js tool for GLB compression
│   ├── package.json            # Its own deps (gltf-transform, obj2gltf, draco3d, sharp)
│   ├── server.js               # Express server (port 3000, `PORT` env)
│   ├── public/index.html       # Upload UI
│   ├── draco-streaming-read.js # Constant-memory Draco decode for huge GLBs
│   ├── split-large-primitives.js # Splits primitives the Draco encoder can't handle
│   ├── obj-stream-converter.js # Streaming OBJ conversion for very large files
│   └── README.md
│
├── glb-optimizer-static/       # Static HTML version (no Node.js required)
│   └── index.html
│
├── docs/
│   ├── PERSONALIZZAZIONE.md    # Step-by-step customization guide for deployers (Italian)
│   └── img/                    # Wordmark logos (dark/light) used by README.md only
├── README.md                   # End-user documentation (Italian)
├── CHANGELOG.md                # Release notes; version is APP_VERSION in config.php
├── LICENSE                     # GNU GPL v3 full text
├── THIRD_PARTY_LICENSES.md     # Licenses of the vendored libraries in lib/
└── SINOSSI.md                  # Detailed project synopsis for press/articles/infographics (Italian)
```

---

## Key Files to Understand

### `js/viewer.js` (~3,800 lines) + `js/viewer/` modules
The heart of the application. viewer.js is the entry point and still contains:
- Three.js scene/camera/renderer initialization
- GLTFLoader, OBJLoader, DRACOLoader, KTX2Loader setup
- OrbitControls (default) and PointerLockControls (first-person)
- WebXR / VR session management
- Collision detection system (raycasts accelerated by `three-mesh-bvh`)
- Section (clipping) planes on X/Y/Z axes
- Scale bar overlay
- Touch/mobile joystick controls
- Searchable model dropdown selector
- Collapsible accordion help popup (Desktop/Mobile/VR tabs)

Extracted ES6 modules live in `js/viewer/` (imported with relative paths,
no import-map changes needed):
- `utils.js` — pure helpers (`_t`, `debounce`, `showToast`, `haptic`),
  `eventManager`, `disposeThreeObject(s)`
- `dom.js` — centralized DOM element cache (named const exports)
- `loader-ui.js` — loading overlay, error state, watchdog
- `panels.js` — floating-panel / bottom-sheet framework; new panels hook in
  via `registerPanel(panel, closeFn)`
- `measure.js` — distance measurement (snap, point editing, CSV export);
  viewer state is injected via getter deps in `initMeasureUI(deps)`
- `annotations.js` — persistent POI annotations (localStorage per model
  folder, JSON export/import)
- `embed.js` — "Incorpora" tab of the share panel: builds the
  `viewer.php?…&embed=1` URL and the responsive `<iframe>` snippet; viewer
  state is injected via getter deps in `initEmbedUI(deps)`
- `pivot-orbit.js` — left-mouse drag orbits the camera around the point
  under the cursor (raycast on press, section-aware; empty space falls back
  to `controls.target`), double-click centres that point. The default
  `viewer.mouseRotation = 'trackball'` is CloudCompare's virtual trackball
  (sphere centred on the projected pivot, clamped to the central half of the
  view, centre-to-edge = 90°, no up axis): the view can roll, so it keeps
  `camera.up` equal to the camera's own up before `controls.update()`.
  Reset/preset views and `frameObjectAnimated()` blend it back with
  `blendCameraUp()`, first person and VR call `levelCamera()`, and share and
  embed links carry an optional `up=x,y,z`. `'turntable'` keeps the old
  rotation around world Y; `mouseRotateSpeed` scales either.
  A drag starts only after 4 px, and the `click` that ends it is swallowed
  (window capture) so measure/POI picking never fires on a rotation; with
  no hit and `controls.target` outside the model's box the pivot is the box
  centre. It sets
  `controls.mouseButtons.LEFT = null` so OrbitControls keeps only pan/zoom
  for the mouse (Ctrl/Shift/Cmd+left still pans). Mouse only: touch keeps
  the one-finger model rotation in `viewer.js`. `controls.zoomToCursor` is on.
- `model-loader.js` — `fetchBinaryModel(url, {onProgress, signal})`, the
  GLB/GLTF download (see "Large models on mobile" below)
- `gltf-memory.js` — `parseGltfLean(loader, buffer, path, textureLimits, …)`,
  the GLB parse without the BIN-chunk copy and with texture downscaling
- `diagnostics.js` — `checkGpuUpload()` (one explicit render + `gl.getError()`
  after each load) and the `?debug=1` overlay (`showDiagnostics()`,
  `logDiagnostic()`), for problems that only show up on phones

### Large models on mobile
A ~100 MB GLB used to make the browser tab die on phones, and only on the
first (uncached) view. Two copies of the file were alive at once: Three.js's
`FileLoader` accumulates response chunks in an array and *then* concatenates
them into one `ArrayBuffer` (2× the file), while the service worker's
`cacheFirst()` held `response.clone()` until `cache.put()` had written it to
disk (another 1×). Add the bulk offline download, which could be fetching two
other models at the same time, and the tab is over any mobile memory budget.

The viewer therefore does not call `gltfLoader.load()`. `fetchBinaryModel()`
pre-allocates a single `Uint8Array` from `Content-Length` and writes the chunks
into it, so the download peaks at 1× the file; `downloadAndParseGltf()` in
`viewer.js` then hands that buffer to `gltfLoader.parse(buffer, basePath, …)`.
Because `parse()` bypasses the `LoadingManager`, that function brackets the
load with `manager.itemStart()`/`itemEnd()` — without them `manager.onLoad()`
never fires and the loading overlay stays up forever. It also aborts the
in-flight download when the user switches model.

On the service-worker side, a model response larger than `cloneBudgetBytes()`
(never on desktop, where `navigator.deviceMemory >= 8`) is passed through
without `clone()` and remembered in `deferredModelCache`. When the page reports
`MODEL_LOAD_END`, the worker retries the copy with `cache: 'only-if-cached'`,
which is free because `.htaccess` serves GLB as `immutable` — and gives up
silently rather than downloading 100 MB twice. `MODEL_LOAD_START`/`END` also
pause the bulk offline download while the viewer is fetching, and models above
`LARGE_MODEL_BYTES` are fetched one at a time instead of two.

The download was not the whole story: most models that crashed phones did so
because of their **textures**, not their file size. An 8 MB GLB with one
8192×8192 JPEG decodes to 256 MB of RAM plus ~340 MB of GPU memory (mipmaps),
and Three.js keeps both. `js/viewer/gltf-memory.js` fixes this with a
GLTFLoader plugin that patches, on the current parser instance only:
- `loadImageSource()` — reads each embedded image's size from its header,
  plans a target size (per-model megapixel budget, then a max side; images
  never shrink below 1024 px because of the budget) and decodes straight to
  it with `createImageBitmap(blob, {resizeWidth, resizeHeight})`, falling
  back to a canvas when the resize options are ignored or unsupported.
  `textureLimits()` in `viewer.js` picks the limits: on touch/iOS/low-memory
  devices `viewer.textureMaxSizeMobile` (4096) and
  `viewer.textureBudgetMPMobile` (24), lowered further when
  `navigator.deviceMemory <= 2`; on desktop only the GPU's
  `maxTextureSize` unless `textureMaxSize`/`textureBudgetMP` are set.
- `loadBuffer()` — `GLTFLoader.parse(ArrayBuffer)` copies the whole BIN
  chunk (`data.slice()` in `GLTFBinaryExtension`); `parseGltfLean()` splits
  the GLB itself, shifts `bufferViews[].byteOffset` (and meshopt offsets) by
  the BIN chunk start and hands the loader the JSON plus the untouched file.
When a reduced decode fails on a constrained device the plugin retries at half
size and then falls back to a 1×1 grey texture — never to the full-size image,
which is what crashed the tab in the first place. A parse superseded by a model
switch (`modelLoadSeq` in `viewer.js`) skips its remaining textures and is
disposed instead of becoming `currentModel`.

On iOS a model the GPU cannot hold often does **not** lose the WebGL context:
`bufferData`/`texImage2D` fail with `GL_OUT_OF_MEMORY`, Three.js never reads
`gl.getError()`, and the scene stays black with no message.
`verifyGpuUploadLater()` in `viewer.js` renders the first frame explicitly and
reads the error once per load: on `OUT_OF_MEMORY` it reloads with
`textureReduction` doubled (textured models, up to ×4), then shows the memory
error. `viewer.php?debug=1` shows the numbers behind it on screen.

**Embedded textures should be JPEG/WebP, not PNG**: browsers can't decode a PNG
at reduced size, so an 8192² PNG costs 256 MB on every phone whatever the
limits say (via_della_zecca_1 and via_dei_consoli_1 were re-encoded for this).
This relies on r160 internals of the vendored loader: recheck it when
upgrading Three.js. Draco uses a single worker on touch devices, since each
worker's WebAssembly heap grows to the largest mesh and never shrinks.

### Phone layout
"Small screen" means `SMALL_SCREEN_QUERY` in `js/viewer/utils.js`:
`(max-width: 640px), (pointer: coarse) and (max-height: 500px)` — a phone in
landscape keeps the mobile layout, because the single-row desktop toolbar does
not fit. `css/viewer.css` uses the same query (and its complement for the
desktop/tablet rules); keep them in sync. `applyChromeLayout()` in `viewer.js`
re-runs on every change of that query, so rotating the phone moves the model
and language selectors between the top bar and the toolbar. Joystick and
touch-look use Pointer Events only (Touch Events are a fallback for browsers
without them), so the two thumbs are tracked independently.

### Embed mode (`viewer.php?embed=1`)
A reduced-chrome rendering of the viewer meant to be framed inside an
external article. The markup is unchanged — `viewer.php` only sets
`<body class="embed-mode" data-embed-ui="…">` and the `body.embed-mode`
rules at the end of `css/viewer.css` hide what does not belong in an
iframe. Keeping the DOM intact means `js/viewer/dom.js` never resolves to
`null` for an element some code path assumes exists.

URL parameters, all validated against a whitelist in `viewer.php`:
`embed=1`, `ui=<csv of EMBED_UI_TOKENS>` (default `scale,title,fs`),
`sec=<axis>,<0-100>,<0|1>` for the section plane, plus the pre-existing
`m`, `cam`, `tgt`, `lang`.

Three things are deliberately switched off in embed mode (`js/viewer.js`):
`autoGenerateSocialPreview()` (it would overwrite the model's shared
`_social.jpg` with the article's framing), the onboarding overlay, and the
`history.replaceState()` in `buildShareURL()`. The service worker scripts
are not emitted at all. The `projectRibbon()` GPL attribution stays
visible, as everywhere else.

Cross-origin framing is opt-in per response: `sendSecurityHeaders()` takes
an optional `$frameAncestors` and, when given, omits `X-Frame-Options`
(which has no working allowlist form) in favour of the CSP directive.
`embedFrameAncestors()` builds it from `security.allowedEmbedOrigins`
(empty ⇒ `*`). `.htaccess` uses `Header always setifempty` so PHP stays the
authority on that header.

When adding a new JS file under `js/viewer/`, add it to `LOCAL_ASSETS` in
`pwa-service-worker.js` and bump `CACHE_VERSION`.

### `setup.php` + `setup_lib.php` — first-run wizard
Until `custom/.installed` exists, the three HTML pages (`index.php`,
`viewer.php`, `status.php`) call `redirectToSetupIfNeeded()` — added right
after their `require_once config.php` — and send the visitor to `setup.php`.
API endpoints, `js/config.php`, `manifest.php`, `robots.php` and
`sitemap.php` are deliberately **not** gated: they must keep answering.

`config.php` owns the gate helpers: `INSTALL_MARKER`, `isInstalled()`,
`installKey()`, `parseInstallKey()`, `newInstallKey()`,
`installMarkerContent()`, `writeInstallMarker()` (atomic temp+`rename()`,
returns the key, generating one when not given), `ensureInstallKey()` and
`looksAlreadyConfigured()`. The marker is comment lines plus the key on the
last line, and `parseInstallKey()` reads the first non-empty, non-comment
line — so the key file the wizard hands the user is byte-identical to
`custom/.installed` and can be uploaded as-is (a bare-key marker written by
an older version still parses). `ensureInstallKey()` keeps the key an
installation already has instead of minting a new one on every save, so the
file the user saved stays valid. The last one keeps an
existing deployment from meeting the installer after a code update: it is
true when `custom/config.local.php` or a `custom/logo.*`/`icon-*` exists, or
when any `settings.ini` value differs from the pristine project default —
hence `$CONFIG_DEFAULTS`, a copy of `$CONFIG` taken *before* the merge with
`$CONFIG_LOCAL`. Do not use "a folder exists under `modelli/`" as a signal:
models are uploaded independently of configuration (and a demo pack may be
unzipped there), so it says nothing about whether settings were chosen.

`setup_lib.php` holds `setupFields()`, the **single source of truth** for the
wizard: each entry maps a form field to an INI section+key, a type and a
step, and drives form rendering, POST validation and the INI write alike.
Adding an option to the wizard is one line there. `renderSettingsIni()`
rewrites `custom/settings.ini` **line by line** rather than regenerating it
from a template, so the file's comments survive; a `null` value comments its
line out (the key falls back to the app default). The result is re-parsed
with `parse_ini_file()` before the atomic `rename()`, and the previous file
is copied to `settings.ini.bak`.

Once installed, `setup.php` answers `403` and renders an unlock form: the key
goes in as POST (`action=unlock`) rather than only through `?key=`, so it
stays out of the address bar and the server logs, and the file input beside
it is read by `js/setup.js` with `FileReader` — nothing is uploaded. A wrong
key answers `401` and says so. The key still matches with `hash_equals`.

Saving requires `action=save` on the POST: without that check an unlock POST
— which carries only the key — would look like a save and rewrite
`settings.ini` from an empty form (a checkbox absent from a POST legitimately
means `false`). POST is protected by the same stateless Origin/Referer check
as `save_social_preview.php`, and the logo upload reuses that file's
hardening chain (size cap, `finfo` MIME whitelist, re-encode through GD)
before writing `custom/logo.png` and purging `custom/generated/` so the PWA
icons regenerate.

The wizard's map step sets the **centre only**. The mini-map writes
`mapLat`/`mapLon` as it is panned, an address box geocodes through
OpenStreetMap's Nominatim (searched on demand, never per keystroke, with the
map's own OSM attribution covering the data), and the three zoom fields are
previewed on that same map: the focused field drives the map's zoom, and
zooming the map writes back into it. It deliberately does **not** write the
pan bounds — a rectangle a wizard talked someone into is a map that fights
its own user — so `boundsSouth/West/North/East` are absent from
`setupFields()` and stay a hand-written `[map]` choice in
`custom/settings.ini`. The one time the wizard touches them is to comment
them out: `setupConfiguredBounds()` reads the ones already configured and
`collectSetupValues()` drops them when the newly chosen centre falls outside,
which would otherwise leave the homepage bouncing against its own limits.

Validation runs twice. `validateSetupValue()` checks each field against its
declared type (including `copyright`, which enforces the GPL v3 requirement
that the text keeps naming `originalAuthor.name`), and `collectSetupValues()`
adds the cross-field rule a single field can't express: `minZoom` may not be
tighter than `defaultZoom`/`flyToZoom`. Anything rejected is dropped, the
voice falls back to its default and the done screen names it through
`setupErrorNote()`. `js/setup.js` mirrors the same rules in the browser —
messages come from `data-msg-*` on the form, so they stay translatable — and
blocks "Avanti"/submit instead of letting the user find out afterwards.
Fields carrying `'prefill' => 'custom'` (the `[texts]` ones) are prefilled
only from `configCustom()`: offering the app default would write it into the
INI as a chosen value, and a UI text set there wins over every translation.

`css/setup.css` declares the full `:root` palette itself: the wizard runs
before an installation exists, so it never loads `js/config.php`. `setup.php`
is intentionally **absent** from `LOCAL_ASSETS` in the service worker — it
must never be served from cache.

### `config.php` (Backend) + `js/config.php` (Frontend)
`config.php` is the **single source of truth** for shared settings (branding,
theme colors, PWA, paths, default language). `js/config.php` is a PHP script
served with a `application/javascript` content type: it reads the shared values
directly from `config.php` and serializes them into `window.APP_CONFIG`, then
adds the purely frontend settings (3D viewer parameters, map config, full CSS
theme) statically. In practice you change *default* branding/theme/paths in
`config.php` (versioned, always safe to overwrite); a deployment's actual
customizations belong in `custom/config.local.php` (gitignored, never
touched by an update — see "Configuration Reference" below), and you change
viewer/map/CSS-theme defaults in `js/config.php`.

### `i18n/loader.php` + `js/i18n.js` + `js/lang-selector.js`
Two-layer i18n: PHP loads translations server-side into PHP variables; `js/i18n.js`
provides a `_t(key, fallback)` client-side fallback. Keys follow dot notation:
`"section.subsection.key"`. The active language is resolved in `i18n/loader.php`
in this order: `?lang=` query param (whitelisted, then persisted in a `lang`
cookie for 1 year) → `lang` cookie → `language.default` from `config.php`. There
is no `Accept-Language` browser auto-detection. `js/lang-selector.js` only drives
the open/close of the language dropdown rendered server-side; the actual switch
happens via `?lang=XX` links. Each `i18n/[lang].json` declares its own `langName`
and `langFlag` used to populate the selector.

For UI strings a deployment may want to rewrite (page title, subtitle, sidebar
heading, viewer title/description) use `uiText('texts.key', 'i18n.key',
'fallback')` instead of `__t()`. It resolves in this order: value set in
`custom/config.local.php` → translation from `i18n/[lang].json` → default from
`config.php` → fallback. A local override can be a plain string or a
`['it' => …, 'en' => …]` map, and every result goes through `formatText()`,
which substitutes `{organization}`, `{app}` and `{year}`. ("Set locally"
means `configCustom()`, i.e. `custom/settings.ini` merged with
`custom/config.local.php`.)

### `api/catalogo.php`
Auto-discovers model folders (under `config('paths.modelsFolder')`, default `modelli/`) and returns JSON catalog. It reads each folder's `.json` metadata file. The `catalogo.cache.json` is regenerated automatically — never edit it manually. Lives in `api/` (not `modelli/`) so it updates like any other code file, while `modelli/` stays pure user data.

### `custom/settings.ini` + `custom/config.local.php`
Two override files loaded by `config.php` on top of its defaults via
`array_replace_recursive()`. `settings.ini` is the preferred one: it holds
**only values, no code**, so a typo can never break the site (`loadSettingsIni()`
swallows parse errors, ignores unknown sections and drops empty values). Unlike
`config.local.php` (optional, gitignored), `settings.ini` ships **tracked** in
the repo with working defaults already active — a fresh clone/fork is usable
out of the box, and a deployment just edits the values in place with its own
group's information. `custom/settings.example.ini` stays as the tracked,
fully-commented reference documenting every available option.
`config.local.php` is the advanced escape hatch and wins over `settings.ini`.
`originalAuthor` can be set from neither (GPL requirement).

Allowed `settings.ini` sections are listed in the `SETTINGS_SECTIONS` constant:
`branding`, `texts`, `theme`, `pwa`, `paths`, `language`, `security`, `viewer`,
`map`, `social`. The first seven are consumed by PHP; `viewer`, `map`, `social`
and the CSS-variable half of `theme` are frontend-only and get applied by
`js/config.php` (see below). INI files have no nested arrays, so map bounds are
expressed as `boundsSouth`/`boundsWest`/`boundsNorth`/`boundsEast` and
recombined into `map.bounds` in `js/config.php`.

The merged override array is kept in `$CONFIG_LOCAL` and readable via
`configCustom('section.key')`, so UI text resolution can tell "the user set
this" from "this is an app default" (see `uiText()` below).

### Branding assets (`brandingAsset()`, `logoPath()`, `iconPath()`, `assetUrl()` in `config.php`)
`img/` holds the **project defaults** (app code, safe to overwrite); `custom/`
holds the **deployment's own** files and always wins. `brandingAsset()` resolves
an asset in this order, checking the filesystem at every step:

1. path the user set explicitly (`configCustom('pwa.logo')`), if the file exists;
2. `custom/` glob (`custom/logo.png|jpg|jpeg|svg|webp`, `custom/icon-<size>.*`);
3. the app default from `$CONFIG` (`img/logo.png`, `img/icon-<size>.png`);
4. `img/` glob;
5. `''` — no asset.

`logoPath()` uses this order as-is. `iconPath(int $size)` needs one extra step
that `brandingAsset()`'s fixed order can't express, so it implements its own
sequence with the same primitives (`configCustom()`, `assetExists()`,
`firstExistingAsset()`, `config()`) instead of delegating: explicit path →
`custom/icon-<size>.*` → **`generatedIconPath($size)`** → `img/icon-<size>.png`
default → other `img/` formats → `''`. `generatedIconPath()` and its helper
`generateSquareIconFile()` let a deployment ship a **single logo file** and get
correct PWA icons for free: when no dedicated `custom/icon-192.*`/`icon-512.*`
exists, they use PHP GD (already a prerequisite; same procedural style as
`generate_social_preview.php`) to resize `logoPath()`'s image in "contain" (no
cropping), center it on a transparent canvas (or the color from the optional
`pwa.iconBackground` hex config key), and write it atomically (temp file +
`rename()`) to `custom/generated/icon-<size>.png`, gitignored. The generated
file is cached and only regenerated when the source logo's `filemtime()` —
or that of `custom/settings.ini`/`config.local.php`, where `pwa.iconBackground`
comes from — is newer: same mtime-comparison pattern `logoWebpPath()` uses. If GD is
unavailable or the logo is a format GD can't decode (e.g. SVG),
`generatedIconPath()` returns `''` and `iconPath()` falls through to the
`img/` default icons, same graceful-empty-string contract as everywhere else. A
dedicated `custom/icon-<size>.*` file always wins over generation.

So dropping `custom/logo.png` overrides the default with zero configuration, and
a typo'd explicit path degrades to the next candidate instead of a broken image.
`logoPicture()` returns `''` when nothing is found and every call site skips the
whole wrapper (same for the `<link rel="icon">` tags in `index.php`/`status.php`).
`logoWebpPath()` picks the WebP **sibling** of the resolved logo (same directory
and basename) unless the user set one explicitly, and drops it when it is older
than the main logo — an `img/logo.webp` can never shadow a `custom/logo.jpg`.
Every branding URL goes through `assetUrl()`, which appends `?v=<filemtime>` so a
replaced logo defeats the one-year `.htaccess` cache and the SW precache.

Branding text follows the same split: `config.php` defaults describe the
**project** (`organizationName` = `3DCaveViewer`, `organizationUrl` =
`https://www.3dcaveviewer.com/`), and a deployment overrides them in
`custom/settings.ini`. The screenshot watermark (`js/viewer.js`) and the
generated social preview (`generate_social_preview.php`) read those same
values — no brand name is hardcoded in app code.

---

## Naming Conventions

| Context | Convention | Example |
|---|---|---|
| Model folder names | `snake_case` | `via_reposati/` |
| PHP files | `snake_case.php` | `generate_social_preview.php` |
| JavaScript files | `kebab-case.js` | `pwa-service-worker.js` |
| CSS classes | `kebab-case` | `.control-panel`, `.scale-bar` |
| HTML element IDs | `kebab-case` | `#viewer-container`, `#help-panel` |
| i18n keys | `section.key` | `"viewer.resetView"`, `"map.title"` |
| Config keys | camelCase inside objects | `fpBaseSpeed`, `themeColor` |
| PHP config access | `config('section.key')` helper | `config('branding.appName')` |

---

## Code Conventions

### PHP
- Always start files with `declare(strict_types=1);`
- Use the `e()` helper for HTML output escaping (wraps `htmlspecialchars`)
- Use the `__t(key)` helper for server-side translations
- Validate all URL/GET params with regex or whitelist before use
- Return JSON from API endpoints with `Content-Type: application/json`
- Set HTTP status codes explicitly (`http_response_code(404)` etc.)

### JavaScript
- ES6 modules with `import` statements (viewer.js uses import maps defined in PHP)
- Global app config exposed as `window.APP_CONFIG` (set by `js/config.php`)
- Translation function: `_t('key', 'fallback string')`
- Three.js objects follow the setup→load→animate loop pattern
- DOM selectors are cached in variables at initialization, not queried repeatedly
- Touch events and mouse events handled separately with unified logic

### CSS
- CSS custom properties (variables) are injected by `js/config.php` from `APP_CONFIG.theme`
- All primary colors must come from CSS variables, not hardcoded hex values
- Use `rem` for font sizes, `px` is acceptable for borders/shadows
- Phone layout in `css/viewer.css` uses `SMALL_SCREEN_QUERY` —
  `(max-width: 640px), (pointer: coarse) and (max-height: 500px)` — and its
  complement for desktop/tablet (see "Phone layout"); the other stylesheets
  use plain width breakpoints (mostly 640/480 px, 768 px in `status.css`,
  800 px in `index.css`, 600 px in `setup.css`)

---

## i18n — Adding a New Language

1. Copy `i18n/template.json` to `i18n/[lang_code].json` (e.g., `de.json`)
2. Translate all values (keep keys unchanged)
3. Add `langName` and `langFlag` keys to the new JSON so it appears in the in-UI language selector
4. The loader (`i18n/loader.php`) auto-discovers JSON files in the `i18n/` folder — no config changes needed
5. To change the *default* language, update `language.default` in `config.php` (it propagates to the frontend through `js/config.php`). Users can still switch language at runtime via the in-UI selector (persisted in the `lang` cookie).

---

## Adding a New 3D Model

1. Create a folder: `modelli/[model_name]/`
2. Add the GLB file: `modelli/[model_name]/[model_name].glb`
3. Add metadata JSON: `modelli/[model_name]/[model_name].json`
   ```json
   {
     "name": "Display Name",
     "folder": "model_folder_name",
     "file": "model_folder_name.glb",
     "lat": 43.1234,
     "lon": 12.5678,
     "description": "Description text",
     "rotation": { "x": 0, "y": 0, "z": 0 }
   }
   ```
   `name` is required; `folder` is overwritten with the real folder name by
   `api/catalogo.php`, `rotation` is optional.
4. Optionally add social preview: `modelli/[model_name]/[model_name]_social.jpg`
5. Nothing else: the cache is rebuilt when a metadata file is newer than it or
   the folder list changes (`catalogo.cache.hash`). Deleting
   `modelli/catalogo.cache.json` forces it.

---

## Configuration Reference

### `config.php` — Backend Settings

```php
$CONFIG = [
    'branding' => [
        'appName'          => '...',   // Full app title
        'appShortName'     => '...',   // PWA short name
        'organizationName' => '...',   // Shown in footer
        'organizationUrl'  => '...',   // Org website link
        'contactEmail'     => '...',
        'copyrightHolder'  => '...',
        'appDescription'   => '...',
    ],
    'theme' => [
        'themeColor'        => '#0b0d10',   // Browser chrome / PWA
        'pwaBackgroundColor'=> '#0f1b2a',
    ],
    'pwa' => [
        'icon192'  => 'img/icon-192.png',  // project defaults; custom/ files
        'icon512'  => 'img/icon-512.png',  // are auto-detected and always win
        'logo'     => 'img/logo.png',      // (see brandingAsset())
        'logoWebp' => '',                  // '' = look for a .webp sibling of the resolved logo
        // 'iconBackground' => '#rrggbb',  // optional, background of generated icons
    ],
    'paths' => [
        'modelsFolder' => 'modelli',
    ],
    'texts' => [                   // read through uiText(); support {organization}/{app}/{year}
        'pageTitle'    => '...',   // Homepage title
        'pageSubtitle' => '...',   // Homepage subtitle
        'sidebarTitle' => '...',   // Sidebar heading
        'viewerDefaultTitle'       => '...',
        'viewerDefaultDescription' => '...',
    ],
    'security' => [
        'extraConnectSrc'     => [],  // extra hosts for the viewer CSP connect-src
        'allowedEmbedOrigins' => [],  // frame-ancestors for ?embed=1; empty ⇒ '*'
    ],
    'language' => [
        'default'   => 'it',      // ISO 639-1 code
    ],
];
```

### `custom/settings.ini` — Per-Deployment Overrides (preferred)

Tracked, values-only file, shipped with working defaults already active —
edit it in place with your own group's information. Parsed with
`parse_ini_file($file, true, INI_SCANNER_TYPED)` and merged on top of
`$CONFIG` with `array_replace_recursive()`. `custom/settings.example.ini` is
the fully-commented reference documenting every available option (including
ones not part of the shipped defaults).

```ini
[branding]
appName = "Le grotte del mio gruppo"        ; strings quoted

[texts]
pageTitle[it] = "Mappa delle grotte"        ; per-language variant
pageTitle[en] = "Cave map"

[theme]
accentColor = "#ff8800"

[map]
center[] = 43.351726                        ; numbers/booleans unquoted
center[] = 12.579768
defaultZoom = 15
boundsSouth = 42.35                          ; optional, off by default:
boundsWest = 11.85                           ; INI has no nested arrays, so
boundsNorth = 43.80                          ; the four sides become
boundsEast = 13.35                           ; map.bounds in js/config.php

[viewer]
fpBaseSpeed = 1.6
skyDomeEnabled = false
```

Unknown sections, unknown-shaped values and empty values are dropped;
a syntax error is logged and the whole file ignored (the app keeps its
defaults instead of failing).

### `custom/config.local.php` — Advanced Overrides

Optional, gitignored PHP file loaded by `config.php` if present and merged
over `settings.ini` (so it wins), then over `$CONFIG` with
`array_replace_recursive()`. Copy `custom/config.local.example.php` to get
started. Only needed for computed values or structures INI can't express.
`originalAuthor` is stripped from the override before merging and can never
be changed here (GPL v3 attribution requirement).

Both files are the only places a deployment's customizations should live,
since they're the config files an update never overwrites.

### `js/config.php` — Frontend Settings (shared values read from `config.php`)

Frontend-only defaults stay written statically in this file. User overrides for
`theme`, `viewer`, `map`, `social` and `texts` are read from `$CONFIG_LOCAL`,
serialized into `$frontendOverrides` and applied to the emitted `CONFIG` object
by the `applyOverrides()` deep-merge at the bottom of the generated JS — so a
deployment never has to edit this file.

Key viewer-specific settings (defined statically in `js/config.php`):
```javascript
viewer: {
    fpBaseSpeed:        1.2,    // First-person walk speed (units/s)
    fpBoostMultiplier:  3.0,    // Speed multiplier when Shift held
    lookSensitivity:    0.004,  // Touch look sensitivity (mobile)
    collisionPadding:   0.05,   // Collision detection margin (units)
    vrMoveSpeed:        2.0,    // VR locomotion speed
    vrYawSpeed:         1.8,    // VR rotation speed
    vrDeadZone:         0.15,   // VR stick dead zone
    scaleBarWidth:      150,    // Scale bar pixel width
    defaultNear:        0.1,    // Camera near plane
    defaultFar:         2000,   // Camera far plane
    skyDomeEnabled:     true,
    pixelRatioMaxMobile: 1.5,   // DPR cap on touch devices
    textureMaxSizeMobile: 4096, // see "Large models on mobile"
    textureBudgetMPMobile: 24,
    textureMaxSize:     0,      // desktop: 0 = GPU limit only
    textureBudgetMP:    0,
}
```

Map settings:
```javascript
map: {
    center:      [43.351726, 12.579768],  // Default map center [lat, lon]
    defaultZoom: 16,
    minZoom:     8,
    maxZoom:     19,                      // OSM has no tiles above 19
    flyToZoom:   17,
    bounds:      null,                    // Max pan bounds, none by default
    tileUrl:     'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
}
```

---

## Development Workflow

### Prerequisites
- PHP 7.4+ with GD extension (used for social preview images and for
  auto-generating square PWA icons from a single logo, see `iconPath()`)
- Apache with `mod_rewrite` enabled
- HTTPS (required for PWA and Service Workers)
- Node.js (optional, for GLB optimization tool)

### Local Setup
1. Clone the repository
2. Serve via Apache (PHP built-in server works for most features)
3. Install Node dependencies (optional, only for the GLB optimizer — there
   is no root `package.json`):
   ```bash
   cd glb-optimizer && npm install && npm start  # Optimizer server (Node ≥ 22)
   ```
4. No build step needed — edit PHP/JS/CSS directly

### Deployment
- Upload all files to a PHP-capable HTTPS server
- Ensure `.htaccess` is applied (Apache `AllowOverride All`)
- First visit generates `modelli/catalogo.cache.json` automatically

### GLB Optimization
Two options available:
- **Node.js server** (`glb-optimizer/`): Upload GLB files via browser UI at `localhost:3000`
- **Static tool** (`glb-optimizer-static/index.html`): Single HTML file, runs entirely in browser

---

## Security Practices

The `.htaccess` enforces:
- Directory listing disabled
- Sensitive file access blocked (`*.log|bak|cache|hash|old|swp|tmp|ini`, every
  dotfile such as `.git`, `.env`, `custom/.installed` — `.well-known/` excepted)
- Security headers (fallback; PHP's `sendSecurityHeaders()` sets the CSP):
  `X-Frame-Options` (`setifempty`), `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS on HTTPS
- Suspicious user-agent blocking
- SQL injection / path traversal pattern blocking

In PHP code:
- All user inputs validated with whitelist or regex before use
- All output HTML-escaped via `e()` / `htmlspecialchars()`
- API endpoints return structured JSON errors, not raw PHP errors

---

## PWA & Service Worker

The service worker (`js/pwa-service-worker.js`) uses a **cache-first with network fallback** strategy. Key behaviors:
- Assets versioned via a `CACHE_VERSION` constant at the top of the file — increment this when deploying breaking changes
- Static shell cached on install; dynamic resources (models, catalog) cached on first fetch
- `status.php` provides a dashboard to inspect and clear cached assets
- `offline.html` is the fallback when network and cache both fail
- Map tiles: only the homepage's **standard view** (configured centre and
  zoom, plus a one-tile margin) is kept offline. `js/index.js` computes those
  tile URLs right after `setView()` and posts `CACHE_MAP_TILES`; the worker
  fetches them in CORS mode into the separate `pwa-map-tiles` cache (not
  prefixed `pwa-offline-`, so migrations leave it alone), drops tiles no longer
  in the set and refreshes them after 30 days. Tiles seen while panning or
  zooming are never cached: as opaque responses they cost ~7 MB of quota each
  in Chrome, and OSM's tile policy forbids bulk downloads.

When adding new static assets (CSS/JS files), add them to the `LOCAL_ASSETS` list in `pwa-service-worker.js`. Branding assets (logo + PWA icons) are *not* listed there: the service worker `importScripts('./config.php')` at startup and appends the configured paths, so a deployment that renames its logo in `custom/config.local.php` still gets it precached (with the `img/…` project defaults, `DEFAULT_BRANDING_ASSETS`, as fallback if the import fails).

---

## No Automated Tests

There are currently no automated tests in this project, and no CI (`.github/`
holds only `FUNDING.yml`). Manual verification is performed via:
- The browser's DevTools console (check for errors)
- `status.php` for PWA cache inspection
- Direct navigation to `viewer.php?m=[folder]` with various model folders
- Testing VR mode requires a WebXR-compatible browser/device

If adding tests in the future, consider:
- PHPUnit for `catalogo.php`, `loader.php`, and other PHP utilities
- Playwright or Puppeteer for end-to-end viewer testing

---

## GPL v3 Attribution Requirements

This project is licensed under **GNU GPL v3**. When forking or redistributing:
- The `originalAuthor` block in both `config.php` and `js/config.php` **must not be removed or altered**
- The footer attribution to Davide Brugnoni must remain visible in the UI
- The "Powered by 3DCaveViewer" footer badge (`projectRibbon()` in `config.php`, rendered on `index.php`, `viewer.php` and `status.php`) links back to the upstream project and is **not** overridable from `custom/config.local.php`
- Derivative works must also be released under GPL v3

The `originalAuthor` config keys exist specifically to enforce this — do not delete them.

---

## Versioning

`APP_VERSION` in `config.php` (Semantic Versioning) is shown in `status.php`.
Bump it together with a `CHANGELOG.md` entry and a matching git tag
(`vX.Y.Z`) on every release. It is independent from `CACHE_VERSION`, which
only invalidates the service-worker caches.

---

## Common Pitfalls

1. **Editing `catalogo.cache.json`** — This is auto-generated. Delete it to force refresh, never edit by hand.
2. **Modifying vendored libraries** — Do not edit files in `lib/`. Update them by replacing the entire vendor directory when upgrading.
3. **Hardcoding colors** — Always use CSS variables (defined via `js/config.php`) instead of hex values in CSS.
4. **Wrong config file** — Shared settings (branding/theme/paths/default language) live only in `config.php`; `js/config.php` reads them automatically. Only viewer/map/CSS-theme *defaults* are edited directly in `js/config.php`; a deployment overrides them from `custom/settings.ini`, never by editing app code.
5. **Service worker caching** — After adding new static files, update `CACHE_VERSION` in `pwa-service-worker.js` to invalidate old caches.
   `js/config.php` is served `Cache-Control: no-cache` (revalidate, not "don't store") so a settings change is visible immediately; its `Last-Modified` already accounts for `custom/settings.ini`, so the usual response is an empty 304.
6. **PHP strict types** — All PHP files must include `declare(strict_types=1);` at the top.
7. **VR controls** — WebXR requires HTTPS even on localhost; use a secure local dev setup.
8. **Breaking the update contract** — Only `modelli/` and `custom/` are user data (inside `custom/`, only `settings.ini`, the two `*.example.*` templates and `README.md` are tracked by git — everyone else's edits to it live in that same tracked file, so treat it like user data, not app code, when updating); everything else, `img/` included, must stay safe to overwrite wholesale when updating to a new version. Never add app code inside `modelli/` (that's why `catalogo.php`/`catalogo_assets.php` live in `api/`) or user-editable defaults inside `css/`/`config.php` (that's why logo/icons live in `custom/` and per-deployment overrides live in `custom/config.local.php`).
