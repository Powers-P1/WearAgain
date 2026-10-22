import {digest,HttpError,json,opaque,readBounded} from './http.js';
import {AgentStore} from './agent-store.js';
const encoder=new TextEncoder();
export const agentEnabled=env=>typeof env.ANTHROPIC_API_KEY==='string'&&env.ANTHROPIC_API_KEY.trim().length>0;
function bytesFromBase64(value){const raw=atob(value),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}
function base64(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
export class AgentService{
 constructor(unit,{now=Date.now,fetchImpl=fetch,inspectImage,runner,parseSnapshot,procedures}){this.unit=unit;this.store=unit.agentStore??new AgentStore(unit.ctx.storage);this.now=now;this.transport=fetchImpl;this.inspectImage=inspectImage;this.runner=runner;this.parseSnapshot=parseSnapshot;this.procedures=procedures;}
 async handle(request,path,owner){
  if(!agentEnabled(this.unit.env)||!this.runner||!this.parseSnapshot||!this.procedures)throw new HttpError(503,'agent_not_configured');
  if(path==='/agent/assets'&&request.method==='POST'){
   const raw=await readBounded(request.body,200000);let body;try{body=JSON.parse(new TextDecoder().decode(raw));}catch{throw new HttpError(400,'invalid_agent_asset');}
   if(!body||body.garmentContainsNoFace!==true||typeof body.base64!=='string'||!['image/jpeg','image/png'].includes(body.mediaType))throw new HttpError(400,'invalid_agent_asset');
   const id=opaque(body.id);let bytes;try{bytes=bytesFromBase64(body.base64);this.inspectImage(bytes,body.mediaType,'uploadImage');}catch{throw new HttpError(400,'invalid_agent_asset');}
   if(bytes.length>140000)throw new HttpError(413,'agent_asset_too_large');
   if(id!==await digest(bytes))throw new HttpError(400,'asset_digest_mismatch');
   this.store.putAsset(owner,id,body.mediaType,base64(bytes),this.now());await this.unit.schedule();return json({id,status:'stored',retentionHours:6},201);
  }
  if(path==='/agent'&&request.method==='POST'){
   const raw=await readBounded(request.body,250000);let body,snapshot;
   try{body=JSON.parse(new TextDecoder().decode(raw));if(!body||!Object.hasOwn(this.procedures,body.procedure)||typeof body.message!=='string'||!body.message.trim()||body.message.length>2000)throw Error();snapshot=this.parseSnapshot(body.snapshot);}catch{throw new HttpError(400,'invalid_agent_request');}
   const requestId=opaque(body.requestId);let previous=null;
   if(body.previousSessionId){const prior=this.store.get(owner,opaque(body.previousSessionId),this.now());if(prior.profile_id!==snapshot.profile.id||prior.state!=='completed')throw new HttpError(409,'agent_previous_unavailable');previous=JSON.parse(prior.result)?.answer??null;}
   const hash=await digest(raw);this.store.cleanup(this.now());
   const reservation=this.store.start({owner,requestId,requestHash:hash,profileId:snapshot.profile.id,now:this.now()});
   await this.unit.schedule();
   if(reservation.created){
    const id=reservation.row.id;
    const task=this.runner({snapshot,message:body.message,procedure:body.procedure,previous,apiKey:this.unit.env.ANTHROPIC_API_KEY,fetch:this.transport,now:this.now,
     emit:event=>this.store.event(owner,id,event,this.now()),photo:photoId=>Promise.resolve(this.store.asset(owner,photoId,this.now())),
     render:async(item,avatarId,kind)=>{
      const claim=this.store.claimRender(owner,id,item.id,this.now());if(!claim.created)return claim.result;
      const photo=this.store.asset(owner,item.photoId,this.now());if(!photo){const result={status:'UNKNOWN',reason:'Clothing photo missing or expired; no provider task submitted'};this.store.recordRender(id,item.id,result);return result;}
      const form=new FormData();form.set('metadata',JSON.stringify({element:{kind,id:item.id},avatarId,attempt:0,garmentContainsNoFace:true}));form.set('garment',new Blob([bytesFromBase64(photo.base64)],{type:photo.mediaType}),'garment.jpg');
      let result;try{const response=await this.unit.withImageMemory(()=>this.unit.start(new Request('https://ledger.internal/renders',{method:'POST',body:form}),owner));result=await response.json();}catch{result={status:'UNKNOWN',reason:'Render could not be submitted or its outcome is unresolved; do not repeat under a new identity'};}
      this.store.recordRender(id,item.id,result);return result;
     },
    }).then(result=>this.store.finish(owner,id,result,this.now())).catch(()=>this.store.fail(owner,id,this.now()));
    this.unit.ctx.waitUntil(task);
   }
   return json({...this.store.public(this.store.get(owner,reservation.row.id,this.now())),replayed:!reservation.created},reservation.created?201:200);
  }
  const match=/^\/agent\/([a-zA-Z0-9-]+)(\/events)?$/.exec(path);
  if(match&&request.method==='GET'){
   const id=match[1],row=this.store.get(owner,id,this.now());if(!match[2])return json(this.store.public(row));
   let cancelled=false;
   const stream=new ReadableStream({start:async controller=>{
    let delivered=0;const end=this.now()+125000;
    try{while(!cancelled&&this.now()<end){const current=this.store.get(owner,id,this.now()),state=this.store.public(current);for(const event of state.events){if(event.sequence>delivered){controller.enqueue(encoder.encode(`id: ${event.sequence}\nevent: progress\ndata: ${JSON.stringify(event)}\n\n`));delivered=event.sequence;}}
      if(state.status!=='running'){controller.enqueue(encoder.encode(`event: result\ndata: ${JSON.stringify(state)}\n\n`));break;}
      controller.enqueue(encoder.encode(': heartbeat\n\n'));await new Promise(resolve=>setTimeout(resolve,1000));
     }}catch{if(!cancelled)controller.enqueue(encoder.encode('event: error\ndata: {"error":"poll_existing_session"}\n\n'));}finally{if(!cancelled)controller.close();}
   },cancel(){cancelled=true;}});
   return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform'}});
  }
  throw new HttpError(404,'not_found');
 }
}
