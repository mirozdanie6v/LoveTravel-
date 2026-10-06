import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_SCHEMA_VERSIONS,
  ContractError,
  validateBookingTransaction,
} from '../src/travel-commerce-contracts.js';
import {
  BOOKING_TRANSACTION_TRANSITIONS,
  abandonTransaction,
  applyProviderOutcome,
  approveTransactionQuote,
  attachTransactionQuote,
  beginReservation,
  closeShoppingSession,
  createBookingTransaction,
  createShoppingSession,
  executeTransactionCommand,
  reconcileTransactionConfirmed,
  recordReservationAmbiguous,
  recordReservationFailed,
  recordReservationSucceeded,
  selectShoppingOffer,
  selectTransactionOffer,
  setShoppingCandidates,
  setShoppingIntent,
  setTransactionDraft,
} from '../src/travel-commerce-transaction.js';

const at='2026-10-06T11:00:00.000Z';
const plus=min=>new Date(Date.parse(at)+min*60000);

const providerRef=(resourceType,externalId)=>({
  provider:'BOKUN',resourceType,externalId:String(externalId),accountRef:'137689',
});

function intent(overrides={}){
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.TravelIntent,
    locale:'en',
    origin:'Nha Trang',
    destination:'Nha Trang islands',
    dateConstraint:{kind:'EXACT',exact:'2026-10-07'},
    party:{adults:2,children:[],infants:0},
    preferences:[{code:'SNORKELING',weight:1}],
    pickupPreference:'PICKUP',
    accessibility:[],
    specialRequests:[],
    freeTextNotes:'',
    ...overrides,
  };
}

function offer(id='offer-1',amount=98){
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Offer,
    offerId:id,
    productId:'love-travel-hon-mun',
    providerRef:providerRef('ACTIVITY','1287580'),
    rateRef:providerRef('RATE','2581224'),
    startTimeRef:providerRef('START_TIME','5782388'),
    date:'2026-10-07',
    participantMix:[{role:'ADULT',count:2,providerCategoryRef:providerRef('PRICING_CATEGORY','1250028')}],
    pickup:{mode:'PICKUP',placeRef:providerRef('PICKUP_PLACE','15137113')},
    dropoff:{mode:'NO_DROPOFF'},
    price:{amount,currency:'USD'},
    availability:{status:'AVAILABLE',remaining:12},
    restrictionCodes:[],
    evidenceRefs:[],
    generatedAt:at,
  };
}

function quote(transactionId='txn-1',id='offer-1',revision=1,readyToBook=true){
  const currentOffer=offer(id);
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Quote,
    quoteId:`quote-${transactionId}`,
    transactionId,
    revision,
    offerId:id,
    offer:currentOffer,
    providerRef:currentOffer.providerRef,
    selectionFingerprint:'a'.repeat(64),
    price:currentOffer.price,
    availabilityStatus:'AVAILABLE',
    requiredFieldCodes:readyToBook?[]:['CUSTOMER_EMAIL'],
    providerEvidenceRefs:['evidence-price','evidence-availability'],
    freshness:{policy:'REVALIDATE_BEFORE_MUTATION',ttlMs:120000},
    issues:{
      errors:[],
      warnings:[],
      bookingDataIssues:readyToBook?[]:[{code:'required',path:'customer.email',message:'Email required'}],
    },
    createdAt:at,
    refreshedAt:at,
    expiresAt:'2026-10-06T11:02:00.000Z',
    status:'ACTIVE',
    readyToBook,
  };
}

function draft(transactionId='txn-1',quoteRevision=1){
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.BookingDraft,
    quoteId:`quote-${transactionId}`,
    quoteRevision,
    customer:{firstName:'Olga',lastName:'Test',email:'guest@example.com',phoneNumber:'+84000000000'},
    travellers:[
      {participantRole:'ADULT',providerCategoryRef:providerRef('PRICING_CATEGORY','1250028'),firstName:'Olga',lastName:'Test',answers:{},extras:[]},
      {participantRole:'ADULT',providerCategoryRef:providerRef('PRICING_CATEGORY','1250028'),firstName:'Dmitry',lastName:'Test',answers:{},extras:[]},
    ],
    pickup:{mode:'PICKUP',placeRef:providerRef('PICKUP_PLACE','15137113')},
    dropoff:{mode:'NO_DROPOFF'},
    answers:{},
    extras:[],
    paymentChoice:'RESERVE_FOR_EXTERNAL_PAYMENT',
    specialRequests:[],
  };
}

