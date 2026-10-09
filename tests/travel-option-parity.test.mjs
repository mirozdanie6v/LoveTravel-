import test from 'node:test';
import assert from 'node:assert/strict';
import {optionCatalogDomains,optionCatalog} from './fixtures/travel-option-catalog.mjs';
import {startBookingUiHarness} from './helpers/booking-ui-harness.mjs';

test('all eleven options support complete pre-booking configuration through the production API, DO, store and Quote',async()=>{
  const domains=optionCatalogDomains();
  const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  for(const d of domains)for(const slot of d.availabilitySlots){slot.date=date;slot.id=String(slot.startTimeId)+'_'+date;}
  const harness=await startBookingUiHarness(domains);
  try{
    let tx=await (await fetch(harness.base+'/api/travel-commerce/transaction')).json();
    for(const catalog of optionCatalog)for(const [index,[rateId]] of catalog.rates.entries()){
      const selection={productId:catalog.productId,date,rateId,startTimeId:'301',slotId:'301_'+date,
        participants:{101:2,102:1,103:1},pickup:{mode:'PICKUP',placeId:'501',roomNumber:'804'},
        dropoff:{mode:'DROPOFF',placeId:'601'},extras:{701:1},extraAnswers:{701:{'equipment-size':'M'}},
        customer:{firstName:'Acceptance',lastName:'Test',email:'acceptance@example.test',phoneNumber:'+84900000000'},
        answers:{diet:'none',reference:'fixture'},
        passengers:[101,101,102,103].map((categoryId,i)=>({categoryId:String(categoryId),firstName:'Acceptance',lastName:'Test',
          answers:{birth:'2000-01-01',weight:60},...(i===0?{extras:{702:{quantity:1,answers:{'passenger-equipment-size':'M'}}}}:{})})),
      };
      const response=await fetch(harness.base+'/api/travel-commerce/transaction',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({action:'SYNC_SELECTION',expectedRevision:tx.revision,selection})});
      tx=await response.json();
      assert.equal(response.status,200,JSON.stringify(tx));
      assert.equal(tx.state,'READY_FOR_APPROVAL');
      assert.equal(tx.quote.readyToBook,true,JSON.stringify(tx.resolution));
      assert.equal(tx.quote.offer.rateRef.externalId,rateId);
      assert.equal(tx.quote.price.amount,138+index*10);
      assert.equal(tx.quote.price.amount,tx.resolution.quote.total);
      assert.equal(tx.providerBooking,null);
      assert.deepEqual(tx.resolution.selection.participants,{101:2,102:1,103:1});
      assert.equal(tx.resolution.selection.pickup.roomNumber,'804');
      assert.equal(tx.resolution.selection.passengers[0].extras['702'].quantity,1);
    }
    assert.equal(harness.upstreamCalls(),0);
    assert.ok(!harness.requests.some(r=>['RESERVE','RECONCILE'].includes(r.body?.action)));
  }finally{await harness.close();}
});
