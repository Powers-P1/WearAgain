import assert from 'node:assert/strict';
import test, {before} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

let plans,state,stylist,queue;
before(async()=>{
 const load=async path=>{
  const built=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',target:'es2022',
   define:{__PUBLIC_API_ORIGIN__:JSON.stringify('https://api.example'),__PUBLIC_CONTACT_EMAIL__:JSON.stringify('')}});
  return import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 };
 [plans,state,stylist,queue]=await Promise.all(['plans','state','stylist','render-queue'].map(name=>load('../web2/src/'+name+'.ts')));
});
const memory=()=>{const rows=new Map();return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)};};
const until=async predicate=>{for(let n=0;n<100;n++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Queue did not settle');};
const record={mode:'live',renderKey:'a'.repeat(64),status:'succeeded',assetId:'youcam:'+ 'a'.repeat(64),requiresReconciliation:false};
const photos={input:async()=>new File(['test'],'garment.jpg',{type:'image/jpeg'}),output:async()=>{}};
const client=()=>({startSession:async()=>({}),submit:async()=>record,loadImage:async()=>({url:'blob:example',assetId:record.assetId}),releaseImage:()=>{},dispose:()=>{}});

test('reload resumes a known render by GET under its exact live capability without another POST',async()=>{
 const store=memory(),credential={sessionToken:'private-fixture-capability',expiresAt:Date.now()+3600000};
 store.setItem('wearagain:agent:credential:v1',JSON.stringify(credential));
 store.setItem(queue.QUEUE_KEY,JSON.stringify({version:1,sessionToken:credential.sessionToken,jobs:[{itemId:'existing',status:'processing',renderKey:record.renderKey,photoId:null,error:null}]}));
 let posts=0,polls=0;const api={...client(),submit:async()=>{posts++;return record;},poll:async key=>{assert.equal(key,record.renderKey);polls++;return record;}};
 const restored=new queue.PreviewQueue(store,()=>{},api,photos);assert.equal(restored.jobs[0].status,'processing');await restored.enable();await until(()=>restored.jobs[0].status==='ready');
 assert.equal(posts,0);assert.equal(polls,1);restored.dispose();
 store.setItem('wearagain:agent:credential:v1',JSON.stringify({...credential,sessionToken:'another-person'}));
 store.setItem(queue.QUEUE_KEY,JSON.stringify({version:1,sessionToken:credential.sessionToken,jobs:[{itemId:'existing',status:'processing',renderKey:record.renderKey,photoId:null,error:null}]}));
 const other=new queue.PreviewQueue(store,()=>{},api,photos);assert.equal(other.jobs[0].status,'unknown');await other.enable();assert.equal(polls,1);other.dispose();
});

test('trip dates shift existing occasions and clamp a shorter trip without losing selected outfits',()=>{
 const wardrobe=state.initialState(),look=stylist.demoLooks(wardrobe).looks[0];
 let trip=plans.initialTrip(new Date(2026,9,22,23));
 trip=plans.assignTripLook(trip,'theatre',look,wardrobe);
 const moved=plans.updateTrip(trip,'Paris','2026-11-01','2026-11-02');
 assert.equal(moved.events[2].date,'2026-11-02');
 assert.equal(moved.events[2].outfit.date,'2026-11-02');
 assert.deepEqual(moved.events[2].outfit.itemIds,look.itemIds);
 assert.equal(trip.events[2].date,'2026-10-25');
 assert.throws(()=>plans.updateTrip(trip,'','2026-11-01','2026-11-02'));
 assert.throws(()=>plans.updateTrip(trip,'Paris','2026-11-01','2026-10-31'));
});
test('packing is a unique union of assigned pieces and a local trip round-trips',()=>{
 const wardrobe=state.initialState(),looks=stylist.demoLooks(wardrobe).looks;
 let trip=plans.initialTrip();
 trip=plans.assignTripLook(trip,'dinner',looks[0],wardrobe);
 trip=plans.assignTripLook(trip,'museum',looks[1],wardrobe);
 assert.deepEqual(plans.packingIds(trip),[...new Set([...looks[0].itemIds,...looks[1].itemIds])]);
 assert.deepEqual(plans.parseTrip(JSON.parse(JSON.stringify(trip))),trip);
 assert.throws(()=>plans.assignTripLook(trip,'missing',looks[0],wardrobe));
 const unavailable=state.setAvailability(wardrobe,'loafers','in_wash');
 assert.throws(()=>plans.assignTripLook(trip,'dinner',looks[0],unavailable));
 assert.equal(plans.validDay('2026-02-30'),false);
});
test('companion packing uses only their assigned pieces and rejects unresolved companion identities',()=>{
 let trip=plans.initialTrip();
 let companion=plans.emptyCompanion();
 for(const [id,category] of [['alex_top','tops'],['alex_bottom','bottoms'],['alex_shoes','shoes']])
  companion=state.addItem(companion,{id,name:id,detail:'',category,availability:'ready'});
 trip={...trip,companionName:'Alex',companion,events:trip.events.map(event=>({...event,companionItemIds:companion.items.map(item=>item.id)})),packed:['companion_alex_top']};
 assert.deepEqual(plans.companionPackingIds(trip),['alex_top','alex_bottom','alex_shoes']);
 assert.deepEqual(plans.parseTrip(trip),trip);
 const bad={...trip,events:trip.events.map(event=>({...event,companionItemIds:['unknown']}))};
 assert.deepEqual(plans.parseTrip(bad).companion.items,[]);
});
test('device photo references survive wardrobe persistence; remote image paths are rejected',()=>{
 const added=state.addItem(state.initialState(),{id:'own_test',name:'My top',category:'tops',detail:'',availability:'ready',photoId:'own_test'});
 assert.equal(state.parseStored(added).items.find(item=>item.id==='own_test').photoId,'own_test');
 assert.throws(()=>state.addItem(added,{id:'bad',name:'Bad',category:'tops',detail:'',availability:'ready',photoId:'https://example.com/x'}));
});
test('queued photos require opt-in, submit each identity once and persist the actual result',async()=>{
 const store=memory(),calls=[],outputs=[];const api=client();
 api.submit=async input=>{calls.push(input);return record;};
 const q=new queue.PreviewQueue(store,()=>{},api,{...photos,output:async id=>{outputs.push(id);}});
 q.enqueue('photo_1');q.enqueue('photo_1');
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls.length,0);
 await q.enable();await until(()=>q.jobs[0].status==='ready');
 assert.equal(calls.length,1);assert.equal(calls[0].attempt,0);assert.equal(calls[0].garmentContainsNoFace,true);
 assert.deepEqual(outputs,['result_photo_1']);
 const restored=new queue.PreviewQueue(store,()=>{},client(),photos);
 assert.equal(restored.jobs[0].photoId,'result_photo_1');assert.equal(restored.enabled,false);
 q.dispose();restored.dispose();
});
test('uncertain outcomes are never automatically resubmitted, including after reload',async()=>{
 const store=memory();let calls=0;const api=client();
 api.submit=async()=>{calls++;throw Object.assign(new Error('network'),{code:'network_unknown',status:0});};
 const q=new queue.PreviewQueue(store,()=>{},api,photos);q.enqueue('photo_2');await q.enable();
 await until(()=>q.jobs[0].status==='unknown');q.enqueue('photo_2');await q.enable();
 assert.equal(calls,1);
 const restored=new queue.PreviewQueue(store,()=>{},client(),photos);
 assert.equal(restored.jobs[0].status,'unknown');
 const interrupted=queue.parseQueue({version:1,jobs:[{itemId:'photo_3',status:'processing',renderKey:'b'.repeat(64),photoId:null,error:null}]});
 assert.equal(interrupted[0].status,'unknown');assert.equal(interrupted[0].error,'session_ended');
 q.dispose();restored.dispose();
});
test('confirmed avatar preflight failure is an error without automatic retry; generic503 stays unknown',async()=>{
 for(const [code,status] of [['avatar_image_unavailable','error'],['upstream_unavailable','unknown']]){
  let calls=0;const api=client();api.submit=async()=>{calls++;throw Object.assign(new Error(code),{code,status:503});};
  const q=new queue.PreviewQueue(memory(),()=>{},api,photos);q.enqueue('preflight');await q.enable();
  await until(()=>q.jobs[0].status===status);await q.enable();assert.equal(calls,1);q.dispose();
 }
});
test('pause or removal during local photo preparation prevents a new provider submission',async()=>{
 for(const action of ['pause','remove']){
  let finish,calls=0;const api=client();api.submit=async()=>{calls++;return record;};
  const q=new queue.PreviewQueue(memory(),()=>{},api,{...photos,input:()=>new Promise(resolve=>{finish=resolve;})});
  q.enqueue('preparing');await q.enable();await until(()=>typeof finish==='function');
  if(action==='pause')q.pause();else q.remove('preparing');
  finish(new File(['test'],'garment.jpg',{type:'image/jpeg'}));await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(calls,0);assert.equal(action==='pause'?q.jobs[0].status:q.jobs.length,action==='pause'?'queued':0);q.dispose();
 }
});
test('queue bounds concurrency and removes a submitted local result without changing accounting',async()=>{
 let active=0,max=0;const releases=[];const api=client();
 api.submit=async()=>{active++;max=Math.max(active,max);await new Promise(resolve=>releases.push(resolve));active--;return record;};
 const q=new queue.PreviewQueue(memory(),()=>{},api,photos);
 for(const id of ['one','two','three'])q.enqueue(id);
 await q.enable();await until(()=>releases.length===2);
 assert.equal(max,2);q.remove('one');releases.shift()();releases.shift()();
 await until(()=>releases.length===1);releases.shift()();await until(()=>q.jobs.every(job=>job.status==='ready'));
 assert.deepEqual(q.jobs.map(job=>job.itemId),['two','three']);assert.equal(max,2);q.dispose();
});
