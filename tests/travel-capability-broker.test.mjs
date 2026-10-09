import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITY_PRINCIPALS,
  CapabilityPolicyError,
  createTravelCapabilityBroker,
  selectionFromTravelIntent,
} from '../src/travel-capability-broker.js';
import {
  CONTRACT_SCHEMA_VERSIONS,
} from '../src/travel-commerce-contracts.js';

const providerRef=(resourceType,externalId)=>({
  provider:'BOKUN',resourceType,externalId:String(externalId),accountRef:'137689',
});

function intent(overrides={}){
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.TravelIntent,
    locale:'en',
    origin:'Nha Trang',
    destination:'Nha Trang',
    dateConstraint:{kind:'EXACT',exact:'2026-10-07'},
    party:{adults:2,children:[{age:7}],infants:0},
    preferences:[{code:'SNORKELING',weight:1}],
    hotel:'Oceanus',
    pickupPreference:'PICKUP',
    accessibility:[],
    specialRequests:[],
    freeTextNotes:'',
    ...overrides,
  };
}

function domain(){
  return {
    provider:{vendorId:'137689',productId:'1287580'},
    experience:{
      id:'1287580',
      title:'Hòn Mun Marine Park Snorkeling',
      description:'Marine snorkeling tour.',
      excerpt:'Snorkeling around Hòn Mun.',
      location:{countryCode:'VN',timeZone:'Asia/Ho_Chi_Minh'},
      duration:{hours:6},
      minAge:null,
      content:{inclusions:['Boat'],exclusions:[]},
      itinerary:[{title:'Hòn Mun',body:'Snorkeling stop'}],
      pickup:{
        enabled:true,
        customAllowed:true,
        places:[{id:501,title:'Oceanus',location:{address:'03 Pham Van Dong'}}],
      },
      dropoff:{enabled:false},
      meeting:{},
    },
    participants:[
      {id:101,title:'Adult',ticketCategory:'ADULT',minAge:10,maxAge:99},
      {id:102,title:'Child',ticketCategory:'CHILD',minAge:5,maxAge:9},
    ],
    rates:[{id:201}],
    availabilitySlots:[{
      id:'slot-1',
      date:'2026-10-07',
      startTime:'08:00',
      startTimeId:301,
      defaultRateId:201,
      soldOut:false,
      unavailable:false,
      availabilityCount:20,
      unlimitedAvailability:false,
      rates:[{id:201}],
      priceQuotesByRate:[{rateId:201}],
    }],
    bookingRequirements:{},
    cancellationPolicy:null,
    extras:[],
  };
}

function offer(amount=133){
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Offer,
    offerId:'offer-verified',
    productId:'love-travel-hon-mun',
    providerRef:providerRef('ACTIVITY','1287580'),
    rateRef:providerRef('RATE','201'),
    startTimeRef:providerRef('START_TIME','301'),
    date:'2026-10-07',
    participantMix:[
      {role:'ADULT',count:2,providerCategoryRef:providerRef('PRICING_CATEGORY','101')},
      {role:'CHILD',count:1,providerCategoryRef:providerRef('PRICING_CATEGORY','102')},
    ],
    pickup:{mode:'PICKUP',placeRef:providerRef('PICKUP_PLACE','501')},
    dropoff:{mode:'NO_DROPOFF'},
    price:{amount,currency:'USD'},
    availability:{status:'AVAILABLE',remaining:20},
    restrictionCodes:[],
    evidenceRefs:[],
    generatedAt:'2026-10-06T12:00:00.000Z',
  };
}

function fakeProvider(){
  return {
    vendorId:'137689',
    async getDomains(){return [domain()];},
    async resolveOffer({selection}){
      return {
        offer:offer(),
        resolution:{
          readyToQuote:true,
          readyToBook:false,
          selection,
          errors:[],
          warnings:[],
          bookingDataIssues:[{code:'required',path:'customer.email',message:'Email required'}],
          constraints:{bookingRequirements:{}},
        },
      };
    },
    getBookingRequirements(){return {};},
    async quoteSelection(){return {quote:{quoteId:'q1'},evidence:[]};},
  };
}

