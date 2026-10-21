import assert from "node:assert/strict";
import test from "node:test";
import {
  executeAgentTool,
  parseAgentToolContext,
  parseAgentToolRequest,
  ToolContractError,
} from "../dist/core/tools.js";

const known = (value) => ({ status: "known", value });
const unknown = (reason = "Synthetic missing observation") => ({ status: "UNKNOWN", reason });

// Every entity, price, image reference, forecast and shop here is invented.
function context() {
  const scenario = {
    schemaVersion: 1, currency: "PLN",
    tops: [{ id: "same", label: "Owned top" }],
    outerwear: [
      { id: "same", label: "Candidate coat", kind: "candidate", priceMinor: 4000 },
      { id: "owned", label: "Owned coat", kind: "owned" },
    ],
    outfits: [
      { id: "candidate-pair", topId: "same", outerwearId: "same" },
      { id: "owned-pair", topId: "same", outerwearId: "owned" },
    ],
    requirements: [{ id: "work", label: "One work pair", minCount: 1, outfitIds: ["candidate-pair", "owned-pair"] }],
    // Deliberately conflicting legacy ratings must not override render-bound evidence.
    ratings: [{ outfitId: "owned-pair", status: "would_wear" }],
  };
  const renders = [
    { kind: "top", id: "same" }, { kind: "outerwear", id: "same" }, { kind: "outerwear", id: "owned" },
  ].map((element) => ({
    element, garmentRevision: `garment-${element.kind}-${element.id}`, baseRevision: "synthetic-base-1",
    pipelineRevision: "synthetic-pipeline-1", attempt: 0, status: "ready", assetId: `asset-${element.kind}-${element.id}`,
  }));
  const evidence = (render) => { const { status, ...result } = render; return result; };
  return {
    scenario,
    renderState: { schemaVersion: 1, renders, pairRatings: [
      { outfitId: "candidate-pair", status: "would_wear", evidence: [renders[0], renders[1]].map(evidence) },
      { outfitId: "owned-pair", status: "would_not_wear", evidence: [renders[0], renders[2]].map(evidence) },
    ] },
    catalogue: {
      shopId: "synthetic-shop", currency: "PLN", source: "Synthetic catalogue", capturedAt: "2026-10-21T10:00:00Z",
      products: [
        { id: "product-coat", candidateId: "same", label: "Candidate coat", priceMinor: known(4000),
          productUrl: known("https://shop.example/coat"), inStock: unknown(), delivery: unknown(), pickup: unknown() },
        { id: "product-unpriced", candidateId: null, label: "Unpriced extra coat", priceMinor: unknown(),
          productUrl: unknown(), inStock: known(false), delivery: known({ available: false }), pickup: known({ available: false }) },
      ],
    },
    cities: [
      { id: "city-a", label: "Oxford", countryCode: "GB" },
      { id: "city-b", label: "Oxford", countryCode: "US" },
    ],
    weather: [{ cityId: "city-a", date: "2026-10-21", source: "Synthetic forecast", capturedAt: "2026-10-21T09:00:00Z",
      temperatureC: known(12), rainProbability: unknown() }],
    unitsPerImage: 2,
  };
}

const call = (name, input, snapshot = context()) => executeAgentTool({ name, input }, snapshot).result;

test("agent inventory contains owned pieces and their scoped image references only", () => {
  const result = call("get_wardrobe", {});
  assert.deepEqual(result.tops.map((item) => item.id), ["same"]);
  assert.deepEqual(result.outerwear.map((item) => item.id), ["owned"]);
  assert.deepEqual(result.renders.map((item) => item.element), [
    { kind: "top", id: "same" }, { kind: "outerwear", id: "owned" },
  ]);
});

test("single-shop search filters declared product IDs and preserves unknown prices and stock", () => {
  const result = call("search_catalogue", { shopId: "synthetic-shop", query: "COAT", productIds: ["product-unpriced"] });
  assert.equal(result.shopId, "synthetic-shop");
  assert.equal(result.products.length, 1);
  assert.deepEqual(result.products[0].priceMinor, unknown());
  assert.deepEqual(result.products[0].inStock, known(false));
  assert.deepEqual(result.products[0].delivery, known({ available: false }));
  assert.deepEqual(result.products[0].pickup, known({ available: false }));
  assert.equal(result.capturedAt, "2026-10-21T10:00:00Z");
});

