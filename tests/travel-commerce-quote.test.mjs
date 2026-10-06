import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBokunDomain } from '../src/bokun-domain.js';
import { resolveBookingSelection } from '../src/booking-selection-engine.js';
import {
  canonicalOfferFromResolution,
  createBokunProvider,
} from '../src/bokun-provider.js';
import {
  DEFAULT_QUOTE_TTL_MS,
  createFirstClassQuote,
  isQuoteExpired,
  markQuoteStaleForSelection,
  materialQuoteSelection,
  quoteMatchesSelection,
  refreshFirstClassQuote,
  selectionFingerprint,
} from '../src/travel-commerce-quote.js';

const product={
  id:1287580,
  title:'Hòn Mun',
  description:'Snorkeling',
  timeZone:'Asia/Ho_Chi_Minh',
  locationCode:{name:'Nha Trang'},
  pricingCategories:[
    {id:101,title:'Adult',ticketCategory:'ADULT',minAge:10,maxAge:99},
    {id:102,title:'Child',ticketCategory:'CHILD',minAge:5,maxAge:9},
  ],
  defaultRateId:201,
  rates:[{
    id:201,title:'Default',rateCode:'TG1',pricedPerPerson:true,minPerBooking:1,maxPerBooking:30,
    startTimeIds:[301],allStartTimes:false,
    pickupSelectionType:'OPTIONAL',pickupPricingType:'INCLUDED_IN_PRICE',
    dropoffSelectionType:'UNAVAILABLE',
  }],
  pickupService:true,
  requiredCustomerFields:['firstName','lastName','phoneNumber','email'],
  mainContactFields:[
    {field:'FIRST_NAME',required:true},
    {field:'LAST_NAME',required:true},
    {field:'PHONE_NUMBER',required:true},
    {field:'EMAIL',required:true},
  ],
};

function availability(adultPrice=49){
  return [{
    id:'301_20261007',
    localizedDate:"Wed 07.Oct'26",
    startTime:'08:00',
    startTimeId:301,
    recurrenceId:401,
    availabilityCount:20,
    bookedParticipants:3,
    soldOut:false,
    unavailable:false,
    defaultRateId:201,
    rates:[{id:201}],
    pricesByRate:[{
      activityRateId:201,
      pricePerCategoryUnit:[
        {id:101,amount:{amount:adultPrice,currency:'USD'}},
        {id:102,amount:{amount:35,currency:'USD'}},
      ],
    }],
  }];
}

const pickupPlaces={
  pickupPlaces:[{
    id:501,title:'Oceanus',type:'ACCOMMODATION',askForRoomNumber:false,
    location:{address:'03 Pham Van Dong',city:'Nha Trang',countryCode:'VN'},
  }],
  dropoffPlaces:[],
};

function domain(adultPrice=49){
  return buildBokunDomain(product,availability(adultPrice),{vendorId:'137689',pickupPlaces});
}

function selection(overrides={}){
  return {
    productId:'1287580',
    date:'2026-10-07',
    startTimeId:'301',
    rateId:'201',
    participants:{101:2},
    pickup:{mode:'PICKUP',placeId:'501'},
    dropoff:{mode:'NO_DROPOFF'},
    extras:{},
    customer:{firstName:'Olga',lastName:'Test',phoneNumber:'+84000000000',email:'guest@example.com'},
    answers:{501:'yes'},
    ...overrides,
  };
}

const now=new Date('2026-10-06T01:00:00.000Z');

function resolved(adultPrice=49,selectionValue=selection()){
  const d=domain(adultPrice);
  const resolution=resolveBookingSelection(d,selectionValue,{now});
  const offer=canonicalOfferFromResolution(d,resolution,{generatedAt:now.toISOString()});
  return {d,resolution,offer};
}

test('material Quote selection includes only commercial fields',()=>{
  const material=materialQuoteSelection(selection());
  assert.equal('customer' in material,false);
  assert.equal('answers' in material,false);
  assert.deepEqual(material.participants,{'101':2});
  assert.equal(material.pickup.placeId,'501');
});

test('selection fingerprint ignores customer text but changes on commercial selection',async()=>{
  const base=selection();
  const sameCommercial=selection({
    customer:{firstName:'Another',lastName:'Person',phoneNumber:'1',email:'x@y.z'},
    answers:{999:'different'},
  });
  assert.equal(await selectionFingerprint(base),await selectionFingerprint(sameCommercial));

  for(const changed of [
    selection({date:'2026-10-08'}),
    selection({participants:{101:3}}),
    selection({rateId:'202'}),
    selection({pickup:{mode:'MEET_ON_LOCATION'}}),
    selection({extras:{701:1}}),
  ]){
    assert.notEqual(await selectionFingerprint(base),await selectionFingerprint(changed));
  }
});

