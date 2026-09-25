import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { _test } from '../src/admin-api.js';
import { _test as workerTest } from '../src/worker.js';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'src/admin-v3.html'), 'utf8');
const app = await readFile(resolve(root, 'src/admin-app.js'), 'utf8');
const api = await readFile(resolve(root, 'src/admin-api.js'), 'utf8');
const worker = await readFile(resolve(root, 'src/worker.js'), 'utf8');
const migration = await readFile(resolve(root, 'migrations/0002_admin_crm.sql'), 'utf8');
const taskMigration = await readFile(resolve(root, 'migrations/0003_admin_tasks.sql'), 'utf8');
const demoFlowMigration = await readFile(resolve(root, 'migrations/0004_demo_crm_flow.sql'), 'utf8');
const aiMigration = await readFile(resolve(root, 'migrations/0005_ai_consultations.sql'), 'utf8');
const wrangler = await readFile(resolve(root, 'wrangler.jsonc'), 'utf8');

test('admin prototype contains no hardcoded customer, order or payment records', () => {
  assert.match(html, /const departuresData = \[\];/);
  assert.match(html, /const ordersData = \[\];/);
  assert.match(html, /const customersData = \[\];/);
  for (const formerFixture of ['Иван Петров', 'Марина Орлова', 'MT-014', '+84 90 123']) {
    assert.doesNotMatch(html, new RegExp(formerFixture.replace(/[+]/g, '\\+')));
  }
});

test('password hashing is salted and role permissions are enforced', async () => {
  const hash = await _test.passwordHash('very-secure-password', '00112233445566778899aabbccddeeff', 1000);
  assert.equal(hash.length, 64);
  assert.equal(_test.timingSafeEqual(hash, hash), true);
  assert.equal(_test.timingSafeEqual(hash, `${hash.slice(0, -1)}0`), false);
  assert.equal(_test.can('manager', 'booking.write'), true);
  assert.equal(_test.can('manager', 'tour.write'), false);
  assert.equal(_test.can('admin', 'tour.write'), true);
});

test('money normalization converts legacy dollars and keeps rubles', () => {
  assert.equal(_test.numberFromMoney('$420', 100), 42000);
  assert.equal(_test.numberFromMoney('42 000 ₽', 100), 42000);
  assert.equal(_test.bookingMoneyFromRubles(42000, '$420', 100), '$420');
  assert.equal(_test.bookingMoneyFromRubles(42000, '42000 ₽', 100), '42000 ₽');
  assert.equal(_test.paymentStatus(12600, 42000, 'Подтверждён'), 'Депозит');
  assert.equal(_test.paymentStatus(42000, 42000, 'Подтверждён'), 'Оплачено 100%');
});

test('admin API is isolated before tourist session and old public admin endpoints are removed', () => {
  assert.match(worker, /handleAdminApi\(request, env, url\)/);
  assert.doesNotMatch(worker, /url\.pathname === '\/api\/admin\/stats'/);
  assert.doesNotMatch(worker, /url\.pathname === '\/api\/admin\/events'/);
  assert.match(app, /\/api\/admin\/auth\/login/);
  assert.match(app, /x-csrf-token/);
  assert.match(app, /data-order-filter/);
  assert.match(app, /data-customer-filter/);
});

