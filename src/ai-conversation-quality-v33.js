const clean = (value, max = 1800) => String(value ?? '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const lower = value => clean(value, 2400).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

const PARTY_WORDS = new Map([
  ['один',1],['одна',1],['одного',1],
  ['два',2],['две',2],['двое',2],['двоих',2],
  ['три',3],['трое',3],['троих',3],
  ['четыре',4],['четверо',4],['четверых',4],
  ['пять',5],['пятеро',5],['пятерых',5],
  ['шесть',6],['шестеро',6],['семь',7],['семеро',7],
  ['восемь',8],['восьмеро',8],['девять',9],['девятеро',9],
  ['десять',10],['десятеро',10],
]);

const INTEREST_REPLIES = ['Море и острова', 'Природа и красивые виды', 'Обзор города'];
const DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';

export function partyQuestion(text) {
  const q = lower(text);
  return /сколько\s+(?:человек|вас)|сколько[^?!.]{0,45}(?:едет|поедет|поедут)|кто\s+(?:едет|поедет)|состав[^?!.]{0,35}(?:групп|компан|турист)|вы\s+вдвоем\s+или|сколько[^?!.]{0,35}(?:взросл|дет)/u.test(q);
}

export function standalonePartyCount(text) {
  const q = lower(text).replace(/[.!?]+$/g, '').trim();
  if (!q) return 0;
  const numeric = q.match(/^(\d{1,2})(?:\s*(?:человек|чел\.?|турист(?:а|ов)?))?$/u);
  if (numeric) {
    const count = Number(numeric[1]);
    return count >= 1 && count <= 30 ? count : 0;
  }
  const word = q.match(/^([а-я]+)(?:\s+(?:человек|турист(?:а|ов)?))?$/u)?.[1] || '';
  const count = PARTY_WORDS.get(word) || 0;
  return count >= 1 && count <= 30 ? count : 0;
}

function textOf(item = {}) {
  return clean(item.text ?? item.content, 1800);
}

function isAssistant(item = {}) {
  return item.role === 'assistant' || item.role === 'bot';
}

export function cleanConversationHistory(history = [], currentMessage = '') {
  const current = clean(currentMessage, 900);
  const rows = (Array.isArray(history) ? history : [])
    .filter(item => item && typeof item === 'object')
    .filter(item => !(isAssistant(item) && /^подбираю[.…]*$/iu.test(textOf(item))))
    .map(item => ({ ...item }));

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const item = rows[index];
    if (item.role !== 'user') continue;
    if (current && textOf(item) === current) rows.splice(index, 1);
    break;
  }
  return rows.slice(-12);
}

function latestAssistant(history = []) {
  const rows = Array.isArray(history) ? history : [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (!isAssistant(rows[index])) continue;
    const text = textOf(rows[index]);
    if (text && !/^подбираю[.…]*$/iu.test(text)) return text;
  }
  return '';
}

function peopleLabel(memory = {}) {
  const adults = Math.max(0, Number(memory.adults) || 0);
  const children = Array.isArray(memory.children) ? memory.children.length : 0;
  const infants = Math.max(0, Number(memory.infants) || 0);
  const parts = [];
  if (adults) parts.push(`${adults} взрослых`);
  if (children) parts.push(`${children} детей`);
  if (infants) parts.push(`${infants} малышей`);
  return parts.join(', ');
}

export function normalizeConversationBody(body = {}) {
  const original = clean(body?.message, 900);
  const rawHistory = Array.isArray(body?.history) ? body.history : [];
  const prompt = latestAssistant(rawHistory);
  const count = standalonePartyCount(original);
  const normalizeParty = Boolean(count && partyQuestion(prompt));
  const message = normalizeParty ? `Нас ${count} взрослых` : original;
  const history = cleanConversationHistory(rawHistory, original);
  const context = { ...(body?.context || {}) };
  if (normalizeParty) {
    context.people = `${count} взрослых`;
    context.partyCount = count;
  }
  return {
    ...body,
    message,
    history,
    context,
    _conversationV33:{ normalizedParty:normalizeParty, originalMessage:original },
  };
}

