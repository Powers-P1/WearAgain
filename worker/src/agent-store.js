import {HttpError,opaque} from './http.js';
const DAY=86400000;
/** Existing SQLite authority; persistent idempotency and quotas precede paid work. */
export class AgentStore{
 constructor(storage){
  this.storage=storage;this.sql=storage.sql;
  storage.transactionSync(()=>{
   this.sql.exec(`CREATE TABLE IF NOT EXISTS agent_sessions(id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL, profile_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, state TEXT NOT NULL, events TEXT NOT NULL, result TEXT, reason TEXT, UNIQUE(owner,request_id))`);
   this.sql.exec('CREATE INDEX IF NOT EXISTS agent_owners ON agent_sessions(owner,created_at)');
   this.sql.exec(`CREATE TABLE IF NOT EXISTS agent_daily(day TEXT PRIMARY KEY, used INTEGER NOT NULL)`);
   this.sql.exec(`CREATE TABLE IF NOT EXISTS agent_assets(owner TEXT NOT NULL, asset_id TEXT NOT NULL, media_type TEXT NOT NULL, image_data TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(owner,asset_id))`);
   this.sql.exec(`CREATE TABLE IF NOT EXISTS agent_render_claims(agent_id TEXT NOT NULL, item_id TEXT NOT NULL, result TEXT, PRIMARY KEY(agent_id,item_id))`);
  });
 }
 start({owner,requestId,requestHash,profileId,now}){
  [owner,requestId,profileId].forEach(opaque);
  return this.storage.transactionSync(()=>{
   const existing=this.sql.exec('SELECT * FROM agent_sessions WHERE owner=? AND request_id=?',owner,requestId).toArray()[0];
   if(existing){if(existing.request_hash!==requestHash)throw new HttpError(409,'agent_request_conflict');return {created:false,row:existing};}
   const day=new Date(now).toISOString().slice(0,10),used=this.sql.exec('SELECT used FROM agent_daily WHERE day=?',day).toArray()[0]?.used??0;
   if(used>=30)throw new HttpError(429,'agent_daily_limit');
   if(this.sql.exec('SELECT COUNT(*) AS count FROM agent_sessions WHERE owner=?',owner).toArray()[0].count>=3)throw new HttpError(429,'agent_token_limit');
   if(this.sql.exec('SELECT 1 FROM agent_sessions WHERE owner=? AND profile_id<>? LIMIT 1',owner,profileId).toArray().length)throw new HttpError(403,'agent_profile_mismatch');
   const id=crypto.randomUUID();this.sql.exec('INSERT INTO agent_daily(day,used) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET used=used+1',day);
   this.sql.exec('INSERT INTO agent_sessions(id,owner,request_id,request_hash,profile_id,created_at,updated_at,state,events) VALUES (?,?,?,?,?,?,?,?,?)',id,owner,requestId,requestHash,profileId,now,now,'running','[]');
   return {created:true,row:this.get(owner,id,now)};
  });
 }
 get(owner,id,now){
  const row=this.sql.exec('SELECT * FROM agent_sessions WHERE owner=? AND id=?',owner,id).toArray()[0];if(!row)throw new HttpError(404,'agent_not_found');
  if(now-row.created_at>=DAY){this.cleanup(now);throw new HttpError(404,'agent_not_found');}
  if(row.state==='running'&&now-row.updated_at>180000){this.sql.exec("UPDATE agent_sessions SET state='incomplete',reason='agent_interrupted_outcome_unknown',updated_at=? WHERE id=?",now,id);return {...row,state:'incomplete',reason:'agent_interrupted_outcome_unknown',updated_at:now};}
  return row;
 }
 public(row){return {id:row.id,profileId:row.profile_id,status:row.state,createdAt:row.created_at,updatedAt:row.updated_at,events:JSON.parse(row.events),result:row.result?JSON.parse(row.result):null,reason:row.reason??null};}
 event(owner,id,event,now){
  this.storage.transactionSync(()=>{const row=this.get(owner,id,now),events=JSON.parse(row.events);if(row.state!=='running'||events.length>=48)return;events.push(event);this.sql.exec('UPDATE agent_sessions SET events=?,updated_at=? WHERE owner=? AND id=?',JSON.stringify(events),now,owner,id);});
 }
 finish(owner,id,result,now){
  this.sql.exec('UPDATE agent_sessions SET state=?,result=?,updated_at=?,reason=NULL WHERE owner=? AND id=? AND state=?',result.status,JSON.stringify(result),now,owner,id,'running');
 }
 fail(owner,id,now){this.sql.exec("UPDATE agent_sessions SET state='incomplete',reason='agent_interrupted_outcome_unknown',updated_at=? WHERE owner=? AND id=? AND state='running'",now,owner,id);}
 putAsset(owner,id,mediaType,data,now){
  this.storage.transactionSync(()=>{this.sql.exec('DELETE FROM agent_assets WHERE created_at<?',now-6*3600000);const existing=this.sql.exec('SELECT image_data FROM agent_assets WHERE owner=? AND asset_id=?',owner,id).toArray()[0];if(existing){if(existing.image_data!==data)throw new HttpError(409,'asset_revision_conflict');return;}
   if(this.sql.exec('SELECT COUNT(*) AS count FROM agent_assets WHERE owner=?',owner).toArray()[0].count>=220)throw new HttpError(429,'agent_photo_limit');
   this.sql.exec('INSERT INTO agent_assets(owner,asset_id,media_type,image_data,created_at) VALUES (?,?,?,?,?)',owner,id,mediaType,data,now);
  });
 }
 asset(owner,id,now){const row=this.sql.exec('SELECT media_type,image_data FROM agent_assets WHERE owner=? AND asset_id=? AND created_at>=?',owner,id,now-6*3600000).toArray()[0];return row?{base64:row.image_data,mediaType:row.media_type}:null;}
 claimRender(owner,id,itemId,now){return this.storage.transactionSync(()=>{
  this.get(owner,id,now);const existing=this.sql.exec('SELECT result FROM agent_render_claims WHERE agent_id=? AND item_id=?',id,itemId).toArray()[0];if(existing)return {created:false,result:existing.result?JSON.parse(existing.result):{status:'UNKNOWN',reason:'Previous render operation is still being reconciled. No resubmission.'}};
  if(this.sql.exec('SELECT COUNT(*) AS count FROM agent_render_claims WHERE agent_id=?',id).toArray()[0].count>=4)throw new HttpError(429,'agent_render_limit');
  this.sql.exec('INSERT INTO agent_render_claims(agent_id,item_id) VALUES (?,?)',id,itemId);return {created:true};
 });}
 recordRender(id,itemId,result){this.sql.exec('UPDATE agent_render_claims SET result=? WHERE agent_id=? AND item_id=?',JSON.stringify(result),id,itemId);}
 nextExpiry(){return Math.min(this.sql.exec('SELECT MIN(created_at+86400000) AS next FROM agent_sessions').toArray()[0]?.next??Infinity,this.sql.exec('SELECT MIN(created_at+21600000) AS next FROM agent_assets').toArray()[0]?.next??Infinity);}
 cleanup(now){this.storage.transactionSync(()=>{this.sql.exec('DELETE FROM agent_render_claims WHERE agent_id IN (SELECT id FROM agent_sessions WHERE created_at<=?)',now-DAY);this.sql.exec('DELETE FROM agent_sessions WHERE created_at<=?',now-DAY);this.sql.exec('DELETE FROM agent_assets WHERE created_at<=?',now-6*3600000);this.sql.exec('DELETE FROM agent_daily WHERE day<?',new Date(now-3*DAY).toISOString().slice(0,10));});}
}
