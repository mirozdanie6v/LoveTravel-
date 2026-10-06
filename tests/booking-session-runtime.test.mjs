import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_SCHEMA_VERSIONS,
} from '../src/travel-commerce-contracts.js';
import {
  attachTransactionQuote,
  approveTransactionQuote,
  createBookingTransaction,
  selectTransactionOffer,
  setTransactionDraft,
} from '../src/travel-commerce-transaction.js';
import {
  selectionFingerprint,
} from '../src/travel-commerce-quote.js';
import {
  ProviderCapabilityError,
  ProviderUpstreamError,
} from '../src/bokun-provider.js';
import {
  createBookingSessionRuntime,
} from '../src/booking-session-runtime.js';
import {
  createDeterministicTransactionCommand,
  deterministicCommandIdentity,
  stableExternalBookingReference,
} from '../src/booking-session-identity.js';

const at='2026-10-06T12:00:00.000Z';
const tick=n=>new Date(Date.parse(at)+n*1000);
const providerRef=(resourceType,externalId)=>({
  provider:'BOKUN',
  resourceType,
  externalId:String(externalId),
  accountRef:'137689',
});

function canonicalOffer(amount=98){
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Offer,
    offerId:'offer-hon-mun',
    productId:'love-travel-hon-mun',
    providerRef:providerRef('ACTIVITY','1287580'),
    rateRef:providerRef('RATE','201'),
    startTimeRef:providerRef('START_TIME','301'),
    date:'2026-10-07',
    participantMix:[{
      role:'ADULT',
      count:2,
      providerCategoryRef:providerRef('PRICING_CATEGORY','101'),
    }],
    pickup:{mode:'PICKUP',placeRef:providerRef('PICKUP_PLACE','501')},
    dropoff:{mode:'NO_DROPOFF'},
    price:{amount,currency:'USD'},
    availability:{status:'AVAILABLE',remaining:12},
    restrictionCodes:[],
    evidenceRefs:[],
    generatedAt:at,
  };
}

function draft(transactionId){
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.BookingDraft,
    quoteId:`quote-${transactionId}`,
    quoteRevision:1,
    customer:{
      firstName:'Olga',
      lastName:'Test',
      email:'guest@example.com',
      phoneNumber:'+84000000000',
    },
    travellers:[
      {
        participantRole:'ADULT',
        providerCategoryRef:providerRef('PRICING_CATEGORY','101'),
        firstName:'Olga',
        lastName:'Test',
        answers:{},
        extras:[],
      },
      {
        participantRole:'ADULT',
        providerCategoryRef:providerRef('PRICING_CATEGORY','101'),
        firstName:'Dmitry',
        lastName:'Test',
        answers:{},
        extras:[],
      },
    ],
    pickup:{mode:'PICKUP',placeRef:providerRef('PICKUP_PLACE','501')},
    dropoff:{mode:'NO_DROPOFF'},
    answers:{},
    extras:[],
    paymentChoice:'RESERVE_FOR_EXTERNAL_PAYMENT',
    specialRequests:[],
  };
}

function materialSelection(){
  return {
    productId:'1287580',
    date:'2026-10-07',
    rateId:'201',
    startTimeId:'301',
    participants:{'101':2},
    pickup:{mode:'PICKUP',placeId:'501'},
    dropoff:{mode:'NO_DROPOFF'},
    extras:{},
  };
}

async function approvedTransaction(transactionId='txn-runtime'){
  let tx=createBookingTransaction({transactionId,now:tick(0)});
  tx=selectTransactionOffer(tx,'offer-hon-mun',{now:tick(1)});
  const offer=canonicalOffer();
  const quote={
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Quote,
    quoteId:`quote-${transactionId}`,
    transactionId,
    revision:1,
    offerId:offer.offerId,
    offer,
    providerRef:offer.providerRef,
    selectionFingerprint:await selectionFingerprint(materialSelection()),
    price:offer.price,
    availabilityStatus:'AVAILABLE',
    requiredFieldCodes:[],
    providerEvidenceRefs:['evidence-price','evidence-availability'],
    freshness:{policy:'REVALIDATE_BEFORE_MUTATION',ttlMs:120000},
    issues:{errors:[],warnings:[],bookingDataIssues:[]},
    createdAt:at,
    refreshedAt:at,
    expiresAt:'2026-10-06T12:02:00.000Z',
    status:'ACTIVE',
    readyToBook:true,
  };
  tx=attachTransactionQuote(tx,quote,{now:tick(2)});
  tx=setTransactionDraft(tx,draft(transactionId),{now:tick(3)});
  tx=approveTransactionQuote(tx,{
    approvalId:'approval-1',
    quoteId:quote.quoteId,
    quoteRevision:quote.revision,
  },{now:tick(4)});
  return tx;
}

