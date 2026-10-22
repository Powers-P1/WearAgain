interface InstallPrompt extends Event{
  prompt():Promise<void>;
  readonly userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
}
let started=false;
let pending:InstallPrompt|null=null;
export const canInstall=():boolean=>pending!==null;
export async function installWebApp():Promise<void>{
  const choice=pending;if(!choice)return;
  pending=null;await choice.prompt();await choice.userChoice;
}
/** Only the /app/ web demo installs the add-on shell. Never claim native/offline API. */
export function setupPwa():void{
  if(started)return;
  started=true;
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  void navigator.serviceWorker.register('/app/sw.js',{scope:'/app/',updateViaCache:'none'}).catch(()=>{});
  window.addEventListener('beforeinstallprompt',event=>{
    const e=event as InstallPrompt;
    e.preventDefault();pending=e;
    // Installation belongs in Profile, not in an unsolicited overlay over
    // the user's garment and wear / skip actions.
    window.dispatchEvent(new Event('wearagain-install-available'));
  });
  window.addEventListener('appinstalled',()=>{pending=null;});
}
