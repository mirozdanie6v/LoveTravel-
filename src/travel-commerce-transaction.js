import {
  BOOKING_TRANSACTION_STATES,
  CONTRACT_SCHEMA_VERSIONS,
  ContractError,
  assertCommandRevision,
  validateBookingDraft,
  validateBookingTransaction,
  validateCommandReceipt,
  validateProviderEvidence,
  validateQuote,
  validateShoppingSession,
  validateTransactionCommand,
  validateTravelIntent,
} from './travel-commerce-contracts.js';

const str=value=>String(value??'').trim();
const unique=values=>[...new Set((Array.isArray(values)?values:[]).map(str).filter(Boolean))];

export const BOOKING_TRANSACTION_TRANSITIONS=Object.freeze({
  SHOPPING:Object.freeze(['OFFER_SELECTED','ABANDONED']),
  OFFER_SELECTED:Object.freeze(['OFFER_SELECTED','QUOTED','COLLECTING_REQUIRED_DATA','ABANDONED']),
  QUOTED:Object.freeze(['OFFER_SELECTED','QUOTED','COLLECTING_REQUIRED_DATA','READY_FOR_APPROVAL','ABANDONED']),
  COLLECTING_REQUIRED_DATA:Object.freeze(['OFFER_SELECTED','QUOTED','COLLECTING_REQUIRED_DATA','READY_FOR_APPROVAL','ABANDONED']),
  READY_FOR_APPROVAL:Object.freeze(['OFFER_SELECTED','QUOTED','COLLECTING_REQUIRED_DATA','READY_FOR_APPROVAL','USER_APPROVED','ABANDONED']),
  USER_APPROVED:Object.freeze(['OFFER_SELECTED','QUOTED','COLLECTING_REQUIRED_DATA','READY_FOR_APPROVAL','RESERVING','ABANDONED']),
  RESERVING:Object.freeze(['CONFIRMED','FAILED_NEEDS_RECONCILIATION','USER_APPROVED']),
  FAILED_NEEDS_RECONCILIATION:Object.freeze(['CONFIRMED']),
  CONFIRMED:Object.freeze([]),
  ABANDONED:Object.freeze([]),
});

function iso(now=new Date()){
  const value=now instanceof Date?now:new Date(now);
  if(Number.isNaN(value.getTime())) throw new TypeError('now must be a valid date');
  return value.toISOString();
}

function contractIssue(contract,code,path,message){
  throw new ContractError(contract,[{code,path,message}]);
}

function assertTransition(from,to){
  if(!BOOKING_TRANSACTION_STATES.includes(from)||!BOOKING_TRANSACTION_STATES.includes(to)){
    contractIssue('BookingTransaction','invalid_transaction_state','state',`Unsupported transition ${from} -> ${to}`);
  }
  if(!BOOKING_TRANSACTION_TRANSITIONS[from].includes(to)){
    contractIssue('BookingTransaction','illegal_state_transition','state',`Transition ${from} -> ${to} is not allowed`);
  }
}

function advance(transaction,nextState,patch={},now=new Date()){
  const current=validateBookingTransaction(transaction);
  assertTransition(current.state,nextState);
  return validateBookingTransaction({
    ...current,
    ...patch,
    state:nextState,
    revision:current.revision+1,
    updatedAt:iso(now),
  });
}

function clearAfterOffer(){
  return {
    quote:undefined,
    draft:undefined,
    approval:undefined,
    mutation:undefined,
    providerBooking:undefined,
  };
}

function clearAfterQuote(){
  return {
    draft:undefined,
    approval:undefined,
    mutation:undefined,
    providerBooking:undefined,
  };
}

function clearAfterDraft(){
  return {
    approval:undefined,
    mutation:undefined,
    providerBooking:undefined,
  };
}

