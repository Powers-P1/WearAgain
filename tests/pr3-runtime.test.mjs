import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = fileURLToPath(new URL('../', import.meta.url));
const now = 1_792_598_400_000;
const requestHash = 'a'.repeat(64);

async function bundle(source) {
  const result = await build({
    stdin: { contents: source, resolveDir: root, sourcefile: 'runtime-entry.js' },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  return result.outputFiles[0].text;
}

// No provider, DNS or public HTTP request is allowed from these workerd tests.
// Miniflare 5's V4 adapter retains the outboundService interception surface.
function emulator(script, directory, externalRequests, extra = {}) {
  return new Miniflare({ ...convertV4MiniflareOptions({
    name: 'wearagain-runtime', modules: true, script, compatibilityDate: '2026-10-21',
    durableObjects: { UNIT_LEDGER: { className: 'LedgerHarness', useSQLite: true } },
    outboundService(request) {
      externalRequests.push(request.url);
      return new Response('External network is disabled in this test.', { status: 599 });
    },
    ...extra,
  }), resourcePersistencePath: directory });
}

test('workerd SQLite reserves atomically and persists settlement and ambiguous holds across restart', { timeout: 30_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'wearagain-runtime-'));
  const externalRequests = [];
  const script = await bundle(`
    import { Ledger } from './worker/src/ledger.js';
    export class LedgerHarness {
      constructor(ctx) {
        this.ledger = new Ledger(ctx.storage, {totalUnits:4,dailyUnits:4,sessionDailyUnits:4});
      }
      async fetch(request) {
        const path = new URL(request.url).pathname;
        const data = request.method === 'POST' ? await request.json() : {};
        try {
          if (path === '/reserve') return Response.json(this.ledger.reserve(data));
          if (path === '/success') {
            this.ledger.markSubmitting(data.sessionId,data.renderKey,data.now);
            this.ledger.attachTask(data.sessionId,data.renderKey,'runtime_task',data.now);
            return Response.json(this.ledger.settleSuccess(data.sessionId,data.renderKey,data.now));
          }
          if (path === '/summary') return Response.json(this.ledger.summary('runtime-session',${now}));
          if (path === '/rate') return Response.json(this.ledger.claimRequestSlot(${now}));
          return new Response(null,{status:404});
        } catch (error) { return Response.json({error:error.code},{status:error.code==='limit_exceeded'?429:400}); }
      }
    }
    export default {fetch(request,env) {
      if (new URL(request.url).pathname === '/network-canary') return fetch('https://must-never-connect.invalid/');
      return env.UNIT_LEDGER.get(env.UNIT_LEDGER.idFromName('runtime-ledger')).fetch(request);
    }};
  `);
  let mf = emulator(script, directory, externalRequests);
  t.after(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
  const request = (path, body) => mf.dispatchFetch('https://runtime.test' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  const reservations = await Promise.all(Array.from({ length: 24 }, (_, index) => request('/reserve', {
    sessionId: 'runtime-session', renderKey: 'render-' + index, requestHash, now,
  })));
  const accepted = [];
  for (const response of reservations) {
    if (response.status === 200) accepted.push((await response.json()).record);
    else { assert.equal(response.status, 429); assert.equal((await response.json()).error, 'limit_exceeded'); }
  }
  assert.equal(accepted.length, 2);
  const repeated = await request('/reserve', { sessionId: 'runtime-session', renderKey: accepted[0].renderKey, requestHash, now });
  assert.equal((await repeated.json()).created, false);
  const settled = await request('/success', { sessionId: 'runtime-session', renderKey: accepted[0].renderKey, now });
  assert.equal((await settled.json()).status, 'succeeded');
  let summary = await (await mf.dispatchFetch('https://runtime.test/summary')).json();
  assert.deepEqual(summary.total, { limitUnits: 4, spentUnits: 2, reservedUnits: 2, remainingUnits: 0 });

  await mf.dispose();
  mf = emulator(script, directory, externalRequests);
  summary = await (await mf.dispatchFetch('https://runtime.test/summary')).json();
  assert.deepEqual(summary.total, { limitUnits: 4, spentUnits: 2, reservedUnits: 2, remainingUnits: 0 });
  const slots = await Promise.all(Array.from({ length: 6 }, () => mf.dispatchFetch('https://runtime.test/rate').then(response => response.json())));
  assert.equal(slots.filter(slot => slot.allowed).length, 5);
  assert.equal(slots.filter(slot => !slot.allowed).length, 1);
  assert.deepEqual(externalRequests, []);
  const blocked = await mf.dispatchFetch('https://runtime.test/network-canary');
  assert.equal(blocked.status, 599);
  assert.deepEqual(externalRequests, ['https://must-never-connect.invalid/']);
});

test('production Worker bundles and serves demo, signed sessions and SQLite with all outbound network denied', { timeout: 30_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'wearagain-worker-'));
  const externalRequests = [];
  const script = await bundle("export { default, UnitLedger } from './worker/src/index.js';");
  const mf = emulator(script, directory, externalRequests, {
    durableObjects: { UNIT_LEDGER: { className: 'UnitLedger', useSQLite: true } },
    bindings: {
      VERSION: 'offline-runtime', YOUCAM_API_KEY: 'offline-runtime-key', LIVE_ENABLED: 'true',
      LIVE_TOTAL_UNITS: '24', LIVE_DAILY_UNITS: '12', LIVE_SESSION_DAILY_UNITS: '6',
      ALLOWED_ORIGINS: 'https://wearagain.pages.dev',
    },
  });
  t.after(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
  const origin = 'https://wearagain.pages.dev';
  const call = (path, init = {}) => mf.dispatchFetch('https://worker.test' + path, init);
  let response = await call('/health');
  assert.deepEqual(await response.json(), { ok: true, version: 'offline-runtime', liveAvailable: true });
  response = await call('/do-check');
  assert.deepEqual(await response.json(), { ok: true, ledger: 'sqlite', unitsPerRender: 2 });
  const demo = await (await call('/api/demo/renders')).json();
  assert.equal(demo.mode, 'demo');
  assert.equal(demo.unitsCharged, 0);
  assert.equal(demo.available, false);
  assert.equal(demo.reason, 'recordings_not_supplied');
  assert.equal((await (await call('/api/avatars')).json()).avatars.length, 11);
  assert.equal((await call('/api/ledger')).status, 401);

  response = await call('/api/session', { method: 'POST', headers: { Origin: origin } });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const session = await response.json();
  const headers = { Origin: origin, Authorization: `Bearer ${session.sessionToken}` };
  response = await call('/api/ledger', { headers: { ...headers, 'X-WearAgain-Session': 'forged invalid identifier' } });
  assert.equal(response.status, 200);
  const ledger = await response.json();
  assert.deepEqual(ledger.total, { limitUnits: 24, spentUnits: 0, reservedUnits: 0, remainingUnits: 24 });
  assert.deepEqual(ledger.sessionDaily, { limitUnits: 6, spentUnits: 0, reservedUnits: 0, remainingUnits: 6 });
  response = await call('/api/ledger', { headers: { ...headers, Origin: 'https://wrong-origin.invalid' } });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await call('/api/ledger', { headers: { ...headers, Authorization: `Bearer ${session.sessionToken}corrupt` } })).status, 401);
  assert.equal((await call('/summary', { headers })).status, 404);
  assert.equal((await call('/refund', { method: 'POST', headers })).status, 404);
  assert.equal((await call('/api/renders/' + '0'.repeat(64), { headers })).status, 404);

  const form = new FormData();
  form.set('metadata', JSON.stringify({ element: { kind: 'top', id: 'runtime-top' }, avatarId: 'woman_neutral_01', attempt: 0, garmentContainsNoFace: true }));
  form.set('garment', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'garment.png');
  // Serialize with Node's Request first: Miniflare and Node own separate FormData constructors.
  const upload = new Request('https://worker.test/api/renders', { method: 'POST', body: form });
  response = await call('/api/renders', {
    method: 'POST', headers: { ...headers, 'Content-Type': upload.headers.get('Content-Type') }, body: await upload.arrayBuffer(),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'invalid_image');
  assert.deepEqual((await (await call('/api/ledger', { headers })).json()).total, ledger.total);
  assert.deepEqual(externalRequests, []);
});
