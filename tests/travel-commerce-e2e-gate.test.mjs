import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_SCHEMA_VERSIONS,
} from '../src/travel-commerce-contracts.js';
import {
  createInitialTravelIntent,
  extractConversationIntent,
  mergeIntentPatch,
  composeGroundedSalesPlan,
} from '../src/travel-sales-intelligence.js';
import {
  CapabilityPolicyError,
  createTravelCapabilityBroker,
  selectionFromTravelIntent,
} from '../src/travel-capability-broker.js';
import {
  createBookingTransaction,
} from '../src/travel-commerce-transaction.js';
import {
  createBookingSessionRuntime,
} from '../src/booking-session-runtime.js';

const at='2026-10-06T13:30:00.000Z';
const now=()=>new Date(at);
const providerRef=(resourceType,externalId)=>({
  provider:'BOKUN',
  resourceType,
  externalId:String(externalId),
  accountRef:'137689',
});

function domain({
  soldOut=false,
  customPickup=true,
  childMinAge=5,
  childMaxAge=9,
}={}){
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
      content:{inclusions:['Boat','Snorkeling equipment'],exclusions:[]},
      itinerary:[{title:'Hòn Mun',body:'Snorkeling stop'}],
      pickup:{
        enabled:true,
        customAllowed:customPickup,
        places:[{id:501,title:'Oceanus',location:{address:'03 Pham Van Dong'}}],
      },
      dropoff:{enabled:false},
      meeting:{},
    },
    participants:[
      {id:101,title:'Adult',ticketCategory:'ADULT',minAge:10,maxAge:99},
      {id:102,title:'Child',ticketCategory:'CHILD',minAge:childMinAge,maxAge:childMaxAge},
    ],
    rates:[{id:201}],
    availabilitySlots:[{
      id:'slot-1',
      date:'2026-10-07',
      startTime:'08:00',
      startTimeId:301,
      defaultRateId:201,
      soldOut,
      unavailable:false,
      availabilityCount:soldOut?0:20,
      unlimitedAvailability:false,
      rates:[{id:201}],
      priceQuotesByRate:[{rateId:201}],
    }],
    bookingRequirements:{},
    cancellationPolicy:null,
    extras:[],
  };
}

function offer(selection,{amount=98,status='AVAILABLE'}={}){
  const participantMix=[];
  if(Number(selection?.participants?.['101'])>0){
    participantMix.push({
      role:'ADULT',
      count:Number(selection.participants['101']),
      providerCategoryRef:providerRef('PRICING_CATEGORY','101'),
    });
  }
  if(Number(selection?.participants?.['102'])>0){
    participantMix.push({
      role:'CHILD',
      count:Number(selection.participants['102']),
      providerCategoryRef:providerRef('PRICING_CATEGORY','102'),
    });
  }
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Offer,
    offerId:'offer-hon-mun',
    productId:'love-travel-hon-mun',
    providerRef:providerRef('ACTIVITY','1287580'),
    rateRef:providerRef('RATE','201'),
    startTimeRef:providerRef('START_TIME','301'),
    date:'2026-10-07',
    participantMix,
    pickup:selection?.pickup?.mode==='PICKUP'
      ? {mode:'PICKUP',placeRef:providerRef('PICKUP_PLACE',selection.pickup.placeId||'501')}
      : {mode:'MEET_ON_LOCATION'},
    dropoff:{mode:'NO_DROPOFF'},
    price:{amount,currency:'USD'},
    availability:{status,remaining:status==='AVAILABLE'?20:0},
    restrictionCodes:[],
    evidenceRefs:[],
    generatedAt:at,
  };
}

