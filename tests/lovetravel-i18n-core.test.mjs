import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'..');
const source=await readFile(resolve(root,'src/lovetravel-i18n.js'),'utf8');
const domain=await readFile(resolve(root,'src/lovetravel-domain-tour.js'),'utf8');
const booking=await readFile(resolve(root,'src/lovetravel-booking-configurator.js'),'utf8');

function load(selected){
  const context={
    document:{documentElement:{lang:'ru'}},
    localStorage:{getItem:key=>key==='max-tour-locale-v1'?selected:null,setItem(){}},
    globalThis:null,
    Intl, Object, String, Number, Array, RegExp, Proxy, Map
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context);
  return context.LoveTravelI18n;
}

test('semantic i18n core has complete key parity for every supported locale',()=>{
  assert.doesNotThrow(()=>new Function(source));
  const api=load('en');
  assert.deepEqual(Array.from(api.SUPPORTED),['ru','vi','en','ko','zh']);
  const base=Object.keys(api.BUNDLES.ru).sort();
  for(const locale of api.SUPPORTED) assert.deepEqual(Object.keys(api.BUNDLES[locale]).sort(),base,locale);
  assert.ok(base.length>=175);
});

test('semantic keys resolve customer UI copy without source-language lookup',()=>{
  const zh=load('zh');
  assert.equal(zh.t('tour.meeting'),'行程集合地点');
  assert.equal(zh.t('booking.title'),'规划您的行程');
  assert.equal(zh.t('booking.timeCount',{count:2}),'2 个时间');
  const ko=load('ko');
  assert.equal(ko.t('tour.bookNow'),'지금 예약');
  assert.equal(ko.t('booking.pickupHotelLabel'),'호텔 픽업');
});

test('LoveTravel domain and booking modules are language-neutral',()=>{
  assert.equal(/const copy\s*=/.test(domain),false);
  assert.equal(/const copy\s*=/.test(booking),false);
  assert.equal(domain.includes('RATE_PRESENTATION'),false);
  assert.equal(/[А-Яа-яЁё\u4E00-\u9FFF\uAC00-\uD7AF]/.test(domain),false);
  assert.equal(/[А-Яа-яЁё\u4E00-\u9FFF\uAC00-\uD7AF]/.test(booking),false);
  assert.match(domain,/scope\?\.\('tour'\)/);
  assert.match(booking,/scope\?\.\('booking'\)/);
});
