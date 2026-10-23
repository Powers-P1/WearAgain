import test,{before} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {fileURLToPath} from 'node:url';
let personal,state;
before(async()=>{const load=async name=>{const built=await build({entryPoints:[fileURLToPath(new URL('../web2/src/'+name+'.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));};[personal,state]=await Promise.all(['personal-purchase','state'].map(load));});
function fixture(){const wardrobe=state.addItem({version:1,exampleMode:false,style:'',items:[]},{id:'own_top',name:'My top',detail:'Cotton',category:'tops',availability:'ready'}),candidate=(id,priceMinor)=>({id,label:id,priceMinor,url:null,photoId:null});return {wardrobe,purchase:{...personal.emptyPersonal(),selectedTopIds:['own_top'],needs:{own_top:'Work pairing'},candidates:[candidate('coatA',4000)]},candidate};}
const pair=(purchase,wardrobe,outer)=>personal.personalScenario(purchase,wardrobe).outfits.find(p=>p.outerwearId===outer).id;
test('own baseline proves buy nothing and adding another product preserves the human decision',()=>{
 let {wardrobe,purchase,candidate}=fixture();purchase=personal.ratePersonal(purchase,wardrobe,pair(purchase,wardrobe,null),'would_wear');assert.equal(personal.personalDecision(purchase,wardrobe).result.basket.costMinor,0);
 purchase={...purchase,candidates:[...purchase.candidates,candidate('coatB',9000)]};const decision=personal.personalDecision(purchase,wardrobe);assert.equal(decision.result.basket.costMinor,0);assert.equal(decision.result.certificate.priceOptimality,'proven');assert.equal(decision.next.outfitId,null);
});
test('a selected unavailable garment keeps its declared need and cannot silently become a buy-nothing proof',()=>{
 let {wardrobe,purchase}=fixture();purchase=personal.ratePersonal(purchase,wardrobe,pair(purchase,wardrobe,null),'would_wear');wardrobe=state.setAvailability(wardrobe,'own_top','in_wash');const {scenario,result}=personal.personalDecision(purchase,wardrobe);assert.equal(scenario.tops.length,0);assert.equal(scenario.requirements.length,1);assert.deepEqual(scenario.requirements[0].outfitIds,[]);assert.equal(result.status,'infeasible');
});
test('price edits recompute the minimum while unknown cheaper products and render errors stay unresolved',()=>{
 let {wardrobe,purchase,candidate}=fixture();purchase={...purchase,requiresOuterwear:['own_top']};purchase=personal.ratePersonal(purchase,wardrobe,pair(purchase,wardrobe,'coatA'),'would_wear');purchase={...purchase,candidates:[...purchase.candidates,candidate('coatB',9000)]};assert.equal(personal.personalDecision(purchase,wardrobe).result.basket.costMinor,4000);
 purchase={...purchase,candidates:purchase.candidates.map(c=>c.id==='coatA'?{...c,priceMinor:12000}:c)};let decision=personal.personalDecision(purchase,wardrobe);assert.equal(decision.result.basket.costMinor,12000);assert.equal(decision.result.certificate.priceOptimality,'provisional');
 purchase=personal.ratePersonal(purchase,wardrobe,pair(purchase,wardrobe,'coatB'),'render_error');decision=personal.personalDecision(purchase,wardrobe);assert.equal(decision.result.certificate.priceOptimality,'provisional');assert.equal(decision.next.outfitId,pair(purchase,wardrobe,'coatB'));
 purchase=personal.ratePersonal(purchase,wardrobe,pair(purchase,wardrobe,'coatB'),'would_wear');assert.equal(personal.personalDecision(purchase,wardrobe).result.basket.costMinor,9000);
});
test('photo changes and shifting pair indexes never attach a prior acceptance to another garment',()=>{
 let {wardrobe,purchase,candidate}=fixture();purchase={...purchase,requiresOuterwear:['own_top'],candidates:[...purchase.candidates,candidate('coatB',9000)]};purchase=personal.ratePersonal(purchase,wardrobe,pair(purchase,wardrobe,'coatA'),'would_wear');
 const changed={...purchase,candidates:purchase.candidates.map(c=>c.id==='coatA'?{...c,photoId:'new_photo'}:c)};assert.equal(personal.personalDecision(changed,wardrobe).result.status,'incomplete');
 const removed={...purchase,candidates:purchase.candidates.filter(c=>c.id!=='coatA')};assert.equal(personal.personalDecision(removed,wardrobe).result.status,'incomplete');assert.ok(personal.personalScenario(removed,wardrobe).ratings.every(r=>r.status==='unrated'));
});

test('a replacement name or URL invalidates only that product, while a price correction preserves its rating',()=>{
 let {wardrobe,purchase,candidate}=fixture();purchase={...purchase,requiresOuterwear:['own_top'],candidates:[...purchase.candidates,candidate('coatB',9000)]};
 for(const id of ['coatA','coatB'])purchase=personal.ratePersonal(purchase,wardrobe,pair(purchase,wardrobe,id),'would_wear');
 const edit=change=>({...purchase,candidates:purchase.candidates.map(c=>c.id==='coatA'?{...c,...change}:c)});
 for(const change of [{label:'A different rain shell'},{url:'https://shop.example/rain-shell'}]){
  const next=edit(change),scenario=personal.personalScenario(next,wardrobe);
  assert.equal(scenario.ratings.find(r=>r.outfitId===pair(next,wardrobe,'coatA')).status,'unrated');
  assert.equal(scenario.ratings.find(r=>r.outfitId===pair(next,wardrobe,'coatB')).status,'would_wear');
  assert.equal(personal.personalDecision(next,wardrobe).result.certificate.priceOptimality,'provisional');
 }
 const priceOnly=edit({priceMinor:3000});assert.equal(personal.personalDecision(priceOnly,wardrobe).result.basket.costMinor,3000);assert.equal(personal.personalDecision(priceOnly,wardrobe).result.certificate.priceOptimality,'proven');
});
