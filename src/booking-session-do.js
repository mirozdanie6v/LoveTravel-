import { createBokunProvider } from './bokun-provider.js';
import { createBookingSessionRuntime } from './booking-session-runtime.js';
import { createTravelCommerceStore } from './travel-commerce-store.js';
import { validateBookingTransaction } from './travel-commerce-contracts.js';
import { assertBookingMutationsAllowed } from './booking-mutation-policy.js';
import {createLoveTravelSalesOrchestrator} from './travel-sales-orchestrator.js';
import {handleTravelTransactionApi} from './travel-transaction-api.js';
import {requireOwnedConversation,deleteSavedConversations,conversationError,conversationHash} from './travel-conversation-state.js';

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

  requireDemoToken(value){
    const token=String(value||'').trim();
    if(!token){
      const error=new Error('Validated LoveTravel demo token is required');
      error.code='demo_token_required';
      error.status=403;
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
      await this.state.storage.delete?.('last-known-transaction');
      return {transaction:existing,reused:true};
    }
    await store.createTransaction(tx);
    await this.state.storage.put('transaction-id',tx.transactionId);
    await this.state.storage.delete?.('last-known-transaction');
    return {transaction:tx,reused:false};
  }

  async perform(body){
    const action=String(body?.action||'').trim();
    if(['RESERVE','RECONCILE'].includes(action.toUpperCase())
      ||(action==='COMMAND'&&['RESERVE_BOOKING','RECONCILE_BOOKING'].includes(String(body?.type||'').toUpperCase()))){
      assertBookingMutationsAllowed();
    }
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
      await this.state.storage.delete?.('last-known-transaction');
      return result;
    }
    if(action==='SYNC_SELECTION'){
      const result=await runtime.syncSelection({
        transactionId,
        expectedRevision:Number(body?.expectedRevision),
        selection:body?.selection,
      });
      await this.state.storage.delete?.('last-known-transaction');
      return result;
    }
    if(action==='RESERVE'){
      const result=await runtime.reserve({
        transactionId,
        expectedRevision:Number(body?.expectedRevision),
        quoteId:String(body?.quoteId||''),
        quoteRevision:Number(body?.quoteRevision),
        demoToken:this.requireDemoToken(body?.demoToken),
      });
      await this.state.storage.delete?.('last-known-transaction');
      return result;
    }
    if(action==='RECONCILE'){
      const result=await runtime.reconcile({
        transactionId,
        expectedRevision:Number(body?.expectedRevision),
        demoToken:this.requireDemoToken(body?.demoToken),
      });
      await this.state.storage.delete?.('last-known-transaction');
      return result;
    }
    const error=new Error('Unsupported BookingSession action');
    error.code='unsupported_booking_session_action';
    error.status=400;
    throw error;
  }

  async performConversation(body){
    const ownerHash=String(body?.ownerHash||'');
    if(!/^[a-f0-9]{64}$/.test(ownerHash))throw conversationError('guest_identity_required',400);
    const bound=await this.state.storage.get('guest-owner');
    if(bound&&bound!==ownerHash)throw conversationError('guest_identity_mismatch',403);
    if(!bound)await this.state.storage.put('guest-owner',ownerHash);
    if(['DELETE_SAVED_DATA','DELETE_EXPIRED'].includes(body.action)){
      return deleteSavedConversations(this.env,ownerHash,{expiredOnly:body.action==='DELETE_EXPIRED'});
    }
    const session={id:String(body.sessionId||''),ownerHash};
    await requireOwnedConversation(this.env,session);
    if(body.action==='TURN'){
      const requestId=String(body.requestId||'');
      if(requestId&&!/^[A-Za-z0-9-]{20,80}$/.test(requestId))throw conversationError('invalid_request_id',400);
      const requestHash=requestId?await conversationHash(JSON.stringify({message:body.message,locale:body.locale,context:body.context||{}})):'';
      if(requestId){
        const saved=await this.env.DB.prepare('SELECT request_hash,response_json FROM travel_conversation_requests WHERE session_id=? AND request_id=?').bind(session.id,requestId).first();
        if(saved){
          if(saved.request_hash!==requestHash)throw conversationError('request_id_reused',409);
          const answer=JSON.parse(saved.response_json);
          if(answer.transaction){
            const current=await this.env.DB.prepare('SELECT revision FROM travel_booking_transactions WHERE transaction_id=?').bind(answer.transaction.transactionId).first();
            if(!current||current.revision!==answer.transaction.revision)throw conversationError('request_obsolete',409);
          }
          return answer;
        }
      }
      const orchestrator=createLoveTravelSalesOrchestrator({env:this.env,provider:this.provider()});
      const answer=await orchestrator.turn({...body,sessionId:session.id});
      if(requestId&&!answer.degraded&&!answer.generationFailed)await this.env.DB.prepare(`INSERT INTO travel_conversation_requests(session_id,request_id,request_hash,response_json) VALUES(?,?,?,?)`)
        .bind(session.id,requestId,requestHash,JSON.stringify(answer)).run();
      return answer;
    }
    if(body.action==='TRANSACTION'){
      const request=new Request('https://conversation.internal/api/travel-commerce/transaction',{
        method:body.method,...(body.method==='POST'?{body:JSON.stringify(body.body)}:{}),
      });
      const response=await handleTravelTransactionApi(request,this.env,new URL(request.url),session);
      return {body:await response.json(),status:response.status};
    }
    throw conversationError('unsupported_conversation_action',400);
  }

  async fetch(request){
    try{
      const url=new URL(request.url);
      if(request.method==='POST'&&url.pathname==='/purge'){
        await this.exclusive(()=>this.state.storage.delete?.('last-known-transaction'));
        return json({ok:true});
      }
      if(request.method==='POST'&&url.pathname==='/conversation'){
        const body=await request.json().catch(()=>null);
        if(!body)return json({ok:false,error:{code:'invalid_json'}},400);
        return json({ok:true,...await this.exclusive(()=>this.performConversation(body))});
      }
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
