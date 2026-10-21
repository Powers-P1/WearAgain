import type { ElementRef, RenderIdentity } from "../../src/core/rendering.js";
import { API_ORIGIN } from "./config.js";

export interface UnitBucket { limitUnits: number; spentUnits: number; reservedUnits: number; remainingUnits: number }
export interface LedgerSummary { utcDay: string; unitsPerRender: number; total: UnitBucket; daily: UnitBucket; sessionDaily: UnitBucket }
export interface LiveRenderResponse {
  mode: "live"; renderKey: string; status: "pending" | "succeeded" | "error";
  accounting: "reserved" | "charged" | "released"; reservedUnits: number; chargedUnits: number;
  reason: string | null; requiresReconciliation: boolean; assetId: string | null;
  imageUrl: string | null; statusUrl: string; imageRequiresDownload: boolean;
  budget: LedgerSummary; identity?: RenderIdentity; replayed?: boolean;
}
export interface RenderInput { element: ElementRef; avatarId: string; attempt: number; garment: File; garmentContainsNoFace: true }
export interface LiveClient {
  startSession(): Promise<LedgerSummary>;
  getLedger(): Promise<LedgerSummary>;
  submit(input: RenderInput): Promise<LiveRenderResponse>;
  poll(renderKey: string): Promise<LiveRenderResponse>;
  loadImage(record: LiveRenderResponse): Promise<{ url: string; assetId: string }>;
  releaseImage(url: string): void;
  dispose(): void;
}
const messages: Record<string, string> = {
  limit_exceeded: "The live unit allowance cannot cover another image. You can continue in the demo.",
  render_busy: "Another image is being processed. Please try the same request again shortly.",
  live_disabled: "Live rendering is unavailable. The demo remains available without a key.",
  invalid_session: "This live session has expired. Its pending units remain held; reload to start a new session.",
  session_required: "Enable live mode before requesting a render.",
  invalid_image: "Use a JPEG or PNG below 10 MB, with sides at least 384 and 512 pixels and no side over 4096.",
  result_download_unavailable: "The image could not be downloaded. This does not cancel its charge; retry the download.",
  result_expired: "The provider's image retention has ended. The previous charge remains recorded.",
  image_decode_failed: "The image could not be displayed. Its pair is unresolved and its charge is unchanged.",
  network_unknown: "The request did not finish. Its outcome is UNKNOWN; retry only the same request, never a new attempt.",
  disposed: "This view has closed. Pending tasks can still be reconciled by the server.",
};
export class ApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly retryAfterMs = 0, readonly scope?: string) {
    super(messages[code] ?? "The live service could not complete this request. Your existing decisions are unchanged.");
    this.name = "ApiError";
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("invalid_response", 502);
  return value as Record<string, unknown>;
}
function parseLedger(value: unknown): LedgerSummary {
  const data = object(value);
  if (typeof data.utcDay !== "string" || data.unitsPerRender !== 2) throw new ApiError("invalid_response", 502);
  for (const key of ["total", "daily", "sessionDaily"]) {
    const row = object(data[key]);
    if (["limitUnits", "spentUnits", "reservedUnits", "remainingUnits"].some(field => !Number.isSafeInteger(row[field]) || (row[field] as number) < 0)) throw new ApiError("invalid_response", 502);
  }
  return data as unknown as LedgerSummary;
}
function renderKey(key: string): string {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new ApiError("invalid_render_key", 400);
  return key;
}
function parseRecord(value: unknown): LiveRenderResponse {
  const data = object(value);
  if (data.mode !== "live" || typeof data.renderKey !== "string" || !["pending", "succeeded", "error"].includes(String(data.status))) throw new ApiError("invalid_response", 502);
  renderKey(data.renderKey);
  parseLedger(data.budget);
  return data as unknown as LiveRenderResponse;
}
async function bytes(response: Response, maximum: number): Promise<Uint8Array> {
  if (Number(response.headers.get("Content-Length")) > maximum) { await response.body?.cancel(); throw new ApiError("response_too_large", 502); }
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError("empty_response", 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new ApiError("response_too_large", 502); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

/** Only explicit user actions create sessions/submissions. No automatic POST retry. */
export function createLiveClient(apiOrigin = API_ORIGIN, transport: typeof fetch = (...args) => fetch(...args)): LiveClient {
  const origin = new URL(apiOrigin);
  if ((origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) || origin.pathname !== "/" || origin.username || origin.password || origin.search || origin.hash) throw new Error("Invalid public API origin");
  let token = "";
  let sessionRequest: Promise<void> | null = null;
  let disposed = false;
  const controllers = new Set<AbortController>();
  const urls = new Set<string>();
  async function request<T>(path: string, init: RequestInit, consume: (response: Response) => Promise<T>, authenticated = true): Promise<T> {
    if (disposed) throw new ApiError("disposed", 0);
    if (authenticated && !token) throw new ApiError("session_required", 401);
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 90_000);
    const headers = new Headers(init.headers);
    if (authenticated) headers.set("Authorization", `Bearer ${token}`);
    try {
      const response = await transport(new URL(path, origin), { ...init, headers, signal: controller.signal, credentials: "omit", cache: "no-store", redirect: "error" });
      if (!response.ok) {
        let body: Record<string, unknown> = {};
        try { body = object(JSON.parse(new TextDecoder().decode(await bytes(response, 65536)))); } catch { /* Status is sufficient when the body is not JSON. */ }
        throw new ApiError(typeof body.error === "string" ? body.error : "http_error", response.status, Math.max(0, Number(response.headers.get("Retry-After")) || 0) * 1000, typeof body.scope === "string" ? body.scope : undefined);
      }
      return await consume(response);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(disposed ? "disposed" : "network_unknown", 0);
    } finally { controller.abort(); clearTimeout(timer); controllers.delete(controller); }
  }
  const json = (response: Response): Promise<unknown> => bytes(response, 65536).then(data => JSON.parse(new TextDecoder().decode(data)) as unknown);
  const client: LiveClient = {
    async startSession() {
      if (!token) {
        if (!sessionRequest) sessionRequest = (async () => {
          try {
            const session = object(await request("/api/session", { method: "POST" }, json, false));
            if (typeof session.sessionToken !== "string" || session.unitsPerRender !== 2) throw new ApiError("invalid_response", 502);
            if (disposed) throw new ApiError("disposed", 0);
            token = session.sessionToken;
          } finally { sessionRequest = null; }
        })();
        await sessionRequest;
      }
      return client.getLedger();
    },
    async getLedger() { return parseLedger(await request("/api/ledger", {}, json)); },
    async submit(input) {
      if (input.garmentContainsNoFace !== true) throw new ApiError("consent_required", 400);
      const form = new FormData();
      form.set("metadata", JSON.stringify({ element: input.element, avatarId: input.avatarId, attempt: input.attempt, garmentContainsNoFace: true }));
      form.set("garment", input.garment, input.garment.type === "image/png" ? "garment.png" : "garment.jpg");
      return parseRecord(await request("/api/renders", { method: "POST", body: form }, json));
    },
    async poll(key) { return parseRecord(await request(`/api/renders/${renderKey(key)}`, {}, json)); },
    async loadImage(record) {
      if (record.status !== "succeeded" || record.assetId !== `youcam:${renderKey(record.renderKey)}`) throw new ApiError("image_not_ready", 409);
      // Derive a same-API path; never follow a response-controlled URL with the session token.
      const blob = await request(`/api/renders/${record.renderKey}/image`, {}, async response => {
        const type = response.headers.get("Content-Type")?.split(";")[0];
        if (!["image/png", "image/jpeg"].includes(type ?? "") || response.headers.get("X-WearAgain-Asset-Id") !== record.assetId) throw new ApiError("invalid_image_response", 502);
        const data = await bytes(response, 9_999_999);
        return new Blob([data as Uint8Array<ArrayBuffer>], { type: type! });
      });
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image(); image.src = url; await image.decode();
        if (disposed) throw new ApiError("disposed", 0);
        urls.add(url);
        return { url, assetId: record.assetId };
      } catch { URL.revokeObjectURL(url); throw new ApiError("image_decode_failed", 502); }
    },
    releaseImage(url) { if (urls.delete(url)) URL.revokeObjectURL(url); },
    dispose() {
      disposed = true; token = "";
      for (const controller of controllers) controller.abort();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
  return client;
}
