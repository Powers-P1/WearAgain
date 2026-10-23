import assert from 'node:assert/strict';
import test,{before} from 'node:test';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

let ui,core,wardrobe,daily,overview;
before(async()=>{
  const load=async path=>{
    const result=await build({
      entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
      bundle:true,write:false,platform:'node',format:'esm',target:'es2022',
      loader:{'.css':'empty'},
    });
    return import('data:text/javascript;base64,'+
      Buffer.from(result.outputFiles[0].text).toString('base64'));
  };
  [ui,core,wardrobe,daily,overview]=await Promise.all([
    load('../web2/src/purchase-ui.ts'),
    load('../web2/src/purchase.ts'),
    load('../web2/src/state.ts'),
    load('../web2/src/daily.ts'),
    load('../web2/src/overview-ui.ts'),
  ]);
});
const click=(dataset={},attribute='')=>ui.handlePurchaseClick({dataset,hasAttribute:key=>key===attribute},{rerender:()=>{},notice:message=>{throw Error(message);}});
const count=(s,x)=>(s.match(new RegExp(x,'g'))??[]).length;

test('one accessible purchase surface places the pair and rating before the verdict',()=>{
  const html=ui.purchasePage();
  for(const id of ['purchase-title','purchase-finds-title','purchase-preview-title','purchase-verdict-title'])assert.equal(count(html,'id="'+id+'"'),1);
  assert.ok(html.indexOf('purchase-preview-pair')<html.indexOf('purchase-rating'));
  assert.ok(html.indexOf('purchase-rating')<html.indexOf('purchase-verdict"'));
  assert.match(html,/From the shop/);assert.match(html,/From your wardrobe/);
  assert.equal(count(html,'data-purchase-demo="minimum"'),1);
});

test('all visible saved previews retain their exact manifest garment identity',()=>{
 const html=ui.purchasePage();
 const refs=[...html.matchAll(/data-recorded-garment="(top|outerwear):([^"]+)" src="([^"]+)"/g)];
 assert.ok(refs.length>=5);
 for(const [,kind,id,path] of refs)assert.equal(path,core.recordingFor(kind,id).imagePath);
 assert.ok(refs.some(x=>x[1]==='top'&&x[2]==='work'));
 const pair=html.slice(html.indexOf('purchase-preview-pair'),html.indexOf('purchase-rating'));
 assert.doesNotMatch(pair,/\/assets\/items\/(?:coat|cashmere)\.webp/);
});

test('a nonchosen candidate offers Skip and the actual recommendation, never Keep my own',()=>{
 click({purchaseDemo:'minimum'});
 click({purchaseCandidate:'cheap-a'});
 let html=ui.purchasePage();
 assert.match(html,/>Skip this piece<\/button>/);
 assert.match(html,/data-purchase-candidate="all-round">See the recommended piece/);
 assert.doesNotMatch(html,/>I’ll keep what I own<\/button>/);
 click({purchaseCandidate:'all-round'});
 html=ui.purchasePage();
 assert.match(html,/data-purchase-choice="save"/);
 assert.doesNotMatch(html,/>Skip this piece<\/button>/);
 click({purchaseDemo:'minimum'});
});

test('the initial purchase preview, rating and verdict refer to Nova and disclose their actual scope',()=>{
 click({purchaseDemo:'minimum'});
 const html=ui.purchasePage();
 assert.match(html,/data-purchase-selected="all-round">Selected candidate: Nova jacket/);
 assert.match(html,/For the selected clothes, needs and your ratings/);
 assert.match(html,/Demo model · one garment at a time/);
 assert.match(html,/Style preview, not size fit/);
 assert.match(html,/Preset example rating for this pair/);
 assert.match(html,/data-purchase-candidate="all-round" aria-pressed="true"/);
 const pair=html.slice(html.indexOf('purchase-preview-pair'),html.indexOf('purchase-rating"'));
 assert.match(pair,/data-recorded-garment="outerwear:all-round"/);
 assert.match(pair,/Nova jacket/);
 assert.equal(ui.purchaseWalkthroughFacts().humanRating,false);
});

test('a human evening rating explains the 90 to 100 basket change without replacing the selected candidate',()=>{
 click({purchaseDemo:'minimum'});
 click({purchaseTop:'evening'});
 click({purchaseRating:'would_wear'});
 let html=ui.purchasePage();
 assert.match(html,/Basket unchanged: Nova jacket · PLN\s*90\.00/);
 assert.equal(ui.purchaseWalkthroughFacts().humanRating,true);
 click({purchaseRating:'would_not_wear'});
 html=ui.purchasePage();
 assert.match(html,/Before: Nova jacket · PLN\s*90\.00\. Now: Aster trench \+ Mila coat · PLN\s*100\.00/);
 assert.match(html,/This pair does not count toward For evenings/);
 assert.match(html,/data-purchase-selected="all-round">Selected candidate: Nova jacket/);
 assert.match(html,/data-purchase-candidate="all-round" aria-pressed="true"/);
 assert.match(html,/data-purchase-top="evening" aria-pressed="true"/);
 assert.match(html,/Your rating for this pair/);
 click({purchaseTop:'work'});
 html=ui.purchasePage();
 assert.match(html,/Preset example rating for this pair/);
 assert.doesNotMatch(html,/Recalculated from your rating/,'do not attach a prior pairing explanation to a different pair');
 click({purchaseDemo:'minimum'});
});

