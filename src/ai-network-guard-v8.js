(() => {
  'use strict';

  const TIMEOUT_MS = 8000;
  const currentFetch = globalThis.fetch;
  if (typeof currentFetch !== 'function' || currentFetch.__maxTourAiNetworkGuardV8) return;

  function isAiChatRequest(input) {
    try {
      const raw = input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, location.href);
      return url.origin === location.origin && url.pathname === '/api/ai/chat';
    } catch (_) {
      return false;
    }
  }

  const guardedFetch = function(input, init = {}) {
    if (!isAiChatRequest(input) || init?.signal) return currentFetch.call(this, input, init);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('AI request timed out', 'TimeoutError')), TIMEOUT_MS);
    return currentFetch.call(this, input, { ...init, signal:controller.signal })
      .finally(() => clearTimeout(timer));
  };

  guardedFetch.__maxTourAiNetworkGuardV8 = true;
  guardedFetch.__maxTourAiNetworkTimeoutMs = TIMEOUT_MS;
  globalThis.fetch = guardedFetch;

  globalThis.MaxTourAINetworkGuardV8 = {
    timeoutMs:TIMEOUT_MS,
    _test:{ isAiChatRequest },
  };
})();

(() => {
  'use strict';

  if (typeof document === 'undefined') return;

  function submitQuickValue(button, value) {
    value = String(value || '').trim();
    if (!value) return false;

    const root = button.closest('#aiScreen,#ai,[data-screen="ai"]') || button.closest('.ai-consultant-shell')?.parentElement;
    const form = root?.querySelector?.('[data-ai-form="chat"]');
    const textarea = form?.querySelector?.('textarea[name="message"]');
    if (!form || !textarea || textarea.disabled) return false;

    textarea.value = value;
    try { globalThis.MaxTourAI?._locationTest?.inspectInput?.(value); } catch (_) {}

    textarea.dispatchEvent(new Event('input', { bubbles:true }));
    textarea.dispatchEvent(new Event('change', { bubbles:true }));
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true }));
    return true;
  }

  function submitQuickLocation(button) {
    return submitQuickValue(button, button?.dataset?.locationV6Value);
  }

  function submitQuickReply(button) {
    return submitQuickValue(button, button?.dataset?.value);
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#aiScreen [data-location-v6-value], #aiScreen [data-ai-action="quick"]');
    if (!button) return;
    const submitted = button.matches('[data-location-v6-value]')
      ? submitQuickLocation(button)
      : submitQuickReply(button);
    if (!submitted) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  globalThis.MaxTourAIFirstScreenQuickV19 = {
    submitQuickLocation,
    submitQuickReply,
    submitQuickValue,
  };
})();

