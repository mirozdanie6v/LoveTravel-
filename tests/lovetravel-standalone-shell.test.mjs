import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const build=await readFile(resolve(root,'build.mjs'),'utf8');
const shell=await readFile(resolve(root,'src/lovetravel-shell.js'),'utf8');
const runtime=await readFile(resolve(root,'src/lovetravel-runtime.js'),'utf8');
const domain=await readFile(resolve(root,'src/lovetravel-domain-tour.js'),'utf8');
const configurator=await readFile(resolve(root,'src/lovetravel-booking-configurator.js'),'utf8');

test('LoveTravel customer bundle has no MAX TOUR runtime surface',()=>{
  const forbidden=[
    'catalog.v28.json','runtime-api.js','booking-pricing.js','traveler-profile.js','trip-actions.js',
    'trip-policy-live-v2.js','hero-redesign.js','role-switch.js','ai-consultant.js','ai-consultant-v5.js',
    'ai-location-guard-v6.js','ai-catalog-card-v7.js','tour-departure-live-v3.js','ai-booking-bridge-v25.js',
    'catalog-show-press.js','tour-lightbox.js','production-embed-polish.js','admin/index.html','director/index.html',
    'max-tour-logo.svg'
  ];
  for(const token of forbidden) assert.equal(build.includes(token),false,token);
  for(const required of ['lovetravel-shell.js','lovetravel-runtime.js','lovetravel-brand.js','lovetravel-domain-tour.js','lovetravel-booking-configurator.js']){
    assert.equal(build.includes(required),true,required);
  }
});

test('canonical customer runtime accepts only the two LoveTravel Bókun products and never falls back to static tours',()=>{
  assert.match(runtime,/PRODUCT_IDS = \['1287578','1287580'\]/);
  assert.match(runtime,/data\.tours\.length !== 2/);
  assert.match(runtime,/LOVE_TRAVEL_CATALOG_SOURCE = 'unavailable'/);
  assert.doesNotMatch(runtime,/catalog\.v28|static-fallback|dalat|danang|phuquoc|hanoi/i);
});

test('public navigation exposes only home and catalog while unfinished legacy flows stay unreachable',()=>{
  assert.match(shell,/data-screen="home"/);
  assert.match(shell,/data-screen="catalog"/);
  assert.doesNotMatch(shell,/data-screen="(?:trips|ai|admin|director|booking)"/);
  assert.doesNotMatch(shell,/Мои поездки|ИИ-Помощник/);
});

test('tour details are informational and BookingConfigurator is the only interactive booking selector',()=>{
  const start=domain.indexOf('function renderDomain');
  const end=domain.indexOf('function wire(',start);
  const render=domain.slice(start,end);
  assert.doesNotMatch(render,/rateCards\(domain,state\)/);
  assert.doesNotMatch(render,/availabilityCards\(domain,state\)/);
  assert.doesNotMatch(render,/participantPrices\(domain,state\)/);
  assert.doesNotMatch(render,/bookingDynamic\(domain\)/);
  for(const step of ["'date'","'option'","'guests'","'pickup'","'extras'","'contact'"]) assert.ok(configurator.includes(step),step);
});

test('customer-facing booking copy does not expose Bókun implementation language',()=>{
  for(const phrase of [
    'Бронирование пока не отправляется в Bókun',
    'The booking is not sent to Bókun',
    'Bókun asks for a room number',
    'Đặt chỗ chưa được gửi tới Bókun'
  ]) assert.equal(configurator.includes(phrase),false,phrase);
});
