import {
  AVAILABILITY, CATEGORIES, addItem, availabilityLabel, categoryLabel, itemsForView,
  loadState, saveState, setAvailability, setStyle,
  type Availability, type Category, type WardrobeItem, type WardrobeState,
} from './state.js';
import { DEFAULT_LOCALE, t, type TranslationKey } from './i18n.js';
import { marketingRoute } from './marketing-model.js';
import { marketingPage, marketingTitle, handleMarketingClick } from './marketing.js';
import { setupPwa } from './pwa.js';
import { purchasePage, handlePurchaseClick } from './purchase-ui.js';
import { recordedPreviewForItem } from './stylist.js';
import { loadDaily, loadDecisions, type DailyState, type DecisionsState } from './daily.js';
import { morningPage, handleMorningInput, handleMorningClick, submitMorning } from './morning-ui.js';
import { overviewPage, reviewItemPage, handleOverviewClick } from './overview-ui.js';
import { galleryPage, handleGalleryInput, handleGalleryClick, handleGallerySubmit, handleGalleryFile } from './gallery-ui.js';
import { handleStylistClick, savedPage, stylistPage, submitStylist } from './stylist-ui.js';
import './style.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing app root.');
document.documentElement.lang = DEFAULT_LOCALE;
const publicRoute = marketingRoute(window.location.pathname);
if (!publicRoute && /^\/app(?:\/|$)/.test(window.location.pathname)) setupPwa();

type Screen = 'wardrobe' | 'profile' | 'stylist' | 'check' | 'saved' | 'gallery' | 'add' | 'item' | 'morning' | 'overview' | 'review';
type NavId = 'wardrobe' | 'stylist' | 'check' | 'profile' | 'saved' | 'gallery' | 'morning' | 'overview';
const navIds: readonly NavId[] = ['wardrobe', 'stylist', 'check', 'profile', 'saved', 'gallery', 'morning', 'overview'];
let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* Browsers may disable persistence. */ }
let data: WardrobeState = loadState(storage);
let daily: DailyState = loadDaily(storage);
let decisions: DecisionsState = loadDecisions(storage);
let category: Category | 'all' = 'all';
let search = '';
let revealMore = false;
let message = '';

