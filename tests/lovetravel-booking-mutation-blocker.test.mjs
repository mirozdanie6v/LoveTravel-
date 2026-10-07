import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTravelTransactionApi } from '../src/travel-transaction-api.js';
import worker from '../src/worker-r2.js';
import { BookingSession } from '../src/booking-session-do.js';
import { createBokunProvider } from '../src/bokun-provider.js';
import { startBookingUiHarness } from './helpers/booking-ui-harness.mjs';
import { configurationDomains } from './fixtures/booking-configurator-domains.mjs';
import { normalizeBookingSelection } from '../src/booking-selection-engine.js';

const request=(path,body)=>new Request('https://test.invalid'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const blocked=error=>error.code==='booking_mutations_disabled'&&error.status===423;

test('RESERVE and RECONCILE fail before DB, session, revision validation or token access',async()=>{
  const env={get DB(){throw new Error('must never access DB');}};
  for(const action of ['RESERVE','RECONCILE',' reserve ','reconcile']){
    for(const body of [{action},{action,expectedRevision:1,demoToken:'previously-valid-token',quoteId:'quote',quoteRevision:1}]){
      const response=await handleTravelTransactionApi(request('/api/travel-commerce/transaction',body),env);
      assert.equal(response.status,423);
      assert.equal((await response.json()).error,'booking_mutations_disabled');
    }
  }
});

test('production router blocks legacy, demo and direct provider endpoints before any handler',async()=>{
  for(const path of ['/api/bookings','/api/bokun/client-demo/submit','/api/bokun/reserve','/internal/lovetravel/bokun/demo-submit','/internal/lovetravel/bokun/reconcile']){
    const response=await worker.fetch(request(path,{demoToken:'previously-valid-token'}),{},{});
    assert.equal(response.status,423,path);
    assert.equal((await response.json()).error,'booking_mutations_disabled');
  }
});

test('internal BookingSession cannot bypass the public gate',async()=>{
  const session=new BookingSession({storage:{}},{});
  session.runtime=()=>{throw new Error('runtime must not execute');};
  for(const body of [{action:'RESERVE'},{action:'RECONCILE'},{action:'COMMAND',type:'RESERVE_BOOKING'},{action:'COMMAND',type:'RECONCILE_BOOKING'}]){
    await assert.rejects(()=>session.perform({...body,demoToken:'previously-valid-token'}),blocked);
  }
});

test('provider submit and recovery fail before fetch, regardless of tokens or confirmation code',async()=>{
  let calls=0;
  const provider=createBokunProvider({bookingTestToken:'old-token',fetchImpl:async()=>{calls++;throw new Error('network forbidden');}});
  await assert.rejects(()=>provider.submitClientDemoBooking({demoToken:'old-token',checkoutRequestTemplate:{}}),blocked);
  await assert.rejects(()=>provider.reconcileBooking({demoToken:'old-token',externalBookingReference:'old-reference'}),blocked);
  await assert.rejects(()=>provider.reconcileBooking({confirmationCode:'NHA-105381046'}),blocked);
  assert.equal(calls,0);
});

test('GET projection and complete SYNC_SELECTION work through the current API, DO and store',async()=>{
  const domain=configurationDomains()[0];
  const harness=await startBookingUiHarness([domain]);
  try{
    const initial=await (await fetch(harness.base+'/api/travel-commerce/transaction')).json();
    assert.equal(initial.ok,true);
    assert.equal(initial.transaction.state,'SHOPPING');
    const selection={productId:domain.experience.id,date:domain.availabilitySlots[0].date,startTimeId:'301',rateId:'201',participants:{101:2},
      pickup:{mode:'MEET_ON_LOCATION'},dropoff:{mode:'NO_DROPOFF'},
      customer:{firstName:'Acceptance',lastName:'Test',email:'test@example.com',phoneNumber:'+84900000000'},
      answers:{diet:'none',reference:'test'},
      passengers:[0,1].map(()=>({categoryId:'101',firstName:'Acceptance',lastName:'Test',answers:{birth:'2000-01-01',weight:60}}))};
    const response=await fetch(harness.base+'/api/travel-commerce/transaction',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'SYNC_SELECTION',expectedRevision:initial.revision,selection})});
    const synced=await response.json();
    assert.equal(response.status,200,JSON.stringify(synced));
    assert.equal(synced.state,'READY_FOR_APPROVAL');
    assert.equal(synced.quote.price.amount,100);
    assert.equal(synced.quote.readyToBook,true);
    assert.deepEqual(normalizeBookingSelection(synced.selection,domain),synced.resolution.selection);
    assert.equal(synced.providerBooking,null);
    assert.equal(harness.upstreamCalls(),0);
  }finally{await harness.close();}
});
