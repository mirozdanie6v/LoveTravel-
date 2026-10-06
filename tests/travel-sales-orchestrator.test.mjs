import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_SCHEMA_VERSIONS,
} from '../src/travel-commerce-contracts.js';
import {
  createLoveTravelSalesOrchestrator,
} from '../src/travel-sales-orchestrator.js';

function domain(){
  return {
    provider:{vendorId:'137689',productId:'1287580'},
    experience:{
      id:'1287580',
      title:'Hòn Mun Marine Park Snorkeling',
      description:'Snorkeling around Hòn Mun Marine Park.',
      excerpt:'Marine snorkeling tour.',
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

function offer(){
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Offer,
    offerId:'offer-hon-mun',
    productId:'love-travel-hon-mun',
    providerRef:{provider:'BOKUN',resourceType:'ACTIVITY',externalId:'1287580',accountRef:'137689'},
    rateRef:{provider:'BOKUN',resourceType:'RATE',externalId:'201',accountRef:'137689'},
    startTimeRef:{provider:'BOKUN',resourceType:'START_TIME',externalId:'301',accountRef:'137689'},
    date:'2026-10-07',
    participantMix:[{
      role:'ADULT',
      count:2,
      providerCategoryRef:{provider:'BOKUN',resourceType:'PRICING_CATEGORY',externalId:'101',accountRef:'137689'},
    }],
    pickup:{mode:'PICKUP',placeRef:{provider:'BOKUN',resourceType:'PICKUP_PLACE',externalId:'501',accountRef:'137689'}},
    dropoff:{mode:'NO_DROPOFF'},
    price:{amount:98,currency:'USD'},
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
          readyToBook:true,
          selection,
          errors:[],
          warnings:[],
          bookingDataIssues:[],
          constraints:{bookingRequirements:{}},
        },
      };
    },
    getBookingRequirements(){return {};},
    async quoteSelection(){throw new Error('quote not used in this turn');},
  };
}

function fakeStore(){
  let shopping=null;
  const events=[];
  return {
    async getShoppingSession(id){
      return shopping?.sessionId===id?structuredClone(shopping):null;
    },
    async createShoppingSession(value){
      shopping=structuredClone(value);
      events.push('SHOPPING_SESSION_CREATED');
      return structuredClone(shopping);
    },
    async saveShoppingSession(before,after,{eventType}={}){
      assert.equal(before.sessionId,after.sessionId);
      shopping=structuredClone(after);
      events.push(eventType);
      return structuredClone(shopping);
    },
    _current(){return structuredClone(shopping);},
    _events(){return [...events];},
  };
}

function fakeDb(){
  let memoryJson=null;
  return {
    async batch(statements){
      return (Array.isArray(statements)?statements:[]).map(()=>({success:true}));
    },
    prepare(sql){
      return {
        bind(...args){
          return {
            async first(){
              if(sql.includes('SELECT memory_json')){
                return memoryJson?{memory_json:memoryJson}:null;
              }
              return null;
            },
            async run(){
              if(sql.includes('INSERT INTO ai_conversation_memory')){
                memoryJson=String(args[1]??'{}');
              }
              return {success:true};
            },
          };
        },
      };
    },
    _memory(){return memoryJson?JSON.parse(memoryJson):null;},
  };
}

