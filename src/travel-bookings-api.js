import {ensureBookingAccessSchema} from './travel-booking-access.js';
import {ensureSalesGuest,withSalesSession} from './travel-session.js';
import {ensureTravelCommerceRuntimeSchema} from './travel-commerce-migration.js';
import {bokunSelectionFromCanonicalSelection} from './bokun-provider.js';
export function bookingProjection(tx){
  return {transactionId:tx.transactionId,state:tx.state,providerBooking:tx.providerBooking||null,
    selection:tx.selection?bokunSelectionFromCanonicalSelection(tx.selection):null,
    price:tx.quote?.price||null,updatedAt:tx.updatedAt};
}
export async function handleTravelBookingsApi(request,env,url=new URL(request.url)){
  if(url.pathname!=='/api/travel-commerce/bookings')return null;
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  let session;
  try{
    if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
    session=await ensureSalesGuest(request,env);
    await ensureTravelCommerceRuntimeSchema(env.DB);
    await ensureBookingAccessSchema(env.DB);
    const rows=await env.DB.prepare(`SELECT tx.snapshot_json FROM travel_booking_transactions tx
      JOIN travel_booking_owners owner ON owner.transaction_id=tx.transaction_id
      WHERE owner.owner_hash=? AND tx.state IN ('CONFIRMED','RESERVING','FAILED_NEEDS_RECONCILIATION')
      ORDER BY tx.updated_at DESC LIMIT 50`).bind(session.ownerHash).all();
    return withSalesSession(json({ok:true,bookings:(rows.results||[]).map(row=>bookingProjection(JSON.parse(row.snapshot_json)))}),session);
  }catch(e){return withSalesSession(json({ok:false,error:e.code||'booking_history_failed'},e.status||502),session);}
}
