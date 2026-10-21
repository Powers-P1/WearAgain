import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareRenderUsage, elementKey, projectPairRatings } from "../dist/core/rendering.js";
import { selectNextPair } from "../dist/core/selection.js";
import { solveBasket } from "../dist/core/solver.js";

const original = JSON.parse(readFileSync(new URL("../fixtures/core/minimum-basket.json", import.meta.url), "utf8")).scenario;
const stateFor = (scenario, status = "missing") => ({
  schemaVersion: 1,
  renders: [
    ...scenario.tops.map(({ id }) => ({ kind: "top", id })),
    ...scenario.outerwear.map(({ id }) => ({ kind: "outerwear", id })),
  ].map((element) => ({
    element, garmentRevision: "garment-1", baseRevision: "synthetic-base-1", pipelineRevision: "pipeline-1", attempt: 0, status,
    ...(status === "ready" ? { assetId: `synthetic-${elementKey(element)}` } : {}),
  })),
  pairRatings: [],
});

function rate(scenario, state, outfitId, status) {
  const outfit = scenario.outfits.find(({ id }) => id === outfitId);
  const evidence = state.renders
    .filter(({ element }) => element.kind === "top" ? element.id === outfit.topId : element.id === outfit.outerwearId)
    .map(({ status: _status, ...entry }) => structuredClone(entry));
  state.pairRatings.push({ outfitId, status, evidence });
}

test("adaptive six-image rendering reaches the full-matrix decision for all 512 binary 3x3 rating matrices", () => {
  let casesWithSavings = 0;
  for (let matrix = 0; matrix < 2 ** original.outfits.length; matrix += 1) {
    const scenario = structuredClone(original);
    scenario.ratings = scenario.outfits.map(({ id }, index) => ({ outfitId: id, status: (matrix & (1 << index)) ? "would_wear" : "would_not_wear" }));
    const expected = solveBasket(scenario);
    const state = stateFor(scenario);
    const successfulImages = [];
    const asked = new Set();
    let selection;
    for (let step = 0; step <= scenario.outfits.length; step += 1) {
      selection = selectNextPair(scenario, state, 2);
      if (selection.status === "settled") break;
      assert.equal(selection.status, "next", `unexpected block at matrix ${matrix}`);
      assert.ok(!asked.has(selection.next.outfitId), "no pair can be silently requested again");
      asked.add(selection.next.outfitId);
      for (const request of selection.next.requests) {
        const index = state.renders.findIndex(({ element }) => elementKey(element) === elementKey(request.element));
        assert.equal(state.renders[index].status, "missing");
        state.renders[index] = { ...request, status: "ready", assetId: `synthetic-${elementKey(request.element)}` };
        successfulImages.push(request.element);
      }
      const answer = scenario.ratings.find(({ outfitId }) => outfitId === selection.next.outfitId);
      rate(scenario, state, answer.outfitId, answer.status);
    }
    assert.equal(selection.status, "settled", `matrix ${matrix} must terminate`);
    assert.equal(selection.result.status, expected.status, `matrix ${matrix}`);
    assert.deepEqual(selection.result.basket, expected.basket, `matrix ${matrix}`);
    assert.deepEqual(selection.baseline, { pairs: 9, images: 6, units: 12 });
    if (selection.result.status === "solved") {
      assert.equal(selection.result.certificate.priceOptimality, "proven");
      assert.equal(selection.result.certificate.selectionStability, "stable");
    }
    const usage = compareRenderUsage(scenario, successfulImages, 2);
    assert.ok(usage.successfulImages <= 6);
    assert.equal(usage.repeatSuccessfulImages, 0);
    if (usage.unitsDifference > 0) casesWithSavings += 1;
  }
  assert.ok(casesWithSavings > 0, "the fixture must demonstrate actual early stopping, not only a full scan");
});

test("requirements needing two unknown approvals cannot be settled by a single-flip shortcut", () => {
  const scenario = {
    schemaVersion: 1, currency: "PLN", tops: [{ id: "a", label: "Synthetic A" }, { id: "b", label: "Synthetic B" }],
    outerwear: [{ id: "coat", label: "Synthetic coat", kind: "owned" }],
    outfits: [{ id: "a-coat", topId: "a", outerwearId: "coat" }, { id: "b-coat", topId: "b", outerwearId: "coat" }],
    requirements: [{ id: "work", label: "Two work outfits", minCount: 2, outfitIds: ["a-coat", "b-coat"] }], ratings: [],
  };
  const state = stateFor(scenario, "ready");
  const first = selectNextPair(scenario, state, 2);
  assert.equal(first.status, "next");
  assert.equal(first.result.status, "incomplete");
  rate(scenario, state, first.next.outfitId, "would_wear");
  const second = selectNextPair(scenario, state, 2);
  assert.equal(second.status, "next");
  assert.equal(second.result.status, "incomplete");
  rate(scenario, state, second.next.outfitId, "would_wear");
  const last = selectNextPair(scenario, state, 2);
  assert.equal(last.status, "settled");
  assert.deepEqual(last.result.basket.candidateIds, []);
});

