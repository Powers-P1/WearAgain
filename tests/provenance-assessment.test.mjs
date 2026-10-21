import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assessWardrobeOutfit, parseWardrobeAssessmentInput } from "../dist/core/assessment.js";
import { getRequirementSource, parseRequirementSource, parseScenario, ScenarioValidationError } from "../dist/core/validation.js";
import { solveBasket } from "../dist/core/solver.js";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/core/zero-purchase.json", import.meta.url), "utf8")).scenario;
const wardrobe = () => ({
  schemaVersion: 1, currency: "PLN",
  tops: [{ id: "top", label: "Synthetic owned top" }],
  outerwear: [{ id: "coat", label: "Synthetic owned coat", kind: "owned" }, { id: "new", label: "Synthetic candidate", kind: "candidate", priceMinor: 1000 }],
  outfits: [{ id: "owned", topId: "top", outerwearId: "coat" }, { id: "baseline", topId: "top", outerwearId: null }, { id: "purchase", topId: "top", outerwearId: "new" }],
  requirements: [{ id: "event", label: "One accepted outfit", minCount: 1, outfitIds: ["owned", "baseline", "purchase"] }],
  ratings: [],
});
const scoring = () => ({
  outfitId: "owned", basis: "declared_attributes",
  policy: { version: "synthetic-test-policy-v1", threshold: 60, weights: [{ dimension: "formality", weight: 3 }, { dimension: "warmth", weight: 1 }] },
  evidence: [{ dimension: "formality", status: "known", score: 80, reason: "Synthetic declared evidence" }, { dimension: "warmth", status: "known", score: 20, reason: "Synthetic declared evidence" }],
});

test("legacy requirements keep their JSON shape and default to user chips", () => {
  const parsed = parseScenario(fixture);
  assert.deepEqual(parsed.requirements, fixture.requirements);
  assert.deepEqual(getRequirementSource(parsed.requirements[0]), { kind: "user_chips" });
  assert.equal(solveBasket(parsed).status, "solved");
});

test("event/manual/agent/fallback provenance is copied and cannot change basket or certificate", () => {
  for (const interpretation of ["manual", "agent", "fallback"]) {
    const input = structuredClone(fixture);
    input.requirements[0].source = { kind: "event", eventId: "occasion-1", interpretation };
    const parsed = parseScenario(input);
    assert.deepEqual(getRequirementSource(parsed.requirements[0]), input.requirements[0].source);
    assert.deepEqual(solveBasket(parsed), solveBasket(parseScenario(fixture)));
    input.requirements[0].source.eventId = "changed";
    assert.equal(parsed.requirements[0].source.eventId, "occasion-1");
  }
});

test("provenance validates exact variants and rejects invented fields", () => {
  for (const input of [null, [], { kind: "unknown" }, { kind: "event" }, { kind: "event", eventId: " ", interpretation: "agent" }, { kind: "event", eventId: "x", interpretation: "magic" }, { kind: "user_chips", eventId: "x" }, { kind: "event", eventId: "x", interpretation: "agent", trusted: true }]) {
    assert.throws(() => parseRequirementSource(input), ScenarioValidationError);
  }
  const input = structuredClone(fixture);
  input.requirements[0].source = undefined;
  assert.throws(() => parseScenario(input), ScenarioValidationError);
});

test("wardrobe score is an explicit weighted mean with an inspectable rule version", () => {
  const result = assessWardrobeOutfit(wardrobe(), scoring());
  assert.equal(result.status, "scored");
  assert.equal(result.score, 65);
  assert.equal(result.meetsThreshold, true);
  assert.equal(result.policyVersion, "synthetic-test-policy-v1");
  assert.deepEqual(result.unknownDimensions, []);
  assert.deepEqual(result.components.map(({ dimension, weight, score }) => ({ dimension, weight, score })), [
    { dimension: "formality", weight: 3, score: 80 }, { dimension: "warmth", weight: 1, score: 20 },
  ]);
});

test("missing or unknown dimensions stay UNKNOWN instead of zero or renormalised scores", () => {
  const input = scoring();
  input.evidence.pop();
  let result = assessWardrobeOutfit(wardrobe(), input);
  assert.equal(result.status, "unknown");
  assert.equal(result.score, null);
  assert.equal(result.meetsThreshold, null);
  assert.deepEqual(result.unknownDimensions, ["warmth"]);
  input.evidence.push({ dimension: "warmth", status: "unknown", reason: "No temperature data" });
  result = assessWardrobeOutfit(wardrobe(), input);
  assert.equal(result.components[1].reason, "No temperature data");
  assert.equal(result.score, null);
});