test("known fulfillment availability can retain missing arrival date and fee as UNKNOWN", () => {
  const snapshot = context();
  snapshot.catalogue.products[0].delivery = known({ available: true, arrivalDate: unknown(), feeMinor: unknown() });
  snapshot.catalogue.products[0].pickup = known({ available: true, storeId: "store-a", storeLabel: "Synthetic store", date: unknown(), feeMinor: known(0) });
  const result = call("search_catalogue", { shopId: "synthetic-shop", productIds: ["product-coat"] }, snapshot);
  assert.deepEqual(result.products[0].delivery.value.arrivalDate, unknown());
  assert.deepEqual(result.products[0].pickup.value.feeMinor, known(0));
});

test("agent cannot cite an unknown product or switch to an untrusted shop", () => {
  assert.throws(() => call("search_catalogue", { shopId: "other-shop" }), ToolContractError);
  assert.throws(() => call("search_catalogue", { shopId: "synthetic-shop", productIds: ["fictional-id"] }), ToolContractError);
});

test("city lookup retains ambiguity and weather never invents missing observations", () => {
  assert.deepEqual(call("lookup_city", { query: "oxford" }).map((city) => city.id), ["city-a", "city-b"]);
  const forecast = call("get_weather", { cityId: "city-a", date: "2026-10-21" });
  assert.equal(forecast.status, "known");
  assert.deepEqual(forecast.value.temperatureC, known(12));
  assert.deepEqual(forecast.value.rainProbability, unknown());
  assert.equal(call("get_weather", { cityId: "city-b", date: "2026-10-21" }).status, "UNKNOWN");
  assert.throws(() => call("get_weather", { cityId: "fabricated-city", date: "2026-10-21" }), ToolContractError);
});

test("solver tool uses only current render-bound user evidence and maps basket to product IDs", () => {
  const snapshot = context();
  const result = call("solve_basket", {}, snapshot);
  assert.equal(result.solver.status, "solved");
  assert.deepEqual(result.solver.basket.candidateIds, ["same"]);
  assert.deepEqual(result.productIds, ["product-coat"]);
  assert.equal(result.solver.basket.costMinor, 4000);
  assert.equal(result.verificationScope, "requirements_and_current_user_ratings");
  assert.equal(result.commerceVerification, "not_performed");
  snapshot.renderState.renders[1].attempt += 1;
  assert.equal(call("solve_basket", {}, snapshot).solver.status, "incomplete");
  snapshot.renderState = { schemaVersion: 1, renders: [], pairRatings: [] };
  assert.equal(call("solve_basket", {}, snapshot).solver.status, "incomplete");
});

test("render tool returns an intent requiring a reservation and never fabricates authorization", () => {
  const snapshot = context();
  snapshot.renderState.renders[1].status = "missing";
  delete snapshot.renderState.renders[1].assetId;
  const result = call("plan_render", { element: { kind: "outerwear", id: "same" } }, snapshot);
  assert.equal(result.status, "render_required");
  assert.equal(result.unitsRequired, 2);
  assert.equal(result.requiresReservation, true);
  assert.deepEqual(result.request.element, { kind: "outerwear", id: "same" });
  assert.equal("reservationId" in result, false);
  assert.equal("authorized" in result, false);
  assert.equal(snapshot.renderState.renders[1].status, "missing");
  assert.throws(() => call("plan_render", { element: { kind: "top", id: "unknown-top" } }), /unknown element/);
});

test("ready renders expose opaque asset IDs; errors and pending jobs do not initiate automatic retries", () => {
  const snapshot = context();
  let result = call("plan_render", { element: { kind: "outerwear", id: "same" } }, snapshot);
  assert.equal(result.status, "ready");
  assert.equal(result.render.assetId, "asset-outerwear-same");
  assert.equal(result.request, null);
  assert.equal(result.unitsRequired, 0);
  delete snapshot.renderState.renders[1].assetId;
  for (const status of ["pending", "error"]) {
    snapshot.renderState.renders[1].status = status;
    if (status === "error") snapshot.renderState.renders[1].reason = "Synthetic provider error";
    result = call("plan_render", { element: { kind: "outerwear", id: "same" } }, snapshot);
    assert.equal(result.request, null);
    assert.equal(result.unitsRequired, 0);
    assert.equal(result.requiresReservation, false);
  }
});

