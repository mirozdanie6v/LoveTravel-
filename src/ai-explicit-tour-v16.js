(() => {
  'use strict';

  const AI_STATE_KEY = 'max-tour-ai-consultant-v5';
  const lower = value => String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[«»"'`]/g, '')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tours = () => {
    try { return Array.isArray(TOURS) ? TOURS : []; }
    catch (_) { return []; }
  };
  const readState = () => {
    try { return JSON.parse(sessionStorage.getItem(AI_STATE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  };
  const saveState = state => {
    try { sessionStorage.setItem(AI_STATE_KEY, JSON.stringify(state)); }
    catch (_) {}
  };

  function aliases(tour) {
    const result = new Set([lower(tour?.title)]);
    const id = String(tour?.id || '');
    if (id === 'hon-tam-island') {
      result.add('хон там');
      result.add('остров хон там');
    }
    if (id === 'orchid-monkey-islands') {
      result.add('остров орхидей');
      result.add('остров обезьян');
      result.add('орхидей и обезьян');
    }
    if (id === 'dalat-premium') result.add('далат премиум');
    if (id === 'dalat-vip') result.add('далат вип');
    return [...result].filter(item => item.length >= 5);
  }

  function mentionedTour(text) {
    const q = lower(text);
    if (!q) return null;
    return tours()
      .map(tour => ({ tour, matches:aliases(tour).filter(alias => q.includes(alias)) }))
      .filter(row => row.matches.length)
      .sort((a, b) => Math.max(...b.matches.map(x => x.length)) - Math.max(...a.matches.map(x => x.length)))[0]?.tour || null;
  }

  function explicitTourFromState(state = readState()) {
    const messages = Array.isArray(state?.messages) ? state.messages : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role !== 'user') continue;
      const tour = mentionedTour(messages[index]?.text);
      if (tour) return tour;
    }
    return null;
  }

  function persistTour(tour) {
    if (!tour?.id) return false;
    const state = readState();
    if (String(state.selectedTourId || '') === String(tour.id)) return false;
    state.selectedTourId = String(tour.id);
    saveState(state);
    return true;
  }

  function syncFromState() {
    const tour = explicitTourFromState();
    return tour ? persistTour(tour) : false;
  }

  function syncFromInput(target) {
    if (!(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLInputElement)) return false;
    if (target.name !== 'message' && !target.closest?.('[data-ai-form="chat"]')) return false;
    const tour = mentionedTour(target.value);
    return tour ? persistTour(tour) : false;
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      syncFromState();
    });
  }

  document.addEventListener('input', event => { syncFromInput(event.target); }, true);
  document.addEventListener('submit', schedule, false);
  document.addEventListener('click', schedule, false);
  new MutationObserver(schedule).observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once:true });
  else schedule();

  globalThis.MaxTourAiExplicitTourV16 = { mentionedTour, explicitTourFromState, syncFromState };
})();

