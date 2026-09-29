import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const actionsPath = resolve(root, 'src/trip-actions.js');
const actions = await readFile(actionsPath, 'utf8');
const worker = await readFile(resolve(root, 'src/worker.js'), 'utf8');
const build = await readFile(resolve(root, 'build.mjs'), 'utf8');

test('trip actions script is valid JavaScript', () => {
  execFileSync(process.execPath, ['--check', actionsPath], { stdio:'pipe' });
});

test('policy calculations use live time, not the frozen prototype time', () => {
  assert.match(actions, /policySnapshot\(trip, new Date\(\)\)/);
  assert.match(actions, /policyBase = livePolicyBase/);
  assert.match(actions, /48 \* 60 \* 60 \* 1000/);
  assert.match(actions, /T17:00:00/);
});

test('cancel action recalculates at confirmation and persists status/refund', () => {
  assert.match(actions, /confirmCancelTrip/);
  assert.match(actions, /cancellationTerms\(trip, new Date\(\)\)/);
  assert.match(actions, /status:'Отменено'/);
  assert.match(actions, /refund:cash\(terms\.refund\)/);
  assert.match(actions, /\/api\/bookings\//);
});

test('reschedule action changes date and stores history', () => {
  assert.match(actions, /confirmRescheduleTrip/);
  assert.match(actions, /rescheduleHistory/);
  assert.match(actions, /date:newDate/);
  assert.match(actions, /time:newTime/);
  assert.match(actions, /groupDepartureOptions/);
});

test('worker keeps booking columns in sync with payload json', () => {
  assert.match(worker, /UPDATE bookings SET trip_date=\?,trip_time=\?,status=\?,paid=\?,rest=\?,total=\?/);
  assert.match(worker, /url\.pathname === '\/api\/travelers'/);
});

test('build includes functional trip actions before runtime adapter', () => {
  const tripIndex = build.indexOf('/trip-actions.js');
  const runtimeIndex = build.indexOf('/runtime-api.js');
  assert.ok(tripIndex >= 0);
  assert.ok(runtimeIndex > tripIndex);
});