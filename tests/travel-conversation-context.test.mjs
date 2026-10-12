import test from 'node:test';
import assert from 'node:assert/strict';
import {customerCalendarDate,recoverCustomerDate} from '../src/travel-conversation-date.js';
import {createInitialTravelIntent,extractConversationIntent,mergeIntentPatch} from '../src/travel-sales-intelligence.js';
const now=new Date('2026-10-11T19:40:00Z');
for(const message of ['14','на 14','14-е','14 октября','на четырнадцатое','14 October','October 14','ngày 14 tháng 10','10月14日','10월 14일']){
 test('customer calendar date is exact without the model: '+message,()=>assert.equal(customerCalendarDate(message,{now,dateAsked:true}).dateConstraint?.exact,'2026-10-14'));
}
test('participant counts and option numbers are not dates without a date question',()=>{
 for(const message of ['2','1 вариант','двое взрослых','2 взрослых'])assert.equal(customerCalendarDate(message,{now}).dateConstraint,undefined);
});
test('invalid and ambiguous past days require clarification rather than calendar rollover',()=>{
 for(const message of ['31 февраля','2026-02-30','9'])assert.equal(customerCalendarDate(message,{now,dateAsked:true}).invalidDate,true);
});
test('old relative dates cannot be reinterpreted using today without their timestamp',()=>{
 assert.equal(recoverCustomerDate([{role:'user',text:'Завтра'}],{now}),undefined);
 assert.equal(recoverCustomerDate([{role:'user',text:'Завтра',at:'2026-10-09T12:00:00Z'}],{now}).exact,'2026-10-10');
});
test('customer history can repair a lost absolute date but assistant claims cannot',()=>{
 assert.equal(recoverCustomerDate([{role:'assistant',text:'На какую дату?'},{role:'user',text:'14 октября'},{role:'assistant',text:'Вы выбрали 15 октября'}],{now}).exact,'2026-10-14');
 assert.equal(recoverCustomerDate([{role:'assistant',text:'14 октября'}],{now}),undefined);
 assert.equal(recoverCustomerDate([{role:'user',text:'14 октября'},{role:'user',text:'Сбрось дату'}],{now}),null);
});
for(const message of ['2','Для всех','Я уже писала','2 взрослых','1 вариант']){
 test('a model null cannot erase a confirmed date or option: '+message,async()=>{
  const current=mergeIntentPatch(createInitialTravelIntent('ru'),{dateConstraint:{kind:'EXACT',exact:'2026-10-14'},party:{adults:2}});
  const result=await extractConversationIntent({env:{AI:{run:async()=>({response:{intentPatch:{goal:'PRICE',dateConstraint:null,selectedOption:null,selectedProductId:null,hotel:null}}})}},message,currentIntent:current,locale:'ru',now});
  assert.equal(mergeIntentPatch(current,result.patch).dateConstraint.exact,'2026-10-14');
  assert.equal(result.patch.selectedOption,undefined);
 });
}
test('a date response retains the commercial task without invoking the model',async()=>{
 const result=await extractConversationIntent({env:{AI:{run:async()=>{throw Error('model must not be needed');}}},message:'14',currentIntent:createInitialTravelIntent('ru'),locale:'ru',now,context:{nextQuestionCode:'DATE',commercialGoal:'PRICE'}});
 assert.equal(result.source,'booking-continuation');assert.equal(result.goal,'PRICE');assert.equal(result.patch.dateConstraint.exact,'2026-10-14');
});

