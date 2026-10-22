import {HttpError} from './http.js';
/** Fixed-length digest comparison; operator access never reuses a normal session token. */
export async function authorizeOperator(request,env){
 if(typeof env.OPERATOR_TOKEN!=='string'||env.OPERATOR_TOKEN.length<24)throw new HttpError(503,'operator_not_configured');
 const value=request.headers.get('Authorization')??'';if(!value.startsWith('Bearer ')||value.length>2048)throw new HttpError(401,'operator_required');
 const encode=new TextEncoder(),[actual,expected]=await Promise.all([crypto.subtle.digest('SHA-256',encode.encode(value.slice(7))),crypto.subtle.digest('SHA-256',encode.encode(env.OPERATOR_TOKEN))]);
 const a=new Uint8Array(actual),b=new Uint8Array(expected);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];if(diff!==0)throw new HttpError(401,'operator_required');
}
