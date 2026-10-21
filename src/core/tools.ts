import type { OwnedOuterwear, OwnedTop, Scenario, SolveResult } from "./types.js";
import { parseScenario } from "./validation.js";
import { solveBasket } from "./solver.js";
import {
  parseRenderState,
  planElementRender,
  projectPairRatings,
} from "./rendering.js";
import type { ElementRef, ItemRender, RenderState } from "./rendering.js";

/** A missing observation is never a false value, zero price, or fulfilled promise. */
export type ToolData<T> =
  | { readonly status: "known"; readonly value: T }
  | { readonly status: "UNKNOWN"; readonly reason: string };

export type DeliveryOption =
  | { readonly available: false }
  | {
      readonly available: true;
      readonly arrivalDate: ToolData<string>;
      readonly feeMinor: ToolData<number>;
    };

export type PickupOption =
  | { readonly available: false }
  | {
      readonly available: true;
      readonly storeId: string;
      readonly storeLabel: string;
      readonly date: ToolData<string>;
      readonly feeMinor: ToolData<number>;
    };

export interface CatalogueProduct {
  /** The agent cites this catalogue ID, never a fabricated URL or price. */
  readonly id: string;
  /** null means this product has not been admitted into the basket scenario. */
  readonly candidateId: string | null;
  readonly label: string;
  readonly priceMinor: ToolData<number>;
  readonly productUrl: ToolData<string>;
  readonly inStock: ToolData<boolean>;
  readonly delivery: ToolData<DeliveryOption>;
  readonly pickup: ToolData<PickupOption>;
}

export interface CatalogueSnapshot {
  readonly shopId: string;
  readonly currency: string;
  readonly source: string;
  readonly capturedAt: string;
  readonly products: readonly CatalogueProduct[];
}

export interface CityReference {
  readonly id: string;
  readonly label: string;
  readonly countryCode: string;
}

export interface WeatherSnapshot {
  readonly cityId: string;
  readonly date: string;
  readonly source: string;
  readonly capturedAt: string;
  readonly temperatureC: ToolData<number>;
  /** Probability in [0, 1], not a percentage. */
  readonly rainProbability: ToolData<number>;
}

/** Supplied by the application, never by an agent tool-call payload. */
export interface AgentToolContext {
  readonly scenario: Scenario;
  readonly renderState: RenderState;
  readonly catalogue: CatalogueSnapshot;
  readonly cities: readonly CityReference[];
  readonly weather: readonly WeatherSnapshot[];
  readonly unitsPerImage: number;
}

export type AgentToolRequest =
  | { readonly name: "get_wardrobe"; readonly input: Readonly<Record<string, never>> }
  | {
      readonly name: "search_catalogue";
      readonly input: {
        readonly shopId: string;
        readonly query?: string;
        readonly productIds?: readonly string[];
      };
    }
  | { readonly name: "lookup_city"; readonly input: { readonly query: string } }
  | { readonly name: "get_weather"; readonly input: { readonly cityId: string; readonly date: string } }
  | { readonly name: "plan_render"; readonly input: { readonly element: ElementRef } }
  | { readonly name: "solve_basket"; readonly input: Readonly<Record<string, never>> };

export type AgentToolResult =
  | {
      readonly name: "get_wardrobe";
      readonly result: {
        readonly tops: readonly OwnedTop[];
        readonly outerwear: readonly OwnedOuterwear[];
        /** Opaque asset IDs only. Loading image bytes belongs to the Worker adapter. */
        readonly renders: readonly ItemRender[];
      };
    }
  | { readonly name: "search_catalogue"; readonly result: CatalogueSnapshot }
  | { readonly name: "lookup_city"; readonly result: readonly CityReference[] }
  | { readonly name: "get_weather"; readonly result: ToolData<WeatherSnapshot> }
  | {
      readonly name: "plan_render";
      readonly result: ReturnType<typeof planElementRender> & { readonly render: ItemRender | null };
    }
  | {
      readonly name: "solve_basket";
      readonly result: {
        readonly solver: SolveResult;
        readonly productIds: readonly string[];
        readonly verificationScope: "requirements_and_current_user_ratings";
        /** Stock, delivery, pickup and order fees are outside the PR1 solver proof. */
        readonly commerceVerification: "not_performed";
      };
    };

