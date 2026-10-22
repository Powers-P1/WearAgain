import test from 'node:test';import assert from 'node:assert/strict';
import {runStylist} from '../dist/agent/runner.js';
import {parseAgentSnapshot,retrieveMemory,verifyAgentLook} from '../dist/agent/contract.js';
import {AgentStore} from '../worker/src/agent-store.js';
import {createSqlStorage} from './helpers/sql-storage.mjs';
import {snapshot} from './helpers/agent-snapshot.mjs';
const now=Date.parse('2026-10-23T00:00:00Z');
const look=(top='topA')=>({id:'look_'+top,title:'A ready outfit',explanation:'Your beige and navy pieces; avoid wool against skin.',itemIds:[top,'bottomA','shoeA']});
const answer={reply:'Two ready looks based on your wardrobe and saved preference.',looks:[look(),look('topB')],requirements:[{label:'Available now',status:'met',reason:'All selected items are ready.'}],missing:[]};
const call=(name,input={},id=name)=>({type:'tool_use',id,name,input});
function scripted(turns){const requests=[];return {requests,fetch:async(_url,init)=>{requests.push(JSON.parse(init.body));const content=turns[requests.length-1];assert.ok(content,'Unexpected model retry');return Response.json({type:'message',id:'m'+requests.length,role:'assistant',model:'claude-sonnet-5-5',content,stop_reason:'tool_use',usage:{input_tokens:100,output_tokens:100}});}};}
test('actual model/tool loop reads full custom wardrobe and isolated memory, excludes unavailable garments and returns verified looks',async()=>{
 for(const name of ['ALPHA','BETA']){
  const s=scripted([[call('get_profile'),call('get_wardrobe'),call('search_memory',{query:'wool'}),call('get_history')],[call('submit_answer',answer)]]);
  const result=await runStylist({snapshot:snapshot(name),message:'Dress me for work.',procedure:'occasion',apiKey:'private-key',now:()=>now,fetch:s.fetch});
  assert.equal(result.status,'completed');assert.equal(result.answer.looks.length,2);assert.equal(result.usage.toolCalls,5);
  const wire=JSON.stringify(s.requests);assert.ok(wire.includes(name+' avoids wool'));assert.ok(wire.includes('washA'));assert.equal(wire.includes(name==='ALPHA'?'BETA avoids wool':'ALPHA avoids wool'),false);
  assert.equal(JSON.stringify(result).includes('private-key'),false);assert.ok(result.answer.looks.every(l=>!l.itemIds.includes('washA')));
 }
});
test('feedback revises a previous proposal and a requested save is validated, without inventing user ratings',async()=>{
 const s=scripted([[call('get_profile'),call('get_wardrobe')],[call('save_outfit',{look:look('topB')}),call('remember_preference',{kind:'preference',text:'I avoid wool against skin.'}),call('submit_answer',{...answer,reply:'Changed to your other top.'})]]);
 const result=await runStylist({snapshot:snapshot(),message:'Use the other top and save the outfit. Remember I avoid wool.',procedure:'occasion',previous:answer,apiKey:'key',now:()=>now,fetch:s.fetch});
 assert.equal(result.status,'completed');assert.deepEqual(result.mutations.map(m=>m.kind),['outfit','memory']);assert.ok(result.mutations[0].data.itemIds.includes('topB'));
 assert.ok(s.requests[0].messages[0].content.includes('previousAnswer'));assert.equal(JSON.stringify(result).includes('would_wear'),false);
});
test('unknown IDs, unavailable clothes and fabricated catalogue fields cannot pass verification',async()=>{
 assert.throws(()=>verifyAgentLook(look('washA'),snapshot().wardrobe));assert.throws(()=>verifyAgentLook(look('invented'),snapshot().wardrobe));
 const s=scripted([[call('get_profile'),call('get_wardrobe')],[call('submit_answer',{...answer,looks:[look('washA')]})],[call('submit_answer',answer)]]);
 const result=await runStylist({snapshot:snapshot(),message:'A ready outfit',procedure:'occasion',apiKey:'key',now:()=>now,fetch:s.fetch});assert.equal(result.status,'completed');assert.ok(result.events.some(e=>e.name==='warning'));
 assert.throws(()=>parseAgentSnapshot({...snapshot(),wardrobe:[...snapshot().wardrobe,snapshot().wardrobe[0]]}));
 assert.equal(retrieveMemory(parseAgentSnapshot(snapshot()),'wool')[0].id,'preference1');
});
test('disabled previews never invoke provider/render adapter and the model cannot write human pair ratings',async()=>{
 let renderCalls=0;const state=snapshot();state.wardrobe[0]={...state.wardrobe[0],photoId:'a'.repeat(64)};
 const s=scripted([[call('get_profile'),call('get_wardrobe'),call('render_garment',{itemId:'topA'}),call('set_rating',{status:'would_wear'})],[call('submit_answer',answer)]]);
 const result=await runStylist({snapshot:state,message:'Show looks',procedure:'occasion',apiKey:'key',now:()=>now,fetch:s.fetch,render:async()=>{renderCalls++;}});
 assert.equal(renderCalls,0);assert.equal(result.status,'completed');assert.equal(result.mutations.length,0);
});
test('SQLite session replay survives store recreation and enforces 3/token, 30/day and cross-user ownership',t=>{
 const storage=createSqlStorage();t.after(()=>storage.close());let store=new AgentStore(storage);
 const start=(owner,id)=>store.start({owner,requestId:id,requestHash:'hash-'+id,profileId:owner,now});
 const first=start('alpha','request1');assert.equal(first.created,true);store=new AgentStore(storage);assert.equal(start('alpha','request1').created,false);
 assert.throws(()=>store.start({owner:'alpha',requestId:'request1',requestHash:'different',profileId:'alpha',now}),/conflict/);
 assert.throws(()=>store.get('beta',first.row.id,now),/not_found/);start('alpha','request2');start('alpha','request3');assert.throws(()=>start('alpha','request4'),/token_limit/);
 for(let i=0;i<27;i++)start('owner'+i,'request1');assert.throws(()=>start('last','request1'),/daily_limit/);
});
test('four render claims are durable and replays never admit a fifth operation',t=>{
 const storage=createSqlStorage();t.after(()=>storage.close());const store=new AgentStore(storage),id=store.start({owner:'alpha',requestId:'r',requestHash:'h',profileId:'alpha',now}).row.id;
 for(let i=0;i<4;i++)assert.equal(store.claimRender('alpha',id,'item'+i,now).created,true);
 assert.equal(store.claimRender('alpha',id,'item0',now).created,false);assert.throws(()=>store.claimRender('alpha',id,'item4',now),/render_limit/);
 store.putAsset('alpha','photo','image/jpeg','PRIVATE_ALPHA_IMAGE',now);assert.equal(store.asset('beta','photo',now),null);assert.equal(store.asset('alpha','photo',now).base64,'PRIVATE_ALPHA_IMAGE');assert.equal(store.asset('alpha','photo',now+6*3600000+1),null);
});

