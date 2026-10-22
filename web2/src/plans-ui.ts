import { addItem, CATEGORIES, categoryLabel, type Category, type WardrobeState } from './state.js';
import { demoLooks, loadSaved, type OccasionSuggestion } from './stylist.js';
import { type DailyState } from './daily.js';
import { addTripEvent, assignTripLook, companionPackingIds, newId, packingIds, pendingTripLook, readNeeds, readSurprise, readTrip, saveLocal,
  updateTrip, TRIP_KEY, SURPRISE_KEY, NEEDS_KEY, type TripPlan, type SurprisePreferences, type WardrobeNeed } from './plans.js';
import { storePhoto, supportedPhoto } from './photo-store.js';
import { esc, icon, itemPicture, outfitBoard } from './ui.js';
import { t } from './i18n.js';
import './plans.css';

type Store = Pick<Storage, 'getItem' | 'setItem'> | undefined;
type Actions = { readonly wardrobe: WardrobeState; readonly storage: Store; readonly rerender: () => void; readonly notice: (value: string) => void; readonly navigate: (path: string) => void };
let trip: TripPlan | null = null, surprise: SurprisePreferences | null = null, needs: WardrobeNeed[] | null = null;
let shared = false, editTrip = false, selectedEvent = '', choosingCompanion = false, balanceCategory: Category = 'tops';
function initialise(store: Store): void { trip ??= readTrip(store); surprise ??= readSurprise(store); needs ??= readNeeds(store); }
const heading = (title: string, subtitle: string) => '<header class="feature-heading"><h1>' + esc(title) + '</h1><p>' + esc(subtitle) + '</p></header>';
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date));
const choices = (wardrobe: WardrobeState, store: Store): readonly OccasionSuggestion[] => [
  ...loadSaved(store).filter(look => look.itemIds.every(id => wardrobe.items.some(item => item.id === id && item.availability === 'ready'))).map(look => ({ ...look, explanation: look.occasion || look.title, heroImagePath: null })),
  ...demoLooks(wardrobe).looks,
].slice(0, 12);

