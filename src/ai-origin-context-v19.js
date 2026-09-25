(() => {
  'use strict';

  const ORIGIN_KEY = 'max-tour-ai-origin-v19';
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

    const originSignals = /(?:^|[\s,;:.!?])(?:я|мы)\s+(?:сейчас\s+)?(?:в|на)\b|(?:выезд|старт|отправлен|отправляемся|едем)\s+(?:будет\s+)?из\b|(?:^|[\s,;:.!?])из\s+(?:города\s+)?|(?:нет|точнее|поправка|вс[её]-?таки)[^.!?]{0,30}(?:выезд|старт)?\s*из\b/iu;
    if (originSignals.test(value)) return city;

    return '';
  }

  function currentOrigin() {
    const own = readJson(ORIGIN_KEY, {});
    if (clean(own.origin)) return clean(own.origin);
    const location = readJson(LOCATION_KEY, {});
    return clean(location.origin);
  }

  function syncSharedState(origin, { changed = false } = {}) {
    if (!origin) return;

    const location = readJson(LOCATION_KEY, {});
    const nextLocation = {
      ...location,
      origin,
      locationJustSet: changed ? true : Boolean(location.locationJustSet),
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

  function rememberOrigin(origin, source = 'message') {
    const value = clean(origin);
    if (!value) return '';
    const previous = currentOrigin();
    const changed = Boolean(previous && previous !== value);
    writeJson(ORIGIN_KEY, { origin:value, source, updatedAt:Date.now() });
    syncSharedState(value, { changed });
    return value;
  }

  function absorbMessage(text) {
    const value = clean(text);
    if (!value) return currentOrigin();
    const explicit = explicitOriginFrom(value);
    if (explicit) return rememberOrigin(explicit, hotelOriginFrom(value) ? 'hotel' : 'message');

    // A hotel/meeting point must never erase the already known city.
    const known = currentOrigin();
    if (known) syncSharedState(known, { changed:false });
    return known;
  }

  function pickupFrom(text) {
    const value = clean(text);
    if (/(?:океанус|oceanus)/iu.test(value)) return 'Oceanus';
    const match = value.match(/(?:из|от)\s+(?:отеля|гостиницы|апартаментов?)\s+([^,.!?]{2,80})/iu);
    return clean(match?.[1] || '');
  }

  function isAiChatRequest(input) {
    try {
      const raw = input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, location.href);
      return url.origin === location.origin && url.pathname === '/api/ai/chat';
    } catch (_) { return false; }
  }

  const previousFetch = globalThis.fetch;
  if (typeof previousFetch === 'function' && !previousFetch.__maxTourOriginContextV19) {
    const wrappedFetch = async function(input, init = {}) {
      if (!isAiChatRequest(input) || !init?.body || typeof init.body !== 'string') {
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

      const nextBody = { ...body, context, history };
      return previousFetch.call(this, input, { ...init, body:JSON.stringify(nextBody) });
    };
    wrappedFetch.__maxTourOriginContextV19 = true;
    wrappedFetch.__maxTourOriginContextPrevious = previousFetch;
    globalThis.fetch = wrappedFetch;
  }

  function valueFromEvent(event) {
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
      const value = valueFromEvent(event);
      if (value) absorbMessage(value);
    }, true);
  }

  const existing = currentOrigin();
  if (existing) rememberOrigin(existing, 'restored');

  globalThis.MaxTourAIOriginContextV19 = {
    currentOrigin,
    explicitOriginFrom,
    hotelOriginFrom,
    absorbMessage,
    rememberOrigin,
    pickupFrom,
    _test:{ cityFrom, explicitOriginFrom, hotelOriginFrom, pickupFrom },
  };
})();
