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
const build=await readFile(resolve(root,'build.mjs'),'utf8');

test('tour localization layer is syntactically valid and covers every public locale',()=>{
  assert.doesNotThrow(()=>new Function(localeJs));
  assert.match(localeJs,/const SUPPORTED=\['ru','vi','en','ko','zh'\]/);
  for(const locale of ['ru','vi','en','ko','zh']) assert.match(localeJs,new RegExp(locale+":\\{"));
});

test('both production Bókun products have localized titles descriptions and itinerary',()=>{
  for(const id of ['1287578','1287580']) assert.ok(localeJs.includes("'"+id+"'"),id);
  for(const text of [
    'Островное приключение в Нячанге: пляж Робинзон',
    'Hành trình khám phá đảo Nha Trang tại bãi biển Robinson',
    '나트랑 아일랜드 호핑: 로빈슨 비치 어드벤처',
    'Снорклинг в морском парке Хон Мун и островной тур по Нячангу',
    'Lặn ngắm san hô tại Hòn Mun và tour khám phá đảo Nha Trang',
    '혼문 해양공원 스노클링 & 나트랑 아일랜드 투어'
  ]) assert.ok(localeJs.includes(text),text);
  assert.match(localeJs,/itineraryBody/);
});

test('all live Bókun rate variants are localized',()=>{
  for(const id of [
    '2581224','2623660','2623666','2623667','2623668','2623669','2623670',
    '2581227','2581226','2581229','2581228'
  ]) assert.ok(localeJs.includes("'"+id+"'"),id);
  assert.match(localeJs,/rateTitle/);
});

test('provider enums dates duration languages and common booking labels are localized centrally',()=>{
  for(const token of [
    'Standard Viator policy','MODERATE','MEET_ON_LOCATION_OR_PICK_UP',
    'Hotel name','Room number','Private transfer','Bring sunscreen','Nha Trang hotels',
    'languageName','difficulty','meetingType','duration','formatDate','ageRange','localizeQuestion'
  ]) assert.ok(localeJs.includes(token),token);
});

test('localization layer loads before runtime tour renderer and configurator',()=>{
  const l10n=build.indexOf('<script src="/lovetravel-tour-locale.js" defer></script>');
  const runtime=build.indexOf('<script src="/runtime-api.js" defer></script>');
  const domain=build.indexOf('<script src="/lovetravel-domain-tour.js" defer></script>');
  const booking=build.indexOf('<script src="/lovetravel-booking-configurator.js" defer></script>');
  assert.ok(l10n>=0 && runtime>l10n && domain>runtime && booking>domain);
  assert.match(build,/copyFile\(resolve\(root, 'src\/lovetravel-tour-locale\.js'/);
});

test('live Bókun catalog is localized before it enters legacy catalog rendering',()=>{
  assert.match(runtimeJs,/LoveTravelTourLocale/);
  assert.match(runtimeJs,/localizeCatalogTour/);
  assert.match(runtimeJs,/catalog\.map\(tour=>localizer\.localizeCatalogTour\(tour\)\)/);
  assert.match(runtimeJs,/\/api\/bokun\/tours\?locale=/);
  assert.match(localeJs,/serverLocalizationMatches/);
  assert.match(domainJs,/serverLocalized/);
});

test('tour detail renderer never trusts provider localizedDate or raw product metadata for display',()=>{
  assert.match(domainJs,/localizedProductTitle/);
  assert.match(domainJs,/localizedProductDescription/);
  assert.match(domainJs,/localizedRateTitle/);
  assert.match(domainJs,/localizedDate\(slot\.date/);
  assert.match(domainJs,/languageName/);
  assert.match(domainJs,/\.difficulty\?\./);
  assert.match(domainJs,/itineraryBody/);
  assert.match(domainJs,/policyTitle/);
  assert.equal(domainJs.includes("esc(slot.localizedDate || slot.date)"),false);
  assert.equal(domainJs.includes("esc(domain.experience.title)"),false);
  assert.equal(domainJs.includes("esc(domain.experience.difficulty)"),false);
});

test('booking sheets localize rates dynamic questions extras and custom fields',()=>{
  assert.match(bookingJs,/semantic-i18n-core-v1/);
  assert.match(bookingJs,/localizedRateTitle\(productId,rate,localization=null\)/);
  assert.match(bookingJs,/localizeQuestion/);
  assert.match(bookingJs,/providerText\(item\.title\|\|item\.code\|\|id\)/);
  assert.match(bookingJs,/providerText\(item\.description\)/);
  assert.match(bookingJs,/providerText\('required'\)/);
  assert.equal(bookingJs.includes(" · required"),false);
});


test('localization layer executes translations for RU VI EN KO and saved locale wins over html default',()=>{
  const load=selected=>{
    const context={
      document:{documentElement:{lang:'ru'}},
      localStorage:{getItem:key=>key==='max-tour-locale-v1'?selected:null},
      Intl, Date, String, Number, Array, Object, RegExp, Math
    };
    vm.createContext(context);
    vm.runInContext(localeJs,context);
    return context.LoveTravelTourLocale;
  };

  const expected={
    ru:{
      title:'Островное приключение в Нячанге: пляж Робинзон',
      rate:'Робинзон и морской парк Хон Мун',
      duration:'7 часов',
      difficulty:'Средняя'
    },
    vi:{
      title:'Hành trình khám phá đảo Nha Trang tại bãi biển Robinson',
      rate:'Robinson & Khu bảo tồn biển Hòn Mun',
      duration:'7 giờ',
      difficulty:'Trung bình'
    },
    en:{
      title:'Nha Trang Island Hopping Adventure at Robinson Beach',
      rate:'Robinson & Hon Mun Marine Park',
      duration:'7 hours',
      difficulty:'Moderate'
    },
    ko:{
      title:'나트랑 아일랜드 호핑: 로빈슨 비치 어드벤처',
      rate:'로빈슨 & 혼문 해양공원',
      duration:'7시간',
      difficulty:'보통'
    }
  };

  for(const [selected,values] of Object.entries(expected)){
    const api=load(selected);
    assert.equal(api.locale(),selected);
    assert.equal(api.productTitle('1287578','fallback'),values.title);
    assert.equal(api.rateTitle('1287578','2623660','fallback'),values.rate);
    assert.equal(api.duration({hours:7,text:'7 hours'}),values.duration);
    assert.equal(api.difficulty('MODERATE'),values.difficulty);
    assert.notEqual(api.formatDate('2026-09-29'),"Tue 29.Sep'26");
  }
});
