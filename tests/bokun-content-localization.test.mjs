import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bokunLanguage,
  collectTranslatableFields,
  hasNativeBokunLocale,
  localizeDomainFromCache,
  normalizeContentLocale,
  syncDomainTranslations,
  _localizationTest,
} from '../src/bokun-content-localization.js';

function sampleDomain() {
  return {
    provider:{productId:'1287578'},
    experience:{
      id:'1287578',
      title:'English title',
      description:'English description',
      languages:{base:'en_GB',raw:['EN_GB'],guidanceTypes:[]},
      content:{
        included:'<p>Lunch included</p>',
        excluded:'',
        requirements:'',
        attention:'<ul><li>Not wheelchair accessible</li></ul>',
        dressCode:'',
        inclusions:[{title:'Hotel pickup'}],
        exclusions:['Alcoholic drinks'],
        knowBeforeYouGoItems:[{title:'Bring sunscreen'}],
      },
      ticket:{message:''},
      pickup:{noPickupMessage:''},
      itinerary:[{id:'a1',title:'First stop',body:'Visit the island'}],
      accessibility:['Not wheelchair accessible'],
      media:{videos:[{title:'Tour video',url:'https://example.com/video'}]},
    },
    rates:[{id:'r1',title:'Default rate',description:'Shared tour',details:[],textItems:[]}],
    extras:[],
    offers:[{id:'o1',title:'Special offer',description:'Save today'}],
    bookingRequirements:{questions:[],customFields:[]},
    cancellationPolicy:{title:'Standard policy'},
  };
}

class FakeDB {
  constructor(){ this.rows=new Map(); }
  prepare(sql){
    const db=this;
    return {
      sql,
      params:[],
      bind(...params){
        return {
          sql,
          params,
          async run(){ return {success:true}; },
          async all(){
            if(/SELECT field_key/i.test(sql)){
              const [productId,locale]=params;
              return {results:[...db.rows.values()].filter(row=>row.product_id===String(productId)&&row.locale===locale)};
            }
            return {results:[]};
          }
        };
      },
      async run(){ return {success:true}; },
      async all(){ return {results:[]}; },
    };
  }
  async batch(statements){
    for(const statement of statements){
      const [productId,locale,fieldKey,sourceHash,sourceText,translatedText,provider]=statement.params;
      this.rows.set([productId,locale,fieldKey].join('|'),{
        product_id:String(productId),
        locale,
        field_key:fieldKey,
        source_hash:sourceHash,
        source_text:sourceText,
        translated_text:translatedText,
        provider,
      });
    }
    return statements.map(()=>({success:true}));
  }
}

test('uses one canonical English Bókun content source for every target locale', () => {
  assert.equal(normalizeContentLocale('ko-KR'),'ko');
  for(const locale of ['ru','vi','en','ko','zh']) assert.equal(bokunLanguage(locale),'EN');
  assert.equal(hasNativeBokunLocale(sampleDomain(),'en'),true);
  assert.equal(hasNativeBokunLocale(sampleDomain(),'ru'),false);
  assert.equal(hasNativeBokunLocale(sampleDomain(),'ko'),false);

  const advertised=sampleDomain();
  advertised.experience.languages.raw.push('KO_KR');
  assert.equal(hasNativeBokunLocale(advertised,'ko'),false);
});

test('extracts stable semantic keys for customer-visible Bókun text', () => {
  const keys=collectTranslatableFields(sampleDomain()).map(field=>field.key);
  assert.ok(keys.includes('experience.title'));
  assert.ok(keys.includes('experience.description'));
  assert.ok(keys.includes('experience.content.included'));
  assert.ok(keys.includes('experience.content.attention'));
  assert.ok(keys.includes('experience.content.inclusions.0.title'));
  assert.ok(keys.includes('experience.content.exclusions.0'));
  assert.ok(keys.includes('experience.content.knowBeforeYouGoItems.0.title'));
  assert.ok(keys.includes('experience.accessibility.0'));
  assert.ok(keys.includes('offers.0.title'));
  assert.ok(keys.includes('experience.media.videos.0.title'));
  assert.ok(keys.includes('experience.itinerary.a1.body'));
  assert.ok(keys.includes('rates.r1.title'));
  assert.ok(keys.includes('cancellationPolicy.title'));
});

