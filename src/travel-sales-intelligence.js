import {customerCalendarDate,explicitDateReset} from './travel-conversation-date.js';
import {acceptsBookingForm} from './travel-response-composer.js';
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
    /(\d{1,2})\s*(?:взросл(?:ых|ые|ы[йи]|ого|ая)|nguoi lon|位成人|个成人|個成人|명)/iu,
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
    [2,/(?:двое|два|двух|двоих|двум|двумя|пара|пары)\s+взросл/iu],
    [2,/hai\s+nguoi\s+lon/iu],
    [2,/(?:两|兩)\s*(?:位|个|個)?\s*成人/u],
    [2,/성인\s*두\s*명/u],
    [1,/\b(?:one adult|a single adult)\b/i],
    [1,/(?:один|одна|одного|одно[йи]|одному|одним)\s+взросл/iu],
    [3,/(?:три|трое|трех|троих|трем|тремя)\s+взросл/iu],
    [4,/(?:четыре|четверо|четырех|четверых|четырем|четырьмя)\s+взросл/iu],
    [5,/(?:пять|пятеро|пяти|пятерых)\s+взросл/iu],
    [1,/mot\s+nguoi\s+lon/iu],
    [1,/一\s*(?:位|个|個)?\s*成人/u],
    [1,/성인\s*한\s*명/u],
  ];
  for(const [count,pattern] of phrases){
    if(pattern.test(text)) return count;
  }
  return null;
}

