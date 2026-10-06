import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = path => readFile(resolve(root, path), 'utf8');

const [worker, workerR2, bokunProvider, locale, booking, i18n, semanticI18n, build, bokunLocalization, ai, brand] = await Promise.all([
  read('src/worker.js'),
  read('src/worker-r2.js'),
  read('src/bokun-provider.js'),
  read('src/lovetravel-tour-locale.js'),
  read('src/lovetravel-booking-configurator.js'),
  read('src/i18n-v1.js'),
  read('src/lovetravel-i18n.js'),
  read('build.mjs'),
  read('src/bokun-content-localization.js'),
  read('src/ai-consultant-v5.js'),
  read('src/lovetravel-brand.js'),
]);

test('first release is fixed to the two Love Travel Bókun products', () => {
  assert.match(booking, /new Set\(\['1287578','1287580'\]\)/);
  assert.match(worker, /new Set\(\['1287578','1287580'\]\)/);
  assert.match(worker, /String\(payload\?\.vendorId\) !== '137689'/);
  assert.match(worker, /data\.length !== 2/);
});

test('Love Travel AI uses typed Travel Commerce Sales Orchestrator instead of legacy AI routing', () => {
  assert.match(worker, /new URL\('\/api\/bokun\/tours', request\.url\)/);
  assert.match(worker, /source !== 'bokun'/);
  assert.match(workerR2, /handleLoveTravelSalesAgent/);
  assert.match(workerR2, /const salesAgentResponse = await handleLoveTravelSalesAgent\(request, env, url\)/);
  assert.doesNotMatch(workerR2, /return baseWorker\.fetch\(request, env, ctx\)/);
});

test('Simplified Chinese is wired across UI, booking, Bókun localization and AI', () => {
  assert.match(i18n, /\['ru','vi','en','ko','zh'\]/);
  assert.match(i18n, /data-locale="zh"/);
  assert.match(build, /i18n-zh-v1\.js/);
  assert.match(locale, /SUPPORTED=\['ru','vi','en','ko','zh'\]/);
  assert.match(semanticI18n, /zh:'zh-CN'/);
  assert.match(semanticI18n,/"booking\.title": "规划您的行程"/);
  assert.match(semanticI18n, /'zh-CN'/);
  assert.match(bokunLocalization, /'zh'\]/);
  assert.match(bokunLocalization, /zh:'Simplified Chinese'/);
  assert.match(ai, /\['vi','en','ko','zh'\]/);
  assert.match(ai, /'zh-CN'/);
  assert.match(worker, /Simplified Chinese/);
  assert.match(brand, /kicker:'芽庄 · 海岛体验'/);
  assert.match(brand, /chips:\['Robinson Beach','Hòn Mun 海洋保护区'\]/);
  assert.match(brand, /\$\{c\.chips\[1\]\}/);
});

test('booking path remains resolver-backed and covers pickup, customer and questions', () => {
  assert.match(booking, /\/api\/bokun\/booking-selection\/resolve/);
  for (const token of ['participants','pickup','dropoff','extras','customer','answers','passengers']) {
    assert.ok(booking.includes(token), token);
  }
  assert.match(booking, /CHECKOUT_REQUIRED_CUSTOMER_FIELDS = \['firstName','lastName','email','phoneNumber'\]/);
});

test('client demo booking is hidden behind a hashed invite and integration-side idempotency', () => {
  assert.match(workerR2, /LOVE_TRAVEL_CLIENT_DEMO_TOKEN_SHA256/);
  assert.match(workerR2, /demoTokenHash\(demoToken\)/);
  assert.match(workerR2, /LT-TEST-CLIENT-/);
  assert.match(bokunProvider, /x-love-travel-demo-token/);
  assert.match(bokunProvider, /SUBMIT_LOVE_TRAVEL_CLIENT_DEMO_BOOKING/);
  assert.match(workerR2, /createBokunProvider/);
  assert.match(booking, /clientDemoEnabled\(\)/);
  assert.match(booking, /\/api\/bokun\/client-demo\/submit/);
  assert.match(semanticI18n,/"booking\.demoCreate": "Создать тестовую бронь"/);
  assert.match(semanticI18n,/"booking\.demoCreate": "创建测试预订"/);
});