import {requestedOfferScope,replyOptionChoices,replyPendingQuestion} from '../src/travel-sales-intelligence.js';
import {optionCatalogDomains} from './fixtures/travel-option-catalog.mjs';
import {createTravelCapabilityBroker} from '../src/travel-capability-broker.js';
import {createBokunProvider} from '../src/bokun-provider.js';
const fixtureProvider=createBokunProvider({fetchImpl:async()=>{throw Error('No upstream writes or reads in this test');}});
const broker=createTravelCapabilityBroker({provider:{...fixtureProvider,async getDomains({productIds}={}){return optionCatalogDomains().filter(d=>!productIds||productIds.includes(d.experience.id));}}});
const productsPacket=await broker.execute('searchProducts',{}),products=productsPacket.data;
const rob=products.find(row=>row.product.productId==='love-travel-robinson-island');
test('a new numbered explanation binds item one to Hon Mun, not the old Bich Dam list',async()=>{
 const reply='1. Если хотите увидеть кораллы, выбирайте вариант с морским парком Hon Mun.\n2. Если хотите расслабиться — Hon Tam Mud Bath.';
 const choices=replyOptionChoices(reply,products,rob.product.productId);
 assert.equal(choices[0].rateRef.externalId,'2623660');
 for(const message of ['1','1 вариант']){
  const result=await extractConversationIntent({env:{AI:{run:async()=>{throw Error('Known choice must not call the model');}}},message,currentIntent:createInitialTravelIntent('ru'),locale:'ru',context:{currentProductId:rob.product.productId,commercialGoal:'BOOK',nextQuestionCode:'OPTION',optionList:choices},products,now});
  assert.equal(result.patch.selectedOption.rateRef.externalId,'2623660');assert.equal(result.source,'booking-continuation');
 }
});
test('an ambiguous list item is not silently mapped to the first matching rate',()=>{
 const choices=replyOptionChoices('1. Mini Beach или Soi Beach.\n2. Hon Mun Marine Park.',products,rob.product.productId);
 assert.equal(choices[0],null);assert.equal(choices[1].rateRef.externalId,'2623660');
});
test('a quoted rejected option is an informational question, not a new selection',async()=>{
 const result=await extractConversationIntent({message:'Nha Trang Island Hopping Adventure in Robinson Beach (Robinson и Bich Dam).- это вариант с кораллами?',currentIntent:createInitialTravelIntent('ru'),products,locale:'ru',context:{currentProductId:rob.product.productId},now});
 assert.equal(result.goal,'DETAILS');assert.equal(result.bookingRequested,false);
});
test('Hon Mun destination inside the active Robinson option stays in the Robinson product',async()=>{
 const result=await extractConversationIntent({message:'Что входит в Хон Мун?',currentIntent:createInitialTravelIntent('ru'),products,locale:'ru',context:{currentProductId:rob.product.productId},now});
 assert.equal(result.selectedProductId,rob.product.productId);assert.equal(result.goal,'DETAILS');
});
test('all-price requests and scope replies retain the pending task',()=>{
 assert.equal(requestedOfferScope('Нет детей. Сколько стоят варианты тура'),'ALL_OPTIONS');
 assert.equal(requestedOfferScope('Для всех',{pendingQuestion:{kind:'PRICE_SCOPE'}}),'ALL_OPTIONS');
 assert.equal(requestedOfferScope('Для всех',{}),'');
 assert.equal(replyPendingQuestion('Вы хотите цены только этого варианта или для всех?', '',rob.product.productId).kind,'PRICE_SCOPE');
});
test('all-option price reads resolve every rate under its own product without mutation',async()=>{
 const intent=mergeIntentPatch(createInitialTravelIntent('ru'),{dateConstraint:{kind:'EXACT',exact:'2026-10-07'},party:{adults:2}});
 const packet=await broker.execute('searchOffers',{intent,productIds:['1287578'],allOptions:true});
 assert.equal(packet.data.length,7);
 assert.deepEqual(packet.data.map(row=>row.selection.rateId),rob.facts.options.map(o=>o.rateRef.externalId));
 assert.ok(packet.data.every(row=>row.product.productId===rob.product.productId&&row.offer.participantMix.every(p=>p.role==='ADULT')));
 assert.equal(intent.optionPreference,undefined);
});

