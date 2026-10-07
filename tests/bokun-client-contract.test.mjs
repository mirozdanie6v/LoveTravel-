import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBokunDomain } from '../src/bokun-domain.js';

function fullProduct(){
  return {
    id:1287578,
    externalId:'robinson',
    title:'Robinson Beach',
    description:'Full tour description',
    excerpt:'Short summary',
    activityType:'DAY_TOUR_OR_ACTIVITY',
    locationCode:{name:'Nha Trang',country:'VN'},
    timeZone:'Asia/Ho_Chi_Minh',
    durationHours:7,
    minAge:5,
    baseLanguage:'EN',
    languages:[{name:'English'}],
    guidanceTypes:[{displayLanguages:['English','Vietnamese']}],
    keyPhoto:{originalUrl:'https://example.com/key.jpg'},
    photos:[{originalUrl:'https://example.com/photo-2.jpg'}],
    videos:[{id:1,title:'Video',url:'https://example.com/video.mp4'}],
    included:'Lunch',
    inclusions:[{id:1,title:'Mask'}],
    excluded:'Tips',
    exclusions:[{id:2,title:'Personal expenses'}],
    requirements:'Bring swimwear',
    attention:'Weather dependent',
    dressCode:'Beachwear',
    knowBeforeYouGoItems:[{id:3,title:'Passport copy'}],
    agendaItems:[{id:4,title:'Stop 1',body:'Harbour'}],
    meetingType:'MEET_ON_LOCATION',
    startPoints:[{id:5,title:'Port',address:{addressLine1:'1 Harbour Rd',city:'Nha Trang'}}],
    supportedAccessibilityTypes:['LIMITED_MOBILITY'],
    ticketMsg:'Show mobile voucher',
    pickupService:true,
    pickupPlaceGroups:[{id:6,title:'Hotels'}],
    customPickupAllowed:true,
    pickupMinutesBefore:20,
    dropoffService:false,
    pricingCategories:[{id:1,title:'Adult',ticketCategory:'ADULT',minAge:12}],
    rates:[{
      id:10,
      title:'Standard',
      textItems:[{id:11,title:'Base note',text:'Base description'}],
      keyPhoto:{originalUrl:'https://example.com/rate.jpg'},
    }],
    bookableExtras:[{id:12,title:'Private guide',description:'Optional guide'}],
    offers:[{id:13,title:'Special offer'}],
    bookingQuestions:[{id:14,title:'Hotel name',required:true}],
    requiredCustomerFields:['firstName','lastName'],
    mainContactFields:['email','phone'],
    passengerFields:['firstName'],
    customFields:[{id:15,title:'Custom'}],
    bookingType:'INSTANT',
    cancellationPolicy:{
      id:16,
      title:'24 hour cancellation',
      policyType:'ADVANCED',
      penaltyRules:[
        {id:17,cutoffHours:24,charge:100,chargeType:'percentage',percentage:100},
        {id:18,cutoffHours:24000,charge:0,chargeType:'percentage',percentage:0},
      ],
    },
    reviewCount:4,
    reviewRating:4.8,
    passportRequired:false,
    paymentCurrencies:['USD'],
    creationDate:'2026-01-01T00:00:00Z',
    marketplaceVisibilityType:'PUBLIC',
  };
}

function availability(){
  return [{
    id:'1287578_20261008',
    activityId:1287578,
    dateIso:'2026-10-08',
    startTime:'08:00',
    defaultRateId:10,
    availabilityCount:8,
    soldOut:false,
    unavailable:false,
    rates:[{
      id:10,
      title:'Standard',
      textItems:[{id:21,title:'Departure note',text:'Bích Đầm included on this departure'}],
    }],
    pricesByRate:[{
      activityRateId:10,
      pricePerCategoryUnit:[{id:1,amount:{amount:30,currency:'USD'}}],
    }],
  }];
}

test('Bókun → Domain contract separates customer, selection and booking data without loss',()=>{
  const domain=buildBokunDomain(fullProduct(),availability(),{vendorId:137689});

  assert.equal(domain.provider.productId,1287578);
  assert.equal(domain.experience.location.city,'Nha Trang');
  assert.equal(domain.experience.location.country,'VN');
  assert.equal(domain.experience.media.photos.length,2);
  assert.equal(domain.experience.content.included,'Lunch');
  assert.equal(domain.experience.content.excluded,'Tips');
  assert.equal(domain.experience.itinerary.length,1);
  assert.equal(domain.experience.meeting.startPoints.length,1);
  assert.equal(domain.experience.pickup.enabled,true);
  assert.equal(domain.experience.pickup.customAllowed,true);
  assert.equal(domain.cancellationPolicy.policyType,'ADVANCED');
  assert.equal(domain.cancellationPolicy.penaltyRules.length,2);

  assert.equal(domain.availabilitySlots.length,1);
  assert.equal(domain.availabilitySlots[0].rates.length,1);
  assert.equal(domain.availabilitySlots[0].rates[0].textItems[0].description,'Bích Đầm included on this departure');
  assert.equal(domain.availabilitySlots[0].priceQuotesByRate[0].participantPrices[0].amount.amount,30);

  assert.equal(domain.participants.length,1);
  assert.equal(domain.extras.length,1);
  assert.equal(domain.offers.length,1);
  assert.equal(domain.bookingRequirements.questions.length,1);
  assert.deepEqual(domain.bookingRequirements.requiredCustomerFields,['firstName','lastName']);

  assert.equal(domain.providerRaw.product.title,'Robinson Beach');
  assert.equal(domain.providerRaw.availability.length,1);
});

test('coverage distinguishes mapped fields, explicit provider metadata and genuinely unknown fields',()=>{
  const product=fullProduct();
  product.futureProviderField='must not disappear silently';
  const domain=buildBokunDomain(product,availability(),{vendorId:137689});

  assert.ok(domain.coverage.product.mappedTopLevelFields.includes('locationCode'));
  assert.deepEqual(
    domain.coverage.product.intentionallyIgnoredTopLevelFields.sort(),
    ['creationDate','marketplaceVisibilityType']
  );
  assert.ok(domain.coverage.product.unmappedTopLevelFields.includes('futureProviderField'));
  assert.ok(domain.coverage.product.nonEmptyUnmappedTopLevelFields.includes('futureProviderField'));
  assert.equal(domain.providerExtensions.futureProviderField,'must not disappear silently');
});

test('rate-specific media is preserved but never fabricated',()=>{
  const product=fullProduct();
  const domain=buildBokunDomain(product,availability(),{vendorId:137689});
  assert.deepEqual(domain.rates[0].media.photos.map(item=>item.url),['https://example.com/rate.jpg']);

  const withoutRateMedia=fullProduct();
  delete withoutRateMedia.rates[0].keyPhoto;
  const noMediaDomain=buildBokunDomain(withoutRateMedia,availability(),{vendorId:137689});
  assert.deepEqual(noMediaDomain.rates[0].media.photos,[]);
});

test('selected-departure rate metadata remains distinct from base product rate metadata',()=>{
  const domain=buildBokunDomain(fullProduct(),availability(),{vendorId:137689});
  assert.equal(domain.rates[0].textItems[0].description,'Base description');
  assert.equal(domain.availabilitySlots[0].rates[0].textItems[0].description,'Bích Đầm included on this departure');
});
