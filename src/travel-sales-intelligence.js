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

export const COMMERCIAL_GOALS=Object.freeze(['PRICE','AVAILABILITY','BOOK']);

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
  if(isObject(result?.response)) return JSON.stringify(result.response);
  const choice=result?.choices?.[0];
  return choice?.message?.content||choice?.text||'';
}

function conversationMessages(history=[],currentMessage=''){
  const rows=(Array.isArray(history)?history:[]).flatMap(item=>{
    const role=item?.role==='bot'?'assistant':item?.role;
    const content=str(item?.text??item?.content,900);
    return ['user','assistant'].includes(role)&&content?[{role,content}]:[];
  }).slice(-10);
  if(rows.at(-1)?.role==='user'&&rows.at(-1)?.content===str(currentMessage,900)) rows.pop();
  return rows;
}

function aiTimeoutMs(env,key,fallback){
  const configured=Number(env?.[key]);
  if(Number.isFinite(configured)&&configured>0) return Math.min(30000,Math.max(1,Math.round(configured)));
  return fallback;
}

async function runAiWithBudget(env,input,{timeoutMs,label}){
  let timer=null;
  const timeout=new Promise((_,reject)=>{
    timer=setTimeout(()=>{
      const error=new Error(`${label}_timeout`);
      error.code='ai_timeout';
      reject(error);
    },timeoutMs);
  });
  try{
    return await Promise.race([
      env.AI.run(env.AI_MODEL||'@cf/google/gemma-4-26b-a4b-it',{...input,
        ...(String(env.AI_MODEL||'@cf/google/gemma-4-26b-a4b-it').includes('/gemma-4-')?{chat_template_kwargs:{enable_thinking:false},temperature:0.1,max_completion_tokens:label==='travel_intent_ai'?512:900}:{}),
      }),
      timeout,
    ]);
  }finally{
    if(timer!==null) clearTimeout(timer);
  }
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
    'hotel','pickupPreference','selectedProductId','selectedOption','goal','bookingRequested',
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
  if(raw.selectedOption!==undefined){
    if(raw.selectedOption===null) patch.selectedOption=null;
    else{
      const checked=validateTravelIntent({...createInitialTravelIntent('en'),optionPreference:raw.selectedOption});
      if(!PRODUCT_IDS.includes(checked.optionPreference.productId)) throw new TypeError('invalid option product');
      if(patch.selectedProductId&&patch.selectedProductId!==checked.optionPreference.productId) throw new TypeError('option product mismatch');
      patch.selectedOption=structuredClone(checked.optionPreference);
      patch.selectedProductId=checked.optionPreference.productId;
    }
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
  if(change.selectedOption===null) delete next.optionPreference;
  else if(change.selectedOption) next.optionPreference=structuredClone(change.selectedOption);
  else if(change.selectedProductId&&next.optionPreference?.productId!==change.selectedProductId) delete next.optionPreference;
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
    options:arr(item?.facts?.options).map(option=>({
      rateRef:option.rateRef,title:option.title,localizedTitle:option.localizedTitle,
    })),
  })).filter(item=>item.productId&&item.title);
}


function addIsoDays(iso,days){
  const date=new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()+Number(days||0));
  return date.toISOString().slice(0,10);
}

function normalizedText(value){
  return str(value,2400)
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .normalize('NFKC');
}

function explicitAdultCount(message){
  const text=normalizedText(message);
  const digitPatterns=[
    /\b(\d{1,2})\s+adults?\b/i,
    /(\d{1,2})\s*(?:взросл(?:ых|ые|ый)|nguoi lon|位成人|个成人|個成人|명)/iu,
  ];
  for(const pattern of digitPatterns){
    const match=text.match(pattern);
    if(match){
      const count=Number(match[1]);
      if(Number.isInteger(count)&&count>=1&&count<=30) return count;
    }
  }
  const phrases=[
    [2,/\b(?:two adults|two grown-ups)\b/i],
    [2,/(?:двое|два)\s+взросл/iu],
    [2,/hai\s+nguoi\s+lon/iu],
    [2,/(?:两|兩)\s*(?:位|个|個)?\s*成人/u],
    [2,/성인\s*두\s*명/u],
    [1,/\b(?:one adult|a single adult)\b/i],
    [1,/(?:один|одна)\s+взросл/iu],
    [1,/mot\s+nguoi\s+lon/iu],
    [1,/一\s*(?:位|个|個)?\s*成人/u],
    [1,/성인\s*한\s*명/u],
  ];
  for(const [count,pattern] of phrases){
    if(pattern.test(text)) return count;
  }
  return null;
}

