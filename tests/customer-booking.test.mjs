import test from 'node:test';
import assert from 'node:assert/strict';
import {startBookingUiHarness} from './helpers/booking-ui-harness.mjs';
import {bookingAccess,bookingConfigured} from '../src/travel-booking-access.js';
import {configurationDomains} from './fixtures/booking-configurator-domains.mjs';
const post=(h,path,body,headers={})=>fetch(h.base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
async function selection(h){
 const d=configurationDomains()[0];
 const initial=await (await fetch(h.base+'/api/travel-commerce/transaction')).json();
 const response=await post(h,'/api/travel-commerce/transaction',{action:'SYNC_SELECTION',expectedRevision:initial.revision,
 selection:{productId:d.experience.id,date:d.availabilitySlots[0].date,startTimeId:'301',rateId:'201',participants:{101:2},
 pickup:{mode:'MEET_ON_LOCATION'},dropoff:{mode:'NO_DROPOFF'},
 customer:{firstName:'Acceptance',lastName:'Test',email:'test@example.com',phoneNumber:'+84900000000'},
 answers:{diet:'none',reference:'test'},passengers:[0,1].map(()=>({categoryId:'101',firstName:'Test',lastName:'Test',answers:{birth:'2000-01-01',weight:60}}))}});
 assert.equal(response.status,200);return response.json();
}
async function approve(h,tx){
 const r=await post(h,'/api/travel-commerce/transaction',{action:'APPROVE',expectedRevision:tx.revision,quoteId:tx.quote.quoteId,quoteRevision:tx.quote.revision});
 assert.equal(r.status,200);return r.json();
}
const reserveBody=tx=>({action:'RESERVE',confirmBooking:true,expectedRevision:tx.revision,quoteId:tx.quote.quoteId,quoteRevision:tx.quote.revision});
test('a fresh guest can book without an invitation; explicit confirmation is still required',async()=>{
 const h=await startBookingUiHarness(configurationDomains(),{booking:{}});
 try{
  const granted=await (await fetch(h.base+'/api/travel-commerce/access')).json();
  assert.equal(granted.bookingEnabled,true);assert.equal(granted.paymentMode,'EXTERNAL_PAYMENT');
  assert.equal(JSON.stringify(granted).includes('fixture-provider-secret'),false);
  const compatibility=await (await post(h,'/api/travel-commerce/access',{invite:'obsolete'})).json();
  assert.equal(compatibility.bookingEnabled,true);
  const tx=await approve(h,await selection(h));
  assert.equal((await post(h,'/api/travel-commerce/transaction',{...reserveBody(tx),confirmBooking:false,demoToken:'forged'})).status,412);
  assert.equal(h.reservationCalls(),0);assert.equal(h.upstreamCalls(),0);
 }finally{await h.close();}
});
test('public booking still requires server configuration and a server-issued owner identity',async()=>{
 const enabled={CLIENT_BOOKING_ENABLED:'true',BOKUN_CLIENT_BOOKING_TOKEN:'server-only'};
 assert.equal(bookingConfigured(enabled),true);
 assert.equal(await bookingAccess(enabled,{ownerHash:'a'.repeat(64)}),true);
 assert.equal(await bookingAccess(enabled,{ownerHash:'forged'}),false);
 assert.equal(bookingConfigured({...enabled,CLIENT_BOOKING_ENABLED:'false'}),false);
 assert.equal(bookingConfigured({CLIENT_BOOKING_ENABLED:'true'}),false);
 const h=await startBookingUiHarness(configurationDomains());
 try{
  const tx=await approve(h,await selection(h));
  const r=await post(h,'/api/travel-commerce/transaction',{...reserveBody(tx),bookingEnabled:true,demoToken:'forged'});
  assert.equal(r.status,423);assert.equal(h.reservationCalls(),0);assert.equal(h.upstreamCalls(),0);
 }finally{await h.close();}
});
test('parallel confirmed clicks create exactly one fixture booking, preserved on reload and isolated from another guest',async()=>{
 const h=await startBookingUiHarness(configurationDomains(),{booking:{delayMs:20}});
 try{
  const tx=await approve(h,await selection(h));
  const responses=await Promise.all([post(h,'/api/travel-commerce/transaction',reserveBody(tx)),post(h,'/api/travel-commerce/transaction',reserveBody(tx))]);
  const results=await Promise.all(responses.map(r=>r.json()));
  assert.ok(results.every(r=>r.state==='CONFIRMED'),JSON.stringify(results));assert.equal(h.reservationCalls(),1);
  const history=await (await fetch(h.base+'/api/travel-commerce/bookings')).json();
  assert.equal(history.bookings.length,1);assert.equal(history.bookings[0].providerBooking.confirmationCode,'NHA-123456789');
  assert.equal(history.bookings[0].providerBooking.paymentType,'NOT_PAID');
  const other=await (await fetch(h.base+'/api/travel-commerce/bookings',{headers:{cookie:'__Host-lt_guest='+'c'.repeat(64)}})).json();
  assert.deepEqual(other.bookings,[]);
  const next=await post(h,'/api/travel-commerce/transaction',{...reserveBody(results[0]),expectedRevision:results[0].revision});
  assert.equal((await next.json()).state,'CONFIRMED');assert.equal(h.reservationCalls(),1);assert.equal(h.upstreamCalls(),0);
 }finally{await h.close();}
});
test('lost provider response is reconciled without another submission',async()=>{
 const h=await startBookingUiHarness(configurationDomains(),{booking:{lostResponse:true}});
 try{
  const tx=await approve(h,await selection(h));
  const result=await (await post(h,'/api/travel-commerce/transaction',reserveBody(tx))).json();
  assert.equal(result.state,'CONFIRMED');assert.equal(h.reservationCalls(),1);assert.equal(h.upstreamCalls(),0);
 }finally{await h.close();}
});
test('missing readback stays pending, and retries or current revisions cannot create duplicates',async()=>{
 const h=await startBookingUiHarness(configurationDomains(),{booking:{missingReadback:true}});
 try{
  const tx=await approve(h,await selection(h));
  const result=await (await post(h,'/api/travel-commerce/transaction',reserveBody(tx))).json();
  assert.equal(result.state,'FAILED_NEEDS_RECONCILIATION');
  const repeated=await (await post(h,'/api/travel-commerce/transaction',{...reserveBody(tx),expectedRevision:result.revision})).json();
  assert.equal(repeated.state,'FAILED_NEEDS_RECONCILIATION');assert.equal(h.reservationCalls(),1);
 }finally{await h.close();}
});
test('final checkout price mismatch blocks reservation before any provider write',async()=>{
 const h=await startBookingUiHarness(configurationDomains(),{booking:{amount:101}});
 try{
  const selected=await selection(h);
  const checked=await (await post(h,'/api/travel-commerce/transaction',{action:'CHECKOUT',expectedRevision:selected.revision})).json();
  assert.equal(checked.priceMatches,false);assert.equal(checked.readyForReserve,false);
  const tx=await approve(h,selected),response=await post(h,'/api/travel-commerce/transaction',reserveBody(tx));
  assert.equal(response.status,409);assert.equal(h.reservationCalls(),0);assert.equal(h.upstreamCalls(),0);
 }finally{await h.close();}
});

test('invalid contact email or phone is rejected before booking submission',async()=>{
 const h=await startBookingUiHarness(configurationDomains(),{booking:{}});
 try{
  const chosen=await selection(h);
  const invalid=await (await post(h,'/api/travel-commerce/transaction',{action:'SYNC_SELECTION',expectedRevision:chosen.revision,
    selection:{...chosen.selection,customer:{...chosen.selection.customer,email:'invalid-email',phoneNumber:'123'}}})).json();
  const tx=await approve(h,invalid);
  const result=await post(h,'/api/travel-commerce/transaction',reserveBody(tx));
  assert.equal(result.status,409);assert.equal((await result.json()).error,'invalid_customer_details');assert.equal(h.reservationCalls(),0);
 }finally{await h.close();}
});

test('Durable Object also requires explicit customer authority before invoking the provider',async()=>{
 const h=await startBookingUiHarness(configurationDomains(),{booking:{}});
 try{
  const tx=await approve(h,await selection(h));
  const object=h.env.BOOKING_SESSIONS.get(tx.transaction.transactionId);
  await assert.rejects(()=>object.perform({action:'RESERVE',transactionId:tx.transaction.transactionId,expectedRevision:tx.revision,quoteId:tx.quote.quoteId,quoteRevision:tx.quote.revision,demoToken:'forged'}),e=>e.code==='explicit_booking_confirmation_required');
  assert.equal(h.reservationCalls(),0);
 }finally{await h.close();}
});
