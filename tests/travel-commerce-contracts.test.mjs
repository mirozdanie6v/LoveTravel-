import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_SCHEMA_VERSIONS,
  TRAVEL_COMMERCE_SCHEMAS,
  ContractError,
  assertCommandRevision,
  validateBookingDraft,
  validateBookingTransaction,
  validateCommandReceipt,
  validateContract,
  validateOffer,
  validateProduct,
  validateProviderEvidence,
  validateQuote,
  validateShoppingSession,
  validateTransactionCommand,
  validateTravelIntent,
} from '../src/travel-commerce-contracts.js';

const hash = char => char.repeat(64);
const at = '2026-10-06T10:00:00.000Z';

const providerRef = (resourceType, externalId) => ({
  provider:'BOKUN',
  resourceType,
  externalId:String(externalId),
  accountRef:'love-travel',
});

function intent(overrides={}) {
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.TravelIntent,
    locale:'en',
    origin:'Nha Trang',
    destination:'Nha Trang islands',
    dateConstraint:{kind:'EXACT',exact:'2026-10-07'},
    party:{adults:2,children:[],infants:0},
    preferences:[{code:'SNORKELING',weight:1}],
    hotel:'Oceanus',
    pickupPreference:'PICKUP',
    accessibility:[],
    specialRequests:[],
    freeTextNotes:'Customer prefers a marine tour.',
    ...overrides,
  };
}

function product(overrides={}) {
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Product,
    productId:'product-1287580',
    providerRef:providerRef('ACTIVITY','1287580'),
    title:'Hòn Mun Marine Park Snorkeling',
    summary:'Marine activity',
    location:{countryCode:'VN',cityCode:'NHA_TRANG',timeZone:'Asia/Ho_Chi_Minh'},
    semanticTags:['SNORKELING','ISLANDS'],
    capabilities:['PICKUP'],
    evidenceRefs:['evidence-product-1'],
    ...overrides,
  };
}

function offer(overrides={}) {
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Offer,
    offerId:'offer-1',
    productId:'product-1287580',
    providerRef:providerRef('ACTIVITY','1287580'),
    rateRef:providerRef('RATE','2581224'),
    startTimeRef:providerRef('START_TIME','5782388'),
    date:'2026-10-07',
    participantMix:[{role:'ADULT',count:2,providerCategoryRef:providerRef('PRICING_CATEGORY','1250028')}],
    pickup:{mode:'PICKUP',placeRef:providerRef('PICKUP_PLACE','15137113')},
    dropoff:{mode:'NO_DROPOFF'},
    price:{amount:98,currency:'USD'},
    availability:{status:'AVAILABLE',remaining:12},
    restrictionCodes:[],
    evidenceRefs:['evidence-availability-1','evidence-price-1'],
    generatedAt:at,
    ...overrides,
  };
}

function quote(overrides={}) {
  const resolvedOffer=offer();
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Quote,
    quoteId:'quote-1',
    transactionId:'txn-1',
    revision:1,
    offerId:'offer-1',
    offer:resolvedOffer,
    providerRef:providerRef('ACTIVITY','1287580'),
    selectionFingerprint:hash('a'),
    price:{amount:98,currency:'USD'},
    availabilityStatus:'AVAILABLE',
    requiredFieldCodes:[],
    providerEvidenceRefs:['evidence-availability-1','evidence-price-1'],
    freshness:{policy:'REVALIDATE_BEFORE_MUTATION',ttlMs:120000},
    issues:{errors:[],warnings:[],bookingDataIssues:[]},
    createdAt:at,
    refreshedAt:at,
    expiresAt:'2026-10-06T10:10:00.000Z',
    status:'ACTIVE',
    readyToBook:true,
    ...overrides,
  };
}

function draft(overrides={}) {
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.BookingDraft,
    quoteId:'quote-1',
    quoteRevision:1,
    customer:{firstName:'Olga',lastName:'Test',email:'guest@example.com',phoneNumber:'+84000000000'},
    travellers:[
      {participantRole:'ADULT',providerCategoryRef:providerRef('PRICING_CATEGORY','1250028'),firstName:'Olga',lastName:'Test',answers:{},extras:[]},
      {participantRole:'ADULT',providerCategoryRef:providerRef('PRICING_CATEGORY','1250028'),firstName:'Dmitry',lastName:'Test',answers:{},extras:[]},
    ],
    pickup:{mode:'PICKUP',placeRef:providerRef('PICKUP_PLACE','15137113')},
    dropoff:{mode:'NO_DROPOFF'},
    answers:{roomNumber:'804'},
    extras:[],
    paymentChoice:'RESERVE_FOR_EXTERNAL_PAYMENT',
    specialRequests:[],
    ...overrides,
  };
}