test('translates only cache misses and invalidates a field when its Bókun source changes', async () => {
  const DB=new FakeDB();
  const AI={
    async run(_model,input){
      const payload=JSON.parse(input.messages.at(-1).content);
      return {response:JSON.stringify(Object.fromEntries(
        Object.entries(payload).map(([key,value])=>[key,'KO:'+value])
      ))};
    }
  };
  const env={DB,AI,AI_MODEL:'test-model'};
  const domain=sampleDomain();

  const sync=await syncDomainTranslations(domain,env,'ko');
  assert.equal(sync.ok,true);
  assert.ok(sync.translated>=6);

  const localized=await localizeDomainFromCache(domain,env,'ko');
  assert.equal(localized.localization.source,'viiversion-cache');
  assert.equal(localized.localization.pendingFields,0);
  assert.equal(localized.experience.title,'KO:English title');
  assert.equal(localized.experience.itinerary[0].body,'KO:Visit the island');
  assert.equal(localized.rates[0].title,'KO:Default rate');

  const changed=sampleDomain();
  changed.experience.title='Updated English title';
  const background=[];
  const stale=await localizeDomainFromCache(changed,env,'ko',{waitUntil(promise){background.push(promise);}});
  assert.equal(stale.experience.title,'Updated English title');
  assert.ok(stale.localization.pendingFields>=1);
  assert.equal(stale.localization.source,'source');
  assert.equal(stale.localization.atomic,true);
  assert.equal(stale.localization.translatedFields,0);
  assert.equal(stale.experience.description,'English description');
  assert.equal(background.length,1);

  await Promise.all(background);
  const refreshed=await localizeDomainFromCache(changed,env,'ko');
  assert.equal(refreshed.experience.title,'KO:Updated English title');
  assert.equal(refreshed.localization.pendingFields,0);
  assert.equal(refreshed.localization.source,'viiversion-cache');
});


test('background translation jobs are serialized to avoid Workers AI contention', async () => {
  const order=[];
  const first=_localizationTest.enqueueBackgroundSync(async()=>{
    order.push('first:start');
    await new Promise(resolve=>setTimeout(resolve,15));
    order.push('first:end');
  });
  const second=_localizationTest.enqueueBackgroundSync(async()=>{
    order.push('second:start');
    order.push('second:end');
  });
  await Promise.all([first,second]);
  assert.deepEqual(order,['first:start','first:end','second:start','second:end']);
});


test('translation prompt enforces native tourism terminology', async () => {
  let system='';
  const DB=new FakeDB();
  const AI={
    async run(_model,input){
      system=String(input.messages?.[0]?.content||'');
      const payload=JSON.parse(input.messages.at(-1).content);
      return {response:JSON.stringify(Object.fromEntries(Object.keys(payload).map(key=>[key,'translated'])))};
    }
  };
  await syncDomainTranslations(sampleDomain(),{DB,AI,BOKUN_TRANSLATION_MODEL:'test-model'},'zh');
  assert.match(system,/consumer travel-platform language/);
  assert.match(system,/旅行社/);
  assert.match(system,/可订情况/);
  assert.match(system,/Never use telecom-style “运营商”/);
  assert.match(system,/Marine Park\/Marine Protected Area -> 海洋保护区/);
  assert.match(system,/Use 芽庄 for Nha Trang/);

  const DB2=new FakeDB();
  let koreanSystem='';
  const AI2={
    async run(_model,input){
      koreanSystem=String(input.messages?.[0]?.content||'');
      const payload=JSON.parse(input.messages.at(-1).content);
      return {response:JSON.stringify(Object.fromEntries(Object.keys(payload).map(key=>[key,'번역'])))};
    }
  };
  await syncDomainTranslations(sampleDomain(),{DB:DB2,AI:AI2,BOKUN_TRANSLATION_MODEL:'test-model'},'ko');
  assert.match(koreanSystem,/예약 가능 여부/);
  assert.match(koreanSystem,/Avoid “좌석”/);
  assert.match(koreanSystem,/avoid technical words such as “구성”/);
});


