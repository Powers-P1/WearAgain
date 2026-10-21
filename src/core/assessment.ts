import type { Scenario } from "./types.js";
import { parseScenario, ScenarioValidationError } from "./validation.js";

export const ASSESSMENT_DIMENSIONS = ["formality", "warmth", "rain", "footwear", "colour"] as const;
export type AssessmentDimension = (typeof ASSESSMENT_DIMENSIONS)[number];

/** A proposal is never a user rating or independently verified garment property. */
export type AssessmentBasis = "declared_attributes" | "agent_proposal";

export interface AssessmentPolicy {
  readonly version: string;
  /** null means that no purchase/sufficiency threshold has been configured. */
  readonly threshold: number | null;
  /** Only explicitly included dimensions are scored. No default weights exist. */
  readonly weights: readonly { readonly dimension: AssessmentDimension; readonly weight: number }[];
}

export type AssessmentEvidence =
  | { readonly dimension: AssessmentDimension; readonly status: "known"; readonly score: number; readonly reason: string }
  | { readonly dimension: AssessmentDimension; readonly status: "unknown"; readonly reason: string };

export interface WardrobeAssessmentInput {
  readonly outfitId: string;
  readonly basis: AssessmentBasis;
  /** null explicitly preserves an unconfigured/UNKNOWN scoring policy. */
  readonly policy: AssessmentPolicy | null;
  readonly evidence: readonly AssessmentEvidence[];
}

export interface AssessmentComponent {
  readonly dimension: AssessmentDimension;
  readonly weight: number;
  readonly score: number | null;
  readonly reason: string;
}

interface AssessmentSummary {
  readonly outfitId: string;
  readonly basis: AssessmentBasis;
  readonly policyVersion: string | null;
  readonly threshold: number | null;
  readonly components: readonly AssessmentComponent[];
  readonly unknownDimensions: readonly AssessmentDimension[];
}

export type WardrobeAssessment = AssessmentSummary & (
  | { readonly status: "scored"; readonly score: number; readonly meetsThreshold: boolean | null }
  | { readonly status: "unknown"; readonly score: null; readonly meetsThreshold: null; readonly reason: string }
);

function fail(path: string, message: string): never {
  throw new ScenarioValidationError(path, message);
}

function object(input: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) fail(path, "expected a plain object");
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "expected a plain object");
  const value = input as Record<string, unknown>;
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "required field");
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, "unknown field");
  return value;
}

function text(input: unknown, path: string): string {
  if (typeof input !== "string" || !input.trim() || input.length > 512) fail(path, "expected nonempty text of at most 512 characters");
  return input;
}

function dimension(input: unknown, path: string): AssessmentDimension {
  if (!ASSESSMENT_DIMENSIONS.some((candidate) => candidate === input)) fail(path, "unknown assessment dimension");
  return input as AssessmentDimension;
}

function score(input: unknown, path: string): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 0 || input > 100) fail(path, "expected an integer from 0 to 100");
  return input;
}

function smallList(input: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(input) || input.length > ASSESSMENT_DIMENSIONS.length) fail(path, "expected an array of at most five dimensions");
  return input;
}

