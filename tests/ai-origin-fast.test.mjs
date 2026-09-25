import test from 'node:test';
import assert from 'node:assert/strict';
import { _availabilityTest } from '../src/worker-r2.js';

const { originReply } = _availabilityTest;

test('origin fast path understands Russian city cases', () => {
  assert.match(originReply('Я в Нячанге'), /выезд из Нячанга/i);
  assert.match(originReply('Мы сейчас в Ханое'), /выезд из Ханоя/i);
  assert.match(originReply('Я в Дананге'), /выезд из Дананга/i);
  assert.match(originReply('Я на Фукуоке'), /Фукуоке/i);
});

test('origin fast path understands explicit departure wording', () => {
  assert.match(originReply('Выезд из Нячанга'), /выезд из Нячанга/i);
  assert.match(originReply('Старт из Ханоя'), /выезд из Ханоя/i);
});

test('destination-only request is not mistaken for current origin', () => {
  assert.equal(originReply('Хочу экскурсию в Далат из Нячанга'), 'Хорошо, выезд из Нячанга. Могу подобрать острова, Нячанг, Далат, Фуйен и другие доступные маршруты.');
  assert.equal(originReply('Хочу в Нячанг'), '');
});
