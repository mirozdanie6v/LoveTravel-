(() => {
  'use strict';
  const activeLocale = String(globalThis.localStorage?.getItem?.('max-tour-locale-v1') || 'ru').toLowerCase();
  if (activeLocale === 'vi' || activeLocale === 'en' || activeLocale === 'ko') return;

  const KEY = 'max-tour-ai-location-v6';
  const CARD_SELECTOR = '.ai-catalog-card-v7[data-tour-id],.ai-sales-card[data-tour-id]';
  const PLACES = [
    ['Нячанг', /нячанг|на-?чанг|nha\s*trang/i],
    ['Ханой', /ханой|ханое|hanoi/i],
    ['Ниньбинь', /нинь\s*бинь?|ниньбинь?|ninh\s*binh/i],
    ['Халонг', /ха\s*лонг|халонг|ha\s*long/i],
    ['Далат', /далат|da\s*lat/i],
    ['Дананг', /дананг|да-?нанг|da\s*nang/i],
    ['Хойан', /хой\s*ан|хойан|hoi\s*an/i],
    ['Фукуок', /фу\s*куок|фукуок|phu\s*quoc/i],
    ['Муйне/Фантьет', /муй\s*не|муйне|фантьет|фан\s*тьет|mui\s*ne|phan\s*thiet/i],
    ['Фуйен', /фу[йи]ен|фуйен|туй\s*хоа|phu\s*yen|tuy\s*hoa/i],
  ];
  const ROUTES = {
    'Нячанг': new Set(['Нячанг','Далат','Фуйен','Муйне/Фантьет']),
    'Ханой': new Set(['Ханой','Ниньбинь','Халонг']),
    'Дананг': new Set(['Дананг','Хойан']),
    'Фукуок': new Set(['Фукуок']),
    'Далат': new Set(['Далат']),
    'Муйне/Фантьет': new Set(['Муйне/Фантьет']),
    'Фуйен': new Set(['Фуйен']),
    'Хойан': new Set(['Хойан','Дананг']),
    'Халонг': new Set(['Халонг','Ханой']),
    'Ниньбинь': new Set(['Ниньбинь','Ханой']),
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const lower = value => String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
  const placeFrom = value => PLACES.find(([,pattern]) => pattern.test(String(value || '')))?.[0] || '';
  const placesFrom = value => PLACES.filter(([,pattern]) => pattern.test(String(value || ''))).map(([name]) => name);
  const allowed = (origin,destination) => !origin || !destination ? true : (ROUTES[origin]?.has(destination) ?? origin === destination);

  let state = { origin:'', requestedDestination:'', locationJustSet:false, lastInput:'' };
  try { state = { ...state, ...(JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}) }; } catch (_) {}
  let processing = false;
  let postprocessQueued = false;

  function tours() {
    try { return Array.isArray(TOURS) ? TOURS : []; }
    catch (_) { return []; }
  }

  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }
  function reset() {
    state = { origin:'', requestedDestination:'', locationJustSet:false, lastInput:'' };
    try { sessionStorage.removeItem(KEY); } catch (_) {}
  }

  function isOriginPhrase(text, place) {
    const q = lower(text), token = lower(place).split('/')[0];
    return (/(?:^|\s)(?:я|мы|сейчас|нахожусь|находимся|живу|живем)[^.!?]{0,18}(?:в|на)\s+/i.test(q) && q.includes(token)) || (/(?:^|\s)(?:из|выезд\s+из|старт\s+из)\s+/i.test(q) && q.includes(token));
  }
  function isDestinationPhrase(text) { return /хочу|поех|съезд|экскурс|тур\b|покаж|скин|пришл|подбер|вариант/i.test(String(text || '')); }

  function inspectInput(text) {
    const q = String(text || '').trim();
    if (!q) return;
    state.lastInput = q;
    const found = PLACES.filter(([,pattern]) => pattern.test(q)).map(([name]) => name);
    let origin = found.find(place => isOriginPhrase(q,place));
    if (!origin && found.length === 1 && !state.origin && !isDestinationPhrase(q)) origin = found[0];
    if (origin) {
      state.origin = origin;
      state.locationJustSet = !isDestinationPhrase(q);
      if (state.requestedDestination === origin) state.requestedDestination = '';
    } else {
      state.locationJustSet = false;
    }
    if (isDestinationPhrase(q)) {
      const destination = found.find(place => place !== state.origin) || found[0] || '';
      if (destination) state.requestedDestination = destination;
    } else if (state.origin && found.length === 1 && found[0] !== state.origin) {
      state.requestedDestination = found[0];
    }
    save();
  }

  function tourData(card) {
    const id = card?.dataset?.tourId;
    if (!id) return null;
    return tours().find(item => String(item?.id) === String(id)) || null;
  }

  function tourPlacesFromTour(tour) {
    if (!tour) return [];
    return placesFrom(`${tour.city || ''} ${tour.region || ''} ${tour.title || ''} ${tour.searchText || ''} ${(tour.tags || []).join(' ')} ${(tour.route || []).join(' ')}`);
  }

  function tourPlaces(card) {
    const tour = tourData(card);
    return tour ? tourPlacesFromTour(tour) : placesFrom(card?.textContent || '');
  }

  function filterCards(root) {
    if (!state.origin) return 0;
    let visible = 0;
    root.querySelectorAll(CARD_SELECTOR).forEach(card => {
      const destinations = tourPlaces(card);
      const routeOk = destinations.some(destination => allowed(state.origin,destination));
      const destinationOk = !state.requestedDestination || destinations.includes(state.requestedDestination);
      card.hidden = !(routeOk && destinationOk);
      if (!card.hidden) visible += 1;
    });

    root.querySelectorAll('.ai-sales-results').forEach(group => {
      const cards = [...group.querySelectorAll(CARD_SELECTOR)];
      if (cards.length) group.hidden = cards.every(card => card.hidden);
      const label = group.querySelector('.ai-chat-results-label');
      const desired = `Подходящие экскурсии из ${state.origin}`;
      if (label && !group.hidden && label.textContent !== desired) label.textContent = desired;
    });
    return visible;
  }

  function catalogCandidates() {
    if (!state.origin || !state.requestedDestination || !allowed(state.origin,state.requestedDestination)) return [];
    const destination = state.requestedDestination;
    return tours()
      .map(tour => {
        const places = tourPlacesFromTour(tour);
        if (!places.includes(destination)) return null;
        let score = 0;
        if (places.includes(state.origin)) score += 8;
        if (placeFrom(tour.city || '') === state.origin) score += 6;
        if (placeFrom(tour.region || '') === destination) score += 5;
        if (lower(tour.title || '').includes(lower(destination))) score += 5;
        if (Number(tour.popular)) score += 1;
        return { tour, score };
      })
      .filter(Boolean)
      .sort((a,b) => b.score - a.score)
      .slice(0,3)
      .map(row => row.tour);
  }

  function ensureRequestedCatalogCards(root, visibleCards) {
    if (visibleCards > 0 || !state.origin || !state.requestedDestination) return 0;
    const parity = globalThis.MaxTourCatalogCardV8 || globalThis.MaxTourCatalogCardV7;
    if (!parity?.createCatalogCard) return 0;
    const candidates = catalogCandidates();
    if (!candidates.length) return 0;
    const below = root.querySelector('.ai-chat-below');
    if (!below) return 0;

    let group = root.querySelector('.ai-location-catalog-v8');
    if (!group) {
      group = document.createElement('div');
      group.className = 'ai-chat-results ai-sales-results ai-location-catalog-v8';
      group.innerHTML = '<div class="ai-msg-author">AI-консультант</div><div class="ai-chat-results-label"></div><div class="ai-recommendations"></div>';
      below.append(group);
    }

    const ids = candidates.map(tour => String(tour.id));
    const signature = `${state.origin}>${state.requestedDestination}:${ids.join(',')}`;
    const recommendations = group.querySelector('.ai-recommendations');
    if (group.dataset.signature !== signature && recommendations) {
      const fragment = document.createDocumentFragment();
      ids.forEach(id => {
        const card = parity.createCatalogCard(id, root, { injected:true });
        if (card) fragment.append(card);
      });
      recommendations.replaceChildren(fragment);
      group.dataset.signature = signature;
    }
    const label = group.querySelector('.ai-chat-results-label');
    if (label) label.textContent = `Подходящие экскурсии из ${state.origin}`;
    const count = recommendations?.querySelectorAll('.tour-card[data-tour-id]').length || 0;
    group.hidden = count === 0;
    return count;
  }

  function routeReply() {
    const destination = state.requestedDestination;
    if (!state.origin || !destination) return '';
    if (!allowed(state.origin,destination)) return `Из ${state.origin} направление ${destination} сейчас не относится к доступным маршрутам. Укажите другую точку выезда или направление.`;
    return `${destination} с выездом из ${state.origin} можно подобрать. Если в каталоге нет готовой экскурсии, оформим маршрут по запросу: уточним дату и состав группы, после чего подтвердим наличие и цену.`;
  }

  function locationReply() {
    if (state.origin === 'Ханой') return 'Хорошо, выезд из Ханоя. Могу подобрать Ниньбинь, Халонг, варианты по Ханою или другой маршрут.';
    if (state.origin === 'Нячанг') return 'Хорошо, выезд из Нячанга. Могу подобрать острова, Нячанг, Далат, Фуйен и другие доступные маршруты.';
    if (state.origin === 'Дананг') return 'Хорошо, выезд из Дананга. Могу подобрать Дананг, Хойан и другие доступные варианты.';
    return `Хорошо, точка выезда — ${state.origin}. Куда хотите поехать?`;
  }

  function lastBotText(root) {
    const nodes = [...root.querySelectorAll('.ai-msg.bot .ai-msg-text')];
    return nodes[nodes.length - 1] || null;
  }

  function replaceUnsafeReply(root, visibleCards) {
    const bot = lastBotText(root);
    if (!bot) return;
    const text = String(bot.textContent || '');
    if (/подбираю/i.test(text)) return;
    if (state.locationJustSet) {
      const next = locationReply();
      if (text !== next) bot.textContent = next;
      return;
    }
    if (state.requestedDestination) {
      const mentioned = PLACES.map(([name,pattern]) => pattern.test(text) ? name : '').filter(Boolean);
      const bad = mentioned.find(place => place !== state.origin && place !== state.requestedDestination && !allowed(state.origin,place));
      const refusal = /не могу|невозможно|нет такой|не представлен|не доступ/i.test(text);
      if (bad || refusal || visibleCards === 0) {
        const next = routeReply();
        if (next && text !== next) bot.textContent = next;
      }
    } else if (state.origin) {
      const mentioned = PLACES.map(([name,pattern]) => pattern.test(text) ? name : '').filter(Boolean);
      const bad = mentioned.find(place => place !== state.origin && !allowed(state.origin,place));
      if (bad) bot.textContent = locationReply();
    }
  }

  function locationOptions() {
    return [['Нячанг','Я в Нячанге'],['Ханой','Я в Ханое'],['Дананг','Я в Дананге'],['Фукуок','Я на Фукуоке']];
  }
  function routeOptions() {
    if (state.origin === 'Ханой') return [['Ниньбинь','Ниньбинь'],['Халонг','Халонг'],['Ханой','Хочу обзор Ханоя']];
    if (state.origin === 'Нячанг') return [['Острова','Хочу море и острова'],['Далат','Хочу экскурсию в Далат'],['Нячанг','Хочу обзор Нячанга']];
    if (state.origin === 'Дананг') return [['Хойан','Хочу экскурсию в Хойан'],['Дананг','Хочу обзор Дананга'],['Природа','Хочу природу и красивые виды']];
    return [];
  }

  function replaceQuickReplies(root) {
    let box = root.querySelector('.ai-quick-replies');
    const options = !state.origin ? locationOptions() : state.locationJustSet ? routeOptions() : [];
    if (!options.length) return;
    if (!box) {
      const below = root.querySelector('.ai-chat-below');
      if (!below) return;
      box = document.createElement('div');
      box.className = 'ai-quick-replies';
      below.prepend(box);
    }
    const desired = options.map(([label,value]) => `<button type="button" data-location-v6-value="${esc(value)}">${esc(label)}</button>`).join('');
    if (box.dataset.locationV6Html === desired) return;
    box.dataset.locationV6Html = desired;
    box.innerHTML = desired;
  }

  function removeLegacyRequestCard(root) {
    root.querySelectorAll('.ai-location-request-v6').forEach(node => node.remove());
  }

  function cleanupEmptyResults(root) {
    root.querySelectorAll('.ai-sales-results').forEach(group => {
      const cards = [...group.querySelectorAll(CARD_SELECTOR)];
      if (cards.length) {
        group.hidden = cards.every(card => card.hidden);
        return;
      }
      if (group.classList.contains('ai-location-catalog-v8')) {
        group.hidden = true;
        return;
      }
      const hasContent = Boolean(group.querySelector('.ai-msg-text,.ai-chat-results-reason,.ai-save-selection,.ai-contact-form'));
      if (!hasContent) group.hidden = true;
    });
  }

  function firstQuestion(root) {
    if (state.origin) return;
    const userMessages = root.querySelectorAll('.ai-msg.user').length;
    const bot = lastBotText(root);
    const desired = 'Где вы сейчас или откуда планируете выезд?';
    if (!userMessages && bot && bot.textContent !== desired) bot.textContent = desired;
  }

  function postprocess(root) {
    if (!root || processing) return;
    processing = true;
    try {
      firstQuestion(root);
      removeLegacyRequestCard(root);
      let visible = filterCards(root);
      const injected = ensureRequestedCatalogCards(root, visible);
      if (injected) visible = filterCards(root);
      cleanupEmptyResults(root);
      replaceUnsafeReply(root, visible);
      replaceQuickReplies(root);
    } finally {
      processing = false;
    }
  }

  function schedulePostprocess(root) {
    if (postprocessQueued) return;
    postprocessQueued = true;
    const run = () => {
      postprocessQueued = false;
      postprocess(root);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  const previous = globalThis.MaxTourAI;
  if (!previous?.mount) return;
  globalThis.MaxTourAI = {
    ...previous,
    mount(root) {
      previous.mount(root);
      const oldSubmit = root.onsubmit;
      const oldKeydown = root.onkeydown;
      const oldClick = root.onclick;
      root.onsubmit = event => {
        const value = event.target?.querySelector?.('textarea[name="message"]')?.value?.trim();
        if (value) inspectInput(value);
        const result = oldSubmit?.call(root,event);
        schedulePostprocess(root);
        return result;
      };
      root.onkeydown = event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          const value = event.target?.closest?.('textarea[name="message"]')?.value?.trim();
          if (value) inspectInput(value);
        }
        const result = oldKeydown?.call(root,event);
        schedulePostprocess(root);
        return result;
      };
      root.onclick = event => {
        const locationButton = event.target?.closest?.('[data-location-v6-value]');
        if (locationButton) {
          event.preventDefault();
          event.stopPropagation();
          const value = locationButton.dataset.locationV6Value || '';
          const form = root.querySelector('[data-ai-form="chat"]');
          const textarea = form?.querySelector('textarea[name="message"]');
          if (textarea && form) {
            textarea.value = value;
            inspectInput(value);
            form.requestSubmit();
          }
          return;
        }
        const clear = event.target?.closest?.('[data-ai-action="clear"]');
        if (clear) reset();
        const result = oldClick?.call(root,event);
        schedulePostprocess(root);
        return result;
      };
      const observer = new MutationObserver(() => schedulePostprocess(root));
      observer.observe(root,{childList:true,subtree:true});
      postprocess(root);
    },
    _locationTest:{ placeFrom,placesFrom,allowed,inspectInput,tourPlacesFromTour,catalogCandidates },
  };
})();