function booking(){
  return {
    providerRef:providerRef('BOOKING','NHA-105381046'),
    confirmationCode:'NHA-105381046',
    status:'CONFIRMED',
    confirmedAt:'2026-10-06T11:05:00.000Z',
  };
}

function command(tx,type,payload,overrides={}){
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.TransactionCommand,
    commandId:`cmd-${type.toLowerCase()}-${tx.revision}`,
    transactionId:tx.transactionId,
    expectedRevision:tx.revision,
    idempotencyKey:`${tx.transactionId}:${type}:${tx.revision}`,
    type,
    issuedAt:tx.updatedAt,
    payload,
    ...overrides,
  };
}

test('ShoppingSession is exploratory and independently revisioned',()=>{
  let session=createShoppingSession({
    sessionId:'shopping-1',
    intent:intent({destination:'islands'}),
    candidateOfferIds:[],
    now:new Date(at),
  });
  assert.equal(session.revision,1);
  assert.equal(session.status,'ACTIVE');

  session=setShoppingIntent(session,intent({destination:'Hòn Mun'}),{now:plus(1)});
  assert.equal(session.revision,2);
  assert.equal(session.intent.destination,'Hòn Mun');

  session=setShoppingCandidates(session,['offer-1','offer-2','offer-2'],{now:plus(2)});
  assert.deepEqual(session.candidateOfferIds,['offer-1','offer-2']);

  session=selectShoppingOffer(session,'offer-2',{now:plus(3)});
  assert.equal(session.selectedOfferId,'offer-2');

  const narrowed=setShoppingCandidates(session,['offer-1'],{now:plus(4)});
  assert.equal(narrowed.selectedOfferId,undefined);

  const completed=closeShoppingSession(narrowed,'COMPLETED',{now:plus(5)});
  assert.equal(completed.status,'COMPLETED');
  assert.throws(
    ()=>setShoppingIntent(completed,intent(),{now:plus(6)}),
    error=>error instanceof ContractError&&error.issues.some(item=>item.code==='shopping_session_not_active'),
  );
});

test('BookingTransaction follows the authoritative happy-path state machine',()=>{
  let tx=createBookingTransaction({transactionId:'txn-1',shoppingSessionId:'shopping-1',now:new Date(at)});
  assert.equal(tx.state,'SHOPPING');
  assert.equal(tx.revision,1);

  tx=selectTransactionOffer(tx,'offer-1',{now:plus(1)});
  assert.equal(tx.state,'OFFER_SELECTED');

  tx=attachTransactionQuote(tx,quote('txn-1'),{now:plus(2)});
  assert.equal(tx.state,'QUOTED');

  tx=setTransactionDraft(tx,draft('txn-1'),{now:plus(3)});
  assert.equal(tx.state,'READY_FOR_APPROVAL');

  tx=approveTransactionQuote(tx,{
    approvalId:'approval-1',
    quoteId:tx.quote.quoteId,
    quoteRevision:tx.quote.revision,
  },{now:plus(4)});
  assert.equal(tx.state,'USER_APPROVED');

  tx=beginReservation(tx,{
    commandId:'cmd-reserve',
    idempotencyKey:'txn-1:reserve:1',
    externalBookingReference:'LT-TXN-1',
  },{now:plus(5)});
  assert.equal(tx.state,'RESERVING');
  assert.equal(tx.mutation.status,'PENDING');

  tx=recordReservationSucceeded(tx,{providerBooking:booking()},{now:plus(6)});
  assert.equal(tx.state,'CONFIRMED');
  assert.equal(tx.mutation.status,'SUCCEEDED');
  assert.equal(tx.providerBooking.confirmationCode,'NHA-105381046');
  assert.equal(tx.revision,7);
  assert.doesNotThrow(()=>validateBookingTransaction(tx));
});

test('incomplete Quote routes transaction into COLLECTING_REQUIRED_DATA',()=>{
  let tx=createBookingTransaction({transactionId:'txn-incomplete',now:new Date(at)});
  tx=selectTransactionOffer(tx,'offer-1',{now:plus(1)});
  tx=attachTransactionQuote(tx,quote('txn-incomplete','offer-1',1,false),{now:plus(2)});
  assert.equal(tx.state,'COLLECTING_REQUIRED_DATA');
  assert.equal(tx.quote.readyToBook,false);
  assert.throws(
    ()=>approveTransactionQuote(tx,{
      approvalId:'approval-x',quoteId:tx.quote.quoteId,quoteRevision:tx.quote.revision,
    },{now:plus(3)}),
    error=>error instanceof ContractError&&error.issues.some(item=>item.code==='approval_not_allowed'),
  );
});