(() => {
  'use strict';

  if (typeof document === 'undefined') return;

  const ORIGIN_KEY = 'max-tour-ai-origin-v20';
  const LOCATION_KEY = 'max-tour-ai-location-v6';
  const AI_STATE_KEY = 'max-tour-ai-consultant-v5';

  const CITY_PATTERNS = [
    ['Нячанг', /(?:нячанг(?:е|а|у|ом)?|nha\s*trang)/iu],
    ['Ханой', /(?:хано(?:й|е|я|ю|ем)|hanoi)/iu],
    ['Дананг', /(?:дананг(?:е|а|у|ом)?|da\s*nang)/iu],
    ['Фукуок', /(?:фу\s*куок(?:е|а|у|ом)?|phu\s*quoc)/iu],
    ['Муйне/Фантьет', /(?:муй\s*не|фан\s*тьет(?:е|а|у|ом)?|mui\s*ne|phan\s*thiet)/iu],
  ];

  const HOTEL_ORIGINS = [
    ['Нячанг', /(?:океанус|oceanus)/iu],
  ];

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const readJson = (key, fallback = {}) => {
    try { return JSON.parse(sessionStorage.getItem(key) || 'null') || fallback; }
    catch (_) { return fallback; }
  };
  const writeJson = (key, value) => {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };

  function cityFrom(text) {
    const value = clean(text);
    return CITY_PATTERNS.find(([, pattern]) => pattern.test(value))?.[0] || '';
  }

  function hotelOriginFrom(text) {
    const value = clean(text);
    return HOTEL_ORIGINS.find(([, pattern]) => pattern.test(value))?.[0] || '';
  }

  function explicitOriginFrom(text) {
    const value = clean(text);
    if (!value) return '';

    const hotel = hotelOriginFrom(value);
    if (hotel && /(?:из|от|забер|трансфер|выезд|старт|отправ)/iu.test(value)) return hotel;

    const city = cityFrom(value);
    if (!city) return '';

    const originSignals = /(?:^|[\s,;:.!?])(?:я|мы)\s+(?:сейчас\s+)?(?:в|на)(?:\s+|$)|(?:выезд|старт|отправлен|отправляемся|едем)\s+(?:будет\s+)?из(?:\s+|$)|(?:^|[\s,;:.!?])из(?:\s+|$)(?:города\s+)?|(?:нет|точнее|поправка|вс[её]-?таки)[^.!?]{0,30}(?:выезд|старт)?\s*из(?:\s+|$)/iu;
    return originSignals.test(value) ? city : '';
  }

  function currentOrigin() {
    const own = readJson(ORIGIN_KEY, {});
    if (clean(own.origin)) return clean(own.origin);
    return clean(readJson(LOCATION_KEY, {}).origin);
  }

  function syncSharedState(origin, { changed = false } = {}) {
    if (!origin) return;

    const locationState = readJson(LOCATION_KEY, {});
    const nextLocation = {
      ...locationState,
      origin,
      locationJustSet: changed ? true : Boolean(locationState.locationJustSet),
    };
    if (changed) nextLocation.requestedDestination = '';
    writeJson(LOCATION_KEY, nextLocation);

    const ai = readJson(AI_STATE_KEY, {});
    if (ai?.slots) {
      ai.slots.origin = origin;
      if (changed) {
        ai.slots.destination = '';
        ai.recommendations = [];
        ai.selectedTourId = '';
      } else if (!nextLocation.requestedDestination && clean(ai.slots.destination) === origin) {
        ai.slots.destination = '';
      }
      writeJson(AI_STATE_KEY, ai);
    }
  }

  function syncLiveLocationGuard(origin) {
    try { globalThis.MaxTourAI?._locationTest?.inspectInput?.(`выезд из ${origin}`); }
    catch (_) {}
  }

  function rememberOrigin(origin, source = 'message') {
    const value = clean(origin);
    if (!value) return '';
    const previous = currentOrigin();
    const changed = Boolean(previous && previous !== value);
    writeJson(ORIGIN_KEY, { origin:value, source, updatedAt:Date.now() });
    syncSharedState(value, { changed });
    syncLiveLocationGuard(value);
    return value;
  }

  function absorbMessage(text) {
    const value = clean(text);
    if (!value) return currentOrigin();
    const explicit = explicitOriginFrom(value);
    if (explicit) return rememberOrigin(explicit, hotelOriginFrom(value) ? 'hotel' : 'message');

    const known = currentOrigin();
    if (known) {
      syncSharedState(known, { changed:false });
      syncLiveLocationGuard(known);
    }
    return known;
  }

  function pickupFrom(text) {
    const value = clean(text);
    if (/(?:океанус|oceanus)/iu.test(value)) return 'Oceanus';
    const match = value.match(/(?:из|от)\s+(?:отеля|гостиницы|апартаментов?)\s+([^,.!?]{2,80})/iu);
    return clean(match?.[1] || '');
  }

  function isAiChatRequestV20(input) {
    try {
      const raw = input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, location.href);
      return url.origin === location.origin && url.pathname === '/api/ai/chat';
    } catch (_) { return false; }
  }

  const previousFetch = globalThis.fetch;
  if (typeof previousFetch === 'function' && !previousFetch.__maxTourOriginContextV20) {
    const wrappedFetch = async function(input, init = {}) {
      if (!isAiChatRequestV20(input) || !init?.body || typeof init.body !== 'string') {
        return previousFetch.call(this, input, init);
      }

      let body;
      try { body = JSON.parse(init.body); }
      catch (_) { return previousFetch.call(this, input, init); }

      const origin = absorbMessage(body?.message || '') || currentOrigin();
      if (!origin) return previousFetch.call(this, input, init);

      const locationState = readJson(LOCATION_KEY, {});
      const context = { ...(body.context || {}), origin };
      if (!locationState.requestedDestination && clean(context.destination) === origin) context.destination = '';
      const pickup = pickupFrom(body?.message || '');
      if (pickup) context.pickup = pickup;

      const history = Array.isArray(body.history) ? [...body.history] : [];
      const synthetic = `Точка выезда: ${origin}.${pickup ? ` Место встречи: ${pickup}.` : ''}`;
      if (!history.some(item => item?.role === 'user' && clean(item?.text) === synthetic)) {
        history.unshift({ role:'user', text:synthetic });
      }

      return previousFetch.call(this, input, {
        ...init,
        body:JSON.stringify({ ...body, context, history }),
      });
    };
    wrappedFetch.__maxTourOriginContextV20 = true;
    wrappedFetch.__maxTourOriginContextPrevious = previousFetch;
    globalThis.fetch = wrappedFetch;
  }

  function eventValue(event) {
    const target = event.target;
    if (event.type === 'click') {
      const button = target?.closest?.('[data-location-v6-value],[data-ai-action="quick"]');
      return clean(button?.dataset?.locationV6Value || button?.dataset?.value || '');
    }
    if (event.type === 'submit') return clean(target?.querySelector?.('textarea[name="message"]')?.value || '');
    if (event.type === 'keydown' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      return clean(target?.closest?.('textarea[name="message"]')?.value || '');
    }
    return '';
  }

  for (const type of ['click','submit','keydown']) {
    document.addEventListener(type, event => {
      const value = eventValue(event);
      if (value) absorbMessage(value);
    }, true);
  }

  const restored = currentOrigin();
  if (restored) rememberOrigin(restored, 'restored');

  globalThis.MaxTourAIOriginContextV20 = {
    currentOrigin,
    explicitOriginFrom,
    hotelOriginFrom,
    absorbMessage,
    rememberOrigin,
    pickupFrom,
    _test:{ cityFrom, explicitOriginFrom, hotelOriginFrom, pickupFrom },
  };
})();

