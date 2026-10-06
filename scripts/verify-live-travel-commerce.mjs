const base=String(process.env.LOVE_TRAVEL_LIVE_BASE_URL||'').replace(/\/$/,'');
const demoToken=String(process.env.LIVE_GATE_DEMO_TOKEN||'').trim();
const allowWrite=String(process.env.LIVE_BOKUN_WRITE||'')==='1';

if(!base) throw new Error('LOVE_TRAVEL_LIVE_BASE_URL is required');
if(!demoToken) throw new Error('LIVE_GATE_DEMO_TOKEN is required');
if(!allowWrite) throw new Error('LIVE_BOKUN_WRITE=1 is required for the real Bókun gate');

let cookie='';

function updateCookie(response){
  const values=typeof response.headers.getSetCookie==='function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const pairs=values.map(value=>String(value).split(';')[0]).filter(Boolean);
  if(pairs.length) cookie=pairs.join('; ');
}

async function request(path,{method='GET',body,headers={}}={}){
  const response=await fetch(base+path,{
    method,
    redirect:'follow',
    headers:{
      accept:'application/json',
      ...(body!==undefined?{'content-type':'application/json'}:{}),
      ...(cookie?{cookie}:{}),
      ...headers,
    },
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
  });
  updateCookie(response);
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.ok){
    const error=new Error(data?.message||data?.error||`HTTP ${response.status} for ${path}`);
    error.status=response.status;
    error.payload=data;
    throw error;
  }
  return data;
}

function enrichSelection(selection){
  const next=structuredClone(selection||{});
  next.customer={
    ...(next.customer||{}),
    firstName:'VIIVERSION',
    lastName:'E2E',
    email:'lovetravel-e2e@viiversion.com',
    phoneNumber:'+84900000000',
  };
  const passengers=[];
  let index=0;
  for(const [categoryId,countRaw] of Object.entries(next.participants||{})){
    const count=Math.max(0,Math.floor(Number(countRaw)||0));
    for(let i=0;i<count;i++){
      index+=1;
      passengers.push({
        categoryId:String(categoryId),
        firstName:index===1?'VIIVERSION':`Guest${index}`,
        lastName:'E2E',
        answers:{},
        extras:{},
      });
    }
  }
  next.passengers=passengers;
  next.answers={...(next.answers||{})};
  next.extras={...(next.extras||{})};
  if(next.pickup?.mode==='PICKUP'&&!next.pickup.roomNumber){
    next.pickup={...next.pickup,roomNumber:'E2E'};
  }
  return next;
}

const ai=await request('/api/ai/chat',{
  method:'POST',
  body:{
    locale:'en',
    message:'Two adults, tomorrow, snorkeling, pickup from Oceanus. We want to book it.',
  },
  headers:{'x-max-tour-locale':'en'},
});

if(ai.agent?.mutationExecuted!==false){
  throw new Error('AI layer must not execute booking mutation directly');
}
if(ai.intent?.dateConstraint?.kind!=='EXACT'||Number(ai.intent?.party?.adults)!==2){
  throw new Error('AI did not produce the expected structured TravelIntent');
}
if(!ai.agent?.selectedOfferId){
  throw new Error('AI did not select a provider-verified offer');
}

let snapshot=ai.transaction;
let selection=ai.bookingSelection;
if(!snapshot||!selection){
  const current=await request('/api/travel-commerce/transaction');
  snapshot=current.transaction;
  selection=selection||current.selection;
}
if(!snapshot||!selection){
  throw new Error('AI-to-BookingTransaction handoff did not produce a transaction selection');
}

const synced=await request('/api/travel-commerce/transaction',{
  method:'POST',
  body:{
    action:'SYNC_SELECTION',
    expectedRevision:Number(snapshot.revision),
    selection:enrichSelection(selection),
  },
});

if(!synced.quote){
  throw new Error('Live gate did not produce a Quote');
}
if(synced.quote.readyToBook!==true||synced.state!=='READY_FOR_APPROVAL'){
  throw new Error('Live Quote is not booking-ready: '+JSON.stringify({
    state:synced.state,
    requirements:synced.requirements,
  }));
}

const approved=await request('/api/travel-commerce/transaction',{
  method:'POST',
  body:{
    action:'APPROVE',
    expectedRevision:Number(synced.revision),
    quoteId:synced.quote.quoteId,
    quoteRevision:Number(synced.quote.revision),
  },
});

if(approved.state!=='USER_APPROVED'){
  throw new Error(`Expected USER_APPROVED, received ${approved.state}`);
}
if(approved.providerBooking){
  throw new Error('Provider booking appeared before reserve');
}

const reserved=await request('/api/travel-commerce/transaction',{
  method:'POST',
  body:{
    action:'RESERVE',
    expectedRevision:Number(approved.revision),
    quoteId:approved.quote.quoteId,
    quoteRevision:Number(approved.quote.revision),
    demoToken,
  },
});

const confirmation=String(
  reserved.providerBooking?.confirmationCode
  ||reserved.providerResult?.confirmationCode
  ||''
);
if(reserved.state!=='CONFIRMED'){
  throw new Error(`Expected CONFIRMED, received ${reserved.state}`);
}
if(!/^NHA-(?:T)?[0-9]+$/.test(confirmation)){
  throw new Error('Bókun did not return a valid NHA confirmation code');
}

console.log(JSON.stringify({
  ok:true,
  gate:'VII-119-live-bokun',
  transactionId:reserved.transaction?.transactionId||reserved.transactionId||'',
  state:reserved.state,
  confirmationCode:confirmation,
  quoteId:reserved.quote?.quoteId||approved.quote?.quoteId||'',
},null,2));