test('changing selected offer invalidates Quote, Draft, approval and mutation chain',()=>{
  let tx=createBookingTransaction({transactionId:'txn-reset',now:new Date(at)});
  tx=selectTransactionOffer(tx,'offer-1',{now:plus(1)});
  tx=attachTransactionQuote(tx,quote('txn-reset'),{now:plus(2)});
  tx=setTransactionDraft(tx,draft('txn-reset'),{now:plus(3)});
  tx=approveTransactionQuote(tx,{
    approvalId:'approval-reset',quoteId:tx.quote.quoteId,quoteRevision:tx.quote.revision,
  },{now:plus(4)});

  tx=selectTransactionOffer(tx,'offer-2',{now:plus(5)});
  assert.equal(tx.state,'OFFER_SELECTED');
  assert.equal(tx.selectedOfferId,'offer-2');
  assert.equal(tx.quote,undefined);
  assert.equal(tx.draft,undefined);
  assert.equal(tx.approval,undefined);
  assert.equal(tx.mutation,undefined);
  assert.equal(tx.providerBooking,undefined);
});

test('ambiguous provider result enters reconciliation and only verified booking can confirm it',()=>{
  let tx=createBookingTransaction({transactionId:'txn-amb',now:new Date(at)});
  tx=selectTransactionOffer(tx,'offer-1',{now:plus(1)});
  tx=attachTransactionQuote(tx,quote('txn-amb'),{now:plus(2)});
  tx=setTransactionDraft(tx,draft('txn-amb'),{now:plus(3)});
  tx=approveTransactionQuote(tx,{
    approvalId:'approval-amb',quoteId:tx.quote.quoteId,quoteRevision:tx.quote.revision,
  },{now:plus(4)});
  tx=beginReservation(tx,{
    commandId:'cmd-amb',idempotencyKey:'txn-amb:reserve',externalBookingReference:'LT-AMB',
  },{now:plus(5)});

  tx=recordReservationAmbiguous(tx,{}, {now:plus(6)});
  assert.equal(tx.state,'FAILED_NEEDS_RECONCILIATION');
  assert.equal(tx.mutation.status,'AMBIGUOUS');

  tx=reconcileTransactionConfirmed(tx,{providerBooking:booking()},{now:plus(7)});
  assert.equal(tx.state,'CONFIRMED');
  assert.equal(tx.mutation.status,'SUCCEEDED');
});

test('known provider failure returns to USER_APPROVED and allows an explicit retry',()=>{
  let tx=createBookingTransaction({transactionId:'txn-fail',now:new Date(at)});
  tx=selectTransactionOffer(tx,'offer-1',{now:plus(1)});
  tx=attachTransactionQuote(tx,quote('txn-fail'),{now:plus(2)});
  tx=setTransactionDraft(tx,draft('txn-fail'),{now:plus(3)});
  tx=approveTransactionQuote(tx,{
    approvalId:'approval-fail',quoteId:tx.quote.quoteId,quoteRevision:tx.quote.revision,
  },{now:plus(4)});
  tx=beginReservation(tx,{
    commandId:'cmd-fail-1',idempotencyKey:'txn-fail:reserve:1',externalBookingReference:'LT-FAIL-1',
  },{now:plus(5)});

  tx=recordReservationFailed(tx,{}, {now:plus(6)});
  assert.equal(tx.state,'USER_APPROVED');
  assert.equal(tx.mutation.status,'FAILED');

  tx=beginReservation(tx,{
    commandId:'cmd-fail-2',idempotencyKey:'txn-fail:reserve:2',externalBookingReference:'LT-FAIL-2',
  },{now:plus(7)});
  assert.equal(tx.state,'RESERVING');
  assert.equal(tx.mutation.commandId,'cmd-fail-2');
});

test('stale TransactionCommand is rejected without changing transaction revision',()=>{
  let tx=createBookingTransaction({transactionId:'txn-command',now:new Date(at)});
  tx=selectTransactionOffer(tx,'offer-1',{now:plus(1)});
  const stale=command(tx,'REFRESH_QUOTE',{quoteId:'quote-txn-command'},{expectedRevision:1});
  const result=executeTransactionCommand(tx,stale,{
    quote:quote('txn-command'),
    now:plus(2),
  });
  assert.equal(result.transaction.revision,tx.revision);
  assert.equal(result.receipt.status,'REJECTED');
  assert.equal(result.receipt.revisionBefore,tx.revision);
  assert.equal(result.receipt.revisionAfter,tx.revision);
  assert.equal(result.receipt.errorCode,'stale_revision');
});

