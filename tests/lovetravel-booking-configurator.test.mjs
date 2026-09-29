import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const js=await readFile(resolve(root,'src/lovetravel-booking-configurator.js'),'utf8');
const css=await readFile(resolve(root,'src/lovetravel-booking-configurator.css'),'utf8');
const build=await readFile(resolve(root,'build.mjs'),'utf8');
const worker=await readFile(resolve(root,'src/worker-r2.js'),'utf8');

test('booking configurator is syntactically valid and resolver-backed',()=>{
  assert.doesNotThrow(()=>new Function(js));
  assert.match(js,/\/api\/bokun\/booking-selection\/resolve/);
  assert.match(js,/lovetravel\.booking-selection-resolution\.v1/);
  assert.match(js,/LoveTravelBookingConfigurator/);
});

test('booking configurator exposes all current selection dimensions',()=>{
  for(const token of ['date','startTimeId','slotId','rateId','participants','pickup','extras','customer','answers','passengers']){
    assert.ok(js.includes(token),token);
  }
  for(const step of ["'date'","'option'","'guests'","'pickup'","'extras'","'contact'"]){
    assert.ok(js.includes(step),step);
  }
});

test('calendar, rate, guest and pickup sheets are interactive',()=>{
  assert.match(js,/data-lt-date/);
  assert.match(js,/data-lt-slot/);
  assert.match(js,/data-lt-rate/);
  assert.match(js,/data-lt-guest-plus/);
  assert.match(js,/data-lt-pickup-mode/);
  assert.match(js,/data-lt-place/);
  assert.match(js,/data-lt-customer/);
  assert.match(js,/data-lt-answer/);
  assert.match(js,/data-lt-passenger-field/);
  assert.match(js,/data-lt-room-number/);
  assert.match(js,/data-lt-custom-pickup/);
  assert.match(js,/data-lt-extra-plus/);
});

test('configurator uses professional mobile sheet and sticky summary styles',()=>{
  for(const token of ['.lt-booking-config','.lt-booking-sheet__panel','.lt-booking-sticky','.lt-date-grid','.lt-pickup-results','.lt-contact-grid','.lt-passenger-card','.lt-extra-row','.lt-custom-pickup']){
    assert.ok(css.includes(token),token);
  }
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/@media\(max-width:520px\)/);
});

test('production build includes configurator after the domain tour runtime',()=>{
  assert.match(build,/lovetravel-booking-configurator\.css/);
  assert.match(build,/lovetravel-booking-configurator\.js/);
  const domain=build.indexOf('<script src="/lovetravel-domain-tour.js" defer></script>');
  const config=build.indexOf('<script src="/lovetravel-booking-configurator.js" defer></script>');
  assert.ok(domain>=0 && config>domain);
});

test('interactive resolver loads a 31-day window and pickup places lazily',()=>{
  assert.match(worker,/addIsoDays\(today, 30\)/);
  assert.match(worker,/String\(selection\?\.pickup\?\.mode \|\| ''\)\.toUpperCase\(\) === 'PICKUP'/);
  assert.match(worker,/includePickupPlaces,/);
});


