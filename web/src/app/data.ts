import minimum from '../../../fixtures/core/minimum-basket.json' with { type: 'json' };
import zero from '../../../fixtures/core/zero-purchase.json' with { type: 'json' };
import error from '../../../fixtures/core/render-error-incomplete.json' with { type: 'json' };
import {
  parseScenario, selectNextPair, elementKey, projectPairRatings,
  type ElementRef, type ItemRender, type OutfitRating, type PairRating,
  type RenderEvidence, type RenderState, type Scenario,
} from '../../../src/core/index.js';

export type DemoScenarioId = 'minimum' | 'zero' | 'error';
export const SCENARIOS: readonly { id: DemoScenarioId; label: string; description: string }[] = [
  { id: 'minimum', label: 'One thoughtful purchase', description: 'Three tops, three candidates, one smallest basket.' },
  { id: 'zero', label: 'Your wardrobe already works', description: 'Accepted owned outfits can mean buying nothing.' },
  { id: 'error', label: 'An image needs another look', description: 'See why an error leaves the decision unresolved.' },
];

const fixtures = { minimum, zero, error };
const labels: Record<string, string> = {
  work: 'Cream shirt', weekend: 'Navy knit', evening: 'Striped tee', shirt: 'Cream shirt',
  'cheap-a': 'Aster trench', 'cheap-b': 'Mila coat', 'all-round': 'Nova jacket',
  'old-coat': 'Your existing coat', 'new-coat': 'New coat', coat: 'Candidate coat',
};
const needLabels: Record<string, string> = { work: 'For work', weekend: 'For the weekend', evening: 'For an evening out', rain: 'For rain' };

/** Only labels change; catalogue prices, memberships and decisions are the tested fixtures. */
export function demoScenario(id: DemoScenarioId): Scenario {
  const original = parseScenario(fixtures[id].scenario);
  return parseScenario({
    ...original,
    tops: original.tops.map(item => ({ ...item, label: labels[item.id] ?? item.label })),
    outerwear: original.outerwear.map(item => ({ ...item, label: labels[item.id] ?? item.label })),
    requirements: original.requirements.map(need => ({ ...need, label: needLabels[need.id] ?? need.label, source: { kind: 'user_chips' } })),
  });
}

export function withRating(scenario: Scenario, outfitId: string, status: OutfitRating['status'], reason = 'Illustrative example: preview details need another look.'): Scenario {
  if (!scenario.outfits.some(outfit => outfit.id === outfitId)) throw new Error('Unknown outfit.');
  const rating: OutfitRating = status === 'render_error' ? { outfitId, status, reason } : { outfitId, status };
  return parseScenario({ ...scenario, ratings: [...scenario.ratings.filter(item => item.outfitId !== outfitId), rating] });
}

export function activeScenario(scenario: Scenario, needIds: ReadonlySet<string>, candidateIds: ReadonlySet<string>): Scenario {
  const outerwear = scenario.outerwear.filter(item => item.kind === 'owned' || candidateIds.has(item.id));
  const included = new Set(outerwear.map(item => item.id));
  const outfits = scenario.outfits.filter(item => item.outerwearId === null || included.has(item.outerwearId));
  const outfitIds = new Set(outfits.map(item => item.id));
  return parseScenario({
    ...scenario, outerwear, outfits,
    requirements: scenario.requirements.filter(need => needIds.has(need.id)).map(need => ({ ...need, outfitIds: need.outfitIds.filter(id => outfitIds.has(id)) })),
    ratings: scenario.ratings.filter(rating => outfitIds.has(rating.outfitId)),
  });
}

export function elementsForScenario(scenario: Scenario): ElementRef[] {
  return [...scenario.tops.map(item => ({ kind: 'top' as const, id: item.id })), ...scenario.outerwear.map(item => ({ kind: 'outerwear' as const, id: item.id }))];
}

export function elementsForOutfit(scenario: Scenario, outfitId: string): ElementRef[] {
  const outfit = scenario.outfits.find(item => item.id === outfitId);
  if (!outfit) return [];
  return [{ kind: 'top', id: outfit.topId }, ...(outfit.outerwearId ? [{ kind: 'outerwear' as const, id: outfit.outerwearId }] : [])];
}

export function outfitLabel(scenario: Scenario, outfitId: string): string {
  const outfit = scenario.outfits.find(item => item.id === outfitId);
  if (!outfit) return outfitId;
  const top = scenario.tops.find(item => item.id === outfit.topId)?.label ?? outfit.topId;
  const outer = scenario.outerwear.find(item => item.id === outfit.outerwearId)?.label;
  return outer ? `${top} + ${outer}` : `${top}, worn on its own`;
}

export function basketLabel(scenario: Scenario, ids: readonly string[]): string {
  return ids.length ? ids.map(id => scenario.outerwear.find(item => item.id === id)?.label ?? id).join(' + ') : 'Buy nothing';
}

/**
 * A disclosed logical replay, not an image-ready live state. The fixture has no
 * provider assets. These symbolic identities let the existing selection policy
 * compare synthetic decisions; they are never displayed or sent to an API.
 */
