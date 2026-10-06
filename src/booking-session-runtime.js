import {
  ContractError,
  validateBookingTransaction,
} from './travel-commerce-contracts.js';
import {
  applyProviderOutcome,
  executeTransactionCommand,
  reconcileTransactionConfirmed,
} from './travel-commerce-transaction.js';
import {
  selectionFingerprint,
} from './travel-commerce-quote.js';
import {
  ProviderCapabilityError,
  ProviderUpstreamError,
  bokunProviderRef,
  bokunSelectionFromTransaction,
} from './bokun-provider.js';
import {
  createDeterministicTransactionCommand,
  stableExternalBookingReference,
} from './booking-session-identity.js';

const str=value=>String(value??'').trim();

export class BookingSessionRuntimeError extends Error {
  constructor(code,message,status=409){
    super(message||code);
    this.name='BookingSessionRuntimeError';
    this.code=code;
    this.status=status;
  }
}

function fail(code,message,status=409){
  throw new BookingSessionRuntimeError(code,message,status);
}

function moneyEqual(left,right){
  return Number(left?.amount)===Number(right?.amount)
    && String(left?.currency||'')===String(right?.currency||'');
}

function sameProviderRef(left,right){
  return String(left?.provider||'')===String(right?.provider||'')
    && String(left?.resourceType||'')===String(right?.resourceType||'')
    && String(left?.externalId||'')===String(right?.externalId||'')
    && String(left?.accountRef||'')===String(right?.accountRef||'');
}

function canonicalProviderBooking(raw,now=new Date()){
  const booking=raw?.booking||raw;
  const confirmationCode=str(booking?.confirmationCode);
  if(!/^NHA-(?:T)?[0-9]+$/.test(confirmationCode)){
    fail('provider_confirmation_invalid','Provider did not return a valid Bókun confirmation code',502);
  }
  const status=str(booking?.status).toUpperCase()||'CONFIRMED';
  if(!['RESERVED','CONFIRMED'].includes(status)){
    fail('provider_booking_not_confirmed',`Unexpected provider booking status ${status}`,502);
  }
  return {
    providerRef:bokunProviderRef('BOOKING',confirmationCode),
    confirmationCode,
    status,
    confirmedAt:(now instanceof Date?now:new Date(now)).toISOString(),
  };
}

function classifySubmitFailure(error){
  if(error instanceof ProviderCapabilityError) return 'FAILED';
  if(error instanceof ProviderUpstreamError){
    if([400,401,403,412,423].includes(Number(error.status))) return 'FAILED';
    return 'AMBIGUOUS';
  }
  if(error instanceof BookingSessionRuntimeError && error.status<500) return 'FAILED';
  return 'AMBIGUOUS';
}

async function assertFreshApprovedCommerce(transaction,provider){
  const tx=validateBookingTransaction(transaction);
  if(tx.state!=='USER_APPROVED') fail('transaction_not_approved','Reservation requires USER_APPROVED transaction');
  if(tx.quote?.status!=='ACTIVE'||tx.quote?.readyToBook!==true) fail('quote_not_ready','Current Quote is not active and booking-ready');
  if(!tx.approval||tx.approval.quoteId!==tx.quote.quoteId||tx.approval.quoteRevision!==tx.quote.revision){
    fail('stale_approval','Customer approval does not target the current Quote');
  }

  const selection=bokunSelectionFromTransaction(tx);
  const fingerprint=await selectionFingerprint(selection);
  if(fingerprint!==tx.quote.selectionFingerprint){
    fail('selection_changed','BookingDraft no longer matches the approved Quote');
  }

  const fresh=await provider.resolveOffer({
    selection,
    start:tx.quote.offer.date,
    end:tx.quote.offer.date,
    currency:tx.quote.price.currency,
    includePickupPlaces:true,
  });
  if(!fresh.offer||!fresh.resolution?.readyToBook){
    fail('provider_offer_not_bookable','Bókun no longer considers the approved selection booking-ready');
  }
  if(fresh.offer.offerId!==tx.quote.offerId
    || !sameProviderRef(fresh.offer.providerRef,tx.quote.offer.providerRef)
    || !sameProviderRef(fresh.offer.rateRef,tx.quote.offer.rateRef)
    || !sameProviderRef(fresh.offer.startTimeRef,tx.quote.offer.startTimeRef)
    || fresh.offer.date!==tx.quote.offer.date
    || !moneyEqual(fresh.offer.price,tx.quote.price)
    || fresh.offer.availability.status!=='AVAILABLE'){
    fail('quote_changed','Provider price, availability or commercial identity changed; a new Quote and approval are required');
  }

  return {selection,...fresh};
}

