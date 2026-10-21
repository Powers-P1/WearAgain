export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export function json(value, status = 200, extra = {}) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
}

export function errorResponse(error) {
  if (error instanceof HttpError) return json({ ok: false, error: error.code }, error.status, error.code === 'render_busy' ? { 'Retry-After': '2' } : {});
  if (error?.name === 'LedgerError') {
    const status = { conflict: 409, limit_exceeded: 429, not_found: 404, invalid_input: 400, invalid_state: 409 }[error.code] ?? 500;
    return json({ ok: false, error: error.code, ...(error.code === 'limit_exceeded' ? { scope: error.details.scope, demoUrl: '/api/demo/renders' } : {}) }, status);
  }
  // Never return upstream bodies, signed URLs, keys, file names or thrown causes.
  return json({ ok: false, error: 'internal_error' }, 500);
}

export async function readBounded(stream, maximum) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new HttpError(413, 'image_or_request_too_large');
      }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}

export function exactObject(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) {
    throw new HttpError(400, 'invalid_request');
  }
  return value;
}

export function opaque(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new HttpError(400, 'invalid_identifier');
  return value;
}

export async function digest(bytes, algorithm = 'SHA-256') {
  return Array.from(new Uint8Array(await crypto.subtle.digest(algorithm, bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