test('calendar availability is cached independently from exact selection resolution',()=>{
  assert.match(js,/const calendarByKey = new Map\(\)/);
  assert.match(js,/function refreshCalendar\(/);
  assert.match(js,/function calendarFor\(/);
  assert.match(js,/function calendarTimesForDate\(/);
  assert.match(js,/if\(!data\.selection\?\.date\) storeCalendar\(productId,data\)/);
  assert.match(js,/date:null,[\s\S]*startTimeId:null,[\s\S]*slotId:null/);
});

test('single-time date selection uses cached month data and only one exact revalidation',()=>{
  assert.match(js,/const cachedTimes=calendarTimesForDate\(productId,date\)/);
  assert.match(js,/if\(cachedTimes\.length===1\)/);
  assert.match(js,/patchSelection\(productId,\{slotId:cachedTimes\[0\]\.id,startTimeId:cachedTimes\[0\]\.startTimeId\}\)/);
});

test('rate selection refreshes its calendar range without blocking the sheet flow',()=>{
  assert.match(js,/refreshCalendar\(productId,\{force:true\}\)\.catch/);
  assert.match(js,/calendar:\(\)=>activeProductId\?calendarFor\(activeProductId\):null/);
});

test('Bókun-only checkout requirements have dedicated editable controls',()=>{
  assert.match(js,/required_booking_question_missing/);
  assert.match(js,/required_custom_field_missing/);
  assert.match(js,/passenger_field_missing/);
  assert.match(js,/pickup_room_number_required/);
  assert.match(js,/required_extra_missing/);
  assert.match(js,/mainContactFields/);
});

test('contextual Bókun questions are routed to booking, passenger and extra controls',()=>{
  assert.match(js,/function questionContext\(/);
  assert.match(js,/data-lt-passenger-answer/);
  assert.match(js,/data-lt-extra-answer/);
  assert.match(js,/extraAnswers/);
  assert.match(js,/selectFromOptions/);
  assert.match(js,/dataType/);
  assert.match(js,/selectMultiple/);
  assert.match(js,/extra_booking_question/);
});

test('dynamic question controls support select, date and numeric provider types',()=>{
  assert.match(js,/item\?\.selectFromOptions/);
  assert.match(js,/typeName\.includes\('DATE'\)/);
  assert.match(js,/typeName\.includes\('NUMBER'\)/);
  assert.match(css,/\.lt-contact-field select/);
  assert.match(css,/\.lt-extra-questions/);
});

test('passenger-level extras have dedicated allocation and answer controls',()=>{
  assert.match(js,/passengerExtraState/);
  assert.match(js,/data-lt-passenger-extra-plus/);
  assert.match(js,/data-lt-passenger-extra-minus/);
  assert.match(js,/data-lt-passenger-extra-answer/);
  assert.match(js,/pricedPerPerson/);
  assert.match(css,/\.lt-passenger-extra/);
});


test('checkout-ready contact UI requires email and all four authoritative main-contact fields',()=>{
  assert.match(js,/CHECKOUT_REQUIRED_CUSTOMER_FIELDS = \['firstName','lastName','email','phoneNumber'\]/);
  assert.match(js,/function checkoutContactComplete\(/);
  assert.match(js,/new Map\(CHECKOUT_REQUIRED_CUSTOMER_FIELDS\.map/);
  assert.match(js,/!checkoutContactComplete\(next\)/);
});

test('pickup room requirement survives exact revalidation and uses the latest resolution',()=>{
  assert.match(js,/function openPickupSheet\(productId,query='',resolutionOverride=null\)/);
  assert.match(js,/const roomRequired=Boolean\(/);
  assert.match(js,/pickup_room_number_required/);
  assert.match(js,/openPickupSheet\(productId,currentQuery,next\)/);
  assert.match(js,/data-lt-room-number/);
});

test('mobile configurator uses readable single-column steps and brand primary CTA',()=>{
  assert.match(css,/@media\(max-width:520px\)[\s\S]*\.lt-booking-config__grid\{[\s\S]*grid-template-columns:1fr/);
  assert.match(css,/background:linear-gradient\(135deg,#ee4214,#ff7b2e\)/);
  assert.match(css,/-webkit-line-clamp:2/);
});


test('booking choices expose unmistakable selected state and accessible pressed state',()=>{
  assert.match(js,/aria-current="date"/);
  assert.match(js,/aria-pressed/);
  assert.match(js,/classList\.toggle\('is-active',active\)/);
  assert.match(css,/\.lt-date-chip\.is-active\{[\s\S]*#ee4214/);
  assert.match(css,/\.lt-pickup-mode\.is-active/);
});

test('pickup semantics and mobile keyboard behavior are explicit in the booking sheet',()=>{
  assert.match(js,/meetNote:/);
  assert.match(js,/pickupModeNote:/);
  assert.match(js,/pickupNote=/);
  assert.match(js,/syncVisualViewport/);
  assert.match(js,/window\.visualViewport/);
  assert.match(js,/scrollIntoView/);
  assert.match(js,/esc\(t\(\)\.yes\)/);
  assert.match(css,/--lt-vv-height/);
  assert.match(css,/--lt-keyboard-inset/);
});
