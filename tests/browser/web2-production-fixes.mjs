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
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  await page.goto(base+'/app/#check');
  await page.locator('.purchase-example-banner').waitFor();
  const candidate=()=>page.locator('.purchase-candidate-list [data-purchase-candidate=all-round]');
  const basket=()=>page.locator('.purchase-basket').innerText();
  const assertNovaSelected=async()=>{
   assert.equal(await candidate().getAttribute('aria-pressed'),'true');
   assert.match(await page.locator('[data-purchase-selected=all-round]').innerText(),/Selected candidate: Nova jacket/);
   assert.equal(await page.locator('.purchase-preview-pair [data-recorded-garment="outerwear:all-round"]').count(),1);
   assert.equal(await page.locator('.purchase-top-picker [data-purchase-top=evening]').getAttribute('aria-pressed'),'true');
  };
  assert.equal(await candidate().getAttribute('aria-pressed'),'true','initial candidate matches the solved basket');
  await candidate().click();
  await page.locator('[data-purchase-top=evening]').click();
  await assertNovaSelected();
  assert.match(await basket(),/90\.00[\s\S]*Nova jacket/);
  assert.match(await page.locator('.purchase-rating-source').innerText(),/Preset example rating/);
  assert.match(await page.locator('.purchase-scope').innerText(),/For the selected clothes, needs and your ratings/);
  await page.locator('[data-purchase-rating=would_wear]').click();
  assert.match(await page.locator('.purchase-rating-impact').innerText(),/Basket unchanged: Nova jacket · PLN\s*90\.00/);
  await page.locator('[data-purchase-rating=would_not_wear]').click();
  await assertNovaSelected();
  assert.match(await basket(),/100\.00[\s\S]*Aster trench \+ Mila coat/);
  assert.match(await page.locator('.purchase-rating-impact').innerText(),/Before: Nova jacket · PLN\s*90\.00\. Now: Aster trench \+ Mila coat · PLN\s*100\.00/);
  assert.match(await page.locator('.purchase-rating-impact').innerText(),/does not count toward For evenings/);
  assert.match(await page.locator('.purchase-rating-source').innerText(),/Your rating for this pair/);
  assert.equal(await page.locator('[data-purchase-rating=would_not_wear]').getAttribute('aria-pressed'),'true');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:out+'/nova-rating-basket-'+width+'.png',fullPage:true});
  for(const unresolved of ['unrated','render_error']){
   await page.locator('[data-purchase-rating='+unresolved+']').click();
   await assertNovaSelected();
   assert.match(await page.locator('.purchase-verdict h2').innerText(),/Best confirmed basket so far: PLN\s*100\.00/);
   assert.match(await page.locator('.purchase-summary').innerText(),/90\.00 may still be possible/);
   assert.match(await page.locator('.purchase-rating-impact').innerText(),/unresolved, not rejected/);
   assert.equal(await page.locator('[data-purchase-review]').count(),1);
   assert.equal(await page.locator('.purchase-actions [data-purchase-choice=skip]').count(),0);
  }
  await page.locator('[data-purchase-rating=would_wear]').click();
  await assertNovaSelected();
  assert.match(await basket(),/90\.00[\s\S]*Nova jacket/);
  await page.locator('.purchase-candidate-list [data-purchase-candidate=cheap-b]').click();
  await page.locator('[data-purchase-top=work]').click();
  await page.locator('[data-purchase-rating=would_wear]').click();
  assert.equal(await page.locator('.purchase-candidate-list [data-purchase-candidate=cheap-b]').getAttribute('aria-pressed'),'true');
  assert.match(await basket(),/90\.00[\s\S]*Nova jacket/,'rating a browsed candidate must not switch selection to the basket winner');
  await page.locator('.purchase-candidate-list [data-purchase-candidate=cheap-a]').click();
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
  assert.deepEqual(errors,[]);
  rows.push({width,touchTargets:'passed',buyNothing:'passed',exampleLabels:'passed',novaIdentity:'passed',ratingChangesBasket90to100:'passed',unchangedAndUnresolved:'passed',errors});await page.close();
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
