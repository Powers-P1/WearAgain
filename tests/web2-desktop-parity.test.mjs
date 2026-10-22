import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
const get=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('purchase reuses one responsive surface with three desktop regions',async()=>{
 const [ui,css]=await Promise.all([get('web2/src/purchase-ui.ts'),get('web2/src/purchase.css')]);
 assert.match(ui,/candidates\(\) \+ previews\(\) \+ verdict\(wardrobe\)/);
 assert.match(css,/grid-template-columns:minmax\(170px/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/\.purchase-layout\{display:flex;flex-direction:column/);
});

test('v1 landing source imagery, copy and static CSS crops are preserved without inline styles',async()=>{
 const [src,css,build,headers,marketing]=await Promise.all([
  get('web2/src/landing-v1.ts'),get('web2/src/landing-v1.css'),
  get('scripts/build-web2.mjs'),get('web2/_headers'),get('web2/src/marketing.ts')]);
 assert.match(src,/Buy what earns a place/);
 assert.match(src,/Sometimes, the best basket is empty/);
 assert.match(src,/For judges/);
 assert.match(src,/href="\/retail\//);
 assert.match(src,/href="\/app\//);
 assert.doesNotMatch(src,/style=/);
 assert.match(css,/\.v1-crop-0/);
 assert.match(build,/docs\/mockups\/landing-v1\.png/);
 assert.match(headers,/style-src 'self'; font-src 'self'/);
 assert.match(marketing,/renderLanding\('shoppers'\)/);
});
test('screenshot review compares true screenshots against boards 05-08 and live v1 in both viewports',async()=>{
 const workflow=await get('.github/workflows/web2-visual.yml');
 assert.match(workflow,/landing-live-v1-1280/);
 assert.match(workflow,/landing-live-v1-390/);
 for(const board of ['05','06','07','08'])assert.ok(workflow.includes('WearAgain-'+board+'-Desktop-'));
 assert.match(workflow,/actual-left-reference-right/);
 assert.match(workflow,/consumer-overview/);
 assert.match(workflow,/consumer-stylist/);
 assert.match(workflow,/consumer-purchase/);
});