test('selectionFromTravelIntent maps semantic party and hotel pickup to provider IDs',()=>{
  const selection=selectionFromTravelIntent(domain(),intent());
  assert.equal(selection.productId,'1287580');
  assert.equal(selection.date,'2026-10-07');
  assert.equal(selection.rateId,'201');
  assert.equal(selection.startTimeId,'301');
  assert.deepEqual(selection.participants,{'101':2,'102':1});
  assert.deepEqual(selection.pickup,{mode:'PICKUP',placeId:'501'});
});

test('read capability returns provider-verified evidence envelope',async()=>{
  const broker=createTravelCapabilityBroker({
    provider:fakeProvider(),
    now:()=>new Date('2026-10-06T12:00:00.000Z'),
  });
  const result=await broker.execute('searchOffers',{intent:intent(),lang:'EN'},{
    principal:CAPABILITY_PRINCIPALS.MODEL,
  });
  assert.equal(result.source,'BOKUN');
  assert.equal(result.authority,'PROVIDER_VERIFIED');
  assert.equal(result.capability,'searchOffers');
  assert.match(result.evidenceId,/^cap-[a-f0-9]{24}$/);
  assert.equal(result.data[0].offer.price.amount,133);
});

test('model principal can never invoke booking mutation capability',async()=>{
  let called=0;
  const broker=createTravelCapabilityBroker({
    provider:fakeProvider(),
    bookingSessionExecutor:async()=>{called+=1;return {};},
  });
  await assert.rejects(
    ()=>broker.execute('reserveBooking',{
      transactionId:'txn-1',expectedRevision:5,quoteId:'q1',quoteRevision:1,
    },{principal:CAPABILITY_PRINCIPALS.MODEL}),
    error=>error instanceof CapabilityPolicyError&&error.code==='mutation_authority_required',
  );
  assert.equal(called,0);
});

test('Transaction Policy principal may invoke reserve through BookingSession only',async()=>{
  const calls=[];
  const broker=createTravelCapabilityBroker({
    provider:fakeProvider(),
    bookingSessionExecutor:async(transactionId,payload)=>{
      calls.push({transactionId,payload});
      return {ok:true};
    },
  });
  const result=await broker.execute('reserveBooking',{
    transactionId:'txn-1',expectedRevision:5,quoteId:'q1',quoteRevision:1,
  },{principal:CAPABILITY_PRINCIPALS.TRANSACTION_POLICY});
  assert.equal(result.ok,true);
  assert.deepEqual(calls,[{
    transactionId:'txn-1',
    payload:{action:'RESERVE',expectedRevision:5,quoteId:'q1',quoteRevision:1},
  }]);
});

test('undeclared capability args are rejected before provider access',async()=>{
  const broker=createTravelCapabilityBroker({provider:fakeProvider()});
  await assert.rejects(
    ()=>broker.execute('searchProducts',{sql:'SELECT *'}),
    error=>error instanceof CapabilityPolicyError&&error.code==='unknown_capability_arg',
  );
});

test('declared but unsupported provider mutations fail closed',async()=>{
  const broker=createTravelCapabilityBroker({
    provider:fakeProvider(),
    bookingSessionExecutor:async()=>({}),
  });
  await assert.rejects(
    ()=>broker.execute('cancelBooking',{},{
      principal:CAPABILITY_PRINCIPALS.TRANSACTION_POLICY,
    }),
    error=>error instanceof CapabilityPolicyError&&error.code==='mutation_capability_not_supported',
  );
});

