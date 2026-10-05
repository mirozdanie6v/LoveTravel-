import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = path => readFile(resolve(root, path), 'utf8');

const [worker, workerR2, locale, booking, i18n, build, bokunLocalization, ai] = await Promise.all([
  read('src/worker.js'),
  read('src/worker-r2.js'),
  read('src/lovetravel-tour-locale.js'),
  read('src/lovetravel-booking-configurator.js'),
  read('src/i18n-v1.js'),
  read('build.mjs'),
  read('src/bokun-content-localization.js'),
  read('src/ai-consultant-v5.js'),
]);

test('first release is fixed to the two Love Travel Bókun products', () => {
  assert.match(booking, /new Set\(\['1287578','1287580'\]\)/);
  assert.match(worker, /new Set\(\['1287578','1287580'\]\)/);
  assert.match(worker, /String\(payload\?\.vendorId\) !== '137689'/);
  assert.match(worker, /data\.length !== 2/);
});

test('Love Travel AI uses the live Bókun catalogue and bypasses legacy AI routing', () => {
  assert.match(worker, /new URL\('\/api\/bokun\/tours', request\.url\)/);
  assert.match(worker, /source !== 'bokun'/);
  assert.match(worker, /cloudflare-workers-ai-bokun/);
  assert.match(worker, /tourId must be "", "1287578", or "1287580"/);
  assert.match(workerR2, /if \(url\.pathname === '\/api\/ai\/chat' && request\.method === 'POST'\) \{\s*return baseWorker\.fetch/);
});

test('Simplified Chinese is wired across UI, booking, Bókun localization and AI', () => {
  assert.match(i18n, /\['ru','vi','en','ko','zh'\]/);
  assert.match(i18n, /data-locale="zh"/);
  assert.match(build, /i18n-zh-v1\.js/);
  assert.match(locale, /SUPPORTED=\['ru','vi','en','ko','zh'\]/);
  assert.match(locale, /zh:'zh-CN'/);
  assert.match(booking, /title:'规划您的行程'/);
  assert.match(booking, /'zh-CN'/);
  assert.match(bokunLocalization, /'zh'\]/);
  assert.match(bokunLocalization, /zh:'Simplified Chinese'/);
  assert.match(ai, /\['vi','en','ko','zh'\]/);
  assert.match(ai, /'zh-CN'/);
  assert.match(worker, /Simplified Chinese/);
});

test('booking path remains resolver-backed and covers pickup, customer and questions', () => {
  assert.match(booking, /\/api\/bokun\/booking-selection\/resolve/);
  for (const token of ['participants','pickup','dropoff','extras','customer','answers','passengers']) {
    assert.ok(booking.includes(token), token);
  }
  assert.match(booking, /CHECKOUT_REQUIRED_CUSTOMER_FIELDS = \['firstName','lastName','email','phoneNumber'\]/);
});

test('client demo booking is hidden behind a private demo token and server-to-server integration token', () => {
  assert.match(workerR2, /LOVE_TRAVEL_CLIENT_DEMO_ACCESS_TOKEN/);
  assert.match(workerR2, /LOVE_TRAVEL_INTEGRATION_TOKEN/);
  assert.match(workerR2, /LT-TEST-CLIENT-/);
  assert.match(workerR2, /lovetravel_demo_booking_guards/);
  assert.match(workerR2, /SUBMIT_LOVE_TRAVEL_CLIENT_DEMO_BOOKING/);
  assert.match(booking, /clientDemoEnabled\(\)/);
  assert.match(booking, /\/api\/bokun\/client-demo\/submit/);
  assert.match(booking, /demoCreate:'Создать тестовую бронь'/);
  assert.match(booking, /demoCreate:'创建测试预订'/);
});
