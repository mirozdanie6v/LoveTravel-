import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeGroundedSalesPlan,
  createInitialTravelIntent,
  deterministicSalesFallback,
  extractConversationIntent,
  mergeIntentPatch,
  validateGroundedSalesPlan,
  validateIntentPatch,
} from '../src/travel-sales-intelligence.js';

function productEvidence(){
  return {
    evidenceId:'cap-products',
    source:'BOKUN',
    authority:'PROVIDER_VERIFIED',
    capability:'searchProducts',
    retrievedAt:'2026-10-06T12:00:00.000Z',
    data:[{
      product:{
        productId:'love-travel-hon-mun',
        providerRef:{provider:'BOKUN',resourceType:'ACTIVITY',externalId:'1287580',accountRef:'137689'},
        title:'Hòn Mun Marine Park Snorkeling',
      },
    }],
  };
}

function offerEvidence(amount=98){
  return {
    evidenceId:'cap-offers',
    source:'BOKUN',
    authority:'PROVIDER_VERIFIED',
    capability:'searchOffers',
    retrievedAt:'2026-10-06T12:00:00.000Z',
    data:[{
      product:{
        productId:'love-travel-hon-mun',
        providerRef:{provider:'BOKUN',resourceType:'ACTIVITY',externalId:'1287580',accountRef:'137689'},
        title:'Hòn Mun Marine Park Snorkeling',
      },
      offer:{
        offerId:'offer-1',
        price:{amount,currency:'USD'},
        availability:{status:'AVAILABLE',remaining:12},
      },
    }],
  };
}

test('intent patch is strict and semantic',()=>{
  assert.deepEqual(validateIntentPatch({
    locale:'en',
    dateConstraint:{kind:'EXACT',exact:'2026-10-07'},
    party:{adults:2,childrenAges:[7],infants:0},
    preferenceAdds:['SNORKELING'],
    hotel:'Oceanus',
    pickupPreference:'PICKUP',
    selectedProductId:'love-travel-hon-mun',
    goal:'BOOK',
    bookingRequested:true,
  }).party,{adults:2,childrenAges:[7],infants:0});

  assert.throws(()=>validateIntentPatch({preferences:['море']}),/unknown fields/);
  assert.throws(()=>validateIntentPatch({preferenceAdds:['море']}),/invalid preferenceAdds/);
  assert.throws(()=>validateIntentPatch({selectedProductId:'1287580'}),/invalid selectedProductId/);
});

test('mergeIntentPatch applies corrections without copying language labels into commerce state',()=>{
  let intent=createInitialTravelIntent('ru');
  intent=mergeIntentPatch(intent,{
    dateConstraint:{kind:'EXACT',exact:'2026-10-07'},
    party:{adults:2,childrenAges:[7]},
    preferenceAdds:['SNORKELING','ISLANDS'],
    hotel:'Oceanus',
    pickupPreference:'PICKUP',
  });
  assert.equal(intent.dateConstraint.exact,'2026-10-07');
  assert.equal(intent.party.adults,2);
  assert.deepEqual(intent.party.children,[{age:7}]);
  assert.deepEqual(intent.preferences.map(item=>item.code),['SNORKELING','ISLANDS']);

  intent=mergeIntentPatch(intent,{
    dateConstraint:{kind:'EXACT',exact:'2026-10-08'},
    party:{childrenAges:[5]},
    preferenceRemoves:['ISLANDS'],
  });
  assert.equal(intent.dateConstraint.exact,'2026-10-08');
  assert.deepEqual(intent.party.children,[{age:5}]);
  assert.deepEqual(intent.preferences.map(item=>item.code),['SNORKELING']);
});

test('Conversation Intelligence accepts only structured model output',async()=>{
  const env={
    AI_MODEL:'fake',
    AI:{
      async run(_model,input){
        assert.match(input.messages[0].content,/Conversation Intelligence parser/);
        return {
          response:JSON.stringify({
            intentPatch:{
              locale:'en',
              dateConstraint:{kind:'EXACT',exact:'2026-10-07'},
              party:{adults:2},
              preferenceAdds:['SNORKELING'],
              hotel:'Oceanus',
              pickupPreference:'PICKUP',
              selectedProductId:'love-travel-hon-mun',
              goal:'BOOK',
              bookingRequested:true,
            },
          }),
        };
      },
    },
  };
  const result=await extractConversationIntent({
    env,
    message:'Two adults tomorrow, Hòn Mun snorkeling, pick us up at Oceanus.',
    currentIntent:createInitialTravelIntent('en'),
    locale:'en',
    products:[{
      product:{productId:'love-travel-hon-mun',title:'Hòn Mun'},
    }],
    now:new Date('2026-10-06T12:00:00.000Z'),
  });
  assert.equal(result.patch.dateConstraint.exact,'2026-10-07');
  assert.equal(result.patch.party.adults,2);
  assert.equal(result.selectedProductId,'love-travel-hon-mun');
  assert.equal(result.goal,'BOOK');
  assert.equal(result.bookingRequested,true);
});

