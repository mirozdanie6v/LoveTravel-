import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchLoveTravelBokunDomains } from '../src/bokun-adapter.js';

function okJson(value){
  return new Response(JSON.stringify(value),{
    status:200,
    headers:{'content-type':'application/json'},
  });
}

function product(id=1287578){
  return {
    id,
    title:'Tour '+id,
    pricingCategories:[],
    rates:[],
    photos:[],
  };
}

test('read cache TTLs are opt-in at the Bókun adapter boundary',async()=>{
  const calls=[];
  const fetchImpl=async(url,init={})=>{
    calls.push({url:String(url),init});
    if(String(url).includes('/api/bokun/product')) return okJson(product());
    if(String(url).includes('/api/bokun/availability')) return okJson([]);
    return okJson({pickupPlaces:[],dropoffPlaces:[]});
  };

  await fetchLoveTravelBokunDomains({
    fetchImpl,
    baseUrl:'https://integration.example.test',
    vendorId:137689,
    productIds:[1287578],
    start:'2026-10-07',
    end:'2026-10-21',
    lang:'RU',
    productCacheTtl:300,
    availabilityCacheTtl:15,
  });

  const productCall=calls.find(call=>call.url.includes('/api/bokun/product'));
  const availabilityCall=calls.find(call=>call.url.includes('/api/bokun/availability'));
  assert.equal(productCall.init.cf.cacheEverything,true);
  assert.equal(productCall.init.cf.cacheTtl,300);
  assert.equal(availabilityCall.init.cf.cacheEverything,true);
  assert.equal(availabilityCall.init.cf.cacheTtl,15);
});

test('adapter defaults remain uncached for transactional/provider reads',async()=>{
  const calls=[];
  const fetchImpl=async(url,init={})=>{
    calls.push({url:String(url),init});
    if(String(url).includes('/api/bokun/product')) return okJson(product());
    if(String(url).includes('/api/bokun/availability')) return okJson([]);
    return okJson({pickupPlaces:[],dropoffPlaces:[]});
  };

  await fetchLoveTravelBokunDomains({
    fetchImpl,
    baseUrl:'https://integration.example.test',
    vendorId:137689,
    productIds:[1287578],
    start:'2026-10-07',
    end:'2026-10-21',
    lang:'RU',
  });

  for(const call of calls){
    assert.equal(call.init.cf,undefined);
  }
});

test('only the read-only worker endpoint opts into catalog cache TTLs',async()=>{
  const worker=await readFile('src/worker-r2.js','utf8');
  const provider=await readFile('src/bokun-provider.js','utf8');

  assert.match(worker,/productCacheTtl:300/);
  assert.match(worker,/availabilityCacheTtl:15/);
  assert.match(worker,/pickupPlacesCacheTtl:300/);
  assert.doesNotMatch(provider,/productCacheTtl/);
  assert.doesNotMatch(provider,/availabilityCacheTtl/);
});
