import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const js=await readFile(new URL('../src/ai-consultant-v5.js',import.meta.url),'utf8');

test('multilingual AI consultant script is syntactically valid',()=>{
  assert.doesNotThrow(()=>new vm.Script(js));
});

test('Chinese and Korean have native visible AI UI copy',()=>{
  assert.match(js,/zh:\{user:'您',assistant:'AI 顾问'/);
  assert.match(js,/ko:\{user:'회원',assistant:'AI 도우미'/);
  assert.match(js,/results:'适合您的行程'/);
  assert.match(js,/results:'추천 투어'/);
  assert.match(js,/details:'查看详情'/);
  assert.match(js,/details:'자세히 보기'/);
  assert.match(js,/book:'预订'/);
  assert.match(js,/book:'예약하기'/);
  assert.match(js,/placeholder:'输入消息…'/);
  assert.match(js,/placeholder:'메시지를 입력하세요\.\.\.'/);
});

test('AI render does not hardcode Russian customer-facing controls',()=>{
  assert.doesNotMatch(js,/class="ai-msg-author">AI-консультант</);
  assert.doesNotMatch(js,/class="ai-chat-results-label">Подходящие экскурсии</);
  assert.doesNotMatch(js,/>Подробнее<\/button>/);
  assert.doesNotMatch(js,/>Забронировать<\/button>/);
  assert.doesNotMatch(js,/>Очистить<\/button>/);
  assert.doesNotMatch(js,/placeholder="Напишите сообщение\.\.\."/);
  assert.match(js,/const t=ui\(\);/);
});

test('Korean and Chinese intent parsing covers dates party preferences and booking',()=>{
  assert.match(js,/오늘/);
  assert.match(js,/내일/);
  assert.match(js,/주말/);
  assert.match(js,/성인/);
  assert.match(js,/어린이/);
  assert.match(js,/유아/);
  assert.match(js,/예약/);
  assert.match(js,/바다/);
  assert.match(js,/자연/);
  assert.match(js,/今天/);
  assert.match(js,/明天/);
  assert.match(js,/成人/);
  assert.match(js,/儿童/);
  assert.match(js,/预订/);
});

test('booking bridge recognizes localized booking controls',()=>{
  assert.match(js,/data-lt-jump-booking/);
  assert.match(js,/book\|reserve/);
  assert.match(js,/예약/);
  assert.match(js,/预订/);
  assert.match(js,/Người lớn/);
  assert.match(js,/Adults/);
});
