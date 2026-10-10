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

for(const [locale,message] of [['ru','Хочу забронировать Robinson завтра для 2 взрослых и ребёнка 7 лет'],['en','Book Robinson tomorrow for 2 adults and a 7-year-old child'],['vi','Đặt Robinson ngày mai cho 2 người lớn và trẻ em 7 tuổi'],['zh','预订明天 Robinson，2位成人和7岁孩子'],['ko','Robinson 내일 예약, 성인 2명과 7세 아이']]){
  test('Known child age is retained even when structured inference fails: '+locale,async()=>{
    const result=await extractConversationIntent({env:{},message,currentIntent:createInitialTravelIntent(locale),locale});
    assert.deepEqual(result.patch.party.childrenAges,[7]);assert.ok(!result.pendingChildAges);
  });
}
test('A traveller mentioning a child without an age gets a clarification, never an adult-only assumption',async()=>{
  const result=await extractConversationIntent({env:{},message:'Хочу забронировать завтра для 2 взрослых с ребёнком',currentIntent:createInitialTravelIntent('ru'),locale:'ru'});
  assert.equal(result.pendingChildAges,true);
  const answer=await extractConversationIntent({env:{},message:'7',context:{nextQuestionCode:'CHILD_AGES',commercialGoal:'BOOK'},currentIntent:createInitialTravelIntent('ru'),locale:'ru'});
  assert.deepEqual(answer.patch.party.childrenAges,[7]);assert.equal(answer.goal,'BOOK');
});
