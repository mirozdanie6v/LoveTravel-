import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'src/director-v3.html'), 'utf8');
let code = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(code, 'director inline script must exist');
code = code.replace('(function(){', '').replace(/\}\)\(\);\s*$/, '');

function createHarness() {
  const storage = new Map();
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        hidden: false,
        dataset: {},
        listeners: {},
        classList: { add() {}, remove() {} },
        setAttribute() {},
        addEventListener(type, listener) { this.listeners[type] = listener; },
      });
    }
    return elements.get(id);
  };
  const context = {
    console, Intl, Date, Math, JSON, String, Number, Array, Object, RegExp,
    document: { getElementById: element, querySelectorAll() { return []; }, addEventListener() {} },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); },
    },
    window: { clearTimeout() {}, setTimeout() { return 1; } },
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, storage };
}

test('director demo interaction model filters, searches, changes horizon and stores drafts', () => {
  const { context, storage } = createHarness();

  context.state.filters.city = 'Фукуок';
  assert.equal(context.filteredRows(context.cities).length, 1);

  context.state.filters.city = 'all';
  context.state.filters.status = 'critical';
  assert.equal(context.filteredRows(context.groups).length, 2);

  context.state.filters.status = 'all';
  context.state.filters.period = 'week';
  context.state.view = 'plan';
  assert.match(context.fmt(1000), /240/);

  context.state.view = 'dashboard';
  context.state.horizon = 'now';
  assert.equal((context.renderDashboard().match(/class="decision"/g) || []).length, 2);

  const analytics = context.renderAnalytics();
  assert.match(analytics, /Пол клиентов/);
  assert.match(analytics, /Откуда пришли/);
  assert.match(analytics, /Динамика выручки/);

  assert.ok(context.searchIndex().some(item => item.title.includes('Далат')));
  assert.equal(context.drawerContent('team', 'guide-confirm').title, 'Поздние подтверждения гидов');

  context.createDraft('Тест', 'Проверка', 'Директор');
  assert.equal(context.state.drafts.length, 1);
  assert.ok(storage.get('maxtourDirectorDrafts'));
});

test('analytics cross-filters recalculate the visible slice and trend without SVG NaN', () => {
  const { context } = createHarness();
  const baseClients = context.analyticsRows('source').reduce((sum, row) => sum + row.value, 0);

  context.state.analyticsFilters.source = 'instagram';
  context.state.analyticsFilters.gender = 'women';
  const sourceRows = context.analyticsRows('source');
  const womenRows = context.analyticsRows('gender');
  const filteredClients = sourceRows.reduce((sum, row) => sum + row.value, 0);

  assert.ok(filteredClients > 0 && filteredClients < baseClients);
  assert.ok(womenRows.find(row => row.id === 'women').value > 0);
  assert.ok(womenRows.find(row => row.id === 'women').value < filteredClients);
  assert.equal(womenRows.find(row => row.id === 'men').value, 0);
  const html = context.renderAnalytics();
  assert.match(html, /Активный срез/);
  assert.match(html, /data-analytics-filter-key="source"/);
  assert.match(html, /data-analytics-filter-value="instagram"/);
  assert.doesNotMatch(html, /NaN/);
});

test('every director button template has an interaction contract', () => {
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);
  const known = /data-(view|horizon|toast|open|nav|search-index|analytics-clear|analytics-reset)|id="(closeDrawer|draftsButton)"|type="submit"/;
  assert.ok(buttons.length > 40);
  assert.deepEqual(buttons.filter(button => !known.test(button)), []);
});
