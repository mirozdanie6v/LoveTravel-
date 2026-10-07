import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBokunDomain } from '../src/bokun-domain.js';
import {
  normalizeTourDomain,
  ratesForSlot,
  rateDescription,
  customerInfoSections,
} from '../preview/client-v2/src/client-v2-model.js';

const labels={
  location:'Нячанг',
  tour:'Экскурсия',
  dayTour:'Экскурсия на день',
  activity:'Активность',
  requirementsLabel:'Требования',
  attentionLabel:'Обратите внимание',
  knowBefore:'Перед поездкой',
  accessibilityLabel:'Доступность',
  ticketLabel:'Информация по билету',
  pickupLabel:'Трансфер',
  pickupAvailable:'Трансфер доступен',
  pickupCustom:'Точку трансфера можно указать при бронировании',
  cancellationLabel:'Условия отмены',
  cancelLessThan:'При отмене менее чем за',
  cancelRetention:'удержание',
};

function fixtureDomain(){
  const product={
    id:1287578,
    title:'Robinson Beach',
    description:'<p>Full <strong>description</strong></p>',
    activityType:'DAY_TOUR_OR_ACTIVITY',
    locationCode:{name:'Nha Trang',country:'VN'},
    durationHours:7,
    minAge:5,
    languages:[{name:'English'}],
    keyPhoto:{originalUrl:'https://example.com/product.jpg'},
    included:'<ul><li>Lunch</li><li>Mask</li></ul>',
    excluded:'Tips',
    requirements:'Bring swimwear',
    attention:'Weather dependent',
    knowBeforeYouGoItems:[{title:'Passport copy'}],
    agendaItems:[{title:'Harbour',body:'Departure'}],
    startPoints:[{title:'Port'}],
    pickupService:true,
    customPickupAllowed:true,
    pickupPlaceGroups:[{id:1,title:'Hotels'}],
    ticketMsg:'Show voucher',
    pricingCategories:[{id:1,title:'Adult',ticketCategory:'ADULT'}],
    rates:[{
      id:10,
      title:'Base option',
      description:'',
      textItems:[],
    }],
    cancellationPolicy:{
      title:'Cancellation policy',
      policyType:'ADVANCED',
      penaltyRules:[{cutoffHours:24,charge:100,chargeType:'percentage',percentage:100}],
    },
  };
  const availability=[{
    id:'1287578_20261008',
    activityId:1287578,
    dateIso:'2026-10-08',
    startTime:'08:00',
    defaultRateId:10,
    availabilityCount:6,
    soldOut:false,
    unavailable:false,
    rates:[{
      id:10,
      title:'Robinson + Bích Đầm',
      textItems:[{title:'Program',text:'Fishing village visit'}],
    }],
    pricesByRate:[{
      activityRateId:10,
      pricePerCategoryUnit:[{id:1,amount:{amount:30,currency:'USD'}}],
    }],
  }];
  return buildBokunDomain(product,availability,{vendorId:137689});
}

test('Domain → Client mapping keeps customer content semantically separated',()=>{
  const domain=fixtureDomain();
  const tour=normalizeTourDomain(domain,{
    locale:'ru',
    labels,
    formatDate:value=>value,
  });

  assert.equal(tour.title,'Robinson Beach');
  assert.equal(tour.city,'Nha Trang');
  assert.equal(tour.category,'Экскурсия на день');
  assert.equal(tour.duration,'7 ч');
  assert.deepEqual(tour.included,['Lunch','Mask']);
  assert.deepEqual(tour.excluded,['Tips']);
  assert.deepEqual(tour.requirements,['Bring swimwear']);
  assert.deepEqual(tour.attention,['Weather dependent']);
  assert.equal(tour.pickup.enabled,true);
  assert.equal(tour.cancellationPolicy.policyType,'ADVANCED');
});

test('customer sections emit pickup and cancellation from their own domain fields',()=>{
  const tour=normalizeTourDomain(fixtureDomain(),{
    locale:'ru',
    labels,
    formatDate:value=>value,
  });
  const sections=customerInfoSections(tour,{locale:'ru',labels});

  const pickup=sections.find(section=>section.id==='pickup');
  const cancellation=sections.find(section=>section.id==='cancellation');

  assert.ok(pickup);
  assert.deepEqual(
    pickup.items,
    ['Трансфер доступен','Точку трансфера можно указать при бронировании','Hotels']
  );
  assert.ok(cancellation);
  assert.ok(cancellation.items.includes('Cancellation policy'));
  assert.ok(cancellation.items.some(item=>item.includes('24 ч')&&item.includes('100%')));
});

test('selected departure overrides base rate text without losing base metadata',()=>{
  const tour=normalizeTourDomain(fixtureDomain(),{
    locale:'ru',
    labels,
    formatDate:value=>value,
  });
  const slot=tour.availabilitySlots[0];
  const rates=ratesForSlot(tour,slot);

  assert.equal(rates.length,1);
  assert.equal(rates[0].title,'Robinson + Bích Đầm');
  assert.match(rateDescription(rates[0]),/Fishing village visit/);
});

test('Client mapping does not fabricate option photos when provider supplies none',()=>{
  const tour=normalizeTourDomain(fixtureDomain(),{
    locale:'ru',
    labels,
    formatDate:value=>value,
  });
  const rate=ratesForSlot(tour,tour.availabilitySlots[0])[0];
  assert.deepEqual(rate.optionPhotos,[]);
});
