import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorker } from '../worker/src/app.js';
import { createUnitLedgerClass } from '../worker/src/unit-ledger.js';
import { fetchAvatar } from '../worker/src/assets.js';
import { digest } from '../worker/src/http.js';
import { createSqlStorage } from './helpers/sql-storage.mjs';
import { testPng } from './helpers/image.mjs';
import { YouCamClient, inspectImage } from '../dist/youcam/index.js';

const shape = JSON.parse(await readFile(new URL('../fixtures/youcam/cloth_tryon_task.synthetic.json', import.meta.url), 'utf8'));
const origin = 'https://wearagain.pages.dev';
const secret = 'offline-test-key';
const assetUrl = 'https://yce-us.s3-accelerate.amazonaws.com/fixture/result.png?sig=private-fixture';
const bytes = testPng();
const metadata = { element: { kind: 'top', id: 'top-1' }, avatarId: 'woman_neutral_01', attempt: 0, garmentContainsNoFace: true };
const json = (body, status = 200) => Response.json(body, { status });
function form(meta = metadata, data = bytes) {
  const value = new FormData();
  value.set('metadata', JSON.stringify(meta));
  value.set('garment', new Blob([data], { type: 'image/png' }), 'private-user-name.png');
  return value;
}

function harness(t, options = {}) {
  let clock = Date.UTC(2026, 9, 21, 12);
  const storage = createSqlStorage();
  t.after(() => storage.close());
  let alarmAt = null;
  storage.setAlarm = async time => { alarmAt = time; };
  storage.getAlarm = async () => alarmAt;
  const calls = [];
  const controls = { ...options, polls: [...(options.polls ?? [])] };
  let creates = 0;
  let uploads = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    if (path === '/s2s/v2.0/file/cloth') {
      if (controls.uploadFailure) throw new Error(secret + assetUrl);
      const input = JSON.parse(init.body).files[0];
      const response = structuredClone(shape.file_api_response);
      Object.assign(response.data.files[0], { ...input, file_id: 'file_' + (++uploads), requests: [{ method: 'PUT', url: assetUrl, headers: { 'Content-Type': input.content_type, 'Content-Length': String(input.file_size) } }] });
      return json(response);
    }
    if (init.method === 'PUT' && url === assetUrl) return new Response(null, { status: 204 });
    if (path === '/s2s/v2.0/task/cloth-v4') {
      creates++;
      if (controls.createFailure === 'unknown') throw new Error(secret + assetUrl);
      if (controls.createFailure === 'timeout') return new Promise(() => {});
      if (controls.createFailure === 'validation') return json(shape.validation_error_400, 400);
      if (controls.createFailure === 'malformed') return json({ status: 200, data: {} });
      const response = structuredClone(shape.create_task_response);
      response.data.task_id = 'task_' + creates;
      return json(response);
    }
    if (path.startsWith('/s2s/v2.0/task/cloth-v4/')) {
      const next = controls.polls.shift() ?? 'success';
      if (next === 'network') throw new Error(secret + assetUrl);
      if (next === 'http400') return json(shape.validation_error_400, 400);
      if (next === 'running') return json(shape.poll_running);
      if (next === 'free_error') return json(shape.poll_error);
      if (next === 'unknown_error') return json({ status: 200, data: { ...shape.poll_error.data, error: 'unprobed_code' } });
      const response = structuredClone(shape.poll_success);
      response.data.results.url = assetUrl;
      return json(response);
    }
    if (url === assetUrl && init.method === 'GET') {
      if (controls.downloadFailure) return new Response(null, { status: 403 });
      return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
    }
    assert.fail('Unexpected external request: ' + url);
  };
  const env = {
    LIVE_ENABLED: 'true', LIVE_TOTAL_UNITS: '100', LIVE_DAILY_UNITS: '24', LIVE_SESSION_DAILY_UNITS: '12',
    YOUCAM_API_KEY: secret, ALLOWED_ORIGINS: origin, ...options.env,
  };
  const Klass = createUnitLedgerClass({
    clientFactory: config => new YouCamClient({ ...config, ...(options.createFailure === 'timeout' ? { requestTimeoutMs: 30 } : {}) }), inspectImage, fetchImpl,
    fetchAvatarImage: async () => ({ bytes, contentType: 'image/png', fileName: 'synthetic-avatar.png' }),
    now: () => clock, sleep: async ms => { clock += ms; },
  });
  let ledger = new Klass({ storage }, env);
  env.UNIT_LEDGER = {
    idFromName(name) { assert.equal(name, 'wearagain-global-v1'); return name; },
    get() { return { fetch: request => ledger.fetch(typeof request === 'string' ? new Request(request) : request) }; },
  };
  const worker = createWorker({ now: () => clock, ...(options.demoManifest ? { demoManifest: options.demoManifest } : {}) });
  const request = (path, init = {}, token) => {
    const headers = new Headers(init.headers);
    if (!headers.has('Origin')) headers.set('Origin', origin);
    if (token) headers.set('Authorization', 'Bearer ' + token);
    return worker.fetch(new Request('https://worker.test' + path, { ...init, headers }), env);
  };
  return {
    request, env, calls, controls, storage,
    get ledger() { return ledger; }, get creates() { return creates; }, get alarmAt() { return alarmAt; },
    advance(ms) { clock += ms; }, restart() { ledger = new Klass({ storage }, env); },
    async token() { const response = await request('/api/session', { method: 'POST', body: '{}' }); assert.equal(response.status, 201); return (await response.json()).sessionToken; },
    async start(token, meta = metadata, data = bytes) { return request('/api/renders', { method: 'POST', body: form(meta, data) }, token); },
    async budget(token) { return (await request('/api/ledger', {}, token)).json(); },
  };
}

