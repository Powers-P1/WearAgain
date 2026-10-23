/** Objectives inspect committed application state, never just a click. No API or photo is required to start. */
export interface WalkthroughFacts {
 route:string; itemExists:boolean;styleSaves:number; humanRating:boolean; zeroSelected:number; zeroSolved:boolean;
 saved:string; photos:number; coffee:boolean; wears:string; packed:string;
}
export const WALKTHROUGH_STEPS = [
 {route:'wardrobe',target:'.wardrobe-grid, .empty-wardrobe',title:'Meet your wardrobe',body:'Open any piece to see its availability. On an empty profile, add your first item first. A clothing photo is optional; no photo is sent to AI here.',task:'Open a wardrobe item.'},
 {route:'profile',target:'#style-form',title:'Tell your stylist what you like',body:'Write your preferences in your own words, then save. They belong to this local profile. You can review or correct them here.',task:'Save your style preferences.'},
 {route:'check',target:'.purchase-rating',title:'Your judgement comes first',body:'Choose the considered-purchase example, then rate a saved pair. These are recorded single-garment previews. Your rating updates the actual basket solver; style preview does not prove size fit.',task:'Give a Would wear or Not for me rating.'},
 {route:'check',target:'.purchase-demo-modes',title:'Try buying nothing',body:'Choose the buy-nothing example. Inspect the verdict and certificate: the owned baseline covers the declared need for zero item cost. This is a labelled synthetic example, separate from your wardrobe.',task:'Choose Buy nothing and inspect the zero-cost result.'},
 {route:'stylist',target:'#stylist-form, .stylist-look',title:'Make a look, then keep it',body:'Use Saved example mode, show the looks and save one you would wear. It is checked against ready clothes. On an empty wardrobe, add a top, bottoms and shoes first. Live AI is optional and never starts from this walkthrough.',task:'Save a valid outfit using the real Save look button.'},
 {route:'gallery',target:'.mall-capture-panel, .mall-tabs',title:'Snap now, review over coffee',body:'Add a garment-only photo with the camera or file picker, then open Coffee review. The photo stays on this device. A photo alone is not a generated preview. Live YouCam needs a separate consent and credit check; this step does not require it.',task:'Save a new clothing photo, then open Coffee review.'},
 {route:'morning',target:'#morning-form, .morning-results',title:'A quick morning decision',body:'Ask for a ready-to-wear work look without ironing. Type instead of using voice if you prefer. Choose a valid look and mark it worn: the wear log should change. Insufficient ready clothes are explained, not invented.',task:'Prepare a look and mark it worn today.'},
 {route:'trip',target:'.trip-packing, .trip-visual',title:'Pack the clothes you will use',body:'Choose an occasion and assign a ready outfit, then check one item in the packing list. The plan and list are saved locally; nothing is bought or booked.',task:'Assign an outfit if needed and change a packing checkbox.'},
 {route:'overview',target:'.page',title:'Review before you let something go',body:'Open one item from the wardrobe review. Wear counts come from your log, not guesses about how often you wear it. Repairs, donations and availability remain your decision.',task:'Open an item review. No deletion is required.'},
] as const;
export function objectiveComplete(step:number,now:WalkthroughFacts,before:WalkthroughFacts):boolean {
 switch(step){
  case 0:return now.route.startsWith('item/')&&now.itemExists;
  case 1:return now.styleSaves>before.styleSaves;
  case 2:return now.humanRating;
  case 3:return now.zeroSelected>before.zeroSelected&&now.zeroSolved;
  case 4:return now.saved!==before.saved&&now.saved!=='';
  case 5:return now.photos>before.photos&&now.coffee;
  case 6:return now.wears!==before.wears&&now.wears!=='';
  case 7:return now.packed!==before.packed;
  case 8:return now.route.startsWith('review/')&&now.itemExists;
  default:return false;
 }
}
export function readWalkthrough(raw:string|null):{step:number;status:'paused'|'complete'}{
 try{const value=JSON.parse(raw??'null');if(value?.version===1&&Number.isInteger(value.step)&&value.step>=0&&value.step<WALKTHROUGH_STEPS.length&&['paused','complete'].includes(value.status)&&!(value.status==='complete'&&value.step!==8))return {step:value.step,status:value.status};}catch{}
 return {step:0,status:'paused'};
}