test('purchase procedure uses the real human-rated basket and preserves unknown commerce facts',async()=>{
 const state=snapshot(),unknown={status:'UNKNOWN',reason:'Not supplied'};
 state.scenario={schemaVersion:1,currency:'PLN',tops:[{id:'topA',label:'My top'}],outerwear:[{id:'shop_coat',label:'Shop coat',kind:'candidate',priceMinor:4000}],outfits:[{id:'pairA',topId:'topA',outerwearId:'shop_coat'}],requirements:[{id:'needA',label:'One work pairing',minCount:1,outfitIds:['pairA'],source:{kind:'user_chips'}}],ratings:[{outfitId:'pairA',status:'would_wear'}]};
 state.catalogue={shopId:'own-shop',currency:'PLN',source:'User entered',capturedAt:new Date(now).toISOString(),products:[{id:'shop_coat',candidateId:'shop_coat',label:'Shop coat',priceMinor:{status:'known',value:4000},productUrl:unknown,inStock:unknown,delivery:unknown,pickup:unknown}]};
 const s=scripted([[call('get_profile'),call('get_wardrobe'),call('search_catalogue'),call('solve_basket')],[call('save_shopping_list',{productIds:['shop_coat']}),call('submit_answer',{...answer,reply:'The confirmed item basket is 40 PLN. Stock and delivery remain UNKNOWN.'})]]);
 const result=await runStylist({snapshot:state,message:'Check this coat and save my list.',procedure:'purchase',apiKey:'key',now:()=>now,fetch:s.fetch});
 assert.equal(result.status,'completed');assert.equal(result.mutations[0].kind,'shopping');
 const results=s.requests[1].messages.at(-1).content;assert.equal(JSON.parse(results.find(r=>r.tool_use_id==='solve_basket').content[0].text).solver.basket.costMinor,4000);
 assert.equal(result.mutations[0].data[0].inStock.status,'UNKNOWN');assert.deepEqual(state.scenario.ratings,[{outfitId:'pairA',status:'would_wear'}]);
});

test('packing and rediscover procedures retrieve history, save verified event looks and reject invalid dates',async()=>{
 for(const procedure of ['packing','rediscover']){
  const state=snapshot();state.trip={destination:'London',from:'2026-10-24',until:'2026-10-25',events:[{date:'2026-10-24',label:'Museum'}]};
  const s=scripted([[call('get_profile'),call('get_wardrobe'),call('get_history'),call('search_memory',{query:'wool'})],[call('save_plan',{destination:'London',from:'2026-10-24',until:'2026-10-25',events:[{date:'2026-10-24',label:'Museum',look:look()}]}),call('submit_answer',answer)]]);
  const result=await runStylist({snapshot:state,message:'Save a two-day plan and reuse my seldom logged top.',procedure,apiKey:'key',now:()=>now,fetch:s.fetch});assert.equal(result.status,'completed');assert.equal(result.mutations[0].kind,'plan');assert.equal(result.mutations[0].data.events[0].look.itemIds[0],'topA');assert.ok(JSON.stringify(s.requests[1]).includes('2026-10-22'));
 }
 const s=scripted([[call('get_profile'),call('get_wardrobe'),call('save_plan',{destination:'London',from:'2026-02-30',until:'2026-03-03',events:[]})],[call('submit_answer',answer)]]);
 const result=await runStylist({snapshot:snapshot(),message:'Plan a trip',procedure:'packing',apiKey:'key',now:()=>now,fetch:s.fetch});assert.equal(result.mutations.length,0);assert.ok(result.events.some(e=>e.name==='warning'));
});

test('private photos and sessions are deleted at their advertised durable expiry',t=>{
 const storage=createSqlStorage();t.after(()=>storage.close());const store=new AgentStore(storage),id=store.start({owner:'alpha',requestId:'r',requestHash:'h',profileId:'alpha',now}).row.id;
 store.putAsset('alpha','photo','image/jpeg','PRIVATE',now);assert.equal(store.nextExpiry(),now+21600000);store.cleanup(now+21600000);assert.equal(store.asset('alpha','photo',now+21600000),null);assert.equal(store.nextExpiry(),now+86400000);
 assert.throws(()=>store.get('alpha',id,now+86400000),/agent_not_found/);assert.equal(store.sql.exec('SELECT COUNT(*) AS n FROM agent_sessions').toArray()[0].n,0);
});
