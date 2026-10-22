import { availableNow, type WardrobeState } from './state.js';
import { demoLooks, verifyLooks, type OccasionSuggestion } from './stylist.js';
import { t } from './i18n.js';

export interface WornOutfit {
  readonly date: string; // user's local calendar date
  readonly itemIds: readonly string[];
  readonly lookId: string;
  readonly lookTitle: string;
}
export interface DailyState {
  readonly version: 1;
  readonly wears: readonly WornOutfit[];
}
export const DAILY_KEY = 'wearagain:web2:daily:v1';
export type GarmentDecision = 'keep' | 'repair' | 'donate' | 'sell';
export interface ItemDecision {
  readonly itemId: string;
  readonly decision: GarmentDecision;
  readonly recordedOn: string;
}
export interface DecisionsState {
  readonly version: 1;
  readonly entries: readonly ItemDecision[];
}
export const DECISIONS_KEY = 'wearagain:web2:decisions:v1';
export const emptyDaily = (): DailyState => ({ version: 1, wears: [] });
export const emptyDecisions = (): DecisionsState => ({ version: 1, entries: [] });
const safeId = (x: unknown): x is string => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(x);
function validDate(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const time = Date.parse(x);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === x;
}
export function localISODate(date: Date): string {
  const year = date.getFullYear(), month = String(date.getMonth()+1).padStart(2,'0');
  return year + '-' + month + '-' + String(date.getDate()).padStart(2,'0');
}
export function parseDaily(raw: unknown): DailyState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDaily();
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || !Array.isArray(value.wears) || value.wears.length > 366) return emptyDaily();
  const dates = new Set<string>();
  const wears: WornOutfit[] = [];
  for (const entry of value.wears) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return emptyDaily();
    const row = entry as Record<string, unknown>;
    if (!validDate(row.date) || dates.has(row.date) || !safeId(row.lookId) ||
      typeof row.lookTitle !== 'string' || row.lookTitle.length > 100 ||
      !Array.isArray(row.itemIds) || row.itemIds.length < 1 || row.itemIds.length > 8 ||
      row.itemIds.some(x => !safeId(x)) || new Set(row.itemIds).size !== row.itemIds.length)
      return emptyDaily();
    dates.add(row.date);
    wears.push({date:row.date, lookId:row.lookId, lookTitle:row.lookTitle, itemIds:[...row.itemIds]});
  }
  return {version:1, wears:wears.sort((a,b)=>b.date.localeCompare(a.date))};
}
export function parseDecisions(raw: unknown): DecisionsState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDecisions();
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 200) return emptyDecisions();
  const seen = new Set<string>(); const entries: ItemDecision[] = [];
  for (const entry of value.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return emptyDecisions();
    const row = entry as Record<string, unknown>;
    if (!safeId(row.itemId) || seen.has(row.itemId) || !['keep','repair','donate','sell'].includes(String(row.decision))
      || !validDate(row.recordedOn)) return emptyDecisions();
    seen.add(row.itemId);
    entries.push({itemId:row.itemId, decision:row.decision as GarmentDecision,recordedOn:row.recordedOn});
  }
  return {version:1,entries};
}
export function loadDaily(store?: Pick<Storage,'getItem'>): DailyState {
  try { const raw=store?.getItem(DAILY_KEY); return raw ? parseDaily(JSON.parse(raw)) : emptyDaily(); }
  catch { return emptyDaily(); }
}
export function loadDecisions(store?: Pick<Storage,'getItem'>): DecisionsState {
  try { const raw=store?.getItem(DECISIONS_KEY); return raw ? parseDecisions(JSON.parse(raw)) : emptyDecisions(); }
  catch { return emptyDecisions(); }
}
export function storeDaily(state: DailyState, store?: Pick<Storage,'setItem'>): boolean {
  try { if (!store) return false; store.setItem(DAILY_KEY,JSON.stringify(state)); return true; } catch {return false;}
}
export function storeDecisions(state: DecisionsState, store?: Pick<Storage,'setItem'>): boolean {
  try { if (!store) return false; store.setItem(DECISIONS_KEY,JSON.stringify(state)); return true; } catch {return false;}
}
/** Only checked complete ready looks may be recorded as worn; repeated selection replaces today's log. */
export function wearToday(state: DailyState, wardrobe: WardrobeState, look: OccasionSuggestion, date: string): DailyState {
  if (!validDate(date)) throw Error(t('dailyInvalidDate'));
  const clean = verifyLooks([look],wardrobe,'agent').looks[0];
  if (!clean) throw Error(t('dailyInvalidLook'));
  const next: WornOutfit={date,itemIds:[...clean.itemIds],lookId:clean.id,lookTitle:clean.title};
  return {version:1,wears:[next,...state.wears.filter(wear=>wear.date!==date)].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,366)};
}
export function chooseDecision(state: DecisionsState, wardrobe: WardrobeState, itemId: string, decision: GarmentDecision, date: string): DecisionsState {
  if (!validDate(date) || !safeId(itemId) || !wardrobe.items.some(item=>item.id===itemId) ||
    !['keep','repair','donate','sell'].includes(decision)) throw Error(t('dailyInvalidDecision'));
  return {version:1,entries:[...state.entries.filter(entry=>entry.itemId!==itemId),{itemId,decision,recordedOn:date}]};
}
export interface AttentionItem {
  readonly id: string;
  readonly kind: 'repair' | 'ironing' | 'no_log';
}
export interface WardrobeOverview {
  readonly items: number;
  readonly ready: number;
  readonly loggedThisMonth: number;
  readonly attention: readonly AttentionItem[];
  readonly awaitingUser: number;
  readonly loggedWearEntries: number;
  readonly categoryOverlap: readonly string[];
  readonly unknownGaps: true;
}
export function overviewFor(wardrobe: WardrobeState, daily: DailyState, decisions: DecisionsState, today: string): WardrobeOverview {
  if (!validDate(today)) throw Error(t('dailyInvalidDate'));
  const known = new Set(wardrobe.items.map(item=>item.id));
  const thisMonth=daily.wears.filter(entry=>entry.date.startsWith(today.slice(0,7))).flatMap(entry=>entry.itemIds);
  const logged = new Set(thisMonth.filter(id=>known.has(id)));
  const recentIds=new Set(daily.wears.flatMap(entry=>entry.itemIds));
  const attention:AttentionItem[]=wardrobe.items.filter(item=>item.availability==='needs_repair'||item.availability==='needs_ironing')
    .map(item=>({id:item.id,kind:item.availability==='needs_repair'?'repair' as const:'ironing' as const}));
  // Only lack of a *recorded wear* is known. This is never evidence of lack of real use.
  if (daily.wears.length) for(const item of wardrobe.items) {
    if (!recentIds.has(item.id) && attention.length<6) attention.push({id:item.id,kind:'no_log'});
  }
  const decided=new Map(decisions.entries.map(entry=>[entry.itemId,entry.decision]));
  const groups=new Map<string,number>();
  for(const item of wardrobe.items) groups.set(item.category,(groups.get(item.category)??0)+1);
  return {
    items:wardrobe.items.length, ready:wardrobe.items.filter(availableNow).length,
    loggedThisMonth:logged.size,attention:attention.slice(0,6),
    awaitingUser:attention.filter(row=>row.kind!=='no_log'&&!decided.has(row.id)).length,
    loggedWearEntries:daily.wears.length,
    categoryOverlap:[...groups].filter(([,count])=>count>1).map(([category])=>category),
    unknownGaps:true,
  };
}
export function morningHeadingKey(count:number): 'morningReadyNone' | 'morningReadyOne' | 'morningReadyMany' {
  return count===0?'morningReadyNone':count===1?'morningReadyOne':'morningReadyMany';
}
export function morningLooks(wardrobe: WardrobeState): readonly OccasionSuggestion[] {
  // Share PR-B's manifest-verified demo recipes. Ineligible garment conditions
  // exclude whole looks; never pad to three with invented combinations.
  return demoLooks(wardrobe).looks;
}
