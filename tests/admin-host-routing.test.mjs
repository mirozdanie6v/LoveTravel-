import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [worker, wrangler] = await Promise.all([
  readFile(resolve(root, 'src/worker-r2.js'), 'utf8'),
  readFile(resolve(root, 'wrangler.jsonc'), 'utf8'),
]);

test('dedicated admin host exposes only admin/director surfaces', () => {
  assert.match(worker, /const ADMIN_HOST = 'max-tour-demo-admin\.viiversion\.com'/);
  assert.match(worker, /pathname === '\/'/);
  assert.match(worker, /new URL\('\/admin\/', url\)/);
  assert.match(worker, /pathname\.startsWith\('\/admin\/'\)/);
  assert.match(worker, /pathname\.startsWith\('\/director\/'\)/);
  assert.match(worker, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /status: 404/);
});

test('all asset requests run through Worker so admin host cannot fall through to Mini App SPA', () => {
  assert.match(wrangler, /"run_worker_first"\s*:\s*true/);
  assert.doesNotMatch(wrangler, /"run_worker_first"\s*:\s*\[/);
});

test('tourist role is physically removed only from dedicated admin host cabinet HTML', () => {
  assert.match(worker, /const ADMIN_TOURIST_ROLE_PATTERN/);
  assert.match(worker, /Открыть кабинет туриста/);
  assert.match(worker, /Турист/);
  assert.match(worker, /html\.replace\(ADMIN_TOURIST_ROLE_PATTERN, ''\)/);
  assert.match(worker, /if \(url\.hostname !== ADMIN_HOST\) return response/);
  assert.match(worker, /url\.pathname\.startsWith\('\/admin'\)/);
  assert.match(worker, /url\.pathname\.startsWith\('\/director'\)/);
  assert.match(worker, /return filterAdminHostRoles\(response, url\)/);
});

test('main mini app host still uses the normal unfiltered profile worker response', () => {
  assert.match(worker, /const response = await profileWorker\.fetch\(request, env, ctx\)/);
  assert.match(worker, /if \(url\.hostname !== ADMIN_HOST\) return response/);
});
