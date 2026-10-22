import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
const get=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('desktop board 08 keeps three explicitly separate columns and mobile original',async()=>{
 const [ui,css]=await Promise.all([get('web2/src/purchase-ui.ts'),get('web2/src/purchase.css')]);
 assert.match(ui,/purchase-desktop-layout/);
 assert.match(ui,/candidateButtons\('mobile'\) \+ previewColumn\(\) \+ verdictColumn\(\)/);
 assert.match(ui,/candidateButtons\('desktop'\) \+ desktopPreview\(\) \+ desktopVerdict\(\)/);
 assert.match(ui,/purchase-model-stage/);
 assert.match(ui,/purchase-model-actions/);
 assert.match(ui,/purchase-desktop-products/);
 assert.match(ui,/purchase-desktop-meta/);
 assert.match(ui,/certificateExplanation\(result\)/);
 assert.match(css,/@media\(min-width:801px\)/);
 assert.match(css,/purchase-desktop-layout\{display:grid;grid-template-columns:/);
 assert.match(css,/@media\(max-width:800px\)\{\.purchase-desktop-layout,\.purchase-desktop-meta\{display:none\}\}/);
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
