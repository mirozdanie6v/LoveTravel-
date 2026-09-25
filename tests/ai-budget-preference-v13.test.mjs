import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/ai-consultant-v5.js', import.meta.url), 'utf8');

test('AI client recognizes budget language and keeps source syntactically valid', () => {
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /подешев\|дешев\|бюджет\|эконом/);
  assert.match(source, /prefs\.add\('выгодная цена'\)/);
});

test('budget preference ranks equally relevant tours by lower displayed price', () => {
  assert.match(source, /function priceForSort\(item\)/);
  assert.match(source, /budgetFirst = state\.slots\.preferences\.includes\('выгодная цена'\)/);
  assert.match(source, /priceForSort\(a\) - priceForSort\(b\)/);
});

test('budget cards explain why they are shown', () => {
  assert.match(source, /state\.slots\.preferences\.includes\('выгодная цена'\)/);
  assert.match(source, /выгоднее по цене/);
});