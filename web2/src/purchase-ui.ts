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
      '<span class="purchase-recorded-label">' + esc(t('purchaseSavedSingle')) + '</span>' : '') +
    '</div><figcaption><strong>' + esc(name) + '</strong>' +
    '<span>' + esc(kind === 'top' ? t('purchaseOwnedExample') : t('purchaseShopExample')) + '</span></figcaption></figure>';
}
function candidateButtons(): string {
  const choices = session.scenario.outerwear.filter((item): item is Outerwear & {kind:'candidate';priceMinor:number} => item.kind === 'candidate');
  return '<section class="purchase-finds" aria-labelledby="purchase-finds-title">' +
    '<div class="purchase-section-head"><h2 id="purchase-finds-title">' + esc(t('purchaseFinds')) + '</h2>' +
    '<p>' + esc(t('purchaseToday')) + '</p></div>' +
    '<div class="purchase-candidate-list">' + choices.map(item => {
      return '<button type="button" class="purchase-candidate ' + (session.candidateId === item.id ? 'selected' : '') +
        '" data-purchase-candidate="' + esc(item.id) + '" aria-pressed="' + (session.candidateId === item.id) + '">' +
        // This is a generic garment-only *illustration*, not a merchant
        // photograph and never the synthetic-model YouCam recording.
        '<img src="/assets/items/coat.webp" alt="" loading="lazy" />' +
        '<span class="purchase-candidate-info"><strong>' + esc(item.label) + '</strong>' +
        '<small>' + esc(t('purchaseShopUnknownSource')) + '</small><small>' + esc(t('purchaseSamplePrice')) + ' · ' + esc(formatMoney(item.priceMinor,session.scenario.currency)) +
        '</small></span></button>';
    }).join('') + '</div>' +
    '<div class="purchase-candidate-pager"><button type="button" data-purchase-prev aria-label="' + esc(t('purchasePrevItem')) + '">←</button>' +
    '<span>' + esc(t('purchaseCandidateNumber',{index:Math.max(0,choices.findIndex(item=>item.id===session.candidateId))+1,count:choices.length})) + '</span>' +
    '<button type="button" data-purchase-next aria-label="' + esc(t('purchaseNextItem')) + '">→</button></div>' +
    '<button class="purchase-add-item" type="button" data-nav="gallery">+ ' + esc(t('purchaseAddAnother')) + '</button>' +
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
    (recorded ? '<div class="purchase-preview-pair">' +
      garmentTile('outerwear',candidate.id,candidate.label) + garmentTile('top',top.id,top.label) + '</div>' :
      '<div class="purchase-no-recording"><strong>' + esc(t('purchaseImageMissing')) + '</strong>' +
      '<p>' + esc(t('purchaseMissingEvidence')) + '</p></div>') +
    (recorded ? '<p class="purchase-fit-note">' + esc(t('styleFitDisclaimer')) + '</p>' : '') +
    '<div class="purchase-rating"><h3>' + esc(t('purchaseWouldCombine')) + '</h3><div class="purchase-rating-buttons">' +
    ratingOptions.map(option => '<button type="button" data-purchase-rating="' + option.key + '" aria-pressed="' +
      (recorded && rating?.status === option.key) + '" class="' + (recorded && rating?.status === option.key ? 'selected' : '') +
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
function desktopPreview():string {
 const candidate=session.scenario.outerwear.find(item=>item.id===session.candidateId);
 const saved=candidate?recordingFor('outerwear',candidate.id):null;
 const all=session.scenario.outerwear.filter(item=>item.kind==='candidate');
 const index=Math.max(0,all.findIndex(item=>item.id===session.candidateId))+1;
 const rating=selectedRating(session);
 const pair=selectedPair(session);
 const canRate=!!pair&&!!recordingFor('top',session.topId)&&!!saved;
 return '<section class="purchase-desktop-model">'+
   '<div class="purchase-model-stage">'+(saved?'<img src="'+esc(saved.imagePath)+'" alt="'+esc(t('purchaseSavedAlt',{item:candidate?.label??''}))+'"/>':
      '<p>'+esc(t('purchaseImageMissing'))+'</p>')+
   '<span class="purchase-model-stamp">'+esc(t('demoModel'))+' · '+esc(t('purchaseSavedSingle'))+'</span></div>'+
   '<div class="purchase-model-controls"><button type="button" data-purchase-prev aria-label="'+esc(t('purchasePrevItem'))+'">←</button>'+
   '<span>'+index+' / '+all.length+'</span><button type="button" data-purchase-next aria-label="'+esc(t('purchaseNextItem'))+'">→</button></div>'+
   '<p class="purchase-model-caption">'+esc(t('demoModel'))+'</p>'+
   '<div class="purchase-model-actions"><button type="button" data-purchase-rating="would_wear" aria-pressed="'+(canRate&&rating?.status==='would_wear')+'" '+(!canRate?'disabled':'')+'>'+
      esc(t('purchaseDesktopWear'))+'</button><button type="button" data-purchase-rating="would_not_wear" aria-pressed="'+(canRate&&rating?.status==='would_not_wear')+'" '+(!canRate?'disabled':'')+'>'+
      esc(t('purchaseDesktopNotWear'))+'</button></div>'+
   '<p class="purchase-model-honesty">'+esc(t('purchaseRatingsNote'))+'</p>'+
 '</section>';
}
function desktopVerdict():string {
 const result=computeDecision(session),position=candidatePosition(session);
 const candidate=session.scenario.outerwear.find(item=>item.id===session.candidateId);
 const owned=session.scenario.tops.find(item=>item.id===session.topId);
 const title=position==='none'?t('purchaseOwnEnough'):position==='not_required'?t('purchaseNotNeeded'):
    position==='recommended'?t('purchaseWorthChecking'):position==='unresolved'?t('purchaseNeedRatings'):t('purchaseNotFeasible');
 const reason=position==='none'?t('purchaseZeroWhy'):position==='not_required'?t('purchaseNotNeededWhy'):
    position==='recommended'?t('purchaseRecommendedWhy'):position==='unresolved'?t('purchaseIncompleteWhy'):t('purchaseInfeasibleWhy');
 const cert=result.status==='solved'?result.certificate:null;
 return '<section class="purchase-desktop-verdict" aria-live="polite"><h2>'+esc(title)+'</h2>'+
   '<p class="purchase-desktop-reason">'+esc(reason)+'</p>'+
   '<div class="purchase-desktop-products">'+
     '<figure><span>'+esc(t('purchaseDesktopShop'))+'</span><img src="/assets/items/coat.webp" alt=""/><figcaption>'+esc(candidate?.label??'')+'</figcaption></figure>'+
     '<figure><span>'+esc(t('purchaseDesktopOwn'))+'</span><img src="/assets/items/cashmere.webp" alt=""/><figcaption>'+esc(owned?.label??'')+'</figcaption></figure></div>'+
   '<div class="purchase-desktop-why"><h3>'+esc(t('purchaseWhy'))+'</h3>'+
      '<p>'+esc(t('purchaseCertificateScope',{count:result.evaluatedBasketCount}))+'</p>'+
      '<p>'+esc(cert?(cert.priceOptimality==='proven'?t('purchasePriceProven'):t('purchasePriceProvisional')):t('purchaseNeedRatings'))+'</p>'+
      '<details class="purchase-certificate"><summary>'+esc(t('purchaseDesktopReadCertificate'))+'</summary>'+
      certificateExplanation(result)+'</details></div>'+
   '<button class="button button-primary full-width" data-purchase-choice="skip">'+esc(t('purchaseKeepMine'))+'</button>'+
   '<button class="purchase-desktop-save" data-purchase-choice="save">'+esc(t('purchaseDesktopSave'))+'</button>'+
   '<p class="purchase-desktop-foot">'+esc(t('purchaseNoCheckout'))+'</p></section>';
}
export function purchasePage(): string {
  return '<section class="page purchase-view" aria-labelledby="purchase-title">' +
    '<div class="purchase-intro"><div><h1 id="purchase-title">' + esc(t('purchaseHeadline')) + '</h1>' +
    '<p>' + esc(t('purchaseSubheading')) + '</p></div>' +
    '<div class="purchase-import-actions"><button type="button" data-nav="gallery" class="button button-outline">' + esc(t('purchaseAddPhoto')) + '</button>' +
    '<button type="button" data-nav="gallery" class="button button-primary">' + esc(t('purchasePasteLink')) + '</button></div>' +
    '<div class="purchase-demo-modes" role="group" aria-label="' + esc(t('purchaseChooseDemo')) + '">' +
    (['minimum','zero'] as const).map(mode => '<button type="button" data-purchase-demo="' + mode + '" aria-pressed="' +
      (session.demo === mode) + '" class="' + (session.demo === mode ? 'selected' : '') + '">' +
      esc(t(mode === 'minimum' ? 'purchaseMinimumDemo' : 'purchaseZeroDemo')) + '</button>').join('') +
    '</div></div>' +
    '<div class="purchase-data-strip"><span>' + esc(t('purchaseDemoOnly')) + '</span>' +
    '<span>' + esc(t(session.ratingsOrigin === 'example' ? 'purchaseExampleRatings' : 'purchaseEditedRatings')) + '</span>' +
    '<button type="button" data-purchase-clear>' + esc(t('purchaseClearRatings')) + '</button>' +
    '<button type="button" data-purchase-replay>' + esc(t('purchaseReplayRatings')) + '</button></div>' +
    '<div class="purchase-layout">' + candidateButtons() + previewColumn() + verdictColumn() + '</div>'+
    '<div class="purchase-desktop-layout">' + candidateButtons() + desktopPreview() + desktopVerdict() + '</div>'+
    '<div class="purchase-desktop-meta">' +
      '<details><summary>'+esc(t('purchaseDemoOnly'))+'</summary>'+
      '<div class="purchase-demo-modes" role="group">'+(['minimum','zero'] as const).map(mode=>
        '<button data-purchase-demo="'+mode+'" aria-pressed="'+(session.demo===mode)+'">'+esc(t(mode==='minimum'?'purchaseMinimumDemo':'purchaseZeroDemo'))+'</button>').join('')+'</div>'+
      '<p>'+esc(t(session.ratingsOrigin==='example'?'purchaseExampleRatings':'purchaseEditedRatings'))+'</p>'+
      '<button data-purchase-clear>'+esc(t('purchaseClearRatings'))+'</button> '+
      '<button data-purchase-replay>'+esc(t('purchaseReplayRatings'))+'</button></details></div></section>';
}
export function handlePurchaseClick(button: HTMLElement, actions: Actions): boolean {
  try {
    if (button.dataset.purchaseDemo) {
      session = choosePurchaseDemo(session, button.dataset.purchaseDemo as PurchaseDemo);
    } else if (button.dataset.purchaseCandidate) {
      session = selectCandidate(session, button.dataset.purchaseCandidate);
    } else if (button.hasAttribute('data-purchase-next') || button.hasAttribute('data-purchase-prev')) {
      const list=session.scenario.outerwear.filter(item=>item.kind==='candidate');
      const index=list.findIndex(item=>item.id===session.candidateId);
      const diff=button.hasAttribute('data-purchase-next')?1:list.length-1;
      if(list.length) session=selectCandidate(session,list[(index+diff)%list.length]!.id);
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
