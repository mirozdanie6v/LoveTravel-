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

test('normalizes UI locales into Bókun language parameters without inventing a native locale', () => {
  assert.equal(normalizeContentLocale('ko-KR'),'ko');
  assert.equal(bokunLanguage('vi'),'VI');
  assert.equal(hasNativeBokunLocale(sampleDomain(),'ru'),false);
  assert.equal(hasNativeBokunLocale(sampleDomain(),'ko'),false);

  const native=sampleDomain();
  native.experience.languages.raw.push('KO_KR');
  assert.equal(hasNativeBokunLocale(native,'ko'),true);
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
  const stale=await localizeDomainFromCache(changed,env,'ko');
  assert.equal(stale.experience.title,'Updated English title');
  assert.ok(stale.localization.pendingFields>=1);
  assert.equal(stale.experience.description,'KO:English description');
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
