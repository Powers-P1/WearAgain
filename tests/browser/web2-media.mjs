import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Exact codecs from the approved v7 MP4 (High profile, level 4.2 + AAC-LC).
export const JURY_MEDIA_TYPES={
 video:'video/mp4; codecs="avc1.64002a"',
 audio:'audio/mp4; codecs="mp4a.40.2"',
 combined:'video/mp4; codecs="avc1.64002a, mp4a.40.2"',
};

/** Read the container duration without depending on a browser decoder. */
export function mp4Duration(bytes){
 const children=(start,end)=>{
  const boxes=[];
  for(let at=start;at<end;){
   assert.ok(at+8<=end,'Truncated MP4 box header');
   const short=bytes.readUInt32BE(at),header=short===1?16:8;
   assert.ok(at+header<=end,'Truncated extended MP4 box header');
   const size=short===1?Number(bytes.readBigUInt64BE(at+8)):short||end-at;
   assert.ok(Number.isSafeInteger(size)&&size>=header&&at+size<=end,'Invalid MP4 box bounds');
   boxes.push({type:bytes.toString('ascii',at+4,at+8),start:at+header,end:at+size});at+=size;
  }
  return boxes;
 };
 const movie=children(0,bytes.length).find(box=>box.type==='moov');assert.ok(movie,'MP4 moov box missing');
 const header=children(movie.start,movie.end).find(box=>box.type==='mvhd');assert.ok(header,'MP4 mvhd box missing');
 const version=bytes[header.start];assert.ok(version===0||version===1,'Unsupported MP4 movie-header version');
 const scaleAt=header.start+(version===1?20:12),durationAt=scaleAt+4;
 assert.ok(durationAt+(version===1?8:4)<=header.end,'Truncated MP4 movie timing');
 const scale=bytes.readUInt32BE(scaleAt),duration=version===1?Number(bytes.readBigUInt64BE(durationAt)):bytes.readUInt32BE(durationAt);
 assert.ok(scale>0&&Number.isSafeInteger(duration),'Invalid MP4 movie timing');return duration/scale;
}

/** Network/decode failures never become a capability skip. */
export function playbackDisposition(capabilities,state){
 if(state.error&&state.error.code!==4)return {status:'fail',reason:'Media element error '+state.error.code+': '+state.error.message};
 const missing=['video','audio'].filter(type=>capabilities[type]==='');
 if(missing.length)return {status:'skipped',reason:'Browser explicitly reports no support for approved '+missing.join(' + ')+' codec(s)'};
 if(state.error)return {status:'fail',reason:'Media source failed despite declared codec support: '+state.error.message};
 return {status:'required'};
}