function explicitDateConstraint(message,now){
  const text=normalizedText(message);
  const today=todayVietnam(now);
  const isoDates=[...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/gu)].map(match=>match[0]);
  if(isoDates.length===1&&!Number.isNaN(Date.parse(isoDates[0]+'T00:00:00Z'))){
    return {kind:'EXACT',exact:isoDates[0]};
  }
  if(/\btomorrow\b/i.test(text)||/завтра/iu.test(text)||/ngay\s+mai/iu.test(text)||/明天/u.test(text)||/내일/u.test(text)){
    return {kind:'EXACT',exact:addIsoDays(today,1)};
  }
  if(/\btoday\b/i.test(text)||/сегодня/iu.test(text)||/hom\s+nay/iu.test(text)||/今天/u.test(text)||/오늘/u.test(text)){
    return {kind:'EXACT',exact:today};
  }
  return null;
}

export function pickupChangeRequested(message){
  const text=normalizedText(message);
  return /^(?:please\s+)?(?:change|switch|update|replace)\b|^can\s+you\s+(?:please\s+)?(?:change|switch|update|replace)\b/iu.test(text)
    ||/^(?:пожалуйста[, ]+)?(?:измени|поменя|замени)/iu.test(text)
    ||/^(?:vui\s+long\s+)?(?:[dđ]oi|thay\s+[dđ]oi|chuyen)/iu.test(text)
    ||/^(?:请|請)?(?:把|将|將)?.{0,40}(?:改为|改成|更换|更換|换成|換成)/u.test(text)
    ||/(?:픽업|호텔).{0,80}(?:변경해|바꿔|바꾸|수정해)/u.test(text);
}

function explicitPickupHotel(message,products=[]){
  const raw=str(message,1200);
  const normalized=normalizedText(raw);
  for(const row of arr(products)){
    for(const place of arr(row?.facts?.pickup?.places)){
      const title=str(place?.title||place?.name,160);
      if(title&&normalized.includes(normalizedText(title))){
        return title;
      }
    }
  }
  const patterns=[
    /(?:pickup|pick\s*up|collect)(?:\s+us)?(?:\s+(?:from|at))?\s+([^,.;!?]{2,80})/i,
    /(?:заберите|забрать|трансфер(?:ом|а|у|е)?)(?:\s+нас)?(?:\s+(?:из|от))?\s+([^,.;!?]{2,80})/iu,
    /(?:đón)(?:\s+(?:tại|ở))?\s+([^,.;!?]{2,80})/iu,
    /(?:从|從)\s*([^，。！？]{2,40}?)\s*(?:接|接我们|接我們)/u,
    /([^,.!?]{2,60}?)에서\s*픽업/u,
  ];
  for(const pattern of patterns){
    const match=raw.match(pattern);
    if(match?.[1]){
      const value=str(match[1],160)
        .replace(/\b(?:please|we want to book it|book it)\b.*$/i,'')
        .trim();
      if(value) return value;
    }
  }
  return '';
}

