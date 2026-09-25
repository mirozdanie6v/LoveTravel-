import test from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../src/ai-primary-intent-guard-v30.js';

const city = {
  id:'nhatrang-day', title:'Обзорная экскурсия по Нячангу', city:'Нячанг', region:'Нячанг',
  category:'Городские экскурсии', tags:['город','культура','достопримечательности'], route:['Нячанг'], popular:true,
};
const islandA = {
  id:'orchid-monkey', title:'Остров Орхидей и Остров Обезьян', city:'Нячанг', region:'Нячанг',
  category:'Море и острова', tags:['море','острова','пляж'], route:['Нячанг'], popular:true,
};
const islandB = {
  id:'hon-tam', title:'Остров Хон Там', city:'Нячанг', region:'Нячанг',
  category:'Море и острова', tags:['море','остров','пляж'], route:['Нячанг'], popular:false,
};

test('explicit islands phrase is a primary islands intent', () => {
  assert.equal(_test.classifyPrimaryTheme('Хочу на острова'), 'islands');
  assert.equal(_test.classifyPrimaryTheme('Море и острова'), 'islands');
  assert.equal(_test.classifyPrimaryTheme('Обзор города'), 'city');
});

test('city overview cannot satisfy islands intent', () => {
  assert.equal(_test.tourMatchesTheme(city, 'islands'), false);
  assert.equal(_test.tourMatchesTheme(islandA, 'islands'), true);
});

test('stale Nha Trang overview is replaced with a real island product', () => {
  const payload = {
    ok:true,
    reply:'Подходит обзорная экскурсия по Нячангу.',
    source:'ai-orchestrator-v29-model',
    tourId:'nhatrang-day',
    tourIds:['nhatrang-day'],
    nextStep:'ask_date',
    memory:{ origin:'Нячанг', preferences:['город и культура','море и острова'], selectedTourId:'nhatrang-day' },
  };
  const result = _test.applyThemeGuardPayload(payload, [city, islandA, islandB], 'islands', 'Нячанг');
  assert.equal(result.changed, true);
  assert.notEqual(result.payload.tourId, 'nhatrang-day');
  assert.ok(['orchid-monkey','hon-tam'].includes(result.payload.tourId));
  assert.ok(result.payload.tourIds.every(id => id !== 'nhatrang-day'));
  assert.deepEqual(result.payload.memory.preferences.filter(value => /город/i.test(value)), []);
  assert.ok(result.payload.memory.preferences.some(value => /море и острова/i.test(value)));
});

test('current valid island selection is preserved', () => {
  const payload = {
    ok:true,
    reply:'Покажу островные варианты.',
    source:'ai-orchestrator-v29-model',
    tourId:'hon-tam',
    tourIds:['hon-tam','orchid-monkey'],
    nextStep:'ask_date',
    memory:{ origin:'Нячанг', preferences:['море и острова'], selectedTourId:'hon-tam' },
  };
  const result = _test.applyThemeGuardPayload(payload, [city, islandA, islandB], 'islands', 'Нячанг');
  assert.equal(result.payload.tourId, 'hon-tam');
  assert.ok(result.payload.tourIds.every(id => id !== 'nhatrang-day'));
});