function parseCookies(header = '') {
  const result = {};
  for (const chunk of String(header || '').split(';')) {
    const part = chunk.trim();
    if (!part) continue;
    const index = part.indexOf('=');
    if (index < 0) continue;
    result[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
  }
  return result;
}

function validSessionId(value) {
  return /^[a-f0-9-]{20,64}$/iu.test(String(value || '')) ? String(value) : '';
}

async function resetConversationMemory(request, env) {
  if (!env?.DB) return;
  const sid = validSessionId(parseCookies(request.headers.get('cookie') || '').mt_v28_sid);
  if (!sid) return;
  try {
    await env.DB.prepare('DELETE FROM ai_conversation_memory WHERE session_id=?').bind(sid).run();
  } catch (error) {
    console.warn('AI v33 reset unavailable', error?.message || error);
  }
}

export async function prepareConversationRequest(request, env, url = new URL(request.url)) {
  if (url.pathname !== '/api/ai/chat' || request.method !== 'POST') return request;
  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== 'object') return request;
  if (body.resetConversation === true) await resetConversationMemory(request, env);
  const normalized = normalizeConversationBody(body);
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  return new Request(request.url, {
    method:request.method,
    headers,
    body:JSON.stringify(normalized),
    redirect:request.redirect,
  });
}

function cityFromOriginMessage(text) {
  const q = lower(text);
  const patterns = [
    ['Нячанг', /(?:нячанг|nha\s*trang)/u],
    ['Ханой', /(?:ханой|hanoi)/u],
    ['Дананг', /(?:дананг|da\s*nang)/u],
    ['Фукуок', /(?:фу\s*куок|фукуок|phu\s*quoc)/u],
    ['Муйне/Фантьет', /(?:муй\s*не|муйне|фан\s*тьет|фантьет|mui\s*ne|phan\s*thiet)/u],
  ];
  const city = patterns.find(([, pattern]) => pattern.test(q))?.[0] || '';
  if (!city) return '';
  const originCue = /(?:^|[\s,;:.!?])(?:я|мы)\s+(?:сейчас\s+)?(?:в|на)\s|(?:нахожусь|находимся|живу|живем|живём)\s+(?:в|на)\s|(?:выезд|старт|отправляемся)\s+(?:будет\s+)?из\s/u;
  return originCue.test(q) ? city : '';
}

export function originOnlyMessage(text) {
  const q = lower(text);
  const city = cityFromOriginMessage(text);
  if (!city) return '';
  if (/(?:хочу|поех|съезд|экскурс|тур\b|маршрут|посет|посмотр|остров|море|пляж|природ|водопад|обзор|храм|музе|заброни|оформ|сегодня|завтра|взросл|ребен|дет)/u.test(q)) return '';
  return city;
}

function historyHasDiscovery(history = []) {
  return (Array.isArray(history) ? history : []).some(item => item?.role === 'user' && /(?:хочу|поех|съезд|экскурс|тур\b|маршрут|остров|море|пляж|природ|обзор|храм|музе|заброни)/iu.test(textOf(item)));
}

function normalizeTokens(value) {
  return new Set(lower(value).split(/[^a-zа-я0-9]+/iu).filter(token => token.length > 2));
}

function similarity(a, b) {
  const left = normalizeTokens(a);
  const right = normalizeTokens(b);
  if (!left.size || !right.size) return 0;
  let same = 0;
  for (const token of left) if (right.has(token)) same += 1;
  return same / Math.max(left.size, right.size);
}

function questionKind(reply) {
  const q = lower(reply);
  if (/(?:откуда|из какого города|где вы (?:сейчас|находитесь)|точка выезда)/u.test(q)) return 'ask_origin';
  if (/(?:сколько (?:вас|человек)|сколько[^?!.]{0,30}(?:едет|поедет)|вы вдвоем или|кто едет)/u.test(q)) return 'ask_party';
  if (/(?:на какой (?:день|дате)|какую дату|какая дата|когда (?:хотите|планируете|едете|поедете)|на когда)/u.test(q)) return 'ask_date';
  if (/(?:что (?:вам )?(?:интереснее|хочется)|что (?:показать|выбрать)|какой отдых|море[^?]{0,30}природ|остров[^?]{0,30}город)/u.test(q)) return 'ask_interest';
  if (/(?:групп(?:овой|ой)?[^?]{0,25}индивиду|индивиду[^?]{0,25}групп|какой формат)/u.test(q)) return 'ask_format';
  return '';
}

function stepRequiresQuestion(step) {
  return ['ask_origin','ask_interest','ask_party','ask_date','ask_format'].includes(step);
}

