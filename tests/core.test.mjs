import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { evaluateBaskets, parseScenario, solveBasket } from "../dist/core/index.js";

const fixtureDirectory = new URL("../fixtures/core/", import.meta.url);
const fixtures = readdirSync(fixtureDirectory)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => ({
    name,
    ...JSON.parse(readFileSync(new URL(name, fixtureDirectory), "utf8")),
  }));

const sorted = (values) => [...values].sort();
const key = (ids) => JSON.stringify(sorted(ids));
const ratingFor = (scenario, outfitId) =>
  scenario.ratings.find((rating) => rating.outfitId === outfitId) ?? {
    outfitId,
    status: "unrated",
  };
const unresolved = (rating) => ["unrated", "render_error"].includes(rating.status);

// Independent reference implementation: recursive powerset, direct relation
// lookups, and explicit counting. No production evaluator or certificate code.
function oracle(scenario) {
  const candidates = scenario.outerwear.filter((item) => item.kind === "candidate");
  const subsets = [[]];
  for (const candidate of candidates) {
    for (const previous of [...subsets]) subsets.push([...previous, candidate]);
  }
  const evaluations = subsets.map((items) => {
    const candidateIds = sorted(items.map((item) => item.id));
    const available = (outfit) =>
      outfit.outerwearId === null ||
      candidateIds.includes(outfit.outerwearId) ||
      scenario.outerwear.some((item) => item.id === outfit.outerwearId && item.kind === "owned");
    const requirements = scenario.requirements.map((requirement) => {
      const evidence = requirement.outfitIds.map((outfitId) => {
        const outfit = scenario.outfits.find((item) => item.id === outfitId);
        assert.ok(outfit, "oracle only accepts valid fixture references");
        return { outfitId, available: available(outfit), rating: ratingFor(scenario, outfitId) };
      });
      const acceptedOutfitIds = evidence
        .filter((entry) => entry.available && entry.rating.status === "would_wear")
        .map((entry) => entry.outfitId);
      const unresolvedOutfitIds = evidence
        .filter((entry) => entry.available && unresolved(entry.rating))
        .map((entry) => entry.outfitId);
      return {
        requirementId: requirement.id,
        minCount: requirement.minCount,
        acceptedOutfitIds,
        unresolvedOutfitIds,
        potentialCount: acceptedOutfitIds.length + unresolvedOutfitIds.length,
        satisfied: acceptedOutfitIds.length >= requirement.minCount,
        possible: acceptedOutfitIds.length + unresolvedOutfitIds.length >= requirement.minCount,
        evidence,
      };
    });
    return {
      basket: {
        candidateIds,
        costMinor: items.reduce((sum, item) => sum + item.priceMinor, 0),
        currency: scenario.currency,
      },
      requirements,
      feasible: requirements.every((requirement) => requirement.satisfied),
      possiblyFeasible: requirements.every((requirement) => requirement.possible),
    };
  });
  evaluations.sort((left, right) => {
    const price = left.basket.costMinor - right.basket.costMinor;
    if (price) return price;
    const count = left.basket.candidateIds.length - right.basket.candidateIds.length;
    if (count) return count;
    for (let index = 0; index < left.basket.candidateIds.length; index += 1) {
      if (left.basket.candidateIds[index] < right.basket.candidateIds[index]) return -1;
      if (left.basket.candidateIds[index] > right.basket.candidateIds[index]) return 1;
    }
    return 0;
  });
  return evaluations;
}

function checkRequirement(actual, expected) {
  assert.equal(actual.requirementId, expected.requirementId);
  assert.equal(actual.minCount, expected.minCount);
  assert.deepEqual(sorted(actual.acceptedOutfitIds), sorted(expected.acceptedOutfitIds));
  assert.deepEqual(sorted(actual.unresolvedOutfitIds), sorted(expected.unresolvedOutfitIds));
  assert.equal(actual.potentialCount, expected.potentialCount);
  assert.equal(actual.satisfied, expected.satisfied);
  assert.equal(actual.possible, expected.possible);
  assert.deepEqual(sorted(actual.evidence.map((entry) => entry.outfitId)), sorted(expected.evidence.map((entry) => entry.outfitId)));
  for (const entry of actual.evidence) {
    const reference = expected.evidence.find((item) => item.outfitId === entry.outfitId);
    assert.deepEqual(entry, reference, "certificate evidence must agree with the input, including render-error reasons");
  }
}

function checkFailedBasket(actual, expected) {
  assert.deepEqual(actual.basket, expected.basket);
  assert.equal(expected.feasible, false, "a claimed failing basket cannot already meet every need");
  assert.equal(actual.couldBecomeFeasible, expected.possiblyFeasible);
  assert.ok(actual.failedRequirements.length > 0, "a cheaper basket needs a concrete failed requirement");
  assert.equal(new Set(actual.failedRequirements.map((entry) => entry.requirementId)).size, actual.failedRequirements.length);
  for (const failure of actual.failedRequirements) {
    const reference = expected.requirements.find((item) => item.requirementId === failure.requirementId);
    assert.ok(reference);
    assert.equal(reference.satisfied, false);
    checkRequirement(failure, reference);
  }
}