function optionName(value){
  return normalizedText(value).replace(/\band\b/gu,' ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/gu,' ').trim();
}

function catalogListQuestion(message){
  const text=normalizedText(message);
  if(/\bprice\b|\bcost\b|how much|стоим|цен[ауы]|\bgia\b|价格|价钱|가격|요금/iu.test(text)) return false;
  return /вариант|options?|variations?|lua chon|phuong an|选项|選項|옵션/iu.test(text)
    && /все|перечисл|какие|\ball\b|\blist\b|\bwhat\b|\bwhich\b|tat ca|liet ke|nhung|所有|哪些|全部|어떤|모든|목록/iu.test(text);
}

function sameOptionRef(a,b){
  return ['provider','resourceType','externalId','accountRef'].every(key=>String(a?.[key]||'')===String(b?.[key]||''));
}

function verifiedOptionPatch(patch,products){
  if(patch.selectedOption){
    const row=arr(products).find(row=>row.product?.productId===patch.selectedOption.productId);
    if(!arr(row?.facts?.options).some(option=>sameOptionRef(option.rateRef,patch.selectedOption.rateRef))){
      const error=new TypeError('selected option is not in verified catalog');error.code='unknown_option';throw error;
    }
  }
  return patch;
}

function explicitProductId(message,products=[]){
  const text=normalizedText(message);
  for(const row of arr(products)){
    const id=str(row?.product?.productId,120);
    const title=str(row?.product?.title,200);
    if(id&&title&&normalizedText(title).length>=4&&text.includes(normalizedText(title))){
      return id;
    }
  }
  const names=[
    [/Robinson|Робинсон|로빈슨|鲁滨逊/iu,'love-travel-robinson-island'],
    [/H[oò]n\s*Mun|Хон.{0,3}Мун|혼.{0,2}문/iu,'love-travel-hon-mun'],
  ];
  for(const [pattern,id] of names)if(pattern.test(message)&&arr(products).some(row=>row.product?.productId===id))return id;
  return null;
}

function explicitCatalogOption(message,products,scopeProductId=''){
  const text=' '+optionName(message)+' ';
  const scope=explicitProductId(message,products)||scopeProductId;
  const rows=arr(products).filter(row=>!scope||row.product?.productId===scope);
  const matches=rows.flatMap(row=>arr(row.facts?.options).flatMap(option=>{
    const full=optionName(option.title);
    const short=optionName(option.title.replace(/^Robinson\s*(?:&|and|\+)\s*/iu,''));
    const core=optionName(short.replace(/\b(?:marine park|island mud bath|mud bath|beach)\b/giu,''));
    const names=[full,optionName(option.localizedTitle),short,...(core.length>=4?[core]:[])].filter(name=>name.length>=4);
    return names.some(name=>text.includes(' '+name+' '))?[{productId:row.product.productId,rateRef:option.rateRef}]:[];
  }));
  return {option:matches.length===1?matches[0]:null,ambiguous:matches.length>1};
}

export function deterministicExplicitIntentPatch({
  message,
  locale='ru',
  products=[],
  context={},
  now=new Date(),
}={}){
  const text=normalizedText(message);
  const patch={
    locale:SUPPORTED_LOCALES.includes(locale)?locale:'ru',
  };
  const dateConstraint=explicitDateConstraint(message,now);
  if(dateConstraint) patch.dateConstraint=dateConstraint;

  const adults=explicitAdultCount(message);
  if(adults!==null) patch.party={adults};

  const preferenceAdds=[];
  if(/snorkel/i.test(text)||/снорк/iu.test(text)||/lan\s+ngam\s+san\s+ho/iu.test(text)||/浮潜|浮潛/u.test(text)||/스노클/u.test(text)){
    preferenceAdds.push('SNORKELING');
  }
  if(preferenceAdds.length) patch.preferenceAdds=preferenceAdds;

  const hotel=explicitPickupHotel(message,products);
  const pickupCue=/pickup|pick\s*up|collect\s+us/i.test(text)
    ||/заберите|забрать|трансфер/iu.test(text)
    ||/đon/iu.test(text)
    ||/(?:接我们|接我們|接送|从|從)/u.test(text)
    ||/픽업/u.test(text);
  if(hotel) patch.hotel=hotel;
  if(hotel||pickupCue) patch.pickupPreference='PICKUP';

  const option=explicitCatalogOption(message,products,context.currentProductId||'');
  const selectedProductId=option.option?.productId||explicitProductId(message,products);
  if(selectedProductId) patch.selectedProductId=selectedProductId;
  if(option.option) patch.selectedOption=option.option;

  const informationGoal=catalogListQuestion(message)||option.ambiguous?'DETAILS':/compare|difference|сравн|чем.{0,30}отлич|so\s*sanh|khac\s*nhau|区别|比較|비교|차이/iu.test(text)?'COMPARE'
    :/what.{0,30}(?:included|include|itinerary)|что.{0,30}(?:входит|включено|взять)|услови.{0,30}(?:отмен|брони)|cancellation|booking.{0,20}(?:conditions|policy)|[dđ]ieu\s*kien.{0,20}[dđ]at|chinh\s*sach.{0,20}huy|包含|取消.{0,15}(?:政策|条件)|예약.{0,15}조건|취소.{0,15}(?:규정|정책)/iu.test(text)?'DETAILS':null;
  if(informationGoal){patch.goal=informationGoal;patch.bookingRequested=false;}
  else if(hotel&&pickupChangeRequested(message)){patch.goal='GENERAL';patch.bookingRequested=false;}
  const bookingRequested=/\b(?:book|booking|reserve)\b/i.test(text)
    ||/заброн|брони/iu.test(text)
    ||/đat\s*(?:cho|tour)?/iu.test(text)
    ||/预订|預訂|预约|預約/u.test(text)
    ||/예약/u.test(text);
  if(bookingRequested&&!informationGoal){
    patch.goal='BOOK';
    patch.bookingRequested=true;
  }
  return validateIntentPatch(patch);
}

function mergeExplicitOverModel(modelPatch,explicitPatch,message=''){
  const combined={...modelPatch,...explicitPatch};
  if(modelPatch?.party||explicitPatch?.party){
    combined.party={...(modelPatch?.party||{}),...(explicitPatch?.party||{})};
  }
  const adds=[...new Set([
    ...arr(modelPatch?.preferenceAdds),
    ...arr(explicitPatch?.preferenceAdds),
  ])];
  if(adds.length) combined.preferenceAdds=adds;
  if(combined.goal==='PICKUP'&&combined.hotel&&pickupChangeRequested(message)){combined.goal='GENERAL';combined.bookingRequested=false;}
  return validateIntentPatch(combined);
}

export async function extractConversationIntent({
  env,
  message,
  currentIntent,
  locale='ru',
  products=[],
  context={},
  history=[],
  now=new Date(),
}={}){
  const explicitPatch=deterministicExplicitIntentPatch({
    message,
    locale,
    products,
    context:{...context,currentProductId:context.currentProductId||currentIntent?.optionPreference?.productId||''},
    now,
  });
  const fallback={
    patch:explicitPatch,
    explicitPatch,
    selectedProductId:explicitPatch.selectedProductId??null,
    goal:explicitPatch.goal||'GENERAL',
    bookingRequested:Boolean(explicitPatch.bookingRequested),
    source:'deterministic-explicit',
  };
  // Enumerating known options requires no model inference or intent mutation.
  if(catalogListQuestion(message)) return {...fallback,source:'verified-catalog-intent'};
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
    '{"intentPatch":{"locale":"ru|en|vi|zh|ko","dateConstraint":object|null,"party":object|null,"preferenceAdds":[],"preferenceRemoves":[],"hotel":string|null,"pickupPreference":string|null,"selectedProductId":string|null,"selectedOption":{"productId":string,"rateRef":object}|null,"goal":"...","bookingRequested":boolean}}',
    'Omit unchanged optional fields from intentPatch.',
    'AVAILABLE_PRODUCTS includes the complete alternative option catalog. selectedOption must copy productId and the exact rateRef of one verified option. Never choose an option absent from that product.',
    'Robinson plus Hon Mun is an option of Robinson, not the standalone Hon Mun product. Match the whole requested combination.',
    'If an option name occurs under multiple products, use the explicitly named product or the authoritative currentProductId from context; otherwise ask which product with goal DETAILS and no selectedOption.',
    'A request to list/explain options is DETAILS, not a command to change a booking. A request to choose/change an option is GENERAL (or PRICE/BOOK when asked), and must include selectedOption.',
    'Use PICKUP for factual pickup/meeting-point questions. An explicit request to change a hotel, pickup place or pickup mode is GENERAL and must include only the requested changes.',
    'Preserve hotel names exactly as provided by the customer.',
    'CURRENT_INTENT='+JSON.stringify(currentIntent),
    'AVAILABLE_PRODUCTS='+JSON.stringify(modelProductList(products)),
    'CLIENT_CONTEXT_HINTS='+JSON.stringify(context&&typeof context==='object'?context:{}),
  ].join('\n');

  let optionAttempted=false;
  try{
    const result=await runAiWithBudget(env,{
      messages:[
        {role:'system',content:system},
        ...conversationMessages(history,message),
        {role:'user',content:str(message,1200)},
      ],
      response_format:{type:'json_object'},
    },{
      timeoutMs:aiTimeoutMs(env,'TRAVEL_INTENT_AI_TIMEOUT_MS',6500),
      label:'travel_intent_ai',
    });
    const parsed=parseJson(responseText(result));
    const rawPatch=isObject(parsed?.intentPatch)?parsed.intentPatch:{};
    optionAttempted=Object.prototype.hasOwnProperty.call(rawPatch,'selectedOption');
    const modelPatch=verifiedOptionPatch(validateIntentPatch(rawPatch),products);
    const patch=verifiedOptionPatch(mergeExplicitOverModel(modelPatch,explicitPatch,message),products);
    return {
      patch,
      explicitPatch,
      selectedProductId:patch.selectedProductId??null,
      goal:patch.goal||'GENERAL',
      bookingRequested:Boolean(patch.bookingRequested),
      source:'workers-ai-structured-intent',
    };
  }catch(error){
    console.warn('Travel Conversation Intelligence unavailable',error?.message||error);
    if((error?.code==='unknown_option'||optionAttempted)&&!explicitPatch.selectedOption){
      // Never degrade a fabricated/cross-product option into a default quote.
      return {...fallback,patch:{...explicitPatch,goal:'DETAILS',bookingRequested:false},goal:'DETAILS',bookingRequested:false};
    }
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
      if(row?.product?.productId&&!map.has(row.product.productId)) map.set(row.product.productId,{product:row.product});
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
  const text=String(reply??'');
  const claims=[];
  const number=String.raw`(?:\d{1,3}(?:[ ,.\u00a0]\d{3})+|\d+)(?:[.,]\d{1,2})?`;
  const currencies=[
    {code:'USD',token:String.raw`US\$|USD|dollars?|доллар(?:ов|а|ы)?(?:\s+США)?|долл\.?|đô\s*la(?:\s*Mỹ)?|美元|美金|(?:미국\s*)?달러`},
    {code:'VND',token:String.raw`VND|đồng|越南盾|베트남\s*동`},
    {code:'EUR',token:String.raw`EUR|euros?|евро|欧元|유로`},
    {code:'RUB',token:String.raw`RUB|руб(?:лей|ля|ль)?\.?|卢布|루블`},
  ];
  const parseAmount=value=>{
    let normalized=String(value).replace(/[ \u00a0]/g,'');
    normalized=normalized.replace(/[.,](?=\d{3}(?:[.,]|$))/g,'').replace(',','.');
    return Number(normalized);
  };
  for(const {code,token} of currencies){
    for(const pattern of [new RegExp('('+number+')\\s*(?:'+token+')','giu'),new RegExp('(?:'+token+')\\s*('+number+')','giu')]){
      for(const match of text.matchAll(pattern))claims.push({amount:parseAmount(match[1]),currency:code,index:match.index,length:match[0].length});
    }
  }
  for(const [symbol,currency] of [['\\$','USD'],['€','EUR'],['₽','RUB']]){
    for(const pattern of [new RegExp(symbol+'\\s*('+number+')','gu'),new RegExp('('+number+')\\s*'+symbol,'gu')]){
      for(const match of text.matchAll(pattern))claims.push({amount:parseAmount(match[1]),currency,index:match.index,length:match[0].length});
    }
  }
  return claims;
}

function perPersonPrice(reply){
  return /\bper\s+(?:person|adult|guest|travell?er|pax)\b|\beach\s+(?:person|adult|guest)\b|\/\s*(?:person|pax)\b|(?:за|на|с)\s+(?:одного\s+)?(?:человека|взрослого)|mỗi\s*(?:người|khách)|\/\s*người|每人|人均|인당|인\s*당/iu.test(reply);
}

export function validateGroundedSalesPlan(raw,evidence,locale='ru',goal='GENERAL'){
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
  const requiredOffers=recommendationOffers(evidence,goal);
  if(requiredOffers.length&&!requiredOffers.some(row=>row.offer.offerId===selectedOfferId)){
    throw new TypeError('verified offer recommendation is required');
  }
  const selected=offers.find(row=>row.offer?.offerId===selectedOfferId);
  if(selected&&recommendedProductId&&recommendedProductId!==(selected.product?.productId||selected.offer.productId)){
    throw new TypeError('recommended product differs from verified offer');
  }
  if(selected?.option?.title&&![selected.option.title,selected.option.localizedTitle].filter(Boolean).some(title=>optionName(reply).includes(optionName(title)))){
    throw new TypeError('answer omits the verified selected option');
  }

  if(!Array.isArray(raw.evidenceRefs)) throw new TypeError('evidenceRefs must be an array');
  const availableEvidence=new Set(evidence.map(item=>item.evidenceId));
  const evidenceRefs=[...new Set(raw.evidenceRefs.map(value=>str(value,120)).filter(Boolean))];
  if(evidenceRefs.some(ref=>!availableEvidence.has(ref))) throw new TypeError('sales plan references unknown evidence');

  if(goal==='COMPARE'&&products.length>1){
    const names={
      'love-travel-robinson-island':/Robinson|Робинсон|로빈슨|鲁滨逊/iu,
      'love-travel-hon-mun':/H[oò]n\s*Mun|Хон.{0,3}Мун|혼.{0,2}문/iu,
    };
    if(products.some(row=>names[row.product?.productId]&&!names[row.product.productId].test(reply))){
      throw new TypeError('comparison omits a verified product');
    }
  }
  const prices=allowedMoney(evidence);
  const claims=monetaryClaims(reply);
  for(const {amount,currency} of claims){
    const supported=prices.has(`${amount}|${currency}`);
    if(!supported) throw new TypeError('reply contains an unverified monetary claim');
  }

  if(claims.length&&perPersonPrice(reply)) throw new TypeError('reply changes verified total price into a per-person monetary claim');

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

function recommendationOffers(evidence,goal){
  if(!['GENERAL','DISCOVER','PRICE','AVAILABILITY','BOOK'].includes(goal)) return [];
  return allOffersFromEvidence(evidence).filter(row=>row.offer?.offerId&&row.offer.availability?.status==='AVAILABLE');
}

function descriptiveFacts(value){
  if(typeof value==='string'){
    const ranges=monetaryClaims(value).map(claim=>({start:claim.index,end:claim.index+claim.length})).sort((a,b)=>a.start-b.start);
    const merged=[];
    for(const range of ranges){
      const previous=merged.at(-1);
      if(previous&&range.start<=previous.end)previous.end=Math.max(previous.end,range.end);
      else merged.push({...range});
    }
    let clean=value;
    for(const range of merged.reverse())clean=clean.slice(0,range.start)+'[additional charge]'+clean.slice(range.end);
    return clean;
  }
  if(Array.isArray(value))return value.map(descriptiveFacts);
  if(isObject(value))return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,descriptiveFacts(item)]));
  return value;
}

