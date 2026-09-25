import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(root, 'src/ai-consultant-v5.js'), 'utf8');

function boot() {
  const store = new Map();
  const context = {
    console,
    Intl,
    Date,
    JSON,
    Math,
    String,
    Number,
    Array,
    Object,
    RegExp,
    Set,
    sessionStorage: {
      getItem:key => store.has(key) ? store.get(key) : null,
      setItem:(key, value) => store.set(key, String(value)),
      removeItem:key => store.delete(key),
    },
    document: { documentElement:{} },
    MutationObserver: class { observe() {} },
    TOURS: [{
      id:'dalat-premium',
      title:'Далат Премиум',
      city:'Далат',
      region:'Далат',
      category:'Экскурсия',
      tags:['природа'],
      audience:[],
      popular:true,
      group:{ adult:'$75', from:'$75', departures:[] },
      individual:{ from:'$350' },
    }],
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, store, api:context.MaxTourAI._test };
}

test('client understands Russian collective party form "на двоих" for booking handoff', () => {
  const { api } = boot();
  const party = api.parseParty('Есть Далат Премиум завтра на двоих?', { adults:0, children:[], infants:0 });
  assert.equal(party.adults, 2);
  assert.deepEqual(Array.from(party.children), []);
  assert.equal(party.infants, 0);
});

test('verified server tour id resolves to the exact catalog tour card model', () => {
  const { api } = boot();
  const item = api.recommendationForTourId('dalat-premium');
  assert.equal(item?.tour?.id, 'dalat-premium');
  assert.equal(api.applyServerTour({ tourId:'dalat-premium' }), true);
});

test('server metadata is preserved and applied after the AI response', () => {
  assert.match(source, /tourId:clean\(result\.tourId,120\)/);
  assert.match(source, /faqIntent:clean\(result\.faqIntent,120\)/);
  assert.match(source, /applyServerTour\(result\)/);
});

test('exact server tour cannot bypass the location guard', () => {
  const { context, store, api } = boot();
  store.set('max-tour-ai-location-v6', JSON.stringify({ origin:'Ханой' }));
  context.MaxTourAI._locationTest = {
    tourPlacesFromTour:() => ['Далат'],
    allowed:(origin, destination) => origin === 'Нячанг' && destination === 'Далат',
  };
  assert.equal(api.locationAllowsTour(context.TOURS[0]), false);
  assert.equal(api.recommendationForTourId('dalat-premium'), null);
});
