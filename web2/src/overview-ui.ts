import {
  chooseDecision, localISODate, overviewFor, storeDecisions,
  type DailyState, type DecisionsState, type GarmentDecision,
} from './daily.js';
import { AVAILABILITY, availabilityLabel, categoryLabel, setAvailability, type WardrobeItem, type WardrobeState } from './state.js';
import { morningLooks, type AttentionItem } from './daily.js';
import { recordedPreviewForItem } from './stylist.js';
import { loadSaved } from './stylist.js';
import { t, type TranslationKey } from './i18n.js';
import './daily.css';

type Actions={
  readonly wardrobe:WardrobeState;readonly decisions:DecisionsState;
  readonly storage:Pick<Storage,'getItem'|'setItem'>|undefined;
  readonly updateDecisions:(next:DecisionsState)=>void;
  readonly updateWardrobe:(next:WardrobeState)=>void;
  readonly rerender:()=>void;readonly notice:(value:string)=>void;
  readonly navigate:(path:string)=>void;
};
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
const draw=(item:WardrobeItem):string=>{
  const saved=recordedPreviewForItem(item.id);
  return item.photo?'<img src="/assets/items/'+esc(item.photo)+'.webp" loading="lazy" alt="'+esc(item.name)+'"/>':
    saved?'<img src="'+esc(saved)+'" loading="lazy" alt="'+esc(item.name)+'"/>':
    '<span class="overview-no-photo">'+esc(t('noPhoto'))+'</span>';
};
let selectedOverviewMonth: string | null = null;
function activeOverviewMonth(): string {
  return selectedOverviewMonth ?? localISODate(new Date()).slice(0,7);
}
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
/** English, explicitly selected month names instead of a locale-dependent
 * native type=month widget. Only recorded months + the last two years appear.
 * A month with no wears still truthfully reports zero recorded wears. */