test('actual fixture client and Worker reserve, poll by alarm, charge once and proxy result bytes without storing images', async t => {
  const h = harness(t, { polls: ['running', 'success'] });
  const token = await h.token();
  const started = await h.start(token);
  assert.equal(started.status, 202);
  const initial = await started.json();
  assert.equal(initial.accounting, 'reserved');
  assert.equal(initial.reservedUnits, 2);
  assert.equal(initial.identity.garmentRevision, await digest(bytes));
  assert.equal(initial.requiresReconciliation, false);
  assert.ok(h.alarmAt);
  h.advance(3000); await h.ledger.alarm();
  assert.equal((await h.budget(token)).total.reservedUnits, 2);
  h.advance(3000); await h.ledger.alarm();
  const settled = await (await h.request(initial.statusUrl, {}, token)).json();
  assert.equal(settled.accounting, 'charged');
  assert.equal(settled.chargedUnits, 2);
  const result = await h.request(settled.imageUrl, {}, token);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('X-WearAgain-Asset-Id'), settled.assetId);
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
  assert.equal(h.creates, 1);
  const rows = h.storage.sql.exec('SELECT * FROM render_reservations').toArray();
  const persisted = JSON.stringify(rows);
  for (const privateValue of [secret, assetUrl, 'private-user-name', 'image/png']) assert.ok(!persisted.includes(privateValue));
  assert.ok(!JSON.stringify(initial).includes('task_1'));
  assert.ok(!JSON.stringify(settled).includes(assetUrl));
  assert.deepEqual((await h.budget(token)).total, { limitUnits: 100, spentUnits: 2, reservedUnits: 0, remainingUnits: 98 });
});

test('concurrent duplicate upload is admitted once; busy retry reuses the render and reservation', async t => {
  const h = harness(t);
  const token = await h.token();
  const responses = await Promise.all([h.start(token), h.start(token)]);
  assert.deepEqual(responses.map(item => item.status).sort(), [202, 429]);
  const busy = responses.find(item => item.status === 429);
  assert.equal((await busy.json()).error, 'render_busy');
  assert.equal(busy.headers.get('Retry-After'), '2');
  const replay = await (await h.start(token)).json();
  assert.equal(replay.replayed, true);
  assert.equal(h.creates, 1);
  assert.equal((await h.budget(token)).total.reservedUnits, 2);
  h.advance(3000); await h.ledger.alarm();
  const afterSuccess = await (await h.start(token)).json();
  assert.equal(afterSuccess.accounting, 'charged');
  assert.equal(h.creates, 1);
});

for (const createFailure of ['unknown', 'malformed', 'timeout']) {
  test(`ambiguous ${createFailure} task creation remains held across retry and DO restart`, async t => {
    const h = harness(t, { createFailure });
    const token = await h.token();
    const first = await (await h.start(token)).json();
    assert.equal(first.status, 'pending');
    assert.equal(first.requiresReconciliation, true);
    assert.equal(first.accounting, 'reserved');
    h.restart();
    const repeat = await (await h.start(token)).json();
    assert.equal(repeat.renderKey, first.renderKey);
    assert.equal(repeat.replayed, true);
    assert.equal(h.creates, 1);
    assert.equal((await h.budget(token)).total.reservedUnits, 2);
    assert.ok(!JSON.stringify(repeat).includes(secret));
  });
}