function fakeStore(initial){
  let current=structuredClone(initial);
  const receipts=new Map();
  const audit=[];
  return {
    async requireTransaction(id){
      assert.equal(id,current.transactionId);
      return structuredClone(current);
    },
    async getReceiptByIdempotencyKey(key){
      return receipts.has(key)?structuredClone(receipts.get(key)):null;
    },
    async persistRejectedCommand({transaction,receipt,idempotencyKey,eventType='COMMAND_REJECTED'}){
      assert.equal(transaction.transactionId,current.transactionId);
      receipts.set(idempotencyKey,structuredClone(receipt));
      audit.push(eventType);
      return {transaction:structuredClone(current),receipt:structuredClone(receipt),replayed:false};
    },
    async commitCommand({before,after,receipt,idempotencyKey,eventType}){
      assert.equal(before.revision,current.revision);
      const existing=receipts.get(idempotencyKey);
      if(existing){
        return {transaction:structuredClone(current),receipt:structuredClone(existing),replayed:true};
      }
      current=structuredClone(after);
      receipts.set(idempotencyKey,structuredClone(receipt));
      audit.push(eventType);
      return {transaction:structuredClone(current),receipt:structuredClone(receipt),replayed:false};
    },
    async commitSystemTransition({before,after,eventType}){
      assert.equal(before.revision,current.revision);
      current=structuredClone(after);
      audit.push(eventType);
      return structuredClone(current);
    },
    _current(){return structuredClone(current);},
    _receipts(){return receipts;},
    _audit(){return [...audit];},
  };
}

function fakeProvider({
  freshAmount=98,
  submitResult={
    confirmationCode:'NHA-123456789',
    status:'CONFIRMED',
    externalBookingReference:null,
  },
  submitError=null,
  reconcileResult=null,
}={}){
  let submits=0;
  let reconciles=0;
  let resolves=0;
  let checkouts=0;
  return {
    async resolveOffer({selection}){
      resolves+=1;
      return {
        offer:canonicalOffer(freshAmount),
        resolution:{
          readyToBook:true,
          readyToQuote:true,
          selection:structuredClone(selection),
          quote:{available:true,total:freshAmount,currency:'USD'},
          constraints:{bookingRequirements:{}},
          resolved:{},
          errors:[],
          warnings:[],
          bookingDataIssues:[],
        },
      };
    },
    async getCheckoutContract(){
      checkouts+=1;
      return {options:[]};
    },
    createBookingDraft({externalBookingReference}){
      return {
        readyForReserve:true,
        checkoutRequestTemplate:{
          directBooking:{externalBookingReference},
        },
      };
    },
    async submitClientDemoBooking({checkoutRequestTemplate}){
      submits+=1;
      if(submitError) throw submitError;
      return {
        ...submitResult,
        externalBookingReference:
          submitResult.externalBookingReference
          || checkoutRequestTemplate.directBooking.externalBookingReference,
      };
    },
    async reconcileBooking(){
      reconciles+=1;
      return typeof reconcileResult==='function'
        ? reconcileResult()
        : structuredClone(reconcileResult);
    },
    counts(){return {submits,reconciles,resolves,checkouts};},
  };
}

