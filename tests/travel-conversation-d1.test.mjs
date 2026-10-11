import test from 'node:test';
import assert from 'node:assert/strict';
import {startBookingUiHarness} from './helpers/booking-ui-harness.mjs';
import {optionCatalogDomains} from './fixtures/travel-option-catalog.mjs';
import {createBokunProvider} from '../src/bokun-provider.js';
import {createLoveTravelSalesOrchestrator} from '../src/travel-sales-orchestrator.js';
import {currentCommerceTransaction} from '../src/travel-session.js';

test('persisted conversation retains date through all-prices, last-list choice and factual follow-up in one transaction',async()=>{
 const domains=optionCatalogDomains().map(d=>({...d,availabilitySlots:d.availabilitySlots.map(s=>({...s,date:'2026-10-14'}))}));
 const h=await startBookingUiHarness(domains);
 const DB=h.env.DB;
 await DB.prepare('CREATE TABLE IF NOT EXISTS ai_conversation_memory(session_id TEXT PRIMARY KEY,memory_json TEXT,updated_at TEXT)').run();
 const id='context-parity-session-1234567890';await DB.prepare('INSERT INTO sessions(id) VALUES(?)').bind(id).run();
 let reads=0;
 const provider={...createBokunProvider({fetchImpl:async()=>{throw Error('No upstream booking mutations permitted');}}),async getDomains({productIds}={}){reads++;return structuredClone(domains.filter(d=>!productIds||productIds.includes(d.experience.id)));}};
 const env={...h.env,AI:{async run(_model,input){
  const message=input.messages.at(-1).content;
  if(input.messages[0].content.includes('Conversation Intelligence parser'))return {response:{intentPatch:{goal:/Хочу/iu.test(message)?'BOOK':/Сколько|Для всех/iu.test(message)?'PRICE':'DETAILS',dateConstraint:null,selectedOption:null}}};
  return {response:{reply:/Я ничего/u.test(message)?'1. Если хотите увидеть кораллы, выбирайте вариант с морским парком Hon Mun.\n2. Если хотите расслабиться — Hon Tam Mud Bath.':'Robinson & Hon Mun Marine Park — выбранный вариант этой экскурсии. Подробная программа отдельно для варианта не указана.',recommendedProductId:'love-travel-robinson-island',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'',evidenceRefs:[]}};
 }}};
 const turn=message=>createLoveTravelSalesOrchestrator({env,provider,now:()=>new Date('2026-10-11T19:40:00Z')}).turn({sessionId:id,locale:'ru',message});
 try{
  assert.equal((await turn('Хочу забронировать Робинсон')).agent.nextQuestionCode,'DATE');
  assert.equal((await turn('14')).agent.nextQuestionCode,'PARTY');
  const party=await turn('2 взрослых');assert.equal(party.intent.dateConstraint.exact,'2026-10-14');assert.equal(party.source,'provider-catalog-options');
  const before=await currentCommerceTransaction(env,id);assert.equal(before.selection||null,null,'The first provider rate must not be chosen automatically');
  const prices=await turn('Нет детей. Сколько стоят варианты тура');assert.equal(prices.source,'provider-option-prices');assert.equal(prices.offers.length,7);assert.equal(prices.intent.dateConstraint.exact,'2026-10-14');
  assert.ok(prices.offers.every(row=>row.productId==='love-travel-robinson-island'));
  assert.equal((await currentCommerceTransaction(env,id)).selection||null,null,'Browsing every price must not choose a tariff');
  const all=await turn('Для всех');assert.equal(all.offers.length,7);assert.doesNotMatch(all.reply,/На какую дату/);assert.equal(all.intent.dateConstraint.exact,'2026-10-14');
  await turn('Я ничего не поняла');const row=await DB.prepare('SELECT memory_json FROM ai_conversation_memory WHERE session_id=?').bind(id).first();const memory=JSON.parse(row.memory_json);assert.equal(memory.travelSales.optionList[0].rateRef.externalId,'2623660');
  const choice=await turn('1 вариант');assert.equal(choice.source,'provider-exact-offer');assert.equal(choice.bookingSelection.rateId,'2623660');assert.equal(choice.transaction.transactionId,before.transactionId);assert.equal(choice.transaction.quote.offer.date,'2026-10-14');assert.equal(choice.transaction.quote.offer.price.amount,110);
  const quoted=await currentCommerceTransaction(env,id);
  const question=await turn('Nha Trang Island Hopping Adventure in Robinson Beach (Robinson и Bich Dam).- это вариант с кораллами?');assert.equal(question.faqIntent,'details');
  const after=await currentCommerceTransaction(env,id);assert.deepEqual(after.selection,quoted.selection);assert.equal(after.revision,quoted.revision);assert.equal(after.providerBooking||null,null);
  assert.equal(h.upstreamCalls(),0);assert.ok(reads>0);
 }finally{await h.close();}
});
