import type { Env } from '../db/repository';

function safe(value:unknown){try{return JSON.parse(JSON.stringify(value??{}))}catch{return {}}}

export async function queueSiteSync(env:Env,sessionId:string,entityType:string,entityId:string,operation:string,payload:unknown){
  const id=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO demo_site_sync_outbox(id,session_id,entity_type,entity_id,operation,payload_json,status) VALUES (?,?,?,?,?,?,'waiting_integration')`)
    .bind(id,sessionId,entityType,entityId,operation,JSON.stringify(safe(payload))).run();
  return id;
}

export async function listSiteSyncOutbox(env:Env,sessionId:string,limit=100){
  const rows=await env.DB.prepare(`SELECT id,entity_type,entity_id,operation,payload_json,status,last_error,created_at,updated_at FROM demo_site_sync_outbox WHERE session_id=? ORDER BY created_at DESC LIMIT ?`).bind(sessionId,Math.max(1,Math.min(200,Number(limit)||100))).all<any>();
  return (rows.results??[]).map((r:any)=>({id:r.id,entityType:r.entity_type,entityId:r.entity_id,operation:r.operation,payload:JSON.parse(r.payload_json||'{}'),status:r.status,lastError:r.last_error,createdAt:r.created_at,updatedAt:r.updated_at}));
}
