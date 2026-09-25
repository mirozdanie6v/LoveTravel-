(() => {
  'use strict';

  const AI_STATE_KEY = 'max-tour-ai-consultant-v5';
  const BOOKING_INTENT_KEY = 'max-tour-ai-booking-intent-v1';
  const UPGRADED_CLASS = 'ai-catalog-card-v7';
  const PENDING_ATTR = 'data-ai-catalog-upgrade';
  const MAX_RENDERER_SOURCE = 18000;
  let rendererCache = null;
  let catalogRenderAttempted = false;

  const text = value => String(value ?? '').trim();

  function tours() {
    try { return Array.isArray(TOURS) ? TOURS : []; }
    catch (_) { return []; }
  }

  function tourIdFromCard(card) {
    if (!card) return '';
    const direct = text(card.dataset?.tourId);
    if (direct) return direct;
    const handler = text(card.getAttribute?.('onclick'));
    const match = handler.match(/openTour\(\s*(['"])(.*?)\1\s*\)/);
    return match?.[2] || '';
  }

  function tourById(tourId) {
    return tours().find(item => String(item?.id) === String(tourId)) || null;
  }

  function existingCatalogCard(tourId, aiRoot) {
    const cards = [...document.querySelectorAll('.tour-card')];
    return cards.find(card => {
      if (aiRoot?.contains(card)) return false;
      if (card.classList.contains(UPGRADED_CLASS)) return false;
      return tourIdFromCard(card) === String(tourId);
    }) || null;
  }

  function ensureCatalogDom() {
    if (catalogRenderAttempted) return;
    catalogRenderAttempted = true;
    try {
      if (typeof renderCatalog === 'function') renderCatalog();
      else if (typeof globalThis.renderCatalog === 'function') globalThis.renderCatalog();
    } catch (_) {}
  }

  function nodeFromRendererResult(result, tourId) {
    if (!result) return null;
    let scope = null;
    if (typeof result === 'string') {
      const template = document.createElement('template');
      template.innerHTML = result.trim();
      scope = template.content;
    } else if (result?.nodeType) {
      scope = result;
    }
    if (!scope?.querySelectorAll) return null;
    const cards = scope.matches?.('.tour-card') ? [scope] : [...scope.querySelectorAll('.tour-card')];
    return cards.find(card => tourIdFromCard(card) === String(tourId)) || cards[0] || null;
  }

  function discoverPureCatalogRenderers() {
    if (rendererCache) return rendererCache;
    const preferred = ['tourCard', 'tourCardHtml', 'renderTourCard', 'createTourCard', 'catalogCard', 'renderCatalogCard', 'createCatalogCard'];
    const seen = new Set();
    const found = [];

    const consider = (name, fn) => {
      if (typeof fn !== 'function' || seen.has(fn)) return;
      let source = '';
      try { source = Function.prototype.toString.call(fn); } catch (_) { return; }
      if (source.length > MAX_RENDERER_SOURCE) return;
      if (!/tour-card/.test(source) || !/openTour/.test(source) || !/\breturn\b/.test(source)) return;
      if (/\.innerHTML\s*=|appendChild\(|replaceChildren\(|showScreen\(|window\.location|location\.assign/.test(source)) return;
      seen.add(fn);
      found.push({ name, fn });
    };

    preferred.forEach(name => {
      try { consider(name, globalThis[name]); } catch (_) {}
    });
    for (const name of Object.getOwnPropertyNames(globalThis)) {
      if (found.length >= 10) break;
      try { consider(name, globalThis[name]); } catch (_) {}
    }

    rendererCache = found;
    return rendererCache;
  }

  function renderWithOriginalCatalogRenderer(tourId) {
    const tour = tourById(tourId);
    if (!tour) return null;
    for (const { fn } of discoverPureCatalogRenderers()) {
      try {
        const result = fn.length >= 2 ? fn(tour, 0) : fn(tour);
        const card = nodeFromRendererResult(result, tourId);
        if (card) return card;
      } catch (_) {}
    }
    return null;
  }

  function cloneAsAiCatalogCard(source, tourId, wasHidden = false) {
    if (!source) return null;
    const clone = source.cloneNode(true);
    clone.classList.add(UPGRADED_CLASS);
    clone.classList.remove('ai-recommendation', 'ai-sales-card');
    clone.dataset.tourId = String(tourId);
    clone.dataset.aiCatalogSource = 'catalog';
    clone.removeAttribute(PENDING_ATTR);
    clone.hidden = Boolean(wasHidden);
    clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    return clone;
  }

  function catalogSourceFor(tourId, aiRoot) {
    let source = existingCatalogCard(tourId, aiRoot);
    if (source) return source;
    ensureCatalogDom();
    source = existingCatalogCard(tourId, aiRoot);
    if (source) return source;
    return renderWithOriginalCatalogRenderer(tourId);
  }

  function createCatalogCard(tourId, aiRoot, options = {}) {
    const source = catalogSourceFor(tourId, aiRoot);
    if (!source) return null;
    const card = cloneAsAiCatalogCard(source, tourId, Boolean(options.hidden));
    if (!card) return null;
    card.dataset.aiCatalogInjected = options.injected ? '1' : '0';
    return card;
  }

  function upgradeOne(oldCard, aiRoot) {
    if (!oldCard || oldCard.classList.contains(UPGRADED_CLASS)) return false;
    const tourId = tourIdFromCard(oldCard);
    if (!tourId) return false;
    const replacement = createCatalogCard(tourId, aiRoot, { hidden:oldCard.hidden });
    if (!replacement) {
      oldCard.setAttribute(PENDING_ATTR, 'pending');
      return false;
    }
    oldCard.replaceWith(replacement);
    return true;
  }

  function upgradeRecommendations(aiRoot) {
    if (!aiRoot) return 0;
    let changed = 0;
    aiRoot.querySelectorAll('.ai-recommendation.ai-sales-card[data-tour-id]').forEach(card => {
      if (upgradeOne(card, aiRoot)) changed += 1;
    });
    return changed;
  }

  function readAiState() {
    try { return JSON.parse(sessionStorage.getItem(AI_STATE_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function rememberBookingIntent(tourId) {
    const saved = readAiState();
    const slots = saved?.slots || {};
    const tour = tourById(tourId);
    if (!tour) return;

    const explicitDate = /^\d{4}-\d{2}-\d{2}$/.test(String(slots.date || '')) ? String(slots.date) : '';
    const format = slots.tripType === 'individual'
      ? 'individual'
      : slots.tripType === 'group'
        ? 'group'
        : tour.group
          ? 'group'
          : 'individual';

    const intent = {
      tourId:String(tour.id),
      title:String(tour.title || ''),
      format,
      date:explicitDate,
      adults:Math.max(1, Number(slots.adults) || 0),
      children:Array.isArray(slots.children) ? slots.children.slice(0, 12) : [],
      infants:Math.max(0, Number(slots.infants) || 0),
      createdAt:new Date().toISOString(),
      source:'AI-консультант',
    };

    try {
      sessionStorage.setItem(BOOKING_INTENT_KEY, JSON.stringify(intent));
      if (saved && typeof saved === 'object') {
        saved.selectedTourId = String(tour.id);
        sessionStorage.setItem(AI_STATE_KEY, JSON.stringify(saved));
      }
    } catch (_) {}
  }

  function bindBookingContext(aiRoot) {
    if (!aiRoot || aiRoot.dataset.aiCatalogV7Bound === '1') return;
    aiRoot.dataset.aiCatalogV7Bound = '1';
    aiRoot.addEventListener('click', event => {
      const card = event.target?.closest?.(`.${UPGRADED_CLASS}[data-tour-id]`);
      if (!card || event.target?.closest?.('.like')) return;
      rememberBookingIntent(card.dataset.tourId || tourIdFromCard(card));
    }, true);
  }

  function observe(aiRoot) {
    if (!aiRoot || aiRoot.dataset.aiCatalogV7Observed === '1') return;
    aiRoot.dataset.aiCatalogV7Observed = '1';
    let scheduled = false;
    let retries = 0;

    const run = () => {
      scheduled = false;
      const changed = upgradeRecommendations(aiRoot);
      const pending = aiRoot.querySelectorAll(`.ai-recommendation.ai-sales-card[data-tour-id][${PENDING_ATTR}="pending"]`).length;
      if (pending && retries < 8) {
        retries += 1;
        setTimeout(schedule, 120);
      } else if (changed) {
        retries = 0;
      }
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(run);
    };

    const observer = new MutationObserver(mutations => {
      if (!mutations.some(item => item.addedNodes?.length || item.removedNodes?.length)) return;
      schedule();
    });
    observer.observe(aiRoot, { childList:true, subtree:true });
    schedule();
  }

  const previous = globalThis.MaxTourAI;
  if (previous?.mount) {
    globalThis.MaxTourAI = {
      ...previous,
      mount(root) {
        previous.mount(root);
        bindBookingContext(root);
        observe(root);
        upgradeRecommendations(root);
      },
      _catalogCardV7Test:{ tourIdFromCard, rememberBookingIntent, upgradeRecommendations, createCatalogCard },
    };
  }

  const api = {
    upgradeRecommendations,
    createCatalogCard,
    rememberBookingIntent,
    tourById,
    _test:{ tourIdFromCard, discoverPureCatalogRenderers, catalogSourceFor, cloneAsAiCatalogCard },
  };
  globalThis.MaxTourCatalogCardV7 = api;
  globalThis.MaxTourCatalogCardV8 = api;
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
  const writeJson = (key, value) => {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };

  function aiState() { return readJson(AI_STATE_KEY, {}); }
  function locationState() { return readJson(LOCATION_KEY, {}); }
  function currentOrigin() {
    return clean(globalThis.MaxTourAIOriginContextV20?.currentOrigin?.())
      || clean(locationState().origin)
      || clean(aiState()?.slots?.origin);
  }
  function peopleCount(slots = aiState()?.slots || {}) {
    return Number(slots.adults || 0) + (Array.isArray(slots.children) ? slots.children.length : 0) + Number(slots.infants || 0);
  }
  function stageState(body = {}) {
    const saved = aiState();
    const slots = saved?.slots || {};
    const context = body?.context || {};
    const preferences = Array.isArray(context.preferences) && context.preferences.length
      ? context.preferences
      : (Array.isArray(slots.preferences) ? slots.preferences : []);
    return {
      origin: clean(context.origin) || currentOrigin(),
      people: peopleCount(slots),
      destination: clean(context.destination || slots.destination),
      preferences,
      date: clean(context.date || slots.date),
      format: clean(context.format || slots.tripType),
    };
  }
  function originGenitive(origin) {
    return ({
      'Нячанг':'Нячанга', 'Ханой':'Ханоя', 'Дананг':'Дананга', 'Фукуок':'Фукуока',
      'Муйне/Фантьет':'Муйне/Фантьета',
    })[origin] || origin;
  }
  function isFaq(text) {
    return /(?:что\s+входит|включен|не\s+входит|цена|стоимост|сколько\s+стоит|оплат|депозит|предоплат|отмен|возврат|перенос|гид|русскоязыч|трансфер|забер|отель|встреч|питани|обед|вегетари|аллерг|погод|дожд|шторм|что\s+взять|одежд|коляск|пожил|доступн|места|наличи)/iu.test(String(text || ''));
  }
  function isAiChatRequest(input) {
    try {
      const raw = input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, location.href);
      return url.origin === location.origin && url.pathname === '/api/ai/chat';
    } catch (_) { return false; }
  }
  function nextStageReply(state) {
    if (!state.origin) return '';
    if (!state.people) return 'Сколько человек едет? Если будут дети, укажите возраст — это влияет на цену.';
    if (!state.destination && !state.preferences.length) return 'Что вам больше хочется: море и острова, природа и красивые виды или обзор города?';
    if (!state.date) return `Подходящие варианты с выездом из ${originGenitive(state.origin)} уже подобраны. На какую дату хотите поехать?`;
    if (!state.format) return 'Какой формат удобнее — групповой или индивидуальный? После выбора сразу покажу варианты с ценой и бронированием.';
    return 'Готово — ниже подходящие экскурсии. Выберите вариант и нажмите «Забронировать»: дату и состав группы перенесу в оформление автоматически.';
  }
  function explicitOrigin(text) {
    try { return clean(globalThis.MaxTourAIOriginContextV20?.explicitOriginFrom?.(text)); }
    catch (_) { return ''; }
  }
  function clearTransientLocation(message) {
    const state = locationState();
    if (!state.origin) return;
    const explicit = explicitOrigin(message);
    const current = currentOrigin();
    if (explicit && explicit !== current) return;
    if (!state.locationJustSet) return;
    writeJson(LOCATION_KEY, { ...state, locationJustSet:false });
  }

  const previousFetch = globalThis.fetch;
  if (typeof previousFetch === 'function' && !previousFetch.__maxTourSalesFinalizerV23) {
    const wrappedFetch = async function(input, init = {}) {
      if (!isAiChatRequest(input) || !init?.body || typeof init.body !== 'string') return previousFetch.call(this, input, init);
      let body;
      try { body = JSON.parse(init.body); }
      catch (_) { return previousFetch.call(this, input, init); }

      const response = await previousFetch.call(this, input, init);
      clearTransientLocation(body?.message || '');
      if (!response?.ok || isFaq(body?.message || '')) return response;
      const data = await response.clone().json().catch(() => null);
      if (!data?.ok || data?.source === 'faq-verified') return response;
      const state = stageState(body);
      const reply = nextStageReply(state);
      if (!reply) return response;
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      return new Response(JSON.stringify({ ...data, reply, source:'sales-finalizer-v23' }), {
        status:response.status, statusText:response.statusText, headers,
      });
    };
    wrappedFetch.__maxTourSalesFinalizerV23 = true;
    wrappedFetch.__maxTourSalesFinalizerPrevious = previousFetch;
    globalThis.fetch = wrappedFetch;
  }

  function stageOptions() {
    const state = stageState();
    if (!state.origin) return [];
    if (!state.people) return [['2 взрослых','Нас 2 взрослых'],['С ребёнком','2 взрослых и ребёнок 7 лет']];
    if (!state.destination && !state.preferences.length) return [['Острова','Хочу море и острова'],['Красивые виды','Хочу природу и красивые виды'],['Обзор города','Хочу обзорную экскурсию']];
    if (!state.date) return [['Сегодня','Сегодня'],['Завтра','Завтра'],['Дата гибкая','Дата гибкая']];
    if (!state.format) return [['Групповой','Хочу групповой тур'],['Индивидуальный','Хочу индивидуальный тур']];
    return [];
  }

  function ensureQuickReplies(root) {
    const below = root?.querySelector?.('.ai-chat-below');
    if (!below) return;
    const options = stageOptions();
    let box = below.querySelector('.ai-quick-replies');
    if (!options.length) {
      // Preserve native v5 first-screen quick replies. This layer may only
      // remove the stage-specific box that it created itself.
      if (box?.dataset?.salesFlowV23 === '1') box.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.className = 'ai-quick-replies';
      below.prepend(box);
    }
    const desired = options.map(([label,value]) => `<button type="button" data-ai-action="quick" data-value="${String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">${label}</button>`).join('');
    if (box.innerHTML !== desired) box.innerHTML = desired;
    box.dataset.salesFlowV23 = '1';
  }

  function ensureBookingStyle() {
    if (document.getElementById('ai-catalog-book-v23-style')) return;
    const style = document.createElement('style');
    style.id = 'ai-catalog-book-v23-style';
    style.textContent = '.ai-catalog-book-v23{width:100%;margin:8px 0 16px;min-height:48px;font-weight:800}.ai-catalog-card-v7[hidden]+.ai-catalog-book-v23{display:none!important}';
    document.head.append(style);
  }

  function ensureBookingButtons(root) {
    ensureBookingStyle();
    const lists = root?.querySelectorAll?.('.ai-sales-results .ai-recommendations') || [];
    lists.forEach(list => {
      const cards = [...list.querySelectorAll(':scope > .tour-card[data-tour-id]')];
      const validIds = new Set(cards.map(card => String(card.dataset.tourId || '')));
      list.querySelectorAll(':scope > .ai-catalog-book-v23').forEach(button => {
        if (!validIds.has(String(button.dataset.id || ''))) button.remove();
      });
      cards.forEach(card => {
        const id = String(card.dataset.tourId || '');
        if (!id) return;
        let button = [...list.querySelectorAll(':scope > .ai-catalog-book-v23')].find(node => String(node.dataset.id || '') === id);
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.className = 'primary ai-catalog-book-v23';
          button.dataset.aiAction = 'book-tour';
          button.dataset.id = id;
          button.textContent = 'Забронировать';
        }
        if (card.nextElementSibling !== button) card.after(button);
      });
    });
  }

  let scheduled = false;
  function refreshSalesUi() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const root = document.querySelector('#aiScreen,#ai,[data-screen="ai"]') || document.querySelector('.ai-consultant-shell')?.parentElement;
      if (!root) return;
      ensureQuickReplies(root);
      ensureBookingButtons(root);
    });
  }

  new MutationObserver(refreshSalesUi).observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener('click', refreshSalesUi, true);
  document.addEventListener('submit', refreshSalesUi, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshSalesUi, { once:true });
  else refreshSalesUi();

  globalThis.MaxTourAISalesFinalizerV23 = {
    stageState,
    nextStageReply,
    stageOptions,
    clearTransientLocation,
    _test:{ isFaq, originGenitive },
  };
})();