test('command-driven flow advances exactly one revision per accepted command',()=>{
  let tx=createBookingTransaction({transactionId:'txn-cmd-flow',now:new Date(at)});

  let result=executeTransactionCommand(
    tx,
    command(tx,'SELECT_OFFER',{offerId:'offer-1'}),
    {now:plus(1)},
  );
  assert.equal(result.receipt.status,'APPLIED');
  assert.equal(result.receipt.revisionAfter,result.receipt.revisionBefore+1);
  tx=result.transaction;

  result=executeTransactionCommand(
    tx,
    command(tx,'REFRESH_QUOTE',{quoteId:'quote-txn-cmd-flow'}),
    {quote:quote('txn-cmd-flow'),providerEvidenceRefs:['evidence-price'],now:plus(2)},
  );
  assert.equal(result.transaction.state,'QUOTED');
  assert.deepEqual(result.receipt.providerEvidenceRefs,['evidence-price']);
  tx=result.transaction;

  result=executeTransactionCommand(
    tx,
    command(tx,'SET_DRAFT',{draft:draft('txn-cmd-flow')}),
    {now:plus(3)},
  );
  assert.equal(result.transaction.state,'READY_FOR_APPROVAL');
  tx=result.transaction;

  result=executeTransactionCommand(
    tx,
    command(tx,'APPROVE_QUOTE',{
      approvalId:'approval-cmd',
      quoteId:tx.quote.quoteId,
      quoteRevision:tx.quote.revision,
    }),
    {now:plus(4)},
  );
  assert.equal(result.transaction.state,'USER_APPROVED');
  tx=result.transaction;

  const reserveCommand=command(tx,'RESERVE_BOOKING',{
    quoteId:tx.quote.quoteId,
    quoteRevision:tx.quote.revision,
    externalBookingReference:'LT-CMD',
  });
  result=executeTransactionCommand(
    tx,
    reserveCommand,
    {now:plus(5)},
  );
  assert.equal(result.transaction.state,'RESERVING');
  assert.equal(result.transaction.mutation.idempotencyKey,reserveCommand.idempotencyKey);
});

test('provider outcome API is system-only and preserves state invariants',()=>{
  let tx=createBookingTransaction({transactionId:'txn-system',now:new Date(at)});
  tx=selectTransactionOffer(tx,'offer-1',{now:plus(1)});
  tx=attachTransactionQuote(tx,quote('txn-system'),{now:plus(2)});
  tx=setTransactionDraft(tx,draft('txn-system'),{now:plus(3)});
  tx=approveTransactionQuote(tx,{
    approvalId:'approval-system',quoteId:tx.quote.quoteId,quoteRevision:tx.quote.revision,
  },{now:plus(4)});
  tx=beginReservation(tx,{
    commandId:'cmd-system',idempotencyKey:'key-system',externalBookingReference:'LT-SYSTEM',
  },{now:plus(5)});

  const ambiguous=applyProviderOutcome(tx,{status:'AMBIGUOUS',now:plus(6)});
  assert.equal(ambiguous.state,'FAILED_NEEDS_RECONCILIATION');

  assert.throws(
    ()=>applyProviderOutcome(tx,{status:'UNKNOWN',now:plus(6)}),
    error=>error instanceof ContractError&&error.issues.some(item=>item.code==='invalid_provider_outcome'),
  );
});

test('terminal and mutation-in-flight states cannot be abandoned or arbitrarily rewound',()=>{
  assert.deepEqual(BOOKING_TRANSACTION_TRANSITIONS.CONFIRMED,[]);
  assert.deepEqual(BOOKING_TRANSACTION_TRANSITIONS.ABANDONED,[]);

  let shopping=createBookingTransaction({transactionId:'txn-abandon',now:new Date(at)});
  shopping=abandonTransaction(shopping,{now:plus(1)});
  assert.equal(shopping.state,'ABANDONED');
  assert.throws(
    ()=>selectTransactionOffer(shopping,'offer-1',{now:plus(2)}),
    error=>error instanceof ContractError,
  );
});
