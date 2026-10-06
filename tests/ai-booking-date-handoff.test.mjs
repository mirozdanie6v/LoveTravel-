import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const bridge=await readFile(resolve(root,'src/ai-booking-bridge-v25.js'),'utf8');
const consultant=await readFile(resolve(root,'src/ai-consultant-v5.js'),'utf8');

test('AI booking bridge uses structured BookingConfigurator transaction handoff',()=>{
  assert.match(bridge,/LoveTravelBookingConfigurator/);
  assert.match(bridge,/refreshTransaction/);
  assert.match(bridge,/applySelection/);
  assert.match(bridge,/openStructuredBooking/);
  assert.match(bridge,/configurator\.open\?\.\(\)/);
});

test('critical AI booking bridge no longer searches or clicks booking DOM heuristically',()=>{
  assert.doesNotMatch(bridge,/MutationObserver/);
  assert.doesNotMatch(bridge,/setTimeout/);
  assert.doesNotMatch(bridge,/querySelectorAll\(['"]button/);
  assert.doesNotMatch(bridge,/bookingButtonInTour/);
  assert.doesNotMatch(bridge,/continueOnceToBooking/);
  assert.doesNotMatch(bridge,/BOOKING_INTENT_KEY/);
  assert.doesNotMatch(bridge,/sessionStorage/);
});

test('AI consultant startBooking reads current transaction rather than replaying DOM intent',()=>{
  const start=consultant.slice(
    consultant.indexOf('async function startBooking'),
    consultant.indexOf('function renderRecommendations'),
  );
  assert.match(start,/LoveTravelBookingConfigurator/);
  assert.match(start,/refreshTransaction/);
  assert.match(start,/applySelection/);
  assert.doesNotMatch(start,/continueToBooking/);
  assert.doesNotMatch(start,/BOOKING_INTENT_KEY/);
  assert.doesNotMatch(start,/sessionStorage/);
  assert.doesNotMatch(start,/setTimeout/);
});

test('legacy MutationObserver booking-intent orchestration is removed from AI consultant',()=>{
  assert.doesNotMatch(consultant,/const observer = new MutationObserver\(\(\) => \{[\s\S]*BOOKING_INTENT_KEY/);
});
