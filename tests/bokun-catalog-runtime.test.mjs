import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const runtime=await readFile(resolve(root,'src/runtime-api.js'),'utf8');
const catalogUi=await readFile(resolve(root,'src/catalog-show-press.js'),'utf8');
const adapter=await readFile(resolve(root,'src/bokun-adapter.js'),'utf8');

test('LoveTravel customer catalog prefers the live two-product Bókun endpoint', () => {
  assert.match(runtime, /fetch\('\/api\/bokun\/tours\?locale='\+encodeURIComponent\(locale\)/);
  assert.match(runtime, /data\?\.vendorId === '137689'/);
  assert.match(runtime, /data\.tours\.length === 2/);
  assert.match(runtime, /'1287578','1287580'/);
  assert.match(runtime, /applyCatalog\(data\.tours, 'bokun'\)/);
  assert.match(runtime, /LOVE_TRAVEL_BOKUN_ACTIVE = source === 'bokun'/);
});

test('LoveTravel keeps the static catalog only as a fail-safe', () => {
  const liveIndex=runtime.indexOf("fetch('/api/bokun/tours?locale='");
  const fallbackIndex=runtime.indexOf("fetch('/catalog.v28.json'");
  assert.ok(liveIndex >= 0);
  assert.ok(fallbackIndex > liveIndex);
  assert.match(runtime, /static-fallback/);
});

test('local MAX TOUR demo tours and departures do not contaminate the live Bókun catalog', () => {
  assert.match(runtime, /!globalThis\.LOVE_TRAVEL_BOKUN_ACTIVE && Array\.isArray\(data\.customTours\)/);
  assert.match(runtime, /!globalThis\.LOVE_TRAVEL_BOKUN_ACTIVE\) applyGroupDepartures/);
  assert.match(catalogUi, /if \(globalThis\.LOVE_TRAVEL_BOKUN_ACTIVE\) return 0/);
  assert.match(catalogUi, /if \(globalThis\.LOVE_TRAVEL_BOKUN_ACTIVE\) return true/);
});

test('Bókun tours expose compatibility fields without inventing operator metadata', () => {
  assert.match(adapter,/const popular = productFlags\.some/);
  assert.match(adapter,/const formatsLabel = product\.privateActivity === true/);
  assert.doesNotMatch(adapter,/popular\s*:\s*true/);
  assert.doesNotMatch(adapter,/location\?\.city \|\| 'Nha Trang'/);
  assert.doesNotMatch(adapter,/state \|\| 'Khánh Hòa'/);
  assert.match(adapter,/searchText/);
  assert.match(adapter,/priceFromUsd/);
  assert.match(adapter,/liked\s*:\s*false/);
  assert.match(adapter,/localization:domain\.localization \|\| null/);
  assert.match(adapter,/group\s*:\s*\{/);
});
