// No environment, token, or client override: enabling provider writes requires
// an explicit code change and a separately authorized release.
export function assertBookingMutationsAllowed(){
  const error=new Error('Real Bókun booking mutations are disabled while the LoveTravel interface is being restored.');
  error.code='booking_mutations_disabled';
  error.status=423;
  throw error;
}

export function bookingMutationBlockedResponse(){
  return new Response(JSON.stringify({
    ok:false,error:'booking_mutations_disabled',
    message:'Real Bókun booking mutations are disabled while the LoveTravel interface is being restored.',
  }),{
    status:423,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},
  });
}

export function handleBlockedBookingRoute(request,url=new URL(request.url)){
  if(!['POST','PUT','PATCH','DELETE'].includes(request.method)) return null;
  if((url.pathname==='/api/bookings'&&request.method==='POST')
    ||(url.pathname.startsWith('/api/bokun/')&&url.pathname!=='/api/bokun/booking-selection/resolve')
    ||url.pathname.startsWith('/internal/lovetravel/bokun/')){
    return bookingMutationBlockedResponse();
  }
  return null;
}
