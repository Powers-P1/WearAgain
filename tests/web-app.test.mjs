import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { solveBasket, projectPairRatings } from '../dist/core/index.js';

let data;
let asyncState;
before(async () => {
  const built = await build({ entryPoints: [fileURLToPath(new URL('../web/src/app/data.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022' });
  data = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
  const asyncBuilt = await build({ entryPoints: [fileURLToPath(new URL('../web/src/app/async-state.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022' });
  asyncState = await import(`data:text/javascript;base64,${Buffer.from(asyncBuilt.outputFiles[0].text).toString('base64')}`);
});

test('frontend synthetic minimum preserves the tested catalogue, memberships and certificate', () => {
  const scenario = data.demoScenario('minimum');
  const result = solveBasket(scenario);
  assert.equal(result.status, 'solved');
  assert.deepEqual(result.basket.candidateIds, ['all-round']);
  assert.equal(result.basket.costMinor, 9000);
  assert.equal(result.certificate.priceOptimality, 'proven');
  assert.equal(result.certificate.cheaperBaskets.length, 3);
  assert.ok(scenario.requirements.every(need => need.source.kind === 'user_chips'));
});

test('zero-purchase screen has positive accepted owned evidence, rather than implied coverage', () => {
  const scenario = data.demoScenario('zero');
  const result = solveBasket(scenario);
  assert.equal(result.status, 'solved');
  assert.deepEqual(result.basket.candidateIds, []);
  assert.equal(result.basket.costMinor, 0);
  assert.ok(scenario.ratings.some(rating => rating.outfitId === 'shirt-old-coat' && rating.status === 'would_wear'));
  assert.ok(scenario.ratings.some(rating => rating.outfitId === 'shirt-alone' && rating.status === 'would_wear'));
  const withoutAcceptance = { ...scenario, ratings: [] };
  assert.equal(solveBasket(withoutAcceptance).status, 'incomplete');
});

test('simulation decisions can change the winning basket without inventing provider output', () => {
  const scenario = data.demoScenario('minimum');
  const modified = data.withRating(scenario, 'evening-cheap-a', 'would_wear');
  assert.deepEqual(solveBasket(modified).basket.candidateIds, ['cheap-a']);
  assert.equal(data.simulationSelection(modified).status, 'settled');
  assert.equal(scenario.ratings.find(rating => rating.outfitId === 'evening-cheap-a').status, 'would_not_wear');
});

test('a simulated render error is unresolved and exposes decision relevance', () => {
  const scenario = data.withRating(data.demoScenario('minimum'), 'evening-cheap-a', 'render_error', 'Example defect.');
  const result = solveBasket(scenario);
  assert.equal(result.status, 'solved');
  assert.equal(result.certificate.priceOptimality, 'provisional');
  const selection = data.simulationSelection(scenario);
  assert.ok(selection.relevantOutfitIds.includes('evening-cheap-a'));
  assert.ok(selection.blockedOutfitIds.includes('evening-cheap-a'));
  const cleared = data.withRating(scenario, 'evening-cheap-a', 'unrated');
  assert.equal(data.simulationSelection(cleared).status, 'next');
});

test('candidate and need chips filter membership and decisions together', () => {
  const scenario = data.activeScenario(data.demoScenario('minimum'), new Set(['evening']), new Set(['cheap-b']));
  assert.equal(scenario.requirements.length, 1);
  assert.equal(scenario.outerwear.length, 1);
  assert.ok(scenario.outfits.every(outfit => outfit.outerwearId === 'cheap-b'));
  assert.deepEqual(solveBasket(scenario).basket.candidateIds, ['cheap-b']);
  const none = data.activeScenario(data.demoScenario('minimum'), new Set(['evening']), new Set());
  assert.equal(solveBasket(none).status, 'infeasible');
});

function stateFor(scenario) {
  return {
    schemaVersion: 1,
    renders: data.elementsForScenario(scenario).map(element => ({ element, garmentRevision: `garment:${element.id}`, baseRevision: 'approved-base', pipelineRevision: 'cloth-v4', attempt: 0, status: 'ready', assetId: `decoded:${element.id}` })),
    pairRatings: [],
  };
}

test('live ratings require decoded current image evidence and compatible models', () => {
  const scenario = data.demoScenario('error');
  const ready = stateFor(scenario);
  assert.throws(() => data.rateCurrentImages(scenario, { ...ready, renders: ready.renders.map(render => ({ ...render, status: 'pending' })) }, 'shirt-coat', 'would_wear', 'reason'), /Both previews/);
  const incompatible = { ...ready, renders: ready.renders.map((render, index) => ({ ...render, baseRevision: `different-${index}` })) };
  assert.throws(() => data.rateCurrentImages(scenario, incompatible, 'shirt-coat', 'would_wear', 'reason'), /same model/);
  assert.throws(() => data.rateCurrentImages(scenario, ready, 'unknown-pair', 'would_wear', 'reason'), /Both previews/);
});

test('replacing an image invalidates a prior acceptance; an error never becomes a dislike', () => {
  const scenario = data.demoScenario('error');
  const rated = data.rateCurrentImages(scenario, stateFor(scenario), 'shirt-coat', 'would_wear', 'reason');
  assert.equal(projectPairRatings(scenario, rated).ratings[0].status, 'would_wear');
  const changed = { ...rated, renders: rated.renders.map((render, index) => index === 0 ? { ...render, attempt: 1, assetId: 'new-image' } : render) };
  assert.equal(projectPairRatings(scenario, changed).ratings[0].status, 'unrated');
  const errored = data.rateCurrentImages(scenario, rated, 'shirt-coat', 'render_error', 'Changed buttons.');
  assert.equal(projectPairRatings(scenario, errored).ratings[0].status, 'render_error');
  assert.equal(solveBasket(projectPairRatings(scenario, errored)).status, 'incomplete');
});

const recording = {
  id: 'shirt-one', element: { kind: 'top', id: 'shirt' }, avatarId: 'woman_neutral_01',
  imagePath: '/demo/renders/shirt-one.png', recordedAt: '2026-10-21T12:00:00Z', syntheticAvatarOnly: true, api: 'cloth-v4',
};

test('recording loader admits the agreed static manifest and handles an empty handoff', () => {
  assert.deepEqual(data.parseRecordings({ schemaVersion: 1, renders: [] }), []);
  assert.equal(data.parseRecordings({ schemaVersion: 1, renders: [recording] })[0].imagePath, '/demo/renders/shirt-one.png');
});

test('recording loader rejects live/provider URLs, traversal, duplicates and non-synthetic assets', () => {
  for (const imagePath of ['https://provider.example/image.png', '/api/renders/abc/image', '/demo/renders/../private.png', '//other.example/image.png', '/demo/renders/a.png?token=secret']) {
    assert.throws(() => data.parseRecordings({ schemaVersion: 1, renders: [{ ...recording, imagePath }] }));
  }
  assert.throws(() => data.parseRecordings({ schemaVersion: 1, renders: [recording, recording] }));
  assert.throws(() => data.parseRecordings({ schemaVersion: 1, renders: [{ ...recording, syntheticAvatarOnly: false }] }));
  assert.throws(() => data.parseRecordings({ schemaVersion: 1, renders: [{ ...recording, recordedAt: 'UNKNOWN' }] }));
});

test('live projection ignores fixture decisions and filters removed candidates before solving', () => {
  const scenario = data.demoScenario('minimum');
  const subset = data.activeScenario(scenario, new Set(['work']), new Set(['cheap-a']));
  const current = data.projectedForSelection(subset, stateFor(scenario));
  assert.ok(current.scenario.ratings.every(rating => rating.status === 'unrated'));
  assert.equal(current.selection.result.status, 'incomplete');
  assert.equal(current.selection.baseline.images, 4);
  assert.equal(current.selection.baseline.units, 8);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('out-of-order same-slot file decodes keep the latest selection and release the earlier result', async () => {
  let context = 0;
  const coordinator = asyncState.createUploadCoordinator(() => context);
  const older = deferred();
  const newer = deferred();
  const accepted = [];
  const released = [];
  const first = asyncState.loadCurrentPreview(() => older.promise, coordinator.begin('top:work'), image => accepted.push(image.url), url => released.push(url));
  const second = asyncState.loadCurrentPreview(() => newer.promise, coordinator.begin('top:work'), image => accepted.push(image.url), url => released.push(url));
  newer.resolve({ url: 'blob:newer-file', assetId: 'newer-file' });
  assert.equal(await second, true);
  older.resolve({ url: 'blob:older-file', assetId: 'older-file' });
  assert.equal(await first, false);
  assert.deepEqual(accepted, ['blob:newer-file']);
  assert.deepEqual(released, ['blob:older-file']);
  const otherSlot = coordinator.begin('top:evening');
  coordinator.begin('top:work');
  assert.equal(otherSlot(), true, 'different slots do not invalidate one another');
  context += 1;
  assert.equal(otherSlot(), false, 'changing the model/scenario invalidates outstanding uploads');
});

test('replacing a garment during download cannot restore an old ready image', async () => {
  const delivery = deferred();
  let currentUpload = 'old-sha';
  let currentRecord = 'old-render-key';
  const accepted = [];
  const released = [];
  const pending = asyncState.loadCurrentPreview(
    () => delivery.promise,
    () => currentUpload === 'old-sha' && currentRecord === 'old-render-key',
    image => accepted.push(image),
    url => released.push(url),
  );
  currentUpload = 'new-sha';
  currentRecord = undefined;
  delivery.resolve({ url: 'blob:stale-provider-image', assetId: 'old-render-key' });
  assert.equal(await pending, false);
  assert.deepEqual(accepted, []);
  assert.deepEqual(released, ['blob:stale-provider-image']);
});

test('a replacement attempt with the same garment hash still rejects the older downloaded result', async () => {
  const delivery = deferred();
  let renderKey = 'attempt-0';
  const accepted = [];
  const released = [];
  const pending = asyncState.loadCurrentPreview(() => delivery.promise, () => renderKey === 'attempt-0', image => accepted.push(image), url => released.push(url));
  renderKey = 'attempt-1';
  delivery.resolve({ url: 'blob:attempt-0', assetId: 'attempt-0' });
  assert.equal(await pending, false);
  assert.deepEqual(accepted, []);
  assert.deepEqual(released, ['blob:attempt-0']);
});
