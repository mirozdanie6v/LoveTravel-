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
