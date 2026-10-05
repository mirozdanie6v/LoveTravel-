import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ai = await readFile(resolve(root, 'src/ai-consultant-v5.js'), 'utf8');
const css = await readFile(resolve(root, 'src/ai-consultant-v5.css'), 'utf8');
const build = await readFile(resolve(root, 'build.mjs'), 'utf8');
const ru = await readFile(resolve(root, 'src/locales/ru-RU.js'), 'utf8');
const worker = await import('../src/worker-profile.js?ai-sales-v5-test');

test('AI consultant v5 source is syntactically valid and wired into build', () => {
  assert.doesNotThrow(() => new vm.Script(ai));
  assert.match(build, /ai-consultant-v5\.js\?v=26/);
  assert.match(build, /ai-consultant-v5\.css/);
  assert.match(build, /copyFile\(resolve\(root, 'src\/ai-consultant-v5\.js'/);
});

test('AI booking handoff calls the structured booking configurator API', async () => {
  const calls=[];
  const context={
    console,Date,Intl,TOURS:[],
    sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    document:{documentElement:{},querySelector(){return null;}},
    setTimeout(){return 0;},
    LoveTravelI18n:{
      apiLocale(){return 'ru';}, locale(){return 'ru-RU';},
      t(key){return key;}, formatDate(v){return v;}
    },
    LoveTravelBookingConfigurator:{
      async prefill(intent){calls.push(intent); return true;}
    }
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(ai,context,{filename:'ai-consultant-v5.js'});
  const intent={tourId:'1287578',date:'2026-10-07',adults:2,children:[],infants:0};
  assert.equal(context.MaxTourAI._test.prefillBooking(intent),true);
  await Promise.resolve();
  assert.equal(calls.length,1);
  assert.equal(calls[0].tourId,'1287578');
  assert.equal(calls[0].open,true);
});

test('AI recommendations render visual excursion cards with semantic direct booking action', () => {
  assert.match(ai, /class="ai-tour-image"/);
  assert.match(ai, /data-ai-action="open-tour"/);
  assert.match(ai, /data-ai-action="book-tour"/);
  assert.match(ai, /BOOKING_INTENT_KEY/);
  assert.match(ai, /continueToBooking/);
  assert.match(ai, /prefillBooking/);
  assert.match(ru, /"ai\.book": "Забронировать"/);
  assert.match(css, /\.ai-sales-card/);
  assert.match(css, /\.ai-card-actions/);
});

test('AI can recommend before every guided slot is filled and quick replies are localized by keys', () => {
  assert.match(ai, /isDiscoveryIntent\(text\) \|\| signals >= 2/);
  assert.match(ai, /t\.quickSeaValue/);
  assert.match(ai, /t\.quickViewsValue/);
  assert.match(ru, /"ai\.quickSeaValue": "Хочу море и острова"/);
});

test('AI uses Vietnam date and semantic past-date copy', () => {
  assert.match(ai, /Asia\/Ho_Chi_Minh/);
  assert.match(ai, /'ai\.date\.past'/);
  assert.match(ru, /"ai\.date\.past": "Эта дата уже прошла/);
  assert.equal(worker._test.containsPastDate('Есть выезд 13 сентября 2026', '2026-09-14'), true);
  assert.equal(worker._test.containsPastDate('Есть выезд 15 сентября 2026', '2026-09-14'), false);
});
