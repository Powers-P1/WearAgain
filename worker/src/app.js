import { GLOBAL_LEDGER_NAME, allowedOrigin, liveConfiguration } from './config.js';
import { AVATARS } from './assets.js';
import { demoResponse } from './demo.js';
import { errorResponse, HttpError, json, readBounded } from './http.js';
import { issueSession, verifySession } from './session.js';
import {agentEnabled} from './agent-service.js';
import {authorizeOperator} from './operator.js';

function stub(env) { return env.UNIT_LEDGER.get(env.UNIT_LEDGER.idFromName(GLOBAL_LEDGER_NAME)); }

export function createWorker({ now = Date.now, demoManifest } = {}) {
  return {
    async fetch(request, env) {
      let origin = '';
      let response;
      try {
        origin = allowedOrigin(request, env);
        const path = new URL(request.url).pathname;
        if (request.method === 'OPTIONS') {
          response = new Response(null, { status: 204, headers: {
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Max-Age': '600',
          } });
        } else if (path === '/health' && request.method === 'GET') {
          let liveAvailable = true;
          try { liveConfiguration(env); } catch { liveAvailable = false; }
          response = json({ ok: true, version: env.VERSION ?? 'unknown', liveAvailable,agentAvailable:agentEnabled(env),agentVersion:'wearagain.agent.v1',agentCaps:{dailySessions:30,perToken:3,tools:12,outputTokens:20000,newRenders:4,renderUnits:8} });
        } else if (path === '/do-check' && request.method === 'GET') {
          response = await stub(env).fetch('https://ledger.internal/health');
        } else if (path === '/api/avatars' && request.method === 'GET') {
          response = json({ avatars: AVATARS, note: 'Synthetic adults; selection bands are nominal, not garment sizes.' });
        } else if (path.startsWith('/api/demo/') && request.method === 'GET') {
          response = demoResponse(path, env, demoManifest);
        } else if (path === '/api/session' && request.method === 'POST') {
          liveConfiguration(env);
          const body = await readBounded(request.body, 1024);
          if (body.length && new TextDecoder().decode(body).trim() !== '{}') throw new HttpError(400, 'invalid_request');
          const { session, token } = await issueSession(env.YOUCAM_API_KEY, origin, now());
          response = json({ mode: 'live', sessionToken: token, expiresAt: session.expiresAt, unitsPerRender: 2 }, 201);
        } else if(path==='/api/operator/holds'||path==='/api/operator/releases'){
          await authorizeOperator(request,env);
          if(request.method!==(path.endsWith('/holds')?'GET':'POST'))throw new HttpError(405,'method_not_allowed');
          const headers=new Headers({'X-WearAgain-Operator':'verified','Content-Type':'application/json'});
          response=await stub(env).fetch(new Request('https://ledger.internal'+path.replace('/api/operator','/operator'),{method:request.method,headers,...(request.method==='POST'?{body:request.body,duplex:'half'}:{})}));
        } else if (/^\/api\/agent(?:\/assets|\/[a-zA-Z0-9-]+(?:\/events)?)?$/.test(path)) {
          liveConfiguration(env);
          const session=await verifySession(request,env.YOUCAM_API_KEY,origin,now());
          const headers=new Headers({'X-WearAgain-Session':session.id});
          if(request.headers.get('Content-Type'))headers.set('Content-Type',request.headers.get('Content-Type'));
          response=await stub(env).fetch(new Request('https://ledger.internal'+path.replace('/api/agent','/agent'),{method:request.method,headers,...(request.method==='POST'?{body:request.body,duplex:'half'}:{})}));
        } else if (path === '/api/ledger' || path === '/api/renders' || /^\/api\/renders\/[a-f0-9]{64}(\/image)?$/.test(path)) {
          liveConfiguration(env);
          const session = await verifySession(request, env.YOUCAM_API_KEY, origin, now());
          const allowedMethod = path === '/api/renders' ? 'POST' : 'GET';
          if (request.method !== allowedMethod) throw new HttpError(405, 'method_not_allowed');
          const internalPath = path === '/api/ledger' ? '/summary' : path.replace('/api/renders', '/renders');
          const headers = new Headers();
          headers.set('X-WearAgain-Session', session.id);
          const contentType = request.headers.get('Content-Type');
          if (contentType) headers.set('Content-Type', contentType);
          response = await stub(env).fetch(new Request(`https://ledger.internal${internalPath}`, {
            method: request.method, headers,
            ...(request.method === 'POST' ? { body: request.body, duplex: 'half' } : {}),
          }));
        } else { throw new HttpError(404, 'not_found'); }
      } catch (error) { response = errorResponse(error); }
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('Vary', 'Origin');
      headers.set('X-Content-Type-Options', 'nosniff');
      if (origin) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Access-Control-Expose-Headers', 'X-WearAgain-Asset-Id, Retry-After');
      }
      return new Response(response.body, { status: response.status, headers });
    },
  };
}

export default createWorker();
