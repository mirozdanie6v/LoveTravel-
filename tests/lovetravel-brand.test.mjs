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
  assert.match(js,/PRODUCT_IDS = \['1287578','1287580'\]/);
});

test('LoveTravel branding replaces the old multi-destination hero with a two-product client experience', () => {
  assert.match(js,/className='hero lt-hero'/);
  assert.match(js,/data-lt-action="catalog"/);
  assert.match(js,/data-lt-action="ai"/);
  assert.doesNotMatch(js,/Дананг.*Фукуок.*Муйне/s);
  assert.match(css,/\.lt-hero/);
  assert.match(css,/--lt-hero-image/);
  assert.match(js,/querySelector\('\.lt-home-trust'\)\?\.remove\(\)/);
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
  const runtimeIndex=build.indexOf('<script src="/runtime-api.js');
  const brandIndex=build.indexOf('<script src="/lovetravel-brand.js?v=20261009-mobile-nav-v1" defer></script>');
  assert.ok(runtimeIndex >= 0 && brandIndex > runtimeIndex);
  assert.match(build,/data-project="LoveTravel"/);
});


test('LoveTravel exposes all public tabs while preserving the home AI entry',()=>{
  assert.match(js,/data-lt-action="ai"/);
  assert.doesNotMatch(css,/\.bottom-nav \.nav-btn:nth-child\(n\+3\)/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(js,/navigation\.'\+name/);
  assert.match(css,/\.lt-card-action[\s\S]*var\(--lt-orange-deep\)/);
});


test('LoveTravel localizes legacy card labels after dynamic catalog rendering', () => {
  assert.match(js,/legacyCardCopy/);
  assert.match(js,/zh:\{departure:'出发',finish:'结束',group:'拼团',individual:'私人',from:'起'\}/);
  assert.match(js,/replace\(\/выезд\/giu,words\.departure\)/);
  assert.match(js,/replace\(\/финиш\/giu,words\.finish\)/);
  assert.match(js,/localizeLegacyCard\(card,lang\)/);
});