export function replyNeedsRepair(payload = {}, history = []) {
  const reply = clean(payload.reply, 1800);
  if (!reply) return true;
  const step = clean(payload.nextStep, 80);
  const kind = questionKind(reply);
  if (stepRequiresQuestion(step) && kind !== step) return true;
  if (!stepRequiresQuestion(step) && kind && kind !== step) return true;
  const previousReplies = (Array.isArray(history) ? history : [])
    .filter(isAssistant)
    .map(textOf)
    .filter(text => text && !/^подбираю[.…]*$/iu.test(text))
    .slice(-4);
  if (previousReplies.some(previous => lower(previous) === lower(reply) || similarity(previous, reply) >= 0.82)) return true;

  const memory = payload.memory || {};
  if (memory.origin && kind === 'ask_origin') return true;
  if ((Number(memory.adults) || (memory.children || []).length || Number(memory.infants)) && kind === 'ask_party') return true;
  if (memory.date && kind === 'ask_date') return true;
  if ((memory.preferences || []).length && kind === 'ask_interest') return true;
  if (memory.format && kind === 'ask_format') return true;
  return false;
}

function partySummary(memory = {}) {
  const count = Math.max(0, Number(memory.adults) || 0) + (Array.isArray(memory.children) ? memory.children.length : 0) + Math.max(0, Number(memory.infants) || 0);
  return count ? `вас ${count}` : '';
}

function salesFallback(step, memory = {}) {
  const origin = clean(memory.origin, 80);
  if (step === 'ask_origin') return 'С чего начнём: из какого города во Вьетнаме планируете выезд?';
  if (step === 'ask_interest') return `${origin ? `Понял, выезд из ${origin}. ` : ''}Что вам ближе: море и острова, природа и красивые виды или обзор города?`;
  if (step === 'ask_party') return 'Отлично, направление понял. Сколько вас будет? Если едут дети, укажите их возраст.';
  if (step === 'ask_date') return `${partySummary(memory) ? `Принято, ${partySummary(memory)}. ` : ''}На какой день смотрим экскурсию?`;
  if (step === 'ask_format') return 'Осталось выбрать формат: присоединиться к группе или поехать индивидуально?';
  if (step === 'offer_tours') return 'Подобрал подходящие варианты ниже. Выберите тот, который нравится больше — дальше доведу до оформления.';
  if (step === 'request_group_confirmation') return 'На выбранную дату групповой выезд нужно подтвердить у менеджера. Я сохраню ваш выбор, чтобы не проходить подбор заново.';
  if (step === 'ready_to_book') return 'Отлично, всё основное уже известно. Откройте подходящую карточку ниже и нажмите «Забронировать» — выбранные данные перенесутся в оформление.';
  return 'Продолжим по вашему запросу — подберу вариант и доведу до бронирования.';
}

async function repairReplyWithModel(env, payload, body, history) {
  if (!env?.AI) return '';
  const step = clean(payload.nextStep, 80);
  const memory = payload.memory || {};
  const latest = clean(body?.message, 900);
  const recent = (Array.isArray(history) ? history : []).filter(isAssistant).map(textOf).filter(Boolean).slice(-4);
  const system = [
    'Ты продавец-консультант MAX TOUR. Напиши один естественный ответ клиенту на русском языке.',
    'Цель — без повторного опроса продвинуть клиента ровно на один шаг к бронированию.',
    'Не спрашивай то, что уже известно из MEMORY. Максимум один вопрос.',
    'Не выдумывай цены, наличие, даты, маршруты и условия. Не упоминай внутренние системы.',
    'Если NEXT_STEP=ask_interest — уточни только тип отдыха. ask_party — только состав. ask_date — только дату. ask_format — только формат.',
    'Если NEXT_STEP=ready_to_book — коротко предложи перейти к кнопке бронирования в карточке, без новых вопросов.',
    'Не повторяй RECENT_REPLIES дословно или почти дословно. 1–2 коротких предложения, человечно и по делу.',
    `NEXT_STEP=${step}`,
    `MEMORY=${JSON.stringify(memory)}`,
    `LATEST_USER=${JSON.stringify(latest)}`,
    `RECENT_REPLIES=${JSON.stringify(recent)}`,
  ].join('\n');
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), 2400); });
  const call = env.AI.run(env.AI_MODEL || DEFAULT_MODEL, {
    messages:[{ role:'system', content:system }, { role:'user', content:'Сформулируй следующий ответ.' }],
  }).catch(() => null);
  const result = await Promise.race([call, timeout]);
  clearTimeout(timer);
  const text = typeof result === 'string' ? result : (result?.response || result?.choices?.[0]?.message?.content || result?.choices?.[0]?.text || '');
  return clean(String(text || '').replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/i, ''), 1000);
}