test("an unconfigured scoring policy stays UNKNOWN even with complete proposed evidence", () => {
  const input = scoring();
  input.policy = null;
  const result = assessWardrobeOutfit(wardrobe(), input);
  assert.equal(result.status, "unknown");
  assert.equal(result.score, null);
  assert.equal(result.policyVersion, null);
  assert.equal(result.meetsThreshold, null);
  assert.equal(result.reason, "Scoring policy is UNKNOWN");
  assert.deepEqual(result.components, []);
});

test("scores include zero and 100; a missing threshold is not a failed threshold", () => {
  for (const value of [0, 100]) {
    const input = scoring();
    for (const item of input.evidence) item.score = value;
    let result = assessWardrobeOutfit(wardrobe(), input);
    assert.equal(result.score, value);
    assert.equal(result.meetsThreshold, value >= 60);
    input.policy.threshold = null;
    result = assessWardrobeOutfit(wardrobe(), input);
    assert.equal(result.meetsThreshold, null);
  }
});

test("assessment is separate from user acceptance and cannot make an unknown wardrobe feasible", () => {
  const scenario = wardrobe();
  const input = scoring();
  input.basis = "agent_proposal";
  for (const evidence of input.evidence) evidence.score = 100;
  const before = structuredClone(scenario);
  const result = assessWardrobeOutfit(scenario, input);
  assert.equal(result.score, 100);
  assert.equal(result.basis, "agent_proposal");
  assert.deepEqual(scenario, before);
  assert.equal(solveBasket(scenario).status, "incomplete");
});

test("only existing owned outfits receive wardrobe assessments, including top-only baselines", () => {
  const input = scoring();
  input.outfitId = "baseline";
  assert.equal(assessWardrobeOutfit(wardrobe(), input).status, "scored");
  for (const outfitId of ["missing", "purchase"]) {
    input.outfitId = outfitId;
    assert.throws(() => assessWardrobeOutfit(wardrobe(), input), ScenarioValidationError);
  }
});

test("unknown rules, duplicate evidence, unsafe weights, and invented scores are rejected", () => {
  const mutations = [
    (x) => { x.evidence[0].score = NaN; },
    (x) => { x.evidence[0].score = 101; },
    (x) => { x.evidence[0].score = -1; },
    (x) => { x.evidence[0].score = 0.5; },
    (x) => { x.evidence.push(x.evidence[0]); },
    (x) => { x.evidence[0].dimension = "confidence"; },
    (x) => { x.evidence[0] = { dimension: "rain", status: "known", score: 10, reason: "Synthetic" }; },
    (x) => { x.evidence[0] = { dimension: "formality", status: "unknown", reason: "Synthetic", score: 100 }; },
    (x) => { x.policy.weights[0].weight = 0; },
    (x) => { x.policy.weights[0].weight = 0.5; },
    (x) => { x.policy.weights[0].weight = Number.MAX_SAFE_INTEGER; },
    (x) => { x.policy.weights = []; },
    (x) => { x.policy.weights.push(x.policy.weights[0]); },
    (x) => { x.policy.threshold = 101; },
    (x) => { x.policy.version = ""; },
    (x) => { x.basis = "verified_by_ai"; },
    (x) => { x.ratings = [{ outfitId: "owned", status: "would_wear" }]; },
  ];
  for (const mutate of mutations) {
    const input = scoring(); mutate(input);
    assert.throws(() => parseWardrobeAssessmentInput(input), ScenarioValidationError);
  }
});

test("scoring order is stable and input/output objects are not aliased", () => {
  const input = scoring();
  const expected = assessWardrobeOutfit(wardrobe(), input);
  input.policy.weights.reverse(); input.evidence.reverse();
  assert.deepEqual(assessWardrobeOutfit(wardrobe(), input), expected);
  const parsed = parseWardrobeAssessmentInput(input);
  input.policy.weights[0].weight = 200;
  input.evidence[0].reason = "Changed after parsing";
  assert.equal(parsed.policy.weights[0].weight, 3);
  assert.equal(parsed.evidence[1].reason, "Synthetic declared evidence");
});
