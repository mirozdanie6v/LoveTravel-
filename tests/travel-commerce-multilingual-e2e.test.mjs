import test from 'node:test';
import assert from 'node:assert/strict';
import { createBokunProvider } from '../src/bokun-provider.js';
import { createTravelCapabilityBroker } from '../src/travel-capability-broker.js';
import {
  composeGroundedSalesPlan,
  createInitialTravelIntent,
  extractConversationIntent,
  mergeIntentPatch,
} from '../src/travel-sales-intelligence.js';
import { createBookingTransaction } from '../src/travel-commerce-transaction.js';
import { createBookingSessionRuntime } from '../src/booking-session-runtime.js';

const NOW=new Date('2026-10-06T12:00:00.000Z');
const DATE='2026-10-07';

function rawProduct(id){
  const honMun=String(id)==='1287580';
  return {
    id:Number(id),
    title:honMun?'Hòn Mun Marine Park Snorkeling':'Robinson Beach Island Tour',
    description:honMun?'Marine snorkeling tour':'Relaxed island and beach tour',
    timeZone:'Asia/Ho_Chi_Minh',
    locationCode:{name:'Nha Trang'},
    pricingCategories:[
      {id:101,title:'Adult',ticketCategory:'ADULT',minAge:10,maxAge:99},
      {id:102,title:'Child',ticketCategory:'CHILD',minAge:5,maxAge:9},
      {id:103,title:'Infant',ticketCategory:'INFANT',minAge:0,maxAge:4},
    ],
    defaultRateId:honMun?201:211,
    rates:[{
      id:honMun?201:211,
      title:honMun?'Hòn Mun':'Robinson Beach',
      rateCode:honMun?'HM1':'RB1',
      pricedPerPerson:true,
      minPerBooking:1,
      maxPerBooking:30,
      startTimeIds:[honMun?301:311],
      allStartTimes:false,
      pickupSelectionType:'OPTIONAL',
      pickupPricingType:'INCLUDED_IN_PRICE',
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
}

function rawAvailability(id,{soldOut=false,capacity=20,price=null}={}){
  const honMun=String(id)==='1287580';
  const rateId=honMun?201:211;
  const startTimeId=honMun?301:311;
  const adultPrice=price??(honMun?49:59);
  return [{
    id:`${startTimeId}_20261007`,
    localizedDate:"Wed 07.Oct'26",
    date:DATE,
    startTime:honMun?'08:00':'09:00',
    startTimeId,
    recurrenceId:honMun?401:411,
    availabilityCount:capacity,
    bookedParticipants:0,
    unlimitedAvailability:false,
    soldOut,
    unavailable:false,
    defaultRateId:rateId,
    rates:[{id:rateId}],
    pricesByRate:[{
      activityRateId:rateId,
      pricePerCategoryUnit:[
        {id:101,amount:{amount:adultPrice,currency:'USD'}},
        {id:102,amount:{amount:honMun?35:42,currency:'USD'}},
        {id:103,amount:{amount:0,currency:'USD'}},
      ],
    }],
  }];
}

const pickupPlaces={
  pickupPlaces:[{
    id:501,
    title:'Oceanus',
    type:'ACCOMMODATION',
    askForRoomNumber:false,
    location:{address:'03 Pham Van Dong',city:'Nha Trang',countryCode:'VN'},
  }],
  dropoffPlaces:[],
};

function checkoutContract(amount=98){
  return {
    options:[{
      type:'CUSTOMER_FULL_PAYMENT',
      currency:'USD',
      amount,
      paymentMethods:{allowedMethods:['RESERVE_FOR_EXTERNAL_PAYMENT']},
    }],
    questions:{
      mainContactDetails:[
        {questionId:'firstName',required:true},
        {questionId:'lastName',required:true},
        {questionId:'phoneNumber',required:true},
        {questionId:'email',required:true},
      ],
      activityBookings:[{
        activityId:1287580,
        questions:[],
        passengers:[{pricingCategoryId:101,passengerDetails:[],questions:[],extras:[]}],
        pickupQuestions:[],
      }],
    },
  };
}

function integrationTransport(options={}){
  const state={
    submitCalls:0,
    reconcileCalls:0,
    checkoutCalls:0,
    productCalls:0,
    availabilityCalls:0,
  };
  const fetchImpl=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url);
    const productId=url.searchParams.get('productId')||'1287580';
    if(url.pathname.endsWith('/api/bokun/product')){
      state.productCalls+=1;
      return Response.json(rawProduct(productId));
    }
    if(url.pathname.endsWith('/api/bokun/availability')){
      state.availabilityCalls+=1;
      const variant=typeof options.availability==='function'
        ? options.availability(productId)
        : rawAvailability(productId,options.availability||{});
      return Response.json(variant);
    }
    if(url.pathname.endsWith('/api/bokun/pickup-places')){
      return Response.json(options.pickupPlaces??pickupPlaces);
    }
    if(url.pathname.endsWith('/api/bokun/checkout/options')){
      state.checkoutCalls+=1;
      return Response.json(checkoutContract(options.checkoutAmount??98));
    }
    if(url.pathname.endsWith('/internal/lovetravel/bokun/demo-submit')){
      state.submitCalls+=1;
      if(options.submitError) throw options.submitError;
      const payload=JSON.parse(init.body||'{}');
      const ref=payload?.directBooking?.externalBookingReference||'';
      return Response.json({
        ok:true,
        booking:{
          confirmationCode:options.confirmationCode||'NHA-123456789',
          status:'CONFIRMED',
          paymentType:'NOT_PAID',
          totalPaid:0,
          externalBookingReference:ref,
        },
      });
    }
    if(url.pathname.endsWith('/internal/lovetravel/bokun/reconcile')){
      state.reconcileCalls+=1;
      return Response.json(options.reconcilePayload||{ok:true,found:false});
    }
    throw new Error('unexpected integration URL '+url.toString());
  };
  return {fetchImpl,state};
}

function commerceStore(initial){
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
      if(existing) return {transaction:structuredClone(current),receipt:structuredClone(existing),replayed:true};
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
    current:()=>structuredClone(current),
    audit:()=>[...audit],
  };
}

