import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBookingSelection,
  rateSupportsSlot,
  resolveBookingSelection,
  slotBookability,
  zonedLocalToEpoch,
  selectionForPatch,
} from '../src/booking-selection-engine.js';

function domain() {
  return {
    schemaVersion:'lovetravel.bokun-domain.v1',
    provider:{ vendorId:137689, productId:1287580 },
    experience:{
      id:'1287580',
      title:'Hon Mun',
      location:{ timeZone:'Asia/Ho_Chi_Minh' },
      meeting:{ startPoints:[{id:1,title:'Pier'}] },
      pickup:{ enabled:true, placeGroups:[], customAllowed:false },
    },
    participants:[
      { id:101, title:'Adult', ticketCategory:'ADULT', minAge:10, maxAge:99 },
      { id:102, title:'Child', ticketCategory:'CHILD', minAge:5, maxAge:9 },
      { id:103, title:'Infant', ticketCategory:'INFANT', minAge:0, maxAge:4 },
    ],
    rates:[
      {
        id:201,title:'Bai Tranh',code:'TG2',minPerBooking:1,maxPerBooking:50,pricedPerPerson:true,
        startTimeIds:[301],allStartTimes:false,
        pickup:{selectionType:'OPTIONAL',pricingType:'INCLUDED_IN_PRICE',pricedPerPerson:true},
      },
      {
        id:202,title:'Mini Beach',code:'TG1',minPerBooking:2,maxPerBooking:10,pricedPerPerson:true,
        startTimeIds:[302],allStartTimes:false,
        pickup:{selectionType:'UNAVAILABLE',pricingType:'INCLUDED_IN_PRICE',pricedPerPerson:true},
      },
    ],
    extras:[],
    bookingRequirements:{
      bookingType:'DATE_AND_TIME',
      requiredCustomerFields:['firstName','lastName','phoneNumber'],
      mainContactFields:[
        {field:'FIRST_NAME',required:true,requiredBeforeDeparture:false},
        {field:'LAST_NAME',required:true,requiredBeforeDeparture:false},
        {field:'PHONE_NUMBER',required:true,requiredBeforeDeparture:false},
      ],
      passengerFields:[],
      questions:[],
      customFields:[],
      cutoff:{hours:2,days:0,weeks:0,minutes:0,type:'RELATIVE_TO_START_TIME'},
    },
    availabilitySlots:[
      {
        id:'301_20261001',date:'2026-10-01',localizedDate:"Thu 01.Oct'26",startTime:'08:00',startTimeId:301,recurrenceId:401,
        availabilityCount:5,bookedParticipants:0,unlimitedAvailability:false,soldOut:false,unavailable:false,
        minParticipants:1,minParticipantsToBookNow:1,defaultRateId:201,
        rates:[{id:201}],
        priceQuotesByRate:[
          {rateId:201,participantPrices:[
            {categoryId:101,amount:{amount:49,currency:'USD'},minParticipantsRequired:1,maxParticipantsRequired:3},
            {categoryId:101,amount:{amount:45,currency:'USD'},minParticipantsRequired:4,maxParticipantsRequired:50},
            {categoryId:102,amount:{amount:35,currency:'USD'},minParticipantsRequired:1,maxParticipantsRequired:50},
            {categoryId:103,amount:{amount:0,currency:'USD'},minParticipantsRequired:1,maxParticipantsRequired:50},
          ]},
        ],
        pickup:{availabilityCount:5,soldOut:false,price:null,pricesByCategory:{}},
      },
      {
        id:'302_20261001',date:'2026-10-01',localizedDate:"Thu 01.Oct'26",startTime:'10:00',startTimeId:302,recurrenceId:402,
        availabilityCount:10,bookedParticipants:0,unlimitedAvailability:false,soldOut:false,unavailable:false,
        minParticipants:1,minParticipantsToBookNow:1,defaultRateId:202,
        rates:[{id:202}],
        priceQuotesByRate:[
          {rateId:202,participantPrices:[
            {categoryId:101,amount:{amount:59,currency:'USD'},minParticipantsRequired:1,maxParticipantsRequired:50},
            {categoryId:102,amount:{amount:42,currency:'USD'},minParticipantsRequired:1,maxParticipantsRequired:50},
            {categoryId:103,amount:{amount:0,currency:'USD'},minParticipantsRequired:1,maxParticipantsRequired:50},
          ]},
        ],
        pickup:{availabilityCount:0,soldOut:true,price:null,pricesByCategory:{}},
      },
      {
        id:'301_20261002',date:'2026-10-02',localizedDate:"Fri 02.Oct'26",startTime:'08:00',startTimeId:301,recurrenceId:403,
        availabilityCount:2,bookedParticipants:3,unlimitedAvailability:false,soldOut:false,unavailable:false,
        minParticipants:1,minParticipantsToBookNow:1,defaultRateId:201,
        rates:[{id:201}],
        priceQuotesByRate:[
          {rateId:201,participantPrices:[
            {categoryId:101,amount:{amount:52,currency:'USD'},minParticipantsRequired:1,maxParticipantsRequired:50},
            {categoryId:102,amount:{amount:37,currency:'USD'},minParticipantsRequired:1,maxParticipantsRequired:50},
            {categoryId:103,amount:{amount:0,currency:'USD'},minParticipantsRequired:1,maxParticipantsRequired:50},
          ]},
        ],
        pickup:{availabilityCount:2,soldOut:false,price:null,pricesByCategory:{}},
      },
    ],
  };
}

const now = new Date('2026-09-28T00:00:00Z');

