import {
  AVAILABILITY, CATEGORIES, addItem, availabilityLabel, categoryLabel, itemsForView,
  loadState, saveState, setAvailability, setStyle,
  type Availability, type Category, type WardrobeItem, type WardrobeState,
} from './state.js';
import { DEFAULT_LOCALE, t, type TranslationKey } from './i18n.js';
import { marketingRoute } from './marketing-model.js';
import { marketingPage, marketingTitle, handleMarketingClick } from './marketing.js';
import { setupPwa, canInstall, installWebApp } from './pwa.js';
import { purchasePage, handlePurchaseClick, handlePurchaseChange,purchaseWalkthroughFacts } from './purchase-ui.js';
import { loadDaily, loadDecisions, wearToday, storeDaily, localISODate, type DailyState, type DecisionsState } from './daily.js';
import { tripPage, surprisePage, balancePage, handlePlansClick, handlePlansChange, handlePlansSubmit } from './plans-ui.js';
import { itemPicture, configurePhotoMedia } from './ui.js';
import { storePhoto, supportedPhoto,setPhotoNamespace } from './photo-store.js';
import {activeProfile,profileStorage} from './profiles.js';
import {accountMarkup,accountClick,accountSubmit,accountChange} from './account-ui.js';
import {personalPurchasePage,personalClick,personalSubmit,personalChange} from './personal-purchase-ui.js';
import './agent.css';
import { stopCamera } from './camera.js';
import { morningPage, handleMorningInput, handleMorningClick, submitMorning, stopMorningDictation } from './morning-ui.js';
import { overviewPage, reviewItemPage, handleOverviewClick, handleOverviewMonthChange } from './overview-ui.js';
import { galleryPage, handleGalleryInput, handleGalleryClick, handleGallerySubmit, handleGalleryFile,galleryWalkthroughFacts } from './gallery-ui.js';
import {createWardrobeWalkthrough,type WardrobeWalkthrough} from './walkthrough.js';
import {loadSaved} from './stylist.js';
import {readTrip} from './plans.js';
import { handleStylistClick, savedPage, stylistPage, submitStylist,stylistChange,submitAgentFeedback } from './stylist-ui.js';
import './style.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing app root.');
document.documentElement.lang = DEFAULT_LOCALE;
const publicRoute = marketingRoute(window.location.pathname);
let walkthrough:WardrobeWalkthrough|null=null,guideStyleSaves=0;
setupPwa();

type Screen = 'wardrobe' | 'profile' | 'stylist' | 'check' | 'my-check' | 'saved' | 'gallery' | 'add' | 'item' | 'morning' | 'overview' | 'review' | 'trip' | 'surprise' | 'balance';
type NavId = 'wardrobe' | 'stylist' | 'check' | 'profile' | 'saved' | 'gallery' | 'morning' | 'overview' | 'trip';
const navIds: readonly NavId[] = ['wardrobe', 'stylist', 'check', 'profile', 'saved', 'gallery', 'morning', 'overview', 'trip'];
let baseStorage:Storage|undefined;
try { baseStorage = window.localStorage; } catch { /* Browsers may disable persistence. */ }
const deviceProfile=activeProfile(baseStorage);
const storage=profileStorage(baseStorage,deviceProfile.id);
setPhotoNamespace(deviceProfile.id);
let data: WardrobeState = deviceProfile.id!=='default'&&!storage?.getItem('wearagain:web2:demo-wardrobe:v1')?{version:1,exampleMode:false,style:'',items:[]}:loadState(storage);
let daily: DailyState = loadDaily(storage);
let decisions: DecisionsState = loadDecisions(storage);
let category: Category | 'all' = 'all';
let search = '';
let revealMore = false;
let message = '';
let addPhoto: File | null = null;
let addPhotoUrl = '';
let addDraft = { name: '', detail: '', category: 'tops', availability: 'ready' };