test('admin migration persists users, sessions, CRM actions and audit trail', () => {
  for (const table of ['admin_users', 'admin_sessions', 'admin_customer_profiles', 'admin_messages', 'admin_notification_rules', 'admin_broadcasts', 'admin_audit_log']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test('demo admin opens directly without setup or login UI', () => {
  assert.match(wrangler, /PUBLIC_ADMIN_DEMO/);
  assert.match(api, /demo-public-admin/);
  assert.match(api, /setupRequired: false, authenticated: true/);
  assert.match(app, /loadWorkspace\(\)/);
});

test('director tasks have a persistent D1 queue and admin API contract', () => {
  assert.match(taskMigration, /CREATE TABLE IF NOT EXISTS admin_tasks/);
  for (const field of ['title', 'description', 'owner', 'priority', 'status', 'due_date', 'created_by']) {
    assert.match(taskMigration, new RegExp(`${field}`));
  }
  assert.match(api, /path === '\/api\/admin\/tasks' && request.method === 'POST'/);
  assert.match(api, /const task = path\.match/);
  assert.match(api, /task\.write/);
});

test('demo CRM flow shares orders, departures and events across cabinets', () => {
  assert.match(demoFlowMigration, /CREATE TABLE IF NOT EXISTS admin_departures/);
  assert.match(demoFlowMigration, /CREATE TABLE IF NOT EXISTS admin_demo_events/);
  assert.match(api, /path === '\/api\/admin\/orders' && request\.method === 'POST'/);
  assert.match(api, /path === '\/api\/admin\/departures' && request\.method === 'POST'/);
  assert.match(api, /events: \(eventsResult\.results \|\| \[\]\)/);
  assert.match(worker, /groupDepartures/);
  assert.match(worker, /admin_demo_events/);
  assert.match(app, /Создать офлайн-заказ/);
  assert.match(app, /Создать групповой выезд/);
});

test('AI consultant stores a structured manager request and exposes it to the team', () => {
  assert.match(aiMigration, /CREATE TABLE IF NOT EXISTS ai_consultations/);
  for (const field of ['session_id', 'status', 'intent', 'summary', 'payload_json']) assert.match(aiMigration, new RegExp(field));
  assert.match(worker, /url\.pathname === '\/api\/consultations' && request\.method === 'POST'/);
  assert.match(worker, /normalizeConsultationPayload/);
  assert.match(worker, /consultation_created/);
  assert.match(api, /ai_consultations/);
  assert.match(api, /consultation\.write/);
  assert.match(app, /Запросы для менеджера/);
  assert.match(app, /open-consultation/);
  const payload = workerTest.normalizeConsultationPayload({ payload: { adults: 2, children: [7, 10], infants: 1, contact: { telegram: '@family_demo' }, preferences: ['море', 'море'] } });
  assert.equal(payload.adults, 2);
  assert.deepEqual(payload.children, [7, 10]);
  assert.equal(payload.infants, 1);
  assert.deepEqual(payload.preferences, ['море']);
  assert.equal(payload.contact.telegram, '@family_demo');
});

test('AI consultation keeps a bounded conversation transcript for the saved selection', () => {
  const payload = workerTest.normalizeConsultationPayload({ payload: {
    conversation: [
      { role:'user', text:'Нячанг' },
      { role:'bot', text:'Покажу варианты' },
      { role:'system', text:'служебная строка' },
    ],
  } });
  assert.deepEqual(payload.conversation, [
    { role:'user', text:'Нячанг' },
    { role:'bot', text:'Покажу варианты' },
    { role:'bot', text:'служебная строка' },
  ]);
});

test('AI consultant has a bounded Workers AI route with a safe fallback', () => {
  assert.match(worker, /url\.pathname === '\/api\/ai\/chat' && request\.method === 'POST'/);
  assert.match(worker, /env\.AI\.run/);
  assert.match(worker, /catalog\.v28\.json/);
  assert.equal(workerTest.aiFallbackReply('Сколько стоит депозит?', []), 'Оплата доступна депозитом 30% или полностью; точная сумма показывается при оформлении.');
  assert.equal(workerTest.unsafeAiCopy('Я помогу выбрать поездку.'), false);
  assert.equal(workerTest.unsafeAiCopy('Откройте CRM.'), true);
  assert.match(wrangler, /"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"/);
});

test('Workers AI receives the current catalogue and safe customer context', async () => {
  let received;
  const env = {
    ASSETS: { fetch: async () => new Response(JSON.stringify([{ id:'demo-tour', title:'Демо тур', city:'Нячанг', tags:['море'], group:{ from:'$35' }, childrenOk:true }])) },
    AI: { run: async (model, input) => { received = { model, input }; return { response:'Напишите желаемую дату — я подберу поездку.' }; } },
    AI_MODEL: '@cf/test/model',
    USD_RUB_RATE: '84.2569',
    DISABLE_CBR_RATE: 'true',
  };
  const result = await workerTest.generateAiReply(new Request('https://demo.test/api/ai/chat'), env, { message:'Хочу море', history:[] });
  assert.equal(result.source, 'cloudflare-workers-ai');
  assert.equal(result.reply, 'Напишите желаемую дату — я подберу поездку.');
  assert.equal(received.model, '@cf/test/model');
  assert.match(received.input.messages[0].content, /Демо тур/);
  assert.match(received.input.messages[0].content, /только на русском/);
  assert.match(received.input.messages[0].content, /только в долларах/);
});