function sidFromRequestOrResponse(request, response) {
  const requestSid = validSessionId(parseCookies(request.headers.get('cookie') || '').mt_v28_sid);
  if (requestSid) return requestSid;
  const setCookie = response.headers.get('set-cookie') || '';
  const match = setCookie.match(/(?:^|[,;]\s*)mt_v28_sid=([^;,]+)/i);
  return validSessionId(match ? decodeURIComponent(match[1]) : '');
}

async function clearAccidentalSelection(env, sid, origin) {
  if (!env?.DB || !sid) return;
  try {
    const row = await env.DB.prepare('SELECT memory_json FROM ai_conversation_memory WHERE session_id=?').bind(sid).first();
    if (!row?.memory_json) return;
    const memory = JSON.parse(row.memory_json);
    if (!memory || typeof memory !== 'object') return;
    memory.selectedTourId = '';
    memory.lastTourIds = [];
    if (clean(memory.destination, 80) === origin) memory.destination = '';
    await env.DB.prepare('UPDATE ai_conversation_memory SET memory_json=?,updated_at=CURRENT_TIMESTAMP WHERE session_id=?')
      .bind(JSON.stringify(memory), sid).run();
  } catch (error) {
    console.warn('AI v33 memory correction unavailable', error?.message || error);
  }
}

function jsonResponseFrom(response, payload) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(payload), {
    status:response.status,
    statusText:response.statusText,
    headers,
  });
}

export async function guardConversationResponse(request, env, url, response) {
  if (url.pathname !== '/api/ai/chat' || request.method !== 'POST') return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) return response;
  const body = await request.clone().json().catch(() => null);
  const payload = await response.clone().json().catch(() => null);
  if (!body || !payload?.ok) return response;

  const history = Array.isArray(body.history) ? body.history : [];
  const originOnly = originOnlyMessage(body.message);
  const memory = payload.memory && typeof payload.memory === 'object' ? { ...payload.memory } : {};
  const destination = clean(memory.destination, 100);
  const preferences = Array.isArray(memory.preferences) ? memory.preferences : [];
  const accidentalOriginTour = Boolean(
    originOnly &&
    !preferences.length &&
    (!destination || destination === originOnly) &&
    !historyHasDiscovery(history)
  );

  if (accidentalOriginTour) {
    memory.origin = memory.origin || originOnly;
    if (memory.destination === originOnly) memory.destination = '';
    memory.selectedTourId = '';
    payload.memory = memory;
    payload.tourId = '';
    payload.tourIds = [];
    payload.nextStep = 'ask_interest';
    payload.quickReplies = INTEREST_REPLIES;
    payload.bookingIntent = false;
    const sid = sidFromRequestOrResponse(request, response);
    await clearAccidentalSelection(env, sid, originOnly);
  }

  if (replyNeedsRepair(payload, history) || accidentalOriginTour) {
    const repaired = await repairReplyWithModel(env, payload, body, history);
    const candidate = repaired && !replyNeedsRepair({ ...payload, reply:repaired }, history) ? repaired : '';
    payload.reply = candidate || salesFallback(payload.nextStep, payload.memory || {});
    payload.source = candidate ? `${clean(payload.source, 100)}+quality-v33-model` : `${clean(payload.source, 100)}+quality-v33-fallback`;
  }

  return jsonResponseFrom(response, payload);
}