test('confirmed create validation is free, but replay never repeats even a free task', async t => {
  const h = harness(t, { createFailure: 'validation' });
  const token = await h.token();
  const first = await (await h.start(token)).json();
  assert.equal(first.status, 'error');
  assert.equal(first.accounting, 'released');
  assert.equal(first.reservedUnits, 0);
  await h.start(token);
  assert.equal(h.creates, 1);
  assert.equal((await h.budget(token)).total.remainingUnits, 100);
  await h.start(token, { ...metadata, attempt: 1 });
  assert.equal(h.creates, 2);
});

test('confirmed terminal decode error is free; an unprobed terminal error remains held', async t => {
  for (const terminal of ['free_error', 'unknown_error']) {
    const h = harness(t, { polls: [terminal] });
    const token = await h.token();
    const started = await (await h.start(token)).json();
    h.advance(3000); await h.ledger.alarm();
    const result = await (await h.request(started.statusUrl, {}, token)).json();
    assert.equal(result.accounting, terminal === 'free_error' ? 'released' : 'reserved');
    assert.equal(result.requiresReconciliation, terminal === 'unknown_error');
    assert.equal((await h.budget(token)).total.spentUnits, 0);
  }
});

for (const failure of ['network', 'http400']) {
  test(`poll ${failure} cannot refund; alarm resumes after restart and settles`, async t => {
    const h = harness(t, { polls: [failure, 'success'] });
    const token = await h.token();
    const started = await (await h.start(token)).json();
    h.advance(3000); await h.ledger.alarm();
    assert.equal((await h.budget(token)).total.reservedUnits, 2);
    h.restart(); h.advance(30_000); await h.ledger.alarm();
    const final = await (await h.request(started.statusUrl, {}, token)).json();
    assert.equal(final.accounting, 'charged');
    assert.equal(h.creates, 1);
  });
}

test('download failure and expired result never refund a successful task', async t => {
  const h = harness(t, { downloadFailure: true });
  const token = await h.token();
  const start = await (await h.start(token)).json();
  h.advance(3000); await h.ledger.alarm();
  let response = await h.request(start.statusUrl + '/image', {}, token);
  assert.equal(response.status, 502);
  assert.equal((await h.budget(token)).total.spentUnits, 2);
  h.controls.downloadFailure = false;
  response = await h.request(start.statusUrl + '/image', {}, token);
  assert.equal(response.status, 200);
  assert.equal((await h.budget(token)).total.spentUnits, 2);
  const stored = h.storage.sql.exec('SELECT session_id FROM render_reservations').one();
  h.advance(86_400_001);
  const expired = await h.ledger.fetch(new Request('https://ledger.internal/renders/' + start.renderKey + '/image', { headers: { 'X-WearAgain-Session': stored.session_id } }));
  assert.equal(expired.status, 410);
  assert.equal(h.storage.sql.exec('SELECT status FROM render_reservations').one().status, 'succeeded');
});

test('global daily limit constrains newly issued sessions before another provider call', async t => {
  const h = harness(t, { env: { LIVE_DAILY_UNITS: '2' } });
  const first = await h.token(), second = await h.token();
  assert.notEqual(first, second);
  await h.start(first);
  const denied = await h.start(second);
  assert.equal(denied.status, 429);
  assert.deepEqual(await denied.json(), { ok: false, error: 'limit_exceeded', scope: 'daily', demoUrl: '/api/demo/renders' });
  assert.equal(h.creates, 1);
});

test('24-hour unresolved retention stops automatic polling without releasing its two-unit hold', async t => {
  const h = harness(t);
  const token = await h.token();
  await h.start(token);
  const before = h.calls.length;
  h.advance(86_400_000); await h.ledger.alarm();
  const record = h.storage.sql.exec('SELECT * FROM render_reservations').one();
  assert.equal(record.status, 'pending');
  assert.equal(record.next_poll_at, null);
  assert.equal(record.reason, 'retention_expired_outcome_unknown');
  assert.equal(h.calls.length, before);
  assert.equal(h.ledger.ledger.summary(record.session_id, record.updated_at).daily.reservedUnits, 2);
});

test('input validation happens before provider activity or reservation and accepts no personal base photo', async t => {
  const h = harness(t);
  const token = await h.token();
  for (const invalid of [
    { ...metadata, garmentContainsNoFace: false }, { ...metadata, personUrl: 'https://evil.invalid/photo' },
    { ...metadata, avatarId: 'child' }, { ...metadata, attempt: -1 },
    { ...metadata, element: { kind: 'pair', id: 'x' } },
  ]) assert.equal((await h.start(token, invalid)).status, 400);
  assert.equal((await h.start(token, metadata, new Uint8Array([1, 2, 3]))).status, 400);
  assert.equal(h.calls.length, 0);
  assert.equal((await h.budget(token)).total.reservedUnits, 0);
});