export class ToolContractError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ToolContractError";
  }
}

function fail(path: string, message: string): never {
  throw new ToolContractError(path, message);
}

function object(value: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)) {
    fail(path, "expected a plain object");
  }
  const result = value as Record<string, unknown>;
  for (const field of Object.keys(result)) {
    if (!allowed.includes(field)) fail(`${path}.${field}`, "unexpected field");
  }
  return result;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || value.trim() !== value) {
    fail(path, "expected nonempty text without surrounding whitespace (max 512 characters)");
  }
  return value;
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length > 256) fail(path, "expected an array of at most 256 entries");
  return value;
}

function unique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) fail(path, "duplicate identifier");
}

function amount(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail(path, "expected a nonnegative safe integer");
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "expected a boolean");
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "expected a finite number");
  return value;
}

function date(value: unknown, path: string): string {
  const result = text(value, path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)
      || !Number.isFinite(Date.parse(result))
      || new Date(result).toISOString().slice(0, 10) !== result) fail(path, "expected a valid YYYY-MM-DD date");
  return result;
}

function timestamp(value: unknown, path: string): string {
  const result = text(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(result) || !Number.isFinite(Date.parse(result))) {
    fail(path, "expected an ISO UTC timestamp");
  }
  if (new Date(result).toISOString().replace(".000Z", "Z") !== result.replace(".000Z", "Z")) {
    fail(path, "invalid timestamp");
  }
  return result;
}

function data<T>(value: unknown, path: string, read: (value: unknown, path: string) => T): ToolData<T> {
  const input = object(value, path, ["status", "value", "reason"]);
  if (input.status === "known") {
    if ("reason" in input) fail(`${path}.reason`, "known data cannot carry an unknown reason");
    return { status: "known", value: read(input.value, `${path}.value`) };
  }
  if (input.status === "UNKNOWN") {
    if ("value" in input) fail(`${path}.value`, "UNKNOWN must not contain a fabricated value");
    return { status: "UNKNOWN", reason: text(input.reason, `${path}.reason`) };
  }
  return fail(`${path}.status`, "expected known or UNKNOWN");
}

function delivery(value: unknown, path: string): DeliveryOption {
  const input = object(value, path, ["available", "arrivalDate", "feeMinor"]);
  if (!bool(input.available, `${path}.available`)) {
    object(value, path, ["available"]);
    return { available: false };
  }
  return {
    available: true,
    arrivalDate: data(input.arrivalDate, `${path}.arrivalDate`, date),
    feeMinor: data(input.feeMinor, `${path}.feeMinor`, amount),
  };
}

function pickup(value: unknown, path: string): PickupOption {
  const input = object(value, path, ["available", "storeId", "storeLabel", "date", "feeMinor"]);
  if (!bool(input.available, `${path}.available`)) {
    object(value, path, ["available"]);
    return { available: false };
  }
  return {
    available: true,
    storeId: text(input.storeId, `${path}.storeId`),
    storeLabel: text(input.storeLabel, `${path}.storeLabel`),
    date: data(input.date, `${path}.date`, date),
    feeMinor: data(input.feeMinor, `${path}.feeMinor`, amount),
  };
}

