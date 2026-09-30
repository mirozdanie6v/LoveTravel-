import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBokunBookingDraft } from '../src/bokun-booking-draft.js';

const contract={
  options:[{
    type:'CUSTOMER_FULL_PAYMENT',
    currency:'USD',
    amount:35.77,
    paymentMethods:{allowedMethods:['ONLINE','CARD','RESERVE_FOR_EXTERNAL_PAYMENT']},
  }],
  questions:{
    mainContactDetails:[
      {questionId:'firstName',required:true,label:'First name'},
      {questionId:'lastName',required:true,label:'Last name'},
      {questionId:'email',required:true,label:'Your email address'},
      {questionId:'phoneNumber',required:true,label:'Phone number'},
    ],
    activityBookings:[{
      activityId:1287578,
      questions:[],
      passengers:[{
        pricingCategoryId:1250028,
        passengerDetails:[],
        questions:[],
        extras:[],
      }],
      pickupQuestions:[
        {questionId:'roomNumber',label:'Room number',required:false},
      ],
    }],
  },
};

function resolution(overrides={}){
  return {
    readyToQuote:true,
    selection:{
      productId:'1287578',
      date:'2026-10-01',
      startTimeId:'5782388',
      rateId:'2581224',
      participants:{1250028:2},
      pickup:{mode:'PICKUP',placeId:'15137113',roomNumber:'804'},
      extras:{},
      customer:{
        firstName:'Olga',
        lastName:'Test',
        phoneNumber:'+84000000000',
        email:'guest@example.com',
      },
      answers:{},
      passengers:[],
      ...overrides,
    },
    resolved:{
      slot:{id:'5782388_20261001',date:'2026-10-01',startTimeId:5782388},
      rate:{id:2581224},
      pickupPlace:{
        id:15137113,
        title:'Starcity Hotel & Condotel Beachfront Nha Trang',
        askForRoomNumber:true,
      },
    },
  };
}

test('maps a quote-ready LoveTravel selection to inert direct BookingRequest and reserve template',()=>{
  const draft=buildBokunBookingDraft(resolution(),contract,{
    externalBookingReference:'LT-TEST-001',
  });

  assert.equal(draft.writePerformed,false);
  assert.equal(draft.readyForCheckout,true);
  assert.equal(draft.readyForReserve,true);
  assert.equal(draft.issues.length,0);

  assert.equal(draft.bookingRequest.externalBookingReference,'LT-TEST-001');
  assert.equal(draft.bookingRequest.externalBookingEntityName,'VIIVERSION');
  assert.equal(draft.bookingRequest.externalBookingEntityCode,'LOVE_TRAVEL');

  const activity=draft.bookingRequest.activityBookings[0];
  assert.equal(activity.activityId,1287578);
  assert.equal(activity.rateId,2581224);
  assert.equal(activity.startTimeId,5782388);
  assert.equal(activity.date,'2026-10-01');
  assert.equal(activity.pickup,true);
  assert.equal(activity.pickupPlaceId,15137113);
  assert.deepEqual(activity.pickupAnswers,[{questionId:'roomNumber',values:['804']}]);
  assert.deepEqual(activity.passengers,[
    {pricingCategoryId:1250028},
    {pricingCategoryId:1250028},
  ]);

  assert.equal(draft.checkoutRequestTemplate.checkoutOption,'CUSTOMER_FULL_PAYMENT');
  assert.equal(draft.checkoutRequestTemplate.paymentMethod,'RESERVE_FOR_EXTERNAL_PAYMENT');
  assert.equal(draft.checkoutRequestTemplate.source,'DIRECT_REQUEST');
  assert.equal(draft.checkoutRequestTemplate.sendNotificationToMainContact,false);
  assert.equal(draft.checkoutRequestTemplate.showPricesInNotification,false);
  assert.equal(draft.checkout.currency,'USD');
});

test('dynamic checkout questions override product metadata and block missing email',()=>{
  const r=resolution({
    customer:{firstName:'Olga',lastName:'Test',phoneNumber:'+84000000000'},
  });
  const draft=buildBokunBookingDraft(r,contract,{externalBookingReference:'LT-TEST-002'});

  assert.equal(draft.readyForCheckout,false);
  assert.ok(draft.issues.some(item=>item.code==='required_checkout_answer_missing'&&item.questionId==='email'));
});

test('hotel pickup that asks for room number is blocked until roomNumber is present',()=>{
  const r=resolution({
    pickup:{mode:'PICKUP',placeId:'15137113',roomNumber:''},
  });
  const draft=buildBokunBookingDraft(r,contract,{externalBookingReference:'LT-TEST-003'});

  assert.equal(draft.readyForCheckout,false);
  assert.ok(draft.issues.some(item=>item.code==='pickup_room_number_required'));
});

test('meeting on location does not send pickup place or pickup answers',()=>{
  const r=resolution({
    pickup:{mode:'MEET_ON_LOCATION',placeId:null,roomNumber:''},
  });
  r.resolved.pickupPlace=null;
  const draft=buildBokunBookingDraft(r,contract,{externalBookingReference:'LT-TEST-004'});
  const activity=draft.bookingRequest.activityBookings[0];

  assert.equal(activity.pickup,false);
  assert.equal('pickupPlaceId' in activity,false);
  assert.equal('pickupAnswers' in activity,false);
});

test('booking-level extras remain fail-closed until their exact Bókun allocation contract is verified',()=>{
  const r=resolution({extras:{701:1}});
  const draft=buildBokunBookingDraft(r,contract,{externalBookingReference:'LT-TEST-005'});

  assert.equal(draft.readyForCheckout,false);
  assert.ok(draft.issues.some(item=>item.code==='booking_level_extra_mapping_not_verified'));
});

test('reserve draft is blocked when current checkout options do not expose RESERVE_FOR_EXTERNAL_PAYMENT',()=>{
  const noReserve={
    ...contract,
    options:[{
      type:'CUSTOMER_FULL_PAYMENT',
      currency:'USD',
      amount:35.77,
      paymentMethods:{allowedMethods:['CARD']},
    }],
  };
  const draft=buildBokunBookingDraft(resolution(),noReserve,{externalBookingReference:'LT-TEST-006'});
  assert.equal(draft.readyForReserve,false);
  assert.ok(draft.issues.some(item=>item.code==='reserve_for_external_payment_unavailable'));
});


test('maps Bókun dropoff place and custom dropoff into direct booking request',()=>{
  const byPlace=buildBokunBookingDraft(resolution({
    dropoff:{mode:'DROPOFF',placeId:'25136970',customLocation:null},
  }),contract,{externalBookingReference:'LT-TEST-DROPOFF-1'});
  const activityByPlace=byPlace.bookingRequest.activityBookings[0];
  assert.equal(activityByPlace.dropoff,true);
  assert.equal(activityByPlace.dropoffPlaceId,25136970);

  const custom=buildBokunBookingDraft(resolution({
    dropoff:{mode:'DROPOFF',placeId:null,customLocation:{wholeAddress:'2 Tran Phu, Nha Trang'}},
  }),contract,{externalBookingReference:'LT-TEST-DROPOFF-2'});
  const activityCustom=custom.bookingRequest.activityBookings[0];
  assert.equal(activityCustom.dropoff,true);
  assert.equal(activityCustom.dropoffDescription,'2 Tran Phu, Nha Trang');
});