test('mutation identity is deterministic while external booking reference is stable for the whole transaction',async()=>{
  const first=await deterministicCommandIdentity({
    transactionId:'txn-identity',
    expectedRevision:5,
    type:'RESERVE_BOOKING',
    payload:{quoteId:'q1',quoteRevision:1,externalBookingReference:'UNTRUSTED'},
  });
  const second=await deterministicCommandIdentity({
    transactionId:'txn-identity',
    expectedRevision:5,
    type:'RESERVE_BOOKING',
    payload:{quoteId:'q1',quoteRevision:1,externalBookingReference:'DIFFERENT'},
  });
  assert.equal(first.commandId,second.commandId);
  assert.equal(first.idempotencyKey,second.idempotencyKey);
  assert.equal(first.payload.externalBookingReference,await stableExternalBookingReference('txn-identity'));

  const next=await deterministicCommandIdentity({
    transactionId:'txn-identity',
    expectedRevision:6,
    type:'RESERVE_BOOKING',
    payload:{quoteId:'q1',quoteRevision:1},
  });
  assert.notEqual(next.commandId,first.commandId);
  assert.equal(next.payload.externalBookingReference,first.payload.externalBookingReference);

  const command=await createDeterministicTransactionCommand({
    transactionId:'txn-identity',
    expectedRevision:5,
    type:'RESERVE_BOOKING',
    payload:{quoteId:'q1',quoteRevision:1},
    issuedAt:new Date(at),
  });
  assert.equal(command.idempotencyKey,first.idempotencyKey);
});

test('successful reserve performs exactly one provider submit and confirms the transaction',async()=>{
  const tx=await approvedTransaction('txn-success');
  const store=fakeStore(tx);
  const provider=fakeProvider();
  const runtime=createBookingSessionRuntime({store,provider,now:()=>tick(10)});

  const result=await runtime.reserve({
    transactionId:tx.transactionId,
    expectedRevision:tx.revision,
    quoteId:tx.quote.quoteId,
    quoteRevision:tx.quote.revision,
    demoToken:'demo-token',
  });

  assert.equal(result.transaction.state,'CONFIRMED');
  assert.equal(result.transaction.providerBooking.confirmationCode,'NHA-123456789');
  assert.equal(provider.counts().submits,1);
  assert.equal(provider.counts().resolves,1);
  assert.deepEqual(store._audit(),['RESERVE_ADMITTED','PROVIDER_RESERVE_CONFIRMED']);
});

test('exact reserve replay returns saved receipt/current transaction and never submits twice',async()=>{
  const tx=await approvedTransaction('txn-replay');
  const store=fakeStore(tx);
  const provider=fakeProvider();
  const runtime=createBookingSessionRuntime({store,provider,now:()=>tick(10)});
  const request={
    transactionId:tx.transactionId,
    expectedRevision:tx.revision,
    quoteId:tx.quote.quoteId,
    quoteRevision:tx.quote.revision,
    demoToken:'demo-token',
  };

  const first=await runtime.reserve(request);
  const second=await runtime.reserve(request);

  assert.equal(first.transaction.state,'CONFIRMED');
  assert.equal(second.transaction.state,'CONFIRMED');
  assert.equal(second.replayed,true);
  assert.equal(provider.counts().submits,1);
});

test('stale revision is rejected before provider revalidation or submit',async()=>{
  const tx=await approvedTransaction('txn-stale');
  const store=fakeStore(tx);
  const provider=fakeProvider();
  const runtime=createBookingSessionRuntime({store,provider,now:()=>tick(10)});

  const result=await runtime.reserve({
    transactionId:tx.transactionId,
    expectedRevision:tx.revision-1,
    quoteId:tx.quote.quoteId,
    quoteRevision:tx.quote.revision,
    demoToken:'demo-token',
  });

  assert.equal(result.receipt.status,'REJECTED');
  assert.equal(result.transaction.revision,tx.revision);
  assert.equal(provider.counts().resolves,0);
  assert.equal(provider.counts().submits,0);
});

test('price change after approval is fail-closed with rejected receipt and no mutation',async()=>{
  const tx=await approvedTransaction('txn-price-change');
  const store=fakeStore(tx);
  const provider=fakeProvider({freshAmount:110});
  const runtime=createBookingSessionRuntime({store,provider,now:()=>tick(10)});

  const result=await runtime.reserve({
    transactionId:tx.transactionId,
    expectedRevision:tx.revision,
    quoteId:tx.quote.quoteId,
    quoteRevision:tx.quote.revision,
    demoToken:'demo-token',
  });

  assert.equal(result.receipt.status,'REJECTED');
  assert.equal(result.receipt.errorCode,'quote_changed');
  assert.equal(result.transaction.state,'USER_APPROVED');
  assert.equal(result.transaction.revision,tx.revision);
  assert.equal(provider.counts().submits,0);
  assert.equal(provider.counts().checkouts,0);
});

