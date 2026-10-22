import {activeProfile,createProfile,profiles,profileStorage,selectProfile} from './profiles.js';
import {readMemory,remember,saveMemory} from './memory.js';
import {exportTransfer,importTransfer} from './transfer.js';
import {saveState} from './state.js';
import {esc} from './ui.js';
import avatars from '../../fixtures/base_models/avatars.json' with {type:'json'};
import {parseAvatarCatalog,selectAvatar} from '../../src/core/avatar.js';
const CATALOG= parseAvatarCatalog(avatars),AVATAR_KEY='wearagain:agent:avatar:v1';
type Actions={readonly base:Storage|undefined;readonly store:Storage|undefined;readonly notice:(s:string)=>void;readonly rerender:()=>void};
export function selectedAvatar(store:Pick<Storage,'getItem'>|undefined):string{let id='woman_neutral_01';try{id=store?.getItem(AVATAR_KEY)??id;}catch{}return CATALOG.some(a=>a.id===id)?id:'woman_neutral_01';}
export function accountMarkup(base:Storage|undefined,store:Storage|undefined):string{
 const profile=activeProfile(base),memories=readMemory(store),avatar=selectedAvatar(store);
 return '<section class="account-tools"><h2>Your device profile</h2><p>Wardrobes and memory stay separate on this device. These are local profiles, without cloud accounts.</p><label for="device-profile-choice">Active wardrobe</label><select id="device-profile-choice">'+profiles(base).map(p=>'<option value="'+esc(p.id)+'"'+(p.id===profile.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select>'+
 '<details><summary>Start a new wardrobe</summary><form id="device-profile-form"><label for="new-profile-name">Profile name</label><input id="new-profile-name" name="name" maxlength="65" required><button class="button button-outline" type="submit">Create empty wardrobe</button></form></details>'+
 '<details><summary>What your stylist remembers · '+memories.length+'</summary><p>You can edit or delete any preference or earlier decision. Your saved style above is also read by the stylist.</p>'+memories.map(m=>'<article><label for="memory-'+esc(m.id)+'">'+esc(m.kind)+' · '+esc(m.updatedAt.slice(0,10))+'</label><textarea id="memory-'+esc(m.id)+'" maxlength="500" rows="3">'+esc(m.text)+'</textarea><button type="button" class="text-link" data-memory-save="'+esc(m.id)+'">Save changes</button><button type="button" class="text-link" data-memory-delete="'+esc(m.id)+'">Delete</button></article>').join('')+'<form id="memory-form"><label for="new-memory">Add a preference</label><textarea name="text" id="new-memory" maxlength="500" rows="3" required></textarea><button type="submit" class="button button-outline">Remember this</button></form></details>'+
 '<details><summary>Move your wardrobe to another device</summary><p>This is an explicit file transfer, without automatic synchronization. It includes clothing photos, availability, saved outfits, requirements, shopping lists and history. Personal try-on photos, credentials and live sessions are excluded. Keep the file private.</p><button type="button" class="button button-outline" data-transfer-export>Export my wardrobe</button><label for="wardrobe-transfer-file">Import into a new local profile</label><input id="wardrobe-transfer-file" type="file" accept="application/json,.json"><p>Import keeps this wardrobe intact and opens a separate transferred profile.</p></details>'+
 '<details><summary>Choose your live preview model</summary><label for="live-avatar-choice">Synthetic adult model</label><select id="live-avatar-choice">'+CATALOG.filter(a=>a.ageBand==='adult').map(a=>'<option value="'+a.id+'"'+(a.id===avatar?' selected':'')+'>'+esc((a.sex==='female'?'Female':'Male')+' · '+a.build+' · '+a.id)+'</option>').join('')+'</select><p>Manual selection uses the existing avatar selector. These are nominal synthetic models; previewing style does not verify garment size.</p></details></section>';
}
export function accountClick(button:HTMLElement,actions:Actions):boolean{
 if(button.dataset.memoryDelete){saveMemory(actions.store,readMemory(actions.store).filter(m=>m.id!==button.dataset.memoryDelete));actions.notice('Memory deleted.');actions.rerender();return true;}
 if(button.dataset.memorySave){const memory=readMemory(actions.store).find(m=>m.id===button.dataset.memorySave),field=document.getElementById('memory-'+button.dataset.memorySave);if(memory&&field instanceof HTMLTextAreaElement){try{remember(actions.store,{...memory,text:field.value,updatedAt:new Date().toISOString()});actions.notice('Memory updated for your next conversation.');}catch{actions.notice('Use a preference up to 500 characters.');}}actions.rerender();return true;}
 if(button.hasAttribute('data-transfer-export')){if(!actions.store){actions.notice('Device storage unavailable.');return true;}button.setAttribute('disabled','');void exportTransfer(activeProfile(actions.base),actions.store).then(blob=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='WearAgain-wardrobe-transfer.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);actions.notice('Wardrobe exported. Import this private file on your other device.');}).catch(e=>actions.notice(e instanceof Error?e.message:'Transfer failed.')).finally(actions.rerender);return true;}
 return false;
}
export function accountSubmit(form:HTMLFormElement,actions:Actions):boolean{
 if(form.id==='device-profile-form'){
  try{if(!actions.base)throw Error('Device storage unavailable');const name=String(new FormData(form).get('name')??''),profile=createProfile(name,actions.base);if(!saveState({version:1,exampleMode:false,style:'',items:[]},profileStorage(actions.base,profile.id)))throw Error('The new wardrobe could not be stored. Free some device storage and try again.');location.href='/app/#wardrobe';location.reload();}catch(e){actions.notice(e instanceof Error?e.message:'Could not create profile');actions.rerender();}return true;
 }
 if(form.id==='memory-form'){try{remember(actions.store,{id:'memory_'+crypto.randomUUID().replaceAll('-',''),kind:'preference',text:String(new FormData(form).get('text')??''),updatedAt:new Date().toISOString()});actions.notice('Preference saved.');}catch{actions.notice('Use a preference up to 500 characters.');}actions.rerender();return true;}
 return false;
}
export function accountChange(input:HTMLElement,actions:Actions):boolean{
 if(input instanceof HTMLSelectElement&&input.id==='device-profile-choice'){if(actions.base){selectProfile(input.value,actions.base);location.href='/app/#wardrobe';location.reload();}return true;}
 if(input instanceof HTMLSelectElement&&input.id==='live-avatar-choice'){const avatar=CATALOG.find(a=>a.id===input.value);if(avatar){const selected=selectAvatar(CATALOG,{sex:avatar.sex,adultConfirmed:true,manualAvatarId:avatar.id});if(selected.status==='selected')actions.store?.setItem(AVATAR_KEY,selected.avatar.id);}actions.notice('Live preview model updated.');actions.rerender();return true;}
 if(input instanceof HTMLInputElement&&input.id==='wardrobe-transfer-file'){
  const file=input.files?.[0];if(file&&actions.base){const base=actions.base;void importTransfer(file,base).then(()=>{location.href='/app/#wardrobe';location.reload();}).catch(e=>{actions.notice(e instanceof Error?e.message:'Import failed.');actions.rerender();});}return true;
 }
 return false;
}
