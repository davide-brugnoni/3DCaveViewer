// 3D Cave Viewer — generatore del codice HTML per incorporare un modello
// in una pagina esterna (es. un articolo WordPress).
//
// Produce un iframe verso viewer.php?…&embed=1, dove il visualizzatore parte
// con un'interfaccia ridotta: si racconta un punto preciso della grotta o una
// porzione di rilievo dentro l'articolo, e il lettore ha comunque un pulsante
// per aprire il visualizzatore completo.
//
// Come measure.js e annotations.js, lo stato del viewer arriva per iniezione
// (initEmbedUI(deps)) tramite getter, così il modulo non dipende dall'ordine
// di inizializzazione di viewer.js.

import { _t, showToast, eventManager } from './utils.js';
import {
  shareTabs, shareTabSocial, shareTabEmbed, sharePaneSocial, sharePaneEmbed,
  embedOptView, embedOptSection, embedOptRatio, embedToolInputs,
  embedCode, embedCopyBtn, embedPreviewLink
} from './dom.js';

// Dipendenze dallo stato del viewer (impostate da initEmbedUI)
let deps = null;

/**
 * Token dell'interfaccia ridotta accettati da viewer.php (?ui=...).
 * L'ordine qui decide l'ordine nel parametro: URL stabile a parità di scelte,
 * così ri-generare lo stesso embed non produce uno snippet diverso.
 */
const UI_TOKEN_ORDER = ['scale', 'title', 'fs', 'info', 'measure', 'sections', 'screenshot', 'lang', 'pov'];

// Larghezza massima dell'iframe nell'articolo (px)
const EMBED_MAX_WIDTH = 960;

/** Formatta un Vector3 come "x,y,z" con due decimali, come buildShareURL(). */
function fmtVec(v) {
  return [v.x, v.y, v.z].map((n) => n.toFixed(2)).join(',');
}

/** Token UI selezionati nel pannello, nell'ordine canonico. */
function selectedUiTokens() {
  const checked = new Set(
    embedToolInputs.filter((input) => input.checked).map((input) => input.dataset.embedTool)
  );
  return UI_TOKEN_ORDER.filter((token) => checked.has(token));
}

/** URL della pagina incorporata, o '' se non c'è un modello caricato. */
function buildEmbedURL() {
  const folder = deps?.getModelFolder?.() || '';
  if (!folder) return '';

  const base = location.origin + location.pathname;
  // Costruito a mano invece che con URLSearchParams: le virgole di cam/tgt/sec
  // sono legali in una query e lasciarle leggibili rende lo snippet molto più
  // comprensibile per chi lo incolla nell'articolo.
  const parts = [`m=${encodeURIComponent(folder)}`, 'embed=1'];

  const lang = deps?.getLang?.() || '';
  // Il cookie 'lang' è SameSite=Lax e non arriva in un iframe di terzi:
  // la lingua va scritta nell'URL, altrimenti l'embed torna al default.
  if (lang) parts.push(`lang=${encodeURIComponent(lang)}`);

  if (embedOptView?.checked) {
    const camera = deps?.getCamera?.();
    const target = deps?.getShareTarget?.();
    if (camera && target) {
      parts.push(`cam=${fmtVec(camera.position)}`, `tgt=${fmtVec(target)}`);
    }
  }

  if (embedOptSection?.checked) {
    const section = deps?.getSectionState?.();
    if (section?.enabled) {
      const pos = Math.round(section.pos);
      parts.push(`sec=${section.axis},${pos},${section.invert ? 1 : 0}`);
    }
  }

  const tokens = selectedUiTokens();
  // ui= vuoto è diverso da ui assente (che significherebbe "usa il default"):
  // 'none' non è un token valido, quindi la whitelist lo scarta e non resta
  // acceso nulla — esattamente ciò che l'utente ha chiesto togliendo tutto.
  parts.push(`ui=${tokens.length ? tokens.join(',') : 'none'}`);

  return `${base}?${parts.join('&')}`;
}

/** Escape per un valore che finisce dentro un attributo HTML dello snippet. */
function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Snippet completo da incollare nell'articolo. */
function buildSnippet(url) {
  if (!url) return '';
  // I nomi arrivano dal JSON del modello, dove capita di trovare spazi in coda
  const modelName = (deps?.getModelName?.() || '').trim();
  const ratio = embedOptRatio?.value || '16/9';
  const title = modelName
    ? `${modelName} — ${_t('embed.model3d', '3D')}`
    : _t('embed.openFull', 'Apri nel visualizzatore');
  const comment = modelName ? `<!-- 3DCaveViewer — ${escapeAttr(modelName)} -->\n` : '';

  return `${comment}<div style="position:relative;width:100%;max-width:${EMBED_MAX_WIDTH}px;margin:1.5rem auto;aspect-ratio:${ratio};">
  <iframe src="${escapeAttr(url)}"
          style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:8px;"
          title="${escapeAttr(title)}"
          loading="lazy" allowfullscreen allow="fullscreen"
          referrerpolicy="strict-origin-when-cross-origin"></iframe>
</div>`;
}

