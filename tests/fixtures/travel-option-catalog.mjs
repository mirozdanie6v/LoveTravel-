// Rate identities/titles read from the two live Bókun products on 2026-10-09.
// Prices, participant constraints and availability below are synthetic test data.
import {configurationDomains} from './booking-configurator-domains.mjs';

export const optionCatalog=[
  {productId:'1287578',canonicalId:'love-travel-robinson-island',
    title:'Nha Trang Island Hopping Adventure in Robinson Beach',rates:[
      ['2581224','Robinson & Bich Dam'],['2623660','Robinson & Hon Mun Marine Park'],
      ['2623666','Robinson & Hon Tam Mud Bath'],['2623667','Robinson & Tranh Beach'],
      ['2623668','Robinson & Mini Beach'],['2623669','Robinson & Soi Beach'],
      ['2623670','Robinson & Tri Nguyen Aquarium'],
    ]},
  {productId:'1287580',canonicalId:'love-travel-hon-mun',
    title:'Hon Mun Marine Park Snorkeling and Nha Trang Island Tour',rates:[
      ['2581227','Bai Tranh Beach'],['2581226','Bai Soi Beach'],
      ['2581229','Hon Tam Island Mud Bath'],['2581228','Mini Beach'],
    ]},
];

export function optionCatalogDomains(){
  return configurationDomains().map((domain,index)=>{
    const catalog=optionCatalog[index];
    domain.experience.title=catalog.title;
    domain.experience.description='Product description; detailed alternative itineraries are not provided.';
    domain.experience.itinerary=[{title:'Unscoped agenda',body:'ALTERNATIVE_STOPS_MUST_NOT_BE_JOINED'}];
    domain.experience.content={included:'Air-conditioned vehicle, snorkeling equipment and lunch.',inclusions:['FOOD_AND_DRINK']};
    domain.rates=catalog.rates.map(([id,title],i)=>({
      ...domain.rates[0],id,title,description:'',
    }));
    domain.availabilitySlots=domain.availabilitySlots.map(slot=>({
      ...slot,date:'2026-10-07',id:String(slot.startTimeId)+'_2026-10-07',
      defaultRateId:catalog.rates[0][0],
      rates:catalog.rates.map(([id])=>({id})),
      priceQuotesByRate:catalog.rates.map(([id],i)=>({
        ...slot.priceQuotesByRate[0],rateId:id,
        participantPrices:slot.priceQuotesByRate[0].participantPrices.map(price=>({
          ...price,amount:{...price.amount,amount:price.categoryId===101?50+i*5:price.amount.amount},
        })),
      })),
    }));
    return domain;
  });
}