test('creates a first-class Quote directly from resolver price without recalculation',async()=>{
  const {resolution,offer}=resolved();
  assert.equal(resolution.quote.total,98);
  const {quote,evidence}=await createFirstClassQuote({
    transactionId:'txn-quote-1',
    offer,
    resolution,
    now,
  });

  assert.equal(quote.transactionId,'txn-quote-1');
  assert.equal(quote.revision,1);
  assert.equal(quote.offer.offerId,offer.offerId);
  assert.equal(quote.price.amount,resolution.quote.total);
  assert.equal(quote.price.currency,resolution.quote.currency);
  assert.equal(quote.readyToBook,true);
  assert.equal(quote.freshness.policy,'REVALIDATE_BEFORE_MUTATION');
  assert.equal(quote.freshness.ttlMs,DEFAULT_QUOTE_TTL_MS);
  assert.equal(quote.expiresAt,'2026-10-06T01:02:00.000Z');
  assert.equal(evidence.length,3);
  assert.deepEqual(evidence.map(item=>item.factType).sort(),['AVAILABILITY','BOOKING_REQUIREMENTS','PRICE']);
  assert.deepEqual(quote.providerEvidenceRefs,evidence.map(item=>item.evidenceId));
  assert.equal(evidence.find(item=>item.factType==='PRICE').value.amount,98);
});

test('Quote exposes deterministic missing-field codes from booking requirements',async()=>{
  const d=domain();
  const incomplete=selection({customer:{}});
  const resolution=resolveBookingSelection(d,incomplete,{now});
  const offer=canonicalOfferFromResolution(d,resolution,{generatedAt:now.toISOString()});
  const {quote}=await createFirstClassQuote({
    transactionId:'txn-missing',
    offer,
    resolution,
    now,
  });
  assert.equal(quote.readyToBook,false);
  assert.ok(quote.requiredFieldCodes.includes('CUSTOMER_FIRST_NAME'));
  assert.ok(quote.requiredFieldCodes.includes('CUSTOMER_LAST_NAME'));
  assert.ok(quote.requiredFieldCodes.includes('CUSTOMER_PHONE_NUMBER'));
  assert.ok(quote.requiredFieldCodes.includes('CUSTOMER_EMAIL'));
  assert.ok(quote.issues.bookingDataIssues.length>=4);
});

test('refresh preserves quoteId, advances revision and takes new resolver price',async()=>{
  const initial=resolved(49);
  const first=await createFirstClassQuote({
    transactionId:'txn-refresh',
    offer:initial.offer,
    resolution:initial.resolution,
    now,
  });

  const nextNow=new Date('2026-10-06T01:01:00.000Z');
  const updated=resolved(55);
  const refreshed=await refreshFirstClassQuote({
    previousQuote:first.quote,
    offer:updated.offer,
    resolution:updated.resolution,
    now:nextNow,
  });

  assert.equal(refreshed.quote.quoteId,first.quote.quoteId);
  assert.equal(refreshed.quote.revision,2);
  assert.equal(refreshed.quote.price.amount,110);
  assert.equal(refreshed.evidence.find(item=>item.factType==='PRICE').value.amount,110);
  assert.notEqual(refreshed.quote.providerEvidenceRefs[0],first.quote.providerEvidenceRefs[0]);
});

test('material selection change immediately marks Quote stale and invalidates booking readiness',async()=>{
  const initial=resolved();
  const first=await createFirstClassQuote({
    transactionId:'txn-stale',
    offer:initial.offer,
    resolution:initial.resolution,
    now,
  });

  assert.equal(await quoteMatchesSelection(first.quote,selection()),true);
  const changed=selection({date:'2026-10-08'});
  assert.equal(await quoteMatchesSelection(first.quote,changed),false);

  const stale=await markQuoteStaleForSelection(first.quote,changed,{
    now:new Date('2026-10-06T01:00:30.000Z'),
  });
  assert.equal(stale.status,'STALE');
  assert.equal(stale.readyToBook,false);
  assert.equal(stale.revision,2);
  assert.equal(first.quote.status,'ACTIVE');
});

test('Quote expiry is explicit but mutation policy remains revalidate-before-mutation',async()=>{
  const initial=resolved();
  const first=await createFirstClassQuote({
    transactionId:'txn-expiry',
    offer:initial.offer,
    resolution:initial.resolution,
    now,
    ttlMs:60000,
  });
  assert.equal(isQuoteExpired(first.quote,{now:new Date('2026-10-06T01:00:59.000Z')}),false);
  assert.equal(isQuoteExpired(first.quote,{now:new Date('2026-10-06T01:01:00.000Z')}),true);
  assert.equal(first.quote.freshness.policy,'REVALIDATE_BEFORE_MUTATION');
});

test('BokunProvider quoteSelection exposes the first-class Quote without duplicating price logic',async()=>{
  const provider=createBokunProvider({
    fetchImpl:async()=>{throw new Error('network must not be used')},
    now:()=>now,
  });
  const first=await provider.quoteSelection({
    transactionId:'txn-provider-quote',
    selection:selection(),
    domain:domain(),
  });
  assert.equal(first.quote.price.amount,first.resolution.quote.total);
  assert.equal(first.quote.offerId,first.offer.offerId);
  assert.equal(first.evidence.length,3);

  const refreshed=await provider.quoteSelection({
    transactionId:'txn-provider-quote',
    previousQuote:first.quote,
    selection:selection(),
    domain:domain(55),
  });
  assert.equal(refreshed.quote.quoteId,first.quote.quoteId);
  assert.equal(refreshed.quote.revision,2);
  assert.equal(refreshed.quote.price.amount,110);
});
