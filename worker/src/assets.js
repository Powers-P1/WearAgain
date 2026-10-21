import index from '../../fixtures/base_models/avatars.json' with { type: 'json' };
import { HttpError, digest, readBounded } from './http.js';

const BASE_COMMIT = '21a98e05d301f300103bf2206ff2310d5201c941';
const BLOB_SHAS = {
  "woman_neutral_01": "6e8fe750bda30b03cd688673a894dec5cc49e9f1",
  "man_neutral_01": "090b19ed2a881b262e2d55c45740b1dcd4a17e9c",
  "woman_L_slim_01": "8045f406c4e21c60a1811a1082744b5eca7c20b4",
  "woman_L_average_01": "c40f8189ec27034070e49e353e8d05d0a3ae0c8e",
  "woman_L_muscular_01": "f819ba1f7675d30047b9fe05a534a431b13b139b",
  "woman_L_belly_01": "abcace75ef93a49dc21c81f30f357c9c2e481d66",
  "man_L_slim_01": "74faa51f29472244f28950ab971cd3f790327aec",
  "man_L_average_01": "b9af2481aba3351076dec5ff00a7f33476ebc49e",
  "man_L_muscular_01": "dd25ee409e6188a044ab635fca5b1ddf90766e59",
  "man_L_belly_01": "5ffaa1579b3de03617b4efcbcfa0114732d465d4",
  "synthetic_model_01_upper": "ef3f2cb39896b9bdbcf718c6a894c74099c579e9"
};
export const AVATARS = Object.freeze(index.avatars.filter(avatar => avatar.ageBand === 'adult').map(avatar => Object.freeze({
  id: avatar.id, file: avatar.file, sex: avatar.sex, ageBand: avatar.ageBand,
  role: avatar.role ?? 'primary', baseRevision: BLOB_SHAS[avatar.id],
  url: `https://raw.githubusercontent.com/Powers-P1/WearAgain/${BASE_COMMIT}/fixtures/base_models/${avatar.file}`,
})));

export function resolveAvatar(id) {
  const avatar = AVATARS.find(item => item.id === id);
  if (!avatar) throw new HttpError(400, 'unknown_avatar');
  return avatar;
}

/** Public, approved synthetic inputs only. No caller-supplied URL or personal photo. */
export async function fetchAvatar(avatar, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(avatar.url, { signal: controller.signal, redirect: 'error', credentials: 'omit' });
    if (!response.ok) throw new Error();
    const bytes = await readBounded(response.body, 9_999_999);
    const prefix = new TextEncoder().encode(`blob ${bytes.length}\0`);
    const blob = new Uint8Array(prefix.length + bytes.length);
    blob.set(prefix); blob.set(bytes, prefix.length);
    if (await digest(blob, 'SHA-1') !== avatar.baseRevision) throw new Error();
    return { bytes, contentType: avatar.file.endsWith('.png') ? 'image/png' : 'image/jpeg', fileName: 'synthetic-avatar' + (avatar.file.endsWith('.png') ? '.png' : '.jpg') };
  } catch { throw new HttpError(503, 'avatar_image_unavailable'); }
  finally { clearTimeout(timer); }
}
