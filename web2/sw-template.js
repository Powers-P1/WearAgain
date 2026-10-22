/* WearAgain v2 PWA: explicit public static precache. It is an optional APP shell.
 * Only /app/ is controlled; it never caches runtime private device photos,
 * POSTs, API/Worker requests, auth headers, live session responses or URLs.
 */
const PUBLIC_FILES = __PRECACHE_FILES__;
const VERSION = '__CACHE_VERSION__';
const CACHE = 'wearagain-web2-public-' + VERSION;
const PREFIX = 'wearagain-web2-public-';
const ORIGIN = self.location.origin;
function safeStatic(path){
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||path.includes('\\')||path.includes('%'))return false;
  const url=new URL(path,ORIGIN);
  if(url.origin!==ORIGIN||url.pathname!==path||url.search||url.hash)return false;
  return path==='/app/'||path==='/manifest.webmanifest'||/^\/(?:assets|fonts|icons)\/[a-zA-Z0-9._/-]+$/.test(path)||
    /^\/demo\/(?:renders\/[A-Za-z0-9_-]+\.(?:jpg|png)|manifest\.json)$/.test(path);
}
if(!Array.isArray(PUBLIC_FILES)||!PUBLIC_FILES.every(safeStatic)||!PUBLIC_FILES.includes('/app/'))throw Error('Invalid public static cache');
const allowed=new Set(PUBLIC_FILES);
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    try{
      for(const path of PUBLIC_FILES){
        const req=new Request(new URL(path,ORIGIN),{method:'GET',credentials:'omit',cache:'reload',redirect:'error'});
        const res=await fetch(req);
        if(!res.ok||res.type==='opaque'||res.redirected)throw Error('Cannot precache approved static asset');
        await cache.put(new URL(path,ORIGIN),res);
      }
      await self.skipWaiting();
    }catch(err){await caches.delete(CACHE);throw err;}
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(PREFIX)&&name!==CACHE).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
function cachePath(req){
  if(req.method!=='GET'||req.headers.has('Authorization')||req.headers.has('Range'))return null;
  const url=new URL(req.url);
  if(url.origin!==ORIGIN||url.hash)return null;
  if(req.mode==='navigate'&&['/app','/app/','/app/index.html'].includes(url.pathname)&&!url.search)return '/app/';
  if(url.search||!/^(?:\/assets\/|\/fonts\/|\/icons\/|\/demo\/|\/manifest\.webmanifest$)/.test(url.pathname))return null;
  return allowed.has(url.pathname)?url.pathname:null;
}
self.addEventListener('fetch',event=>{
  const key=cachePath(event.request);
  if(key===null)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const found=await cache.match(new URL(key,ORIGIN));
    return found??fetch(event.request); // Never writes new runtime data to cache.
  })());
});
