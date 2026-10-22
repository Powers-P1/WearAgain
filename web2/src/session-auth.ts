import {API_ORIGIN} from '../../web/src/config.js';
type Store=Pick<Storage,'getItem'|'setItem'>|undefined;
const KEY='wearagain:agent:credential:v1';
export interface LiveCredential{readonly sessionToken:string;readonly expiresAt:number}
let pending:Promise<LiveCredential>|null=null;
export function storedCredential(store:Store):LiveCredential|null{try{const raw=store?.getItem(KEY),v:unknown=raw?JSON.parse(raw):null;if(v&&typeof v==='object'&&'sessionToken'in v&&typeof v.sessionToken==='string'&&'expiresAt'in v&&typeof v.expiresAt==='number'&&v.expiresAt>Date.now()+10000)return v as LiveCredential;}catch{}return null;}
export async function ensureCredential(store:Store):Promise<LiveCredential>{
 const saved=storedCredential(store);if(saved)return saved;if(navigator.onLine===false)throw Error('Offline. Live AI and previews need a connection.');
 pending??=(async()=>{const r=await fetch(API_ORIGIN+'/api/session',{method:'POST',credentials:'omit',cache:'no-store',redirect:'error'});if(!r.ok)throw Error('The live service could not start a session.');const v=await r.json() as Record<string,unknown>;if(typeof v.sessionToken!=='string'||typeof v.expiresAt!=='number')throw Error('Invalid live session response');const credential={sessionToken:v.sessionToken,expiresAt:v.expiresAt};store?.setItem(KEY,JSON.stringify(credential));return credential;})().finally(()=>{pending=null;});return pending;
}
/** Lets the existing render client share the same anonymous capability and reuse render keys. */
export function sessionTransport(store:Store):typeof fetch{return async(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input));
 if(url.origin===API_ORIGIN&&url.pathname==='/api/session'&&init?.method==='POST'){const credential=await ensureCredential(store);return Response.json({...credential,mode:'live',unitsPerRender:2}, {status:201});}
 return fetch(input,init);
};}
