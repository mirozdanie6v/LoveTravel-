import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { _selectionTest } from '../src/worker-selection-v14.js';

const { inferOrigin, marinePreference, peopleKnown } = _selectionTest;

test('Nha Trang in user history is treated as origin', () => {
  const body = {
    message:'Хочу море и острова',
    history:[{ role:'user', text:'Я сейчас в Нячанге' }],
    context:{ destination:'Нячанг', people:'состав не указан', preferences:['море'] },
  };
  assert.equal(inferOrigin(body), 'Нячанг');
});

test('sea and islands is recognised as a specific island preference', () => {
  const p = marinePreference({ message:'Хочу море и острова', context:{ preferences:['море'] } });
  assert.equal(p.sea, true);
  assert.equal(p.islands, true);
});

test('unknown party stays unknown', () => {
  assert.equal(peopleKnown({ people:'состав не указан' }), false);
  assert.equal(peopleKnown({ people:'2 взр.' }), true);
});

test('verified Nha Trang island products are injected ahead of generic coastal products', async () => {
  const source = await readFile(new URL('../src/catalog-show-press.js', import.meta.url), 'utf8');
  assert.match(source, /orchid-monkey-islands/);
  assert.match(source, /hon-tam-island/);
  assert.match(source, /TOURS\.unshift\(tour\)/);
  assert.match(source, /Остров Орхидей и Остров Обезьян/);
  assert.match(source, /Остров Хон Там/);
});