export function createShoppingSession({
  sessionId,
  intent,
  candidateOfferIds=[],
  selectedOfferId,
  status='ACTIVE',
  now=new Date(),
}={}){
  const instant=iso(now);
  return validateShoppingSession({
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.ShoppingSession,
    sessionId:str(sessionId),
    revision:1,
    intent:validateTravelIntent(intent),
    candidateOfferIds:unique(candidateOfferIds),
    ...(selectedOfferId?{selectedOfferId:str(selectedOfferId)}:{}),
    status,
    createdAt:instant,
    updatedAt:instant,
  });
}

function reviseShoppingSession(session,patch,now=new Date()){
  const current=validateShoppingSession(session);
  if(current.status!=='ACTIVE'){
    contractIssue('ShoppingSession','shopping_session_not_active','status','Only ACTIVE ShoppingSession can be revised');
  }
  return validateShoppingSession({
    ...current,
    ...patch,
    revision:current.revision+1,
    updatedAt:iso(now),
  });
}

export function setShoppingIntent(session,intent,{now=new Date()}={}){
  return reviseShoppingSession(session,{intent:validateTravelIntent(intent)},now);
}

export function setShoppingCandidates(session,candidateOfferIds,{now=new Date()}={}){
  const current=validateShoppingSession(session);
  const candidates=unique(candidateOfferIds);
  const selected=current.selectedOfferId&&candidates.includes(current.selectedOfferId)
    ? current.selectedOfferId
    : undefined;
  return reviseShoppingSession(current,{
    candidateOfferIds:candidates,
    selectedOfferId:selected,
  },now);
}

export function selectShoppingOffer(session,offerId,{now=new Date()}={}){
  const current=validateShoppingSession(session);
  const selected=str(offerId);
  if(!current.candidateOfferIds.includes(selected)){
    contractIssue('ShoppingSession','selected_offer_not_candidate','selectedOfferId','Selected offer must be a current ShoppingSession candidate');
  }
  return reviseShoppingSession(current,{selectedOfferId:selected},now);
}

export function closeShoppingSession(session,status,{now=new Date()}={}){
  const current=validateShoppingSession(session);
  if(!['COMPLETED','ABANDONED'].includes(status)){
    contractIssue('ShoppingSession','invalid_session_status','status','ShoppingSession may close only as COMPLETED or ABANDONED');
  }
  if(current.status!=='ACTIVE'){
    contractIssue('ShoppingSession','shopping_session_not_active','status','ShoppingSession is already closed');
  }
  return validateShoppingSession({
    ...current,
    status,
    revision:current.revision+1,
    updatedAt:iso(now),
  });
}

export function createBookingTransaction({
  transactionId,
  shoppingSessionId,
  now=new Date(),
}={}){
  const instant=iso(now);
  return validateBookingTransaction({
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.BookingTransaction,
    transactionId:str(transactionId),
    revision:1,
    ...(shoppingSessionId?{shoppingSessionId:str(shoppingSessionId)}:{}),
    state:'SHOPPING',
    createdAt:instant,
    updatedAt:instant,
  });
}

export function selectTransactionOffer(transaction,offerId,{now=new Date()}={}){
  const current=validateBookingTransaction(transaction);
  if(['RESERVING','FAILED_NEEDS_RECONCILIATION','CONFIRMED','ABANDONED'].includes(current.state)){
    contractIssue('BookingTransaction','offer_change_not_allowed','state',`Offer cannot change from ${current.state}`);
  }
  const selected=str(offerId);
  if(!selected) contractIssue('BookingTransaction','offer_required','selectedOfferId','offerId is required');
  if(current.state==='OFFER_SELECTED'&&current.selectedOfferId===selected) return current;
  return advance(current,'OFFER_SELECTED',{
    selectedOfferId:selected,
    ...clearAfterOffer(),
  },now);
}

