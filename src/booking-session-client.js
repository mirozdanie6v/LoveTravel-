function namespace(env){
  const binding=env?.BOOKING_SESSIONS;
  if(!binding||typeof binding.idFromName!=='function'||typeof binding.get!=='function'){
    const error=new Error('BOOKING_SESSIONS Durable Object binding is not configured');
    error.code='booking_session_binding_missing';
    throw error;
  }
  return binding;
}

function stubFor(env,transactionId){
  const id=namespace(env).idFromName(String(transactionId));
  return namespace(env).get(id);
}

async function call(stub,path,body){
  const response=await stub.fetch(new Request('https://booking-session.internal'+path,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body),
  }));
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload?.ok){
    const error=new Error(payload?.error?.message||payload?.error?.code||'BookingSession request failed');
    error.code=payload?.error?.code||'booking_session_request_failed';
    error.status=response.status;
    throw error;
  }
  return payload;
}

export async function initializeBookingSession(env,transaction){
  const stub=stubFor(env,transaction.transactionId);
  return call(stub,'/initialize',{transaction});
}

export async function executeBookingSession(env,transactionId,command){
  const stub=stubFor(env,transactionId);
  return call(stub,'/execute',{...command,transactionId});
}
