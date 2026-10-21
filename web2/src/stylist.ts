import { availableNow, type WardrobeItem, type WardrobeState } from './state.js';
import { t } from './i18n.js';

export interface StylistBrief {
  readonly occasion: string;
  readonly date: string;
  readonly style: string;
}
export interface OccasionSuggestion {
  readonly id: string;
  readonly title: string;
  readonly explanation: string;
  readonly itemIds: readonly string[];
  /** Only verified board illustrations have an image. The Worker may not invent one. */
  readonly illustration: 'classic' | 'soft' | 'relaxed' | null;
}
export interface StylistResult {
  readonly source: 'demo' | 'agent';
  readonly looks: readonly OccasionSuggestion[];
}
/**
 * Injection point for the future bounded Worker agent endpoint.
 * It is deliberately not wired to an invented route: the currently deployed
 * Worker exposes render/session APIs but no /api/stylist operation.
 */
export type WorkerAgentHook = (input: {
  readonly occasion: string;
  readonly date: string;
  readonly style: string;
  readonly readyWardrobe: ReadonlyArray<Pick<WardrobeItem, 'id' | 'name' | 'category'>>;
}) => Promise<unknown>;

const demoRecipes: readonly OccasionSuggestion[] = [
  {
    id: 'classic', title: t('stylistLookClassic'),
    explanation: t('stylistClassicReason'),
    itemIds: ['blazer','silk','trousers','loafers'], illustration: 'classic',
  },
  {
    id: 'soft', title: t('stylistLookSoft'),
    explanation: t('stylistSoftReason'),
    itemIds: ['cashmere','trousers','loafers'], illustration: 'soft',
  },
  {
    id: 'relaxed', title: t('stylistLookRelaxed'),
    explanation: t('stylistRelaxedReason'),
    itemIds: ['silk','trousers','loafers'], illustration: 'relaxed',
  },
];

export function validateBrief(value: StylistBrief): StylistBrief {
  const occasion = value.occasion.trim();
  const style = value.style.trim();
  if (occasion.length < 3 || occasion.length > 500) throw new Error(t('stylistInvalidOccasion'));
  if (style.length > 5000) throw new Error(t('styleTooLong'));
  if (value.date && ((!/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !Number.isFinite(Date.parse(value.date)) ||
    new Date(value.date).toISOString().slice(0,10) !== value.date))) throw new Error(t('stylistInvalidDate'));
  return { occasion, date: value.date, style };
}
function hasCompleteOutfit(items: readonly WardrobeItem[]): boolean {
  return items.some(item => item.category === 'tops') &&
    items.some(item => item.category === 'bottoms' || item.category === 'dresses') &&
    items.some(item => item.category === 'shoes');
}
/** Validator applies equally to fixture and agent proposals: AI cannot create garments or change their status. */
export function verifyLooks(raw: unknown, wardrobe: WardrobeState, source: 'demo' | 'agent'): StylistResult {
  if (!Array.isArray(raw) || raw.length > 3) throw new Error(t('stylistInvalidProposal'));
  const seen = new Set<string>();
  const suggestions: OccasionSuggestion[] = [];
  for (const entry of raw as unknown[]) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(t('stylistInvalidProposal'));
    const look = entry as Record<string, unknown>;
    if (typeof look.id !== 'string' || !/^[A-Za-z0-9_-]{1,50}$/.test(look.id) || seen.has(look.id) ||
      typeof look.title !== 'string' || look.title.length > 100 || !look.title.trim() ||
      typeof look.explanation !== 'string' || look.explanation.length > 320 || !look.explanation.trim() ||
      !Array.isArray(look.itemIds) || look.itemIds.length < 3 || look.itemIds.length > 6 ||
      look.itemIds.some(id => typeof id !== 'string') || new Set(look.itemIds).size !== look.itemIds.length)
      throw new Error(t('stylistInvalidProposal'));
    const owned = look.itemIds.map(id => wardrobe.items.find(item => item.id === id));
    if (owned.some(item => !item || !availableNow(item))) throw new Error(t('stylistInvalidProposal'));
    if (!hasCompleteOutfit(owned as WardrobeItem[])) throw new Error(t('stylistInvalidProposal'));
    const illustration = source === 'demo' &&
      ['classic','soft','relaxed'].includes(String(look.illustration)) &&
      demoRecipes.some(recipe => recipe.id === look.id &&
        JSON.stringify(recipe.itemIds) === JSON.stringify(look.itemIds))
        ? (look.illustration as OccasionSuggestion['illustration']) : null;
    suggestions.push({
      id: look.id, title: look.title, explanation: look.explanation,
      itemIds: [...look.itemIds] as string[], illustration,
    });
    seen.add(look.id);
  }
  return { source, looks: suggestions };
}
export function demoLooks(wardrobe: WardrobeState): StylistResult {
  const candidates = demoRecipes.filter(recipe => recipe.itemIds.every(id =>
    wardrobe.items.some(item => item.id === id && availableNow(item))));
  return verifyLooks(candidates, wardrobe, 'demo');
}
export async function proposeLooks(
  brief: StylistBrief,
  wardrobe: WardrobeState,
  agentHook?: WorkerAgentHook,
): Promise<StylistResult> {
  const clean = validateBrief(brief);
  if (!agentHook) return demoLooks(wardrobe);
  const readyWardrobe = wardrobe.items.filter(availableNow)
    .map(({ id, name, category }) => ({ id, name, category }));
  const returned = await agentHook({ ...clean, readyWardrobe });
  // Reject unknown/unready IDs and any unlabelled generated preview.
  return verifyLooks(returned, wardrobe, 'agent');
}

export interface SavedLook {
  readonly id: string;
  readonly title: string;
  readonly occasion: string;
  readonly date: string;
  readonly itemIds: readonly string[];
}
export const SAVED_KEY = 'wearagain:web2:looks:v1';
export function parseSaved(value: unknown): SavedLook[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.looks) || record.looks.length > 50) return [];
  const result: SavedLook[] = [];
  for (const raw of record.looks) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const look = raw as Record<string, unknown>;
    if (typeof look.id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(look.id) ||
      typeof look.title !== 'string' || look.title.length > 100 ||
      typeof look.occasion !== 'string' || look.occasion.length > 500 ||
      typeof look.date !== 'string' || look.date.length > 10 ||
      !Array.isArray(look.itemIds) || look.itemIds.length > 6 ||
      look.itemIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id))) return [];
    result.push({
      id: look.id, title: look.title, occasion: look.occasion, date: look.date,
      itemIds: [...look.itemIds],
    });
  }
  return result;
}
export function loadSaved(storage?: Pick<Storage, 'getItem'>): SavedLook[] {
  try {
    const value = storage?.getItem(SAVED_KEY);
    return value ? parseSaved(JSON.parse(value)) : [];
  } catch { return []; }
}
export function persistSaved(entries: readonly SavedLook[], storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SAVED_KEY, JSON.stringify({version:1,looks:entries}));
    return true;
  } catch { return false; }
}
export function saveChosen(entries: readonly SavedLook[], look: OccasionSuggestion, brief: StylistBrief, wardrobe: WardrobeState): SavedLook[] {
  const verified = verifyLooks([look], wardrobe, 'agent').looks[0]!;
  // This is an outfit choice, never a purchase or an automatically logged wear.
  const id = 'saved_' + Date.now().toString(36) + '_' + look.id;
  return [{
    id, title: verified.title, occasion: brief.occasion,
    date: brief.date, itemIds: [...verified.itemIds],
  }, ...entries].slice(0,50);
}