function fakeProvider({
  soldOut=false,
  missingRequirement=false,
  customPickup=true,
  confirmationCode='NHA-119000001',
}={}){
  const d=domain({soldOut,customPickup});
  let submits=0;
  let resolveCalls=0;
  return {
    vendorId:'137689',
    async getDomains({productIds}={}){
      if(Array.isArray(productIds)&&productIds.length&&!productIds.map(String).includes('1287580')) return [];
      return [structuredClone(d)];
    },
    async resolveOffer({selection}){
      resolveCalls+=1;
      if(soldOut){
        return {
          domain:structuredClone(d),
          offer:null,
          resolution:{
            readyToQuote:false,
            readyToBook:false,
            selection:structuredClone(selection),
            quote:{available:false,total:null,currency:'USD'},
            constraints:{bookingRequirements:{}},
            resolved:{slot:null,rate:null},
            errors:[{code:'sold_out',message:'No capacity'}],
            warnings:[],
            bookingDataIssues:[],
          },
        };
      }
      const bookingDataIssues=missingRequirement
        ? [{code:'required_question_missing',fieldCode:'QUESTION:9001',message:'Passport number required'}]
        : [];
      return {
        domain:structuredClone(d),
        offer:offer(selection),
        resolution:{
          readyToQuote:true,
          readyToBook:!missingRequirement,
          selection:structuredClone(selection),
          quote:{available:true,total:98,currency:'USD'},
          constraints:{
            bookingRequirements:missingRequirement
              ? {questions:[{id:'9001',required:true,title:'Passport number'}]}
              : {},
          },
          resolved:{
            slot:{
              id:'slot-1',
              date:'2026-10-07',
              startTimeId:301,
              availabilityCount:20,
              soldOut:false,
              unavailable:false,
            },
            rate:{id:201},
          },
          errors:[],
          warnings:[],
          bookingDataIssues,
        },
      };
    },
    getBookingRequirements(resolution){
      return structuredClone(resolution?.constraints?.bookingRequirements||{});
    },
    async getCheckoutContract(){
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
      return {
        confirmationCode,
        status:'CONFIRMED',
        externalBookingReference:checkoutRequestTemplate.directBooking.externalBookingReference,
      };
    },
    async reconcileBooking(){return null;},
    counts(){return {submits,resolveCalls};},
  };
}

function transactionStore(initial){
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
    _audit(){return [...audit];},
  };
}

const messages={
  ru:'Двое взрослых, завтра хотим снорклинг, заберите нас из Oceanus.',
  en:'Two adults, tomorrow, snorkeling, pickup from Oceanus.',
  vi:'Hai người lớn, ngày mai muốn lặn ngắm san hô, đón tại Oceanus.',
  zh:'两位成人，明天想去浮潜，请从 Oceanus 接我们。',
  ko:'성인 두 명이고 내일 스노클링을 원합니다. Oceanus에서 픽업해 주세요.',
};

const replies={
  ru:'На завтра доступен Hòn Mun: 98 USD за двух взрослых. Могу перейти к подтверждению бронирования.',
  en:'Hòn Mun is available tomorrow at 98 USD for two adults. I can continue to booking approval.',
  vi:'Hòn Mun còn chỗ vào ngày mai với giá 98 USD cho hai người lớn. Tôi có thể chuyển sang bước xác nhận đặt chỗ.',
  zh:'Hòn Mun 明天可预订，两位成人价格为 98 USD。我可以继续进入预订确认。',
  ko:'Hòn Mun은 내일 예약 가능하며 성인 두 명 기준 98 USD입니다. 예약 확인 단계로 진행할 수 있습니다.',
};

