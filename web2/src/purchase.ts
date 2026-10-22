/**
 * PR-C offline purchase-check adapter. The inputs are the existing synthetic
 * core fixtures, and the only images are immutable saved garment recordings.
 * Viewing, rating or saving a candidate never changes the owned wardrobe.
 */
import minimum from '../../fixtures/core/minimum-basket.json' with { type: 'json' };
import zero from '../../fixtures/core/zero-purchase.json' with { type: 'json' };
import manifest from '../../fixtures/youcam/demo-manifest.json' with { type: 'json' };
import { parseScenario, solveBasket, type Scenario, type SolveResult, type Outfit, type OutfitRating } from '../../src/core/index.js';
import { t, type TranslationKey } from './i18n.js';

export type PurchaseDemo = 'minimum' | 'zero';
/** Marketing deep links choose an approved fixture only; unknown parameters
 * never fabricate a third scenario or mutate the recorded solver evidence. */
export function purchaseDemoFromSearch(search: string): PurchaseDemo {
  return new URLSearchParams(search).get('scenario') === 'zero' ? 'zero' : 'minimum';
}
export type PurchaseDecision = 'skip' | 'save';
export type Rating = 'would_wear' | 'would_not_wear' | 'unrated';
export interface PurchaseSession {
  readonly demo: PurchaseDemo;
  readonly scenario: Scenario;
  readonly candidateId: string;
  readonly topId: string;
  readonly decisions: Readonly<Record<string, PurchaseDecision>>;
  readonly ratingsOrigin: 'example' | 'edited';
}

const exampleInputs = { minimum: minimum.scenario, zero: zero.scenario } as const;
const labels: Record<string, TranslationKey> = {
  work: 'purchaseWorkTop',
  weekend: 'purchaseWeekendTop',
  evening: 'purchaseEveningTop',
  shirt: 'purchaseWorkTop',
  'cheap-a': 'purchaseAster',
  'cheap-b': 'purchaseMila',
  'all-round': 'purchaseNova',
  'old-coat': 'purchaseOldCoat',
  'new-coat': 'purchaseNewCoat',
  rain: 'purchaseRain',
};

export function itemLabel(id: string, fallback: string): string {
  return labels[id] ? t(labels[id]) : fallback;
}
function needLabel(id: string, fallback: string): string {
  const needs: Record<string, TranslationKey> = {
    work: 'purchaseNeedWork', weekend: 'purchaseNeedWeekend',
    evening: 'purchaseNeedEvening', rain: 'purchaseRain',
  };
  return needs[id] ? t(needs[id]) : fallback;
}
export function recordingFor(kind: 'top' | 'outerwear', id: string): { readonly id: string; readonly imagePath: string; readonly recordedAt: string } | null {
  const record = manifest.renders.find(value => value.element.kind === kind && value.element.id === id);
  if (!record || record.syntheticAvatarOnly !== true || record.api !== 'cloth-v4'
      || !/^\/demo\/renders\/[A-Za-z0-9_-]+\.(jpg|png)$/.test(record.imagePath)) return null;
  return { id: record.id, imagePath: record.imagePath, recordedAt: record.recordedAt };
}

export function scenarioForDemo(demo: PurchaseDemo): Scenario {
  const input = exampleInputs[demo];
  if (!input) throw new Error(t('purchaseInvalidSelection'));
  return parseScenario({
    ...input,
    tops: input.tops.map(item => ({ ...item, label: itemLabel(item.id, item.label) })),
    outerwear: input.outerwear.map(item => ({ ...item, label: itemLabel(item.id, item.label) })),
    requirements: input.requirements.map(item => ({ ...item, label: needLabel(item.id, item.label) })),
  });
}
export function initialPurchase(demo: PurchaseDemo = 'minimum'): PurchaseSession {
  const scenario = scenarioForDemo(demo);
  return {
    demo, scenario,
    candidateId: scenario.outerwear.find(item => item.kind === 'candidate')?.id ?? '',
    topId: scenario.tops[0]?.id ?? '',
    decisions: {},
    ratingsOrigin: 'example',
  };
}
export function choosePurchaseDemo(_session: PurchaseSession, demo: PurchaseDemo): PurchaseSession {
  return initialPurchase(demo);
}
export function selectCandidate(session: PurchaseSession, id: string): PurchaseSession {
  if (!session.scenario.outerwear.some(item => item.id === id && item.kind === 'candidate')) throw new Error(t('purchaseInvalidSelection'));
  return { ...session, candidateId: id };
}
export function selectTop(session: PurchaseSession, id: string): PurchaseSession {
  if (!session.scenario.tops.some(item => item.id === id)) throw new Error(t('purchaseInvalidSelection'));
  return { ...session, topId: id };
}
export function selectedPair(session: PurchaseSession): Outfit | null {
  return session.scenario.outfits.find(item => item.topId === session.topId && item.outerwearId === session.candidateId) ?? null;
}
export function selectedRating(session: PurchaseSession): OutfitRating | null {
  const pair = selectedPair(session);
  return pair ? session.scenario.ratings.find(rating => rating.outfitId === pair.id) ?? null : null;
}
export function rateSelected(session: PurchaseSession, status: Rating): PurchaseSession {
  if (!['would_wear', 'would_not_wear', 'unrated'].includes(status)) throw new Error(t('purchaseInvalidSelection'));
  const pair = selectedPair(session);
  if (!pair) throw new Error(t('purchaseInvalidSelection'));
  if (status !== 'unrated' && (!recordingFor('top', pair.topId) ||
      !pair.outerwearId || !recordingFor('outerwear', pair.outerwearId))) {
    throw new Error(t('purchaseMissingEvidence'));
  }
  const scenario = parseScenario({
    ...session.scenario,
    ratings: session.scenario.ratings.map(rating =>
      rating.outfitId === pair.id ? { outfitId: pair.id, status } : rating),
  });
  return { ...session, scenario, ratingsOrigin: 'edited' };
}
export function clearRatings(session: PurchaseSession): PurchaseSession {
  const scenario = parseScenario({
    ...session.scenario,
    ratings: session.scenario.outfits.map(pair => ({ outfitId: pair.id, status: 'unrated' })),
  });
  return { ...session, scenario, decisions: {}, ratingsOrigin: 'edited' };
}
export function replayRatings(session: PurchaseSession): PurchaseSession {
  return { ...session, scenario: scenarioForDemo(session.demo), decisions: {}, ratingsOrigin: 'example' };
}
export function recordDecision(session: PurchaseSession, candidateId: string, choice: PurchaseDecision): PurchaseSession {
  if (!['skip', 'save'].includes(choice) || !session.scenario.outerwear.some(item => item.kind === 'candidate' && item.id === candidateId)) {
    throw new Error(t('purchaseInvalidSelection'));
  }
  return { ...session, decisions: { ...session.decisions, [candidateId]: choice } };
}
export function computeDecision(session: PurchaseSession): SolveResult {
  return solveBasket(session.scenario);
}
/**
 * The solver optimizes the whole example basket. A nonselected candidate is
 * not automatically an "equivalent" of an owned item.
 */
export function candidatePosition(session: PurchaseSession): 'recommended' | 'not_required' | 'none' | 'unresolved' | 'infeasible' {
  const result = computeDecision(session);
  if (result.status !== 'solved') return result.status === 'incomplete' ? 'unresolved' : 'infeasible';
  if (!result.basket.candidateIds.length) return 'none';
  return result.basket.candidateIds.includes(session.candidateId) ? 'recommended' : 'not_required';
}
