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
function split(html){
  const m=html.indexOf('<div class="purchase-layout">');
  const d=html.indexOf('<div class="purchase-desktop-layout">');
  const meta=html.indexOf('<div class="purchase-desktop-meta">');
  assert.ok(m>=0&&d>m&&meta>d);
  return {mobile:html.slice(m,d),desktop:html.slice(d,meta)};
}
const count=(s,x)=>(s.match(new RegExp(x,'g'))??[]).length;

test('board 08 desktop and previous mobile shelves are separate, have unique heading ids',()=>{
  const html=ui.purchasePage(),{mobile,desktop}=split(html);
  assert.equal(count(html,'id="purchase-finds-title"'),1);
  assert.equal(count(html,'id="purchase-desktop-finds-title"'),1);
  assert.match(mobile,/aria-labelledby="purchase-finds-title"/);
  assert.match(desktop,/aria-labelledby="purchase-desktop-finds-title"/);
  assert.match(desktop,/Your discoveries/);
  assert.match(desktop,/purchase-add-item/);
  assert.doesNotMatch(mobile,/purchase-add-item/);
  assert.doesNotMatch(mobile,/Shop \/ floor not supplied/);
  assert.doesNotMatch(mobile,/\/assets\/items\/coat\.webp/);
  assert.match(mobile,/outerwear-cheap-a-woman-neutral-01\.jpg/);
  assert.match(mobile,/outerwear-cheap-b-woman-neutral-01\.jpg/);
  assert.match(mobile,/outerwear-all-round-woman-neutral-01\.jpg/);
});

test('every real product preview is keyed to exactly the same saved garment id as its caption',()=>{
  const {desktop}=split(ui.purchasePage());
  const refs=[...desktop.matchAll(/data-recorded-garment="(top|outerwear):([^"]+)" src="([^"]+)"/g)];
  // 3 discoveries, the current selected coat, and the owned work top.
  assert.equal(refs.length,5);
  for(const [,kind,id,path] of refs){
    const exact=core.recordingFor(kind,id);
    assert.ok(exact,'unknown manifest identity: '+kind+':'+id);
    assert.equal(path,exact.imagePath);
  }
  assert.deepEqual([...new Set(refs.filter(x=>x[1]==='outerwear').map(x=>x[2]))].sort(),
    ['all-round','cheap-a','cheap-b']);
  assert.ok(refs.some(x=>x[1]==='top'&&x[2]==='work'));
  assert.doesNotMatch(desktop,/\/assets\/items\/(?:coat|cashmere)\.webp/);
  assert.match(desktop,/From the shop/);
  assert.match(desktop,/From your wardrobe/);
});

test('a candidate without exact saved evidence gets a neutral named tile, never another garment',()=>{
  const mock={dataset:{purchaseDemo:'zero'},hasAttribute:()=>false};
  let redraws=0;
  assert.equal(ui.handlePurchaseClick(mock,{rerender:()=>{redraws++;},notice:()=>{}}),true);
  const {mobile,desktop}=split(ui.purchasePage());
  assert.ok(redraws>0);
  assert.match(desktop,/purchase-neutral-name/);
  assert.doesNotMatch(desktop,/data-recorded-garment=/);
  assert.doesNotMatch(mobile,/outerwear-cheap-a/);
  assert.match(desktop,/Your wardrobe already covers it\./);
  ui.handlePurchaseClick({dataset:{purchaseDemo:'minimum'},hasAttribute:()=>false},
    {rerender:()=>{},notice:()=>{}});
});

test('board 08 topbar, pager, balanced decision and core certificate are correctly ordered',()=>{
  const html=ui.purchasePage(),{desktop}=split(html);
  const heading=desktop.indexOf('purchase-model-topbar');
  const pager=desktop.indexOf('purchase-model-controls');
  const stage=desktop.indexOf('purchase-model-stage');
  const caption=desktop.indexOf('purchase-model-caption');
  const ratings=desktop.indexOf('purchase-model-actions');
  assert.ok(heading>=0&&pager>heading&&stage>pager&&caption>stage&&ratings>caption);
  assert.match(desktop,/With your wardrobe/);
  assert.match(desktop,/1 \/ 3/);
  assert.match(desktop,/I wear it/);
  assert.match(desktop,/I do not wear it/);
  assert.match(desktop,/Style preview, not size fit\./);
  assert.match(desktop,/purchaseDesktopReadCertificate|View complete certificate/);
  assert.match(desktop,/You can skip<\/span><span>this one\./);
  assert.match(desktop,/The cheapest basket for these recorded needs does not include this piece/);
  assert.match(desktop,/Unsatisfied needs:/);
  assert.equal(count(html,'data-purchase-demo="minimum"'),2); // one in mobile, one footer desktop
});

test('board 08 desktop CSS is compact; mobile has independent unchanged shelf presentation',async()=>{
  const css=await readFile(new URL('../web2/src/purchase.css',import.meta.url),'utf8');
  assert.match(css,/\.main-content:has\(\.purchase-view\)\{padding-top:24px\}/);
  assert.match(css,/\.purchase-model-topbar\{display:flex/);
  assert.match(css,/purchase-model-stage\{position:relative;height:clamp\(316px,calc\(24vw \+ 52px\),420px\)/);
  assert.match(css,/\.purchase-desktop-product-image\{width:100%;aspect-ratio:4 \/ 5/);
  assert.match(css,/\.purchase-desktop-layout \.purchase-candidate.selected\{\s*border-left-color:var\(--olive\)/);
  assert.match(css,/@media\(max-width:800px\)\{\.purchase-desktop-layout,\.purchase-desktop-meta\{display:none\}\}/);
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
test('desktop board-08 supporting text and product card captions remain 12px readable',async()=>{
  const css=await readFile(new URL('../web2/src/purchase.css',import.meta.url),'utf8');
  for(const [name,regex] of [
    ['model caption',/\.purchase-model-caption\{font-size:12px/],
    ['image footnote',/\.purchase-model-honesty\{font-size:12px/],
    ['product captions',/\.purchase-desktop-products figcaption\{[\s\S]*?font-size:12px/],
    ['secondary captions',/\.purchase-desktop-products figcaption small\{font-size:12px/],
    ['shop provenance',/\.purchase-desktop-layout \.purchase-candidate-info small\{[\s\S]*?font-size:12px/],
    ['footer',/\.purchase-desktop-foot\{font-size:12px/],
  ]) assert.match(css,regex,name+' must remain 12px');
  assert.match(css,/\.purchase-desktop-reason\{[^}]*text-wrap:balance/);
});
