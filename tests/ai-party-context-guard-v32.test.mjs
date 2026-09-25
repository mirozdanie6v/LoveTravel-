import test from 'node:test';
import assert from 'node:assert/strict';
import {
  partyQuestion,
  standalonePartyCount,
  normalizePartyCountBody,
} from '../src/ai-party-context-guard-v32.js';

test('recognizes party-size questions', () => {
  assert.equal(partyQuestion('Сколько человек едет? Если будут дети, укажите возраст — это влияет на цену.'), true);
  assert.equal(partyQuestion('Вы вдвоём или компанией?'), true);
  assert.equal(partyQuestion('На какую дату хотите поехать?'), false);
});

test('recognizes standalone party counts but not arbitrary numbers', () => {
  assert.equal(standalonePartyCount('5'), 5);
  assert.equal(standalonePartyCount('5 человек'), 5);
  assert.equal(standalonePartyCount('пять'), 5);
  assert.equal(standalonePartyCount('31'), 0);
  assert.equal(standalonePartyCount('5 сентября'), 0);
});

test('normalizes a bare numeric reply only after a party question', () => {
  const input = {
    message:'5',
    history:[
      { role:'bot', text:'Сколько человек едет? Если будут дети, укажите возраст — это влияет на цену.' },
      { role:'user', text:'5' },
      { role:'bot', text:'Подбираю…' },
    ],
    context:{ people:'состав не указан' },
  };
  const result = normalizePartyCountBody(input);
  assert.equal(result.normalized, true);
  assert.equal(result.count, 5);
  assert.equal(result.body.message, 'Нас 5 взрослых');
  assert.equal(result.body.context.people, '5 взрослых');
  assert.equal(result.body.history[1].text, 'Нас 5 взрослых');
});

test('does not treat a bare number as party size after a date question', () => {
  const result = normalizePartyCountBody({
    message:'5',
    history:[{ role:'assistant', text:'На какую дату хотите поехать?' }],
    context:{},
  });
  assert.equal(result.normalized, false);
});
