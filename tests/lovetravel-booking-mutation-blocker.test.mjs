import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const api=await readFile(resolve(root,'src/travel-transaction-api.js'),'utf8');

test('LoveTravel client hard-blocks provider booking mutations during UI restoration',()=>{
  const start=api.indexOf("if(action==='RESERVE'||action==='RECONCILE')");
  const unsupported=api.indexOf("unsupported_action",start);
  assert.ok(start>=0,'RESERVE/RECONCILE blocker must exist');
  assert.ok(unsupported>start,'mutation blocker must execute before unsupported action fallback');
  const block=api.slice(start,unsupported);
  assert.match(block,/booking_mutations_disabled/);
  assert.match(block,/423/);
  assert.doesNotMatch(block,/executeBookingSession/);
  assert.doesNotMatch(block,/demoInviteAllowed/);
});
