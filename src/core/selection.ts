import type { Scenario, SolveResult } from "./types.js";
import { compareBaskets, evaluateBaskets, solveBasket } from "./solver.js";
import { compareRenderUsage, parseRenderState, planPairRender, projectPairRatings } from "./rendering.js";
import type { PairRenderPlan, RenderState } from "./rendering.js";
import { parseScenario } from "./validation.js";

export interface PairSelection {
  readonly status: "next" | "settled" | "blocked";
  readonly result: SolveResult;
  readonly next: PairRenderPlan | null;
  readonly relevantOutfitIds: readonly string[];
  readonly blockedOutfitIds: readonly string[];
  readonly baseline: { readonly pairs: number; readonly images: number; readonly units: number };
}

/**
 * Conservative decision relevance: unresolved members of unsatisfied requirements
 * in still-possible baskets that outrank the current feasible winner. Multiple
 * unknown approvals may be needed together; a one-rating-flip test is unsound.
 * Ordering is deterministic, not a claim of globally minimum questions or units.
 */
export function selectNextPair(inputScenario: Scenario, inputState: RenderState, unitsPerImage: number): PairSelection {
  const scenario = parseScenario(inputScenario);
  const state = parseRenderState(inputState, scenario);
  const projected = projectPairRatings(scenario, state);
  const result = solveBasket(projected);
  const usage = compareRenderUsage(scenario, [], unitsPerImage);
  const baseline = { pairs: usage.pairCount, images: usage.baselineImages, units: usage.baselineUnits };
  if (result.status === "infeasible" || (result.status === "solved" && result.certificate.selectionStability === "stable")) {
    return { status: "settled", result, next: null, relevantOutfitIds: [], blockedOutfitIds: [], baseline };
  }
  const contenders = evaluateBaskets(projected).filter((entry) => entry.possiblyFeasible && !entry.feasible
    && (result.status !== "solved" || compareBaskets(entry.basket, result.basket) < 0));
  const relevant = new Set<string>();
  const blocked = new Set<string>();
  const memo = new Map<string, PairRenderPlan>();
  let next: PairRenderPlan | null = null;
  for (const contender of contenders) {
    const ids = new Set(contender.requirements.filter((requirement) => !requirement.satisfied).flatMap((requirement) => requirement.unresolvedOutfitIds));
    const plans: PairRenderPlan[] = [];
    for (const outfitId of [...ids].sort()) {
      relevant.add(outfitId);
      const plan = memo.get(outfitId) ?? planPairRender(scenario, state, outfitId, unitsPerImage);
      memo.set(outfitId, plan);
      if (plan.status === "blocked") blocked.add(outfitId);
      else plans.push(plan);
    }
    plans.sort((left, right) => left.unitsRequired - right.unitsRequired || (left.outfitId < right.outfitId ? -1 : left.outfitId > right.outfitId ? 1 : 0));
    if (next === null && plans.length) next = plans[0]!;
  }
  return {
    status: next === null ? "blocked" : "next", result, next,
    relevantOutfitIds: [...relevant].sort(), blockedOutfitIds: [...blocked].sort(), baseline,
  };
}
