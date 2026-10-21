import type {
  Basket,
  BasketEvaluation,
  FailedBasket,
  OutfitEvidence,
  OutfitRating,
  RequirementEvaluation,
  Scenario,
  SolveResult,
} from "./types.js";
import { parseScenario } from "./validation.js";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Stable across locales and input order: price, new item count, ordinal IDs. */
export function compareBaskets(left: Basket, right: Basket): number {
  if (left.costMinor !== right.costMinor) return left.costMinor < right.costMinor ? -1 : 1;
  if (left.candidateIds.length !== right.candidateIds.length) return left.candidateIds.length - right.candidateIds.length;
  for (let index = 0; index < left.candidateIds.length; index += 1) {
    const comparison = compareIds(left.candidateIds[index]!, right.candidateIds[index]!);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function unresolved(rating: OutfitRating): boolean {
  return rating.status === "unrated" || rating.status === "render_error";
}

function evaluateValidatedScenario(scenario: Scenario): BasketEvaluation[] {
  const candidates = scenario.outerwear
    .filter((item) => item.kind === "candidate")
    .sort((left, right) => compareIds(left.id, right.id));
  const owned = new Set(scenario.outerwear.filter((item) => item.kind === "owned").map((item) => item.id));
  const outfits = new Map(scenario.outfits.map((outfit) => [outfit.id, outfit]));
  const ratings = new Map(scenario.ratings.map((rating) => [rating.outfitId, rating]));
  const requirements = [...scenario.requirements].sort((left, right) => compareIds(left.id, right.id));
  const evaluations: BasketEvaluation[] = [];

  for (let mask = 0; mask < 2 ** candidates.length; mask += 1) {
    const selected = candidates.filter((_, index) => (mask & (1 << index)) !== 0);
    const selectedIds = new Set(selected.map((item) => item.id));
    const basket: Basket = {
      candidateIds: selected.map((item) => item.id),
      costMinor: selected.reduce((sum, item) => sum + item.priceMinor, 0),
      currency: scenario.currency,
    };
    const results: RequirementEvaluation[] = requirements.map((requirement) => {
      const evidence: OutfitEvidence[] = [...requirement.outfitIds].sort(compareIds).map((outfitId) => {
        // parseScenario guarantees these references and normalizes all ratings.
        const outfit = outfits.get(outfitId)!;
        return {
          outfitId,
          available: outfit.outerwearId === null || owned.has(outfit.outerwearId) || selectedIds.has(outfit.outerwearId),
          rating: ratings.get(outfitId)!,
        };
      });
      const acceptedOutfitIds = evidence
        .filter((item) => item.available && item.rating.status === "would_wear")
        .map((item) => item.outfitId);
      const unresolvedOutfitIds = evidence
        .filter((item) => item.available && unresolved(item.rating))
        .map((item) => item.outfitId);
      const potentialCount = acceptedOutfitIds.length + unresolvedOutfitIds.length;
      return {
        requirementId: requirement.id,
        minCount: requirement.minCount,
        acceptedOutfitIds,
        unresolvedOutfitIds,
        potentialCount,
        satisfied: acceptedOutfitIds.length >= requirement.minCount,
        possible: potentialCount >= requirement.minCount,
        evidence,
      };
    });
    evaluations.push({
      basket,
      feasible: results.every((result) => result.satisfied),
      possiblyFeasible: results.every((result) => result.possible),
      requirements: results,
    });
  }
  return evaluations.sort((left, right) => compareBaskets(left.basket, right.basket));
}

/** All subsets, including empty, with current and optimistic requirement coverage. */
export function evaluateBaskets(scenario: Scenario): readonly BasketEvaluation[] {
  return evaluateValidatedScenario(parseScenario(scenario));
}

function failedBasket(evaluation: BasketEvaluation): FailedBasket {
  if (evaluation.feasible) throw new Error("A feasible basket cannot be used as failure evidence");
  return {
    basket: evaluation.basket,
    failedRequirements: evaluation.requirements.filter((requirement) => !requirement.satisfied),
    couldBecomeFeasible: evaluation.possiblyFeasible,
  };
}

/**
 * Minimize new spending over the stated catalogue and requirements only.
 * Unrated/error outfits never satisfy a requirement; they stay unresolved in
 * evidence and can make optimality provisional. No taste or API output is inferred.
 */
export function solveBasket(input: Scenario): SolveResult {
  const scenario = parseScenario(input);
  const evaluations = evaluateValidatedScenario(scenario);
  const unresolvedOutfitIds = scenario.ratings.filter(unresolved).map((rating) => rating.outfitId).sort(compareIds);
  const summary = { evaluatedBasketCount: evaluations.length, unresolvedOutfitIds };
  const winner = evaluations.find((evaluation) => evaluation.feasible);

  if (winner === undefined) {
    return {
      ...summary,
      status: evaluations.some((evaluation) => evaluation.possiblyFeasible) ? "incomplete" : "infeasible",
      basket: null,
      certificate: null,
      failedBaskets: evaluations.map(failedBasket),
    };
  }

  const cheaperBaskets = evaluations
    .filter((evaluation) => evaluation.basket.costMinor < winner.basket.costMinor)
    .map(failedBasket);
  const preferredTiedBaskets = evaluations
    .filter((evaluation) => evaluation.basket.costMinor === winner.basket.costMinor && compareBaskets(evaluation.basket, winner.basket) < 0)
    .map(failedBasket);
  const lowerPricePossible = cheaperBaskets.some((basket) => basket.couldBecomeFeasible);
  const preferredTiePossible = preferredTiedBaskets.some((basket) => basket.couldBecomeFeasible);

  return {
    ...summary,
    status: "solved",
    basket: winner.basket,
    certificate: {
      scope: "current_ratings",
      ordering: "cost_then_item_count_then_ids",
      cheaperBaskets,
      preferredTiedBaskets,
      priceOptimality: lowerPricePossible ? "provisional" : "proven",
      selectionStability: lowerPricePossible || preferredTiePossible ? "provisional" : "stable",
      unresolvedOutfitIds,
    },
  };
}
