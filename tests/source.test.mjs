import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const sourceDir = resolve(root,'source');
const manifest = JSON.parse(await readFile(resolve(sourceDir,'manifest.json'),'utf8'));
async function restore(entry){
  const b64=(await Promise.all(entry.parts.map(p=>readFile(resolve(sourceDir,p),'ascii')))).join('');
  const raw=gunzipSync(Buffer.from(b64,'base64'));
  assert.equal(raw.length,entry.size_bytes);
  assert.equal(createHash('sha256').update(raw).digest('hex'),entry.sha256);
  return raw;
}
const html = (await restore(manifest.html)).toString('utf8');
const catalog = JSON.parse((await restore(manifest.catalog)).toString('utf8'));
const runtime = await readFile(resolve(root,'src/runtime-api.js'),'utf8');
const ai = await readFile(resolve(root,'src/ai-consultant.js'),'utf8');
const aiCss = await readFile(resolve(root,'src/ai-consultant.css'),'utf8');
await import('../src/ai-consultant.js?source-test');
const adminHtml = await readFile(resolve(root,'src/admin-v3.html'),'utf8');
const adminApp = await readFile(resolve(root,'src/admin-app.js'),'utf8');
const directorHtml = await readFile(resolve(root,'src/director-v3.html'),'utf8');
const buildScript = await readFile(resolve(root,'build.mjs'),'utf8');

test('exact supplied v28 sources restore by checksum', () => {
  assert.equal(manifest.html.sha256,'be7cceb157e1169f869ad11ead32bdc012f076d7aeddf5a36adf10fe25ca9472');
  assert.equal(manifest.catalog.sha256,'fc380915d882e9ed27b55a957c86dbba5dbcedb2e8be4892593b1bb5a427c1d4');
});

test('v28 source identity markers are present', () => {
  assert.match(html, /MaxTour Mini App Prototype v28/);
  for (const fn of ['renderHome','renderCatalog','renderTour','renderBooking','renderTrips','renderAdmin']) assert.match(html,new RegExp(`function ${fn}\\(`));
});

test('canonical v28 catalog is complete', () => {
  assert.equal(catalog.length,15);
  assert.ok(catalog.every(t=>t.id&&t.title&&t.city));
  assert.ok(catalog.some(t=>t.id==='dalat-premium'));
});

test('traveler flow remains exactly in prototype source', () => {
  assert.match(html,/ФИО и дата рождения обязательны для каждого участника/);
  assert.match(html,/Основной путешественник/);
  assert.match(html,/Попутчики/);
  assert.match(html,/function validateTravelers\(/);
});

test('runtime adds persistence without replacing visual renderers', () => {
  assert.match(runtime,/\/api\/bootstrap/);
  assert.match(runtime,/persistTrip/);
  assert.match(runtime,/original\.renderCatalog/);
  assert.doesNotMatch(runtime,/Ваш лучший отдых во Вьетнаме/);
});

test('AI consultant is a simple customer-facing chat with optional saved selection', () => {
  assert.match(runtime, /MaxTourAI\?\.mount/);
  for (const slot of ['adults', 'children', 'infants', 'tripType', 'date', 'preferences', 'contact']) assert.match(ai, new RegExp(slot));
  assert.match(ai, /\/api\/consultations/);
  assert.match(ai, /Сохранить подбор/);
  assert.match(ai, /Я AI-консультант, задайте мне любые вопросы/);
  assert.match(ai, /ai-chat-subtitle/);
  assert.match(ai, /data-ai-action="show-contact"/);
  assert.match(ai, /recommendationReason/);
  assert.match(ai, /role="log"/);
  assert.match(ai, /renderQuickReplies\(quick\)/);
  assert.match(ai, /ai-chat-below/);
  assert.match(ai, /renderQuickReplies\(quick\).*renderRecommendations\(\)/s);
  assert.match(ai, /Очистить/);
  assert.doesNotMatch(ai, /ai-progress|ai-consultant-brief|ai-consultant-intro|Персональный подбор|заполнено/);
  assert.doesNotMatch(ai, /менеджер|передать/iu);
  assert.match(ai, /answerQuestion/);
  assert.match(aiCss, /\.ai-messages\{[\s\S]*overflow:visible/);
  assert.doesNotMatch(aiCss, /overscroll-behavior-y:contain/);
  assert.match(ai, /\/api\/ai\/chat/);
  assert.match(ai, /Подбираю подходящий ответ/);
  assert.match(ai, /dollarLabel/);
  assert.match(ai, /ai-party/);
  assert.match(aiCss, /\.ai-consultant-input\{[\s\S]*position:sticky/);
  assert.match(aiCss, /bottom:calc\(var\(--nav,76px\)/);
  assert.match(aiCss, /overflow:visible/);
  assert.match(aiCss, /min-height:44px/);
  assert.match(ai, /event\.key !== 'Enter'/);
  assert.match(ai, /wasAtContentEnd/);
  assert.match(ai, /scrollToEnd/);
  assert.match(ai, /data-ai-action="hide-contact"/);
  assert.match(ai, /conversation:state\.messages/);
});

test('AI consultant parser does not turn child age into a budget', () => {
  assert.equal(globalThis.MaxTourAI._test.parseBudget('ребёнок до 3 лет'), '');
  assert.equal(globalThis.MaxTourAI._test.parseBudget('бюджет до $600'), '600');
  assert.equal(globalThis.MaxTourAI._test.parseBudget('примерно 600 долларов'), '600');
});

test('AI consultant keeps the entered party composition for recommendations', () => {
  const parseParty = globalThis.MaxTourAI._test.parseParty;
  assert.deepEqual(parseParty('3 человека'), { adults:3, children:[], infants:0 });
  assert.deepEqual(parseParty('2 взрослых и ребёнок 7 лет'), { adults:2, children:[7], infants:0 });
  assert.deepEqual(parseParty('семья из 4 человек: 2 взрослых, дети 7 и 10 лет'), { adults:2, children:[7,10], infants:0 });
});

test('customer interactions preserve mobile input and allow removing a companion', async () => {
  assert.match(runtime, /installCatalogSearchFix/);
  assert.match(runtime, /setSelectionRange/);
  const profile = await readFile(resolve(root, 'src/traveler-profile.js'), 'utf8');
  assert.match(profile, /async function removeTraveler/);
  assert.match(profile, /profile-delete-button/);
});

test('customer-facing copy hides implementation details', () => {
  assert.doesNotMatch(ai, /рабочей CRM|в рабочей версии CRM|CRM|D1|AI\s*[·•]\s*demo|бриф/iu);
  assert.doesNotMatch(runtime, /CRM|D1|demo-(?:интерфейс|рассылка)|платёжной интеграции/iu);
  assert.doesNotMatch(adminHtml, /CRM-профили|back-office|Создать заказ в D1/iu);
  assert.doesNotMatch(adminApp, /CRM\s*[·:]|по данным D1|из D1|сохраняются в (?:CRM|D1)|master-source|AI-лид|AI-заяв/iu);
  assert.doesNotMatch(directorHtml, /<span>CRM<\/span>|demo CRM|demo D1|Фактический слой CRM|Пришли в CRM|AI-copilot|data-toast="Демо:/iu);
  assert.match(buildScript, /cleanCustomerCopy/);
});
