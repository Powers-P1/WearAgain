import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

let purchase;
let wardrobe;
before(async () => {
  async function load(source) {
    const result = await build({
      entryPoints: [fileURLToPath(new URL(source, import.meta.url))],
      bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022',
    });
    return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
  }
  purchase = await load('../web2/src/purchase.ts');
  wardrobe = await load('../web2/src/state.ts');
});

test('all six saved YouCam demo files are addressed by exact garment identities and same-origin paths', () => {
  const combinations = [
    ['top','work'], ['top','weekend'], ['top','evening'],
    ['outerwear','cheap-a'], ['outerwear','cheap-b'], ['outerwear','all-round'],
  ];
  const ids = new Set();
  for (const [kind,id] of combinations) {
    const r = purchase.recordingFor(kind,id);
    assert.ok(r);
    assert.match(r.imagePath,/^\/demo\/renders\/[a-z0-9_-]+\.jpg$/);
    assert.ok(Number.isFinite(Date.parse(r.recordedAt)));
    ids.add(r.id);
  }
  assert.equal(ids.size,6);
  assert.equal(purchase.recordingFor('outerwear','work'),null);
  assert.equal(purchase.recordingFor('top','not-a-demo-item'),null);
  assert.equal(purchase.recordingFor('outerwear','old-coat'),null);
});

test('core solver returns the tested minimum-basket result with a complete certificate', () => {
  const session = purchase.initialPurchase('minimum');
  assert.equal(session.ratingsOrigin,'example');
  assert.equal(session.scenario.tops[0].label,'Cream shirt');
  assert.equal(session.scenario.outerwear[2].label,'Nova jacket');
  assert.deepEqual(session.scenario.requirements.map(req=>req.label), ['For work','For weekends','For evenings']);
  const answer = purchase.computeDecision(session);
  assert.equal(answer.status,'solved');
  assert.deepEqual(answer.basket.candidateIds,['all-round']);
  assert.equal(answer.basket.costMinor,9000);
  assert.equal(answer.certificate.priceOptimality,'proven');
  assert.equal(answer.certificate.selectionStability,'stable');
  assert.equal(answer.certificate.cheaperBaskets.length,3);
  assert.equal(answer.evaluatedBasketCount,8);
  assert.equal(session.candidateId,'all-round');
  assert.equal(purchase.candidatePosition(session),'recommended');
  assert.equal(purchase.candidatePosition(purchase.selectCandidate(session,'cheap-a')),'not_required');
});

test('switching to a recorded candidate and owned top selects the exact core pair', () => {
  let s = purchase.initialPurchase('minimum');
  s = purchase.selectCandidate(s,'all-round');
  s = purchase.selectTop(s,'evening');
  assert.equal(purchase.selectedPair(s).id,'evening-all-round');
  assert.equal(purchase.selectedRating(s).status,'would_wear');
  assert.match(purchase.recordingFor('outerwear',s.candidateId).imagePath,/all-round/);
  assert.match(purchase.recordingFor('top',s.topId).imagePath,/evening/);
  assert.throws(()=>purchase.selectCandidate(s,'random'),/unavailable/);
  assert.throws(()=>purchase.selectTop(s,'random'),/unavailable/);
});

test('rating a specific recorded pair changes only that core rating and reruns the optimizer', () => {
  let session=purchase.selectCandidate(purchase.initialPurchase(),'all-round');
  const original=session;
  session=purchase.rateSelected(session,'would_not_wear');
  assert.equal(session.ratingsOrigin,'edited');
  assert.equal(purchase.selectedRating(session).status,'would_not_wear');
  assert.equal(purchase.selectedRating(original).status,'would_wear');
  const result=purchase.computeDecision(session);
  assert.equal(result.status,'solved');
  assert.ok(result.basket.costMinor>=0);
  assert.equal(original.scenario.ratings.find(r=>r.outfitId==='work-all-round').status,'would_wear');
  const reset=purchase.replayRatings(session);
  assert.equal(purchase.selectedRating(reset).status,'would_wear');
  assert.equal(reset.ratingsOrigin,'example');
});

test('clearing all ratings yields an incomplete decision, never an invented rejection', () => {
  const session=purchase.clearRatings(purchase.initialPurchase());
  const answer=purchase.computeDecision(session);
  assert.equal(answer.status,'incomplete');
  assert.equal(answer.basket,null);
  assert.equal(answer.unresolvedOutfitIds.length,9);
  assert.equal(purchase.candidatePosition(session),'unresolved');
  assert.equal(session.scenario.ratings.every(r=>r.status==='unrated'),true);
  assert.equal(session.decisions['cheap-a'],undefined);
});

test('owned-clothing zero-purchase fixture proves buying nothing without claiming matching recordings', () => {
  const session=purchase.choosePurchaseDemo(purchase.initialPurchase(),'zero');
  const result=purchase.computeDecision(session);
  assert.equal(result.status,'solved');
  assert.deepEqual(result.basket.candidateIds,[]);
  assert.equal(result.basket.costMinor,0);
  assert.equal(purchase.candidatePosition(session),'none');
  assert.equal(purchase.recordingFor('top','shirt'),null);
  assert.equal(purchase.recordingFor('outerwear','new-coat'),null);
  assert.throws(()=>purchase.rateSelected(session,'would_wear'),/No matching saved previews/);
  assert.equal(purchase.rateSelected(session,'unrated').ratingsOrigin,'edited');
});

