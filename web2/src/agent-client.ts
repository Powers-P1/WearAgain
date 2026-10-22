import {API_ORIGIN} from '../../web/src/config.js';
import {AGENT_CAPS,AGENT_VERSION,parseAgentAnswer,parseAgentSnapshot,parseMemories,record,verifyAgentLook} from '../../src/agent/contract.js';
import type {AgentEvent,AgentResult,AgentSnapshot,Procedure} from '../../src/agent/contract.js';
import type {WardrobeState} from './state.js';
import {loadState} from './state.js';
import {loadSaved,persistSaved,saveChosen} from './stylist.js';
import {readMemory,remember} from './memory.js';
import {loadDaily} from './daily.js';
import {readTrip,TRIP_KEY,NEEDS_KEY,saveLocal} from './plans.js';
import {readPersonal,personalScenario,personalCatalogue} from './personal-purchase.js';
import {readPhoto} from './photo-store.js';
import {selectedAvatar} from './account-ui.js';
import {ensureCredential,storedCredential} from './session-auth.js';
import type {DeviceProfile} from './profiles.js';

const REQUEST_KEY='wearagain:agent:request:v1',APPLIED_KEY='wearagain:agent:applied:v1';
interface RequestRecord {readonly requestId:string;readonly profileId:string;readonly body:string;readonly sessionId:string|null;readonly status:string;readonly result:AgentResult|null;readonly createdAt:string}
interface AgentState {readonly id:string;readonly profileId:string;readonly status:string;readonly events:readonly AgentEvent[];readonly result:unknown;readonly reason:string|null}
type Store=Storage|undefined;
export interface AgentInput {readonly profile:DeviceProfile;readonly wardrobe:WardrobeState;readonly storage:Store;readonly message:string;readonly procedure:Procedure;readonly location:string;readonly date:string;readonly allowPhotos:boolean;readonly allowRenders:boolean;readonly previousSessionId?:string;readonly onEvent?:(event:AgentEvent)=>void}
const base64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
async function bodyJson(response:Response,maximum=1000000):Promise<unknown>{
 const reader=response.body?.getReader();if(!reader)throw Error('Empty server response');const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum){await reader.cancel();throw Error('Response exceeds the supported limit');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
async function request(path:string,token:string,init:RequestInit={}):Promise<Response>{
 if(navigator.onLine===false)throw Error('Offline. Your wardrobe and saved examples still work; live AI needs a connection.');
 const r=await fetch(API_ORIGIN+path,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(135000)});
 if(!r.ok){let code='';try{const error=await bodyJson(r,3000);code=record(error)&&typeof error.error==='string'?error.error:'';}catch{}
  throw Error(code==='agent_daily_limit'?'The daily AI allowance is used. Saved examples remain available.':code==='agent_token_limit'?'This live token has used its three AI sessions. Your wardrobe and saved results remain available.':code==='invalid_session'?'The live token expired. No pending operation was repeated.':code==='agent_not_configured'?'Live AI is not configured on this Worker. Choose the clearly labelled saved demo.':'The live service could not complete this request ('+(code||r.status)+'). Existing data is unchanged.');
 }return r;
}
function parseState(raw:unknown,profileId:string):AgentState{
 if(!record(raw)||typeof raw.id!=='string'||raw.profileId!==profileId||!['running','completed','incomplete'].includes(String(raw.status))||!Array.isArray(raw.events)||raw.events.length>48)throw Error('Unverified agent state');return raw as unknown as AgentState;
}
function parseResult(raw:unknown,snapshot:AgentSnapshot):AgentResult{
 if(!record(raw)||raw.version!==AGENT_VERSION||raw.model!=='claude-sonnet-5-5'||!['completed','incomplete'].includes(String(raw.status))||!record(raw.usage)||!Array.isArray(raw.mutations)||raw.mutations.length>12||!Array.isArray(raw.events)||raw.events.length>48||!Array.isArray(raw.renders)||raw.renders.length>12||!Array.isArray(raw.warnings))throw Error('The AI result could not be verified');
 for(const [key,cap]of Object.entries({inputTokens:1000000,outputTokens:AGENT_CAPS.outputTokens,modelCalls:AGENT_CAPS.modelCalls,toolCalls:AGENT_CAPS.tools})){if(!Number.isSafeInteger(raw.usage[key])||(raw.usage[key] as number)<0||(raw.usage[key] as number)>cap)throw Error('Invalid reported usage');}
 const answer=raw.answer===null?null:parseAgentAnswer(raw.answer,snapshot);if(raw.status==='completed'&&!answer)throw Error('The agent did not submit an answer');
 return {...raw,answer} as unknown as AgentResult;
}
export function savedAgentRequest(storage:Store):RequestRecord|null{try{const value=JSON.parse(storage?.getItem(REQUEST_KEY)??'null') as RequestRecord|null;return value&&typeof value.body==='string'&&typeof value.requestId==='string'?value:null;}catch{return null;}}
function persistRecord(storage:Store,value:RequestRecord){storage?.setItem(REQUEST_KEY,JSON.stringify(value));}
async function photoFile(blob:Blob):Promise<Blob|null>{
 const bitmap=await createImageBitmap(blob);try{
  if(Math.min(bitmap.width,bitmap.height)<384||Math.max(bitmap.width,bitmap.height)<512)return null;
  const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  if(Math.min(canvas.width,canvas.height)<384)return null;const ctx=canvas.getContext('2d');if(!ctx)return null;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  for(const quality of [.88,.75,.6,.45]){const file=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(file&&file.size<=140000)return file;}return null;
 }finally{bitmap.close();}
}
async function uploadPhoto(blob:Blob,token:string):Promise<string|null>{
 const file=await photoFile(blob);if(!file)return null;const bytes=new Uint8Array(await file.arrayBuffer()),hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),id=[...hash].map(b=>b.toString(16).padStart(2,'0')).join('');
 await request('/api/agent/assets',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,mediaType:'image/jpeg',base64:base64(bytes),garmentContainsNoFace:true})});return id;
}
async function buildSnapshot(input:AgentInput,token:string):Promise<AgentSnapshot>{
 const wardrobe:AgentSnapshot['wardrobe'][number][]=[],candidatePhotos:Record<string,string>={};
 for(const item of input.wardrobe.items){let photoId:string|null=null;
  if(input.allowPhotos&&item.photoId){const blob=await readPhoto(item.photoId,input.profile.id);if(blob)photoId=await uploadPhoto(blob,token);}
  wardrobe.push({id:item.id,name:item.name,detail:item.detail,category:item.category,availability:item.availability,photoId});
 }
 const personal=readPersonal(input.storage),scenario=personal.selectedTopIds.length&&Object.keys(personal.needs).length?personalScenario(personal,input.wardrobe):null;
 const catalogue=personalCatalogue(personal),admittedCatalogue=scenario?catalogue:{...catalogue,products:catalogue.products.map(p=>({...p,candidateId:null}))};
 if(input.allowPhotos)for(const candidate of personal.candidates)if(candidate.photoId){const blob=await readPhoto(candidate.photoId,input.profile.id);if(blob){const id=await uploadPhoto(blob,token);if(id)candidatePhotos[candidate.id]=id;}}
 const trip=input.storage?.getItem(TRIP_KEY)?readTrip(input.storage):null;
 return parseAgentSnapshot({version:1,profile:{id:input.profile.id,name:input.profile.name,style:input.wardrobe.style,memories:readMemory(input.storage)},wardrobe,wears:loadDaily(input.storage).wears.map(({date,itemIds})=>({date,itemIds})),savedLooks:loadSaved(input.storage).map(l=>({id:l.id,title:l.title,explanation:l.occasion.slice(0,320),itemIds:l.itemIds})),trip:trip?{destination:trip.destination,from:trip.from,until:trip.until,events:trip.events.map(({date,label})=>({date,label}))}:null,location:input.location,date:input.date,avatarId:selectedAvatar(input.storage),allowRenders:input.allowRenders,scenario,catalogue:admittedCatalogue,candidatePhotos});
}
function applyMutations(result:AgentResult,input:AgentInput){
 if(result.status!=='completed'||!input.storage)return;const store=input.storage,current=loadState(store);
 let applied:string[]=[];try{applied=JSON.parse(store.getItem(APPLIED_KEY)??'[]') as string[];}catch{}
 for(const mutation of result.mutations){if(!mutation||typeof mutation.id!=='string'||applied.includes(mutation.id))continue;
  const data=mutation.data;
  if(mutation.kind==='memory'){const entry=parseMemories([data])[0];if(entry)remember(store,entry);}
  else if(mutation.kind==='outfit'){const look=verifyAgentLook(data,current.items.map(i=>({...i,photoId:i.photoId??null})));const saved=saveChosen(loadSaved(store),{...look,heroImagePath:null},{occasion:input.message,date:input.date,style:current.style},current);if(!persistSaved(saved,store))throw Error('Could not save the selected outfit');}
  else if(mutation.kind==='shopping'){
   if(!Array.isArray(data)||data.length>12)throw Error('Invalid shopping list');const catalogue=personalCatalogue(readPersonal(store));
   const entries=data.map((raw:unknown)=>{if(!record(raw)||typeof raw.id!=='string')throw Error('Invalid product');const product=catalogue.products.find(p=>p.id===raw.id);if(!product)throw Error('The catalogue changed during the conversation');return {id:'need_'+product.id,label:product.label};});saveLocal(NEEDS_KEY,{version:1,entries},store);
  }else if(mutation.kind==='plan'){
   if(!record(data)||!Array.isArray(data.events)||typeof data.destination!=='string'||typeof data.from!=='string'||typeof data.until!=='string')throw Error('Invalid plan');const existing=readTrip(store);
   const events=data.events.map((raw:unknown,index)=>{if(!record(raw)||typeof raw.label!=='string'||typeof raw.date!=='string')throw Error('Invalid trip event');const look=verifyAgentLook(raw.look,current.items.map(i=>({...i,photoId:i.photoId??null})));return {id:'agent_event_'+index,date:raw.date,label:raw.label,outfit:{id:'agent_trip_'+index,title:look.title,occasion:raw.label,date:raw.date,itemIds:look.itemIds},companionItemIds:[]};});
   saveLocal(TRIP_KEY,{...existing,destination:data.destination,from:data.from,until:data.until,events,packed:[]},store);
  }else throw Error('Unsupported agent save action');
  applied.push(mutation.id);store.setItem(APPLIED_KEY,JSON.stringify(applied.slice(-120)));
 }
}
async function followState(initial:AgentState,recordValue:RequestRecord,input:AgentInput,token:string,snapshot:AgentSnapshot):Promise<{sessionId:string;result:AgentResult}>{
 let state=initial;const seen=new Set<number>();const emit=(e:AgentEvent)=>{if(!seen.has(e.sequence)){seen.add(e.sequence);input.onEvent?.(e);}};state.events.forEach(emit);
 if(state.status==='running'){
  try{const response=await request('/api/agent/'+state.id+'/events',token),reader=response.body?.getReader();if(!reader)throw Error('No stream');const decoder=new TextDecoder();let buffer='',bytes=0;
   try{for(;;){const value=await reader.read();if(value.done)break;bytes+=value.value.byteLength;if(bytes>1000000)throw Error('Stream too large');buffer+=decoder.decode(value.value,{stream:true});let index;while((index=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,index);buffer=buffer.slice(index+2);const type=block.split('\n').find(l=>l.startsWith('event: '))?.slice(7),data=block.split('\n').filter(l=>l.startsWith('data: ')).map(l=>l.slice(6)).join('\n');if(type==='progress'&&data)emit(JSON.parse(data) as AgentEvent);if(type==='result'&&data)state=parseState(JSON.parse(data),input.profile.id);if(type==='error')throw Error('Use existing session polling');}}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  }catch{/* The durable session continues. Poll the same ID; never start another model session. */}
 }
 const until=Date.now()+160000;
 while(state.status==='running'&&Date.now()<until){await new Promise(resolve=>setTimeout(resolve,1500));state=parseState(await bodyJson(await request('/api/agent/'+state.id,token)),input.profile.id);state.events.forEach(emit);}
 if(state.status==='running')throw Error('Research is still running. Reopen the stylist to resume this same session.');
 if(!state.result){persistRecord(input.storage,{...recordValue,sessionId:state.id,status:'incomplete'});throw Error('The previous session was interrupted. Its operation will not be repeated automatically.');}
 const result=parseResult(state.result,snapshot);applyMutations(result,input);persistRecord(input.storage,{...recordValue,sessionId:state.id,status:result.status,result});return {sessionId:state.id,result};
}
export async function startLiveAgent(input:AgentInput):Promise<{sessionId:string;result:AgentResult}>{
 const credential=await ensureCredential(input.storage);const snapshot=await buildSnapshot(input,credential.sessionToken),requestId=crypto.randomUUID();
 const body=JSON.stringify({requestId,snapshot,message:input.message,procedure:input.procedure,...(input.previousSessionId?{previousSessionId:input.previousSessionId}:{})});
 let saved:RequestRecord={requestId,profileId:input.profile.id,body,sessionId:null,status:'pending',result:null,createdAt:new Date().toISOString()};persistRecord(input.storage,saved);
 const state=parseState(await bodyJson(await request('/api/agent',credential.sessionToken,{method:'POST',headers:{'Content-Type':'application/json'},body})),input.profile.id);saved={...saved,sessionId:state.id,status:state.status};persistRecord(input.storage,saved);return followState(state,saved,input,credential.sessionToken,snapshot);
}
export async function resumeLiveAgent(input:AgentInput):Promise<{sessionId:string;result:AgentResult}|null>{
 const saved=savedAgentRequest(input.storage);if(!saved||saved.profileId!==input.profile.id)return null;const raw=JSON.parse(saved.body) as {snapshot:unknown;message:string;procedure:Procedure};const snapshot=parseAgentSnapshot(raw.snapshot);
 if(saved.result)return {sessionId:saved.sessionId!,result:parseResult(saved.result,snapshot)};
 const credential=storedCredential(input.storage);if(!credential)throw Error('The previous live token expired. No operation was repeated.');
 const state=parseState(await bodyJson(await request(saved.sessionId?'/api/agent/'+saved.sessionId:'/api/agent',credential.sessionToken,saved.sessionId?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:saved.body})),input.profile.id);return followState(state,saved,{...input,message:raw.message,procedure:raw.procedure,date:snapshot.date,location:snapshot.location},credential.sessionToken,snapshot);
}
export async function agentPreviewImage(renderKey:string,storage:Store):Promise<{url:string;status:string}>{
 if(!/^[a-f0-9]{64}$/.test(renderKey))throw Error('Invalid render reference');const credential=storedCredential(storage);if(!credential)throw Error('The preview session expired.');
 const raw=await bodyJson(await request('/api/renders/'+renderKey,credential.sessionToken));if(!record(raw)||typeof raw.status!=='string')throw Error('Invalid preview state');if(raw.status!=='succeeded')return {url:'',status:raw.status};
 const response=await request('/api/renders/'+renderKey+'/image',credential.sessionToken);const blob=await response.blob();if(blob.size>10000000||!['image/jpeg','image/png'].includes(blob.type))throw Error('Invalid image response');return {url:URL.createObjectURL(blob),status:'ready'};
}
