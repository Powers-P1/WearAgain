import assert from "node:assert/strict";
import test from "node:test";
import { assessWardrobeOutfit } from "../dist/core/assessment.js";
import { elementKey, projectPairRatings } from "../dist/core/rendering.js";
import { selectNextPair } from "../dist/core/selection.js";
import { executeAgentTool } from "../dist/core/tools.js";

// Independent integration fixture: the top and owned coat intentionally share an
// ID. Two accepted owned pairs prove a zero-purchase optimum; one alone cannot.
function context(status = "ready") {
  const scenario = {
    schemaVersion: 1,
    currency: "PLN",
    tops: [
      { id: "shared", label: "Synthetic owned top A" },
      { id: "other", label: "Synthetic owned top B" },
    ],
    outerwear: [
      { id: "shared", label: "Synthetic owned coat", kind: "owned" },
      { id: "buy", label: "Synthetic purchase candidate", kind: "candidate", priceMinor: 1000 },
    ],
    outfits: [
      { id: "owned-a", topId: "shared", outerwearId: "shared" },
      { id: "owned-b", topId: "other", outerwearId: "shared" },
      { id: "purchase-a", topId: "shared", outerwearId: "buy" },
      { id: "purchase-b", topId: "other", outerwearId: "buy" },
    ],
    requirements: [{
      id: "event", label: "Two approved outfits", minCount: 2,
      outfitIds: ["owned-a", "owned-b", "purchase-a", "purchase-b"],
      source: { kind: "event", eventId: "synthetic-event", interpretation: "agent" },
    }],
    // Deliberately optimistic legacy data must not bypass image-bound evidence.
    ratings: ["owned-a", "owned-b", "purchase-a", "purchase-b"]
      .map((outfitId) => ({ outfitId, status: "would_wear" })),
  };
  const elements = [
    ...scenario.tops.map(({ id }) => ({ kind: "top", id })),
    ...scenario.outerwear.map(({ id }) => ({ kind: "outerwear", id })),
  ];
  const unknown = { status: "UNKNOWN", reason: "Synthetic snapshot has no observation" };
  return {
    scenario,
    renderState: {
      schemaVersion: 1,
      renders: elements.map((element) => ({
        element, garmentRevision: `synthetic-${element.kind}-${element.id}`,
        baseRevision: "synthetic-base-v1", pipelineRevision: "pipeline-v1", attempt: 1,
        status,
        ...(status === "ready" ? { assetId: `asset-${element.kind}-${element.id}-1` } : {}),
      })),
      pairRatings: [],
    },
    catalogue: {
      shopId: "synthetic-shop", currency: "PLN", source: "synthetic-hand-authored",
      capturedAt: "2026-10-21T10:00:00Z",
      products: [{
        id: "synthetic-product", candidateId: "buy", label: "Synthetic coat",
        priceMinor: { status: "known", value: 1000 }, productUrl: unknown,
        inStock: unknown, delivery: unknown, pickup: unknown,
      }],
    },
    cities: [{ id: "synthetic-city", label: "Synthetic City", countryCode: "PL" }],
    weather: [],
    unitsPerImage: 2,
  };
}

function evidenceFor(ctx, outfitId) {
  const outfit = ctx.scenario.outfits.find((entry) => entry.id === outfitId);
  const refs = [{ kind: "top", id: outfit.topId }];
  if (outfit.outerwearId !== null) refs.push({ kind: "outerwear", id: outfit.outerwearId });
  return refs.map((ref) => {
    const render = ctx.renderState.renders.find((entry) => entry.element.kind === ref.kind && entry.element.id === ref.id);
    assert.equal(render.status, "ready");
    const { status, ...evidence } = render;
    return structuredClone(evidence);
  });
}

function accept(ctx, outfitId) {
  const rating = { outfitId, status: "would_wear", evidence: evidenceFor(ctx, outfitId) };
  ctx.renderState.pairRatings = ctx.renderState.pairRatings.filter((entry) => entry.outfitId !== outfitId);
  ctx.renderState.pairRatings.push(rating);
}

const solve = (ctx) => executeAgentTool({ name: "solve_basket", input: {} }, ctx).result;

test("agent solver requires pair evidence even when legacy ratings and event provenance are optimistic", () => {
  const ctx = context();
  const before = structuredClone(ctx);
  assert.equal(solve(ctx).solver.status, "incomplete");
  assert.deepEqual(ctx, before);
  accept(ctx, "owned-a");
  assert.equal(solve(ctx).solver.status, "incomplete", "two approvals are needed jointly");
  accept(ctx, "owned-b");
  const result = solve(ctx);
  assert.equal(result.solver.status, "solved");
  assert.deepEqual(result.solver.basket.candidateIds, []);
  assert.equal(result.solver.basket.costMinor, 0);
  assert.equal(result.solver.certificate.selectionStability, "stable");
  assert.deepEqual(result.productIds, []);
  assert.equal(result.commerceVerification, "not_performed");
  assert.deepEqual(projectPairRatings(ctx.scenario, ctx.renderState).requirements[0].source, ctx.scenario.requirements[0].source);
});