function modelEvidenceData(packet){
  if(['searchProducts','compareProducts'].includes(packet.capability)){
    return arr(packet.data).map(row=>{
      if(!row.facts) return row;
      const facts=descriptiveFacts(row.facts);
      if(arr(facts.options).length>1){
        // The provider's agenda mixes product-level/default/alternative stops and
        // contains no rate-to-stop relation. Never present it as one itinerary.
        delete facts.itinerary;
        facts.optionItineraryStatus='NOT_PROVIDED';
      }
      return {...row,facts};
    });
  }
  if(!['searchOffers','getOfferDetails'].includes(packet.capability)) return packet.data;
  const clean=row=>{
    if(!isObject(row))return row;
    const {selection:privateSelection,...rest}=row;
    const offer=rest.offer?structuredClone(rest.offer):null;
    if(offer){
      for(const key of ['pickup','dropoff']){
        if(offer[key]){const {customText:privateAddress,...transport}=offer[key];offer[key]=transport;}
      }
    }
    return {...rest,...(rest.facts?{facts:descriptiveFacts(rest.facts)}:{}),...(offer?{offer}:{}),
      ...(Array.isArray(rest.bookingDataIssues)?{bookingDataIssues:rest.bookingDataIssues.map(item=>({code:item.code,path:item.path}))}:{})};
  };
  return Array.isArray(packet.data)?packet.data.map(clean):clean(packet.data);
}

