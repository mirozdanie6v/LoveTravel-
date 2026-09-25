(() => {
  'use strict';

  // Historical filename kept for compatibility. This module is the single
  // editor for every tour field, including photos and uncommon catalog data.
  const state = { csrf:'', tours:[], loading:false, loaded:false };

  const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const lines = value => String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  const textLines = value => Array.isArray(value) ? value.filter(value => value !== null && value !== undefined && value !== '').join('\n') : String(value || '');
  const toNumber = value => {
    const raw = String(value ?? '').trim().replace(',', '.');
    if (!raw) return undefined;
    const result = Number(raw);
    return Number.isFinite(result) ? result : undefined;
  };
  const clone = value => {
    try { return structuredClone(value); } catch (_) {
      try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
    }
  };

  const TOP_LEVEL_FIELDS = new Set([
    'id','title','city','location','region','category','duration','time','type','types','format','formatsLabel',
    'priceLabel','price','priceFrom','priceFromUsd','capacity','maxPeople','published','childrenOk','popular',
    'image','fallbackImage','gallery','tags','searchText','description','subtitle','program','included','notIncluded',
    'excluded','whatToTake','recommendations','group','individual',
  ]);
  const GROUP_FIELDS = new Set(['from','adult','child','infant','deposit','notes','departures']);
  const INDIVIDUAL_FIELDS = new Set(['from','adult','child','infant','deposit','notes','tiers','departures']);
  const DEPARTURE_FIELDS = new Set(['date','time','capacity','taken','status']);

  const LABELS = {
    id:'Служебный код экскурсии', title:'Название экскурсии', city:'Город отправления', location:'Локация', region:'Регион / направление',
    category:'Категория', duration:'Продолжительность', time:'Время экскурсии', type:'Формат', types:'Форматы', format:'Формат',
    formatsLabel:'Подпись формата для клиента', priceLabel:'Подпись цены', price:'Цена', priceFrom:'Цена от', priceFromUsd:'Цена от, USD',
    capacity:'Максимум участников', maxPeople:'Максимум участников', published:'Показывать клиентам', childrenOk:'Подходит детям',
    popular:'Отметка «Популярное»', tags:'Теги', searchText:'Ключевые слова для поиска', description:'Описание', subtitle:'Короткий подзаголовок',
    program:'Программа экскурсии', included:'Что включено', notIncluded:'Что не включено', excluded:'Что не включено',
    whatToTake:'Что взять с собой', recommendations:'Рекомендации', image:'Главное фото', fallbackImage:'Резервное фото', gallery:'Галерея',
    from:'Цена от', adult:'Цена для взрослого', child:'Цена для ребёнка', infant:'Цена для младенца', deposit:'Условия оплаты',
    notes:'Примечания', departures:'Расписание выездов', tiers:'Тарифы по количеству участников', date:'Дата выезда', status:'Статус',
    taken:'Уже занято мест', minPeople:'Минимум участников', min:'Минимум', max:'Максимум', age:'Возраст', ages:'Возрастные правила',
    height:'Рост', heightCm:'Рост, см', minHeight:'Минимальный рост', maxHeight:'Максимальный рост', meetingPoint:'Место встречи',
    pickup:'Трансфер / место посадки', transfer:'Трансфер', language:'Язык', languages:'Языки', guide:'Гид', transport:'Транспорт',
    meal:'Питание', meals:'Питание', lunch:'Обед', cancellation:'Отмена', cancellationPolicy:'Правила отмены',
    bookingNotice:'Срок предварительного бронирования', notice:'Примечание', currency:'Валюта', currencyCode:'Валюта',
    source:'Источник данных', provider:'Поставщик / партнёр', route:'Маршрут', highlights:'Главные особенности',
    audience:'Для кого подходит', restrictions:'Ограничения', requirements:'Требования', pickupZones:'Зоны трансфера',
    startTime:'Время начала', endTime:'Время окончания', weekdays:'Дни недели', days:'Дни', schedule:'Расписание',
  };

  const WORDS = {
    min:'минимум', max:'максимум', people:'участников', person:'участник', persons:'участников', price:'цена', prices:'цены',
    adult:'взрослый', adults:'взрослые', child:'ребёнок', children:'дети', infant:'младенец', infants:'младенцы',
    age:'возраст', ages:'возраст', height:'рост', capacity:'вместимость', status:'статус', date:'дата', time:'время',
    start:'начало', end:'окончание', duration:'продолжительность', transfer:'трансфер', pickup:'посадка', zone:'зона', zones:'зоны',
    booking:'бронирование', notice:'срок бронирования', cancellation:'отмена', policy:'правила', guide:'гид', meal:'питание',
    route:'маршрут', language:'язык', languages:'языки', source:'источник', provider:'поставщик', note:'примечание', notes:'примечания',
    included:'включено', excluded:'не включено', required:'обязательно', optional:'необязательно', available:'доступно',
    weekday:'день недели', weekdays:'дни недели', schedule:'расписание', deposit:'оплата', amount:'сумма', percent:'процент',
    label:'подпись', title:'название', description:'описание', value:'значение', values:'значения', enabled:'включено',
  };

  const COMMON_HINTS = {
    id:'Используется системой. Для существующей экскурсии код менять не нужно.',
    title:'Так название увидит клиент в каталоге и карточке экскурсии.',
    city:'Например: Нячанг. Укажите город, откуда начинается экскурсия.',
    region:'Например: Далат, острова Нячанга, Муйне.',
    category:'Например: Обзорные, Морские, Природа, Семейные.',
    duration:'Например: 1 день или 4 часа.',
    time:'Например: 07:00 → 18:00. Если время плавающее, напишите это обычным текстом.',
    formatsLabel:'Короткая фраза для карточки, например: групповой / индивидуальный.',
    capacity:'Максимальное количество туристов, которых можно принять на один выезд.',
    priceFromUsd:'Число без знака валюты. Например: 45.',
    priceLabel:'Текст, который увидит клиент. Например: от $45 или $36 взрослый / $28 ребёнок.',
    typesText:'Каждый формат с новой строки. Например: групповой и индивидуальный.',
    groupFrom:'Минимальная стоимость группового варианта, например: $36.',
    groupAdult:'Полная цена для одного взрослого, например: $36.',
    groupChild:'Цена для ребёнка. Если зависит от роста или возраста, укажите правило текстом.',
    groupInfant:'Например: до 2 лет бесплатно.',
    groupDeposit:'Например: 30% или 100%.',
    groupNotes:'Каждое условие с новой строки. Например: обед включён.',
    individualFrom:'Минимальная стоимость индивидуальной экскурсии.',
    individualDeposit:'Например: 30% или 100%.',
    individualTiers:'Каждый тариф с новой строки. Например: 1–2 человека — $350.',
    individualNotes:'Каждое условие с новой строки.',
    description:'Основной продающий текст экскурсии. Можно писать несколькими абзацами.',
    subtitle:'Короткое дополнение под названием экскурсии.',
    program:'Каждый пункт программы с новой строки в порядке прохождения.',
    included:'Каждая включённая услуга с новой строки.',
    notIncluded:'Каждая услуга, которую клиент оплачивает отдельно, с новой строки.',
    whatToTake:'Каждая рекомендация с новой строки: купальник, головной убор, паспорт и т. п.',
    recommendations:'Полезные советы клиенту перед поездкой, по одному на строку.',
    tags:'По одному слову или короткой фразе на строку. Используются для подбора и фильтров.',
    searchText:'Слова и фразы, по которым консультант и поиск должны находить экскурсию.',
    image:'Служебный адрес текущего главного фото. Обычно его не нужно менять вручную — проще загрузить файл ниже.',
    gallery:'Один адрес фотографии на строку. Первая фотография обычно показывается раньше остальных.',
  };

  function injectStyles() {
    if (document.getElementById('unifiedTourEditorStyles')) return;
    const style = document.createElement('style');
    style.id = 'unifiedTourEditorStyles';
    style.textContent = `
      .unified-tour-form{display:grid;gap:18px;padding-bottom:90px}
      .unified-tour-section{display:grid;gap:12px;padding:15px;border:1px solid rgba(226,196,155,.78);border-radius:22px;background:#fffaf2}
      .unified-tour-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .unified-tour-section-head h3{margin:0;font-size:16px;line-height:1.15}.unified-tour-section-head p{margin:4px 0 0;color:#826853;font-size:11px;line-height:1.4}
      .unified-tour-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
      .unified-tour-field{display:grid;gap:6px;align-content:start}.unified-tour-label{color:#5f422f;font-size:12px;font-weight:950;line-height:1.25}
      .unified-tour-hint{display:block;color:#8a6d56;font-size:10.5px;line-height:1.4;font-weight:650}
      .unified-tour-form input,.unified-tour-form select,.unified-tour-form textarea{width:100%;border:1px solid #ead8c0;border-radius:14px;background:#fff;padding:10px 11px;color:#271005;font:inherit;font-size:13px;font-weight:700;outline:0}
      .unified-tour-form input,.unified-tour-form select{min-height:42px}.unified-tour-form textarea{resize:vertical;line-height:1.45}
      .unified-tour-form input:focus,.unified-tour-form textarea:focus,.unified-tour-form select:focus{border-color:#d8a33c;box-shadow:0 0 0 3px rgba(216,163,60,.12)}
      .unified-tour-checks{display:flex;gap:10px;flex-wrap:wrap}.unified-tour-check{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:start;padding:10px 12px;border:1px solid #ead8c0;border-radius:14px;background:#fff}
      .unified-tour-check input{width:18px!important;height:18px!important;min-height:0!important;margin-top:1px}.unified-tour-check strong{display:block;color:#5f422f;font-size:12px}.unified-tour-check small{display:block;margin-top:2px;color:#8a6d56;font-size:10px;line-height:1.35}
      .unified-tour-photo{display:grid;grid-template-columns:150px minmax(0,1fr);gap:14px;align-items:start}.unified-tour-preview{width:150px;aspect-ratio:16/10;border-radius:16px;object-fit:cover;background:#eee8dc;border:1px solid rgba(23,23,19,.1)}
      .unified-tour-photo-copy{display:grid;gap:11px}.unified-tour-file-note{font-size:11px;line-height:1.4;color:#826853}
      .unified-tour-save{position:sticky;bottom:0;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 -4px;padding:12px 4px;background:linear-gradient(180deg,rgba(255,253,248,0),rgba(255,253,248,.94) 24%,#fffdf8 50%)}
      .unified-tour-save-note{font-size:11px;line-height:1.35;color:#826853}.unified-tour-uploading{opacity:.62;pointer-events:none}.unified-tour-error{color:#b00016;font-size:12px;font-weight:800;min-height:18px}
      .unified-tour-wide{grid-column:1/-1}.unified-tour-subcard{display:grid;gap:10px;padding:12px;border:1px dashed #ddc7aa;border-radius:17px;background:#fffdf8}
      .unified-tour-subcard-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.unified-tour-subcard-title{font-size:12px;font-weight:950;color:#5f422f}
      .unified-tour-departures{display:grid;gap:10px}.unified-tour-empty-note{margin:0;color:#8a6d56;font-size:11px;line-height:1.45}
      .unified-tour-extra-group{display:grid;gap:10px;padding-top:2px}.unified-tour-extra-title{font-size:12px;font-weight:950;color:#5f422f}
      @media(max-width:620px){.unified-tour-grid{grid-template-columns:1fr}.unified-tour-photo{grid-template-columns:1fr}.unified-tour-preview{width:100%;max-width:280px}.unified-tour-save{align-items:stretch;flex-direction:column}.unified-tour-save .btn{width:100%}.unified-tour-wide{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!['GET','HEAD'].includes(options.method || 'GET') && state.csrf) headers['x-csrf-token'] = state.csrf;
    const response = await fetch(path, { credentials:'same-origin', ...options, headers });
    const data = await response.json().catch(() => ({ ok:false, error:'invalid_response' }));
    if (!response.ok || data.ok === false) {
      const messages = {
        image_type_invalid:'Поддерживаются JPG, PNG, WebP и AVIF.',
        image_too_large:'Фото слишком большое. Максимум 8 МБ.',
        image_empty:'Файл пустой.',
        media_storage_unavailable:'Хранилище фото временно недоступно.',
        csrf_invalid:'Сессия устарела. Обновите страницу.',
        forbidden:'Для вашей роли это действие недоступно.',
        unauthorized:'Необходимо войти заново.',
        tour_not_found:'Экскурсия не найдена.',
        tour_invalid:'Проверьте служебный код и название экскурсии.',
      };
      throw new Error(messages[data.error] || 'Не удалось сохранить экскурсию.');
    }
    return data;
  }

  async function load(force = false) {
    if (state.loading || (state.loaded && !force)) return;
    state.loading = true;
    try {
      const data = await api('/api/admin/bootstrap');
      state.csrf = data.csrfToken || state.csrf;
      state.tours = Array.isArray(data.catalog) ? data.catalog : [];
      state.loaded = true;
    } finally {
      state.loading = false;
    }
  }

  function extraObject(source, knownFields) {
    const result = {};
    if (!source || typeof source !== 'object' || Array.isArray(source)) return result;
    Object.entries(source).forEach(([key, value]) => {
      if (!knownFields.has(key)) result[key] = value;
    });
    return result;
  }

  function splitWords(key) {
    return String(key || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function humanizeKey(key) {
    if (LABELS[key]) return LABELS[key];
    const words = splitWords(key);
    const translated = words.map(word => WORDS[word.toLowerCase()] || word.toLowerCase());
    if (!translated.length) return 'Дополнительный параметр';
    const phrase = translated.join(' ');
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  }

  function hintFor(key, fallback = '') {
    if (COMMON_HINTS[key]) return COMMON_HINTS[key];
    return fallback || 'Дополнительный параметр исходной экскурсии. Заполните обычным текстом или числом; формат JSON не требуется.';
  }

  function field(name, label, value, hint, options = {}) {
    const { type='text', placeholder='', min='', max='', step='', readonly=false, wide=false } = options;
    const attrs = [
      `name="${h(name)}"`, `type="${h(type)}"`, `value="${h(value ?? '')}"`,
      placeholder ? `placeholder="${h(placeholder)}"` : '',
      min !== '' ? `min="${h(min)}"` : '',
      max !== '' ? `max="${h(max)}"` : '',
      step !== '' ? `step="${h(step)}"` : '',
      readonly ? 'readonly' : '',
    ].filter(Boolean).join(' ');
    return `<label class="unified-tour-field ${wide ? 'unified-tour-wide' : ''}"><span class="unified-tour-label">${h(label)}</span><input ${attrs}><small class="unified-tour-hint">${h(hint)}</small></label>`;
  }

  function area(name, label, value, hint, rows = 4, wide = false, placeholder = '') {
    return `<label class="unified-tour-field ${wide ? 'unified-tour-wide' : ''}"><span class="unified-tour-label">${h(label)}</span><textarea name="${h(name)}" rows="${rows}" ${placeholder ? `placeholder="${h(placeholder)}"` : ''}>${h(value ?? '')}</textarea><small class="unified-tour-hint">${h(hint)}</small></label>`;
  }

  function check(name, label, checked, hint) {
    return `<label class="unified-tour-check"><input name="${h(name)}" type="checkbox" ${checked ? 'checked' : ''}><span><strong>${h(label)}</strong><small>${h(hint)}</small></span></label>`;
  }

  function section(title, note, body) {
    return `<section class="unified-tour-section"><div class="unified-tour-section-head"><div><h3>${h(title)}</h3><p>${h(note)}</p></div></div>${body}</section>`;
  }

  function formatValues(tour) {
    if (Array.isArray(tour.types)) return tour.types;
    if (tour.type) return [tour.type];
    if (tour.format) return [tour.format];
    return [];
  }

  function arrayValue(tour, preferred, fallback) {
    if (Array.isArray(tour?.[preferred])) return tour[preferred];
    if (fallback && Array.isArray(tour?.[fallback])) return tour[fallback];
    return [];
  }

  function encodePath(path) {
    return encodeURIComponent(path.join('\u001f'));
  }

  function decodePath(value) {
    return decodeURIComponent(String(value || '')).split('\u001f').filter(Boolean);
  }

  function renderExtraValue(scope, key, value, path = []) {
    const fullPath = [...path, key];
    const pathAttr = encodePath(fullPath);
    const label = humanizeKey(key);
    const hint = hintFor(key);
    if (typeof value === 'boolean') {
      return `<label class="unified-tour-check"><input type="checkbox" data-extra-scope="${h(scope)}" data-extra-path="${h(pathAttr)}" data-extra-kind="boolean" ${value ? 'checked' : ''}><span><strong>${h(label)}</strong><small>${h(hint)}</small></span></label>`;
    }
    if (typeof value === 'number') {
      return `<label class="unified-tour-field"><span class="unified-tour-label">${h(label)}</span><input type="number" step="any" value="${h(value)}" data-extra-scope="${h(scope)}" data-extra-path="${h(pathAttr)}" data-extra-kind="number"><small class="unified-tour-hint">${h(hint)}</small></label>`;
    }
    if (typeof value === 'string' || value === null || value === undefined) {
      const text = value == null ? '' : String(value);
      const multiline = text.length > 80 || text.includes('\n');
      return `<label class="unified-tour-field ${multiline ? 'unified-tour-wide' : ''}"><span class="unified-tour-label">${h(label)}</span>${multiline
        ? `<textarea rows="4" data-extra-scope="${h(scope)}" data-extra-path="${h(pathAttr)}" data-extra-kind="string">${h(text)}</textarea>`
        : `<input type="text" value="${h(text)}" data-extra-scope="${h(scope)}" data-extra-path="${h(pathAttr)}" data-extra-kind="string">`}<small class="unified-tour-hint">${h(hint)}</small></label>`;
    }
    if (Array.isArray(value)) {
      if (value.every(item => ['string','number','boolean'].includes(typeof item) || item == null)) {
        return `<label class="unified-tour-field unified-tour-wide"><span class="unified-tour-label">${h(label)}</span><textarea rows="5" data-extra-scope="${h(scope)}" data-extra-path="${h(pathAttr)}" data-extra-kind="primitive-array">${h(textLines(value))}</textarea><small class="unified-tour-hint">${h(hint)} Каждый элемент вводите с новой строки.</small></label>`;
      }
      return `<div class="unified-tour-extra-group unified-tour-wide"><div class="unified-tour-extra-title">${h(label)}</div><small class="unified-tour-hint">${h(hint)} Элементы показаны отдельными карточками.</small>${value.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
        return `<div class="unified-tour-subcard"><div class="unified-tour-subcard-title">Элемент ${index + 1}</div><div class="unified-tour-grid">${Object.entries(item).map(([childKey, childValue]) => renderExtraValue(scope, childKey, childValue, [...fullPath, String(index)])).join('')}</div></div>`;
      }).join('')}</div>`;
    }
    if (typeof value === 'object') {
      return `<div class="unified-tour-extra-group unified-tour-wide"><div class="unified-tour-extra-title">${h(label)}</div><small class="unified-tour-hint">${h(hint)}</small><div class="unified-tour-grid">${Object.entries(value).map(([childKey, childValue]) => renderExtraValue(scope, childKey, childValue, fullPath)).join('')}</div></div>`;
    }
    return '';
  }

  function extraEditorMarkup(scope, extras, emptyText = 'Дополнительных параметров для этой экскурсии нет.') {
    const entries = Object.entries(extras || {});
    if (!entries.length) return `<p class="unified-tour-empty-note">${h(emptyText)}</p>`;
    return `<div class="unified-tour-grid">${entries.map(([key, value]) => renderExtraValue(scope, key, value)).join('')}</div>`;
  }

  function setPath(target, path, value) {
    let node = target;
    path.forEach((part, index) => {
      const last = index === path.length - 1;
      const nextPart = path[index + 1];
      const numeric = /^\d+$/.test(part);
      const key = numeric ? Number(part) : part;
      if (last) {
        node[key] = value;
        return;
      }
      if (node[key] == null || typeof node[key] !== 'object') node[key] = /^\d+$/.test(nextPart) ? [] : {};
      node = node[key];
    });
  }

  function collectExtras(form, scope, base) {
    const result = clone(base || {});
    form.querySelectorAll(`[data-extra-scope="${scope}"]`).forEach(control => {
      const path = decodePath(control.dataset.extraPath);
      const kind = control.dataset.extraKind;
      let value;
      if (kind === 'boolean') value = control.checked;
      else if (kind === 'number') value = toNumber(control.value) ?? 0;
      else if (kind === 'primitive-array') {
        const original = path.reduce((node, part) => node?.[/^\d+$/.test(part) ? Number(part) : part], base || {});
        const originalType = Array.isArray(original) && original.length ? typeof original[0] : 'string';
        value = lines(control.value).map(item => originalType === 'number' ? (toNumber(item) ?? 0) : originalType === 'boolean' ? /^(true|1|да|yes)$/i.test(item) : item);
      } else value = String(control.value ?? '');
      setPath(result, path, value);
    });
    return result;
  }

  function departureCard(scope, item = {}, index = 0) {
    const extras = extraObject(item, DEPARTURE_FIELDS);
    return `<div class="unified-tour-subcard" data-departure-row="${h(scope)}" data-departure-index="${index}">
      <div class="unified-tour-subcard-head"><div class="unified-tour-subcard-title">Выезд ${index + 1}</div><button class="btn small" type="button" data-remove-departure>Удалить</button></div>
      <div class="unified-tour-grid">
        ${field('', 'Дата выезда', item.date || '', 'Выберите конкретную дату. Если выезды повторяются по дням недели, используйте дополнительные параметры ниже.', { type:'date' }).replace('name=""', 'data-departure-field="date"')}
        ${field('', 'Время отправления', item.time || '', 'Например: 07:00.', { type:'time' }).replace('name=""', 'data-departure-field="time"')}
        ${field('', 'Всего мест', item.capacity ?? '', 'Максимальное число туристов на этом выезде.', { type:'number', min:0 }).replace('name=""', 'data-departure-field="capacity"')}
        ${field('', 'Уже занято мест', item.taken ?? '', 'Сколько мест уже забронировано.', { type:'number', min:0 }).replace('name=""', 'data-departure-field="taken"')}
        <label class="unified-tour-field unified-tour-wide"><span class="unified-tour-label">Статус выезда</span><select data-departure-field="status">
          ${['','Открыт','Мало мест','Полон','Лист ожидания','Отменён'].map(value => `<option value="${h(value)}" ${String(item.status || '') === value ? 'selected' : ''}>${h(value || 'Не указан')}</option>`).join('')}
        </select><small class="unified-tour-hint">Выберите состояние, которое должно учитывать бронирование и AI-консультант.</small></label>
        ${extraEditorMarkup(`${scope}-departure-${index}`, extras, '')}
      </div>
    </div>`;
  }

  function departuresMarkup(scope, items) {
    const list = Array.isArray(items) ? items : [];
    return `<div class="unified-tour-departures" data-departure-list="${h(scope)}">${list.length ? list.map((item, index) => departureCard(scope, item, index)).join('') : '<p class="unified-tour-empty-note" data-departure-empty>Выезды пока не добавлены.</p>'}</div>
      <button class="btn small" type="button" data-add-departure="${h(scope)}">+ Добавить выезд</button>
      <small class="unified-tour-hint">Каждый выезд заполняется обычными полями: дата, время, количество мест и статус.</small>`;
  }

  function collectDepartures(form, scope, baseItems) {
    const originals = Array.isArray(baseItems) ? baseItems : [];
    return [...form.querySelectorAll(`[data-departure-row="${scope}"]`)].map(row => {
      const originalIndex = Number(row.dataset.departureIndex);
      const original = Number.isInteger(originalIndex) && originalIndex >= 0 ? (originals[originalIndex] || {}) : {};
      const get = name => row.querySelector(`[data-departure-field="${name}"]`)?.value ?? '';
      const capacity = toNumber(get('capacity'));
      const taken = toNumber(get('taken'));
      const extras = collectExtras(form, `${scope}-departure-${originalIndex}`, extraObject(original, DEPARTURE_FIELDS));
      const result = {
        ...original,
        ...extras,
        date:String(get('date') || ''),
        time:String(get('time') || ''),
        status:String(get('status') || ''),
      };
      if (capacity == null) delete result.capacity; else result.capacity = capacity;
      if (taken == null) delete result.taken; else result.taken = taken;
      return result;
    });
  }

  async function openEditor(id = '') {
    try {
      await load(true);
      const tour = state.tours.find(item => String(item.id) === String(id)) || {};
      const isNew = !tour.id;
      const group = tour.group && typeof tour.group === 'object' && !Array.isArray(tour.group) ? tour.group : {};
      const individual = tour.individual && typeof tour.individual === 'object' && !Array.isArray(tour.individual) ? tour.individual : {};
      const topExtras = extraObject(tour, TOP_LEVEL_FIELDS);
      const groupExtras = extraObject(group, GROUP_FIELDS);
      const individualExtras = extraObject(individual, INDIVIDUAL_FIELDS);
      const formats = formatValues(tour);
      const gallery = Array.isArray(tour.gallery) ? tour.gallery : [];
      const preview = tour.image || tour.fallbackImage || gallery[0] || '';
      const capacity = tour.capacity ?? tour.maxPeople ?? '';
      const priceFromUsd = tour.priceFromUsd ?? '';

      openDrawer(`<div class="drawer-head"><div><h2 class="drawer-title">${isNew ? 'Новая экскурсия' : 'Редактировать экскурсию'}</h2><p class="drawer-sub">Все поля заполняются обычным текстом, числами, списками и переключателями. JSON не нужен.</p></div><button class="close" onclick="closeDrawer()">×</button></div>
        <form class="unified-tour-form" id="unifiedTourForm" data-tour-id="${h(tour.id || '')}">
          ${section('Основная информация','То, что клиент видит в каталоге и по чему система понимает экскурсию.',`<div class="unified-tour-grid">
            ${field('id', 'Служебный код экскурсии', tour.id || '', COMMON_HINTS.id, { readonly:!isNew, placeholder:'nhatrang-city-tour' })}
            ${field('title', 'Название экскурсии', tour.title || '', COMMON_HINTS.title, { placeholder:'Обзорная экскурсия по Нячангу' })}
            ${field('city', 'Город отправления', tour.city || tour.location || '', COMMON_HINTS.city, { placeholder:'Нячанг' })}
            ${field('region', 'Регион / направление', tour.region || '', COMMON_HINTS.region, { placeholder:'Нячанг и окрестности' })}
            ${field('category', 'Категория', tour.category || '', COMMON_HINTS.category, { placeholder:'Обзорные' })}
            ${field('duration', 'Продолжительность', tour.duration || '', COMMON_HINTS.duration, { placeholder:'1 день' })}
            ${field('time', 'Время экскурсии', tour.time || '', COMMON_HINTS.time, { placeholder:'07:00 → 18:00' })}
            ${field('formatsLabel', 'Подпись формата для клиента', tour.formatsLabel || '', COMMON_HINTS.formatsLabel, { placeholder:'групповой / индивидуальный' })}
            ${area('typesText', 'Доступные форматы', textLines(formats), COMMON_HINTS.typesText, 3, true, 'групповой\nиндивидуальный')}
            ${field('capacity', 'Максимум участников', capacity, COMMON_HINTS.capacity, { type:'number', min:1 })}
            ${field('priceFromUsd', 'Минимальная цена, USD', priceFromUsd, COMMON_HINTS.priceFromUsd, { type:'number', min:0, step:'0.01', placeholder:'45' })}
            ${field('priceLabel', 'Подпись цены для клиента', tour.priceLabel || tour.price || tour.priceFrom || '', COMMON_HINTS.priceLabel, { wide:true, placeholder:'от $45' })}
          </div><div class="unified-tour-checks">
            ${check('published','Показывать клиентам',tour.published !== false,'Выключите, если экскурсия должна временно исчезнуть из каталога.')}
            ${check('popular','Отметить как популярную',Boolean(tour.popular),'Используется для приоритетного показа в каталоге и подборе.')}
            ${check('childrenOk','Подходит детям',tour.childrenOk !== false,'Выключите, если экскурсия не подходит для семей с детьми.')}
          </div>`)}

          ${section('Групповой формат','Стоимость, условия оплаты и конкретные выезды групповой экскурсии.',`<div class="unified-tour-grid">
            ${field('groupFrom','Цена от',group.from || '',COMMON_HINTS.groupFrom,{placeholder:'$36'})}
            ${field('groupAdult','Цена для взрослого',group.adult || '',COMMON_HINTS.groupAdult,{placeholder:'$36'})}
            ${field('groupChild','Цена для ребёнка',group.child || '',COMMON_HINTS.groupChild,{placeholder:'$28'})}
            ${field('groupInfant','Цена для младенца',group.infant || '',COMMON_HINTS.groupInfant,{placeholder:'до 2 лет бесплатно'})}
            ${field('groupDeposit','Условия оплаты',group.deposit || '',COMMON_HINTS.groupDeposit,{wide:true,placeholder:'30% или 100%'})}
            ${area('groupNotes','Примечания к групповому туру',textLines(group.notes),COMMON_HINTS.groupNotes,5,true,'Русскоязычный гид\nОбед включён')}
          </div><div class="unified-tour-extra-title">Расписание выездов</div>${departuresMarkup('group', group.departures)}
          ${Object.keys(groupExtras).length ? `<div class="unified-tour-extra-title">Дополнительные параметры группового формата</div>${extraEditorMarkup('group-extra', groupExtras)}` : ''}`)}

          ${section('Индивидуальный формат','Стоимость частной экскурсии и тарифы по количеству участников.',`<div class="unified-tour-grid">
            ${field('individualFrom','Цена от',individual.from || '',COMMON_HINTS.individualFrom,{placeholder:'$350'})}
            ${field('individualDeposit','Условия оплаты',individual.deposit || '',COMMON_HINTS.individualDeposit,{placeholder:'30% или 100%'})}
            ${area('individualTiers','Тарифы по количеству участников',textLines(individual.tiers),COMMON_HINTS.individualTiers,6,true,'1–2 человека — $350\n3 человека — $390')}
            ${area('individualNotes','Примечания к индивидуальному туру',textLines(individual.notes),COMMON_HINTS.individualNotes,4,true)}
          </div>${Array.isArray(individual.departures) && individual.departures.length ? `<div class="unified-tour-extra-title">Расписание индивидуальных выездов</div>${departuresMarkup('individual', individual.departures)}` : ''}
          ${Object.keys(individualExtras).length ? `<div class="unified-tour-extra-title">Дополнительные параметры индивидуального формата</div>${extraEditorMarkup('individual-extra', individualExtras)}` : ''}`)}

          ${section('Описание и программа','Контент карточки экскурсии. Списки заполняются по одному пункту на строку.',`<div class="unified-tour-grid">
            ${area('description','Основное описание',tour.description || '',COMMON_HINTS.description,6,true,'Расскажите, чем интересна экскурсия и что увидит турист.')}
            ${area('subtitle','Короткий подзаголовок',tour.subtitle || '',COMMON_HINTS.subtitle,3,true)}
            ${area('program','Программа экскурсии',textLines(arrayValue(tour,'program')),COMMON_HINTS.program,7,true,'Встреча в отеле\nПервая остановка\nОбед\nВозвращение')}
            ${area('included','Что включено',textLines(arrayValue(tour,'included')),COMMON_HINTS.included,7,false,'Трансфер\nГид\nОбед')}
            ${area('notIncluded','Что не включено',textLines(arrayValue(tour,'notIncluded','excluded')),COMMON_HINTS.notIncluded,7,false,'Личные расходы')}
            ${area('whatToTake','Что взять с собой',textLines(arrayValue(tour,'whatToTake')),COMMON_HINTS.whatToTake,6,false,'Головной убор\nКупальник')}
            ${area('recommendations','Рекомендации туристу',textLines(arrayValue(tour,'recommendations')),COMMON_HINTS.recommendations,6,false)}
            ${area('tags','Теги',textLines(arrayValue(tour,'tags')),COMMON_HINTS.tags,6,false,'Нячанг\nобзорная\nсемья')}
            ${area('searchText','Ключевые слова для поиска и AI-консультанта',tour.searchText || '',COMMON_HINTS.searchText,6,false,'обзорная экскурсия нячанг достопримечательности храм пагода')}
          </div>`)}

          ${section('Фотографии','Главное фото и вся галерея редактируются здесь — отдельного редактора фотографий больше нет.',`<div class="unified-tour-photo">
            <img class="unified-tour-preview" id="unifiedTourPreview" src="${h(preview)}" alt="Текущее фото экскурсии">
            <div class="unified-tour-photo-copy">
              ${field('image','Текущее главное фото',tour.image || '',COMMON_HINTS.image,{placeholder:'/tour-media/...'})}
              <label class="unified-tour-field"><span class="unified-tour-label">Загрузить новое главное фото</span><input id="unifiedTourFile" name="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/avif"><small class="unified-tour-hint">Выберите JPG, PNG, WebP или AVIF до 8 МБ. После сохранения файл попадёт в хранилище и автоматически станет главным фото.</small></label>
              ${area('gallery','Фотографии галереи',textLines(gallery),COMMON_HINTS.gallery,7,false,'/tour-media/...')}
            </div>
          </div>`)}

          ${Object.keys(topExtras).length ? section('Дополнительные параметры','Редкие данные исходной экскурсии показаны отдельными понятными полями. JSON вводить не нужно.', extraEditorMarkup('top-extra', topExtras)) : ''}

          <div class="unified-tour-save"><div><div class="unified-tour-save-note">Одна кнопка сохраняет карточку, цены, программу, расписание, дополнительные параметры и фотографии.</div><div class="unified-tour-error" role="alert"></div></div><button class="btn primary" type="submit">Сохранить все изменения</button></div>
        </form>`);

      const form = document.getElementById('unifiedTourForm');
      const fileInput = document.getElementById('unifiedTourFile');
      const previewNode = document.getElementById('unifiedTourPreview');
      const imageInput = form?.elements.namedItem('image');
      imageInput?.addEventListener('input', () => { if (imageInput.value.trim()) previewNode.src = imageInput.value.trim(); });
      fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { previewNode.src = String(reader.result || ''); };
        reader.readAsDataURL(file);
      });
      form?.addEventListener('submit', submitUnifiedTour);
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message || 'Не удалось открыть экскурсию');
    }
  }

  function buildTourPayload(form, base) {
    const data = new FormData(form);
    const id = String(data.get('id') || '').trim().replace(/[^a-z0-9_-]/gi, '-').toLowerCase().slice(0, 100);
    const title = String(data.get('title') || '').trim();
    if (!id || !title) throw new Error('Служебный код и название экскурсии обязательны.');

    const types = lines(data.get('typesText'));
    const capacity = toNumber(data.get('capacity'));
    const priceFromUsd = toNumber(data.get('priceFromUsd'));
    const image = String(data.get('image') || '').trim();
    const gallery = lines(data.get('gallery'));
    const baseGroup = base.group && typeof base.group === 'object' && !Array.isArray(base.group) ? base.group : {};
    const baseIndividual = base.individual && typeof base.individual === 'object' && !Array.isArray(base.individual) ? base.individual : {};

    const group = {
      ...baseGroup,
      ...collectExtras(form, 'group-extra', extraObject(baseGroup, GROUP_FIELDS)),
      from:String(data.get('groupFrom') || '').trim(),
      adult:String(data.get('groupAdult') || '').trim(),
      child:String(data.get('groupChild') || '').trim(),
      infant:String(data.get('groupInfant') || '').trim(),
      deposit:String(data.get('groupDeposit') || '').trim(),
      notes:lines(data.get('groupNotes')),
      departures:collectDepartures(form, 'group', baseGroup.departures),
    };

    const individual = {
      ...baseIndividual,
      ...collectExtras(form, 'individual-extra', extraObject(baseIndividual, INDIVIDUAL_FIELDS)),
      from:String(data.get('individualFrom') || '').trim(),
      deposit:String(data.get('individualDeposit') || '').trim(),
      tiers:lines(data.get('individualTiers')),
      notes:lines(data.get('individualNotes')),
    };
    if (form.querySelector('[data-departure-list="individual"]')) {
      individual.departures = collectDepartures(form, 'individual', baseIndividual.departures);
    }

    const payload = {
      ...base,
      ...collectExtras(form, 'top-extra', extraObject(base, TOP_LEVEL_FIELDS)),
      id,
      title,
      city:String(data.get('city') || '').trim(),
      region:String(data.get('region') || '').trim(),
      category:String(data.get('category') || '').trim(),
      duration:String(data.get('duration') || '').trim(),
      time:String(data.get('time') || '').trim(),
      formatsLabel:String(data.get('formatsLabel') || '').trim(),
      types,
      type:types[0] || String(base.type || ''),
      priceLabel:String(data.get('priceLabel') || '').trim(),
      published:data.has('published'),
      popular:data.has('popular'),
      childrenOk:data.has('childrenOk'),
      tags:lines(data.get('tags')),
      searchText:String(data.get('searchText') || '').trim(),
      description:String(data.get('description') || ''),
      subtitle:String(data.get('subtitle') || ''),
      program:lines(data.get('program')),
      included:lines(data.get('included')),
      notIncluded:lines(data.get('notIncluded')),
      whatToTake:lines(data.get('whatToTake')),
      recommendations:lines(data.get('recommendations')),
      group,
      individual,
      image,
      fallbackImage:image || String(base.fallbackImage || ''),
      gallery,
    };
    if (capacity == null) delete payload.capacity; else payload.capacity = capacity;
    if (priceFromUsd == null) delete payload.priceFromUsd; else payload.priceFromUsd = priceFromUsd;
    return payload;
  }

  async function submitUnifiedTour(event) {
    event.preventDefault();
    event.stopPropagation();
    const form = event.currentTarget;
    const errorNode = form.querySelector('.unified-tour-error');
    const submit = form.querySelector('[type="submit"]');
    const originalId = form.dataset.tourId || '';
    const base = state.tours.find(item => String(item.id) === String(originalId)) || {};
    const file = form.elements.namedItem('imageFile')?.files?.[0];
    errorNode.textContent = '';

    if (file) {
      if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) { errorNode.textContent = 'Поддерживаются JPG, PNG, WebP и AVIF.'; return; }
      if (file.size > 8 * 1024 * 1024) { errorNode.textContent = 'Фото слишком большое. Максимум 8 МБ.'; return; }
    }

    submit.disabled = true;
    form.classList.add('unified-tour-uploading');
    try {
      let payload = buildTourPayload(form, base);
      const saved = await api(`/api/admin/tours/${encodeURIComponent(payload.id)}`, {
        method:'PUT', headers:{ 'content-type':'application/json' }, body:JSON.stringify(payload),
      });
      payload = saved.tour || payload;

      if (file) {
        const uploaded = await api(`/api/admin/tours/${encodeURIComponent(payload.id)}/image`, {
          method:'POST', headers:{ 'content-type':file.type, 'x-file-name':encodeURIComponent(file.name || 'image') }, body:file,
        });
        payload = uploaded.tour || payload;
      }

      const index = state.tours.findIndex(item => String(item.id) === String(payload.id));
      if (index >= 0) state.tours[index] = payload;
      else state.tours.push(payload);
      if (typeof closeDrawer === 'function') closeDrawer();
      await load(true).catch(() => {});
      if (typeof window.renderCatalog === 'function') window.renderCatalog();
      if (typeof showToast === 'function') showToast('Экскурсия сохранена');
    } catch (error) {
      errorNode.textContent = error.message || 'Не удалось сохранить экскурсию.';
    } finally {
      submit.disabled = false;
      form.classList.remove('unified-tour-uploading');
    }
  }

  document.addEventListener('click', event => {
    const edit = event.target.closest('[data-admin-action="edit-tour"]');
    if (edit) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void openEditor(decodeURIComponent(String(edit.dataset.id || '')));
      return;
    }

    const add = event.target.closest('[data-add-departure]');
    if (add) {
      const scope = add.dataset.addDeparture;
      const list = document.querySelector(`[data-departure-list="${scope}"]`);
      if (!list) return;
      list.querySelector('[data-departure-empty]')?.remove();
      const nextIndex = Math.max(-1, ...[...list.querySelectorAll('[data-departure-row]')].map(row => Number(row.dataset.departureIndex) || 0)) + 1;
      list.insertAdjacentHTML('beforeend', departureCard(scope, {}, nextIndex));
      return;
    }

    const remove = event.target.closest('[data-remove-departure]');
    if (remove) {
      const row = remove.closest('[data-departure-row]');
      const list = row?.parentElement;
      row?.remove();
      if (list && !list.querySelector('[data-departure-row]')) list.innerHTML = '<p class="unified-tour-empty-note" data-departure-empty>Выезды пока не добавлены.</p>';
    }
  }, true);

  injectStyles();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => load().catch(() => {}), { once:true });
  else load().catch(() => {});
})();