function aiEnv(locale,{contradictPrice=false,localeOnly=false}={}){
  return {
    AI_MODEL:'fake',
    AI:{
      async run(_model,input){
        const system=String(input?.messages?.[0]?.content||'');
        if(system.includes('Conversation Intelligence parser')){
          if(localeOnly){
            return {response:JSON.stringify({
              intentPatch:{locale,goal:'GENERAL',bookingRequested:false},
            })};
          }
          return {response:JSON.stringify({
            intentPatch:{
              locale,
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
        if(system.includes('Sales Intelligence')){
          return {response:JSON.stringify({
            reply:contradictPrice
              ? 'Special price is $1 for this booking.'
              : replies[locale],
            recommendedProductId:'love-travel-hon-mun',
            selectedOfferId:'offer-hon-mun',
            action:'OFFER_READY',
            nextQuestionCode:'CONFIRM_BOOKING',
            evidenceRefs:[],
          })};
        }
        throw new Error('unexpected AI prompt');
      },
    },
  };
}

async function buildSalesEvidence(locale,provider,{env=aiEnv(locale)}={}){
  const broker=createTravelCapabilityBroker({provider,now});
  const initial=createInitialTravelIntent(locale);
  const productsPacket=await broker.execute('searchProducts',{
    start:'2026-10-07',
    end:'2026-10-07',
    lang:'EN',
    includePickupPlaces:true,
  },{principal:'ORCHESTRATOR'});
  const extracted=await extractConversationIntent({
    env,
    message:messages[locale],
    currentIntent:initial,
    locale,
    products:productsPacket.data,
    now:now(),
  });
  const intent=mergeIntentPatch(initial,{...extracted.patch,locale});
  const offersPacket=await broker.execute('searchOffers',{
    intent,
    productIds:['1287580'],
    lang:'EN',
  },{principal:'ORCHESTRATOR'});
  return {broker,initial,productsPacket,extracted,intent,offersPacket,env};
}

for(const locale of ['ru','en','vi','zh','ko']){
  test(`VII-119 positive multilingual vertical reaches confirmed Bókun state: ${locale}`,async()=>{
    const provider=fakeProvider({
      confirmationCode:`NHA-11900000${['ru','en','vi','zh','ko'].indexOf(locale)+1}`,
    });
    const sales=await buildSalesEvidence(locale,provider);
    const plan=await composeGroundedSalesPlan({
      env:sales.env,
      message:messages[locale],
      locale,
      intent:sales.intent,
      evidence:[sales.productsPacket,sales.offersPacket],
      goal:sales.extracted.goal,
    });

    assert.equal(sales.extracted.bookingRequested,true);
    assert.equal(sales.intent.dateConstraint.exact,'2026-10-07');
    assert.equal(sales.intent.party.adults,2);
    assert.equal(sales.intent.hotel,'Oceanus');
    assert.equal(sales.intent.pickupPreference,'PICKUP');
    assert.equal(sales.offersPacket.data.length,1);
    assert.equal(sales.offersPacket.data[0].offer.price.amount,98);
    assert.equal(plan.selectedOfferId,'offer-hon-mun');
    assert.equal(plan.recommendedProductId,'love-travel-hon-mun');

    const transactionId=`txn-vii119-${locale}`;
    const initialTx=createBookingTransaction({
      transactionId,
      shoppingSessionId:`shopping-vii119-${locale}`,
      now:now(),
    });
    const store=transactionStore(initialTx);
    const runtime=createBookingSessionRuntime({store,provider,now});

    const synced=await runtime.syncSelection({
      transactionId,
      expectedRevision:initialTx.revision,
      selection:sales.offersPacket.data[0].selection,
    });
    assert.equal(synced.transaction.state,'READY_FOR_APPROVAL');
    assert.equal(synced.transaction.quote.price.amount,98);
    assert.equal(synced.transaction.providerBooking,undefined);

    const approved=await runtime.dispatch({
      transactionId,
      expectedRevision:synced.transaction.revision,
      type:'APPROVE_QUOTE',
      payload:{
        approvalId:`approval-vii119-${locale}`,
        quoteId:synced.transaction.quote.quoteId,
        quoteRevision:synced.transaction.quote.revision,
      },
    });
    assert.equal(approved.transaction.state,'USER_APPROVED');
    assert.equal(approved.transaction.providerBooking,undefined);
    assert.equal(provider.counts().submits,0);

    const reserved=await runtime.reserve({
      transactionId,
      expectedRevision:approved.transaction.revision,
      quoteId:approved.transaction.quote.quoteId,
      quoteRevision:approved.transaction.quote.revision,
      demoToken:'test-demo-token',
    });

    assert.equal(reserved.transaction.state,'CONFIRMED');
    assert.match(reserved.transaction.providerBooking.confirmationCode,/^NHA-[0-9]+$/);
    assert.equal(provider.counts().submits,1);
    assert.ok(store._audit().includes('SELECTION_SYNCED'));
    assert.ok(store._audit().includes('APPROVE_QUOTE_APPLIED'));
    assert.ok(store._audit().includes('RESERVE_ADMITTED'));
    assert.ok(store._audit().includes('PROVIDER_RESERVE_CONFIRMED'));
  });
}

test('VII-119 invalid child age fails closed instead of silently selecting the first CHILD category',()=>{
  const d=domain({childMinAge:5,childMaxAge:9});
  const initial=createInitialTravelIntent('en');
  const intent=mergeIntentPatch(initial,{
    locale:'en',
    dateConstraint:{kind:'EXACT',exact:'2026-10-07'},
    party:{adults:1,childrenAges:[3]},
    preferenceAdds:['SNORKELING'],
    pickupPreference:'MEET_ON_LOCATION',
  });
  assert.throws(
    ()=>selectionFromTravelIntent(d,intent),
    error=>error instanceof CapabilityPolicyError&&error.code==='participant_category_unavailable',
  );
});

test('VII-119 sold-out provider evidence cannot become a bookable AI recommendation',async()=>{
  const provider=fakeProvider({soldOut:true});
  const sales=await buildSalesEvidence('en',provider);
  assert.equal(sales.offersPacket.data.length,1);
  assert.equal(sales.offersPacket.data[0].offer,null);
  assert.equal(sales.offersPacket.data[0].readyToBook,false);

  const plan=await composeGroundedSalesPlan({
    env:sales.env,
    message:messages.en,
    locale:'en',
    intent:sales.intent,
    evidence:[sales.productsPacket,sales.offersPacket],
    goal:sales.extracted.goal,
  });
  assert.equal(plan.selectedOfferId,'');
  assert.notEqual(plan.action,'OFFER_READY');
});

test('VII-119 missing provider booking requirement blocks approval/reserve readiness',async()=>{
  const provider=fakeProvider({missingRequirement:true});
  const sales=await buildSalesEvidence('en',provider);
  const row=sales.offersPacket.data[0];
  assert.equal(row.readyToBook,false);
  assert.ok(row.bookingDataIssues.some(item=>item.fieldCode==='QUESTION:9001'));

  const transactionId='txn-vii119-required-question';
  const initialTx=createBookingTransaction({transactionId,now:now()});
  const store=transactionStore(initialTx);
  const runtime=createBookingSessionRuntime({store,provider,now});
  const synced=await runtime.syncSelection({
    transactionId,
    expectedRevision:initialTx.revision,
    selection:row.selection,
  });

  assert.equal(synced.transaction.quote.readyToBook,false);
  assert.notEqual(synced.transaction.state,'READY_FOR_APPROVAL');
  assert.equal(provider.counts().submits,0);
});

test('VII-119 language switch changes presentation locale without losing authoritative commercial intent',async()=>{
  const first=await buildSalesEvidence('ru',fakeProvider());
  const switchEnv=aiEnv('en',{localeOnly:true});
  const extracted=await extractConversationIntent({
    env:switchEnv,
    message:'Please continue in English.',
    currentIntent:first.intent,
    locale:'en',
    products:first.productsPacket.data,
    now:now(),
  });
  const switched=mergeIntentPatch(first.intent,{...extracted.patch,locale:'en'});
  assert.equal(switched.locale,'en');
  assert.equal(switched.dateConstraint.exact,'2026-10-07');
  assert.equal(switched.party.adults,2);
  assert.equal(switched.hotel,'Oceanus');
  assert.equal(switched.pickupPreference,'PICKUP');
});

test('VII-119 unverified AI price is rejected and replaced by provider-grounded fallback',async()=>{
  const provider=fakeProvider();
  const env=aiEnv('en',{contradictPrice:true});
  const sales=await buildSalesEvidence('en',provider,{env});
  const plan=await composeGroundedSalesPlan({
    env,
    message:messages.en,
    locale:'en',
    intent:sales.intent,
    evidence:[sales.productsPacket,sales.offersPacket],
    goal:sales.extracted.goal,
  });
  assert.equal(plan.source,'deterministic-grounded-fallback');
  assert.doesNotMatch(plan.reply,/\$1\b/);
  assert.match(plan.reply,/98 USD/);
  assert.equal(plan.selectedOfferId,'offer-hon-mun');
});
