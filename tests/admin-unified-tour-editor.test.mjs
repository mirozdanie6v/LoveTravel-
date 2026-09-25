import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const editor = await readFile(resolve(root, 'src/admin-tour-media.js'), 'utf8');

test('tour editor is a single form and has no separate photo manager', () => {
  assert.match(editor, /id="unifiedTourForm"/);
  assert.match(editor, /Все поля заполняются обычным текстом, числами, списками и переключателями\. JSON не нужен\./);
  assert.match(editor, /name="imageFile" type="file"/);
  assert.match(editor, /area\('gallery','Фотографии галереи'/);
  assert.match(editor, /Сохранить все изменения/);
  assert.doesNotMatch(editor, /id="tourMediaManager"/);
  assert.doesNotMatch(editor, /Фото экскурсий<\/h2>/);
});

test('every visible editor field is human-readable and has filling guidance', () => {
  assert.match(editor, /unified-tour-label/);
  assert.match(editor, /unified-tour-hint/);
  assert.match(editor, /COMMON_HINTS/);
  assert.match(editor, /placeholder:'Обзорная экскурсия по Нячангу'/);
  assert.match(editor, /Каждый формат с новой строки/);
  assert.match(editor, /Каждый пункт программы с новой строки/);
  assert.match(editor, /Один адрес фотографии на строку/);
  assert.doesNotMatch(editor, /\(JSON\)/);
  assert.doesNotMatch(editor, /unified-tour-json/);
  assert.doesNotMatch(editor, /parseJsonField|parseJsonArray/);
});

test('schedules use normal controls instead of raw structured data', () => {
  for (const token of ['Дата выезда','Время отправления','Всего мест','Уже занято мест','Статус выезда','Добавить выезд']) {
    assert.match(editor, new RegExp(token));
  }
  assert.match(editor, /data-departure-field="date"/);
  assert.match(editor, /data-departure-field="capacity"/);
  assert.match(editor, /collectDepartures/);
});

test('uncommon catalog data is expanded to typed fields without asking the admin for JSON', () => {
  assert.match(editor, /renderExtraValue/);
  assert.match(editor, /humanizeKey/);
  assert.match(editor, /data-extra-kind="boolean"/);
  assert.match(editor, /data-extra-kind="number"/);
  assert.match(editor, /data-extra-kind="primitive-array"/);
  assert.match(editor, /Дополнительные параметры/);
  assert.match(editor, /формат JSON не требуется/);
});

test('catalog edit action is intercepted and the same save handles metadata and R2 cover upload', () => {
  assert.match(editor, /data-admin-action="edit-tour"/);
  assert.match(editor, /stopImmediatePropagation\(\)/);
  assert.match(editor, /\/api\/admin\/tours\/\$\{encodeURIComponent\(payload\.id\)\}/);
  assert.match(editor, /\/image`/);
  assert.match(editor, /method:'PUT'/);
  assert.match(editor, /method:'POST'/);
});
