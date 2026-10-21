import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  compareRenderUsage,
  elementKey,
  parseRenderState,
  planElementRender,
  planPairRender,
  projectPairRatings,
  RenderValidationError,
} from "../dist/core/rendering.js";
import { solveBasket } from "../dist/core/solver.js";

const original = JSON.parse(readFileSync(new URL("../fixtures/core/minimum-basket.json", import.meta.url), "utf8")).scenario;
const fresh = () => structuredClone(original);
const refs = (scenario) => [
  ...scenario.tops.map(({ id }) => ({ kind: "top", id })),
  ...scenario.outerwear.map(({ id }) => ({ kind: "outerwear", id })),
];
const stateFor = (scenario, status = "ready") => ({
  schemaVersion: 1,
  renders: refs(scenario).map((element) => ({
    element, garmentRevision: "garment-1", baseRevision: "synthetic-base-1", pipelineRevision: "pipeline-1", attempt: 0, status,
    ...(status === "ready" ? { assetId: `synthetic-asset-${elementKey(element)}` } : {}),
  })),
  pairRatings: [],
});
const evidenceFor = (scenario, state, outfitId) => {
  const outfit = scenario.outfits.find(({ id }) => id === outfitId);
  const images = state.renders.filter(({ element }) => element.kind === "top" ? element.id === outfit.topId : element.id === outfit.outerwearId);
  return images.map(({ status: _status, ...evidence }) => evidence);
};
const acceptAll = (scenario, state) => {
  state.pairRatings = scenario.outfits.map(({ id }) => ({ outfitId: id, status: "would_wear", evidence: evidenceFor(scenario, state, id) }));
  return state;
};

test("three tops and three outerwear need six unique images for nine independently rated pairs", () => {
  const scenario = fresh();
  const missing = stateFor(scenario, "missing");
  const pair = planPairRender(scenario, missing, scenario.outfits[0].id, 2);
  assert.equal(pair.status, "render_required");
  assert.equal(pair.requests.length, 2);
  assert.equal(pair.unitsRequired, 4);
  assert.ok(pair.elements.every((entry) => entry.requiresReservation));
  const usage = compareRenderUsage(scenario, refs(scenario), 2);
  assert.deepEqual(usage, {
    pairCount: 9, baselineImages: 6, baselineUnits: 12,
    successfulImages: 6, successfulUnits: 12, distinctRenderedElements: 6,
    repeatSuccessfulImages: 0, unitsDifference: 0,
  });
});

test("ready images are reused while user ratings remain specific to each pair", () => {
  const scenario = fresh();
  scenario.ratings = scenario.outfits.map(({ id }) => ({ outfitId: id, status: "would_wear" }));
  const state = stateFor(scenario);
  const first = scenario.outfits[0].id;
  state.pairRatings.push({ outfitId: first, status: "would_wear", evidence: evidenceFor(scenario, state, first) });
  const projected = projectPairRatings(scenario, state);
  assert.deepEqual(projected.ratings.filter(({ status }) => status === "would_wear").map(({ outfitId }) => outfitId), [first]);
  assert.equal(projected.ratings.filter(({ status }) => status === "unrated").length, 8);
  const plan = planPairRender(scenario, state, scenario.outfits[1].id, 2);
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.requests, []);
  assert.equal(plan.unitsRequired, 0);
});

test("revisions and asset replacement invalidate every dependent pair, preserving other approvals", async (t) => {
  for (const field of ["garmentRevision", "baseRevision", "pipelineRevision", "attempt", "assetId"]) {
    await t.test(field, () => {
      const scenario = fresh();
      const state = acceptAll(scenario, stateFor(scenario));
      const target = state.renders.find(({ element }) => element.kind === "outerwear");
      target[field] = field === "attempt" ? 1 : `${target[field]}-changed`;
      const projected = projectPairRatings(scenario, state);
      for (const outfit of scenario.outfits) {
        const rating = projected.ratings.find(({ outfitId }) => outfitId === outfit.id);
        assert.equal(rating.status, outfit.outerwearId === target.element.id ? "unrated" : "would_wear");
      }
    });
  }
});

test("two individually valid images on different base or pipeline revisions cannot support an approval", () => {
  for (const field of ["baseRevision", "pipelineRevision"]) {
    const scenario = fresh();
    const state = stateFor(scenario);
    state.renders.find(({ element }) => element.kind === "outerwear")[field] = "different";
    acceptAll(scenario, state);
    const first = scenario.outfits[0].id;
    assert.equal(projectPairRatings(scenario, state).ratings.find(({ outfitId }) => outfitId === first).status, "unrated");
    const plan = planPairRender(scenario, state, first, 2);
    assert.equal(plan.status, "blocked");
    assert.ok(plan.blockers.includes("incompatible_base_or_pipeline"));
  }
});

