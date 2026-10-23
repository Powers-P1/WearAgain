import {
  demoLooks, loadSaved, persistSaved, proposeLooks, saveChosen, verifyLooks,
  type SavedLook, type StylistBrief, type StylistResult, type OccasionSuggestion,
} from './stylist.js';
import { initialState, type WardrobeState, type WardrobeItem } from './state.js';
import { outfitVisual, outfitBoard,itemPicture } from './ui.js';
import {startLiveAgent,resumeLiveAgent,savedAgentRequest,agentPreviewImage} from './agent-client.js';
import {activeProfile} from './profiles.js';
import {remember} from './memory.js';
import {PROCEDURES,record} from '../../src/agent/contract.js';
import type {AgentResult,Procedure} from '../../src/agent/contract.js';
import { stageTripLook } from './plans.js';
import './outfit-media.css';
import { t } from './i18n.js';
import './stylist.css';

type UIActions = {
  readonly wardrobe: WardrobeState;
  readonly storage: Storage | undefined;
  readonly rerender: () => void;
  readonly notice: (message: string) => void;
  readonly navigate?: (path: string) => void;
  readonly wear?: (look: OccasionSuggestion) => void;
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
let agentMode:'demo'|'live'|null=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('stylist')==='live'?'live':null,agentBusy=false,agentNotice='',agentSessionId='';
let procedure:Procedure='occasion',locationText='',allowPhotos=false,allowRenders=false;
let latestAgent:AgentResult|null=null,restored=false;
const previewUrls=new Map<string,string>();
function ownProfile(){let base:Storage|undefined;try{base=window.localStorage;}catch{}return activeProfile(base);}
function agentInput(actions:UIActions,message:string,previous=false){return {profile:ownProfile(),wardrobe:actions.wardrobe,storage:actions.storage,message,procedure,location:locationText,date:brief.date,allowPhotos,allowRenders,...(previous&&agentSessionId?{previousSessionId:agentSessionId}:{}),onEvent:(event:{message:string})=>{agentNotice=event.message;if(window.location.hash==='#stylist')actions.rerender();}};}
function acceptAgent(value:{sessionId:string;result:AgentResult},actions:UIActions){
 latestAgent=value.result;agentSessionId=value.sessionId;
 if(value.result.status!=='completed'||!value.result.answer){agentNotice='Live AI stopped before a complete proposal. Your existing saved data and ratings are unchanged.';return;}
 result=verifyLooks(value.result.answer.looks,actions.wardrobe,'agent');generated=true;selected=0;agentMode='live';saved=null;
 agentNotice=value.result.answer.reply;
}
export function stageStylistRequest(occasion:string):void{brief={...brief,occasion:occasion.slice(0,500)};agentMode='live';generated=false;}

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
  return itemPicture(item);
}
function validResult(wardrobe: WardrobeState): StylistResult {
  if (result) {
    try {
      result = verifyLooks(result.looks, wardrobe, result.source);
      return result;
    } catch {
      generated = false;
      if(result.source==='agent'){result=null;agentNotice='Your wardrobe changed. The previous AI look no longer passes availability checks. Ask for an updated proposal.';return {source:'agent',looks:[],verified:true};}
    }
  }
  result = demoLooks(wardrobe);
  selected = 0;
  return result;
}
function briefForm(wardrobe: WardrobeState): string {
  return '<form id="stylist-form" class="stylist-form'+(agentMode==='live'?' stylist-live':'')+'">' +
    '<h2>' + escapeHtml(t('stylistOccasion')) + '</h2>' +
    '<p class="stylist-form-note">' + escapeHtml(t('stylistDescribe')) + '</p>' +
    '<label class="visually-hidden" for="occasion-input">' + escapeHtml(t('stylistOccasion')) + '</label>' +
    '<textarea id="occasion-input" name="occasion" maxlength="500" required rows="5"'+(agentBusy?' disabled':'')+'>' + escapeHtml(brief.occasion) + '</textarea>' +
    '<div class="occasion-suggestions"><button type="button" data-occasion="work">' + escapeHtml(t('stylistWork')) + ' ' + svg('arrow') + '</button>' +
    '<button type="button" data-nav="trip">' + escapeHtml(t('stylistWeekend')) + ' ' + svg('arrow') + '</button></div>' +
    '<details class="stylist-context"><summary>Date and saved style</summary><label class="stylist-date">' + svg('calendar') + '<span class="visually-hidden">' + escapeHtml(t('stylistDate')) + '</span>' +
    '<input type="date" name="date" value="' + escapeHtml(brief.date) + '" aria-label="' + escapeHtml(t('stylistDate')) + '" /></label>' +
    '<div class="stylist-style-row"><div><strong>' + escapeHtml(t('stylistStyleLabel')) + '</strong>' +
    '<p>' + escapeHtml(wardrobe.style === t('defaultStyle') ? t('stylistStyleSummary') : wardrobe.style) + '</p></div>' +
    '<button type="button" data-nav="profile">' + escapeHtml(t('stylistChange')) + '</button></div>' +
    '<p class="stylist-owned">' + svg('hanger') + ' ' + escapeHtml(t('stylistStartOwned')) + '</p></details>' +
    '<div class="agent-controls"><label for="stylist-mode">Stylist mode<select id="stylist-mode" name="mode"'+(agentBusy?' disabled':'')+'><option value="demo"'+(agentMode==='demo'?' selected':'')+'>Saved example · no network</option><option value="live"'+(agentMode==='live'?' selected':'')+'>Live AI · my wardrobe and memory</option></select></label>'+
    (agentMode==='live'?'<label for="stylist-procedure">What would you like to do?<select id="stylist-procedure" name="procedure">'+Object.entries(PROCEDURES).map(([id,row])=>'<option value="'+id+'"'+(id===procedure?' selected':'')+'>'+escapeHtml(row.title)+'</option>').join('')+'</select></label><details><summary>Location, photos and paid preview settings</summary><label for="stylist-city">City, if relevant<input id="stylist-city" name="city" type="text" maxlength="100" value="'+escapeHtml(locationText)+'" placeholder="e.g. Warsaw"></label><label><input type="checkbox" name="allowPhotos"'+(allowPhotos?' checked':'')+'>Send my clothing photos for this session. They contain garments only, without faces.</label><label><input type="checkbox" name="allowRenders"'+(allowRenders?' checked':'')+'>Allow up to four new YouCam previews (eight credits). Clothing photos must be enabled.</label><p class="agent-status">Claude reads your profile, memory, available clothes and optional clothing photos. Photos sent for the agent are retained by our Worker for up to six hours and by providers under their own policies. AI styling opinions are separate from your ratings and the basket certificate.</p></details>':'')+'</div>'+
    '<button type="submit" class="button button-primary full-width"'+(agentBusy?' disabled':'')+'>' + escapeHtml(agentBusy?'Working…':agentMode==='live'?'Ask my stylist':t(generated ? 'stylistChangeSuggestions' : 'stylistShowLooks')) + ' ' + svg('arrow') + '</button>' +
    '<p class="stylist-footnote">' + escapeHtml(agentMode==='live'?'Live Sonnet 5.5 · 30 sessions/day, three per live token; twelve tools/session. Weather and merchant facts stay UNKNOWN when absent.':t('stylistNoNetwork')) + '</p></form>';
}
function lookPreview(wardrobe: WardrobeState, selection: StylistResult): string {
  const look = selection.looks[selected];
  if(!look&&agentMode==='live')return '<section class="stylist-empty"'+(agentBusy?' aria-busy="true"':'')+'><h2>'+escapeHtml(agentBusy?'Your stylist is preparing your looks.':latestAgent?.answer?'Your stylist needs more information for a complete look.':wardrobe.items.length?'Start with what you own.':'Add your first wardrobe pieces.')+'</h2><p>'+escapeHtml(agentBusy?'Checking your current clothes, availability and preferences. You can reopen this same session after leaving the screen.':latestAgent?.answer?'Review the stylist’s notes above, or update your available clothes.':wardrobe.items.length?'Describe the occasion. Your stylist will check your actual wardrobe before proposing a look.':'Add the clothes you want your stylist to use, then describe the occasion.')+'</p>'+(!agentBusy?'<button class="button button-outline" type="button" data-nav="wardrobe">'+escapeHtml(t('goBackWardrobe'))+'</button>':'')+'</section>';
  if (!look) return '<section class="stylist-empty"><h2>' + escapeHtml(t('stylistUnavailable')) + '</h2>' +
    '<button class="button button-outline" type="button" data-nav="wardrobe">' + escapeHtml(t('goBackWardrobe')) + '</button></section>';
  const owned = look.itemIds
    .map(id => wardrobe.items.find(item => item.id === id))
    .filter((item): item is WardrobeItem => !!item);
  const image = selection.source==='agent'?outfitBoard(look.itemIds,wardrobe):outfitVisual(look.itemIds, wardrobe);
  return '<section class="stylist-result"><div class="stylist-preview-column">' +
    '<div class="stylist-progress"><span>' + escapeHtml(t('stylistSuggestion',{index:selected+1,count:selection.looks.length})) + '</span>' +
    '<div class="stylist-arrows"><button type="button" data-look-prev aria-label="' + escapeHtml(t('stylistPrevious')) + '">' + svg('left') + '</button>' +
    '<button type="button" data-look-next aria-label="' + escapeHtml(t('stylistNext')) + '">' + svg('arrow') + '</button></div></div>' +
    '<div class="stylist-photo">' + image + '</div>' +
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
    '<button type="button" class="stylist-trip-link" data-save-trip>' + escapeHtml(t('stylistSaveTrip')) + '</button>' +
    (selection.source==='agent'?'<button type="button" class="text-link" data-agent-refine>Adjust this look →</button>':'')+
    '<button type="button" class="text-link stylist-next-link" data-look-next>' + escapeHtml(t('stylistChangeLook')) + ' ' + svg('arrow') + '</button>' +
    '<p class="stylist-disclaimer">' + escapeHtml(t('outfitBoardNote')) + '</p>' +
    (look.heroImagePath ? '<details class="stylist-preview-detail"><summary>' + escapeHtml(t('outfitRecordedDetail')) + '</summary><img src="' + escapeHtml(look.heroImagePath) + '" alt="' + escapeHtml(t('stylistSavedRender')) + '" /><p>' + escapeHtml(t('stylistImageNote')) + '</p></details>' : '') +
    '<p class="stylist-disclaimer">' + escapeHtml(selection.source==='agent'?'Live AI styling · available owned pieces verified. Subjective style, weather assumptions and human pair ratings remain separate.':t('stylistDemoNote')) + '</p></div></section>';
}
export function stylistPage(wardrobe: WardrobeState,storage?:Storage,rerender?:()=>void): string {
  agentMode??=wardrobe.exampleMode===false?'live':'demo';
  if(!restored&&storage){restored=true;const previous=savedAgentRequest(storage);if(previous){
    try{const raw=JSON.parse(previous.body) as {message:string;procedure:Procedure;snapshot:{date:string;location:string;profile:{style:string}}};brief={occasion:raw.message.slice(0,500),date:raw.snapshot.date,style:raw.snapshot.profile.style};procedure=raw.procedure;locationText=raw.snapshot.location;}catch{}
    agentMode='live';agentBusy=true;queueMicrotask(()=>{const actions:UIActions={wardrobe,storage,rerender:rerender??(()=>{}),notice:()=>{}};void resumeLiveAgent(agentInput(actions,brief.occasion)).then(value=>{if(value)acceptAgent(value,actions);}).catch(e=>{agentNotice=e instanceof Error?e.message:'Cannot resume the previous session.';}).finally(()=>{agentBusy=false;if(window.location.hash==='#stylist')actions.rerender();});});}}
  const selection = validResult(wardrobe);
  return '<section class="page stylist-view ' + (generated ? 'show-result' : 'show-brief') + '" aria-labelledby="stylist-title">' +
    (generated ? '<div class="stylist-result-appbar"><button type="button" data-stylist-reset aria-label="' + escapeHtml(t('stylistBackToBrief')) + '">←</button>'+
    '<span>' + escapeHtml(t('stylistResultAppbar')) + '</span><button type="button" data-save-look aria-label="' + escapeHtml(t('stylistBookmarkLook')) + '">' + svg('bookmark') + '</button></div>' : '') +
    '<div class="stylist-intro"><div><h1 id="stylist-title">' + escapeHtml(t('stylistPageTitle')) + '</h1>' +
    '<p>' + escapeHtml(t('stylistHeaderSubtitle')) + '</p></div>' +
    '<button type="button" class="text-link stylist-saved-link" data-nav="saved">' + escapeHtml(t('stylistSavedLink')) + ' ' + svg('arrow') + '</button></div>' +
    '<button type="button" class="stylist-mobile-back" data-stylist-reset>' + svg('left') + ' ' + escapeHtml(t('stylistBackToBrief')) + '</button>' +
    (agentBusy?'<p role="status" class="agent-progress">'+escapeHtml(agentNotice||'Checking your wardrobe and memory…')+'</p>':agentNotice?'<p role="status" class="agent-status">'+escapeHtml(generated&&latestAgent?.answer?agentNotice.split(/(?<=[.!?])\s/)[0]??agentNotice:agentNotice)+'</p>'+(generated&&latestAgent?.answer?'<details class="agent-notes"><summary>Stylist notes'+(latestAgent.answer.missing.length?' · '+latestAgent.answer.missing.length+' details to check':'')+'</summary><p>'+escapeHtml(agentNotice)+'</p><ul>'+latestAgent.answer.missing.map(s=>'<li>'+escapeHtml(s)+'</li>').join('')+'</ul></details>':''):'')+
    '<div class="stylist-layout">' + briefForm(wardrobe) + lookPreview(wardrobe,selection) + '</div>'+
    (latestAgent?.answer?'<details class="agent-requirements"><summary>Refine my outfit</summary><h2>Your preferences for this look</h2><p>Edit these assumptions or tell your stylist what should change. Your own purchase ratings stay yours.</p><form id="agent-feedback-form"><ul>'+latestAgent.answer.requirements.map((r,i)=>'<li><label for="agent-need-'+i+'"><input id="agent-need-'+i+'" name="requirement" value="'+escapeHtml(r.label)+'" maxlength="160"></label><p>'+escapeHtml(r.status+' · '+r.reason)+'</p></li>').join('')+'</ul><label for="agent-feedback">What should change?</label><textarea name="feedback" id="agent-feedback" maxlength="1000" rows="3" required placeholder="Less formal, use my navy shirt, and remember I avoid wool…"'+(agentBusy?' disabled':'')+'></textarea><button class="button button-primary" type="submit"'+(agentBusy?' disabled':'')+'>Revise my proposal</button></form><details><summary>How this was checked</summary><p>'+latestAgent.usage.modelCalls+' model steps · '+latestAgent.usage.toolCalls+' tools · '+latestAgent.usage.outputTokens+' output tokens</p></details>'+renderAgentPreviews()+'</details>':'')+
    (agentMode==='live'&&!agentBusy?'<button class="text-link" type="button" data-agent-resume>Reopen last live result</button>':'')+'</section>';
}
function renderAgentPreviews():string{
 return latestAgent?.renders.length?'<div class="agent-render-list">'+latestAgent.renders.map(raw=>{if(!record(raw)||typeof raw.renderKey!=='string')return '<p>Preview outcome UNKNOWN. No automatic retry or refund.</p>';const url=previewUrls.get(raw.renderKey);return '<article>'+(url?'<img src="'+escapeHtml(url)+'" alt="Actual YouCam garment preview">':'<p>Separate garment preview · '+escapeHtml(String(raw.status))+'</p>')+'<button class="button button-outline" type="button" data-agent-preview="'+raw.renderKey+'">Check / show preview</button><p>Reserved or charged units remain governed by UnitLedger.</p></article>';}).join('')+'</div>':'';
}
export function savedPage(storage?: Pick<Storage, 'getItem'>, wardrobe: WardrobeState = initialState(), detailId = ''): string {
  if (saved === null) saved = loadSaved(storage);
  if (detailId) {
    const look = saved.find(entry => entry.id === detailId);
    if (!look) return '<section class="page"><h1>' + escapeHtml(t('savedMissing')) + '</h1><button class="text-link" data-nav="saved">' + escapeHtml(t('savedBack')) + '</button></section>';
    const ready = look.itemIds.every(id => wardrobe.items.some(item => item.id === id && item.availability === 'ready'));
    return '<section class="page saved-detail-view"><button class="back-link" data-nav="saved">' + svg('left') + escapeHtml(t('savedBack')) + '</button><h1>' + escapeHtml(look.title) + '</h1><p class="intro-subtitle">' + escapeHtml(look.occasion) + '</p>' +
      '<div class="saved-detail-layout">' + outfitVisual(look.itemIds, wardrobe) + '<div><h2>' + escapeHtml(t('stylistAllOwned')) + '</h2>' +
      look.itemIds.map(id => wardrobe.items.find(item => item.id === id)).filter((item): item is WardrobeItem => !!item).map(item => '<div class="stylist-garment"><span class="stylist-item-photo">' + picture(item) + '</span><span>' + escapeHtml(item.name) + '</span></div>').join('') +
      (!ready ? '<p class="notice">' + escapeHtml(t('savedUnavailable')) + '</p>' : '') +
      '<div class="saved-detail-actions"><button class="button button-primary" data-saved-wear="' + escapeHtml(look.id) + '" ' + (!ready ? 'disabled' : '') + '>' + escapeHtml(t('savedWear')) + '</button>' +
      '<button class="button button-outline" data-saved-trip="' + escapeHtml(look.id) + '">' + escapeHtml(t('stylistSaveTrip')) + '</button></div></div></div></section>';
  }
  return '<section class="page saved-view"><h1>' + escapeHtml(t('stylistOutfitList')) + '</h1>' +
    '<p class="intro-subtitle">' + escapeHtml(t(saved.length===1?'stylistSavedCountOne':'stylistSavedCount',{count:saved.length})) + '</p>' +
    (saved.length ? '<div class="saved-look-list">' + saved.map(look =>
      '<article class="saved-look-item">' + outfitVisual(look.itemIds, wardrobe, true) + '<h2>' + escapeHtml(look.title) + '</h2><p>' +
      escapeHtml(look.occasion) + '</p>' +
      (look.date ? '<p>' + escapeHtml(t('stylistSavedWhen',{date:look.date})) + '</p>' : '') +
      '<p>' + escapeHtml(t(look.itemIds.length===1?'stylistSavedItemsOne':'stylistSavedItems',{count:look.itemIds.length})) + '</p><div class="saved-look-actions"><button class="button button-outline" data-saved-open="' + escapeHtml(look.id) + '">' + escapeHtml(t('savedOpen')) + '</button><button data-saved-remove="' + escapeHtml(look.id) + '">' + escapeHtml(t('savedRemove')) + '</button></div></article>').join('') + '</div>' :
      '<p class="no-results">' + escapeHtml(t('stylistNoSaved')) + '</p>') +
    '<button type="button" class="button button-outline" data-nav="stylist">' + escapeHtml(t('stylistPageTitle')) +
    ' ' + svg('arrow') + '</button></section>';
}
/** Return true if the click belongs to this workspace, without intercepting global navigation. */
export function handleStylistClick(target: HTMLElement, actions: UIActions): boolean {
  if(target.hasAttribute('data-agent-refine')){const details=document.querySelector<HTMLDetailsElement>('.agent-requirements');if(details){details.open=true;details.scrollIntoView({behavior:'smooth',block:'start'});document.getElementById('agent-feedback')?.focus({preventScroll:true});}return true;}
  else if(target.hasAttribute('data-agent-resume')){
    if(agentBusy)return true;agentBusy=true;void resumeLiveAgent(agentInput(actions,brief.occasion)).then(value=>{if(value)acceptAgent(value,actions);else agentNotice='No previous live session is saved for this profile.';}).catch(e=>{agentNotice=e instanceof Error?e.message:'Could not resume.';}).finally(()=>{agentBusy=false;actions.rerender();});actions.rerender();return true;
  }else if(target.dataset.agentPreview){const key=target.dataset.agentPreview;void agentPreviewImage(key,actions.storage).then(value=>{if(value.url){const old=previewUrls.get(key);if(old)URL.revokeObjectURL(old);previewUrls.set(key,value.url);}else actions.notice('Preview is still '+value.status+'. No new task was started.');}).catch(e=>actions.notice(e instanceof Error?e.message:'Preview unavailable.')).finally(actions.rerender);return true;
  }else if (target.dataset.savedOpen) {
    actions.navigate?.('saved/' + target.dataset.savedOpen); return true;
  } else if (target.dataset.savedRemove) {
    saved = (saved ?? loadSaved(actions.storage)).filter(look => look.id !== target.dataset.savedRemove);
    actions.notice(persistSaved(saved, actions.storage) ? t('savedRemoved') : t('stylistSaveFailed'));
  } else if (target.dataset.savedWear || target.dataset.savedTrip) {
    const entry = (saved ?? loadSaved(actions.storage)).find(look => look.id === (target.dataset.savedWear ?? target.dataset.savedTrip));
    if (entry) {
      const look = { ...entry, explanation: entry.occasion || entry.title, heroImagePath: null };
      if (target.dataset.savedWear) actions.wear?.(look);
      else { stageTripLook(look); actions.navigate?.('trip'); return true; }
    }
  } else if (target.hasAttribute('data-save-trip')) {
    const look = validResult(actions.wardrobe).looks[selected];
    if (look) { stageTripLook(look); actions.navigate?.('trip'); return true; }
  } else if (target.hasAttribute('data-stylist-reset')) {
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
      if(result?.source==='agent')try{remember(actions.storage,{id:'decision_'+crypto.randomUUID().replaceAll('-',''),kind:'decision',text:'I explicitly saved “'+look.title+'” for '+brief.occasion.slice(0,200)+'. Items: '+look.itemIds.join(', ')+'. This records a choice, not a wear or purchase.',updatedAt:new Date().toISOString()});}catch{/* Saved outfit is still available. */}
    }
  } else return false;
  actions.rerender();
  return true;
}
export function submitStylist(form: HTMLFormElement, actions: UIActions): void {
  if(agentBusy)return;
  const values = new FormData(form);
  brief = {
    occasion: String(values.get('occasion') ?? ''),
    date: String(values.get('date') ?? ''),
    style: actions.wardrobe.style,
  };
  const token = ++requestSequence;
  if(values.get('mode')==='live'){
    agentMode='live';procedure=Object.hasOwn(PROCEDURES,String(values.get('procedure')))?String(values.get('procedure')) as Procedure:'occasion';locationText=String(values.get('city')??'');allowPhotos=values.get('allowPhotos')==='on';allowRenders=allowPhotos&&values.get('allowRenders')==='on';agentBusy=true;agentNotice='Checking your wardrobe and saved preferences…';actions.rerender();
    void startLiveAgent(agentInput(actions,brief.occasion)).then(value=>{if(token===requestSequence)acceptAgent(value,actions);}).catch(e=>{agentNotice=e instanceof Error?e.message:'Live AI unavailable. Your data is unchanged.';}).finally(()=>{agentBusy=false;if(window.location.hash==='#stylist')actions.rerender();});return;
  }
  agentMode='demo';
  // No network request: default adapter is an offline verified demo.
  void proposeLooks(brief, actions.wardrobe).then(next => {
    if (token !== requestSequence) return;
    result = next;
    generated = true;
    selected = 0;
    actions.rerender();
    if(window.location.hash==='#stylist')window.scrollTo({top:0,behavior:'instant'});
  }).catch(error => {
    if (token !== requestSequence) return;
    actions.notice(error instanceof Error ? error.message : t('stylistInvalidProposal'));
    actions.rerender();
  });
}
export function stylistChange(input:HTMLElement,rerender:()=>void):boolean{
 if(input instanceof HTMLSelectElement&&input.id==='stylist-mode'){agentMode=input.value==='live'?'live':'demo';rerender();return true;}return false;
}
export function submitAgentFeedback(form:HTMLFormElement,actions:UIActions):boolean{
 if(form.id!=='agent-feedback-form')return false;if(agentBusy)return true;const values=new FormData(form),feedback=String(values.get('feedback')??'').trim(),requirements=values.getAll('requirement').map(String).join('; ');
 const message=brief.occasion+'\nUser feedback: '+feedback+'\nUpdated requirements: '+requirements;if(message.length>2000){actions.notice('Shorten your feedback or requirement labels to keep this request below 2000 characters.');actions.rerender();return true;}
 agentBusy=true;agentNotice='Revising with your current wardrobe and the previous answer…';void startLiveAgent(agentInput(actions,message,true)).then(value=>acceptAgent(value,actions)).catch(e=>{agentNotice=e instanceof Error?e.message:'Revision unavailable. Existing choices remain unchanged.';}).finally(()=>{agentBusy=false;if(window.location.hash==='#stylist')actions.rerender();});actions.rerender();return true;
}
