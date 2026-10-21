import { HttpError } from './http.js';

export const GLOBAL_LEDGER_NAME = 'wearagain-global-v1';
export const PIPELINE_REVISION = 'youcam-cloth-v4-upper-body-v1';
export const RETENTION_MS = 86_400_000;
export const POLL_INTERVAL_MS = 3_000;
export const MAX_REQUEST_BYTES = 10_100_000;

function limit(value) {
  if (value === undefined || value === '') return 0;
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,6})$/.test(value)) throw new HttpError(503, 'invalid_live_configuration');
  return Number(value);
}

export function ledgerLimits(env) {
  return { totalUnits: limit(env.LIVE_TOTAL_UNITS), dailyUnits: limit(env.LIVE_DAILY_UNITS), sessionDailyUnits: limit(env.LIVE_SESSION_DAILY_UNITS) };
}

export function liveConfiguration(env) {
  const limits = ledgerLimits(env);
  if (env.LIVE_ENABLED !== 'true' || typeof env.YOUCAM_API_KEY !== 'string' || !env.YOUCAM_API_KEY || /[\s\x00-\x1f\x7f]/.test(env.YOUCAM_API_KEY) || Object.values(limits).some(value => value < 2)) {
    throw new HttpError(503, 'live_not_configured');
  }
  return limits;
}

export function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (origin === null) return '';
  const allowed = (env.ALLOWED_ORIGINS ?? 'https://wearagain.pages.dev').split(',').map(value => value.trim()).filter(Boolean);
  if (!allowed.includes(origin) || origin === 'null') throw new HttpError(403, 'origin_not_allowed');
  return origin;
}
