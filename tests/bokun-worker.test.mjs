import test from 'node:test';
import assert from 'node:assert/strict';
import { handleLoveTravelBokunTours } from '../src/worker-r2.js';

function product(id) {
  return {
    id:Number(id),
    externalId:id === '1287578' ? '5690738P8' : '5690738P7',
    title:id === '1287578' ? 'Robinson Beach' : 'Hòn Mun',
    description:'Live Bókun product',
    durationText:'7 hours',
    locationCode:{ name:'Nha Trang' },
    keyPhoto:{ originalUrl:`https://img.example/${id}.jpg` },
    pricingCategories:[
      { id:1, title:'Adult', ticketCategory:'ADULT', minAge:10, maxAge:99 },
      { id:2, title:'Child', ticketCategory:'CHILD', minAge:5, maxAge:9 },
      { id:3, title:'Infant', ticketCategory:'INFANT', minAge:0, maxAge:4 },
    ],
    defaultRateId:10,
    rates:[{ id:10, title:'Default', rateCode:'TG1', pricedPerPerson:true, minPerBooking:1, maxPerBooking:30 }],
  };
}

const availability=[{
  id:'5782395_20260928',
  localizedDate:"Mon 28.Sep'26",
  startTime:'09:00',
  availabilityCount:50,
  bookedParticipants:0,
  soldOut:false,
  unavailable:false,
  pricesByRate:[{
    activityRateId:10,
    pricePerCategoryUnit:[
      { id:1, amount:{ amount:35, currency:'USD' } },
      { id:2, amount:{ amount:25, currency:'USD' } },
      { id:3, amount:{ amount:0, currency:'USD' } },
    ],
  }],
}];

test('LoveTravel worker exposes only the two agreed Bókun products in read-only mode', async () => {
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async input => {
    const url=new URL(typeof input === 'string' ? input : input.url);
    calls.push(url);
    if (url.pathname.endsWith('/product')) {
      return new Response(JSON.stringify(product(url.searchParams.get('productId'))), {
        status:200,
        headers:{ 'content-type':'application/json' },
      });
    }
    if (url.pathname.endsWith('/availability')) {
      return new Response(JSON.stringify(availability), {
        status:200,
        headers:{ 'content-type':'application/json' },
      });
    }
    throw new Error(`unexpected upstream: ${url}`);
  };

  try {
    const request=new Request('https://lovetravel.viiversion.com/api/bokun/tours?start=2026-09-28&end=2026-10-02');
    const response=await handleLoveTravelBokunTours(request, {
      BOKUN_INTEGRATION_BASE_URL:'https://integration.example',
    });
    const body=await response.json();

    assert.equal(response.status,200);
    assert.equal(body.ok,true);
    assert.equal(body.mode,'read-only');
    assert.equal(body.vendorId,'137689');
    assert.deepEqual(body.productIds,['1287578','1287580']);
    assert.equal(body.tours.length,2);
    assert.deepEqual(body.tours.map(t=>t.id),['1287578','1287580']);
    assert.equal(body.tours[0].group.adult,'$35');
    assert.equal(calls.length,4);
    assert.ok(calls.every(url=>url.searchParams.get('vendorId') === '137689'));
    assert.deepEqual(
      calls.filter(url=>url.pathname.endsWith('/product')).map(url=>url.searchParams.get('productId')).sort(),
      ['1287578','1287580'],
    );
    assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
  } finally {
    globalThis.fetch=originalFetch;
  }
});

test('LoveTravel Bókun endpoint rejects write methods and oversized date ranges', async () => {
  const post=await handleLoveTravelBokunTours(
    new Request('https://lovetravel.viiversion.com/api/bokun/tours',{ method:'POST' }),
    {},
  );
  assert.equal(post.status,405);

  const large=await handleLoveTravelBokunTours(
    new Request('https://lovetravel.viiversion.com/api/bokun/tours?start=2026-09-28&end=2026-12-31'),
    {},
  );
  assert.equal(large.status,400);
  assert.equal((await large.json()).error,'date_range_too_large');
});

test('LoveTravel exposes the domain model separately from the legacy catalog view without raw provider snapshots', async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async input => {
    const url=new URL(typeof input === 'string' ? input : input.url);
    if (url.pathname.endsWith('/product')) {
      return new Response(JSON.stringify({
        ...product(url.searchParams.get('productId')),
        bookingQuestions:[{id:1,title:'Hotel name',required:true}],
        unexpectedNewField:{value:'preserved'},
      }),{status:200,headers:{'content-type':'application/json'}});
    }
    return new Response(JSON.stringify(availability),{status:200,headers:{'content-type':'application/json'}});
  };
  try {
    const response=await handleLoveTravelBokunTours(
      new Request('https://lovetravel.viiversion.com/api/bokun/domain?start=2026-09-28&end=2026-10-02'),
      {BOKUN_INTEGRATION_BASE_URL:'https://integration.example'},
    );
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.schema,'lovetravel.bokun-domain.v1');
    assert.equal(body.domains.length,2);
    assert.equal('providerRaw' in body.domains[0],false);
    assert.equal(body.domains[0].bookingRequirements.questions[0].title,'Hotel name');
    assert.deepEqual(body.domains[0].providerExtensions.unexpectedNewField,{value:'preserved'});
    assert.equal(body.domains[0].coverage.rawPreserved,true);
  } finally {
    globalThis.fetch=originalFetch;
  }
});
