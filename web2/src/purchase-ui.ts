import {
  candidatePosition, choosePurchaseDemo, clearRatings, computeDecision, initialPurchase, itemLabel,
  purchaseDemoFromSearch, rateSelected, recordDecision, recordingFor, replayRatings, selectCandidate,
  selectedPair, selectedRating, selectTop, type PurchaseDemo, type PurchaseSession, type Rating,
} from './purchase.js';
import type { SolveResult } from '../../src/core/index.js';
import { initialState, type WardrobeState } from './state.js';
import { esc, icon, itemPicture } from './ui.js';
import { t, type TranslationKey } from './i18n.js';
import './purchase.css';

let session: PurchaseSession = initialPurchase(purchaseDemoFromSearch(typeof window === 'undefined' ? '' : window.location.search));
let comparisonId = '';
let comparing = false;
const equivalents = new Map<string, string>();
type Actions = { readonly rerender: () => void; readonly notice: (value: string) => void; readonly wardrobe?: WardrobeState };
const money = (minor: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: session.scenario.currency }).format(minor / 100);

function savedImage(kind: 'top' | 'outerwear', id: string, label: string): string {
  const record = recordingFor(kind, id);
  return record ? '<img data-recorded-garment="'+kind+':'+esc(id)+'" src="' + esc(record.imagePath) + '" alt="' + esc(t('purchaseSavedAlt', { item: label })) + '" />' :
    '<span class="purchase-image-empty">' + esc(label) + '<small>' + esc(t('purchaseImageMissing')) + '</small></span>';
}
function candidates(): string {
  return '<section class="purchase-finds" aria-labelledby="purchase-finds-title"><h2 id="purchase-finds-title">' + esc(t('purchaseFinds')) + '</h2>' +
    '<div class="purchase-candidate-list">' + session.scenario.outerwear.filter(item => item.kind === 'candidate').map(item =>
      '<button type="button" class="purchase-candidate ' + (item.id === session.candidateId ? 'selected' : '') + '" data-purchase-candidate="' + esc(item.id) + '" aria-pressed="' + (item.id === session.candidateId) + '">' +
      '<span class="purchase-candidate-thumb">' + savedImage('outerwear', item.id, item.label) + '</span><span><strong>' + esc(item.label) + '</strong><small>' +
      esc(t('purchaseCandidatePrice')) + ' · ' + esc(money(item.kind === 'candidate' ? item.priceMinor : 0)) + '</small></span></button>').join('') + '</div>' +
    '<button type="button" class="text-link purchase-add-item" data-nav="gallery">' + icon('camera') + esc(t('purchaseAddAnother')) + '</button></section>';
}
function previews(): string {
  const top = session.scenario.tops.find(item => item.id === session.topId);
  const candidate = session.scenario.outerwear.find(item => item.id === session.candidateId);
  if (!top || !candidate) return '';
  const canRate = !!selectedPair(session) && !!recordingFor('top', top.id) && !!recordingFor('outerwear', candidate.id);
  const rating = selectedRating(session);
  return '<section class="purchase-preview-column" aria-labelledby="purchase-preview-title"><div class="purchase-section-head"><h2 id="purchase-preview-title">' +
    esc(t('purchaseWithWardrobe')) + '</h2><span>' + esc(t('purchasePairCount', { index: session.scenario.tops.indexOf(top) + 1, count: session.scenario.tops.length })) + '</span></div>' +
    '<div class="purchase-preview-pair"><figure><span class="purchase-photo-source">' + esc(t('purchaseDesktopShop')) + '</span><div class="purchase-image-wrap">' +
    savedImage('outerwear', candidate.id, candidate.label) + '</div><figcaption>' + esc(candidate.label) + '</figcaption></figure>' +
    '<figure><span class="purchase-photo-source">' + esc(t('purchaseDesktopOwn')) + '</span><div class="purchase-image-wrap">' +
    savedImage('top', top.id, top.label) + '</div><figcaption>' + esc(top.label) + '</figcaption></figure></div>' +
    '<div class="purchase-rating"><h3>' + esc(t('purchaseWouldCombine')) + '</h3><div class="purchase-rating-buttons">' +
    ([['would_wear', 'purchaseDesktopWear', 'check'], ['would_not_wear', 'purchaseDesktopNotWear', 'close']] as const).map(([value, label, symbol]) =>
      '<button type="button" data-purchase-rating="' + value + '" aria-pressed="' + (canRate && rating?.status === value) + '" ' + (!canRate ? 'disabled' : '') + '>' +
      icon(symbol) + esc(t(label)) + '</button>').join('') + '</div>' +
    '<button type="button" class="purchase-unsure" data-purchase-rating="unrated" aria-pressed="' + (rating?.status === 'unrated') + '">' + esc(t('purchaseUnsure')) + '</button></div>' +
    '<div class="purchase-top-picker" role="group" aria-label="' + esc(t('purchaseChooseOwned')) + '">' + session.scenario.tops.map(item =>
      '<button type="button" data-purchase-top="' + esc(item.id) + '" aria-pressed="' + (item.id === top.id) + '">' + esc(item.label) + '</button>').join('') + '</div>' +
    '<p class="purchase-fit-note">' + esc(canRate ? t('purchaseSeparate') + ' · ' + t('styleFitDisclaimer') : t('purchaseMissingEvidence')) + '</p></section>';
}
function certificateExplanation(result: SolveResult): string {
  if (result.status !== 'solved') return '<p>' + esc(t(result.status === 'incomplete' ? 'purchaseIncompleteWhy' : 'purchaseInfeasibleWhy')) + '</p>';
  return '<p>' + esc(t('purchaseCertificateScope', { count: result.evaluatedBasketCount })) + '</p><ul class="purchase-certificate-list">' +
    result.certificate.cheaperBaskets.map(entry => '<li><strong>' + esc(entry.basket.candidateIds.length ? entry.basket.candidateIds.map(id => itemLabel(id, id)).join(' + ') : t('purchaseBuyNothing')) +
      ' · ' + esc(money(entry.basket.costMinor)) + '</strong><span>' + esc(t('purchaseFails')) + ' ' +
      esc(entry.failedRequirements.map(req => session.scenario.requirements.find(item => item.id === req.requirementId)?.label ?? req.requirementId).join(', ')) +
      (entry.couldBecomeFeasible ? ' · ' + esc(t('purchaseCouldChange')) : '') + '</span></li>').join('') + '</ul>' +
    (!result.certificate.cheaperBaskets.length ? '<p>' + esc(t('purchaseNothingCheaper')) + '</p>' : '');
}
function verdict(wardrobe: WardrobeState): string {
  const result = computeDecision(session), position = candidatePosition(session);
  const own = wardrobe.items.find(item => item.id === equivalents.get(session.candidateId));
  const compared = wardrobe.items.find(item => item.id === comparisonId) ?? wardrobe.items.find(item => item.id === 'coat') ?? wardrobe.items[0];
  const candidate = session.scenario.outerwear.find(item => item.id === session.candidateId);
  const titles: Record<typeof position, TranslationKey> = { recommended: 'purchaseWorthChecking', not_required: 'purchaseNotNeeded', none: 'purchaseOwnEnough', unresolved: 'purchaseNeedRatings', infeasible: 'purchaseNotFeasible' };
  const reasons: Record<typeof position, TranslationKey> = { recommended: 'purchaseRecommendedWhy', not_required: 'purchaseChosenAlternative', none: 'purchaseZeroWhy', unresolved: 'purchaseIncompleteWhy', infeasible: 'purchaseInfeasibleWhy' };
  const recommended = result.status === 'solved' ? result.basket.candidateIds[0] : undefined;
  return '<section class="purchase-verdict" aria-labelledby="purchase-verdict-title" aria-live="polite"><h2 id="purchase-verdict-title">' + esc(own ? t('purchaseConfirmedEquivalent') : t(titles[position])) + '</h2>' +
    '<p class="purchase-summary">' + esc(own ? t('purchaseConfirmedEquivalentNote', { item: own.name }) : t(reasons[position])) + '</p>' +
    (own ? '<div class="purchase-owned-evidence">' + itemPicture(own) + '<strong>' + esc(own.name) + '</strong></div>' : '') +
    (!own && result.status === 'solved' ? '<div class="purchase-basket"><span>' + esc(t('purchaseCheapestBasket')) + '</span><strong>' + esc(money(result.basket.costMinor)) + '</strong><p>' +
      esc(result.basket.candidateIds.map(id => itemLabel(id, id)).join(' + ') || t('purchaseBuyNothing')) + '</p></div>' : '') +
    '<div class="purchase-actions">' +
    (position === 'unresolved' || position === 'infeasible' ? '<button type="button" class="button button-primary full-width" data-purchase-review>' + esc(t('purchaseReviewMore')) + '</button>' :
      '<button type="button" class="button button-primary full-width" data-purchase-choice="' + (position === 'recommended' && !own ? 'save' : 'skip') + '">' +
      esc(t(own || position === 'none' ? 'purchaseKeepMine' : position === 'recommended' ? 'purchaseSaveLater' : 'purchaseSkipCandidate')) + '</button>') +
    (position === 'not_required' && recommended && !own ? '<button type="button" class="text-link" data-purchase-candidate="' + esc(recommended) + '">' + esc(t('purchaseSeeRecommendation')) + icon('arrow') + '</button>' : '') +
    (position !== 'recommended' ? '<button type="button" class="purchase-save-later" data-purchase-choice="save">' + esc(t('purchaseSaveLater')) + '</button>' : '') + '</div>' +
    (session.decisions[session.candidateId] ? '<p role="status" class="purchase-choice-notice">' + esc(t(session.decisions[session.candidateId] === 'skip' ? 'purchaseSkipConfirmed' : 'purchaseSaveConfirmed')) + '</p>' : '') +
    '<details class="purchase-certificate"><summary>' + esc(t('purchaseWhy')) + icon('arrow') + '</summary>' + certificateExplanation(result) + '</details>' +
    '<details class="purchase-compare" ' + (comparing ? 'open' : '') + '><summary>' + esc(t('purchaseNoDuplicateTitle')) + '</summary><p>' + esc(t('purchaseNoDuplicateNote')) + '</p>' +
    '<label>' + esc(t('purchaseChooseOwnPiece')) + '<select id="purchase-compare-item">' + wardrobe.items.map(item => '<option value="' + esc(item.id) + '" ' + (compared?.id === item.id ? 'selected' : '') + '>' + esc(item.name) + '</option>').join('') + '</select></label>' +
    (compared && candidate ? '<div class="purchase-compare-pair"><figure>' + savedImage('outerwear', candidate.id, candidate.label) + '<figcaption>' + esc(t('purchaseDesktopShop')) + '</figcaption></figure>' +
      '<figure>' + itemPicture(compared) + '<figcaption>' + esc(t('purchaseDesktopOwn')) + '</figcaption></figure></div><button type="button" class="button button-outline full-width" data-purchase-equivalent="' + esc(compared.id) + '">' + esc(t('purchaseMarkEquivalent')) + '</button>' : '') + '</details></section>';
}
export function purchasePage(wardrobe: WardrobeState = initialState()): string {
  return '<section class="page purchase-view" aria-labelledby="purchase-title"><header class="purchase-intro"><div><h1 id="purchase-title">' + esc(t('purchaseHeadline')) + '</h1><p>' + esc(t('purchaseSubheading')) + '</p></div>' +
    '<div class="purchase-import-actions"><button type="button" class="button button-primary" data-nav="gallery">' + icon('camera') + esc(t('purchaseAddPhoto')) + '</button>' +
    '<button type="button" class="text-link" data-nav="gallery">' + esc(t('purchasePasteLink')) + '</button></div></header>' +
    '<div class="purchase-layout">' + candidates() + previews() + verdict(wardrobe) + '</div>' +
    '<details class="purchase-demo-settings"><summary>' + esc(t('purchaseEvidenceDetails')) + '</summary><p>' + esc(t('purchaseDemoOnly')) + ' · ' + esc(t(session.ratingsOrigin === 'example' ? 'purchaseExampleRatings' : 'purchaseEditedRatings')) + '</p>' +
    '<div class="purchase-demo-modes" role="group" aria-label="' + esc(t('purchaseChooseDemo')) + '">' + (['minimum', 'zero'] as const).map(mode =>
      '<button type="button" data-purchase-demo="' + mode + '" aria-pressed="' + (mode === session.demo) + '">' + esc(t(mode === 'minimum' ? 'purchaseMinimumDemo' : 'purchaseZeroDemo')) + '</button>').join('') + '</div>' +
    '<button type="button" data-purchase-clear>' + esc(t('purchaseClearRatings')) + '</button><button type="button" data-purchase-replay>' + esc(t('purchaseReplayRatings')) + '</button><p>' +
    esc(t('purchaseNoStoreStock')) + '</p><p>' + esc(t('purchaseNoCheckout')) + '</p></details></section>';
}
export function handlePurchaseChange(input: HTMLSelectElement): boolean {
  if (input.id !== 'purchase-compare-item') return false;
  comparisonId = input.value; comparing = true; return true;
}
export function handlePurchaseClick(button: HTMLElement, actions: Actions): boolean {
  try {
    const d = button.dataset;
    if (d.purchaseDemo) { session = choosePurchaseDemo(session, d.purchaseDemo as PurchaseDemo); equivalents.clear(); }
    else if (d.purchaseCandidate) session = selectCandidate(session, d.purchaseCandidate);
    else if (d.purchaseTop) session = selectTop(session, d.purchaseTop);
    else if (d.purchaseRating) session = rateSelected(session, d.purchaseRating as Rating);
    else if (button.hasAttribute('data-purchase-clear')) session = clearRatings(session);
    else if (button.hasAttribute('data-purchase-replay')) session = replayRatings(session);
    else if (d.purchaseChoice) session = recordDecision(session, session.candidateId, d.purchaseChoice as 'save' | 'skip');
    else if (d.purchaseEquivalent && actions.wardrobe?.items.some(item => item.id === d.purchaseEquivalent)) { equivalents.set(session.candidateId, d.purchaseEquivalent); comparing = false; }
    else if (button.hasAttribute('data-purchase-review')) {
      document.querySelector<HTMLElement>('.purchase-preview-column')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    } else return false;
    actions.rerender();
  } catch (error) { actions.notice(error instanceof Error ? error.message : t('purchaseInvalidSelection')); actions.rerender(); }
  return true;
}
