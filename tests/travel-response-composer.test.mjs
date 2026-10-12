import test from 'node:test';
import assert from 'node:assert/strict';
import {composeBookingResponse,acceptsBookingForm} from '../src/travel-response-composer.js';
const plan={source:'provider-exact-offer',reply:'Tour, tomorrow, two adults, 118 USD. Open the form.',nextQuestionCode:'OPEN_CONFIGURATOR'};
const transaction={transactionId:'txn-1',quote:{offer:{productId:'tour-1',date:'2026-10-13',rateRef:{externalId:'rate-1'},participantMix:[{role:'ADULT',count:2}],price:{amount:118,currency:'USD'}}}};
test('a pickup follow-up acknowledges the hotel rather than repeating the whole quote',()=>{
  const first=composeBookingResponse({plan,transaction,locale:'en',message:'No children.',memory:{}});
  const pickup=composeBookingResponse({plan,transaction,locale:'en',message:'Pickup from Oceanus.',hotel:'Oceanus',memory:{lastPresentedOffer:first.presentation},pickupChanged:true});
  assert.match(pickup.plan.reply,/Oceanus/);assert.notEqual(pickup.plan.reply,first.plan.reply);assert.ok(!pickup.plan.reply.includes('118'));
});
test('yes after the form invitation opens the form and never approves or reserves a quote',()=>{
  const first=composeBookingResponse({plan,transaction,locale:'ru',message:'Без детей.',memory:{}});
  const next=composeBookingResponse({plan,transaction,locale:'ru',message:'Да',memory:{lastPresentedOffer:first.presentation,nextQuestionCode:'OPEN_CONFIGURATOR'}});
  assert.equal(next.uiAction,'OPEN_CONFIGURATOR');assert.notEqual(next.plan.reply,first.plan.reply);
  const premature=composeBookingResponse({plan,transaction,locale:'ru',message:'Да',memory:{}});
  assert.equal(premature.uiAction,'');
});
test('changed commercial conditions receive a full updated quote',()=>{
  const first=composeBookingResponse({plan,transaction,locale:'en',message:'Book it',memory:{}});
  const changed=structuredClone(transaction);changed.quote.offer.price.amount=130;
  const next=composeBookingResponse({plan:{...plan,reply:'Updated total: 130 USD.'},transaction:changed,locale:'en',message:'Change the date',memory:{lastPresentedOffer:first.presentation}});
  assert.equal(next.plan.reply,'Updated total: 130 USD.');assert.notEqual(next.presentation,first.presentation);
});
test('inclusion numbering becomes readable bullets while choice numbering is preserved',()=>{
  const result=composeBookingResponse({plan:{source:'workers-ai-grounded-sales',action:'GENERAL',reply:'Included: 1. Boat 2. Equipment 3. Lunch. 2. Optional activities may cost extra.'},locale:'en',message:'What is included?',memory:{}});
  assert.match(result.plan.reply,/\n- Boat\n- Equipment\n- Lunch/);assert.ok(!result.plan.reply.includes('3.'));
  const choices=composeBookingResponse({plan:{source:'provider-catalog-options',nextQuestionCode:'OPTION',reply:'1. Beach\n2. Mud baths'},locale:'en',message:'What is included?',memory:{}});
  assert.equal(choices.plan.reply,'1. Beach\n2. Mud baths');
});

test('form acceptance recognizes all five languages without losing Korean syllables',()=>{
  for(const message of ['Да','Yes.','Vâng','네','예','好的','Давайте этот','이걸로 할게요'])assert.equal(acceptsBookingForm(message),true,message);
  for(const message of ['Нет','No','아니요','What is included?'])assert.equal(acceptsBookingForm(message),false,message);
});