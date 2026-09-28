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
  for(const step of ["'date'","'option'","'guests'","'pickup'","'contact'"]){
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
});

test('configurator uses professional mobile sheet and sticky summary styles',()=>{
  for(const token of ['.lt-booking-config','.lt-booking-sheet__panel','.lt-booking-sticky','.lt-date-grid','.lt-pickup-results','.lt-contact-grid']){
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
