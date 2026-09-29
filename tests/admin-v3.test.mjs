import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const admin = await readFile(resolve(root, 'src/admin-v3.html'), 'utf8');
const director = await readFile(resolve(root, 'src/director-v3.html'), 'utf8');
const adminApp = await readFile(resolve(root, 'src/admin-app.js'), 'utf8');
const roleScript = await readFile(resolve(root, 'src/role-switch.js'), 'utf8');
const roleStyles = await readFile(resolve(root, 'src/role-switch.css'), 'utf8');
const build = await readFile(resolve(root, 'build.mjs'), 'utf8');

test('admin v3 keeps the approved navigation and operational views', () => {
  for (const section of ['Обзор', 'Выезды', 'Заказы', 'Группы', 'Запросы клиентов', 'Клиенты', 'Оплаты', 'Каталог', 'Задачи директора', 'Уведомления', 'Аналитика']) {
    assert.match(admin, new RegExp(section));
  }
  assert.match(adminApp, /window\.renderDashboard = function\(/);
  assert.match(adminApp, /window\.renderDepartures = function\(/);
  assert.match(adminApp, /window\.renderOrders = function\(/);
  assert.match(adminApp, /window\.renderCustomers = function\(/);
  assert.match(adminApp, /window\.renderTasks = function\(/);
  assert.match(adminApp, /window\.renderConsultations = function\(/);
});

test('dedicated admin cabinets keep internal role navigation while public Mini App removes it', () => {
  assert.match(admin, /aria-label="Переключение роли"/);
  assert.match(admin, /href="\/"[^>]*aria-label="Открыть кабинет туриста"/);
  assert.match(admin, /href="\/admin\/" class="active"/);
  assert.match(admin, /href="\/director\/"/);
  assert.match(roleScript, /querySelector\('\.admin-top'\)/);
  assert.match(roleScript, /adminButton\.remove\(\)/);
  assert.doesNotMatch(roleScript, /window\.showAdmin/);
  assert.match(roleStyles, /\.max-role-switch/);
});

test('director cabinet keeps its management views and direct access', () => {
  for (const section of ['Пульт директора', 'План и прогноз', 'Города', 'Экскурсии', 'Группы и спрос', 'Деньги', 'Клиенты и источники', 'Команда', 'AI-помощник']) {
    assert.match(director, new RegExp(section));
  }
  assert.match(director, /aria-label="Переключение роли"/);
  assert.match(director, /href="\/director\/" class="active"/);
  assert.doesNotMatch(director, /type="password"/);
  assert.match(director, /format\(Math\.round\(n \* periodFactor\(\)\)\) \+ " ₽"/);
  assert.doesNotMatch(director, /USD/);
});

test('director demo filters, search and periods change visible data', () => {
  assert.match(director, /data-filter="period"/);
  assert.match(director, /data-filter="city"/);
  assert.match(director, /data-filter="status"/);
  assert.match(director, /function filteredRows\(rows\)/);
  assert.match(director, /field\.addEventListener\("change"/);
  assert.match(director, /HORIZON_FACTORS/);
  assert.match(director, /visibleDecisions = decisions\.slice/);
  assert.match(director, /function searchIndex\(\)/);
  assert.match(director, /\.filter\(function\(item\).*includes\(q\)/);
  assert.match(director, /data-search-index/);
});

test('admin prototype displays money only in rubles', () => {
  assert.match(admin, /₽/);
  assert.doesNotMatch(admin, /\$\d/);
});

test('standalone build publishes admin and director routes plus role switch assets', () => {
  for (const token of ["mkdir(resolve(dist, 'admin')", "mkdir(resolve(dist, 'director')", "admin/index.html", "director/index.html", "role-switch.css", "role-switch.js"]) {
    assert.match(build, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('all three cabinets publish the same approved Max Tour logo asset', () => {
  assert.match(build, /max-tour-logo\.svg/);
  assert.match(admin, /max-tour-logo\.svg/);
  assert.match(director, /max-tour-logo\.svg/);
});

test('published Mini App replaces the legacy inline admin with protected v3', () => {
  assert.match(build, /replaceLegacyAdmin/);
  assert.match(build, /window\.location\.assign\('\/admin\/'\)/);
});
