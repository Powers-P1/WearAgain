import {parseScenario,solveBasket,nextUnresolvedAssessment} from '../../src/core/index.js';
import type {Scenario,OutfitRating} from '../../src/core/index.js';
import type {CatalogueSnapshot} from '../../src/core/tools.js';
import type {WardrobeState} from './state.js';
import {safeProductUrl} from './shopping.js';
export const PERSONAL_PURCHASE_KEY='wearagain:web2:personal-purchase:v1';
export interface PersonalCandidate {readonly id:string;readonly label:string;readonly priceMinor:number;readonly url:string|null;readonly photoId:string|null}
export interface PersonalPurchase {readonly version:1;readonly shop:string;readonly currency:string;readonly candidates:readonly PersonalCandidate[];readonly selectedTopIds:readonly string[];readonly ownedOuterwearIds:readonly string[];readonly requiresOuterwear?:readonly string[];readonly needs:Readonly<Record<string,string>>;readonly ratings:readonly OutfitRating[];readonly assessmentRevision:string;readonly updatedAt:string}
type Store=Pick<Storage,'getItem'|'setItem'>|undefined;
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v);
export function emptyPersonal():PersonalPurchase{return {version:1,shop:'My selected shop',currency:'PLN',candidates:[],selectedTopIds:[],ownedOuterwearIds:[],needs:{},ratings:[],assessmentRevision:'',updatedAt:new Date().toISOString()};}
export function parsePersonal(raw:unknown):PersonalPurchase{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid personal purchase');const v=raw as Record<string,unknown>;
 if(v.version!==1||typeof v.shop!=='string'||!v.shop.trim()||v.shop.length>100||typeof v.currency!=='string'||!['PLN','EUR','GBP','USD'].includes(v.currency)||!Array.isArray(v.candidates)||v.candidates.length>8||!Array.isArray(v.selectedTopIds)||v.selectedTopIds.length>18||v.selectedTopIds.some(x=>!id(x))||!Array.isArray(v.ownedOuterwearIds)||v.ownedOuterwearIds.length>4||v.ownedOuterwearIds.some(x=>!id(x))||!v.needs||typeof v.needs!=='object'||Array.isArray(v.needs)||!Array.isArray(v.ratings)||v.ratings.length>256||typeof v.assessmentRevision!=='string'||v.assessmentRevision.length>30000||typeof v.updatedAt!=='string'||!Number.isFinite(Date.parse(v.updatedAt)))throw Error('Invalid personal purchase');
 const candidates=v.candidates.map((raw:unknown)=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid candidate');const c=raw as Record<string,unknown>;if(!id(c.id)||typeof c.label!=='string'||!c.label.trim()||c.label.length>100||!Number.isSafeInteger(c.priceMinor)||(c.priceMinor as number)<0||(c.url!==null&&(typeof c.url!=='string'||safeProductUrl(c.url)===null||c.url.length>512))||!(c.photoId===null||id(c.photoId)))throw Error('Invalid candidate');return c as unknown as PersonalCandidate;});
 const requiresOuterwear=v.requiresOuterwear===undefined?[]:v.requiresOuterwear;if(!Array.isArray(requiresOuterwear)||requiresOuterwear.length>18||requiresOuterwear.some(x=>!id(x)))throw Error('Invalid outerwear requirements');
 if(new Set(candidates.map(c=>c.id)).size!==candidates.length)throw Error('Duplicate candidate');
 const needs:Record<string,string>={};for(const [key,label]of Object.entries(v.needs)){if(!id(key)||typeof label!=='string'||!label.trim()||label.length>100)throw Error('Invalid requirement');needs[key]=label;}
 const ratings=v.ratings.map((raw:unknown)=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid rating');const r=raw as Record<string,unknown>;if(!id(r.outfitId)||!['would_wear','would_not_wear','unrated','render_error'].includes(String(r.status)))throw Error('Invalid rating');return r.status==='render_error'?{outfitId:r.outfitId,status:'render_error' as const,reason:typeof r.reason==='string'?r.reason.slice(0,300):'Preview error'}:{outfitId:r.outfitId,status:r.status as 'would_wear'|'would_not_wear'|'unrated'};});
 return {version:1,shop:v.shop,currency:v.currency,candidates,selectedTopIds:[...new Set(v.selectedTopIds)] as string[],ownedOuterwearIds:[...new Set(v.ownedOuterwearIds)] as string[],requiresOuterwear:[...new Set(requiresOuterwear)] as string[],needs,ratings,assessmentRevision:v.assessmentRevision,updatedAt:v.updatedAt};
}
export function readPersonal(store:Store):PersonalPurchase{try{const raw=store?.getItem(PERSONAL_PURCHASE_KEY);return raw?parsePersonal(JSON.parse(raw)):emptyPersonal();}catch{return emptyPersonal();}}
export function savePersonal(value:PersonalPurchase,store:Store):void{if(!store)throw Error('Device storage unavailable');store.setItem(PERSONAL_PURCHASE_KEY,JSON.stringify(parsePersonal(value)));}
/** Identity includes availability, image revision and selected roles. Price/needs recompute the proof without inventing new ratings. */
export function assessmentRevision(state:PersonalPurchase,wardrobe:WardrobeState):string{return JSON.stringify({topOrder:state.selectedTopIds,outerwearOrder:state.ownedOuterwearIds,owned:wardrobe.items.filter(i=>state.selectedTopIds.includes(i.id)||state.ownedOuterwearIds.includes(i.id)).map(i=>[i.id,i.name,i.detail,i.availability,i.photoId??i.photo]),candidates:state.candidates.map(c=>[c.id,c.photoId])});}
export function personalScenario(state:PersonalPurchase,wardrobe:WardrobeState):Scenario{
 const tops=state.selectedTopIds.flatMap(id=>wardrobe.items.filter(i=>i.id===id&&i.availability==='ready'&&i.category==='tops'&&!state.ownedOuterwearIds.includes(id)).map(i=>({id:i.id,label:i.name})));
 const owned=state.ownedOuterwearIds.flatMap(id=>wardrobe.items.filter(i=>i.id===id&&i.availability==='ready').map(i=>({id:i.id,label:i.name,kind:'owned' as const})));
 const outerwear=[...owned,...state.candidates.map(c=>({id:c.id,label:c.label,kind:'candidate' as const,priceMinor:c.priceMinor}))];
 const pairs=tops.flatMap((top,ti)=>[null,...outerwear.map(o=>o.id)].map((outerwearId,oi)=>({id:'pair_'+ti+'_'+oi,topId:top.id,outerwearId})));
 // Pair IDs incorporate a stable top/candidate identity through revision invalidation.
 const valid=state.assessmentRevision===assessmentRevision(state,wardrobe);
 return parseScenario({schemaVersion:1,currency:state.currency,tops,outerwear,outfits:pairs,requirements:tops.filter(t=>state.needs[t.id]).map((top,index)=>({id:'need_'+index,label:state.needs[top.id],minCount:1,outfitIds:pairs.filter(p=>p.topId===top.id&&(!state.requiresOuterwear?.includes(top.id)||p.outerwearId!==null)).map(p=>p.id),source:{kind:'user_chips'}})),ratings:valid?state.ratings.filter(r=>pairs.some(p=>p.id===r.outfitId)):[]});
}
export function ratePersonal(state:PersonalPurchase,wardrobe:WardrobeState,outfitId:string,status:OutfitRating['status']):PersonalPurchase{
 const scenario=personalScenario(state,wardrobe);if(!scenario.outfits.some(p=>p.id===outfitId)||!['would_wear','would_not_wear','unrated','render_error'].includes(status))throw Error('Choose a current pair');
 const rating:OutfitRating=status==='render_error'?{outfitId,status,reason:'User reported a preview error; pair unresolved'}:{outfitId,status};
 return {...state,assessmentRevision:assessmentRevision(state,wardrobe),ratings:[...scenario.ratings.filter(r=>r.outfitId!==outfitId),rating],updatedAt:new Date().toISOString()};
}
export function personalCatalogue(state:PersonalPurchase):CatalogueSnapshot{
 const unknown={status:'UNKNOWN' as const,reason:'No store data supplied'};
 return {shopId:'personal-shop',currency:state.currency,source:'User-entered single-shop catalogue: '+state.shop,capturedAt:state.updatedAt,products:state.candidates.map(c=>({id:c.id,candidateId:c.id,label:c.label,priceMinor:{status:'known' as const,value:c.priceMinor},productUrl:c.url?{status:'known' as const,value:c.url}:unknown,inStock:unknown,delivery:unknown,pickup:unknown}))};
}
export function personalDecision(state:PersonalPurchase,wardrobe:WardrobeState){const scenario=personalScenario(state,wardrobe);return {scenario,result:solveBasket(scenario),next:nextUnresolvedAssessment(scenario)};}
