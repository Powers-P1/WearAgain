import { recordingFor, scenarioForDemo } from './purchase.js';
import { t } from './i18n.js';

export type ShopDecision = 'skip' | 'return' | null;
export type ShopSource = 'recorded' | 'photo' | 'link';
export type ShopStatus = 'saved_preview' | 'photo_only' | 'link_only';
export interface ShopItem {
  readonly id: string;
  readonly title: string;
  readonly source: ShopSource;
  readonly status: ShopStatus;
  readonly shop: string;
  readonly floor: string;
  readonly photoId: string | null;
  readonly imagePath: string | null;
  readonly link: string | null;
  readonly decision: ShopDecision;
  readonly createdAt: string;
}
export interface ShoppingSession {
  readonly version: 1;
  readonly shop: string;
  readonly floor: string;
  readonly items: readonly ShopItem[];
}
export const SHOP_KEY='wearagain:web2:shopping:v1';
const validId=(x:unknown):x is string=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(x);
function validDate(x:unknown):x is string {return typeof x==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x));}
export function sampleShopping(): ShoppingSession {
  const scenario=scenarioForDemo('minimum');
  const items:ShopItem[]=scenario.outerwear.filter(item=>item.kind==='candidate').map(item=>{
    const recorded=recordingFor('outerwear',item.id);
    return {
      id:'demo_'+item.id.replaceAll('-','_'),title:item.label,source:'recorded',status:'saved_preview',
      shop:'',floor:'',photoId:null,imagePath:recorded?.imagePath??null,link:null,
      decision:null,createdAt:'2026-10-21',
    };
  }).filter(item=>item.imagePath!==null);
  return {version:1,shop:'',floor:'',items};
}
function validShopItem(value:unknown): value is ShopItem {
  if (!value||typeof value!=='object'||Array.isArray(value))return false;
  const v=value as Record<string,unknown>;
  if(!validId(v.id)||typeof v.title!=='string'||v.title.length>100||!v.title.trim()||
    typeof v.shop!=='string'||v.shop.length>100||typeof v.floor!=='string'||v.floor.length>32||
    !['recorded','photo','link'].includes(String(v.source))||
    !['saved_preview','photo_only','link_only'].includes(String(v.status))||
    ![null,'skip','return'].includes(v.decision as null) || !validDate(v.createdAt))return false;
  if(v.source==='recorded') return v.status==='saved_preview'&&v.photoId===null&&v.link===null &&
    sampleShopping().items.some(item=>item.id===v.id && item.imagePath===v.imagePath);
  if(v.source==='photo') return v.status==='photo_only'&&validId(v.photoId)&&v.imagePath===null&&v.link===null;
  return v.status==='link_only'&&v.photoId===null&&v.imagePath===null&&typeof v.link==='string'&&safeProductUrl(v.link)!==null;
}
export function parseShopping(value:unknown):ShoppingSession {
  if(!value||typeof value!=='object'||Array.isArray(value))return sampleShopping();
  const obj=value as Record<string,unknown>;
  if(obj.version!==1||typeof obj.shop!=='string'||obj.shop.length>100||
    typeof obj.floor!=='string'||obj.floor.length>32||
    !Array.isArray(obj.items)||obj.items.length>120)return sampleShopping();
  const ids=new Set<string>();const items:ShopItem[]=[];
  for(const item of obj.items){
    if(!validShopItem(item)||ids.has(item.id)) return sampleShopping();
    ids.add(item.id);items.push({...item});
  }
  return {version:1,shop:obj.shop,floor:obj.floor,items};
}
export function loadShopping(store?:Pick<Storage,'getItem'>):ShoppingSession {
  try {const v=store?.getItem(SHOP_KEY);return v?parseShopping(JSON.parse(v)):sampleShopping();}catch{return sampleShopping();}
}
export function saveShopping(session:ShoppingSession,store?:Pick<Storage,'setItem'>):boolean {
  try{if(!store)return false;store.setItem(SHOP_KEY,JSON.stringify(session));return true;}catch{return false;}
}
export function setShop(session:ShoppingSession,shop:string,floor:string):ShoppingSession {
  if(shop.length>100||floor.length>32)throw Error(t('shopInvalidContext'));
  return {...session,shop:shop.trim(),floor:floor.trim()};
}
export function safeProductUrl(input:string):string|null {
  try{
    const url=new URL(input);
    // Saving a URL only, never fetching it or passing it to the Worker.
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.href.length>2048) return null;
    return url.toString();
  }catch{return null;}
}
export function addShopItem(session:ShoppingSession,item:{
  id:string;title:string;source:'photo'|'link';photoId?:string|null;url?:string|null;date:string;
}):ShoppingSession {
  if(!validId(item.id)||session.items.some(row=>row.id===item.id)||session.items.length>=120 ||
    !validDate(item.date)||!item.title.trim()||item.title.length>100)throw Error(t('shopInvalidItem'));
  const photoId=item.source==='photo' ? item.photoId??null : null;
  const link=item.source==='link' ? safeProductUrl(item.url??'') : null;
  if(item.source==='photo'?!validId(photoId):!link)throw Error(t('shopInvalidItem'));
  const next:ShopItem={
    id:item.id,title:item.title.trim(),source:item.source,
    status:item.source==='photo'?'photo_only':'link_only',shop:session.shop,floor:session.floor,
    photoId,imagePath:null,link,decision:null,createdAt:item.date,
  };
  return {...session,items:[...session.items,next]};
}
export function decideShop(session:ShoppingSession,id:string,decision:ShopDecision):ShoppingSession {
  if(![null,'skip','return'].includes(decision) ||!session.items.some(item=>item.id===id))throw Error(t('shopInvalidItem'));
  return {...session,items:session.items.map(item=>item.id===id?{...item,decision}:item)};
}
export function removeShopItem(session:ShoppingSession,id:string):ShoppingSession {
  const item=session.items.find(row=>row.id===id);
  if(!item ||item.source==='recorded')throw Error(t('shopInvalidItem'));
  return {...session,items:session.items.filter(row=>row.id!==id)};
}
export function shoppingCounts(session:ShoppingSession):{all:number,ready:number,ownPhotos:number,returns:number,notGenerated:number} {
  return {all:session.items.length,ready:session.items.filter(x=>x.status==='saved_preview').length,
    ownPhotos:session.items.filter(x=>x.source==='photo').length,
    returns:session.items.filter(x=>x.decision==='return').length,
    notGenerated:session.items.filter(x=>x.status!=='saved_preview').length};
}
export interface ReturnGroup {readonly shop:string;readonly floor:string; readonly items:readonly ShopItem[];}
export function groupedReturns(session:ShoppingSession):readonly ReturnGroup[]{
  const groups=new Map<string,ShopItem[]>();
  for(const item of session.items.filter(row=>row.decision==='return')){
    const key=JSON.stringify([item.shop,item.floor]);
    groups.set(key,[...(groups.get(key)??[]),item]);
  }
  return [...groups].map(([key,items])=>{
    const [shop,floor]=JSON.parse(key) as [string,string];
    return {shop,floor,items};
  }).sort((a,b)=>(a.shop+a.floor).localeCompare(b.shop+b.floor));
}
