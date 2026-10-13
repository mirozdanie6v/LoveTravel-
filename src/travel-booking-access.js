import {ensureSalesGuest,withSalesSession} from './travel-session.js';
import {conversationHash,conversationError} from './travel-conversation-state.js';
const ready=new WeakMap();
export async function ensureBookingAccessSchema(db){
  if(!ready.has(db))ready.set(db,db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS travel_booking_access (owner_hash TEXT PRIMARY KEY, invite_hash TEXT NOT NULL, expires_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS travel_booking_owners (transaction_id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL)'),
  ]).catch(e=>{ready.delete(db);throw e;}));
  await ready.get(db);
}
export function bookingConfigured(env){
  return env?.CLIENT_BOOKING_ENABLED==='true' && Boolean(env.BOKUN_CLIENT_BOOKING_TOKEN)
    && /^[a-f0-9]{64}$/.test(env.CLIENT_BOOKING_INVITE_SHA256||'')
    && Date.parse(env.CLIENT_BOOKING_EXPIRES_AT)>Date.now();
}
export async function bookingAccess(env,session){
  if(!bookingConfigured(env))return false;
  await ensureBookingAccessSchema(env.DB);
  const grant=await env.DB.prepare('SELECT invite_hash,expires_at FROM travel_booking_access WHERE owner_hash=?').bind(session.ownerHash).first();
  return grant?.invite_hash===env.CLIENT_BOOKING_INVITE_SHA256 && Date.parse(grant.expires_at)>Date.now();
}
export async function requireBookingAccess(env,session){
  if(!await bookingAccess(env,session))throw conversationError('booking_access_required',403);
}
export async function handleTravelBookingAccessApi(request,env,url=new URL(request.url)){
  if(url.pathname!=='/api/travel-commerce/access')return null;
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  let session;
  try{
    if(!['GET','POST'].includes(request.method))return json({ok:false,error:'method_not_allowed'},405);
    session=await ensureSalesGuest(request,env);
    if(request.method==='POST'){
      if(!bookingConfigured(env))return withSalesSession(json({ok:false,error:'booking_not_configured'},503),session);
      const body=await request.json().catch(()=>null);
      const token=String(body?.invite||'');
      if(!/^[a-f0-9]{64}$/.test(token)||await conversationHash(token)!==env.CLIENT_BOOKING_INVITE_SHA256)
        return withSalesSession(json({ok:false,error:'invalid_booking_invite'},403),session);
      await ensureBookingAccessSchema(env.DB);
      await env.DB.prepare('INSERT INTO travel_booking_access(owner_hash,invite_hash,expires_at) VALUES(?,?,?) ON CONFLICT(owner_hash) DO UPDATE SET invite_hash=excluded.invite_hash,expires_at=excluded.expires_at')
        .bind(session.ownerHash,env.CLIENT_BOOKING_INVITE_SHA256,env.CLIENT_BOOKING_EXPIRES_AT).run();
    }
    return withSalesSession(json({ok:true,bookingEnabled:await bookingAccess(env,session),paymentMode:'EXTERNAL_PAYMENT'}),session);
  }catch(e){return withSalesSession(json({ok:false,error:e.code||'booking_access_failed'},e.status||502),session);}
}