test("frozen all-accepted example needs four images/eight units instead of six/twelve", () => {
  const scenario = structuredClone(original);
  const state = stateFor(scenario);
  const successfulImages = [];
  let selected;
  for (let step = 0; step <= scenario.outfits.length; step += 1) {
    selected = selectNextPair(scenario, state, 2);
    if (selected.status === "settled") break;
    assert.equal(selected.status, "next");
    for (const request of selected.next.requests) {
      const index = state.renders.findIndex(({ element }) => elementKey(element) === elementKey(request.element));
      state.renders[index] = { ...request, status: "ready", assetId: `synthetic-${elementKey(request.element)}` };
      successfulImages.push(request.element);
    }
    rate(scenario, state, selected.next.outfitId, "would_wear");
  }
  assert.equal(selected.status, "settled");
  assert.deepEqual(selected.result.basket.candidateIds, ["cheap-a"]);
  const usage = compareRenderUsage(scenario, successfulImages, 2);
  assert.equal(usage.successfulImages, 4);
  assert.equal(usage.successfulUnits, 8);
  assert.equal(usage.baselineImages, 6);
  assert.equal(usage.baselineUnits, 12);
  assert.equal(usage.unitsDifference, 4);
});

test("same-price preferred baskets remain decision-relevant after price optimality is proven", () => {
  const fixture = JSON.parse(readFileSync(new URL("../fixtures/core/provisional-tie.json", import.meta.url), "utf8"));
  const scenario = fixture.scenario;
  const state = stateFor(scenario, "ready");
  for (const rating of scenario.ratings) {
    if (rating.status === "would_wear" || rating.status === "would_not_wear") rate(scenario, state, rating.outfitId, rating.status);
  }
  const choice = selectNextPair(scenario, state, 2);
  assert.equal(choice.result.status, "solved");
  assert.equal(choice.result.certificate.priceOptimality, "proven");
  assert.equal(choice.result.certificate.selectionStability, "provisional");
  assert.equal(choice.status, "next");
  assert.ok(choice.next);
});

test("pending and failed relevant images report blocked, never a settled certificate or retry loop", () => {
  const scenario = JSON.parse(readFileSync(new URL("../fixtures/core/render-error-incomplete.json", import.meta.url), "utf8")).scenario;
  for (const status of ["pending", "error"]) {
    const state = stateFor(scenario, "ready");
    const index = state.renders.findIndex(({ element }) => element.kind === "outerwear");
    const { assetId: _asset, ...identity } = state.renders[index];
    state.renders[index] = { ...identity, status, ...(status === "error" ? { reason: "Synthetic failure" } : {}) };
    const selection = selectNextPair(scenario, state, 2);
    assert.equal(selection.status, "blocked");
    assert.equal(selection.next, null);
    assert.equal(selection.result.status, "incomplete");
    assert.deepEqual(selection.blockedOutfitIds, scenario.outfits.map(({ id }) => id));
  }
});

test("unneeded unresolved images do not force renders after a stable optimum", () => {
  const scenario = structuredClone(original);
  scenario.requirements = [];
  const state = stateFor(scenario);
  const choice = selectNextPair(scenario, state, 2);
  assert.equal(choice.status, "settled");
  assert.deepEqual(choice.result.basket.candidateIds, []);
  assert.equal(choice.next, null);
  assert.deepEqual(choice.relevantOutfitIds, []);
});

test("selection is independent of input order and does not mutate caller snapshots", () => {
  const scenario = structuredClone(original);
  const state = stateFor(scenario);
  const beforeScenario = structuredClone(scenario);
  const beforeState = structuredClone(state);
  const first = selectNextPair(scenario, state, 2);
  const reversed = structuredClone(scenario);
  for (const field of ["tops", "outerwear", "outfits", "requirements", "ratings"]) reversed[field].reverse();
  for (const requirement of reversed.requirements) requirement.outfitIds.reverse();
  const reversedState = structuredClone(state);
  reversedState.renders.reverse();
  assert.deepEqual(selectNextPair(reversed, reversedState, 2), first);
  assert.deepEqual(scenario, beforeScenario);
  assert.deepEqual(state, beforeState);
  assert.equal(solveBasket(projectPairRatings(scenario, state)).status, "incomplete");
});
