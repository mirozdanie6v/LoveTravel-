import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import previewWorker, { _test as previewWorkerTest } from '../preview/client-v2/worker.js';

const root=resolve(import.meta.dirname,'..');
const read=path=>readFile(resolve(root,path),'utf8');

const [client,html,css,worker,wrangler,previewWorkflow]=await Promise.all([
  read('preview/client-v2/src/client-v2.js'),
  read('preview/client-v2/src/index.html'),
  read('preview/client-v2/src/client-v2.css'),
  read('preview/client-v2/worker.js'),
  read('preview/client-v2/wrangler.jsonc'),
  read('.github/workflows/client-v2-preview.yml'),
]);

test('Client v2 stage 2 is isolated from legacy DOM, booking and AI',()=>{
  assert.match(client,/const state=\{/);
  assert.match(client,/function render\(\)/);
  assert.match(client,/fetch\('\/api\/tours\?locale='/);
  assert.doesNotMatch(client,/MutationObserver/);
  assert.doesNotMatch(client,/selectionByProduct/);
  assert.doesNotMatch(client,/\/api\/travel-commerce\/transaction/);
  assert.doesNotMatch(client,/\/api\/ai\/chat/);
  assert.doesNotMatch(client,/i18n-v1/);
  assert.doesNotMatch(html,/max-tour/i);
  assert.doesNotMatch(html,/ai-consultant/i);
  assert.doesNotMatch(html,/booking/i);
  assert.match(css,/\.tour-grid/);
  assert.match(css,/\.detail-hero/);
});


test('Stage 2A restores customer-facing LoveTravel visual language without technical labels',()=>{
  assert.match(client,/Откройте Нячанг/);
  assert.match(client,/Выбрать экскурсию/);
  assert.match(client,/Обзор/);
  assert.match(client,/Программа/);
  assert.match(client,/Включено/);
  assert.match(client,/Выберите выезд/);
  assert.match(client,/categoryLabel/);
  assert.match(css,/--orange-deep:#ef6f1a/);
  assert.match(css,/--blue-deep:#2268b3/);
  assert.match(css,/\.catalog-hero/);
  assert.match(css,/\.tour-tabs/);
  assert.match(css,/\.mobile-booking-bar/);
  assert.doesNotMatch(client,/Bókun live/);
  assert.doesNotMatch(client,/Client v2/);
  assert.doesNotMatch(client,/read-only preview/);
  assert.doesNotMatch(client,/2 live Bókun products/);
});


test('locale refresh keeps the mini-app shell mounted and rolls back on read failure',()=>{
  assert.match(client,/loadTours\(\{preserveRoute:true,silent:true,renderOnSuccess:false\}\)/);
  assert.match(client,/const previousLocale=state\.locale/);
  assert.match(client,/if\(!ok\)/);
  assert.match(client,/if\(!silent\)/);
  assert.match(client,/if\(silent\) return false/);
});

test('Stage 2B is a mini-app shell, not a landing page',()=>{
  assert.match(client,/navHome:'Главная'/);
  assert.match(client,/navCatalog:'Каталог'/);
  assert.match(client,/navTrips:'Мои поездки'/);
  assert.match(client,/navAi:'ИИ‑Помощник'/);
  assert.match(client,/function bottomNav\(\)/);
  assert.match(client,/languageSwitcher/);
  assert.match(client,/SUPPORTED_LOCALES=\['ru','vi','en','zh','ko'\]/);
  assert.match(client,/data-preview-rate/);
  assert.match(client,/data-preview-slot/);
  assert.match(client,/function optionsMarkup/);
  assert.match(client,/function datesMarkup/);
  assert.match(client,/function assistantView/);
  assert.match(client,/function tripsView/);
  assert.match(client,/photosTab:'Фото'/);
  assert.match(css,/\.bottom-nav/);
  assert.match(css,/\.language-menu/);
  assert.match(css,/\.rate-option/);
  assert.match(css,/\.departure-day/);
  assert.match(client,/\['photos',t\(\)\.photosTab\]/);
  assert.match(client,/function photosPanel/);
  assert.match(client,/function cancellationLines/);
  assert.match(client,/function pickupLines/);
  assert.match(client,/pickupAvailable:'Трансфер доступен'/);
  assert.match(client,/datesMarkup\(tour\)\+optionsMarkup\(tour\)/);
  assert.match(client,/providerPhotoUrls/);
  assert.match(client,/bindSelectionInteractions/);
  assert.match(client,/function rateForSlot/);
  assert.match(client,/function ratesForSlot/);
  assert.match(client,/mergeRateLists\(base\?\.textItems,live\?\.textItems\)/);
  assert.match(client,/__loveTravelRenderCount/);
  assert.match(client,/renderOnSuccess:false/);
  assert.match(client,/location\.hash===routeAtRequest/);
});


test('Stage 2 semantic UI exposes stable locale-independent regions',()=>{
  for(const testId of [
    'departure-calendar',
    'tour-options',
    'tour-overview',
    'tour-program',
    'tour-included',
    'tour-photos',
    'tour-tabs',
    'tour-content',
    'bottom-nav',
    'language-control',
    'ai-assistant-shell',
  ]){
    assert.match(client,new RegExp('data-testid=["\\\']'+testId+'["\\\']'));
  }
  assert.match(client,/function infoBlock\(section\)/);
  assert.match(client,/data-testid="tour-/);
  assert.match(client,/aria-labelledby/);
  assert.match(client,/<dl class="fact-grid"/);
  assert.match(client,/modelCustomerInfoSections/);
});

test('Stage 2 live gate stays focused on real integration smoke',()=>{
  assert.match(previewWorkflow,/Verify live Bókun API contract/);
  assert.match(previewWorkflow,/npm run test:client-v2:live/);
  assert.doesNotMatch(previewWorkflow,/rawProviderProducts/);
  assert.doesNotMatch(previewWorkflow,/trustSubFont/);
  assert.doesNotMatch(previewWorkflow,/data-language-trigger/);
  assert.doesNotMatch(previewWorkflow,/tour-pickup/);
  assert.doesNotMatch(previewWorkflow,/innerText\(/);
});

test('preview Client DTO removes audit-only provider copies without losing contract fields',()=>{
  const source={
    provider:{productId:'1287578'},
    providerRaw:{huge:'raw'},
    coverage:{rawPreserved:true},
    experience:{
      title:'Robinson Beach',
      media:{photos:[{url:'https://example.com/photo.jpg',providerData:{large:'duplicate'}}]},
    },
    rates:[{id:1,title:'Standard',providerData:{duplicate:true}}],
    availabilitySlots:[{
      id:'slot',
      rates:[{id:1,title:'Standard',providerData:{duplicate:true}}],
      priceQuotesByRate:[{rateId:1,participantPrices:[{categoryId:1,amount:{amount:30,currency:'USD'},providerData:{duplicate:true}}]}],
    }],
  };
  const projected=previewWorkerTest.stripAuditOnly(source);
  assert.equal(projected.provider.productId,'1287578');
  assert.equal(projected.experience.media.photos[0].url,'https://example.com/photo.jpg');
  assert.equal(projected.rates[0].title,'Standard');
  assert.equal(projected.availabilitySlots[0].priceQuotesByRate[0].participantPrices[0].amount.amount,30);
  assert.equal('providerRaw' in projected,false);
  assert.equal('coverage' in projected,false);
  assert.equal('providerData' in projected.experience.media.photos[0],false);
  assert.equal('providerData' in projected.rates[0],false);
});

test('preview read-only catalog uses a short edge cache and same-origin official brand proxy',()=>{
  assert.match(worker,/CLIENT_CACHE_TTL_SECONDS=20/);
  assert.match(worker,/globalThis\.caches\?\.default/);
  assert.match(worker,/x-client-v2-cache/);
  assert.match(worker,/AUDIT_ONLY_KEYS/);
  assert.match(worker,/url\.pathname==='\/brand-logo'/);
  assert.match(client,/const OFFICIAL_LOGO='\/brand-logo'/);
  assert.doesNotMatch(client,/bizweb\.dktcdn\.net/);
});

test('preview worker exposes only read-only tour API and static Client v2 assets',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=input instanceof URL ? input : new URL(typeof input==='string'?input:input.url);
    assert.equal(url.origin,'https://lovetravel.viiversion.com');
    assert.equal(url.pathname,'/api/bokun/domain');
    return new Response(JSON.stringify({
      ok:true,
      vendorId:'137689',
      productIds:['1287578','1287580'],
      fetchedAt:'2026-10-07T00:00:00.000Z',
      domains:[
        {provider:{productId:'1287578'},providerRaw:{duplicate:true},experience:{id:'1287578',title:'Robinson Beach',media:{photos:[{url:'https://example.com/a.jpg',providerData:{duplicate:true}}]}}},
        {provider:{productId:'1287580'},providerRaw:{duplicate:true},experience:{id:'1287580',title:'Hòn Mun',media:{photos:[{url:'https://example.com/b.jpg',providerData:{duplicate:true}}]}}},
      ],
    }),{status:200,headers:{'content-type':'application/json'}});
  };

  try{
    const env={
      LOVE_TRAVEL_UPSTREAM:'https://lovetravel.viiversion.com',
      ASSETS:{fetch:async request=>new Response(new URL(request.url).pathname,{status:200})},
    };

    const tours=await previewWorker.fetch(new Request('https://preview.example/api/tours'),env);
    const payload=await tours.json();
    assert.equal(tours.status,200);
    assert.equal(payload.ok,true);
    assert.equal(payload.schema,'lovetravel.client-v2.preview.v1');
    assert.deepEqual(payload.productIds,['1287578','1287580']);
    assert.equal(payload.domains.length,2);
    assert.equal('providerRaw' in payload.domains[0],false);
    assert.equal('providerData' in payload.domains[0].experience.media.photos[0],false);

    const write=await previewWorker.fetch(new Request('https://preview.example/api/tours',{method:'POST'}),env);
    assert.equal(write.status,405);

    const booking=await previewWorker.fetch(new Request('https://preview.example/api/travel-commerce/transaction',{method:'POST'}),env);
    assert.equal(booking.status,404);

    const ai=await previewWorker.fetch(new Request('https://preview.example/api/ai/chat',{method:'POST'}),env);
    assert.equal(ai.status,404);

    const page=await previewWorker.fetch(new Request('https://preview.example/v2/'),env);
    assert.equal(await page.text(),'/v2/index.html');
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('preview deployment is a separate workers.dev target, never the production worker',()=>{
  const cfg=JSON.parse(wrangler);
  assert.equal(cfg.name,'love-travel-client-v2-preview');
  assert.equal(cfg.workers_dev,true);
  assert.equal(cfg.main,'./worker.js');
  assert.equal(cfg.assets.directory,'./dist');
  assert.notEqual(cfg.name,'love-travel-v28');
  assert.equal('routes' in cfg,false);
});