test('unsure, error and cleared ratings stay unresolved without borrowing preset ratings as human actions',()=>{
 for(const status of ['unrated','render_error']){
  click({purchaseDemo:'minimum'});
  click({purchaseTop:'evening'});
  click({purchaseRating:status});
  let html=ui.purchasePage();
  assert.match(html,/Best confirmed basket so far: PLN\s*100\.00/);
  assert.match(html,/90\.00 may still be possible/);
  assert.match(html,/This pair is unresolved, not rejected/);
  assert.doesNotMatch(html,/This pair does not count toward/);
  assert.match(html,/data-purchase-selected="all-round"/);
  assert.equal(ui.purchaseWalkthroughFacts().humanRating,false);
  click({},'data-purchase-clear');
  html=ui.purchasePage();
  assert.match(html,/No rating for this pair yet/);
  assert.doesNotMatch(html,/Recalculated from your rating/);
  assert.equal(ui.purchaseWalkthroughFacts().humanRating,false);
 }
 click({purchaseDemo:'minimum'});
});

test('buy-nothing names the example owned pieces and Keep my own without substituting an image',()=>{
 click({purchaseDemo:'zero'});
 const html=ui.purchasePage();
 assert.match(html,/purchase-zero-example/);
 assert.match(html,/Example shirt/);
 assert.match(html,/Existing coat · example/);
 assert.doesNotMatch(html,/purchase-image-empty/);
 assert.doesNotMatch(html,/data-recorded-garment=/);
 assert.match(html,/Your wardrobe already covers it/);
 assert.match(html,/data-purchase-choice="skip"/);
 click({purchaseDemo:'minimum'});
});

test('missing ratings lead to Review more pairings instead of a buying verdict',()=>{
 click({},'data-purchase-clear');
 const html=ui.purchasePage();
 assert.match(html,/data-purchase-review/);
 assert.doesNotMatch(html,/>Skip this piece<\/button>/);
 assert.doesNotMatch(html,/>See the recommended piece/);
 click({},'data-purchase-replay');
});

test('overview month picker is functional and desktop attention actions remain explicit',()=>{
  const state=wardrobe.initialState(),wear=daily.emptyDaily(),decisions=daily.emptyDecisions();
  const before=overview.overviewPage(state,wear,decisions);
  assert.match(before,/id="overview-month"/);
  assert.match(before,/overview-attention-action/);
  assert.match(before,/data-overview-review="bag"|data-overview-review="dress"/);
  assert.equal(overview.handleOverviewMonthChange({id:'overview-month',value:'2025-04'}),true);
  const after=overview.overviewPage(state,wear,decisions);
  assert.match(after,/<select id="overview-month" aria-label="Choose month for logged wardrobe wears">/);
  assert.match(after,/<option value="2025-04" selected>April 2025<\/option>/);
  assert.doesNotMatch(after,/type="month"/);
  assert.equal(overview.handleOverviewMonthChange({id:'random',value:'2025-05'}),false);
  assert.equal(overview.handleOverviewMonthChange({id:'overview-month',value:'not-a-month'}),true);
  assert.match(overview.overviewPage(state,wear,decisions),/value="2025-04"/);
});


test('overview month names are explicitly English regardless of native date widget locale',()=>{
  const d={version:1,wears:[{date:'2022-04-12',lookId:'look_1',lookTitle:'Example',itemIds:['blazer']}]};
  const options=overview.overviewMonthOptions(d,new Date(2026,9,22));
  assert.deepEqual(options[0],{value:'2026-10',label:'October 2026'});
  assert.ok(options.some(x=>x.value==='2025-04'&&x.label==='April 2025'));
  assert.ok(options.some(x=>x.value==='2022-04'&&x.label==='April 2022'));
  assert.ok(options.every(x=>/^[A-Z][a-z]+ \d{4}$/.test(x.label)));
  assert.equal(new Set(options.map(x=>x.value)).size,options.length);
  const html=overview.overviewPage(wardrobe.initialState(),d,daily.emptyDecisions());
  assert.match(html,/>Month<\/span>/);
  assert.match(html,/>April 2022<\/option>/);
});