(() => {
  'use strict';

  if (typeof document === 'undefined') return;

  const TWO_ADULTS = 'Нас 2 взрослых';
  const shortcut = value => /^(?:мы\s+)?вдво[её]м[.!]?$/iu.test(String(value || '').trim());

  function normalizeTwoAdultsInput(event) {
    let textarea = null;
    if (event.type === 'submit') textarea = event.target?.querySelector?.('textarea[name="message"]');
    if (event.type === 'keydown' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      textarea = event.target?.closest?.('textarea[name="message"]');
    }
    if (!textarea || !shortcut(textarea.value)) return;
    textarea.dataset.aiOriginalPartyV21 = textarea.value.trim();
    textarea.value = TWO_ADULTS;
    textarea.dispatchEvent(new Event('input', { bubbles:true }));
  }

  document.addEventListener('submit', normalizeTwoAdultsInput, true);
  document.addEventListener('keydown', normalizeTwoAdultsInput, true);

  const grammarPairs = [
    [/Из Нячанг(?=[\s,.!?]|$)/gu, 'Из Нячанга'],
    [/из Нячанг(?=[\s,.!?]|$)/gu, 'из Нячанга'],
    [/Из Ханой(?=[\s,.!?]|$)/gu, 'Из Ханоя'],
    [/из Ханой(?=[\s,.!?]|$)/gu, 'из Ханоя'],
    [/Из Дананг(?=[\s,.!?]|$)/gu, 'Из Дананга'],
    [/из Дананг(?=[\s,.!?]|$)/gu, 'из Дананга'],
    [/Из Фукуок(?=[\s,.!?]|$)/gu, 'С Фукуока'],
    [/из Фукуок(?=[\s,.!?]|$)/gu, 'с Фукуока'],
  ];

  function fixGrammar(text) {
    return grammarPairs.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), String(text || ''));
  }

  let queued = false;
  function polishBotCopy() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      document.querySelectorAll('.ai-msg.bot .ai-msg-text').forEach(node => {
        const next = fixGrammar(node.textContent || '');
        if (next !== node.textContent) node.textContent = next;
      });
    });
  }

  new MutationObserver(polishBotCopy).observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', polishBotCopy, { once:true });
  else polishBotCopy();

  globalThis.MaxTourAIConversationPolishV21 = {
    shortcut,
    fixGrammar,
  };
})();

