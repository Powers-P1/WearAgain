import { scenarioForDemo, recordingFor, type PurchaseDemo } from './purchase.js';
import { solveBasket, type SolveResult } from '../../src/core/index.js';
import { initialState, type WardrobeItem } from './state.js';
import manifest from '../../fixtures/youcam/demo-manifest.json' with { type: 'json' };

export const MARKETING_ROUTES = ['/', '/retail', '/retail/demo', '/judges', '/judges/demo'] as const;
export type MarketingRoute = typeof MARKETING_ROUTES[number];
export const DEMO_STEPS = ['wardrobe','preview','verdict'] as const;
export type DemoStep = (typeof DEMO_STEPS)[number];
export const CORE_DEMOS = ['minimum','zero'] as const satisfies readonly PurchaseDemo[];

export function marketingRoute(pathname: string): MarketingRoute | null {
  const normalized=pathname.length>1?pathname.replace(/\/+$/,''):pathname;
  return MARKETING_ROUTES.find(value=>value===normalized)??null;
}
export function demoStep(value:unknown):DemoStep {
  return typeof value==='string'&&DEMO_STEPS.includes(value as DemoStep)?value as DemoStep:'wardrobe';
}
export function sampleWardrobe():readonly WardrobeItem[] {
  const state=initialState();
  const ids=['recorded-work','trousers','loafers','blazer','coat','cashmere'];
  return ids.flatMap(id=>state.items.filter(item=>item.id===id));
}
export function demoEvidence(){
  const candidate=recordingFor('outerwear','cheap-a');
  const top=recordingFor('top','work');
  if(!candidate||!top) throw Error('Recorded manifest is incomplete: cannot claim a saved YouCam demo.');
  const raw=manifest.renders.find(entry=>entry.id===candidate.id);
  if(!raw||raw.syntheticAvatarOnly!==true||raw.api!=='cloth-v4') throw Error('Unverified recording metadata.');
  return {
    candidate,
    top,
    avatarId:raw.avatarId,
    api:raw.api,
    candidateElement:{kind:raw.element.kind,id:raw.element.id},
    source:'recorded' as const,
    // A saved manifest is evidence of the previously recorded output, never
    // proof that a new task was submitted or completed in this session.
    liveTaskStatus:'not_submitted' as const,
  };
}
export function coreDecision(mode:PurchaseDemo):{
  readonly mode:PurchaseDemo;
  readonly result:SolveResult;
  readonly candidateLabels:Readonly<Record<string,string>>;
  readonly needs:readonly string[];
} {
  if(!CORE_DEMOS.includes(mode))throw Error('Invalid demo mode');
  const scenario=scenarioForDemo(mode);
  const result=solveBasket(scenario);
  return {
    mode,result,needs:scenario.requirements.map(r=>r.label),
    candidateLabels:Object.fromEntries(scenario.outerwear.filter(item=>item.kind==='candidate').map(item=>[item.id,item.label])),
  };
}
export function retailExample(){
  // 40.00 PLN from the existing synthetic fixture, NOT a live merchant price.
  const scenario=scenarioForDemo('minimum');
  const product=scenario.outerwear.find(item=>item.kind==='candidate'&&item.id==='cheap-a');
  if(!product||product.kind!=='candidate')throw Error('The recorded demo candidate is missing.');
  const evidence=demoEvidence();
  return {id:product.id,label:product.label,priceMinor:product.priceMinor,currency:scenario.currency,
    imagePath:evidence.candidate.imagePath,recordedAt:evidence.candidate.recordedAt};
}
export function money(minor:number,currency:string):string{
  return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(minor/100);
}
