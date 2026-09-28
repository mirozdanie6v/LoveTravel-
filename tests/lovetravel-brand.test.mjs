import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const js=await readFile(resolve(root,'src/lovetravel-brand.js'),'utf8');
const css=await readFile(resolve(root,'src/lovetravel-brand.css'),'utf8');
const build=await readFile(resolve(root,'build.mjs'),'utf8');

test('LoveTravel public branding script is valid and uses the official Nha Trang Love logo asset', () => {
  assert.doesNotThrow(() => new Function(js));
  assert.match(js,/bizweb\.dktcdn\.net\/100\/416\/263\/themes\/809458\/assets\/logo\.png/);
  assert.match(js,/Nha Trang Love Travel/);
  assert.match(js,/Robinson Beach/);
  assert.match(js,/Hòn Mun Marine Park/);
  assert.match(js,/LOVE_TRAVEL_BOKUN_ACTIVE/);
});

test('LoveTravel branding replaces the old multi-destination hero with a two-product client experience', () => {
  assert.match(js,/className='hero lt-hero'/);
  assert.match(js,/data-lt-action="catalog"/);
  assert.match(js,/data-lt-action="ai"/);
  assert.doesNotMatch(js,/Дананг.*Фукуок.*Муйне/s);
  assert.match(css,/\.lt-hero/);
  assert.match(css,/--lt-hero-image/);
  assert.match(css,/\.lt-home-trust/);
});

test('LoveTravel catalog presentation removes irrelevant MAX TOUR filters and styles live Bókun cards', () => {
  assert.match(css,/#catalogScreen \.catalog-search-v26[\s\S]*display:none!important/);
  assert.match(css,/#catalogScreen \.catalog-filter-v26[\s\S]*display:none!important/);
  assert.match(css,/#catalogScreen \.wide-card/);
  assert.match(css,/\.lt-card-action/);
  assert.match(js,/catalogIntro/);
});

test('LoveTravel build publishes and loads branding after the runtime adapter', () => {
  assert.match(build,/lovetravel-brand\.css/);
  assert.match(build,/lovetravel-brand\.js/);
  assert.match(build,/copyFile\(resolve\(root, 'src\/lovetravel-brand\.css'/);
  assert.match(build,/copyFile\(resolve\(root, 'src\/lovetravel-brand\.js'/);
  const runtimeIndex=build.indexOf('<script src="/runtime-api.js" defer></script>');
  const brandIndex=build.indexOf('<script src="/lovetravel-brand.js" defer></script>');
  assert.ok(runtimeIndex >= 0 && brandIndex > runtimeIndex);
  assert.match(build,/data-project="LoveTravel"/);
});
