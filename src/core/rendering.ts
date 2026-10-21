import type { Outfit, OutfitRating, Scenario } from "./types.js";
import { parseScenario } from "./validation.js";

/** IDs are scoped: a top and an outerwear item may legitimately have the same ID. */
export interface ElementRef {
  readonly kind: "top" | "outerwear";
  readonly id: string;
}

/** Revisions identify garment bytes, the person/base image, and pipeline settings. */
export interface RenderIdentity {
  readonly element: ElementRef;
  readonly garmentRevision: string;
  readonly baseRevision: string;
  readonly pipelineRevision: string;
  /** Increment for each new generation, including a successful retry. */
  readonly attempt: number;
}

export type ItemRender = RenderIdentity & (
  | { readonly status: "missing" | "pending" }
  | { readonly status: "ready"; readonly assetId: string }
  | { readonly status: "error"; readonly reason: string }
);

/** Opaque asset ID only; image bytes, provider URLs and secrets stay outside the core. */
export interface RenderEvidence extends RenderIdentity {
  readonly assetId: string;
}

export type PairRating = {
  readonly outfitId: string;
  readonly evidence: readonly RenderEvidence[];
} & (
  | { readonly status: "would_wear" | "would_not_wear" }
  | { readonly status: "render_error"; readonly reason: string }
);

export interface RenderState {
  readonly schemaVersion: 1;
  /** At most one current render per element. Missing definitions are unresolved. */
  readonly renders: readonly ItemRender[];
  /** User decisions only. The agent tool allowlist has no operation that writes these. */
  readonly pairRatings: readonly PairRating[];
}

export class RenderValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "RenderValidationError";
  }
}

function fail(path: string, message: string): never {
  throw new RenderValidationError(path, message);
}

function object(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "expected an object");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "expected a plain JSON object");
  const result = value as Record<string, unknown>;
  for (const field of fields) if (!Object.hasOwn(result, field)) fail(`${path}.${field}`, "required field");
  for (const field of Object.keys(result)) if (!fields.includes(field)) fail(`${path}.${field}`, "unknown field");
  return result;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value || value.length > 512) {
    fail(path, "expected a nonempty trimmed string of at most 512 characters");
  }
  return value;
}

function list(value: unknown, path: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail(path, `expected an array of at most ${maximum} entries`);
  return value;
}

function parseElement(value: unknown, path: string): ElementRef {
  const entry = object(value, path, ["kind", "id"]);
  if (entry.kind !== "top" && entry.kind !== "outerwear") fail(`${path}.kind`, "expected top or outerwear");
  return { kind: entry.kind, id: text(entry.id, `${path}.id`) };
}

export function elementKey(element: ElementRef): string {
  const value = parseElement(element, "element");
  return JSON.stringify([value.kind, value.id]);
}

function knownElement(element: ElementRef, scenario: Scenario): boolean {
  return (element.kind === "top" ? scenario.tops : scenario.outerwear).some((item) => item.id === element.id);
}

const identityFields = ["element", "garmentRevision", "baseRevision", "pipelineRevision", "attempt"] as const;

function identity(value: Record<string, unknown>, path: string): RenderIdentity {
  const attempt = value.attempt;
  if (typeof attempt !== "number" || !Number.isSafeInteger(attempt) || attempt < 0) fail(`${path}.attempt`, "expected a nonnegative safe integer");
  return {
    element: parseElement(value.element, `${path}.element`),
    garmentRevision: text(value.garmentRevision, `${path}.garmentRevision`),
    baseRevision: text(value.baseRevision, `${path}.baseRevision`),
    pipelineRevision: text(value.pipelineRevision, `${path}.pipelineRevision`),
    attempt,
  };
}

function sameIdentity(left: RenderIdentity, right: RenderIdentity): boolean {
  return elementKey(left.element) === elementKey(right.element)
    && left.garmentRevision === right.garmentRevision
    && left.baseRevision === right.baseRevision
    && left.pipelineRevision === right.pipelineRevision
    && left.attempt === right.attempt;
}

function elements(outfit: Outfit): ElementRef[] {
  return [
    { kind: "top", id: outfit.topId },
    ...(outfit.outerwearId === null ? [] : [{ kind: "outerwear" as const, id: outfit.outerwearId }]),
  ];
}

