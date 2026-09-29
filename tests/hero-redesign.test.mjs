import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const js = await readFile(resolve(root, 'src/hero-redesign.js'), 'utf8');
const css = await readFile(resolve(root, 'src/hero-redesign.css'), 'utf8');
const build = await readFile(resolve(root, 'build.mjs'), 'utf8');

test('hero redesign preserves working navigation actions', () => {
  assert.match(js, /quick\('city'/);
  assert.match(js, /showScreen\('catalog'\)/);
  assert.match(js, /showScreen\('ai'\)/);
});

test('hero redesign has requested destinations and premium copy', () => {
  for (const label of ['Нячанг','Дананг','Фукуок','Муйне\/Фантьет']) assert.match(js, new RegExp(label));
  assert.match(js, /Ваш лучший отдых/);
  assert.match(js, /во Вьетнаме/);
  assert.match(js, /VIETNAM/);
});

test('hero uses Lucide inline SVG system and glass layout', () => {
  assert.match(js, /class="lucide"/);
  assert.match(js, /stroke-width="2"/);
  assert.match(js, /plane:/);
  assert.match(js, /sparkles:/);
  assert.match(css, /backdrop-filter:blur/);
  assert.match(css, /hero-lux__destinations/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.hero-lux__content\{[^}]*margin-top:28px[^}]*\}/);
  assert.match(css, /\.hero-lux__content h1\{[^}]*transform:translateY\(10px\)[^}]*\}/);
  assert.match(css, /\.hero-lux__content p\{[^}]*transform:translateY\(10px\)[^}]*\}/);
  assert.match(css, /\.hero-lux__actions\{[^}]*display:flex[^}]*flex-direction:column[^}]*margin:74px auto 0[^}]*\}/);
  assert.match(css, /\.hero-lux__cta\{[^}]*width:100%[^}]*\}/);
  assert.ok(js.indexOf('hero-lux__cta--primary') < js.indexOf('hero-lux__cta--glass'));
  assert.match(css, /hero-lux__cta--primary/);
});

test('build ships hero assets without touching compressed v28 source', () => {
  assert.match(build, /hero-redesign\.css/);
  assert.match(build, /hero-redesign\.js/);
  assert.match(build, /exact source checksums verified/);
});