export function tripPage(wardrobe: WardrobeState, store: Store): string {
  initialise(store);
  const plan = trip!, pending = pendingTripLook();
  const selected = plan.events.find(event => event.id === selectedEvent);
  const available = choices(wardrobe, store);
  const packing = packingIds(plan).flatMap(id => wardrobe.items.filter(item => item.id === id));
  const companionPacking=companionPackingIds(plan).flatMap(id=>plan.companion.items.filter(item=>item.id===id));
  return '<section class="page trip-view">' + heading(plan.destination + ', ' + t('tripTitle').toLowerCase().replace('away, ', ''), t('tripSubtitle')) +
    '<div class="trip-dates"><span>' + esc(dateLabel(plan.from)) + ' — ' + esc(dateLabel(plan.until)) + '</span><button type="button" class="text-link" data-trip-edit>' + esc(t('tripEdit')) + '</button></div>' +
    (editTrip ? '<form id="trip-edit-form" class="feature-form"><label>' + esc(t('tripDestination')) + '<input name="destination" required maxlength="100" value="' + esc(plan.destination) + '" /></label><div class="feature-form-row"><label>' +
      esc(t('tripStart')) + '<input name="from" type="date" required value="' + plan.from + '" /></label><label>' + esc(t('tripEnd')) + '<input name="until" type="date" required value="' + plan.until + '" /></label></div><button class="button button-primary" type="submit">' + esc(t('tripSave')) + '</button></form>' : '') +
    '<div class="feature-tabs" role="group" aria-label="' + esc(t('tripNav')) + '"><button type="button" data-trip-shared="no" aria-pressed="' + !shared + '">' + esc(t('tripMyWardrobe')) + '</button><button type="button" data-trip-shared="yes" aria-pressed="' + shared + '">' + esc(t('tripOurWardrobes')) + '</button></div>' +
    (pending ? '<section class="trip-pending"><h2>' + esc(t('tripChooseEvent')) + '</h2>' + outfitBoard(pending.itemIds, wardrobe, true) + '<p>' + esc(pending.title) + '</p></section>' : '') +
    (shared ? companionPanel(plan) : '') +
    '<div class="trip-layout"><div><div class="trip-event-list">' + plan.events.map(event => {
      const ready = event.outfit?.itemIds.every(id => wardrobe.items.some(item => item.id === id && item.availability === 'ready'));
      return '<article class="trip-event"><div class="trip-event-heading"><div><small>' + esc(dateLabel(event.date)) + '</small><h2>' + esc(event.label) + '</h2></div><button type="button" data-trip-remove-event="' + esc(event.id) + '" class="icon-button" aria-label="' + esc(t('tripRemoveEvent')) + '">' + icon('close') + '</button></div>' +
        (event.outfit ? '<div class="trip-event-outfit">' + outfitBoard(event.outfit.itemIds, wardrobe, true) + '<div><strong>' + esc(event.outfit.title) + '</strong><p class="' + (ready ? 'ready-copy' : 'not-ready-copy') + '">' + esc(t(ready ? 'tripReady' : 'tripNotReady')) + '</p></div></div>' : '') +
        '<button class="text-link" type="button" ' + (pending ? 'data-trip-assign-pending' : 'data-trip-select-event') + '="' + esc(event.id) + '">' + esc(pending ? t('tripOutfitUse') : t('tripChooseOutfit')) + icon('arrow') + '</button>' +
        (shared && plan.companionName ? '<div class="trip-companion-event"><strong>' + esc(plan.companionName) + '</strong>' +
          (event.companionItemIds.length ? outfitBoard(event.companionItemIds, plan.companion, true) : '') + '<button class="text-link" type="button" data-trip-companion-event="' + esc(event.id) + '">' + esc(t('tripBuildCompanion')) + '</button></div>' : '') + '</article>';
    }).join('') + '</div>' +
    (!plan.events.length ? '<p>' + esc(t('tripNoEvents')) + '</p>' : '') +
    (selected ? '<section class="trip-outfit-picker" aria-labelledby="trip-picker-title"><h2 id="trip-picker-title">' + esc(choosingCompanion ? t('tripCompanionReady') : t('tripChooseOutfit')) + '</h2><p>' + esc(selected.label) + '</p>' +
      (choosingCompanion ? '<form id="trip-companion-outfit"><input type="hidden" name="event" value="' + esc(selected.id) + '" /><div class="companion-piece-choices">' + plan.companion.items.map(item => '<label><input type="checkbox" name="piece" value="' + esc(item.id) + '" ' + (item.availability !== 'ready' ? 'disabled' : '') + ' />' + itemPicture(item) + '<span>' + esc(item.name) + '</span></label>').join('') + '</div><button class="button button-primary" type="submit">' + esc(t('tripOutfitUse')) + '</button></form>' :
      '<div class="trip-outfit-choices">' + available.map((look, i) => '<button type="button" data-trip-choose-look="' + i + '">' + outfitBoard(look.itemIds, wardrobe, true) + '<strong>' + esc(look.title) + '</strong></button>').join('') + '</div>' +
      '<button class="button button-outline" data-nav="stylist" type="button">' + esc(t('stylistPageTitle')) + icon('arrow') + '</button>') + '</section>' : '') +
    '<details class="trip-add-event"><summary>' + icon('plus') + esc(t('tripAddEvent')) + '</summary><form id="trip-event-form" class="feature-form"><label>' + esc(t('tripEventName')) + '<input name="label" required maxlength="160" /></label><label>' + esc(t('tripEventDate')) + '<input name="date" type="date" required min="' + plan.from + '" max="' + plan.until + '" value="' + plan.from + '" /></label><button class="button button-outline" type="submit">' + esc(t('tripEventAdd')) + '</button></form></details></div>' +
    '<aside class="trip-packing"><h2>' + esc(t('tripPacking')) + '</h2>' + (packing.length ? packing.map(item => '<label class="trip-packing-row"><input type="checkbox" data-trip-packed="' + esc(item.id) + '" ' + (plan.packed.includes(item.id) ? 'checked' : '') + ' /><span class="trip-packing-photo">' + itemPicture(item) + '</span><span>' + esc(item.name) + '</span></label>').join('') : '<p>' + esc(t('tripPackingEmpty')) + '</p>') +
    (shared&&companionPacking.length?'<h3>'+esc(plan.companionName)+'</h3>'+companionPacking.map(item=>'<label class="trip-packing-row"><input type="checkbox" data-trip-packed="companion_'+esc(item.id)+'" '+(plan.packed.includes('companion_'+item.id)?'checked':'')+' /><span class="trip-packing-photo">'+itemPicture(item)+'</span><span>'+esc(item.name)+'</span></label>').join(''):'')+'</aside></div></section>';
}
function companionPanel(plan: TripPlan): string {
  return '<section class="trip-companion"><form id="trip-companion-name" class="companion-name-form"><label>' + esc(t('tripCompanionName')) + '<input name="name" required maxlength="80" value="' + esc(plan.companionName) + '" /></label><button class="button button-outline" type="submit">' + esc(t(plan.companionName ? 'tripSave' : 'tripAddCompanion')) + '</button></form><p class="feature-note">' + esc(t('tripCompanionNote')) + '</p>' +
    (plan.companionName ? '<div class="companion-wardrobe"><strong>' + esc(t('tripCompanionPieces', { count: plan.companion.items.length })) + '</strong>' + (!plan.companion.items.length ? '<p>' + esc(t('tripCompanionEmpty')) + '</p>' : '') +
      '<details><summary>' + icon('plus') + esc(t('tripAddPiece')) + '</summary><form id="trip-companion-piece" class="feature-form"><label>' + esc(t('itemName')) + '<input name="name" required maxlength="80" /></label><label>' + esc(t('category')) + '<select name="category">' + CATEGORIES.map(category => '<option value="' + category + '">' + esc(categoryLabel(category)) + '</option>').join('') + '</select></label><label>' + esc(t('wardrobePhotoLabel')) + '<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" /></label><button type="submit" class="button button-primary">' + esc(t('tripAddPiece')) + '</button></form></details></div>' : '') + '</section>';
}
export function surprisePage(store: Store): string {
  initialise(store); const value = surprise!;
  return '<section class="page surprise-view">' + heading(t('surpriseTitle'), t('surpriseIntro')) + '<img class="surprise-photo" src="/assets/surprise-scarf.webp" alt="' + esc(t('surprisePhotoAlt')) + '" />' +
    '<form id="surprise-form" class="feature-form"><fieldset class="surprise-budgets"><legend>' + esc(t('surpriseBudget')) + '</legend><div>' + ([100, 200, 300] as const).map(budget => '<label><input type="radio" name="budget" value="' + budget + '" ' + (value.budget === budget ? 'checked' : '') + ' /><span>' + budget + ' PLN</span></label>').join('') + '</div></fieldset>' +
    '<div class="surprise-wallet"><span>' + esc(t('surpriseWallet')) + '</span><strong>0 PLN<small>' + esc(t('surpriseWalletDemo')) + '</small></strong></div><label>' + esc(t('surpriseNeed')) + '<textarea name="need" maxlength="500" rows="3" placeholder="' + esc(t('surpriseNeedHint')) + '">' + esc(value.need) + '</textarea></label>' +
    '<ul class="surprise-promises"><li>' + icon('check') + esc(t('surpriseSkip')) + '</li><li>' + icon('check') + esc(t('surpriseReturn')) + '</li></ul>' +
    '<details class="surprise-rules"><summary>' + esc(t('surpriseRules')) + '</summary><ol><li>' + esc(t('surpriseRule1')) + '</li><li>' + esc(t('surpriseRule2')) + '</li><li>' + esc(t('surpriseRule3')) + '</li></ol></details>' +
    '<button type="submit" class="button button-primary full-width">' + esc(t('surpriseSave')) + '</button><p class="feature-note">' + esc(t('surprisePending')) + '</p></form><button type="button" class="text-link" data-surprise-skip>' + esc(t(value.skipNext ? 'surpriseResume' : 'surprisePause')) + '</button><p class="feature-note">' + esc(t(value.skipNext ? 'surprisePaused' : 'surpriseOptional')) + '</p></section>';
}
export function balancePage(wardrobe: WardrobeState, daily: DailyState, store: Store): string {
  initialise(store);
  const items = wardrobe.items.filter(item => item.category === balanceCategory);
  return '<section class="page balance-view"><button type="button" class="back-link" data-nav="overview">' + icon('left') + esc(t('overviewBack')) + '</button>' + heading(t('balanceTitle'), t('balanceSubtitle')) +
    '<div class="balance-layout"><div><div class="balance-category-list" role="group" aria-label="' + esc(t('category')) + '">' + CATEGORIES.map(category => {
      const group = wardrobe.items.filter(item => item.category === category);
      return '<button type="button" data-balance-category="' + category + '" aria-pressed="' + (category === balanceCategory) + '"><strong>' + esc(categoryLabel(category)) + '</strong><span>' + esc(t('balanceCategory', { count: group.length, ready: group.filter(item => item.availability === 'ready').length })) + '</span></button>';
    }).join('') + '</div><h2>' + esc(t('balanceCompare')) + '</h2><p class="feature-note">' + esc(t('balanceNoDuplicateClaim')) + '</p><div class="balance-pieces">' + items.map(item => {
      const count = daily.wears.filter(wear => wear.itemIds.includes(item.id)).length;
      return '<button type="button" data-overview-review="' + esc(item.id) + '"><span>' + itemPicture(item) + '</span><strong>' + esc(item.name) + '</strong><small>' + esc(t(count ? 'balanceWears' : 'balanceNoLog', { count })) + '</small></button>';
    }).join('') + '</div></div><aside class="balance-needs"><h2>' + esc(t('balanceGaps')) + '</h2><p>' + esc(t('balanceGapHint')) + '</p>' +
    '<div>' + (needs!.length ? needs!.map(need => '<article><strong>' + esc(need.label) + '</strong><button class="text-link" type="button" data-need-resolve="' + esc(need.id) + '">' + esc(t('balanceGapDone')) + '</button></article>').join('') : '<p class="feature-note">' + esc(t('balanceNoGaps')) + '</p>') + '</div>' +
    '<form id="wardrobe-need-form" class="feature-form"><label>' + esc(t('balanceAddGap')) + '<input name="need" required maxlength="160" /></label><button type="submit" class="button button-outline">' + esc(t('balanceAddGap')) + '</button></form></aside></div></section>';
}
function persistTrip(actions: Actions, message: string): void {
  actions.notice(saveLocal(TRIP_KEY, trip, actions.storage) ? message : t('localStorageDenied'));
  actions.rerender();
}
export function handlePlansClick(button: HTMLElement, actions: Actions): boolean {
  initialise(actions.storage); const d = button.dataset;
  if (button.hasAttribute('data-trip-edit')) editTrip = !editTrip;
  else if (d.tripShared) shared = d.tripShared === 'yes';
  else if (d.tripRemoveEvent) { trip = { ...trip!, events: trip!.events.filter(event => event.id !== d.tripRemoveEvent) }; persistTrip(actions, t('tripSaved')); return true; }
  else if (d.tripSelectEvent || d.tripCompanionEvent) { selectedEvent = (d.tripSelectEvent ?? d.tripCompanionEvent)!; choosingCompanion = !!d.tripCompanionEvent; }
  else if (d.tripChooseLook !== undefined || d.tripAssignPending) {
    const look = d.tripAssignPending ? pendingTripLook() : choices(actions.wardrobe, actions.storage)[Number(d.tripChooseLook)];
    if (look) { trip = assignTripLook(trip!, d.tripAssignPending ?? selectedEvent, look, actions.wardrobe); selectedEvent = ''; persistTrip(actions, t('tripOutfitSaved')); return true; }
  } else if (d.balanceCategory && CATEGORIES.includes(d.balanceCategory as Category)) balanceCategory = d.balanceCategory as Category;
  else if (d.needResolve) { needs = needs!.filter(need => need.id !== d.needResolve); if (!saveLocal(NEEDS_KEY, { version: 1, entries: needs }, actions.storage)) actions.notice(t('localStorageDenied')); }
  else if (button.hasAttribute('data-surprise-skip')) { surprise = { ...surprise!, skipNext: !surprise!.skipNext }; actions.notice(saveLocal(SURPRISE_KEY, surprise, actions.storage) ? t(surprise.skipNext ? 'surprisePaused' : 'surpriseSaved') : t('localStorageDenied')); }
  else return false;
  actions.rerender();
  if (selectedEvent) document.querySelector<HTMLElement>('.trip-outfit-picker')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}
