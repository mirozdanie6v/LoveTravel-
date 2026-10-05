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

test('domain tour visual layer is included after runtime in the production build',()=>{
  assert.match(build,/lovetravel-domain-tour\.css/);
  assert.match(build,/lovetravel-domain-tour\.js/);
  const runtime=build.indexOf('<script src="/runtime-api.js" defer></script>');
  const domain=build.indexOf('<script src="/lovetravel-domain-tour.js" defer></script>');
  assert.ok(runtime>=0 && domain>runtime);
  assert.match(build,/copyFile\(resolve\(root, 'src\/lovetravel-domain-tour\.js'/);
  assert.match(css,/\.lt-domain-rate\.is-active/);
  assert.match(css,/\.lt-domain-date\.is-active/);
});


test('domain tour repairs legacy renderer overwrites while a Bókun product is active',()=>{
  assert.match(js,/function repairLegacyOverwrite/);
  assert.match(js,/new MutationObserver\(repairLegacyOverwrite\)/);
  assert.ok(js.includes("!document.querySelector('#tourScreen .lt-domain-shell')"));
});


test('tour page exposes a high-position booking CTA and suppresses empty reviews',()=>{
  assert.match(js,/data-lt-jump-booking/);
  assert.match(js,/LoveTravelBookingConfigurator\.open\('date'\)/);
  assert.match(js,/const hasReviews=/);
  assert.match(css,/\.lt-domain-quickbook/);
  assert.match(css,/background:linear-gradient\(135deg,#e84e18 0%,#f56b25 48%,#f6bd39 100%\)/);
});


test('tour start point is separated from hotel pickup in every supported locale',()=>{
  assert.match(js,/meeting:'Место начала экскурсии'/);
  assert.match(js,/meeting:'Tour starting point'/);
  assert.match(js,/meeting:'Điểm bắt đầu tour'/);
  assert.match(js,/meeting:'行程集合地点'/);
  assert.match(js,/meeting:'투어 출발 지점'/);
  assert.match(js,/data-lt-start-point-card/);
  assert.match(js,/data-lt-pickup-card/);
  assert.match(js,/data-lt-selected-pickup/);
  assert.match(css,/\.lt-domain-transport-note/);
  assert.match(css,/\.lt-domain-selected-pickup/);
});


test('tour gallery renders every Bókun photo and supports full-screen navigation',()=>{
  assert.equal(js.includes('photos.slice(1,7)'),false);
  assert.match(js,/galleryPhotos\(domain\)/);
  assert.match(js,/data-lt-gallery-thumb/);
  assert.match(js,/data-lt-gallery-count/);
  assert.match(js,/openGalleryLightbox/);
  assert.match(js,/data-lt-lightbox-prev/);
  assert.match(js,/data-lt-lightbox-next/);
  assert.match(css,/\.lt-domain-lightbox/);
  assert.match(css,/\.lt-domain-gallery__thumb\.is-active/);
});

test('tour options are visual cards with curated descriptions and tour photos',()=>{
  assert.match(js,/RATE_PRESENTATION/);
  assert.match(js,/function rateDescription/);
  assert.match(js,/function ratePhotos/);
  assert.match(js,/lt-domain-rate__media/);
  assert.match(js,/lt-domain-rate__description/);
  assert.match(css,/\.lt-domain-section--options/);
  assert.match(css,/\.lt-domain-rate__media/);
  assert.match(css,/\.lt-domain-rate__description/);
});

test('selecting a rate or date preserves the current scroll position',()=>{
  assert.match(js,/function renderDomain\(domain,\{preserveScroll=false\}=\{\}\)/);
  assert.match(js,/renderDomain\(domain,\{preserveScroll:true\}\)/);
});


test('tour page keeps the existing LoveTravel layout but exposes the requested page and control gradients',()=>{
  assert.match(css,/radial-gradient\(circle at 8% 5%,rgba\(246,189,57,.22\),transparent 28%\)/);
  assert.match(css,/linear-gradient\(160deg,rgba\(255,247,226,.88\) 0%,rgba\(252,252,250,.92\) 38%,rgba\(236,247,255,.94\) 100%\)/);
  assert.match(css,/linear-gradient\(135deg,#65c9ff 0%,#3683e8 56%,#0b5aa8 100%\)/);
});
