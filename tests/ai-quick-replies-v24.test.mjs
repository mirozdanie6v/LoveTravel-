import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = await readFile(resolve(import.meta.dirname, '../src/catalog-show-press.js'), 'utf8');
const css = await readFile(resolve(import.meta.dirname, '../src/ai-consultant.css'), 'utf8');

test('AI quick replies use document-level delegated activation', () => {
  assert.match(source, /MaxTourAiQuickRepliesV24/);
  assert.match(source, /#aiScreen \.ai-quick-replies \[data-ai-action="quick"\]/);
  assert.match(source, /document\.addEventListener\('pointerup'/);
  assert.match(source, /document\.addEventListener\('click'/);
  assert.match(source, /form\.requestSubmit\(\)/);
});

test('AI quick replies stay interactive above sticky/overlay layers', () => {
  assert.match(css, /#aiScreen \.ai-quick-replies\{[\s\S]*z-index:6;[\s\S]*pointer-events:auto;/);
  assert.match(css, /#aiScreen \.ai-quick-replies button\{[\s\S]*pointer-events:auto;[\s\S]*touch-action:manipulation;/);
});