test('AI discovery preserves all seven Robinson and four Hon Mun options with product ownership',async()=>{
  const {optionCatalogDomains,optionCatalog}=await import('./fixtures/travel-option-catalog.mjs');
  const broker=createTravelCapabilityBroker({provider:{vendorId:'137689',async getDomains(){return optionCatalogDomains();}}});
  const packet=await broker.execute('searchProducts',{},{principal:CAPABILITY_PRINCIPALS.ORCHESTRATOR});
  assert.deepEqual(packet.data.map(row=>row.facts.options.length),[7,4]);
  for(const [index,row] of packet.data.entries()){
    assert.equal(row.product.productId,optionCatalog[index].canonicalId);
    assert.deepEqual(row.facts.options.map(option=>[option.rateRef.externalId,option.title]),optionCatalog[index].rates);
    assert.ok(row.facts.options.every(option=>option.rateRef.resourceType==='RATE'&&option.rateRef.accountRef==='137689'));
    assert.equal(row.facts.included,'Air-conditioned vehicle, snorkeling equipment and lunch.');
    assert.equal(row.facts.programScope,'PRODUCT_DESCRIPTION_NOT_OPTION_ITINERARY');
  }
});

test('all eleven explicit options resolve their own rate and group price without network or mutation',async()=>{
  const {optionCatalogDomains,optionCatalog}=await import('./fixtures/travel-option-catalog.mjs');
  const {createBokunProvider}=await import('../src/bokun-provider.js');
  const domains=optionCatalogDomains();
  const real=createBokunProvider({now:()=>new Date('2026-10-06T12:00:00Z'),fetchImpl:async()=>{throw new Error('No upstream call allowed in fixture test');}});
  const broker=createTravelCapabilityBroker({provider:{...real,async getDomains(){return domains;}}});
  for(const catalog of optionCatalog)for(const [index,[rateId,title]] of catalog.rates.entries()){
    const wanted={productId:catalog.canonicalId,rateRef:providerRef('RATE',rateId)};
    const packet=await broker.execute('searchOffers',{intent:intent({party:{adults:2,children:[],infants:0},pickupPreference:'MEET_ON_LOCATION',optionPreference:wanted})});
    assert.equal(packet.data.length,1);
    const row=packet.data[0];
    assert.equal(row.selection.productId,catalog.productId);
    assert.equal(row.selection.rateId,rateId);
    assert.equal(row.offer.rateRef.externalId,rateId);
    assert.equal(row.option.title,title);
    assert.equal(row.offer.price.amount,100+index*10);
    assert.equal(row.readyToQuote,true);
  }
});

test('unavailable, cross-product and cross-account options never silently become a default offer',async()=>{
  const {optionCatalogDomains}=await import('./fixtures/travel-option-catalog.mjs');
  const d=optionCatalogDomains()[0];
  const wanted={productId:'love-travel-robinson-island',rateRef:providerRef('RATE','2623660')};
  const requested=intent({party:{adults:2,children:[],infants:0},optionPreference:wanted});
  for(const slot of d.availabilitySlots){slot.rates=slot.rates.filter(r=>r.id!=='2623660');slot.priceQuotesByRate=slot.priceQuotesByRate.filter(r=>r.rateId!=='2623660');}
  assert.throws(()=>selectionFromTravelIntent(d,requested),e=>e.code==='option_unavailable');
  assert.throws(()=>selectionFromTravelIntent(optionCatalogDomains()[1],requested),e=>e.code==='option_scope_mismatch');
  assert.throws(()=>selectionFromTravelIntent(optionCatalogDomains()[0],{...requested,optionPreference:{...wanted,rateRef:{...wanted.rateRef,accountRef:'other-account'}}}),e=>e.code==='option_scope_mismatch');
  let resolved=0;
  const broker=createTravelCapabilityBroker({provider:{vendorId:'137689',async getDomains(){return [d];},async resolveOffer(){resolved++;throw new Error('must not resolve default');}}});
  const packet=await broker.execute('searchOffers',{intent:requested});
  assert.equal(resolved,0);assert.equal(packet.data[0].offer,null);assert.equal(packet.data[0].errors[0].code,'option_unavailable');
});
