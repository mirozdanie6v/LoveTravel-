import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const js=await readFile(resolve(root,'src/lovetravel-domain-tour.js'),'utf8');
const css=await readFile(resolve(root,'src/lovetravel-domain-tour.css'),'utf8');
const build=await readFile(resolve(root,'build.mjs'),'utf8');
const locales=await Promise.all(['ru-RU','en-US','vi-VN','zh-CN','ko-KR'].map(code=>readFile(resolve(root,'src/locales',code+'.js'),'utf8')));

test('LoveTravel domain tour renderer is syntactically valid and reads the domain endpoint',()=>{
  assert.doesNotThrow(()=>new Function(js));
  assert.match(js,/\/api\/bokun\/domain/);
  assert.match(js,/lovetravel\.bokun-domain\.v1/);
  assert.match(js,/PRODUCT_IDS = new Set\(\['1287578','1287580'\]\)/);
});

test('tour page is driven by language-neutral domain entities and price quotes',()=>{
  for(const token of ['domain.rates','domain.availabilitySlots','domain.participants','priceQuotesByRate','defaultRateId','bookingRequirements','domain?.extras']) assert.ok(js.includes(token),token);
  assert.match(js,/data-lt-domain-rate/);
  assert.match(js,/data-lt-domain-slot/);
  assert.match(js,/tourCopy=new Proxy/);
});

test('optional provider entities render only when present',()=>{
  assert.match(js,/if\(!extras\.length&&!questions\.length&&!customer\.length&&!passenger\.length&&!custom\.length\) return ''/);
  assert.match(js,/if\(!points\.length && !pickup && !meetingType\) return ''/);
  assert.match(js,/if\(!items\.length\) return ''/);
  assert.match(js,/if\(!clean\.length\) return ''/);
});

test('domain tour visual layer is included after runtime in the production build',()=>{
  const runtime=build.indexOf('<script src="/runtime-api.js" defer></script>');
  const domain=build.indexOf('<script src="/lovetravel-domain-tour.js" defer></script>');
  assert.ok(runtime>=0&&domain>runtime);
  assert.match(css,/\.lt-domain-rate\.is-active/);
  assert.match(css,/\.lt-domain-date\.is-active/);
});

test('tour renderer can repair legacy screen overwrites without translating DOM text',()=>{
  assert.match(js,/function repairLegacyOverwrite/);
  assert.match(js,/new MutationObserver\(repairLegacyOverwrite\)/);
  assert.doesNotMatch(js,/TreeWalker/);
});

test('tour page exposes booking CTA and semantic transport copy',()=>{
  assert.match(js,/data-lt-jump-booking/);
  assert.match(js,/LoveTravelBookingConfigurator\.open\('date'\)/);
  assert.match(js,/t\(\)\.meeting/);
  assert.match(js,/t\(\)\.meetingNote/);
  assert.match(js,/t\(\)\.pickup/);
  for(const [index,value] of ['Место начала экскурсии','Tour starting point','Điểm bắt đầu tour','行程集合地点','투어 출발 지점'].entries()){
    assert.ok(locales[index].includes(value),value);
  }
  assert.match(js,/data-lt-start-point-card/);
  assert.match(js,/data-lt-pickup-card/);
  assert.match(css,/\.lt-domain-transport-note/);
});

test('tour gallery renders every Bókun photo and supports full-screen navigation',()=>{
  assert.equal(js.includes('photos.slice(1,7)'),false);
  assert.match(js,/galleryPhotos\(domain\)/);
  assert.match(js,/data-lt-gallery-thumb/);
  assert.match(js,/openGalleryLightbox/);
  assert.match(css,/\.lt-domain-lightbox/);
});

test('tour options are visual cards with curated descriptions and tour photos',()=>{
  assert.match(js,/RATE_PRESENTATION/);
  assert.match(js,/function rateDescription/);
  assert.match(js,/lt-domain-rate__media/);
  assert.match(css,/\.lt-domain-section--options/);
});
