import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOVE_TRAVEL_BOKUN_PRODUCT_IDS,
  LOVE_TRAVEL_BOKUN_VENDOR_ID,
  fetchLoveTravelBokunDomains,
  fetchLoveTravelBokunTours,
  normalizeBokunProduct,
} from '../src/bokun-adapter.js';

const product = {
  id: 1287578,
  externalId: '5690738P8',
  title: 'Nha Trang Island Hopping Adventure in Robinson Beach',
  description: 'Robinson description',
  durationText: '7 hours',
  difficultyLevel: 'MODERATE',
  locationCode: { name:'Nha Trang' },
  startPoints: [{
    title:'Bến Tàu Du Lịch Nha Trang',
    address:{
      addressLine1:'388 Võ Thị Sáu',
      city:'Nam Nha Trang',
      state:'Khánh Hòa',
      geoPoint:{ latitude:12.19, longitude:109.20 },
    },
  }],
  included:'Air-conditioned vehicle<br />Use of Snorkelling equipment<br />Lunch',
  keyPhoto:{
    originalUrl:'https://example.com/original.jpg',
    derived:[{ name:'large', cleanUrl:'https://example.com/large.jpg' }],
  },
  photos:[
    { derived:[{ name:'large', url:'https://example.com/large.jpg' }] },
    { originalUrl:'https://example.com/second.jpg' },
  ],
  pricingCategories:[
    { id:1250028, title:'Adult', ticketCategory:'ADULT', minAge:10, maxAge:99 },
    { id:1250029, title:'Child', ticketCategory:'CHILD', minAge:5, maxAge:9 },
    { id:1154895, title:'Infant', ticketCategory:'INFANT', minAge:0, maxAge:4 },
  ],
  defaultRateId:2581224,
  rates:[{
    id:2581224,
    title:'Robinson Island Hopping Tour',
    rateCode:'TG1',
    pricedPerPerson:true,
    minPerBooking:1,
    maxPerBooking:30,
  }],
  guidanceTypes:[{ displayLanguages:['English','Vietnamese'] }],
  agendaItems:[{ title:'', body:'Visit Bich Dam fishing village.' }],
  bookingCutoffHours:8,
  pickupService:true,
  cancellationPolicy:{ title:'Standard Viator policy' },
};

const availability = [{
  id:'5782395_20260926',
  localizedDate:"Sat 26.Sep'26",
  startTime:'09:00',
  startTimeId:5782395,
  availabilityCount:50,
  bookedParticipants:0,
  soldOut:false,
  unavailable:false,
  pricesByRate:[{
    activityRateId:2581224,
    pricePerCategoryUnit:[
      { id:1250028, amount:{ amount:35.77, currency:'USD' } },
      { id:1250029, amount:{ amount:25.55, currency:'USD' } },
      { id:1154895, amount:{ amount:0, currency:'USD' } },
    ],
  }],
}];

test('LoveTravel Bókun scope is limited to the agreed vendor and two products', () => {
  assert.equal(LOVE_TRAVEL_BOKUN_VENDOR_ID, '137689');
  assert.deepEqual([...LOVE_TRAVEL_BOKUN_PRODUCT_IDS], ['1287578','1287580']);
});

test('normalizes Bókun product into the existing LoveTravel tour shape', () => {
  const tour = normalizeBokunProduct(product, availability);
  assert.equal(tour.id, '1287578');
  assert.equal(tour.source, 'bokun');
  assert.equal(tour.image, 'https://example.com/large.jpg');
  assert.deepEqual(tour.gallery, ['https://example.com/large.jpg','https://example.com/second.jpg']);
  assert.deepEqual(tour.included, ['Air-conditioned vehicle','Use of Snorkelling equipment','Lunch']);
  assert.equal(tour.group.adult, '$35.77');
  assert.equal(tour.group.child, '$25.55');
  assert.equal(tour.group.infant, '$0');
  assert.equal(tour.group.departures[0].iso, '2026-09-26');
  assert.equal(tour.group.departures[0].available, 50);
  assert.equal(tour.bokun.rates[0].prices.adult, '$35.77');
  assert.equal(tour.languages.join(','), 'English,Vietnamese');
  assert.equal(tour.route[0][1], 'Visit Bich Dam fishing village.');
});

test('catalog fetch helper reads product and availability only', async () => {
  const calls = [];
  const fakeFetch = async url => {
    calls.push(String(url));
    const current = new URL(url);
    if (current.pathname.endsWith('/product')) {
      const requested = current.searchParams.get('productId');
      return new Response(JSON.stringify({ ...product, id:Number(requested) }), {
        status:200,
        headers:{ 'content-type':'application/json' },
      });
    }
    if (current.pathname.endsWith('/pickup-places')) {
      return new Response(JSON.stringify({
        pickupPlaces:[{
          id:15136970,title:'Thien Anh Hotel',type:'ACCOMMODATION',askForRoomNumber:true,
          location:{address:'59 Nguyen Bieu',city:'Nha Trang',countryCode:'VN',latitude:12.2377,longitude:109.19385}
        }],
        dropoffPlaces:[],
      }), {
        status:200,
        headers:{ 'content-type':'application/json' },
      });
    }
    return new Response(JSON.stringify(availability), {
      status:200,
      headers:{ 'content-type':'application/json' },
    });
  };

  const tours = await fetchLoveTravelBokunTours({
    fetchImpl:fakeFetch,
    baseUrl:'https://integration.example',
    start:'2026-09-26',
    end:'2026-10-10',
  });

  assert.equal(tours.length, 2);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(url => url.includes('vendorId=137689')));
  assert.ok(calls.some(url => url.includes('productId=1287578')));
  assert.ok(calls.some(url => url.includes('productId=1287580')));
  assert.ok(calls.filter(url => url.includes('/availability')).every(url => url.includes('currency=USD')));
  assert.equal(calls.filter(url => url.includes('/pickup-places')).length,0);
});


test('domain fetch includes pickup places only when explicitly requested', async () => {
  const calls=[];
  const fakeFetch=async url => {
    calls.push(String(url));
    const current=new URL(url);
    if (current.pathname.endsWith('/product')) {
      return new Response(JSON.stringify({...product,id:Number(current.searchParams.get('productId'))}),{
        status:200,headers:{'content-type':'application/json'},
      });
    }
    if (current.pathname.endsWith('/pickup-places')) {
      return new Response(JSON.stringify({
        pickupPlaces:[{
          id:15136970,title:'Thien Anh Hotel',type:'ACCOMMODATION',askForRoomNumber:true,
          location:{address:'59 Nguyen Bieu',city:'Nha Trang',countryCode:'VN',latitude:12.2377,longitude:109.19385}
        }],
        dropoffPlaces:[],
      }),{status:200,headers:{'content-type':'application/json'}});
    }
    return new Response(JSON.stringify(availability),{status:200,headers:{'content-type':'application/json'}});
  };

  const domains=await fetchLoveTravelBokunDomains({
    fetchImpl:fakeFetch,
    baseUrl:'https://integration.example',
    start:'2026-09-26',
    end:'2026-10-10',
    includePickupPlaces:true,
  });

  assert.equal(calls.length,6);
  assert.equal(calls.filter(url=>url.includes('/pickup-places')).length,2);
  assert.equal(domains[0].experience.pickup.places[0].title,'Thien Anh Hotel');
  assert.equal(domains[0].experience.pickup.places[0].askForRoomNumber,true);
});
