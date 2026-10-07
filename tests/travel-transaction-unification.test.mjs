import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_SCHEMA_VERSIONS,
  ContractError,
  validateBookingSelectionSnapshot,
  validateBookingTransaction,
} from '../src/travel-commerce-contracts.js';
import {
  bokunProviderRef,
  bokunSelectionFromCanonicalSelection,
  canonicalBookingDraftFromSelection,
  canonicalBookingSelectionFromBokun,
} from '../src/bokun-provider.js';
import {
  approveTransactionQuote,
  createBookingTransaction,
  syncTransactionSelectionState,
} from '../src/travel-commerce-transaction.js';
import {
  createBookingSessionRuntime,
} from '../src/booking-session-runtime.js';
import {
  shoppingSessionIdForSalesSession,
  transactionIdForSalesSession,
} from '../src/travel-session.js';

const at='2026-10-06T13:00:00.000Z';
const later=seconds=>new Date(Date.parse(at)+seconds*1000);

const domain={
  provider:{vendorId:'137689',productId:'1287580'},
  experience:{id:'1287580'},
  participants:[
    {id:101,ticketCategory:'ADULT',minAge:10,maxAge:99},
    {id:102,ticketCategory:'CHILD',minAge:5,maxAge:9},
  ],
};

function rawSelection(overrides={}){
  return {
    productId:'1287580',
    date:'2026-10-07',
    slotId:'slot-301',
    startTimeId:'301',
    rateId:'201',
    participants:{101:2,102:1},
    pickup:{
      mode:'PICKUP',
      placeId:'501',
      roomNumber:'804',
      answers:{pickupNote:'Lobby'},
    },
    dropoff:{mode:'NO_DROPOFF'},
    customer:{
      firstName:'Olga',
      lastName:'Test',
      email:'guest@example.com',
      phoneNumber:'+84000000000',
    },
    answers:{bookingQuestion:'yes'},
    extras:{701:{quantity:1,answers:{size:'M'}}},
    passengers:[
      {categoryId:'101',firstName:'Olga',lastName:'Test',answers:{passport:'A'},extras:{}},
      {categoryId:'101',firstName:'Dmitry',lastName:'Test',answers:{passport:'B'},extras:{}},
      {categoryId:'102',firstName:'Child',lastName:'Test',answers:{},extras:{702:{quantity:1}}},
    ],
    ...overrides,
  };
}

function offer(amount=133){
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Offer,
    offerId:'offer-hon-mun',
    productId:'love-travel-hon-mun',
    providerRef:bokunProviderRef('ACTIVITY','1287580'),
    rateRef:bokunProviderRef('RATE','201'),
    startTimeRef:bokunProviderRef('START_TIME','301'),
    date:'2026-10-07',
    participantMix:[
      {role:'ADULT',count:2,providerCategoryRef:bokunProviderRef('PRICING_CATEGORY','101')},
      {role:'CHILD',count:1,providerCategoryRef:bokunProviderRef('PRICING_CATEGORY','102')},
    ],
    pickup:{mode:'PICKUP',placeRef:bokunProviderRef('PICKUP_PLACE','501')},
    dropoff:{mode:'NO_DROPOFF'},
    price:{amount,currency:'USD'},
    availability:{status:'AVAILABLE',remaining:12},
    restrictionCodes:[],
    evidenceRefs:[],
    generatedAt:at,
  };
}

function quote(transactionId='txn-unified',revision=1,amount=133){
  const o=offer(amount);
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Quote,
    quoteId:`quote-${transactionId}`,
    transactionId,
    revision,
    offerId:o.offerId,
    offer:o,
    providerRef:o.providerRef,
    selectionFingerprint:'a'.repeat(64),
    price:o.price,
    availabilityStatus:'AVAILABLE',
    requiredFieldCodes:[],
    providerEvidenceRefs:['evidence-price','evidence-availability'],
    freshness:{policy:'REVALIDATE_BEFORE_MUTATION',ttlMs:120000},
    issues:{errors:[],warnings:[],bookingDataIssues:[]},
    createdAt:at,
    refreshedAt:at,
    expiresAt:'2026-10-06T13:02:00.000Z',
    status:'ACTIVE',
    readyToBook:true,
  };
}

