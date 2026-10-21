import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

let stylist;
let wardrobe;
before(async () => {
  async function load(path) {
    const output = await build({
      entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
      bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022',
    });
    return import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
  }
  stylist = await load('../web2/src/stylist.ts');
  wardrobe = await load('../web2/src/state.ts');
});
const brief = {
  occasion: 'Friday dinner at the Ritz. Elegant but still me.',
  date: '2026-10-23',
  style: 'Classic, no prints.',
};

test('offline occasion demo yields 3 complete distinct looks from existing ready clothing', async () => {
  const state = wardrobe.initialState();
  const plan = await stylist.proposeLooks(brief,state);
  assert.equal(plan.source,'demo');
  assert.equal(plan.looks.length,3);
  assert.equal(new Set(plan.looks.map(l=>l.id)).size,3);
  for(const look of plan.looks) {
    assert.ok(look.itemIds.length>=3);
    assert.ok(look.itemIds.every(id => state.items.some(i => i.id===id && i.availability==='ready')));
    assert.ok(look.heroImagePath?.startsWith('/demo/renders/top-'));
    assert.equal(plan.verified,true);
  }
});

test('in-wash, needs-ironing and repair states exclude unavailable items from proposals', async () => {
  let state=wardrobe.initialState();
  state=wardrobe.setAvailability(state,'blazer','in_wash');
  assert.equal((await stylist.proposeLooks(brief,state)).looks.length,2);
  state=wardrobe.setAvailability(state,'recorded-weekend','needs_ironing');
  assert.equal((await stylist.proposeLooks(brief,state)).looks.length,1);
  state=wardrobe.setAvailability(state,'trousers','needs_repair');
  assert.equal((await stylist.proposeLooks(brief,state)).looks.length,0);
});

test('agent hook receives only ready owned ids, and output is verified against inventory', async () => {
  let state=wardrobe.initialState();
  state=wardrobe.setAvailability(state,'blazer','needs_repair');
  let called=0;
  const out=await stylist.proposeLooks(brief,state,async input=>{
    called++;
    assert.equal(input.occasion,brief.occasion);
    assert.ok(!input.readyWardrobe.some(i=>i.id==='blazer'));
    assert.ok(input.readyWardrobe.every(i=>i.category));
    return [{ id:'candidate_1',title:'Soft work look',explanation:'A simple owned look.',
      itemIds:['recorded-weekend','trousers','loafers'],heroImagePath:'https://evil.example/' }];
  });
  assert.equal(called,1);
  assert.equal(out.source,'agent');
  assert.equal(out.looks.length,1);
  assert.equal(out.looks[0].heroImagePath,null);
});

test('forged worker suggestions cannot fabricate, reuse or mark unavailable garments ready', async () => {
  const state=wardrobe.initialState();
  const candidate=(ids)=>[{id:'forged',title:'Fake',explanation:'Text',itemIds:ids}];
  for(const ids of [
    ['blazer','trousers','nonexistent'],
    ['coat','trousers','loafers'],
    ['blazer','silk','loafers'],
    ['recorded-work','recorded-work','loafers','trousers'],
  ]) assert.throws(()=>stylist.verifyLooks(candidate(ids),state,'agent'),/unknown|unavailable|incompatible/);
  assert.throws(()=>stylist.verifyLooks(new Array(4).fill(candidate(['cashmere','trousers','loafers'])[0]),state,'agent'),/unknown|unavailable|incompatible/);
});

test('occasion text and date are validated before any agent hook can run', async () => {
  const state=wardrobe.initialState();
  let called=0;
  const hook=async()=>{called++;return []};
  await assert.rejects(stylist.proposeLooks({...brief,occasion:''},state,hook),/occasion/);
  await assert.rejects(stylist.proposeLooks({...brief,date:'2026-02-99'},state,hook),/date/);
  assert.equal(called,0);
});

test('a saved look is metadata only, independently stored and is not an automatic wear or purchase', () => {
  const state=wardrobe.initialState();
  const look=stylist.demoLooks(state).looks[0];
  const records=stylist.saveChosen([],look,brief,state);
  assert.equal(records.length,1);
  assert.equal(records[0].occasion,brief.occasion);
  assert.deepEqual(records[0].itemIds,look.itemIds);
  assert.deepEqual(state,wardrobe.initialState());
  const map=new Map();
  const store={setItem:(key,value)=>map.set(key,value),getItem:key=>map.get(key)};
  assert.equal(stylist.persistSaved(records,store),true);
  assert.deepEqual(stylist.loadSaved(store),records);
  assert.deepEqual(stylist.loadSaved({getItem:()=>'{invalid'}),[]);
  assert.equal(stylist.persistSaved(records,{setItem(){throw Error('blocked')}}),false);
});

test('provider-looking HTML, invalid display-only illustration and unknown ids never leak into accepted model', () => {
  const state=wardrobe.initialState();
  const raw=[{id:'ok',title:'<script>alert(1)</script>',explanation:'Recorded URL cannot be injected',
    itemIds:['recorded-work','trousers','loafers'],heroImagePath:'https://other-origin.example/'}];
  const result=stylist.verifyLooks(raw,state,'agent');
  assert.equal(result.looks[0].heroImagePath,null);
  assert.equal(result.looks[0].title,raw[0].title); // escaped by the view, never inserted as HTML
});

test('all three demo looks now use distinct manifest-backed upper-body hero garment IDs', async () => {
  const state=wardrobe.initialState();
  const looks=stylist.demoLooks(state).looks;
  assert.equal(looks.length,3);
  assert.equal(new Set(looks.map(look=>look.heroImagePath)).size,3);
  assert.match(looks[2].heroImagePath,/top-evening-/);
  assert.ok(looks[2].itemIds.includes('recorded-evening'));
});
