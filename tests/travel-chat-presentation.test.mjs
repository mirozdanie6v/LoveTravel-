import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReplyText,optionCardsPresentation} from '../src/travel-response-composer.js';
import {createLoveTravelSalesOrchestrator} from '../src/travel-sales-orchestrator.js';
import {createBokunProvider} from '../src/bokun-provider.js';
import {validateGroundedSalesPlan} from '../src/travel-sales-intelligence.js';
import {ensureSalesSession} from '../src/travel-session.js';
import {startBookingUiHarness} from './helpers/booking-ui-harness.mjs';
import {optionCatalogDomains} from './fixtures/travel-option-catalog.mjs';

test('repair newline escape artifacts without changing amounts, dates or URL paths',()=>{
 assert.equal(normalizeReplyText(String.raw`Robinson\nHon Mun`),'Robinson\nHon Mun'.replace('\\n','\n'));
 assert.equal(normalizeReplyText(String.raw`Robinson\\nHon Mun`),'Robinson\nHon Mun');
 assert.equal(normalizeReplyText('Robinson.n.Nha Trang.nnHon Mun'),'Robinson.\n\nNha Trang.\n\nHon Mun');
 assert.equal(normalizeReplyText('Included:  - Lunch  - Snorkeling'),'Included:\n- Lunch\n- Snorkeling');
 assert.equal(normalizeReplyText('USD 35.77 on 2026-10-17; https://example.test/news'),'USD 35.77 on 2026-10-17; https://example.test/news');
});

test('catalogue cards keep adult starting prices distinct from verified group totals and never preselect',async()=>{
 const domains=optionCatalogDomains(),date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 for(const domain of domains)for(const slot of domain.availabilitySlots){slot.date=date;slot.id=slot.startTimeId+'_'+date;}
 for(const slot of domains[0].availabilitySlots)slot.priceQuotesByRate[0].participantPrices.find(p=>p.categoryId===101).amount.amount=35.77;
 const h=await startBookingUiHarness(domains);
 try{
  const scope=await ensureSalesSession(new Request('https://example.test/api/ai/chat',{headers:{cookie:h.fixtureCookie,'x-lt-conversation-id':'readable-options-conversation-12345'}}),h.env);
  const provider={...createBokunProvider({fetchImpl:async()=>{throw Error('No upstream call');}}),getDomains:async({productIds}={})=>structuredClone(domains.filter(d=>!productIds||productIds.includes(d.experience.id)))};
  const agent=createLoveTravelSalesOrchestrator({env:h.env,provider});
  const catalog=await agent.turn({sessionId:scope.id,locale:'ru',message:'Какие варианты экскурсии Robinson?'});
  assert.equal(catalog.source,'provider-catalog-options');assert.equal(catalog.optionCatalog.groups.length,1);
  const options=catalog.optionCatalog.groups[0].options;assert.equal(options.length,7);
  assert.deepEqual(options.map(o=>o.rateId),domains[0].rates.map(r=>r.id));
  assert.deepEqual(options[0].price,{amount:35.77,currency:'USD',kind:'FROM_ADULT'});
  assert.equal(catalog.bookingSelection,null);assert.equal(catalog.transaction.selectedOfferId,'');assert.equal(catalog.transaction.quote,null);
  const hon=await agent.turn({sessionId:scope.id,locale:'ru',message:'Какие варианты экскурсии Hon Mun и цены?'});
  assert.equal(hon.optionCatalog.groups[0].externalProductId,'1287580');assert.equal(hon.optionCatalog.groups[0].options.length,4);assert.equal(hon.transaction.quote,null);
  const prices=await agent.turn({sessionId:scope.id,locale:'ru',message:'Покажи цены всех вариантов Robinson на '+date+', 2 взрослых'});
  assert.equal(prices.source,'provider-option-prices');assert.equal(prices.optionCatalog.groups[0].options.length,7);
  assert.deepEqual(prices.optionCatalog.groups[0].options[0].price,{amount:71.54,currency:'USD',kind:'GROUP_TOTAL'});
  assert.ok(prices.optionCatalog.summary.includes(date));assert.equal(prices.bookingSelection,null);assert.equal(prices.transaction.quote,null);
  const chosen=await agent.turn({sessionId:scope.id,locale:'ru',message:'Выбираю «'+prices.optionCatalog.groups[0].title+'»: «'+options[0].title+'»'});
  const other=await agent.turn({sessionId:scope.id,locale:'ru',message:'Какие варианты экскурсии Hon Mun и цены?'});
  assert.equal(other.optionCatalog.groups[0].externalProductId,'1287580');assert.equal(other.optionCatalog.groups[0].options.length,4);
  assert.deepEqual(other.transaction.selection,chosen.transaction.selection);assert.deepEqual(other.transaction.quote,chosen.transaction.quote);
  const products=[{evidenceId:'catalog',capability:'searchProducts',data:[{product:{productId:'love-travel-robinson-island'},facts:{options:[{fromPrice:{amount:35.77,currency:'USD'}}]}}]}];
  assert.throws(()=>validateGroundedSalesPlan({reply:'The total is $35.77.',recommendedProductId:'love-travel-robinson-island',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'',evidenceRefs:['catalog']},products,'en','DETAILS'),/unverified monetary claim/);
  assert.equal(h.upstreamCalls(),0);
 }finally{await h.close();}
});
test('a missing dated offer never presents a catalogue starting price as a party total',()=>{
 const option={rateRef:{externalId:'rate-1'},title:'Beach',pricedPerPerson:true,fromPrice:{amount:35.77,currency:'USD'}};
 const result=optionCardsPresentation({plan:{source:'provider-option-prices',choices:[{productId:'tour-1',rateRef:option.rateRef}]},products:[{product:{productId:'tour-1',providerRef:{externalId:'tour-1'}},facts:{options:[option]}}],intent:{dateConstraint:{exact:'2026-10-17'}},locale:'ru'});
 assert.equal(result.groups[0].options[0].price,null);
});
