/* Browser plugin not available. Repeatable Chromium state coverage complements
 * connected Edge review. All provider calls are blocked; camera is synthetic. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const base=process.env.BASE_URL??'http://127.0.0.1:8788';
const out=resolve(process.env.QA_OUTPUT??'test-results/web2-states');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const evidence=[],errors=[];
try{
 for(const [width,height] of [[390,844],[1280,800],[1536,1024]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',permissions:['camera']});
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(7000);
  page.on('pageerror',error=>errors.push({width,error:String(error)}));
  page.on('console',message=>{if(message.type()==='error')errors.push({width,error:message.text()});});
  const go=hash=>page.goto(base+'/app/#'+hash);
  const click=async selector=>{await page.locator(selector).click();await page.waitForTimeout(40);};
  async function capture(name,primary,aboveFold=false){
   await page.locator('main h1').first().waitFor({state:'attached'});
   await page.evaluate(async()=>{scrollTo({top:0,behavior:'instant'});await document.fonts.ready;});
   await page.waitForFunction(()=>[...document.images].filter(img=>!img.closest('details:not([open])')&&img.getClientRects().length&&img.getBoundingClientRect().bottom>0&&img.getBoundingClientRect().top<innerHeight).every(img=>img.complete),{timeout:7000});
   const state=await page.evaluate(()=>({title:document.title,heading:document.querySelector('main h1')?.textContent,url:location.href,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,broken:[...document.images].filter(img=>img.getClientRects().length&&img.complete&&!img.naturalWidth).map(img=>img.src)}));
   assert.ok(state.heading,name+' must have a heading');assert.ok(state.title.includes('WearAgain'));
   assert.ok(state.scrollWidth<=width+1,name+' overflows horizontally');assert.deepEqual(state.broken,[],name+' broken images');
   await page.screenshot({path:out+'/'+name+'-'+width+'.png',fullPage:false});
   await page.screenshot({path:out+'/'+name+'-'+width+'-full.png',fullPage:true});
   if(primary){const control=page.locator(primary).first();await control.waitFor({state:'visible'});const rect=await control.boundingBox();state.primary=rect;if(width===390&&aboveFold)assert.ok(rect.y>=0&&rect.y+rect.height<=height-69,name+' main action below mobile navigation: '+JSON.stringify(rect));}
   evidence.push({name,viewport:{width,height},...state});
  }
  await go('wardrobe');await capture('wardrobe',width===390?'[data-nav=stylist].mobile-only':'.desktop-header-actions [data-nav=stylist]',width===390);
  await click('[data-cat=tops]');await capture('wardrobe-filtered');
  await page.locator('#wardrobe-search').fill('unmatchable garment');await capture('wardrobe-empty-search');
  await go('profile');await capture('profile','#style-form [type=submit]',true);
  await page.locator('#style-description').fill('Classic, beige and navy. Comfortable for work.');await click('#style-form [type=submit]');await capture('profile-saved');
  await go('add');await capture('wardrobe-add','#add-form [type=submit]');
  await go('item/dress');await capture('wardrobe-item','[data-status=ready]');
  await go('saved');await capture('saved-empty');
  await go('stylist');await capture('stylist-brief','#stylist-form [type=submit]',true);
  await click('#stylist-form [type=submit]');await page.locator('.show-result').waitFor();assert.equal(await page.evaluate(()=>scrollY),0);await capture('stylist-result','.stylist-details [data-save-look]',true);
  await click('.stylist-details [data-look-next]');await capture('stylist-next');
  await click('.stylist-details [data-look-next]');await capture('stylist-third');
  await click('.stylist-preview-detail summary');await capture('stylist-recorded-evidence');
  await click('.stylist-details [data-save-look]');await go('saved');await capture('saved-list','[data-saved-open]');
  await click('[data-saved-open]');await page.locator('.saved-detail-layout').waitFor();await capture('saved-detail','[data-saved-wear]');
  await click('[data-saved-wear]');await go('overview');await capture('overview-recorded','[data-overview-review]');
  await click('[data-overview-review=dress]');await capture('review-condition','#review-availability');
  await page.locator('#review-availability').selectOption('ready');await page.reload();assert.equal(await page.locator('#review-availability').inputValue(),'ready');await capture('review-ready');
  await click('[data-overview-decision=keep]');await capture('review-decision','[data-overview-save]',true);await click('[data-overview-save]');
  await go('balance');await capture('balance','.balance-add-need summary');
  await click('[data-balance-expand]');await capture('balance-expanded');
  await click('[data-balance-category=shoes]');await capture('balance-category');
  await click('.balance-add-need summary');await page.locator('#wardrobe-need-form input').fill('Rainproof shoes');await click('#wardrobe-need-form button');await capture('balance-confirmed-need');
  await go('morning');await capture('morning-brief','#morning-form [type=submit]',true);
  await click('[data-morning-type]');await page.locator('#morning-request').fill('Work, in a hurry. No ironing.');await capture('morning-typing');
  await click('#morning-form [type=submit]');await page.locator('.morning-looks').waitFor();await capture('morning-ready','[data-morning-wear]',true);
  await page.locator('.morning-look[aria-checked=true]').press('ArrowDown');assert.equal(await page.locator('.morning-look').nth(1).getAttribute('aria-checked'),'true');await click('[data-morning-wear]');await capture('morning-worn');
  await go('trip');await capture('trip-own','[data-trip-select-event]');
  await click('[data-trip-shared=yes]');await capture('trip-shared-empty','[data-trip-setup]');
  await click('[data-trip-setup]');await page.locator('#trip-companion-name input').fill('Alex');await click('#trip-companion-name button');await capture('trip-companion-setup');
  await click('.trip-person [data-trip-select-event]');await capture('trip-outfit-picker','[data-trip-choose-look]');
  await click('[data-trip-choose-look="0"]');await capture('trip-assigned','[data-trip-packed]');
  await page.locator('[data-trip-packed]').first().check();await capture('trip-packed');
  await click('[data-trip-shared=no]');for(let i=0;i<3;i++)await page.locator('[data-trip-remove-event]').first().click();await capture('trip-empty','[data-trip-add-occasion]');
  await click('[data-trip-add-occasion]');await page.locator('#trip-event-form [name=label]').fill('Dinner with friends');await click('#trip-event-form [type=submit]');await capture('trip-new-occasion');
  await go('surprise');await capture('surprise','#surprise-form [type=submit]',true);
  await page.locator('input[value="300"]').check();await click('.surprise-need summary');await page.locator('[name=need]').fill('A plain navy scarf');await click('#surprise-form [type=submit]');await click('.surprise-rules summary');await capture('surprise-preferences-rules');
  await click('[data-surprise-skip]');await capture('surprise-paused');
  await go('gallery');await capture('gallery-idle','[data-mall-camera-start]',true);
  await click('[data-mall-context-toggle]');await page.locator('#mall-shop-name').fill('Demo Atelier');await page.locator('#mall-floor').fill('Level 1');await click('#mall-shop-form [type=submit]');await capture('gallery-context');
  await click('[data-mall-camera-start]');await page.waitForFunction(()=>document.querySelector('#mall-viewfinder')?.videoWidth>0);await capture('gallery-camera','[data-mall-camera-shutter]',true);
  await click('[data-mall-camera-shutter]');await page.waitForFunction(()=>document.querySelectorAll('.mall-queue-item').length===4);await capture('gallery-captured');
  await click('[data-mall-camera-stop]');await click('.mall-live-controls summary');await capture('gallery-preview-optin');
  let mockOutcome='unknown',submits=0;
  const bucket={limitUnits:440,spentUnits:0,reservedUnits:0,remainingUnits:440},budget={utcDay:'2026-10-22',unitsPerRender:2,total:bucket,daily:bucket,sessionDaily:bucket};
  await page.route('https://wearagain-api.oli-struska.workers.dev/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/session')return route.fulfill({json:{sessionToken:'qa-synthetic-token',expiresAt:Date.now()+3600000,unitsPerRender:2}});
   if(path==='/api/ledger')return route.fulfill({json:budget});
   if(path==='/api/renders'){submits++;const renderKey=String(submits).padStart(64,'b');return route.fulfill({json:{mode:'live',renderKey,status:mockOutcome==='unknown'?'pending':'error',accounting:mockOutcome==='unknown'?'reserved':'released',reservedUnits:mockOutcome==='unknown'?2:0,chargedUnits:0,reason:mockOutcome==='unknown'?null:'processing_failed',requiresReconciliation:mockOutcome==='unknown',assetId:null,imageUrl:null,statusUrl:'/api/renders/'+renderKey,imageRequiresDownload:false,budget}});}
   throw Error('Unexpected mock provider request '+path);
  });
  await page.locator('[name=garmentOnly]').check();await click('#mall-live-form [type=submit]');await page.waitForFunction(()=>document.querySelector('.mall-status-unknown'));assert.equal(submits,1);
  await click('.mall-tabs [data-mall-view=coffee]');await capture('gallery-coffee-unknown');await click('.mall-tabs [data-mall-view=capture]');
  mockOutcome='error';await page.locator('#mall-camera').setInputFiles(resolve(repo,'web2/dist/assets/items/coat.webp'));await page.waitForFunction(()=>document.querySelector('.mall-status-error'));
  await click('.mall-tabs [data-mall-view=coffee]');await capture('gallery-coffee-error');assert.equal(submits,2);
  await capture('gallery-coffee-list','[data-mall-review-ready]');
  await page.locator('.mall-coffee-queue [data-mall-open]').last().click();assert.equal(await page.evaluate(()=>scrollY),0);await click('.mall-intro [data-mall-back]');
  await click('[data-mall-review-ready]');await capture('gallery-review','[data-mall-decision=return]',true);
  await click('[data-mall-decision=return]');await click('[data-mall-view=returns]');await capture('gallery-returns','[data-mall-open]');
  await click('[data-mall-open]');await capture('gallery-return-photo');
  await go('check');await capture('purchase-minimum','[data-purchase-rating=would_wear]',true);
  assert.equal(await page.locator('[data-purchase-candidate=all-round]').getAttribute('aria-pressed'),'true');
  await click('[data-purchase-candidate=cheap-a]');await capture('purchase-other-candidate');
  await click('.purchase-actions [data-purchase-candidate=all-round]');await capture('purchase-recommendation');
  await click('.purchase-compare summary');await capture('purchase-compare-own');await click('[data-purchase-equivalent]');await capture('purchase-own-equivalent');
  await click('.purchase-demo-settings summary');await click('[data-purchase-clear]');await capture('purchase-incomplete');
  await page.goto(base+'/app/?scenario=zero#check');await capture('purchase-zero');
  await go('item/loafers');await click('[data-status=in_wash]');await go('morning');await click('#morning-form [type=submit]');await page.locator('.morning-no-result').waitFor();await capture('morning-none-ready');
  for(const [name,path] of [['landing','/'],['retail','/retail/'],['retail-product','/retail/demo/'],['judges','/judges/'],['guided-wardrobe','/judges/demo/'],['guided-preview','/judges/demo/?step=preview'],['guided-verdict','/judges/demo/?step=verdict']]){
   await page.goto(base+path);await capture(name);
   if(name==='retail-product'){await click('.mkt-retail-panel [data-retail-panel-toggle]');await capture('retail-panel-closed');await click('.mkt-product-details [data-retail-panel-open]');await click('[data-retail-save]');await capture('retail-saved');}
   if(name==='guided-verdict'){await click('[data-judge-mode=zero]');await capture('guided-zero');}
  }
  await context.close();console.log('Captured '+width+'px state flows');
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(out+'/states.json',JSON.stringify({evidence,errors},null,2));}
console.log(JSON.stringify({states:evidence.length,errors},null,2));
