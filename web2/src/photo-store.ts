/**
 * Device-only captured candidate photographs. IndexedDB never involves the
 * Worker, the provider or the PWA cache. Keep metadata separately in localStorage.
 */
const DB_NAME='wearagain-device-photos-v1';
const STORE='photos';
export const MAX_PHOTO_BYTES=12_000_000;
export function supportedPhoto(file:Pick<File,'type'|'size'>):boolean {
  return ['image/jpeg','image/png','image/webp'].includes(file.type) && file.size>0 && file.size<=MAX_PHOTO_BYTES;
}
function database():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(Error('IndexedDB unavailable'));return;}
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);
    };
    request.onerror=()=>reject(request.error??Error('Photo storage unavailable'));
    request.onblocked=()=>reject(Error('Photo database is open in another tab'));
    request.onsuccess=()=>resolve(request.result);
  });
}
async function transact<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore,resolve:(value:T)=>void,reject:(reason:unknown)=>void)=>void):Promise<T>{
  const db=await database();
  return new Promise((resolve,reject)=>{
    let settled=false;
    function fail(e:unknown){if(!settled){settled=true;reject(e);}}
    function finish(v:T){if(!settled){settled=true;resolve(v);}}
    try{
      const tx=db.transaction(STORE,mode);
      tx.onerror=()=>fail(tx.error??Error('Photo transaction failed'));
      tx.onabort=()=>fail(tx.error??Error('Photo transaction aborted'));
      run(tx.objectStore(STORE),finish,fail);
    }catch(e){fail(e);}
  }).finally(()=>db.close());
}
export async function storePhoto(id:string,file:File):Promise<void>{
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id)||!supportedPhoto(file))throw Error('Unsupported photo format or size');
  // Completion, not request success, confirms the transaction was committed.
  const db=await database();
  await new Promise<void>((resolve,reject)=>{
    try{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(file,id);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error??Error('Photo not saved'));
      tx.onabort=()=>reject(tx.error??Error('Photo not saved'));
    }catch(e){reject(e);}
  }).finally(()=>db.close());
}
export async function readPhoto(id:string):Promise<Blob|null>{
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id))return null;
  return transact<Blob|null>('readonly',(store,resolve,reject)=>{
    const req=store.get(id);
    req.onsuccess=()=>resolve(req.result instanceof Blob?req.result:null);
    req.onerror=()=>reject(req.error);
  });
}
export async function deletePhoto(id:string):Promise<void>{
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id))return;
  const db=await database();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error??Error('Cannot delete photo'));
    tx.onabort=()=>reject(tx.error??Error('Cannot delete photo'));
  }).finally(()=>db.close());
}
