import { initialState, parseStored, type WardrobeState } from './state.js';
import { localISODate } from './daily.js';
import { parseSaved, verifyLooks, type OccasionSuggestion, type SavedLook } from './stylist.js';
import { t } from './i18n.js';

type Store = Pick<Storage, 'getItem' | 'setItem'> | undefined;
export const TRIP_KEY = 'wearagain:web2:trip:v1';
export const SURPRISE_KEY = 'wearagain:web2:surprise:v1';
export const NEEDS_KEY = 'wearagain:web2:needs:v1';
export interface TripEvent { readonly id: string; readonly date: string; readonly label: string; readonly outfit: SavedLook | null; readonly companionItemIds: readonly string[] }
export interface TripPlan {
  readonly version: 1; readonly destination: string; readonly from: string; readonly until: string;
  readonly events: readonly TripEvent[]; readonly packed: readonly string[];
  readonly companionName: string; readonly companion: WardrobeState;
}
export interface SurprisePreferences { readonly version: 1; readonly budget: 100 | 200 | 300; readonly skipNext: boolean; readonly need: string }
export interface WardrobeNeed { readonly id: string; readonly label: string }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
export function validDay(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
export const dayOffset = (day: string, offset: number): string => new Date(Date.parse(day) + offset * 86_400_000).toISOString().slice(0, 10);
export function newId(prefix: string): string { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
export function emptyCompanion(): WardrobeState { return { ...initialState(), items: [], style: '' }; }
export function initialTrip(today: Date = new Date()): TripPlan {
  const from = dayOffset(localISODate(today), 1);
  return { version: 1, destination: 'London', from, until: dayOffset(from, 3), companionName: '', companion: emptyCompanion(), packed: [], events: [
    { id: 'dinner', date: from, label: t('tripDemoDinner'), outfit: null, companionItemIds: [] },
    { id: 'museum', date: dayOffset(from, 1), label: t('tripDemoMuseum'), outfit: null, companionItemIds: [] },
    { id: 'theatre', date: dayOffset(from, 2), label: t('tripDemoTheatre'), outfit: null, companionItemIds: [] },
  ] };
}
export function parseTrip(raw: unknown): TripPlan {
  if (!record(raw) || raw.version !== 1 || typeof raw.destination !== 'string' || !raw.destination.trim() || raw.destination.length > 100 ||
    !validDay(raw.from) || !validDay(raw.until) || daysBetween(raw.from, raw.until) < 0 || daysBetween(raw.from, raw.until) > 30 ||
    !Array.isArray(raw.events) || raw.events.length > 100 || !Array.isArray(raw.packed) || raw.packed.length > 400 || raw.packed.some(id => typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) ||
    typeof raw.companionName !== 'string' || raw.companionName.length > 80 || !record(raw.companion) || !Array.isArray(raw.companion.items)) return initialTrip();
  const companionIds = new Set(raw.companion.items.filter(record).map(item => item.id));
  const parsedCompanion = parseStored(raw.companion);
  const companion = { ...parsedCompanion, items: parsedCompanion.items.filter(item => companionIds.has(item.id)) };
  const seen = new Set<string>();
  const events: TripEvent[] = [];
  for (const value of raw.events) {
    if (!record(value) || !validId(value.id) || seen.has(value.id) || !validDay(value.date) || value.date < raw.from || value.date > raw.until ||
      typeof value.label !== 'string' || !value.label.trim() || value.label.length > 160 || !Array.isArray(value.companionItemIds) ||
      value.companionItemIds.length > 6 || new Set(value.companionItemIds).size!==value.companionItemIds.length || value.companionItemIds.some(id => !validId(id)||!companion.items.some(item=>item.id===id))) return initialTrip();
    const outfits = value.outfit === null ? [] : parseSaved({ version: 1, looks: [value.outfit] });
    if (value.outfit !== null && !outfits[0]) return initialTrip();
    seen.add(value.id);
    events.push({ id: value.id, label: value.label, date: value.date, outfit: outfits[0] ?? null, companionItemIds: [...value.companionItemIds] as string[] });
  }
  return { version: 1, destination: raw.destination, from: raw.from, until: raw.until, companionName: raw.companionName, companion, packed: [...new Set(raw.packed)] as string[], events };
}
export function readTrip(store: Store): TripPlan {
  try { const raw = store?.getItem(TRIP_KEY); return raw ? parseTrip(JSON.parse(raw)) : initialTrip(); } catch { return initialTrip(); }
}
export function saveLocal(key: string, value: unknown, store: Store): boolean {
  try { if (!store) return false; store.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function updateTrip(plan: TripPlan, destination: string, from: string, until: string): TripPlan {
  if (!destination.trim() || destination.length > 100 || !validDay(from) || !validDay(until) || daysBetween(from, until) < 0 || daysBetween(from, until) > 30) throw Error(t('tripInvalid'));
  return { ...plan, destination: destination.trim(), from, until, events: plan.events.map(event => {
    const date=dayOffset(from,Math.min(daysBetween(plan.from,event.date),daysBetween(from,until)));
    return {...event,date,outfit:event.outfit?{...event.outfit,date}:null};
  }) };
}
export function addTripEvent(plan: TripPlan, label: string, date: string): TripPlan {
  if (!label.trim() || label.length > 160 || !validDay(date) || date < plan.from || date > plan.until || plan.events.length >= 100) throw Error(t('tripInvalid'));
  return { ...plan, events: [...plan.events, { id: newId('event'), label: label.trim(), date, outfit: null, companionItemIds: [] }].sort((a, b) => a.date.localeCompare(b.date)) };
}
let pending: OccasionSuggestion | null = null;
export function stageTripLook(look: OccasionSuggestion): void { pending = look; }
export function pendingTripLook(): OccasionSuggestion | null { return pending; }
export function assignTripLook(plan: TripPlan, eventId: string, look: OccasionSuggestion, wardrobe: WardrobeState): TripPlan {
  if (!plan.events.some(event => event.id === eventId) || look.itemIds.some(id => !wardrobe.items.some(item => item.id === id))) throw Error(t('tripInvalid'));
  verifyLooks([{...look,id:'trip_selection',explanation:look.title}],wardrobe,'agent');
  const event = plan.events.find(event => event.id === eventId)!;
  const outfit: SavedLook = { id: 'trip_' + eventId, title: look.title, itemIds: [...look.itemIds], date: event.date, occasion: event.label };
  pending = null;
  return { ...plan, events: plan.events.map(row => row.id === eventId ? { ...row, outfit } : row) };
}
export function packingIds(plan: TripPlan): readonly string[] { return [...new Set(plan.events.flatMap(event => event.outfit?.itemIds ?? []))]; }
export function companionPackingIds(plan: TripPlan): readonly string[] { return [...new Set(plan.events.flatMap(event=>event.companionItemIds))]; }
export function readSurprise(store: Store): SurprisePreferences {
  const fallback: SurprisePreferences = { version: 1, budget: 200, skipNext: false, need: '' };
  try {
    const raw = store?.getItem(SURPRISE_KEY), value: unknown = raw ? JSON.parse(raw) : null;
    return record(value) && value.version === 1 && typeof value.budget==='number' && [100, 200, 300].includes(value.budget) && typeof value.skipNext === 'boolean' && typeof value.need === 'string' && value.need.length <= 500 ?
      { version: 1, budget: value.budget as 100 | 200 | 300, skipNext: value.skipNext, need: value.need } : fallback;
  } catch { return fallback; }
}
export function readNeeds(store: Store): WardrobeNeed[] {
  try {
    const raw = store?.getItem(NEEDS_KEY), value: unknown = raw ? JSON.parse(raw) : null;
    if (!record(value) || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 100) return [];
    return value.entries.filter((item): item is WardrobeNeed => record(item) && validId(item.id) && typeof item.label === 'string' && item.label.length > 0 && item.label.length <= 160);
  } catch { return []; }
}
