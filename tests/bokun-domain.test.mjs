import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBokunDomain, quoteMatrix } from '../src/bokun-domain.js';

const product={
  id:1287580,
  externalId:'5690738P7',
  title:'Hon Mun',
  description:'Live product',
  durationText:'7 hours',
  timeZone:'Asia/Ho_Chi_Minh',
  startPoints:[
    { id:1, title:'Pier A', address:{ addressLine1:'388 Võ Thị Sáu', city:'Nha Trang', geoPoint:{latitude:12.1,longitude:109.2} } },
    { id:2, title:'Pier B', address:{ addressLine1:'Second point', city:'Nha Trang', geoPoint:{latitude:12.2,longitude:109.3} } },
  ],
  pricingCategories:[
    {id:10,title:'Adult',ticketCategory:'ADULT',minAge:10,maxAge:99},
    {id:11,title:'Child',ticketCategory:'CHILD',minAge:5,maxAge:9},
  ],
  rates:[{
    id:20,
    title:'Bai Tranh Beach',
    rateCode:'TG2',
    minPerBooking:1,
    maxPerBooking:50,
    pricedPerPerson:true,
    pickupSelectionType:'OPTIONAL',
    pickupPricingType:'INCLUDED_IN_PRICE',
    dropoffSelectionType:'UNAVAILABLE',
    tieredPricingEnabled:true,
    startTimeIds:[30],
    tiers:[{id:99,minPassengersRequired:1,maxPassengersRequired:50,pricingCategoryId:10,activityRateId:20}],
    cancellationPolicy:{id:1,title:'Policy',penaltyRules:[{id:2,cutoffHours:24,charge:100,chargeType:'percentage',percentage:100}]},
  }],
  bookingQuestions:[{id:501,title:'Hotel name',required:true}],
  requiredCustomerFields:['FIRST_NAME','LAST_NAME','PHONE'],
  passengerFields:['FIRST_NAME'],
  mainContactFields:['EMAIL'],
  customFields:[{id:601,title:'Room number'}],
  bookableExtras:[{id:701,title:'Private transfer'}],
  pickupService:true,
  pickupPlaceGroups:[{id:801,title:'Nha Trang hotels'}],
  knowBeforeYouGoItems:[{id:901,title:'Bring sunscreen'}],
  supportedAccessibilityTypes:['WALKING'],
  unexpectedNewField:{ nested:'must survive schema drift' },
};

const availability=[
  {
    id:'30_20260929',
    activityId:1287580,
    activityTitle:'Hon Mun',
    activityOwnerId:137689,
    activityOwnerTitle:'Nha Trang Love Travel',
    startTime:'08:00',
    startTimeId:30,
    localizedDate:"Tue 29.Sep'26",
    availabilityCount:50,
    bookedParticipants:0,
    minParticipants:1,
    minParticipantsToBookNow:1,
    pickupAvailabilityCount:999,
    defaultRateId:20,
    rates:product.rates,
    pricesByRate:[{activityRateId:20,pricePerCategoryUnit:[
      {id:10,amount:{amount:49,currency:'USD'},minParticipantsRequired:1,maxParticipantsRequired:50},
      {id:11,amount:{amount:35,currency:'USD'},minParticipantsRequired:1,maxParticipantsRequired:50},
    ]}],
  },
  {
    id:'30_20260930',
    activityId:1287580,
    startTime:'08:00',
    startTimeId:30,
    localizedDate:"Wed 30.Sep'26",
    availabilityCount:42,
    bookedParticipants:8,
    defaultRateId:20,
    pricesByRate:[{activityRateId:20,pricePerCategoryUnit:[
      {id:10,amount:{amount:55,currency:'USD'}},
      {id:11,amount:{amount:39,currency:'USD'}},
    ]}],
  },
];

test('domain model preserves provider structures that do not exist in legacy MAX TOUR model',()=>{
  const d=buildBokunDomain(product,availability,{vendorId:'137689'});
  assert.equal(d.schemaVersion,'lovetravel.bokun-domain.v1');
  assert.equal(d.experience.meeting.startPoints.length,2);
  assert.equal(d.rates[0].pickup.selectionType,'OPTIONAL');
  assert.equal(d.rates[0].cancellationPolicy.penaltyRules[0].cutoffHours,24);
  assert.equal(d.extras[0].title,'Private transfer');
  assert.equal(d.bookingRequirements.questions[0].title,'Hotel name');
  assert.deepEqual(d.bookingRequirements.requiredCustomerFields,['FIRST_NAME','LAST_NAME','PHONE']);
  assert.equal(d.experience.pickup.placeGroups[0].title,'Nha Trang hotels');
  assert.equal(d.availabilitySlots[0].pickup.availabilityCount,999);
  assert.equal(d.availabilitySlots[0].minParticipantsToBookNow,1);
});

test('domain keeps a date x rate x participant price matrix instead of collapsing to first day',()=>{
  const d=buildBokunDomain(product,availability,{vendorId:'137689'});
  const matrix=quoteMatrix(d);
  assert.equal(matrix.length,4);
  const day1=matrix.find(x=>x.date==='2026-09-29' && String(x.participantCategoryId)==='10');
  const day2=matrix.find(x=>x.date==='2026-09-30' && String(x.participantCategoryId)==='10');
  assert.equal(day1.amount.amount,49);
  assert.equal(day2.amount.amount,55);
  assert.equal(d.availabilitySlots[1].availabilityCount,42);
  assert.equal(d.availabilitySlots[1].bookedParticipants,8);
});

test('schema drift is explicit and raw provider payload is retained losslessly',()=>{
  const d=buildBokunDomain(product,availability,{vendorId:'137689'});
  assert.ok(d.coverage.product.unmappedTopLevelFields.includes('unexpectedNewField'));
  assert.deepEqual(d.providerExtensions.unexpectedNewField,{nested:'must survive schema drift'});
  assert.deepEqual(d.providerRaw.product.unexpectedNewField,{nested:'must survive schema drift'});
  assert.equal(d.providerRaw.availability.length,2);
  assert.equal(d.coverage.rawPreserved,true);
});