(() => {
  'use strict';

  if (typeof document === 'undefined') return;

  const AI_STATE_KEY = 'max-tour-ai-consultant-v5';
  const LOCATION_KEY = 'max-tour-ai-location-v6';
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const lower = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const readJson = (key, fallback = {}) => {
    try { return JSON.parse(sessionStorage.getItem(key) || 'null') || fallback; }
    catch (_) { return fallback; }
  };

  function isAiChatRequest(input) {
    try {
      const raw = input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, location.href);
      return url.origin === location.origin && url.pathname === '/api/ai/chat';
    } catch (_) { return false; }
  }

  function currentOrigin(body = {}) {
    return clean(body?.context?.origin)
      || clean(globalThis.MaxTourAIOriginContextV20?.currentOrigin?.())
      || clean(readJson(LOCATION_KEY, {}).origin)
      || clean(readJson(AI_STATE_KEY, {})?.slots?.origin);
  }

  function peopleKnown(context = {}, slots = {}) {
    const label = lower(context.people);
    if (label && !/состав не указан|не указан|неизвест/.test(label)) return true;
    return Number(slots.adults || 0) + (Array.isArray(slots.children) ? slots.children.length : 0) + Number(slots.infants || 0) > 0;
  }

  function snapshot(body = {}) {
    const ai = readJson(AI_STATE_KEY, {});
    const slots = ai?.slots || {};
    const context = body?.context || {};
    const preferences = Array.isArray(context.preferences) && context.preferences.length
      ? context.preferences
      : (Array.isArray(slots.preferences) ? slots.preferences : []);
    return {
      origin: currentOrigin(body),
      destination: clean(context.destination || slots.destination),
      date: clean(context.date || slots.date),
      format: clean(context.format || slots.tripType),
      preferences,
      peopleKnown: peopleKnown(context, slots),
      recommendationCount: Array.isArray(ai?.recommendations) ? ai.recommendations.length : 0,
    };
  }

  function explicitOrigin(text) {
    try { return clean(globalThis.MaxTourAIOriginContextV20?.explicitOriginFrom?.(text)); }
    catch (_) { return ''; }
  }

  function isFaqMessage(text) {
    return /(?:что\s+входит|включен|не\s+входит|цена|стоимост|сколько\s+стоит|оплат|депозит|предоплат|отмен|возврат|перенос|гид|русскоязыч|трансфер|забер|отель|встреч|питани|обед|вегетари|аллерг|погод|дожд|шторм|что\s+взять|одежд|коляск|пожил|лет\s+маме|доступн|места|наличи)/iu.test(String(text || ''));
  }

  function isSalesInput(text) {
    return /(?:море|остров|природ|вид|город|обзор|далат|фуйен|хойан|халонг|ниньбинь|вдво|взросл|реб[её]нок|дет|человек|сегодня|завтра|дата|числ|групп|индив|премиум|комфорт|подешев|бюджет|насыщенн)/iu.test(String(text || ''));
  }

  function genericLoopReply(reply) {
    const q = lower(reply);
    return /(?:могу\s+подобрать|точка\s+выезда|вариантов\s+много|куда\s+хотите\s+поехать|подберу\s+варианты\s+с\s+выездом)/u.test(q);
  }

  function hasProgressCue(reply) {
    const q = lower(reply);
    return /\?|заброни|выберите|ниже|показываю|нажмите|оформ/.test(q);
  }

  function originGenitive(origin) {
    const map = {
      'Нячанг':'Нячанга',
      'Ханой':'Ханоя',
      'Дананг':'Дананга',
      'Фукуок':'Фукуока',
      'Муйне/Фантьет':'Муйне/Фантьета',
    };
    return map[origin] || origin;
  }

  function nextSalesReply(state) {
    if (!state.origin) return '';
    if (!state.peopleKnown) {
      return 'Отлично. Сколько человек едет? Если будут дети, укажите возраст — это влияет на цену.';
    }
    if (!state.destination && !state.preferences.length) {
      return 'Теперь подберём саму экскурсию. Что вам больше хочется: море и острова, природа и красивые виды или обзор города?';
    }
    if (!state.date) {
      return `Подходящие варианты с выездом из ${originGenitive(state.origin)} уже подобраны. На какую дату хотите поехать?`;
    }
    if (!state.format) {
      return 'Дата есть. Какой формат удобнее — групповой или индивидуальный? После выбора сразу покажу подходящие варианты с ценой и бронированием.';
    }
    return 'Готово — ниже подходящие экскурсии. Выберите вариант и нажмите «Забронировать»: дату и состав группы перенесу в оформление автоматически.';
  }

  function shouldAdvance(body, data, state) {
    const message = clean(body?.message);
    if (!message || isFaqMessage(message)) return false;
    const explicit = explicitOrigin(message);
    if (explicit && (!state.origin || explicit !== state.origin)) return false;
    const reply = clean(data?.reply);
    if (!reply) return true;
    if (genericLoopReply(reply)) return true;
    const incomplete = !state.peopleKnown || (!state.destination && !state.preferences.length) || !state.date || !state.format;
    if (incomplete && isSalesInput(message) && !hasProgressCue(reply)) return true;
    return false;
  }

  const previousFetch = globalThis.fetch;
  if (typeof previousFetch === 'function' && !previousFetch.__maxTourSalesFlowV22) {
    const wrappedFetch = async function(input, init = {}) {
      if (!isAiChatRequest(input) || !init?.body || typeof init.body !== 'string') {
        return previousFetch.call(this, input, init);
      }

      let body;
      try { body = JSON.parse(init.body); }
      catch (_) { return previousFetch.call(this, input, init); }

      const state = snapshot(body);
      const response = await previousFetch.call(this, input, init);
      if (!response?.ok) return response;

      const data = await response.clone().json().catch(() => null);
      if (!data?.ok || data?.source === 'faq-verified' || !shouldAdvance(body, data, state)) return response;

      const reply = nextSalesReply(state);
      if (!reply) return response;
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      return new Response(JSON.stringify({ ...data, reply, source:'sales-flow-v22' }), {
        status:response.status,
        statusText:response.statusText,
        headers,
      });
    };
    wrappedFetch.__maxTourSalesFlowV22 = true;
    wrappedFetch.__maxTourSalesFlowPrevious = previousFetch;
    globalThis.fetch = wrappedFetch;
  }

  function formatStageReady() {
    const state = snapshot({ context:{} });
    return Boolean(state.origin && state.peopleKnown && (state.destination || state.preferences.length) && state.date && !state.format);
  }

  let queued = false;
  function ensureFormatQuickReplies() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const shell = document.querySelector('.ai-consultant-shell');
      if (!shell) return;
      let box = shell.querySelector('.ai-quick-replies');

      if (!formatStageReady()) {
        if (box?.dataset?.salesFlowV22 === 'format') box.remove();
        return;
      }

      const below = shell.querySelector('.ai-chat-below');
      if (!below) return;
      if (!box) {
        box = document.createElement('div');
        box.className = 'ai-quick-replies';
        below.prepend(box);
      }
      if (box.dataset.salesFlowV22 === 'format') return;
      box.dataset.salesFlowV22 = 'format';
      box.innerHTML = '<button type="button" data-ai-action="quick" data-value="Хочу групповой тур">Групповой</button><button type="button" data-ai-action="quick" data-value="Хочу индивидуальный тур">Индивидуальный</button>';
    });
  }

  new MutationObserver(ensureFormatQuickReplies).observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureFormatQuickReplies, { once:true });
  else ensureFormatQuickReplies();

  globalThis.MaxTourAISalesFlowV22 = {
    snapshot,
    nextSalesReply,
    shouldAdvance,
    _test:{ isFaqMessage, isSalesInput, genericLoopReply, hasProgressCue, formatStageReady },
  };
})();