const paths: Record<string, string> = {
  hanger: '<path d="M9 5a3 3 0 0 1 6 0c0 2-3 2-3 4l9 7a2 2 0 0 1-1 3H4a2 2 0 0 1-1-3l9-7"/>',
  sparkles: '<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z"/>',
  check: '<path d="M4 12.5 9.5 18 20 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.2"/><path d="m16 16 5 5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  bag: '<path d="M5 8h14l1.5 13h-17L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3v13H4V7Z"/><circle cx="12" cy="13" r="3.4"/>',
  arrow: '<path d="M4 12h16m-7-7 7 7-7 7"/>',
  left: '<path d="M20 12H4m7-7-7 7 7 7"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
};
function icon(key: string): string {
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[key] ?? paths.sparkles) + '</svg>';
}
function safe(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}
function msg(key: TranslationKey): string { return safe(t(key)); }
function route(): { screen: Screen; itemId: string } {
  const value = decodeURIComponent(window.location.hash.slice(1));
  if (value.startsWith('item/')) return { screen: 'item', itemId: value.slice(5) };
  if (value.startsWith('review/')) return { screen: 'review', itemId: value.slice(7) };
  if (value.startsWith('saved/')) return { screen: 'saved', itemId: value.slice(6) };
  if (['wardrobe', 'profile', 'stylist', 'check','my-check', 'saved', 'gallery', 'add', 'morning', 'overview', 'trip', 'surprise', 'balance'].includes(value))
    return { screen: value as Screen, itemId: '' };
  return { screen: 'wardrobe', itemId: '' };
}
function navigate(to: string): void {
  if (window.location.hash === '#' + to) render();
  else window.location.hash = to;
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function persist(next: WardrobeState): boolean {
  data = next;
  const saved=saveState(data, storage);if (!saved) message = t('localStorageDenied');return saved;
}
function navButton(id: NavId, desktop: boolean, active: NavId): string {
  const labels: Record<NavId, TranslationKey> = {
    wardrobe: 'wardrobe', stylist: 'stylist', check: desktop ? 'checkPurchase' : 'check', profile: 'profile',
    saved: 'savedLooks', gallery: 'shoppingGallery', morning:'morningNav', overview:'overviewNav', trip: 'tripNav',
  };
  const symbols: Record<NavId, string> = {
    wardrobe: 'hanger', stylist: 'sparkles', check: 'bag', profile: 'user',
    saved: 'bookmark', gallery: 'bag', morning:'sparkles', overview:'hanger', trip: 'bookmark',
  };
  return '<button class="navigation-item ' + (active === id ? 'is-current' : '') +
    '" data-nav="' + id + '" type="button" ' + (active === id ? 'aria-current="page"' : '') +
    '>' + icon(symbols[id]) + '<span>' + msg(labels[id]) + '</span></button>';
}
function mobileBar(): string {
  return '<header class="mobile-bar"><button type="button" class="wordmark wordmark-button" data-nav="wardrobe">WearAgain</button>' +
    '<button type="button" class="avatar-button" aria-label="' + msg('styleLink') + '" data-nav="profile">' +
    '<img src="/assets/demo-portrait.webp" alt="" /></button></header>';
}
function sidebar(active: NavId): string {
  return '<aside class="sidebar" aria-label="' + msg('navAria') + '">' +
    '<button class="wordmark wordmark-button sidebar-brand" type="button" data-nav="wardrobe">WearAgain</button>' +
    '<nav class="sidebar-top">' + (['wardrobe', 'stylist', 'check'] as NavId[]).map(id => navButton(id, true, active)).join('') +
    '<div class="sidebar-rule"></div>' +
    (['saved', 'gallery', 'morning', 'trip', 'overview'] as NavId[]).map(id => navButton(id, true, active)).join('') + '</nav>' +
    '<button type="button" class="sidebar-profile" data-nav="profile">' +
    '<img src="/assets/demo-portrait.webp" alt="" /><span><strong>'+safe(deviceProfile.name)+'</strong><small>' +
    msg('styleLink') + ' ' + icon('arrow') + '</small></span></button></aside>';
}
function bottomBar(active: NavId): string {
  return '<nav class="bottom-nav" aria-label="' + msg('navAria') + '">' +
    (['wardrobe', 'stylist', 'check', 'profile'] as NavId[]).map(id => navButton(id, false, active)).join('') + '</nav>';
}
function itemImage(item: WardrobeItem): string {
  return itemPicture(item);
}
function itemCard(item: WardrobeItem): string {
  return '<button class="garment" type="button" data-item="' + safe(item.id) + '" aria-label="' +
    safe(item.name + ', ' + availabilityLabel(item.availability)) + '">' +
    '<span class="garment-photo">' + itemImage(item) + '</span>' +
    '<span class="garment-title">' + safe(item.name) + '</span>' +
    '<span class="garment-detail">' + safe(item.detail || categoryLabel(item.category)) + '</span>' +
    (item.availability !== 'ready' ? '<span class="garment-status">' + safe(availabilityLabel(item.availability)) + '</span>' : '') +
    '</button>';
}
function gridMarkup(): string {
  const items = itemsForView(data, category, search);
  const mobileHome = window.matchMedia('(max-width: 800px)').matches && category === 'all' && !search.trim();
  if (mobileHome) {
    const featured = ['cashmere', 'blazer', 'trousers', 'loafers'];
    items.sort((a,b) => {
      // A freshly added personal piece must be visible immediately, including
      // after reload, rather than hidden behind the four example garments.
      if(a.id.startsWith('own_')||b.id.startsWith('own_'))return b.order-a.order;
      const ai = featured.indexOf(a.id), bi = featured.indexOf(b.id);
      return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || b.order - a.order;
    });
  }
  const visible = mobileHome && !revealMore ? items.slice(0,4) : items;
  return visible.length ? visible.map(itemCard).join('')
    : '<p class="no-results">' + msg('noMatches') + '</p>';
}
function wardrobe(): string {
  const choices: readonly (Category | 'all')[] = ['all', ...CATEGORIES];
  return '<section class="page wardrobe-view" aria-labelledby="wardrobe-title">' +
    '<div class="page-intro"><div class="intro-copy"><h1 id="wardrobe-title">' + msg('yourWardrobe') + '</h1>' +
    '<div class="wardrobe-subtitle-row"><p>' + safe(t('wardrobeCount', { count: data.items.length })) + '</p>' +
    '<button class="mobile-add" type="button" data-nav="add">+ ' + msg('addItem') + '</button></div></div>' +
    '<div class="desktop-header-actions"><button class="button button-outline" type="button" data-nav="stylist">' + msg('styleAnOutfit') + '</button>' +
    '<button class="button button-primary" type="button" data-nav="add">' + icon('plus') + ' ' + msg('addItem') + '</button></div></div>' +
    '<div class="wardrobe-tools"><label class="search-field">' + icon('search') +
    '<input type="search" name="q" id="wardrobe-search" aria-label="' + msg('searchWardrobe') +
    '" placeholder="' + msg('searchWardrobe') + '" value="' + safe(search) + '"/></label>' +
    '<div class="sort-label">' + msg('recentlyAdded') + ' ' + icon('down') + '</div></div>' +
    '<div class="category-tabs" role="group" aria-label="' + msg('category') + '">' +
    choices.map(value => '<button type="button" class="category-tab ' + (category === value ? 'active' : '') +
    '" data-cat="' + value + '" aria-pressed="' + (category === value) + '">' +
    (value === 'all' ? msg('categoryAll') : safe(categoryLabel(value))) + '</button>').join('') + '</div>' +
    '<div id="wardrobe-grid" class="wardrobe-grid" aria-live="polite">' + gridMarkup() + '</div>' +
    (category === 'all' && !revealMore ? '<button type="button" class="more-button" data-expand>' + msg('moreItems') + ' ' + icon('down') + '</button>' : '') +
    '<footer class="wardrobe-end"><span>' + msg('piecesMorePossibilities') + '</span>' +
    '<button type="button" data-nav="profile" class="text-link desktop-only">' + msg('discoverYourStyle') + ' ' + icon('arrow') + '</button>' +
    '<button type="button" data-nav="stylist" class="text-link mobile-only">' + msg('styleFromWardrobe') + ' ' + icon('arrow') + '</button></footer>' +
    '<div class="wardrobe-shortcuts"><button type="button" class="text-link" data-nav="overview">' + msg('overviewNav') + ' →</button>' +
    '<button type="button" class="text-link" data-nav="morning">' + msg('morningNav') + ' →</button></div>' +
    '<p class="demo-explainer">' + (data.exampleMode===false?'Your wardrobe · saved on this device. Use Profile to transfer it to another device.':msg('sampleWardrobe')) + '</p></section>';
}
function profile(): string {
  return '<section class="page profile-view" aria-labelledby="profile-title">' +
    '<button class="back-link" type="button" data-nav="wardrobe">' + icon('left') + ' ' + msg('goBackWardrobe') + '</button>' +
    '<h1 id="profile-title">' + t('styleHeadline') + '</h1>' +
    '<p class="intro-subtitle">' + msg('styleGuidance') + '</p>' +
    '<form id="style-form"><label class="visually-hidden" for="style-description">' + msg('describeStyle') + '</label>' +
    '<textarea maxlength="5000" id="style-description" name="style" rows="4">' + safe(data.style) + '</textarea>' +
    '<p class="field-hint">' + msg('changeAnytime') + '</p>' +
    '<h2>' + msg('seeLooksOnYou') + '</h2>' +
    '<div class="model-options"><div class="model-choice chosen"><img src="/assets/demo-portrait.webp" alt="' + msg('demoModel') + '" />' +
    '<span class="model-check" aria-hidden="true">' + icon('check') + '</span><span>' + msg('demoModel') + '</span></div>' +
    '<button class="model-choice model-unavailable" type="button" disabled aria-label="' + msg('ownPhotoUnavailable') + '">' +
    '<span class="camera-placeholder">' + icon('camera') + '</span><span>' + msg('ownPhoto') + '</span></button></div>' +
    '<p class="privacy-line">' + icon('lock') + ' ' + msg('photoPrivacy') + '</p>' +
    '<button type="submit" class="button button-primary full-width">' + msg('saveMyStyle') + '</button>'+
    '<details class="profile-photo-help"><summary>About your preview</summary><p class="field-hint">' + msg('photoFuture') + '</p><p class="field-hint">' + msg('styleFitDisclaimer') + '</p></details></form>' +
    '<div class="feature-links"><button data-nav="trip">' + msg('tripNav') + '</button><button data-nav="surprise">' + msg('surpriseNav') + '</button><button data-nav="saved">' + msg('savedLooks') + '</button></div>' +
    accountMarkup(baseStorage,storage)+
    (canInstall()?'<button type="button" class="text-link" data-pwa-install>'+msg('mktPwaInstall')+'</button>':'')+'</section>';
}
function itemDetail(itemId: string): string {
  const item = data.items.find(row => row.id === itemId);
  if (!item) return '<section class="page"><h1>' + msg('missingItem') +
    '</h1><button class="text-link" data-nav="wardrobe">' + msg('goBackWardrobe') + '</button></section>';
  return '<section class="page detail-view" aria-labelledby="item-title">' +
    '<button class="back-link" type="button" data-nav="wardrobe">' + icon('left') + ' ' + msg('goBackWardrobe') + '</button>' +
    '<h1 id="item-title">' + safe(item.name) + '</h1>' +
    '<div class="detail-photo">' + itemImage(item) + '</div>' +
    '<p class="detail-copy">' + safe(item.detail) + ' · ' + safe(categoryLabel(item.category)) + '</p>' +
    '<div class="detail-section"><h2>' + msg('status') + '</h2><p>' + msg('itemStatusIntro') + '</p>' +
    '<div class="status-options" role="group" aria-label="' + msg('statusControl') + '">' +
    (Object.keys(AVAILABILITY) as Availability[]).map(key =>
      '<button type="button" class="status-option ' + (key === item.availability ? 'selected' : '') +
      '" aria-pressed="' + (key === item.availability) + '" data-status="' + key + '" data-status-item="' + safe(item.id) + '">' +
      (key === item.availability ? icon('check') : '') + safe(availabilityLabel(key)) + '</button>').join('') +
    '</div></div><button type="button" class="button button-outline full-width" data-nav="wardrobe">' + msg('goBackWardrobe') + '</button></section>';
}
function addScreen(): string {
  return '<section class="page edit-view"><button type="button" class="back-link" data-nav="wardrobe">' + icon('left') +
    ' ' + msg('goBackWardrobe') + '</button><h1>' + msg('editItem') + '</h1><p class="intro-subtitle">' + msg('addGuidance') + '</p>' +
    '<form id="add-form" class="edit-form"><div class="wardrobe-photo-picker"><label for="wardrobe-photo">' + icon('camera') + msg('wardrobePhotoLabel') +
    '<input id="wardrobe-photo" type="file" name="photo" accept="image/jpeg,image/png,image/webp" capture="environment" /></label><div class="add-photo-preview">' +
    (addPhotoUrl ? '<img src="' + safe(addPhotoUrl) + '" alt="' + msg('wardrobePhotoSelected') + '" />' : '') + '</div><p class="field-hint">' + msg('wardrobePhotoHint') + '</p></div><label>' + msg('itemName') +
    '<input name="name" required maxlength="80" value="' + safe(addDraft.name) + '" placeholder="' + msg('itemNamePlaceholder') + '" autocomplete="off" /></label>' +
    '<label>' + msg('colorMaterial') + '<input name="detail" maxlength="100" value="' + safe(addDraft.detail) + '" placeholder="' + msg('colorMaterialPlaceholder') + '" autocomplete="off" /></label>' +
    '<label>' + msg('category') + '<select name="category">' +
    CATEGORIES.map(key => '<option value="' + key + '" ' + (addDraft.category === key ? 'selected' : '') + '>' + safe(categoryLabel(key)) + '</option>').join('') + '</select></label>' +
    '<label>' + msg('status') + '<select name="availability">' +
    (Object.keys(AVAILABILITY) as Availability[]).map(key => '<option value="' + key + '" ' + (addDraft.availability === key ? 'selected' : '') + '>' + safe(availabilityLabel(key)) + '</option>').join('') +
    '</select></label>' +
    '<button class="button button-primary full-width" type="submit">' + msg('addToWardrobe') + '</button></form></section>';
}
function placeholder(screen: Screen): string {
  const content: Record<string, { title: TranslationKey; subtitle: TranslationKey }> = {
    stylist: { title: 'comingStylist', subtitle: 'comingStylistSubtitle' },
    check: { title: 'comingCheck', subtitle: 'comingCheckSubtitle' },
    saved: { title: 'comingSaved', subtitle: 'comingSavedSubtitle' },
    gallery: { title: 'comingMall', subtitle: 'comingMallSubtitle' },
  };
  const current = content[screen] ?? content.stylist!;
  return '<section class="page coming-soon"><h1>' + msg(current.title) + '</h1><p class="intro-subtitle">' +
    msg(current.subtitle) + '</p><div class="soon-rule"></div><p>' + msg('comingSoon') + '</p>' +
    '<button type="button" class="button button-primary" data-nav="wardrobe">' + msg('backToWardrobe') + ' ' + icon('arrow') +
    '</button></section>';
}
let previousRoute='';
let hasRendered=false;
let requestedFocus='';
function focusAfterRender(selector:string):void { requestedFocus=selector; }
/** Preserve focus and expanded certificate, then restore a deterministic
 * heading when a previous control no longer exists or the route changes. */
function render(): void {
  configurePhotoMedia();
  if(publicRoute){
    const focused=document.activeElement;
    const attr=focused instanceof HTMLElement&&focused.dataset.guideStep?'[data-guide-step="'+focused.dataset.guideStep+'"]':
      focused instanceof HTMLElement&&focused.dataset.judgeMode?'[data-judge-mode="'+focused.dataset.judgeMode+'"]':
      focused instanceof HTMLElement&&focused.dataset.retailSize?'[data-retail-size="'+focused.dataset.retailSize+'"]':'';
    root!.innerHTML=marketingPage(publicRoute);
    document.title=marketingTitle(publicRoute);
    if(hasRendered){
      const target=attr?root!.querySelector<HTMLElement>(attr):null;
      const candidate=target??root!.querySelector<HTMLElement>('main h1')??root!.querySelector<HTMLElement>('main');
      if(candidate){
        if(!candidate.matches('[tabindex],button,input,a[href]'))candidate.setAttribute('tabindex','-1');
        candidate.focus({preventScroll:true});
      }
    } else if(window.location.hash.startsWith('#')){
      const anchorId=window.location.hash.slice(1);
      if(/^[a-zA-Z][\w-]{0,80}$/.test(anchorId))requestAnimationFrame(()=>document.getElementById(anchorId)?.scrollIntoView());
    }
    hasRendered=true;
    window.dispatchEvent(new Event('wearagain:rendered'));
    return;
  }
  const routeKey=window.location.hash;
  const same=previousRoute===routeKey;
  const focused=same&&root!.contains(document.activeElement)?document.activeElement as HTMLElement:null;
  const focusScope=focused?.closest('.bottom-nav')?'.bottom-nav ':
    focused?.closest('.sidebar')?'.sidebar ':focused?.closest('.mobile-bar')?'.mobile-bar ':'';
  let selector='';
  if(focused?.id&&/^[a-zA-Z0-9_-]+$/.test(focused.id))selector='#'+focused.id;
  else if(focused?.tagName==='SUMMARY'&&focused.closest('.purchase-certificate'))
    selector='.purchase-certificate summary';
  else if(focused){
    const attribute=Array.from(focused.attributes).find(row=>row.name.startsWith('data-')
      && /^[a-zA-Z0-9_-]*$/.test(row.value));
    if(attribute)selector=focusScope+'['+attribute.name+
      (attribute.value?'="'+attribute.value+'"':'')+']';
  }
  const targetSelector=requestedFocus||(same?selector:'');
  requestedFocus='';
  const disclosureKey=(element:HTMLDetailsElement)=>element.id||element.className.trim()||element.querySelector('summary')?.textContent?.trim()||'';
  const openDisclosures=new Set(same?Array.from(root!.querySelectorAll<HTMLDetailsElement>('main details[open]')).map(disclosureKey):[]);
  const current = route();
  if(current.screen!=='gallery')stopCamera();
  if(current.screen!=='morning')stopMorningDictation();
  const active: NavId = current.screen === 'item' || current.screen === 'add' ? 'wardrobe'
    : current.screen==='review'||current.screen==='balance'?'overview'
    : current.screen==='surprise'?'profile':current.screen==='my-check'?'check'
    : navIds.includes(current.screen as NavId)?current.screen as NavId:'wardrobe';
  const page = current.screen === 'wardrobe' ? wardrobe()
    : current.screen === 'stylist' ? stylistPage(data,storage,render)
    : current.screen === 'check' ? purchasePage(data)
    : current.screen === 'my-check' ? personalPurchasePage(data,storage)
    : current.screen === 'trip' ? tripPage(data,storage)
    : current.screen === 'surprise' ? surprisePage(storage)
    : current.screen === 'balance' ? balancePage(data,daily,storage)
    : current.screen === 'morning' ? morningPage(data,daily)
    : current.screen === 'overview' ? overviewPage(data,daily,decisions)
    : current.screen === 'review' ? reviewItemPage(current.itemId,data,daily,decisions,storage)
    : current.screen === 'gallery' ? galleryPage(storage,render)
    : current.screen === 'saved' ? savedPage(storage,data,current.itemId)
    : current.screen === 'profile' ? profile()
    : current.screen === 'item' ? itemDetail(current.itemId)
    : current.screen === 'add' ? addScreen() : placeholder(current.screen);
  root!.innerHTML = '<div class="app-shell">' + sidebar(active) + '<main id="main-content" class="main-content">' +
    mobileBar() + (message ? '<p role="status" class="notice">' + safe(message) + '</p>' : '') +
    page + '</main>' + bottomBar(
      current.screen==='gallery'?'check':
      current.screen==='morning'||current.screen==='trip'?'stylist':
      current.screen==='overview'||current.screen==='review'||current.screen==='balance'?'wardrobe':active
    ) + '</div>';
  for(const details of root!.querySelectorAll<HTMLDetailsElement>('main details')){
    if(openDisclosures.has(disclosureKey(details)))details.open=true;
  }
  // Mobile Stylist hides its h1. An existing but display:none heading
  // cannot be focused - skip invisible targets instead of landing on BODY.
  const mainElement=root!.querySelector<HTMLElement>('main');
  const focusCandidates:HTMLElement[]=[
    ...(targetSelector?[...root!.querySelectorAll<HTMLElement>(targetSelector)]:[]),
    ...root!.querySelectorAll<HTMLElement>('main .page h1, main .page h2, main h1'),
    ...(mainElement?[mainElement]:[]),
  ];
  const focusTarget=focusCandidates.find(el=>el.getClientRects().length>0 &&
    window.getComputedStyle(el).visibility!=='hidden');
  if(focusTarget && hasRendered){
    if(!focusTarget.matches('button,input,textarea,select,a[href],[tabindex]'))
      focusTarget.setAttribute('tabindex','-1');
    focusTarget.focus({preventScroll:true});
    // A detached or otherwise unfocusable target must not strand focus on BODY.
    if(document.activeElement!==focusTarget && mainElement){
      mainElement.setAttribute('tabindex','-1');
      mainElement.focus({preventScroll:true});
    }
  }
  hasRendered=true;
  previousRoute=routeKey;
  document.title=current.screen==='wardrobe'?t('wardrobePageTitle'):
    current.screen==='profile'?t('profilePageTitle'):
    current.screen==='morning'?t('morningPageTitle'):
    current.screen==='overview'||current.screen==='review'?t('overviewPageTitle'):
    current.screen==='gallery'?t('galleryPageTitle'):
    current.screen==='check'?t('checkPageTitle'):t('generalPageTitle');
  message='';
  if(!publicRoute){const page=root!.querySelector('.page');page?.insertAdjacentHTML('beforeend','<button type="button" class="text-link guide-launch" data-guide-start>Guided walkthrough</button>');}
  window.dispatchEvent(new Event('wearagain:rendered'));
}
root.addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const control = target.closest<HTMLElement>('button, [data-nav]');
  if (!control) return;
  if(control.hasAttribute('data-guide-start')){walkthrough?.start();return;}
  if(!publicRoute&&accountClick(control,{base:baseStorage,store:storage,notice:value=>{message=value;},rerender:render}))return;
  if(!publicRoute&&personalClick(control,{wardrobe:data,storage,notice:value=>{message=value;},rerender:render}))return;
  if(publicRoute){
    handleMarketingClick(control,render);
    return;
  }
  if (handlePlansClick(control, {wardrobe:data,storage,rerender:render,notice:value=>{message=value;},navigate})) return;
  if (handleStylistClick(control, { wardrobe: data, storage, rerender: render, notice: value => { message = value; }, navigate,
    wear:look=>{try{daily=wearToday(daily,data,look,localISODate(new Date()));message=storeDaily(daily,storage)?t('morningSavedAsToday'):t('localStorageDenied');}catch(error){message=error instanceof Error?error.message:t('dailyInvalidLook');}}
  })) return;
  if (handlePurchaseClick(control, { wardrobe:data, rerender: render, notice: value => { message = value; } })) return;
  if (handleGalleryClick(control, {storage,rerender:render,notice:value=>{message=value;},focus:focusAfterRender})) return;
  if (handleMorningClick(control, {wardrobe:data,daily,storage,updateDaily:next=>{daily=next;},rerender:render,notice:value=>{message=value;}})) return;
  if (handleOverviewClick(control, {wardrobe:data,decisions,storage,
      updateDecisions:next=>{decisions=next;},updateWardrobe:next=>{persist(next);},
      navigate,rerender:render,notice:value=>{message=value;}})) return;
  if (control.hasAttribute('data-expand')) { revealMore = true; render(); return; }
  if(control.hasAttribute('data-pwa-install')){void installWebApp().catch(()=>{message=t('mktPwaNotAvailable');}).finally(render);return;}
  if (control.dataset.nav) { navigate(control.dataset.nav); return; }
  if (control.dataset.cat && (control.dataset.cat === 'all' || CATEGORIES.includes(control.dataset.cat as Category))) {
    category = control.dataset.cat as Category | 'all'; render(); return;
  }
  if (control.dataset.item) { navigate('item/' + control.dataset.item); return; }
  if (control.dataset.status && control.dataset.statusItem) {
    persist(setAvailability(data, control.dataset.statusItem, control.dataset.status as Availability));
    message ||= t('statusChanged'); render();
  }
});
// Native-like keyboard traversal for button-based radio groups. Roving tabindex
// avoids trapping tab focus while preserving existing verified click handlers.
root.addEventListener('keydown',event=>{
  const target=event.target;
  if(!(target instanceof HTMLElement)||target.getAttribute('role')!=='radio')return;
  if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const group=target.closest('[role="radiogroup"]');
  if(!group)return;
  const choices=Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])'));
  if(!choices.length)return;
  const index=choices.indexOf(target);
  const next=event.key==='Home'?0:event.key==='End'?choices.length-1:
    (index+(event.key==='ArrowRight'||event.key==='ArrowDown'?1:choices.length-1))%choices.length;
  event.preventDefault();
  choices[next]?.focus({preventScroll:true});
  choices[next]?.click();
});
root.addEventListener('input', event => {
  const target = event.target;
  if(target instanceof HTMLInputElement && target.closest('#add-form')){
    const form=target.closest<HTMLFormElement>('form')!;const values=new FormData(form);
    addDraft={name:String(values.get('name')??''),detail:String(values.get('detail')??''),category:String(values.get('category')??'tops'),availability:String(values.get('availability')??'ready')};
  }
  if(target instanceof HTMLTextAreaElement && handleMorningInput(target))return;
  if(target instanceof HTMLInputElement && handleGalleryInput(target))return;
  if (!(target instanceof HTMLInputElement) || target.id !== 'wardrobe-search') return;
  search = target.value;
  const grid = root.querySelector('#wardrobe-grid');
  if (grid) grid.innerHTML = gridMarkup();
});
root.addEventListener('change', event => {
  const target=event.target;
  if(target instanceof HTMLElement&&stylistChange(target,render))return;
  if(target instanceof HTMLElement&&accountChange(target,{base:baseStorage,store:storage,notice:value=>{message=value;},rerender:render}))return;
  if(target instanceof HTMLElement&&personalChange(target,{wardrobe:data,storage,notice:value=>{message=value;},rerender:render}))return;
  if(target instanceof HTMLSelectElement && target.id==='review-availability' && target.dataset.statusItem && Object.hasOwn(AVAILABILITY,target.value)){
    persist(setAvailability(data,target.dataset.statusItem,target.value as Availability));message ||= t('statusChanged');render();return;
  }
  if(target instanceof HTMLSelectElement && handlePurchaseChange(target)){render();return;}
  if(target instanceof HTMLInputElement && handlePlansChange(target,{wardrobe:data,storage,rerender:render,notice:value=>{message=value;},navigate}))return;
  if(target instanceof HTMLInputElement && target.id==='wardrobe-photo'){
    const file=target.files?.[0];if(!file)return;
    if(!supportedPhoto(file)){message=t('wardrobePhotoError');render();return;}
    if(addPhotoUrl)URL.revokeObjectURL(addPhotoUrl);addPhoto=file;addPhotoUrl=URL.createObjectURL(file);
    const preview=root.querySelector('.add-photo-preview');if(preview)preview.innerHTML='<img src="'+safe(addPhotoUrl)+'" alt="'+msg('wardrobePhotoSelected')+'" />';return;
  }
  if(target instanceof HTMLSelectElement && handleOverviewMonthChange(target)){render();return;}
  if(target instanceof HTMLInputElement && handleGalleryFile(target,{storage,rerender:render,notice:value=>{message=value;},focus:focusAfterRender}))return;
});
root.addEventListener('submit', event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if(form.id==='agent-feedback-form'){event.preventDefault();submitAgentFeedback(form,{wardrobe:data,storage,rerender:render,notice:value=>{message=value;}});return;}
  event.preventDefault();
  if(accountSubmit(form,{base:baseStorage,store:storage,notice:value=>{message=value;},rerender:render}))return;
  if(personalSubmit(form,{wardrobe:data,storage,notice:value=>{message=value;},rerender:render}))return;
  if(handlePlansSubmit(form,{wardrobe:data,storage,rerender:render,notice:value=>{message=value;},navigate}))return;
  if (form.id === 'stylist-form') {
    submitStylist(form,{ wardrobe:data, storage, rerender:render, notice:value => { message = value; } });
  } else if (submitMorning(form,{wardrobe:data,daily,storage,updateDaily:next=>{daily=next;},rerender:render,notice:value=>{message=value;}})) {
    // Morning session handled locally.
  } else if (handleGallerySubmit(form,{storage,rerender:render,notice:value=>{message=value;},focus:focusAfterRender})) {
    // Mall metadata and link capture handled locally.
  } else if (form.id === 'style-form') {
    if(persist(setStyle(data, (form.elements.namedItem('style') as HTMLTextAreaElement).value)))guideStyleSaves++;
    message ||= t('styleSaved'); render();
  } else if (form.id === 'add-form') {
    const entries = new FormData(form);
    const id = 'own_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 100000).toString(36);
    try {
      const details = {
        id, name: String(entries.get('name') ?? ''), detail: String(entries.get('detail') ?? ''),
        category: String(entries.get('category')) as Category,
        availability: String(entries.get('availability')) as Availability,
      };
      addItem(data,details); // Validate text before committing a device photo.
      const photo=addPhoto;
      const complete=()=>{
        persist(addItem(data,{...details,...(photo?{photoId:id}:{})}));
        if(addPhoto===photo){if(addPhotoUrl)URL.revokeObjectURL(addPhotoUrl);addPhoto=null;addPhotoUrl='';addDraft={name:'',detail:'',category:'tops',availability:'ready'};}
        message ||= t('itemAdded');if(route().screen==='add')navigate('wardrobe');else render();
      };
      if(photo){const submit=form.querySelector<HTMLButtonElement>('[type=submit]');if(submit){submit.disabled=true;submit.textContent=t('wardrobeSaving');}
        void storePhoto(id,photo).then(complete).catch(()=>{message=t('wardrobePhotoError');render();});
      }else complete();
    } catch { message = t('itemSaveError'); render(); }
  }
});
if(!publicRoute)window.addEventListener('hashchange', render);
if(!publicRoute)document.addEventListener('visibilitychange',()=>{
  if(document.hidden){stopCamera();stopMorningDictation();}
  else if(route().screen==='gallery'||route().screen==='morning')render();
});
if(!publicRoute)walkthrough=createWardrobeWalkthrough({storage,navigate,facts:()=>({route:location.hash.slice(1)||'wardrobe',itemExists:data.items.some(item=>item.id===route().itemId),styleSaves:guideStyleSaves,...purchaseWalkthroughFacts(),saved:JSON.stringify(loadSaved(storage)),...galleryWalkthroughFacts(storage),wears:JSON.stringify(daily.wears),packed:JSON.stringify(readTrip(storage).packed)})});
render();
if(!publicRoute&&new URL(location.href).searchParams.get('guide')==='start'){const url=new URL(location.href);url.searchParams.delete('guide');history.replaceState(history.state,'',url);walkthrough?.start();}