export function attachTransactionQuote(transaction,quote,{now=new Date()}={}){
  const current=validateBookingTransaction(transaction);
  if(!current.selectedOfferId){
    contractIssue('BookingTransaction','selected_offer_required','selectedOfferId','Select an offer before attaching a Quote');
  }
  if(['RESERVING','FAILED_NEEDS_RECONCILIATION','CONFIRMED','ABANDONED'].includes(current.state)){
    contractIssue('BookingTransaction','quote_refresh_not_allowed','state',`Quote cannot be replaced from ${current.state}`);
  }
  const nextQuote=validateQuote(quote);
  if(nextQuote.transactionId!==current.transactionId){
    contractIssue('BookingTransaction','quote_transaction_mismatch','quote.transactionId','Quote must belong to this transaction');
  }
  if(nextQuote.offerId!==current.selectedOfferId){
    contractIssue('BookingTransaction','quote_offer_mismatch','quote.offerId','Quote must target the selected offer');
  }
  const nextState=nextQuote.readyToBook?'QUOTED':'COLLECTING_REQUIRED_DATA';
  return advance(current,nextState,{
    quote:nextQuote,
    ...clearAfterQuote(),
  },now);
}

export function setTransactionDraft(transaction,draft,{now=new Date()}={}){
  const current=validateBookingTransaction(transaction);
  if(!current.quote){
    contractIssue('BookingTransaction','quote_required','quote','Quote is required before BookingDraft');
  }
  if(['USER_APPROVED','RESERVING','FAILED_NEEDS_RECONCILIATION','CONFIRMED','ABANDONED'].includes(current.state)){
    contractIssue('BookingTransaction','draft_change_not_allowed','state',`Draft cannot change from ${current.state}`);
  }
  const nextDraft=validateBookingDraft(draft);
  if(nextDraft.quoteId!==current.quote.quoteId||nextDraft.quoteRevision!==current.quote.revision){
    contractIssue('BookingTransaction','draft_quote_mismatch','draft','BookingDraft must target the current Quote revision');
  }
  const nextState=current.quote.readyToBook?'READY_FOR_APPROVAL':'COLLECTING_REQUIRED_DATA';
  return advance(current,nextState,{
    draft:nextDraft,
    ...clearAfterDraft(),
  },now);
}

export function approveTransactionQuote(transaction,{
  approvalId,
  quoteId,
  quoteRevision,
  approvedAt,
}={},{
  now=new Date(),
}={}){
  const current=validateBookingTransaction(transaction);
  if(current.state!=='READY_FOR_APPROVAL'){
    contractIssue('BookingTransaction','approval_not_allowed','state','Only READY_FOR_APPROVAL transaction can be approved');
  }
  if(current.quote?.status!=='ACTIVE'||current.quote?.readyToBook!==true){
    contractIssue('BookingTransaction','quote_not_ready','quote','Current Quote is not approval-ready');
  }
  if(str(quoteId)!==current.quote.quoteId||Number(quoteRevision)!==current.quote.revision){
    contractIssue('BookingTransaction','stale_approval','approval','Approval must target the current Quote revision');
  }
  const approved=approvedAt?iso(approvedAt):iso(now);
  return advance(current,'USER_APPROVED',{
    approval:{
      approvalId:str(approvalId),
      decision:'APPROVE',
      quoteId:current.quote.quoteId,
      quoteRevision:current.quote.revision,
      approvedAt:approved,
    },
  },now);
}

export function beginReservation(transaction,{
  commandId,
  idempotencyKey,
  externalBookingReference,
}={},{
  now=new Date(),
}={}){
  const current=validateBookingTransaction(transaction);
  if(current.state!=='USER_APPROVED'){
    contractIssue('BookingTransaction','reservation_not_allowed','state','Only USER_APPROVED transaction can enter RESERVING');
  }
  const startedAt=iso(now);
  return advance(current,'RESERVING',{
    mutation:{
      commandId:str(commandId),
      idempotencyKey:str(idempotencyKey),
      externalBookingReference:str(externalBookingReference),
      status:'PENDING',
      startedAt,
    },
    providerBooking:undefined,
  },now);
}

