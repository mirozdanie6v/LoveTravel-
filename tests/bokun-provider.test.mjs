import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBokunDomain } from '../src/bokun-domain.js';
import {
  LOVE_TRAVEL_CANONICAL_PRODUCT_IDS,
  ProviderCapabilityError,
  bokunProviderRef,
  canonicalOfferFromResolution,
  canonicalProductFromBokunDomain,
  createBokunProvider,
  provisionalBookingRequest,
} from '../src/bokun-provider.js';
import { resolveBookingSelection } from '../src/booking-selection-engine.js';

const product={
  id:1287580,
  title:'Hòn Mun Marine Park Snorkeling',
  description:'Marine snorkeling tour',
  timeZone:'Asia/Ho_Chi_Minh',
  locationCode:{name:'Nha Trang'},
  pricingCategories:[
    {id:101,title:'Adult',ticketCategory:'ADULT',minAge:10,maxAge:99},
    {id:102,title:'Child',ticketCategory:'CHILD',minAge:5,maxAge:9},
  ],
  defaultRateId:201,
  rates:[{
    id:201,title:'Hòn Mun',rateCode:'TG1',pricedPerPerson:true,minPerBooking:1,maxPerBooking:30,
    startTimeIds:[301],allStartTimes:false,
    pickupSelectionType:'OPTIONAL',pickupPricingType:'INCLUDED_IN_PRICE',
    dropoffSelectionType:'UNAVAILABLE',
  }],
  pickupService:true,
  bookingQuestions:[],
  requiredCustomerFields:['firstName','lastName','phoneNumber','email'],
  mainContactFields:[
    {field:'FIRST_NAME',required:true},
    {field:'LAST_NAME',required:true},
    {field:'PHONE_NUMBER',required:true},
    {field:'EMAIL',required:true},
  ],
};

const availability=[{
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
      {id:101,amount:{amount:49,currency:'USD'}},
      {id:102,amount:{amount:35,currency:'USD'}},
    ],
  }],
}];

const pickupPlaces={
  pickupPlaces:[{
    id:501,title:'Oceanus',type:'ACCOMMODATION',askForRoomNumber:false,
    location:{address:'03 Pham Van Dong',city:'Nha Trang',countryCode:'VN'},
  }],
  dropoffPlaces:[],
};

function domain(){
  return buildBokunDomain(product,availability,{vendorId:'137689',pickupPlaces});
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
    customer:{firstName:'Olga',lastName:'Test',phoneNumber:'+84000000000',email:'guest@example.com'},
    ...overrides,
  };
}

const now=new Date('2026-10-06T00:00:00.000Z');

test('BokunProvider exposes explicit provider capabilities and canonical product IDs',()=>{
  const provider=createBokunProvider({fetchImpl:async()=>{throw new Error('not used')}});
  assert.equal(provider.provider,'BOKUN');
  assert.equal(provider.vendorId,'137689');
  assert.equal(provider.capabilities.products,true);
  assert.equal(provider.capabilities.bookingLookupByExternalReference,true);
  assert.equal(LOVE_TRAVEL_CANONICAL_PRODUCT_IDS['1287580'],'love-travel-hon-mun');
  assert.deepEqual(bokunProviderRef('RATE',201),{
    provider:'BOKUN',resourceType:'RATE',externalId:'201',accountRef:'137689',
  });
});

test('provider maps Bókun domain to canonical Product without leaking Bókun field names',()=>{
  const result=canonicalProductFromBokunDomain(domain());
  assert.equal(result.productId,'love-travel-hon-mun');
  assert.equal(result.providerRef.provider,'BOKUN');
  assert.equal(result.providerRef.externalId,'1287580');
  assert.equal(result.title,'Hòn Mun Marine Park Snorkeling');
  assert.ok(result.capabilities.includes('PICKUP'));
  for(const key of Object.keys(result)){
    assert.equal(/bokun|rateId|startTimeId|pricingCategoryId/i.test(key),false);
  }
});

test('provider maps a quote-ready Bókun resolution to a canonical Offer',()=>{
  const d=domain();
  const resolution=resolveBookingSelection(d,selection(),{now});
  assert.equal(resolution.readyToQuote,true);
  const offer=canonicalOfferFromResolution(d,resolution,{generatedAt:'2026-10-06T01:00:00.000Z'});
  assert.equal(offer.productId,'love-travel-hon-mun');
  assert.equal(offer.date,'2026-10-07');
  assert.equal(offer.participantMix[0].role,'ADULT');
  assert.equal(offer.participantMix[0].count,2);
  assert.equal(offer.price.amount,98);
  assert.equal(offer.price.currency,'USD');
  assert.equal(offer.pickup.mode,'PICKUP');
  assert.equal(offer.availability.status,'AVAILABLE');
  assert.equal(offer.availability.remaining,20);
  assert.match(offer.offerId,/^offer-[a-f0-9]{8}$/);
  assert.equal(offer.rateRef.externalId,'201');
  assert.equal(offer.startTimeRef.externalId,'301');
});

test('resolveOffer reuses the existing booking-selection engine as transaction authority',async()=>{
  const provider=createBokunProvider({
    fetchImpl:async()=>{throw new Error('network should not be used when domain is supplied')},
    now:()=>now,
  });
  const result=await provider.resolveOffer({selection:selection(),domain:domain()});
  assert.equal(result.resolution.readyToQuote,true);
  assert.equal(result.resolution.readyToBook,true);
  assert.equal(result.offer.price.amount,result.resolution.quote.total);
  assert.equal(result.offer.productId,result.product.productId);
  assert.deepEqual(
    provider.getBookingRequirements(result.resolution),
    result.resolution.constraints.bookingRequirements,
  );
});