function product(value: unknown, path: string): CatalogueProduct {
  const input = object(value, path, ["id", "candidateId", "label", "priceMinor", "productUrl", "inStock", "delivery", "pickup"]);
  return {
    id: text(input.id, `${path}.id`),
    candidateId: input.candidateId === null ? null : text(input.candidateId, `${path}.candidateId`),
    label: text(input.label, `${path}.label`),
    priceMinor: data(input.priceMinor, `${path}.priceMinor`, amount),
    productUrl: data(input.productUrl, `${path}.productUrl`, (value, path) => {
      const url = text(value, path);
      if (!/^https:\/\/[^/\s?#]+(?:[/?#][^\s]*)?$/.test(url)) fail(path, "expected an HTTPS product URL");
      return url;
    }),
    inStock: data(input.inStock, `${path}.inStock`, bool),
    delivery: data(input.delivery, `${path}.delivery`, delivery),
    pickup: data(input.pickup, `${path}.pickup`, pickup),
  };
}

/** Validate trusted adapter snapshots too: unknown observations stay unknown. */
export function parseAgentToolContext(value: unknown): AgentToolContext {
  const input = object(value, "context", ["scenario", "renderState", "catalogue", "cities", "weather", "unitsPerImage"]);
  const scenario = parseScenario(input.scenario);
  const renderState = parseRenderState(input.renderState, scenario);
  const rawCatalogue = object(input.catalogue, "context.catalogue", ["shopId", "currency", "source", "capturedAt", "products"]);
  const catalogue: CatalogueSnapshot = {
    shopId: text(rawCatalogue.shopId, "context.catalogue.shopId"),
    currency: text(rawCatalogue.currency, "context.catalogue.currency"),
    source: text(rawCatalogue.source, "context.catalogue.source"),
    capturedAt: timestamp(rawCatalogue.capturedAt, "context.catalogue.capturedAt"),
    products: list(rawCatalogue.products, "context.catalogue.products").map((value, index) => product(value, `context.catalogue.products[${index}]`)),
  };
  if (catalogue.currency !== scenario.currency) fail("context.catalogue.currency", "must match the scenario currency");
  unique(catalogue.products.map((entry) => entry.id), "context.catalogue.products");
  const linkedProducts = catalogue.products.filter((entry) => entry.candidateId !== null);
  unique(linkedProducts.map((entry) => entry.candidateId!), "context.catalogue.products");
  const candidates = scenario.outerwear.filter((entry) => entry.kind === "candidate");
  for (const entry of linkedProducts) {
    const candidate = candidates.find((item) => item.id === entry.candidateId);
    if (!candidate) fail("context.catalogue.products", `unknown purchase candidate ${entry.candidateId}`);
    if (entry.priceMinor.status !== "known" || entry.priceMinor.value !== candidate.priceMinor) {
      fail("context.catalogue.products", "an admitted candidate needs the same known price as the solver snapshot");
    }
  }
  for (const candidate of candidates) {
    if (!linkedProducts.some((entry) => entry.candidateId === candidate.id)) {
      fail("context.catalogue.products", `candidate ${candidate.id} is not mapped into the selected shop`);
    }
  }
  const cities = list(input.cities, "context.cities").map((value, index): CityReference => {
    const path = `context.cities[${index}]`;
    const city = object(value, path, ["id", "label", "countryCode"]);
    const countryCode = text(city.countryCode, `${path}.countryCode`);
    if (!/^[A-Z]{2}$/.test(countryCode)) fail(`${path}.countryCode`, "expected a two-letter uppercase code");
    return { id: text(city.id, `${path}.id`), label: text(city.label, `${path}.label`), countryCode };
  });
  unique(cities.map((entry) => entry.id), "context.cities");
  const weather = list(input.weather, "context.weather").map((value, index): WeatherSnapshot => {
    const path = `context.weather[${index}]`;
    const entry = object(value, path, ["cityId", "date", "source", "capturedAt", "temperatureC", "rainProbability"]);
    const cityId = text(entry.cityId, `${path}.cityId`);
    if (!cities.some((city) => city.id === cityId)) fail(`${path}.cityId`, "unknown city ID");
    return {
      cityId, date: date(entry.date, `${path}.date`), source: text(entry.source, `${path}.source`),
      capturedAt: timestamp(entry.capturedAt, `${path}.capturedAt`),
      temperatureC: data(entry.temperatureC, `${path}.temperatureC`, finite),
      rainProbability: data(entry.rainProbability, `${path}.rainProbability`, (value, path) => {
        const probability = finite(value, path);
        if (probability < 0 || probability > 1) fail(path, "expected probability between 0 and 1");
        return probability;
      }),
    };
  });
  unique(weather.map((entry) => JSON.stringify([entry.cityId, entry.date])), "context.weather");
  const unitsPerImage = amount(input.unitsPerImage, "context.unitsPerImage");
  if (unitsPerImage === 0) fail("context.unitsPerImage", "must be positive");
  return { scenario, renderState, catalogue, cities, weather, unitsPerImage };
}

/** Only this allowlist is available to the agent; there is no rating-write tool. */
export function parseAgentToolRequest(value: unknown): AgentToolRequest {
  const request = object(value, "request", ["name", "input"]);
  const name = text(request.name, "request.name");
  switch (name) {
    case "get_wardrobe":
    case "solve_basket":
      object(request.input, "request.input", []);
      return { name, input: {} };
    case "search_catalogue": {
      const input = object(request.input, "request.input", ["shopId", "query", "productIds"]);
      const productIds = "productIds" in input
        ? list(input.productIds, "request.input.productIds").map((value, index) => text(value, `request.input.productIds[${index}]`))
        : undefined;
      if (productIds) unique(productIds, "request.input.productIds");
      return { name, input: {
        shopId: text(input.shopId, "request.input.shopId"),
        ...("query" in input ? { query: text(input.query, "request.input.query") } : {}),
        ...(productIds === undefined ? {} : { productIds }),
      } };
    }
    case "lookup_city": {
      const input = object(request.input, "request.input", ["query"]);
      return { name, input: { query: text(input.query, "request.input.query") } };
    }
    case "get_weather": {
      const input = object(request.input, "request.input", ["cityId", "date"]);
      return { name, input: { cityId: text(input.cityId, "request.input.cityId"), date: date(input.date, "request.input.date") } };
    }
    case "plan_render": {
      const input = object(request.input, "request.input", ["element"]);
      const element = object(input.element, "request.input.element", ["kind", "id"]);
      if (element.kind !== "top" && element.kind !== "outerwear") fail("request.input.element.kind", "expected top or outerwear");
      return { name, input: { element: { kind: element.kind, id: text(element.id, "request.input.element.id") } } };
    }
    default:
      return fail("request.name", "unknown or forbidden tool");
  }
}

/**
 * Pure read/proposal layer. The future Worker authenticates sessions, obtains this
 * trusted context, and atomically reserves units before executing a render plan.
 * No request field is a capability to mutate ratings or spend units.
 */
export function executeAgentTool(value: unknown, trustedContext: AgentToolContext): AgentToolResult {
  const request = parseAgentToolRequest(value);
  const context = parseAgentToolContext(trustedContext);
  switch (request.name) {
    case "get_wardrobe": {
      const outerwear = context.scenario.outerwear.filter((item) => item.kind === "owned");
      const ownedIds = new Set(outerwear.map((item) => item.id));
      return { name: request.name, result: {
        tops: context.scenario.tops,
        outerwear,
        renders: context.renderState.renders.filter((render) => render.element.kind === "top" || ownedIds.has(render.element.id)),
      } };
    }
    case "search_catalogue": {
      if (request.input.shopId !== context.catalogue.shopId) fail("request.input.shopId", "shop is outside the trusted catalogue snapshot");
      for (const id of request.input.productIds ?? []) {
        if (!context.catalogue.products.some((product) => product.id === id)) fail("request.input.productIds", `unknown product ID ${id}`);
      }
      const query = request.input.query?.toLowerCase();
      const ids = request.input.productIds;
      const products = context.catalogue.products.filter((product) =>
        (query === undefined || product.label.toLowerCase().includes(query)) && (ids === undefined || ids.includes(product.id)));
      return { name: request.name, result: { ...context.catalogue, products } };
    }
    case "lookup_city": {
      const query = request.input.query.toLowerCase();
      return { name: request.name, result: context.cities.filter((city) => city.label.toLowerCase().includes(query)) };
    }
    case "get_weather": {
      if (!context.cities.some((city) => city.id === request.input.cityId)) fail("request.input.cityId", "unknown city ID; use lookup_city first");
      const snapshot = context.weather.find((entry) => entry.cityId === request.input.cityId && entry.date === request.input.date);
      return { name: request.name, result: snapshot
        ? { status: "known", value: snapshot }
        : { status: "UNKNOWN", reason: "No weather snapshot for this city and date" } };
    }
    case "plan_render": {
      const render = context.renderState.renders.find((entry) =>
        entry.element.kind === request.input.element.kind && entry.element.id === request.input.element.id) ?? null;
      return { name: request.name, result: {
        ...planElementRender(context.scenario, context.renderState, request.input.element, context.unitsPerImage), render,
      } };
    }
    case "solve_basket": {
      const solver = solveBasket(projectPairRatings(context.scenario, context.renderState));
      const candidateIds = solver.basket?.candidateIds ?? [];
      const productIds = candidateIds.map((id) => context.catalogue.products.find((product) => product.candidateId === id)!.id);
      return { name: request.name, result: {
        solver, productIds,
        verificationScope: "requirements_and_current_user_ratings",
        commerceVerification: "not_performed",
      } };
    }
  }
}
