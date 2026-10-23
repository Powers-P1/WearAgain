import {
  addShopItem, decideShop, groupedReturns, loadShopping, removeShopItem, saveShopping,
  setShop, shoppingCounts, initialCaptureDraft, updateCaptureDraft,
  type CaptureDraft, type ShopItem, type ShoppingSession,
} from './shopping.js';
import { deletePhoto, readPhoto, storePhoto, supportedPhoto, MAX_PHOTO_BYTES } from './photo-store.js';
import { localISODate } from './daily.js';
import { t } from './i18n.js';
import { candidatePosition, initialPurchase, selectCandidate } from './purchase.js';
import { PreviewQueue, type JobStatus } from './render-queue.js';
import { devicePhotoUrl, icon } from './ui.js';
import { cameraActive, startCamera, mountCamera, stopCamera, captureFrame } from './camera.js';
import './gallery.css';

type StorageLike=Pick<Storage,'getItem'|'setItem'>|undefined;
type Actions={readonly storage:StorageLike;readonly rerender:()=>void;readonly notice:(s:string)=>void;readonly focus?:(selector:string)=>void};
type View='capture'|'coffee'|'returns';
let session:ShoppingSession|null=null;
let current:View='capture';
let selectedId:string|null=null;
let showReady=false;
const urls=new Map<string,string>();
const requested=new Set<string>();
const saving=new Set<string>();
let refresh:(()=>void)|null=null;
let draft:CaptureDraft|null=null;
let editingContext=false;
let renderQueue:PreviewQueue|null=null;
let reviewing=false;
let liveFormOpen=false;
let enabling=false;
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
const model=()=>session!;
function hydrated(item:ShopItem):void {
  if(item.source!=='photo'||!item.photoId||urls.has(item.photoId)||requested.has(item.photoId))return;
  const id=item.photoId;
  requested.add(id);
  void readPhoto(id).then(blob=>{
    if(blob&&model().items.some(x=>x.photoId===id)){
      urls.set(id,URL.createObjectURL(blob));
    }
    else urls.set(id,'');
    if(window.location.hash==='#gallery')refresh?.();
  }).catch(()=>{urls.set(id,'');if(window.location.hash==='#gallery')refresh?.();});
}
function initialise(store:StorageLike,rerender?:()=>void):void {
  if(!session)session=loadShopping(store);
  if(!draft)draft=initialCaptureDraft(session);
  if(rerender)refresh=rerender;
  if(!renderQueue){
    renderQueue=new PreviewQueue(store,()=>{if(typeof window!=='undefined'&&window.location.hash==='#gallery')refresh?.();});
    if(typeof window!=='undefined')window.addEventListener('pagehide',()=>{renderQueue?.dispose();renderQueue=null;},{once:true});
  }
  for(const item of session.items)hydrated(item);
}
function image(item:ShopItem,cssClass:string,preview=false):string{
  const job=renderQueue?.jobs.find(row=>row.itemId===item.id);
  if(preview&&job?.status==='ready'&&job.photoId){const url=devicePhotoUrl(job.photoId);return url?'<img class="'+cssClass+'" src="'+esc(url)+'" alt="'+esc(item.title)+'" />':'<div class="'+cssClass+' mall-empty" data-device-photo="'+esc(job.photoId)+'" data-photo-alt="'+esc(item.title)+'" data-photo-class="'+esc(cssClass)+'">'+esc(t('mallLoadingPreview'))+'</div>';}
  const src=item.imagePath||(item.photoId?urls.get(item.photoId):null);
  return src?'<img class="'+cssClass+'" src="'+esc(src)+'" alt="'+esc(item.title)+'" loading="lazy" />':
    '<div class="'+cssClass+' mall-empty" role="img" aria-label="'+esc(item.source==='link'?t('mallLinkWithoutImage'):t('mallPhotoMissing'))+'">'+
    esc(item.source==='link'?t('mallLinkWithoutImage'):t('mallPhotoMissing'))+'</div>';
}
const queueStatus=(item:ShopItem):JobStatus|null=>renderQueue?.jobs.find(job=>job.itemId===item.id)?.status??null;
const isReady=(item:ShopItem):boolean=>item.status==='saved_preview'||queueStatus(item)==='ready';
const countsForView=()=>({...shoppingCounts(model()),ready:model().items.filter(isReady).length});
const orderedItems=():readonly ShopItem[]=>[
  ...model().items.filter(item=>item.source!=='recorded').slice().reverse(),
  ...model().items.filter(item=>item.source==='recorded'),
];
function statusLabel(item:ShopItem):string{
  const status=queueStatus(item);
  if(status){const keys={queued:'mallJobQueued',submitting:'mallJobSubmitting',processing:'mallJobProcessing',ready:'mallJobReady',error:'mallJobError',unknown:'mallJobUnknown'} as const;return t(keys[status]);}
  return t(item.status==='saved_preview'?'mallSavedPreview':item.status==='photo_only'?'mallOwnPhoto':'mallLinkOnly');
}
function liveControls():string{
  return '<details class="mall-live-controls" '+(liveFormOpen?'open':'')+'><summary>'+esc(t('mallLiveTitle'))+'</summary>'+
    (renderQueue?.enabled?'<p>'+esc(t('mallLiveEnabled'))+'</p><button type="button" class="button button-outline" data-mall-live-pause>'+esc(t('mallPausePreviews'))+'</button>':
      '<form id="mall-live-form"><label class="mall-consent"><input type="checkbox" name="garmentOnly" required />'+esc(t('mallGarmentConsent'))+'</label><p>'+esc(t('mallLiveRetention'))+'</p><button type="submit" class="button button-outline" '+(enabling?'disabled':'')+'>'+esc(t(enabling?'mallLiveConnecting':'mallStartPreviews'))+'</button></form>')+'</details>';
}
function location(item:ShopItem):string {
  return (item.shop||t('mallShopUnknown'))+' · '+(item.floor||t('mallFloorUnknown'));
}
function tabbar():string{
  return '<div class="mall-tabs" role="group" aria-label="'+esc(t('mallNavigation'))+'">'+
    ([['capture','mallCaptureTab'],['coffee','mallCoffeeTab'],['returns','mallReturnsTab']] as const)
    .map(([id,label])=>'<button type="button" data-mall-view="'+id+'" aria-pressed="'+(current===id)+
      '" class="'+(current===id?'active':'')+'">'+esc(t(label))+'</button>').join('')+'</div>';
}
function camera():string{
  const counts=countsForView();
  const values=draft??initialCaptureDraft(model());
  const context=(values.shop||t('mallShopUnknown'))+' · '+(values.floor||t('mallFloorUnknown'));
  return '<div class="mall-capture-layout"><section class="mall-capture-panel">'+
    '<div class="mall-context-summary"><span>'+esc(t('mallNowAt'))+' <strong>'+esc(context)+'</strong></span>'+
    '<button type="button" data-mall-context-toggle aria-expanded="'+editingContext+'">'+
      esc(t(editingContext?'mallCloseContext':'mallChangeContext'))+'</button></div>'+
    (editingContext?'<form id="mall-shop-form" class="mall-context-form">'+
      '<div><label for="mall-shop-name">'+esc(t('mallShopName'))+'</label>'+
      '<input id="mall-shop-name" name="shop" maxlength="100" placeholder="'+esc(t('mallShopExample'))+'" value="'+esc(values.shop)+'" /></div>'+
      '<div><label for="mall-floor">'+esc(t('mallFloorName'))+'</label>'+
      '<input id="mall-floor" name="floor" maxlength="32" placeholder="'+esc(t('mallFloorExample'))+'" value="'+esc(values.floor)+'" /></div>'+
      '<button type="submit" data-mall-context-save class="button button-outline">'+esc(t('mallUpdateContext'))+'</button></form>'+
      '<p class="mall-small">'+esc(t('mallContextNotVerified'))+'</p>':'')+
    (cameraActive()?'<div class="mall-camera-viewfinder"><video id="mall-viewfinder" autoplay muted playsinline aria-label="'+esc(t('mallCameraView'))+'"></video><span>'+esc(t('mallFrameHint'))+'</span></div><div class="mall-camera-toolbar"><button type="button" class="mall-file-fallback" data-mall-view="coffee">'+esc(t('mallCoffeeTab'))+'</button><button type="button" class="mall-shutter" data-mall-camera-shutter aria-label="'+esc(t('mallShutter'))+'"></button><button type="button" class="icon-button" data-mall-camera-stop aria-label="'+esc(t('mallCameraStop'))+'">'+icon('close')+'</button></div><label for="mall-camera" class="mall-file-fallback">'+esc(t('mallChooseFile'))+'</label><input id="mall-camera" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" />':
    '<button type="button" class="mall-camera-entry" data-mall-camera-start>'+icon('camera')+'<strong>'+esc(t('mallOpenCamera'))+'</strong><span>'+esc(t('mallFrameHint'))+'</span></button><label class="mall-file-fallback mall-file-choice" for="mall-camera">'+
      esc(t('mallChooseFile'))+
      '<input id="mall-camera" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" />'+
    '</label>')+
    '<details class="mall-item-name"><summary>'+esc(t('mallOptionalItemName'))+'</summary><label for="mall-capture-title" class="visually-hidden">'+esc(t('mallOptionalItemName'))+'</label>'+
    '<input id="mall-capture-title" class="mall-text-input" maxlength="100" placeholder="'+esc(t('mallNewItemExample'))+'" value="'+esc(values.itemName)+'" /></details>'+
    liveControls()+
    (saving.size?'<p class="mall-pending" role="status">'+esc(t('mallSaving',{count:saving.size}))+'</p>':'')+
    '</section>'+
    '<section class="mall-queue-panel"><div class="mall-queue-head"><h2>'+esc(t('mallToday'))+'</h2>'+
      '<span>'+esc(t(counts.all===1?'mallItemCountOne':'mallItemCount',{count:counts.all}))+'</span></div>'+
    '<p class="mall-queue-stats">'+esc(t('mallReadyCount',{ready:counts.ready,total:counts.all}))+'</p>'+
    '<div class="mall-queue-items">'+orderedItems().map(item=>'<article class="mall-queue-item"><button type="button" class="mall-queue-photo" data-mall-open="'+esc(item.id)+'" aria-label="'+esc(item.title+' · '+statusLabel(item))+'">'+image(item,'mall-thumb')+'</button>'+
      '<div><strong>'+esc(item.title)+'</strong><p>'+esc(location(item))+'</p>'+
      '<small class="mall-status-'+esc(queueStatus(item)??'photo')+'">'+esc(statusLabel(item))+'</small></div>'+
      (item.source!=='recorded'?'<button type="button" class="mall-remove" data-mall-remove="'+esc(item.id)+
        '" aria-label="'+esc(t('mallRemovePhoto'))+'">Remove</button>':'')+
      '</article>').join('')+'</div>'+
    '<button class="button button-primary full-width" type="button" data-mall-view="coffee">'+esc(t('mallReviewNow'))+'</button></section>'+
    '<details class="mall-link-panel"><summary>'+esc(t('mallPasteLink'))+'</summary><form id="mall-link-form" class="mall-link-form">'+
      '<h3>'+esc(t('mallPasteLink'))+'</h3>'+
      '<label for="mall-link-name">'+esc(t('mallItemName'))+'</label>'+
      '<input id="mall-link-name" name="name" maxlength="100" required placeholder="'+esc(t('mallNewItemExample'))+'" value="'+esc(values.linkName)+'" />'+
      '<label for="mall-link-address">'+esc(t('mallLinkLabel'))+'</label>'+
      '<input id="mall-link-address" name="url" type="url" required placeholder="https://..." value="'+esc(values.linkUrl)+'" />'+
      '<button type="submit" data-mall-link-save class="button button-outline">'+esc(t('mallSaveLink'))+'</button>'+
      '<p class="mall-small">'+esc(t('mallLinkNoFetch'))+'</p></form></details></div>';
}
/** Snapshot unsent edits immediately, so any legitimate rerender is lossless. */
export function handleGalleryInput(input:HTMLInputElement):boolean {
  if(!['mall-shop-name','mall-floor','mall-capture-title','mall-link-name','mall-link-address'].includes(input.id))
    return false;
  if(!session)return false;
  const old=draft??initialCaptureDraft(model());
  const updated=updateCaptureDraft(old,input.id,input.value);
  if(updated===old)return false;
  draft=updated;
  return true;
}

