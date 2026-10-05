import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const js=await readFile(resolve(root,'src/lovetravel-brand.js'),'utf8');
const css=await readFile(resolve(root,'src/lovetravel-brand.css'),'utf8');
const build=await readFile(resolve(root,'build.mjs'),'utf8');

test('LoveTravel public branding script is valid and uses the official client asset',()=>{
  assert.doesNotThrow(()=>new Function(js));
  assert.match(js,/bizweb\.dktcdn\.net\/100\/416\/263\/themes\/809458\/assets\/logo\.png/);
  assert.match(js,/Nha Trang Love Travel/);
  assert.match(js,/PRODUCT_IDS=new Set\(\['1287578','1287580'\]\)/);
});

test('home and catalog are deterministic semantic renderers, not post-render translators',()=>{
  assert.match(js,/LoveTravelI18n/);
  assert.match(js,/tr\('brand\.badge'\)/);
  assert.match(js,/tr\('brand\.catalogTitle'\)/);
  assert.match(js,/function catalogCard\(tour\)/);
  assert.match(js,/screen\.innerHTML=heroMarkup\(\)/);
  assert.doesNotMatch(js,/TreeWalker/);
  assert.doesNotMatch(js,/legacyCardCopy/);
  assert.doesNotMatch(js,/replace\(\/выезд/);
  assert.match(css,/\.lt-hero/);
  assert.match(css,/#catalogScreen \.wide-card/);
});

test('LoveTravel navigation is rendered from semantic nav keys',()=>{
  assert.match(js,/function renderNavigation\(\)/);
  assert.match(js,/'nav\.home'/);
  assert.match(js,/'nav\.catalog'/);
  assert.doesNotMatch(js,/textContent.*Главная/);
});

test('LoveTravel build publishes branding after the neutral runtime catalog',()=>{
  assert.match(build,/lovetravel-brand\.css/);
  assert.match(build,/lovetravel-brand\.js/);
  const runtimeIndex=build.indexOf('<script src="/runtime-api.js" defer></script>');
  const brandIndex=build.indexOf('<script src="/lovetravel-brand.js" defer></script>');
  assert.ok(runtimeIndex>=0&&brandIndex>runtimeIndex);
  assert.match(build,/data-project="LoveTravel"/);
});
