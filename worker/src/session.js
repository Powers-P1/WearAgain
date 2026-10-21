import { HttpError } from './http.js';

const encoder = new TextEncoder();
const SESSION_LIFETIME_MS = 6 * 60 * 60 * 1000;
function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new HttpError(401, 'invalid_session');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
async function key(secret) {
  if (typeof secret !== 'string' || !secret) throw new HttpError(503, 'live_not_configured');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function message(payload) { return encoder.encode(`wearagain.live.session.v1\n${payload}`); }

export async function issueSession(secret, origin, now) {
  const session = { v: 1, id: crypto.randomUUID(), origin, issuedAt: now, expiresAt: now + SESSION_LIFETIME_MS };
  const payload = base64url(encoder.encode(JSON.stringify(session)));
  const signature = base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), message(payload))));
  return { session, token: `${payload}.${signature}` };
}

export async function verifySession(request, secret, origin, now) {
  try {
    const authorization = request.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ') || authorization.length > 1500) throw new Error();
    const pieces = authorization.slice(7).split('.');
    if (pieces.length !== 2) throw new Error();
    const [payload, signature] = pieces;
    if (!await crypto.subtle.verify('HMAC', await key(secret), decode(signature), message(payload))) throw new Error();
    const session = JSON.parse(new TextDecoder().decode(decode(payload)));
    if (session.v !== 1 || !/^[a-f0-9-]{36}$/.test(session.id) || session.origin !== origin || !Number.isSafeInteger(session.issuedAt) || !Number.isSafeInteger(session.expiresAt) || session.issuedAt > now || session.expiresAt <= now || session.expiresAt - session.issuedAt !== SESSION_LIFETIME_MS) throw new Error();
    return session;
  } catch { throw new HttpError(401, 'invalid_session'); }
}
