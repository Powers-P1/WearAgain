import saved from '../../fixtures/youcam/demo-manifest.json' with { type: 'json' };
import { HttpError, exactObject, json, opaque } from './http.js';
import { resolveAvatar } from './assets.js';

/** A closed manifest of recorded synthetic-avatar results, never live task URLs. */
export function demoEntries(manifest = saved, origin = 'https://wearagain.pages.dev') {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new HttpError(503, 'invalid_demo_configuration');
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.renders)) throw new HttpError(503, 'invalid_demo_manifest');
  const seen = new Set();
  return manifest.renders.map(item => {
    exactObject(item, ['id', 'element', 'avatarId', 'imagePath', 'recordedAt', 'syntheticAvatarOnly', 'api']);
    opaque(item.id);
    exactObject(item.element, ['kind', 'id']);
    opaque(item.element.id);
    if (!['top', 'outerwear'].includes(item.element.kind) || seen.has(item.id) || item.syntheticAvatarOnly !== true || item.api !== 'cloth-v4' || typeof item.imagePath !== 'string' || !/^\/demo\/renders\/[A-Za-z0-9_-]+\.(png|jpg)$/.test(item.imagePath) || typeof item.recordedAt !== 'string' || !Number.isFinite(Date.parse(item.recordedAt))) throw new HttpError(503, 'invalid_demo_manifest');
    resolveAvatar(item.avatarId);
    seen.add(item.id);
    return { ...item, imageUrl: new URL(item.imagePath, base).href, assetId: `demo:${item.id}` };
  });
}

export function demoResponse(path, env, manifest = saved) {
  const entries = demoEntries(manifest, env.DEMO_ASSET_ORIGIN ?? 'https://wearagain.pages.dev');
  if (path === '/api/demo/renders') return json({ mode: 'demo', unitsCharged: 0, available: entries.length > 0, reason: entries.length ? null : 'recordings_not_supplied', renders: entries });
  const match = /^\/api\/demo\/renders\/([A-Za-z0-9._:-]+)\/image$/.exec(path);
  const entry = match && entries.find(item => item.id === match[1]);
  if (!entry) throw new HttpError(404, 'demo_image_unavailable');
  return new Response(null, { status: 302, headers: { Location: entry.imageUrl, 'Cache-Control': 'no-store' } });
}