const localeCases={
  ru:{
    message:'Нас двое взрослых, завтра хотим снорклинг, заберите нас из Oceanus. Хотим забронировать.',
    reply:'Hòn Mun доступен 7 октября: 98 USD за двух взрослых. Могу продолжить бронирование.',
  },
  en:{
    message:'Two adults, tomorrow, snorkeling, pickup from Oceanus. We want to book.',
    reply:'Hòn Mun is available on October 7 at 98 USD for two adults. I can continue to booking.',
  },
  vi:{
    message:'Hai người lớn, ngày mai muốn lặn ngắm san hô, đón tại Oceanus. Chúng tôi muốn đặt tour.',
    reply:'Hòn Mun còn chỗ ngày 7 tháng 10 với giá 98 USD cho hai người lớn. Tôi có thể tiếp tục đặt tour.',
  },
  zh:{
    message:'两位成人，明天想浮潜，请从 Oceanus 接我们。我们想预订。',
    reply:'Hòn Mun 10月7日可预订，两位成人价格为 98 USD。我可以继续预订。',
  },
  ko:{
    message:'성인 두 명이고 내일 스노클링을 원해요. Oceanus에서 픽업해 주세요. 예약하고 싶어요.',
    reply:'Hòn Mun은 10월 7일 예약 가능하며 성인 두 명 기준 98 USD입니다. 예약을 계속할 수 있습니다.',
  },
};

function aiFor(locale,reply){
  return {
    async run(_model,input){
      const system=input.messages?.[0]?.content||'';
      if(system.includes('Conversation Intelligence parser')){
        return {response:JSON.stringify({
          intentPatch:{
            locale,
            dateConstraint:{kind:'EXACT',exact:DATE},
            party:{adults:2,childrenAges:[],infants:0},
            preferenceAdds:['SNORKELING'],
            hotel:'Oceanus',
            pickupPreference:'PICKUP',
            selectedProductId:'love-travel-hon-mun',
            goal:'BOOK',
            bookingRequested:true,
          },
        })};
      }
      const marker='VERIFIED_EVIDENCE=';
      const idx=system.lastIndexOf(marker);
      assert.ok(idx>=0,'sales intelligence must receive verified evidence');
      const evidence=JSON.parse(system.slice(idx+marker.length));
      const offers=evidence.flatMap(packet=>packet.capability==='searchOffers'?packet.data:[]);
      const row=offers.find(item=>item?.product?.productId==='love-travel-hon-mun'&&item?.offer);
      assert.ok(row?.offer,'verified Hòn Mun offer is required');
      return {response:JSON.stringify({
        reply,
        recommendedProductId:'love-travel-hon-mun',
        selectedOfferId:row.offer.offerId,
        action:'OFFER_READY',
        nextQuestionCode:'CONTACT_DETAILS',
        evidenceRefs:evidence.map(item=>item.evidenceId),
      })};
    },
  };
}