/** Validate the current snapshot and historical image evidence without accepting stale decisions. */
export function parseRenderState(input: unknown, inputScenario: Scenario): RenderState {
  const scenario = parseScenario(inputScenario);
  const root = object(input, "renderState", ["schemaVersion", "renders", "pairRatings"]);
  if (root.schemaVersion !== 1) fail("renderState.schemaVersion", "only version 1 is supported");
  const seenElements = new Set<string>();
  const renders: ItemRender[] = list(root.renders, "renderState.renders", 512).map((entry, index) => {
    const path = `renderState.renders[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) fail(path, "expected an object");
    const status: unknown = (entry as Record<string, unknown>).status;
    if (status !== "missing" && status !== "pending" && status !== "ready" && status !== "error") fail(`${path}.status`, "unknown render status");
    const value = object(entry, path, [...identityFields, "status", ...(status === "ready" ? ["assetId"] : status === "error" ? ["reason"] : [])]);
    const common = identity(value, path);
    if (!knownElement(common.element, scenario)) fail(`${path}.element`, "unknown element");
    const key = elementKey(common.element);
    if (seenElements.has(key)) fail(`${path}.element`, "duplicate current render for element");
    seenElements.add(key);
    if (status === "ready") return { ...common, status, assetId: text(value.assetId, `${path}.assetId`) };
    if (status === "error") return { ...common, status, reason: text(value.reason, `${path}.reason`) };
    return { ...common, status };
  });
  const seenPairs = new Set<string>();
  const pairRatings: PairRating[] = list(root.pairRatings, "renderState.pairRatings", 256).map((entry, index) => {
    const path = `renderState.pairRatings[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) fail(path, "expected an object");
    const status: unknown = (entry as Record<string, unknown>).status;
    if (status !== "would_wear" && status !== "would_not_wear" && status !== "render_error") fail(`${path}.status`, "unknown user rating status");
    const value = object(entry, path, ["outfitId", "status", "evidence", ...(status === "render_error" ? ["reason"] : [])]);
    const outfitId = text(value.outfitId, `${path}.outfitId`);
    if (!scenario.outfits.some((outfit) => outfit.id === outfitId)) fail(`${path}.outfitId`, "unknown outfit");
    if (seenPairs.has(outfitId)) fail(`${path}.outfitId`, "duplicate pair rating");
    seenPairs.add(outfitId);
    const evidence = list(value.evidence, `${path}.evidence`, 2).map((entry, evidenceIndex) => {
      const evidencePath = `${path}.evidence[${evidenceIndex}]`;
      const value = object(entry, evidencePath, [...identityFields, "assetId"]);
      return { ...identity(value, evidencePath), assetId: text(value.assetId, `${evidencePath}.assetId`) };
    });
    // Historical evidence may name a replaced element; it will project to unrated.
    if (evidence.filter((entry) => entry.element.kind === "top").length !== 1
      || evidence.filter((entry) => entry.element.kind === "outerwear").length > 1) fail(`${path}.evidence`, "expected one top and at most one outerwear image");
    if (status === "render_error") return { outfitId, status, evidence, reason: text(value.reason, `${path}.reason`) };
    return { outfitId, status, evidence };
  });
  return { schemaVersion: 1, renders, pairRatings };
}

function compatible(renders: readonly ItemRender[]): boolean {
  return renders.every((render) => render.baseRevision === renders[0]?.baseRevision
    && render.pipelineRevision === renders[0]?.pipelineRevision);
}

/**
 * Explicit image evidence is authoritative for this path; legacy Scenario.ratings
 * are deliberately ignored. Missing, stale and pending images cannot prove acceptance.
 */
export function projectPairRatings(inputScenario: Scenario, inputState: RenderState): Scenario {
  const scenario = parseScenario(inputScenario);
  const state = parseRenderState(inputState, scenario);
  const current = new Map(state.renders.map((render) => [elementKey(render.element), render]));
  const pairRatings = new Map(state.pairRatings.map((rating) => [rating.outfitId, rating]));
  const ratings: OutfitRating[] = scenario.outfits.map((outfit) => {
    const required = elements(outfit);
    const images = required.map((element) => current.get(elementKey(element)));
    const errors = images.filter((image): image is Extract<ItemRender, { status: "error" }> => image?.status === "error");
    if (errors.length) return { outfitId: outfit.id, status: "render_error", reason: errors.map((image) => `${image.element.kind}:${image.element.id}: ${image.reason}`).join("; ").slice(0, 512) };
    if (images.some((image) => image?.status !== "ready")) return { outfitId: outfit.id, status: "unrated" };
    const ready = images as Extract<ItemRender, { status: "ready" }>[];
    if (!compatible(ready)) return { outfitId: outfit.id, status: "unrated" };
    const rating = pairRatings.get(outfit.id);
    const matches = rating !== undefined && rating.evidence.length === ready.length
      && ready.every((render) => rating.evidence.some((evidence) => sameIdentity(render, evidence) && render.assetId === evidence.assetId));
    if (!matches) return { outfitId: outfit.id, status: "unrated" };
    return rating.status === "render_error"
      ? { outfitId: outfit.id, status: rating.status, reason: rating.reason }
      : { outfitId: outfit.id, status: rating.status };
  });
  return { ...scenario, ratings };
}

export interface ElementRenderPlan {
  readonly element: ElementRef;
  readonly status: "ready" | "render_required" | "pending" | "retry_required" | "undefined";
  readonly request: RenderIdentity | null;
  /** Estimate for this request only, never a ledger reservation or charge. */
  readonly unitsRequired: number;
  readonly requiresReservation: boolean;
}

function cost(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) fail("unitsPerImage", "expected a positive safe integer");
  return value;
}