(() => {
  'use strict';

  const AI_STATE_KEY = 'max-tour-ai-consultant-v5';
  const QUESTION_SETS = [
    {
      id:'preferences',
      match:text => /что\s+вам[^?]{0,80}(?:интересн|больше)|что\s+интересн|природ[^?]{0,50}мор[^?]{0,50}(?:истор|город|культур)|мор[^?]{0,50}природ[^?]{0,50}(?:истор|город|культур)/iu.test(text),
      options:[
        ['Острова','Хочу море и острова'],
        ['Красивые виды','Хочу природу и красивые виды'],
        ['Обзор города','Хочу обзорную экскурсию'],
      ],
    },
    {
      id:'budget',
      match:text => /подешевле|без\s+переплат|программа\s+интереснее|чуть\s+дороже|цена\s+важнее/iu.test(text) && /\?/u.test(text),
      options:[['Подешевле','Подешевле'],['Интереснее программа','Хочу более интересную и насыщенную программу']],
    },
    {
      id:'party',
      match:text => /сколько\s+(?:вас|человек)|сколько\s+человек\s+едет|кто\s+едет|вы\s+вдво[её]м|каким\s+составом|состав\s+группы/iu.test(text),
      options:[['2 взрослых','Нас 2 взрослых'],['С ребёнком','2 взрослых и ребёнок 7 лет']],
    },
    {
      id:'date',
      match:text => /(?:на\s+какой\s+день|на\s+какую\s+дату|когда\s+(?:хотите|планируете)|какая\s+дата|по\s+дате|день\s+поездки)/iu.test(text),
      options:[['Сегодня','Сегодня'],['Завтра','Завтра'],['Дата гибкая','Дата гибкая']],
    },
    {
      id:'format',
      match:text => /группов[^?]{0,65}индивиду|индивидуальн[^?]{0,65}групп|какой\s+формат/iu.test(text),
      options:[['Групповой','Хочу групповой тур'],['Индивидуальный','Хочу индивидуальный тур']],
    },
  ];

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize = value => String(value || '').replace(/\s+/g,' ').trim();
  const readAiState = () => {
    try { return JSON.parse(sessionStorage.getItem(AI_STATE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  };
  const saveAiState = state => {
    try { sessionStorage.setItem(AI_STATE_KEY, JSON.stringify(state)); }
    catch (_) {}
  };
  const lastBotNode = root => [...root.querySelectorAll('.ai-msg.bot .ai-msg-text')].at(-1) || null;
  const lastBotQuestion = root => normalize(lastBotNode(root)?.textContent || '');
  const setForQuestion = text => QUESTION_SETS.find(set => set.match(text)) || null;
  const peopleKnown = slots => Number(slots?.adults || 0) + (Array.isArray(slots?.children) ? slots.children.length : 0) + Number(slots?.infants || 0) > 0;
  const interestKnown = slots => (Array.isArray(slots?.preferences) ? slots.preferences : []).some(value => /море|природ|город|культур|истор|вид|остров/i.test(String(value || '')));

  function replacementForKnownQuestion(kind, slots = {}) {
    if (kind === 'preferences' && interestKnown(slots)) {
      if (!peopleKnown(slots)) return 'Сколько человек едет? Если будут дети, укажите возраст — это влияет на цену.';
      if (!slots.date) return 'На какую дату хотите поехать?';
      if (!slots.tripType) return 'Какой формат удобнее — групповой или индивидуальный?';
      return 'Готово — ниже подходящие экскурсии. Выберите вариант и нажмите «Забронировать».';
    }
    if (kind === 'party' && peopleKnown(slots)) {
      if (!interestKnown(slots)) return 'Что вам больше хочется: море и острова, природа и красивые виды или обзор города?';
      if (!slots.date) return 'На какую дату хотите поехать?';
      if (!slots.tripType) return 'Какой формат удобнее — групповой или индивидуальный?';
    }
    if (kind === 'date' && slots.date && !slots.tripType) return 'Какой формат удобнее — групповой или индивидуальный?';
    return '';
  }

  function persistCorrectedBotText(previousText, nextText) {
    const state = readAiState();
    const messages = Array.isArray(state.messages) ? state.messages : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role !== 'bot' && messages[index]?.role !== 'assistant') continue;
      if (normalize(messages[index]?.text) !== normalize(previousText)) break;
      messages[index] = { ...messages[index], text:nextText };
      state.messages = messages;
      saveAiState(state);
      break;
    }
  }

  function advanceKnownQuestion(root) {
    const node = lastBotNode(root);
    if (!node) return '';
    const current = normalize(node.textContent || '');
    const kind = setForQuestion(current)?.id || '';
    if (!kind) return current;
    const state = readAiState();
    const replacement = replacementForKnownQuestion(kind, state?.slots || {});
    if (!replacement || replacement === current) return current;
    node.textContent = replacement;
    persistCorrectedBotText(current, replacement);
    return replacement;
  }

  function expectedHtml(set) {
    return set.options.map(([label,value]) => `<button type="button" data-ai-action="quick" data-value="${esc(value)}">${esc(label)}</button>`).join('');
  }

  function syncQuickReplies(root) {
    if (!root) return;
    const question = advanceKnownQuestion(root) || lastBotQuestion(root);
    const set = setForQuestion(question);
    let box = root.querySelector('.ai-quick-replies');
    if (!set) {
      // Do not remove the native v5 first-screen quick replies.
      // This compatibility layer may only remove a quick-reply box it created itself.
      if (box?.dataset?.aiQuickV18) box.remove();
      return;
    }
    if (!box) {
      const below = root.querySelector('.ai-chat-below');
      if (!below) return;
      box = document.createElement('div');
      box.className = 'ai-quick-replies';
      below.prepend(box);
    }
    const signature = `${set.id}:${question}`;
    if (box.dataset.aiQuickV18 === signature && box.innerHTML === expectedHtml(set)) return;
    box.dataset.aiQuickV18 = signature;
    box.innerHTML = expectedHtml(set);
  }

  let quickQueued = false;
  function syncAll() {
    if (quickQueued) return;
    quickQueued = true;
    requestAnimationFrame(() => {
      quickQueued = false;
      document.querySelectorAll('.ai-consultant-shell').forEach(shell => syncQuickReplies(shell.parentElement));
    });
  }

  document.addEventListener('submit', syncAll, true);
  document.addEventListener('click', syncAll, true);
  new MutationObserver(syncAll).observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncAll, { once:true });
  else syncAll();

  globalThis.MaxTourAIQuickRepliesV18 = { setForQuestion, lastBotQuestion, replacementForKnownQuestion, syncQuickReplies };
})();

