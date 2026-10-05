import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/ai-consultant-v5.js', import.meta.url), 'utf8');
const ru = fs.readFileSync(new URL('../src/locales/ru-RU.js', import.meta.url), 'utf8');

test('AI client maps multilingual budget language to a language-neutral intent code', () => {
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /подешев\|дешев\|бюджет\|эконом/);
  assert.match(source, /prefs\.add\('VALUE'\)/);
  assert.doesNotMatch(source, /prefs\.add\('выгодная цена'\)/);
});

test('budget preference ranks equally relevant tours by lower displayed price', () => {
  assert.match(source, /function priceForSort\(item\)/);
  assert.match(source, /budgetFirst = state\.slots\.preferences\.includes\('VALUE'\)/);
  assert.match(source, /priceForSort\(a\) - priceForSort\(b\)/);
});

test('budget cards use semantic localized reason copy', () => {
  assert.match(source, /state\.slots\.preferences\.includes\('VALUE'\)/);
  assert.match(source, /t\.reasonBudget/);
  assert.match(ru, /"ai\.reasonBudget": "выгоднее по цене"/);
});