test("a shared element error blocks dependent pairs without converting them to dislikes", () => {
  const scenario = fresh();
  const state = acceptAll(scenario, stateFor(scenario));
  const index = state.renders.findIndex(({ element }) => element.kind === "outerwear");
  const { assetId: _asset, ...identity } = state.renders[index];
  state.renders[index] = { ...identity, status: "error", reason: "Synthetic missing sleeve" };
  const dependent = scenario.outfits.filter(({ outerwearId }) => outerwearId === identity.element.id);
  const projected = projectPairRatings(scenario, state);
  for (const { id } of dependent) {
    const rating = projected.ratings.find(({ outfitId }) => outfitId === id);
    assert.equal(rating.status, "render_error");
    assert.match(rating.reason, /Synthetic missing sleeve/);
    const plan = planPairRender(scenario, state, id, 2);
    assert.equal(plan.status, "blocked");
    assert.equal(plan.requests.length, 0);
  }
  assert.equal(planElementRender(scenario, state, identity.element, 2).status, "retry_required");
});

test("pending, absent definitions and explicit user render errors do not auto-retry", () => {
  const scenario = fresh();
  const state = stateFor(scenario);
  const first = scenario.outfits[0].id;
  const top = state.renders[0];
  delete top.assetId;
  top.status = "pending";
  assert.equal(planPairRender(scenario, state, first, 2).status, "blocked");
  assert.equal(planElementRender(scenario, state, top.element, 2).status, "pending");
  state.renders.shift();
  assert.equal(planElementRender(scenario, state, top.element, 2).status, "undefined");
  const ready = stateFor(scenario);
  ready.pairRatings.push({ outfitId: first, status: "render_error", reason: "Synthetic unusable comparison", evidence: evidenceFor(scenario, ready, first) });
  assert.equal(planPairRender(scenario, ready, first, 2).status, "blocked");
  assert.equal(projectPairRatings(scenario, ready).ratings[0].status, "render_error");
});

test("top-only zero-purchase baseline requires exactly its own image evidence", () => {
  const scenario = {
    schemaVersion: 1, currency: "PLN", tops: [{ id: "shirt", label: "Synthetic shirt" }], outerwear: [],
    outfits: [{ id: "baseline", topId: "shirt", outerwearId: null }],
    requirements: [{ id: "work", label: "Work", minCount: 1, outfitIds: ["baseline"] }], ratings: [],
  };
  const state = acceptAll(scenario, stateFor(scenario));
  const result = solveBasket(projectPairRatings(scenario, state));
  assert.equal(result.status, "solved");
  assert.deepEqual(result.basket.candidateIds, []);
  assert.equal(compareRenderUsage(scenario, refs(scenario), 2).baselineImages, 1);
  assert.equal(state.pairRatings[0].evidence.length, 1);
});

test("top and outerwear identifiers remain separate namespaces", () => {
  const scenario = {
    schemaVersion: 1, currency: "PLN", tops: [{ id: "same", label: "Synthetic top" }],
    outerwear: [{ id: "same", label: "Synthetic outerwear", kind: "owned" }],
    outfits: [{ id: "pair", topId: "same", outerwearId: "same" }],
    requirements: [{ id: "need", label: "Need", minCount: 1, outfitIds: ["pair"] }], ratings: [],
  };
  const state = acceptAll(scenario, stateFor(scenario));
  assert.notEqual(elementKey(refs(scenario)[0]), elementKey(refs(scenario)[1]));
  assert.equal(projectPairRatings(scenario, state).ratings[0].status, "would_wear");
  assert.equal(compareRenderUsage(scenario, refs(scenario), 2).baselineImages, 2);
});

test("successful retries count again and can exceed the six-image baseline", () => {
  const scenario = fresh();
  const attempts = [...refs(scenario), refs(scenario)[0], refs(scenario)[0]];
  const usage = compareRenderUsage(scenario, attempts, 2);
  assert.equal(usage.successfulUnits, 16);
  assert.equal(usage.repeatSuccessfulImages, 2);
  assert.equal(usage.unitsDifference, -4);
});

test("render-state parsing copies input and rejects malformed evidence and spoofed fields", () => {
  const scenario = fresh();
  const state = acceptAll(scenario, stateFor(scenario));
  const parsed = parseRenderState(state, scenario);
  state.renders[0].garmentRevision = "mutated";
  state.pairRatings[0].evidence[0].assetId = "mutated";
  assert.notEqual(parsed.renders[0].garmentRevision, "mutated");
  assert.notEqual(parsed.pairRatings[0].evidence[0].assetId, "mutated");
  const invalid = [
    (value) => { value.renders.push(value.renders[0]); },
    (value) => { value.renders[0].element.id = "missing"; },
    (value) => { value.renders[0].attempt = -1; },
    (value) => { value.renders[0].reserved = true; },
    (value) => { value.pairRatings[0].status = "ai_likes_it"; },
    (value) => { value.pairRatings[0].evidence = []; },
    (value) => { value.pairRatings[0].evidence = [value.pairRatings[0].evidence[0], value.pairRatings[0].evidence[0]]; },
    (value) => { value.pairRatings.push(value.pairRatings[0]); },
  ];
  for (const mutate of invalid) {
    const value = acceptAll(scenario, stateFor(scenario));
    mutate(value);
    assert.throws(() => parseRenderState(value, scenario), RenderValidationError);
  }
  assert.throws(() => planElementRender(scenario, parsed, { kind: "top", id: "missing" }, 2), RenderValidationError);
  assert.throws(() => compareRenderUsage(scenario, [], 0), RenderValidationError);
  assert.throws(() => compareRenderUsage(scenario, refs(scenario), Number.MAX_SAFE_INTEGER), RenderValidationError);
});
