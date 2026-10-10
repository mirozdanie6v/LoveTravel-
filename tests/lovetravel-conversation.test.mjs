import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureSalesSession,shoppingSessionIdForSalesSession,transactionIdForSalesSession} from '../src/travel-session.js';
import {explicitNoChildren,extractConversationIntent,createInitialTravelIntent} from '../src/travel-sales-intelligence.js';

test('A new conversation overrides the persistent cookie for both chat and transaction',async()=>{
  const rows=[];const env={DB:{prepare:()=>({bind:id=>({run:async()=>rows.push(id)})})}};
  const old='old-conversation-1234567890',fresh='new-conversation-1234567890';
  for(const path of ['/api/ai/chat','/api/travel-commerce/transaction']){
    const result=await ensureSalesSession(new Request('https://example.test'+path,{headers:{cookie:'lt_sales_sid='+old,'x-lt-conversation-id':fresh}}),env);
    assert.equal(result.id,fresh);assert.equal(result.fresh,true);
    assert.notEqual(shoppingSessionIdForSalesSession(result.id),shoppingSessionIdForSalesSession(old));
    assert.notEqual(transactionIdForSalesSession(result.id),transactionIdForSalesSession(old));
  }
  assert.deepEqual(rows,[fresh,fresh]);
  const fallback=await ensureSalesSession(new Request('https://example.test/api/ai/chat',{headers:{cookie:'lt_sales_sid='+old}}),env);
  assert.equal(fallback.id,old);assert.equal(fallback.fresh,false);
});
test('A child-price factual question cannot add a child to the party',async()=>{
  assert.equal(explicitNoChildren('Сколько стоит билет для ребёнка?'),false);
  const result=await extractConversationIntent({env:{},message:'Сколько стоит билет для ребёнка?',currentIntent:createInitialTravelIntent('ru'),locale:'ru'});
  assert.equal(result.patch.party,undefined);
});
test('Explicit removal overrides a model copying children from old history',async()=>{
  const result=await extractConversationIntent({env:{AI:{run:async()=>({response:{intentPatch:{goal:'BOOK',party:{adults:2,childrenAges:[8],infants:1}}}})}},message:'Я еду без детей',currentIntent:createInitialTravelIntent('ru'),locale:'ru'});
  assert.deepEqual(result.patch.party,{adults:2,childrenAges:[],infants:0});
});
