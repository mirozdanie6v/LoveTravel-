import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const sourceDir = resolve(root, 'source');
const manifest = JSON.parse(await readFile(resolve(sourceDir, 'manifest.json'), 'utf8'));
const v7 = await readFile(resolve(root, 'src/ai-catalog-card-v7.js'), 'utf8');
const css = await readFile(resolve(root, 'src/ai-consultant-v5.css'), 'utf8');
const build = await readFile(resolve(root, 'build.mjs'), 'utf8');

async function restore(entry) {
  const encoded = (await Promise.all(entry.parts.map(part => readFile(resolve(sourceDir, part), 'ascii')))).join('');
  return gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
}

const prototypeHtml = await restore(manifest.html);

test('catalog card parity layer is syntactically valid and loaded after geo routing', () => {
  assert.doesNotThrow(() => new vm.Script(v7));
  const geoIndex = build.indexOf('/ai-location-guard-v6.js');
  const parityIndex = build.indexOf('/ai-catalog-card-v7.js');
  assert.ok(geoIndex >= 0 && parityIndex > geoIndex);
  assert.match(build, /copyFile\(resolve\(root, 'src\/ai-catalog-card-v7\.js'/);
});

test('AI reuses native tour-card and strips AI-specific card layout classes', () => {
  assert.match(v7, /document\.querySelectorAll\('\.tour-card'\)/);
  assert.match(v7, /renderCatalog/);
  assert.match(v7, /cloneNode\(true\)/);
  assert.match(v7, /dataset\.aiCatalogSource = 'catalog'/);
  assert.match(v7, /classList\.remove\('ai-recommendation', 'ai-sales-card'\)/);
  assert.match(v7, /createCatalogCard/);
  assert.doesNotMatch(v7, /classList\.add\('ai-sales-card'/);
  assert.doesNotMatch(v7, /<article class="ai-recommendation ai-sales-card"/);
});

test('native catalog click behavior remains the interaction contract', () => {
  assert.match(prototypeHtml, /function renderCatalog\(/);
  const catalogStart = prototypeHtml.indexOf('function renderCatalog(');
  const catalogSlice = prototypeHtml.slice(catalogStart, catalogStart + 50000);
  assert.match(catalogSlice, /tour-card/);
  assert.match(catalogSlice, /openTour/);
  assert.match(v7, /tourIdFromCard/);
  assert.match(v7, /BOOKING_INTENT_KEY/);
  assert.match(v7, /rememberBookingIntent/);
});

test('legacy AI card CSS cannot override cloned native catalog cards', () => {
  assert.match(css, /\.ai-recommendation\.ai-sales-card/);
  assert.doesNotMatch(css, /#aiScreen \.ai-sales-card\s*\{/);
  assert.match(css, />\.tour-card\.ai-catalog-card-v7/);
});

test('parity API can inject a real catalog card for route-policy recovery', () => {
  assert.match(v7, /function createCatalogCard\(/);
  assert.match(v7, /globalThis\.MaxTourCatalogCardV7 = api/);
  assert.match(v7, /globalThis\.MaxTourCatalogCardV8 = api/);
  assert.match(v7, /dataset\.aiCatalogInjected/);
});

test('observer is idempotent and avoids character-data render loops', () => {
  assert.match(v7, /aiCatalogV7Observed/);
  assert.match(v7, /requestAnimationFrame\(run\)/);
  assert.match(v7, /observer\.observe\(aiRoot, \{ childList:true, subtree:true \}\)/);
  assert.doesNotMatch(v7, /characterData:true/);
  assert.match(v7, /\.ai-recommendation\.ai-sales-card\[data-tour-id\]/);
});