export function recordReservationSucceeded(transaction,{
  providerBooking,
  completedAt,
}={},{
  now=new Date(),
}={}){
  const current=validateBookingTransaction(transaction);
  if(current.state!=='RESERVING'||current.mutation?.status!=='PENDING'){
    contractIssue('BookingTransaction','provider_result_not_expected','state','Successful provider result requires RESERVING/PENDING');
  }
  const done=completedAt?iso(completedAt):iso(now);
  return advance(current,'CONFIRMED',{
    mutation:{...current.mutation,status:'SUCCEEDED',completedAt:done},
    providerBooking:structuredClone(providerBooking),
  },now);
}

export function recordReservationAmbiguous(transaction,{completedAt}={},{
  now=new Date(),
}={}){
  const current=validateBookingTransaction(transaction);
  if(current.state!=='RESERVING'||current.mutation?.status!=='PENDING'){
    contractIssue('BookingTransaction','provider_result_not_expected','state','Ambiguous provider result requires RESERVING/PENDING');
  }
  const done=completedAt?iso(completedAt):iso(now);
  return advance(current,'FAILED_NEEDS_RECONCILIATION',{
    mutation:{...current.mutation,status:'AMBIGUOUS',completedAt:done},
    providerBooking:undefined,
  },now);
}

export function recordReservationFailed(transaction,{completedAt}={},{
  now=new Date(),
}={}){
  const current=validateBookingTransaction(transaction);
  if(current.state!=='RESERVING'||current.mutation?.status!=='PENDING'){
    contractIssue('BookingTransaction','provider_result_not_expected','state','Known provider failure requires RESERVING/PENDING');
  }
  const done=completedAt?iso(completedAt):iso(now);
  return advance(current,'USER_APPROVED',{
    mutation:{...current.mutation,status:'FAILED',completedAt:done},
    providerBooking:undefined,
  },now);
}

export function reconcileTransactionConfirmed(transaction,{
  providerBooking,
  completedAt,
}={},{
  now=new Date(),
}={}){
  const current=validateBookingTransaction(transaction);
  if(current.state!=='FAILED_NEEDS_RECONCILIATION'||current.mutation?.status!=='AMBIGUOUS'){
    contractIssue('BookingTransaction','reconciliation_not_expected','state','Reconciliation requires FAILED_NEEDS_RECONCILIATION/AMBIGUOUS');
  }
  const done=completedAt?iso(completedAt):iso(now);
  return advance(current,'CONFIRMED',{
    mutation:{...current.mutation,status:'SUCCEEDED',completedAt:done},
    providerBooking:structuredClone(providerBooking),
  },now);
}

export function abandonTransaction(transaction,{now=new Date()}={}){
  const current=validateBookingTransaction(transaction);
  if(['RESERVING','FAILED_NEEDS_RECONCILIATION','CONFIRMED','ABANDONED'].includes(current.state)){
    contractIssue('BookingTransaction','abandon_not_allowed','state',`Cannot abandon transaction from ${current.state}`);
  }
  return advance(current,'ABANDONED',{},now);
}

function receiptFor(command,before,after,status,{
  providerEvidenceRefs=[],
  providerResultRef,
  errorCode,
  now=new Date(),
}={}){
  return validateCommandReceipt({
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.CommandReceipt,
    commandId:command.commandId,
    transactionId:command.transactionId,
    revisionBefore:before.revision,
    revisionAfter:after?.revision??before.revision,
    status,
    providerEvidenceRefs:unique(providerEvidenceRefs),
    ...(providerResultRef?{providerResultRef:str(providerResultRef)}:{}),
    ...(errorCode?{errorCode:str(errorCode)}:{}),
    createdAt:iso(now),
  });
}

