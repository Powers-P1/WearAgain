import { renderLanding } from './landing-v1.js';
import './landing-v1.css';
import { t, type TranslationKey } from './i18n.js';
import { coreDecision, demoEvidence, demoStep, money, retailExample, sampleWardrobe,
  type DemoStep, type MarketingRoute } from './marketing-model.js';
import { scenarioForDemo, type PurchaseDemo } from './purchase.js';
import './marketing.css';

const CODE='https://github.com/Powers-P1/WearAgain';
const SETUP=CODE+'/blob/main/README.md';
const API=CODE+'/blob/main/docs/API.md';
let step:DemoStep='wardrobe';
let stepQueryLoaded=false;
let mode:PurchaseDemo='minimum';
let openRetailPanel=true;
let retailSize='M';
let retailSaved=false;
const escapeHtml=(v:unknown)=>String(v??'').replace(/[&<>"']/g,ch=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]??ch));
const h=(key:TranslationKey,values?:Record<string,string|number>)=>escapeHtml(t(key,values));
const modelImage=(path:string,alt:string,extraClass='')=>
  '<img class="'+extraClass+'" src="'+escapeHtml(path)+'" alt="'+escapeHtml(alt)+'" loading="lazy" />';
const link=(href:string,label:string,cls='mkt-text-link')=>
  '<a class="'+cls+'" href="'+escapeHtml(href)+'">'+escapeHtml(label)+'</a>';
const illustrated=(path:string,title:string,short=false)=>
  '<figure class="mkt-photo'+(short?' mkt-photo-short':'')+'">'+
  modelImage(path,title,'mkt-photo-img')+
  '<figcaption>'+h('mktOneGarment')+'</figcaption></figure>';
const wardrobePhoto=(name:string,alt:string)=>
  '<img src="/assets/items/'+escapeHtml(name)+'.webp" alt="'+escapeHtml(alt)+'" loading="lazy" />';
function siteHeader(active:'home'|'retail'|'judges'):string{
  return '<header class="mkt-header"><a class="mkt-logo" href="/" aria-label="'+h('mktHomeNav')+'">WearAgain</a>'+
    '<nav class="mkt-site-nav" aria-label="'+h('mktMenu')+'">'+
    link('/#how',h('mktHow'),'mkt-header-link')+
    link('/retail/',h('mktRetail'),'mkt-header-link'+(active==='retail'?' is-active':''))+
    link('/judges/',h('mktJudgesStart'),'mkt-judge-link'+(active==='judges'?' is-active':''))+
    link('/app/',h('mktExplore'),'mkt-header-cta')+
    '</nav></header>';
}
function footer():string{
  return '<footer class="mkt-footer"><div class="mkt-footer-top">'+
    '<a class="mkt-logo" href="/">WearAgain</a><nav aria-label="'+h('mktMenu')+'">'+
    link('/app/',h('mktApp'))+link('/retail/',h('mktRetail'))+
    link('/judges/',h('mktFooterDocs'))+'</nav></div>'+
    '<p>'+h('mktFooterPrivacyDescription')+'</p><small>'+h('mktFooterRights')+'</small></footer>';
}
export function unusedBoard13Landing():string{
  const recorded=demoEvidence();
  return '<div class="mkt-site mkt-consumer">'+siteHeader('home')+
    '<main id="main-content" tabindex="-1">'+
    '<section class="mkt-hero"><div class="mkt-hero-copy">'+
    '<h1>'+h('mktYourWardrobe').replace('more you.','<em>more you.</em>')+'</h1>'+
    '<p>'+h('mktHeroSubtitle')+'</p>'+
    link('/app/',h('mktHeroCTA'),'mkt-button mkt-button-dark')+
    '<small>'+h('mktHeroNote')+'</small></div>'+
    '<div class="mkt-hero-art">'+illustrated(recorded.top.imagePath,h('mktEditorial'))+
    '<div class="mkt-floating-card"><span>WearAgain</span><strong>'+h('overviewFromYourWardrobe')+'</strong>'+
    '<div class="mkt-floating-items">'+wardrobePhoto('blazer','Navy blazer')+
    wardrobePhoto('trousers','Wool trousers')+wardrobePhoto('loafers','Leather loafers')+'</div>'+
    link('/app/#morning',h('mktMorningCTA'),'mkt-floating-cta')+'</div></div></section>'+
    '<section class="mkt-story mkt-morning-story" id="how"><div class="mkt-triptych">'+
    illustrated(recorded.top.imagePath,h('mktOneGarment'),true)+
    illustrated('/demo/renders/top-weekend-woman-neutral-01.jpg',h('mktOneGarment'),true)+
    illustrated('/demo/renders/top-evening-woman-neutral-01.jpg',h('mktOneGarment'),true)+'</div>'+
    '<div class="mkt-story-copy"><h2>'+h('mktMorningHeading')+'</h2>'+
    '<blockquote>'+h('mktMorningQuote')+'</blockquote><p>'+h('mktMorningBody')+'</p>'+
    link('/app/#morning',h('mktMorningCTA'))+'</div></section>'+
    '<section class="mkt-dark-story"><div><h2>'+h('mktMallHeading')+'</h2>'+
    '<p>'+h('mktMallBody')+'</p>'+link('/app/#gallery',h('mktMallCTA'))+
    '<small>'+h('mktMallFootnote')+'</small></div>'+
    '<div class="mkt-dark-photo">'+illustrated('/demo/renders/outerwear-cheap-a-woman-neutral-01.jpg',h('mktOneGarment'))+
    '<div class="mkt-small-finds">'+wardrobePhoto('coat','Sample coat')+
    wardrobePhoto('blazer','Sample blazer')+wardrobePhoto('silk','Sample blouse')+'</div></div></section>'+
    '<section class="mkt-last-story"><h2>'+h('mktCareHeading')+'</h2><div><p>'+h('mktCareBody')+'</p>'+
    link('/app/#overview',h('mktCareCTA'))+'</div></section>'+
    '<div class="mkt-privacy-line">'+h('mktCarePrivacy')+'</div></main>'+footer()+'</div>';
}
function retailLanding():string{
  const candidate=retailExample();
  return '<div class="mkt-site mkt-retail">'+siteHeader('retail')+
    '<main id="main-content" tabindex="-1">'+
    '<section class="mkt-hero mkt-retail-hero"><div class="mkt-hero-copy">'+
    '<p class="mkt-eyebrow">'+h('mktRetailEyebrow')+'</p>'+
    '<h1>'+h('mktRetailHero1')+'<span>'+h('mktRetailHero2')+'</span><em>'+h('mktRetailHero3')+'</em></h1>'+
    '<p>'+h('mktRetailLead')+'</p>'+
    link('/retail/demo/',h('mktRetailPrimary'),'mkt-button mkt-button-dark')+
    link('/retail/#pilot',h('mktRetailSecondary'),'mkt-secondary-action')+
    '<small>'+h('mktRetailFictional')+'</small></div>'+
    '<div class="mkt-hero-art">'+illustrated(candidate.imagePath,candidate.label)+
    '<div class="mkt-floating-card"><strong>'+h('mktRetailDemoOpenPanel')+'</strong>'+
    '<span>'+escapeHtml(candidate.label)+'</span>'+
    link('/retail/demo/',h('mktRetailPrimary'),'mkt-floating-cta')+'</div></div></section>'+
    '<section class="mkt-retail-context"><div class="mkt-retail-samples">'+
    wardrobePhoto('cashmere','Cream sweater')+wardrobePhoto('trousers','Beige trousers')+
    wardrobePhoto('loafers','Brown loafers')+'</div>'+
    '<div><h2>'+h('mktRetailSectionHeading')+'</h2>'+
    '<ul><li>'+h('mktRetailLine1')+'</li><li>'+h('mktRetailLine2')+'</li>'+
    '<li>'+h('mktRetailLine3')+'</li></ul><p>'+h('mktRetailContextNote')+'</p>'+
    link('/retail/demo/',h('mktRetailPrimary'))+'</div></section>'+
    '<section class="mkt-pilot" id="pilot"><h2>'+h('mktRetailPilotHeading')+'</h2>'+
    '<div class="mkt-pilot-columns">'+[
      ['01','mktRetailConversion','mktRetailConversionNote'],
      ['02','mktRetailReturns','mktRetailReturnsNote'],
      ['03','mktRetailMargin','mktRetailMarginNote'],
    ].map(([n,title,description])=>'<div><span>'+n+'</span><h3>'+h(title as TranslationKey)+'</h3>'+
    '<p>'+h(description as TranslationKey)+'</p></div>').join('')+'</div>'+
    '<small>'+h('mktRetailPilotDisclaimer')+'</small></section>'+
    '<section class="mkt-last-story"><h2>'+h('mktRetailFooterHeading')+'</h2>'+
    '<p>'+h('mktRetailFooterText')+'</p></section></main>'+footer()+'</div>';
}
function retailerProduct():string{
  const candidate=retailExample();
  const owned=sampleWardrobe().filter(item=>['recorded-work','trousers','loafers'].includes(item.id));
  const selectedSizes=['XS','S','M','L','XL'].map(size=>
    '<button type="button" data-retail-size="'+size+'" class="'+(retailSize===size?'selected':'')+
    '" aria-pressed="'+(retailSize===size)+'">'+size+'</button>').join('');
  return '<div class="mkt-site mkt-product">'+
    '<header class="mkt-retail-demo-header"><a href="/retail/" class="mkt-merchant-logo">DEMO ATELIER</a>'+
    '<span>'+h('mktRetailDemoEyebrow')+'</span>'+
    link('/judges/',h('mktJudgesStart'),'mkt-judge-link')+'</header>'+
    '<main id="main-content" tabindex="-1"><p class="mkt-breadcrumb">'+h('mktRetailDemoBreadcrumb')+'</p>'+
    '<div class="mkt-retail-product-grid"><section class="mkt-merchant-image">'+
    '<div class="mkt-merchant-shot">'+modelImage(candidate.imagePath,candidate.label)+'</div>'+
    '<p>'+h('mktRetailDemoProductArt')+' · '+h('mktRetailFictional')+'</p></section>'+
    '<section class="mkt-product-details"><p class="mkt-eyebrow">'+h('mktRetailFictional')+'</p>'+
    '<h1>'+escapeHtml(candidate.label)+'</h1><strong class="mkt-product-price">'+escapeHtml(money(candidate.priceMinor,candidate.currency))+'</strong>'+
    '<p class="mkt-small-muted">'+h('mktRetailDemoPrice')+'</p>'+
    '<div class="mkt-product-rule"></div><p>'+h('mktRetailDemoColour')+'</p>'+
    '<div class="mkt-colour-swatch" aria-hidden="true"></div><h2>'+h('mktRetailDemoSize')+'</h2>'+
    '<div class="mkt-size-options" role="group" aria-label="'+h('mktRetailDemoSize')+'">'+selectedSizes+'</div>'+
    '<p class="mkt-small-muted">'+h('mktRetailDemoSizeGuide')+'</p>'+
    '<button type="button" class="mkt-button mkt-button-disabled" disabled title="'+h('mktRetailDemoCart')+'">'+h('mktRetailDemoCart')+'</button>'+
    '<div class="mkt-product-rule"></div><button type="button" class="mkt-outline-button" data-retail-panel-toggle aria-expanded="'+openRetailPanel+'">'+
    h('mktRetailDemoOpenPanel')+' →</button>'+
    '<p class="mkt-small-muted">'+h('mktRetailDemoNotIntegrated')+'</p></section>'+
    (openRetailPanel?'<aside class="mkt-retail-panel"><div class="mkt-panel-heading"><span>WearAgain</span>'+
      '<button type="button" data-retail-panel-toggle aria-label="'+h('mktRetailDemoClosePanel')+'">×</button></div>'+
      '<h2>'+h('mktRetailDemoPanelTitle')+'</h2><p>'+h('mktRetailDemoPanelSubtitle')+'</p>'+
      '<figure class="mkt-panel-hero">'+modelImage(candidate.imagePath,h('mktOneGarment'))+
      '<figcaption>'+h('mktOneGarment')+'</figcaption></figure>'+
      '<p class="mkt-small-muted">'+h('mktRetailDemoImageNote')+'</p>'+
      '<h3>'+h('mktRetailDemoOwnItems')+'</h3><div class="mkt-panel-items">'+owned.map(item=>
        '<figure>'+modelImage(item.photo?'/assets/items/'+item.photo+'.webp':
          '/demo/renders/top-work-woman-neutral-01.jpg',item.name)+
        '<figcaption>'+escapeHtml(item.name)+'</figcaption></figure>').join('')+'</div>'+
      '<p class="mkt-panel-explanation">'+h('mktRetailDemoReason')+'</p>'+
      '<button type="button" data-retail-save class="mkt-button mkt-button-dark">'+
      h('mktRetailDemoShortlist')+'</button>'+
      (retailSaved?'<p role="status" class="mkt-saved-note">'+h('mktRetailDemoShortlistSaved')+'</p>':'')+
      '<p class="mkt-small-muted">'+h('mktRetailDemoNotFit')+'</p>'+
      '<p class="mkt-small-muted">'+h('mktRetailDemoPrivacy')+'</p></aside>':'')+
    '</div></main>'+footer()+'</div>';
}
function judgeDisclosures():string{
  return '<section class="mkt-judge-disclosures" aria-label="'+h('mktJudgeDisclosureSection')+'">'+
    '<div class="mkt-judge-disclosures-grid">'+
    '<div><h2>'+h('mktJudgeImplementedHeading')+'</h2><p>'+h('mktJudgeImplementedBody')+'</p></div>'+
    '<div><h2>'+h('mktJudgeConceptHeading')+'</h2><p>'+h('mktJudgeConceptBody')+'</p></div>'+
    '<div><h2>'+h('mktJudgeLimitsHeading')+'</h2><p>'+h('mktJudgeLimitsBody')+'</p>'+
    '<p class="mkt-judge-limit-source">'+link(API,h('mktJudgeSeeApi'))+'</p></div>'+
    '</div></section>';
}
function judgesLanding():string{
  const evidence=demoEvidence();
  const segments=[
    ['01','mktJudgesMoment1','mktJudgesMoment1Note','/app/#wardrobe','cashmere'],
    ['02','mktJudgesMoment2','mktJudgesMoment2Note','/judges/demo/','coat'],
    ['03','mktJudgesMoment3','mktJudgesMoment3Note','/judges/demo/','blazer'],
  ] as const;
  return '<div class="mkt-site mkt-judges"><div class="mkt-judges-band">'+h('mktJudgesOverline')+'</div>'+
    siteHeader('judges')+'<main id="main-content" tabindex="-1">'+
    '<section class="mkt-hero mkt-judges-hero"><div class="mkt-hero-copy">'+
    '<p class="mkt-eyebrow">'+h('mktJudgesNav')+'</p>'+
    '<h1>'+h('mktJudgesHero1')+'<em>'+h('mktJudgesHero2')+'</em></h1>'+
    '<p>'+h('mktJudgesHeroBody')+'</p><p class="mkt-judges-role">'+h('mktJudgesHeroRoles')+'</p>'+
    link('/judges/demo/',h('mktJudgesPrimary'),'mkt-button mkt-button-dark')+
    '<div class="mkt-evidence-links">'+link(CODE,h('mktJudgesCode'))+
    link(SETUP,h('mktJudgesTests'))+'</div>'+
    '<small>'+h('mktJudgesSample')+'</small></div>'+
    '<div class="mkt-hero-art">'+illustrated(evidence.candidate.imagePath,h('mktOneGarment'))+
    '<div class="mkt-judges-mini-wardrobe">'+wardrobePhoto('cashmere','Cashmere sweater')+
    wardrobePhoto('trousers','Wool trousers')+wardrobePhoto('loafers','Leather loafers')+'</div></div></section>'+
    '<section class="mkt-moments"><h2>'+h('mktJudgesMoments')+'</h2><div>'+segments.map(([n,title,desc,url,img])=>
      '<a href="'+url+'" class="mkt-moment"><span>'+n+' / '+h(title)+'</span>'+
      wardrobePhoto(img,h(title))+'<p>'+h(desc)+'</p><b aria-hidden="true">↗</b></a>').join('')+'</div></section>'+
    '<section class="mkt-youcam-band" id="api"><h2>'+h('mktJudgesYouCamHeading')+'</h2>'+
    '<div class="mkt-flow"><span>'+h('mktJudgesFlowInput')+'</span><b aria-hidden="true">→</b>'+
    '<span>'+h('mktJudgesFlowProvider')+'</span><b aria-hidden="true">→</b>'+
    '<span>'+h('mktJudgesFlowOutput')+'</span></div>'+
    '<div class="mkt-roles"><p><strong>YouCam</strong> · '+h('mktJudgesYouCamRole')+'</p>'+
    '<p><strong>WearAgain</strong> · '+h('mktJudgesWearAgainRole')+'</p></div>'+
    '<small>'+h('mktJudgesNotComposited')+'</small>'+
    link(API,h('mktJudgeSeeApi'))+'</section>'+
    judgeDisclosures()+
    '<section class="mkt-review-index"><h2>'+h('mktJudgesEvidenceHeading')+'</h2>'+
    ([
      ['mktJudgesEvidenceTech','mktJudgesEvidenceTechBody',API],
      ['mktJudgesEvidenceDesign','mktJudgesEvidenceDesignBody','/judges/demo/'],
      ['mktJudgesEvidenceImpact','mktJudgesEvidenceImpactBody','/retail/#pilot'],
      ['mktJudgesEvidenceIdea','mktJudgesEvidenceIdeaBody','/app/'],
    ] as const).map(([title,desc,url])=>
      '<a href="'+url+'" class="mkt-index-row"><strong>'+h(title)+'</strong>'+
      '<span>'+h(desc)+'</span><b>↗</b></a>').join('')+
    '<div class="mkt-video-status"><strong>'+h('mktJudgesVideo')+'</strong><p>'+h('mktJudgesVideoPending')+'</p></div>'+
    '<p>'+h('mktJudgesFootnote')+'</p></section></main>'+footer()+'</div>';
}
function stepper():string{
  return '<nav class="mkt-judge-steps" aria-label="'+h('mktJudgeProgress',{index:3})+'">'+
    ([['wardrobe','mktJudgeStep1'],['preview','mktJudgeStep2'],['verdict','mktJudgeStep3']] as const)
      .map(([id,label],i)=>'<button type="button" data-guide-step="'+id+'" aria-current="'+(step===id?'step':'false')+'">'+
        '<span>'+String(i+1).padStart(2,'0')+'</span>'+h(label)+'</button>').join('')+'</nav>';
}
function wardrobeStep():string{
  const sample=sampleWardrobe();
  return '<div class="mkt-judge-workflow-grid"><section class="mkt-judge-showcase">'+
    '<h2>'+h('mktJudgeStep1Heading')+'</h2><p>'+h('mktJudgeStep1Body')+'</p>'+
    '<div class="mkt-demo-items">'+sample.map(item=>'<figure>'+
      modelImage(item.photo?'/assets/items/'+item.photo+'.webp':
        item.id==='recorded-work'?'/demo/renders/top-work-woman-neutral-01.jpg':'/assets/demo-portrait.webp',item.name)+
      '<figcaption>'+escapeHtml(item.name)+'</figcaption></figure>').join('')+'</div>'+
    '</section><aside class="mkt-judge-context"><h3>'+h('mktJudgeEvidenceTitle')+'</h3>'+
    '<p>'+h('mktJudgesMoment1Note')+'</p><p>'+h('overviewNoHistory')+'</p>'+
    '<p class="mkt-small-muted">'+h('mktJudgesNotComposited')+'</p></aside></div>';
}
function previewStep():string{
  const evidence=demoEvidence(),product=retailExample();
  return '<div class="mkt-judge-workflow-grid"><section class="mkt-judge-preview-grid">'+
    '<figure><span class="mkt-eyebrow">'+h('mktJudgeCandidateLabel')+'</span>'+
    modelImage(product.imagePath,product.label)+
    '<figcaption>'+escapeHtml(product.label)+'</figcaption></figure>'+
    '<figure><span class="mkt-eyebrow">'+h('mktJudgeSavedTitle')+'</span>'+
    modelImage(evidence.top.imagePath,h('mktJudgeSavedBody'))+
    '<figcaption>'+h('mktJudgeOwnLabel')+' · '+h('purchaseWorkTop')+'</figcaption></figure>'+
    '</section><aside class="mkt-judge-context"><h3>'+h('mktJudgeTechnicalTitle')+'</h3>'+
    '<dl><div><dt>'+h('mktJudgeInputReference')+'</dt><dd>'+
    escapeHtml(evidence.candidateElement.kind+':'+evidence.candidateElement.id)+'</dd></div>'+
    '<div><dt>'+h('mktJudgeAvatarReference')+'</dt><dd>'+
    escapeHtml(evidence.avatarId)+'</dd></div><div><dt>'+h('mktJudgeTaskReference')+'</dt><dd>'+
    h('mktJudgeTaskNotSubmitted')+'</dd></div><div><dt>'+h('mktJudgeOutputReference')+'</dt>'+
    '<dd>'+h('mktJudgeSavedTitle')+'</dd></div></dl>'+
    '<p>'+h('mktJudgeSavedBody')+'</p><p>'+h('mktJudgeRecordedOn',{date:evidence.candidate.recordedAt.slice(0,10)})+'</p>'+
    '<p class="mkt-small-muted">'+h('mktJudgeStep2Body')+'</p>'+
    link(API,h('mktJudgeSeeApi'))+'</aside></div>';
}
function verdictStep():string{
  const evaluated=coreDecision(mode),result=evaluated.result;
  const scenario=scenarioForDemo(mode);
  const basket=result.status==='solved'?result.basket.candidateIds.map(id=>evaluated.candidateLabels[id]??id):[];
  const failed=result.status==='solved'?result.certificate.cheaperBaskets:[];
  return '<div class="mkt-verdict"><div class="mkt-verdict-main"><div class="mkt-verdict-tabs" role="group">'+
    (['minimum','zero'] as const).map(key=>'<button type="button" data-judge-mode="'+key+
      '" aria-pressed="'+(mode===key)+'">'+h(key==='minimum'?'mktJudgeDemoMinimum':'mktJudgeDemoZero')+'</button>').join('')+'</div>'+
    '<h2>'+h('mktJudgeStep3Heading')+'</h2><p>'+h('mktJudgeStep3Body')+'</p>'+
    '<div class="mkt-verdict-amount">'+(result.status==='solved'?
      '<strong>'+escapeHtml(basket.length?basket.join(' + '):t('purchaseBuyNothing'))+'</strong>'+
      '<span>'+escapeHtml(money(result.basket.costMinor,result.basket.currency))+'</span>':
      '<strong>'+h(result.status==='incomplete'?'mktJudgeVerdictIncomplete':'mktJudgeVerdictInfeasible')+'</strong>')+'</div>'+
    (result.status==='solved'&&basket.length===0?'<p>'+h('mktJudgeVerdictZero')+'</p>':'')+
    '<p class="mkt-small-muted">'+h('mktJudgeCurrencyNote')+' '+h('mktJudgeVerdictNotDuplicate')+'</p></div>'+
    '<aside class="mkt-judge-context"><h3>'+h('mktJudgeVerdictWhy')+'</h3>'+
    '<p>'+h('mktJudgeVerdictStatus')+'</p><p>'+
    (result.status==='solved'?h(result.certificate.priceOptimality==='proven'?'mktJudgeVerdictProven':'mktJudgeVerdictProvisional'):
      h('mktJudgeVerdictIncomplete'))+'</p>'+
    '<p>'+h('purchaseCertificateScope',{count:result.evaluatedBasketCount})+'</p>'+
    (failed.length?'<ul>'+failed.map(entry=>'<li><strong>'+escapeHtml(entry.basket.candidateIds.length?
      entry.basket.candidateIds.map(id=>evaluated.candidateLabels[id]??id).join(' + '):t('purchaseBuyNothing'))+
    '</strong> · '+escapeHtml(money(entry.basket.costMinor,entry.basket.currency))+
    '<span class="mkt-unsatisfied">'+h('purchaseFails')+' '+
      escapeHtml(entry.failedRequirements.map(req=>scenario.requirements.find(r=>r.id===req.requirementId)?.label??req.requirementId).join(', '))+
    '</span></li>').join('')+'</ul>':
    result.status==='solved'&&!basket.length?'<p class="mkt-no-cheaper">'+h('mktJudgeNoCheaper')+'</p>':'')+
    link('/app/#check',h('mktJudgeGoApp'))+'</aside></div>';
}
function guidedDemo():string{
  // Explicit review links (?step=preview or ?step=verdict) let Chromium
  // screenshot each real guided state; arbitrary query strings are ignored.
  if(!stepQueryLoaded&&typeof window!=='undefined'){
    step=demoStep(new URLSearchParams(window.location.search).get('step'));
    stepQueryLoaded=true;
  }
  const pageIndex=1+(['wardrobe','preview','verdict'] as readonly DemoStep[]).indexOf(step);
  const next=pageIndex<3?(['wardrobe','preview','verdict'] as const)[pageIndex]:null;
  const prev=pageIndex>1?(['wardrobe','preview','verdict'] as const)[pageIndex-2]:null;
  return '<div class="mkt-site mkt-guided">'+siteHeader('judges')+
    '<main id="main-content" tabindex="-1"><div class="mkt-guide-top">'+
    '<span>'+h('mktJudgeNoAccount')+'</span><nav>'+link(CODE,h('mktJudgesCode'))+
    link(SETUP,h('mktJudgesTests'))+'</nav></div>'+stepper()+
    '<header class="mkt-guide-heading"><div><p class="mkt-eyebrow">'+h('mktJudgeProgress',{index:pageIndex})+'</p>'+
    '<h1>'+h('mktJudgeDemoTitle')+'</h1><p>'+h('mktJudgeDemoSubtitle')+'</p></div>'+
    link('/judges/',h('mktJudgesNav'))+'</header>'+
    (step==='wardrobe'?wardrobeStep():step==='preview'?previewStep():verdictStep())+
    judgeDisclosures()+
    '<div class="mkt-guide-actions">'+(prev?'<button type="button" data-guide-step="'+prev+
      '" class="mkt-outline-button">'+h('mktJudgeBack')+'</button>':'<span></span>')+
      (next?'<button type="button" class="mkt-button mkt-button-dark" data-guide-step="'+next+'">'+
      h('mktJudgeNext',{title:t(next==='preview'?'mktJudgeStep2':'mktJudgeStep3')})+'</button>':
      link('/app/#check',h('mktJudgeGoApp'),'mkt-button mkt-button-dark'))+'</div>'+
    '<p class="mkt-guided-note">'+h('mktJudgeLiveSeparate')+' '+
    link(API,h('mktJudgeSeeApi'))+'</p>'+
    '<p class="mkt-guided-note">'+h('mktJudgesVideoPending')+'</p>'+
    '</main>'+footer()+'</div>';
}
export function marketingPage(route:MarketingRoute):string {
  if(route==='/')return renderLanding('shoppers').replaceAll('/retailers','/retail/');
  if(route==='/retail')return retailLanding();
  if(route==='/retail/demo')return retailerProduct();
  if(route==='/judges')return judgesLanding();
  return guidedDemo();
}
export function marketingTitle(route:MarketingRoute):string {
  const titles:Record<MarketingRoute,string>={
    '/':'WearAgain - Your wardrobe, more you',
    '/retail':'For retailers - WearAgain',
    '/retail/demo':'Demo Atelier - WearAgain',
    '/judges':'For judges - WearAgain',
    '/judges/demo':'Guided demo - WearAgain',
  };
  return titles[route];
}
export function handleMarketingClick(target:HTMLElement,rerender:()=>void):boolean{
  if(target.dataset.guideStep){
    step=demoStep(target.dataset.guideStep);rerender();return true;
  }
  if(target.dataset.judgeMode){
    if(target.dataset.judgeMode==='minimum'||target.dataset.judgeMode==='zero'){
      mode=target.dataset.judgeMode;rerender();return true;
    }
  }
  if(target.hasAttribute('data-retail-panel-toggle')){openRetailPanel=!openRetailPanel;rerender();return true;}
  if(target.dataset.retailSize&&['XS','S','M','L','XL'].includes(target.dataset.retailSize)){
    retailSize=target.dataset.retailSize;rerender();return true;
  }
  if(target.hasAttribute('data-retail-save')){retailSaved=true;rerender();return true;}
  return false;
}
