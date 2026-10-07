// LoveTravel transaction API: provider mutations intentionally disabled while the restored pre-regression UI is validated.
import {
  bokunSelectionFromCanonicalSelection,
} from './bokun-provider.js';
import {
  executeBookingSession,
} from './booking-session-client.js';
import {
  ensureCommerceTransaction,
  ensureSalesSession,
  withSalesSession,
} from './travel-session.js';

const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{
  status,
  headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    ...headers,
  },
});

function view(transaction,resolution=null){
  return {
    transaction,
    revision:transaction.revision,
    state:transaction.state,
    selection:transaction.selection
      ? bokunSelectionFromCanonicalSelection(transaction.selection)
      : null,
    quote:transaction.quote||null,
    draft:transaction.draft||null,
    approval:transaction.approval||null,
    providerBooking:transaction.providerBooking||null,
    requirements:transaction.quote ? {
      requiredFieldCodes:transaction.quote.requiredFieldCodes||[],
      issues:transaction.quote.issues||{errors:[],warnings:[],bookingDataIssues:[]},
      readyToBook:Boolean(transaction.quote.readyToBook),
    } : null,
    ...(resolution?{resolution}:{}),
  };
}

function expectedRevision(body){
  const revision=Number(body?.expectedRevision);
  return Number.isInteger(revision)&&revision>=1?revision:null;
}

export async function handleTravelTransactionApi(request,env,url=new URL(request.url)){
  if(url.pathname!=='/api/travel-commerce/transaction') return null;
  if(!env?.DB||!env?.BOOKING_SESSIONS){
    return json({ok:false,error:'transaction_runtime_unavailable'},503);
  }

  const session=await ensureSalesSession(request,env);
  try{
    let transaction=await ensureCommerceTransaction(env,session.id);

    if(request.method==='GET'){
      const current=await executeBookingSession(env,transaction.transactionId,{action:'GET'});
      return withSalesSession(json({ok:true,...view(current.transaction)}),session);
    }
    if(request.method!=='POST'){
      return withSalesSession(json({ok:false,error:'method_not_allowed'},405,{allow:'GET, POST'}),session);
    }

    const body=await request.clone().json().catch(()=>null);
    if(!body||typeof body!=='object'){
      return withSalesSession(json({ok:false,error:'invalid_json'},400),session);
    }
    const action=String(body.action||'').trim().toUpperCase();
    const revision=expectedRevision(body);
    if(!revision){
      return withSalesSession(json({ok:false,error:'expected_revision_required'},400),session);
    }

    let result;
    if(action==='SYNC_SELECTION'){
      if(!body.selection||typeof body.selection!=='object'||Array.isArray(body.selection)){
        return withSalesSession(json({ok:false,error:'selection_required'},400),session);
      }
      result=await executeBookingSession(env,transaction.transactionId,{
        action:'SYNC_SELECTION',
        expectedRevision:revision,
        selection:body.selection,
      });
      return withSalesSession(json({ok:true,...view(result.transaction,result.resolution)}),session);
    }

    if(action==='APPROVE'){
      const quoteId=String(body.quoteId||'').trim();
      const quoteRevision=Number(body.quoteRevision);
      if(!quoteId||!Number.isInteger(quoteRevision)||quoteRevision<1){
        return withSalesSession(json({ok:false,error:'quote_revision_required'},400),session);
      }
      result=await executeBookingSession(env,transaction.transactionId,{
        action:'COMMAND',
        expectedRevision:revision,
        type:'APPROVE_QUOTE',
        payload:{
          approvalId:`approval-${quoteId}-r${quoteRevision}`.slice(0,150),
          quoteId,
          quoteRevision,
        },
      });
      return withSalesSession(json({ok:true,...view(result.transaction),receipt:result.receipt||null}),session);
    }

    if(action==='RESERVE'||action==='RECONCILE'){
      return withSalesSession(json({
        ok:false,
        error:'booking_mutations_disabled',
        message:'Real Bókun booking mutations are disabled for the LoveTravel client while the interface is being restored.',
      },423),session);
    }

    return withSalesSession(json({ok:false,error:'unsupported_action'},400),session);
  }catch(error){
    const status=Number(error?.status)||(
      error?.code==='stale_revision'
      ||error?.code==='selection_change_not_allowed'
      ||error?.code==='approval_not_allowed'
      ?409:502
    );
    return withSalesSession(json({
      ok:false,
      error:String(error?.code||'transaction_action_failed'),
      message:String(error?.message||'Travel transaction action failed'),
    },status),session);
  }
}
