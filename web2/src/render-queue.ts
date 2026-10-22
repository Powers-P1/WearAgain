import type { LiveClient, LiveRenderResponse } from '../../web/src/live.js';
import { readPhoto, storePhoto, deletePhoto } from './photo-store.js';
import {sessionTransport,storedCredential} from './session-auth.js';
import {API_ORIGIN} from '../../web/src/config.js';
import {selectedAvatar} from './account-ui.js';

export type JobStatus = 'queued' | 'submitting' | 'processing' | 'ready' | 'error' | 'unknown';
export interface PreviewJob { readonly itemId: string; readonly status: JobStatus; readonly renderKey: string | null; readonly photoId: string | null; readonly error: string | null }
export const QUEUE_KEY = 'wearagain:web2:render-queue:v1';
type Store = Pick<Storage, 'getItem' | 'setItem'> | undefined;
class QueueError extends Error { constructor(readonly code:string,readonly status:number){super(code);} }
const apiFailure=(error:unknown):error is Error & {code:string;status:number;retryAfterMs:number} =>
  error instanceof Error && 'code' in error && typeof error.code==='string' && 'status' in error && typeof error.status==='number';
interface PhotoRepository { input(id: string): Promise<File>; output(id: string, blobUrl: string): Promise<void>; remove?(id: string): Promise<void> }
export function parseQueue(raw: unknown,resume=false): PreviewJob[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || !Array.isArray(value.jobs) || value.jobs.length > 120) return [];
  const seen = new Set<string>();
  return value.jobs.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.itemId !== 'string' || !/^[a-zA-Z0-9_-]{1,56}$/.test(row.itemId) || seen.has(row.itemId) ||
      !['queued','submitting','processing','ready','error','unknown'].includes(String(row.status)) ||
      !(row.renderKey === null || typeof row.renderKey === 'string' && /^[a-f0-9]{64}$/.test(row.renderKey)) ||
      !(row.photoId === null || typeof row.photoId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(row.photoId)) ||
      !(row.error === null || typeof row.error === 'string' && row.error.length <= 100)) return [];
    if (row.status === 'ready' && !row.photoId) return [];
    seen.add(row.itemId);
    // Only a known key bound to the exact still-valid capability can resume GET polling.
    // A lost POST response never starts a replacement submission.
    const interrupted = row.status === 'submitting' || row.status === 'processing'&&(!resume||!row.renderKey);
    return [{ itemId: row.itemId, status: interrupted ? 'unknown' : row.status as JobStatus,
      renderKey: row.renderKey as string | null, photoId: row.photoId as string | null,
      error: interrupted ? 'session_ended' : row.error as string | null }];
  });
}
/** Decode/resize locally before the existing bounded API sees a garment. */
export async function prepareGarment(blob: Blob): Promise<File> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
    if (Math.min(width, height) < 384 || Math.max(width, height) < 512) throw new QueueError('invalid_image', 400);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) throw new QueueError('invalid_image', 400);
    context.fillStyle = '#ffffff'; context.fillRect(0,0,width,height); context.drawImage(bitmap,0,0,width,height);
    const converted = await new Promise<Blob>((resolve,reject) => canvas.toBlob(result => result ? resolve(result) : reject(new QueueError('invalid_image',400)), 'image/jpeg', .9));
    if (converted.size >= 10_000_000) throw new QueueError('invalid_image',400);
    return new File([converted], 'garment.jpg', {type:'image/jpeg'});
  } finally { bitmap.close(); }
}
const browserPhotos: PhotoRepository = {
  async input(id) { const blob = await readPhoto(id); if (!blob) throw new QueueError('photo_missing',400); return prepareGarment(blob); },
  async output(id,url) {
    if (!url.startsWith('blob:')) throw new QueueError('invalid_image_response',502);
    const blob = await (await fetch(url)).blob();
    await storePhoto(id,new File([blob],'preview.jpg',{type:blob.type}));
  },
  remove: deletePhoto,
};
export class PreviewQueue {
  #client: LiveClient | null;
  #photos: PhotoRepository;
  #store: Store;
  #jobs: PreviewJob[] = [];
  #active = new Set<string>();
  #enabled = false;
  #disposed = false;
  #changed: () => void;
  #sessionToken:string|null=null;
  constructor(store: Store, changed: () => void, client?: LiveClient, photos: PhotoRepository = browserPhotos) {
    this.#store=store; this.#client=client??null; this.#photos=photos; this.#changed=changed;
    try { const raw=store?.getItem(QUEUE_KEY),value=raw?JSON.parse(raw) as Record<string,unknown>:null,credential=storedCredential(store);this.#sessionToken=credential?.sessionToken??null;this.#jobs=value?parseQueue(value,!!credential&&value.sessionToken===credential.sessionToken):[]; } catch { /* Fresh device queue. */ }
  }
  get enabled(): boolean { return this.#enabled; }
  get jobs(): readonly PreviewJob[] { return this.#jobs; }
  async enable(): Promise<void> {
    this.#client??=(await import('../../web/src/live.js')).createLiveClient(API_ORIGIN,sessionTransport(this.#store));
    await this.#client.startSession();const token=storedCredential(this.#store)?.sessionToken??null;
    if(this.#sessionToken&&token!==this.#sessionToken)this.#jobs=this.#jobs.map(job=>job.status==='processing'?{...job,status:'unknown',error:'session_ended'}:job);
    this.#sessionToken=token;this.#enabled=true;this.#persist();this.#pump();
  }
  pause(): void { this.#enabled=false; this.#changed(); }
  enqueue(itemId: string): void {
    if (!/^[a-zA-Z0-9_-]{1,56}$/.test(itemId) || this.#jobs.some(job=>job.itemId===itemId) || this.#jobs.length>=120) return;
    this.#jobs.push({itemId,status:'queued',renderKey:null,photoId:null,error:null}); this.#persist(); this.#pump();
  }
  remove(itemId: string): void {
    const job=this.#jobs.find(row=>row.itemId===itemId);
    this.#jobs=this.#jobs.filter(row=>row.itemId!==itemId);
    if(job?.photoId)void this.#photos.remove?.(job.photoId).catch(()=>{});
    // A submitted provider task remains subject to server accounting. Removing
    // its local row never promises a refund or resubmits it under a new identity.
    this.#persist();
  }
  #persist(): void {
    try { this.#store?.setItem(QUEUE_KEY,JSON.stringify({version:1,sessionToken:this.#sessionToken,jobs:this.#jobs})); } catch { /* Queue remains usable in this tab. */ }
    this.#changed();
  }
  #update(itemId:string,change:Partial<PreviewJob>):void {
    this.#jobs=this.#jobs.map(job=>job.itemId===itemId?{...job,...change}:job);this.#persist();
  }
  #pump(): void {
    if (!this.#enabled || this.#disposed) return;
    for (const job of this.#jobs) {
      if (this.#active.size>=2) break;
      if (!['queued','processing'].includes(job.status)||this.#active.has(job.itemId)) continue;
      this.#active.add(job.itemId);
      void this.#run(job).finally(()=>{this.#active.delete(job.itemId);this.#pump();});
    }
  }
  async #run(job:PreviewJob):Promise<void> {
    let submitted=false;
    try {
      // Mark as submitting before the request. No automatic new attempt on an
      // uncertain outcome, and no rating is ever inferred from an API error.
      let record:LiveRenderResponse;
      if(job.status==='processing'&&job.renderKey){record=await this.#client!.poll(job.renderKey);submitted=true;}
      else{
      this.#update(job.itemId,{status:'submitting',error:null});
      const garment=await this.#photos.input(job.itemId);
      if(this.#disposed||!this.#jobs.some(row=>row.itemId===job.itemId))return;
      if(!this.#enabled){this.#update(job.itemId,{status:'queued'});return;}
      try {
        submitted=true;
        record=await this.#client!.submit({element:{kind:'outerwear',id:job.itemId},avatarId:selectedAvatar(this.#store),attempt:0,garment,garmentContainsNoFace:true});
      } catch(error) {
        if(apiFailure(error)&&error.code==='render_busy') {
          submitted=false;
          await new Promise(resolve=>setTimeout(resolve,Math.max(2000,error.retryAfterMs||0)));
          this.#update(job.itemId,{status:'queued'});return;
        }
        throw error;
      }
      this.#update(job.itemId,{renderKey:record.renderKey,status:'processing'});
      }
      while(record.status==='pending'&&!this.#disposed) {
        if(record.requiresReconciliation) {this.#update(job.itemId,{status:'unknown',error:'reconciliation_required'});return;}
        await new Promise(resolve=>setTimeout(resolve,3000));
        if(this.#disposed)return;
        record=await this.#client!.poll(record.renderKey);
      }
      if(this.#disposed)return;
      if(record.status==='error'){this.#update(job.itemId,{status:'error',error:record.reason??'render_failed'});return;}
      if(!this.#jobs.some(row=>row.itemId===job.itemId))return;
      const result=await this.#client!.loadImage(record);
      const photoId='result_'+job.itemId;
      try{await this.#photos.output(photoId,result.url);}finally{this.#client!.releaseImage(result.url);}
      if(!this.#jobs.some(row=>row.itemId===job.itemId)){await this.#photos.remove?.(photoId);return;}
      this.#update(job.itemId,{status:'ready',photoId,error:null});
    } catch(error) {
      const code=apiFailure(error)?error.code:'connection_error';
      // The Worker returns these 503s before reserving units or contacting
      // YouCam. A generic 503 or a lost response still has an unknown outcome.
      const beforeReservation=apiFailure(error)&&error.status===503&&
        ['avatar_image_unavailable','avatar_image_invalid','invalid_live_configuration'].includes(code);
      const uncertain=submitted&&!(apiFailure(error)&&error.status>=400&&error.status<500)&&!beforeReservation;
      if(code==='limit_exceeded'||code==='invalid_session')this.#enabled=false;
      this.#update(job.itemId,{status:uncertain?'unknown':'error',error:code});
    }
  }
  dispose():void {this.#disposed=true;this.#enabled=false;this.#client?.dispose();}
}
