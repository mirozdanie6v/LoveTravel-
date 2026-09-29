import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const build=await readFile(resolve(root,'build.mjs'),'utf8');

test('first paint HTML contains only LoveTravel shell before any JavaScript executes',()=>{
  const htmlMatch=build.match(/const html = `([\s\S]*?)`;/);
  assert.ok(htmlMatch,'standalone HTML template missing');
  const html=htmlMatch[1];
  for(const forbidden of [
    'MaxTour','MAX TOUR','Max Tour','Ваш лучший отдых во Вьетнаме',
    'Дананг','Фукуок','Ханой','Далат','Муйне',
    'Мои поездки','ИИ-Помощник','bookingScreen','aiScreen','tripsScreen'
  ]) assert.equal(html.includes(forbidden),false,forbidden);
  assert.match(html,/Nha Trang Love Travel/);
  assert.match(html,/id="homeScreen"/);
  assert.match(html,/id="catalogScreen"/);
  assert.match(html,/id="tourScreen"/);
  assert.match(html,/data-screen="home"/);
  assert.match(html,/data-screen="catalog"/);
});

test('first paint does not depend on a delayed branding overlay to replace a legacy page',()=>{
  assert.doesNotMatch(build,/prototypeRaw|prototypeHtml|replaceBrandLogos|replaceLegacyAdmin|catalog\.v28/);
  assert.match(build,/lovetravel-shell\.css/);
  assert.match(build,/lovetravel-shell\.js/);
});
