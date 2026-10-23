import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mp4Duration,playbackDisposition} from './browser/web2-media.mjs';

test('approved MP4 metadata is readable without a browser codec and rejects truncated files',async()=>{
 const bytes=await readFile(new URL('../docs/demo/final-v7/WearAgain-smooth-final-v7.mp4',import.meta.url));
 assert.equal(mp4Duration(bytes),74.5);
 assert.throws(()=>mp4Duration(bytes.subarray(0,50)),/Truncated|Invalid|missing/);
});

test('media checks skip only declared codec absence and fail real network/decode errors',()=>{
 const supported={video:'probably',audio:'probably'},missing={video:'',audio:'probably'};
 assert.equal(playbackDisposition(supported,{error:null}).status,'required');
 assert.equal(playbackDisposition(missing,{error:null}).status,'skipped');
 assert.equal(playbackDisposition(missing,{error:{code:4,message:'Unsupported source'}}).status,'skipped');
 for(const capabilities of [supported,missing])for(const code of [1,2,3]){
  assert.equal(playbackDisposition(capabilities,{error:{code,message:'Real failure'}}).status,'fail');
 }
 assert.equal(playbackDisposition(supported,{error:{code:4,message:'Bad source despite support'}}).status,'fail');
});