test('canonical selection round-trips every booking-critical Bókun field',()=>{
  const canonical=canonicalBookingSelectionFromBokun(domain,rawSelection());
  assert.doesNotThrow(()=>validateBookingSelectionSnapshot(canonical));
  assert.equal(canonical.productRef.externalId,'1287580');
  assert.equal(canonical.rateRef.externalId,'201');
  assert.equal(canonical.startTimeRef.externalId,'301');
  assert.equal(canonical.slotRef.externalId,'slot-301');
  assert.equal(canonical.pickup.placeRef.externalId,'501');
  assert.equal(canonical.pickupRoomNumber,'804');
  assert.equal(canonical.pickupAnswers.pickupNote,'Lobby');
  assert.equal(canonical.participants.find(item=>item.role==='ADULT').count,2);
  assert.equal(canonical.travellers.length,3);

  const restored=bokunSelectionFromCanonicalSelection(canonical);
  assert.equal(restored.productId,'1287580');
  assert.equal(restored.date,'2026-10-07');
  assert.equal(restored.rateId,'201');
  assert.equal(restored.startTimeId,'301');
  assert.equal(restored.slotId,'slot-301');
  assert.deepEqual(restored.participants,{'101':2,'102':1});
  assert.equal(restored.pickup.placeId,'501');
  assert.equal(restored.pickup.roomNumber,'804');
  assert.equal(restored.pickup.answers.pickupNote,'Lobby');
  assert.equal(restored.customer.email,'guest@example.com');
  assert.equal(restored.answers.bookingQuestion,'yes');
  assert.equal(restored.extras['701'],1);
  assert.equal(restored.extraAnswers['701'].size,'M');
  assert.equal(restored.passengers[2].extras['702'].quantity,1);
});

test('canonical BookingDraft is derived from the same transaction selection and exact Quote revision',()=>{
  const canonical=canonicalBookingSelectionFromBokun(domain,rawSelection());
  const q=quote();
  const draft=canonicalBookingDraftFromSelection(canonical,q);
  assert.equal(draft.quoteId,q.quoteId);
  assert.equal(draft.quoteRevision,q.revision);
  assert.equal(draft.customer.email,'guest@example.com');
  assert.equal(draft.travellers.length,3);
  assert.equal(draft.pickup.placeRef.externalId,'501');
  assert.equal(draft.answers.bookingQuestion,'yes');
});

test('numeric booking extras and their question answers survive canonical/UI round-trip',()=>{
  const raw=rawSelection({extras:{701:2},extraAnswers:{701:{size:'M'}}});
  const canonical=canonicalBookingSelectionFromBokun(domain,raw);
  const restored=bokunSelectionFromCanonicalSelection(canonical);
  assert.equal(restored.extras['701'],2);
  assert.equal(restored.extraAnswers['701'].size,'M');
});

test('selection synchronization invalidates prior customer approval and advances one transaction revision',()=>{
  const canonical=canonicalBookingSelectionFromBokun(domain,rawSelection());
  let tx=createBookingTransaction({transactionId:'txn-unified',shoppingSessionId:'shopping-1',now:new Date(at)});
  tx=syncTransactionSelectionState(tx,{
    selection:canonical,
    selectedOfferId:'offer-hon-mun',
    quote:quote('txn-unified'),
    draft:canonicalBookingDraftFromSelection(canonical,quote('txn-unified')),
  },{now:later(1)});
  assert.equal(tx.state,'READY_FOR_APPROVAL');
  assert.equal(tx.revision,2);

  tx=approveTransactionQuote(tx,{
    approvalId:'approval-1',
    quoteId:tx.quote.quoteId,
    quoteRevision:tx.quote.revision,
  },{now:later(2)});
  assert.equal(tx.state,'USER_APPROVED');
  const approvedRevision=tx.revision;

  const changed=canonicalBookingSelectionFromBokun(domain,rawSelection({
    customer:{...rawSelection().customer,phoneNumber:'+84111111111'},
  }));
  const refreshed=quote('txn-unified',2);
  const next=syncTransactionSelectionState(tx,{
    selection:changed,
    selectedOfferId:'offer-hon-mun',
    quote:refreshed,
    draft:canonicalBookingDraftFromSelection(changed,refreshed),
  },{now:later(3)});

  assert.equal(next.revision,approvedRevision+1);
  assert.equal(next.state,'READY_FOR_APPROVAL');
  assert.equal(next.approval,undefined);
  assert.equal(next.selection.customer.phoneNumber,'+84111111111');
});