async function runLocaleVertical(locale,config){
  const transport=integrationTransport();
  const provider=createBokunProvider({
    fetchImpl:transport.fetchImpl,
    baseUrl:'https://integration.example',
    now:()=>NOW,
  });
  const broker=createTravelCapabilityBroker({provider,now:()=>NOW});
  const products=await broker.execute('searchProducts',{
    start:DATE,end:DATE,lang:'EN',includePickupPlaces:true,
  },{principal:'ORCHESTRATOR'});

  const env={AI_MODEL:'fake',AI:aiFor(locale,config.reply)};
  const initialIntent=createInitialTravelIntent(locale);
  const extracted=await extractConversationIntent({
    env,
    message:config.message,
    currentIntent:initialIntent,
    locale,
    products:products.data,
    now:NOW,
  });
  const intent=mergeIntentPatch(initialIntent,extracted.patch);
  assert.equal(intent.locale,locale);
  assert.equal(intent.dateConstraint.exact,DATE);
  assert.equal(intent.party.adults,2);
  assert.equal(intent.hotel,'Oceanus');

  const offers=await broker.execute('searchOffers',{
    intent,
    productIds:['1287580'],
    lang:'EN',
  },{principal:'ORCHESTRATOR'});
  const row=offers.data.find(item=>item?.offer);
  assert.ok(row?.offer);
  assert.equal(row.offer.price.amount,98);
  assert.equal(row.selection.pickup.placeId,'501');
  assert.equal(row.readyToBook,false,'contact data must still be collected');

  const plan=await composeGroundedSalesPlan({
    env,
    message:config.message,
    locale,
    intent,
    evidence:[products,offers],
    goal:extracted.goal,
  });
  assert.equal(plan.source,'workers-ai-grounded-sales');
  assert.equal(plan.selectedOfferId,row.offer.offerId);
  assert.equal(plan.action,'OFFER_READY');

  const transaction=createBookingTransaction({
    transactionId:`txn-e2e-${locale}`,
    shoppingSessionId:`shopping-e2e-${locale}`,
    now:NOW,
  });
  const store=commerceStore(transaction);
  const runtime=createBookingSessionRuntime({store,provider,now:()=>NOW});

  const incomplete=await runtime.syncSelection({
    transactionId:transaction.transactionId,
    expectedRevision:transaction.revision,
    selection:row.selection,
  });
  assert.equal(incomplete.transaction.state,'COLLECTING_REQUIRED_DATA');
  assert.equal(incomplete.transaction.quote.readyToBook,false);
  assert.ok(incomplete.transaction.quote.requiredFieldCodes.length>0);

  const completeSelection={
    ...row.selection,
    customer:{
      firstName:'Olga',
      lastName:'Test',
      phoneNumber:'+84900000000',
      email:'guest@example.com',
    },
  };
  const ready=await runtime.syncSelection({
    transactionId:transaction.transactionId,
    expectedRevision:incomplete.transaction.revision,
    selection:completeSelection,
  });
  assert.equal(ready.transaction.state,'READY_FOR_APPROVAL');
  assert.equal(ready.transaction.quote.readyToBook,true);

  const approved=await runtime.dispatch({
    transactionId:transaction.transactionId,
    expectedRevision:ready.transaction.revision,
    type:'APPROVE_QUOTE',
    payload:{
      approvalId:`approval-${locale}`,
      quoteId:ready.transaction.quote.quoteId,
      quoteRevision:ready.transaction.quote.revision,
    },
  });
  assert.equal(approved.transaction.state,'USER_APPROVED');

  const reserveRequest={
    transactionId:transaction.transactionId,
    expectedRevision:approved.transaction.revision,
    quoteId:approved.transaction.quote.quoteId,
    quoteRevision:approved.transaction.quote.revision,
    demoToken:'demo-token',
  };
  const confirmed=await runtime.reserve(reserveRequest);
  assert.equal(confirmed.transaction.state,'CONFIRMED');
  assert.match(confirmed.transaction.providerBooking.confirmationCode,/^NHA-[0-9]+$/);
  assert.equal(transport.state.submitCalls,1);
  assert.ok(store.audit().includes('PROVIDER_RESERVE_CONFIRMED'));

  const duplicate=await runtime.reserve(reserveRequest);
  assert.equal(duplicate.transaction.state,'CONFIRMED');
  assert.equal(duplicate.replayed,true);
  assert.equal(transport.state.submitCalls,1,'duplicate submit must never write Bókun twice');

  return {intent,plan,confirmed:confirmed.transaction};
}

for(const [locale,config] of Object.entries(localeCases)){
  test(`multilingual transactional vertical reaches provider-confirmed booking in ${locale}`,async()=>{
    const result=await runLocaleVertical(locale,config);
    if(locale!=='ru') assert.doesNotMatch(result.plan.reply,/[А-Яа-яЁё]/u);
    assert.equal(result.confirmed.providerBooking.status,'CONFIRMED');
  });
}
