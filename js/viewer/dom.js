// 3D Cave Viewer — cache centralizzata degli elementi DOM del viewer.
// Tutti i riferimenti sono risolti una sola volta al caricamento del modulo.

// UI — Searchable model selector
export const modelSelectorWrapper  = document.getElementById('model-selector-wrapper');
export const modelSelectorToggle   = document.getElementById('model-selector-toggle');
export const modelSelectorLabel    = document.getElementById('model-selector-label');
export const modelSelectorDropdown = document.getElementById('model-selector-dropdown');
export const modelSelectorSearch   = document.getElementById('model-selector-search');
export const modelSelectorList     = document.getElementById('model-selector-list');
export const modelSelectorEmpty    = document.getElementById('model-selector-empty');

export const resetViewBtn     = document.getElementById('reset-view');
export const autoRotateToggle = document.getElementById('auto-rotate-toggle');
export const enterFPToggle    = document.getElementById('enter-fp-toggle');
export const infoOpenBtn      = document.getElementById('info-open');
export const helpOpenBtn      = document.getElementById('help-open');
export const menuToggle       = document.getElementById('menu-toggle');
export const controlsContainer = document.getElementById('controls-container');

// Viste panel (floating)
export const viewsToggle      = document.getElementById('views-toggle');
export const viewsPanel       = document.getElementById('views-panel');
export const viewsPanelHeader = document.getElementById('views-panel-header');
export const viewsPanelClose  = document.getElementById('views-panel-close');
export const shareBtn         = document.getElementById('share-link');
export const screenshotBtn    = document.getElementById('screenshot-btn');

// Pannello di condivisione: schede "Link" / "Incorpora"
export const shareTabs       = document.getElementById('share-tabs');
export const shareTabSocial  = document.getElementById('share-tab-social');
export const shareTabEmbed   = document.getElementById('share-tab-embed');
export const sharePaneSocial = document.getElementById('share-pane-social');
export const sharePaneEmbed  = document.getElementById('share-pane-embed');

// Generatore del codice da incorporare
export const embedOptView    = document.getElementById('embed-opt-view');
export const embedOptSection = document.getElementById('embed-opt-section');
export const embedOptRatio   = document.getElementById('embed-opt-ratio');
export const embedToolInputs = Array.from(document.querySelectorAll('[data-embed-tool]'));
export const embedCode       = document.getElementById('embed-code');
export const embedCopyBtn    = document.getElementById('embed-copy');
export const embedPreviewLink = document.getElementById('embed-preview');

// Barra della modalità incorporata (presente solo con ?embed=1)
export const embedFullscreenBtn = document.getElementById('embed-fullscreen');

// Section panel (floating)
export const sectionToggle      = document.getElementById('section-toggle');
export const sectionPanel       = document.getElementById('section-panel');
export const sectionPanelHeader = document.getElementById('section-panel-header');
export const sectionPanelClose  = document.getElementById('section-panel-close');
export const sectionEnableInput = document.getElementById('section-enable');
export const sectionSlider      = document.getElementById('section-slider');
export const sectionValue       = document.getElementById('section-value');
export const sectionAxisButtons = Array.from(document.querySelectorAll('[data-section-axis]'));
export const sectionInvertBtn   = document.getElementById('section-invert');

// Misurazione UI
export const measureEnableInput   = document.getElementById('measure-enable');
export const measureClearBtn      = document.getElementById('measure-clear');
export const measureListContainer = document.getElementById('measure-list');
export const measureHintText      = document.getElementById('measure-hint-text');
export const measurePanel         = document.getElementById('measure-panel');
export const measurePanelHeader   = document.getElementById('measure-panel-header');
export const measurePanelClose    = document.getElementById('measure-panel-close');
export const measureAddBtn        = document.getElementById('measure-add-btn');

// Pannelli mobile (backdrop + mini-bar)
export const panelBackdrop        = document.getElementById('panel-backdrop');
export const panelMiniBar         = document.getElementById('panel-mini-bar');
export const panelMiniIcon        = document.getElementById('panel-mini-icon');
export const panelMiniLabel       = document.getElementById('panel-mini-label');
export const measurePanelMinimize = document.getElementById('measure-panel-minimize');
export const sectionPanelMinimize = document.getElementById('section-panel-minimize');
export const viewsPanelMinimize   = document.getElementById('views-panel-minimize');

// POI / annotazioni
export const poiToggle        = document.getElementById('poi-toggle');
export const poiPanel         = document.getElementById('poi-panel');
export const poiPanelHeader   = document.getElementById('poi-panel-header');
export const poiPanelClose    = document.getElementById('poi-panel-close');
export const poiPanelMinimize = document.getElementById('poi-panel-minimize');
export const poiAddBtn        = document.getElementById('poi-add-btn');
export const poiHintText      = document.getElementById('poi-hint-text');
export const poiList          = document.getElementById('poi-list');
export const poiExportBtn     = document.getElementById('poi-export');
export const poiImportBtn     = document.getElementById('poi-import');
export const poiImportFile    = document.getElementById('poi-import-file');

// Scale bar
export const scaleBarEl   = document.querySelector('#scalebar .bar');
export const scaleLabelEl = document.querySelector('#scalebar .label');

// Loader overlay
export const overlay             = document.getElementById('loader-overlay');
export const overlayFill         = overlay.querySelector('.fill');
export const overlayPct          = overlay.querySelector('.percent');
export const overlayName         = overlay.querySelector('.model-name');
export const overlayStatusText   = overlay.querySelector('.status-text');
export const overlayStatusIcon   = overlay.querySelector('.status-icon');
export const overlayFileSize     = overlay.querySelector('.file-size');
export const overlayErrorMessage = document.getElementById('loader-error-message');
export const loaderErrorBox      = document.getElementById('loader-error');
export const loaderRetryBtn      = document.getElementById('loader-retry');

// Overlay vari
export const crosshair  = document.getElementById('crosshair');
export const vrVignette = document.getElementById('vr-vignette');
export const armHint    = document.getElementById('fp-arm-hint');
export const toast      = document.getElementById('toast');

// Info overlay
export const infoOverlay  = document.getElementById('info-overlay');
export const infoTitle    = document.getElementById('info-title');
export const infoCoords   = document.getElementById('info-coords');
export const infoDesc     = document.getElementById('info-description');
export const infoCloseBtn = document.getElementById('info-close');

// Help
export const helpOverlay  = document.getElementById('help-overlay');
export const helpSubtitle = document.getElementById('help-subtitle');
export const helpContent  = document.getElementById('help-content');
export const helpCloseBtn = document.getElementById('help-close');
export const helpDontShow = document.getElementById('help-dontshow');

// Onboarding
export const onboard      = document.getElementById('onboard');
export const onboardClose = document.getElementById('onboard-close');
export const onboardDont  = document.getElementById('onboard-dontshow');
export const coachBubble  = document.getElementById('coach-bubble');

// Joystick (mobile FP)
export const joystick = document.getElementById('joystick');
export const stickEl  = joystick ? joystick.querySelector('.stick') : null;
