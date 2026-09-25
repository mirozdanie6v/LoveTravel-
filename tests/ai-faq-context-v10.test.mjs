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
  included:['Профессиональный русскоязычный гид','Трансфер на комфортном микроавтобусе'],
  group:{ notes:['Группа 14–20 человек','Русскоязычный гид и трансфер из отеля'] },
  individual:{ from:'$420', notes:['Маршрут можно сделать комфортнее по темпу'] },
});

const catalog = [dalat];

test('short FAQ follow-up keeps tour from recent conversation history', () => {
  const r = deterministicFaqReply('А гид русскоязычный?', catalog, {
    history:[
      { role:'user', text:'Что входит в Далат Премиум?' },
      { role:'bot', text:'В Далат «Премиум» включены обед, билеты и гид.' },
    ],
  });
  assert.equal(r.intent, 'guide');
  assert.equal(r.tourId, 'dalat-premium');
  assert.match(r.reply, /Далат «Премиум»/);
  assert.match(r.reply, /русскоязыч/i);
  assert.doesNotMatch(r.reply, /зависит от экскурсии/i);
  assert.equal(r.styleVersion, 'faq-style-v11.2');
});

test('senior answer is grammatical, grounded and does not make a medical guarantee', () => {
  const r = deterministicFaqReply('Маме 72 года. Далат Премиум ей подойдёт или будет тяжело?', catalog);
  assert.equal(r.intent, 'senior_load');
  assert.match(r.reply, /Уровень нагрузки — средний|уровень нагрузки — средний/);
  assert.match(r.reply, /05:00–05:30/);
  assert.match(r.reply, /по одному возрасту нельзя сказать/i);
  assert.doesNotMatch(r.reply, /нагрузка — средний/i);
  assert.doesNotMatch(r.reply, /точно подойд|безопасно|противопоказ/i);
});
