// Browser plugin unavailable. Local/preview/prod checks block every live endpoint.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL??'http://127.0.0.1:8788';
const out=process.env.QA_OUTPUT??'test-results/production-fixes';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const rows=[];
try{
 for(const width of [375,768,980,1100,1440]){
  const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  await page.goto(base+'/app/#check');
  await page.locator('.purchase-example-banner').waitFor();
  for(const selector of ['.purchase-top-picker button','.purchase-unsure','.purchase-save-later','.purchase-import-actions .text-link']){
   const targets=await page.locator(selector).evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));
   assert.ok(targets.length&&targets.every(h=>h>=44),selector+' at '+width);
  }
  assert.equal(await page.locator('.purchase-demo-modes [data-purchase-demo=zero]:visible').count(),1);
  await page.locator('[data-purchase-demo=zero]').click();
  await page.locator('.purchase-zero-example').waitFor();
  assert.match(await page.locator('.purchase-basket').innerText(),/0\.00/);
  assert.match(await page.locator('.purchase-example-banner').innerText(),/Example/);
  assert.match(await page.locator('.purchase-zero-example').innerText(),/logic example with preset ratings/);
  assert.equal(await page.locator('.purchase-image-empty:visible').count(),0);
  assert.equal(await page.locator('.purchase-zero-example img').count(),0,'do not impersonate a recorded render');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:out+'/buy-nothing-'+width+'.png',fullPage:true});
  await page.locator('[data-purchase-demo=minimum]').click();
  assert.equal(await page.locator('.purchase-preview-pair img').count(),2);
  await page.goto(base+'/app/#gallery');
  for(const summary of await page.locator('.mall-item-name summary,.mall-live-controls summary').all())assert.ok(await summary.evaluate(e=>e.getBoundingClientRect().height)>=44);
  rows.push({width,touchTargets:'passed',buyNothing:'passed',exampleLabels:'passed'});await page.close();
 }
 const context=await browser.newContext();
 const missing=await context.request.get(base+'/does-not-exist');
 assert.equal(missing.status(),404);assert.match(await missing.text(),/This page does not exist/);
 for(const path of ['/retailers','/retailers/']){
  const legacy=await context.request.get(base+path,{maxRedirects:0});assert.equal(legacy.status(),301);assert.equal(legacy.headers().location,'/retail/');
 }
 const page=await context.newPage();await page.goto(base+'/app/#trip');
 assert.match(await page.locator('.trip-example-note').innerText(),/sample occasions/);
 await page.goto(base+'/judges/');
 const film=page.locator('.mkt-walkthrough video');
 assert.equal(await film.getAttribute('poster'),'/video/wearagain-final-v7-poster.jpg');
 assert.equal(await film.locator('source').getAttribute('src'),'/video/wearagain-final-v7.mp4');
 assert.equal(await film.locator('source').getAttribute('type'),'video/mp4');
 assert.equal(await film.locator('track').getAttribute('src'),'/video/wearagain-final-v7.en.vtt');
 const poster=await context.request.get(base+'/video/wearagain-final-v7-poster.jpg');
 assert.equal(poster.status(),200);assert.match(poster.headers()['content-type'],/^image\/jpeg/);
 await context.close();
 await writeFile(out+'/report.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
}finally{await browser.close();}
