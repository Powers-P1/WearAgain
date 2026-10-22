import {parseScenario} from '../core/validation.js';
import {parseAgentToolContext} from '../core/tools.js';
import type {Scenario} from '../core/types.js';
import type {CatalogueSnapshot} from '../core/tools.js';

export const AGENT_VERSION='wearagain.agent.v1';
export const AGENT_CAPS={dailySessions:30,perTokenSessions:3,tools:12,outputTokens:20000,modelCalls:6,inputTokenStop:120000,newRenders:4,renderUnits:8,sessionMs:120000} as const;
export const PROCEDURES={
 occasion:{title:'Dress for an occasion',steps:'Read profile and all wardrobe availability; retrieve relevant memories; check location/weather if supplied; propose 2–3 ready looks; identify assumptions; verify and save only when asked.'},
 purchase:{title:'Check a purchase',steps:'Read the real catalogue, prices, wardrobe and user requirements/ratings; compare with owned pieces; call solve_basket; distinguish AI style opinion from the current-ratings certificate; never create a user rating.'},
 packing:{title:'Pack for a trip',steps:'Read trip dates/events, ready wardrobe, history and profile; check available forecasts; reuse items across complete looks; propose a packing plan with unknown facts stated; save only when asked.'},
 rediscover:{title:'Wear it again',steps:'Read actual wear history and wardrobe; choose a ready rarely worn item, state when history is absent; combine it into complete looks consistent with remembered preferences; verify availability.'},
} as const;
export type Procedure=keyof typeof PROCEDURES;
export interface MemoryEntry {readonly id:string;readonly kind:'preference'|'decision';readonly text:string;readonly updatedAt:string}
export interface AgentItem {readonly id:string;readonly name:string;readonly detail:string;readonly category:'tops'|'bottoms'|'dresses'|'shoes'|'accessories';readonly availability:'ready'|'in_wash'|'needs_ironing'|'needs_repair';readonly photoId:string|null}
export interface AgentLook {readonly id:string;readonly title:string;readonly explanation:string;readonly itemIds:readonly string[]}
export interface AgentSnapshot {
 readonly version:1;readonly profile:{readonly id:string;readonly name:string;readonly style:string;readonly memories:readonly MemoryEntry[]};
 readonly wardrobe:readonly AgentItem[];readonly wears:readonly {readonly date:string;readonly itemIds:readonly string[]}[];
 readonly savedLooks:readonly AgentLook[];readonly trip:{readonly destination:string;readonly from:string;readonly until:string;readonly events:readonly {readonly date:string;readonly label:string}[]}|null;
 readonly location:string;readonly date:string;readonly avatarId:string;readonly allowRenders:boolean;
 readonly scenario:Scenario|null;readonly catalogue:CatalogueSnapshot|null;
 readonly candidatePhotos?:Readonly<Record<string,string>>;
}
export interface AgentAnswer {readonly reply:string;readonly looks:readonly AgentLook[];readonly requirements:readonly {readonly label:string;readonly status:'met'|'unknown'|'not_met';readonly reason:string}[];readonly missing:readonly string[]}
export interface AgentMutation {readonly id:string;readonly kind:'memory'|'outfit'|'plan'|'shopping';readonly data:unknown}
export interface AgentEvent {readonly sequence:number;readonly at:string;readonly name:string;readonly message:string}
export interface AgentResult {readonly version:typeof AGENT_VERSION;readonly model:string;readonly status:'completed'|'incomplete';readonly answer:AgentAnswer|null;readonly events:readonly AgentEvent[];readonly mutations:readonly AgentMutation[];readonly renders:readonly unknown[];readonly usage:{readonly inputTokens:number;readonly outputTokens:number;readonly modelCalls:number;readonly toolCalls:number};readonly warnings:readonly string[]}
export const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function text(v:unknown,max=500,empty=false):string {if(typeof v!=='string'||v.length>max||(!empty&&!v.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))throw Error('Invalid text');return v.trim();}
export function identifier(v:unknown):string {const s=text(v,64);if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Invalid ID');return s;}
export function list(v:unknown,max:number):unknown[]{if(!Array.isArray(v)||v.length>max)throw Error('Invalid list');return v;}
function date(v:unknown,empty=false):string{const s=text(v,10,empty);if(empty&&!s)return s;if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw Error('Invalid date');return s;}
export function parseMemories(v:unknown):MemoryEntry[]{return list(v,40).map(raw=>{if(!record(raw)||!['preference','decision'].includes(String(raw.kind)))throw Error('Invalid memory');const updatedAt=text(raw.updatedAt,40);if(!Number.isFinite(Date.parse(updatedAt)))throw Error('Invalid timestamp');return {id:identifier(raw.id),kind:raw.kind as MemoryEntry['kind'],text:text(raw.text,500),updatedAt};});}
export function verifyAgentLook(raw:unknown,wardrobe:readonly AgentItem[]):AgentLook{
 if(!record(raw))throw Error('Invalid look');const itemIds=list(raw.itemIds,6).map(identifier);if(new Set(itemIds).size!==itemIds.length||itemIds.length<2)throw Error('Invalid look items');
 const items=itemIds.map(id=>wardrobe.find(item=>item.id===id));if(items.some(item=>!item||item.availability!=='ready'))throw Error('Unknown or unavailable garment');
 if(!items.some(i=>i?.category==='shoes')||!(items.some(i=>i?.category==='dresses')||items.some(i=>i?.category==='tops')&&items.some(i=>i?.category==='bottoms')))throw Error('A complete look needs a dress or top and bottom, plus shoes');
 return {id:identifier(raw.id),title:text(raw.title,100),explanation:text(raw.explanation,320),itemIds};
}
export function parseAgentSnapshot(raw:unknown):AgentSnapshot{
 if(!record(raw)||raw.version!==1||!record(raw.profile))throw Error('Invalid snapshot');
 const profile={id:identifier(raw.profile.id),name:text(raw.profile.name,80),style:text(raw.profile.style,5000,true),memories:parseMemories(raw.profile.memories)};
 const wardrobe=list(raw.wardrobe,200).map(v=>{if(!record(v)||!['tops','bottoms','dresses','shoes','accessories'].includes(String(v.category))||!['ready','in_wash','needs_ironing','needs_repair'].includes(String(v.availability)))throw Error('Invalid garment');return {id:identifier(v.id),name:text(v.name,80),detail:text(v.detail,100,true),category:v.category as AgentItem['category'],availability:v.availability as AgentItem['availability'],photoId:v.photoId===null?null:identifier(v.photoId)};});
 if(new Set(wardrobe.map(i=>i.id)).size!==wardrobe.length)throw Error('Duplicate garment');
 const wears=list(raw.wears,366).map(v=>{if(!record(v))throw Error('Invalid wear');return {date:date(v.date),itemIds:list(v.itemIds,8).map(identifier)};});
 // Historical saved looks may contain unavailable things; they are context, not a fresh proposal.
 const savedLooks=list(raw.savedLooks,50).map(v=>{if(!record(v))throw Error('Invalid saved look');return {id:identifier(v.id),title:text(v.title,100),explanation:text(v.explanation,320,true),itemIds:list(v.itemIds,6).map(identifier)};});
 let trip:AgentSnapshot['trip']=null;if(raw.trip!==null){if(!record(raw.trip))throw Error('Invalid trip');trip={destination:text(raw.trip.destination,100),from:date(raw.trip.from),until:date(raw.trip.until),events:list(raw.trip.events,100).map(v=>{if(!record(v))throw Error('Invalid trip event');return {date:date(v.date),label:text(v.label,160)};})};}
 const scenario=raw.scenario===null?null:parseScenario(raw.scenario);
 if(scenario&&(scenario.tops.some(top=>!wardrobe.some(i=>i.id===top.id&&i.availability==='ready'&&i.category==='tops'))||scenario.outerwear.some(outer=>outer.kind==='owned'&&!wardrobe.some(i=>i.id===outer.id&&i.availability==='ready'))))throw Error('The purchase scenario contains an unknown or unavailable owned garment');
 let catalogue:CatalogueSnapshot|null=null;
 if(raw.catalogue!==null){const base=scenario??{schemaVersion:1,currency:'PLN',tops:[],outerwear:[],outfits:[],requirements:[],ratings:[]};catalogue=parseAgentToolContext({scenario:base,renderState:{schemaVersion:1,renders:[],pairRatings:[]},catalogue:raw.catalogue,cities:[],weather:[],unitsPerImage:2}).catalogue;}
 if(typeof raw.allowRenders!=='boolean')throw Error('Invalid render permission');
 const candidatePhotos:Record<string,string>={};if(raw.candidatePhotos!==undefined){if(!record(raw.candidatePhotos)||Object.keys(raw.candidatePhotos).length>8)throw Error('Invalid candidate photos');for(const[key,value]of Object.entries(raw.candidatePhotos)){if(!catalogue?.products.some(p=>p.id===key))throw Error('Unknown product photo');candidatePhotos[identifier(key)]=identifier(value);}}
 return {version:1,profile,wardrobe,wears,savedLooks,trip,location:text(raw.location,100,true),date:date(raw.date,true),avatarId:identifier(raw.avatarId),allowRenders:raw.allowRenders,scenario,catalogue,...(Object.keys(candidatePhotos).length?{candidatePhotos}:{})};
}
export function parseAgentAnswer(raw:unknown,snapshot:AgentSnapshot):AgentAnswer{
 if(!record(raw))throw Error('Invalid answer');const looks=list(raw.looks,3).map(v=>verifyAgentLook(v,snapshot.wardrobe));if(new Set(looks.map(l=>l.id)).size!==looks.length)throw Error('Duplicate looks');
 return {reply:text(raw.reply,2000),looks,requirements:list(raw.requirements,12).map(v=>{if(!record(v)||!['met','unknown','not_met'].includes(String(v.status)))throw Error('Invalid requirement');return {label:text(v.label,160),status:v.status as 'met'|'unknown'|'not_met',reason:text(v.reason,300)};}),missing:list(raw.missing,12).map(v=>text(v,200))};
}
export function retrieveMemory(snapshot:AgentSnapshot,query:string):MemoryEntry[]{
 const terms=text(query,500).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)??[];
 return snapshot.profile.memories.map((memory,index)=>({memory,index,score:terms.filter(t=>memory.text.toLowerCase().includes(t)).length})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||b.index-a.index).slice(0,8).map(r=>r.memory);
}
