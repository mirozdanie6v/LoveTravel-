import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const roleSwitch = await readFile(resolve(root, 'src/role-switch.js'), 'utf8');

test('public Mini App removes the internal role entry instead of rendering a role switcher', () => {
  assert.match(roleSwitch, /document\.querySelector\('\.admin-top'\)/);
  assert.match(roleSwitch, /adminButton\.remove\(\)/);
  assert.doesNotMatch(roleSwitch, /max-role-switch/);
  assert.doesNotMatch(roleSwitch, /Открыть кабинет администратора/);
  assert.doesNotMatch(roleSwitch, /Открыть кабинет директора/);
  assert.doesNotMatch(roleSwitch, /Турист/);
});
