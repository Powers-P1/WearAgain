import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_CANDIDATES,
  ScenarioValidationError,
  evaluateBaskets,
  parseScenario,
  solveBasket,
} from "../dist/core/index.js";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/core/minimum-basket.json", import.meta.url), "utf8")).scenario;
const fresh = () => structuredClone(fixture);

function rejects(input, path) {
  assert.throws(() => parseScenario(input), (error) => {
    assert.ok(error instanceof ScenarioValidationError, "invalid input needs an actionable validation error");
    assert.equal(error.name, "ScenarioValidationError");
    assert.ok(error.path.startsWith(path), `expected path beginning ${path}; got ${error.path}`);
    return true;
  });
}

test("JSON boundary rejects malformed roots and incomplete collections", async (t) => {
  for (const input of [null, [], true, 42, "scenario", new Date(0)]) {
    await t.test(String(input), () => rejects(input, "scenario"));
  }
  const cases = [
    ["unsupported schema", (s) => { s.schemaVersion = 2; }, "scenario.schemaVersion"],
    ["missing ratings list", (s) => { delete s.ratings; }, "scenario.ratings"],
    ["null outfits list", (s) => { s.outfits = null; }, "scenario.outfits"],
    ["array in place of top", (s) => { s.tops[0] = []; }, "scenario.tops[0]"],
    ["unknown root field", (s) => { s.photo = "synthetic-unused-field"; }, "scenario.photo"],
    ["empty identifier", (s) => { s.tops[0].id = " "; }, "scenario.tops[0].id"],
  ];
  for (const [name, mutate, path] of cases) {
    await t.test(name, () => { const s = fresh(); mutate(s); rejects(s, path); });
  }
});

test("money stays exact and uses the single scenario currency", async (t) => {
  for (const price of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1000"]) {
    await t.test(`invalid minor-unit amount ${String(price)}`, () => {
      const s = fresh(); s.outerwear[0].priceMinor = price;
      rejects(s, "scenario.outerwear[0].priceMinor");
    });
  }
  await t.test("sum overflow is rejected even if each individual price is safe", () => {
    const s = fresh(); s.outerwear[0].priceMinor = Number.MAX_SAFE_INTEGER;
    rejects(s, "scenario.outerwear");
  });
  await t.test("candidate-level currency cannot silently introduce a mixed-currency basket", () => {
    const s = fresh(); s.outerwear[0].currency = "EUR";
    rejects(s, "scenario.outerwear[0].currency");
  });
  await t.test("currency code must be explicit and uppercase", () => {
    for (const currency of ["pln", "", "PLN/EUR"]) {
      const s = fresh(); s.currency = currency; rejects(s, "scenario.currency");
    }
  });
  await t.test("owned items cannot acquire a purchase price", () => {
    const s = fresh(); s.outerwear[0].kind = "owned";
    rejects(s, "scenario.outerwear[0].priceMinor");
  });
});

test("duplicate identities and references cannot inflate wardrobe coverage", async (t) => {
  const cases = [
    ["top ID", (s) => { s.tops[1].id = s.tops[0].id; }, "scenario.tops"],
    ["outerwear ID", (s) => { s.outerwear[1].id = s.outerwear[0].id; }, "scenario.outerwear"],
    ["outfit ID", (s) => { s.outfits[1].id = s.outfits[0].id; }, "scenario.outfits"],
    ["requirement ID", (s) => { s.requirements[1].id = s.requirements[0].id; }, "scenario.requirements"],
    ["same top and outerwear under a second outfit ID", (s) => { s.outfits.push({ ...s.outfits[0], id: "duplicate-pair" }); }, "scenario.outfits"],
    ["repeated outfit inside a counted requirement", (s) => { s.requirements[0].outfitIds.push(s.requirements[0].outfitIds[0]); }, "scenario.requirements[0].outfitIds"],
    ["conflicting rating for one outfit", (s) => { s.ratings.push({ outfitId: s.ratings[0].outfitId, status: "unrated" }); }, "scenario.ratings"],
  ];
  for (const [name, mutate, path] of cases) {
    await t.test(name, () => { const s = fresh(); mutate(s); rejects(s, path); });
  }
});

