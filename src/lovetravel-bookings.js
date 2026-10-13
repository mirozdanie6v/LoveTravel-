(() => {
'use strict';
let bookings=[],loaded=false,error=false,inFlight=null;
const request=(...args)=>globalThis.LoveTravelConversation.request(...args);
const change=()=>{globalThis.dispatchEvent(new CustomEvent('lovetravel:bookings-changed'));globalThis.LoveTravelBrand?.schedule?.();};
async function refresh(){
  if(inFlight)return inFlight;
  inFlight=(async()=>{try{
    const response=await request('/api/travel-commerce/bookings',{cache:'no-store'});
    const data=await response.json();if(!response.ok||!data.ok)throw new Error('booking_history_failed');
    bookings=data.bookings;loaded=true;error=false;change();return bookings;
  }catch(_){error=true;change();return bookings;}finally{inFlight=null;}})();
  return inFlight;
}
globalThis.LoveTravelBookings={refresh,snapshot:()=>({bookings,loaded,error})};
async function access(){
  const params=new URLSearchParams(location.hash.slice(1)),invite=params.get('booking-invite');
  if(invite){
    history.replaceState(null,'',location.pathname+location.search);
    const response=await request('/api/travel-commerce/access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({invite})});
    const data=await response.json();
    if(!response.ok||!data.bookingEnabled)globalThis.dispatchEvent(new CustomEvent('lovetravel:booking-access-error'));
  }
}
access().then(refresh).catch(()=>{error=true;change();});
globalThis.addEventListener('lovetravel:transaction-changed',event=>{
  if(['CONFIRMED','RESERVING','FAILED_NEEDS_RECONCILIATION'].includes(event.detail?.transaction?.state))refresh();
});
document.addEventListener('click',event=>{if(event.target.closest?.('[data-nav="trips"],[data-lt-action="trips"]'))refresh();},true);
globalThis.addEventListener('lovetravel:conversation-reset',refresh);
})();
