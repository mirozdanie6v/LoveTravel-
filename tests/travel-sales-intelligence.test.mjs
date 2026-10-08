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

test('invalid Conversation Intelligence output falls back to explicit non-mutating facts',async()=>{
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
  assert.equal(result.source,'deterministic-explicit');
  assert.deepEqual(result.patch,{locale:'en'});
});

test('Conversation Intelligence fails soft when Workers AI exceeds its time budget',async()=>{
  const env={
    TRAVEL_INTENT_AI_TIMEOUT_MS:'5',
    AI:{run(){return new Promise(()=>{});}},
  };
  const started=Date.now();
  const result=await extractConversationIntent({
    env,
    message:'Two adults, tomorrow, snorkeling, pickup from Oceanus. We want to book it.',
    currentIntent:createInitialTravelIntent('en'),
    locale:'en',
    products:[{
      product:{productId:'love-travel-hon-mun',title:'Hòn Mun Marine Park Snorkeling'},
    }],
    now:new Date('2026-10-06T12:00:00.000Z'),
  });
  assert.ok(Date.now()-started<500);
  assert.equal(result.source,'deterministic-explicit');
  assert.equal(result.patch.dateConstraint.exact,'2026-10-07');
  assert.equal(result.patch.party.adults,2);
  assert.equal(result.patch.hotel,'Oceanus');
  assert.equal(result.bookingRequested,true);
});

const explicitFallbackCases=[
  {
    locale:'en',
    message:'Two adults, tomorrow, snorkeling, pickup from Oceanus. We want to book it.',
  },
  {
    locale:'ru',
    message:'Двое взрослых, завтра хотим снорклинг, заберите нас из Oceanus. Хотим забронировать.',
  },
  {
    locale:'vi',
    message:'Hai người lớn, ngày mai muốn lặn ngắm san hô, đón tại Oceanus. Muốn đặt tour.',
  },
  {
    locale:'zh',
    message:'两位成人，明天想去浮潜，请从 Oceanus 接我们。我们要预订。',
  },
  {
    locale:'ko',
    message:'성인 두 명이고 내일 스노클링을 원합니다. Oceanus에서 픽업해 주세요. 예약하고 싶습니다.',
  },
];

for(const sample of explicitFallbackCases){
  test(`Conversation Intelligence preserves explicit booking facts when Workers AI structured output fails: ${sample.locale}`,async()=>{
    const env={
      AI:{
        async run(){
          throw new Error('structured_json_generation_failed');
        },
      },
    };
    const result=await extractConversationIntent({
      env,
      message:sample.message,
      currentIntent:createInitialTravelIntent(sample.locale),
      locale:sample.locale,
      products:[{
        product:{
          productId:'love-travel-hon-mun',
          title:'Hòn Mun Marine Park Snorkeling',
        },
      }],
      now:new Date('2026-10-06T12:00:00.000Z'),
    });

    assert.equal(result.source,'deterministic-explicit');
    assert.equal(result.patch.locale,sample.locale);
    assert.equal(result.patch.dateConstraint.exact,'2026-10-07');
    assert.equal(result.patch.party.adults,2);
    assert.ok(result.patch.preferenceAdds.includes('SNORKELING'));
    assert.equal(result.patch.hotel,'Oceanus');
    assert.equal(result.patch.pickupPreference,'PICKUP');
    assert.equal(result.goal,'BOOK');
    assert.equal(result.bookingRequested,true);
  });
}

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