(() => {
  'use strict';

  const locationTest = globalThis.MaxTourAI?._locationTest;
  if (!locationTest?.inspectInput || !locationTest?.placeFrom || !locationTest?.placesFrom) return;

  const CASE_FIXES = [
    [/ханоя/giu, 'Ханой'], [/ханою/giu, 'Ханой'], [/нячанга/giu, 'Нячанг'], [/дананга/giu, 'Дананг'],
    [/фукуока/giu, 'Фукуок'], [/далата/giu, 'Далат'], [/хойана/giu, 'Хойан'], [/халонга/giu, 'Халонг'],
    [/нинь\s*биня/giu, 'Ниньбинь'], [/фу[йи]ена/giu, 'Фуйен'], [/фан\s*тьета/giu, 'Фантьет'],
  ];
  const normalizeRussianCases = value => CASE_FIXES.reduce((textValue, [pattern, replacement]) => textValue.replace(pattern, replacement), String(value || ''));
  const placeFromFragment = fragment => {
    const normalized = normalizeRussianCases(fragment);
    return locationTest.placeFrom(normalized) || locationTest.placesFrom(normalized)?.[0] || '';
  };

  function correctionTarget(value) {
    const normalized = normalizeRussianCases(value).trim();
    if (!normalized) return '';
    const contrast = normalized.match(/(?:^|[\s,;])не\s+[^,;.!?]{0,40}?[,;]?\s+а\s+(.+)$/iu);
    if (contrast) {
      const target = placeFromFragment(contrast[1]);
      if (target) return target;
    }
    const explicitOrigin = normalized.match(/(?:^|[\s,;])(?:выезд|старт|отправление)\s+(?:будет\s+)?из\s+(.+)$/iu)
      || normalized.match(/(?:^|[\s,;])из\s+(.+)$/iu);
    if (explicitOrigin) {
      const target = placeFromFragment(explicitOrigin[1]);
      if (target) return target;
    }
    const located = normalized.match(/(?:^|[\s,;])(?:я|мы|сейчас|нахожусь|находимся|живу|живём|живем)(?:\s+|$)[^.!?]{0,24}?(?:в|на)\s+(.+)$/iu);
    if (located) {
      const target = placeFromFragment(located[1]);
      if (target) return target;
    }
    if (/^(?:нет|неверно|ошибка|поправка|точнее|всё-таки|все-таки)(?:[\s,;:.-]|$)/iu.test(normalized)
      || /(?:имею|имел|имела|имели)\s+в\s+виду/iu.test(normalized)) {
      const places = locationTest.placesFrom(normalized);
      if (places.length) return places[places.length - 1];
    }
    return '';
  }

  function applyCorrection(value) {
    const target = correctionTarget(value);
    if (!target) return '';
    locationTest.inspectInput(`выезд из ${target}`);
    return target;
  }

  const submittedText = event => event.target?.querySelector?.('textarea[name="message"]')?.value?.trim() || '';
  document.addEventListener('submit', event => {
    const value = submittedText(event);
    if (value) applyCorrection(value);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    const value = event.target?.closest?.('textarea[name="message"]')?.value?.trim();
    if (value) applyCorrection(value);
  }, true);

  globalThis.MaxTourAiLocationCorrectionV17 = { normalizeRussianCases, correctionTarget, applyCorrection };
})();

