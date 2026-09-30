import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const runtime=await readFile(resolve(root,'src/runtime-api.js'),'utf8');
const catalogUi=await readFile(resolve(root,'src/catalog-show-press.js'),'utf8');
const adapter=await readFile(resolve(root,'src/bokun-adapter.js'),'utf8');
const build=await readFile(resolve(root,'build.mjs'),'utf8');

test('LoveTravel customer catalog prefers the live two-product Bókun endpoint', () => {
  assert.match(runtime, /fetch\('\/api\/bokun\/tours\?locale='\+encodeURIComponent\(locale\)/);
  assert.match(runtime, /data\?\.vendorId === '137689'/);
  assert.match(runtime, /data\.tours\.length === 2/);
  assert.match(runtime, /'1287578','1287580'/);
  assert.match(runtime, /applyCatalog\(data\.tours, 'bokun'\)/);
  assert.match(runtime, /LOVE_TRAVEL_BOKUN_ACTIVE = source === 'bokun'/);
});

test('LoveTravel fails closed instead of exposing the legacy MAX TOUR catalog', () => {
  assert.match(runtime, /resetPublicCatalog\('loading'\)/);
  assert.match(runtime, /resetPublicCatalog\('unavailable'\)/);
  assert.match(runtime, /setCatalogGate\('ready'\)/);
  assert.match(runtime, /setCatalogGate\('error'\)/);
  assert.doesNotMatch(runtime, /fetch\('\/catalog\.v28\.json'/);
  assert.doesNotMatch(runtime, /static-fallback/);
  assert.match(build, /html:not\(\.love-travel-catalog-ready\) \.phone/);
  assert.match(build, /html\.love-travel-catalog-ready body::before/);
});

test('local MAX TOUR demo tours and departures cannot contaminate LoveTravel before Bókun loads', () => {
  assert.match(runtime, /LEGACY_PUBLIC_CATALOG_ALLOWED && !globalThis\.LOVE_TRAVEL_BOKUN_ACTIVE && Array\.isArray\(data\.customTours\)/);
  assert.match(runtime, /LEGACY_PUBLIC_CATALOG_ALLOWED && !globalThis\.LOVE_TRAVEL_BOKUN_ACTIVE\) applyGroupDepartures/);
  assert.match(catalogUi, /LEGACY_CATALOG_ALLOWED = globalThis\.LOVE_TRAVEL_ALLOW_LEGACY_CATALOG === true/);
  assert.match(catalogUi, /!LEGACY_CATALOG_ALLOWED \|\| globalThis\.LOVE_TRAVEL_BOKUN_ACTIVE/);
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
