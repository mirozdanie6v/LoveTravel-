import test from 'node:test';
import assert from 'node:assert/strict';
import { _availabilityTest } from '../src/worker-r2.js';

const tour = {
  id: 'dalat-premium',
  title: 'Далат «Премиум»',
  group: {
    departures: [
      { date: '16 сен', time: '05:30', taken: 7, capacity: 18, status: 'собирается' },
    ],
  },
};

test('exact user phrasing uses deterministic tomorrow availability', () => {
  const now = new Date('2026-09-15T06:00:00Z');
  const result = _availabilityTest.availabilityReply('Есть Далат Премиум завтра на двоих?', [tour], now);
  assert.ok(result);
  assert.equal(result.tourId, 'dalat-premium');
  assert.match(result.reply, /05:30/);
  assert.match(result.reply, /11 мест/);
  assert.match(result.reply, /оформлен/i);
});

test('word-form parser understands two people', () => {
  assert.equal(_availabilityTest.requestedPeople('Есть завтра на двоих?'), 2);
});
