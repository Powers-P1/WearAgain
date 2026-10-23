import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {checkJuryMedia} from './web2-media.mjs';
const base=process.env.BASE_URL??'http://127.0.0.1:8788',repo=fileURLToPath(new URL('../../',import.meta.url)).replaceAll('\\','/').replace(/\/$/,'');
const output=resolve(process.env.QA_OUTPUT??'test-results/web2');await mkdir(output,{recursive:true});
const steps=[],errors=[],events=[],startedAt=new Date().toISOString();
let browser=null,activeStep='Browser launch',failure=null,media=null,completed=false;
const persist=()=>writeFile(output+'/results.json',JSON.stringify({status:failure?'failed':completed?'passed':'running',startedAt,activeStep,steps,events,errors,failure,media},null,2));
const progress=async(label,details)=>{activeStep=label;if(details)media=details;events.push({at:new Date().toISOString(),label});console.log('[qa:web2] '+label+(details?' '+JSON.stringify(details):''));await persist();};
const passed=async label=>{steps.push(label);await progress('PASS: '+label);};
await progress(activeStep);
try{
 browser=await chromium.launch({headless:true,timeout:15000,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',permissions:['camera']});
 context.setDefaultTimeout(8000);context.setDefaultNavigationTimeout(15000);
 // The browser suite never reaches a real provider, even if a build uses a
 // different API origin. Specific protocol mocks below override this guard.
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 const go=hash=>page.goto(base+'/app/#'+hash);
 const click=selector=>page.locator(selector).click();
 const wait=async(label,predicate)=>{await progress(label);await page.waitForFunction(predicate,null,{timeout:8000});};
 const expand=async selector=>{if(!await page.locator(selector).evaluate(el=>el.open))await page.locator(selector+'>summary').click();};
 await progress('Pair rating / recommendation / incomplete result');
 await go('check');
 const ratings=await page.locator('.purchase-rating-buttons').boundingBox();assert.ok(ratings.y+ratings.height<775);
 await click('.purchase-actions [data-purchase-candidate="all-round"]');assert.match(await page.locator('.purchase-verdict').innerText(),/worth|Worth/i);
 await click('.purchase-demo-settings summary');await click('[data-purchase-clear]');assert.equal(await page.locator('[data-purchase-review]').count(),1);
 await click('[data-purchase-replay]');await passed('Pair rating / recommendation / incomplete result');
 await progress('Save / open / wear complete outfit');
 await go('stylist');await click('#stylist-form [type=submit]');await page.locator('.show-result').waitFor();
 await click('.stylist-details [data-save-look]');await go('saved');assert.equal(await page.locator('.saved-look-item').count(),1);
 await click('[data-saved-open]');await page.locator('.saved-detail-layout').waitFor();assert.equal(await page.locator('.stylist-garment').count(),4);assert.match(await page.locator('.outfit-illustration').innerText(),/Illustrative styling/);
 await click('[data-saved-wear]');await go('overview');await click('.overview-mobile-insights summary');assert.match(await page.locator('.overview-mobile-counts').innerText(),/4 pieces with a logged wear/);await passed('Save / open / wear actual complete outfit');
 await progress('Trip / companion wardrobe / packing persistence');
 await go('saved');await click('[data-saved-open]');await click('[data-saved-trip]');await click('[data-trip-assign-pending="dinner"]');
 assert.equal(await page.locator('.trip-packing-row').count(),4);await page.locator('[data-trip-packed]').first().check();
 await page.reload();assert.equal(await page.locator('[data-trip-packed]:checked').count(),1);
 await click('[data-trip-shared="yes"]');await click('.trip-companion>summary');await page.locator('#trip-companion-name input').fill('Alex');await click('#trip-companion-name button');
 assert.match(await page.locator('.trip-companion').innerText(),/0 companion pieces/);
 for(const [name,category] of [['Alex shirt','tops'],['Alex trousers','bottoms'],['Alex shoes','shoes']]){
  await expand('.companion-wardrobe details');await page.locator('#trip-companion-piece [name=name]').fill(name);
  await page.locator('#trip-companion-piece [name=category]').selectOption(category);await click('#trip-companion-piece [type=submit]');
 }
 await click('[data-trip-companion-event="dinner"]');
 for(const option of await page.locator('#trip-companion-outfit [name=piece]').all())await option.check();
 await click('#trip-companion-outfit [type=submit]');assert.equal(await page.locator('.trip-packing-row').count(),7);
 await page.locator('[data-trip-packed^=companion_]').first().check();await page.reload();await click('[data-trip-shared="yes"]');
 assert.equal(await page.locator('[data-trip-packed^=companion_]:checked').count(),1);
 await passed('Trip assignment / both wardrobes / separate packing persistence');
 await progress('Surprise preferences / budget / skip month');
 await go('surprise');await page.locator('input[value="300"]').check();await click('.surprise-need summary');await page.locator('[name=need]').fill('A plain navy scarf');await click('#surprise-form [type=submit]');await click('[data-surprise-skip]');
 await page.reload();assert.equal(await page.locator('input[value="300"]').isChecked(),true);assert.equal(await page.locator('[name=need]').inputValue(),'A plain navy scarf');await passed('Surprise preferences / budget / skip month');
 await progress('Confirmed wardrobe needs persistence');
 await go('balance');await click('.balance-add-need summary');await page.locator('#wardrobe-need-form input').fill('Rainproof shoes');await click('#wardrobe-need-form button');await page.reload();assert.match(await page.locator('.balance-needs').innerText(),/Rainproof shoes/);await passed('Confirmed wardrobe needs persistence');
 await progress('Personal wardrobe photo / IndexedDB');
 await go('add');await page.locator('[name=name]').fill('QA personal coat');await page.locator('[name=category]').selectOption('tops');
 await page.locator('#wardrobe-photo').setInputFiles(repo+'/web2/dist/assets/items/coat.webp');await click('#add-form [type=submit]');await page.waitForURL(/#wardrobe$/);
 await page.reload();const own=page.getByRole('button',{name:/QA personal coat/});assert.equal(await own.count(),1);await own.locator('img[src^="blob:"]').waitFor();await passed('Personal wardrobe photo persists in IndexedDB');
 let apiCalls=0,submitted=0;const jpeg=await readFile(repo+'/web/demo/renders/outerwear-cheap-a-woman-neutral-01.jpg');
 const bucket={limitUnits:440,spentUnits:0,reservedUnits:0,remainingUnits:440};const budget={utcDay:'2026-10-22',unitsPerRender:2,total:bucket,daily:bucket,sessionDaily:bucket};
 await page.route('https://wearagain-api.oli-struska.workers.dev/**',async route=>{
  apiCalls++;const req=route.request(),url=new URL(req.url());
  if(url.pathname==='/api/session')return route.fulfill({json:{sessionToken:'qa-synthetic-token',expiresAt:Date.now()+3600000,unitsPerRender:2}});
  if(url.pathname==='/api/ledger')return route.fulfill({json:budget});
  if(url.pathname==='/api/renders'){
   submitted++;const key=String(submitted).padStart(64,'a');
   return route.fulfill({json:{mode:'live',renderKey:key,status:'succeeded',accounting:'charged',reservedUnits:0,chargedUnits:2,reason:null,requiresReconciliation:false,assetId:'youcam:'+key,imageUrl:null,statusUrl:'/api/renders/'+key,imageRequiresDownload:true,budget}});
  }
  if(url.pathname.endsWith('/image'))return route.fulfill({body:jpeg,contentType:'image/jpeg',headers:{'X-WearAgain-Asset-Id':'youcam:'+url.pathname.split('/')[3],'Access-Control-Expose-Headers':'X-WearAgain-Asset-Id'}});
  throw Error('Unexpected mock request '+url.pathname);
 });
 await progress('Gallery / opt-in / mocked provider protocol');
 await go('gallery');assert.equal(apiCalls,0);
 await click('[data-mall-context-toggle]');await page.locator('#mall-shop-name').fill('QA shop');await page.locator('#mall-floor').fill('Floor 1');
 await click('.mall-item-name summary');await page.locator('#mall-capture-title').fill('First coat');await page.locator('#mall-camera').setInputFiles(repo+'/web2/dist/assets/items/coat.webp');
 await wait('Gallery: first photo enters queue',()=>document.querySelector('.mall-queue-items')?.textContent?.includes('First coat'));
 assert.equal(apiCalls,0);assert.match(await page.locator('.mall-queue-items').textContent(),/QA shop · Floor 1/);
 await click('.mall-live-controls summary');await page.locator('[name=garmentOnly]').check();await click('#mall-live-form [type=submit]');
 await wait('Gallery: first mocked render ready',()=>document.querySelector('.mall-status-ready')!==null);assert.equal(submitted,1);
 await click('[data-mall-camera-start]');await wait('Gallery: fake camera video metadata',()=>document.querySelector('#mall-viewfinder')?.videoWidth>0);
 await page.locator('#mall-capture-title').fill('Second capture');await click('[data-mall-camera-shutter]');
 await wait('Gallery: second camera capture enters queue',()=>document.querySelector('.mall-queue-items')?.textContent?.includes('Second capture'));
 assert.equal(await page.locator('#mall-viewfinder').evaluate(el=>el.srcObject?.getVideoTracks()[0]?.readyState),'live');
 await wait('Gallery: second mocked render ready',()=>document.querySelectorAll('.mall-status-ready').length===2);assert.equal(submitted,2);
 await page.getByRole('button',{name:'Coffee review',exact:true}).click();assert.match(await page.locator('.mall-coffee-list').innerText(),/5 ready/);
 await page.locator('.mall-coffee-queue button').filter({hasText:'First coat'}).click();await page.locator('img.mall-model-image[src^="blob:"]').waitFor();
 await click('[data-mall-decision="return"]');await page.reload();await click('[data-mall-view="returns"]');assert.match(await page.locator('.mall-return-page').innerText(),/QA shop/);
 await page.getByRole('button',{name:'Coffee review',exact:true}).click();await page.locator('.mall-coffee-queue button').filter({hasText:'First coat'}).click();await page.locator('img.mall-model-image[src^="blob:"]').waitFor();
 await passed('No upload without opt-in / mocked YouCam protocol / continuous fake camera / actual result blob / coffee shortlist survives reload');
 await progress('Jury guided next step');
 await page.goto(base+'/judges/demo/');await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await click('.mkt-guide-actions [data-guide-step="preview"]');assert.equal(await page.evaluate(()=>scrollY),0);
 assert.match(await page.locator('[aria-current=step]').innerText(),/02\s*Try-on evidence/);await passed('Jury next step scroll and current-step semantics');
 await progress('Retail panel open / close / save');
 await page.goto(base+'/retail/demo/');await click('.mkt-retail-panel [data-retail-panel-toggle]');assert.equal(await page.locator('.mkt-retail-panel').count(),0);await click('.mkt-product-details [data-retail-panel-open]');await click('[data-retail-save]');assert.equal(await page.locator('.mkt-saved-note').count(),1);await passed('Retail panel open / close / save');
 await progress('Jury approved v7 media checks');
 await page.goto(base+'/judges/#walkthrough');
 const manifest=JSON.parse(await readFile(repo+'/docs/demo/final-v7/manifest.json','utf8'));
 media=await checkJuryMedia({page,context,base,manifest,progress});
 await passed(media.playback.status==='skipped'?'Approved v7 HTTP / MIME / VTT / metadata passed; playback explicitly skipped for absent codec':'Approved v7 HTTP / MIME / VTT / metadata / playback / pause / seek passed');
 assert.deepEqual(errors,[]);await context.close();completed=true;
}catch(error){failure={step:activeStep,message:String(error),stack:error.stack};console.error('[qa:web2] FAIL '+activeStep+' '+String(error));await persist();for(const c of browser?.contexts()??[])for(const p of c.pages()){
 try{await p.screenshot({path:output+'/failure.png',fullPage:true,timeout:3000});console.log((await p.locator('main').innerText({timeout:2000})).slice(-7000));console.log(await p.evaluate(()=>localStorage.getItem('wearagain:web2:render-queue:v1')));}catch(diagnosticError){console.error('Failure diagnostics: '+String(diagnosticError));}
 }throw error;}
finally{await persist();await browser?.close();}
console.log(JSON.stringify({passed:steps.length,steps,errors},null,2));