export function overviewMonthOptions(
  daily: DailyState, today: Date = new Date(),
): readonly { readonly value: string; readonly label: string }[] {
  const months = new Set<string>();
  for (let offset = 0; offset < 24; offset++) {
    months.add(localISODate(new Date(today.getFullYear(),today.getMonth()-offset,1)).slice(0,7));
  }
  for (const wear of daily.wears) months.add(wear.date.slice(0,7));
  if (selectedOverviewMonth) months.add(selectedOverviewMonth);
  const formatter = new Intl.DateTimeFormat('en-US',{
    month:'long',year:'numeric',timeZone:'UTC',
  });
  return [...months].filter(month=>MONTH_KEY.test(month))
    .sort((a,b)=>b.localeCompare(a)).map(value=>({
      value,
      label:formatter.format(new Date(Date.UTC(Number(value.slice(0,4)),Number(value.slice(5,7))-1,1))),
    }));
}
export function handleOverviewMonthChange(control: Pick<HTMLSelectElement,'id'|'value'>): boolean {
  if (control.id !== 'overview-month') return false;
  if (MONTH_KEY.test(control.value)) selectedOverviewMonth=control.value;
  return true;
}
const reasons:Readonly<Record<AttentionItem['kind'],TranslationKey>>={
  repair:'overviewNeedsRepair',ironing:'overviewNeedsIroning',no_log:'overviewNoLoggedWear',
};
function attentionRow(item:WardrobeItem,kind:AttentionItem['kind']):string{
  const label=kind==='no_log'?t('overviewLogNotProof'):availabilityLabel(item.availability);
  const demoCondition=['coat','dress','bag'].includes(item.id)&&kind!=='no_log';
  return '<button type="button" class="overview-attention-row" data-overview-review="'+esc(item.id)+'">'+
    '<span class="overview-attention-image">'+draw(item)+'</span><span class="overview-attention-content">'+
    '<small>'+esc(t(demoCondition?'overviewSampleStatus':reasons[kind]))+'</small><strong>'+esc(item.name)+'</strong><span>'+esc(label)+'</span></span>'+
    '<span class="overview-attention-action">'+esc(t(kind==='repair'?'overviewPlanRepair':'overviewBrowseItem'))+'</span>'+
    '<span class="overview-attention-arrow" aria-hidden="true">→</span></button>';
}
export function overviewPage(wardrobe:WardrobeState,daily:DailyState,decisions:DecisionsState):string{
  const month=activeOverviewMonth();
  const metrics=overviewFor(wardrobe,daily,decisions,month+'-01');
  const suggested=morningLooks(wardrobe)[0];
  const imagePath=suggested?.heroImagePath??null;
  const profile=wardrobe.style||t('overviewNoProfile');
  const insight=metrics.loggedWearEntries>0?t('overviewLoggedNote'):t('overviewNoHistory');
  return '<section class="page overview-view" aria-labelledby="overview-title"><header class="overview-header">'+
    '<div><p class="overview-eyebrow">'+esc(t('overviewEyebrow'))+'</p><h1 id="overview-title">'+esc(t('overviewTitle'))+'</h1>'+
    '<p>'+esc(t('overviewSubtitle'))+'</p></div>'+
    '<button class="button button-primary overview-add" data-nav="add" type="button">+ '+esc(t('addItem'))+'</button></header>'+
    '<div class="overview-tabs"><button type="button" data-nav="overview" aria-current="page">'+esc(t('overviewTab'))+'</button>'+
    '<button type="button" data-nav="wardrobe">'+esc(t('overviewAllThings'))+'</button>'+
    '<label class="overview-month-control" for="overview-month"><span>'+esc(t('overviewMonthLabel'))+'</span>'+
    '<select id="overview-month" aria-label="'+esc(t('overviewChooseMonth'))+'">'+
      overviewMonthOptions(daily).map(option=>
        '<option value="'+esc(option.value)+'"'+(option.value===month?' selected':'')+'>'+
          esc(option.label)+'</option>').join('')+
    '</select></label></div>'+
    '<div class="overview-metrics">'+
    '<div><strong>'+metrics.items+'</strong><span>'+esc(t('overviewMetricItems'))+'</span></div>'+
    '<div><strong>'+metrics.loggedThisMonth+'</strong><span>'+esc(t('overviewMetricWorn'))+'</span></div>'+
    '<div><strong>'+metrics.awaitingUser+'</strong><span>'+esc(t('overviewMetricWaiting'))+'</span></div></div>'+
    '<p class="overview-evidence">'+esc(insight)+'</p>'+
    '<div class="overview-columns"><div class="overview-left"><h2>'+esc(t('overviewAttention'))+'</h2>'+
    (metrics.attention.length?'<div class="overview-attention-list">'+metrics.attention.map(record=>{
      const item=wardrobe.items.find(x=>x.id===record.id);
      return item?attentionRow(item,record.kind):'';
    }).join('')+'</div>':'<p class="overview-empty">'+esc(t('overviewNothingFlagged'))+'</p>')+
    '<section class="overview-gap"><h2>'+esc(t('overviewRealGaps'))+'</h2>'+
    '<p>'+esc(t('overviewMissingUnknown'))+'</p>'+
    '<button class="text-link" type="button" data-nav="check">'+esc(t('overviewCheckBeforeBuying'))+' →</button>'+
    '<p class="overview-evidence">'+esc(t('overviewGapProof'))+'</p></section>'+
    (metrics.categoryOverlap.length?'<section class="overview-categories"><h3>'+esc(t('overviewCompareCategory'))+'</h3>'+
    '<p>'+esc(t('overviewOverlapOnly'))+'</p>'+
    '<p>'+metrics.categoryOverlap.map(key=>esc(categoryLabel(key as WardrobeItem['category']))).join(' · ')+'</p></section>':'')+
    '</div><aside class="overview-today"><div class="overview-today-photo">'+
    (imagePath?'<img src="'+esc(imagePath)+'" alt="'+esc(t('morningSinglePreview'))+'" loading="lazy"/>'+
      '<span class="overview-photo-badge">'+esc(t('morningOneGarmentBadge'))+'</span>':
      '<div class="overview-no-photo">'+esc(t('stylistUnrendered'))+'</div>')+
    '</div><h2>'+esc(t('overviewFromYourWardrobe'))+'</h2>'+
    '<p>'+esc(suggested?suggested.itemIds.map(id=>wardrobe.items.find(x=>x.id===id)?.name??id).join(' · '):t('morningNoneReady'))+'</p>'+
    '<button type="button" class="button button-primary full-width" data-nav="morning">'+esc(t('overviewMorningCTA'))+'</button>'+
    '<p class="overview-evidence">'+esc(t('morningSinglePreview'))+'</p>'+
    '<button class="text-link" data-nav="profile" type="button">'+esc(t('overviewAdjustStyle'))+' →</button>'+
    '<p class="overview-profile">'+esc(profile)+'</p></aside></div>'+
    '<p class="overview-bottom-note">'+esc(t('overviewUserDecides'))+'</p></section>';
}
let stagedFor:string|null=null;
let staged:GarmentDecision|null=null;
export function reviewItemPage(id:string,wardrobe:WardrobeState,daily:DailyState,decisions:DecisionsState,
  storage?:Pick<Storage,'getItem'>):string{
  const item=wardrobe.items.find(row=>row.id===id);
  if(!item)return '<section class="page"><h1>'+esc(t('missingItem'))+'</h1><button data-nav="overview">'+esc(t('overviewTitle'))+'</button></section>';
  if(stagedFor!==id){stagedFor=id;staged=null;}
  const chosen=staged??decisions.entries.find(entry=>entry.itemId===id)?.decision??null;
  const matching=loadSaved(storage).filter(look=>look.itemIds.includes(id));
  const log=daily.wears.filter(entry=>entry.itemIds.includes(id));
  return '<section class="page review-item-view" aria-labelledby="review-item-title">'+
    '<button type="button" class="back-link" data-nav="overview">← '+esc(t('overviewBack'))+'</button>'+
    '<h1 id="review-item-title">'+esc(item.name)+'</h1>'+
    '<div class="review-item-photo">'+draw(item)+'</div>'+
    '<p class="overview-evidence">'+esc(t('overviewWearSummary',{count:log.length}))+
    (log.length?' · '+esc(t('overviewLastLogged',{date:log[0]!.date})):'')+'</p>'+
    '<section class="review-status"><h2>'+esc(t('overviewCondition'))+'</h2>'+
    '<p>'+esc(t('overviewConditionManual'))+'</p>'+
    '<div class="review-status-buttons" role="group" aria-label="'+esc(t('statusControl'))+'">'+
    (Object.keys(AVAILABILITY) as Array<keyof typeof AVAILABILITY>).map(key=>
      '<button type="button" data-status="'+key+'" data-status-item="'+esc(item.id)+'" aria-pressed="'+(item.availability===key)+
      '" class="'+(item.availability===key?'selected':'')+'">'+esc(availabilityLabel(key))+'</button>').join('')+'</div></section>'+
    '<section class="review-decision"><h2>'+esc(t('overviewWhatNext'))+'</h2>'+
    '<div class="review-decision-options" role="radiogroup" aria-label="'+esc(t('overviewDecisionLabel'))+'">'+
    ([['keep','overviewKeep'],['repair','overviewRepair'],['donate','overviewDonate'],['sell','overviewSell']] as const)
      .map(([key,label])=>'<button type="button" role="radio" aria-checked="'+(chosen===key)+
        '" tabindex="'+(chosen===key||(!chosen&&key==='keep')?'0':'-1')+'" class="'+(chosen===key?'selected':'')+'" data-overview-decision="'+key+'">'+esc(t(label))+'</button>').join('')+'</div>'+
    '<p>'+esc(t('overviewIntentNotDisposal'))+'</p>'+
    '<button type="button" class="button button-primary full-width" data-overview-save '+(!chosen?'disabled':'')+'>'+
    esc(t('overviewSaveDecision'))+'</button>'+
    '</section><p class="overview-evidence">'+esc(t('overviewSavedLooks',{count:matching.length}))+'</p>'+
    '<button type="button" class="text-link" data-nav="saved">'+esc(t('savedLooks'))+' →</button></section>';
}
export function handleOverviewClick(button:HTMLElement,actions:Actions):boolean{
  const d=button.dataset;
  if(d.overviewReview){
    staged=null;stagedFor=null;actions.navigate('review/'+d.overviewReview);return true;
  }
  if(d.overviewDecision&&['keep','repair','donate','sell'].includes(d.overviewDecision)){
    staged=d.overviewDecision as GarmentDecision;
  }else if(button.hasAttribute('data-overview-save')){
    if(!stagedFor)return true;
    const current=staged??actions.decisions.entries.find(entry=>entry.itemId===stagedFor)?.decision;
    if(!current)return true;
    try{
      const next=chooseDecision(actions.decisions,actions.wardrobe,stagedFor,current,localISODate(new Date()));
      actions.updateDecisions(next);
      if(!storeDecisions(next,actions.storage))actions.notice(t('localStorageDenied'));
      else actions.notice(t('overviewDecisionSaved'));
      if(current==='repair'){
        actions.updateWardrobe(setAvailability(actions.wardrobe,stagedFor,'needs_repair'));
      }
      staged=null;
    }catch(e){actions.notice(e instanceof Error?e.message:t('dailyInvalidDecision'));}
  }else return false;
  actions.rerender();return true;
}