function approval(overrides={}) {
  return {
    approvalId:'approval-1',
    decision:'APPROVE',
    quoteId:'quote-1',
    quoteRevision:1,
    approvedAt:'2026-10-06T10:01:00.000Z',
    ...overrides,
  };
}

function mutation(overrides={}) {
  return {
    commandId:'command-reserve-1',
    idempotencyKey:'txn-1:reserve:quote-1:r1',
    externalBookingReference:'LT-TXN-1',
    status:'SUCCEEDED',
    startedAt:'2026-10-06T10:01:01.000Z',
    completedAt:'2026-10-06T10:01:03.000Z',
    ...overrides,
  };
}

function transaction(overrides={}) {
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.BookingTransaction,
    transactionId:'txn-1',
    revision:7,
    shoppingSessionId:'shopping-1',
    state:'CONFIRMED',
    selectedOfferId:'offer-1',
    quote:quote(),
    draft:draft(),
    approval:approval(),
    mutation:mutation(),
    providerBooking:{
      providerRef:providerRef('BOOKING','NHA-105381046'),
      confirmationCode:'NHA-105381046',
      status:'CONFIRMED',
      confirmedAt:'2026-10-06T10:01:03.000Z',
    },
    createdAt:at,
    updatedAt:'2026-10-06T10:01:03.000Z',
    ...overrides,
  };
}

test('publishes all ten canonical schema descriptors with explicit versions', () => {
  assert.deepEqual(Object.keys(TRAVEL_COMMERCE_SCHEMAS).sort(), [
    'BookingDraft','BookingTransaction','CommandReceipt','Offer','Product',
    'ProviderEvidence','Quote','ShoppingSession','TransactionCommand','TravelIntent',
  ].sort());
  for (const [name,schema] of Object.entries(TRAVEL_COMMERCE_SCHEMAS)) {
    assert.equal(schema.schemaVersion,CONTRACT_SCHEMA_VERSIONS[name]);
    assert.ok(schema.allowedKeys.includes('schemaVersion'));
  }
});

test('validates provider-neutral canonical happy-path contracts', () => {
  assert.equal(validateTravelIntent(intent()).locale,'en');
  assert.equal(validateProduct(product()).productId,'product-1287580');
  assert.equal(validateOffer(offer()).participantMix[0].role,'ADULT');
  assert.equal(validateQuote(quote()).price.amount,98);
  assert.equal(validateBookingDraft(draft()).quoteId,'quote-1');

  const shopping={
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.ShoppingSession,
    sessionId:'shopping-1',
    revision:2,
    intent:intent(),
    candidateOfferIds:['offer-1'],
    selectedOfferId:'offer-1',
    status:'ACTIVE',
    createdAt:at,
    updatedAt:at,
  };
  assert.equal(validateShoppingSession(shopping).selectedOfferId,'offer-1');

  assert.equal(validateBookingTransaction(transaction()).state,'CONFIRMED');

  const evidence={
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.ProviderEvidence,
    evidenceId:'evidence-price-1',
    providerRef:providerRef('RATE','2581224'),
    factType:'PRICE',
    fieldPath:'offer.price',
    retrievedAt:at,
    sourceRevision:'provider-response-etag',
    valueHash:hash('b'),
    value:{amount:98,currency:'USD'},
    transactionId:'txn-1',
    quoteId:'quote-1',
  };
  assert.equal(validateProviderEvidence(evidence).factType,'PRICE');

  const command={
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.TransactionCommand,
    commandId:'command-reserve-1',
    transactionId:'txn-1',
    expectedRevision:7,
    idempotencyKey:'txn-1:reserve:quote-1:r1',
    type:'RESERVE_BOOKING',
    issuedAt:at,
    payload:{quoteId:'quote-1',quoteRevision:1,externalBookingReference:'LT-TXN-1'},
  };
  assert.equal(validateTransactionCommand(command).type,'RESERVE_BOOKING');

  const receipt={
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.CommandReceipt,
    commandId:'command-reserve-1',
    transactionId:'txn-1',
    revisionBefore:7,
    revisionAfter:8,
    status:'APPLIED',
    providerEvidenceRefs:['evidence-price-1'],
    providerResultRef:'NHA-105381046',
    createdAt:'2026-10-06T10:01:03.000Z',
  };
  assert.equal(validateCommandReceipt(receipt).revisionAfter,8);
});

