import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ai = await readFile(resolve(root, 'src/ai-consultant-v5.js'), 'utf8');
const css = await readFile(resolve(root, 'src/ai-consultant-v5.css'), 'utf8');
const build = await readFile(resolve(root, 'build.mjs'), 'utf8');
const worker = await import('../src/worker-profile.js?ai-sales-v5-test');

test('AI consultant v5 source is syntactically valid and wired into build', () => {
  assert.doesNotThrow(() => new vm.Script(ai));
  assert.match(build, /ai-consultant-v5\.js\?v=26/);
  assert.match(build, /ai-consultant-v5\.css/);
  assert.match(build, /copyFile\(resolve\(root, 'src\/ai-consultant-v5\.js'/);
});

test('AI booking prefill ignores hidden checkout and does not redispatch an unchanged date', () => {
  const events = [];
  let bookingActive = false;
  const dateInput = {
    value:'2026-09-17',
    min:'',
    dispatchEvent(event) { events.push(event.type); },
  };
  const bookingRoot = {
    id:'bookingScreen',
    classList:{ contains(name) { return name === 'active' && bookingActive; } },
    querySelector(selector) { return selector === 'input[type="date"]' ? dateInput : null; },
    querySelectorAll() { return []; },
  };
  const storage = new Map();
  const context = {
    console,
    Date,
    Intl,
    TOURS:[],
    Event:class { constructor(type) { this.type = type; } },
    MutationObserver:class { observe() {} },
    sessionStorage:{
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); },
    },
    document:{
      documentElement:{},
      getElementById(id) { return id === 'bookingScreen' ? bookingRoot : null; },
      querySelector() { return null; },
    },
    setTimeout() { return 0; },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(ai, context, { filename:'ai-consultant-v5.js' });

  const intent = { tourId:'fuyen', date:'2026-09-17', adults:2, children:[], infants:0 };
  assert.equal(context.MaxTourAI._test.prefillBooking(intent), false);
  bookingActive = true;
  assert.equal(context.MaxTourAI._test.prefillBooking(intent), true);
  assert.deepEqual(events, []);

  assert.equal(context.MaxTourAI._test.dispatchValue(dateInput, '2026-09-18'), true);
  assert.equal(dateInput.value, '2026-09-18');
  assert.deepEqual(events, ['input', 'change']);
  assert.equal(context.MaxTourAI._test.dispatchValue(dateInput, '2026-09-18'), false);
  assert.deepEqual(events, ['input', 'change']);
});

test('AI recommendations render visual excursion cards with direct booking action', () => {
  assert.match(ai, /class="ai-tour-image"/);
  assert.match(ai, /data-ai-action="open-tour"/);
  assert.match(ai, /data-ai-action="book-tour"/);
  assert.match(ai, />Забронировать</);
  assert.match(ai, /BOOKING_INTENT_KEY/);
  assert.match(ai, /continueToBooking/);
  assert.match(ai, /prefillBooking/);
  assert.match(css, /\.ai-sales-card/);
  assert.match(css, /\.ai-card-actions/);
});

test('AI can recommend before every guided slot is filled', () => {
  assert.match(ai, /isDiscoveryIntent\(text\) \|\| signals >= 2/);
  assert.match(ai, /Хочу море и острова/);
  assert.match(ai, /Хочу природу и красивые виды/);
});

test('AI uses Vietnam date and rejects past calendar dates', () => {
  assert.match(ai, /Asia\/Ho_Chi_Minh/);
  assert.match(ai, /Эта дата уже прошла/);
  assert.equal(worker._test.containsPastDate('Есть выезд 13 сентября 2026', '2026-09-14'), true);
  assert.equal(worker._test.containsPastDate('Есть выезд 15 сентября 2026', '2026-09-14'), false);
  assert.equal(worker._test.containsPastDate('Есть выезд 2026-09-13', '2026-09-14'), true);
  assert.equal(worker._test.containsPastDate('Есть выезд 2026-09-15', '2026-09-14'), false);
});