test('normalizes BookingSelection without inventing booking choices',()=>{
  const normalized=normalizeBookingSelection({
    productId:'1287580',
    date:'2026-10-01',
    participants:{101:2,102:1},
    pickup:{mode:'pickup'},
  },domain());
  assert.equal(normalized.schemaVersion,'lovetravel.booking-selection.v1');
  assert.equal(normalized.date,'2026-10-01');
  assert.equal(normalized.rateId,null);
  assert.equal(normalized.slotId,null);
  assert.deepEqual(normalized.participants,{'101':2,'102':1});
  assert.equal(normalized.pickup.mode,'PICKUP');
});

test('rate and date/time constraints are resolved from live domain relationships',()=>{
  const d=domain();
  assert.equal(rateSupportsSlot(d.rates[0],d.availabilitySlots[0]),true);
  assert.equal(rateSupportsSlot(d.rates[0],d.availabilitySlots[1]),false);

  const result=resolveBookingSelection(d,{
    productId:'1287580',
    date:'2026-10-01',
    startTimeId:'301',
    rateId:'201',
    participants:{101:2},
    pickup:{mode:'MEET_ON_LOCATION'},
  },{now});

  assert.equal(result.resolved.slot.id,'301_20261001');
  assert.equal(result.resolved.rate.id,'201');
  assert.deepEqual(result.constraints.dates.map(x=>x.date),['2026-10-01','2026-10-02']);
  assert.deepEqual(result.constraints.times.map(x=>x.startTime),['08:00']);
  assert.deepEqual(result.constraints.rates.map(x=>x.id),['201']);
  assert.equal(result.constraints.pickup.optional,true);
});

test('quote resolver chooses the applicable participant tier using total party size',()=>{
  const d=domain();
  const small=resolveBookingSelection(d,{
    productId:'1287580',date:'2026-10-01',startTimeId:'301',rateId:'201',
    participants:{101:2,102:1},pickup:{mode:'MEET_ON_LOCATION'},
  },{now});
  assert.equal(small.quote.available,true);
  assert.equal(small.quote.total,133);
  assert.equal(small.quote.participantLines.find(x=>x.categoryId==='101').amount.amount,49);

  const large=resolveBookingSelection(d,{
    productId:'1287580',date:'2026-10-01',startTimeId:'301',rateId:'201',
    participants:{101:4},pickup:{mode:'MEET_ON_LOCATION'},
  },{now});
  assert.equal(large.quote.available,true);
  assert.equal(large.quote.total,180);
  assert.equal(large.quote.participantLines[0].amount.amount,45);
});

test('capacity, rate minimum, pickup and stale combinations produce explicit constraint errors',()=>{
  const d=domain();

  const capacity=resolveBookingSelection(d,{
    productId:'1287580',date:'2026-10-02',startTimeId:'301',rateId:'201',
    participants:{101:3},pickup:{mode:'MEET_ON_LOCATION'},
  },{now});
  assert.ok(capacity.errors.some(x=>x.code==='insufficient_capacity'));
  assert.equal(capacity.readyToQuote,false);

  const minimum=resolveBookingSelection(d,{
    productId:'1287580',date:'2026-10-01',startTimeId:'302',rateId:'202',
    participants:{101:1},pickup:{mode:'PICKUP'},
  },{now});
  assert.ok(minimum.errors.some(x=>x.code==='below_rate_minimum'));
  assert.ok(minimum.errors.some(x=>x.code==='pickup_not_available'));

  const stale=resolveBookingSelection(d,{
    productId:'1287580',date:'2026-10-01',startTimeId:'301',rateId:'202',
    participants:{101:2},pickup:{mode:'MEET_ON_LOCATION'},
  },{now});
  assert.ok(stale.errors.some(x=>x.code==='rate_not_available_for_slot'));
});

test('booking cutoff is enforced using the product timezone',()=>{
  const d=domain();
  const before=slotBookability(d,d.availabilitySlots[0],new Date('2026-09-30T22:00:00Z'));
  assert.equal(before.bookable,true);

  const after=slotBookability(d,d.availabilitySlots[0],new Date('2026-10-01T00:00:00Z'));
  assert.equal(after.bookable,false);
  assert.ok(after.reasons.includes('booking_cutoff_passed'));

  const epoch=zonedLocalToEpoch('2026-10-01','08:00','Asia/Ho_Chi_Minh');
  assert.equal(new Date(epoch).toISOString(),'2026-10-01T01:00:00.000Z');
});

test('readyToBook remains false until Bókun-required customer fields are supplied',()=>{
  const d=domain();
  const selection={
    productId:'1287580',date:'2026-10-01',startTimeId:'301',rateId:'201',
    participants:{101:2},pickup:{mode:'MEET_ON_LOCATION'},
  };
  const unresolved=resolveBookingSelection(d,selection,{now});
  assert.equal(unresolved.readyToQuote,true);
  assert.equal(unresolved.readyToBook,false);
  assert.equal(unresolved.bookingDataIssues.filter(x=>x.code==='required_customer_field_missing').length,3);

  const complete=resolveBookingSelection(d,{
    ...selection,
    customer:{firstName:'A',lastName:'B',phoneNumber:'+84000000000'},
  },{now});
  assert.equal(complete.readyToQuote,true);
  assert.equal(complete.readyToBook,true);
});

test('selectionForPatch clears stale slot/time when date changes',()=>{
  const next=selectionForPatch({
    productId:'1287580',date:'2026-10-01',startTimeId:'301',slotId:'301_20261001',rateId:'201',
  },{date:'2026-10-02'});
  assert.equal(next.date,'2026-10-02');
  assert.equal(next.startTimeId,null);
  assert.equal(next.slotId,null);
  assert.equal(next.rateId,'201');
});
