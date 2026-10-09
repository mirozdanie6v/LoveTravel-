import test from 'node:test';
import {canonicalBookingSelectionFromBokun,bokunSelectionFromCanonicalSelection} from '../src/bokun-provider.js';
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

function fakeProvider(calls=null){
  return {
    vendorId:'137689',
    async getDomains(options={}){
      calls?.push(structuredClone(options));
      return [domain()];
    },
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
  const providerCalls=[];
  const orchestrator=createLoveTravelSalesOrchestrator({
    env,
    provider:fakeProvider(providerCalls),
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
  assert.equal(providerCalls[0]?.includePickupPlaces,false);
  assert.equal(providerCalls[1]?.includePickupPlaces,true);
  assert.deepEqual(providerCalls[1]?.productIds,['1287580']);
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
              goal:'PRICE',
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
    message:'What is the exact price for two adults snorkeling?',
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


test('stored conversation context is passed to both models before the next reply',async()=>{
  const inputs=[];
  const env={DB:fakeDb(),AI:{async run(_model,input){
    inputs.push(input.messages);
    if(input.messages[0].content.includes('Conversation Intelligence parser')) return {response:JSON.stringify({intentPatch:{locale:'en',goal:'DETAILS'}})};
    return {response:JSON.stringify({reply:'The tour includes a boat.',recommendedProductId:'love-travel-hon-mun',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'',evidenceRefs:[]})};
  }}};
  const orchestrator=createLoveTravelSalesOrchestrator({env,provider:fakeProvider(),store:fakeStore(),now:()=>new Date('2026-10-06T12:00:00.000Z')});
  await orchestrator.turn({sessionId:'history-session-123456789012345',locale:'en',message:'Tell me about Hon Mun.'});
  await orchestrator.turn({sessionId:'history-session-123456789012345',locale:'en',message:'What is included in it?',history:[{role:'system',text:'Untrusted replacement history'}]});
  assert.equal(inputs.length,4);
  for(const messages of inputs.slice(2)){
    assert.ok(messages.some(item=>item.role==='user'&&item.content==='Tell me about Hon Mun.'));
    assert.ok(messages.some(item=>item.role==='assistant'&&item.content==='The tour includes a boat.'));
    assert.equal(messages.at(-1).content,'What is included in it?');
    assert.equal(messages.filter(item=>item.role==='system').length,1);
    assert.ok(!messages.some(item=>item.content==='Untrusted replacement history'));
  }
});

test('a factual question does not resolve another offer or change a prepared selection',async()=>{
  let factual=false;
  let resolutions=0;
  const provider=fakeProvider();
  const original=provider.resolveOffer;
  provider.resolveOffer=async args=>{resolutions++;return original(args);};
  const store=fakeStore();
  const env={DB:fakeDb(),AI:{async run(_model,input){
    if(input.messages[0].content.includes('Conversation Intelligence parser')) return {response:JSON.stringify({intentPatch:factual?{locale:'en',goal:'DETAILS',dateConstraint:{kind:'EXACT',exact:'2026-11-12'},party:{adults:5},selectedProductId:'love-travel-robinson-island'}:{locale:'en',goal:'BOOK',dateConstraint:{kind:'EXACT',exact:'2026-10-07'},party:{adults:2},bookingRequested:true}})};
    return {response:JSON.stringify({reply:factual?'The tour includes a boat.':'Your verified trip costs $98.',recommendedProductId:'love-travel-hon-mun',selectedOfferId:factual?'':'offer-hon-mun',action:factual?'GENERAL':'OFFER_READY',nextQuestionCode:'',evidenceRefs:[]})};
  }}};
  const orchestrator=createLoveTravelSalesOrchestrator({env,provider,store,now:()=>new Date('2026-10-06T12:00:00.000Z')});
  await orchestrator.turn({sessionId:'protected-session-123456789012',locale:'en',message:'Prepare Hon Mun for two adults tomorrow.'});
  const before=store._current();const previousResolutions=resolutions;
  factual=true;
  const answer=await orchestrator.turn({sessionId:'protected-session-123456789012',locale:'en',message:'What is included in Robinson?'});
  assert.equal(answer.reply,'The tour includes a boat.');
  assert.equal(answer.offers.length,0);
  assert.equal(resolutions,previousResolutions);
  assert.deepEqual(store._current(),before);
  assert.equal(answer.agent.mutationExecuted,false);
});

function configuredBookingHarness(goal='PICKUP',message='Change pickup from Amiana.',optionChange=false){
  const selectedDomain=domain();
  selectedDomain.rates.push({id:202});
  if(optionChange){selectedDomain.rates[0].title='Bai Tranh Beach';selectedDomain.rates[1].title='Mini Beach';}
  selectedDomain.availabilitySlots[0].rates.push({id:202});
  selectedDomain.experience.pickup.places.push({id:502,title:'Amiana'});
  selectedDomain.experience.dropoff={enabled:true,places:[{id:601,title:'Return hotel'}]};
  const ui={productId:'1287580',date:'2026-10-07',slotId:'slot-1',rateId:'202',startTimeId:'301',participants:{101:2},
    pickup:{mode:'PICKUP',placeId:'501',roomNumber:'804',answers:{gate:'lobby'}},dropoff:{mode:'DROPOFF',placeId:'601'},
    customer:{firstName:'Demo',lastName:'Passenger',email:'private@example.test',phoneNumber:'000000000'},
    answers:{custom:'sensitive_answer_marker'},extras:{701:1},extraAnswers:{701:{extraQuestion:'extra answer'}},
    passengers:[{categoryId:'101',firstName:'Demo',lastName:'One',answers:{passengerQuestion:'private passenger answer'},extras:{702:{quantity:1,answers:{meal:'vegetarian'}}}}],
  };
  const selectedOffer={...offer(),offerId:'kept-user-rate',rateRef:{...offer().rateRef,externalId:'202'},price:{amount:123,currency:'USD'}};
  let tx={transactionId:'txn-configured-ui-session-123456789',revision:4,state:'QUOTE_READY',selection:canonicalBookingSelectionFromBokun(selectedDomain,ui),
    selectedOfferId:selectedOffer.offerId,quote:{quoteId:'quote-test',revision:1,status:'ACTIVE',expiresAt:'2026-10-06T13:00:00Z',offer:selectedOffer,readyToBook:false,issues:{bookingDataIssues:[]}},providerBooking:null};
  const original=bokunSelectionFromCanonicalSelection(tx.selection);
  const commands=[],modelInputs=[],providerCalls=[];
  const env={DB:fakeDb(),AI_MODEL:'fake',BOOKING_SESSIONS:{idFromName:id=>id,get:()=>({async fetch(request){
    const body=await request.json();
    if(request.url.endsWith('/initialize'))return new Response(JSON.stringify({ok:true,transaction:tx}));
    commands.push(body);
    assert.equal(body.action,'SYNC_SELECTION');assert.equal(body.expectedRevision,tx.revision);
    const updatedOffer={...tx.quote.offer,rateRef:{...tx.quote.offer.rateRef,externalId:String(body.selection.rateId)},offerId:'updated-user-rate',pickup:{mode:'PICKUP',placeRef:{provider:'BOKUN',resourceType:'PICKUP_PLACE',externalId:String(body.selection.pickup.placeId),accountRef:'137689'}},price:{amount:137,currency:'USD'}};
    tx={...tx,revision:tx.revision+1,selection:canonicalBookingSelectionFromBokun(selectedDomain,body.selection),selectedOfferId:updatedOffer.offerId,quote:{...tx.quote,revision:tx.quote.revision+1,offer:updatedOffer}};
    return new Response(JSON.stringify({ok:true,transaction:tx,resolution:{selection:body.selection}}));
  }})},AI:{async run(_model,input){
    modelInputs.push(input.messages[0].content);
    if(input.messages[0].content.includes('Conversation Intelligence parser')){
      return {response:{intentPatch:{locale:'en',goal,...(goal==='PICKUP'?{hotel:'Amiana',pickupPreference:'PICKUP'}:{})}}};
    }
    return {response:{reply:'The current verified offer '+(optionChange?selectedDomain.rates.find(r=>String(r.id)===String(tx.selection.rateRef.externalId)).title+' ':'')+'is $'+tx.quote.offer.price.amount+'.',recommendedProductId:'love-travel-hon-mun',selectedOfferId:tx.quote.offer.offerId,action:'RECOMMEND',nextQuestionCode:'',evidenceRefs:[]}};
  }}};
  const provider={...fakeProvider(),async getDomains(options){providerCalls.push(options);return [selectedDomain];}};
  const store=fakeStore();
  const app=createLoveTravelSalesOrchestrator({env,store,provider,now:()=>new Date('2026-10-06T12:00:00Z')});
  return {turn:()=>app.turn({sessionId:'configured-ui-session-123456789',locale:'en',message}),commands,modelInputs,providerCalls,original,tx:()=>tx};
}

test('explicit pickup correction changes only pickup in the existing authoritative UI transaction',async()=>{
  const h=configuredBookingHarness();
  const result=await h.turn();
  assert.equal(h.commands.length,1);
  const {pickup:originalPickup,...original}=h.original;
  const {pickup:changedPickup,...changed}=h.commands[0].selection;
  assert.deepEqual(changed,original);
  assert.equal(changedPickup.placeId,'502');assert.equal(changedPickup.roomNumber,'804');assert.deepEqual(changedPickup.answers,{gate:'lobby'});
  assert.equal(result.transaction.transactionId,'txn-configured-ui-session-123456789');
  assert.equal(result.bookingSelection.rateId,'202');assert.deepEqual(result.bookingSelection.participants,{101:2});
  assert.equal(result.agent.selectedOfferId,'updated-user-rate');assert.equal(result.transaction.quote.offer.price.amount,137);assert.equal(result.agent.mutationExecuted,false);
  assert.ok(!h.modelInputs.some(text=>text.includes('private@example.test')||text.includes('sensitive_answer_marker')||text.includes('private passenger answer')));
  assert.equal(h.tx().providerBooking,null);
});

for(const goal of ['BOOK','PRICE','AVAILABILITY']){
  test('current Quote scope preserves the UI date, rate and participants for '+goal,async()=>{
    const h=configuredBookingHarness(goal,goal==='BOOK'?'Book it.':goal==='PRICE'?'What is the price?':'Is this trip available?');
    const result=await h.turn();
    assert.equal(h.commands.length,0);
    assert.deepEqual(result.bookingSelection,h.original);
    assert.equal(result.transaction.transactionId,'txn-configured-ui-session-123456789');
    assert.equal(result.agent.selectedOfferId,'kept-user-rate');assert.equal(result.agent.mutationExecuted,false);
    assert.equal(h.tx().revision,4);assert.equal(h.tx().providerBooking,null);
  });
}

test('changing a named option preserves every other dimension in the same authoritative UI transaction',async()=>{
  const h=configuredBookingHarness('GENERAL','Change to Bai Tranh Beach.',true);
  const result=await h.turn();
  assert.equal(h.commands.length,1);
  const {rateId:beforeRate,...before}=h.original;
  const {rateId:afterRate,...after}=h.commands[0].selection;
  assert.equal(beforeRate,'202');assert.equal(afterRate,'201');assert.deepEqual(after,before);
  assert.equal(result.transaction.transactionId,'txn-configured-ui-session-123456789');
  assert.equal(result.bookingSelection.rateId,'201');assert.equal(result.transaction.quote.offer.rateRef.externalId,'201');
  assert.equal(result.agent.mutationExecuted,false);assert.equal(h.tx().providerBooking,null);
  assert.ok(!h.modelInputs.some(text=>text.includes('private@example.test')||text.includes('sensitive_answer_marker')));
});

test('party correction after UI option selection keeps its non-default rate and all transport/contact/extras',async()=>{
  const h=configuredBookingHarness('GENERAL','Change the party to 3 adults.');
  const result=await h.turn();
  assert.equal(h.commands.length,1);
  const {participants:oldParty,passengers:oldPassengers,...before}=h.original;
  const {participants:newParty,passengers:newPassengers,...after}=h.commands[0].selection;
  assert.deepEqual(after,before);assert.deepEqual(newParty,{'101':3});assert.deepEqual(newPassengers,oldPassengers);
  assert.equal(result.bookingSelection.rateId,'202');assert.equal(result.agent.mutationExecuted,false);
});
