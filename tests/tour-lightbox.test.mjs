import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const script = await readFile(resolve(root, 'src/tour-lightbox.js'), 'utf8');
const css = await readFile(resolve(root, 'src/tour-lightbox.css'), 'utf8');
const build = await readFile(resolve(root, 'build.mjs'), 'utf8');

test('tour lightbox script is syntactically valid and targets R2 tour images', () => {
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /MEDIA_PREFIX = '\/tour-media\/'/);
  assert.match(script, /catalog\.v28\.json/);
  assert.match(script, /cache: 'no-store'/);
  assert.match(script, /ArrowLeft/);
  assert.match(script, /ArrowRight/);
  assert.match(script, /touchstart/);
  assert.match(script, /touchend/);
});

test('tour lightbox keeps a persistent gallery rail and does not recursively reopen modal images', () => {
  assert.match(script, /tour-lightbox__thumbs/);
  assert.match(script, /data-lightbox-index/);
  assert.match(script, /renderThumbnails/);
  assert.match(script, /aria-selected/);
  assert.match(script, /scrollIntoView/);
  assert.match(script, /modal\?\.contains\(image\)/);
  assert.match(script, /openSequence/);
  assert.match(css, /\.tour-lightbox__thumbs\s*\{/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /\.tour-lightbox__thumb\.is-active/);
});

test('tour lightbox has full-screen mobile UI and close controls', () => {
  assert.match(css, /\.tour-lightbox\s*\{/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /100dvh/);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(script, /data-lightbox-close/);
  assert.match(script, /aria-modal/);
});

test('customer UI prevents unsafe word splitting and centers action labels without forcing layouts', () => {
  assert.match(css, /body \*/);
  assert.match(css, /hyphens:\s*none\s*!important/);
  assert.match(css, /word-break:\s*normal\s*!important/);
  assert.match(css, /overflow-wrap:\s*normal\s*!important/);
  assert.match(css, /overflow-wrap:\s*anywhere\s*!important/);
  assert.match(css, /\[role='button'\]/);
  assert.match(css, /text-align:\s*center\s*!important/);
  assert.match(css, /justify-content:\s*center\s*!important/);
  assert.match(css, /\.hero-lux__cta > span:nth-child\(2\)/);
  assert.doesNotMatch(css, /body\s+button[^\{]*\{[^\}]*display:\s*(?:flex|grid)\s*!important/s);
});

test('standalone build publishes lightbox assets', () => {
  assert.match(build, /tour-lightbox\.css/);
  assert.match(build, /tour-lightbox\.js/);
  assert.match(build, /copyFile\(resolve\(root, 'src\/tour-lightbox\.css'/);
  assert.match(build, /copyFile\(resolve\(root, 'src\/tour-lightbox\.js'/);
});