test('native profile upgrade preserves stable caches and requires v5 only for ZH', () => {
  const v3='workers-ai:gemma-4-26b-a4b-it:v3';
  const v4='workers-ai:gemma-4-26b-a4b-it:v4-native-travel';
  const v5='workers-ai:gemma-4-26b-a4b-it:v5-complete-locale';
  assert.equal(_localizationTest.translationProvider('ru'),v3);
  assert.equal(_localizationTest.translationProvider('vi'),v4);
  assert.equal(_localizationTest.translationProvider('zh'),v5);
  assert.equal(_localizationTest.translationProvider('ko'),v4);
  assert.equal(_localizationTest.acceptedTranslationProvider('ru',v3),true);
  assert.equal(_localizationTest.acceptedTranslationProvider('ru',v4),true);
  assert.equal(_localizationTest.acceptedTranslationProvider('zh',v3),false);
  assert.equal(_localizationTest.acceptedTranslationProvider('zh',v4),false);
  assert.equal(_localizationTest.acceptedTranslationProvider('zh',v5),true);
});


test('serves the last complete same-source locale while a new translation profile refreshes', async () => {
  const DB=new FakeDB();
  const AI={
    async run(_model,input){
      const payload=JSON.parse(input.messages.at(-1).content);
      return {response:JSON.stringify(Object.fromEntries(
        Object.entries(payload).map(([key,value])=>[key,'ZH:'+value])
      ))};
    }
  };
  const env={DB,AI,BOKUN_TRANSLATION_MODEL:'test-model'};
  const domain=sampleDomain();

  await syncDomainTranslations(domain,env,'zh');
  for(const row of DB.rows.values()){
    if(row.locale==='zh') row.provider='workers-ai:gemma-4-26b-a4b-it:v4-native-travel';
  }

  const background=[];
  const localized=await localizeDomainFromCache(domain,env,'zh',{
    waitUntil(promise){ background.push(promise); }
  });

  assert.equal(localized.localization.source,'viiversion-cache-stale');
  assert.equal(localized.localization.staleWhileRevalidate,true);
  assert.ok(localized.localization.pendingFields>0);
  assert.equal(localized.localization.translatedFields,collectTranslatableFields(domain).length);
  assert.equal(localized.experience.title,'ZH:English title');
  assert.equal(localized.experience.description,'ZH:English description');
  assert.equal(background.length,1);

  await Promise.all(background);
  const refreshed=await localizeDomainFromCache(domain,env,'zh');
  assert.equal(refreshed.localization.source,'viiversion-cache');
  assert.equal(refreshed.localization.pendingFields,0);
});


test('recovers every field when the translation model returns a partial JSON object', async () => {
  const DB=new FakeDB();
  let calls=0;
  const AI={
    async run(_model,input){
      calls+=1;
      const payload=JSON.parse(input.messages.at(-1).content);
      const entries=Object.entries(payload);
      if(entries.length>1){
        const keep=Math.max(1,Math.floor(entries.length/3));
        return {response:JSON.stringify(Object.fromEntries(
          entries.slice(0,keep).map(([key,value])=>[key,'ZH:'+value])
        ))};
      }
      return {response:JSON.stringify(Object.fromEntries(
        entries.map(([key,value])=>[key,'ZH:'+value])
      ))};
    }
  };
  const domain=sampleDomain();
  const env={DB,AI,BOKUN_TRANSLATION_MODEL:'test-model'};
  const sync=await syncDomainTranslations(domain,env,'zh');
  const fields=collectTranslatableFields(domain);
  assert.equal(sync.ok,true);
  assert.equal(sync.translated,fields.length);
  assert.ok(calls>1);

  const localized=await localizeDomainFromCache(domain,env,'zh');
  assert.equal(localized.localization.source,'viiversion-cache');
  assert.equal(localized.localization.pendingFields,0);
  assert.equal(localized.localization.translatedFields,fields.length);
  assert.equal(localized.experience.title,'ZH:English title');
  assert.equal(localized.experience.description,'ZH:English description');
});