function explicitDateConstraint(message,now,context={}){
  return customerCalendarDate(message,{now,dateAsked:context.nextQuestionCode==='DATE',baseDate:context.currentDate||context.CURRENT_SELECTION?.date||''}).dateConstraint;
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

function optionAdviceQuestion(message){
  return /(?:чем.{0,25}отлич.{0,25}вариант|вариант.{0,25}отлич|options?.{0,25}differ|differences?.{0,25}options?)|как.{0,25}выбрать|что.{0,25}(?:выбрать|из этого|из них)|how.{0,25}(?:choose|pick)|which.{0,25}(?:choose|pick)|chon.{0,20}(?:nao|the nao)|怎么选|怎麼選|如何选|어떻게.{0,15}(?:선택|고르)/iu.test(normalizedText(message));
}

function catalogListQuestion(message){
  const text=normalizedText(message);
  if(optionAdviceQuestion(message)||/\bprice\b|\bcost\b|how much|стоим|цен[ауы]|\bgia\b|价格|价钱|가격|요금/iu.test(text)) return false;
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

function explicitCatalogOption(message,products,scopeProductId='',preferScope=false){
  const text=' '+optionName(message)+' ';
  const scope=preferScope&&scopeProductId?scopeProductId:(explicitProductId(message,products)||scopeProductId);
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

export function explicitChildAges(message,context={}) {
  const text=normalizedText(message);
  if(context.nextQuestionCode==='CHILD_AGES'&&/^\d{1,2}(?:\s*(?:,|и|and|va|和|및)\s*\d{1,2})*$/u.test(text.trim())){
    const ages=text.match(/\d+/g).map(Number);return ages.every(age=>age<=17)?ages:[];
  }
  const ages=[];
  const patterns=[
    /(?:child|kid)\s+aged?\s+(\d{1,2})/gu,
    /(?:ребен(?:ок|ка|ку|ком)?|дети|детей|child|kid|tre\s*(?:em)?|children|아이|어린이)[^.!?;\n\d]{0,20}(\d{1,2})\s*(?:лет|года?|years?\s*old|years?|tuoi|岁|歲|세)/gu,
    /(\d{1,2})\s*(?:-?year-?old|岁|歲|세)[^.!?;\n\d]{0,12}(?:child|kid|儿童|孩子|兒童|아이|어린이)/gu,
  ];
  for(const pattern of patterns)for(const match of text.matchAll(pattern)){const age=Number(match[1]);if(age<=17)ages.push(age);}
  return ages;
}

export function explicitNoChildren(message) {
  const text=normalizedText(message);
  return /(?:без\s+(?:дете[ий]|реб[её]нк[ао])|(?:нет|не\s+будет)\s+дете[ий]|дете[ий]\s+(?:нет|не\s+едут)|(?:no|without)\s+(?:children|kids)|adults?\s+only|khong\s+(?:co|di\s+cung)\s+tre\s+em|没有(?:孩子|儿童)|沒有(?:孩子|兒童)|不带(?:孩子|儿童)|不帶(?:孩子|兒童)|(?:아이|어린이)\s*(?:없|없이))/u.test(text);
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
  const dateConstraint=explicitDateConstraint(message,now,context);
  if(dateConstraint!==undefined) patch.dateConstraint=dateConstraint;

  const adults=explicitAdultCount(message);
  if(adults!==null) patch.party={adults};
  const childAges=explicitChildAges(message,context);
  if(childAges.length)patch.party={...(patch.party||{}),childrenAges:childAges};
  if(explicitNoChildren(message))patch.party={...(patch.party||{}),childrenAges:[],infants:0};

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

  const wholeProduct=arr(products).find(row=>optionName(message).includes(optionName(row.product?.title||'missing title')))?.product?.productId;
  const changingProduct=/^(?:хочу|выбираю|поменяй|смени|book|choose|switch|change|chon|doi|选择|换|선택|변경).{0,35}(?:экскурси|тур\b|tour\b|행)/iu.test(text);
  const scopedProduct=!wholeProduct&&!changingProduct?context.currentProductId||'':'';
  const option=explicitCatalogOption(message,products,scopedProduct||context.currentProductId||'',Boolean(scopedProduct));
  const selectedProductId=option.option?.productId||wholeProduct||(scopedProduct&&explicitProductId(message,products)==='love-travel-hon-mun'?scopedProduct:explicitProductId(message,products));
  if(selectedProductId) patch.selectedProductId=selectedProductId;
  if(option.option) patch.selectedOption=option.option;

  const commercialQuestion=/price|cost|available|availability|стоим|цен|доступ|места|gia|价格|가격|заброн|\bbook\b|\breserve\b|[dđ]at|预订|預訂|예약/iu.test(text);
  const recommendationQuestion=/совет|recommend|suggest|de xuat|tu van|推荐|推薦|추천/iu.test(text);
  const factualReference=!commercialQuestion&&!recommendationQuestion&&(/[?？]/u.test(message)||/^(?:что|это|этот|эта|почему|как|what|why|how|is this|does this|cai nay|day la|这是|这个|이것|이 옵션)/iu.test(text))&&(/коралл|входит|включ|coral|includ|san ho|珊瑚|산호|(?:это|этот|this).{0,30}(?:вариант|option)/iu.test(text));
  const comparisonQuestion=/compare|differ|сравн|чем.{0,30}отлич|so\s*sanh|\bkhac\b|区别|比較|비교|차이|다르|다른/iu.test(text);
  const informationGoal=catalogListQuestion(message)||optionAdviceQuestion(message)||option.ambiguous?'DETAILS':comparisonQuestion?'COMPARE':factualReference?'DETAILS'
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
  if(!patch.goal&&/price|cost|how much|стоим|цен|сколько.{0,20}стоит|gia|价格|가격/iu.test(text)){patch.goal='PRICE';patch.bookingRequested=false;}
  return validateIntentPatch(patch);
}

function currentMessagePatch(modelPatch,explicitPatch,message,context={}){
  const result={...modelPatch},text=normalizedText(message);
  // A model patch is a proposed change, not trusted evidence of a traveller.
  // Old values survive in canonical state without being copied into new patches.
  if(result.party){
    const party={...result.party};
    if(/несколь|\b(?:several|some)\b|vai\s+nguoi|几位|幾位|몇\s*명/u.test(text)||!/взросл|(?:нас|едем|еду|вдвоем|один|одна|двое|трое)|\badults?\b|\b(?:we|travellers?|travelers?|people)\b|nguoi|chung\s+toi|成人|我们|我們|성인|명/u.test(text))delete party.adults;
    if(!explicitPatch.party?.childrenAges)delete party.childrenAges;
    if(!/младен|груднич|\binfants?\b|\bbab(?:y|ies)\b|em\s+be|婴儿|嬰兒|아기|유아/u.test(text)&&explicitPatch.party?.infants===undefined)delete party.infants;
    if(Object.keys(party).length)result.party=party;else delete result.party;
  }else if(result.party===null&&!explicitPatch.party)delete result.party;
  if(result.dateConstraint===null&&!explicitDateReset(message))delete result.dateConstraint;
  if(result.dateConstraint!==undefined&&explicitPatch.dateConstraint===undefined&&!/дат|числ|сегодня|завтра|недел|понедельник|вторник|сред|четверг|пятниц|суббот|воскрес|\b(?:date|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)\b|ngay|hom|thu|日|月|今天|明天|요일|오늘|내일/u.test(text))delete result.dateConstraint;
  if(result.selectedOption&&!explicitPatch.selectedOption&&!/вариант|option|phuong an|lua chon|选项|옵션|коралл|coral|снорк|snorkel|san ho|珊瑚|산호/u.test(text))delete result.selectedOption;
  for(const key of ['selectedProductId','selectedOption','hotel','pickupPreference'])if(result[key]===null&&explicitPatch[key]!==null)delete result[key];
  return result;
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


export function requestedOfferScope(message,context={}){
 const text=normalizedText(message);
 const price=/стоим|цен|сколько.{0,15}стоят|\bprice|\bcost|how much|\bgia\b|价格|價錢|价钱|가격|요금/u.test(text);
 const options=/вариант|options?|phuong an|lua chon|选项|選項|옵션/u.test(text);
 const all=/все|всех|\ball\b|tat ca|所有|全部|모두|모든/u.test(text);
 const pluralOptions=/варианты|вариантов|\boptions\b|cac\s+(?:phuong an|lua chon)|各.{0,5}(?:选项|選項)|여러\s*옵션/u.test(text);
 if(price&&options&&(all||pluralOptions))return 'ALL_OPTIONS';
 if(all&&(context.pendingQuestion?.kind==='PRICE_SCOPE'||context.offerScope==='ALL_OPTIONS'))return 'ALL_OPTIONS';
 return '';
}
export function replyOptionChoices(reply,products,productId=''){
 const matches=[...String(reply).matchAll(/(?:^|\n|\s)(\d{1,2})[.)]\s+/gu)];
 if(!matches.length)return null;
 const choices=[];
 for(let i=0;i<matches.length;i++){
  const number=Number(matches[i][1]);
  if(number!==i+1)return [];
  const segment=reply.slice(matches[i].index+matches[i][0].length,matches[i+1]?.index??reply.length);
  const option=explicitCatalogOption(segment,products,productId,true).option;
  const product=products.filter(row=>[row.product?.title,row.facts?.localizedTitle].filter(Boolean).some(title=>optionName(segment).includes(optionName(title))));
  choices.push(option||(product.length===1?{productId:product[0].product.productId}:null));
 }
 return choices.some(Boolean)?choices:[];
}
export function replyPendingQuestion(reply,nextQuestionCode,productId){
 const text=normalizedText(String(reply).split('\n\n').at(-1));
 const scope=/цен|price|cost|gia|价格|가격/u.test(text)&&/всех|все|all|tat ca|所有|모든/u.test(text)&&/[?？]/u.test(reply);
 return {kind:scope?'PRICE_SCOPE':nextQuestionCode||'',productId:productId||''};
}

function shortBookingAnswer(message,intent,context,products){
  const text=normalizedText(message).replace(/[.!?。！？]+$/u,'').trim();
  const goal=COMMERCIAL_GOALS.includes(context.commercialGoal)?context.commercialGoal:null;
  const explicit=deterministicExplicitIntentPatch({message,locale:intent.locale,products,context,now:context.now});
  const ordinal=text.match(/^(?:вариант\s+|option\s+|phuong an\s+)?(\d{1,2})(?:\s*(?:вариант|вариант\s+тура|option|phuong an|번|选项))?$/u);
  if(ordinal&&(context.nextQuestionCode==='OPTION'||/вариант|option|phuong an|번|选项/u.test(text))){
    const choice=arr(context.optionList)[Number(ordinal[1])-1];
    if(choice){
      try{
        const patch=verifiedOptionPatch(validateIntentPatch({selectedProductId:choice.productId,...(choice.rateRef?{selectedOption:{productId:choice.productId,rateRef:choice.rateRef}}:{}),goal:goal||'BOOK',bookingRequested:false}),products);
        return {patch,handled:true};
      }catch{}
    }
    return {patch:{goal:'DETAILS',bookingRequested:false},optionChoiceUnavailable:true,handled:true};
  }
  if(explicit.selectedOption&&!['DETAILS','COMPARE','PICKUP'].includes(explicit.goal)&&(!/[?？]/u.test(message)||COMMERCIAL_GOALS.includes(explicit.goal)))return {patch:{selectedProductId:explicit.selectedProductId,selectedOption:explicit.selectedOption,goal:explicit.goal||goal||'BOOK',bookingRequested:false},handled:true};
  if(requestedOfferScope(message,context))return {patch:{goal:'PRICE',bookingRequested:false},offerScope:'ALL_OPTIONS',handled:true};
  if(context.nextQuestionCode==='DATE'&&/^(?:я уже (?:писала|писал|указала|указал)|i already (?:said|told you)|toi da noi|我已经说过|이미 말했)/u.test(text))return {patch:{goal:goal||'PRICE',bookingRequested:false},dateReminder:true,handled:true};
  if(!goal||['DETAILS','COMPARE','PICKUP'].includes(explicit.goal))return null;
  const totals={one:1,two:2,three:3,four:4,'один':1,'одна':1,'два':2,'двое':2,'три':3,'трое':3,'четыре':4,'четверо':4,mot:1,hai:2,ba:3,bon:4,'一人':1,'两人':2,'兩人':2,'两个人':2,'兩個人':2,'한명':1,'두명':2,'둘':2,'세명':3};
  const total=/^\d{1,2}$/u.test(text)?Number(text):totals[text.replace(/\s+/g,'')];
  if(context.nextQuestionCode==='PARTY'&&Number.isInteger(total)&&total>=1&&total<=30){
    return {patch:{goal,bookingRequested:false},pendingPartyTotal:total,handled:true};
  }
  if(context.nextQuestionCode==='CHILD_AGES'&&explicit.party?.childrenAges?.length)return {patch:{party:explicit.party,goal,bookingRequested:false},handled:true};
  const noChildren=explicitNoChildren(message);
  if(noChildren){
    // Removing children is explicit even when adults were chosen in the UI.
    // A pending total is an explicit correction; otherwise use canonical UI adults.
    const adults=explicit.party?.adults??context.pendingPartyTotal??context.currentAdultCount??intent.party?.adults;
    return {patch:{party:{...(Number.isInteger(adults)?{adults}:{}),childrenAges:[],infants:0},goal,bookingRequested:false},handled:true};
  }
  if(/^(?:нет|не так|no|nope|khong|不|不是|아니요|아니)$/u.test(text))return {patch:{goal:'DETAILS',bookingRequested:false},correctionNeeded:true,handled:true};
  const affirmative=acceptsBookingForm(message);
  if(affirmative&&(intent.optionPreference||context.currentProductId)){
    return {patch:{goal,bookingRequested:false},handled:true};
  }
  if(context.nextQuestionCode==='OPEN_CONFIGURATOR'&&/^(?:я уже (?:сказал|сказала|писал|писала|указал|указала)|i already (?:said|told you)|toi da noi|我已经说过|이미 말했)/u.test(text)){
    return {patch:{goal,bookingRequested:false},handled:true};
  }
  // A short availability follow-up keeps the active transaction scope.
  // Full factual questions (duration, inclusions, policies) still use consultation.
  const datedAvailability=explicit.dateConstraint&&/^(?:(?:на\s+)?(?:сегодня|завтра|\d{4}-\d{2}-\d{2})\s+(?:можно|есть\s+места|доступно)|(?:(?:is\s+)?(?:today|tomorrow|\d{4}-\d{2}-\d{2})\s+(?:available|possible)|can\s+we\s+go\s+(?:today|tomorrow|\d{4}-\d{2}-\d{2}))|(?:hom\s+nay|ngay\s+mai|\d{4}-\d{2}-\d{2})\s+(?:con\s+cho\s+khong|co\s+the\s+di\s+khong)|(?:今天|明天|\d{4}-\d{2}-\d{2})(?:可以吗|可以嗎|有空位吗|有空位嗎)|(?:오늘|내일|\d{4}-\d{2}-\d{2})\s*(?:가능해요|가능한가요))$/u.test(text);
  if(datedAvailability){
    return {patch:{goal:'AVAILABILITY',bookingRequested:false},handled:true};
  }
  const dateAnswer=explicit.dateConstraint&&(context.nextQuestionCode==='DATE'&&message.length<=40||/^(?:(?:на|for)\s+)?(?:сегодня|завтра|today|tomorrow|hom\s+nay|ngay\s+mai|今天|明天|오늘|내일|\d{4}-\d{2}-\d{2})$/u.test(text));
  const adultAnswer=explicit.party?.adults!==undefined&&/^(?:(?:нас|we\s+are|chung\s+toi\s+co)\s+)?(?:(?:\d{1,2}|one|two|three|four)\s+adults?|(?:\d{1,2}|один|одна|два|двое|три|трое|четыре|четверо)\s+взросл(?:ых|ые|ы[йи]|ая)|(?:\d{1,2}|mot|hai|ba|bon)\s+nguoi\s+lon|(?:我们|我們)?(?:\d{1,2}|两|兩|二|一|三|四)\s*(?:位|个|個)?成人|성인\s*(?:\d{1,2}|한|두|세|네)\s*명)$/u.test(text);
  const pickupAnswer=explicit.hotel&&!/[?？]|\b(?:adults?|children|kids|infants?|tomorrow|today|price|cost|book|reserve)\b|взросл|дет|реб|завтра|сегодня|стоим|цен|брони|nguoi\s+lon|tre\s+em|ngay\s+mai|成人|儿童|孩子|明天|성인|어린이|내일/iu.test(text);
  if(message.length<=120&&!/[?？]/u.test(message)&&(dateAnswer||adultAnswer||pickupAnswer)){
    return {patch:{goal,bookingRequested:false},handled:true};
  }
  return null;
}

export function optionChoiceQuestion(locale){
  return ({
    ru:'Уточните экскурсию и вариант из актуального списка. Этот номер нельзя однозначно связать с доступным вариантом.',
    en:'Please specify the tour and an option from the current list. This number cannot be matched to one available option.',
    vi:'Vui lòng cho biết tour và phương án trong danh sách hiện tại. Không thể xác định một phương án còn có sẵn từ số này.',
    zh:'请说明行程及当前列表中的选项。无法根据这个编号确定一个可选方案。',
    ko:'투어와 현재 목록의 옵션을 알려주세요. 이 번호로는 이용 가능한 옵션 하나를 확인할 수 없습니다.',
  })[locale]||optionChoiceQuestion('en');
}

export function partyCompositionQuestion(locale,total){
  return ({
    ru:'Вы указали '+total+' участников. Сколько из них взрослых и сколько детей? Если есть дети, укажите возраст.',
    en:'You said '+total+' travellers. How many are adults and how many are children? If there are children, include their ages.',
    vi:'Bạn cho biết có '+total+' người. Có bao nhiêu người lớn và trẻ em? Nếu có trẻ em, hãy cho biết độ tuổi.',
    zh:'您说共有 '+total+' 人。其中有几位成人和儿童？如果有儿童，请告诉我年龄。',
    ko:'총 '+total+'명이라고 하셨습니다. 성인과 어린이는 각각 몇 명인가요? 어린이가 있다면 나이도 알려주세요.',
  })[locale]||partyCompositionQuestion('en',total);
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
  context={...context,currentDate:context.CURRENT_SELECTION?.date||currentIntent?.dateConstraint?.exact||''};
  const calendar=customerCalendarDate(message,{now,dateAsked:context.nextQuestionCode==='DATE',baseDate:context.currentDate});
  let explicitPatch=deterministicExplicitIntentPatch({
    message,
    locale,
    products,
    context:{...context,currentProductId:context.currentProductId||currentIntent?.optionPreference?.productId||''},
    now,
  });
  const continuation=shortBookingAnswer(message,currentIntent||createInitialTravelIntent(locale),{...context,now},products);
  if(continuation)explicitPatch=validateIntentPatch({...explicitPatch,...continuation.patch});
  const fallback={
    ...(continuation?.correctionNeeded?{correctionNeeded:true}:{}),
    ...(continuation?.pendingPartyTotal?{pendingPartyTotal:continuation.pendingPartyTotal}:{}),
    ...(continuation?.optionChoiceUnavailable?{optionChoiceUnavailable:true}:{}),
    patch:explicitPatch,
    explicitPatch,
    offerScope:continuation?.offerScope||requestedOfferScope(message,context)||(['DATE','PARTY','CHILD_AGES'].includes(context.nextQuestionCode)?context.offerScope||'':''),
    dateReminder:Boolean(continuation?.dateReminder),
    pendingChildAges:(explicitPatch.goal==='BOOK'||!/[?？]/u.test(message))&&!explicitNoChildren(message)&&!explicitPatch.party?.childrenAges?.length&&(/^(?:.*(?:едем|еду|нас|для|взросл|we|with|nguoi|cung|di|带|帶|成人|아이|어린이|성인)).*(?:с\s+ребен|и\s+ребен|с\s+детьми|children|child|kids|kid|tre\s+em|儿童|孩子|아이|어린이)/u.test(normalizedText(message))||/(?:아이|어린이).*함께/u.test(normalizedText(message))),
    pendingAdultCount:explicitPatch.party?.adults===undefined&&(!(context.currentAdultCount>0||currentIntent?.party?.adults>0)||/несколь|\b(?:several|some)\b|vai\s+nguoi|几位|幾位|몇\s*명/u.test(normalizedText(message)))&&/взросл|\badults?\b|nguoi\s+lon|成人|성인/u.test(normalizedText(message)),
    selectedProductId:explicitPatch.selectedProductId??null,
    goal:explicitPatch.goal||'GENERAL',
    bookingRequested:Boolean(explicitPatch.bookingRequested),
    source:'deterministic-explicit',
  };
  if(calendar.invalidDate)return {...fallback,dateClarificationNeeded:true,goal:'DETAILS',patch:{locale,goal:'DETAILS'}};
  if(continuation?.handled)return {...fallback,source:'booking-continuation'};
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
    'Never switch from the current product merely because a destination in its option name is mentioned. A factual question about a named option does not select that option.',
    'Short answers refer to the last question. CURRENT_INTENT is the stored configuration; do not claim a value was saved if it is not present there.',
    'Never repeat a confirmation of an already selected verified option. Ask only for the next missing parameter.',
    'CURRENT_SELECTION counts and date, when present, are authoritative over older intent/history. Never copy earlier party values into a patch unless the customer specifies them now.',
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
    optionAttempted=rawPatch.selectedOption!==undefined&&rawPatch.selectedOption!==null;
    const modelPatch=verifiedOptionPatch(currentMessagePatch(verifiedOptionPatch(validateIntentPatch(rawPatch),products),explicitPatch,message,context),products);
    const patch=verifiedOptionPatch(mergeExplicitOverModel(modelPatch,explicitPatch,message),products);
    return {
      patch,
      explicitPatch,
      offerScope:fallback.offerScope,
      dateReminder:fallback.dateReminder,
      pendingChildAges:Boolean(fallback.pendingChildAges&&!patch.party?.childrenAges?.length),
      pendingAdultCount:Boolean(fallback.pendingAdultCount&&patch.party?.adults===undefined),
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
    return {...fallback,intentFailureReason:error instanceof TypeError?'invalid_schema':salesFailureReason(error)};
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


function validateKnownProviderFacts(reply,products,selected,productId,goal){
  const text=normalizedText(reply.replace(/«[^»]*»|“[^”]*”|"[^"]*"/gu,''));
  if(COMMERCIAL_GOALS.includes(goal)&&selected?.offer?.availability?.status==='AVAILABLE'){
    const unavailable=/(?:нет|отсутствуют)\s+(?:(?:подтвержденных|доступных|свободных)\s+)?(?:предложении|предложений|мест)|no\s+(?:(?:confirmed|available)\s+)?(?:offers|seats|availability)|khong\s+co\s+(?:cho|suat|lua\s+chon).{0,25}(?:trong|kha\s+dung)|没有.{0,15}(?:可订|可预订|空位)|예약\s*가능한.{0,15}없/iu.test(text);
    if(unavailable)throw new TypeError('answer contradicts verified availability');
    const adultsOnly=selected.offer.participantMix?.length&&selected.offer.participantMix.every(p=>p.role==='ADULT');
    if(adultsOnly&&/(?:все|только).{0,60}(?:предложени|вариант).{0,60}(?:включают|содержат|с ребенком|с детьми)|(?:all|only).{0,60}(?:offers|options).{0,60}(?:include|require).{0,25}(?:child|children)/iu.test(text)){
      throw new TypeError('answer contradicts verified adult-only offer');
    }
  }
  const row=products.find(p=>p.product?.productId===productId)||(products.length===1?products[0]:null);
  const facts=row?.facts;
  if(goal==='COMPARE'||!facts||!/(?:lunch|обед|bua\s+trua|午餐|점심)/iu.test(normalizedText(facts.included||'')))return;
  // A product's explicit lunch inclusion cannot become a model-created exclusion.
  if(/(?:lunch|обед|bua\s+trua|午餐|점심)/iu.test(normalizedText(facts.excluded||'')))return;
  const mealDenied=/(?:lunch|food\s+and\s+drinks)\s*[:–-]?\s*(?:(?:is|are|was|were)\s+)?(?:not\s+included|excluded)|(?:обед|еда\s+и\s+напитки|питание\s+и\s+напитки)[^.!?\n;,。；]{0,25}(?:не\s+включ|не\s+вход)|(?:bua\s+trua)[^.!?\n;,。；]{0,25}(?:khong\s+bao\s+gom|khong\s+duoc)|午餐[^.!?\n;,。；]{0,12}(?:不包含|不包括|不含)|(?:不包含|不包括|不含)[^.!?\n;,。；]{0,12}午餐|점심[^.!?\n;,。；]{0,15}(?:포함되지|불포함)/iu.test(text);
  if(mealDenied)throw new TypeError('answer contradicts verified lunch inclusion');
}

export function validateGroundedSalesPlan(raw,evidence,locale='ru',goal='GENERAL'){
  exactKeys(raw,[
    'reply','recommendedProductId','selectedOfferId','action',
    'nextQuestionCode','evidenceRefs',
  ],'salesPlan');
  const reply=str(raw.reply,2400).replace(/<br\s*\/?>/gi,'\n');
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

  validateKnownProviderFacts(reply,products,selected,recommendedProductId,goal);
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
  if(/unverified|not in verified|unknown evidence|language mismatch|comparison omits|catalog answer omits|answer omits|answer contradicts/i.test(message)) return 'answer_validation';
  return 'model_error';
}

function salesResponseFormat(env,evidence,goal){
  if(!String(env?.AI_MODEL||'@cf/google/gemma-4-26b-a4b-it').includes('/gemma-4-')) return {type:'json_object'};
  const products=allProductsFromEvidence(evidence).map(row=>row.product?.productId).filter(Boolean);
  const offers=allOffersFromEvidence(evidence).map(row=>row.offer?.offerId).filter(Boolean);
  const requiredOffers=recommendationOffers(evidence,goal);
  const schema={type:'object',additionalProperties:false,properties:{
    reply:{type:'string',minLength:1,maxLength:900},
    recommendedProductId:{type:'string',enum:[...new Set(requiredOffers.length?requiredOffers.map(row=>row.product?.productId||row.offer.productId):['',...products])]},
    selectedOfferId:{type:'string',enum:[...new Set(requiredOffers.length?requiredOffers.map(row=>row.offer.offerId):['',...offers])]},
    action:{type:'string',enum:requiredOffers.length?['RECOMMEND','OFFER_READY']:SALES_ACTIONS.filter(action=>!['DETAILS','COMPARE','PICKUP'].includes(goal)||!['ASK_DATE','ASK_PARTY','OFFER_READY'].includes(action))},
    nextQuestionCode:{type:'string',...(['DETAILS','COMPARE','PICKUP'].includes(goal)?{enum:['']}: {})},
    evidenceRefs:{type:'array',minItems:1,maxItems:Math.max(1,evidence.length),items:{type:'string',enum:evidence.map(packet=>packet.evidenceId)}},
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


function preparedOfferReply(locale,row){
  const offer=row.offer;
  const group=Object.fromEntries(['ADULT','CHILD','INFANT'].map(role=>[role,arr(offer.participantMix).filter(p=>p.role===role).reduce((n,p)=>n+Number(p.count||0),0)]));
  const title=[row.product?.title,row.option?.localizedTitle||row.option?.title].filter(Boolean).join(' — ');
  const copy={
    ru:'{title}\n\nДата: {date}. Взрослые: {ADULT}; дети: {CHILD}; младенцы: {INFANT}. Итого: {amount} {currency} за этот состав группы.\n\nОткройте оформление кнопкой под экскурсией, чтобы заполнить и проверить оставшиеся данные. Бронирование ещё не создано.',
    en:'{title}\n\nDate: {date}. Adults: {ADULT}; children: {CHILD}; infants: {INFANT}. Total: {amount} {currency} for this party.\n\nOpen the booking form using the button below the tour to complete and review the remaining details. No booking has been created.',
    vi:'{title}\n\nNgày: {date}. Người lớn: {ADULT}; trẻ em: {CHILD}; em bé: {INFANT}. Tổng cộng: {amount} {currency} cho nhóm này.\n\nMở biểu mẫu bằng nút bên dưới tour để điền và kiểm tra các thông tin còn lại. Chưa có đặt chỗ nào được tạo.',
    zh:'{title}\n\n日期：{date}。成人：{ADULT}；儿童：{CHILD}；婴儿：{INFANT}。本组总价：{amount} {currency}。\n\n请通过行程下方的按钮打开预订表单，填写并核对其余信息。预订尚未创建。',
    ko:'{title}\n\n날짜: {date}. 성인: {ADULT}, 어린이: {CHILD}, 영유아: {INFANT}. 이 일행의 총금액: {amount} {currency}.\n\n투어 아래 버튼으로 예약 양식을 열어 나머지 정보를 입력하고 확인해 주세요. 아직 예약은 생성되지 않았습니다.',
  };
  const vars={title,date:offer.date,...group,amount:offer.price.amount,currency:offer.price.currency};
  return (copy[locale]||copy.ru).replace(/\{(\w+)\}/g,(_match,key)=>String(vars[key]??''));
}

function verifiedFactFallback({locale,intent,evidence,message,productFocus,currentSelection}){
  const rows=allProductsFromEvidence(evidence);
  const focus=deterministicExplicitIntentPatch({message,locale,products:rows,context:{currentProductId:productFocus||intent?.optionPreference?.productId||''}}).selectedProductId||intent?.optionPreference?.productId||productFocus;
  const row=rows.find(row=>row.product?.productId===focus)||(rows.length===1?rows[0]:null);
  if(!row?.facts)return null;
  const question=normalizedText(message);
  const includedQuestion=/входит|включ|includ|bao gom|包含|包括|포함/iu.test(question);
  if(!includedQuestion&&!optionAdviceQuestion(message))return null;
  const facts=row.facts,title=facts.localizedTitle||row.product.title;
  const included=String(descriptiveFacts(facts).included||'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').trim();
  if(!included&&!optionAdviceQuestion(message))return null;
  const copy={
    ru:['В описании экскурсии «'+title+'» указано:','Это альтернативные варианты, а не все остановки одной поездки. Подробная программа отдельно для каждого варианта не указана.','Какой отдых вам ближе: пляж, снорклинг или грязевые ванны?'],
    en:['The description of '+title+' lists:','These are alternative options, not all stops on one trip. Separate detailed itineraries for each option are not provided.','Would you prefer beach time, snorkeling, or mud baths?'],
    vi:['Mô tả tour '+title+' ghi:','Đây là các lựa chọn thay thế, không phải tất cả điểm dừng trong một chuyến. Không có lịch trình chi tiết riêng cho từng lựa chọn.','Bạn thích bãi biển, lặn ngắm san hô hay tắm bùn?'],
    zh:[title+'的行程说明列出：','这些是可选方案，并非一次行程中的全部停靠点。没有提供每个方案的独立详细路线。','您更喜欢海滩、浮潜还是泥浴？'],
    ko:[title+' 설명에 포함된 항목:','각 옵션은 대안이며 한 여행의 모든 정차지가 아닙니다. 옵션별 상세 일정은 별도로 제공되지 않았습니다.','해변, 스노클링, 머드 배스 중 무엇을 선호하시나요?'],
  }[locale]||[];
  if(!copy.length)return null;
  const terms={'lunch':{ru:'Обед',en:'Lunch',vi:'Bữa trưa',zh:'午餐',ko:'점심'},'air-conditioned vehicle':{ru:'Транспорт с кондиционером',en:'Air-conditioned vehicle',vi:'Xe có máy lạnh',zh:'空调交通工具',ko:'에어컨 차량'},'use of snorkeling equipment':{ru:'Использование снаряжения для снорклинга',en:'Use of snorkeling equipment',vi:'Sử dụng thiết bị lặn ống thở',zh:'使用浮潜设备',ko:'스노클링 장비 이용'}};
  let reply=included?copy[0]+'\n'+included.split(/\n+/).map(line=>'- '+(terms[normalizedText(line).replace('snorkelling','snorkeling')]?.[locale]||line.trim())).join('\n'):'';
  if(optionAdviceQuestion(message)){
    const labels={ru:['Сейчас выбран вариант: ','Морской парк','Грязевые ванны','Аквариум','Пляж','Какое направление вам интересно?'],en:['Currently selected: ','Marine park','Mud baths','Aquarium','Beach','Which destination interests you?'],vi:['Lựa chọn hiện tại: ','Công viên biển','Tắm bùn','Thủy cung','Bãi biển','Bạn quan tâm điểm đến nào?'],zh:['当前已选方案：','海洋公园','泥浴','水族馆','海滩','您对哪个目的地感兴趣？'],ko:['현재 선택: ','해양 공원','머드 배스','수족관','해변','어느 목적지에 관심이 있으신가요?']}[locale];
    const options=arr(facts.options),active=options.find(option=>sameOptionRef(option.rateRef,currentSelection?.rateRef||intent?.optionPreference?.rateRef));
    const types=[/marine park/iu,/mud bath/iu,/aquarium/iu,/beach/iu];
    const guide=types.flatMap((pattern,index)=>{const option=options.find(option=>pattern.test(option.title));return option?[labels[index+1]+': '+(option.localizedTitle||option.title)]:[];}).map((line,index)=>(index+1)+'. '+line);
    reply=(active?labels[0]+(active.localizedTitle||active.title)+'\n\n':'')+reply+(reply?'\n\n':'')+copy[1]+(guide.length?'\n\n'+guide.join('\n'):'')+'\n\n'+labels[5];
  }
  return {reply,recommendedProductId:row.product.productId,selectedOfferId:'',action:'GENERAL',nextQuestionCode:'',evidenceRefs:evidence.filter(packet=>arr(packet.data).some(item=>item.product?.productId===row.product.productId)).map(packet=>packet.evidenceId),degraded:false};
}

export function deterministicSalesFallback({locale='ru',intent,evidence=[],goal='BOOK',message='',productFocus='',currentSelection=null}={}){
  const commercial=COMMERCIAL_GOALS.includes(goal);
  const availableOffers=recommendationOffers(evidence,goal);
  const consultationOffers=['DISCOVER','GENERAL'].includes(goal)?availableOffers:[];
  const prepared=availableOffers.length===1?availableOffers[0]:null;
  if(commercial&&prepared?.option?.title&&prepared.readyToQuote!==false&&/^\d{4}-\d{2}-\d{2}$/.test(prepared.offer?.date||'')&&arr(prepared.offer?.participantMix).length&&prepared.offer?.price){
    return {reply:preparedOfferReply(locale,prepared),recommendedProductId:prepared.product?.productId||prepared.offer.productId,selectedOfferId:prepared.offer.offerId,action:'OFFER_READY',nextQuestionCode:'OPEN_CONFIGURATOR',evidenceRefs:evidence.map(item=>item.evidenceId)};
  }
  const facts=!commercial?verifiedFactFallback({locale,intent,evidence,message,productFocus,currentSelection}):null;
  if(facts)return facts;
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

export function composeCatalogOptions({locale,evidence,productId=''}){
 const rows=allProductsFromEvidence(evidence).filter(row=>!productId||row.product.productId===productId);
 let index=0;const choices=[];
 const choose=({ru:'Какой вариант выбираете?',en:'Which option would you like?',vi:'Bạn chọn phương án nào?',zh:'您选择哪个方案？',ko:'어떤 옵션을 선택하시겠어요?'})[locale];
 const reply=rows.map(row=>(row.facts.localizedTitle||row.product.title)+':\n'+arr(row.facts.options).map(option=>{choices.push({productId:row.product.productId,rateRef:option.rateRef});return (++index)+'. '+(option.localizedTitle||option.title);}).join('\n')).join('\n\n')+'\n\n'+choose;
 const plan=validateGroundedSalesPlan({reply,recommendedProductId:rows.length===1?rows[0].product.productId:'',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'OPTION',evidenceRefs:evidence.filter(p=>['searchProducts','compareProducts'].includes(p.capability)).map(p=>p.evidenceId)},evidence,locale,'DETAILS');
 return {...plan,choices,source:'provider-catalog-options'};
}

export function composeOptionPrices({locale,intent,evidence,productFocus}){
 const rows=allOffersFromEvidence(evidence),products=allProductsFromEvidence(evidence);
 const available=rows.filter(row=>row.offer?.availability?.status==='AVAILABLE'&&row.option?.title);
 const copy={ru:['Цены на','за весь указанный состав группы','Какой вариант выбираете?'],en:['Prices for','for the whole specified party','Which option would you like?'],vi:['Giá ngày','cho toàn bộ nhóm đã nêu','Bạn chọn phương án nào?'],zh:['日期','所述全部出行人员的总价','您选择哪个方案？'],ko:['날짜','입력한 전체 인원의 총액','어떤 옵션을 선택하시겠어요?']}[locale];
 const grouped=new Map();for(const row of available){const id=row.product.productId;if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(row);}
 let index=0;const choices=[];
 const body=[...grouped].map(([id,options])=>{
  const title=products.find(row=>row.product.productId===id)?.facts?.localizedTitle||options[0].product.title;
  return title+'\n'+options.map(row=>{choices.push({productId:id,rateRef:row.offer.rateRef});return (++index)+'. '+(row.option.localizedTitle||row.option.title)+' — '+row.offer.price.currency+' '+row.offer.price.amount;}).join('\n');
 }).join('\n\n');
 const reply=copy[0]+' '+intent.dateConstraint.exact+' ('+copy[1]+').\n\n'+body+'\n\n'+copy[2];
 const plan=validateGroundedSalesPlan({reply,recommendedProductId:grouped.size===1?[...grouped.keys()][0]:'',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'OPTION',evidenceRefs:evidence.map(p=>p.evidenceId)},evidence,locale,'DETAILS');
 return {...plan,source:'provider-option-prices',choices};
}

export async function composeGroundedSalesPlan({
  env,
  message,
  locale='ru',
  intent,
  currentSelection=null,
  productFocus='',
  evidence=[],
  goal='GENERAL',
  history=[],
}={}){
  const fallback=deterministicSalesFallback({locale,intent,evidence,goal,message,productFocus,currentSelection});
  const requestedCatalogProduct=deterministicExplicitIntentPatch({message,locale,products:allProductsFromEvidence(evidence),context:{currentProductId:productFocus||intent?.optionPreference?.productId||''}}).selectedProductId||intent?.optionPreference?.productId||productFocus;
  const catalogRows=catalogListQuestion(message)?allProductsFromEvidence(evidence).filter(row=>
    !requestedCatalogProduct||row.product?.productId===requestedCatalogProduct
  ):[];
  if(catalogRows.length&&catalogRows.every(row=>arr(row.facts?.options).length)){
    return {...composeCatalogOptions({locale,evidence,productId:requestedCatalogProduct}),nextQuestionCode:'',replyAttempts:0,replyFailureReasons:[]};
  }
  if(optionAdviceQuestion(message)&&!fallback.degraded&&fallback.action==='GENERAL'){const {degraded,...answer}=fallback;return {...validateGroundedSalesPlan(answer,evidence,locale,'DETAILS'),source:'provider-option-guide',replyAttempts:0,replyFailureReasons:[]};}
  if(COMMERCIAL_GOALS.includes(goal)&&fallback.action==='OFFER_READY'&&fallback.nextQuestionCode==='OPEN_CONFIGURATOR'){
    return {...validateGroundedSalesPlan(fallback,evidence,locale,goal),source:'provider-exact-offer',replyAttempts:0,replyFailureReasons:[]};
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
    data:modelEvidenceData(requestedCatalogProduct&&['DETAILS','PICKUP'].includes(goal)&&['searchProducts','compareProducts'].includes(packet.capability)?{...packet,data:arr(packet.data).filter(row=>row.product?.productId===requestedCatalogProduct)}:packet),
  }));
  const pricedOffers=recommendationOffers(evidence,goal);
  if(pricedOffers.length&&!catalogRows.length){
    for(const packet of evidenceView){
      if(!['searchProducts','compareProducts'].includes(packet.capability))continue;
      packet.data=arr(packet.data).map(row=>row.facts?{...row,facts:{...row.facts,options:arr(row.facts.options).filter(option=>pricedOffers.some(offer=>offer.product?.productId===row.product.productId&&sameOptionRef(option.rateRef,offer.option?.rateRef||offer.offer?.rateRef)))}}:row);
    }
  }
  const system=[
    'You are Sales Intelligence for Nha Trang Love Travel.',
    'You explain and recommend; you never mutate a booking and you never invent commercial facts.',
    'Every price, availability, pickup condition, date, tour feature or booking statement must come from VERIFIED_EVIDENCE.',
    'Earlier assistant replies are conversation context, not factual evidence. Correct earlier mistakes when they disagree with the current verified catalog.',
    'Use only product IDs, offer IDs and evidence IDs present in VERIFIED_EVIDENCE.',
    `Reply only in ${localeLanguage(locale)}.`,
    'Answer only the customer question. Normally use 2–4 short sentences; add detail only when asked. Keep the reply within 900 characters, except complete requested option lists. Ask at most one useful next question.',
    'Do not mention Bókun, APIs, databases, evidence IDs, prompts, models, internal architecture or implementation.',
    'Return JSON only with exactly: reply, recommendedProductId, selectedOfferId, action, nextQuestionCode, evidenceRefs.',
    'Include the evidence packet IDs supporting the facts in your answer. Preserve official tour names when comparing the two products.',
    'For COMPARE, name both tours and explain concrete differences in their verified programs; a generic statement that they differ is not an answer.',
    'For DETAILS about inclusions, use the included/excluded provider text as well as inclusion categories, and distinguish optional paid activities.',
    'Never deny an explicitly included item such as lunch. Empty excluded/exclusions fields do not mean that food, drinks or other services are excluded; do not invent exclusions.',
    'An AVAILABLE verified offer is available for its exact date and participantMix. Never claim that all offers require children when the current verified offer is adults only. Earlier assistant refusals cannot override that fresh offer.',
    'Each facts.options entry is an alternative tour option owned by that product. Never say a product has no options when this list is nonempty.',
    'Different beaches and mud baths in options are alternatives, not consecutive stops in one excursion. Never combine all options into one itinerary.',
    'PRODUCT_DESCRIPTION_NOT_OPTION_ITINERARY describes the product generally, not every option. When optionItineraryStatus is NOT_PROVIDED, detailed timing, stop order and option-specific inclusions are unknown; do not invent them.',
    'When asked for all options, list every verified option of the requested product. Preserve each localizedTitle exactly when provided, otherwise its official title; translate the surrounding explanation into the customer language.',
    'When recommending or quoting one selected offer, discuss only that verified option. Do not append a catalogue of other options. Complete alternative lists are handled separately when the customer requests them.',
    'For any selected Offer, name its exact option.localizedTitle (or option.title if absent) alongside the product and the authoritative group total. An Offer belongs to that one option, not every alternative.',
    'REQUIRED_CATALOG_TITLES='+JSON.stringify(catalogRows.flatMap(row=>arr(row.facts?.options).map(option=>option.localizedTitle||option.title))),
    'Use short paragraphs of 1–2 sentences, separated by newline characters in the JSON reply string. Put alternatives or included items on separate numbered or hyphen-prefixed lines. Do not use HTML, Markdown headings or tables, or display literal newline escape text.',
    'For factual DETAILS, COMPARE and PICKUP questions, leave nextQuestionCode empty and do not ask for a date after the answer. Never repeat a date question when CURRENT_INTENT or CURRENT_SELECTION already contains a date.',
    'When showing numbered alternative options, include the exact verified option title in each item and never renumber a programme itinerary as booking options.',
    'action must be one of: '+SALES_ACTIONS.join(', ')+'.',
    'For PRICE, AVAILABILITY or BOOK, ask only for commercial parameters required to calculate an exact offer.',
    'For GENERAL, DETAILS, COMPARE, PICKUP and DISCOVER, answer the question from verified product facts even when date and party are unknown.',
    'Do not require date or participant counts for program, inclusions, exclusions, meeting point, general pickup rules or general cancellation information.',
    'Rate-specific conditions require the relevant option; exact prices and available seats require verified offer evidence. Explain missing evidence without inventing it.',
    'If verified AVAILABLE offers exist for this request, choose the best matching offer and return its selectedOfferId with the same recommendedProductId; do not replace a requested recommendation with an unselected comparison.',
    'For a selected offer, explain required bookingDataIssues that remain; selection is preparation, never a created booking.',
    'Contact details, passenger fields, required booking questions and room numbers are entered in the existing booking form opened by the button below the recommended tour. Chat cannot save those fields. If bookingDataIssues remain, guide the customer to that form and name the missing field types; do not ask them to send those values in chat or claim to have saved them. Do not request another date when only required personal data is missing.',
    'Verified offer date and participantMix take precedence over earlier intent hints. Describe the actual selected offer scope.',
    'If a verified offer exists, recommendation may cite only that offer price/availability.',
    'Every offer.price.amount is the TOTAL for the entire offer.participantMix, including all selected adults/children/infants. State it as a total for that group, never per person or per adult. Do not divide, multiply or invent unit prices.',
    'Numeric prices in descriptions are not authoritative offers. Do not repeat prices for optional activities, rentals or extras unless they appear in VERIFIED_OFFER_PRICES. When no offers exist, describe paid extras without numeric prices.',
    'VERIFIED_OFFER_PRICES='+JSON.stringify([...allowedMoney(evidence)]),
    'Answer briefly in 2–4 short paragraphs. For alternatives use a numbered list, one option per line; never duplicate the same option. Answer the question first and ask at most one necessary next question.',
    'CURRENT_SELECTION='+JSON.stringify(currentSelection),
    'Current selection and verified offers override old intent and assistant statements. Do not infer child ages from role counts.',
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
      const selected=allOffersFromEvidence(evidence).find(row=>row.offer?.offerId===parsed.selectedOfferId);
      if(selected?.option?.title&&parsed.recommendedProductId===(selected.product?.productId||selected.offer.productId)){
        const replyNames=optionName(parsed.reply);
        const otherOptions=allProductsFromEvidence(evidence).find(row=>row.product?.productId===parsed.recommendedProductId)?.facts?.options||[];
        if(otherOptions.some(option=>!sameOptionRef(option.rateRef,selected.option.rateRef||selected.offer.rateRef)&&[option.title,option.localizedTitle].filter(Boolean).some(title=>replyNames.includes(optionName(title.replace(/^Robinson\s*(?:&|and|\+)\s*/iu,'')))))){
          throw new TypeError('answer contradicts the verified selected option');
        }
        // The selected provider offer owns its official caption. Free-form
        // transliteration must not discard an otherwise valid recommendation.
        if(![selected.option.title,selected.option.localizedTitle].filter(Boolean).some(title=>replyNames.includes(optionName(title))))parsed.reply=(selected.product?.title||'')+' — '+(selected.option.localizedTitle||selected.option.title)+'\n\n'+parsed.reply;
      }
      const plan=validateGroundedSalesPlan(parsed,evidence,locale,goal);
      if(exactDateKnown(intent)&&(plan.action==='ASK_DATE'||plan.nextQuestionCode==='DATE'||/на какую дату|на какое число|what date|which date|ngay nao|哪天|어느 날짜/iu.test(plan.reply)))throw new TypeError('answer asks for an already saved date');
      if(['DETAILS','PICKUP'].includes(goal)&&requestedCatalogProduct&&plan.recommendedProductId&&plan.recommendedProductId!==requestedCatalogProduct)throw new TypeError('answer changes the focused product');
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
