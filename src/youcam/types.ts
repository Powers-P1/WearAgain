export const YOUCAM_API_ORIGIN = "https://yce-api-01.makeupar.com";
export const YOUCAM_IMAGE_UNITS = 2;
export const YOUCAM_RATE_WINDOW_MS = 300_000;
export const YOUCAM_RATE_WINDOW_REQUESTS = 250;
export const YOUCAM_RATE_SECOND_REQUESTS = 5;
export const YOUCAM_RETENTION_MS = 86_400_000;
export const YOUCAM_MAX_IMAGE_BYTES = 10_000_000;
export const YOUCAM_DEFAULT_ASSET_HOSTS = ["yce-us.s3-accelerate.amazonaws.com"] as const;

export type ImageContentType = "image/jpeg" | "image/png";
export interface YouCamImage {
  readonly bytes: Uint8Array;
  readonly contentType: ImageContentType;
  readonly fileName: string;
}
export type RequestKind = "api" | "upload" | "download";
export type YouCamOperation = "uploadImage" | "createTask" | "getTask" | "downloadResult";
export type YouCamErrorKind = "input" | "network" | "timeout" | "http" | "protocol";
export interface YouCamClientOptions {
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  /** Shared ledger gate, called once before every HTTP request, including asset I/O. */
  readonly beforeRequest?: (kind: RequestKind) => Promise<void>;
  readonly requestTimeoutMs?: number;
  /** Exact hostnames only. Defaults to the asset host shown in Perfect Corp's guide. */
  readonly allowedAssetHosts?: readonly string[];
}
export type YouCamTaskResult =
  | { readonly status: "pending" }
  | { readonly status: "success"; readonly resultUrl: string }
  | { readonly status: "error"; readonly errorCode: string; readonly confirmedNoCharge: boolean };

/** Sanitised error: never includes upstream bodies, URLs, credentials or transport causes. */
export class YouCamError extends Error {
  readonly kind: YouCamErrorKind;
  readonly operation: YouCamOperation;
  readonly httpStatus: number | undefined;
  readonly confirmedNoCharge: boolean;
  constructor(kind: YouCamErrorKind, operation: YouCamOperation, httpStatus?: number, confirmedNoCharge = false) {
    super(`YouCam ${operation}: ${kind}${httpStatus === undefined ? "" : ` (${httpStatus})`}`);
    this.name = "YouCamError";
    this.kind = kind;
    this.operation = operation;
    this.httpStatus = httpStatus;
    this.confirmedNoCharge = confirmedNoCharge;
  }
}
