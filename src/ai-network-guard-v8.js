(() => {
  'use strict';

  const TIMEOUT_MS = 35000;
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

/* Server consultation replies are authoritative; the network timeout guard remains active. */
