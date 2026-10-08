import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'..');
const semanticJs=await readFile(resolve(root,'src/lovetravel-i18n.js'),'utf8');
const localeJs=await readFile(resolve(root,'src/lovetravel-tour-locale.js'),'utf8');
const domainJs=await readFile(resolve(root,'src/lovetravel-domain-tour.js'),'utf8');
const bookingJs=await readFile(resolve(root,'src/lovetravel-booking-configurator.js'),'utf8');
const runtimeJs=await readFile(resolve(root,'src/runtime-api.js'),'utf8');
const bokunLocalization=await readFile(resolve(root,'src/bokun-content-localization.js'),'utf8');
const build=await readFile(resolve(root,'build.mjs'),'utf8');

test('tour presentation localization is syntactically valid and shares the semantic core locales',()=>{
  assert.doesNotThrow(()=>new Function(localeJs));
  assert.match(localeJs,/const SUPPORTED=\['ru','vi','en','ko','zh'\]/);
  assert.match(localeJs,/LoveTravelI18n/);
  assert.match(semanticJs,/const SUPPORTED = Object\.freeze\(\['ru','vi','en','ko','zh'\]\)/);
});

test('client locale layer does not own Bókun product or rate content',()=>{
  for(const id of ['1287578','1287580','2581224','2623660','2581227']) assert.equal(localeJs.includes(id),false,id);
  for(const text of [
    'Островное приключение в Нячанге: пляж Робинзон',
    '나트랑 아일랜드 호핑: 로빈슨 비치 어드벤처',
    'Robinson & Hon Mun Marine Park'
  ]) assert.equal(localeJs.includes(text),false,text);
  assert.match(bokunLocalization,/experience\.title/);
  assert.match(bokunLocalization,/experience\.description/);
  assert.match(bokunLocalization,/rates\.' \+ part \+ '\.title/);
});

test('provider enums and formatting strings live in the unified semantic bundle',()=>{
  for(const key of [
    'provider.policy.standard','provider.language.english','provider.hotelName',
    'provider.difficulty.moderate','provider.meeting.both','provider.category.adult',
    'provider.duration.hour','provider.ageRange','provider.minutes'
  ]) assert.ok(semanticJs.includes(key),key);
  for(const token of ['languageName','difficulty','meetingType','duration','formatDate','ageRange','localizeQuestion']){
    assert.ok(localeJs.includes(token),token);
  }
});

test('semantic core and provider formatter load before runtime tour renderer and configurator',()=>{
  const core=build.indexOf('<script src="/lovetravel-i18n.js?v=20261009-ai-dialogue-v1" defer></script>');
  const l10n=build.indexOf('<script src="/lovetravel-tour-locale.js" defer></script>');
  const runtime=build.indexOf('<script src="/runtime-api.js" defer></script>');
  const domain=build.indexOf('<script src="/lovetravel-domain-tour.js?v=20261008-interface-restore-v4" defer></script>');
  const booking=build.indexOf('<script src="/lovetravel-booking-configurator.js?v=20261008-interface-restore-v4" defer></script>');
  assert.ok(core>=0 && l10n>core && runtime>l10n && domain>runtime && booking>domain);
});

test('live Bókun catalog is formatted after server localization and before legacy catalog rendering',()=>{
  assert.match(runtimeJs,/LoveTravelTourLocale/);
  assert.match(runtimeJs,/localizeCatalogTour/);
  assert.match(runtimeJs,/catalog\.map\(tour=>localizer\.localizeCatalogTour\(tour\)\)/);
  assert.match(runtimeJs,/\/api\/bokun\/tours\?locale=/);
  assert.match(localeJs,/serverLocalizationMatches/);
});

test('tour detail renderer treats server domain content as authoritative',()=>{
  assert.match(domainJs,/localizedProductTitle/);
  assert.match(domainJs,/localizedProductDescription/);
  assert.match(domainJs,/localizedRateTitle/);
  assert.match(domainJs,/localizedDate\(slot\.date/);
  assert.equal(domainJs.includes('preferCurated'),false);
  assert.equal(domainJs.includes('itineraryBody?.'),false);
  assert.equal(domainJs.includes('productTitle?.'),false);
  assert.equal(domainJs.includes('rateTitle?.'),false);
});

test('booking sheets use server rate content and semantic UI copy',()=>{
  assert.match(bookingJs,/semantic-i18n-core-v1/);
  assert.match(bookingJs,/function localizedRateTitle\(_productId,rate,_localization=null\)/);
  assert.match(bookingJs,/localizeQuestion/);
  assert.match(bookingJs,/providerText\(item\.title\|\|item\.code\|\|id\)/);
  assert.match(bookingJs,/providerText\('required'\)/);
  assert.equal(bookingJs.includes(" · required"),false);
});

test('provider presentation executes through the semantic bundle for every locale',()=>{
  const load=selected=>{
    const context={
      document:{documentElement:{lang:'ru'}},
      localStorage:{getItem:key=>key==='max-tour-locale-v1'?selected:null,setItem(){}},
      Intl, Date, String, Number, Array, Object, RegExp, Math, Proxy, Map
    };
    context.globalThis=context;
    vm.createContext(context);
    vm.runInContext(semanticJs,context);
    vm.runInContext(localeJs,context);
    return context.LoveTravelTourLocale;
  };

  const expected={
    ru:{duration:'7 часов',difficulty:'Средняя'},
    vi:{duration:'7 giờ',difficulty:'Trung bình'},
    en:{duration:'7 hours',difficulty:'Moderate'},
    ko:{duration:'7시간',difficulty:'보통'},
    zh:{duration:'7小时',difficulty:'中等'}
  };
  for(const [selected,values] of Object.entries(expected)){
    const api=load(selected);
    assert.equal(api.locale(),selected);
    assert.equal(api.productTitle('1287578','server title'),'server title');
    assert.equal(api.rateTitle('1287578','2623660','server rate'),'server rate');
    assert.equal(api.duration({hours:7,text:'7 hours'}),values.duration);
    assert.equal(api.difficulty('MODERATE'),values.difficulty);
    assert.notEqual(api.formatDate('2026-09-29'),"Tue 29.Sep'26");
  }
});
