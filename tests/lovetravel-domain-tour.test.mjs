import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const js=await readFile(resolve(root,'src/lovetravel-domain-tour.js'),'utf8');
const css=await readFile(resolve(root,'src/lovetravel-domain-tour.css'),'utf8');
const build=await readFile(resolve(root,'build.mjs'),'utf8');

test('LoveTravel domain tour renderer is syntactically valid and reads the domain endpoint',()=>{
  assert.doesNotThrow(()=>new Function(js));
  assert.match(js,/\/api\/bokun\/domain/);
  assert.match(js,/lovetravel\.bokun-domain\.v1/);
  assert.match(js,/PRODUCT_IDS = new Set\(\['1287578','1287580'\]\)/);
});

test('tour page is driven by rates, availability slots, participant categories and price quotes',()=>{
  for(const token of ['domain.rates','domain.availabilitySlots','domain.participants','priceQuotesByRate','defaultRateId','availabilityCount','bookingRequirements','domain?.extras']) {
    assert.ok(js.includes(token),token);
  }
  assert.match(js,/data-lt-domain-rate/);
  assert.match(js,/data-lt-domain-slot/);
});

test('MAX TOUR group-departure semantics are absent from the domain renderer',()=>{
  for(const legacy of ['Собирающиеся выезды','Создать свою группу','30% / 100%','если группа не набралась','Присоединиться']) {
    assert.equal(js.includes(legacy),false,legacy);
  }
});

test('optional provider entities render only when present',()=>{
  assert.match(js,/if\(!extras\.length&&!questions\.length&&!customer\.length&&!passenger\.length&&!custom\.length\) return ''/);
  assert.match(js,/if\(!points\.length && !pickup && !meetingType\) return ''/);
  assert.match(js,/if\(!items\.length\) return ''/);
  assert.match(js,/if\(!clean\.length\) return ''/);
});

test('domain tour visual layer follows the canonical LoveTravel runtime in production',()=> {
  assert.match(build,/lovetravel-domain-tour\.css/);
  assert.match(build,/lovetravel-domain-tour\.js/);
  const runtime=build.indexOf('<script src="/lovetravel-runtime.js"></script>');
  const domain=build.indexOf('<script src="/lovetravel-domain-tour.js"></script>');
  assert.ok(runtime>=0 && domain>runtime);
  assert.match(build,/lovetravel-domain-tour\.js/);
});

test('domain tour repairs legacy renderer overwrites while a Bókun product is active',()=>{
  assert.match(js,/function repairLegacyOverwrite/);
  assert.match(js,/new MutationObserver\(repairLegacyOverwrite\)/);
  assert.ok(js.includes("!document.querySelector('#tourScreen .lt-domain-shell')"));
});
