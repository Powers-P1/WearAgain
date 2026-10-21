import type {
  Outfit,
  OutfitRating,
  Outerwear,
  OwnedTop,
  Requirement,
  Scenario,
} from "./types.js";

/** Exhaustive search is deliberately bounded; the demo uses three candidates. */
export const MAX_CANDIDATES = 12;
const MAX_ITEMS = 256;
const MAX_EVIDENCE_ROWS = 500_000;

export class ScenarioValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ScenarioValidationError";
  }
}

function fail(path: string, message: string): never {
  throw new ScenarioValidationError(path, message);
}

function object(
  value: unknown,
  path: string,
  required: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "expected an object");
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(path, "expected a plain JSON object");
  }
  const result = value as Record<string, unknown>;
  for (const key of required) {
    if (!Object.hasOwn(result, key)) fail(`${path}.${key}`, "required field");
  }
  for (const key of Object.keys(result)) {
    if (!required.includes(key)) fail(`${path}.${key}`, "unknown field");
  }
  return result;
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, "expected an array");
  if (value.length > MAX_ITEMS) fail(path, `at most ${MAX_ITEMS} items are supported`);
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 512) {
    fail(path, "expected a nonempty string of at most 512 characters");
  }
  return value;
}

function id(value: unknown, path: string): string {
  const result = text(value, path);
  if (result.trim() !== result) fail(path, "IDs cannot have surrounding whitespace");
  return result;
}

function count(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(path, "expected a nonnegative safe integer");
  }
  return value;
}

function uniqueIds(values: readonly { readonly id: string }[], path: string): Set<string> {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) fail(path, `duplicate ID ${JSON.stringify(value.id)}`);
    seen.add(value.id);
  }
  return seen;
}

function reference(value: string, known: ReadonlySet<string>, path: string): void {
  if (!known.has(value)) fail(path, `unknown ID ${JSON.stringify(value)}`);
}

/** Validate and copy JSON input; missing outfit ratings become explicit unrated entries. */
export function parseScenario(input: unknown): Scenario {
  const root = object(input, "scenario", [
    "schemaVersion", "currency", "tops", "outerwear", "outfits", "requirements", "ratings",
  ]);
  if (root.schemaVersion !== 1) fail("scenario.schemaVersion", "only version 1 is supported");
  const currency = text(root.currency, "scenario.currency");
  if (!/^[A-Z]{3}$/.test(currency)) fail("scenario.currency", "expected a three-letter uppercase currency code");

  const tops: OwnedTop[] = list(root.tops, "scenario.tops").map((entry, index) => {
    const path = `scenario.tops[${index}]`;
    const value = object(entry, path, ["id", "label"]);
    return { id: id(value.id, `${path}.id`), label: text(value.label, `${path}.label`) };
  });
  const topIds = uniqueIds(tops, "scenario.tops");

  const outerwear: Outerwear[] = list(root.outerwear, "scenario.outerwear").map((entry, index) => {
    const path = `scenario.outerwear[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) fail(path, "expected an object");
    const kind: unknown = (entry as Record<string, unknown>).kind;
    if (kind !== "owned" && kind !== "candidate") fail(`${path}.kind`, "expected owned or candidate");
    const value = object(entry, path, kind === "candidate" ? ["id", "label", "kind", "priceMinor"] : ["id", "label", "kind"]);
    const common = { id: id(value.id, `${path}.id`), label: text(value.label, `${path}.label`) };
    return kind === "owned"
      ? { ...common, kind }
      : { ...common, kind, priceMinor: count(value.priceMinor, `${path}.priceMinor`) };
  });
  const outerwearIds = uniqueIds(outerwear, "scenario.outerwear");
  const candidates = outerwear.filter((item) => item.kind === "candidate");
  if (candidates.length > MAX_CANDIDATES) fail("scenario.outerwear", `at most ${MAX_CANDIDATES} candidates are supported`);
  let maximumCost = 0;
  for (const item of candidates) {
    maximumCost += item.priceMinor;
    if (!Number.isSafeInteger(maximumCost)) fail("scenario.outerwear", "sum of candidate prices exceeds safe integer precision");
  }

  const pairs = new Set<string>();
  const outfits: Outfit[] = list(root.outfits, "scenario.outfits").map((entry, index) => {
    const path = `scenario.outfits[${index}]`;
    const value = object(entry, path, ["id", "topId", "outerwearId"]);
    const outfitId = id(value.id, `${path}.id`);
    const topId = id(value.topId, `${path}.topId`);
    const outerwearId = value.outerwearId === null ? null : id(value.outerwearId, `${path}.outerwearId`);
    reference(topId, topIds, `${path}.topId`);
    if (outerwearId !== null) reference(outerwearId, outerwearIds, `${path}.outerwearId`);
    const pair = JSON.stringify([topId, outerwearId]);
    if (pairs.has(pair)) fail(path, "duplicate top/outerwear pair");
    pairs.add(pair);
    return { id: outfitId, topId, outerwearId };
  });
  const outfitIds = uniqueIds(outfits, "scenario.outfits");

  const requirements: Requirement[] = list(root.requirements, "scenario.requirements").map((entry, index) => {
    const path = `scenario.requirements[${index}]`;
    const value = object(entry, path, ["id", "label", "minCount", "outfitIds"]);
    const members = list(value.outfitIds, `${path}.outfitIds`).map((member, memberIndex) => {
      const memberPath = `${path}.outfitIds[${memberIndex}]`;
      const result = id(member, memberPath);
      reference(result, outfitIds, memberPath);
      return result;
    });
    if (new Set(members).size !== members.length) fail(`${path}.outfitIds`, "duplicate outfit reference");
    return {
      id: id(value.id, `${path}.id`),
      label: text(value.label, `${path}.label`),
      minCount: count(value.minCount, `${path}.minCount`),
      outfitIds: members,
    };
  });
  uniqueIds(requirements, "scenario.requirements");
  // Count even empty requirements: each still creates a result per basket.
  const evidenceRows = (2 ** candidates.length) * requirements.reduce((sum, requirement) => sum + 1 + requirement.outfitIds.length, 0);
  if (evidenceRows > MAX_EVIDENCE_ROWS) fail("scenario.requirements", "exhaustive evidence exceeds the supported work limit");

  const ratings = new Map<string, OutfitRating>();
  for (const [index, entry] of list(root.ratings, "scenario.ratings").entries()) {
    const path = `scenario.ratings[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) fail(path, "expected an object");
    const status: unknown = (entry as Record<string, unknown>).status;
    if (status !== "would_wear" && status !== "would_not_wear" && status !== "unrated" && status !== "render_error") {
      fail(`${path}.status`, "unknown rating status");
    }
    const value = object(entry, path, status === "render_error" ? ["outfitId", "status", "reason"] : ["outfitId", "status"]);
    const outfitId = id(value.outfitId, `${path}.outfitId`);
    reference(outfitId, outfitIds, `${path}.outfitId`);
    if (ratings.has(outfitId)) fail(path, `duplicate rating for ${JSON.stringify(outfitId)}`);
    ratings.set(outfitId, status === "render_error"
      ? { outfitId, status, reason: text(value.reason, `${path}.reason`) }
      : { outfitId, status });
  }

  return {
    schemaVersion: 1,
    currency,
    tops,
    outerwear,
    outfits,
    requirements,
    ratings: outfits.map((outfit) => ratings.get(outfit.id) ?? { outfitId: outfit.id, status: "unrated" }),
  };
}