function salesFailureReason(error){
  const message=String(error?.message||'');
  if(!error||error.code==='ai_timeout') return 'timeout';
  if(['output_truncated','invalid_json'].includes(error.code)) return error.code;
  if(/unverified monetary claim|per-person monetary claim/i.test(message)) return 'unverified_price';
  if(/invalid sales action/i.test(message)) return 'invalid_action';
  if(/offer recommendation|differs from verified offer/i.test(message)) return 'answer_validation';
  if(/unknown fields|must be an object|required|must be an array/i.test(message)) return 'invalid_schema';
  if(/paid|upgrade|permission|not authorized/i.test(message)) return 'model_access';
  if(/quota|limit|429|neuron/i.test(message)) return 'model_limits';
  if(/unverified|not in verified|unknown evidence|language mismatch|comparison omits|catalog answer omits|answer omits/i.test(message)) return 'answer_validation';
  return 'model_error';
}

function salesResponseFormat(env,evidence,goal){
  if(!String(env?.AI_MODEL||'@cf/google/gemma-4-26b-a4b-it').includes('/gemma-4-')) return {type:'json_object'};
  const products=allProductsFromEvidence(evidence).map(row=>row.product?.productId).filter(Boolean);
  const offers=allOffersFromEvidence(evidence).map(row=>row.offer?.offerId).filter(Boolean);
  const requiredOffers=recommendationOffers(evidence,goal);
  const schema={type:'object',additionalProperties:false,properties:{
    reply:{type:'string',minLength:1,maxLength:1600},
    recommendedProductId:{type:'string',enum:[...new Set(requiredOffers.length?requiredOffers.map(row=>row.product?.productId||row.offer.productId):['',...products])]},
    selectedOfferId:{type:'string',enum:[...new Set(requiredOffers.length?requiredOffers.map(row=>row.offer.offerId):['',...offers])]},
    action:{type:'string',enum:requiredOffers.length?['RECOMMEND','OFFER_READY']:SALES_ACTIONS.filter(action=>!['DETAILS','COMPARE','PICKUP'].includes(goal)||!['ASK_DATE','ASK_PARTY','OFFER_READY'].includes(action))},
    nextQuestionCode:{type:'string',...(['DETAILS','COMPARE','PICKUP'].includes(goal)?{enum:['']}: {})},
    evidenceRefs:{type:'array',minItems:1,items:{type:'string',enum:evidence.map(packet=>packet.evidenceId)}},
  },required:['reply','recommendedProductId','selectedOfferId','action','nextQuestionCode','evidenceRefs']};
  return {type:'json_schema',json_schema:{name:'lovetravel_sales_answer',strict:true,schema}};
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
    unavailable:{
      ru:'Сейчас не удалось получить ответ AI-консультанта. Повторите вопрос, пожалуйста.',
      en:'The AI assistant could not answer right now. Please try your question again.',
      vi:'Trợ lý AI chưa thể trả lời lúc này. Vui lòng thử gửi lại câu hỏi.',
      zh:'AI 顾问暂时无法回答，请重新发送问题。',
      ko:'AI 도우미가 지금 답변하지 못했습니다. 질문을 다시 보내 주세요.',
    },
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

export function deterministicSalesFallback({locale='ru',intent,evidence=[],goal='BOOK'}={}){
  const commercial=COMMERCIAL_GOALS.includes(goal);
  const availableOffers=recommendationOffers(evidence,goal);
  const consultationOffers=['DISCOVER','GENERAL'].includes(goal)?availableOffers:[];
  if(!commercial&&!consultationOffers.length){
    return {reply:localized(locale,'unavailable'),recommendedProductId:'',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'RETRY',evidenceRefs:evidence.map(item=>item.evidenceId),degraded:true};
  }
  if(!availableOffers.length&&!exactDateKnown(intent)){
    return {reply:localized(locale,'askDate'),recommendedProductId:'',selectedOfferId:'',action:'ASK_DATE',nextQuestionCode:'DATE',evidenceRefs:evidence.map(item=>item.evidenceId)};
  }
  if(!availableOffers.length&&!partyKnown(intent)){
    return {reply:localized(locale,'askParty'),recommendedProductId:'',selectedOfferId:'',action:'ASK_PARTY',nextQuestionCode:'PARTY',evidenceRefs:evidence.map(item=>item.evidenceId)};
  }
  const offers=availableOffers;
  if(offers.length){
    const first=offers[0];
    const title=[first.product?.title,first.option?.localizedTitle||first.option?.title].filter(Boolean).join(' — ');
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
  history=[],
}={}){
  const fallback=deterministicSalesFallback({locale,intent,evidence,goal});
  const requestedCatalogProduct=explicitProductId(message,allProductsFromEvidence(evidence));
  const catalogRows=catalogListQuestion(message)?allProductsFromEvidence(evidence).filter(row=>
    !requestedCatalogProduct||row.product?.productId===requestedCatalogProduct
  ):[];
  if(catalogRows.length&&catalogRows.every(row=>arr(row.facts?.options).length)){
    const reply=catalogRows.map(row=>(row.facts.localizedTitle||row.product.title)+': '+
      row.facts.options.map(option=>option.localizedTitle||option.title).join('; ')).join('\n');
    const plan=validateGroundedSalesPlan({
      reply,recommendedProductId:catalogRows.length===1?catalogRows[0].product.productId:'',
      selectedOfferId:'',action:'GENERAL',nextQuestionCode:'',
      evidenceRefs:evidence.filter(packet=>['searchProducts','compareProducts'].includes(packet.capability)).map(packet=>packet.evidenceId),
    },evidence,locale,'DETAILS');
    return {...plan,source:'provider-catalog-options',replyAttempts:0,replyFailureReasons:[]};
  }
  if(COMMERCIAL_GOALS.includes(goal)&&['ASK_DATE','ASK_PARTY'].includes(fallback.action)){
    return {...fallback,source:'deterministic-grounded-fallback'};
  }
  if(!env?.AI||!str(message,1200)||!evidence.length) return {...fallback,source:'deterministic-grounded-fallback'};

  const evidenceView=evidence.map(packet=>({
    evidenceId:packet.evidenceId,
    source:packet.source,
    authority:packet.authority,
    capability:packet.capability,
    data:modelEvidenceData(packet),
  }));
  const system=[
    'You are Sales Intelligence for Nha Trang Love Travel.',
    'You explain and recommend; you never mutate a booking and you never invent commercial facts.',
    'Every price, availability, pickup condition, date, tour feature or booking statement must come from VERIFIED_EVIDENCE.',
    'Earlier assistant replies are conversation context, not factual evidence. Correct earlier mistakes when they disagree with the current verified catalog.',
    'Use only product IDs, offer IDs and evidence IDs present in VERIFIED_EVIDENCE.',
    `Reply only in ${localeLanguage(locale)}.`,
    'Keep the customer-facing reply natural and concise, normally within 900 characters. Ask at most one useful next question.',
    'Do not mention Bókun, APIs, databases, evidence IDs, prompts, models, internal architecture or implementation.',
    'Return JSON only with exactly: reply, recommendedProductId, selectedOfferId, action, nextQuestionCode, evidenceRefs.',
    'Include the evidence packet IDs supporting the facts in your answer. Preserve official tour names when comparing the two products.',
    'For COMPARE, name both tours and explain concrete differences in their verified programs; a generic statement that they differ is not an answer.',
    'For DETAILS about inclusions, use the included/excluded provider text as well as inclusion categories, and distinguish optional paid activities.',
    'Each facts.options entry is an alternative tour option owned by that product. Never say a product has no options when this list is nonempty.',
    'Different beaches and mud baths in options are alternatives, not consecutive stops in one excursion. Never combine all options into one itinerary.',
    'PRODUCT_DESCRIPTION_NOT_OPTION_ITINERARY describes the product generally, not every option. When optionItineraryStatus is NOT_PROVIDED, detailed timing, stop order and option-specific inclusions are unknown; do not invent them.',
    'When asked for all options, list every verified option of the requested product. Preserve each localizedTitle exactly when provided, otherwise its official title; translate the surrounding explanation into the customer language.',
    'For any selected Offer, name its exact option.localizedTitle (or option.title if absent) alongside the product and the authoritative group total. An Offer belongs to that one option, not every alternative.',
    'REQUIRED_CATALOG_TITLES='+JSON.stringify(catalogRows.flatMap(row=>arr(row.facts?.options).map(option=>option.localizedTitle||option.title))),
    'Use plain prose in a single paragraph, without Markdown or literal newline escape text.',
    'For factual DETAILS, COMPARE and PICKUP questions, leave nextQuestionCode empty and do not ask for a date after the answer.',
    'action must be one of: '+SALES_ACTIONS.join(', ')+'.',
    'For PRICE, AVAILABILITY or BOOK, ask only for commercial parameters required to calculate an exact offer.',
    'For GENERAL, DETAILS, COMPARE, PICKUP and DISCOVER, answer the question from verified product facts even when date and party are unknown.',
    'Do not require date or participant counts for program, inclusions, exclusions, meeting point, general pickup rules or general cancellation information.',
    'Rate-specific conditions require the relevant option; exact prices and available seats require verified offer evidence. Explain missing evidence without inventing it.',
    'If verified AVAILABLE offers exist for this request, choose the best matching offer and return its selectedOfferId with the same recommendedProductId; do not replace a requested recommendation with an unselected comparison.',
    'For a selected offer, explain required bookingDataIssues that remain; selection is preparation, never a created booking.',
    'Verified offer date and participantMix take precedence over earlier intent hints. Describe the actual selected offer scope.',
    'If a verified offer exists, recommendation may cite only that offer price/availability.',
    'Every offer.price.amount is the TOTAL for the entire offer.participantMix, including all selected adults/children/infants. State it as a total for that group, never per person or per adult. Do not divide, multiply or invent unit prices.',
    'Numeric prices in descriptions are not authoritative offers. Do not repeat prices for optional activities, rentals or extras unless they appear in VERIFIED_OFFER_PRICES. When no offers exist, describe paid extras without numeric prices.',
    'VERIFIED_OFFER_PRICES='+JSON.stringify([...allowedMoney(evidence)]),
    'CURRENT_INTENT='+JSON.stringify(intent),
    'CUSTOMER_GOAL='+JSON.stringify(goal),
    'VERIFIED_EVIDENCE='+JSON.stringify(evidenceView),
  ].join('\n');

  const baseMessages=[
    {role:'system',content:system},
    ...conversationMessages(history,message),
    {role:'user',content:str(message,1200)},
  ];
  const deadline=Date.now()+aiTimeoutMs(env,'TRAVEL_SALES_AI_TIMEOUT_MS',15000);
  let failure=null;
  let replyAttempts=0;
  const replyFailureReasons=[];
  for(let attempt=0;attempt<2;attempt++){
    const remaining=deadline-Date.now();
    if(remaining<=0) break;
    try{
      replyAttempts++;
      const correction=attempt
        ? '\nThe previous generation failed validation: '+String(failure?.message||'')+'. Use the required JSON schema and allowed IDs. Include all REQUIRED_CATALOG_TITLES when listing options and the selected option.title when quoting. Use numeric prices only from VERIFIED_OFFER_PRICES; when the list is empty, explain paid extras without numeric prices.'
        : '';
      const result=await runAiWithBudget(env,{
        messages:baseMessages.map((row,index)=>index===0?{...row,content:row.content+correction}:row),
        response_format:salesResponseFormat(env,evidence,goal),
      },{
        timeoutMs:remaining,
        label:'travel_sales_ai',
      });
      if(result?.choices?.[0]?.finish_reason==='length'){const error=new Error('sales output truncated');error.code='output_truncated';throw error;}
      const parsed=parseJson(responseText(result));
      if(!parsed){const error=new Error('sales output is not JSON');error.code='invalid_json';throw error;}
      const plan=validateGroundedSalesPlan(parsed,evidence,locale,goal);
      if(catalogRows.some(row=>arr(row.facts?.options).some(option=>option.title&&![option.title,option.localizedTitle].filter(Boolean).some(title=>optionName(plan.reply).includes(optionName(title)))))){
        throw new TypeError('catalog answer omits a verified option');
      }
      return {...plan,source:'workers-ai-grounded-sales',replyAttempts,replyFailureReasons};
    }catch(error){
      failure=error;
      const reason=salesFailureReason(error);
      replyFailureReasons.push(reason);
      if(attempt===0&&['output_truncated','invalid_json','invalid_action','invalid_schema','unverified_price','answer_validation'].includes(reason)&&deadline-Date.now()>=1000) continue;
      break;
    }
  }
  console.warn('Travel Sales Intelligence unavailable or ungrounded',failure?.message||'answer budget exceeded');
  return {...fallback,source:'deterministic-grounded-fallback',replyFailureReason:salesFailureReason(failure),replyAttempts,replyFailureReasons};
}
