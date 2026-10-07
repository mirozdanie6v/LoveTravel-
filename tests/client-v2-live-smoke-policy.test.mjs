import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile('.github/workflows/client-v2-preview.yml','utf8');
const smoke=await readFile('tests/e2e/client-v2-live-smoke.spec.mjs','utf8');

test('live preview gate is a short integration smoke, not detailed UX acceptance',()=>{
  assert.match(workflow,/Verify live Bókun API contract/);
  assert.match(workflow,/npm run test:client-v2:live/);
  assert.doesNotMatch(workflow,/Audit live Bókun content coverage/);
  assert.doesNotMatch(workflow,/integration\.viiversion\.com\/api\/bokun\/product/);
  assert.doesNotMatch(workflow,/трансфер доступен/i);
  assert.doesNotMatch(workflow,/rate-description/);
  assert.doesNotMatch(workflow,/\[data-locale=/);
  assert.doesNotMatch(workflow,/innerText\(/);
});

test('live browser smoke verifies only integration-critical mini-app surfaces',()=>{
  assert.match(smoke,/getByTestId\('bottom-nav'\)/);
  assert.match(smoke,/\.tour-card/);
  assert.match(smoke,/getByTestId\('departure-calendar'\)/);
  assert.match(smoke,/getByTestId\('tour-options'\)/);
  assert.match(smoke,/pageErrors/);
  assert.doesNotMatch(smoke,/tour-pickup/);
  assert.doesNotMatch(smoke,/tour-cancellation/);
  assert.doesNotMatch(smoke,/data-locale/);
  assert.doesNotMatch(smoke,/tour-program/);
  assert.doesNotMatch(smoke,/tour-photos/);
});
