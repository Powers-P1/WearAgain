let stream: MediaStream | null = null;
let request = 0;
export function cameraActive(): boolean { return !!stream?.getVideoTracks().some(track=>track.readyState==='live'); }
export async function startCamera(): Promise<boolean> {
  const ticket=++request;
  if(!navigator.mediaDevices?.getUserMedia)return false;
  const next=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1440},height:{ideal:1920}}});
  if(ticket!==request){next.getTracks().forEach(track=>track.stop());return false;}
  stream?.getTracks().forEach(track=>track.stop());stream=next;return true;
}
export function mountCamera(): void {
  const video=document.querySelector<HTMLVideoElement>('#mall-viewfinder');
  if(video&&stream){video.srcObject=stream;void video.play().catch(()=>{});}
}
export function stopCamera(): void {request++;stream?.getTracks().forEach(track=>track.stop());stream=null;}
export async function captureFrame(): Promise<File> {
  const video=document.querySelector<HTMLVideoElement>('#mall-viewfinder');
  if(!video?.videoWidth||!cameraActive())throw Error('camera_unavailable');
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  const context=canvas.getContext('2d');if(!context)throw Error('camera_unavailable');
  context.drawImage(video,0,0);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('camera_unavailable')),'image/jpeg',.92));
  return new File([blob],'garment.jpg',{type:'image/jpeg'});
}
if(typeof window!=='undefined')window.addEventListener('pagehide',stopCamera);