test('grounded Sales Intelligence fails soft when response generation exceeds its time budget',async()=>{
  const evidence=[productEvidence(),offerEvidence(98)];
  const env={
    TRAVEL_SALES_AI_TIMEOUT_MS:'5',
    AI:{run(){return new Promise(()=>{});}},
  };
  const intent=mergeIntentPatch(createInitialTravelIntent('en'),{
    dateConstraint:{kind:'EXACT',exact:'2026-10-07'},
    party:{adults:2},
  });
  const started=Date.now();
  const plan=await composeGroundedSalesPlan({
    env,
    message:'What would you recommend?',
    locale:'en',
    intent,
    evidence,
    goal:'DISCOVER',
  });
  assert.ok(Date.now()-started<500);
  assert.equal(plan.source,'deterministic-grounded-fallback');
  assert.equal(plan.selectedOfferId,'offer-1');
  assert.match(plan.reply,/98 USD/);
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

// Consultation is available before the commercial booking parameters are known.
const consultationReplies={ru:'В экскурсию включена лодка.',vi:'Tour bao gồm thuyền.',en:'The tour includes a boat.',zh:'行程包含乘船。',ko:'투어에는 보트가 포함됩니다.'};
for(const locale of Object.keys(consultationReplies)){
  for(const goal of ['GENERAL','DETAILS','COMPARE','PICKUP']){
    test('consultation before date and party: '+locale+' '+goal,async()=>{
      let calls=0;
      const env={AI:{async run(_model,input){
        calls++;
        assert.match(input.messages[0].content,/VERIFIED_EVIDENCE=/);
        assert.doesNotMatch(input.messages[0].content,/If date is missing use ASK_DATE\. If party size is missing use ASK_PARTY\./);
        return {response:JSON.stringify({reply:consultationReplies[locale],recommendedProductId:'love-travel-hon-mun',selectedOfferId:'',action:goal==='COMPARE'?'COMPARE':'GENERAL',nextQuestionCode:'',evidenceRefs:['cap-products']})};
      }}};
      const result=await composeGroundedSalesPlan({env,message:'What does this tour include?',locale,intent:createInitialTravelIntent(locale),evidence:[productEvidence()],goal});
      assert.equal(calls,1,'the answer model must receive a consultation question');
      assert.equal(result.reply,consultationReplies[locale]);
      assert.equal(result.source,'workers-ai-grounded-sales');
      assert.equal(result.selectedOfferId,'');
    });
  }
}

test('consultation history reaches the answer model as bounded conversation context',async()=>{
  let messages;
  const env={AI:{async run(_model,input){messages=input.messages;return {response:JSON.stringify({reply:'The tour includes a boat.',recommendedProductId:'love-travel-hon-mun',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'',evidenceRefs:['cap-products']})};}}};
  await composeGroundedSalesPlan({env,message:'What is included in it?',locale:'en',intent:createInitialTravelIntent('en'),evidence:[productEvidence()],goal:'DETAILS',history:[{role:'user',text:'Tell me about Hon Mun.'},{role:'assistant',text:'Hon Mun is a snorkeling tour.'}]});
  assert.ok(messages?.some(item=>item.role==='user'&&item.content==='Tell me about Hon Mun.'));
  assert.ok(messages?.some(item=>item.role==='assistant'&&item.content==='Hon Mun is a snorkeling tour.'));
  assert.equal(messages.at(-1).content,'What is included in it?');
});

test('questions about booking conditions remain consultation when intent AI is unavailable',async()=>{
  for(const [locale,message] of [['ru','Какие условия отмены бронирования?'],['en','What are the booking conditions?'],['vi','Điều kiện đặt tour là gì?'],['zh','预订的取消政策是什么？'],['ko','예약 취소 규정은 무엇인가요?']]){
    const result=await extractConversationIntent({env:{},message,locale,currentIntent:createInitialTravelIntent(locale),products:productEvidence().data});
    assert.equal(result.goal,'DETAILS',locale);
    assert.equal(result.bookingRequested,false,locale);
  }
});


test('Gemma requests bound generation and parse structured object replies',async()=>{
  const requests=[];
  const env={AI_MODEL:'@cf/google/gemma-4-26b-a4b-it',AI:{async run(_model,input){requests.push(input);return {response:input.messages[0].content.includes('Conversation Intelligence parser')?{intentPatch:{locale:'en',goal:'DETAILS'}}:{reply:'The tour includes a boat.',recommendedProductId:'love-travel-hon-mun',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'',evidenceRefs:['cap-products']}};}}};
  const intent=createInitialTravelIntent('en');
  const parsed=await extractConversationIntent({env,message:'What is included?',locale:'en',currentIntent:intent,products:productEvidence().data});
  const reply=await composeGroundedSalesPlan({env,message:'What is included?',locale:'en',intent,evidence:[productEvidence()],goal:parsed.goal});
  assert.equal(parsed.goal,'DETAILS');assert.equal(reply.source,'workers-ai-grounded-sales');
  for(const request of requests){assert.equal(request.chat_template_kwargs.enable_thinking,false);assert.ok(request.max_completion_tokens<=900);}
});

test('consultation timeout is an explicit retryable failure rather than a date question',async()=>{
  const plan=await composeGroundedSalesPlan({env:{TRAVEL_SALES_AI_TIMEOUT_MS:'5',AI:{run:()=>new Promise(()=>{})}},message:'What is included?',locale:'en',intent:createInitialTravelIntent('en'),evidence:[productEvidence()],goal:'DETAILS'});
  assert.equal(plan.degraded,true);assert.equal(plan.replyFailureReason,'timeout');assert.equal(plan.nextQuestionCode,'RETRY');
  assert.doesNotMatch(plan.reply,/What date/);
});


test('Gemma answer schema restricts actions and IDs to verified evidence',async()=>{
  const env={AI_MODEL:'@cf/google/gemma-4-26b-a4b-it',AI:{async run(_model,input){
    assert.equal(input.temperature,0.1);
    assert.equal(input.response_format.type,'json_schema');
    const format=input.response_format.json_schema;
    assert.equal(format.strict,true);
    assert.equal(format.schema.additionalProperties,false);
    assert.deepEqual(format.schema.properties.recommendedProductId.enum,['','love-travel-hon-mun']);
    assert.deepEqual(format.schema.properties.selectedOfferId.enum,['']);
    assert.deepEqual(format.schema.properties.evidenceRefs.items.enum,['cap-products']);
    assert.ok(!format.schema.properties.action.enum.includes('DETAILS'));
    assert.ok(format.schema.properties.reply.maxLength<=1800);
    return {response:{reply:'The tour includes a boat.',recommendedProductId:'love-travel-hon-mun',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'',evidenceRefs:['cap-products']}};
  }}};
  const plan=await composeGroundedSalesPlan({env,message:'What is included?',locale:'en',intent:createInitialTravelIntent('en'),evidence:[productEvidence()],goal:'DETAILS'});
  assert.equal(plan.source,'workers-ai-grounded-sales');
});

for(const [result,reason] of [
  [{response:'Incomplete JSON'},'invalid_json'],
  [{choices:[{finish_reason:'length',message:{content:'partial'}}]},'output_truncated'],
  [{response:{reply:'A boat is included.',action:'DETAILS'}},'invalid_action'],
  [{response:{reply:'A boat is included.',action:'GENERAL',extra:'unexpected'}},'invalid_schema'],
]){
  test('model failure has safe specific diagnosis: '+reason,async()=>{
    const env={AI:{run:async()=>result}};
    const plan=await composeGroundedSalesPlan({env,message:'What is included?',locale:'en',intent:createInitialTravelIntent('en'),evidence:[productEvidence()],goal:'DETAILS'});
    assert.equal(plan.degraded,true);assert.equal(plan.replyFailureReason,reason);
    assert.equal(plan.nextQuestionCode,'RETRY');
  });
}

test('unsupported descriptive prices are regenerated once without weakening price validation',async()=>{
  let calls=0;
  const env={AI:{async run(_model,input){
    calls++;
    assert.match(input.messages[0].content,/Numeric prices in descriptions are not authoritative offers/);
    assert.match(input.messages[0].content,/VERIFIED_OFFER_PRICES=\[\]/);
    if(calls===2) assert.match(input.messages[0].content,/previous generation failed validation/);
    return {response:{reply:calls===1?'A motorbike costs $6.':'Motorbike rental is optional and paid separately.',recommendedProductId:'',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'',evidenceRefs:['cap-products']}};
  }}};
  const plan=await composeGroundedSalesPlan({env,message:'What is included?',locale:'en',intent:createInitialTravelIntent('en'),evidence:[productEvidence()],goal:'DETAILS'});
  assert.equal(calls,2);assert.equal(plan.source,'workers-ai-grounded-sales');assert.ok(!plan.degraded);
  assert.doesNotMatch(plan.reply,/\$/);
});

test('both invalid answer attempts remain rejected with a precise safe reason',async()=>{
  let calls=0;
  const env={AI:{async run(){calls++;return {response:{reply:'The price is $6.',recommendedProductId:'',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'',evidenceRefs:['cap-products']}};}}};
  const plan=await composeGroundedSalesPlan({env,message:'What is included?',locale:'en',intent:createInitialTravelIntent('en'),evidence:[productEvidence()],goal:'DETAILS'});
  assert.equal(calls,2);assert.equal(plan.degraded,true);assert.equal(plan.replyFailureReason,'unverified_price');
  assert.doesNotMatch(plan.reply,/\$/);
});

test('model access failures are never blindly retried',async()=>{
  let calls=0;
  const env={AI:{async run(){calls++;throw new Error('Model permission denied');}}};
  const plan=await composeGroundedSalesPlan({env,message:'What is included?',locale:'en',intent:createInitialTravelIntent('en'),evidence:[productEvidence()],goal:'DETAILS'});
  assert.equal(calls,1);assert.equal(plan.replyFailureReason,'model_access');assert.equal(plan.degraded,true);
});

test('a comparison must identify both verified tours and explain the choice',async()=>{
  const evidence=productEvidence();
  evidence.data.push({product:{productId:'love-travel-robinson-island',title:'Robinson Beach'}});
  const generic={reply:'Both tours are seven hours long but they differ.',recommendedProductId:'',selectedOfferId:'',action:'COMPARE',nextQuestionCode:'',evidenceRefs:['cap-products']};
  assert.throws(()=>validateGroundedSalesPlan(generic,[evidence],'en','COMPARE'),/comparison omits/);
  const detailed={...generic,reply:'Robinson Beach visits a fishing village with kayaking. Hon Mun focuses on snorkeling and a mud bath.'};
  assert.equal(validateGroundedSalesPlan(detailed,[evidence],'en','COMPARE').action,'COMPARE');
});

test('an incomplete comparison is regenerated once with both verified tours',async()=>{
  const evidence=productEvidence();
  evidence.data.push({product:{productId:'love-travel-robinson-island',title:'Robinson Beach'}});
  let calls=0;
  const env={AI:{async run(){calls++;return {response:{reply:calls===1?'Both tours differ.':'Robinson Beach offers kayaking; Hon Mun focuses on snorkeling.',recommendedProductId:'',selectedOfferId:'',action:'COMPARE',nextQuestionCode:'',evidenceRefs:['cap-products']}};}}};
  const plan=await composeGroundedSalesPlan({env,message:'Compare these tours.',locale:'en',intent:createInitialTravelIntent('en'),evidence:[evidence],goal:'COMPARE'});
  assert.equal(plan.source,'workers-ai-grounded-sales');assert.equal(plan.replyAttempts,2);
  assert.deepEqual(plan.replyFailureReasons,['answer_validation']);
});

test('dated available recommendations must select an offer for the same verified product',async()=>{
  const evidence=[productEvidence(),offerEvidence()];
  const empty={reply:'Compare these tours.',recommendedProductId:'',selectedOfferId:'',action:'COMPARE',nextQuestionCode:'',evidenceRefs:['cap-products']};
  assert.throws(()=>validateGroundedSalesPlan(empty,evidence,'en','GENERAL'),/offer recommendation is required/);
  const valid={...empty,reply:'Hon Mun is available for $98.',recommendedProductId:'love-travel-hon-mun',selectedOfferId:'offer-1',action:'RECOMMEND'};
  assert.equal(validateGroundedSalesPlan(valid,evidence,'en','GENERAL').selectedOfferId,'offer-1');
  const more=productEvidence();more.data.push({product:{productId:'love-travel-robinson-island',title:'Robinson Beach'}});
  assert.throws(()=>validateGroundedSalesPlan({...valid,recommendedProductId:'love-travel-robinson-island'},[more,offerEvidence()],'en','GENERAL'),/differs from verified offer/);
});

test('Gemma recommendation schema cannot return an unselected comparison when offers are available',async()=>{
  const env={AI_MODEL:'@cf/google/gemma-4-26b-a4b-it',AI:{async run(_model,input){
    const schema=input.response_format.json_schema.schema;
    assert.deepEqual(schema.properties.selectedOfferId.enum,['offer-1']);
    assert.deepEqual(schema.properties.recommendedProductId.enum,['love-travel-hon-mun']);
    assert.deepEqual(schema.properties.action.enum,['RECOMMEND','OFFER_READY']);
    return {response:{reply:'Hon Mun is available for $98.',recommendedProductId:'love-travel-hon-mun',selectedOfferId:'offer-1',action:'RECOMMEND',nextQuestionCode:'',evidenceRefs:['cap-offers']}};
  }}};
  const plan=await composeGroundedSalesPlan({env,message:'What do you recommend?',locale:'en',intent:createInitialTravelIntent('en'),evidence:[productEvidence(),offerEvidence()],goal:'GENERAL'});
  assert.equal(plan.source,'workers-ai-grounded-sales');assert.equal(plan.selectedOfferId,'offer-1');
});

test('authoritative offers do not ask again for date and party stored outside discovery hints',()=>{
  const plan=deterministicSalesFallback({locale:'en',intent:createInitialTravelIntent('en'),evidence:[offerEvidence()],goal:'BOOK'});
  assert.equal(plan.selectedOfferId,'offer-1');assert.equal(plan.action,'RECOMMEND');
});

test('Russian instrumental transfer wording preserves the hotel during intent fallback',async()=>{
  const result=await extractConversationIntent({env:{},message:'Нас двое взрослых, завтра с трансфером от Oceanus.',locale:'ru',currentIntent:createInitialTravelIntent('ru'),products:productEvidence().data,now:new Date('2026-10-06T12:00:00Z')});
  assert.equal(result.patch.hotel,'Oceanus');assert.equal(result.patch.party.adults,2);
});

for(const [locale,message] of [
  ['en','Change pickup from Amiana.'],
  ['ru','Поменяйте трансфер от Amiana.'],
  ['vi','Thay đổi khách sạn đưa đón: Amiana.'],
  ['zh','请把接送酒店改为 Amiana。'],
  ['ko','픽업 호텔을 Amiana로 변경해주세요.'],
]){
  test('explicit hotel correction remains a selection command: '+locale,async()=>{
    const result=await extractConversationIntent({env:{AI:{run:async()=>({response:{intentPatch:{locale,goal:'PICKUP',hotel:'Amiana',pickupPreference:'PICKUP',bookingRequested:false}}})}},message,locale,currentIntent:createInitialTravelIntent(locale),products:productEvidence().data});
    assert.equal(result.goal,'GENERAL');assert.equal(result.patch.hotel,'Amiana');assert.equal(result.bookingRequested,false);
  });
}

test('a question about the ability to change pickup remains read-only',async()=>{
  const result=await extractConversationIntent({env:{AI:{run:async()=>({response:{intentPatch:{locale:'en',goal:'PICKUP',hotel:'Amiana',pickupPreference:'PICKUP'}}})}},message:'Can I change pickup from Amiana?',locale:'en',currentIntent:createInitialTravelIntent('en'),products:productEvidence().data});
  assert.equal(result.goal,'PICKUP');
});

test('complete selections and custom transport addresses never enter the answer model',async()=>{
  const evidence=offerEvidence();
  evidence.data[0].selection={customer:{email:'private@example.test'},passengers:[{passportId:'PRIVATE-ID'}]};
  evidence.data[0].offer.pickup={mode:'CUSTOM',customText:'private home address'};
  const env={AI_MODEL:'fake',AI:{async run(_model,input){
    assert.ok(!input.messages[0].content.includes('private@example.test'));
    assert.ok(!input.messages[0].content.includes('PRIVATE-ID'));
    assert.ok(!input.messages[0].content.includes('private home address'));
    return {response:{reply:'The offer is $98.',recommendedProductId:'love-travel-hon-mun',selectedOfferId:'offer-1',action:'RECOMMEND',nextQuestionCode:'',evidenceRefs:['cap-offers']}};
  }}};
  const plan=await composeGroundedSalesPlan({env,message:'What is the price?',locale:'en',intent:createInitialTravelIntent('en'),evidence:[evidence],goal:'PRICE'});
  assert.equal(plan.source,'workers-ai-grounded-sales');
});


for(const [locale,reply] of [
  ['ru','Стоимость 98 долларов за человека.'],
  ['vi','Giá 98 đô la Mỹ mỗi người.'],
  ['en','The tour costs 98 USD per person.'],
  ['zh','价格为每人 98 美元。'],
  ['ko','1인당 98달러입니다.'],
]){
  test('a verified total is never relabeled as a unit price: '+locale,()=>{
    const raw={reply,recommendedProductId:'love-travel-hon-mun',selectedOfferId:'offer-1',action:'RECOMMEND',nextQuestionCode:'',evidenceRefs:['cap-offers']};
    assert.throws(()=>validateGroundedSalesPlan(raw,[offerEvidence()],locale,'GENERAL'),/per-person monetary claim/);
  });
}

for(const [locale,reply] of [
  ['ru','Прокат стоит 6 долларов.'],
  ['vi','Thuê xe giá 6 đô la.'],
  ['en','Rental costs 6 dollars.'],
  ['zh','摩托车租赁费为每人 6 美元。'],
  ['ko','대여 비용은 6달러입니다.'],
]){
  test('unverified localized monetary amounts remain rejected: '+locale,()=>{
    const raw={reply,recommendedProductId:'',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'',evidenceRefs:['cap-products']};
    assert.throws(()=>validateGroundedSalesPlan(raw,[productEvidence()],locale,'DETAILS'),/unverified monetary claim/);
  });
}

test('verified amount with the wrong currency is rejected',()=>{
  const raw={reply:'The tour total is 98 EUR.',recommendedProductId:'love-travel-hon-mun',selectedOfferId:'offer-1',action:'RECOMMEND',nextQuestionCode:'',evidenceRefs:['cap-offers']};
  assert.throws(()=>validateGroundedSalesPlan(raw,[offerEvidence()],'en','GENERAL'),/unverified monetary claim/);
  assert.equal(validateGroundedSalesPlan({...raw,reply:'The total for two adults is 98 USD.'},[offerEvidence()],'en','GENERAL').selectedOfferId,'offer-1');
});

test('unit-price wording is regenerated as the authoritative group total',async()=>{
  let calls=0;
  const env={AI:{async run(_model,input){
    calls++;
    assert.match(input.messages[0].content,/TOTAL for the entire offer.participantMix/);
    return {response:{reply:calls===1?'The tour is 98 USD per person.':'The total for two adults is 98 USD.',recommendedProductId:'love-travel-hon-mun',selectedOfferId:'offer-1',action:'RECOMMEND',nextQuestionCode:'',evidenceRefs:['cap-offers']}};
  }}};
  const plan=await composeGroundedSalesPlan({env,message:'What is the price for two adults?',locale:'en',intent:createInitialTravelIntent('en'),evidence:[offerEvidence()],goal:'PRICE'});
  assert.equal(plan.source,'workers-ai-grounded-sales');assert.equal(plan.replyAttempts,2);
  assert.deepEqual(plan.replyFailureReasons,['unverified_price']);
  assert.equal(plan.reply,'The total for two adults is 98 USD.');
});


test('descriptive rental prices are removed only from model facts while exact offers remain intact',async()=>{
  const products=productEvidence();
  products.data[0].facts={description:'Optional motorbike rental costs US$6 per person.',itinerary:[{body:'Kayaking is included; rental costs 6 dollars.'}],cancellationPolicy:{deadlineHours:24,penaltyPercent:100}};
  const before=structuredClone(products);
  const env={AI:{async run(_model,input){
    const prompt=input.messages[0].content;
    const modelView=JSON.parse(prompt.split('VERIFIED_EVIDENCE=')[1]);
    assert.ok(!JSON.stringify(modelView[0].data).includes('US$6'));
    assert.ok(!JSON.stringify(modelView[0].data).includes('6 dollars'));
    assert.match(modelView[0].data[0].facts.description,/additional charge/);
    assert.equal(modelView[0].data[0].facts.cancellationPolicy.deadlineHours,24);
    assert.equal(modelView[0].data[0].facts.cancellationPolicy.penaltyPercent,100);
    assert.equal(modelView[1].data[0].offer.price.amount,98);
    return {response:{reply:'The total for two adults is 98 USD. Motorbike rental is optional and paid separately.',recommendedProductId:'love-travel-hon-mun',selectedOfferId:'offer-1',action:'RECOMMEND',nextQuestionCode:'',evidenceRefs:['cap-products','cap-offers']}};
  }}};
  const plan=await composeGroundedSalesPlan({env,message:'What does the tour cost?',locale:'en',intent:createInitialTravelIntent('en'),evidence:[products,offerEvidence()],goal:'GENERAL'});
  assert.equal(plan.source,'workers-ai-grounded-sales');
  assert.deepEqual(products,before);
});
