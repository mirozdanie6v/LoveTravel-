import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const read=path=>readFile(resolve(root,path),'utf8');
const [worker,workerR2,locale,booking,core,build,bokunLocalization,ai,...bundles]=await Promise.all([
  read('src/worker.js'),read('src/worker-r2.js'),read('src/lovetravel-tour-locale.js'),
  read('src/lovetravel-booking-configurator.js'),read('src/lovetravel-i18n-core.js'),read('build.mjs'),
  read('src/bokun-content-localization.js'),read('src/ai-consultant-v5.js'),
  ...['ru-RU','en-US','vi-VN','zh-CN','ko-KR'].map(code=>read('src/locales/'+code+'.js'))
]);

test('first release is fixed to the two Love Travel Bókun products',()=>{
  assert.match(booking,/new Set\(\['1287578','1287580'\]\)/);
  assert.match(worker,/new Set\(\['1287578','1287580'\]\)/);
  assert.match(worker,/String\(payload\?\.vendorId\) !== '137689'/);
});

test('Love Travel AI uses the live Bókun catalogue and bypasses legacy AI routing',()=>{
  assert.match(worker,/new URL\('\/api\/bokun\/tours', request\.url\)/);
  assert.match(worker,/source !== 'bokun'/);
  assert.match(workerR2,/if \(url\.pathname === '\/api\/ai\/chat' && request\.method === 'POST'\)/);
  assert.match(ai,/LoveTravelI18n/);
  assert.match(ai,/locale:ACTIVE_LOCALE/);
});

test('all five public locales are first-class semantic bundles',()=>{
  for(const code of ['ru-RU','en-US','vi-VN','zh-CN','ko-KR']) assert.ok(core.includes(code),code);
  for(const bundle of bundles){
    assert.match(bundle,/"booking\.date":/);
    assert.match(bundle,/"tour\.meeting":/);
    assert.match(bundle,/"ai\.assistant":/);
    assert.match(bundle,/"nav\.home":/);
  }
  assert.match(locale,/SUPPORTED=\['ru','vi','en','ko','zh'\]/);
  assert.match(bokunLocalization,/zh:'Simplified Chinese'/);
  assert.match(worker,/Simplified Chinese/);
});

test('legacy DOM translation and MAX TOUR post-render patches are not loaded by the customer build',()=>{
  assert.match(build,/lovetravel-i18n-core\.js/);
  assert.match(build,/locales\/zh-CN\.js/);
  assert.doesNotMatch(build,/\$\{i18nJs\}/);
  for(const file of [
    'i18n-v1.js','i18n-en-v1.js','i18n-ko-v1.js','i18n-zh-v1.js',
    'ai-network-guard-v8.js','ai-consultant.js','ai-catalog-card-v7.js',
    'ai-selection-polish-v15.js','ai-explicit-tour-v16.js','ai-booking-bridge-v25.js',
    'tour-departure-live-v3.js','catalog-show-press.js','tour-lightbox.js'
  ]) assert.equal(build.includes('<script src="/'+file),false,file);
});

test('booking path remains resolver-backed and covers pickup customer and questions',()=>{
  assert.match(booking,/\/api\/bokun\/booking-selection\/resolve/);
  for(const token of ['participants','pickup','dropoff','extras','customer','answers','passengers']) assert.ok(booking.includes(token),token);
  assert.match(booking,/CHECKOUT_REQUIRED_CUSTOMER_FIELDS = \['firstName','lastName','email','phoneNumber'\]/);
});

test('client demo booking stays behind a hashed invite while labels live in locale bundles',()=>{
  assert.match(workerR2,/LOVE_TRAVEL_CLIENT_DEMO_TOKEN_SHA256/);
  assert.match(workerR2,/demoTokenHash\(demoToken\)/);
  assert.match(workerR2,/SUBMIT_LOVE_TRAVEL_CLIENT_DEMO_BOOKING/);
  assert.match(booking,/clientDemoEnabled\(\)/);
  assert.match(booking,/\/api\/bokun\/client-demo\/submit/);
  assert.ok(bundles[0].includes('"booking.demoCreate": "Создать тестовую бронь"'));
  assert.ok(bundles[3].includes('"booking.demoCreate": "创建测试预订"'));
});

test('Bókun content localization is controlled outside the request path',()=>{
  assert.match(bokunLocalization,/status TEXT NOT NULL DEFAULT 'current'/);
  assert.match(bokunLocalization,/translationQuality/);
  const localize=bokunLocalization.slice(bokunLocalization.indexOf('export async function localizeDomainFromCache'),bokunLocalization.indexOf('export async function syncAllDomainLocales'));
  assert.doesNotMatch(localize,/syncDomainTranslations\(/);
  assert.match(workerR2,/async scheduled/);
  assert.match(workerR2,/refreshBokunLocalizationCache/);
});