export function executeTransactionCommand(transaction,rawCommand,{
  quote,
  draft,
  providerBooking,
  providerEvidenceRefs=[],
  now=new Date(),
}={}){
  const command=validateTransactionCommand(rawCommand);
  const before=validateBookingTransaction(transaction);
  try{
    assertCommandRevision(command,before);
    let after;
    switch(command.type){
      case 'SELECT_OFFER':
        after=selectTransactionOffer(before,command.payload.offerId,{now});
        break;
      case 'SET_DRAFT':
        after=setTransactionDraft(before,draft||command.payload.draft,{now});
        break;
      case 'REFRESH_QUOTE':
        if(!quote) contractIssue('TransactionCommand','quote_required','quote','REFRESH_QUOTE requires a freshly resolved Quote');
        if(command.payload.quoteId!==quote.quoteId){
          contractIssue('TransactionCommand','quote_identity_mismatch','payload.quoteId','Command quoteId must match refreshed Quote');
        }
        after=attachTransactionQuote(before,quote,{now});
        break;
      case 'APPROVE_QUOTE':
        after=approveTransactionQuote(before,{
          approvalId:command.payload.approvalId,
          quoteId:command.payload.quoteId,
          quoteRevision:command.payload.quoteRevision,
        },{now});
        break;
      case 'RESERVE_BOOKING':
        if(command.payload.quoteId!==before.quote?.quoteId||command.payload.quoteRevision!==before.quote?.revision){
          contractIssue('TransactionCommand','stale_quote','payload.quoteId','Reservation command must target current Quote revision');
        }
        after=beginReservation(before,{
          commandId:command.commandId,
          idempotencyKey:command.idempotencyKey,
          externalBookingReference:command.payload.externalBookingReference,
        },{now});
        break;
      case 'RECONCILE_BOOKING':
        if(command.payload.externalBookingReference!==before.mutation?.externalBookingReference){
          contractIssue('TransactionCommand','external_reference_mismatch','payload.externalBookingReference','Reconciliation reference must match pending mutation');
        }
        if(!providerBooking) contractIssue('TransactionCommand','provider_booking_required','providerBooking','Reconciliation requires verified provider booking');
        after=reconcileTransactionConfirmed(before,{providerBooking},{now});
        break;
      case 'ABANDON_TRANSACTION':
        after=abandonTransaction(before,{now});
        break;
      case 'SET_INTENT':
        contractIssue('TransactionCommand','shopping_command_required','type','SET_INTENT belongs to ShoppingSession, not BookingTransaction');
        break;
      default:
        contractIssue('TransactionCommand','unsupported_command','type',`Unsupported command type ${command.type}`);
    }
    return {
      transaction:after,
      receipt:receiptFor(command,before,after,'APPLIED',{providerEvidenceRefs,now}),
    };
  }catch(error){
    if(!(error instanceof ContractError)) throw error;
    return {
      transaction:before,
      receipt:receiptFor(command,before,before,'REJECTED',{
        providerEvidenceRefs,
        errorCode:error.issues?.[0]?.code||'command_rejected',
        now,
      }),
      error,
    };
  }
}

export function applyProviderOutcome(transaction,{
  status,
  providerBooking,
  now=new Date(),
}={}){
  if(status==='SUCCEEDED') return recordReservationSucceeded(transaction,{providerBooking},{now});
  if(status==='AMBIGUOUS') return recordReservationAmbiguous(transaction,{}, {now});
  if(status==='FAILED') return recordReservationFailed(transaction,{}, {now});
  contractIssue('BookingTransaction','invalid_provider_outcome','status','Provider outcome must be SUCCEEDED, FAILED or AMBIGUOUS');
}

export function assertProviderEvidenceForTransaction(evidence,transaction){
  const valid=validateProviderEvidence(evidence);
  const tx=validateBookingTransaction(transaction);
  if(valid.transactionId&&valid.transactionId!==tx.transactionId){
    contractIssue('ProviderEvidence','transaction_mismatch','transactionId','ProviderEvidence targets another transaction');
  }
  if(valid.quoteId&&tx.quote&&valid.quoteId!==tx.quote.quoteId){
    contractIssue('ProviderEvidence','quote_mismatch','quoteId','ProviderEvidence targets another Quote');
  }
  return valid;
}