test('invalid Conversation Intelligence output fails to an empty non-mutating patch',async()=>{
  const env={
    AI:{
      async run(){
        return {response:JSON.stringify({
          intentPatch:{
            locale:'en',
            shellCommand:'rm -rf /',
          },
        })};
      },
    },
  };
  const result=await extractConversationIntent({
    env,
    message:'hello',
    currentIntent:createInitialTravelIntent('en'),
    locale:'en',
  });
  assert.equal(result.goal,'GENERAL');
  assert.equal(result.source,'deterministic-empty');
  assert.deepEqual(result.patch,{locale:'en'});
});

test('grounded sales validation rejects unverified product, evidence and price claims',()=>{
  const evidence=[productEvidence(),offerEvidence(98)];
  assert.throws(()=>validateGroundedSalesPlan({
    reply:'This costs $120.',
    recommendedProductId:'love-travel-hon-mun',
    selectedOfferId:'offer-1',
    action:'RECOMMEND',
    nextQuestionCode:'CHOOSE',
    evidenceRefs:['cap-offers'],
  },evidence,'en'),/unverified monetary claim/);

  assert.throws(()=>validateGroundedSalesPlan({
    reply:'This option is available.',
    recommendedProductId:'invented-product',
    selectedOfferId:'offer-1',
    action:'RECOMMEND',
    nextQuestionCode:'CHOOSE',
    evidenceRefs:['cap-offers'],
  },evidence,'en'),/not in verified evidence/);

  assert.throws(()=>validateGroundedSalesPlan({
    reply:'This option is available.',
    recommendedProductId:'love-travel-hon-mun',
    selectedOfferId:'offer-1',
    action:'RECOMMEND',
    nextQuestionCode:'CHOOSE',
    evidenceRefs:['fake-evidence'],
  },evidence,'en'),/unknown evidence/);
});

test('grounded Sales Intelligence may quote exactly the verified Offer price',async()=>{
  const evidence=[productEvidence(),offerEvidence(98)];
  const env={
    AI:{
      async run(_model,input){
        const system=input.messages[0].content;
        assert.match(system,/VERIFIED_EVIDENCE=/);
        return {
          response:JSON.stringify({
            reply:'Hòn Mun is available for your selected date at $98 for your party. Would you like to continue with this option?',
            recommendedProductId:'love-travel-hon-mun',
            selectedOfferId:'offer-1',
            action:'RECOMMEND',
            nextQuestionCode:'CHOOSE_OFFER',
            evidenceRefs:['cap-products','cap-offers'],
          }),
        };
      },
    },
  };
  const intent=mergeIntentPatch(createInitialTravelIntent('en'),{
    dateConstraint:{kind:'EXACT',exact:'2026-10-07'},
    party:{adults:2},
  });
  const plan=await composeGroundedSalesPlan({
    env,
    message:'What would you recommend?',
    locale:'en',
    intent,
    evidence,
    goal:'DISCOVER',
  });
  assert.equal(plan.source,'workers-ai-grounded-sales');
  assert.equal(plan.recommendedProductId,'love-travel-hon-mun');
  assert.match(plan.reply,/\$98/);
});

test('ungrounded Sales Intelligence output is replaced by deterministic verified fallback',async()=>{
  const evidence=[productEvidence(),offerEvidence(98)];
  const env={
    AI:{
      async run(){
        return {
          response:JSON.stringify({
            reply:'Special price today is $999.',
            recommendedProductId:'love-travel-hon-mun',
            selectedOfferId:'offer-1',
            action:'RECOMMEND',
            nextQuestionCode:'CHOOSE_OFFER',
            evidenceRefs:['cap-offers'],
          }),
        };
      },
    },
  };
  const intent=mergeIntentPatch(createInitialTravelIntent('en'),{
    dateConstraint:{kind:'EXACT',exact:'2026-10-07'},
    party:{adults:2},
  });
  const plan=await composeGroundedSalesPlan({
    env,message:'price?',locale:'en',intent,evidence,goal:'PRICE',
  });
  assert.equal(plan.source,'deterministic-grounded-fallback');
  assert.doesNotMatch(plan.reply,/999/);
  assert.match(plan.reply,/98 USD/);
});

test('deterministic fallback asks only for missing sales-critical state',()=>{
  const empty=createInitialTravelIntent('en');
  assert.equal(deterministicSalesFallback({
    locale:'en',intent:empty,evidence:[productEvidence()],
  }).action,'ASK_DATE');

  const withDate=mergeIntentPatch(empty,{
    dateConstraint:{kind:'EXACT',exact:'2026-10-07'},
  });
  assert.equal(deterministicSalesFallback({
    locale:'en',intent:withDate,evidence:[productEvidence()],
  }).action,'ASK_PARTY');
});
