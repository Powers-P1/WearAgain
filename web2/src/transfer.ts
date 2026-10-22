import {parseStored,STORAGE_KEY} from './state.js';
import {readPhoto,storePhoto,deletePhoto} from './photo-store.js';
import {profileStorage,registerProfile} from './profiles.js';
import type {DeviceProfile} from './profiles.js';
import {parseDaily,parseDecisions} from './daily.js';
import {parseSaved} from './stylist.js';
import {parseTrip,readNeeds,readSurprise} from './plans.js';
import {parseShopping} from './shopping.js';
import {parsePersonal} from './personal-purchase.js';
import {parseMemories} from '../../src/agent/contract.js';
import avatars from '../../fixtures/base_models/avatars.json' with {type:'json'};
const ALLOWED=['wearagain:web2:demo-wardrobe:v1','wearagain:web2:looks:v1','wearagain:web2:daily:v1','wearagain:web2:decisions:v1','wearagain:web2:trip:v1','wearagain:web2:needs:v1','wearagain:web2:surprise:v1','wearagain:web2:shopping:v1','wearagain:web2:personal-purchase:v1','wearagain:agent:memory:v1','wearagain:agent:avatar:v1'];
interface Transfer {version:1;kind:'wearagain-wardrobe-transfer';name:string;createdAt:string;records:Record<string,string>;photos:readonly {id:string;type:string;base64:string}[]}
function validateRecord(key:string,value:string):void{
 if(key==='wearagain:agent:avatar:v1'){if(!avatars.avatars.some(a=>a.id===value))throw Error('Unknown preview model');return;}
 const raw=JSON.parse(value),store={getItem:()=>value,setItem:()=>{}};let parsed:unknown=raw;
 if(key.endsWith(':looks:v1'))parsed={version:1,looks:parseSaved(raw)};
 else if(key.endsWith(':daily:v1'))parsed=parseDaily(raw);
 else if(key.endsWith(':decisions:v1'))parsed=parseDecisions(raw);
 else if(key.endsWith(':trip:v1'))parsed=parseTrip(raw);
 else if(key.endsWith(':needs:v1'))parsed={version:1,entries:readNeeds(store)};
 else if(key.endsWith(':surprise:v1'))parsed=readSurprise(store);
 else if(key.endsWith(':shopping:v1'))parsed=parseShopping(raw);
 else if(key.endsWith(':personal-purchase:v1')){parsePersonal(raw);return;}
 else if(key.endsWith(':memory:v1')){parseMemories(raw);return;}
 const canonical=(value:unknown):string=>JSON.stringify(value,(_k,v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 if(canonical(parsed)!==canonical(raw))throw Error('Invalid or unsupported transfer metadata: '+key);
}
function base64(bytes:Uint8Array):string{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
/** Only explicitly referenced clothing/candidate images; never auth, agent sessions or try-on person photos. */
function photoIds(records:Record<string,string>):string[]{const found=new Set<string>();const visit=(v:unknown)=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(visit);return;}for(const[k,x]of Object.entries(v)){if(k==='photoId'&&typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x))found.add(x);else if(k!=='avatar'&&k!=='personalPhoto')visit(x);}};for(const key of [STORAGE_KEY,'wearagain:web2:shopping:v1','wearagain:web2:trip:v1','wearagain:web2:personal-purchase:v1'])if(records[key])visit(JSON.parse(records[key]!));return [...found];}
export async function exportTransfer(profile:DeviceProfile,store:Storage):Promise<Blob>{
 const records:Record<string,string>={};for(const key of ALLOWED){const value=store.getItem(key);if(value!==null)records[key]=value;}
 const photos:Transfer['photos'][number][]=[];let total=0;for(const id of photoIds(records)){const photo=await readPhoto(id,profile.id);if(!photo)throw Error('A referenced clothing photo is missing from device storage. Restore or remove that photo before exporting.');total+=photo.size;if(total>30000000)throw Error('Clothing photos exceed the 30 MB transfer limit.');photos.push({id,type:photo.type,base64:base64(new Uint8Array(await photo.arrayBuffer()))});}
 return new Blob([JSON.stringify({version:1,kind:'wearagain-wardrobe-transfer',name:profile.name,createdAt:new Date().toISOString(),records,photos} satisfies Transfer)],{type:'application/json'});
}
export async function importTransfer(file:File,base:Storage):Promise<DeviceProfile>{
 if(file.size>42000000)throw Error('Transfer file exceeds 42 MB.');const raw:unknown=JSON.parse(await file.text());
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid transfer');const v=raw as Record<string,unknown>;
 if(v.version!==1||v.kind!=='wearagain-wardrobe-transfer'||typeof v.name!=='string'||!v.name.trim()||v.name.length>80||!v.records||typeof v.records!=='object'||Array.isArray(v.records)||!Array.isArray(v.photos)||v.photos.length>220)throw Error('Invalid transfer');
 const records:Record<string,string>={};for(const[key,value]of Object.entries(v.records)){if(!ALLOWED.includes(key)||typeof value!=='string'||value.length>1000000)throw Error('Unsupported transfer record');validateRecord(key,value);records[key]=value;}
 const rawWardrobe:unknown=JSON.parse(records[STORAGE_KEY]??'null');if(!rawWardrobe||typeof rawWardrobe!=='object'||!('items'in rawWardrobe)||!Array.isArray(rawWardrobe.items))throw Error('The transfer needs a wardrobe');const items=rawWardrobe.items as unknown[],parsed=parseStored(rawWardrobe);if(parsed.items.length!==items.length||parsed.items.some((item,index)=>item.id!==(items[index] as {id?:unknown})?.id))throw Error('Invalid wardrobe metadata');
 const ids=new Set(photoIds(records)),photos:{id:string;file:File}[]=[],seen=new Set<string>();let total=0;
 for(const value of v.photos){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid photo');const p=value as Record<string,unknown>;if(typeof p.id!=='string'||!ids.has(p.id)||typeof p.base64!=='string'||p.base64.length>16000000||typeof p.type!=='string'||!['image/jpeg','image/png','image/webp'].includes(p.type))throw Error('Invalid clothing photo');const decoded=atob(p.base64);total+=decoded.length;if(total>30000000)throw Error('Photos exceed transfer limit');const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));photos.push({id:p.id,file:new File([bytes],'clothing-photo',{type:p.type})});}
 for(const photo of photos){if(seen.has(photo.id))throw Error('Duplicate clothing photo');seen.add(photo.id);}if([...ids].some(id=>!seen.has(id)))throw Error('A referenced clothing photo is missing from the transfer');
 const profile={id:'user_'+crypto.randomUUID().replaceAll('-',''),name:v.name.slice(0,66)+' · transferred'},store=profileStorage(base,profile.id)!;
 try{for(const p of photos)await storePhoto(p.id,p.file,profile.id);for(const[key,value]of Object.entries(records))store.setItem(key,value);registerProfile(profile,base,true);return profile;}
 catch(error){store.clear();await Promise.allSettled(photos.map(p=>deletePhoto(p.id,profile.id)));throw error;}
}