/**
 * Ricalcola URL, snippet e stato dei controlli.
 * Chiamata all'apertura del pannello e a ogni modifica delle opzioni.
 */
export function refreshEmbedCode() {
  if (!embedCode) return;

  // La sezione si può includere solo se ce n'è una attiva sul modello
  const section = deps?.getSectionState?.();
  if (embedOptSection) {
    const available = !!section?.enabled;
    embedOptSection.disabled = !available;
    if (!available) embedOptSection.checked = false;
    const row = embedOptSection.closest('.embed-check');
    if (row) {
      row.classList.toggle('disabled', !available);
      row.title = available ? '' : _t('embed.sectionUnavailable', 'Attiva una sezione per poterla includere');
    }
  }

  const url = buildEmbedURL();
  if (!url) {
    embedCode.value = '';
    embedCode.placeholder = _t('embed.noModel', 'Seleziona un modello per generare il codice');
    if (embedCopyBtn) embedCopyBtn.disabled = true;
    if (embedPreviewLink) {
      embedPreviewLink.setAttribute('aria-disabled', 'true');
      embedPreviewLink.removeAttribute('href');
    }
    return;
  }

  embedCode.value = buildSnippet(url);
  if (embedCopyBtn) embedCopyBtn.disabled = false;
  if (embedPreviewLink) {
    embedPreviewLink.removeAttribute('aria-disabled');
    embedPreviewLink.href = url;
  }
}

/** Passa da una scheda all'altra del pannello di condivisione. */
function selectTab(tab) {
  const isEmbedTab = tab === 'embed';
  if (shareTabSocial) {
    shareTabSocial.classList.toggle('active', !isEmbedTab);
    shareTabSocial.setAttribute('aria-selected', String(!isEmbedTab));
  }
  if (shareTabEmbed) {
    shareTabEmbed.classList.toggle('active', isEmbedTab);
    shareTabEmbed.setAttribute('aria-selected', String(isEmbedTab));
  }
  if (sharePaneSocial) sharePaneSocial.hidden = isEmbedTab;
  if (sharePaneEmbed) sharePaneEmbed.hidden = !isEmbedTab;
  // La scheda "Incorpora" è molto più alta di quella dei link social
  document.body.classList.toggle('share-embed-open', isEmbedTab);
  if (isEmbedTab) refreshEmbedCode();
}

/** Riporta il pannello alla scheda dei link: è la vista di partenza attesa. */
export function resetShareTabs() {
  selectTab('social');
}

/** Copia lo snippet negli appunti, con fallback per i browser più vecchi. */
async function copySnippet() {
  if (!embedCode || !embedCode.value) return;
  const copied = () => showToast(_t('embed.copied', 'Codice copiato'), 2000);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(embedCode.value);
      copied();
      return;
    }
  } catch (err) {
    // Permesso negato o contesto non sicuro: si prova il fallback
  }

  try {
    embedCode.removeAttribute('readonly');
    embedCode.select();
    embedCode.setSelectionRange(0, embedCode.value.length);
    const ok = document.execCommand('copy');
    embedCode.setAttribute('readonly', 'readonly');
    if (ok) {
      copied();
      return;
    }
  } catch (err) {
    embedCode.setAttribute('readonly', 'readonly');
  }

  // Ultimo caso: il testo resta selezionato, la copia la fa l'utente
  embedCode.select();
  showToast(_t('embed.copyFailed', 'Copia non riuscita: seleziona il testo e copialo a mano'), 4000);
}

/**
 * Aggancia il generatore al pannello di condivisione.
 *
 * @param {object} d Getter sullo stato del viewer:
 *   getModelFolder(), getModelName(), getCamera(), getShareTarget(),
 *   getSectionState(), getLang()
 */
export function initEmbedUI(d) {
  deps = d;
  if (!sharePaneEmbed || !embedCode) return;

  if (shareTabs) {
    eventManager.add(shareTabSocial, 'click', () => selectTab('social'), false, 'ui');
    eventManager.add(shareTabEmbed, 'click', () => selectTab('embed'), false, 'ui');
  }

  const onOptionChange = () => refreshEmbedCode();
  [embedOptView, embedOptSection, embedOptRatio, ...embedToolInputs].forEach((el) => {
    if (el) eventManager.add(el, 'change', onOptionChange, false, 'ui');
  });

  if (embedCopyBtn) eventManager.add(embedCopyBtn, 'click', copySnippet, false, 'ui');

  // Click sull'area di testo: seleziona tutto, così basta Ctrl+C
  eventManager.add(embedCode, 'focus', () => embedCode.select(), false, 'ui');

  resetShareTabs();
}
