import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

test('legacy root worker immediately retires the old cache-first installation without touching v2 or private storage',async()=>{
  const source=await readFile(new URL('../web2/public/sw.js',import.meta.url),'utf8');
  const listeners=new Map();
  const names=new Set(['wearagain-demo-legacy-v1','wearagain-demo-last-good',
    'wearagain-web2-public-current','unrelated-origin-feature']);
  const deleted=[];
  const navigated=[];
  let unregistered=0;
  let waited=0;
  const origin='https://wearagain.pages.dev';
  const tabs=[
    {url:origin+'/',navigate:async url=>{navigated.push(url);return {};}},
    {url:origin+'/app/',navigate:async url=>{navigated.push(url);return {};}},
    {url:origin+'/retailers/',navigate:async url=>{navigated.push(url);return {};}},
    {url:'https://other.example/app/',navigate:async url=>{navigated.push('WRONG:'+url);return {};}},
  ];
  const self={
    location:{origin},
    addEventListener:(name,callback)=>listeners.set(name,callback),
    skipWaiting:async()=>{waited++;},
    clients:{matchAll:async options=>{
      assert.equal(options.type,'window');
      assert.equal(options.includeUncontrolled,true);
      return tabs;
    }},
    registration:{unregister:async()=>{unregistered++;return true;}},
  };
  const caches={
    keys:async()=>[...names],
    delete:async key=>{deleted.push(key);names.delete(key);return true;},
  };
  runInNewContext(source,{self,caches,URL,Promise});
  assert.deepEqual([...listeners.keys()].sort(),['activate','install']);
  assert.equal(listeners.has('fetch'),false,'root cleanup worker must never control network requests');
  let installation;
  listeners.get('install')({waitUntil:p=>{installation=p;}});
  await installation;
  assert.equal(waited,1,'waiting old SW must be superseded on next update');
  let activation;
  listeners.get('activate')({waitUntil:p=>{activation=p;}});
  await activation;
  assert.deepEqual(deleted.sort(),['wearagain-demo-last-good','wearagain-demo-legacy-v1']);
  assert.deepEqual([...names].sort(),['unrelated-origin-feature','wearagain-web2-public-current']);
  assert.equal(unregistered,1);
  assert.deepEqual(navigated.sort(),[origin+'/',origin+'/app/',origin+'/retailers/'].sort());
});

test('root worker script is copied to a real .js URL, never substituted with index.html',async()=>{
  const [build,headers,pwa]=await Promise.all([
    readFile(new URL('../scripts/build-web2.mjs',import.meta.url),'utf8'),
    readFile(new URL('../web2/_headers',import.meta.url),'utf8'),
    readFile(new URL('../web2/sw-template.js',import.meta.url),'utf8')
  ]);
  assert.match(build,/await cp\(join\(root, 'web2\/public\/sw\.js'\), join\(dest, 'sw\.js'\)\)/);
  assert.match(headers,/\/sw\.js\s*\n\s*Cache-Control: no-cache/);
  assert.match(pwa,/wearagain-web2-public-/);
  assert.match(build,/join\(dest,'app\/sw\.js'\)/);
});