test('recommendations with a final question retain their explicit trip parameters instead of becoming factual queries',async()=>{
 for(const [locale,message] of [['ru','Нас двое взрослых, хотим завтра на снорклинг с трансфером от Oceanus. Что посоветуете?'],['en','We are two adults and want snorkeling tomorrow with pickup from Oceanus. What do you recommend?']]){
  const r=await extractConversationIntent({env:{AI:{run:async()=>{throw Error('controlled model unavailable');}}},message,locale,currentIntent:createInitialTravelIntent(locale),now});
  assert.notEqual(r.goal,'DETAILS');assert.equal(r.patch.party.adults,2);assert.equal(r.patch.dateConstraint.exact,'2026-10-13');
 }
});
test('a number from the last two-product list chooses a product and never silently picks a rate',async()=>{
 const reply=products.map((row,i)=>(i+1)+'. '+row.product.title).join('\n');const choices=replyOptionChoices(reply,products);
 assert.equal(choices[0].productId,rob.product.productId);
 const r=await extractConversationIntent({message:'1 вариант',currentIntent:createInitialTravelIntent('ru'),products,locale:'ru',context:{nextQuestionCode:'OPTION',optionList:choices,commercialGoal:'BOOK'},now});
 assert.equal(r.patch.selectedProductId,rob.product.productId);assert.equal(r.patch.selectedOption,undefined);
});

import {composeGroundedSalesPlan} from '../src/travel-sales-intelligence.js';
test('priced recommendations receive only eligible rate facts while the full provider catalogue remains available',async()=>{
 const intent=mergeIntentPatch(createInitialTravelIntent('en'),{dateConstraint:{kind:'EXACT',exact:'2026-10-07'},party:{adults:2}});
 const offers=await broker.execute('searchOffers',{intent,productIds:['1287578']});const selected=offers.data[0];let checked=false;
 const result=await composeGroundedSalesPlan({locale:'en',goal:'GENERAL',message:'What do you recommend?',intent,evidence:[productsPacket,offers],env:{AI:{run:async(_model,input)=>{
  const view=JSON.parse(input.messages[0].content.split('VERIFIED_EVIDENCE=')[1]);const row=view[0].data.find(r=>r.product.productId===rob.product.productId);
  assert.equal(row.facts.options.length,1);assert.equal(row.facts.options[0].rateRef.externalId,selected.offer.rateRef.externalId);checked=true;
  return {response:{reply:selected.option.title+' costs '+selected.offer.price.amount+' USD for the whole party.',recommendedProductId:rob.product.productId,selectedOfferId:selected.offer.offerId,action:'RECOMMEND',nextQuestionCode:'',evidenceRefs:[offers.evidenceId]}};
 }}}});
 assert.ok(checked);assert.equal(result.source,'workers-ai-grounded-sales');assert.equal(rob.facts.options.length,7);
});

for(const [locale,message] of [['ru','Чем она отличается от Hòn Mun?'],['vi','Tour này khác Hòn Mun như thế nào?'],['en','How does it differ from Hòn Mun?'],['zh','它与 Hòn Mun 有什么区别？'],['ko','이 투어는 Hòn Mun과 어떻게 다른가요?']]){
 test('a comparative question naming an option never becomes a booking/date request: '+locale,async()=>{
  const r=await extractConversationIntent({message,locale,products,currentIntent:createInitialTravelIntent(locale),context:{currentProductId:rob.product.productId},now});
  assert.equal(r.goal,'COMPARE');assert.equal(r.bookingRequested,false);assert.notEqual(r.source,'booking-continuation');
 });
}


test('one named option with an exact total is not an all-option price request in any locale',()=>{
 for(const message of [
  'Подготовь вариант Robinson & Hon Tam Mud Bath на 2026-10-14, 2 взрослых. Покажи точную итоговую цену.',
  'Choose the option Robinson & Hon Tam Mud Bath on 2026-10-14, 2 adults. Show the exact total price.',
  'Chọn phương án Robinson & Tắm bùn Hòn Tằm ngày 2026-10-14, 2 người lớn. Cho biết tổng giá chính xác.',
  '选择 Robinson & Hon Tam Mud Bath 选项，日期 2026-10-14，2位成人。请给出准确总价。',
  'Robinson & Hon Tam Mud Bath 옵션을 선택해 주세요. 날짜 2026-10-14, 성인 2명. 정확한 총액을 알려 주세요.',
 ])assert.equal(requestedOfferScope(message),'',message);
 for(const message of ['Сколько стоят варианты тура','Prices for all options','Giá tất cả phương án','Giá các phương án','所有选项价格','모든 옵션 가격'])assert.equal(requestedOfferScope(message),'ALL_OPTIONS',message);
});