async function prepareProviderReservation(transaction,provider,externalBookingReference){
  const fresh=await assertFreshApprovedCommerce(transaction,provider);
  const checkoutContract=await provider.getCheckoutContract({
    resolution:fresh.resolution,
    externalBookingReference,
    currency:transaction.quote.price.currency,
  });
  const providerDraft=provider.createBookingDraft({
    resolution:fresh.resolution,
    checkoutContract,
    externalBookingReference,
  });
  if(!providerDraft.readyForReserve){
    fail('checkout_not_ready','Bókun checkout requirements are not satisfied');
  }
  return {...fresh,checkoutContract,providerDraft};
}

export function createBookingSessionRuntime({
  store,
  provider,
  now=()=>new Date(),
}={}){
  if(!store) throw new TypeError('Travel Commerce store is required');
  if(!provider) throw new TypeError('Booking provider is required');

  async function current(transactionId){
    return store.requireTransaction(transactionId);
  }

  async function replayFor(command){
    const existing=await store.getReceiptByIdempotencyKey(command.idempotencyKey);
    if(!existing) return null;
    if(existing.commandId!==command.commandId){
      fail('idempotency_key_reused','Idempotency key belongs to another command');
    }
    return {
      transaction:await current(command.transactionId),
      receipt:existing,
      replayed:true,
    };
  }

  async function dispatch({
    transactionId,
    expectedRevision,
    type,
    payload={},
    quote,
    draft,
    providerBooking,
    providerEvidenceRefs=[],
  }={}){
    const command=await createDeterministicTransactionCommand({
      transactionId,
      expectedRevision,
      type,
      payload,
      issuedAt:now(),
    });
    const replay=await replayFor(command);
    if(replay) return replay;

    const before=await current(transactionId);
    const executed=executeTransactionCommand(before,command,{
      quote,draft,providerBooking,providerEvidenceRefs,now:now(),
    });
    if(executed.receipt.status==='REJECTED'){
      const persisted=await store.persistRejectedCommand({
        transaction:before,
        receipt:executed.receipt,
        idempotencyKey:command.idempotencyKey,
      });
      return {...persisted,command,error:executed.error};
    }
    const persisted=await store.commitCommand({
      before,
      after:executed.transaction,
      receipt:executed.receipt,
      idempotencyKey:command.idempotencyKey,
      evidence:[],
      eventType:`${type}_APPLIED`,
    });
    return {...persisted,command};
  }

  async function reconcileCurrent(transaction,{demoToken}={}){
    let tx=validateBookingTransaction(transaction);
    if(tx.state==='RESERVING'){
      const ambiguous=applyProviderOutcome(tx,{status:'AMBIGUOUS',now:now()});
      tx=await store.commitSystemTransition({
        before:tx,
        after:ambiguous,
        eventType:'PROVIDER_RESULT_AMBIGUOUS',
      });
    }
    if(tx.state!=='FAILED_NEEDS_RECONCILIATION'){
      return {transaction:tx,reconciled:tx.state==='CONFIRMED',found:tx.state==='CONFIRMED'};
    }
    const reference=tx.mutation?.externalBookingReference;
    const bookingDate=tx.quote?.offer?.date;
    if(!reference||!bookingDate) fail('reconciliation_identity_missing','Transaction lacks provider reconciliation identity');
    const found=await provider.reconcileBooking({
      externalBookingReference:reference,
      demoToken,
      bookingDate,
    });
    if(!found){
      return {transaction:tx,reconciled:false,found:false};
    }
    const confirmed=reconcileTransactionConfirmed(tx,{
      providerBooking:canonicalProviderBooking(found,now()),
    },{now:now()});
    const persisted=await store.commitSystemTransition({
      before:tx,
      after:confirmed,
      eventType:'PROVIDER_RECONCILED_CONFIRMED',
    });
    return {transaction:persisted,reconciled:true,found:true};
  }

  async function reserve({
    transactionId,
    expectedRevision,
    quoteId,
    quoteRevision,
    demoToken,
  }={}){
    const reference=await stableExternalBookingReference(transactionId);
    const command=await createDeterministicTransactionCommand({
      transactionId,
      expectedRevision,
      type:'RESERVE_BOOKING',
      payload:{quoteId,quoteRevision,externalBookingReference:reference},
      issuedAt:now(),
    });

    const replay=await replayFor(command);
    if(replay){
      if(['RESERVING','FAILED_NEEDS_RECONCILIATION'].includes(replay.transaction.state)){
        const reconciled=await reconcileCurrent(replay.transaction,{demoToken});
        return {...replay,...reconciled};
      }
      return replay;
    }

    const before=await current(transactionId);
    if(before.revision!==expectedRevision){
      const rejected=executeTransactionCommand(before,command,{now:now()});
      const persisted=await store.persistRejectedCommand({
        transaction:before,
        receipt:rejected.receipt,
        idempotencyKey:command.idempotencyKey,
      });
      return {...persisted,command,error:rejected.error};
    }

    let prepared;
    try{
      prepared=await prepareProviderReservation(before,provider,reference);
    }catch(error){
      const rejected=executeTransactionCommand(before,command,{now:now()});
      const receipt={
        ...rejected.receipt,
        errorCode:error?.code||'provider_revalidation_failed',
      };
      const persisted=await store.persistRejectedCommand({
        transaction:before,
        receipt,
        idempotencyKey:command.idempotencyKey,
        eventType:'RESERVE_REVALIDATION_REJECTED',
      });
      return {...persisted,command,error};
    }

    const executed=executeTransactionCommand(before,command,{now:now()});
    if(executed.receipt.status!=='APPLIED'){
      const persisted=await store.persistRejectedCommand({
        transaction:before,
        receipt:executed.receipt,
        idempotencyKey:command.idempotencyKey,
      });
      return {...persisted,command,error:executed.error};
    }

    const admitted=await store.commitCommand({
      before,
      after:executed.transaction,
      receipt:executed.receipt,
      idempotencyKey:command.idempotencyKey,
      eventType:'RESERVE_ADMITTED',
    });
    let reserving=admitted.transaction;

    try{
      const submitted=await provider.submitClientDemoBooking({
        checkoutRequestTemplate:prepared.providerDraft.checkoutRequestTemplate,
        demoToken,
        currency:before.quote.price.currency,
      });
      const confirmed=applyProviderOutcome(reserving,{
        status:'SUCCEEDED',
        providerBooking:canonicalProviderBooking(submitted,now()),
        now:now(),
      });
      const persisted=await store.commitSystemTransition({
        before:reserving,
        after:confirmed,
        eventType:'PROVIDER_RESERVE_CONFIRMED',
      });
      return {
        transaction:persisted,
        receipt:admitted.receipt,
        command,
        replayed:false,
        providerResult:submitted,
      };
    }catch(error){
      const kind=classifySubmitFailure(error);
      const outcome=applyProviderOutcome(reserving,{status:kind,now:now()});
      reserving=await store.commitSystemTransition({
        before:reserving,
        after:outcome,
        eventType:kind==='AMBIGUOUS'?'PROVIDER_RESULT_AMBIGUOUS':'PROVIDER_RESERVE_FAILED',
      });
      if(kind==='AMBIGUOUS'){
        try{
          const reconciled=await reconcileCurrent(reserving,{demoToken});
          return {
            transaction:reconciled.transaction,
            receipt:admitted.receipt,
            command,
            replayed:false,
            reconciliation:reconciled,
            error,
          };
        }catch(reconcileError){
          return {
            transaction:reserving,
            receipt:admitted.receipt,
            command,
            replayed:false,
            error,
            reconciliationError:reconcileError,
          };
        }
      }
      return {
        transaction:reserving,
        receipt:admitted.receipt,
        command,
        replayed:false,
        error,
      };
    }
  }

  async function reconcile({
    transactionId,
    expectedRevision,
    demoToken,
  }={}){
    const tx=await current(transactionId);
    if(tx.revision!==expectedRevision){
      fail('stale_revision',`Expected transaction revision ${tx.revision}, received ${expectedRevision}`);
    }
    return reconcileCurrent(tx,{demoToken});
  }

  return Object.freeze({
    current,
    dispatch,
    reserve,
    reconcile,
  });
}
