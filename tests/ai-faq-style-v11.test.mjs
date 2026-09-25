import test from 'node:test';
import assert from 'node:assert/strict';
import { compactTourForAi, deterministicFaqReply } from '../src/ai-faq-knowledge.js';

const dalat = compactTourForAi({
  id:'dalat-premium',
  title:'Далат «Премиум»',
  city:'Нячанг',
  region:'Далат',
  time:'05:00–05:30 → около 20:00',
  activity:'средний',
  included:[
    'Вкусный обед',
    'Все входные билеты и канатная дорога',
    'Профессиональный русскоязычный гид',
    'Трансфер на комфортном микроавтобусе',
  ],
  take:['Кофту — в Далате прохладнее','Дождевик','Удобную обувь'],
  group:{
    from:'$52', adult:'$52', child:'$38', infant:'до 100 см бесплатно',
    notes:['Группа 14–20 человек','Русскоязычный гид и трансфер из отеля'],
    departures:[{ date:'16 сен', time:'05:30', taken:7, capacity:18, status:'собирается' }],
  },
  individual:{ from:'$420', tiers:['4 человека — $480'], notes:['Маршрут можно сделать комфортнее по темпу'] },
});

const catalog = [dalat];
const now = new Date('2026-09-15T05:00:00Z');

function repeat(question, assistantRole = 'assistant') {
  const first = deterministicFaqReply(question, catalog, { now, history:[] });
  const second = deterministicFaqReply(question, catalog, {
    now,
    history:[
      { role:'user', content:question },
      { role:assistantRole, content:first.reply },
    ],
  });
  return { first, second };
}

const awkwardContinuation = /(?:—|:)\s+(?:При|Если|Для|На|В|У|С|Завтра)(?=\s|[,:;.!?—-]|$)/u;

test('repeated FAQ wording changes while verified facts stay fixed', () => {
  const { first, second } = repeat('Можно оплатить депозит? И картой можно?');
  assert.equal(first.intent, 'payment');
  assert.equal(second.intent, 'payment');
  assert.notEqual(first.reply, second.reply);
  for (const answer of [first.reply, second.reply]) {
    assert.match(answer, /30%/);
    assert.match(answer, /100%/);
    assert.match(answer, /налич/i);
    assert.match(answer, /карт/i);
    assert.match(answer, /перевод/i);
    assert.doesNotMatch(answer, /если хотите|могу также/i);
    assert.doesNotMatch(answer, awkwardContinuation);
  }
});

test('legacy bot role is treated as assistant for repetition control', () => {
  const { first, second } = repeat('Можно оплатить депозит? И картой можно?', 'bot');
  assert.notEqual(first.reply, second.reply);
  assert.equal(second.styleVersion, 'faq-style-v11.2');
});

test('schedule can vary its speech form without changing time facts', () => {
  const { first, second } = repeat('Во сколько выезд и когда вернёмся с Далат Премиум?');
  assert.notEqual(first.reply, second.reply);
  for (const answer of [first.reply, second.reply]) {
    assert.match(answer, /05:00–05:30/);
    assert.match(answer, /около 20:00/);
  }
});

test('follow-up context and tour id survive style variation', () => {
  const history = [
    { role:'user', content:'Что входит в Далат Премиум?' },
    { role:'assistant', content:'В Далат «Премиум» включены обед, билеты, гид и трансфер.' },
  ];
  const answer = deterministicFaqReply('А гид русскоязычный?', catalog, { now, history });
  assert.equal(answer.intent, 'guide');
  assert.equal(answer.tourId, 'dalat-premium');
  assert.match(answer.reply, /русскоязыч/i);
  assert.equal(answer.styleVersion, 'faq-style-v11.2');
  assert.doesNotMatch(answer.reply, awkwardContinuation);
});

test('high-risk FAQ facts are unchanged across conversation turns', () => {
  const question = 'Если экскурсия завтра в 8:00, а я отменяю сейчас утром, сколько удержат?';
  const { first, second } = repeat(question);
  for (const answer of [first.reply, second.reply]) {
    assert.match(answer, /30%/);
    assert.match(answer, /100%/);
    assert.match(answer, /17:00/);
  }
});