test('provider fetches domains through the existing adapter and never expands product scope',async()=>{
  const calls=[];
  const fakeFetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url);
    calls.push(url);
    if(url.pathname.endsWith('/product')){
      return new Response(JSON.stringify({...product,id:Number(url.searchParams.get('productId'))}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(url.pathname.endsWith('/availability')){
      return new Response(JSON.stringify(availability),{status:200,headers:{'content-type':'application/json'}});
    }
    if(url.pathname.endsWith('/pickup-places')){
      return new Response(JSON.stringify(pickupPlaces),{status:200,headers:{'content-type':'application/json'}});
    }
    throw new Error('unexpected '+url);
  };
  const provider=createBokunProvider({fetchImpl:fakeFetch,baseUrl:'https://integration.example'});
  const products=await provider.listProducts({start:'2026-10-07',end:'2026-10-07'});
  assert.equal(products.length,2);
  assert.deepEqual(products.map(item=>item.productId),['love-travel-robinson-island','love-travel-hon-mun']);
  assert.ok(calls.every(url=>url.searchParams.get('vendorId')==='137689'));

  await assert.rejects(
    ()=>provider.getDomain({productId:'999999',start:'2026-10-07',end:'2026-10-07'}),
    error=>error instanceof ProviderCapabilityError&&error.code==='unsupported_product',
  );
});

test('provisional checkout request and final draft preserve the verified existing Bókun booking flow',async()=>{
  const d=domain();
  const resolution=resolveBookingSelection(d,selection(),{now});
  const provisional=provisionalBookingRequest(resolution,'LT-TEST-CLIENT-ABC123');
  assert.equal(provisional.externalBookingReference,'LT-TEST-CLIENT-ABC123');
  assert.equal(provisional.activityBookings[0].activityId,1287580);
  assert.equal(provisional.activityBookings[0].rateId,201);
  assert.equal(provisional.activityBookings[0].startTimeId,301);
  assert.equal(provisional.activityBookings[0].pickupPlaceId,501);
  assert.equal(provisional.activityBookings[0].passengers.length,2);

  const contract={
    options:[{
      type:'CUSTOMER_FULL_PAYMENT',
      currency:'USD',
      amount:98,
      paymentMethods:{allowedMethods:['RESERVE_FOR_EXTERNAL_PAYMENT']},
    }],
    questions:{
      mainContactDetails:[
        {questionId:'firstName',required:true},
        {questionId:'lastName',required:true},
        {questionId:'phoneNumber',required:true},
        {questionId:'email',required:true},
      ],
      activityBookings:[{activityId:1287580,questions:[],passengers:[{pricingCategoryId:101,passengerDetails:[],questions:[],extras:[]}],pickupQuestions:[]}],
    },
  };

  const calls=[];
  const provider=createBokunProvider({
    fetchImpl:async(input,init)=>{
      const url=new URL(typeof input==='string'?input:input.url);
      calls.push({url,init});
      if(url.pathname.endsWith('/checkout/options')){
        return new Response(JSON.stringify(contract),{status:200,headers:{'content-type':'application/json'}});
      }
      if(url.pathname.endsWith('/demo-submit')){
        return new Response(JSON.stringify({
          ok:true,
          booking:{
            confirmationCode:'NHA-123456789',
            status:'CONFIRMED',
            paymentType:'NOT_PAID',
            totalPaid:0,
            externalBookingReference:'LT-TEST-CLIENT-ABC123',
          },
        }),{status:200,headers:{'content-type':'application/json'}});
      }
      throw new Error('unexpected '+url);
    },
    baseUrl:'https://integration.example',
  });

  const checkout=await provider.getCheckoutContract({
    resolution,externalBookingReference:'LT-TEST-CLIENT-ABC123',
  });
  const draft=provider.createBookingDraft({
    resolution,
    checkoutContract:checkout,
    externalBookingReference:'LT-TEST-CLIENT-ABC123',
  });
  assert.equal(draft.readyForReserve,true);
  assert.equal(draft.checkoutRequestTemplate.directBooking.externalBookingReference,'LT-TEST-CLIENT-ABC123');

  await assert.rejects(()=>provider.submitClientDemoBooking({
    checkoutRequestTemplate:draft.checkoutRequestTemplate,
    demoToken:'demo-token',
  }),error=>error.code==='booking_mutations_disabled'&&error.status===423);
  assert.equal(calls.filter(item=>item.url.pathname.endsWith('/checkout/options')).length,1);
  assert.equal(calls.filter(item=>item.url.pathname.endsWith('/demo-submit')).length,0);
});

test('confirmation-code lookup remains a read-only provider capability',async()=>{
  let calls=0;
  const provider=createBokunProvider({bookingTestToken:'read-token',baseUrl:'https://integration.example',fetchImpl:async(input,init)=>{
    calls++;
    const url=new URL(input);
    assert.equal(url.pathname,'/admin/bokun/pilot/booking');
    assert.equal(init.method||'GET','GET');
    return new Response(JSON.stringify({confirmationCode:'NHA-123456789',externalBookingReference:'LT-EXISTING',status:'CONFIRMED'}),{status:200,headers:{'content-type':'application/json'}});
  }});
  const booking=await provider.readBookingByConfirmationCode({confirmationCode:'NHA-123456789'});
  assert.equal(booking.confirmationCode,'NHA-123456789');
  assert.equal(calls,1);
});
