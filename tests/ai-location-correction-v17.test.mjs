import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = await readFile(resolve('src/ai-explicit-tour-v16.js'), 'utf8');
const marker = '\n(() => {\n  \'use strict\';\n\n  const locationTest = globalThis.MaxTourAI?._locationTest;';
const index = source.lastIndexOf(marker);
assert.ok(index >= 0, 'location correction overlay must exist');
const correctionSource = source.slice(index + 1);

const canonicalPlaces = ['Нячанг','Ханой','Ниньбинь','Халонг','Далат','Дананг','Хойан','Фукуок','Муйне/Фантьет','Фуйен'];
const placeFrom = value => canonicalPlaces.find(place => String(value || '').toLocaleLowerCase('ru-RU').includes(place.toLocaleLowerCase('ru-RU'))) || '';
const placesFrom = value => canonicalPlaces.filter(place => String(value || '').toLocaleLowerCase('ru-RU').includes(place.toLocaleLowerCase('ru-RU')));
const calls = [];
const listeners = new Map();
const context = {
  console,
  document: {
    addEventListener(type, fn) { listeners.set(type, fn); },
  },
};
context.globalThis = context;
context.MaxTourAI = {
  _locationTest: {
    inspectInput(value) { calls.push(value); },
    placeFrom,
    placesFrom,
  },
};
vm.runInNewContext(correctionSource, context);
const api = context.MaxTourAiLocationCorrectionV17;

test('understands exact reported correction: Нет выезд из ханоя', () => {
  assert.equal(api.correctionTarget('Нет выезд из ханоя'), 'Ханой');
});

test('understands contrast correction: не Фукуок, а Ханой', () => {
  assert.equal(api.correctionTarget('Не Фукуок, а Ханой'), 'Ханой');
});

test('understands clarification wording', () => {
  assert.equal(api.correctionTarget('Точнее Ханой'), 'Ханой');
  assert.equal(api.correctionTarget('Я имела в виду Дананг'), 'Дананг');
});

test('normalizes Russian genitive place forms', () => {
  assert.match(api.normalizeRussianCases('из Ханоя, из Фукуока, из Дананга'), /Ханой/);
  assert.match(api.normalizeRussianCases('из Ханоя, из Фукуока, из Дананга'), /Фукуок/);
  assert.match(api.normalizeRussianCases('из Ханоя, из Фукуока, из Дананга'), /Дананг/);
});

test('applies correction to the existing location state machine', () => {
  calls.length = 0;
  assert.equal(api.applyCorrection('Нет выезд из ханоя'), 'Ханой');
  assert.deepEqual(calls, ['выезд из Ханой']);
});
