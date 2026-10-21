import { inspectImage } from "./images.js";
import {
  YOUCAM_API_ORIGIN, YOUCAM_DEFAULT_ASSET_HOSTS, YOUCAM_MAX_IMAGE_BYTES, YouCamError,
} from "./types.js";
import type { ImageContentType, RequestKind, YouCamClientOptions, YouCamImage, YouCamOperation, YouCamTaskResult } from "./types.js";

const FILE_PATH = "/s2s/v2.0/file/cloth";
const TASK_PATH = "/s2s/v2.0/task/cloth-v4";
const MAX_JSON_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 15_000;
type ObjectValue = Record<string, unknown>;

function object(value: unknown, operation: YouCamOperation): ObjectValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new YouCamError("protocol", operation);
  return value as ObjectValue;
}
function identifier(value: unknown, operation: YouCamOperation, task = false): string {
  const pattern = task ? /^[A-Za-z0-9_-]{1,1024}$/ : /^[A-Za-z0-9_+/=.-]{1,1024}$/;
  if (typeof value !== "string" || !pattern.test(value)) throw new YouCamError("protocol", operation);
  return value;
}
function mime(value: unknown): ImageContentType | null {
  if (value === "image/jpg" || value === "image/jpeg") return "image/jpeg";
  return value === "image/png" ? "image/png" : null;
}

/** One-shot transport. The Durable Object owns reservations, retries and reconciliation. */
export class YouCamClient {
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #beforeRequest: (kind: RequestKind) => Promise<void>;
  readonly #timeoutMs: number;
  readonly #assetHosts: ReadonlySet<string>;