test('recording a skip or later decision never adds candidates to the owned wardrobe', () => {
  const before=wardrobe.initialState();
  const original=purchase.initialPurchase();
  const later=purchase.recordDecision(original,'cheap-b','save');
  const skipped=purchase.recordDecision(later,'cheap-a','skip');
  assert.equal(original.decisions['cheap-b'],undefined);
  assert.equal(later.decisions['cheap-b'],'save');
  assert.equal(skipped.decisions['cheap-a'],'skip');
  assert.equal(skipped.decisions['cheap-b'],'save');
  assert.deepEqual(wardrobe.initialState(),before);
  assert.deepEqual(skipped.scenario,original.scenario);
  assert.throws(()=>purchase.recordDecision(original,'no-such-item','save'),/unavailable/);
});

test('purchase checker does not treat a nonchosen candidate as a proven duplicate of an owned piece', () => {
  const first=purchase.selectCandidate(purchase.initialPurchase(),'cheap-a');
  assert.equal(purchase.candidatePosition(first),'not_required');
  assert.equal(first.scenario.outerwear.some(item=>item.kind==='owned'),false);
  // All required ratings and prices come from the existing synthetic fixture.
  assert.equal(first.scenario.ratings.filter(r=>r.status==='would_wear').length,6);
});

test('rejecting Nova for evenings changes the actual basket from 90 to 100 PLN while keeping Nova selected',()=>{
  const before=purchase.selectTop(purchase.initialPurchase(),'evening');
  const after=purchase.rateSelected(before,'would_not_wear');
  assert.equal(before.candidateId,'all-round');
  assert.equal(after.candidateId,before.candidateId);
  assert.equal(after.topId,'evening');
  assert.deepEqual(after.editedOutfitIds,['evening-all-round']);
  assert.deepEqual(purchase.computeDecision(before).basket.candidateIds,['all-round']);
  assert.equal(purchase.computeDecision(before).basket.costMinor,9000);
  const result=purchase.computeDecision(after);
  assert.equal(result.status,'solved');
  assert.deepEqual(result.basket.candidateIds,['cheap-a','cheap-b']);
  assert.equal(result.basket.costMinor,10000);
  assert.equal(result.certificate.priceOptimality,'proven');
  assert.equal(purchase.candidatePosition(after),'not_required');
  assert.equal(after.lastRatingChange.outfitId,'evening-all-round');
  assert.deepEqual(after.lastRatingChange.before,purchase.computeDecision(before));
  assert.deepEqual(after.scenario.ratings.filter(r=>r.outfitId!=='evening-all-round'),before.scenario.ratings.filter(r=>r.outfitId!=='evening-all-round'));
  const restored=purchase.rateSelected(after,'would_wear');
  assert.equal(restored.candidateId,'all-round');
  assert.equal(purchase.computeDecision(restored).basket.costMinor,9000);
});

test('browsing a nonrecommended candidate survives a rating that leaves the basket unchanged',()=>{
  const before=purchase.selectCandidate(purchase.initialPurchase(),'cheap-b');
  const after=purchase.rateSelected(before,'would_wear');
  assert.equal(after.candidateId,'cheap-b');
  assert.equal(after.topId,'work');
  assert.deepEqual(purchase.computeDecision(after).basket.candidateIds,['all-round']);
  assert.equal(purchase.computeDecision(after).basket.costMinor,9000);
  assert.deepEqual(after.editedOutfitIds,['work-cheap-b']);
});

test('an unsure or errored Nova pairing keeps its identity and a provisional alternative, never a rejection',()=>{
  for(const status of ['unrated','render_error']){
    const before=purchase.selectTop(purchase.initialPurchase(),'evening');
    const after=purchase.rateSelected(before,status);
    assert.equal(after.candidateId,'all-round');
    assert.equal(purchase.selectedRating(after).status,status);
    const result=purchase.computeDecision(after);
    assert.equal(result.status,'solved');
    assert.equal(result.basket.costMinor,10000);
    assert.equal(result.certificate.priceOptimality,'provisional');
    assert.equal(purchase.candidatePosition(after),'unresolved');
    assert.ok(result.certificate.cheaperBaskets.some(b=>b.basket.candidateIds.includes('all-round')&&b.couldBecomeFeasible));
  }
});


test('buy-nothing URL selects the original deterministic zero-purchase fixture',()=>{
  assert.equal(purchase.purchaseDemoFromSearch('?scenario=zero'),'zero');
  assert.equal(purchase.purchaseDemoFromSearch('?scenario=minimum'),'minimum');
  assert.equal(purchase.purchaseDemoFromSearch('?scenario=invalid'),'minimum');
  assert.equal(purchase.purchaseDemoFromSearch('?scenario=ZERO'),'minimum');
  assert.equal(purchase.purchaseDemoFromSearch(''),'minimum');
  const selected=purchase.initialPurchase(purchase.purchaseDemoFromSearch('?scenario=zero'));
  assert.equal(selected.demo,'zero');
  const result=purchase.computeDecision(selected);
  assert.equal(result.status,'solved');
  assert.equal(result.basket.costMinor,0);
  assert.deepEqual(result.basket.candidateIds,[]);
});
