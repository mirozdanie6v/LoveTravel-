import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const policy = await readFile(resolve(root, 'src/trip-policy-live-v2.js'), 'utf8');
const ai = await readFile(resolve(root, 'src/ai-location-guard-v6.js'), 'utf8');
const build = await readFile(resolve(root, 'build.mjs'), 'utf8');

test('live trip policy is syntactically valid and uses current Vietnam time', () => {
  assert.doesNotThrow(() => new vm.Script(policy));
  assert.match(policy, /Asia\/Ho_Chi_Minh/);
  assert.match(policy, /48 \* 60 \* 60 \* 1000/);
  assert.match(policy, /T17:00:00/);
  assert.match(policy, /now >= departure/);
  assert.match(policy, /Поездка завершена/);
  assert.match(policy, /setInterval\(\(\) => refreshLivePolicies\(new Date\(\)\), 60 \* 1000\)/);
});

test('location guard blocks impossible cross-region cards and allows real routes', () => {
  const context = {
    MaxTourAI:{ mount(){} },
    TOURS:[],
    sessionStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    console,
  };
  vm.createContext(context);
  vm.runInContext(ai, context);
  const { allowed, placeFrom } = context.MaxTourAI._locationTest;
  assert.equal(allowed('Ханой','Далат'), false);
  assert.equal(allowed('Ханой','Ниньбинь'), true);
  assert.equal(allowed('Ханой','Халонг'), true);
  assert.equal(allowed('Нячанг','Далат'), true);
  assert.equal(placeFrom('Экскурсия в Ниньбинь / Ninh Binh'), 'Ниньбинь');
});

test('combined Danang + Hoi An tour is matched to Hoi An request instead of fallback card', () => {
  const context = {
    MaxTourAI:{ mount(){} },
    TOURS:[{
      id:'danang-ba-na-hoian',
      title:'Дананг — Ба На Хиллс — Хойан',
      city:'Дананг',
      region:'Центральный Вьетнам',
      searchText:'дананг bana hills хойан hoi an',
      tags:['Дананг','Хойан'],
      route:['Дананг','Хойан'],
      popular:true,
    }],
    sessionStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    console,
  };
  vm.createContext(context);
  vm.runInContext(ai, context);
  const api = context.MaxTourAI._locationTest;
  assert.deepEqual(Array.from(api.tourPlacesFromTour(context.TOURS[0])), ['Дананг','Хойан']);
  api.inspectInput('Я в Дананге');
  api.inspectInput('Хочу экскурсию в Хойан');
  const candidates = api.catalogCandidates();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, 'danang-ba-na-hoian');
});

test('AI starts with location, can recover real catalog cards, and never renders the old request pseudo-card', () => {
  assert.match(ai, /Где вы сейчас или откуда планируете выезд/);
  assert.match(ai, /Я в Ханое/);
  assert.match(ai, /Ниньбинь/);
  assert.match(ai, /ensureRequestedCatalogCards/);
  assert.match(ai, /MaxTourCatalogCardV8 \|\| globalThis\.MaxTourCatalogCardV7/);
  assert.match(ai, /routeOk = destinations\.some/);
  assert.match(ai, /removeLegacyRequestCard/);
  assert.doesNotMatch(ai, /<article class="ai-recommendation ai-sales-card"/);
  assert.doesNotMatch(ai, /function renderRequestCard/);
});

test('empty/hidden recommendation groups are cleaned after geo filtering', () => {
  assert.match(ai, /cleanupEmptyResults/);
  assert.match(ai, /group\.hidden = cards\.every\(card => card\.hidden\)/);
  assert.match(ai, /CARD_SELECTOR/);
});

test('build ships live policy after trip actions and location guard after AI v5', () => {
  const trip = build.indexOf('/trip-actions.js');
  const policyIndex = build.indexOf('/trip-policy-live-v2.js');
  const aiV5 = build.indexOf('/ai-consultant-v5.js');
  const aiV6 = build.indexOf('/ai-location-guard-v6.js');
  const runtime = build.indexOf('/runtime-api.js');
  assert.ok(trip >= 0 && policyIndex > trip);
  assert.ok(aiV5 >= 0 && aiV6 > aiV5);
  assert.ok(runtime > aiV6);
});
