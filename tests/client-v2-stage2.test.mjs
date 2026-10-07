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