test("every relationship points to a declared item", async (t) => {
  const cases = [
    ["unknown top", (s) => { s.outfits[0].topId = "missing"; }, "scenario.outfits[0].topId"],
    ["unknown outerwear", (s) => { s.outfits[0].outerwearId = "missing"; }, "scenario.outfits[0].outerwearId"],
    ["unknown qualifying outfit", (s) => { s.requirements[0].outfitIds[0] = "missing"; }, "scenario.requirements[0].outfitIds"],
    ["rating for unknown outfit", (s) => { s.ratings[0].outfitId = "missing"; }, "scenario.ratings[0].outfitId"],
  ];
  for (const [name, mutate, path] of cases) {
    await t.test(name, () => { const s = fresh(); mutate(s); rejects(s, path); });
  }
});

test("count thresholds and rating states remain explicit", async (t) => {
  await t.test("negative, fractional, and unsafe counts are rejected", () => {
    for (const count of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      const s = fresh(); s.requirements[0].minCount = count;
      rejects(s, "scenario.requirements[0].minCount");
    }
  });
  await t.test("zero counts are valid and do not require a purchase", () => {
    const s = fresh();
    s.requirements = [{ id: "optional", label: "Synthetic optional need", minCount: 0, outfitIds: [] }];
    const result = solveBasket(parseScenario(s));
    assert.equal(result.status, "solved");
    assert.deepEqual(result.basket.candidateIds, []);
  });
  const cases = [
    ["unsupported status", { status: "looks_good" }, "status"],
    ["error without a reason", { status: "render_error" }, "reason"],
    ["error with an empty reason", { status: "render_error", reason: "  " }, "reason"],
    ["error with a non-text reason", { status: "render_error", reason: 500 }, "reason"],
    ["reason must not turn a rendering failure into a rejection", { status: "would_not_wear", reason: "Synthetic bad render" }, "reason"],
  ];
  for (const [name, rating, path] of cases) {
    await t.test(name, () => {
      const s = fresh(); s.ratings[0] = { outfitId: s.ratings[0].outfitId, ...rating };
      rejects(s, `scenario.ratings[0].${path}`);
    });
  }
});

test("omitted ratings normalize to unknown without mutating or aliasing source input", () => {
  const s = fresh();
  s.ratings = [];
  const before = structuredClone(s);
  const parsed = parseScenario(s);
  assert.deepEqual(parsed.ratings, s.outfits.map(({ id }) => ({ outfitId: id, status: "unrated" })));
  assert.deepEqual(s, before);
  s.tops[0].label = "Changed only in the source";
  s.outerwear[0].priceMinor = 0;
  s.outfits[0].topId = "invalid-after-parsing";
  s.requirements[0].outfitIds.length = 0;
  assert.deepEqual(parsed.tops, before.tops);
  assert.deepEqual(parsed.outerwear, before.outerwear);
  assert.deepEqual(parsed.outfits, before.outfits);
  assert.deepEqual(parsed.requirements, before.requirements);
});

test("search and evidence limits fail before unbounded exhaustive work", () => {
  const s = fresh();
  s.outerwear = Array.from({ length: MAX_CANDIDATES + 1 }, (_, index) => ({
    id: `candidate-${index}`, label: "Synthetic candidate", kind: "candidate", priceMinor: 1,
  }));
  s.outfits = []; s.ratings = []; s.requirements = [];
  rejects(s, "scenario.outerwear");
  s.outerwear.pop();
  s.requirements = Array.from({ length: 256 }, (_, index) => ({
    id: `requirement-${index}`, label: "Synthetic empty requirement", minCount: 1, outfitIds: [],
  }));
  rejects(s, "scenario.requirements");
});

test("public solver and evaluator validate untrusted JavaScript inputs", () => {
  for (const run of [solveBasket, evaluateBaskets]) {
    assert.throws(() => run(null), ScenarioValidationError);
    const s = fresh(); s.requirements[0].outfitIds.push(s.requirements[0].outfitIds[0]);
    assert.throws(() => run(s), ScenarioValidationError);
  }
});
