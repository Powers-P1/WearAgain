import { t } from './i18n.js';
interface InstallPrompt extends Event{
  prompt():Promise<void>;
  readonly userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
}
let started=false;
/** Only the /app/ web demo installs the add-on shell. Never claim native/offline API. */
export function setupPwa():void{
  if(started)return;
  started=true;
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  void navigator.serviceWorker.register('/app/sw.js',{scope:'/app/',updateViaCache:'none'}).catch(()=>{});
  let pending:InstallPrompt|null=null;
  let banner:HTMLElement|null=null;
  let dismissed=false;
  function close(){banner?.remove();banner=null;}
  window.addEventListener('beforeinstallprompt',event=>{
    if(dismissed)return;
    const e=event as InstallPrompt;
    e.preventDefault();pending=e;
    close();
    banner=document.createElement('aside');
    banner.className='v2-pwa-banner';
    const title=document.createElement('strong');title.textContent=t('mktPwaInstall');
    const description=document.createElement('p');description.textContent=t('mktPwaHint');
    const install=document.createElement('button');install.type='button';install.textContent=t('mktPwaInstall');
    install.addEventListener('click',()=>{
      if(!pending)return;
      const toPrompt=pending;pending=null;
      void toPrompt.prompt().then(()=>toPrompt.userChoice).then(()=>close()).catch(()=>{
        description.textContent=t('mktPwaNotAvailable');
        install.remove();
      });
    });
    const dismiss=document.createElement('button');
    dismiss.className='v2-pwa-dismiss';dismiss.type='button';
    dismiss.setAttribute('aria-label','Dismiss installation suggestion');
    dismiss.textContent='×';
    dismiss.addEventListener('click',()=>{dismissed=true;pending=null;close();});
    banner.append(title,description,install,dismiss);
    document.body.append(banner);
  });
  window.addEventListener('appinstalled',()=>{dismissed=true;pending=null;close();});
}