test('strict contracts reject unknown fields rather than silently accepting drift', () => {
  assert.throws(
    () => validateTravelIntent({...intent(),bokunProductId:'1287580'}),
    error => error instanceof ContractError && error.issues.some(item => item.code==='unknown_field'),
  );

  assert.throws(
    () => validateTransactionCommand({
      schemaVersion:CONTRACT_SCHEMA_VERSIONS.TransactionCommand,
      commandId:'c-1',transactionId:'txn-1',expectedRevision:1,idempotencyKey:'k-1',
      type:'SELECT_OFFER',issuedAt:at,payload:{offerId:'offer-1',rateId:'provider-leak'},
    }),
    error => error instanceof ContractError && error.issues.some(item => item.code==='unknown_field' && item.path==='payload'),
  );
});

test('language-specific participant labels cannot become transaction identifiers', () => {
  for (const role of ['Взрослый','成人','성인','người lớn','adult']) {
    assert.throws(
      () => validateOffer(offer({participantMix:[{role,count:2}]})),
      error => error instanceof ContractError && error.issues.some(item => item.code==='invalid_participant_role'),
    );
  }
  assert.doesNotThrow(() => validateOffer(offer({participantMix:[{role:'ADULT',count:2}]})));
});

test('semantic preference and reason identifiers are language-neutral', () => {
  assert.throws(
    () => validateTravelIntent(intent({preferences:[{code:'море и острова',weight:1}]})),
    error => error instanceof ContractError && error.issues.some(item => item.code==='invalid_semantic_code'),
  );

  assert.throws(
    () => validateTransactionCommand({
      schemaVersion:CONTRACT_SCHEMA_VERSIONS.TransactionCommand,
      commandId:'c-abandon',transactionId:'txn-1',expectedRevision:7,idempotencyKey:'k-abandon',
      type:'ABANDON_TRANSACTION',issuedAt:at,payload:{reasonCode:'передумал'},
    }),
    error => error instanceof ContractError && error.issues.some(item => item.code==='invalid_reason_code'),
  );
});

test('first-class Quote keeps embedded Offer, price and availability synchronized', () => {
  assert.throws(
    () => validateQuote(quote({offerId:'offer-other'})),
    error => error instanceof ContractError && error.issues.some(item => item.code==='quote_offer_id_mismatch'),
  );
  assert.throws(
    () => validateQuote(quote({price:{amount:99,currency:'USD'}})),
    error => error instanceof ContractError && error.issues.some(item => item.code==='quote_price_mismatch'),
  );
  assert.throws(
    () => validateQuote(quote({providerEvidenceRefs:[]})),
    error => error instanceof ContractError && error.issues.some(item => item.code==='provider_evidence_required'),
  );
});

test('non-active or unavailable Quote can never be ready to book', () => {
  assert.throws(
    () => validateQuote(quote({status:'STALE',readyToBook:true})),
    error => error instanceof ContractError && error.issues.some(item => item.code==='stale_quote_ready'),
  );
  assert.throws(
    () => validateQuote(quote({availabilityStatus:'SOLD_OUT',readyToBook:true})),
    error => error instanceof ContractError && error.issues.some(item => item.code==='unavailable_quote_ready'),
  );
});

