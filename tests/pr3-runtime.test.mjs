import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { testPng } from './helpers/image.mjs';
import {snapshot as agentSnapshot} from './helpers/agent-snapshot.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const now = 1_792_598_400_000;
const requestHash = 'a'.repeat(64);

test('production agent runs model/tools with real SQLite, authenticated private photos, SSE, replay and per-user isolation',{timeout:30000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'wearagain-agent-runtime-')),network=[],provider=[];
 const script=await bundle("export { default, UnitLedger } from './worker/src/index.js';");
 const image=testPng(81),image64=Buffer.from(image).toString('base64'),hash=Buffer.from(await crypto.subtle.digest('SHA-256',image)).toString('hex');
 const mf=emulator(script,directory,network,{durableObjects:{UNIT_LEDGER:{className:'UnitLedger',useSQLite:true}},bindings:{VERSION:'agent-runtime',YOUCAM_API_KEY:'fake-youcam-key',ANTHROPIC_API_KEY:'fake-anthropic-key',LIVE_ENABLED:'true',LIVE_TOTAL_UNITS:'24',LIVE_DAILY_UNITS:'12',LIVE_SESSION_DAILY_UNITS:'6',ALLOWED_ORIGINS:'https://wearagain.pages.dev'},
  outboundService:async request=>{
   network.push(request.url);assert.equal(new URL(request.url).hostname,'api.anthropic.com','No render/provider/photo URL may escape this test');
   const body=await request.json();provider.push(body);await new Promise(r=>setTimeout(r,80));
   const call=(name,input={})=>({type:'tool_use',id:'tool_'+name,name,input});
   const isSecond=body.messages.some(m=>m.role==='user'&&Array.isArray(m.content)&&m.content.some(c=>c.type==='tool_result'));
   const look={id:'outfit1',title:'Owned navy outfit',explanation:'Your ready clothes and remembered preference.',itemIds:['topA','bottomA','shoeA']};
   return Response.json({type:'message',id:'response'+provider.length,role:'assistant',model:'claude-sonnet-5-5',stop_reason:'tool_use',content:isSecond?[call('submit_answer',{reply:'Based on your own saved profile and tool data.',looks:[look,{...look,id:'outfit2',itemIds:['topB','bottomA','shoeA']}],requirements:[],missing:[]})]:[call('get_profile'),call('get_wardrobe'),call('search_memory',{query:'wool'}),call('inspect_clothing_photo',{itemId:'topA'})],usage:{input_tokens:100,output_tokens:100}});
  }});
 t.after(()=>cleanupRuntime(mf,directory));
 const origin='https://wearagain.pages.dev';
 const post=(path,body,token)=>mf.dispatchFetch('https://worker.test'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 const get=(path,token)=>mf.dispatchFetch('https://worker.test'+path,{headers:{Origin:origin,Authorization:'Bearer '+token}});
 const alpha=(await(await post('/api/session',{})).json()).sessionToken,beta=(await(await post('/api/session',{})).json()).sessionToken;
 assert.equal((await post('/api/agent/assets',{id:hash,mediaType:'image/png',base64:image64,garmentContainsNoFace:true},alpha)).status,201);
 const snap=agentSnapshot('ALPHA_ONLY');snap.wardrobe[0]={...snap.wardrobe[0],photoId:hash};
 const input={requestId:'request-alpha',snapshot:snap,message:'A work outfit, respecting wool preference',procedure:'occasion'};
 let response=await post('/api/agent',input,alpha);assert.equal(response.status,201);const first=await response.json();
 response=await post('/api/agent',input,alpha);assert.equal(response.status,200);assert.equal((await response.json()).id,first.id);
 response=await get('/api/agent/'+first.id+'/events',alpha);assert.match(response.headers.get('Content-Type'),/text\/event-stream/);const stream=await response.text();assert.match(stream,/event: progress/);assert.match(stream,/event: result/);
 const state=await(await get('/api/agent/'+first.id,alpha)).json();assert.equal(state.status,'completed');assert.equal(state.result.answer.looks.length,2);assert.equal(provider.length,2);assert.ok(JSON.stringify(provider[1]).includes(image64),'Actual private clothing bytes reach the vision tool result');assert.equal(JSON.stringify(state).includes(image64),false,'Photo bytes never enter saved response/transcript');
 assert.equal((await get('/api/agent/'+first.id,beta)).status,404);assert.equal((await post('/api/agent',{...input,message:'A different request'},alpha)).status,409);assert.equal(provider.length,2);
 await post('/api/agent',input,alpha);assert.equal(provider.length,2,'Replay does not rerun the model');
 const betaSnap=agentSnapshot('BETA_ONLY');betaSnap.wardrobe[0]={...betaSnap.wardrobe[0],photoId:hash};const second=await(await post('/api/agent',{...input,requestId:'request-beta',snapshot:betaSnap},beta)).json();await(await get('/api/agent/'+second.id+'/events',beta)).text();
 assert.equal(provider.length,4);assert.equal(JSON.stringify(provider.slice(2)).includes('ALPHA_ONLY'),false);assert.equal(JSON.stringify(provider.slice(2)).includes(image64),false);assert.ok(JSON.stringify(provider.slice(2)).includes('BETA_ONLY'));
 const budget=await(await get('/api/ledger',alpha)).json();assert.equal(budget.total.spentUnits,0);assert.equal(budget.total.reservedUnits,0);
});