test('a new image or explicit attempt has a distinct canonical render identity', async t => {
  const h = harness(t);
  const token = await h.token();
  const a = await (await h.start(token)).json();
  const b = await (await h.start(token, metadata, testPng(12))).json();
  const c = await (await h.start(token, { ...metadata, attempt: 1 })).json();
  assert.equal(new Set([a.renderKey, b.renderKey, c.renderKey]).size, 3);
  assert.notEqual(a.identity.garmentRevision, b.identity.garmentRevision);
  assert.equal(a.identity.garmentRevision, c.identity.garmentRevision);
  assert.equal((await h.budget(token)).total.reservedUnits, 6);
});

test('session signatures, origin binding, expiry and absence of public settlement endpoints guard the ledger', async t => {
  const h = harness(t);
  const token = await h.token();
  assert.equal((await h.request('/api/ledger')).status, 401);
  assert.equal((await h.request('/api/ledger', {}, token + 'bad')).status, 401);
  assert.equal((await h.request('/api/ledger', { headers: { Origin: 'https://evil.invalid' } }, token)).status, 403);
  for (const path of ['/reserve', '/settle', '/refund', '/summary']) assert.equal((await h.request(path, { method: 'POST', body: '{}' }, token)).status, 404);
  const preflight = await h.request('/api/renders', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.ok(preflight.headers.get('Access-Control-Allow-Headers').includes('Authorization'));
  const start = await (await h.start(token)).json();
  const other = await h.token();
  assert.equal((await h.request(start.statusUrl, { headers: { 'X-WearAgain-Session': h.storage.sql.exec('SELECT session_id FROM render_reservations').one().session_id } }, other)).status, 404);
  h.advance(6 * 60 * 60 * 1000);
  assert.equal((await h.request('/api/ledger', {}, token)).status, 401);
});

test('live defaults require explicit budgets while demo honestly reports missing recordings', async t => {
  const h = harness(t, { env: { LIVE_ENABLED: 'false' } });
  assert.equal((await h.request('/api/session', { method: 'POST' })).status, 503);
  const demo = await (await h.request('/api/demo/renders')).json();
  assert.deepEqual(demo, { mode: 'demo', unitsCharged: 0, available: false, reason: 'recordings_not_supplied', renders: [] });
  assert.equal((await h.request('/api/demo/renders/not-supplied/image')).status, 404);
  assert.equal(h.calls.length, 0);
});

test('recorded-demo manifest routes to static approved images with zero provider calls', async t => {
  const h = harness(t, { demoManifest: { schemaVersion: 1, renders: [{
    id: 'recorded-test', element: { kind: 'outerwear', id: 'coat-1' }, avatarId: 'woman_neutral_01',
    imagePath: '/demo/renders/recorded-test.png', recordedAt: '2026-10-21T10:00:00Z', syntheticAvatarOnly: true, api: 'cloth-v4',
  }] } });
  const manifest = await (await h.request('/api/demo/renders')).json();
  assert.equal(manifest.available, true);
  assert.equal(manifest.unitsCharged, 0);
  const image = await h.request('/api/demo/renders/recorded-test/image');
  assert.equal(image.status, 302);
  assert.equal(image.headers.get('Location'), origin + '/demo/renders/recorded-test.png');
  assert.equal(h.calls.length, 0);
});

test('approved avatar loader checks pinned blob content and never forwards credentials', async () => {
  const prefix = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const gitBytes = new Uint8Array(prefix.length + bytes.length);
  gitBytes.set(prefix); gitBytes.set(bytes, prefix.length);
  const avatar = { file: 'synthetic.png', url: 'https://raw.githubusercontent.com/fixture/immutable.png', baseRevision: await digest(gitBytes, 'SHA-1') };
  const network = async (url, init) => {
    assert.equal(url, avatar.url);
    assert.equal(init.redirect, 'manual');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.headers, undefined);
    return new Response(bytes);
  };
  assert.deepEqual((await fetchAvatar(avatar, network)).bytes, bytes);
  await assert.rejects(fetchAvatar({ ...avatar, baseRevision: '0'.repeat(40) }, network), error => error.code === 'avatar_image_unavailable');
});