(() => {
  'use strict';

  const AI_STATE_KEY = 'max-tour-ai-consultant-v5';
  const LOCATION_KEY = 'max-tour-ai-location-v6';
  const ORIGIN_KEY = 'max-tour-ai-origin-v20';
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const readJson = (key, fallback = {}) => {
    try { return JSON.parse(sessionStorage.getItem(key) || 'null') || fallback; }
    catch (_) { return fallback; }
  };
  const writeJson = (key, value) => {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };

  function isAiChatRequest(input) {
    try {
      const raw = input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, location.href);
      return url.origin === location.origin && url.pathname === '/api/ai/chat';
    } catch (_) { return false; }
  }

  function currentOrigin() {
    return clean(globalThis.MaxTourAIOriginContextV20?.currentOrigin?.())
      || clean(readJson(LOCATION_KEY, {}).origin)
      || clean(readJson(AI_STATE_KEY, {})?.slots?.origin);
  }

  function sanitizeStoredState() {
    const ai = readJson(AI_STATE_KEY, {});
    const slots = ai?.slots || {};
    const locationState = readJson(LOCATION_KEY, {});
    const origin = currentOrigin();
    if (origin && clean(slots.destination) === origin && !clean(locationState.requestedDestination)) {
      slots.destination = '';
      ai.slots = slots;
      writeJson(AI_STATE_KEY, ai);
    }
    return ai;
  }

  function releaseLocationGuard() {
    const locationTest = globalThis.MaxTourAI?._locationTest;
    try { locationTest?.inspectInput?.('продолжаем подбор'); } catch (_) {}
    const state = readJson(LOCATION_KEY, {});
    if (state.locationJustSet) writeJson(LOCATION_KEY, { ...state, locationJustSet:false });
  }

  function peopleKnown(slots = {}) {
    return Number(slots.adults || 0) + (Array.isArray(slots.children) ? slots.children.length : 0) + Number(slots.infants || 0) > 0;
  }
  function interestKnown(slots = {}) {
    return (Array.isArray(slots.preferences) ? slots.preferences : []).some(value => /море|остров|природ|вид|город|обзор|культур|истор/i.test(String(value || '')));
  }
  function isFaq(text) {
    return /(?:что\s+входит|включен|не\s+входит|цена|стоимост|сколько\s+стоит|оплат|депозит|предоплат|отмен|возврат|перенос|гид|русскоязыч|трансфер|забер|отель|встреч|питани|обед|вегетари|аллерг|погод|дожд|шторм|что\s+взять|одежд|коляск|пожил|доступн|места|наличи)/iu.test(String(text || ''));
  }
  function originGenitive(origin) {
    return ({ 'Нячанг':'Нячанга', 'Ханой':'Ханоя', 'Дананг':'Дананга', 'Фукуок':'Фукуока', 'Муйне/Фантьет':'Муйне/Фантьета' })[origin] || origin;
  }

  function salesStage() {
    const ai = sanitizeStoredState();
    const slots = ai?.slots || {};
    const locationState = readJson(LOCATION_KEY, {});
    const origin = currentOrigin();
    let destination = clean(slots.destination);
    if (origin && destination === origin && !clean(locationState.requestedDestination)) destination = '';
    return {
      origin,
      people:peopleKnown(slots),
      interest:interestKnown(slots) || Boolean(destination),
      date:clean(slots.date),
      format:clean(slots.tripType),
    };
  }

  function nextReply(stage) {
    if (!stage.origin) return 'Где вы сейчас или откуда планируете выезд?';
    if (!stage.people) return 'Сколько человек едет? Если будут дети, укажите возраст — это влияет на цену.';
    if (!stage.interest) return 'Что вам больше хочется: море и острова, природа и красивые виды или обзор города?';
    if (!stage.date) return `Подходящие варианты с выездом из ${originGenitive(stage.origin)} уже подобраны. На какую дату хотите поехать?`;
    if (!stage.format) return 'Какой формат удобнее — групповой или индивидуальный? После выбора сразу покажу варианты с ценой и бронированием.';
    return 'Готово — ниже подходящие экскурсии. Выберите вариант и нажмите «Забронировать»: дату и состав группы перенесу в оформление автоматически.';
  }

  const previousFetch = globalThis.fetch;
  if (typeof previousFetch === 'function' && !previousFetch.__maxTourSalesContinuityV24) {
    const wrappedFetch = async function(input, init = {}) {
      if (!isAiChatRequest(input) || !init?.body || typeof init.body !== 'string') return previousFetch.call(this, input, init);
      let body;
      try { body = JSON.parse(init.body); }
      catch (_) { return previousFetch.call(this, input, init); }

      const response = await previousFetch.call(this, input, init);
      releaseLocationGuard();
      sanitizeStoredState();
      if (!response?.ok || isFaq(body?.message || '')) return response;
      const data = await response.clone().json().catch(() => null);
      if (!data?.ok || data?.source === 'faq-verified') return response;
      const reply = nextReply(salesStage());
      if (!reply) return response;
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      return new Response(JSON.stringify({ ...data, reply, source:'sales-continuity-v24' }), {
        status:response.status,
        statusText:response.statusText,
        headers,
      });
    };
    wrappedFetch.__maxTourSalesContinuityV24 = true;
    wrappedFetch.__maxTourSalesContinuityPrevious = previousFetch;
    globalThis.fetch = wrappedFetch;
  }

  document.addEventListener('click', event => {
    if (!event.target?.closest?.('[data-ai-action="clear"]')) return;
    try { sessionStorage.removeItem(ORIGIN_KEY); } catch (_) {}
  }, true);

  globalThis.MaxTourAISalesContinuityV24 = { sanitizeStoredState, releaseLocationGuard, salesStage, nextReply };
})();