/** Parse an audit-friendly scoring contract, without guessing an event or policy. */
export function parseWardrobeAssessmentInput(input: unknown): WardrobeAssessmentInput {
  const root = object(input, "assessment", ["outfitId", "basis", "policy", "evidence"]);
  const outfitId = text(root.outfitId, "assessment.outfitId");
  if (outfitId.trim() !== outfitId) fail("assessment.outfitId", "IDs cannot have surrounding whitespace");
  if (root.basis !== "declared_attributes" && root.basis !== "agent_proposal") fail("assessment.basis", "expected declared_attributes or agent_proposal");
  const rawPolicy = root.policy === null ? null : object(root.policy, "assessment.policy", ["version", "threshold", "weights"]);
  const version = rawPolicy === null ? null : text(rawPolicy.version, "assessment.policy.version");
  const threshold = rawPolicy === null || rawPolicy.threshold === null ? null : score(rawPolicy.threshold, "assessment.policy.threshold");
  const dimensions = new Set<AssessmentDimension>();
  let sum = 0;
  const weights = (rawPolicy === null ? [] : smallList(rawPolicy.weights, "assessment.policy.weights")).map((entry, index) => {
    const path = `assessment.policy.weights[${index}]`;
    const value = object(entry, path, ["dimension", "weight"]);
    const name = dimension(value.dimension, `${path}.dimension`);
    if (dimensions.has(name)) fail(path, "duplicate dimension");
    dimensions.add(name);
    if (typeof value.weight !== "number" || !Number.isSafeInteger(value.weight) || value.weight <= 0) fail(`${path}.weight`, "expected a positive safe integer");
    sum += value.weight;
    if (!Number.isSafeInteger(sum * 100)) fail("assessment.policy.weights", "weighted scores exceed safe integer precision");
    return { dimension: name, weight: value.weight };
  });
  if (rawPolicy !== null && !weights.length) fail("assessment.policy.weights", "at least one explicit weight is required");
  weights.sort((left, right) => ASSESSMENT_DIMENSIONS.indexOf(left.dimension) - ASSESSMENT_DIMENSIONS.indexOf(right.dimension));
  const seen = new Set<AssessmentDimension>();
  const evidence = smallList(root.evidence, "assessment.evidence").map((entry, index): AssessmentEvidence => {
    const path = `assessment.evidence[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) fail(path, "expected a plain object");
    const status: unknown = (entry as Record<string, unknown>).status;
    if (status !== "known" && status !== "unknown") fail(`${path}.status`, "expected known or unknown");
    const value = object(entry, path, status === "known" ? ["dimension", "status", "score", "reason"] : ["dimension", "status", "reason"]);
    const name = dimension(value.dimension, `${path}.dimension`);
    if (rawPolicy !== null && !dimensions.has(name)) fail(`${path}.dimension`, "dimension is not included in the scoring policy");
    if (seen.has(name)) fail(path, "duplicate dimension");
    seen.add(name);
    const reason = text(value.reason, `${path}.reason`);
    return status === "known"
      ? { dimension: name, status, score: score(value.score, `${path}.score`), reason }
      : { dimension: name, status, reason };
  });
  evidence.sort((left, right) => ASSESSMENT_DIMENSIONS.indexOf(left.dimension) - ASSESSMENT_DIMENSIONS.indexOf(right.dimension));
  return { outfitId, basis: root.basis, policy: version === null ? null : { version, threshold, weights }, evidence };
}

/**
 * Deterministically aggregate supplied evidence for an owned outfit. Missing
 * evidence remains UNKNOWN; known dimensions are never silently renormalised.
 * This function does not infer taste, validate an AI claim, write ratings,
 * establish shop availability, or turn a score into solver coverage.
 */
export function assessWardrobeOutfit(scenarioInput: Scenario, input: unknown): WardrobeAssessment {
  const scenario = parseScenario(scenarioInput);
  const request = parseWardrobeAssessmentInput(input);
  const outfit = scenario.outfits.find((entry) => entry.id === request.outfitId);
  if (!outfit) fail("assessment.outfitId", "unknown outfit");
  if (outfit.outerwearId !== null && !scenario.outerwear.some((entry) => entry.id === outfit.outerwearId && entry.kind === "owned")) {
    fail("assessment.outfitId", "wardrobe assessment requires an outfit made only from owned items");
  }
  if (request.policy === null) {
    return {
      outfitId: request.outfitId, basis: request.basis, policyVersion: null, threshold: null,
      components: [], unknownDimensions: [], status: "unknown", score: null, meetsThreshold: null,
      reason: "Scoring policy is UNKNOWN",
    };
  }
  const evidence = new Map(request.evidence.map((entry) => [entry.dimension, entry]));
  const components: AssessmentComponent[] = request.policy.weights.map(({ dimension: name, weight }) => {
    const entry = evidence.get(name);
    return { dimension: name, weight, score: entry?.status === "known" ? entry.score : null, reason: entry?.reason ?? "Missing evidence" };
  });
  const unknownDimensions = components.filter((entry) => entry.score === null).map((entry) => entry.dimension);
  const summary: AssessmentSummary = {
    outfitId: request.outfitId,
    basis: request.basis,
    policyVersion: request.policy.version,
    threshold: request.policy.threshold,
    components,
    unknownDimensions,
  };
  if (unknownDimensions.length) return { ...summary, status: "unknown", score: null, meetsThreshold: null, reason: "Scoring evidence is incomplete" };
  const weightTotal = components.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedTotal = components.reduce((sum, entry) => sum + entry.score! * entry.weight, 0);
  const result = Math.round(weightedTotal / weightTotal);
  return { ...summary, status: "scored", score: result, meetsThreshold: request.policy.threshold === null ? null : result >= request.policy.threshold };
}
