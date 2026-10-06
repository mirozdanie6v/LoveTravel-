import { createBokunProvider } from './bokun-provider.js';
import { createBookingSessionRuntime } from './booking-session-runtime.js';
import { createTravelCommerceStore } from './travel-commerce-store.js';
import { validateBookingTransaction } from './travel-commerce-contracts.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{
  status,
  headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  },
});

function errorResponse(error){
  const status=Number(error?.status)||(
    error?.code==='stale_revision'||error?.code==='idempotency_key_reused'?409:500
  );
  return json({
    ok:false,
    error:{
      code:String(error?.code||'BOOKING_SESSION_ERROR'),
      message:String(error?.message||'Booking session error'),
    },
  },status);
}

export class BookingSession {
  constructor(state,env){
    this.state=state;
    this.env=env;
    this.tail=Promise.resolve();
  }

  exclusive(operation){
    const result=this.tail.then(operation,operation);
    this.tail=result.then(()=>undefined,()=>undefined);
    return result;
  }

  store(){
    return createTravelCommerceStore(this.env.DB);
  }

  provider(){
    return createBokunProvider({
      fetchImpl:fetch,
      baseUrl:this.env.BOKUN_INTEGRATION_BASE_URL||'https://integration.viiversion.com',
    });
  }

  runtime(){
    return createBookingSessionRuntime({
      store:this.store(),
      provider:this.provider(),
    });
  }

  async boundTransactionId(){
    return String(await this.state.storage.get('transaction-id')||'');
  }

  async requireBound(transactionId){
    const requested=String(transactionId||'').trim();
    const bound=await this.boundTransactionId();
    if(!bound||!requested||bound!==requested){
      const error=new Error('BookingSession Durable Object identity mismatch');
      error.code='transaction_identity_mismatch';
      error.status=409;
      throw error;
    }
    return bound;
  }

  demoToken(){
    const token=String(this.env.LOVE_TRAVEL_CLIENT_DEMO_TOKEN||'').trim();
    if(!token){
      const error=new Error('LoveTravel client demo provider credential is not configured');
      error.code='demo_provider_credential_missing';
      error.status=503;
      throw error;
    }
    return token;
  }

  async initialize(transaction){
    const tx=validateBookingTransaction(transaction);
    const bound=await this.boundTransactionId();
    if(bound&&bound!==tx.transactionId){
      const error=new Error('Durable Object is already bound to another BookingTransaction');
      error.code='transaction_identity_mismatch';
      error.status=409;
      throw error;
    }
    const store=this.store();
    const existing=await store.getTransaction(tx.transactionId);
    if(existing){
      if(!bound) await this.state.storage.put('transaction-id',tx.transactionId);
      await this.state.storage.put('last-known-transaction',existing);
      return {transaction:existing,reused:true};
    }
    await store.createTransaction(tx);
    await this.state.storage.put('transaction-id',tx.transactionId);
    await this.state.storage.put('last-known-transaction',tx);
    return {transaction:tx,reused:false};
  }

  async perform(body){
    const action=String(body?.action||'').trim();
    const transactionId=String(body?.transactionId||'').trim();
    await this.requireBound(transactionId);
    const runtime=this.runtime();

    if(action==='GET'){
      return {transaction:await runtime.current(transactionId)};
    }
    if(action==='COMMAND'){
      const result=await runtime.dispatch({
        transactionId,
        expectedRevision:Number(body?.expectedRevision),
        type:String(body?.type||''),
        payload:body?.payload||{},
        quote:body?.quote,
        draft:body?.draft,
        providerEvidenceRefs:Array.isArray(body?.providerEvidenceRefs)?body.providerEvidenceRefs:[],
      });
      await this.state.storage.put('last-known-transaction',result.transaction);
      return result;
    }
    if(action==='SYNC_SELECTION'){
      const result=await runtime.syncSelection({
        transactionId,
        expectedRevision:Number(body?.expectedRevision),
        selection:body?.selection,
      });
      await this.state.storage.put('last-known-transaction',result.transaction);
      return result;
    }
    if(action==='RESERVE'){
      const result=await runtime.reserve({
        transactionId,
        expectedRevision:Number(body?.expectedRevision),
        quoteId:String(body?.quoteId||''),
        quoteRevision:Number(body?.quoteRevision),
        demoToken:this.demoToken(),
      });
      await this.state.storage.put('last-known-transaction',result.transaction);
      return result;
    }
    if(action==='RECONCILE'){
      const result=await runtime.reconcile({
        transactionId,
        expectedRevision:Number(body?.expectedRevision),
        demoToken:this.demoToken(),
      });
      await this.state.storage.put('last-known-transaction',result.transaction);
      return result;
    }
    const error=new Error('Unsupported BookingSession action');
    error.code='unsupported_booking_session_action';
    error.status=400;
    throw error;
  }

  async fetch(request){
    try{
      const url=new URL(request.url);
      if(request.method==='POST'&&url.pathname==='/initialize'){
        const body=await request.json().catch(()=>null);
        if(!body?.transaction) return json({ok:false,error:{code:'transaction_required'}},400);
        const result=await this.exclusive(()=>this.initialize(body.transaction));
        return json({ok:true,...result});
      }
      if(request.method==='POST'&&url.pathname==='/execute'){
        const body=await request.json().catch(()=>null);
        if(!body) return json({ok:false,error:{code:'invalid_json'}},400);
        const result=await this.exclusive(()=>this.perform(body));
        return json({ok:true,...result});
      }
      return json({ok:false,error:{code:'not_found'}},404);
    }catch(error){
      return errorResponse(error);
    }
  }
}
