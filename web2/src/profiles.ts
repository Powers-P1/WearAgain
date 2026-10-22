/** Device profiles are separate local wardrobes, not authenticated cloud accounts. */
export interface DeviceProfile {readonly id:string;readonly name:string}
const KEY='wearagain:device-profiles:v1',ACTIVE='wearagain:active-profile:v1';
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v);
export function profiles(store?:Storage):DeviceProfile[]{
 try{const value:unknown=JSON.parse(store?.getItem(KEY)??'null');if(Array.isArray(value)&&value.length<=20&&value.every(v=>v&&typeof v==='object'&&validId(v.id)&&typeof v.name==='string'&&v.name.trim()&&v.name.length<=80))return value as DeviceProfile[];}catch{}
 return [{id:'default',name:'Anna · sample wardrobe'}];
}
export function activeProfile(store?:Storage):DeviceProfile{
 let id='default';try{id=store?.getItem(ACTIVE)??id;}catch{}return profiles(store).find(p=>p.id===id)??profiles(store)[0]!;
}
export function profileStorage(base:Storage|undefined,id:string):Storage|undefined{
 if(!base)return undefined;const prefix=id==='default'?'':'wearagain:profile:'+id+':';
 const ownKeys=()=>Array.from({length:base.length},(_,i)=>base.key(i)).filter((k):k is string=>k!==null&&(prefix?k.startsWith(prefix):/^wearagain:(web2|agent):/.test(k)));
 return {getItem:key=>base.getItem(prefix+key),setItem:(key,value)=>base.setItem(prefix+key,value),removeItem:key=>base.removeItem(prefix+key),clear:()=>ownKeys().forEach(k=>base.removeItem(k)),key:index=>{const key=ownKeys()[index];return key?key.slice(prefix.length):null;},get length(){return ownKeys().length;}};
}
export function createProfile(name:string,base:Storage,activate=true):DeviceProfile{
 const clean=name.trim();if(!clean||clean.length>80||profiles(base).length>=20)throw Error('Use a name up to 80 characters; at most 20 device profiles.');
 const profile={id:'user_'+crypto.randomUUID().replaceAll('-',''),name:clean};
 registerProfile(profile,base,activate);return profile;
}
export function registerProfile(profile:DeviceProfile,base:Storage,activate=true):void{
 if(!validId(profile.id)||!profile.name.trim()||profile.name.length>80||profiles(base).some(p=>p.id===profile.id))throw Error('Invalid or duplicate device profile');
 base.setItem(KEY,JSON.stringify([...profiles(base),profile]));if(activate)base.setItem(ACTIVE,profile.id);
}
export function selectProfile(id:string,base:Storage):void{if(!profiles(base).some(p=>p.id===id))throw Error('Unknown profile');base.setItem(ACTIVE,id);}