test("request allowlist rejects rating writes, scenario overrides and reservation injection", () => {
  const forbidden = [
    { name: "set_rating", input: { outfitId: "candidate-pair", status: "would_wear" } },
    { name: "solve_basket", input: { ratings: [] } },
    { name: "solve_basket", input: { scenario: context().scenario } },
    { name: "solve_basket", input: { priceMinor: 0 } },
    { name: "solve_basket", input: { requirements: [] } },
    { name: "get_wardrobe", input: {}, ratings: [] },
    { name: "plan_render", input: { element: { kind: "top", id: "same" }, reservationId: "pretend" } },
    { name: "plan_render", input: { element: { kind: "top", id: "same", units: 0 } } },
    { name: "plan_render", input: { element: { kind: "top", id: "same" }, unitsPerImage: 0 } },
    { name: "search_catalogue", input: { shopId: "synthetic-shop", products: [] } },
    { name: "get_weather", input: { cityId: "city-a", date: "2026-10-21", rainProbability: 0 } },
    { name: "get_wardrobe" },
    { name: "get_wardrobe", input: [] },
  ];
  for (const request of forbidden) assert.throws(() => executeAgentTool(request, context()), ToolContractError);
});

test("candidate mapping validates identity, known prices, currency and selected-shop completeness", () => {
  const cases = [
    (snapshot) => { snapshot.catalogue.currency = "EUR"; },
    (snapshot) => { snapshot.catalogue.products[0].priceMinor = known(1); },
    (snapshot) => { snapshot.catalogue.products[0].priceMinor = unknown(); },
    (snapshot) => { snapshot.catalogue.products[0].candidateId = "owned"; },
    (snapshot) => { snapshot.catalogue.products[0].candidateId = "missing"; },
    (snapshot) => { snapshot.catalogue.products[0].candidateId = null; },
    (snapshot) => { snapshot.catalogue.products[1].candidateId = "same"; },
    (snapshot) => { snapshot.catalogue.products[1].id = "product-coat"; },
    (snapshot) => { snapshot.catalogue.products[0].shopId = "other-shop"; },
  ];
  for (const mutate of cases) {
    const snapshot = context(); mutate(snapshot);
    assert.throws(() => parseAgentToolContext(snapshot), ToolContractError);
  }
});

test("snapshots reject fabricated UNKNOWN values, malformed facts and unsafe costs", () => {
  const cases = [
    (snapshot) => { snapshot.catalogue.products[0].inStock = { status: "UNKNOWN", reason: "Missing", value: true }; },
    (snapshot) => { snapshot.catalogue.products[0].inStock = known("yes"); },
    (snapshot) => { snapshot.catalogue.products[0].productUrl = known("javascript:alert(1)"); },
    (snapshot) => { snapshot.catalogue.products[0].delivery = known({ available: false, arrivalDate: known("2026-10-22") }); },
    (snapshot) => { snapshot.catalogue.products[0].pickup = known({ available: false, storeId: "fabricated" }); },
    (snapshot) => { snapshot.weather[0].rainProbability = known(1.1); },
    (snapshot) => { snapshot.weather[0].temperatureC = known(Infinity); },
    (snapshot) => { snapshot.weather[0].date = "2026-02-30"; },
    (snapshot) => { snapshot.catalogue.capturedAt = "2026-02-30T10:00:00Z"; },
    (snapshot) => { snapshot.weather[0].cityId = "not-in-cities"; },
    (snapshot) => { snapshot.weather.push(structuredClone(snapshot.weather[0])); },
    (snapshot) => { snapshot.unitsPerImage = 0; },
    (snapshot) => { snapshot.unitsPerImage = Number.MAX_SAFE_INTEGER + 1; },
  ];
  for (const mutate of cases) {
    const snapshot = context(); mutate(snapshot);
    assert.throws(() => parseAgentToolContext(snapshot), ToolContractError);
  }
});

test("request/context parsing and tool results do not alias their sources", () => {
  const snapshot = context();
  const before = structuredClone(snapshot);
  const request = { name: "search_catalogue", input: { shopId: "synthetic-shop", productIds: ["product-coat"] } };
  const parsed = parseAgentToolRequest(request);
  parsed.input.productIds.push("only-the-copy");
  assert.deepEqual(request.input.productIds, ["product-coat"]);
  const result = executeAgentTool(request, snapshot).result;
  result.products[0].label = "Changed response";
  result.products[0].priceMinor.value = 0;
  call("get_wardrobe", {}, snapshot).renders[0].element.id = "response-only";
  call("get_weather", { cityId: "city-a", date: "2026-10-21" }, snapshot).value.temperatureC.value = -99;
  call("plan_render", { element: { kind: "top", id: "same" } }, snapshot).render.assetId = "response-only";
  assert.deepEqual(snapshot, before);
  const freeze = (value) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } };
  freeze(snapshot);
  assert.equal(call("solve_basket", {}, snapshot).solver.status, "solved");
});
