import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {build} from 'esbuild';

let daily,wardrobe,shopping,photo;
before(async()=>{
  const load=async(path)=>{
    const result=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
      bundle:true,write:false,platform:'node',format:'esm',target:'es2022'});
    return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  };
  [daily,wardrobe,shopping,photo]=await Promise.all([
    load('../web2/src/daily.ts'),load('../web2/src/state.ts'),
    load('../web2/src/shopping.ts'),load('../web2/src/photo-store.ts'),
  ]);
});
const day='2026-10-22';

test('morning creates three distinct verified manifest-backed complete looks',()=>{
  const state=wardrobe.initialState();
  const looks=daily.morningLooks(state);
  assert.equal(looks.length,3);
  assert.equal(new Set(looks.map(look=>look.heroImagePath)).size,3);
  assert.equal(new Set(looks.map(look=>look.id)).size,3);
  for(const look of looks){
    assert.equal(look.itemIds.every(id=>state.items.find(row=>row.id===id)?.availability==='ready'),true);
    assert.ok(look.itemIds.some(id=>state.items.find(row=>row.id===id)?.category==='bottoms'));
    assert.ok(look.itemIds.some(id=>state.items.find(row=>row.id===id)?.category==='shoes'));
  }
});
test('morning excludes wash, ironing and repair; it does not invent three replacements',()=>{
  let state=wardrobe.initialState();
  state=wardrobe.setAvailability(state,'recorded-weekend','needs_ironing');
  assert.equal(daily.morningLooks(state).length,2);
  state=wardrobe.setAvailability(state,'recorded-evening','in_wash');
  assert.equal(daily.morningLooks(state).length,1);
  state=wardrobe.setAvailability(state,'trousers','needs_repair');
  assert.equal(daily.morningLooks(state).length,0);
});
test('wear record is a deliberate choice and the same local day is replaced, not double counted',()=>{
  const state=wardrobe.initialState();
  const looks=daily.morningLooks(state);
  const initial=daily.emptyDaily();
  const a=daily.wearToday(initial,state,looks[0],day);
  const b=daily.wearToday(a,state,looks[1],day);
  assert.equal(initial.wears.length,0);
  assert.equal(a.wears.length,1);
  assert.equal(b.wears.length,1);
  assert.equal(b.wears[0].lookId,looks[1].id);
  assert.deepEqual(b.wears[0].itemIds,looks[1].itemIds);
  assert.equal(daily.overviewFor(state,b,daily.emptyDecisions(),day).loggedThisMonth,looks[1].itemIds.length);
  assert.throws(()=>daily.wearToday(b,state,looks[0],'2026-02-31'),/date/);
  const noTrousers=wardrobe.setAvailability(state,'trousers','needs_ironing');
  assert.throws(()=>daily.wearToday(b,noTrousers,looks[0],day),/unknown|unavailable|incompatible/i);
});
test('logged wears are distinct by date and overview does not claim no-logs prove non-use',()=>{
  const state=wardrobe.initialState();
  const first=daily.morningLooks(state)[0];
  let d=daily.wearToday(daily.emptyDaily(),state,first,'2026-09-30');
  d=daily.wearToday(d,state,first,day);
  assert.equal(d.wears.length,2);
  const metrics=daily.overviewFor(state,d,daily.emptyDecisions(),day);
  assert.equal(metrics.loggedThisMonth,first.itemIds.length);
  assert.equal(metrics.loggedWearEntries,2);
  assert.equal(metrics.items,state.items.length);
  assert.equal(metrics.unknownGaps,true);
  assert.equal(metrics.categoryOverlap.includes('tops'),true);
  const noHistory=daily.overviewFor(state,daily.emptyDaily(),daily.emptyDecisions(),day);
  assert.equal(noHistory.loggedThisMonth,0);
  assert.equal(noHistory.attention.some(row=>row.kind==='no_log'),false);
});
test('user decisions are tracked separately from condition and never dispose of items',()=>{
  const state=wardrobe.initialState();
  const draft=daily.chooseDecision(daily.emptyDecisions(),state,'bag','repair',day);
  const changed=daily.chooseDecision(draft,state,'dress','sell',day);
  assert.deepEqual(changed.entries.map(entry=>entry.decision),['repair','sell']);
  assert.equal(state.items.length,wardrobe.initialState().items.length);
  assert.equal(state.items.find(item=>item.id==='dress').availability,'needs_ironing');
  assert.equal(daily.overviewFor(state,daily.emptyDaily(),changed,day).awaitingUser,0);
  assert.throws(()=>daily.chooseDecision(changed,state,'shopCandidate','donate',day),/existing garment/);
});
test('wear and decision storage validation handles corruption without losing source wardrobe',()=>{
  const store=new Map();
  const adapter={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
  let log=daily.wearToday(daily.emptyDaily(),wardrobe.initialState(),daily.morningLooks(wardrobe.initialState())[0],day);
  assert.equal(daily.storeDaily(log,adapter),true);
  assert.deepEqual(daily.loadDaily(adapter),log);
  const decision=daily.chooseDecision(daily.emptyDecisions(),wardrobe.initialState(),'bag','keep',day);
  assert.equal(daily.storeDecisions(decision,adapter),true);
  assert.deepEqual(daily.loadDecisions(adapter),decision);
  store.set(daily.DAILY_KEY,'{"version":1,"wears":[{"date":"bad"}]}');
  assert.deepEqual(daily.loadDaily(adapter),daily.emptyDaily());
  assert.equal(daily.storeDecisions(decision,{setItem(){throw Error('blocked')}}),false);
});
test('shopping demo has exactly three recorded single-garment previews from actual core candidates',()=>{
  const s=shopping.sampleShopping();
  assert.equal(s.items.length,3);
  assert.equal(new Set(s.items.map(x=>x.imagePath)).size,3);
  assert.equal(s.items.every(x=>x.source==='recorded' && x.status==='saved_preview'),true);
  assert.ok(s.items.every(x=>x.imagePath.startsWith('/demo/renders/outerwear-')));
  assert.deepEqual(shopping.shoppingCounts(s),{all:3,ready:3,ownPhotos:0,returns:0,notGenerated:0});
});
test('entering shop context once snapshots that shop/floor on each newly captured photo',()=>{
  let s=shopping.setShop(shopping.sampleShopping(),'Shop A','Level 1');
  s=shopping.addShopItem(s,{id:'photo_1',title:'Beige jacket',source:'photo',photoId:'photo_1',date:day});
  s=shopping.setShop(s,'Shop B','Ground floor');
  s=shopping.addShopItem(s,{id:'photo_2',title:'Red top',source:'photo',photoId:'photo_2',date:day});
  assert.equal(s.items.at(-2).shop,'Shop A');
  assert.equal(s.items.at(-2).floor,'Level 1');
  assert.equal(s.items.at(-1).shop,'Shop B');
  assert.equal(s.items.at(-1).status,'photo_only');
  assert.equal(shopping.shoppingCounts(s).ready,3);
  assert.equal(shopping.shoppingCounts(s).notGenerated,2);
  assert.equal(shopping.shoppingCounts(s).ownPhotos,2);
  const count=wardrobe.initialState().items.length;
  assert.equal(wardrobe.initialState().items.length,count);
});
test('coffee decisions create and update return list by the user-entered store and floor',()=>{
  let s=shopping.setShop(shopping.sampleShopping(),'A store','Floor 2');
  s=shopping.addShopItem(s,{id:'photo_9',title:'Coat',source:'photo',photoId:'photo_9',date:day});
  s=shopping.decideShop(s,'photo_9','return');
  s=shopping.decideShop(s,s.items[0].id,'return');
  let groups=shopping.groupedReturns(s);
  assert.equal(groups.length,2);
  assert.equal(groups.reduce((n,group)=>n+group.items.length,0),2);
  assert.equal(groups.find(x=>x.shop==='A store').floor,'Floor 2');
  const prior=s;
  s=shopping.decideShop(s,'photo_9','skip');
  assert.equal(prior.items.find(x=>x.id==='photo_9').decision,'return');
  assert.equal(shopping.shoppingCounts(s).returns,1);
  assert.equal(shopping.groupedReturns(s).every(group=>group.items.every(x=>x.decision==='return')),true);
});
test('links remain passive, enforce HTTPS and never become fake preview or purchase',()=>{
  assert.equal(shopping.safeProductUrl('javascript:alert(1)'),null);
  assert.equal(shopping.safeProductUrl('http://example.org/item'),null);
  assert.equal(shopping.safeProductUrl('https://user:pass@example.org/p'),null);
  assert.ok(shopping.safeProductUrl('https://shop.example/item'));
  let s=shopping.sampleShopping();
  s=shopping.addShopItem(s,{id:'link_1',title:'A link',source:'link',url:'https://shop.example/item',date:day});
  assert.equal(s.items.at(-1).status,'link_only');
  assert.equal(s.items.at(-1).imagePath,null);
  assert.equal(shopping.shoppingCounts(s).notGenerated,1);
  assert.throws(()=>shopping.addShopItem(s,{id:'link_2',title:'bad',source:'link',url:'file:///private',date:day}),/Invalid/);
});
test('persisted shopping entries validate source paths and integrity, not arbitrary media URLs',()=>{
  const s=shopping.sampleShopping(),values=new Map();
  const store={setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k)??null};
  assert.equal(shopping.saveShopping(s,store),true);
  assert.deepEqual(shopping.loadShopping(store),s);
  const forged={...s,items:[{...s.items[0],imagePath:'https://bad.test/tracking.jpg'}]};
  assert.deepEqual(shopping.parseShopping(forged),shopping.sampleShopping());
  assert.deepEqual(shopping.parseShopping({version:999}),shopping.sampleShopping());
  assert.throws(()=>shopping.removeShopItem(s,s.items[0].id),/Invalid/);
});
test('camera photo limit and MIME validation keep oversized or unsafe inputs out of IndexedDB',()=>{
  assert.equal(photo.supportedPhoto({type:'image/jpeg',size:100_000}),true);
  assert.equal(photo.supportedPhoto({type:'image/webp',size:photo.MAX_PHOTO_BYTES}),true);
  assert.equal(photo.supportedPhoto({type:'image/svg+xml',size:1000}),false);
  assert.equal(photo.supportedPhoto({type:'application/pdf',size:1000}),false);
  assert.equal(photo.supportedPhoto({type:'image/jpeg',size:photo.MAX_PHOTO_BYTES+1}),false);
});