export function handlePlansChange(input: HTMLInputElement, actions: Actions): boolean {
  if (!input.dataset.tripPacked) return false;
  initialise(actions.storage);
  const id = input.dataset.tripPacked;
  if (![...packingIds(trip!),...companionPackingIds(trip!).map(value=>'companion_'+value)].includes(id)) return true;
  trip = { ...trip!, packed: input.checked ? [...new Set([...trip!.packed, id])] : trip!.packed.filter(item => item !== id) };
  persistTrip(actions, t('tripSaved')); return true;
}
export function handlePlansSubmit(form: HTMLFormElement, actions: Actions): boolean {
  if (!['trip-edit-form', 'trip-event-form', 'trip-companion-name', 'trip-companion-piece', 'trip-companion-outfit', 'surprise-form', 'wardrobe-need-form'].includes(form.id)) return false;
  initialise(actions.storage); const value = new FormData(form); const field = (key: string) => String(value.get(key) ?? '').trim();
  try {
    if (form.id === 'trip-edit-form') { trip = updateTrip(trip!, field('destination'), field('from'), field('until')); editTrip = false; }
    else if (form.id === 'trip-event-form') trip = addTripEvent(trip!, field('label'), field('date'));
    else if (form.id === 'trip-companion-name') { if (!field('name') || field('name').length > 80) throw Error(t('tripInvalid')); trip = { ...trip!, companionName: field('name') }; shared = true; }
    else if (form.id === 'trip-companion-piece') {
      const id = newId('companion'), photo = value.get('photo');
      // Validate metadata before saving a device photo, so an invalid form
      // cannot leave an unattached image in IndexedDB.
      addItem(trip!.companion, { id, name: field('name'), detail: '', category: field('category') as Category, availability: 'ready' });
      const add = (photoId?: string) => { trip = { ...trip!, companion: addItem(trip!.companion, { id, name: field('name'), detail: '', category: field('category') as Category, availability: 'ready', ...(photoId ? { photoId } : {}) }) }; persistTrip(actions, t('itemAdded')); };
      if (photo instanceof File && photo.size) {
        if (!supportedPhoto(photo)) throw Error(t('wardrobePhotoError'));
        const submit = form.querySelector<HTMLButtonElement>('[type=submit]'); if (submit) submit.disabled = true;
        void storePhoto(id, photo).then(() => add(id)).catch(() => { actions.notice(t('wardrobePhotoError')); actions.rerender(); });
      } else add();
      return true;
    } else if (form.id === 'trip-companion-outfit') {
      const ids = value.getAll('piece').map(String), selected = trip!.companion.items.filter(item => ids.includes(item.id) && item.availability === 'ready');
      if (ids.length>6 || new Set(ids).size!==ids.length || !trip!.events.some(event=>event.id===field('event')) || selected.length !== ids.length || !selected.some(item => item.category === 'shoes') || !(selected.some(item => item.category === 'dresses') || (selected.some(item => item.category === 'tops') && selected.some(item => item.category === 'bottoms')))) throw Error(t('tripCompanionInvalid'));
      trip = { ...trip!, events: trip!.events.map(event => event.id === field('event') ? { ...event, companionItemIds: ids } : event) }; selectedEvent = '';
    } else if (form.id === 'surprise-form') {
      const budget = Number(field('budget')); if (![100, 200, 300].includes(budget) || field('need').length > 500) throw Error(t('tripInvalid'));
      surprise = { version: 1, budget: budget as 100 | 200 | 300, skipNext: surprise!.skipNext, need: field('need') };
      actions.notice(saveLocal(SURPRISE_KEY, surprise, actions.storage) ? t('surpriseSaved') : t('localStorageDenied')); actions.rerender(); return true;
    } else if (form.id === 'wardrobe-need-form') {
      if (!field('need') || field('need').length > 160 || needs!.length >= 100) throw Error(t('tripInvalid'));
      needs = [...needs!, { id: newId('need'), label: field('need') }]; actions.notice(saveLocal(NEEDS_KEY, { version: 1, entries: needs }, actions.storage) ? t('balanceGapSaved') : t('localStorageDenied')); actions.rerender(); return true;
    }
    persistTrip(actions, t('tripSaved'));
  } catch (error) { actions.notice(error instanceof Error ? error.message : t('tripInvalid')); actions.rerender(); }
  return true;
}