function checkWitnesses(actual, expected) {
  assert.deepEqual(sorted(actual.map((entry) => key(entry.basket.candidateIds))), sorted(expected.map((entry) => key(entry.basket.candidateIds))), "witness list must include every required basket exactly once");
  for (const witness of actual) {
    const reference = expected.find((entry) => key(entry.basket.candidateIds) === key(witness.basket.candidateIds));
    assert.ok(reference);
    checkFailedBasket(witness, reference);
  }
}

function checkSolver(scenario) {
  const expected = oracle(scenario);
  const actual = solveBasket(parseScenario(scenario));
  assert.equal(actual.evaluatedBasketCount, expected.length);
  const unresolvedIds = scenario.outfits
    .filter((outfit) => unresolved(ratingFor(scenario, outfit.id)))
    .map((outfit) => outfit.id);
  assert.deepEqual(sorted(actual.unresolvedOutfitIds), sorted(unresolvedIds));
  const winnerIndex = expected.findIndex((entry) => entry.feasible);
  if (winnerIndex === -1) {
    assert.equal(actual.status, expected.some((entry) => entry.possiblyFeasible) ? "incomplete" : "infeasible");
    assert.equal(actual.basket, null);
    assert.equal(actual.certificate, null);
    checkWitnesses(actual.failedBaskets, expected);
    return actual;
  }

  assert.equal(actual.status, "solved");
  assert.deepEqual(actual.basket, expected[winnerIndex].basket);
  const cheaper = expected.filter((entry) => entry.basket.costMinor < actual.basket.costMinor);
  const preferredTies = expected.slice(0, winnerIndex).filter((entry) => entry.basket.costMinor === actual.basket.costMinor);
  assert.equal(actual.certificate.scope, "current_ratings");
  assert.equal(actual.certificate.ordering, "cost_then_item_count_then_ids");
  checkWitnesses(actual.certificate.cheaperBaskets, cheaper);
  checkWitnesses(actual.certificate.preferredTiedBaskets, preferredTies);
  assert.equal(actual.certificate.priceOptimality, cheaper.some((entry) => entry.possiblyFeasible) ? "provisional" : "proven");
  assert.equal(actual.certificate.selectionStability, expected.slice(0, winnerIndex).some((entry) => entry.possiblyFeasible) ? "provisional" : "stable");
  assert.deepEqual(sorted(actual.certificate.unresolvedOutfitIds), sorted(unresolvedIds));
  return actual;
}

for (const fixture of fixtures) {
  test(`synthetic fixture: ${fixture.name}`, () => {
    assert.equal(fixture.provenance, "synthetic_hand_authored_no_api_output");
    const actual = checkSolver(fixture.scenario);
    assert.equal(actual.status, fixture.expected.status);
    if (actual.status === "solved") {
      assert.deepEqual(actual.basket.candidateIds, fixture.expected.candidateIds);
      assert.equal(actual.basket.costMinor, fixture.expected.costMinor);
      assert.equal(actual.certificate.priceOptimality, fixture.expected.priceOptimality);
      assert.equal(actual.certificate.selectionStability, fixture.expected.selectionStability);
      assert.equal(actual.certificate.cheaperBaskets.length, fixture.expected.cheaperBasketCount);
    }
    const evaluations = evaluateBaskets(parseScenario(fixture.scenario));
    const expected = oracle(fixture.scenario);
    assert.deepEqual(evaluations.map((entry) => entry.basket), expected.map((entry) => entry.basket));
    for (let index = 0; index < evaluations.length; index += 1) {
      assert.equal(evaluations[index].feasible, expected[index].feasible);
      assert.equal(evaluations[index].possiblyFeasible, expected[index].possiblyFeasible);
      assert.equal(evaluations[index].requirements.length, expected[index].requirements.length);
      for (const requirement of evaluations[index].requirements) {
        checkRequirement(requirement, expected[index].requirements.find((entry) => entry.requirementId === requirement.requirementId));
      }
    }
  });
}

test("empty needs prefer no purchases, even when all renders are unresolved", () => {
  const scenario = structuredClone(fixtures.find((fixture) => fixture.name === "minimum-basket.json").scenario);
  scenario.requirements = [];
  scenario.ratings = [];
  const actual = checkSolver(scenario);
  assert.equal(actual.status, "solved");
  assert.deepEqual(actual.basket.candidateIds, []);
  assert.equal(actual.basket.costMinor, 0);
});