test('transaction state rejects missing Quote, Draft, approval and provider confirmation', () => {
  assert.throws(
    () => validateBookingTransaction(transaction({state:'QUOTED',quote:undefined,draft:undefined,approval:undefined,mutation:undefined,providerBooking:undefined})),
    error => error instanceof ContractError && error.issues.some(item => item.code==='quote_required'),
  );

  assert.throws(
    () => validateBookingTransaction(transaction({state:'READY_FOR_APPROVAL',draft:undefined,approval:undefined,mutation:undefined,providerBooking:undefined})),
    error => error instanceof ContractError && error.issues.some(item => item.code==='draft_required'),
  );

  assert.throws(
    () => validateBookingTransaction(transaction({state:'USER_APPROVED',approval:undefined,mutation:undefined,providerBooking:undefined})),
    error => error instanceof ContractError && error.issues.some(item => item.code==='approval_required'),
  );

  assert.throws(
    () => validateBookingTransaction(transaction({providerBooking:undefined})),
    error => error instanceof ContractError && error.issues.some(item => item.code==='provider_booking_required'),
  );
});

test('approved and mutation states reject an active Quote that is not ready to book', () => {
  for (const state of ['USER_APPROVED','RESERVING','CONFIRMED','FAILED_NEEDS_RECONCILIATION']) {
    const base=transaction({
      state,
      quote:quote({readyToBook:false}),
      providerBooking:state==='CONFIRMED' ? transaction().providerBooking : undefined,
      mutation:state==='USER_APPROVED' ? undefined : state==='FAILED_NEEDS_RECONCILIATION' ? mutation({status:'AMBIGUOUS',completedAt:undefined}) : mutation(),
    });
    assert.throws(
      () => validateBookingTransaction(base),
      error => error instanceof ContractError && error.issues.some(item => item.code==='quote_not_ready'),
    );
  }
});

test('approval is bound to the exact current Quote revision', () => {
  assert.throws(
    () => validateBookingTransaction(transaction({approval:approval({quoteRevision:0})})),
    error => error instanceof ContractError && error.issues.some(item => ['invalid_revision','stale_approval'].includes(item.code)),
  );
  assert.throws(
    () => validateBookingTransaction(transaction({approval:approval({quoteId:'quote-old'})})),
    error => error instanceof ContractError && error.issues.some(item => item.code==='stale_approval'),
  );
});

test('FAILED_NEEDS_RECONCILIATION requires an ambiguous provider mutation', () => {
  const ambiguousTx=transaction({
    state:'FAILED_NEEDS_RECONCILIATION',
    mutation:mutation({status:'AMBIGUOUS',completedAt:undefined}),
    providerBooking:undefined,
  });
  assert.equal(validateBookingTransaction(ambiguousTx).state,'FAILED_NEEDS_RECONCILIATION');

  assert.throws(
    () => validateBookingTransaction({...ambiguousTx,mutation:mutation({status:'FAILED'})}),
    error => error instanceof ContractError && error.issues.some(item => item.code==='ambiguous_mutation_required'),
  );
});

test('command revision guard rejects stale writes before mutation execution', () => {
  const command={
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.TransactionCommand,
    commandId:'command-reserve-1',
    transactionId:'txn-1',
    expectedRevision:6,
    idempotencyKey:'txn-1:reserve:quote-1:r1',
    type:'RESERVE_BOOKING',
    issuedAt:at,
    payload:{quoteId:'quote-1',quoteRevision:1,externalBookingReference:'LT-TXN-1'},
  };
  assert.throws(
    () => assertCommandRevision(command,transaction()),
    error => error instanceof ContractError && error.issues.some(item => item.code==='stale_revision'),
  );

  const current={...command,expectedRevision:7};
  assert.equal(assertCommandRevision(current,transaction()).command.commandId,'command-reserve-1');
});

test('replayed/rejected/failed receipts cannot advance transaction revision', () => {
  for (const status of ['REPLAYED','REJECTED','FAILED','NEEDS_RECONCILIATION']) {
    assert.throws(
      () => validateCommandReceipt({
        schemaVersion:CONTRACT_SCHEMA_VERSIONS.CommandReceipt,
        commandId:'command-1',
        transactionId:'txn-1',
        revisionBefore:7,
        revisionAfter:8,
        status,
        providerEvidenceRefs:[],
        createdAt:at,
      }),
      error => error instanceof ContractError && error.issues.some(item => item.code==='unexpected_revision_change'),
    );
  }
});

test('generic validateContract routes only known canonical contracts', () => {
  assert.equal(validateContract('Product',product()).schemaVersion,CONTRACT_SCHEMA_VERSIONS.Product);
  assert.throws(() => validateContract('BokunProduct',{}), /Unknown Travel Commerce contract/);
});
