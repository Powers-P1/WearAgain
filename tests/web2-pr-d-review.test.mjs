import assert from 'node:assert/strict';
import test,{before} from 'node:test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

let shopping,daily,i18n;
const source=async path=>readFile(fileURLToPath(new URL(path,import.meta.url)),'utf8');
before(async()=>{
  const load=async path=>{
    const result=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
      bundle:true,write:false,platform:'node',format:'esm',target:'es2022'});
    return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  };
  [shopping,daily,i18n]=await Promise.all([
    load('../web2/src/shopping.ts'),load('../web2/src/daily.ts'),load('../web2/src/i18n.ts'),
  ]);
});

test('review #16: morning headings use meaningful zero / singular / plural English',()=>{
  assert.equal(daily.morningHeadingKey(0),'morningReadyNone');
  assert.equal(daily.morningHeadingKey(1),'morningReadyOne');
  assert.equal(daily.morningHeadingKey(3),'morningReadyMany');
  assert.equal(i18n.t(daily.morningHeadingKey(0)),'No complete outfit is ready yet.');
  assert.equal(i18n.t(daily.morningHeadingKey(1)),'1 outfit is ready.');
  assert.equal(i18n.t(daily.morningHeadingKey(3),{count:3}),'3 ready outfits. You can go.');
  assert.match(i18n.t('morningTapToSave'),/^Tap to save/);
  assert.match(i18n.t('morningSavedAsToday'),/^Recorded as/);
  assert.equal(i18n.t('morningOneGarmentBadge'),'Demo model · one garment');
});

test('review #16: unsaved shop, floor, optional photo name and link drafts survive independent edits',()=>{
  const session=shopping.sampleShopping();
  const original=shopping.initialCaptureDraft(session);
  let draft=shopping.updateCaptureDraft(original,'mall-shop-name','Northside boutique');
  draft=shopping.updateCaptureDraft(draft,'mall-floor','Floor 1');
  draft=shopping.updateCaptureDraft(draft,'mall-capture-title','Camel coat');
  draft=shopping.updateCaptureDraft(draft,'mall-link-name','Navy jacket');
  draft=shopping.updateCaptureDraft(draft,'mall-link-address','https://store.example/item');
  assert.deepEqual(draft,{
    shop:'Northside boutique',floor:'Floor 1',itemName:'Camel coat',
    linkName:'Navy jacket',linkUrl:'https://store.example/item',
  });
  const changed=shopping.updateCaptureDraft(draft,'mall-link-name','Navy linen jacket');
  assert.equal(changed.shop,draft.shop);
  assert.equal(changed.floor,draft.floor);
  assert.equal(changed.itemName,draft.itemName);
  assert.equal(changed.linkUrl,draft.linkUrl);
  assert.deepEqual(shopping.updateCaptureDraft(changed,'wardrobe-search','unrelated'),changed);
  assert.deepEqual(original,shopping.initialCaptureDraft(session));
});

test('review #16: mobile camera has a real focusable tile before name, finds and passive link form',async()=>{
  const src=await source('../web2/src/gallery-ui.ts');
  const css=await source('../web2/src/gallery.css');
  const camera=src.slice(src.indexOf('function camera():string{'),src.indexOf('function readyList():'));
  for(const v of ['mall-context-summary','mall-capture-label','mall-capture-title','mall-queue-panel','mall-link-panel'])
    assert.ok(camera.includes(v),'missing '+v);
  assert.ok(camera.indexOf('mall-capture-label')<camera.indexOf('mall-capture-title'));
  assert.ok(camera.indexOf('mall-capture-title')<camera.indexOf('mall-queue-panel'));
  assert.ok(camera.indexOf('mall-queue-panel')<camera.indexOf('mall-link-panel'));
  const tileStart=camera.indexOf("'<label class=\"mall-capture-label\"");
  const tile=camera.slice(tileStart,camera.indexOf("'</label>'",tileStart));
  assert.match(tile,/mall-camera/);
  assert.match(tile,/type="file"/);
  assert.match(css,/\.mall-capture-label:focus-within\s*\{[^}]*outline:\s*3px/);
  assert.match(css,/\.mall-capture-label\{min-height:150px/);
});

test('review #16: photo deletion requires consent with a 44px target',async()=>{
  const src=await source('../web2/src/gallery-ui.ts');
  const css=await source('../web2/src/gallery.css');
  const handler=src.slice(src.indexOf('export function handleGalleryClick'),src.indexOf('export function handleGallerySubmit'));
  assert.ok(handler.indexOf("window.confirm(t('mallConfirmRemove'")>=0);
  assert.ok(handler.indexOf("window.confirm(t('mallConfirmRemove'")<handler.indexOf('session=removeShopItem'));
  assert.match(css,/\.mall-remove\s*\{\s*min-width:44px;min-height:44px/);
});

test('review #16: UI draft sync and fallback focus are wired for captures and route/stage changes',async()=>{
  const [main,morning,overview,gallery]=await Promise.all([
    source('../web2/src/main.ts'),source('../web2/src/morning-ui.ts'),
    source('../web2/src/overview-ui.ts'),source('../web2/src/gallery-ui.ts'),
  ]);
  assert.match(main,/handleMorningInput\(target\)/);
  assert.match(main,/handleGalleryInput\(target\)/);
  assert.match(main,/focusTarget\.focus\(\{preventScroll:true\}\)/);
  assert.match(main,/focusTarget\.setAttribute\('tabindex','-1'\)/);
  assert.match(main,/querySelectorAll<HTMLElement>\('main \.page h1, main \.page h2, main h1'\)/);
  assert.match(main,/focusCandidates\.find\(el=>el\.getClientRects\(\)\.length>0/);
  assert.match(main,/mainElement\.focus\(\{preventScroll:true\}\)/);
  assert.match(gallery,/actions\.focus\?\.\('#mall-camera'\)/);
  assert.match(morning,/spoken=target\.value/);
  assert.match(morning,/t\(morningHeadingKey\(looks\.length\)/);
  assert.match(morning,/t\('morningTapToSave'\)/);
  assert.match(morning,/morning-photo-badge/);
  assert.match(overview,/overview-photo-badge/);
});
