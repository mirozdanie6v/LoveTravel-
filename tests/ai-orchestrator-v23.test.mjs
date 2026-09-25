import test from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../src/ai-orchestrator-v23.js';

const tour = (id, title, city, tags = [], group = null, individual = null) => ({
  id, title, city, region:city, tags, audience:[], route:[], group, individual, childrenOk:true,
});

test('explicit origin corrections override previous city', () => {
  let memory = { origin:'Фукуок', destination:'', pickup:'', preferences:[], adults:0, children:[], infants:0, date:'', dateFlexible:false, format:'', selectedTourId:'', lastTourIds:[], lastAssistant:'', turn:0 };
  memory = _test.absorbMessage(memory, 'Нет, выезд из Нячанга');
  assert.equal(memory.origin, 'Нячанг');
  assert.equal(memory.destination, '');
});

test('Oceanus preserves Nha Trang as origin', () => {
  let memory = { origin:'Нячанг', destination:'', pickup:'', preferences:[], adults:2, children:[], infants:0, date:'', dateFlexible:false, format:'', selectedTourId:'', lastTourIds:[], lastAssistant:'', turn:0 };
  memory = _test.absorbMessage(memory, 'Из отеля Oceanus');
  assert.equal(memory.origin, 'Нячанг');
  assert.equal(memory.pickup, 'Oceanus');
});

test('islands answer advances to date when party is known', () => {
  let memory = { origin:'Нячанг', destination:'', pickup:'', preferences:[], adults:2, children:[], infants:0, date:'', dateFlexible:false, format:'', selectedTourId:'', lastTourIds:[], lastAssistant:'', turn:0 };
  memory = _test.absorbMessage(memory, 'Острова');
  assert.ok(memory.preferences.some(value => /море|остров/i.test(value)));
  const candidates = [tour('islands', 'Остров Орхидей и Остров Обезьян', 'Нячанг', ['море','острова'], { adult:'$36', departures:[] })];
  assert.equal(_test.nextStep(memory, null, candidates, null), 'ask_date');
});

test('known fields are not asked again', () => {
  const memory = { origin:'Нячанг', preferences:['море и острова'], adults:2, children:[], infants:0, date:'2026-09-18' };
  assert.equal(_test.asksKnownField('Откуда вы планируете ехать?', memory), true);
  assert.equal(_test.asksKnownField('Сколько вас будет?', memory), true);
  assert.equal(_test.asksKnownField('На какой день планируете поездку?', memory), true);
  assert.equal(_test.asksKnownField('Какой островной вариант вам показать подробнее?', memory), false);
});

test('group departure without published date requires manager confirmation', () => {
  const memory = { origin:'Нячанг', preferences:['море и острова'], adults:2, children:[], infants:0, date:'2026-09-18', dateFlexible:false, format:'group', selectedTourId:'hon-tam' };
  const selected = tour('hon-tam', 'Остров Хон Там', 'Нячанг', ['море','острова'], { adult:'$45', departures:[] });
  const availability = _test.availabilityFor(selected, memory, '2026-09-16');
  assert.equal(availability.confirmed, false);
  assert.equal(_test.nextStep(memory, selected, [selected], availability), 'request_group_confirmation');
  assert.match(_test.fallbackReply('request_group_confirmation', memory, [selected], selected, null, availability), /подтвердит выезд.*оплат/iu);
});

test('island tours outrank generic sea tours for island intent', () => {
  const memory = { origin:'Нячанг', destination:'', preferences:['море и острова'], adults:2, children:[], infants:0, date:'', dateFlexible:false, format:'', selectedTourId:'' };
  const catalog = [
    tour('phu-yen', 'Провинция Фуйен', 'Нячанг', ['море','природа'], { adult:'$40' }),
    tour('hon-tam', 'Остров Хон Там', 'Нячанг', ['море','острова'], { adult:'$45' }),
    tour('orchid', 'Остров Орхидей и Остров Обезьян', 'Нячанг', ['море','острова'], { adult:'$36' }),
  ];
  const result = _test.candidateTours(catalog, memory);
  assert.deepEqual(result.slice(0, 2).map(item => item.id).sort(), ['hon-tam','orchid'].sort());
});