export async function checkJuryMedia({page,context,base,manifest,progress}){
 const video=page.locator('.mkt-walkthrough video');
 assert.equal(await video.getAttribute('controls'),'');assert.equal(await video.getAttribute('playsinline'),'');
 assert.equal(await video.getAttribute('preload'),'metadata');
 assert.equal(await video.getAttribute('poster'),'/video/wearagain-final-v7-poster.jpg');
 assert.equal(await video.locator('source').getAttribute('src'),'/video/wearagain-final-v7.mp4');
 assert.equal(await video.locator('source').getAttribute('type'),'video/mp4');
 assert.equal(await video.locator('track').getAttribute('src'),'/video/wearagain-final-v7.en.vtt');
 const report={http:{},metadata:{},capabilities:null,element:null,playback:{status:'not-run'}};
 await progress('Jury media: HTTP / MIME / approved asset',report);
 const film=await context.request.get(base+'/video/wearagain-final-v7.mp4',{timeout:8000});
 assert.equal(film.status(),200);assert.match(film.headers()['content-type'],/^video\/mp4(?:;|$)/);
 const bytes=await film.body();assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
 const duration=mp4Duration(bytes);assert.equal(duration,manifest.durationSeconds);
 report.http.film={status:film.status(),mime:film.headers()['content-type'],bytes:bytes.length,sha256:manifest.sha256};
 report.metadata.container={status:'passed',duration};
 const poster=await context.request.get(base+'/video/wearagain-final-v7-poster.jpg',{timeout:8000});
 assert.equal(poster.status(),200);assert.match(poster.headers()['content-type'],/^image\/jpeg(?:;|$)/);
 report.http.poster={status:poster.status(),mime:poster.headers()['content-type']};
 const captions=await context.request.get(base+'/video/wearagain-final-v7.en.vtt',{timeout:8000});
 assert.equal(captions.status(),200);assert.match(captions.headers()['content-type'],/^text\/vtt(?:;|$)/);
 const vtt=await captions.text();assert.match(vtt,/^WEBVTT/);
 const cues=[...vtt.matchAll(/^(\d\d):(\d\d):(\d\d\.\d{3}) --> (\d\d):(\d\d):(\d\d\.\d{3})/gm)];
 assert.ok(cues.length>0,'English VTT has no timed cues');
 for(const cue of cues){
  const start=Number(cue[1])*3600+Number(cue[2])*60+Number(cue[3]),end=Number(cue[4])*3600+Number(cue[5])*60+Number(cue[6]);
  assert.ok(end>start&&end<=duration+.001,'Caption cue is outside the approved film');
 }
 report.http.captions={status:captions.status(),mime:captions.headers()['content-type'],cues:cues.length};
 report.capabilities=await video.evaluate((el,types)=>Object.fromEntries([
  ...Object.entries(types).map(([key,type])=>[key,el.canPlayType(type)]),['container',el.canPlayType('video/mp4')],
  ['userAgent',navigator.userAgent],['queriedTypes',types],
 ]),JURY_MEDIA_TYPES);
 await progress('Jury media: decoder capability / metadata',report);
 // This wait is bounded even when headless Chromium cannot select an H.264
 // source. The independently parsed MP4 metadata above is always required.
 let metadataWaitError=null;
 try{await page.waitForFunction(()=>{const el=document.querySelector('.mkt-walkthrough video');return el&&(el.readyState>=1||el.error);},null,{timeout:8000});}
 catch(error){metadataWaitError=String(error);}
 const snapshot=()=>video.evaluate(el=>({currentSrc:el.currentSrc,readyState:el.readyState,networkState:el.networkState,
  duration:Number.isFinite(el.duration)?el.duration:null,width:el.videoWidth,height:el.videoHeight,
  currentTime:el.currentTime,paused:el.paused,error:el.error?{code:el.error.code,message:el.error.message}:null}));
 report.element=await snapshot();report.metadata.browser={status:report.element.readyState>=1?'loaded':'unavailable',waitError:metadataWaitError};
 report.playback=playbackDisposition(report.capabilities,report.element);
 await progress('Jury media: decoded-source status',report);
 assert.notEqual(report.playback.status,'fail',report.playback.reason);
 if(report.playback.status==='skipped'){
  await progress('Jury media: PLAYBACK SKIPPED (codec unavailable; HTTP/MIME/VTT/container metadata passed)',report);return report;
 }
 assert.equal(metadataWaitError,null,'Supported codec did not load metadata: '+metadataWaitError);
 assert.equal(report.element.duration,manifest.durationSeconds);assert.equal(report.element.width,manifest.width);assert.equal(report.element.height,manifest.height);
 // page.evaluate() does not impose an action timeout on returned promises.
 // Bound play() itself, then fail (never skip) on timeout or a rejection.
 const played=await video.evaluate(async el=>{
  let timer;try{return await Promise.race([
   el.play().then(()=>({status:'playing'}),error=>({status:'rejected',name:error.name,message:error.message})),
   new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'timeout'}),8000);}),
  ]);}finally{clearTimeout(timer);}
 });
 report.playback={...report.playback,...played};await progress('Jury media: play() result',report);
 assert.equal(played.status,'playing','Supported-codec play() failed: '+JSON.stringify(played));
 await page.waitForFunction(()=>document.querySelector('.mkt-walkthrough video')?.currentTime>.5,null,{timeout:8000});
 await video.evaluate(el=>el.pause());assert.equal(await video.evaluate(el=>el.paused),true);
 await video.evaluate(el=>{el.currentTime=35;});
 await page.waitForFunction(()=>{const el=document.querySelector('.mkt-walkthrough video');return el&&!el.seeking&&Math.abs(el.currentTime-35)<.1;},null,{timeout:8000});
 await video.evaluate(el=>{if(el.textTracks[0])el.textTracks[0].mode='hidden';});
 await page.waitForFunction(()=>document.querySelector('.mkt-walkthrough video')?.textTracks[0]?.cues?.length>0,null,{timeout:8000});
 report.element=await snapshot();report.playback.status='passed';
 await progress('Jury media: playback / pause / seek / browser captions passed',report);return report;
}
