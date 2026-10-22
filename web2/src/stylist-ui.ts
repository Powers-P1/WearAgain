import {
  demoLooks, loadSaved, persistSaved, proposeLooks, recordedPreviewForItem, saveChosen, verifyLooks,
  type SavedLook, type StylistBrief, type StylistResult,
} from './stylist.js';
import type { WardrobeState, WardrobeItem } from './state.js';
import { t } from './i18n.js';
import './stylist.css';

type UIActions = {
  readonly wardrobe: WardrobeState;
  readonly storage: Pick<Storage, 'setItem' | 'getItem'> | undefined;
  readonly rerender: () => void;
  readonly notice: (message: string) => void;
};
let brief: StylistBrief = {
  occasion: t('stylistDemoOccasion'),
  date: '2026-10-23',
  style: t('defaultStyle'),
};
let result: StylistResult | null = null;
let selected = 0;
let generated = false;
let saved: SavedLook[] | null = null;
let requestSequence = 0;

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
function svg(which: 'arrow' | 'left' | 'calendar' | 'hanger' | 'check' | 'lock' | 'bookmark'): string {
  const paths = {
    arrow: '<path d="M4 12h16m-7-7 7 7-7 7"/>',
    left: '<path d="M20 12H4m7-7-7 7 7 7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16"/><path d="M7 3v5m10-5v5M3 10h18"/>',
    hanger: '<path d="M9 5a3 3 0 0 1 6 0c0 2-3 2-3 4l9 7a2 2 0 0 1-1 3H4a2 2 0 0 1-1-3l9-7"/>',
    check: '<path d="M4 12.5 9.5 18 20 6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
  };
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[which] + '</svg>';
}
function picture(item: WardrobeItem): string {
  const recording = recordedPreviewForItem(item.id);
  if (recording) return '<img src="' + escapeHtml(recording) + '" alt="' + escapeHtml(item.name) + '" loading="lazy" />';
  return item.photo
    ? '<img src="/assets/items/' + escapeHtml(item.photo) + '.webp" alt="' + escapeHtml(item.name) + '" loading="lazy" />'
    : '<span class="stylist-empty-thumbnail">' + svg('hanger') + '</span>';
}
function validResult(wardrobe: WardrobeState): StylistResult {
  if (result) {
    try {
      result = verifyLooks(result.looks, wardrobe, result.source);
      return result;
    } catch {
      generated = false;
    }
  }
  result = demoLooks(wardrobe);
  selected = 0;
  return result;
}
function briefForm(wardrobe: WardrobeState): string {
  return '<form id="stylist-form" class="stylist-form">' +
    '<h2>' + escapeHtml(t('stylistOccasion')) + '</h2>' +
    '<p class="stylist-form-note">' + escapeHtml(t('stylistDescribe')) + '</p>' +
    '<label class="visually-hidden" for="occasion-input">' + escapeHtml(t('stylistOccasion')) + '</label>' +
    '<textarea id="occasion-input" name="occasion" maxlength="500" required rows="5">' + escapeHtml(brief.occasion) + '</textarea>' +
    '<div class="occasion-suggestions"><button type="button" data-occasion="work">' + escapeHtml(t('stylistWork')) + ' ' + svg('arrow') + '</button>' +
    '<button type="button" data-occasion="weekend">' + escapeHtml(t('stylistWeekend')) + ' ' + svg('arrow') + '</button></div>' +
    '<label class="stylist-date">' + svg('calendar') + '<span class="visually-hidden">' + escapeHtml(t('stylistDate')) + '</span>' +
    '<input type="date" name="date" value="' + escapeHtml(brief.date) + '" aria-label="' + escapeHtml(t('stylistDate')) + '" /></label>' +
    '<div class="stylist-style-row"><div><strong>' + escapeHtml(t('stylistStyleLabel')) + '</strong>' +
    '<p>' + escapeHtml(wardrobe.style === t('defaultStyle') ? t('stylistStyleSummary') : wardrobe.style) + '</p></div>' +
    '<button type="button" data-nav="profile">' + escapeHtml(t('stylistChange')) + '</button></div>' +
    '<p class="stylist-owned">' + svg('hanger') + ' ' + escapeHtml(t('stylistStartOwned')) + '</p>' +
    '<button type="submit" class="button button-primary full-width">' + escapeHtml(t(generated ? 'stylistChangeSuggestions' : 'stylistShowLooks')) +
    ' ' + svg('arrow') + '</button>' +
    '<p class="stylist-footnote">' + escapeHtml(t('stylistNoNetwork')) + '</p></form>';
}
function lookPreview(wardrobe: WardrobeState, selection: StylistResult): string {
  const look = selection.looks[selected];
  if (!look) return '<section class="stylist-empty"><h2>' + escapeHtml(t('stylistUnavailable')) + '</h2>' +
    '<button class="button button-outline" type="button" data-nav="wardrobe">' + escapeHtml(t('goBackWardrobe')) + '</button></section>';
  const owned = look.itemIds
    .map(id => wardrobe.items.find(item => item.id === id))
    .filter((item): item is WardrobeItem => !!item);
  const image = look.heroImagePath
    ? '<img src="' + escapeHtml(look.heroImagePath) + '" alt="' + escapeHtml(t('stylistSavedRender')) + '" />'
    : '<div class="stylist-no-render">' + svg('hanger') + '<span>' + escapeHtml(t('stylistUnrendered')) + '</span></div>';
  return '<section class="stylist-result"><div class="stylist-preview-column">' +
    '<div class="stylist-progress"><span>' + escapeHtml(t('stylistSuggestion',{index:selected+1,count:selection.looks.length})) + '</span>' +
    '<div class="stylist-arrows"><button type="button" data-look-prev aria-label="' + escapeHtml(t('stylistPrevious')) + '">' + svg('left') + '</button>' +
    '<button type="button" data-look-next aria-label="' + escapeHtml(t('stylistNext')) + '">' + svg('arrow') + '</button></div></div>' +
    '<div class="stylist-photo">' + image +
    (look.heroImagePath ? '<span class="stylist-photo-label">' + escapeHtml(t('stylistModelLabel')) + '</span>' +
      '<span class="stylist-photo-origin">' + escapeHtml(t('stylistSavedRender')) + '</span>' +
      '<span class="stylist-photo-fit">' + escapeHtml(t('styleFitDisclaimer')) + '</span>' : '') +
    '</div>' +
    '<h2 class="stylist-caption">' + escapeHtml(look.title) + '</h2>' +
    (selection.verified ? '<p class="stylist-verified">' + svg('check') + ' ' + escapeHtml(t('stylistVerified')) + '</p>' : '') +
    '</div>' +
    '<div class="stylist-details"><h2>' + escapeHtml(t('stylistAllOwned')) + '</h2>' +
    '<p class="stylist-detail-count">' + escapeHtml(t(owned.length===1?'stylistPiecesOne':'stylistPieces',{count:owned.length})) + '</p>' +
    '<div class="stylist-garments">' + owned.map(item =>
      '<div class="stylist-garment"><span class="stylist-item-photo">' + picture(item) + '</span>' +
      '<span>' + escapeHtml(item.name) + '</span></div>').join('') + '</div>' +
    '<p class="stylist-reason">' + escapeHtml(look.explanation) + '</p>' +
    '<button type="button" class="button button-primary full-width" data-save-look>' + escapeHtml(t('stylistSave')) + '</button>' +
    '<button type="button" class="stylist-trip-link" disabled title="' + escapeHtml(t('stylistTripUnavailable')) + '">' + escapeHtml(t('stylistSaveTrip')) + '</button>' +
    '<button type="button" class="text-link stylist-next-link" data-look-next>' + escapeHtml(t('stylistChangeLook')) + ' ' + svg('arrow') + '</button>' +
    '<p class="stylist-disclaimer">' + escapeHtml(t('stylistImageNote')) + '</p>' +
    '<p class="stylist-disclaimer">' + escapeHtml(t('stylistDemoNote')) + '</p></div></section>';
}
export function stylistPage(wardrobe: WardrobeState): string {
  const selection = validResult(wardrobe);
  return '<section class="page stylist-view ' + (generated ? 'show-result' : 'show-brief') + '" aria-labelledby="stylist-title">' +
    (generated ? '<div class="stylist-result-appbar"><button type="button" data-stylist-reset aria-label="' + escapeHtml(t('stylistBackToBrief')) + '">←</button>'+
    '<span>' + escapeHtml(t('stylistResultAppbar')) + '</span><button type="button" data-save-look aria-label="' + escapeHtml(t('stylistBookmarkLook')) + '">' + svg('bookmark') + '</button></div>' : '') +
    '<div class="stylist-intro"><div><h1 id="stylist-title">' + escapeHtml(t('stylistPageTitle')) + '</h1>' +
    '<p>' + escapeHtml(t('stylistHeaderSubtitle')) + '</p></div>' +
    '<button type="button" class="text-link stylist-saved-link" data-nav="saved">' + escapeHtml(t('stylistSavedLink')) + ' ' + svg('arrow') + '</button></div>' +
    '<button type="button" class="stylist-mobile-back" data-stylist-reset>' + svg('left') + ' ' + escapeHtml(t('stylistBackToBrief')) + '</button>' +
    '<div class="stylist-layout">' + briefForm(wardrobe) + lookPreview(wardrobe,selection) + '</div></section>';
}
export function savedPage(storage?: Pick<Storage, 'getItem'>): string {
  if (saved === null) saved = loadSaved(storage);
  return '<section class="page saved-view"><h1>' + escapeHtml(t('stylistOutfitList')) + '</h1>' +
    '<p class="intro-subtitle">' + escapeHtml(t(saved.length===1?'stylistSavedCountOne':'stylistSavedCount',{count:saved.length})) + '</p>' +
    (saved.length ? '<div class="saved-look-list">' + saved.map(look =>
      '<article class="saved-look-item"><h2>' + escapeHtml(look.title) + '</h2><p>' +
      escapeHtml(look.occasion) + '</p>' +
      (look.date ? '<p>' + escapeHtml(t('stylistSavedWhen',{date:look.date})) + '</p>' : '') +
      '<p>' + escapeHtml(t(look.itemIds.length===1?'stylistSavedItemsOne':'stylistSavedItems',{count:look.itemIds.length})) + '</p></article>').join('') + '</div>' :
      '<p class="no-results">' + escapeHtml(t('stylistNoSaved')) + '</p>') +
    '<button type="button" class="button button-outline" data-nav="stylist">' + escapeHtml(t('stylistPageTitle')) +
    ' ' + svg('arrow') + '</button></section>';
}
/** Return true if the click belongs to this workspace, without intercepting global navigation. */
export function handleStylistClick(target: HTMLElement, actions: UIActions): boolean {
  if (target.hasAttribute('data-stylist-reset')) {
    generated = false;
  } else if (target.dataset.occasion) {
    brief = { ...brief, occasion: target.dataset.occasion === 'work' ? t('stylistWork') : t('stylistWeekend') };
  } else if (target.hasAttribute('data-look-next') || target.hasAttribute('data-look-prev')) {
    const count = validResult(actions.wardrobe).looks.length;
    if (count) selected = (selected + (target.hasAttribute('data-look-next') ? 1 : count - 1)) % count;
  } else if (target.hasAttribute('data-save-look')) {
    const look = validResult(actions.wardrobe).looks[selected];
    if (look) {
      if (saved === null) saved = loadSaved(actions.storage);
      saved = saveChosen(saved, look, {...brief,style:actions.wardrobe.style}, actions.wardrobe);
      actions.notice(persistSaved(saved,actions.storage) ? t('stylistSaved') : t('stylistSaveFailed'));
    }
  } else return false;
  actions.rerender();
  return true;
}
export function submitStylist(form: HTMLFormElement, actions: UIActions): void {
  const values = new FormData(form);
  brief = {
    occasion: String(values.get('occasion') ?? ''),
    date: String(values.get('date') ?? ''),
    style: actions.wardrobe.style,
  };
  const token = ++requestSequence;
  // No network request: default adapter is an offline verified demo.
  void proposeLooks(brief, actions.wardrobe).then(next => {
    if (token !== requestSequence) return;
    result = next;
    generated = true;
    selected = 0;
    actions.rerender();
  }).catch(error => {
    if (token !== requestSequence) return;
    actions.notice(error instanceof Error ? error.message : t('stylistInvalidProposal'));
    actions.rerender();
  });
}
