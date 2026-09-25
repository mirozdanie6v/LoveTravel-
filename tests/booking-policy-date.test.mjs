import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(root, 'src/trip-policy-live-v2.js'), 'utf8');

function loadPolicy(state) {
  const dateInput = {
    value: '', min: '', max: '', readOnly: false, title: '',
    setAttribute() {}, removeAttribute(name) { if (name === 'max') this.max = ''; },
  };
  const context = {
    console,
    Date,
    Intl,
    state,
    demoTrips: [],
    startBooking() {},
    renderBooking() {},
    completePayment() {},
    renderTrips() {},
    setTimeout() { return 0; },
    setInterval() { return 0; },
    document: {
      getElementById() { return null; },
      createElement() { return { id:'', style:{}, classList:{ add() {} } }; },
      head: { appendChild() {} },
      querySelector(selector) { return selector.includes('input[type="date"]') ? dateInput : null; },
      querySelectorAll() { return []; },
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename:'trip-policy-live-v2.js' });
  return { context, api:context.MaxTourLivePolicy, dateInput };
}

test('selected group departure replaces stale prototype booking date', () => {
  const state = {
    format:'group',
    selectedDeparture:{ date:'18 сен', time:'05:30' },
    booking:{ date:'2026-09-14' },
  };
  const { api, dateInput } = loadPolicy(state);
  const now = new Date('2026-09-15T08:14:00Z');
  const synced = api.syncBookingDate(now);
  assert.equal(synced.date, '2026-09-18');
  assert.equal(synced.fixed, '2026-09-18');
  assert.equal(state.booking.date, '2026-09-18');

  api.enforceBookingDateInput(now);
  assert.equal(dateInput.value, '2026-09-18');
  assert.equal(dateInput.min, '2026-09-18');
  assert.equal(dateInput.max, '2026-09-18');
  assert.equal(dateInput.readOnly, true);
});

test('new individual booking cannot inherit a past prototype date', () => {
  const state = {
    format:'individual',
    selectedDeparture:null,
    booking:{ date:'2026-09-14' },
  };
  const { api } = loadPolicy(state);
  const synced = api.syncBookingDate(new Date('2026-09-15T08:14:00Z'));
  assert.equal(synced.today, '2026-09-15');
  assert.equal(synced.date, '2026-09-16');
  assert.equal(state.booking.date, '2026-09-16');
});

test('policy deadlines are calculated from the real excursion date in Vietnam time', () => {
  const state = { format:'individual', selectedDeparture:null, booking:{ date:'2026-09-18' } };
  const { api } = loadPolicy(state);
  const policy = api.livePolicy(
    { date:'2026-09-18', time:'05:30', total:'100' },
    new Date('2026-09-15T08:14:00Z'),
  );
  assert.equal(policy.valid, true);
  assert.equal(policy.departure.toISOString(), '2026-09-17T22:30:00.000Z');
  assert.equal(policy.cancelFree.toISOString(), '2026-09-15T22:30:00.000Z');
  assert.equal(policy.rescheduleFree.toISOString(), '2026-09-17T10:00:00.000Z');
});

test('booking flow has final synchronization before payment creation', () => {
  assert.match(source, /const previousStartBooking = startBooking/);
  assert.match(source, /const previousRenderBooking = renderBooking/);
  assert.match(source, /const previousCompletePayment = completePayment/);
  assert.match(source, /syncBookingDate\(new Date\(\)\)/);
});
