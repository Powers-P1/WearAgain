import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

let createLiveClient;
before(async () => {
  const built = await build({
    entryPoints: [fileURLToPath(new URL('../web/src/live.ts', import.meta.url))], bundle: true,
    write: false, platform: 'node', format: 'esm', target: 'es2022',
    define: { __PUBLIC_API_ORIGIN__: '"https://api.wearagain.test"', __PUBLIC_CONTACT_EMAIL__: '""' },
  });
  ({ createLiveClient } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`));
});

const origin = 'https://api.wearagain.test';
const token = 'synthetic-in-memory-session';
const renderKey = 'a'.repeat(64);
const bucket = { limitUnits: 40, spentUnits: 2, reservedUnits: 0, remainingUnits: 38 };
const ledger = { utcDay: '2026-10-21', unitsPerRender: 2, total: bucket, daily: bucket, sessionDaily: bucket };
const input = () => ({
  element: { kind: 'top', id: 'owned-shirt' }, avatarId: 'woman_neutral_01', attempt: 0,
  garment: new File([new Uint8Array([137, 80, 78, 71])], 'private-original-name.png', { type: 'image/png' }),
  garmentContainsNoFace: true,
});
const record = () => ({
  mode: 'live', renderKey, status: 'succeeded', accounting: 'charged', reservedUnits: 0, chargedUnits: 2,
  reason: null, requiresReconciliation: false, assetId: `youcam:${renderKey}`,
  imageUrl: `/api/renders/${renderKey}/image`, statusUrl: `/api/renders/${renderKey}`,
  imageRequiresDownload: true, budget: ledger,
  identity: { element: input().element, garmentRevision: 'b'.repeat(64), baseRevision: 'approved-base', pipelineRevision: 'cloth-v4', attempt: 0 },
});

function harness(t, handler = () => Response.json(record())) {
  const calls = [];
  const client = createLiveClient(origin, async (url, init) => {
    const request = { url: String(url), init, headers: new Headers(init.headers) };
    calls.push(request);
    if (request.url === `${origin}/api/session`) return Response.json({ sessionToken: token, unitsPerRender: 2 });
    if (request.url === `${origin}/api/ledger`) return Response.json(ledger);
    return handler(request);
  });
  t.after(() => client.dispose());
  return { client, calls };
}

function fakeImages(t, decode = () => Promise.resolve()) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const created = [], revoked = [], decoded = [];
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: class {
    src = '';
    decode() { decoded.push(this.src); return decode(); }
  } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'Image', previous) : delete globalThis.Image);
  t.mock.method(URL, 'createObjectURL', blob => {
    const url = `blob:fixture-${created.length}`; created.push({ blob, url }); return url;
  });
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  return { created, revoked, decoded };
}

test('live client is inert until explicitly enabled and keeps its token out of returned data', async (t) => {
  const { client, calls } = harness(t);
  assert.equal(calls.length, 0);
  await assert.rejects(client.getLedger(), error => error.code === 'session_required');
  await assert.rejects(client.submit(input()), error => error.code === 'session_required');
  assert.equal(calls.length, 0);
  assert.deepEqual(await client.startSession(), ledger);
  assert.deepEqual(await client.startSession(), ledger);
  assert.equal(calls.filter(call => call.url.endsWith('/api/session')).length, 1);
  assert.equal(calls[0].headers.has('Authorization'), false);
  assert.equal(calls[0].init.method, 'POST');
  assert.ok(calls.slice(1).every(call => call.headers.get('Authorization') === `Bearer ${token}`));
  assert.ok(!JSON.stringify(await client.getLedger()).includes(token));
  for (const call of calls) {
    assert.equal(call.init.cache, 'no-store');
    assert.equal(call.init.credentials, 'omit');
    assert.equal(call.init.redirect, 'error');
  }
});

test('concurrent enable calls share one session creation and keep one idempotency scope', async (t) => {
  const calls = [];
  let releaseSession;
  const gate = new Promise(resolve => { releaseSession = resolve; });
  const client = createLiveClient(origin, async (url, init) => {
    const request = { url: String(url), headers: new Headers(init.headers) }; calls.push(request);
    if (request.url.endsWith('/api/session')) {
      await gate;
      return Response.json({ sessionToken: token, unitsPerRender: 2 });
    }
    return Response.json(ledger);
  });
  t.after(() => client.dispose());
  const pending = [client.startSession(), client.startSession(), client.startSession()];
  const sessionPosts = calls.filter(call => call.url.endsWith('/api/session')).length;
  releaseSession();
  assert.deepEqual(await Promise.all(pending), [ledger, ledger, ledger]);
  assert.equal(sessionPosts, 1);
  assert.equal(calls.filter(call => call.url.endsWith('/api/session')).length, 1);
  assert.ok(calls.filter(call => call.url.endsWith('/api/ledger')).every(call => call.headers.get('Authorization') === `Bearer ${token}`));
});

test('a render sends one consented multipart POST with the same attempt and no original filename', async (t) => {
  const { client, calls } = harness(t);
  await client.startSession();
  await assert.rejects(client.submit({ ...input(), garmentContainsNoFace: false }), error => error.code === 'consent_required');
  const result = await client.submit(input());
  assert.equal(result.renderKey, renderKey);
  const posts = calls.filter(call => call.url.endsWith('/api/renders'));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].init.method, 'POST');
  assert.equal(posts[0].headers.get('Authorization'), `Bearer ${token}`);
  const form = posts[0].init.body;
  assert.deepEqual(JSON.parse(form.get('metadata')), {
    element: input().element, avatarId: 'woman_neutral_01', attempt: 0, garmentContainsNoFace: true,
  });
  assert.equal(form.get('garment').name, 'garment.png');
  assert.deepEqual([...form.keys()].sort(), ['garment', 'metadata']);
});

test('a lost POST response is UNKNOWN and never automatically retried', async (t) => {
  const { client, calls } = harness(t, () => { throw new TypeError('Synthetic connection loss after acceptance'); });
  await client.startSession();
  await assert.rejects(client.submit(input()), error => error.code === 'network_unknown' && /UNKNOWN/.test(error.message));
  assert.equal(calls.filter(call => call.url.endsWith('/api/renders')).length, 1);
});

test('the request deadline aborts one submission and leaves its charge UNKNOWN', async (t) => {
  let submissionSignal;
  const { client, calls } = harness(t, request => new Promise((resolve, reject) => {
    submissionSignal = request.init.signal;
    submissionSignal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
  }));
  await client.startSession();
  const nativeTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    assert.equal(delay, 90_000);
    return nativeTimeout(callback, 1);
  });
  await assert.rejects(client.submit(input()), error => error.code === 'network_unknown');
  assert.equal(submissionSignal.aborted, true);
  assert.equal(calls.filter(call => call.url.endsWith('/api/renders')).length, 1);
});

test('redirects are rejected, never followed, and do not create replacement submissions', async (t) => {
  const { client, calls } = harness(t, () => new Response(null, { status: 302, headers: { Location: 'https://untrusted.invalid/token-trap' } }));
  await client.startSession();
  await assert.rejects(client.submit(input()), error => error.status === 302);
  assert.equal(calls.filter(call => call.url.endsWith('/api/renders')).length, 1);
  assert.ok(calls.every(call => call.url.startsWith(`${origin}/api/`)));
});

test('failed-free and pending results preserve the Worker accounting, without a client-side refund', async (t) => {
  let next = { ...record(), status: 'pending', accounting: 'reserved', reservedUnits: 2, chargedUnits: 0, assetId: null, requiresReconciliation: true };
  const { client, calls } = harness(t, () => Response.json(next));
  await client.startSession();
  assert.equal((await client.submit(input())).requiresReconciliation, true);
  next = { ...next, status: 'error', accounting: 'released', reservedUnits: 0, requiresReconciliation: false };
  assert.equal((await client.poll(renderKey)).accounting, 'released');
  assert.equal(calls.filter(call => call.init.method === 'POST').length, 2); // session + one explicit render
  assert.ok(calls.every(call => !/refund|reserve/.test(call.url)));
});

test('image download derives its API path instead of trusting response URLs and releases blob URLs', async (t) => {
  const images = fakeImages(t);
  const { client, calls } = harness(t, () => new Response(new Uint8Array([1, 2, 3]), { headers: {
    'Content-Type': 'image/png', 'X-WearAgain-Asset-Id': `youcam:${renderKey}`,
  } }));
  await client.startSession();
  const result = await client.loadImage({ ...record(), imageUrl: 'https://untrusted.invalid/image', statusUrl: '//untrusted.invalid/status' });
  assert.equal(calls.at(-1).url, `${origin}/api/renders/${renderKey}/image`);
  assert.equal(calls.at(-1).headers.get('Authorization'), `Bearer ${token}`);
  assert.equal(result.assetId, `youcam:${renderKey}`);
  assert.deepEqual(images.decoded, [result.url]);
  client.releaseImage(result.url); client.releaseImage(result.url); client.dispose();
  assert.deepEqual(images.revoked, [result.url]);
});

test('only a matching succeeded image identity can become a displayable asset', async (t) => {
  const images = fakeImages(t);
  const { client, calls } = harness(t, () => new Response(new Uint8Array([1]), { headers: {
    'Content-Type': 'image/png', 'X-WearAgain-Asset-Id': `youcam:${'b'.repeat(64)}`,
  } }));
  await client.startSession();
  const before = calls.length;
  await assert.rejects(client.loadImage({ ...record(), status: 'pending' }), error => error.code === 'image_not_ready');
  await assert.rejects(client.loadImage({ ...record(), assetId: 'youcam:wrong' }), error => error.code === 'image_not_ready');
  assert.equal(calls.length, before);
  await assert.rejects(client.loadImage(record()), error => error.code === 'invalid_image_response');
  assert.equal(images.created.length, 0);
});

test('non-image types and oversized advertised images are refused before decoding', async (t) => {
  const images = fakeImages(t);
  let headers = { 'Content-Type': 'text/html', 'X-WearAgain-Asset-Id': `youcam:${renderKey}` };
  const { client } = harness(t, () => new Response(new Uint8Array([1]), { headers }));
  await client.startSession();
  await assert.rejects(client.loadImage(record()), error => error.code === 'invalid_image_response');
  headers = { 'Content-Type': 'image/png', 'Content-Length': '10000000', 'X-WearAgain-Asset-Id': `youcam:${renderKey}` };
  await assert.rejects(client.loadImage(record()), error => error.code === 'response_too_large');
  assert.equal(images.created.length, 0);
});

test('an oversized Content-Length cancels the body immediately and ends the transport', async (t) => {
  const images = fakeImages(t);
  let canceled = false, stream, signal;
  const { client } = harness(t, request => {
    signal = request.init.signal;
    stream = new ReadableStream({ cancel() { canceled = true; } });
    return new Response(stream, { headers: {
      'Content-Type': 'image/png', 'Content-Length': '10000000', 'X-WearAgain-Asset-Id': `youcam:${renderKey}`,
    } });
  });
  await client.startSession();
  await assert.rejects(client.loadImage(record()), error => error.code === 'response_too_large');
  assert.equal(canceled, true);
  assert.equal(stream.locked, false);
  assert.equal(signal.aborted, true);
  assert.equal(images.created.length, 0);
});

test('an unadvertised oversized image stream is canceled and cannot allocate a display URL', async (t) => {
  const images = fakeImages(t);
  let canceled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(10_000_000)); },
    cancel() { canceled = true; },
  });
  const { client } = harness(t, () => new Response(stream, { headers: { 'Content-Type': 'image/png', 'X-WearAgain-Asset-Id': `youcam:${renderKey}` } }));
  await client.startSession();
  await assert.rejects(client.loadImage(record()), error => error.code === 'response_too_large');
  assert.equal(canceled, true);
  assert.equal(stream.locked, false);
  assert.equal(images.created.length, 0);
});

test('a decode error revokes its temporary URL without submitting or refunding anything', async (t) => {
  const images = fakeImages(t, () => Promise.reject(new Error('Synthetic invalid image')));
  const { client, calls } = harness(t, () => new Response(new Uint8Array([1]), { headers: {
    'Content-Type': 'image/png', 'X-WearAgain-Asset-Id': `youcam:${renderKey}`,
  } }));
  await client.startSession();
  await assert.rejects(client.loadImage(record()), error => error.code === 'image_decode_failed');
  assert.deepEqual(images.revoked, [images.created[0].url]);
  assert.equal(calls.filter(call => call.init.method === 'POST').length, 1); // session only
});

test('disposing the view aborts an in-flight POST and prevents any later request', async (t) => {
  let signal;
  const { client, calls } = harness(t, request => new Promise((resolve, reject) => {
    signal = request.init.signal;
    signal.addEventListener('abort', () => reject(new DOMException('Closed view', 'AbortError')), { once: true });
  }));
  await client.startSession();
  const pending = client.submit(input());
  client.dispose();
  await assert.rejects(pending, error => error.code === 'disposed');
  assert.equal(signal.aborted, true);
  const before = calls.length;
  await assert.rejects(client.startSession(), error => error.code === 'disposed');
  await assert.rejects(client.getLedger(), error => error.code === 'disposed');
  assert.equal(calls.length, before);
});

test('invalid origins and render keys cannot direct authenticated requests elsewhere', async (t) => {
  for (const value of ['http://public.example', 'https://user:pass@api.example', 'https://api.example/path', 'https://api.example/?key=x', 'https://api.example/#fragment']) {
    assert.throws(() => createLiveClient(value));
  }
  const { client, calls } = harness(t);
  await client.startSession();
  const before = calls.length;
  for (const key of ['../refund', '//untrusted.invalid/x', 'a'.repeat(64) + '?token=leak', 'A'.repeat(64)]) {
    await assert.rejects(client.poll(key), error => error.code === 'invalid_render_key');
  }
  assert.equal(calls.length, before);
});