  constructor(options: YouCamClientOptions) {
    if (typeof options.apiKey !== "string" || options.apiKey.length === 0 || /[\s\x00-\x1f\x7f]/.test(options.apiKey)) throw new YouCamError("input", "createTask");
    const timeout = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000) throw new YouCamError("input", "createTask");
    const hosts = options.allowedAssetHosts ?? YOUCAM_DEFAULT_ASSET_HOSTS;
    if (hosts.length === 0 || hosts.some(host => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host) || /(?:^|\.)(?:localhost|local|internal)$/i.test(host))) throw new YouCamError("input", "downloadResult");
    this.#apiKey = options.apiKey;
    // Workers throws "Illegal invocation" if global fetch is called with this = client.
    this.#fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.#beforeRequest = options.beforeRequest ?? (async () => {});
    this.#timeoutMs = timeout;
    this.#assetHosts = new Set(hosts.map(host => host.toLowerCase()));
  }

  #assetUrl(value: unknown, operation: YouCamOperation): string {
    if (typeof value !== "string" || value.length > 16_384) throw new YouCamError("protocol", operation);
    let url: URL;
    try { url = new URL(value); } catch { throw new YouCamError("protocol", operation); }
    if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443") || !this.#assetHosts.has(url.hostname)) throw new YouCamError("protocol", operation);
    return url.href;
  }

  async #perform<T>(kind: RequestKind, operation: YouCamOperation, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    // A refused shared rate/reservation gate performs no network operation.
    await this.#beforeRequest(kind);
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => { controller.abort(); reject(new YouCamError("timeout", operation)); }, this.#timeoutMs);
    });
    try {
      return await Promise.race([work(controller.signal), timeout]);
    } catch (error) {
      if (error instanceof YouCamError) throw error;
      throw new YouCamError("network", operation);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  }

  async #readBytes(response: Response, limit: number, operation: YouCamOperation): Promise<Uint8Array> {
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
      await response.body?.cancel();
      throw new YouCamError("protocol", operation);
    }
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        total += item.value.byteLength;
        if (total > limit) {
          await reader.cancel();
          throw new YouCamError("protocol", operation);
        }
        parts.push(item.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return bytes;
  }

  async #json(path: string, operation: YouCamOperation, payload?: ObjectValue): Promise<ObjectValue> {
    return this.#perform("api", operation, async signal => {
      const response = await this.#fetch(YOUCAM_API_ORIGIN + path, {
        method: payload === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${this.#apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        // Workers rejects redirect:"error"; "manual" returns 3xx, which is not 200/ok and fails closed.
        signal, redirect: "manual",
      });
      const bytes = await this.#readBytes(response, MAX_JSON_BYTES, operation);
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { throw new YouCamError(response.ok ? "protocol" : "http", operation, response.ok ? undefined : response.status); }
      const body = object(parsed, operation);
      if (response.status !== 200) {
        const free = operation === "createTask" && response.status === 400 && body.status === 400 && body.error_code === "InvalidParameters";
        throw new YouCamError("http", operation, response.status, free);
      }
      if (body.status !== 200) throw new YouCamError("protocol", operation);
      return object(body.data, operation);
    });
  }

  async uploadImage(image: YouCamImage): Promise<{ fileId: string }> {
    const operation = "uploadImage";
    if (!/^[A-Za-z0-9_.-]{1,100}\.(?:jpe?g|png)$/i.test(image.fileName)) throw new YouCamError("input", operation);
    inspectImage(image.bytes, image.contentType, operation);
    const bytes = new Uint8Array(image.bytes);
    // The probed File API uses image/jpg. Do not silently change its signed PUT MIME.
    const providerType = image.contentType === "image/jpeg" ? "image/jpg" : "image/png";
    const data = await this.#json(FILE_PATH, operation, { files: [{ content_type: providerType, file_name: image.fileName, file_size: bytes.byteLength }] });
    if (!Array.isArray(data.files) || data.files.length !== 1) throw new YouCamError("protocol", operation);
    const file = object(data.files[0], operation);
    if (file.file_name !== image.fileName || mime(file.content_type) !== image.contentType || !Array.isArray(file.requests) || file.requests.length !== 1) throw new YouCamError("protocol", operation);
    const fileId = identifier(file.file_id, operation);
    const request = object(file.requests[0], operation);
    if (request.method !== "PUT") throw new YouCamError("protocol", operation);
    const url = this.#assetUrl(request.url, operation);
    const rawHeaders = object(request.headers, operation);
    const headers = new Headers();
    for (const [key, value] of Object.entries(rawHeaders)) {
      // Fail closed on unexpected signed headers rather than forwarding credentials.
      const lower = key.toLowerCase();
      if ((lower !== "content-type" && lower !== "content-length") || typeof value !== "string" || headers.has(lower)) throw new YouCamError("protocol", operation);
      headers.set(lower, value);
    }
    if (headers.get("content-length") !== String(bytes.byteLength) || mime(headers.get("content-type")) !== image.contentType || headers.get("content-type") !== file.content_type) throw new YouCamError("protocol", operation);
    await this.#perform("upload", operation, async signal => {
      const response = await this.#fetch(url, { method: "PUT", headers, body: bytes.buffer, signal, redirect: "manual", credentials: "omit" });
      await response.body?.cancel();
      if (!response.ok) throw new YouCamError("http", operation, response.status);
    });
    return { fileId };
  }

  async createTask(input: { readonly srcFileId: string; readonly refFileId: string }): Promise<{ taskId: string }> {
    const operation = "createTask";
    const srcFileId = identifier(input.srcFileId, operation);
    const refFileId = identifier(input.refFileId, operation);
    const data = await this.#json(TASK_PATH, operation, { src_file_id: srcFileId, ref_file_id: refFileId, garment_category: "upper_body" });
    return { taskId: identifier(data.task_id, operation, true) };
  }

  async getTask(taskId: string): Promise<YouCamTaskResult> {
    const operation = "getTask";
    const id = identifier(taskId, operation, true);
    const data = await this.#json(`${TASK_PATH}/${encodeURIComponent(id)}`, operation);
    if (data.task_status === "running" && data.error === null && data.results === null) return { status: "pending" };
    if (data.task_status === "success" && data.error === null) {
      return { status: "success", resultUrl: this.#assetUrl(object(data.results, operation).url, operation) };
    }
    if (data.task_status === "error" && data.results === null) {
      const errorCode = typeof data.error === "string" && /^[A-Za-z0-9_]{1,100}$/.test(data.error) ? data.error : "unknown_provider_error";
      return { status: "error", errorCode, confirmedNoCharge: errorCode === "error_decode_image" };
    }
    throw new YouCamError("protocol", operation);
  }

  async downloadResult(url: string): Promise<{ bytes: Uint8Array; contentType: ImageContentType }> {
    const operation = "downloadResult";
    const safeUrl = this.#assetUrl(url, operation);
    return this.#perform("download", operation, async signal => {
      const response = await this.#fetch(safeUrl, { method: "GET", signal, redirect: "manual", credentials: "omit" });
      if (!response.ok) { await response.body?.cancel(); throw new YouCamError("http", operation, response.status); }
      const contentType = mime(response.headers.get("content-type")?.split(";")[0]?.trim());
      if (!contentType) { await response.body?.cancel(); throw new YouCamError("protocol", operation); }
      const bytes = await this.#readBytes(response, YOUCAM_MAX_IMAGE_BYTES - 1, operation);
      inspectImage(bytes, contentType, operation);
      return { bytes, contentType };
    });
  }
}
