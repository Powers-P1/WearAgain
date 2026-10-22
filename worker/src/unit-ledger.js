import { Ledger } from './ledger.js';
import { fetchAvatar, resolveAvatar } from './assets.js';
import { MAX_REQUEST_BYTES, PIPELINE_REVISION, POLL_INTERVAL_MS, RETENTION_MS, ledgerLimits } from './config.js';
import { HttpError, digest, errorResponse, exactObject, json, opaque, readBounded } from './http.js';
import {AgentService} from './agent-service.js';
import {AgentStore} from './agent-store.js';

const encoder = new TextEncoder();
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function parseRender(request, inspectImage) {
  const type = request.headers.get('Content-Type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data;')) throw new HttpError(415, 'multipart_required');
  const bytes = await readBounded(request.body, MAX_REQUEST_BYTES);
  let form;
  try { form = await new Response(bytes, { headers: { 'Content-Type': type } }).formData(); }
  catch { throw new HttpError(400, 'invalid_request'); }
  if ([...form.keys()].length !== 2 || form.getAll('metadata').length !== 1 || form.getAll('garment').length !== 1) throw new HttpError(400, 'invalid_request');
  const raw = form.get('metadata');
  const garment = form.get('garment');
  if (typeof raw !== 'string' || raw.length > 2048 || !(garment instanceof Blob)) throw new HttpError(400, 'invalid_request');
  let metadata;
  try { metadata = JSON.parse(raw); } catch { throw new HttpError(400, 'invalid_request'); }
  exactObject(metadata, ['element', 'avatarId', 'attempt', 'garmentContainsNoFace']);
  exactObject(metadata.element, ['kind', 'id']);
  if (!['top', 'outerwear'].includes(metadata.element.kind) || metadata.garmentContainsNoFace !== true || !Number.isSafeInteger(metadata.attempt) || metadata.attempt < 0 || metadata.attempt > 1000) throw new HttpError(400, 'invalid_request');
  opaque(metadata.element.id);
  const avatar = resolveAvatar(metadata.avatarId);
  if (!['image/jpeg', 'image/png'].includes(garment.type)) throw new HttpError(415, 'unsupported_image');
  const image = { bytes: new Uint8Array(await garment.arrayBuffer()), contentType: garment.type, fileName: garment.type === 'image/png' ? 'garment.png' : 'garment.jpg' };
  try { inspectImage(image.bytes, image.contentType, 'uploadImage'); }
  catch { throw new HttpError(400, 'invalid_image'); }
  const identity = {
    element: { kind: metadata.element.kind, id: metadata.element.id },
    garmentRevision: await digest(image.bytes), baseRevision: avatar.baseRevision,
    pipelineRevision: PIPELINE_REVISION, attempt: metadata.attempt,
  };
  const renderKey = await digest(encoder.encode(JSON.stringify(identity)));
  return { image, avatar, identity, renderKey };
}

