import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {createBokunProvider} from '../src/bokun-provider.js';
const report={realBookingsCreated:0,options:[],requests:[]};
const guardedFetch=async(input,init={})=>{
 const url=new URL(input);
 if(!['/api/bokun/checkout/options','/api/bokun/product','/api/bokun/availability','/api/bokun/pickup-places'].includes(url.pathname))throw new Error('Forbidden verification endpoint '+url.pathname);
 report.requests.push({path:url.pathname,method:init.method||'GET'});
 return fetch(input,{...init,signal:AbortSignal.timeout(30000)});
};
const provider=createBokunProvider({fetchImpl:guardedFetch});
const response=await fetch('https://lovetravel.viiversion.com/api/bokun/domain?locale=en&includePickupPlaces=1',{signal:AbortSignal.timeout(45000)});
assert.equal(response.status,200);const {domains}=await response.json();
for(const domain of domains){
 const adult=domain.participants.find(p=>p.ticketCategory==='ADULT');
 for(const rate of domain.rates){
 const slot=domain.availabilitySlots.find(s=>!s.soldOut&&!s.unavailable&&s.date>new Date().toISOString().slice(0,10)&&(s.rates||[]).some(r=>String(r.id)===String(rate.id)));
 assert.ok(slot,'No live slot for '+rate.id);
 const count=Math.max(1,Number(rate.minPerBooking||1),Number(slot.minParticipantsToBookNow||1));
 const selection={productId:String(domain.experience.id),rateId:String(rate.id),startTimeId:String(slot.startTimeId),date:slot.date,participants:{[adult.id]:count},
 customer:{firstName:'Checkout',lastName:'ReadOnly',email:'read-only@example.com',phoneNumber:'+84900000000'},
 pickup:{mode:rate.pickup?.selectionType==='PRESELECTED'||rate.pickup?.selectionType==='REQUIRED'?'PICKUP':'MEET_ON_LOCATION',placeId:domain.experience.pickup?.places?.[0]?.id,roomNumber:'101'},dropoff:{mode:'NO_DROPOFF'},answers:{},passengers:[]};
 const resolved=await provider.resolveOffer({selection,domain,currency:'USD',includePickupPlaces:true});
 const contract=await provider.getCheckoutContract({resolution:resolved.resolution,externalBookingReference:'LT-TEST-CLIENT-READONLY-'+rate.id,currency:'USD'});
 const draft=provider.createBookingDraft({resolution:resolved.resolution,checkoutContract:contract,externalBookingReference:'LT-TEST-CLIENT-READONLY-'+rate.id});
 const same=Number(draft.checkout.amount)===Number(resolved.offer?.price.amount)&&draft.checkout.currency===resolved.offer?.price.currency;
 report.options.push({productId:selection.productId,rateId:selection.rateId,date:selection.date,count,quote:resolved.offer?.price,checkout:draft.checkout,readyForReserve:draft.readyForReserve,priceMatches:same,issues:draft.issues,contactQuestions:contract.questions?.mainContactDetails});
 assert.equal(draft.readyForReserve,true,JSON.stringify(report.options.at(-1)));assert.equal(same,true,JSON.stringify(report.options.at(-1)));
 }
}
await mkdir('artifacts/customer-booking',{recursive:true});await writeFile('artifacts/customer-booking/live-checkout.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({options:report.options.length,realBookingsCreated:0,allPricesMatch:true,allReady:true}));