test("zero-priced candidates remain purchases and same-price empty basket receives a tie witness", () => {
  const scenario = structuredClone(fixtures.find((fixture) => fixture.name === "render-error-incomplete.json").scenario);
  scenario.outerwear[0].priceMinor = 0;
  scenario.ratings = [{ outfitId: "shirt-coat", status: "would_wear" }];
  const actual = checkSolver(scenario);
  assert.equal(actual.status, "solved");
  assert.deepEqual(actual.basket.candidateIds, ["coat"]);
  assert.equal(actual.certificate.cheaperBaskets.length, 0);
  assert.deepEqual(actual.certificate.preferredTiedBaskets.map((entry) => entry.basket.candidateIds), [[]]);
});

test("unresolved outfits do not weaken a proof when cheaper baskets cannot possibly meet the count", () => {
  const tops = [{ id: "shirt", label: "Synthetic shirt" }, { id: "hoodie", label: "Synthetic hoodie" }];
  const outerwear = [
    { id: "cheap", label: "Synthetic cheap coat", kind: "candidate", priceMinor: 4000 },
    { id: "known", label: "Synthetic proven coat", kind: "candidate", priceMinor: 9000 },
  ];
  const outfits = tops.flatMap((top) => outerwear.map((item) => ({ id: `${top.id}-${item.id}`, topId: top.id, outerwearId: item.id })));
  const actual = checkSolver({
    schemaVersion: 1, currency: "PLN", tops, outerwear, outfits,
    requirements: [{ id: "work", label: "Two distinct work outfits", minCount: 2, outfitIds: outfits.map((outfit) => outfit.id) }],
    ratings: [
      { outfitId: "shirt-cheap", status: "unrated" },
      { outfitId: "hoodie-cheap", status: "would_not_wear" },
      { outfitId: "shirt-known", status: "would_wear" },
      { outfitId: "hoodie-known", status: "would_wear" },
    ],
  });
  assert.equal(actual.status, "solved");
  assert.deepEqual(actual.unresolvedOutfitIds, ["shirt-cheap"]);
  assert.equal(actual.certificate.priceOptimality, "proven");
  assert.equal(actual.certificate.selectionStability, "stable");
});

test("input permutation cannot change the chosen basket or completeness of its proof", () => {
  const original = fixtures.find((fixture) => fixture.name === "deterministic-ties.json").scenario;
  const scenario = structuredClone(original);
  for (const field of ["tops", "outerwear", "outfits", "requirements", "ratings"]) scenario[field].reverse();
  for (const requirement of scenario.requirements) requirement.outfitIds.reverse();
  assert.deepEqual(checkSolver(scenario).basket, checkSolver(original).basket);
});

test("solver and evaluator accept frozen input without mutating it", () => {
  const scenario = parseScenario(structuredClone(fixtures[0].scenario));
  const before = JSON.stringify(scenario);
  const freeze = (value) => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  freeze(scenario);
  solveBasket(scenario);
  evaluateBaskets(scenario);
  assert.equal(JSON.stringify(scenario), before);
});

test("independent oracle verifies all 4096 assignments of wear, rejection, unknown, and error across six outfits", () => {
  const tops = [{ id: "top-a", label: "Synthetic A" }, { id: "top-b", label: "Synthetic B" }];
  const outerwear = [
    { id: "gamma", label: "Synthetic gamma", kind: "candidate", priceMinor: 700 },
    { id: "alpha", label: "Synthetic alpha", kind: "candidate", priceMinor: 300 },
    { id: "beta", label: "Synthetic beta", kind: "candidate", priceMinor: 500 },
  ];
  const outfits = tops.flatMap((top) => outerwear.map((item) => ({ id: `${top.id}-${item.id}`, topId: top.id, outerwearId: item.id })));
  const requirements = [
    { id: "work", label: "Two distinct work outfits", minCount: 2, outfitIds: outfits.map((outfit) => outfit.id) },
    { id: "rain", label: "One rain outfit", minCount: 1, outfitIds: ["top-a-gamma", "top-b-beta"] },
    { id: "evening", label: "One evening outfit", minCount: 1, outfitIds: ["top-b-alpha", "top-b-gamma"] },
  ];
  const statuses = ["would_wear", "would_not_wear", "unrated", "render_error"];
  for (let assignment = 0; assignment < 4 ** outfits.length; assignment += 1) {
    let digits = assignment;
    const ratings = [];
    for (const outfit of outfits) {
      const status = statuses[digits % 4];
      digits = Math.floor(digits / 4);
      if (status === "unrated" && assignment % 2 === 0) continue;
      ratings.push(status === "render_error" ? { outfitId: outfit.id, status, reason: "Synthetic render failure" } : { outfitId: outfit.id, status });
    }
    try {
      checkSolver({ schemaVersion: 1, currency: "PLN", tops, outerwear, outfits, requirements, ratings });
    } catch (error) {
      error.message = `Rating assignment ${assignment}: ${error.message}`;
      throw error;
    }
  }
});