async function cleanupRuntime(mf, directory) {
  try { await mf.dispose(); }
  finally {
    // Windows can retain SQLite/workerd handles briefly after dispose resolves.
    // Bound retries for transient EBUSY/EPERM/ENOTEMPTY; keep real failures visible.
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

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
  t.after(() => cleanupRuntime(mf, directory));
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
  t.after(() => cleanupRuntime(mf, directory));
  const origin = 'https://wearagain.pages.dev';
  const call = (path, init = {}) => mf.dispatchFetch('https://worker.test' + path, init);
  let response = await call('/health');
  assert.deepEqual(await response.json(), { ok: true, version: 'offline-runtime', liveAvailable: true,agentAvailable:false,agentVersion:'wearagain.agent.v1',agentCaps:{dailySessions:30,perToken:3,tools:12,outputTokens:20000,newRenders:4,renderUnits:8} });
  response = await call('/do-check');
  assert.deepEqual(await response.json(), { ok: true, ledger: 'sqlite', unitsPerRender: 2 });
  const demo = await (await call('/api/demo/renders')).json();
  assert.equal(demo.mode, 'demo');
  assert.equal(demo.unitsCharged, 0);
  assert.equal(demo.available, true);
  assert.equal(demo.reason, null);
  assert.equal(demo.renders.length, 6);
  assert.ok(demo.renders.every(item => item.avatarId === 'woman_neutral_01' && item.api === 'cloth-v4' && item.assetId === `demo:${item.id}`));
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

test('actual workerd native fetch completes the YouCam protocol and refuses redirects without leaking Bearer', { timeout: 30_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'wearagain-native-fetch-'));
  const fixture = JSON.parse(await readFile(new URL('../fixtures/youcam/cloth_tryon_task.synthetic.json', import.meta.url), 'utf8'));
  const png = testPng(90);
  const api = 'https://yce-api-01.makeupar.com';
  const asset = 'https://yce-us.s3-accelerate.amazonaws.com';
  const key = 'offline-native-fetch-key';
  const externalRequests = [];
  let redirectAt = null;
  let polls = 0;
  const script = await bundle(`
    import { YouCamClient } from './src/youcam/index.ts';
    export default {async fetch(request) {
      // These are the real workerd global fetch paths, never an injected JS mock.
      // The provider boundary below is intercepted outside the Worker isolate.
      const options = {apiKey:${JSON.stringify(key)}};
      if (new URL(request.url).pathname === '/injected-global') options.fetchImpl = fetch;
      const client = new YouCamClient(options);
      try {
        const bytes = new Uint8Array(${JSON.stringify([...png])});
        const person = await client.uploadImage({bytes,contentType:'image/png',fileName:'person.png'});
        const garment = await client.uploadImage({bytes,contentType:'image/png',fileName:'garment.png'});
        const task = await client.createTask({srcFileId:person.fileId,refFileId:garment.fileId});
        const pending = await client.getTask(task.taskId);
        const completed = await client.getTask(task.taskId);
        if (completed.status !== 'success') throw new Error('Expected fixture success');
        const image = await client.downloadResult(completed.resultUrl);
        return Response.json({pending:pending.status,taskId:task.taskId,contentType:image.contentType,bytes:[...image.bytes]});
      } catch (error) {
        return Response.json({kind:error.kind,operation:error.operation,httpStatus:error.httpStatus,confirmedNoCharge:error.confirmedNoCharge},{status:502});
      }
    }};
  `);
  const mf = emulator(script, directory, externalRequests, {
    durableObjects: {},
    async outboundService(request) {
      const url = new URL(request.url);
      const stage = url.origin === api && url.pathname === '/s2s/v2.0/file/cloth' ? 'file'
        : url.origin === asset && url.pathname.startsWith('/fixture-upload/') ? 'upload'
        : url.origin === api && url.pathname === '/s2s/v2.0/task/cloth-v4' ? 'create'
        : url.origin === api && url.pathname === '/s2s/v2.0/task/cloth-v4/fixture_task' ? 'poll'
        : url.origin === asset && url.pathname === '/fixture-result.png' ? 'download' : 'blocked';
      const body = await request.arrayBuffer();
      externalRequests.push({ stage, url: request.url, method: request.method,
        authorization: request.headers.get('Authorization'), bytes: new Uint8Array(body),
        contentType: request.headers.get('Content-Type') });
      // Even an accidental redirect never reaches DNS/public HTTP.
      if (stage === 'blocked') return new Response('External network is disabled.', { status: 599 });
      if (stage === redirectAt) return new Response(null, { status: 302, headers: { Location: 'https://must-never-connect.invalid/credential-trap' } });
      if (stage === 'file') {
        const input = JSON.parse(new TextDecoder().decode(body)).files[0];
        const output = structuredClone(fixture.file_api_response);
        Object.assign(output.data.files[0], {
          file_name: input.file_name, content_type: input.content_type, file_id: 'fixture_' + input.file_name,
          requests: [{ method: 'PUT', url: `${asset}/fixture-upload/${input.file_name}`, headers: { 'Content-Type': input.content_type, 'Content-Length': String(input.file_size) } }],
        });
        return Response.json(output);
      }
      if (stage === 'upload') return new Response(null, { status: 200 });
      if (stage === 'create') {
        const output = structuredClone(fixture.create_task_response);
        output.data.task_id = 'fixture_task';
        return Response.json(output);
      }
      if (stage === 'poll') {
        if (polls++ === 0) return Response.json(fixture.poll_running);
        const output = structuredClone(fixture.poll_success);
        output.data.results.url = `${asset}/fixture-result.png`;
        return Response.json(output);
      }
      return new Response(png, { headers: { 'Content-Type': 'image/png' } });
    },
  });
  t.after(() => cleanupRuntime(mf, directory));

  for (const path of ['/default-global', '/injected-global']) {
    externalRequests.length = 0; polls = 0;
    const response = await mf.dispatchFetch('https://runtime.test' + path);
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.deepEqual(result, { pending: 'pending', taskId: 'fixture_task', contentType: 'image/png', bytes: [...png] });
    assert.deepEqual(externalRequests.map(request => [request.stage, request.method]), [
      ['file', 'POST'], ['upload', 'PUT'], ['file', 'POST'], ['upload', 'PUT'],
      ['create', 'POST'], ['poll', 'GET'], ['poll', 'GET'], ['download', 'GET'],
    ]);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(externalRequests[4].bytes)), {
      src_file_id: 'fixture_person.png', ref_file_id: 'fixture_garment.png', garment_category: 'upper_body',
    });
    for (const request of externalRequests) {
      assert.equal(request.authorization, ['file', 'create', 'poll'].includes(request.stage) ? `Bearer ${key}` : null);
      if (request.stage === 'upload') {
        assert.deepEqual(request.bytes, png);
        assert.equal(request.contentType, 'image/png');
      }
    }
  }

  for (const [stage, operation] of [['file', 'uploadImage'], ['upload', 'uploadImage'], ['create', 'createTask'], ['poll', 'getTask'], ['download', 'downloadResult']]) {
    externalRequests.length = 0; polls = 0; redirectAt = stage;
    const response = await mf.dispatchFetch('https://runtime.test/default-global');
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { kind: 'http', operation, httpStatus: 302, confirmedNoCharge: false });
    assert.equal(externalRequests.at(-1).stage, stage);
    assert.equal(externalRequests.filter(request => request.stage === stage).length, 1);
    assert.ok(externalRequests.every(request => request.stage !== 'blocked'));
    for (const request of externalRequests.filter(request => ['upload', 'download'].includes(request.stage))) assert.equal(request.authorization, null);
  }
});
