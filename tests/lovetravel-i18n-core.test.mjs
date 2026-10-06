import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'..');
const source=await readFile(resolve(root,'src/lovetravel-i18n.js'),'utf8');
const domain=await readFile(resolve(root,'src/lovetravel-domain-tour.js'),'utf8');
const booking=await readFile(resolve(root,'src/lovetravel-booking-configurator.js'),'utf8');
const legacy=await readFile(resolve(root,'src/i18n-v1.js'),'utf8');

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
  assert.equal(zh.t('tour.meeting'),'集合地点');
  assert.equal(zh.t('booking.title'),'规划您的行程');
  assert.equal(zh.t('booking.email'),'电子邮箱');
  assert.equal(zh.t('common.email'),'电子邮箱');
  assert.equal(zh.t('provider.nhaTrang'),'芽庄');
  assert.equal(zh.t('booking.timeCount',{count:2}),'2 个可选时间');
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


test('legacy DOM translator excludes semantic surfaces',()=>{
  assert.match(legacy,/SEMANTIC_I18N_SELECTOR/);
  assert.match(legacy,/\.lt-domain-shell,\.lt-booking-config,\.lt-booking-sheet/);
  assert.match(legacy,/semanticOwned\(node\)/);
});


test('native travel terminology avoids technical and cross-domain jargon',()=>{
  const vi=load('vi');
  const ko=load('ko');
  const zh=load('zh');
  const en=load('en');

  assert.equal(vi.t('provider.format.group'),'tour ghép');
  assert.equal(vi.t('booking.title'),'Lên kế hoạch chuyến đi');
  assert.doesNotMatch(vi.t('booking.bookingNotSent'),/cấu hình/i);

  assert.equal(ko.t('booking.live'),'실시간 예약 가능 여부 및 가격');
  assert.equal(ko.t('booking.ready'),'예약 정보 확인 완료');
  assert.doesNotMatch(ko.t('booking.live'),/좌석/);
  assert.doesNotMatch(ko.t('booking.bookingNotSent'),/구성/);

  assert.equal(zh.t('booking.live'),'实时可订情况与价格来自旅行社系统');
  assert.equal(zh.t('booking.ready'),'预订信息已核对');
  assert.doesNotMatch(zh.t('booking.live'),/运营商/);
  assert.doesNotMatch(zh.t('booking.bookingNotSent'),/配置/);

  assert.equal(en.t('booking.title'),'Plan your trip');
  assert.doesNotMatch(en.t('booking.bookingNotSent'),/configuration/i);
});
