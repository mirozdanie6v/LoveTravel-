const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

const PARTY_WORDS = new Map([
  ['один', 1], ['одна', 1], ['одного', 1],
  ['два', 2], ['две', 2], ['двое', 2], ['двоих', 2],
  ['три', 3], ['трое', 3], ['троих', 3],
  ['четыре', 4], ['четверо', 4], ['четверых', 4],
  ['пять', 5], ['пятеро', 5], ['пятерых', 5],
  ['шесть', 6], ['шестеро', 6],
  ['семь', 7], ['семеро', 7],
  ['восемь', 8], ['восьмеро', 8],
  ['девять', 9], ['девятеро', 9],
  ['десять', 10], ['десятеро', 10],
]);

export function partyQuestion(text) {
  const q = lower(text);
  if (!q) return false;
  return /сколько\s+(?:человек|вас)|сколько[^?!.]{0,35}(?:едет|поедет|поедут)|кто\s+(?:едет|поедет)|состав[^?!.]{0,30}(?:групп|компан|турист)|вдвоем\s+или\s+компан|сколько[^?!.]{0,30}(?:взросл|дет)/u.test(q);
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

function latestPartyPrompt(history = []) {
  const rows = Array.isArray(history) ? history : [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const item = rows[index] || {};
    if (item.role !== 'assistant' && item.role !== 'bot') continue;
    const text = clean(item.text ?? item.content);
    if (!text || /^подбираю[.…]*$/iu.test(text)) continue;
    return text;
  }
  return '';
}

export function normalizePartyCountBody(body = {}) {
  const original = clean(body?.message);
  const count = standalonePartyCount(original);
  if (!count) return { body, normalized:false, count:0, original };

  const prompt = latestPartyPrompt(body?.history);
  if (!partyQuestion(prompt)) return { body, normalized:false, count:0, original };

  const expanded = `Нас ${count} взрослых`;
  const history = Array.isArray(body.history) ? body.history.map(item => ({ ...item })) : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item?.role !== 'user') continue;
    if (clean(item.text ?? item.content) !== original) continue;
    if ('content' in item && !('text' in item)) item.content = expanded;
    else item.text = expanded;
    break;
  }

  return {
    normalized:true,
    count,
    original,
    body:{
      ...body,
      message:expanded,
      history,
      context:{ ...(body.context || {}), people:`${count} взрослых`, partyCount:count },
    },
  };
}

export async function normalizePartyCountRequest(request, url = new URL(request.url)) {
  if (url.pathname !== '/api/ai/chat' || request.method !== 'POST') return request;
  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== 'object') return request;
  const normalized = normalizePartyCountBody(body);
  if (!normalized.normalized) return request;
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  return new Request(request.url, {
    method:request.method,
    headers,
    body:JSON.stringify(normalized.body),
    redirect:request.redirect,
  });
}

const browserSource = String.raw`(() => {
  'use strict';
  if (typeof document === 'undefined' || globalThis.__MAX_TOUR_PARTY_CONTEXT_V32__) return;
  const __locale = String(globalThis.localStorage?.getItem?.('max-tour-locale-v1') || 'ru').toLowerCase();
  if (__locale === 'vi' || __locale === 'en' || __locale === 'ko') return;
  globalThis.__MAX_TOUR_PARTY_CONTEXT_V32__ = true;

  const clean = value => String(value ?? '').replace(/\\s+/g, ' ').trim();
  const lower = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const WORDS = { один:1, одна:1, одного:1, два:2, две:2, двое:2, двоих:2, три:3, трое:3, троих:3, четыре:4, четверо:4, четверых:4, пять:5, пятеро:5, пятерых:5, шесть:6, шестеро:6, семь:7, семеро:7, восемь:8, восьмеро:8, девять:9, девятеро:9, десять:10, десятеро:10 };

  function partyQuestion(text) {
    const q = lower(text);
    return /сколько\\s+(?:человек|вас)|сколько[^?!.]{0,35}(?:едет|поедет|поедут)|кто\\s+(?:едет|поедет)|состав[^?!.]{0,30}(?:групп|компан|турист)|вдвоем\\s+или\\s+компан|сколько[^?!.]{0,30}(?:взросл|дет)/u.test(q);
  }

  function countFrom(text) {
    const q = lower(text).replace(/[.!?]+$/g, '').trim();
    const numeric = q.match(/^(\\d{1,2})(?:\\s*(?:человек|чел\\.?|турист(?:а|ов)?))?$/u);
    if (numeric) {
      const n = Number(numeric[1]);
      return n >= 1 && n <= 30 ? n : 0;
    }
    const word = q.match(/^([а-я]+)(?:\\s+(?:человек|турист(?:а|ов)?))?$/u)?.[1] || '';
    const n = WORDS[word] || 0;
    return n >= 1 && n <= 30 ? n : 0;
  }

  function latestAssistantQuestion() {
    const nodes = [...document.querySelectorAll('.ai-msg.bot .ai-msg-text')];
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const text = clean(nodes[index]?.textContent);
      if (!text || /^подбираю[.…]*$/iu.test(text)) continue;
      return text;
    }
    return '';
  }

  function textareaFor(event) {
    if (event.type === 'submit') return event.target?.querySelector?.('textarea[name="message"]') || null;
    if (event.type === 'keydown' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      return event.target?.closest?.('textarea[name="message"]') || null;
    }
    return null;
  }

  function normalize(event) {
    const textarea = textareaFor(event);
    if (!textarea) return;
    const count = countFrom(textarea.value);
    if (!count || !partyQuestion(latestAssistantQuestion())) return;
    textarea.dataset.aiOriginalPartyV32 = clean(textarea.value);
    textarea.value = 'Нас ' + count + ' взрослых';
    textarea.dispatchEvent(new Event('input', { bubbles:true }));
  }

  document.addEventListener('submit', normalize, true);
  document.addEventListener('keydown', normalize, true);

  globalThis.MaxTourAIPartyContextV32 = { partyQuestion, countFrom };
})();`;

export function servePartyContextGuard(url) {
  if (url.pathname !== '/ai-party-context-guard-v32.js') return null;
  return new Response(browserSource, {
    status:200,
    headers:{
      'content-type':'application/javascript; charset=utf-8',
      'cache-control':'no-store',
    },
  });
}

export async function injectPartyContextGuard(response) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('/ai-party-context-guard-v32.js')) {
    return new Response(html, { status:response.status, statusText:response.statusText, headers:response.headers });
  }
  const marker = '</body>';
  if (!html.includes(marker)) {
    return new Response(html, { status:response.status, statusText:response.statusText, headers:response.headers });
  }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  const next = html.replace(marker, '<script src="/ai-party-context-guard-v32.js?v=32"></script>\n</body>');
  return new Response(next, { status:response.status, statusText:response.statusText, headers });
}