const paths: Record<string, string> = {
  hanger: '<path d="M9 5a3 3 0 0 1 6 0c0 2-3 2-3 4l9 7a2 2 0 0 1-8 0Z"/>',
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
  if (['wardrobe', 'profile', 'stylist', 'check', 'saved', 'gallery', 'add', 'morning', 'overview'].includes(value))
    return { screen: value as Screen, itemId: '' };
  return { screen: 'wardrobe', itemId: '' };
}
function navigate(to: string): void {
  if (window.location.hash === '#' + to) render();
  else window.location.hash = to;
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function persist(next: WardrobeState): void {
  data = next;
  if (!saveState(data, storage)) message = t('localStorageDenied');
}
function navButton(id: NavId, desktop: boolean, active: NavId): string {
  const labels: Record<NavId, TranslationKey> = {
    wardrobe: 'wardrobe', stylist: 'stylist', check: desktop ? 'checkPurchase' : 'check', profile: 'profile',
    saved: 'savedLooks', gallery: 'shoppingGallery', morning:'morningNav', overview:'overviewNav',
  };
  const symbols: Record<NavId, string> = {
    wardrobe: 'hanger', stylist: 'sparkles', check: 'bag', profile: 'user',
    saved: 'bookmark', gallery: 'bag', morning:'sparkles', overview:'hanger',
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
    (['saved', 'gallery', 'morning', 'overview'] as NavId[]).map(id => navButton(id, true, active)).join('') + '</nav>' +
    '<button type="button" class="sidebar-profile" data-nav="profile">' +
    '<img src="/assets/demo-portrait.webp" alt="" /><span><strong>Anna</strong><small>' +
    msg('styleLink') + ' ' + icon('arrow') + '</small></span></button></aside>';
}
function bottomBar(active: NavId): string {
  return '<nav class="bottom-nav" aria-label="' + msg('navAria') + '">' +
    (['wardrobe', 'stylist', 'check', 'profile'] as NavId[]).map(id => navButton(id, false, active)).join('') + '</nav>';
}
function itemImage(item: WardrobeItem): string {
  const record = recordedPreviewForItem(item.id);
  return item.photo
    ? '<img src="/assets/items/' + safe(item.photo) + '.webp" alt="' + safe(item.name) + '" loading="lazy" />'
    : record ? '<img src="' + safe(record) + '" alt="' + safe(item.name) + '" loading="lazy" />'
    : '<div class="no-photo" aria-label="' + msg('noPhoto') + '">' + icon('hanger') + '<span>' + msg('noPhoto') + '</span></div>';
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
    '<div class="wardrobe-shortcuts"><button type="button" class="text-link" data-nav="overview">' + msg('overviewNav') + ' →</button>' +
    '<button type="button" class="text-link" data-nav="morning">' + msg('morningNav') + ' →</button></div>' +
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
    '<p class="demo-explainer">' + msg('sampleWardrobe') + '</p></section>';
}
function profile(): string {
  return '<section class="page profile-view" aria-labelledby="profile-title">' +
    '<button class="back-link" type="button" data-nav="wardrobe">' + icon('left') + ' ' + msg('goBackWardrobe') + '</button>' +
    '<h1 id="profile-title">' + t('styleHeadline') + '</h1>' +
    '<p class="intro-subtitle">' + msg('styleGuidance') + '</p>' +
    '<form id="style-form"><label class="visually-hidden" for="style-description">' + msg('describeStyle') + '</label>' +
    '<textarea maxlength="5000" id="style-description" name="style" rows="6">' + safe(data.style) + '</textarea>' +
    '<p class="field-hint">' + msg('changeAnytime') + '</p>' +
    '<h2>' + msg('seeLooksOnYou') + '</h2>' +
    '<div class="model-options"><div class="model-choice chosen"><img src="/assets/demo-portrait.webp" alt="' + msg('demoModel') + '" />' +
    '<span class="model-check" aria-hidden="true">' + icon('check') + '</span><span>' + msg('demoModel') + '</span></div>' +
    '<button class="model-choice model-unavailable" type="button" disabled aria-label="' + msg('ownPhotoUnavailable') + '">' +
    '<span class="camera-placeholder">' + icon('camera') + '</span><span>' + msg('ownPhoto') + '</span></button></div>' +
    '<p class="privacy-line">' + icon('lock') + ' ' + msg('photoPrivacy') + '</p>' +
    '<p class="field-hint">' + msg('photoFuture') + '</p>' +
    '<p class="field-hint">' + msg('styleFitDisclaimer') + '</p>' +
    '<button type="submit" class="button button-primary full-width">' + msg('saveMyStyle') + '</button></form></section>';
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
    '<form id="add-form" class="edit-form"><label>' + msg('itemName') +
    '<input name="name" required maxlength="80" placeholder="' + msg('itemNamePlaceholder') + '" autocomplete="off" /></label>' +
    '<label>' + msg('colorMaterial') + '<input name="detail" maxlength="100" placeholder="' + msg('colorMaterialPlaceholder') + '" autocomplete="off" /></label>' +
    '<label>' + msg('category') + '<select name="category">' +
    CATEGORIES.map(key => '<option value="' + key + '">' + safe(categoryLabel(key)) + '</option>').join('') + '</select></label>' +
    '<label>' + msg('status') + '<select name="availability">' +
    (Object.keys(AVAILABILITY) as Availability[]).map(key => '<option value="' + key + '">' + safe(availabilityLabel(key)) + '</option>').join('') +
    '</select></label><p class="field-hint">' + msg('photosLater') + '</p>' +
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
  const whyOpen=same&&!!root!.querySelector('.purchase-certificate[open]');
  const current = route();
  const active: NavId = current.screen === 'item' || current.screen === 'add' ? 'wardrobe'
    : current.screen==='review'?'overview'
    : navIds.includes(current.screen as NavId)?current.screen as NavId:'wardrobe';
  const page = current.screen === 'wardrobe' ? wardrobe()
    : current.screen === 'stylist' ? stylistPage(data)
    : current.screen === 'check' ? purchasePage()
    : current.screen === 'morning' ? morningPage(data,daily)
    : current.screen === 'overview' ? overviewPage(data,daily,decisions)
    : current.screen === 'review' ? reviewItemPage(current.itemId,data,daily,decisions,storage)
    : current.screen === 'gallery' ? galleryPage(storage,render)
    : current.screen === 'saved' ? savedPage(storage)
    : current.screen === 'profile' ? profile()
    : current.screen === 'item' ? itemDetail(current.itemId)
    : current.screen === 'add' ? addScreen() : placeholder(current.screen);
  root!.innerHTML = '<div class="app-shell">' + sidebar(active) + '<main id="main-content" class="main-content">' +
    mobileBar() + (message ? '<p role="status" class="notice">' + safe(message) + '</p>' : '') +
    page + '</main>' + bottomBar(
      current.screen==='gallery'?'check':
      current.screen==='morning'?'stylist':
      current.screen==='overview'||current.screen==='review'?'wardrobe':active
    ) + '</div>';
  if(whyOpen){
    const details=root!.querySelector<HTMLDetailsElement>('.purchase-certificate');
    if(details)details.open=true;
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
  if(focusTarget && (hasRendered||routeKey!=='')){
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
}
root.addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const control = target.closest<HTMLElement>('[data-nav], [data-cat], [data-item], [data-status], [data-expand], [data-stylist-reset], [data-occasion], [data-look-next], [data-look-prev], [data-save-look], [data-purchase-demo], [data-purchase-candidate], [data-purchase-top], [data-purchase-rating], [data-purchase-clear], [data-purchase-replay], [data-purchase-choice], [data-purchase-next], [data-purchase-prev], [data-mall-view], [data-mall-filter], [data-mall-step], [data-mall-decision], [data-mall-undo], [data-mall-remove], [data-mall-context-toggle], [data-morning-select], [data-morning-wear], [data-morning-reset], [data-morning-voice], [data-overview-review], [data-overview-decision], [data-overview-save], [data-retail-panel-toggle], [data-retail-size], [data-retail-save], [data-guide-step], [data-judge-mode]');
  if (!control) return;
  if(publicRoute){
    handleMarketingClick(control,render);
    return;
  }
  if (handleStylistClick(control, { wardrobe: data, storage, rerender: render, notice: value => { message = value; } })) return;
  if (handlePurchaseClick(control, { rerender: render, notice: value => { message = value; } })) return;
  if (handleGalleryClick(control, {storage,rerender:render,notice:value=>{message=value;},focus:focusAfterRender})) return;
  if (handleMorningClick(control, {wardrobe:data,daily,storage,updateDaily:next=>{daily=next;},rerender:render,notice:value=>{message=value;}})) return;
  if (handleOverviewClick(control, {wardrobe:data,decisions,storage,
      updateDecisions:next=>{decisions=next;},updateWardrobe:next=>{persist(next);},
      navigate,rerender:render,notice:value=>{message=value;}})) return;
  if (control.hasAttribute('data-expand')) { revealMore = true; render(); return; }
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
  if(target instanceof HTMLTextAreaElement && handleMorningInput(target))return;
  if(target instanceof HTMLInputElement && handleGalleryInput(target))return;
  if (!(target instanceof HTMLInputElement) || target.id !== 'wardrobe-search') return;
  search = target.value;
  const grid = root.querySelector('#wardrobe-grid');
  if (grid) grid.innerHTML = gridMarkup();
});
root.addEventListener('change', event => {
  const target=event.target;
  if(target instanceof HTMLInputElement && handleGalleryFile(target,{storage,rerender:render,notice:value=>{message=value;},focus:focusAfterRender}))return;
});
root.addEventListener('submit', event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.id === 'stylist-form') {
    submitStylist(form,{ wardrobe:data, storage, rerender:render, notice:value => { message = value; } });
  } else if (submitMorning(form,{wardrobe:data,daily,storage,updateDaily:next=>{daily=next;},rerender:render,notice:value=>{message=value;}})) {
    // Morning session handled locally.
  } else if (handleGallerySubmit(form,{storage,rerender:render,notice:value=>{message=value;},focus:focusAfterRender})) {
    // Mall metadata and link capture handled locally.
  } else if (form.id === 'style-form') {
    persist(setStyle(data, (form.elements.namedItem('style') as HTMLTextAreaElement).value));
    message ||= t('styleSaved'); render();
  } else if (form.id === 'add-form') {
    const entries = new FormData(form);
    const id = 'own_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 100000).toString(36);
    try {
      persist(addItem(data, {
        id, name: String(entries.get('name') ?? ''), detail: String(entries.get('detail') ?? ''),
        category: String(entries.get('category')) as Category,
        availability: String(entries.get('availability')) as Availability,
      }));
      message ||= t('itemAdded'); navigate('wardrobe');
    } catch { message = t('itemSaveError'); render(); }
  }
});
if(!publicRoute)window.addEventListener('hashchange', render);
render();
