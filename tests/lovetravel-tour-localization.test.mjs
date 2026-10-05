import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'..');
const localeJs=await readFile(resolve(root,'src/lovetravel-tour-locale.js'),'utf8');
const domainJs=await readFile(resolve(root,'src/lovetravel-domain-tour.js'),'utf8');
const bookingJs=await readFile(resolve(root,'src/lovetravel-booking-configurator.js'),'utf8');
const runtimeJs=await readFile(resolve(root,'src/runtime-api.js'),'utf8');
const coreJs=await readFile(resolve(root,'src/lovetravel-i18n-core.js'),'utf8');
const build=await readFile(resolve(root,'build.mjs'),'utf8');
const bundleFiles=Object.fromEntries(await Promise.all(
  ['ru-RU','vi-VN','en-US','ko-KR','zh-CN'].map(async code=>[code,await readFile(resolve(root,'src/locales',code+'.js'),'utf8')])
));

test('tour localization layer is syntactically valid and delegates UI enums to semantic i18n',()=>{
  assert.doesNotThrow(()=>new Function(localeJs));
  assert.match(localeJs,/const SUPPORTED=\['ru','vi','en','ko','zh'\]/);
  assert.match(localeJs,/LoveTravelI18n/);
  assert.match(localeJs,/'enum\.language\.'\+code/);
  assert.match(localeJs,/'enum\.difficulty\.'\+code/);
  assert.match(localeJs,/'enum\.meeting\.'\+code/);
  assert.match(localeJs,/'enum\.format\.'\+code/);
});

test('both production Bókun products keep curated long-form content for all five locales',()=>{
  for(const id of ['1287578','1287580']) assert.ok(localeJs.includes("'"+id+"'"),id);
  for(const text of [
    'Островное приключение в Нячанге: пляж Робинзон',
    'Hành trình khám phá đảo Nha Trang tại bãi biển Robinson',
    'Nha Trang Island Hopping Adventure at Robinson Beach',
    '나트랑 아일랜드 호핑: 로빈슨 비치 어드벤처',
    '芽庄跳岛探险：Robinson 海滩'
  ]) assert.ok(localeJs.includes(text),text);
  assert.match(localeJs,/itineraryBody/);
});

test('all live Bókun rate variants have curated display titles',()=>{
  for(const id of ['2581224','2623660','2623666','2623667','2623668','2623669','2623670','2581227','2581226','2581229','2581228']) {
    assert.ok(localeJs.includes("'"+id+"'"),id);
  }
  assert.match(localeJs,/rateTitle/);
});

test('semantic i18n runtime loads before content adapter runtime and renderers',()=>{
  const semantic=build.indexOf('<script src="/lovetravel-i18n-core.js"></script>');
  const l10n=build.indexOf('<script src="/lovetravel-tour-locale.js" defer></script>');
  const runtime=build.indexOf('<script src="/runtime-api.js" defer></script>');
  const domain=build.indexOf('<script src="/lovetravel-domain-tour.js" defer></script>');
  const booking=build.indexOf('<script src="/lovetravel-booking-configurator.js" defer></script>');
  assert.ok(semantic>=0&&l10n>semantic&&runtime>l10n&&domain>runtime&&booking>domain);
});

test('live Bókun catalog stays neutral in runtime and is localized only as a view model',()=>{
  assert.doesNotMatch(runtimeJs,/catalog\.map\(tour=>localizer\.localizeCatalogTour\(tour\)\)/);
  assert.match(runtimeJs,/neutralCatalog=catalog\.map\(tour=>structuredClone\(tour\)\)/);
  assert.match(runtimeJs,/lovetravel:catalog-updated/);
  assert.match(localeJs,/function localizeCatalogTour\(tour\)/);
  assert.match(domainJs,/serverLocalized/);
});

test('tour and booking renderers consume localized adapters without raw provider display shortcuts',()=>{
  assert.match(domainJs,/localizedProductTitle/);
  assert.match(domainJs,/localizedProductDescription/);
  assert.match(domainJs,/localizedRateTitle/);
  assert.match(domainJs,/localizedDate\(slot\.date/);
  assert.match(domainJs,/languageName/);
  assert.match(domainJs,/itineraryBody/);
  assert.match(bookingJs,/localizedRateTitle\(productId,rate,localization=null\)/);
  assert.match(bookingJs,/localizeQuestion/);
  assert.match(bookingJs,/providerText\(item\.description\)/);
});

function load(selected){
  const storage=new Map([['lovetravel.locale.v1',selected]]);
  const context={
    console:{error(){},warn(){},log(){}},Intl,Date,String,Number,Array,Object,RegExp,Math,
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))},
    document:{documentElement:{lang:''},querySelector(){return null;},dispatchEvent(){}},
    location:{reload(){}},
    CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}}
  };
  context.globalThis=context;
  vm.createContext(context);
  for(const code of ['ru-RU','vi-VN','en-US','ko-KR','zh-CN']) vm.runInContext(bundleFiles[code],context);
  vm.runInContext(coreJs,context);
  vm.runInContext(localeJs,context);
  return context.LoveTravelTourLocale;
}

test('localization adapter behaves consistently for all five canonical locales',()=>{
  const expected={
    'ru-RU':{short:'ru',title:'Островное приключение в Нячанге: пляж Робинзон',rate:'Робинзон и морской парк Хон Мун',difficulty:'Средняя'},
    'vi-VN':{short:'vi',title:'Hành trình khám phá đảo Nha Trang tại bãi biển Robinson',rate:'Robinson & Khu bảo tồn biển Hòn Mun',difficulty:'Trung bình'},
    'en-US':{short:'en',title:'Nha Trang Island Hopping Adventure at Robinson Beach',rate:'Robinson & Hon Mun Marine Park',difficulty:'Moderate'},
    'ko-KR':{short:'ko',title:'나트랑 아일랜드 호핑: 로빈슨 비치 어드벤처',rate:'로빈슨 & 혼문 해양공원',difficulty:'보통'},
    'zh-CN':{short:'zh',title:'芽庄跳岛探险：Robinson 海滩',rate:'Robinson & Hòn Mun 海洋保护区',difficulty:'中等'}
  };
  for(const [selected,values] of Object.entries(expected)){
    const api=load(selected);
    assert.equal(api.locale(),values.short);
    assert.equal(api.productTitle('1287578','fallback'),values.title);
    assert.equal(api.rateTitle('1287578','2623660','fallback'),values.rate);
    assert.equal(api.difficulty('MODERATE'),values.difficulty);
    assert.notEqual(api.duration({hours:7,text:'7 hours'}),'7 hours'||selected==='en-US');
  }
});