export function simulationSelection(scenario: Scenario) {
  const renders: ItemRender[] = elementsForScenario(scenario).map(element => ({
    element, garmentRevision: `synthetic:${elementKey(element)}`, baseRevision: 'synthetic-example',
    pipelineRevision: 'logic-only-example', attempt: 0, status: 'ready', assetId: `symbolic:${elementKey(element)}`,
  }));
  const pairRatings: PairRating[] = scenario.ratings.filter(rating => rating.status !== 'unrated').map(rating => {
    const evidence = elementsForOutfit(scenario, rating.outfitId).map(element => renders.find(render => elementKey(render.element) === elementKey(element))! as RenderEvidence);
    return rating.status === 'render_error'
      ? { outfitId: rating.outfitId, status: rating.status, evidence: evidence.map(cleanEvidence), reason: rating.reason }
      : { outfitId: rating.outfitId, status: rating.status as 'would_wear' | 'would_not_wear', evidence: evidence.map(cleanEvidence) };
  });
  return selectNextPair(scenario, { schemaVersion: 1, renders, pairRatings }, 2);
}

export function cleanEvidence(render: RenderEvidence): RenderEvidence {
  return {
    element: { ...render.element }, garmentRevision: render.garmentRevision,
    baseRevision: render.baseRevision, pipelineRevision: render.pipelineRevision,
    attempt: render.attempt, assetId: render.assetId,
  };
}

export function rateCurrentImages(scenario: Scenario, state: RenderState, outfitId: string, status: 'would_wear' | 'would_not_wear' | 'render_error', reason: string): RenderState {
  const required = elementsForOutfit(scenario, outfitId);
  const images = required.map(element => state.renders.find(render => elementKey(render.element) === elementKey(element)));
  if (!required.length || images.some(render => render?.status !== 'ready')) throw new Error('Both previews must load before you can rate this pair.');
  const ready = images as Extract<ItemRender, { status: 'ready' }>[];
  if (ready.some(render => render.baseRevision !== ready[0]!.baseRevision || render.pipelineRevision !== ready[0]!.pipelineRevision)) throw new Error('The previews must use the same model and pipeline.');
  const evidence = ready.map(cleanEvidence);
  const rating: PairRating = status === 'render_error' ? { outfitId, status, evidence, reason } : { outfitId, status, evidence };
  return { ...state, pairRatings: [...state.pairRatings.filter(item => item.outfitId !== outfitId), rating] };
}

export function projectedForSelection(scenario: Scenario, state: RenderState) {
  const known = new Set(elementsForScenario(scenario).map(elementKey));
  const outfits = new Set(scenario.outfits.map(outfit => outfit.id));
  const selected: RenderState = { ...state, renders: state.renders.filter(render => known.has(elementKey(render.element))), pairRatings: state.pairRatings.filter(rating => outfits.has(rating.outfitId)) };
  return { scenario: projectPairRatings(scenario, selected), state: selected, selection: selectNextPair(scenario, selected, 2) };
}

export interface Recording {
  readonly id: string;
  readonly element: ElementRef;
  readonly avatarId: string;
  readonly imagePath: string;
  readonly recordedAt: string;
}

/** Static, same-origin manifest only. A provider/live URL can never enter demo mode. */
export function parseRecordings(input: unknown): Recording[] {
  if (!input || typeof input !== 'object' || !('schemaVersion' in input) || input.schemaVersion !== 1 || !('renders' in input) || !Array.isArray(input.renders)) throw new Error('Invalid demo recording manifest.');
  const seen = new Set<string>();
  return input.renders.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid demo recording.');
    const entry = value as Record<string, unknown>;
    const element = entry.element as Record<string, unknown> | undefined;
    if (typeof entry.id !== 'string' || !/^[A-Za-z0-9._:-]+$/.test(entry.id) || seen.has(entry.id)
      || !element || !['top', 'outerwear'].includes(String(element.kind)) || typeof element.id !== 'string' || !/^[A-Za-z0-9._:-]+$/.test(element.id)
      || typeof entry.avatarId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(entry.avatarId)
      || typeof entry.imagePath !== 'string' || !/^\/demo\/renders\/[A-Za-z0-9_-]+\.(png|jpg)$/.test(entry.imagePath)
      || typeof entry.recordedAt !== 'string' || !Number.isFinite(Date.parse(entry.recordedAt)) || entry.syntheticAvatarOnly !== true || entry.api !== 'cloth-v4') throw new Error('Invalid demo recording.');
    seen.add(entry.id);
    return { id: entry.id, element: { kind: element.kind as ElementRef['kind'], id: element.id }, avatarId: entry.avatarId, imagePath: entry.imagePath, recordedAt: entry.recordedAt };
  });
}

export function illustrationForElement(element: ElementRef): string | null {
  const names: Record<string, string> = { work: 'cream-shirt', shirt: 'cream-shirt', weekend: 'navy-knit', evening: 'striped-tee', 'cheap-a': 'aster-trench', 'cheap-b': 'mila-coat', 'all-round': 'nova-jacket', 'old-coat': 'mila-coat', 'new-coat': 'nova-jacket', coat: 'mila-coat' };
  const name = names[element.id];
  return name ?? null;
}
