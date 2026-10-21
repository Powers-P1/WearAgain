import { t, type TranslationKey } from './i18n.js';

export const AVAILABILITY = {
  ready: 'ready',
  in_wash: 'inWash',
  needs_ironing: 'needsIroning',
  needs_repair: 'needsRepair',
} as const satisfies Record<string, TranslationKey>;

export type Availability = keyof typeof AVAILABILITY;
export const CATEGORIES = ['tops', 'bottoms', 'dresses', 'shoes', 'accessories'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_KEYS: Record<Category, TranslationKey> = {
  tops: 'categoryTops', bottoms: 'categoryBottoms', dresses: 'categoryDresses',
  shoes: 'categoryShoes', accessories: 'categoryAccessories',
};

export interface WardrobeItem {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly category: Category;
  readonly availability: Availability;
  readonly photo: string | null;
  readonly order: number;
}
export interface WardrobeState {
  readonly version: 1;
  readonly items: readonly WardrobeItem[];
  readonly style: string;
}
type Example = readonly [string, TranslationKey, TranslationKey, Category, Availability, number];
const EXAMPLE_ROWS: readonly Example[] = [
  ['cashmere', 'cashmere', 'cashmereDetail', 'tops', 'ready', 8],
  ['blazer', 'blazer', 'blazerDetail', 'tops', 'ready', 7],
  ['silk', 'silk', 'silkDetail', 'tops', 'ready', 6],
  ['coat', 'coat', 'coatDetail', 'tops', 'in_wash', 5],
  ['trousers', 'trousers', 'trousersDetail', 'bottoms', 'ready', 4],
  ['dress', 'dress', 'dressDetail', 'dresses', 'needs_ironing', 3],
  ['loafers', 'loafers', 'loafersDetail', 'shoes', 'ready', 2],
  ['bag', 'bag', 'bagDetail', 'accessories', 'needs_repair', 1],
  // Exact tops from the approved saved YouCam manifest. Unlike the eight
  // board-05 photographs, these have no garment-only product photo.
  ['recorded-work', 'recordedWork', 'recordedWorkDetail', 'tops', 'ready', 0],
  ['recorded-weekend', 'recordedWeekend', 'recordedWeekendDetail', 'tops', 'ready', -1],
];
const EXAMPLES: readonly WardrobeItem[] = EXAMPLE_ROWS.map(([id, name, detail, category, availability, order]) => ({
  id, name: t(name), detail: t(detail), category, availability, photo: id.startsWith('recorded-') ? null : id, order,
}));
export const DEMO_STYLE = t('defaultStyle');
/** Keep v1 storage key and migrate keys in-place so earlier test users keep their edits. */
export const STORAGE_KEY = 'wearagain:web2:demo-wardrobe:v1';
const OLD_CATEGORIES: Record<string, Category> = {
  'Góry': 'tops', 'Doły': 'bottoms', 'Sukienki': 'dresses',
  'Buty': 'shoes', 'Dodatki': 'accessories',
};
const OLD_AVAILABILITY: Record<string, Availability> = {
  gotowe: 'ready', w_praniu: 'in_wash', do_prasowania: 'needs_ironing', do_naprawy: 'needs_repair',
};
const OLD_DEMO_STYLE = 'Lubię klasykę, beż i granat. Nie noszę wzorów. Chciałabym wyglądać bardziej elegancko, bez przesady.';

export function initialState(): WardrobeState {
  return { version: 1, items: EXAMPLES.map(item => ({ ...item })), style: DEMO_STYLE };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isAvailability(value: unknown): value is Availability {
  return typeof value === 'string' && Object.hasOwn(AVAILABILITY, value);
}
function isCategory(value: unknown): value is Category {
  return CATEGORIES.includes(value as Category);
}
export function categoryLabel(category: Category): string {
  return t(CATEGORY_KEYS[category]);
}
export function availabilityLabel(availability: Availability): string {
  return t(AVAILABILITY[availability]);
}
export function parseStored(value: unknown): WardrobeState {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.items) || value.items.length > 200 ||
    typeof value.style !== 'string' || value.style.length > 5000) return initialState();
  const ids = new Set<string>();
  const items: WardrobeItem[] = [];
  for (const raw of value.items as unknown[]) {
    if (!isRecord(raw)) return initialState();
    const category = typeof raw.category === 'string'
      ? (OLD_CATEGORIES[raw.category] ?? raw.category) : raw.category;
    const availability = typeof raw.availability === 'string'
      ? (OLD_AVAILABILITY[raw.availability] ?? raw.availability) : raw.availability;
    if (typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(raw.id) || ids.has(raw.id)
      || typeof raw.name !== 'string' || raw.name.length > 80 || !raw.name.trim()
      || typeof raw.detail !== 'string' || raw.detail.length > 100
      || !isCategory(category) || !isAvailability(availability)
      || !(raw.photo === null || (typeof raw.photo === 'string' && EXAMPLES.some(item => item.photo === raw.photo)))
      || typeof raw.order !== 'number' || !Number.isFinite(raw.order)) return initialState();
    ids.add(raw.id);
    const example = EXAMPLES.find(item => item.id === raw.id && item.photo === raw.photo);
    items.push({
      id: raw.id, name: example?.name ?? raw.name, detail: example?.detail ?? raw.detail,
      category, availability, photo: raw.photo, order: raw.order,
    });
  }
  return { version: 1, items, style: value.style === OLD_DEMO_STYLE ? DEMO_STYLE : value.style };
}
export function loadState(storage?: Pick<Storage, 'getItem'>): WardrobeState {
  try {
    if (!storage) return initialState();
    const value = storage.getItem(STORAGE_KEY);
    return value === null ? initialState() : parseStored(JSON.parse(value));
  } catch { return initialState(); }
}
export function saveState(state: WardrobeState, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch { return false; }
}
export function itemsForView(state: WardrobeState, category: Category | 'all', query: string): WardrobeItem[] {
  const normalized = query.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en').trim();
  return state.items.filter(item => {
    if (category !== 'all' && item.category !== category) return false;
    const search = (item.name + ' ' + item.detail).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en');
    return search.includes(normalized);
  }).sort((a,b) => b.order - a.order);
}
export function availableNow(item: WardrobeItem): boolean { return item.availability === 'ready'; }
export function setAvailability(state: WardrobeState, itemId: string, availability: Availability): WardrobeState {
  if (!isAvailability(availability) || !state.items.some(item => item.id === itemId))
    throw new Error(t('invalidItemStatus'));
  return { ...state, items: state.items.map(item => item.id === itemId ? { ...item, availability } : item) };
}
export function addItem(state: WardrobeState, data: { id: string; name: string; detail: string; category: Category; availability: Availability }): WardrobeState {
  const name = data.name.trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(data.id) || state.items.some(item => item.id === data.id)
    || !name || name.length > 80 || data.detail.length > 100 || !isCategory(data.category)
    || !isAvailability(data.availability) || state.items.length >= 200) throw new Error(t('invalidItem'));
  const order = Math.max(0,...state.items.map(item => item.order)) + 1;
  return { ...state, items: [...state.items, {
    id: data.id, name, detail: data.detail.trim(), category: data.category,
    availability: data.availability, photo: null, order,
  }] };
}
export function setStyle(state: WardrobeState, value: string): WardrobeState {
  if (value.length > 5000) throw new Error(t('styleTooLong'));
  return { ...state, style: value.trim() };
}
