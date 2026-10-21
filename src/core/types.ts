/** Version 1 contains no API-specific image or task data. Money uses minor units. */
export interface OwnedTop {
  readonly id: string;
  readonly label: string;
}

export interface OwnedOuterwear {
  readonly id: string;
  readonly label: string;
  readonly kind: "owned";
}

export interface PurchaseCandidate {
  readonly id: string;
  readonly label: string;
  readonly kind: "candidate";
  readonly priceMinor: number;
}

export type Outerwear = OwnedOuterwear | PurchaseCandidate;

export interface Outfit {
  readonly id: string;
  readonly topId: string;
  /** null is a top-only baseline, available without buying outerwear. */
  readonly outerwearId: string | null;
}

export interface Requirement {
  readonly id: string;
  readonly label: string;
  readonly minCount: number;
  /** A set of distinct outfits; one outfit may satisfy multiple requirements. */
  readonly outfitIds: readonly string[];
}

export type OutfitRating =
  | { readonly outfitId: string; readonly status: "would_wear" }
  | { readonly outfitId: string; readonly status: "would_not_wear" }
  | { readonly outfitId: string; readonly status: "unrated" }
  | {
      readonly outfitId: string;
      readonly status: "render_error";
      readonly reason: string;
    };

export interface Scenario {
  readonly schemaVersion: 1;
  /** One uppercase three-letter currency code; no conversion is performed. */
  readonly currency: string;
  readonly tops: readonly OwnedTop[];
  readonly outerwear: readonly Outerwear[];
  readonly outfits: readonly Outfit[];
  readonly requirements: readonly Requirement[];
  /** Missing entries normalize to unrated. Duplicate entries are invalid. */
  readonly ratings: readonly OutfitRating[];
}

export interface Basket {
  /** Sorted candidate IDs only. Owned items are always available and cost zero. */
  readonly candidateIds: readonly string[];
  readonly costMinor: number;
  readonly currency: string;
}

export interface OutfitEvidence {
  readonly outfitId: string;
  readonly available: boolean;
  readonly rating: OutfitRating;
}

export interface RequirementEvaluation {
  readonly requirementId: string;
  readonly minCount: number;
  readonly acceptedOutfitIds: readonly string[];
  /** Available unrated/error outfits, not confirmed dislikes. */
  readonly unresolvedOutfitIds: readonly string[];
  readonly potentialCount: number;
  readonly satisfied: boolean;
  readonly possible: boolean;
  readonly evidence: readonly OutfitEvidence[];
}

export interface BasketEvaluation {
  readonly basket: Basket;
  readonly feasible: boolean;
  /** Upper bound if every available unresolved outfit were accepted. */
  readonly possiblyFeasible: boolean;
  readonly requirements: readonly RequirementEvaluation[];
}

export interface FailedBasket {
  readonly basket: Basket;
  readonly failedRequirements: readonly RequirementEvaluation[];
  readonly couldBecomeFeasible: boolean;
}

export interface MinimalityCertificate {
  readonly scope: "current_ratings";
  readonly ordering: "cost_then_item_count_then_ids";
  /** Every strictly cheaper basket, including empty when its cost is lower. */
  readonly cheaperBaskets: readonly FailedBasket[];
  /** True ties are resolved deterministically; unknowns may alter that choice. */
  readonly preferredTiedBaskets: readonly FailedBasket[];
  readonly priceOptimality: "proven" | "provisional";
  readonly selectionStability: "stable" | "provisional";
  readonly unresolvedOutfitIds: readonly string[];
}

interface ResultSummary {
  readonly evaluatedBasketCount: number;
  readonly unresolvedOutfitIds: readonly string[];
}

export interface SolvedBasketResult extends ResultSummary {
  readonly status: "solved";
  readonly basket: Basket;
  readonly certificate: MinimalityCertificate;
}

export interface UnsolvedBasketResult extends ResultSummary {
  /** incomplete: unresolved evidence could permit a solution; infeasible: cannot. */
  readonly status: "incomplete" | "infeasible";
  readonly basket: null;
  readonly certificate: null;
  readonly failedBaskets: readonly FailedBasket[];
}

export type SolveResult = SolvedBasketResult | UnsolvedBasketResult;