/** Dependencies keep network-free integration tests on the actual orchestration. */
export function createUnitLedgerClass({ clientFactory, inspectImage, fetchImpl = fetch, fetchAvatarImage = fetchAvatar, now = Date.now, sleep = defaultSleep,agentRunner,parseAgentSnapshot,agentProcedures }) {
  return class {
    constructor(ctx, env) {
      this.ctx = ctx;
      this.env = env;
      this.ledger = new Ledger(ctx.storage, ledgerLimits(env));
      this.agentStore=new AgentStore(ctx.storage);
      this.polling = new Map();
      this.submitting = new Set();
      this.client = null;
      this.heavyInFlight = false;
      this.agent=null;
    }

    async withImageMemory(operation) {
      // One large multipart/download at a time per global DO. Admission happens
      // before buffering bytes and never creates a reservation when busy.
      if (this.heavyInFlight) throw new HttpError(429, 'render_busy');
      this.heavyInFlight = true;
      try { return await operation(); }
      finally { this.heavyInFlight = false; }
    }

    provider() {
      if (!this.client) {
        const extraHosts = this.env.YOUCAM_ASSET_HOSTS?.split(',').map(value => value.trim()).filter(Boolean);
        this.client = clientFactory({
          apiKey: this.env.YOUCAM_API_KEY, fetchImpl, requestTimeoutMs: 10_000,
          ...(extraHosts?.length ? { allowedAssetHosts: extraHosts } : {}),
          beforeRequest: async () => {
            const deadline = now() + 10_000;
            while (true) {
              const slot = this.ledger.claimRequestSlot(now());
              if (slot.allowed) return;
              if (now() + slot.retryAfterMs > deadline) throw new HttpError(429, 'provider_rate_limited');
              await sleep(Math.max(1, slot.retryAfterMs));
            }
          },
        });
      }
      return this.client;
    }

    publicRecord(record) {
      const terminal = ['succeeded', 'failed_free'].includes(record.status);
      return {
        renderKey: record.renderKey,
        status: record.status === 'succeeded' ? 'succeeded' : record.status === 'failed_free' ? 'error' : 'pending',
        accounting: record.status === 'succeeded' ? 'charged' : record.status === 'failed_free' ? 'released' : 'reserved',
        reservedUnits: terminal ? 0 : 2, chargedUnits: record.status === 'succeeded' ? 2 : 0,
        reason: record.reason==='provider_running'?null:record.reason,
        providerStatus:record.reason==='provider_running'?'running':record.status==='succeeded'?'succeeded':record.status==='failed_free'?'error':'unknown',
        retryAfterMs:terminal?0:Math.max(1000,(record.nextPollAt??now()+3000)-now()),
        requiresReconciliation: !terminal && (!record.taskId || record.nextPollAt === null) && !this.submitting.has(`${record.sessionId}:${record.renderKey}`),
        assetId: record.status === 'succeeded' ? `youcam:${record.renderKey}` : null,
        imageUrl: record.status === 'succeeded' ? `/api/renders/${record.renderKey}/image` : null,
        statusUrl: `/api/renders/${record.renderKey}`,
        // A successful task is charged before download. The browser marks its
        // preview ready only after a successful image response, not this status.
        imageRequiresDownload: record.status === 'succeeded',
      };
    }

    result(record, extra = {}) {
      return json({ mode: 'live', ...this.publicRecord(record), budget: this.ledger.summary(record.sessionId, now()), ...extra }, ['succeeded', 'failed_free'].includes(record.status) ? 200 : 202);
    }

    async schedule() {
      const row = this.ctx.storage.sql.exec('SELECT MIN(next_poll_at) AS next FROM render_reservations WHERE status = ? AND task_id IS NOT NULL', 'pending').toArray()[0];
      const expiry=this.ctx.storage.sql.exec("SELECT MIN(created_at+600000) AS next FROM render_reservations WHERE pre_submission_guard=1 AND submitted_at IS NULL AND task_id IS NULL AND (status='reserved' OR (status='pending' AND reason='upload_failed_before_submission'))").toArray()[0];
      const next=Math.min(row?.next??Infinity,expiry?.next??Infinity,this.agentStore.nextExpiry());
      if (Number.isFinite(next)) {
        await this.ctx.storage.setAlarm(Math.max(now() + 100, next));
      }
    }

    async start(request, sessionId) {
      const input = await parseRender(request, inspectImage);
      const id = `${sessionId}:${input.renderKey}`;
      // Existing render requests reuse their reservation and never repeat POST.
      const existing = this.ledger.get(sessionId, input.renderKey);
      if (existing) return this.result(existing, { identity: input.identity, replayed: true });
      let provider;
      try { provider = this.provider(); }
      catch { throw new HttpError(503, 'invalid_live_configuration'); }
      // Approved base download and both input checks precede any reservation.
      const person = await fetchAvatarImage(input.avatar, fetchImpl);
      try { inspectImage(person.bytes, person.contentType, 'uploadImage'); }
      catch { throw new HttpError(503, 'avatar_image_invalid'); }
      const reserved = this.ledger.reserve({ sessionId, renderKey: input.renderKey, requestHash: input.renderKey, now: now() });
      if (!reserved.created) return this.result(reserved.record, { identity: input.identity, replayed: true });
      await this.schedule();
      this.submitting.add(id);
      try {
        const src = await provider.uploadImage(person);
        const ref = await provider.uploadImage(input.image);
        this.ledger.markSubmitting(sessionId, input.renderKey, now());
        const task = await provider.createTask({ srcFileId: src.fileId, refFileId: ref.fileId });
        // Arrange a durable wakeup as soon as an accepted task is known. No
        // image, upload URL or result URL enters the ledger.
        const alarmWrite = this.ctx.storage.setAlarm(now() + POLL_INTERVAL_MS);
        this.ledger.attachTask(sessionId, input.renderKey, task.taskId, now());
        this.ledger.setNextPoll(sessionId, input.renderKey, now() + POLL_INTERVAL_MS, now());
        await alarmWrite;
      } catch (error) {
        if (error?.name === 'YouCamError' && error.operation === 'createTask' && error.confirmedNoCharge === true && error.httpStatus === 400) {
          this.ledger.settleFreeError(sessionId, input.renderKey, { kind: 'create_validation', errorCode: 'InvalidParameters', httpStatus: 400 }, now());
        } else {
          const current = this.ledger.get(sessionId, input.renderKey);
          this.ledger.markPending(sessionId, input.renderKey, current.taskId ? 'poll_pending' : current.submittedAt===null?'upload_failed_before_submission':'submission_outcome_unknown', now());
          if (current.taskId) this.ledger.setNextPoll(sessionId, input.renderKey, now() + POLL_INTERVAL_MS, now());
        }
      } finally { this.submitting.delete(id); }
      await this.schedule();
      return this.result(this.ledger.get(sessionId, input.renderKey), { identity: input.identity, replayed: false });
    }

    async reconcile(record) {
      if (record.status !== 'pending' || !record.taskId || record.nextPollAt === null || record.nextPollAt > now()) return record;
      const id = `${record.sessionId}:${record.renderKey}`;
      if (this.polling.has(id)) return this.polling.get(id);
      const operation = this.pollOnce(record);
      this.polling.set(id, operation);
      try { return await operation; }
      finally { this.polling.delete(id); }
    }

    async pollOnce(record) {
      const { sessionId, renderKey, taskId } = record;
      if (now() - record.createdAt >= RETENTION_MS) return this.ledger.stopPolling(sessionId, renderKey, 'retention_expired_outcome_unknown', now());
      try {
        const state = await this.provider().getTask(taskId);
        if (state.status === 'success') return this.ledger.settleSuccess(sessionId, renderKey, now());
        if (state.status === 'error') {
          if (state.confirmedNoCharge === true && state.errorCode === 'error_decode_image') {
            return this.ledger.settleFreeError(sessionId, renderKey, { kind: 'task_error', taskId, errorCode: state.errorCode }, now());
          }
          return this.ledger.stopPolling(sessionId, renderKey, 'provider_error_charge_unknown', now());
        }
        this.ledger.markPending(sessionId, renderKey, 'provider_running', now());
        return this.ledger.setNextPoll(sessionId, renderKey, now() + POLL_INTERVAL_MS, now());
      } catch {
        this.ledger.markPending(sessionId, renderKey, 'poll_outcome_unknown', now());
        return this.ledger.setNextPoll(sessionId, renderKey, now() + 30_000, now());
      }
    }

    async image(record) {
      if (record.status !== 'succeeded') return this.result(record);
      if (now() - record.settledAt >= RETENTION_MS) throw new HttpError(410, 'result_expired');
      try {
        // Refresh the short-lived signed URL via the task API. Never persist it.
        const state = await this.provider().getTask(record.taskId);
        if (state.status !== 'success') throw new Error();
        const image = await this.provider().downloadResult(state.resultUrl);
        return new Response(image.bytes, { status: 200, headers: {
          'Content-Type': image.contentType, 'Cache-Control': 'no-store',
          'X-WearAgain-Asset-Id': `youcam:${record.renderKey}`,
        } });
      } catch { throw new HttpError(502, 'result_download_unavailable'); }
    }

    async fetch(request) {
      try {
        const path = new URL(request.url).pathname;
        if (path === '/health' && request.method === 'GET') return json({ ok: true, ledger: 'sqlite', unitsPerRender: 2 });
        this.ledger.expireUnsubmitted(now());
        if(path.startsWith('/operator/')){
          if(request.headers.get('X-WearAgain-Operator')!=='verified')throw new HttpError(401,'operator_required');
          if(path==='/operator/holds'&&request.method==='GET')return json({holds:this.ledger.heldReservations(now()),releaseScope:'Only an authenticated operator may release ambiguous holds after confirming no charge.'});
          if(path==='/operator/releases'&&request.method==='POST'){
            let body;try{body=JSON.parse(new TextDecoder().decode(await readBounded(request.body,4096)));}catch{throw new HttpError(400,'invalid_request');}
            if(body?.confirmedNoCharge!==true)throw new HttpError(400,'operator_evidence_required');
            const record=this.ledger.releaseReservation({sessionId:body.sessionId,renderKey:body.renderKey,reason:body.reason,evidence:body.evidence,actor:'operator',now:now()});return json({status:record.status,accounting:'released',renderKey:record.renderKey});
          }throw new HttpError(404,'not_found');
        }
        const sessionId = opaque(request.headers.get('X-WearAgain-Session'));
        if(path==='/agent'||path.startsWith('/agent/')){
          this.agent??=new AgentService(this,{now,fetchImpl,inspectImage,runner:agentRunner,parseSnapshot:parseAgentSnapshot,procedures:agentProcedures});
          return await this.agent.handle(request,path,sessionId);
        }
        if (path === '/summary' && request.method === 'GET') return json(this.ledger.summary(sessionId, now()));
        if (path === '/renders' && request.method === 'POST') return await this.withImageMemory(() => this.start(request, sessionId));
        const match = /^\/renders\/([a-f0-9]{64})(\/image)?$/.exec(path);
        if (match && request.method === 'GET') {
          let record = this.ledger.get(sessionId, match[1]);
          if (!record) throw new HttpError(404, 'render_not_found');
          record = await this.reconcile(record);
          await this.schedule();
          return match[2] ? await this.withImageMemory(() => this.image(record)) : this.result(record);
        }
        throw new HttpError(404, 'not_found');
      } catch (error) { return errorResponse(error); }
    }

    async alarm() {
      // Bounded batch; the next alarm resumes remaining work. Pending state
      // survives browser closure and alarms can be delivered more than once.
      try {
        this.ledger.expireUnsubmitted(now());
        this.agentStore.cleanup(now());
        for (const record of this.ledger.dueTasks(now(), 5)) await this.reconcile(record);
      } finally { await this.schedule(); }
    }
  };
}