function readyList():readonly ShopItem[]{
  return orderedItems().filter(item=>!showReady||isReady(item));
}
function exampleCoffeeVerdict(item:ShopItem):string|null{
  if(item.source!=='recorded'||!item.id.startsWith('demo_'))return null;
  const key=item.id.slice(5).replaceAll('_','-');
  try{
    const position=candidatePosition(selectCandidate(initialPurchase('minimum'),key));
    return t(position==='recommended'?'mallExampleRecommended':
      position==='not_required'?'mallExampleNotNeeded':'mallExampleUnknown');
  }catch{return null;}
}
function coffee():string{
  const counts=countsForView();
  const choices=readyList();
  const selected=choices.find(item=>item.id===selectedId)??choices[0]??null;
  if(selected)selectedId=selected.id;
  const ready=model().items.filter(isReady).length;
  const pending=model().items.filter(item=>['queued','submitting','processing'].includes(queueStatus(item)??'')).length;
  if(!reviewing)return '<section class="mall-coffee mall-coffee-list"><p class="mall-lead">'+esc(t('mallQueueSummary',{ready,pending}))+'</p>'+
    '<div class="mall-filter"><button type="button" data-mall-filter="all" aria-pressed="'+!showReady+'">'+esc(t('mallAll',{count:counts.all}))+'</button><button type="button" data-mall-filter="ready" aria-pressed="'+showReady+'">'+esc(t('mallReadyFilter',{count:ready}))+'</button></div>'+
    '<button type="button" class="button button-primary full-width" data-mall-review-ready '+(!ready?'disabled':'')+'>'+esc(t('mallReviewReady'))+'</button>'+
    '<div class="mall-coffee-queue">'+choices.map(item=>'<button type="button" data-mall-open="'+esc(item.id)+'">'+image(item,'mall-thumb')+'<span><strong>'+esc(item.title)+'</strong><small>'+esc(location(item))+'</small><span>'+esc(statusLabel(item))+'</span></span>'+icon('arrow')+'</button>').join('')+'</div>'+
    '<button type="button" class="text-link" data-mall-view="capture">'+esc(t('mallMorePhotos'))+icon('arrow')+'</button></section>';
  return '<section class="mall-coffee"><div class="mall-coffee-heading"><div><h2>'+esc(t('mallCoffeeHeadline'))+'</h2>'+
    '<p>'+esc(t('mallReadyCount',{ready:counts.ready,total:counts.all}))+'</p></div>'+
    '<div class="mall-filter" role="group"><button type="button" data-mall-filter="all" aria-pressed="'+(!showReady)+'">'+
    esc(t('mallAll',{count:counts.all}))+'</button><button type="button" data-mall-filter="ready" aria-pressed="'+showReady+'">'+
    esc(t('mallOnlyReady',{count:counts.ready}))+'</button></div></div>'+
    (selected?'<div class="mall-review-body"><div class="mall-review-image">'+image(selected,'mall-model-image',true)+
    (selected.source==='recorded'?'<span class="mall-image-badge">'+esc(t('mallSavedPreview'))+'</span>':'')+'</div>'+
    '<div class="mall-review-details"><p class="mall-eyebrow">'+esc(t('mallProgress',{index:choices.indexOf(selected)+1,total:choices.length}))+'</p>'+
    '<p class="mall-location">'+esc(location(selected))+'</p><h3>'+esc(selected.title)+'</h3>'+
    '<p>'+esc(t(isReady(selected)?'mallPreviewReadyNote':'mallPhotoOnlyDecision'))+'</p>'+
    (queueStatus(selected)&&queueStatus(selected)!=='ready'?'<p class="mall-job-state">'+esc(statusLabel(selected))+'</p>':'')+
    (renderQueue?.canCheckExisting(selected.id)?'<button type="button" class="button button-outline" data-mall-check-existing="'+esc(selected.id)+'">Check existing preview</button><p class="mall-small">Checks the same task. No new render or unit reservation.</p>':'')+
    (selected.source==='photo'&&!queueStatus(selected)?'<button class="text-link" type="button" data-mall-generate="'+esc(selected.id)+'">'+esc(t('mallGeneratePreview'))+'</button>':'')+
    (exampleCoffeeVerdict(selected)?'<p class="mall-example-verdict">'+esc(exampleCoffeeVerdict(selected))+'</p>':'')+
    (isReady(selected)?'<p class="mall-small">'+esc(t('styleFitDisclaimer'))+'</p>':'')+
    '<div class="mall-review-actions"><button type="button" class="button button-outline" data-mall-decision="skip" aria-pressed="'+(selected.decision==='skip')+'">'+esc(t('mallSkip'))+'</button>'+
    '<button type="button" class="button button-primary" data-mall-decision="return" aria-pressed="'+(selected.decision==='return')+'">'+esc(t('mallReturnForIt'))+'</button></div>'+
    '<p class="mall-small">'+esc(t('mallCanChangeMind'))+'</p>'+
    '<div class="mall-step-controls"><button type="button" data-mall-step="prev">'+esc(t('mallPrevious'))+'</button>'+
    '<button type="button" data-mall-step="next">'+esc(t('mallNext'))+' →</button></div></div></div>':
    '<p class="mall-no-result">'+esc(t('mallNoReady'))+'</p>')+
    '<div class="mall-coffee-actions"><button type="button" class="text-link" data-mall-view="returns">'+
    esc(t('mallReturnList',{count:counts.returns}))+' →</button>'+
    '<button type="button" class="text-link" data-mall-back>'+esc(t('mallBackToQueue'))+'</button></div></section>';
}
function returnList():string{
  const groups=groupedReturns(model());const count=shoppingCounts(model()).returns;
  return '<section class="mall-return-page"><p class="mall-lead">'+esc(t('mallReturnDescription'))+'</p>'+
    '<p class="mall-return-count">'+esc(t('mallReturnList',{count}))+'</p>'+
    (groups.length?groups.map(group=>'<section class="mall-return-group"><h3>'+esc(group.shop||t('mallShopUnknown'))+'</h3>'+
      '<p>'+esc(group.floor||t('mallFloorUnknown'))+'</p>'+
      group.items.map(item=>'<article class="mall-return-row">'+image(item,'mall-thumb')+
        '<div><strong>'+esc(item.title)+'</strong><small>'+esc(t(item.status==='saved_preview'?'mallSavedPreview':item.status==='photo_only'?'mallOwnPhoto':'mallLinkOnly'))+'</small></div>'+
        '<div class="mall-return-actions"><button type="button" data-mall-open="'+esc(item.id)+'">View photo</button><button type="button" data-mall-undo="'+esc(item.id)+'">'+esc(t('mallUndo'))+'</button></div></article>').join('')+
      '</section>').join(''):'<p class="mall-no-result">'+esc(t('mallNoReturns'))+'</p>')+
    '<p class="mall-small">'+esc(t('mallNoMaps'))+'</p>'+
    '<button type="button" class="button button-primary" data-mall-view="coffee">'+esc(t('mallBackToPreviews'))+'</button></section>';
}
export function galleryPage(store?:StorageLike,rerender?:()=>void):string{
  initialise(store,rerender);
  if(cameraActive())requestAnimationFrame(mountCamera);
  const focused=current==='coffee'&&reviewing;
  const item=model().items.find(row=>row.id===selectedId);
  return '<section class="page mall-view '+(focused?'mall-reviewing':'')+' '+(cameraActive()?'mall-camera-active':'')+'" aria-labelledby="mall-title"><header class="mall-intro"><div>'+
    (focused?'<button type="button" class="back-link" data-mall-back>'+icon('left')+esc(t('mallBackToQueue'))+'</button>':'')+'<h1 id="mall-title">'+esc(focused&&item?item.title:current==='capture'?t('mallPhotoHeadline'):current==='coffee'?t('mallCoffeeQueueTitle'):t('mallReturnHeadline'))+'</h1>'+
    (focused&&item?'<p>'+esc(location(item))+'</p>':current==='capture'?'<p>'+esc(t('mallHeadlineSub'))+'</p>':'')+'</div></header>'+(focused?'':tabbar())+
    (current==='capture'?camera():current==='coffee'?coffee():returnList())+'</section>';
}
export function handleGalleryClick(control:HTMLElement,actions:Actions):boolean{
  initialise(actions.storage,actions.rerender);
  const d=control.dataset;
  const previousView=current,previousReview=reviewing,previousSelected=selectedId;
  if(control.hasAttribute('data-mall-camera-start')){editingContext=false;void startCamera().then(ok=>{if(!ok)actions.notice(t('mallCameraUnavailable'));actions.rerender();if(ok)window.scrollTo({top:0,behavior:'instant'});}).catch(()=>{actions.notice(t('mallCameraUnavailable'));actions.rerender();});return true;}
  if(control.hasAttribute('data-mall-camera-shutter')){void captureFrame().then(file=>capturePhoto(file,actions)).catch(()=>{actions.notice(t('mallCameraUnavailable'));actions.rerender();});return true;}
  if(control.hasAttribute('data-mall-camera-stop'))stopCamera();
  else if(control.hasAttribute('data-mall-live-pause'))renderQueue?.pause();
  else if(d.mallGenerate){renderQueue?.enqueue(d.mallGenerate);if(!renderQueue?.enabled){current='capture';liveFormOpen=true;}}
  else if(d.mallCheckExisting){renderQueue?.checkExisting(d.mallCheckExisting);}
  else if(d.mallOpen){selectedId=d.mallOpen;reviewing=true;current='coffee';}
  else if(control.hasAttribute('data-mall-back'))reviewing=false;
  else if(control.hasAttribute('data-mall-review-ready')){selectedId=orderedItems().find(isReady)?.id??null;reviewing=!!selectedId;showReady=true;}
  else if(d.mallView&&['capture','coffee','returns'].includes(d.mallView)){current=d.mallView as View;if(current==='coffee')reviewing=false;if(current!=='capture')stopCamera();}
  else if(control.hasAttribute('data-mall-context-toggle'))editingContext=!editingContext;
  else if(d.mallFilter){showReady=d.mallFilter==='ready';selectedId=null;}
  else if(d.mallStep){
    const items=readyList();
    if(items.length){
      const n=items.findIndex(x=>x.id===selectedId);
      selectedId=items[(n+(d.mallStep==='next'?1:items.length-1))%items.length]?.id??null;
    }
  }else if(d.mallDecision){
    if(!selectedId)return true;
    session=decideShop(model(),selectedId,d.mallDecision==='return'?'return':'skip');
    if(!saveShopping(session,actions.storage))actions.notice(t('localStorageDenied'));
  }else if(d.mallUndo){
    session=decideShop(model(),d.mallUndo,null);
    if(!saveShopping(session,actions.storage))actions.notice(t('localStorageDenied'));
  }else if(d.mallRemove){
    const item=model().items.find(x=>x.id===d.mallRemove);
    if(item){
      if(!window.confirm(t('mallConfirmRemove',{item:item.title})))return true;
      session=removeShopItem(model(),item.id);
      renderQueue?.remove(item.id);
      if(!saveShopping(session,actions.storage))actions.notice(t('localStorageDenied'));
      if(item.photoId){
        const url=urls.get(item.photoId);
        if(url)URL.revokeObjectURL(url);
        urls.delete(item.photoId);requested.delete(item.photoId);
        void deletePhoto(item.photoId).catch(()=>actions.notice(t('mallPhotoDeleteFailed')));
      }
    }
  }else return false;
  actions.rerender();
  if(previousView!==current||previousReview!==reviewing||(reviewing&&previousSelected!==selectedId))window.scrollTo({top:0,behavior:'instant'});
  if(d.mallGenerate&&!renderQueue?.enabled)document.querySelector('.mall-live-controls')?.scrollIntoView({behavior:'instant',block:'start'});
  return true;
}
export function handleGallerySubmit(form:HTMLFormElement,actions:Actions):boolean{
  initialise(actions.storage,actions.rerender);
  const formData=new FormData(form);
  if(form.id==='mall-live-form'){
    if(formData.get('garmentOnly')!=='on')return true;
    enabling=true;liveFormOpen=true;actions.rerender();
    void renderQueue!.enable().then(()=>{
      for(const item of model().items)if(item.source==='photo'&&item.photoId)renderQueue!.enqueue(item.photoId);
      actions.notice(t('mallLiveEnabled'));
    }).catch(()=>actions.notice(t('mallLiveUnavailable'))).finally(()=>{enabling=false;actions.rerender();});return true;
  }else if(form.id==='mall-shop-form'){
    try{
      session=setShop(model(),String(formData.get('shop')??''),String(formData.get('floor')??''));
      draft={...(draft??initialCaptureDraft(session)),shop:session.shop,floor:session.floor};
      editingContext=false;
      actions.focus?.('[data-mall-context-toggle]');
      if(!saveShopping(session,actions.storage))actions.notice(t('localStorageDenied'));
    }catch(e){actions.notice(e instanceof Error?e.message:t('shopInvalidContext'));}
  }else if(form.id==='mall-link-form'){
    try{
      const id='link_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
      session=addShopItem(model(),{id,title:String(formData.get('name')??''),source:'link',url:String(formData.get('url')??''),date:localISODate(new Date())});
      if(!saveShopping(session,actions.storage))actions.notice(t('localStorageDenied'));
      draft={...(draft??initialCaptureDraft(session)),linkName:'',linkUrl:''};
      actions.notice(t('mallLinkAdded'));
    }catch(e){actions.notice(e instanceof Error?e.message:t('shopInvalidItem'));}
  }else return false;
  actions.rerender();return true;
}
export function handleGalleryFile(input:HTMLInputElement,actions:Actions):boolean{
  if(input.id!=='mall-camera')return false;
  initialise(actions.storage,actions.rerender);
  const file=input.files?.[0];input.value='';
  if(!file)return true;
  capturePhoto(file,actions);return true;
}
function capturePhoto(file:File,actions:Actions):void{
  if(!supportedPhoto(file)){actions.notice(t('mallBadPhoto',{size:MAX_PHOTO_BYTES/1_000_000}));actions.rerender();return;}
  const id='photo_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
  const title=(draft?.itemName??'').trim()||t('mallUnnamedPhoto',{count:model().items.length+1});
  // Snapshot the shop currently typed, even when the user did not press Save
  // context. Two photos saved out of order must keep their capture-time shop.
  let context:Pick<ShoppingSession,'shop'|'floor'>;
  try{
    const store=draft?.shop??model().shop;
    const floor=draft?.floor??model().floor;
    session=setShop(model(),store,floor);
    context={shop:session.shop,floor:session.floor};
    if(!saveShopping(session,actions.storage))actions.notice(t('localStorageDenied'));
  }catch(e){actions.notice(e instanceof Error?e.message:t('shopInvalidContext'));actions.rerender();return;}
  // The chosen label belongs to this captured file only, not later photos.
  // Context and unsent link drafts remain untouched.
  draft={...(draft??initialCaptureDraft(model())),itemName:''};
  saving.add(id);
  actions.focus?.('#mall-camera');
  actions.rerender(); // The next photo need not wait for a model preview.
  void storePhoto(id,file).then(()=>{
    const current=model();
    const added=addShopItem({...current,shop:context.shop,floor:context.floor},
      {id,title,source:'photo',photoId:id,date:localISODate(new Date())});
    session={...added,shop:current.shop,floor:current.floor};
    const url=URL.createObjectURL(file);
    urls.set(id,url);requested.add(id);
    if(!saveShopping(session,actions.storage))actions.notice(t('localStorageDenied'));
    actions.notice(t('mallPhotoSaved'));
    if(renderQueue?.enabled)renderQueue.enqueue(id);
  }).catch(()=>{
    actions.notice(t('mallPhotoFailed'));
    void deletePhoto(id).catch(()=>{});
  }).finally(()=>{
    saving.delete(id);
    if(current==='capture')actions.focus?.('#mall-camera');
    actions.rerender();
  });
}
