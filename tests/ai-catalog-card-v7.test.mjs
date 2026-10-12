import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const sourceDir = resolve(root, 'source');
const manifest = JSON.parse(await readFile(resolve(sourceDir, 'manifest.json'), 'utf8'));
const v7 = await readFile(resolve(root, 'src/ai-catalog-card-v7.js'), 'utf8');
const css = await readFile(resolve(root, 'src/ai-consultant-v5.css'), 'utf8');
const build = await readFile(resolve(root, 'build.mjs'), 'utf8');

async function restore(entry) {
  const encoded = (await Promise.all(entry.parts.map(part => readFile(resolve(sourceDir, part), 'ascii')))).join('');
  return gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
}

const prototypeHtml = await restore(manifest.html);

test('catalog card parity layer is syntactically valid and loaded after the LoveTravel AI', () => {
  assert.doesNotThrow(() => new vm.Script(v7));
  const aiIndex = build.indexOf('/ai-consultant-v5.js');
  const parityIndex = build.indexOf('/ai-catalog-card-v7.js');
  assert.ok(aiIndex >= 0 && parityIndex > aiIndex);
  assert.doesNotMatch(build, /<script src="\/ai-location-guard-v6\.js"><\/script>/);
  assert.match(build, /copyFile\(resolve\(root, 'src\/ai-catalog-card-v7\.js'/);
});

test('AI reuses native tour-card and strips AI-specific card layout classes', () => {
  assert.match(v7, /document\.querySelectorAll\('\.tour-card'\)/);
  assert.match(v7, /renderCatalog/);
  assert.match(v7, /cloneNode\(true\)/);
  assert.match(v7, /dataset\.aiCatalogSource = 'catalog'/);
  assert.match(v7, /classList\.remove\('ai-recommendation', 'ai-sales-card'\)/);
  assert.match(v7, /createCatalogCard/);
  assert.doesNotMatch(v7, /classList\.add\('ai-sales-card'/);
  assert.doesNotMatch(v7, /<article class="ai-recommendation ai-sales-card"/);
});

test('native catalog click behavior remains the interaction contract', () => {
  assert.match(prototypeHtml, /function renderCatalog\(/);
  const catalogStart = prototypeHtml.indexOf('function renderCatalog(');
  const catalogSlice = prototypeHtml.slice(catalogStart, catalogStart + 50000);
  assert.match(catalogSlice, /tour-card/);
  assert.match(catalogSlice, /openTour/);
  assert.match(v7, /tourIdFromCard/);
  assert.match(v7, /BOOKING_INTENT_KEY/);
  assert.match(v7, /rememberBookingIntent/);
});

test('legacy AI card CSS cannot override cloned native catalog cards', () => {
  assert.match(css, /\.ai-recommendation\.ai-sales-card/);
  assert.doesNotMatch(css, /#aiScreen \.ai-sales-card\s*\{/);
  assert.match(css, />\.tour-card\.ai-catalog-card-v7/);
});

test('parity API can inject a real catalog card for route-policy recovery', () => {
  assert.match(v7, /function createCatalogCard\(/);
  assert.match(v7, /globalThis\.MaxTourCatalogCardV7 = api/);
  assert.match(v7, /globalThis\.MaxTourCatalogCardV8 = api/);
  assert.match(v7, /dataset\.aiCatalogInjected/);
});

test('observer is idempotent and avoids character-data render loops', () => {
  assert.match(v7, /aiCatalogV7Observed/);
  assert.match(v7, /requestAnimationFrame\(run\)/);
  assert.match(v7, /observer\.observe\(aiRoot, \{ childList:true, subtree:true \}\)/);
  assert.doesNotMatch(v7, /characterData:true/);
  assert.match(v7, /\.ai-recommendation\.ai-sales-card\[data-tour-id\]/);
});


test('compatibility layer does not rewrite authoritative server AI replies', () => {
  assert.doesNotMatch(v7, /__maxTourSalesFinalizerV23/);
  assert.doesNotMatch(v7, /new Response\(JSON\.stringify\(\{ \.\.\.data, reply/);
});

test('upgraded booking CTA is localized from the active LoveTravel locale', () => {
  assert.match(v7, /max-tour-locale-v1/);
  assert.match(v7, /en:'Book'/);
  assert.match(v7, /const label = bookLabel\(\)/);
});

test('booking CTA refresh settles with an exact price and ignores changes outside the chat', () => {
  const frames = [], observers = [];
  let mutations = 0, writes = 0;
  const card = { dataset:{tourId:'1287578'}, nextElementSibling:null, after(button) {
    this.nextElementSibling = button; emit(list);
  }};
  let priceHtml='<div>from 49 USD</div>',priceWrites=0;
  const prices={get innerHTML(){return priceHtml;},set innerHTML(value){priceWrites++;priceHtml=value.replace(/ data-lt-exact-price(?=\s)/g,' data-lt-exact-price=""');emit(list);}};
  card.querySelector=()=>prices;
  const list = { querySelectorAll(selector) {
    return selector.includes('tour-card') ? [card] : card.nextElementSibling ? [card.nextElementSibling] : [];
  }};
  const root = { contains:node=>node===list, querySelectorAll:()=>[list] };
  function emit(target) {
    mutations++;
    for (const observer of observers) observer.callback([{target,addedNodes:[{}],removedNodes:[]}]);
  }
  const document = {
    documentElement:{}, readyState:'complete', head:{append(){}},
    getElementById:()=>({}), querySelector:()=>root, addEventListener(){},
    createElement:()=>({dataset:{}, get textContent(){return this.label||'';},set textContent(value){
      writes++; this.label=value; emit(list);
    }}),
  };
  const start = v7.indexOf("(() => {", v7.indexOf("(() => {")+1);
  vm.runInNewContext(v7.slice(start), {document,localStorage:{getItem:()=> 'en'},
    MaxTourAI:{pricePresentation:()=>({amount:'97.09 USD',label:'Total for your party',date:'2026-10-13',rateId:'201'})},
    MutationObserver:class {constructor(callback){this.callback=callback;observers.push(this);}observe(target){this.target=target;}},
    requestAnimationFrame:callback=>frames.push(callback),
  });
  for(let i=0;i<10&&frames.length;i++)frames.shift()();
  assert.equal(card.nextElementSibling.textContent,'Book');
  assert.equal(writes,1,'An unchanged label must not replace its text node');
  assert.equal(priceWrites,1,'Browser serialization of an empty attribute must not restart the price refresh');
  assert.equal(frames.length,0,'Chat must become idle after the card is mounted');
  const settled=mutations;
  emit({});
  assert.equal(frames.length,0,'Unrelated document changes must not refresh sales UI');
  assert.equal(mutations,settled+1);
});