test("a shared element replacement invalidates both pairs without confusing a same-ID top", () => {
  const ctx = context();
  accept(ctx, "owned-a");
  accept(ctx, "owned-b");
  assert.equal(solve(ctx).solver.status, "solved");
  const coat = ctx.renderState.renders.find((entry) => entry.element.kind === "outerwear" && entry.element.id === "shared");
  coat.attempt += 1;
  coat.assetId = "replacement-coat";
  const projected = projectPairRatings(ctx.scenario, ctx.renderState);
  assert.deepEqual(projected.ratings.slice(0, 2).map((rating) => rating.status), ["unrated", "unrated"]);
  assert.equal(solve(ctx).solver.status, "incomplete");
  accept(ctx, "owned-a");
  assert.equal(solve(ctx).solver.status, "incomplete");
  accept(ctx, "owned-b");
  assert.equal(solve(ctx).solver.status, "solved");
  assert.equal(ctx.renderState.renders.find((entry) => entry.element.kind === "top" && entry.element.id === "shared").attempt, 1);
});

test("perfect AI proposal and unknown wardrobe score cannot manufacture accepted user ratings", () => {
  const ctx = context();
  const input = {
    outfitId: "owned-a", basis: "agent_proposal",
    policy: { version: "synthetic-policy-v1", threshold: 70, weights: [
      { dimension: "formality", weight: 1 }, { dimension: "rain", weight: 1 },
    ] },
    evidence: [
      { dimension: "formality", status: "known", score: 100, reason: "Synthetic proposal" },
      { dimension: "rain", status: "known", score: 100, reason: "Synthetic proposal" },
    ],
  };
  const before = structuredClone(ctx);
  const assessment = assessWardrobeOutfit(ctx.scenario, input);
  assert.equal(assessment.score, 100);
  assert.equal(assessment.meetsThreshold, true);
  assert.equal(assessment.basis, "agent_proposal");
  assert.equal(solve(ctx).solver.status, "incomplete");
  input.evidence.pop();
  const incomplete = assessWardrobeOutfit(ctx.scenario, input);
  assert.equal(incomplete.status, "unknown");
  assert.equal(incomplete.score, null);
  assert.equal(incomplete.meetsThreshold, null);
  assert.deepEqual(incomplete.unknownDimensions, ["rain"]);
  assert.deepEqual(ctx, before);
});

test("mixed model bases cannot be made acceptable by rebinding only rating evidence", () => {
  const ctx = context();
  ctx.renderState.renders.find((entry) => entry.element.kind === "outerwear" && entry.element.id === "shared").baseRevision = "different-model";
  accept(ctx, "owned-a");
  accept(ctx, "owned-b");
  assert.equal(solve(ctx).solver.status, "incomplete");
  assert.deepEqual(projectPairRatings(ctx.scenario, ctx.renderState).ratings.slice(0, 2).map((rating) => rating.status), ["unrated", "unrated"]);
});

test("tool results and attempted overrides cannot mutate the trusted review context", () => {
  const ctx = context();
  const before = structuredClone(ctx);
  const wardrobe = executeAgentTool({ name: "get_wardrobe", input: {} }, ctx).result;
  wardrobe.tops[0].label = "Changed only in returned result";
  wardrobe.renders[0].element.id = "forged";
  const products = executeAgentTool({ name: "search_catalogue", input: { shopId: "synthetic-shop" } }, ctx).result.products;
  products[0].priceMinor.value = 0;
  assert.throws(() => executeAgentTool({ name: "solve_basket", input: { ratings: ctx.scenario.ratings } }, ctx));
  assert.throws(() => executeAgentTool({ name: "plan_render", input: { element: { kind: "top", id: "shared" }, reservationId: "forged" } }, ctx));
  assert.throws(() => executeAgentTool({ name: "search_catalogue", input: { shopId: "synthetic-shop", productIds: ["forged"] } }, ctx));
  assert.deepEqual(ctx, before);
  assert.equal(solve(ctx).solver.status, "incomplete");
});

test("selector resolves two jointly necessary approvals while sharing one rendered coat", () => {
  const ctx = context("missing");
  const generated = [];
  const reviewed = new Set();
  for (let step = 0; step < 3; step += 1) {
    const selection = selectNextPair(ctx.scenario, ctx.renderState, 2);
    if (selection.status === "settled") {
      assert.equal(selection.result.status, "solved");
      assert.deepEqual(selection.result.basket.candidateIds, []);
      assert.equal(selection.result.certificate.selectionStability, "stable");
      break;
    }
    assert.equal(selection.status, "next");
    assert.ok(selection.next.outfitId.startsWith("owned-"));
    assert.ok(!reviewed.has(selection.next.outfitId), "already accepted evidence must not be requested again");
    assert.equal(selection.next.unitsRequired, step === 0 ? 4 : 2);
    for (const request of selection.next.requests) {
      const render = ctx.renderState.renders.find((entry) => elementKey(entry.element) === elementKey(request.element));
      assert.equal(render.status, "missing");
      render.status = "ready";
      render.assetId = `generated-${generated.length}`;
      generated.push(elementKey(request.element));
    }
    reviewed.add(selection.next.outfitId);
    accept(ctx, selection.next.outfitId);
  }
  assert.equal(reviewed.size, 2);
  assert.equal(new Set(generated).size, 3);
  assert.equal(generated.length, 3, "one shared outerwear asset is reused across the two user ratings");
  assert.equal(solve(ctx).solver.status, "solved");
  assert.deepEqual(solve(ctx).solver.basket.candidateIds, []);
});
