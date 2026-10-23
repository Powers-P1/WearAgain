import qrcode from 'qrcode-generator';
import {esc} from './ui.js';
import './mobile-install.css';
interface InstallPrompt extends Event{prompt():Promise<void>;readonly userChoice:Promise<{outcome:'accepted'|'dismissed'}>}
let initialized=false,installed=false,prompt:InstallPrompt|null=null,openDialog:(()=>void)|null=null;
const DISMISSED='wearagain:install-dismissed:v1';
const standalone=()=>matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone;
export const canOfferInstall=()=>!installed&&!standalone();
export async function openInstallation():Promise<void>{if(!initialized)initInstallation();openDialog?.();}
const qrCache=new Map<string,string>();
export function phoneHandoff(scenario:'minimum'|'zero'='minimum'):string{
 const origin=typeof window==='undefined'?'https://wearagain.pages.dev':window.location.origin,url=origin+'/app/?scenario='+scenario+'&judges=1#check';
 let svg=qrCache.get(url);if(!svg){const qr=qrcode(0,'M');qr.addData(url);qr.make();svg=qr.createSvgTag({cellSize:2,margin:4,scalable:true});qrCache.set(url,svg);}
 return '<section class="phone-handoff" aria-label="Try it on your phone"><div class="phone-qr" role="img" aria-label="QR code for the '+scenario+' mobile demo">'+svg+'</div><div><strong>Try it on your phone</strong><p>Scan to open this '+(scenario==='zero'?'buy-nothing':'considered-purchase')+' demo.</p><button type="button" class="text-link" data-copy-phone="'+esc(url)+'">Copy phone link</button><p class="phone-handoff-status" role="status"></p></div></section>';
}
export function initInstallation():void{
 if(initialized)return;initialized=true;installed=standalone();
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),mobile=ios||/Android|Mobile/.test(navigator.userAgent);
 const dialog=document.createElement('dialog');dialog.className='wear-install-dialog';dialog.setAttribute('aria-labelledby','wear-install-title');
 dialog.innerHTML='<button type="button" class="wear-install-close" aria-label="Close installation prompt">×</button><img src="/icons/icon-192.png" width="56" height="56" alt=""><p class="install-eyebrow">YOUR WARDROBE, ONE TAP AWAY</p><h2 id="wear-install-title">Keep WearAgain in your pocket.</h2><p>Add it to your home screen. Your saved wardrobe and examples work offline. Fresh AI and previews need a connection.</p><ol class="wear-install-help" hidden></ol><p class="wear-install-status" role="status"></p><button type="button" class="button button-primary wear-install-primary">Install WearAgain</button><button type="button" class="text-link wear-install-browser">Continue in browser</button>';
 document.body.append(dialog);const primary=dialog.querySelector<HTMLButtonElement>('.wear-install-primary')!,help=dialog.querySelector<HTMLElement>('.wear-install-help')!,status=dialog.querySelector<HTMLElement>('.wear-install-status')!;let returnFocus:HTMLElement|null=null;
 const refresh=()=>{document.querySelectorAll<HTMLElement>('[data-install-app],[data-pwa-install]').forEach(button=>{if(installed||standalone())button.textContent='App installed';});};
 function close(){try{localStorage.setItem(DISMISSED,'1');}catch{}dialog.close();returnFocus?.focus({preventScroll:true});}
 openDialog=()=>{if(installed||standalone()||dialog.open||document.querySelector('dialog[open],[aria-modal="true"]'))return;returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;help.hidden=true;delete primary.dataset.help;status.textContent='';primary.textContent='Install WearAgain';dialog.showModal();primary.focus();};
 dialog.querySelector('.wear-install-close')!.addEventListener('click',close);dialog.querySelector('.wear-install-browser')!.addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 primary.addEventListener('click',()=>{void(async()=>{
  if(primary.dataset.help){close();return;}
  if(!prompt){help.innerHTML=ios?'<li>Open this page in Safari and tap <strong>Share</strong>.</li><li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>':'<li>Open your browser menu.</li><li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>';help.hidden=false;primary.dataset.help='1';primary.textContent='Got it';status.textContent=ios?'iPhone installation uses the system Share menu.':'If this option is missing, use Chrome, Edge or Safari.';return;}
  const current=prompt;prompt=null;primary.disabled=true;try{await current.prompt();await current.userChoice;close();}catch{status.textContent='Use your browser menu to install the app.';}finally{primary.disabled=false;}
 })();});
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e as InstallPrompt;if(dialog.open){help.hidden=true;delete primary.dataset.help;primary.textContent='Install WearAgain';status.textContent='';}refresh();window.dispatchEvent(new Event('wearagain-install-available'));});
 window.addEventListener('appinstalled',()=>{installed=true;prompt=null;if(dialog.open)close();refresh();});window.addEventListener('wearagain:rendered',refresh);
 document.addEventListener('click',e=>{
  const el=e.target instanceof Element?e.target.closest<HTMLElement>('[data-install-app],[data-pwa-install],[data-copy-phone]'):null;if(!el)return;
  if(el.dataset.copyPhone){const url=el.dataset.copyPhone;void navigator.clipboard.writeText(url).then(()=>{const field=el.parentElement?.querySelector('.phone-handoff-status');if(field)field.textContent='Link copied.';}).catch(()=>{const field=el.parentElement?.querySelector('.phone-handoff-status');if(field)field.textContent=url;});}
  else{e.preventDefault();openDialog?.();}
 });
 if('serviceWorker'in navigator&&window.isSecureContext)void navigator.serviceWorker.register('/app/sw.js',{scope:'/app/',updateViaCache:'none'}).catch(()=>{});
 const keyboard=()=>document.body.classList.toggle('keyboard-open',!!window.visualViewport&&innerHeight-window.visualViewport.height>150&&!!document.activeElement?.matches('input,textarea,select'));window.visualViewport?.addEventListener('resize',keyboard);document.addEventListener('focusin',keyboard);document.addEventListener('focusout',keyboard);
 window.setTimeout(()=>{let dismissed=false;try{dismissed=localStorage.getItem(DISMISSED)==='1';}catch{}if(mobile&&!dismissed&&!standalone()&&!document.body.classList.contains('wear-guide-active')&&!document.activeElement?.matches('input,textarea,select'))openDialog?.();},1500);refresh();
}
