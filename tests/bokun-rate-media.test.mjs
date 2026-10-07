import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBokunDomain } from '../src/bokun-domain.js';

test('Bókun domain preserves rate-level media when provider sends it',()=>{
  const product={
    id:1287578,
    title:'Robinson',
    rates:[{
      id:10,
      title:'Premium',
      description:'Premium option',
      keyPhoto:{originalUrl:'https://example.com/rate-key.jpg'},
      photos:[{originalUrl:'https://example.com/rate-2.jpg'}],
      media:{photos:[{url:'https://example.com/rate-3.jpg'}]},
    }],
    pricingCategories:[],
    photos:[{originalUrl:'https://example.com/product.jpg'}],
  };
  const domain=buildBokunDomain(product,[],{vendorId:137689});
  assert.equal(domain.experience.media.photos.length,1);
  assert.equal(domain.rates.length,1);
  assert.deepEqual(
    domain.rates[0].media.photos.map(item=>item.url),
    [
      'https://example.com/rate-key.jpg',
      'https://example.com/rate-2.jpg',
      'https://example.com/rate-3.jpg',
    ],
  );
  assert.equal(domain.rates[0].providerData.keyPhoto.originalUrl,'https://example.com/rate-key.jpg');
});


test('Bókun domain preserves departure-specific rate textItems from availability',()=>{
  const product={
    id:1287578,
    title:'Robinson',
    rates:[{id:10,title:'Robinson & Bich Dam',textItems:[]}],
    pricingCategories:[],
  };
  const availability=[{
    id:'1287578_20261008',
    activityId:1287578,
    dateIso:'2026-10-08',
    rates:[{
      id:10,
      title:'Robinson & Bich Dam',
      textItems:[{id:99,title:'Program note',text:'Visit Bich Dam fishing village'}],
    }],
    pricesByRate:[],
  }];
  const domain=buildBokunDomain(product,availability,{vendorId:137689});
  assert.equal(domain.rates[0].textItems.length,0);
  assert.equal(domain.availabilitySlots[0].rates[0].textItems.length,1);
  assert.equal(domain.availabilitySlots[0].rates[0].textItems[0].description,'Visit Bich Dam fishing village');
});
