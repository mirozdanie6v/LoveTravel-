import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const profile = await readFile(resolve(root, 'src/traveler-profile.js'), 'utf8');
const worker = await readFile(resolve(root, 'src/worker-profile.js'), 'utf8');
const r2Worker = await readFile(resolve(root, 'src/worker-r2.js'), 'utf8');
const build = await readFile(resolve(root, 'build.mjs'), 'utf8');
const wrangler = await readFile(resolve(root, 'wrangler.jsonc'), 'utf8');

test('personal cabinet exposes traveler editing', () => {
  assert.match(profile, /Основной путешественник/);
  assert.match(profile, /Попутчики/);
  assert.match(profile, /onclick="beginTravelerEdit/);
  assert.match(profile, /saveTravelerEdit/);
  assert.match(profile, /Сохранить/);
  assert.match(profile, /async function removeTraveler/);
  assert.match(profile, /profile-delete-button/);
});

test('booking FIO field exposes saved traveler picker', () => {
  assert.match(profile, /Выбрать из сохранённых/);
  assert.match(profile, /onfocus="openSavedTravelerPicker/);
  assert.match(profile, /useSavedTraveler/);
  assert.match(profile, /Этот путешественник уже выбран в заявке/);
  assert.match(profile, /grid-template-columns:1fr;gap:8px;overflow:visible/);
});

test('traveler directory normalizes to one primary traveler', () => {
  assert.match(profile, /clean\.forEach\(\(t, index\) =>/);
  assert.match(profile, /t\.primary = index === primaryIndex/);
  assert.match(worker, /normalizeTravelers/);
  assert.match(worker, /t\.primary = index === primaryIndex/);
});

test('traveler edits persist through dedicated D1 API', () => {
  assert.match(profile, /fetch\('\/api\/travelers'/);
  assert.match(worker, /url\.pathname === '\/api\/travelers'/);
  assert.match(worker, /DELETE FROM travelers WHERE session_id=\?/);
  assert.match(worker, /INSERT INTO travelers/);
});

test('standalone bundle includes profile layer and R2 worker wrapper', () => {
  assert.match(build, /traveler-profile\.js/);
  assert.match(wrangler, /\.\/src\/worker-r2\.js/);
  assert.match(wrangler, /"binding": "TOUR_MEDIA"/);
  assert.match(r2Worker, /import profileWorker from '\.\/worker-profile\.js'/);
  assert.match(r2Worker, /url\.pathname\.startsWith\('\/tour-media\/'\)/);
  assert.match(r2Worker, /env\.TOUR_MEDIA/);
});
