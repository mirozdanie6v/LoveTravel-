import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import previewWorker from '../preview/client-v2/worker.js';

const root=resolve(import.meta.dirname,'..');
const read=path=>readFile(resolve(root,path),'utf8');

const [client,html,css,worker,wrangler]=await Promise.all([
  read('preview/client-v2/src/client-v2.js'),
  read('preview/client-v2/src/index.html'),
  read('preview/client-v2/src/client-v2.css'),
  read('preview/client-v2/worker.js'),
  read('preview/client-v2/wrangler.jsonc'),
]);

test('Client v2 stage 2 is isolated from legacy DOM, booking and AI',()=>{
  assert.match(client,/const state=\{/);
  assert.match(client,/function render\(\)/);
  assert.match(client,/fetch\('\/api\/tours'/);
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
  assert.match(client,/Выбрать дату/);
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
  assert.doesNotMatch(client,/\['photos','/);
  assert.match(css,/\.bottom-nav/);
  assert.match(css,/\.language-menu/);
  assert.match(css,/\.rate-option/);
  assert.match(css,/\.departure-option/);
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
        {provider:{productId:'1287578'},experience:{id:'1287578',title:'Robinson Beach'}},
        {provider:{productId:'1287580'},experience:{id:'1287580',title:'Hòn Mun'}},
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
