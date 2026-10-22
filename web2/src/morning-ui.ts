import { morningLooks, morningHeadingKey, localISODate, storeDaily, wearToday, type DailyState } from './daily.js';
import { proposeLooks, type OccasionSuggestion } from './stylist.js';
import { outfitVisual, illustrationFor } from './ui.js';
import type { WardrobeState } from './state.js';
import { t } from './i18n.js';
import './daily.css';

type Actions={readonly wardrobe:WardrobeState;readonly daily:DailyState;readonly storage:Pick<Storage,'setItem'>|undefined;
  readonly updateDaily:(next:DailyState)=>void;readonly rerender:()=>void;readonly notice:(s:string)=>void;};
let stage:'brief'|'preparing'|'ready'='brief';
let spoken=t('morningRequestExample');
let selected:string|null=null;
let currentLooks:readonly OccasionSuggestion[]=[];
let outstanding=0;
interface DictationEvent { readonly results: ArrayLike<ArrayLike<{ readonly transcript:string }>>; }
interface DictationRecognizer {
  lang:string; interimResults:boolean;
  onresult:((event:DictationEvent)=>void)|null;
  onerror:((event:unknown)=>void)|null;
  onend:(()=>void)|null;
  start:()=>void; stop:()=>void;
}
type DictationCtor=new()=>DictationRecognizer;
let recognizer:DictationRecognizer|null=null;
let listening=false;
let typing=false;
export function stopMorningDictation(): void {
  const active=recognizer;recognizer=null;listening=false;
  try{active?.stop();}catch{/* Already ended by the browser. */}
}
function voiceConstructor():DictationCtor|null {
  const withSpeech=window as Window & {SpeechRecognition?:DictationCtor;webkitSpeechRecognition?:DictationCtor};
  return withSpeech.SpeechRecognition??withSpeech.webkitSpeechRecognition??null;
}
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,k=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]??k));
const svg=(name:'mic'|'check'|'arrow')=>{
  const path=name==='mic'?'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-5 0h10"/>':
    name==='check'?'<path d="m3 12 6 6L21 5"/>':'<path d="M5 12h14m-6-6 6 6-6 6"/>';
  return '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
};
function photoFor(look:OccasionSuggestion,wardrobe:WardrobeState):string{
  return outfitVisual(look.itemIds,wardrobe,true);
}
/** Keep the typed brief before rerenders caused by voice controls or async events. */
export function handleMorningInput(target:HTMLTextAreaElement):boolean {
  if(target.id!=='morning-request')return false;
  spoken=target.value;
  return true;
}
function lookNames(look:OccasionSuggestion,wardrobe:WardrobeState):string{
  return look.itemIds.map(id=>wardrobe.items.find(item=>item.id===id)?.name??id).join(' · ');
}
function prepared(wardrobe:WardrobeState):readonly OccasionSuggestion[]{
  const stillReady=morningLooks(wardrobe);
  const selectedIds=new Set(stillReady.map(look=>look.id));
  currentLooks=currentLooks.filter(look=>selectedIds.has(look.id));
  if(stage==='ready'&&!currentLooks.length)currentLooks=stillReady;
  if(!currentLooks.some(look=>look.id===selected))selected=currentLooks[0]?.id??null;
  return currentLooks;
}
export function morningPage(wardrobe:WardrobeState,daily:DailyState):string{
  const looks=prepared(wardrobe);
  const today=localISODate(new Date());
  const logged=daily.wears.find(row=>row.date===today);
  const illustrated=looks.length>0&&looks.every(look=>illustrationFor(look.itemIds,wardrobe));
  return '<section class="page morning-view" aria-labelledby="morning-title">'+
    (stage==='brief'?
      '<div class="morning-intro"><h1 id="morning-title">'+esc(t('morningHeadline'))+'</h1>'+
      '<p>'+esc(t('morningIntro'))+'</p></div>'+
      '<form id="morning-form" class="morning-form"><div class="morning-voice-stage"><button type="button" class="morning-dictate" data-morning-voice aria-pressed="'+listening+'" aria-label="'+esc(t(listening?'morningStopListening':'morningStartListening'))+'">'+svg('mic')+'</button>'+
      '<p>'+esc(t(listening?'morningStopListening':'morningStartListening'))+'</p></div>'+
      '<label class="visually-hidden" for="morning-request">'+esc(t('morningBriefLabel'))+'</label>'+
      '<textarea id="morning-request" class="'+(typing?'':'morning-quoted')+'" name="request" rows="3" maxlength="500" required '+(typing?'':'readonly')+'>'+esc(spoken)+'</textarea>'+
      '<button type="button" class="text-link morning-type" data-morning-type>'+(typing?'Done editing':'I’d rather type')+'</button>'+
      '<p class="morning-chips">'+esc(t('morningChips'))+'</p>'+
      '<button type="submit" class="button button-primary full-width">'+esc(t('morningPrepare'))+' '+svg('arrow')+'</button>'+
      '<details class="morning-voice-help"><summary>'+esc(t('morningAboutDictation'))+'</summary><p class="morning-help">'+esc(t('morningVoiceDisclosure'))+'</p></details>'+
      '<p class="morning-help">'+esc(t('morningOfflineNote'))+'</p></form>':
    stage==='preparing'?
      '<div class="morning-wait"><h1 id="morning-title">'+esc(t('morningPreparing'))+'</h1>'+
      '<p>'+esc(t('morningPreparingHint'))+'</p><div class="morning-prep-row">'+
      wardrobe.items.filter(item=>item.availability==='ready').slice(0,3).map(item=>
        '<div class="morning-small-item">'+(item.photo?'<img src="/assets/items/'+esc(item.photo)+'.webp" alt="'+esc(item.name)+'"/>':
          '<div class="morning-no-preview">'+esc(item.name)+'</div>')+'</div>').join('')+'</div>'+
      '<div class="morning-checks"><p>'+svg('check')+' '+esc(t('morningOwnedOnly'))+'</p>'+
      '<p>'+svg('check')+' '+esc(t('morningNoIron'))+'</p><p>'+svg('check')+' '+esc(t('morningReadyOnly'))+'</p></div>'+
      '<p class="morning-help">'+esc(t('morningNoBackground'))+'</p></div>':
      '<div class="morning-ready"><div class="morning-intro"><h1 id="morning-title">'+esc(t(morningHeadingKey(looks.length),{count:looks.length}))+'</h1>'+
      '<p>'+esc(t('morningReadySubtitle'))+'</p>'+(illustrated?'<p class="morning-illustrative">Illustrative styling · demo model · style, not size fit</p>':'')+'</div>'+
      (looks.length?'<div class="morning-looks '+(illustrated?'morning-looks-illustrated':'')+'" role="radiogroup" aria-label="'+esc(t('morningChoose'))+'">'+
        looks.map(look=>'<button type="button" role="radio" aria-checked="'+(look.id===selected)+
          '" tabindex="'+(look.id===selected?'0':'-1')+'" class="morning-look '+(look.id===selected?'selected':'')+'" data-morning-select="'+esc(look.id)+'">'+
          '<span class="morning-look-photo">'+photoFor(look,wardrobe)+'</span>'+
          '<span class="morning-look-desc"><strong>'+esc(look.title)+'</strong>'+
          '<small>'+esc(t('morningReadyBadge'))+'</small></span>'+
          '<span class="morning-radio" aria-hidden="true"></span></button>').join('')+'</div>'+
        '<button type="button" class="button button-primary full-width morning-wear-button" data-morning-wear>'+
        esc(t('morningWearThis'))+'</button>'+
        '<p class="morning-help">'+esc(t('morningTapToSave'))+'</p>':
        '<p class="morning-no-result">'+esc(t('morningNoneReady'))+'</p>')+
      (logged?'<p class="morning-logged" role="status">'+svg('check')+' '+esc(t('morningTodayRecorded',{name:logged.lookTitle}))+'</p>':'')+
      '<button type="button" class="text-link morning-restart" data-morning-reset>'+
        esc(t('morningNewRequest'))+' →</button>'+
      '<details class="morning-pieces"><summary>Pieces in this look</summary><p class="morning-help">'+esc(looks.find(look=>look.id===selected)?lookNames(looks.find(look=>look.id===selected)!,wardrobe):'')+'</p></details></div>')+
    '<button class="text-link morning-back" type="button" data-nav="stylist">'+esc(t('morningBackStylist'))+' →</button>'+
    '</section>';
}
export function handleMorningClick(button:HTMLElement,actions:Actions):boolean{
  if(button.hasAttribute('data-morning-type')){typing=!typing;actions.rerender();if(typing)document.getElementById('morning-request')?.focus();return true;}
  if(button.hasAttribute('data-morning-voice')){
    if(listening&&recognizer){
      recognizer.stop();listening=false;actions.rerender();return true;
    }
    const Ctor=voiceConstructor();
    if(!Ctor){typing=true;actions.notice(t('morningVoiceUnavailable'));actions.rerender();document.getElementById('morning-request')?.focus();return true;}
    try{
      const speech=new Ctor(); recognizer=speech;
      speech.lang='en-US';speech.interimResults=false;
      speech.onresult=event=>{
        if(recognizer!==speech||stage!=='brief')return;
        const text=event.results[0]?.[0]?.transcript?.trim();
        if(text){
          spoken=text;
          const input=document.getElementById('morning-request');
          if(input instanceof HTMLTextAreaElement)input.value=text;
        }
      };
      // Browsers normally dispatch error -> end. Do not immediately erase the
      // failure notice with a second render triggered by the end event.
      let failed=false;
      speech.onerror=()=>{
        if(recognizer!==speech)return;
        failed=true;listening=false;recognizer=null;
        actions.notice(t('morningVoiceFailed'));
        actions.rerender();
      };
      speech.onend=()=>{
        if(recognizer!==speech)return;
        recognizer=null;listening=false;
        if(!failed)actions.rerender();
      };
      speech.start();listening=true;actions.rerender();
    }catch{listening=false;actions.notice(t('morningVoiceFailed'));actions.rerender();}
    return true;
  }
  if(button.dataset.morningSelect){
    const allowed=prepared(actions.wardrobe).find(row=>row.id===button.dataset.morningSelect);
    if(allowed)selected=allowed.id;
  }else if(button.hasAttribute('data-morning-wear')){
    const look=prepared(actions.wardrobe).find(row=>row.id===selected);
    if(!look){actions.notice(t('morningNoneReady'));return true;}
    try{
      const next=wearToday(actions.daily,actions.wardrobe,look,localISODate(new Date()));
      actions.updateDaily(next);
      if(!storeDaily(next,actions.storage))actions.notice(t('localStorageDenied'));
      else actions.notice(t('morningSavedAsToday'));
    }catch(e){actions.notice(e instanceof Error?e.message:t('dailyInvalidLook'));}
  }else if(button.hasAttribute('data-morning-reset')){
    outstanding++;stage='brief';selected=null;currentLooks=[];
  }else return false;
  actions.rerender();return true;
}
export function submitMorning(form:HTMLFormElement,actions:Actions):boolean{
  if(form.id!=='morning-form')return false;
  const data=new FormData(form);
  const request=String(data.get('request')??'').trim();
  if(request.length<3||request.length>500){actions.notice(t('morningInvalidRequest'));actions.rerender();return true;}
  if(recognizer&&listening){recognizer.stop();listening=false;}
  spoken=request;stage='preparing';actions.rerender();
  if(window.location.hash==='#morning')window.scrollTo({top:0,behavior:'instant'});
  const token=++outstanding;
  // Offline example: resolved locally; NEVER assert that the browser continues
  // work when closed, creates three photos or schedules OS notifications.
  void proposeLooks({occasion:request,date:localISODate(new Date()),style:actions.wardrobe.style},actions.wardrobe)
    .then(value=>{if(token!==outstanding)return;currentLooks=value.looks;selected=currentLooks[0]?.id??null;stage='ready';actions.rerender();if(window.location.hash==='#morning')window.scrollTo({top:0,behavior:'instant'});})
    .catch(error=>{if(token!==outstanding)return;stage='brief';actions.notice(error instanceof Error?error.message:t('morningInvalidRequest'));actions.rerender();});
  return true;
}
