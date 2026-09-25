import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const network = await readFile(resolve(root, 'src/ai-network-guard-v8.js'), 'utf8');
const departure = await readFile(resolve(root, 'src/tour-departure-live-v3.js'), 'utf8');
const build = await readFile(resolve(root, 'build.mjs'), 'utf8');

test('AI network guard is valid JS and aborts only AI chat after a bounded wait', () => {
  new vm.Script(network);
  assert.match(network, /const TIMEOUT_MS = 8000/);
  assert.match(network, /url\.pathname === '\/api\/ai\/chat'/);
  assert.match(network, /AbortController/);
  assert.match(network, /controller\.abort/);
});

test('live departure guard hides past dates, blocks full departures and marks AI target', () => {
  new vm.Script(departure);
  assert.match(departure, /iso < today/);
  assert.match(departure, /liveDepartureState = 'past'/);
  assert.match(departure, /liveDepartureState = 'full'/);
  assert.match(departure, /button\.disabled = true/);
  assert.match(departure, /ai-target-departure-v3/);
  assert.match(departure, /targetDate && iso === targetDate/);
});

test('AI booking handoff clears the legacy observer intent before native booking and reapplies party/date once', () => {
  new vm.Script(departure);
  const clearAt = departure.indexOf('sessionStorage.removeItem(BOOKING_INTENT_KEY)');
  const joinAt = departure.indexOf("typeof joinDeparture === 'function'");
  assert.ok(clearAt >= 0 && joinAt > clearAt);
  assert.match(departure, /handoffAiBooking/);
  assert.match(departure, /root\.addEventListener\('click',[\s\S]*true\)/);
  assert.match(departure, /state\.booking\.date = targetDate/);
  assert.match(departure, /state\.booking\[key\] = value/);
  assert.match(departure, /renderBooking\(\)/);
  assert.match(departure, /dateInput\.min = today/);
});

test('build loads network guard before AI client and departure guard after card parity', () => {
  const networkAt = build.indexOf('/ai-network-guard-v8.js');
  const aiAt = build.indexOf('/ai-consultant-v5.js');
  const cardAt = build.indexOf('/ai-catalog-card-v7.js');
  const departureAt = build.indexOf('/tour-departure-live-v3.js');
  assert.ok(networkAt >= 0 && networkAt < aiAt);
  assert.ok(cardAt >= 0 && cardAt < departureAt);
  assert.match(build, /copyFile\(resolve\(root, 'src\/ai-network-guard-v8\.js'/);
  assert.match(build, /copyFile\(resolve\(root, 'src\/tour-departure-live-v3\.js'/);
});
