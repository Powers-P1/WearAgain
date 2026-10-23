import {WALKTHROUGH_STEPS,objectiveComplete,readWalkthrough,type WalkthroughFacts} from './walkthrough-state.js';
import './walkthrough.css';
export interface WardrobeWalkthrough {start:()=>void;refresh:()=>void;active:()=>boolean}
const KEY='wearagain:web2:walkthrough:v1';
export function createWardrobeWalkthrough(options:{facts:()=>WalkthroughFacts;navigate:(route:string)=>void;storage?:Pick<Storage,'getItem'|'setItem'>|undefined}):WardrobeWalkthrough{
 let active=false,step=0,before=options.facts(),returnRoute='',returnFocus:HTMLElement|null=null,frame=0,compact=false;
 let target:HTMLElement|null=null;
 const layer=document.createElement('div');layer.className='wear-guide-layer';layer.hidden=true;
 layer.innerHTML='<div class="wear-guide-highlight" aria-hidden="true"></div><section class="wear-guide-card" role="dialog" aria-modal="false" aria-labelledby="wear-guide-title" aria-describedby="wear-guide-body"><header><span class="wear-guide-progress"></span><button type="button" data-coach="compact" aria-label="Minimize walkthrough">−</button><button type="button" data-coach="close" aria-label="Close walkthrough">×</button></header><div class="wear-guide-content"><h2 id="wear-guide-title"></h2><p id="wear-guide-body"></p><p class="wear-guide-objective" role="status" aria-live="polite"></p><nav aria-label="Walkthrough controls"><button type="button" data-coach="focus">Show me</button><button type="button" data-coach="back">Back</button><button type="button" data-coach="next">Next</button></nav><small>Real controls, your decisions. Esc to pause. No paid API starts automatically.</small></div></section>';
 document.body.append(layer);
 const card=layer.querySelector<HTMLElement>('.wear-guide-card')!,highlight=layer.querySelector<HTMLElement>('.wear-guide-highlight')!;
 const control=(id:string)=>layer.querySelector<HTMLButtonElement>('[data-coach="'+id+'"]')!;
 const persist=(status:'paused'|'complete'='paused')=>{try{options.storage?.setItem(KEY,JSON.stringify({version:1,step,status}));}catch{}};
 function clearTarget(){target?.classList.remove('wear-guide-target');target=null;}
 function close(complete=false){if(!active)return;persist(complete?'complete':'paused');active=false;layer.hidden=true;clearTarget();document.body.classList.remove('wear-guide-active');document.body.style.removeProperty('--wear-guide-space');options.navigate(returnRoute);returnFocus?.isConnected&&returnFocus.focus({preventScroll:true});}
 function paint(){
  frame=0;if(!active)return;
  const row=WALKTHROUGH_STEPS[step]!,done=objectiveComplete(step,options.facts(),before);
  layer.querySelector('.wear-guide-progress')!.textContent='GUIDED WALKTHROUGH · '+(step+1)+' / '+WALKTHROUGH_STEPS.length;
  layer.querySelector('#wear-guide-title')!.textContent=row.title;layer.querySelector('#wear-guide-body')!.textContent=row.body;
  layer.querySelector('.wear-guide-objective')!.textContent=(done?'✓ Done. ':'To continue: ')+row.task;
  control('next').disabled=!done;control('next').textContent=step===8?'Finish':'Next';control('back').disabled=step===0;
  clearTarget();target=document.querySelector<HTMLElement>(row.target)??document.querySelector<HTMLElement>('main .page');target?.classList.add('wear-guide-target');
  const rect=target?.getBoundingClientRect();highlight.hidden=!rect||rect.bottom<0||rect.top>innerHeight;
  if(rect){highlight.style.cssText=`left:${Math.max(3,rect.left-4)}px;top:${Math.max(3,rect.top-4)}px;width:${Math.max(0,Math.min(innerWidth-6,rect.width+8))}px;height:${Math.max(0,Math.min(innerHeight-6,rect.bottom)-Math.max(3,rect.top-4))}px`;}
  document.body.style.setProperty('--wear-guide-space',(card.getBoundingClientRect().height+30)+'px');
 }
 function refresh(){if(active&&!frame)frame=requestAnimationFrame(paint);}
 function enter(index:number){step=index;before=options.facts();control('next').disabled=true;persist();options.navigate(WALKTHROUGH_STEPS[step]!.route);refresh();}
 layer.addEventListener('click',event=>{const action=(event.target as Element).closest<HTMLElement>('[data-coach]')?.dataset.coach;
  if(action==='close')close();
  if(action==='compact'){compact=!compact;card.classList.toggle('compact',compact);control('compact').textContent=compact?'+':'−';control('compact').setAttribute('aria-label',compact?'Expand walkthrough':'Minimize walkthrough');refresh();}
  if(action==='focus'){target?.scrollIntoView({block:'start',behavior:'smooth'});const field=target?.matches('button,input,textarea,select')?target:target?.querySelector<HTMLElement>('button,input,textarea,select,summary');field?.focus({preventScroll:true});}
  if(action==='back'&&step>0)enter(step-1);
  if(action==='next'&&objectiveComplete(step,options.facts(),before)){if(step===8)close(true);else enter(step+1);}
 });
 window.addEventListener('wearagain:rendered',refresh);window.addEventListener('resize',refresh);window.addEventListener('scroll',refresh,true);
 document.addEventListener('keydown',event=>{if(active&&event.key==='Escape'&&!document.querySelector('dialog[open],[aria-modal="true"]')){event.preventDefault();close();}});
 return {active:()=>active,refresh,start(){if(active)return;let saved;try{saved=readWalkthrough(options.storage?.getItem(KEY)??null);}catch{saved=readWalkthrough(null);}returnRoute=location.hash.slice(1)||'wardrobe';returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;active=true;compact=false;card.classList.remove('compact');layer.hidden=false;document.body.classList.add('wear-guide-active');enter(saved.status==='complete'?0:saved.step);card.setAttribute('tabindex','-1');card.focus({preventScroll:true});}};
}
