/** Actual built v2 flow; all external requests are blocked. No provider job or personal browser is used. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.WEB2_BASE_URL??'http://127.0.0.1:8788',out=resolve('test-results/walkthrough');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];
try{for(const width of [390,1280]){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});context.setDefaultTimeout(10000);
 const errors=[],external=[];await context.route('**/*',r=>{if(new URL(r.request().url()).origin===new URL(base).origin)return r.continue();external.push(r.request().url());return r.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 const next=page.locator('[data-coach=next]');
 const advance=async step=>{await page.waitForFunction(()=>!document.querySelector('[data-coach=next]')?.disabled);assert.match(await page.locator('.wear-guide-progress').innerText(),new RegExp(' '+step+' / 9$'));await next.click();};
 await page.goto(base+'/app/?guide=start#wardrobe');await page.locator('.wear-guide-card').waitFor();assert.equal(await next.isEnabled(),false);
 await page.locator('[data-item]').first().click();await advance(1);
 await page.locator('#style-form textarea').fill('Classic navy and beige. No patterns.');await page.locator('#style-form [type=submit]').click();await advance(2);
 await page.locator('[data-purchase-demo=minimum]').click();await page.locator('[data-purchase-rating=would_wear]').click();await advance(3);
 await page.locator('[data-purchase-demo=zero]').click();assert.match(await page.locator('.purchase-verdict').innerText(),/buy nothing|what you own|enough/i);await advance(4);
 await page.locator('#stylist-mode').selectOption('demo');await page.locator('#stylist-form [type=submit]').click();await page.locator('.stylist-details [data-save-look]').click();await advance(5);
 assert.equal(await next.isEnabled(),false);await page.locator('#mall-camera').setInputFiles(resolve('web2/dist/assets/items/coat.webp'));await page.waitForFunction(()=>document.querySelectorAll('.mall-queue-item').length>3);await page.locator('[data-mall-view=coffee]').click();await advance(6);
 await page.locator('#morning-form [type=submit]').click();await page.locator('[data-morning-wear]').click();await advance(7);
 await page.locator('.trip-person [data-trip-select-event]').click();await page.locator('[data-trip-choose-look="0"]').click();await page.locator('[data-trip-packed]').first().check();await advance(8);
 await page.locator('[data-overview-review]').first().click();
 await page.waitForFunction(()=>!document.querySelector('[data-coach=next]')?.disabled);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:resolve(out,'complete-'+width+'.png')});await advance(9);
 assert.equal(await page.locator('.wear-guide-layer:visible').count(),0);
 await page.locator('[data-guide-start]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.wear-guide-layer:visible').count(),0);
 await page.reload();await page.goto(base+'/app/#saved');assert.equal(await page.locator('.saved-look-item').count(),1);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);results.push({width,steps:9,status:'PASS',providerRequests:0});await context.close();
}}finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));}
