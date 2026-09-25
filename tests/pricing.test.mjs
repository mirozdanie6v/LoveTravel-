import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(root, 'src/booking-pricing.js'), 'utf8');
const context = { console };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: 'booking-pricing.js' });
const pricing = context.MaxTourBookingPricing;

const dalatPremium = {
  group: { from:'$52', adult:'$52', child:'$38', infant:'до 100 см бесплатно' },
  individual: { from:'$420', tiers:['1–2 человека — $420','3 человека — $450','4 человека — $480','5 человек — $510','6 человек — $540'] },
};

const nhatrangDay = {
  group: { from:'$35', adult:'$35', child:'$25', infant:'до 2 лет бесплатно' },
  individual: { from:'$180', tiers:['1–2 человека — $180','3–4 человека — $60 с человека','5–7 человек — $50 с человека','7–13 человек — $45 с человека'] },
};

const fastTrack = {
  group: { from:'—', adult:'не групповой формат', child:'—', infant:'—' },
  individual: { from:'$65', tiers:['2 человека — $65 за двоих','4 человека — $110 за четверых'] },
};

test('counts every traveler including free infants', () => {
  assert.equal(pricing.countPeople({ adults:2, children:1, infants:1 }), 4);
});

test('group total uses adult + child tariffs and counts free infant as a traveler only', () => {
  const booking = { adults:2, children:1, infants:1 };
  assert.equal(pricing.calculateTotal(dalatPremium, booking, 'group'), 142);
  assert.equal(pricing.countPeople(booking), 4);
});

test('individual fixed tiers use total party size', () => {
  assert.equal(pricing.calculateTotal(dalatPremium, { adults:2, children:1, infants:0 }, 'individual'), 450);
  assert.equal(pricing.calculateTotal(dalatPremium, { adults:4, children:1, infants:0 }, 'individual'), 510);
});

test('individual per-person tiers use the correct bracket instead of a hardcoded rate', () => {
  assert.equal(pricing.calculateTotal(nhatrangDay, { adults:4, children:0, infants:0 }, 'individual'), 240);
  assert.equal(pricing.calculateTotal(nhatrangDay, { adults:5, children:1, infants:0 }, 'individual'), 300);
  assert.equal(pricing.calculateTotal(nhatrangDay, { adults:7, children:0, infants:0 }, 'individual'), 350);
});

test('package capacities choose the nearest tier that fits the party', () => {
  assert.equal(pricing.calculateTotal(fastTrack, { adults:1, children:0, infants:0 }, 'individual'), 65);
  assert.equal(pricing.calculateTotal(fastTrack, { adults:3, children:0, infants:0 }, 'individual'), 110);
});

test('trip summary contains total people and composition', () => {
  assert.equal(pricing.formatPeopleSummary({ adults:2, children:1, infants:1 }), '4 человека · 2 взрослых + 1 ребёнок + 1 малыш');
});
