import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = await readFile(resolve(import.meta.dirname, '../src/ai-booking-bridge-v25.js'), 'utf8');

test('AI booking bridge prefers the exact departure selected by date quick reply', () => {
  assert.match(source, /const targetDate = isIsoDate\(intent\?\.date\)/);
  assert.match(source, /dataset\?\.departureIso[^\n]+targetDate/);
  assert.match(source, /продолжить бронирование/);
  assert.match(source, /if \(!targetCard\) return null/);
});

test('AI booking bridge does not silently fall back to another group date', () => {
  assert.match(source, /if \(targetDate && departureCards\.length\)/);
  assert.match(source, /return buttons\.find\(button => button\.closest\('\.depart-card'\) === targetCard\) \|\| null/);
  const guardedBranch = source.slice(source.indexOf('if (targetDate && departureCards.length)'), source.indexOf('return buttons[0] || null;'));
  assert.match(guardedBranch, /if \(!targetCard\) return null/);
  assert.doesNotMatch(guardedBranch, /buttons\[0\]/);
});

test('AI date is re-applied after the legacy booking screen opens', () => {
  assert.match(source, /continueOnceToBooking\(intent, attempt = 0\)/);
  assert.match(source, /if \(bookingScreenVisible\(\)\) \{[\s\S]*applyIntentToBooking\(intent\)/);
  assert.match(source, /MaxTourDepartureLiveV3\.applyIntentToBooking\(intent, intent\.date\)/);
  assert.match(source, /state\.booking\.date = intent\.date/);
  assert.match(source, /input\.value = intent\.date/);
});
