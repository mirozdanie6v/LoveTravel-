import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [script, css, build] = await Promise.all([
  readFile(resolve(root, 'src/catalog-show-press.js'), 'utf8'),
  readFile(resolve(root, 'src/catalog-show-press.css'), 'utf8'),
  readFile(resolve(root, 'build.mjs'), 'utf8'),
]);

test('catalog filter press script parses and targets exact Show and Reset labels', () => {
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /'Показать'/);
  assert.match(script, /'Сбросить'/);
  assert.match(script, /new Set/);
  assert.match(script, /HTMLButtonElement/);
  assert.match(script, /pointerdown/);
  assert.match(script, /pointerup/);
  assert.match(script, /catalog-show-pressed/);
  assert.doesNotMatch(script, /preventDefault\s*\(/);
  assert.doesNotMatch(script, /stopPropagation\s*\(/);
});

test('individual price patch covers home tour cards and catalog wide cards', () => {
  assert.match(script, /\.tour-card \.price-row > div/);
  assert.match(script, /\.wide-card \.price-row > div/);
  assert.match(script, /PRICE_BOX_SELECTOR/);
  assert.match(script, /\.mini, \.price-label/);
  assert.match(script, /\.price, \.price-value/);
  assert.match(script, /\^индивидуальный\\s\+от\$/i);
  assert.match(script, /label\.textContent = 'индивидуальный'/);
  assert.match(script, /catalog-price-row/);
  assert.match(script, /catalog-price-from/);
  assert.match(script, /catalog-price-amount/);
  assert.match(script, /row\.append\(from, amount\)/);
  assert.match(script, /replaceChildren\(row\)/);
  assert.match(script, /setProperty\('display', 'inline-flex', 'important'\)/);
  assert.match(script, /setProperty\('flex-wrap', 'nowrap', 'important'\)/);
  assert.match(script, /setProperty\('white-space', 'nowrap', 'important'\)/);
  assert.match(script, /setProperty\('width', 'max-content', 'important'\)/);
  assert.match(script, /catalog-individual-price-inline/);
  assert.match(script, /individualFromInline/);
  assert.doesNotMatch(script, /const CATALOG = '#catalog-tours'/);
});

test('individual price CSS enforces one physical row on home and catalog cards', () => {
  assert.match(css, /\.tour-card \.price\.catalog-individual-price-inline/);
  assert.match(css, /\.wide-card \.price\.catalog-individual-price-inline/);
  assert.match(css, /\.tour-card \.price \.catalog-price-row/);
  assert.match(css, /\.wide-card \.price \.catalog-price-row/);
  assert.match(css, /flex-direction:\s*row\s*!important/);
  assert.match(css, /flex-wrap:\s*nowrap\s*!important/);
  assert.match(css, /width:\s*max-content\s*!important/);
  assert.match(css, /white-space:\s*nowrap\s*!important/);
  assert.match(css, /catalog-price-from/);
  assert.match(css, /catalog-price-amount/);
});

test('catalog filter press CSS provides visible tactile feedback', () => {
  assert.match(css, /\.catalog-show-press:active/);
  assert.match(css, /translate:\s*0 3px/);
  assert.match(css, /scale:\s*0\.965/);
  assert.match(css, /brightness\(0\.82\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test('build publishes catalog filter press assets', () => {
  assert.match(build, /catalog-show-press\.css/);
  assert.match(build, /catalog-show-press\.js/);
  assert.match(build, /copyFile\(resolve\(root, 'src\/catalog-show-press\.css'\)/);
  assert.match(build, /copyFile\(resolve\(root, 'src\/catalog-show-press\.js'\)/);
});
