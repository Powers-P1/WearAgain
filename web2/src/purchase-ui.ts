import {
  candidatePosition, choosePurchaseDemo, clearRatings, computeDecision,
  initialPurchase, itemLabel, rateSelected, recordDecision, recordingFor,
  replayRatings, selectCandidate, selectedPair, selectedRating, selectTop,
  type PurchaseDemo, type Rating,
} from './purchase.js';
import type { PurchaseSession } from './purchase.js';
import type { Outerwear, SolveResult } from '../../src/core/index.js';
import { t, type TranslationKey } from './i18n.js';
import './purchase.css';

let session: PurchaseSession = initialPurchase();
type Actions = { readonly rerender: () => void; readonly notice: (value: string) => void };

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}
function smallIcon(): string {
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 12h16m-7-7 7 7-7 7"/></svg>';
}
function garmentTile(kind: 'top' | 'outerwear', id: string, name: string): string {
  const saved = recordingFor(kind,id);
  return '<figure class="purchase-preview-tile"><div class="purchase-image-wrap">' +
    (saved ? '<img loading="lazy" src="' + esc(saved.imagePath) + '" alt="' +
      esc(t('purchaseSavedAlt',{item:name})) + '" />' :
      '<div class="purchase-image-empty">' + esc(t('purchaseImageMissing')) + '</div>') +
    (saved ? '<span class="purchase-model-label">' + esc(t('demoModel')) + '</span>' +
      '<span class="purchase-recorded-label">' + esc(t('purchaseSavedSingle')) + '</span>' +
      '<span class="purchase-fit-overlay">' + esc(t('styleFitDisclaimer')) + '</span>' : '') +
    '</div><figcaption><strong>' + esc(name) + '</strong>' +
    '<span>' + esc(kind === 'top' ? t('purchaseOwnedExample') : t('purchaseShopExample')) + '</span></figcaption></figure>';
}
function candidateButtons(): string {
  const choices = session.scenario.outerwear.filter((item): item is Outerwear & {kind:'candidate';priceMinor:number} => item.kind === 'candidate');
  return '<section class="purchase-finds" aria-labelledby="purchase-finds-title">' +
    '<div class="purchase-section-head"><h2 id="purchase-finds-title">' + esc(t('purchaseFinds')) + '</h2>' +
    '<p>' + esc(t('purchaseToday')) + '</p></div>' +
    '<div class="purchase-candidate-list">' + choices.map(item => {
      const image = recordingFor('outerwear',item.id);
      return '<button type="button" class="purchase-candidate ' + (session.candidateId === item.id ? 'selected' : '') +
        '" data-purchase-candidate="' + esc(item.id) + '" aria-pressed="' + (session.candidateId === item.id) + '">' +
        (image ? '<img src="' + esc(image.imagePath) + '" alt="" loading="lazy" />' :
          '<span class="purchase-small-placeholder" aria-hidden="true">+</span>') +
        '<span class="purchase-candidate-info"><strong>' + esc(item.label) + '</strong>' +
        '<small>' + esc(t('purchaseSamplePrice')) + ' · ' + esc(formatMoney(item.priceMinor,session.scenario.currency)) +
        '</small></span></button>';
    }).join('') + '</div>' +
    '<p class="purchase-smallprint">' + esc(t('purchaseNoStoreStock')) + '</p></section>';
}
function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style:'currency', currency }).format(minor/100);
}
function previewColumn(): string {
  const top = session.scenario.tops.find(item => item.id === session.topId);
  const candidate = session.scenario.outerwear.find(item => item.id === session.candidateId && item.kind === 'candidate');
  if (!top || !candidate) return '<p>' + esc(t('purchaseInvalidSelection')) + '</p>';
  const pair = selectedPair(session);
  const rating = selectedRating(session);
  const recorded = !!recordingFor('top',top.id) && !!recordingFor('outerwear',candidate.id);
  const ratingOptions: readonly { readonly key: Rating; readonly title: TranslationKey }[] = [
    { key:'would_wear',title:'purchaseWouldWear' },
    { key:'would_not_wear',title:'purchaseWouldNotWear' },
    { key:'unrated',title:'purchaseUnsure' },
  ];
  return '<section class="purchase-preview-column" aria-labelledby="purchase-preview-title">' +
    '<div class="purchase-section-head"><h2 id="purchase-preview-title">' + esc(t('purchaseWithWardrobe')) + '</h2>' +
    '<p>' + esc(t('purchaseSeparate')) + '</p></div>' +
    '<div class="purchase-top-picker" role="group" aria-label="' + esc(t('purchaseChooseOwned')) + '">' +
    session.scenario.tops.map(item => '<button type="button" data-purchase-top="' + esc(item.id) +
      '" aria-pressed="' + (session.topId === item.id) + '" class="' + (session.topId === item.id ? 'selected' : '') +
      '">' + esc(item.label) + '</button>').join('') + '</div>' +
    '<div class="purchase-preview-pair">' +
    garmentTile('outerwear',candidate.id,candidate.label) + garmentTile('top',top.id,top.label) +
    '</div><p class="purchase-fit-note">' + esc(t('styleFitDisclaimer')) + '</p>' +
    '<div class="purchase-rating"><h3>' + esc(t('purchaseWouldCombine')) + '</h3><div class="purchase-rating-buttons">' +
    ratingOptions.map(option => '<button type="button" data-purchase-rating="' + option.key + '" aria-pressed="' +
      (rating?.status === option.key) + '" class="' + (rating?.status === option.key ? 'selected' : '') +
      '" ' + (!pair || (!recorded && option.key !== 'unrated') ? 'disabled title="' + esc(t('purchaseMissingEvidence')) + '"' : '') +
      '>' + esc(t(option.title)) + '</button>').join('') + '</div>' +
    '<p>' + esc(recorded ? t('purchaseRatingsNote') : t('purchaseMissingEvidence')) + '</p></div></section>';
}
function certificateExplanation(result: SolveResult): string {
  if (result.status !== 'solved') {
    return '<p>' + esc(result.status === 'incomplete' ? t('purchaseNeedRatings') : t('purchaseNotFeasible')) + '</p>';
  }
  const certificate = result.certificate;
  return '<p>' + esc(t('purchaseCertificateScope',{count:result.evaluatedBasketCount})) + '</p>' +
    '<p>' + esc(certificate.priceOptimality === 'proven' ? t('purchasePriceProven') : t('purchasePriceProvisional')) + '</p>' +
    '<ul class="purchase-certificate-list">' + certificate.cheaperBaskets.map(entry => {
      const names = entry.basket.candidateIds.map(id => itemLabel(id,id));
      const label = names.length ? names.join(' + ') : t('purchaseBuyNothing');
      const failed = entry.failedRequirements.map(req => session.scenario.requirements.find(row => row.id === req.requirementId)?.label ?? req.requirementId);
      return '<li><strong>' + esc(label) + ' · ' + esc(formatMoney(entry.basket.costMinor,entry.basket.currency)) +
        '</strong><span>' + esc(t('purchaseFails')) + ' ' + esc(failed.join(', ')) +
        (entry.couldBecomeFeasible ? ' · ' + esc(t('purchaseCouldChange')) : '') + '</span></li>';
    }).join('') + '</ul>' +
    (!certificate.cheaperBaskets.length ? '<p>' + esc(t('purchaseNothingCheaper')) + '</p>' : '') +
    (certificate.unresolvedOutfitIds.length ?
      '<p>' + esc(t('purchaseUnresolvedCount',{count:certificate.unresolvedOutfitIds.length})) + '</p>' : '');
}
function verdictColumn(): string {
  const result = computeDecision(session);
  const position = candidatePosition(session);
  const titles: Record<typeof position, TranslationKey> = {
    recommended:'purchaseWorthChecking',
    not_required:'purchaseNotNeeded',
    none:'purchaseOwnEnough',
    unresolved:'purchaseNeedRatings',
    infeasible:'purchaseNotFeasible',
  };
  const explanations: Record<typeof position, TranslationKey> = {
    recommended:'purchaseRecommendedWhy',
    not_required:'purchaseNotNeededWhy',
    none:'purchaseZeroWhy',
    unresolved:'purchaseIncompleteWhy',
    infeasible:'purchaseInfeasibleWhy',
  };
  const candidate = session.scenario.outerwear.find(item => item.id === session.candidateId);
  const choice = session.decisions[session.candidateId];
  const basketNames = result.status === 'solved'
    ? result.basket.candidateIds.map(id => itemLabel(id,id)).join(' + ') || t('purchaseBuyNothing') : '';
  return '<section class="purchase-verdict" aria-labelledby="purchase-verdict-title" aria-live="polite">' +
    '<p class="purchase-eyebrow">' + esc(t('purchaseCoreVerdict')) + '</p>' +
    '<h2 id="purchase-verdict-title">' + esc(t(titles[position])) + '</h2>' +
    '<p class="purchase-summary">' + esc(t(explanations[position])) + '</p>' +
    (candidate ? '<p class="purchase-subject">' + esc(t('purchaseForItem',{item:candidate.label})) + '</p>' : '') +
    '<div class="purchase-basket"><span>' + esc(t('purchaseCheapestBasket')) + '</span>' +
    (result.status === 'solved' ?
      '<strong>' + esc(formatMoney(result.basket.costMinor,result.basket.currency)) + '</strong>' +
      '<p>' + esc(basketNames) + '</p>' +
      '<p>' + esc(result.certificate.priceOptimality === 'proven' && result.certificate.selectionStability === 'stable'
        ? t('purchaseStable') : t('purchaseProvisional')) + '</p>' :
      '<p>' + esc(t('purchaseUnknownPrice')) + '</p>') + '</div>' +
    '<details class="purchase-certificate"><summary>' + esc(t('purchaseWhy')) + ' ' + smallIcon() + '</summary>' +
      certificateExplanation(result) + '</details>' +
    '<div class="purchase-actions"><button type="button" class="button button-primary full-width" data-purchase-choice="skip">' +
      esc(t('purchaseKeepMine')) + '</button><button type="button" class="button button-outline full-width" data-purchase-choice="save">' +
      esc(t('purchaseSaveLater')) + '</button></div>' +
    (choice ? '<p role="status" class="purchase-choice-notice">' +
      esc(t(choice === 'skip' ? 'purchaseSkipConfirmed' : 'purchaseSaveConfirmed')) + '</p>' : '') +
    '<p class="purchase-smallprint">' + esc(t('purchaseNoCheckout')) + '</p></section>';
}
export function purchasePage(): string {
  return '<section class="page purchase-view" aria-labelledby="purchase-title">' +
    '<div class="purchase-intro"><div><h1 id="purchase-title">' + esc(t('purchaseHeadline')) + '</h1>' +
    '<p>' + esc(t('purchaseSubheading')) + '</p></div>' +
    '<div class="purchase-demo-modes" role="group" aria-label="' + esc(t('purchaseChooseDemo')) + '">' +
    (['minimum','zero'] as const).map(mode => '<button type="button" data-purchase-demo="' + mode + '" aria-pressed="' +
      (session.demo === mode) + '" class="' + (session.demo === mode ? 'selected' : '') + '">' +
      esc(t(mode === 'minimum' ? 'purchaseMinimumDemo' : 'purchaseZeroDemo')) + '</button>').join('') +
    '</div></div>' +
    '<div class="purchase-data-strip"><span>' + esc(t('purchaseDemoOnly')) + '</span>' +
    '<span>' + esc(t(session.ratingsOrigin === 'example' ? 'purchaseExampleRatings' : 'purchaseEditedRatings')) + '</span>' +
    '<button type="button" data-purchase-clear>' + esc(t('purchaseClearRatings')) + '</button>' +
    '<button type="button" data-purchase-replay>' + esc(t('purchaseReplayRatings')) + '</button></div>' +
    '<div class="purchase-layout">' + candidateButtons() + previewColumn() + verdictColumn() + '</div></section>';
}
export function handlePurchaseClick(button: HTMLElement, actions: Actions): boolean {
  try {
    if (button.dataset.purchaseDemo) {
      session = choosePurchaseDemo(session, button.dataset.purchaseDemo as PurchaseDemo);
    } else if (button.dataset.purchaseCandidate) {
      session = selectCandidate(session, button.dataset.purchaseCandidate);
    } else if (button.dataset.purchaseTop) {
      session = selectTop(session, button.dataset.purchaseTop);
    } else if (button.dataset.purchaseRating) {
      session = rateSelected(session, button.dataset.purchaseRating as Rating);
    } else if (button.hasAttribute('data-purchase-clear')) {
      session = clearRatings(session);
    } else if (button.hasAttribute('data-purchase-replay')) {
      session = replayRatings(session);
    } else if (button.dataset.purchaseChoice) {
      session = recordDecision(session,session.candidateId,button.dataset.purchaseChoice as 'save' | 'skip');
    } else return false;
    actions.rerender();
  } catch (error) {
    actions.notice(error instanceof Error ? error.message : t('purchaseInvalidSelection'));
    actions.rerender();
  }
  return true;
}