test('transaction validation rejects selection that disagrees with its Quote commercial identity',()=>{
  const canonical=canonicalBookingSelectionFromBokun(domain,rawSelection());
  const q=quote();
  const draft=canonicalBookingDraftFromSelection(canonical,q);
  const tx={
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.BookingTransaction,
    transactionId:'txn-unified',
    revision:2,
    state:'READY_FOR_APPROVAL',
    selection:{...canonical,date:'2026-10-08'},
    selectedOfferId:'offer-hon-mun',
    quote:q,
    draft,
    createdAt:at,
    updatedAt:at,
  };
  assert.throws(
    ()=>validateBookingTransaction(tx),
    error=>error instanceof ContractError&&error.issues.some(item=>item.code==='selection_date_mismatch'),
  );
});

test('sales session deterministically maps to one ShoppingSession and one BookingTransaction',()=>{
  const sid='sales-session-12345678901234567890';
  assert.equal(shoppingSessionIdForSalesSession(sid),'shopping-'+sid);
  assert.equal(transactionIdForSalesSession(sid),'txn-'+sid);
  assert.equal(transactionIdForSalesSession(sid),transactionIdForSalesSession(sid));
});

test('BookingSession syncSelection persists canonical selection and resolver-backed Quote in one serialized revision',async()=>{
  const initial=createBookingTransaction({transactionId:'txn-runtime-sync',shoppingSessionId:'shopping-x',now:new Date(at)});
  let current=structuredClone(initial);
  const audit=[];
  const store={
    async requireTransaction(){return structuredClone(current);},
    async commitSystemTransition({before,after,evidence,eventType}){
      assert.equal(before.revision,current.revision);
      current=structuredClone(after);
      audit.push({eventType,evidenceCount:evidence?.length||0});
      return structuredClone(current);
    },
    async getReceiptByIdempotencyKey(){return null;},
  };
  const raw=rawSelection();
  const provider={
    vendorId:'137689',
    async resolveOffer({selection}){
      return {
        domain,
        offer:offer(),
        resolution:{
          readyToQuote:true,
          readyToBook:true,
          selection:structuredClone(selection),
          quote:{available:true,total:133,currency:'USD'},
          constraints:{bookingRequirements:{}},
          resolved:{
            slot:{id:'slot-301',date:'2026-10-07',startTimeId:301,availabilityCount:12,soldOut:false,unavailable:false},
            rate:{id:201},
          },
          errors:[],warnings:[],bookingDataIssues:[],
        },
      };
    },
  };
  const runtime=createBookingSessionRuntime({store,provider,now:()=>later(5)});
  const result=await runtime.syncSelection({
    transactionId:initial.transactionId,
    expectedRevision:initial.revision,
    selection:raw,
  });
  assert.equal(result.transaction.revision,2);
  assert.equal(result.transaction.state,'READY_FOR_APPROVAL');
  assert.equal(result.transaction.selection.productRef.externalId,'1287580');
  assert.equal(result.transaction.quote.price.amount,133);
  assert.equal(result.transaction.draft.quoteRevision,result.transaction.quote.revision);
  assert.equal(audit[0].eventType,'SELECTION_SYNCED');
  assert.equal(audit[0].evidenceCount,3);
});

test('BookingSession syncSelection rejects stale UI revision before provider access',async()=>{
  const initial=createBookingTransaction({transactionId:'txn-runtime-stale',now:new Date(at)});
  let providerCalls=0;
  const store={
    async requireTransaction(){return structuredClone(initial);},
  };
  const provider={
    vendorId:'137689',
    async resolveOffer(){providerCalls+=1;throw new Error('must not run');},
  };
  const runtime=createBookingSessionRuntime({store,provider,now:()=>later(5)});
  await assert.rejects(
    ()=>runtime.syncSelection({
      transactionId:initial.transactionId,
      expectedRevision:initial.revision+1,
      selection:rawSelection(),
    }),
    error=>error.code==='stale_revision',
  );
  assert.equal(providerCalls,0);
});
