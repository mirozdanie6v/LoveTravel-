import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const js=await readFile(new URL('../src/ai-consultant-v5.js',import.meta.url),'utf8');
const zh=await readFile(new URL('../src/locales/zh-CN.js',import.meta.url),'utf8');
const ko=await readFile(new URL('../src/locales/ko-KR.js',import.meta.url),'utf8');

test('multilingual AI consultant script is syntactically valid',()=>{
  assert.doesNotThrow(()=>new vm.Script(js));
});

test('Chinese and Korean visible AI UI copy lives in uniform semantic bundles',()=>{
  assert.match(zh,/"ai\.user": "您"/);
  assert.match(zh,/"ai\.assistant": "AI 顾问"/);
  assert.match(zh,/"ai\.results": "适合您的行程"/);
  assert.match(zh,/"ai\.details": "查看详情"/);
  assert.match(zh,/"ai\.book": "预订"/);
  assert.match(ko,/"ai\.user": "회원"/);
  assert.match(ko,/"ai\.assistant": "AI 도우미"/);
  assert.match(ko,/"ai\.results": "추천 투어"/);
  assert.match(ko,/"ai\.details": "자세히 보기"/);
  assert.match(ko,/"ai\.book": "예약하기"/);
  assert.match(js,/LoveTravelI18n/);
  assert.match(js,/'ai\.'\+key/);
});

test('AI render contains no hardcoded customer-facing Russian controls',()=>{
  assert.doesNotMatch(js,/class="ai-msg-author">AI-консультант/);
  assert.doesNotMatch(js,/>Подробнее<\/button>/);
  assert.doesNotMatch(js,/>Забронировать<\/button>/);
  assert.doesNotMatch(js,/placeholder="Напишите сообщение/);
  assert.match(js,/const t=ui\(\);/);
});

test('Korean and Chinese intent parsing covers dates party preferences and booking',()=>{
  for(const token of ['오늘','내일','성인','어린이','예약','바다','자연','今天','明天','成人','儿童','预订']) {
    assert.ok(js.includes(token),token);
  }
});

test('booking handoff uses structured LoveTravel booking API instead of localized DOM text matching',()=>{
  assert.match(js,/LoveTravelBookingConfigurator/);
  assert.match(js,/api\.prefill/);
  assert.doesNotMatch(js,/bookingPattern/);
  assert.doesNotMatch(js,/smallestCounterRow/);
});


test('semantic AI client mounts independently of legacy AI patches',()=>{
  assert.match(js,/function installAiScreenHook\(\)/);
  assert.match(js,/globalThis\.renderAI=wrapped/);
  assert.match(js,/globalThis\.showScreen=wrapped/);
  assert.match(js,/queueMicrotask\(mountCurrentAi\)/);
});