const browserSource = String.raw`(() => {
  'use strict';
  if (typeof document === 'undefined' || globalThis.__MAX_TOUR_CONVERSATION_V33__) return;
  const __locale = String(globalThis.localStorage?.getItem?.('max-tour-locale-v1') || 'ru').toLowerCase();
  if (__locale === 'vi' || __locale === 'en' || __locale === 'ko') return;
  globalThis.__MAX_TOUR_CONVERSATION_V33__ = true;

  const SERVER_KEY = 'max-tour-ai-server-state-v33';
  const RESET_KEY = 'max-tour-ai-reset-v33';
  const clean = value => String(value ?? '').replace(/\\s+/g, ' ').trim();
  const lower = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const WORDS = { один:1, одна:1, одного:1, два:2, две:2, двое:2, двоих:2, три:3, трое:3, троих:3, четыре:4, четверо:4, четверых:4, пять:5, пятеро:5, пятерых:5, шесть:6, шестеро:6, семь:7, семеро:7, восемь:8, восьмеро:8, девять:9, девятеро:9, десять:10, десятеро:10 };

  const read = () => { try { return JSON.parse(sessionStorage.getItem(SERVER_KEY) || 'null') || {}; } catch (_) { return {}; } };
  const write = value => { try { sessionStorage.setItem(SERVER_KEY, JSON.stringify(value || {})); } catch (_) {} };

  function isChat(input) {
    try {
      const raw = input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, location.href);
      return url.origin === location.origin && url.pathname === '/api/ai/chat';
    } catch (_) { return false; }
  }

  function assistant(item) { return item?.role === 'assistant' || item?.role === 'bot'; }
  function itemText(item) { return clean(item?.text ?? item?.content); }

  function cleanHistory(history, message) {
    const current = clean(message);
    const rows = (Array.isArray(history) ? history : []).filter(item => !(assistant(item) && /^подбираю[.…]*$/iu.test(itemText(item)))).map(item => ({ ...item }));
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i]?.role !== 'user') continue;
      if (current && itemText(rows[i]) === current) rows.splice(i, 1);
      break;
    }
    return rows.slice(-12);
  }

  function partyQuestion(text) {
    const q = lower(text);
    return /сколько\\s+(?:человек|вас)|сколько[^?!.]{0,45}(?:едет|поедет|поедут)|кто\\s+(?:едет|поедет)|состав[^?!.]{0,35}(?:групп|компан|турист)|вы\\s+вдвоем\\s+или|сколько[^?!.]{0,35}(?:взросл|дет)/u.test(q);
  }

  function countFrom(text) {
    const q = lower(text).replace(/[.!?]+$/g, '').trim();
    const numeric = q.match(/^(\\d{1,2})(?:\\s*(?:человек|чел\\.?|турист(?:а|ов)?))?$/u);
    if (numeric) { const n = Number(numeric[1]); return n >= 1 && n <= 30 ? n : 0; }
    const word = q.match(/^([а-я]+)(?:\\s+(?:человек|турист(?:а|ов)?))?$/u)?.[1] || '';
    return WORDS[word] || 0;
  }

  function latestBotQuestionFromDom() {
    const nodes = [...document.querySelectorAll('.ai-msg.bot .ai-msg-text')];
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const text = clean(nodes[i]?.textContent);
      if (text && !/^подбираю[.…]*$/iu.test(text)) return text;
    }
    return '';
  }

  function textareaFor(event) {
    if (event.type === 'submit') return event.target?.querySelector?.('textarea[name="message"]') || null;
    if (event.type === 'keydown' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) return event.target?.closest?.('textarea[name="message"]') || null;
    return null;
  }

  function normalizePartyInput(event) {
    const textarea = textareaFor(event);
    if (!textarea) return;
    const n = countFrom(textarea.value);
    if (!n || !partyQuestion(latestBotQuestionFromDom())) return;
    textarea.dataset.aiOriginalV33 = clean(textarea.value);
    textarea.value = 'Нас ' + n + ' взрослых';
    textarea.dispatchEvent(new Event('input', { bubbles:true }));
  }

  document.addEventListener('submit', normalizePartyInput, true);
  document.addEventListener('keydown', normalizePartyInput, true);

  function people(memory) {
    const adults = Math.max(0, Number(memory?.adults) || 0);
    const children = Array.isArray(memory?.children) ? memory.children.length : 0;
    const infants = Math.max(0, Number(memory?.infants) || 0);
    const parts = [];
    if (adults) parts.push(adults + ' взрослых');
    if (children) parts.push(children + ' детей');
    if (infants) parts.push(infants + ' малышей');
    return parts.join(', ');
  }

  function applyAuthoritativeContext(body) {
    const snapshot = read();
    const memory = snapshot?.memory;
    if (!memory || typeof memory !== 'object') return body;
    const context = { ...(body.context || {}) };
    if (memory.origin) context.origin = memory.origin;
    if (memory.pickup) context.pickup = memory.pickup;
    context.destination = memory.destination || '';
    context.format = memory.format || '';
    context.people = people(memory) || context.people || '';
    context.date = memory.date || '';
    context.preferences = Array.isArray(memory.preferences) ? memory.preferences : [];
    context.tourId = memory.selectedTourId || '';
    context.selectedTourId = memory.selectedTourId || '';
    return { ...body, context };
  }

  const previousFetch = globalThis.fetch;
  if (typeof previousFetch === 'function' && !previousFetch.__maxTourConversationV33) {
    const wrapped = async function(input, init = {}) {
      if (!isChat(input) || !init?.body || typeof init.body !== 'string') return previousFetch.call(this, input, init);
      let body;
      try { body = JSON.parse(init.body); } catch (_) { return previousFetch.call(this, input, init); }
      const originalMessage = clean(body?.message);
      body.history = cleanHistory(body.history, originalMessage);
      const lastAssistant = [...body.history].reverse().find(assistant);
      const n = countFrom(originalMessage);
      if (n && partyQuestion(itemText(lastAssistant))) {
        body.message = 'Нас ' + n + ' взрослых';
        body.context = { ...(body.context || {}), people:n + ' взрослых', partyCount:n };
      }
      body = applyAuthoritativeContext(body);
      try {
        if (sessionStorage.getItem(RESET_KEY) === '1') {
          body.resetConversation = true;
          sessionStorage.removeItem(RESET_KEY);
        }
      } catch (_) {}
      const response = await previousFetch.call(this, input, { ...init, body:JSON.stringify(body) });
      if (!response?.ok) return response;
      let payload;
      try { payload = await response.clone().json(); } catch (_) { return response; }
      if (!payload?.ok) return response;
      write({ memory:payload.memory || {}, nextStep:payload.nextStep || '', quickReplies:Array.isArray(payload.quickReplies) ? payload.quickReplies : [], tourId:payload.tourId || '', tourIds:Array.isArray(payload.tourIds) ? payload.tourIds : [], updatedAt:Date.now() });
      queueSync();
      return response;
    };
    wrapped.__maxTourConversationV33 = true;
    wrapped.__maxTourConversationPrevious = previousFetch;
    globalThis.fetch = wrapped;
  }

  function quickValue(label) {
    const value = clean(label);
    if (/^\\d+\\s+взросл/u.test(lower(value))) return 'Нас ' + value;
    return value;
  }

  let syncing = false;
  function syncDom() {
    if (syncing) return;
    syncing = true;
    try {
      const snapshot = read();
      const below = document.querySelector('.ai-chat-below');
      if (!below) return;
      const replies = Array.isArray(snapshot.quickReplies) ? snapshot.quickReplies.filter(Boolean) : [];
      let quick = below.querySelector('.ai-quick-replies');
      if (replies.length) {
        if (!quick) {
          quick = document.createElement('div');
          quick.className = 'ai-quick-replies';
          below.prepend(quick);
        }
        const signature = replies.join('|');
        if (quick.dataset.v33Signature !== signature) {
          quick.dataset.v33Signature = signature;
          quick.innerHTML = replies.map(label => '<button type="button" data-ai-action="quick" data-value="' + escapeHtml(quickValue(label)) + '">' + escapeHtml(label) + '</button>').join('');
        }
      } else if (quick && snapshot.nextStep) {
        quick.remove();
      }
      const results = below.querySelector('.ai-chat-results');
      if (results) {
        const hide = ['ask_origin','ask_interest','clarify_route'].includes(snapshot.nextStep) && !(snapshot.tourIds || []).length;
        results.style.display = hide ? 'none' : '';
      }
    } finally {
      syncing = false;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  }

  let queued = false;
  function queueSync() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; syncDom(); });
  }
  new MutationObserver(queueSync).observe(document.documentElement, { childList:true, subtree:true });

  document.addEventListener('click', event => {
    if (!event.target?.closest?.('[data-ai-action="clear"]')) return;
    try {
      sessionStorage.removeItem(SERVER_KEY);
      sessionStorage.setItem(RESET_KEY, '1');
    } catch (_) {}
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', queueSync, { once:true });
  else queueSync();

  globalThis.MaxTourAIConversationV33 = { read, cleanHistory, partyQuestion, countFrom, syncDom };
})();`;

export function serveConversationController(url) {
  if (url.pathname !== '/ai-conversation-quality-v33.js') return null;
  return new Response(browserSource, {
    status:200,
    headers:{
      'content-type':'application/javascript; charset=utf-8',
      'cache-control':'no-store, no-cache, must-revalidate',
    },
  });
}

export async function injectConversationController(response) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('/ai-conversation-quality-v33.js')) {
    return new Response(html, { status:response.status, statusText:response.statusText, headers:response.headers });
  }
  if (!html.includes('</body>')) {
    return new Response(html, { status:response.status, statusText:response.statusText, headers:response.headers });
  }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  const next = html.replace('</body>', '<script src="/ai-conversation-quality-v33.js?v=33"></script>\n</body>');
  return new Response(next, { status:response.status, statusText:response.statusText, headers });
}

export const _test = {
  latestAssistant,
  questionKind,
  historyHasDiscovery,
  salesFallback,
  similarity,
  peopleLabel,
};
