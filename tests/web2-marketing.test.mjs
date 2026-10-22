import assert from 'node:assert/strict';
import test,{before} from 'node:test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
let model,marketing;
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
before(async()=>{
  const bundle=async path=>{
    const built=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
      bundle:true,write:false,platform:'node',target:'es2022',format:'esm',
      loader:{'.css':'empty'}});
    return import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
  };
  [model,marketing]=await Promise.all([bundle('../web2/src/marketing-model.ts'),bundle('../web2/src/marketing.ts')]);
});
test('route inventory is closed: canonical landing, retailer and judge pages',()=>{
  for(const route of ['/','/retail','/retail/demo','/judges','/judges/demo']){
    assert.equal(model.marketingRoute(route),route);
    if(route!=='/') assert.equal(model.marketingRoute(route+'/'),route);
  }
  for(const route of ['/app/','/api/renders','/retail/fake','/judges/secret','//evil'])assert.equal(model.marketingRoute(route),null);
  assert.equal(model.demoStep('verdict'),'verdict');
  assert.equal(model.demoStep('<script>'),'wardrobe');
});
test('guided saved evidence comes from immutable YouCam manifest, never a new task',()=>{
  const e=model.demoEvidence();
  assert.equal(e.source,'recorded');
  assert.equal(e.api,'cloth-v4');
  assert.equal(e.avatarId,'woman_neutral_01');
  assert.equal(e.liveTaskStatus,'not_submitted');
  assert.match(e.candidate.imagePath,/^\/demo\/renders\/outerwear-cheap-a/);
  assert.match(e.top.imagePath,/^\/demo\/renders\/top-work/);
  assert.ok(Number.isFinite(Date.parse(e.candidate.recordedAt)));
});
test('retailer demo price, label and sample wardrobe originate from fixture and matching recorded candidate',()=>{
  const x=model.retailExample(),e=model.demoEvidence();
  assert.equal(x.id,'cheap-a');
  assert.equal(x.priceMinor,4000);
  assert.equal(x.currency,'PLN');
  assert.equal(x.imagePath,e.candidate.imagePath);
  assert.ok(model.sampleWardrobe().some(item=>item.id==='recorded-work'));
  assert.equal(model.sampleWardrobe().some(item=>item.id==='cheap-a'),false);
  assert.equal(new Set(model.sampleWardrobe().map(x=>x.id)).size,model.sampleWardrobe().length);
});
test('both core solver cases preserve the genuine minimum and honest zero-purchase evidence',()=>{
  const minimum=model.coreDecision('minimum'),zero=model.coreDecision('zero');
  assert.equal(minimum.result.status,'solved');
  assert.deepEqual(minimum.result.basket.candidateIds,['all-round']);
  assert.equal(minimum.result.basket.costMinor,9000);
  assert.equal(minimum.result.certificate.priceOptimality,'proven');
  assert.equal(minimum.result.certificate.cheaperBaskets.length,3);
  assert.equal(zero.result.status,'solved');
  assert.deepEqual(zero.result.basket.candidateIds,[]);
  assert.equal(zero.result.basket.costMinor,0);
  assert.throws(()=>model.coreDecision('fake'));
});
test('public routes render English links with no invented task identifiers or retailer results',()=>{
  for(const route of model.MARKETING_ROUTES){
    const html=marketing.marketingPage(route);
    assert.ok(html.includes('<main id="main-content"'),route);
    if(route==='/') assert.match(html,/For judges/);
    else assert.match(html,/Judges · Start here/);
    assert.match(html,/href="\/app\/"/);
    assert.match(html,/href="\/retail\/"/);
    assert.match(html,/href="\/judges\/"/);
    assert.doesNotMatch(html,/\<script\b|onerror=|data:image\/svg/);
    assert.ok(marketing.marketingTitle(route).includes('WearAgain'));
  }
  const judges=marketing.marketingPage('/judges');
  assert.match(judges,/Try it on/);
  assert.match(judges,/in your pocket/);
  assert.match(judges,/<video controls playsinline/);
  assert.match(judges,/src="\/video\/wearagain-demo.webm"/);
  assert.match(judges,/kind="captions"/);
  assert.match(judges,/reviewer access required/);
  assert.match(marketing.marketingPage('/retail'),/Pilot measurement plan only/);
  assert.match(marketing.marketingPage('/retail/demo'),/Fictional retailer/);
  assert.match(marketing.marketingPage('/judges/demo'),/No account needed/);
});
test('web2 headers restrict external connections while allowing local fonts, blob images, microphone',async()=>{
  const headers=await read('../web2/_headers');
  const css=await read('../web2/src/style.css');
  const pwa=await read('../web2/sw-template.js');
  const buildScript=await read('../scripts/build-web2.mjs');
  const oldBuild=await read('../scripts/build-web.mjs');
  assert.match(headers,/Content-Security-Policy:/);
  assert.match(headers,/style-src 'self'; font-src 'self'; img-src 'self' blob:/);
  assert.match(headers,/microphone=\(self\)/);
  assert.match(headers,/camera=\(self\)/);
  assert.match(headers,/X-Content-Type-Options: nosniff/);
  assert.doesNotMatch(css,/@import\s+url\(['"]?https:/i);
  assert.match(css,/\/fonts\/dm-sans-latin-400-normal\.woff2/);
  assert.match(css,/\/fonts\/cormorant-garamond-latin-400-normal\.woff2/);
  assert.match(pwa,/PUBLIC_FILES = __PRECACHE_FILES__/);
  assert.match(pwa,/req\.headers\.has\('Authorization'\)/);
  assert.match(pwa,/return found\?\?fetch\(event\.request\)/);
  assert.doesNotMatch(pwa,/cache\.put\(event\.request/);
  assert.match(buildScript,/for \(const directory of \['app','retail','retail\/demo','judges','judges\/demo'\]\)/);
  assert.match(buildScript,/NO production deploy switch/i);
  assert.match(oldBuild,/const destination = join\(root, 'web\/dist'\)/);
});

test('review screenshot URLs select real guided preview/verdict steps without inventing API runs',async()=>{
 const source=await read('../web2/src/marketing.ts');
 assert.match(source,/new URLSearchParams\(window\.location\.search\)\.get\('step'\)/);
 assert.match(source,/step=demoStep\(/);
 const workflow=await read('../.github/workflows/web2-visual.yml');
 assert.match(workflow,/judges-demo-preview\|\/judges\/demo\/\?step=preview/);
 assert.match(workflow,/judges-demo-verdict\|\/judges\/demo\/\?step=verdict/);
 assert.match(workflow,/actions\/upload-artifact@v4/);
});

test('PR-E deep links do not draw programmatic focus outline on first app paint',async()=>{
  const main=await read('../web2/src/main.ts');
  assert.match(main,/if\(focusTarget && hasRendered\)\{/);
  assert.doesNotMatch(main,/hasRendered\|\|routeKey!==''/);
});

test('judge certificate labels unmet needs and explains the zero-purchase no-cheaper result',()=>{
  marketing.handleMarketingClick({dataset:{guideStep:'verdict'}},()=>{});
  marketing.handleMarketingClick({dataset:{judgeMode:'minimum'}},()=>{});
  const minimum=marketing.marketingPage('/judges/demo');
  assert.match(minimum,/Unsatisfied needs:/);
  assert.match(minimum,/For work|For evenings/);
  assert.doesNotMatch(minimum,/No cheaper basket exists/);
  marketing.handleMarketingClick({dataset:{judgeMode:'zero'}},()=>{});
  const zero=marketing.marketingPage('/judges/demo');
  assert.match(zero,/No cheaper basket exists; buying nothing is the cheapest/);
  assert.doesNotMatch(zero,/<ul><\/ul>/);
  assert.doesNotMatch(zero,/Unsatisfied needs:/);
  marketing.handleMarketingClick({dataset:{judgeMode:'minimum'}},()=>{});
  marketing.handleMarketingClick({dataset:{guideStep:'wardrobe'}},()=>{});
});
test('judges pages and each guided step include implementation, concept and quantified limits',()=>{
  const pages=[marketing.marketingPage('/judges')];
  for(const step of ['wardrobe','preview','verdict']){
    marketing.handleMarketingClick({dataset:{guideStep:step}},()=>{});
    pages.push(marketing.marketingPage('/judges/demo'));
  }
  for(const html of pages){
    assert.match(html,/Implemented now/);
    assert.match(html,/Concept \/ not yet/);
    assert.match(html,/Limits of this demo/);
    assert.match(html,/Style preview, not size fit/);
    assert.match(html,/2 units/);
    assert.match(html,/24 hours/);
    assert.match(html,/no fresh tasks|not live YouCam calls/i);
    assert.match(html,/No conversion, returns or impact improvements have been measured/);
    assert.match(html,/private.*reviewer access/);
    assert.doesNotMatch(html,/href="https:\/\/wearagain\.pages\.dev\/app\//);
  }
  marketing.handleMarketingClick({dataset:{guideStep:'wardrobe'}},()=>{});
});
test('guided note gutters beat the site-wide paragraph margin reset',async()=>{
  const css=await read('../web2/src/marketing.css');
  assert.match(css,/\.mkt-guided main > \.mkt-guided-note\{margin:14px clamp\(20px,5vw,80px\)/);
  assert.match(css,/\.mkt-guided main > \.mkt-guided-note\{margin:15px 20px;/);
});

test('build copies a JS root-scope legacy worker and serves no-cache headers',async()=>{
  const [script,headers,worker]=await Promise.all([
    read('../scripts/build-web2.mjs'),read('../web2/_headers'),read('../web2/public/sw.js'),
  ]);
  assert.match(script,/cp\(join\(root, 'web2\/public\/sw\.js'\), join\(dest, 'sw\.js'\)\)/);
  assert.match(headers,/\/sw\.js\s*\n\s*Cache-Control: no-cache/);
  assert.match(worker,/wearagain-demo-/);
  assert.match(worker,/registration\.unregister\(\)/);
  assert.doesNotMatch(worker,/addEventListener\(['"]fetch['"]/);
});

test('direct-upload Pages switch documentation is accurate and does not deploy',async()=>{
  const docs=await read('../docs/DEPLOY_SWITCH_WEB2.md');
  assert.match(docs,/direct upload/i);
  assert.match(docs,/wrangler pages deploy web2\/dist --project-name wearagain --branch main/);
  assert.match(docs,/previous known-good production deployment/);
  assert.match(docs,/web2\/dist\/sw\.js/);
  assert.doesNotMatch(docs,/change \*\*only the Pages production build output directory\*\*/);
  assert.match(docs,/no build output directory setting/i);
});

test('owner-selected v1 landing keeps its layout and narrative with the requested mobile-first entry',()=>{
  const html=marketing.marketingPage('/');
  assert.match(html,/Your wardrobe/);
  assert.match(html,/Sometimes, the best basket is empty/);
  assert.match(html,/landing-hero-pair/);
  assert.match(html,/For judges/);
  assert.match(html,/href="\/app\//);
  assert.doesNotMatch(html,/style="/);
});


test('legacy v1 landing uses truthful jury CTA and routes directly to zero-purchase example',async()=>{
  const html=marketing.marketingPage('/');
  assert.match(html,/href="\/judges\/">Review the evidence/);
  assert.doesNotMatch(html,/View on GitHub/);
  assert.match(html,/href="\/app\/\?scenario=zero#check">Explore the buy-nothing example/);
  const source=await read('../web2/src/purchase-ui.ts');
  assert.match(source,/initialPurchase\(launchDemo\(\)\)/);
  assert.match(source,/wearagain:approved-demo:v1/);
});