test('ambiguous provider write reconciles by external reference without a second submit',async()=>{
  const tx=await approvedTransaction('txn-ambiguous-found');
  const store=fakeStore(tx);
  const provider=fakeProvider({
    submitError:new ProviderUpstreamError('provider_timeout','timeout after possible write',502),
    reconcileResult:async()=>({
      confirmationCode:'NHA-987654321',
      externalBookingReference:await stableExternalBookingReference(tx.transactionId),
      status:'CONFIRMED',
    }),
  });
  const runtime=createBookingSessionRuntime({store,provider,now:()=>tick(10)});

  const result=await runtime.reserve({
    transactionId:tx.transactionId,
    expectedRevision:tx.revision,
    quoteId:tx.quote.quoteId,
    quoteRevision:tx.quote.revision,
    demoToken:'demo-token',
  });

  assert.equal(result.transaction.state,'CONFIRMED');
  assert.equal(result.transaction.providerBooking.confirmationCode,'NHA-987654321');
  assert.equal(provider.counts().submits,1);
  assert.equal(provider.counts().reconciles,1);
  assert.ok(store._audit().includes('PROVIDER_RESULT_AMBIGUOUS'));
  assert.ok(store._audit().includes('PROVIDER_RECONCILED_CONFIRMED'));
});

test('ambiguous write with no reconciliation match remains blocked and replay performs lookup only',async()=>{
  const tx=await approvedTransaction('txn-ambiguous-missing');
  const store=fakeStore(tx);
  const provider=fakeProvider({
    submitError:new ProviderUpstreamError('provider_timeout','timeout after possible write',502),
    reconcileResult:null,
  });
  const runtime=createBookingSessionRuntime({store,provider,now:()=>tick(10)});
  const request={
    transactionId:tx.transactionId,
    expectedRevision:tx.revision,
    quoteId:tx.quote.quoteId,
    quoteRevision:tx.quote.revision,
    demoToken:'demo-token',
  };

  const first=await runtime.reserve(request);
  assert.equal(first.transaction.state,'FAILED_NEEDS_RECONCILIATION');
  assert.equal(provider.counts().submits,1);
  assert.equal(provider.counts().reconciles,1);

  const second=await runtime.reserve(request);
  assert.equal(second.transaction.state,'FAILED_NEEDS_RECONCILIATION');
  assert.equal(provider.counts().submits,1);
  assert.equal(provider.counts().reconciles,2);
});

test('known fail-closed provider error returns to USER_APPROVED and same command cannot re-submit',async()=>{
  const tx=await approvedTransaction('txn-known-failure');
  const store=fakeStore(tx);
  const provider=fakeProvider({
    submitError:new ProviderCapabilityError('demo_token_required','bad provider credential'),
  });
  const runtime=createBookingSessionRuntime({store,provider,now:()=>tick(10)});
  const request={
    transactionId:tx.transactionId,
    expectedRevision:tx.revision,
    quoteId:tx.quote.quoteId,
    quoteRevision:tx.quote.revision,
    demoToken:'demo-token',
  };

  const first=await runtime.reserve(request);
  assert.equal(first.transaction.state,'USER_APPROVED');
  assert.equal(first.transaction.mutation.status,'FAILED');
  assert.equal(provider.counts().submits,1);

  const second=await runtime.reserve(request);
  assert.equal(second.replayed,true);
  assert.equal(provider.counts().submits,1);
});

test('explicit reconciliation never calls provider submit',async()=>{
  const tx=await approvedTransaction('txn-explicit-reconcile');
  const store=fakeStore(tx);
  const provider=fakeProvider({
    submitError:new ProviderUpstreamError('timeout','timeout',502),
    reconcileResult:null,
  });
  const runtime=createBookingSessionRuntime({store,provider,now:()=>tick(10)});
  const request={
    transactionId:tx.transactionId,
    expectedRevision:tx.revision,
    quoteId:tx.quote.quoteId,
    quoteRevision:tx.quote.revision,
    demoToken:'demo-token',
  };
  const initial=await runtime.reserve(request);
  const submits=provider.counts().submits;

  const result=await runtime.reconcile({
    transactionId:tx.transactionId,
    expectedRevision:initial.transaction.revision,
    demoToken:'demo-token',
  });
  assert.equal(result.transaction.state,'FAILED_NEEDS_RECONCILIATION');
  assert.equal(provider.counts().submits,submits);
  assert.ok(provider.counts().reconciles>=2);
});