function planElement(scenario: Scenario, state: RenderState, element: ElementRef, unitsPerImage: number): ElementRenderPlan {
  if (!knownElement(element, scenario)) fail("element", "unknown element");
  const render = state.renders.find((entry) => elementKey(entry.element) === elementKey(element));
  const status = render === undefined ? "undefined" : render.status === "missing" ? "render_required" : render.status === "error" ? "retry_required" : render.status;
  return {
    element: { ...element }, status,
    request: render?.status === "missing" ? {
      element: { ...render.element }, garmentRevision: render.garmentRevision,
      baseRevision: render.baseRevision, pipelineRevision: render.pipelineRevision, attempt: render.attempt,
    } : null,
    unitsRequired: status === "render_required" ? unitsPerImage : 0,
    requiresReservation: status === "render_required",
  };
}

/** Pure request planning; the Worker must reserve units before executing a request. */
export function planElementRender(inputScenario: Scenario, inputState: RenderState, inputElement: ElementRef, unitsPerImage: number): ElementRenderPlan {
  const scenario = parseScenario(inputScenario);
  const state = parseRenderState(inputState, scenario);
  return planElement(scenario, state, parseElement(inputElement, "element"), cost(unitsPerImage));
}

export interface PairRenderPlan {
  readonly outfitId: string;
  readonly status: "ready" | "render_required" | "blocked";
  readonly elements: readonly ElementRenderPlan[];
  readonly requests: readonly RenderIdentity[];
  readonly unitsRequired: number;
  readonly blockers: readonly string[];
}

export function planPairRender(inputScenario: Scenario, inputState: RenderState, outfitId: string, unitsPerImage: number): PairRenderPlan {
  const scenario = parseScenario(inputScenario);
  const state = parseRenderState(inputState, scenario);
  const unitCost = cost(unitsPerImage);
  const outfit = scenario.outfits.find((entry) => entry.id === outfitId);
  if (outfit === undefined) fail("outfitId", "unknown outfit");
  const plans = elements(outfit).map((element) => planElement(scenario, state, element, unitCost));
  const current = elements(outfit).flatMap((element) => state.renders.filter((render) => elementKey(render.element) === elementKey(element)));
  const blockers = plans.filter((plan) => plan.status !== "ready" && plan.status !== "render_required").map((plan) => `${plan.element.kind}:${plan.element.id}:${plan.status}`);
  if (current.length === plans.length && !compatible(current)) blockers.push("incompatible_base_or_pipeline");
  const projected = projectPairRatings(scenario, state).ratings.find((rating) => rating.outfitId === outfitId)!;
  if (projected.status === "render_error" && blockers.length === 0) blockers.push("pair_requires_user_review_or_retry");
  const requests = blockers.length ? [] : plans.flatMap((plan) => plan.request === null ? [] : [plan.request]);
  const unitsRequired = requests.length * unitCost;
  if (!Number.isSafeInteger(unitsRequired)) fail("unitsPerImage", "planned unit sum exceeds safe integer precision");
  return { outfitId, status: blockers.length ? "blocked" : requests.length ? "render_required" : "ready", elements: plans, requests, unitsRequired, blockers };
}

export interface RenderUsageComparison {
  readonly pairCount: number;
  readonly baselineImages: number;
  readonly baselineUnits: number;
  readonly successfulImages: number;
  readonly successfulUnits: number;
  readonly distinctRenderedElements: number;
  readonly repeatSuccessfulImages: number;
  /** Negative when retries or unnecessary images exceed the baseline. */
  readonly unitsDifference: number;
}

/**
 * Each entry is one successful output image, including retries. This arithmetic
 * does not establish provider charges or the resolution of timed-out requests.
 */
export function compareRenderUsage(inputScenario: Scenario, successfulImages: readonly ElementRef[], unitsPerImage: number): RenderUsageComparison {
  const scenario = parseScenario(inputScenario);
  const unitCost = cost(unitsPerImage);
  const baselineImages = new Set(scenario.outfits.flatMap(elements).map(elementKey)).size;
  const images = list(successfulImages, "successfulImages", 10_000).map((entry, index) => {
    const element = parseElement(entry, `successfulImages[${index}]`);
    if (!knownElement(element, scenario)) fail(`successfulImages[${index}]`, "unknown element");
    return element;
  });
  const baselineUnits = baselineImages * unitCost;
  const successfulUnits = images.length * unitCost;
  if (!Number.isSafeInteger(baselineUnits) || !Number.isSafeInteger(successfulUnits)) fail("unitsPerImage", "unit total exceeds safe integer precision");
  const distinctRenderedElements = new Set(images.map(elementKey)).size;
  return {
    pairCount: scenario.outfits.length, baselineImages, baselineUnits,
    successfulImages: images.length, successfulUnits, distinctRenderedElements,
    repeatSuccessfulImages: images.length - distinctRenderedElements,
    unitsDifference: baselineUnits - successfulUnits,
  };
}
