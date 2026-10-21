import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

let state;
let i18n;
before(async () => {
  async function load(path) {
    const output = await build({
      entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
      bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022',
    });
    return import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
  }
  state = await load('../web2/src/state.ts');
  i18n = await load('../web2/src/i18n.ts');
});

test('English is default, with a catalogue and fallback for future Polish locale', () => {
  assert.equal(i18n.DEFAULT_LOCALE, 'en');
  assert.equal(i18n.t('yourWardrobe'), 'Your wardrobe');
  assert.equal(i18n.t('yourWardrobe', undefined, 'pl'), 'Your wardrobe');
  assert.equal(i18n.t('wardrobeCount', { count: 8 }), '8 pieces you love.');
  assert.equal(i18n.t('demoModel'), 'Demo model');
  assert.equal(i18n.t('styleFitDisclaimer'), 'Style preview, not size fit');
  assert.equal(i18n.t('checkPurchase'), 'Check purchase');
});

test('PR-A sample wardrobe uses English board meanings and stable category IDs', () => {
  const example = state.initialState();
  assert.equal(example.version, 1);
  assert.equal(example.items.length, 11);
  assert.equal(new Set(example.items.map(item => item.id)).size, example.items.length);
  assert.equal(example.items[0].name, 'Cashmere sweater');
  assert.equal(example.items[7].name, 'Everyday handbag');
  assert.equal(example.items[8].name, 'Cream shirt · demo example');
  assert.equal(example.items[8].photo, null);
  assert.equal(example.items[0].category, 'tops');
  assert.equal(state.categoryLabel('bottoms'), 'Bottoms');
  assert.notEqual(example.items[0], state.initialState().items[0]);
});

test('wardrobe filters and case-insensitive search depend on data, not localized labels', () => {
  const wardrobe = state.initialState();
  assert.equal(state.itemsForView(wardrobe, 'all', '').length, 11);
  assert.deepEqual(state.itemsForView(wardrobe, 'bottoms', '').map(item => item.id), ['trousers']);
  assert.deepEqual(state.itemsForView(wardrobe, 'shoes', '').map(item => item.id), ['loafers']);
  assert.deepEqual(state.itemsForView(wardrobe, 'all', 'CASHMERE').map(item => item.id), ['cashmere']);
  assert.deepEqual(state.itemsForView(wardrobe, 'tops', 'leather'), []);
  assert.deepEqual(state.itemsForView(wardrobe, 'all', 'no such garment'), []);
});

test('four availability states and only ready status passes the ready-for-morning gate', () => {
  assert.deepEqual(Object.keys(state.AVAILABILITY), ['ready', 'in_wash', 'needs_ironing', 'needs_repair']);
  const wardrobe = state.initialState();
  for (const status of Object.keys(state.AVAILABILITY)) {
    const altered = state.setAvailability(wardrobe, 'blazer', status);
    const piece = altered.items.find(item => item.id === 'blazer');
    assert.equal(piece.availability, status);
    assert.equal(state.availableNow(piece), status === 'ready');
  }
  assert.equal(state.availabilityLabel('in_wash'), 'In the wash');
  assert.equal(state.availabilityLabel('needs_ironing'), 'Needs ironing');
  assert.equal(wardrobe.items.find(item => item.id === 'blazer').availability, 'ready');
  assert.throws(() => state.setAvailability(wardrobe, 'nonexistent', 'ready'), /Unknown item/);
  assert.throws(() => state.setAvailability(wardrobe, 'blazer', 'not-a-status'), /Unknown item/);
});

test('new own garments remain separate from image board references', () => {
  const original = state.initialState();
  const changed = state.addItem(original, {
    id: 'own_1', name: '  Rain coat  ', detail: 'Brown · Cotton',
    category: 'tops', availability: 'in_wash',
  });
  assert.equal(original.items.length, 11);
  assert.equal(changed.items.length, 12);
  assert.equal(state.itemsForView(changed, 'all', '')[0].id, 'own_1');
  assert.equal(state.itemsForView(changed, 'all', '')[0].photo, null);
  assert.equal(changed.items.at(-1).name, 'Rain coat');
  assert.throws(() => state.addItem(changed, { id: 'own_1', name: 'Duplicate', detail: '', category: 'tops', availability: 'ready' }), /Invalid/);
});

test('style profile is user-written and neither a generated rating nor a photo upload', () => {
  const original = state.initialState();
  const changed = state.setStyle(original, ' Beige and navy. ');
  assert.equal(changed.style, 'Beige and navy.');
  assert.match(original.style, /I like classic pieces/);
  assert.equal(changed.items, original.items);
  assert.throws(() => state.setStyle(changed, 'x'.repeat(5001)), /too long/);
});

test('validated demo state persists and corrupt storage falls back safely', () => {
  const values = new Map();
  const fake = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
  const previous = state.initialState();
  assert.equal(state.saveState(previous, fake), true);
  assert.deepEqual(state.loadState(fake), previous);
  values.set(state.STORAGE_KEY, '{"version":1,"items":[{"id":"x","name":"Oops"}],"style":""}');
  assert.deepEqual(state.loadState(fake), state.initialState());
  values.set(state.STORAGE_KEY, '{"version":999,"items":[],"style":""}');
  assert.deepEqual(state.loadState(fake), state.initialState());
  values.set(state.STORAGE_KEY, '{not json');
  assert.deepEqual(state.loadState(fake), state.initialState());
  assert.equal(state.saveState(previous, { setItem() { throw new Error('blocked'); } }), false);
  assert.deepEqual(state.loadState({ getItem() { throw new Error('blocked'); } }), state.initialState());
});

test('old Polish demo state migrates to neutral keys without losing user availability', () => {
  const old = state.initialState();
  const legacy = {
    ...old,
    style: 'Lubię klasykę, beż i granat. Nie noszę wzorów. Chciałabym wyglądać bardziej elegancko, bez przesady.',
    items: old.items.map(item => item.id === 'blazer'
      ? { ...item, name: 'Granatowa marynarka', detail: 'Granat · Wełna', category: 'Góry', availability: 'do_naprawy' }
      : item),
  };
  const migrated = state.parseStored(legacy);
  const blazer = migrated.items.find(item => item.id === 'blazer');
  assert.equal(blazer.name, 'Navy blazer');
  assert.equal(blazer.category, 'tops');
  assert.equal(blazer.availability, 'needs_repair');
  assert.equal(migrated.style, state.DEMO_STYLE);
});

test('persisted image names may only point to approved local board assets', () => {
  const valid = state.initialState();
  const bad = { ...valid, items: [{ ...valid.items[0], photo: 'https://attacker.example/image.png' }] };
  assert.deepEqual(state.parseStored(bad), valid);
});

test('existing PR-A wardrobe state gains matching recorded example tops on upgrade', () => {
  const current=state.initialState();
  const legacy={...current,style:'Personal style',items:current.items
    .filter(item=>!item.id.startsWith('recorded-'))
    .map(item=>item.id==='blazer'?{...item,availability:'needs_ironing'}:item)};
  const migrated=state.parseStored(legacy);
  assert.equal(migrated.items.length,11);
  assert.equal(migrated.items.filter(item=>item.id.startsWith('recorded-')).length,3);
  assert.equal(migrated.items.find(item=>item.id==='blazer').availability,'needs_ironing');
  assert.equal(migrated.style,'Personal style');
  assert.deepEqual(state.parseStored(migrated),migrated);
});
