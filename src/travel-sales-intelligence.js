import {
  CONTRACT_SCHEMA_VERSIONS,
  SUPPORTED_LOCALES,
  validateTravelIntent,
} from './travel-commerce-contracts.js';

export const SALES_GOALS=Object.freeze([
  'GENERAL',
  'DISCOVER',
  'COMPARE',
  'AVAILABILITY',
  'PRICE',
  'PICKUP',
  'DETAILS',
  'BOOK',
]);

export const SALES_ACTIONS=Object.freeze([
  'ASK_DATE',
  'ASK_PARTY',
  'ASK_PREFERENCE',
  'COMPARE',
  'RECOMMEND',
  'OFFER_READY',
  'GENERAL',
]);

export const PREFERENCE_CODES=Object.freeze([
  'SNORKELING',
  'ISLANDS',
  'BEACH',
  'MARINE_LIFE',
  'SCENIC',
  'RELAXED',
  'FAMILY',
  'BUDGET',
  'COMFORT',
]);

const PRODUCT_IDS=Object.freeze([
  'love-travel-robinson-island',
  'love-travel-hon-mun',
]);

const str=(value,max=2000)=>String(value??'').trim().slice(0,max);
const arr=value=>Array.isArray(value)?value:[];
const isObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);

function parseJson(raw){
  const value=str(raw,20000)
    .replace(/^\`\`\`(?:json)?\s*/i,'')
    .replace(/\s*\`\`\`$/,'');
  try{
    const parsed=JSON.parse(value);
    return isObject(parsed)?parsed:null;
  }catch{
    const start=value.indexOf('{');
    const end=value.lastIndexOf('}');
    if(start<0||end<=start) return null;
    try{
      const parsed=JSON.parse(value.slice(start,end+1));
      return isObject(parsed)?parsed:null;
    }catch{return null;}
  }
}

function responseText(result){
  if(typeof result==='string') return result;
  if(typeof result?.response==='string') return result.response;
  const choice=result?.choices?.[0];
  return choice?.message?.content||choice?.text||'';
}

function exactKeys(value,allowed,label){
  if(!isObject(value)) throw new TypeError(`${label} must be an object`);
  const unknown=Object.keys(value).filter(key=>!allowed.includes(key));
  if(unknown.length) throw new TypeError(`${label} unknown fields: ${unknown.join(', ')}`);
}

function validDateConstraint(value){
  if(value===null) return null;
  if(!isObject(value)) throw new TypeError('dateConstraint must be object or null');
  exactKeys(value,['kind','exact','from','to'],'dateConstraint');
  if(!['EXACT','RANGE','FLEXIBLE'].includes(value.kind)) throw new TypeError('invalid dateConstraint.kind');
  if(value.kind==='EXACT'&&!/^\d{4}-\d{2}-\d{2}$/.test(str(value.exact,10))) throw new TypeError('EXACT date is invalid');
  if(value.kind==='RANGE'&&(!/^\d{4}-\d{2}-\d{2}$/.test(str(value.from,10))||!/^\d{4}-\d{2}-\d{2}$/.test(str(value.to,10)))) throw new TypeError('RANGE dates are invalid');
  if(value.kind==='FLEXIBLE') return {kind:'FLEXIBLE'};
  return structuredClone(value);
}

function validPartyPatch(value){
  if(value===null) return null;
  if(!isObject(value)) throw new TypeError('party must be object or null');
  exactKeys(value,['adults','childrenAges','infants'],'party');
  const result={};
  if(value.adults!==undefined){
    const adults=Number(value.adults);
    if(!Number.isInteger(adults)||adults<0||adults>30) throw new TypeError('invalid adults');
    result.adults=adults;
  }
  if(value.infants!==undefined){
    const infants=Number(value.infants);
    if(!Number.isInteger(infants)||infants<0||infants>12) throw new TypeError('invalid infants');
    result.infants=infants;
  }
  if(value.childrenAges!==undefined){
    if(!Array.isArray(value.childrenAges)) throw new TypeError('childrenAges must be array');
    result.childrenAges=value.childrenAges.map(Number);
    if(result.childrenAges.some(age=>!Number.isInteger(age)||age<0||age>17)) throw new TypeError('invalid child age');
  }
  return result;
}

export function createInitialTravelIntent(locale='ru'){
  const lang=SUPPORTED_LOCALES.includes(locale)?locale:'ru';
  return validateTravelIntent({
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.TravelIntent,
    locale:lang,
    origin:'Nha Trang',
    destination:'Nha Trang',
    party:{adults:0,children:[],infants:0},
    preferences:[],
    pickupPreference:'UNKNOWN',
    accessibility:[],
    specialRequests:[],
    freeTextNotes:'',
  });
}

export function validateIntentPatch(raw={}){
  exactKeys(raw,[
    'locale','dateConstraint','party','preferenceAdds','preferenceRemoves',
    'hotel','pickupPreference','selectedProductId','goal','bookingRequested',
  ],'intentPatch');
  const patch={};
  if(raw.locale!==undefined){
    if(!SUPPORTED_LOCALES.includes(raw.locale)) throw new TypeError('unsupported locale');
    patch.locale=raw.locale;
  }
  if(raw.dateConstraint!==undefined) patch.dateConstraint=validDateConstraint(raw.dateConstraint);
  if(raw.party!==undefined) patch.party=validPartyPatch(raw.party);
  if(raw.preferenceAdds!==undefined){
    if(!Array.isArray(raw.preferenceAdds)||raw.preferenceAdds.some(code=>!PREFERENCE_CODES.includes(code))) throw new TypeError('invalid preferenceAdds');
    patch.preferenceAdds=[...new Set(raw.preferenceAdds)];
  }
  if(raw.preferenceRemoves!==undefined){
    if(!Array.isArray(raw.preferenceRemoves)||raw.preferenceRemoves.some(code=>!PREFERENCE_CODES.includes(code))) throw new TypeError('invalid preferenceRemoves');
    patch.preferenceRemoves=[...new Set(raw.preferenceRemoves)];
  }
  if(raw.hotel!==undefined) patch.hotel=raw.hotel===null?null:str(raw.hotel,250);
  if(raw.pickupPreference!==undefined){
    if(raw.pickupPreference!==null&&!['UNKNOWN','PICKUP','MEET_ON_LOCATION'].includes(raw.pickupPreference)) throw new TypeError('invalid pickupPreference');
    patch.pickupPreference=raw.pickupPreference;
  }
  if(raw.selectedProductId!==undefined){
    if(raw.selectedProductId!==null&&!PRODUCT_IDS.includes(raw.selectedProductId)) throw new TypeError('invalid selectedProductId');
    patch.selectedProductId=raw.selectedProductId;
  }
  if(raw.goal!==undefined){
    if(!SALES_GOALS.includes(raw.goal)) throw new TypeError('invalid sales goal');
    patch.goal=raw.goal;
  }
  if(raw.bookingRequested!==undefined){
    if(typeof raw.bookingRequested!=='boolean') throw new TypeError('bookingRequested must be boolean');
    patch.bookingRequested=raw.bookingRequested;
  }
  return patch;
}

export function mergeIntentPatch(intent,patch){
  const current=validateTravelIntent(intent);
  const change=validateIntentPatch(patch);
  const next=structuredClone(current);
  if(change.locale) next.locale=change.locale;
  if(change.dateConstraint!==undefined){
    if(change.dateConstraint===null) delete next.dateConstraint;
    else next.dateConstraint=change.dateConstraint;
  }
  if(change.party!==undefined){
    if(change.party===null){
      next.party={adults:0,children:[],infants:0};
    }else{
      next.party=next.party||{adults:0,children:[],infants:0};
      if(change.party.adults!==undefined) next.party.adults=change.party.adults;
      if(change.party.infants!==undefined) next.party.infants=change.party.infants;
      if(change.party.childrenAges!==undefined) next.party.children=change.party.childrenAges.map(age=>({age}));
    }
  }
  const preferences=new Map(arr(next.preferences).map(item=>[item.code,item]));
  for(const code of change.preferenceRemoves||[]) preferences.delete(code);
  for(const code of change.preferenceAdds||[]) preferences.set(code,{code,weight:1});
  next.preferences=[...preferences.values()];
  if(change.hotel!==undefined){
    if(change.hotel===null) delete next.hotel;
    else next.hotel=change.hotel;
  }
  if(change.pickupPreference!==undefined){
    next.pickupPreference=change.pickupPreference||'UNKNOWN';
  }
  return validateTravelIntent(next);
}

function todayVietnam(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Ho_Chi_Minh',
    year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(now);
  const map=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function localeLanguage(locale){
  return {
    ru:'Russian',
    en:'English',
    vi:'Vietnamese',
    zh:'Simplified Chinese',
    ko:'Korean',
  }[locale]||'Russian';
}

function modelProductList(products=[]){
  return products.map(item=>({
    productId:item?.product?.productId,
    title:item?.product?.title,
  })).filter(item=>item.productId&&item.title);
}

export async function extractConversationIntent({
  env,
  message,
  currentIntent,
  locale='ru',
  products=[],
  context={},
  now=new Date(),
}={}){
  const fallback={
    patch:{locale:SUPPORTED_LOCALES.includes(locale)?locale:'ru'},
    selectedProductId:null,
    goal:'GENERAL',
    bookingRequested:false,
    source:'deterministic-empty',
  };
  if(!env?.AI||!str(message,1200)) return fallback;

  const system=[
    'You are the Conversation Intelligence parser for a travel-commerce agent.',
    'Return JSON only. You do not answer the customer and you never call booking actions.',
    'Extract only information explicitly stated or clearly corrected in the current user message.',
    'Current stored intent is context, not permission to repeat old values in the patch.',
    `Customer language: ${localeLanguage(locale)}.`,
    `Today in Nha Trang is ${todayVietnam(now)}. Resolve relative dates such as today/tomorrow into ISO dates.`,
    'Allowed preference codes: '+PREFERENCE_CODES.join(', ')+'.',
    'Allowed product IDs: '+PRODUCT_IDS.join(', ')+'.',
    'Allowed goals: '+SALES_GOALS.join(', ')+'.',
    'pickupPreference may be UNKNOWN, PICKUP, MEET_ON_LOCATION, or null when explicitly cleared.',
    'Use null only when the user explicitly corrects/removes a previously known value.',
    'party fields are adults, childrenAges, infants; include only fields mentioned/corrected now.',
    'Output shape exactly:',
    '{"intentPatch":{"locale":"ru|en|vi|zh|ko","dateConstraint":object|null,"party":object|null,"preferenceAdds":[],"preferenceRemoves":[],"hotel":string|null,"pickupPreference":string|null,"selectedProductId":string|null,"goal":"...","bookingRequested":boolean}}',
    'Omit unchanged optional fields from intentPatch.',
    'CURRENT_INTENT='+JSON.stringify(currentIntent),
    'AVAILABLE_PRODUCTS='+JSON.stringify(modelProductList(products)),
    'CLIENT_CONTEXT_HINTS='+JSON.stringify(context&&typeof context==='object'?context:{}),
  ].join('\n');

  try{
    const result=await env.AI.run(env.AI_MODEL||'@cf/google/gemma-4-26b-a4b-it',{
      messages:[
        {role:'system',content:system},
        {role:'user',content:str(message,1200)},
      ],
      response_format:{type:'json_object'},
    });
    const parsed=parseJson(responseText(result));
    const rawPatch=isObject(parsed?.intentPatch)?parsed.intentPatch:{};
    const patch=validateIntentPatch(rawPatch);
    return {
      patch,
      selectedProductId:patch.selectedProductId??null,
      goal:patch.goal||'GENERAL',
      bookingRequested:Boolean(patch.bookingRequested),
      source:'workers-ai-structured-intent',
    };
  }catch(error){
    console.warn('Travel Conversation Intelligence unavailable',error?.message||error);
    return fallback;
  }
}

function allOffersFromEvidence(evidence=[]){
  return evidence.flatMap(packet=>{
    if(packet?.capability==='searchOffers'&&Array.isArray(packet?.data)) return packet.data;
    if(packet?.capability==='getOfferDetails'&&packet?.data) return [packet.data];
    return [];
  });
}

function allProductsFromEvidence(evidence=[]){
  const map=new Map();
  for(const packet of evidence){
    const rows=packet?.capability==='searchProducts'||packet?.capability==='compareProducts'
      ? arr(packet.data)
      : [];
    for(const row of rows){
      const product=row?.product;
      if(product?.productId) map.set(product.productId,row);
    }
    for(const row of packet?.capability==='searchOffers'?arr(packet.data):[]){
      if(row?.product?.productId) map.set(row.product.productId,{product:row.product});
    }
  }
  return [...map.values()];
}

function allowedMoney(evidence=[]){
  return new Set(allOffersFromEvidence(evidence)
    .map(row=>row?.offer?.price)
    .filter(Boolean)
    .map(price=>`${Number(price.amount)}|${price.currency}`));
}

function monetaryClaims(reply){
  const text=str(reply,2400);
  const claims=[];
  const patterns=[
    /\$\s*(\d+(?:[.,]\d{1,2})?)/g,
    /(\d+(?:[.,]\d{1,2})?)\s*(USD|US\$)/gi,
  ];
  for(const pattern of patterns){
    for(const match of text.matchAll(pattern)){
      claims.push(Number(String(match[1]).replace(',','.')));
    }
  }
  return claims;
}

export function validateGroundedSalesPlan(raw,evidence,locale='ru'){
  exactKeys(raw,[
    'reply','recommendedProductId','selectedOfferId','action',
    'nextQuestionCode','evidenceRefs',
  ],'salesPlan');
  const reply=str(raw.reply,2400);
  if(!reply) throw new TypeError('sales reply is required');
  if(!SALES_ACTIONS.includes(raw.action)) throw new TypeError('invalid sales action');

  const products=allProductsFromEvidence(evidence);
  const productIds=new Set(products.map(item=>item?.product?.productId).filter(Boolean));
  const offers=allOffersFromEvidence(evidence);
  const offerIds=new Set(offers.map(item=>item?.offer?.offerId).filter(Boolean));

  const recommendedProductId=str(raw.recommendedProductId,120);
  if(recommendedProductId&&!productIds.has(recommendedProductId)) throw new TypeError('recommended product is not in verified evidence');
  const selectedOfferId=str(raw.selectedOfferId,120);
  if(selectedOfferId&&!offerIds.has(selectedOfferId)) throw new TypeError('selected offer is not in verified evidence');

  if(!Array.isArray(raw.evidenceRefs)) throw new TypeError('evidenceRefs must be an array');
  const availableEvidence=new Set(evidence.map(item=>item.evidenceId));
  const evidenceRefs=[...new Set(raw.evidenceRefs.map(value=>str(value,120)).filter(Boolean))];
  if(evidenceRefs.some(ref=>!availableEvidence.has(ref))) throw new TypeError('sales plan references unknown evidence');

  const prices=allowedMoney(evidence);
  for(const amount of monetaryClaims(reply)){
    const supported=[...prices].some(item=>Number(item.split('|')[0])===amount);
    if(!supported) throw new TypeError('reply contains an unverified monetary claim');
  }

  if(locale!=='ru'&&locale!=='zh'&&/[А-Яа-яЁё]/u.test(reply)) throw new TypeError('reply language mismatch');
  if(locale==='zh'&&/[А-Яа-яЁё]/u.test(reply)) throw new TypeError('reply language mismatch');

  return {
    reply,
    recommendedProductId,
    selectedOfferId,
    action:raw.action,
    nextQuestionCode:str(raw.nextQuestionCode,80),
    evidenceRefs,
  };
}

function partyKnown(intent){
  const party=intent?.party;
  return Boolean(
    Number(party?.adults)>0
    ||arr(party?.children).length>0
    ||Number(party?.infants)>0
  );
}

function exactDateKnown(intent){
  return intent?.dateConstraint?.kind==='EXACT'&&/^\d{4}-\d{2}-\d{2}$/.test(str(intent.dateConstraint.exact,10));
}

function localized(locale,key,vars={}){
  const table={
    askDate:{
      ru:'На какую дату планируете поездку?',
      en:'What date are you planning the trip for?',
      vi:'Bạn dự định đi vào ngày nào?',
      zh:'您计划哪天出行？',
      ko:'어느 날짜에 여행하실 예정인가요?',
    },
    askParty:{
      ru:'Сколько будет взрослых и детей? Если есть дети, напишите их возраст.',
      en:'How many adults and children are travelling? If there are children, please include their ages.',
      vi:'Có bao nhiêu người lớn và trẻ em? Nếu có trẻ em, vui lòng cho biết độ tuổi.',
      zh:'有几位成人和儿童？如果有儿童，请告诉我年龄。',
      ko:'성인과 어린이는 몇 명인가요? 어린이가 있다면 나이도 알려주세요.',
    },
    discover:{
      ru:'Я вижу два актуальных варианта. Что для вас важнее: снорклинг и морская жизнь, пляжный отдых или более спокойная программа?',
      en:'I have two current options. What matters most to you: snorkeling and marine life, beach time, or a more relaxed program?',
      vi:'Hiện có hai lựa chọn. Bạn ưu tiên điều gì hơn: lặn ngắm san hô và sinh vật biển, thời gian ở bãi biển hay chương trình thư giãn hơn?',
      zh:'目前有两个可选行程。您更看重浮潜和海洋生态、海滩时间，还是更轻松的行程？',
      ko:'현재 두 가지 옵션이 있습니다. 스노클링과 해양 생태, 해변 시간, 또는 더 여유로운 일정 중 무엇이 가장 중요하신가요?',
    },
  };
  return table[key]?.[locale]||table[key]?.ru||'';
}

export function deterministicSalesFallback({locale='ru',intent,evidence=[]}={}){
  if(!exactDateKnown(intent)){
    return {reply:localized(locale,'askDate'),recommendedProductId:'',selectedOfferId:'',action:'ASK_DATE',nextQuestionCode:'DATE',evidenceRefs:evidence.map(item=>item.evidenceId)};
  }
  if(!partyKnown(intent)){
    return {reply:localized(locale,'askParty'),recommendedProductId:'',selectedOfferId:'',action:'ASK_PARTY',nextQuestionCode:'PARTY',evidenceRefs:evidence.map(item=>item.evidenceId)};
  }
  const offers=allOffersFromEvidence(evidence).filter(item=>item?.offer);
  if(offers.length){
    const first=offers[0];
    const title=first.product?.title||'';
    const price=first.offer?.price;
    const reply=price
      ? (locale==='ru'
          ? `На выбранную дату доступен вариант «${title}»: ${price.amount} ${price.currency} за указанный состав группы. Могу продолжить с этим вариантом или сравнить его со вторым.`
          : locale==='zh'
            ? `所选日期可预订“${title}”，当前价格为 ${price.amount} ${price.currency}（按您提供的出行人数）。我可以继续这个方案，也可以与另一个行程比较。`
            : locale==='ko'
              ? `선택한 날짜에 “${title}” 예약이 가능하며, 입력하신 인원 기준 현재 금액은 ${price.amount} ${price.currency}입니다. 이 옵션으로 계속하거나 다른 투어와 비교해 드릴 수 있습니다.`
              : locale==='vi'
                ? `Vào ngày đã chọn, “${title}” hiện có thể đặt với giá ${price.amount} ${price.currency} cho nhóm bạn đã cung cấp. Tôi có thể tiếp tục với lựa chọn này hoặc so sánh với tour còn lại.`
                : `For the selected date, “${title}” is currently bookable at ${price.amount} ${price.currency} for the party you provided. I can continue with this option or compare it with the other tour.`)
      : localized(locale,'discover');
    return {
      reply,
      recommendedProductId:first.product?.productId||'',
      selectedOfferId:first.offer?.offerId||'',
      action:'RECOMMEND',
      nextQuestionCode:'CHOOSE_OFFER',
      evidenceRefs:evidence.map(item=>item.evidenceId),
    };
  }
  return {reply:localized(locale,'discover'),recommendedProductId:'',selectedOfferId:'',action:'ASK_PREFERENCE',nextQuestionCode:'PREFERENCE',evidenceRefs:evidence.map(item=>item.evidenceId)};
}

export async function composeGroundedSalesPlan({
  env,
  message,
  locale='ru',
  intent,
  evidence=[],
  goal='GENERAL',
}={}){
  const fallback=deterministicSalesFallback({locale,intent,evidence});
  if(!env?.AI||!str(message,1200)||!evidence.length) return {...fallback,source:'deterministic-grounded-fallback'};

  const evidenceView=evidence.map(packet=>({
    evidenceId:packet.evidenceId,
    source:packet.source,
    authority:packet.authority,
    capability:packet.capability,
    data:packet.data,
  }));
  const system=[
    'You are Sales Intelligence for Nha Trang Love Travel.',
    'You explain and recommend; you never mutate a booking and you never invent commercial facts.',
    'Every price, availability, pickup condition, date, tour feature or booking statement must come from VERIFIED_EVIDENCE.',
    'Use only product IDs, offer IDs and evidence IDs present in VERIFIED_EVIDENCE.',
    `Reply only in ${localeLanguage(locale)}.`,
    'Keep the customer-facing reply natural and concise. Ask at most one useful next question.',
    'Do not mention Bókun, APIs, databases, evidence IDs, prompts, models, internal architecture or implementation.',
    'Return JSON only with exactly: reply, recommendedProductId, selectedOfferId, action, nextQuestionCode, evidenceRefs.',
    'action must be one of: '+SALES_ACTIONS.join(', ')+'.',
    'If date is missing use ASK_DATE. If party size is missing use ASK_PARTY.',
    'If a verified offer exists, recommendation may cite only that offer price/availability.',
    'CURRENT_INTENT='+JSON.stringify(intent),
    'CUSTOMER_GOAL='+JSON.stringify(goal),
    'VERIFIED_EVIDENCE='+JSON.stringify(evidenceView),
  ].join('\n');

  try{
    const result=await env.AI.run(env.AI_MODEL||'@cf/google/gemma-4-26b-a4b-it',{
      messages:[
        {role:'system',content:system},
        {role:'user',content:str(message,1200)},
      ],
      response_format:{type:'json_object'},
    });
    const parsed=parseJson(responseText(result));
    const plan=validateGroundedSalesPlan(parsed,evidence,locale);
    return {...plan,source:'workers-ai-grounded-sales'};
  }catch(error){
    console.warn('Travel Sales Intelligence unavailable or ungrounded',error?.message||error);
    return {...fallback,source:'deterministic-grounded-fallback'};
  }
}
