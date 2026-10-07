import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const smoke=await readFile(resolve(root,'scripts/verify-live-booking-option-ui.mjs'),'utf8');

test('production booking smoke validates the restored pre-regression configurator contract',()=>{
  assert.match(smoke,/\.lt-option-card\[data-lt-rate\]/);
  assert.doesNotMatch(smoke,/\.lt-booking-option-card\[data-lt-rate\]/);
  assert.match(smoke,/\.lt-guest-row\[data-lt-guest-row\]/);
  assert.match(smoke,/constraints\?\.participants/);
  assert.match(smoke,/booking_mutations_disabled/);
  assert.match(smoke,/mutationBlock\.status===423/);
});
