import {ensureSalesGuest,withSalesSession} from './travel-session.js';
import {conversationError} from './travel-conversation-state.js';
const ready=new WeakMap();
export async function ensureBookingAccessSchema(db){
  if(!ready.has(db))ready.set(db,db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS travel_booking_owners (transaction_id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL)'),
  ]).catch(e=>{ready.delete(db);throw e;}));
  await ready.get(db);
}
export function bookingConfigured(env){
  return env?.CLIENT_BOOKING_ENABLED==='true' && Boolean(env.BOKUN_CLIENT_BOOKING_TOKEN);
}
export async function bookingAccess(env,session){
  // Booking is public; ownership remains bound to the server-issued guest session.
  return bookingConfigured(env) && /^[a-f0-9]{64}$/.test(session?.ownerHash||'');
}
export async function requireBookingAccess(env,session){
  if(!await bookingAccess(env,session))throw conversationError('booking_access_required',403);
}
export async function handleTravelBookingAccessApi(request,env,url=new URL(request.url)){
  if(url.pathname!=='/api/travel-commerce/access')return null;
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  let session;
  try{
    // POST remains a status-only compatibility route for older cached clients.
    if(!['GET','POST'].includes(request.method))return json({ok:false,error:'method_not_allowed'},405);
    session=await ensureSalesGuest(request,env);
    return withSalesSession(json({ok:true,bookingEnabled:await bookingAccess(env,session),paymentMode:'EXTERNAL_PAYMENT'}),session);
  }catch(e){return withSalesSession(json({ok:false,error:e.code||'booking_access_failed'},e.status||502),session);}
}