test('Sales Orchestrator turns natural language into verified offer recommendation and ShoppingSession state',async()=>{
  const calls=[];
  const env={
    DB:fakeDb(),
    AI_MODEL:'fake',
    AI:{
      async run(_model,input){
        calls.push(input.messages[0].content);
        if(calls.length===1){
          return {response:JSON.stringify({
            intentPatch:{
              locale:'en',
              dateConstraint:{kind:'EXACT',exact:'2026-10-07'},
              party:{adults:2},
              preferenceAdds:['SNORKELING'],
              hotel:'Oceanus',
              pickupPreference:'PICKUP',
              selectedProductId:'love-travel-hon-mun',
              goal:'BOOK',
              bookingRequested:true,
            },
          })};
        }
        return {response:JSON.stringify({
          reply:'Hòn Mun is available on October 7 at $98 for two adults. I can take you to the booking step.',
          recommendedProductId:'love-travel-hon-mun',
          selectedOfferId:'offer-hon-mun',
          action:'OFFER_READY',
          nextQuestionCode:'CONFIRM_BOOKING',
          evidenceRefs:[],
        })};
      },
    },
  };
  const store=fakeStore();
  const orchestrator=createLoveTravelSalesOrchestrator({
    env,
    provider:fakeProvider(),
    store,
    now:()=>new Date('2026-10-06T12:00:00.000Z'),
  });

  const result=await orchestrator.turn({
    sessionId:'sales-session-12345678901234567890',
    locale:'en',
    message:'We are two adults. Tomorrow we want snorkeling at Hòn Mun and pickup from Oceanus. Let’s book it.',
  });

  assert.equal(result.tourId,'1287580');
  assert.equal(result.faqIntent,'book');
  assert.equal(result.agent.bookingRequested,true);
  assert.equal(result.agent.mutationExecuted,false);
  assert.equal(result.agent.recommendedProductId,'love-travel-hon-mun');
  assert.equal(result.agent.selectedOfferId,'offer-hon-mun');
  assert.equal(result.intent.dateConstraint.exact,'2026-10-07');
  assert.equal(result.intent.party.adults,2);
  assert.equal(result.intent.hotel,'Oceanus');
  assert.equal(result.intent.pickupPreference,'PICKUP');
  assert.equal(result.offers.length,1);
  assert.equal(result.offers[0].offer.price.amount,98);
  assert.equal(store._current().selectedOfferId,'offer-hon-mun');
  assert.ok(store._events().includes('SALES_INTENT_UPDATED'));
  assert.ok(store._events().includes('SALES_CANDIDATES_UPDATED'));
  assert.ok(store._events().includes('SALES_OFFER_SELECTED'));
  assert.equal(calls.length,2);
  const saved=env.DB._memory();
  assert.equal(saved.travelSales.turns.at(-1).role,'assistant');
});

test('Sales Orchestrator asks for missing date before searching offers',async()=>{
  let aiCalls=0;
  const env={
    DB:fakeDb(),
    AI:{
      async run(){
        aiCalls+=1;
        if(aiCalls===1){
          return {response:JSON.stringify({
            intentPatch:{
              locale:'en',
              party:{adults:2},
              preferenceAdds:['SNORKELING'],
              goal:'DISCOVER',
              bookingRequested:false,
            },
          })};
        }
        throw new Error('Sales model should not be required without offer evidence');
      },
    },
  };
  const store=fakeStore();
  const orchestrator=createLoveTravelSalesOrchestrator({
    env,
    provider:fakeProvider(),
    store,
    now:()=>new Date('2026-10-06T12:00:00.000Z'),
  });
  const result=await orchestrator.turn({
    sessionId:'sales-session-abcdefghij1234567890',
    locale:'en',
    message:'We are two adults and want snorkeling.',
  });
  assert.equal(result.agent.action,'ASK_DATE');
  assert.equal(result.offers.length,0);
  assert.match(result.reply,/What date/i);
  assert.equal(aiCalls,1);
});

test('booking request is represented as intent only; orchestrator does not execute a mutation',async()=>{
  const env={
    DB:fakeDb(),
    AI:{
      async run(_model,input){
        if(input.messages[0].content.includes('Conversation Intelligence parser')){
          return {response:JSON.stringify({
            intentPatch:{
              locale:'en',
              goal:'BOOK',
              bookingRequested:true,
            },
          })};
        }
        return {response:JSON.stringify({
          reply:'What date are you planning the trip for?',
          recommendedProductId:'',
          selectedOfferId:'',
          action:'ASK_DATE',
          nextQuestionCode:'DATE',
          evidenceRefs:[],
        })};
      },
    },
  };
  const orchestrator=createLoveTravelSalesOrchestrator({
    env,
    provider:fakeProvider(),
    store:fakeStore(),
    now:()=>new Date('2026-10-06T12:00:00.000Z'),
  });
  const result=await orchestrator.turn({
    sessionId:'sales-session-bookingintent123456',
    locale:'en',
    message:'Book it for me.',
  });
  assert.equal(result.agent.bookingRequested,true);
  assert.equal(result.agent.mutationExecuted,false);
  assert.equal(result.agent.action,'ASK_DATE');
});
