(() => {
  'use strict';

  const LOCATION_KEY = 'max-tour-ai-location-v6';
  const AI_STATE_KEY = 'max-tour-ai-consultant-v5';
  const GROUP_APPROVAL_KEY = 'max-tour-ai-group-departure-approval-v16';
  const ALL_CARD_SELECTOR = '.tour-card,.wide-card';
  const FROM_LABELS = {
    'Нячанг':'Нячанга',
    'Ханой':'Ханоя',
    'Дананг':'Дананга',
    'Фукуок':'Фукуока',
    'Далат':'Далата',
    'Фуйен':'Фуйена',
    'Хойан':'Хойана',
    'Халонг':'Халонга',
    'Ниньбинь':'Ниньбиня',
    'Муйне/Фантьет':'Муйне/Фантьета',
  };

  const lower = value => String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const tours = () => {
    try { return Array.isArray(TOURS) ? TOURS : []; }
    catch (_) { return []; }
  };

  function locationState() {
    try { return JSON.parse(sessionStorage.getItem(LOCATION_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }

  function aiState() {
    try { return JSON.parse(sessionStorage.getItem(AI_STATE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }

  function approvalState() {
    try { return JSON.parse(sessionStorage.getItem(GROUP_APPROVAL_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function saveApproval(value) {
    try {
      if (value) sessionStorage.setItem(GROUP_APPROVAL_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(GROUP_APPROVAL_KEY);
    } catch (_) {}
  }

  function lastUserText(root = document) {
    const nodes = [...root.querySelectorAll('.ai-msg.user .ai-msg-text')];
    return String(nodes[nodes.length - 1]?.textContent || '');
  }

  function hasIslandIntent(root = document) {
    const q = lower(lastUserText(root));
    return /остров|сноркл|катамаран|лодк/.test(q);
  }

  function tourById(id) {
    return tours().find(tour => String(tour?.id) === String(id)) || null;
  }

  function tourText(tour) {
    return lower(`${tour?.title || ''} ${tour?.region || ''} ${tour?.category || ''} ${(tour?.tags || []).join(' ')} ${tour?.searchText || ''}`);
  }

  function islandScore(tour) {
    const hay = tourText(tour);
    let score = 0;
    if (/остров/.test(hay)) score += 100;
    if (/сноркл/.test(hay)) score += 35;
    if (/катамаран|лодк/.test(hay)) score += 20;
    if (/пляж|купани/.test(hay)) score += 12;
    if (/море|морск/.test(hay)) score += 5;
    if (Number(tour?.popular)) score += 1;
    return score;
  }

  function reorderIslandRecommendations(root = document) {
    const origin = locationState()?.origin || '';
    if (origin !== 'Нячанг' || !hasIslandIntent(root)) return 0;

    let changed = 0;
    root.querySelectorAll('.ai-sales-results .ai-recommendations').forEach(list => {
      const cards = [...list.querySelectorAll(':scope > .tour-card[data-tour-id]')];
      if (cards.length < 2) return;
      const ranked = cards
        .map((card, index) => ({ card, index, score:islandScore(tourById(card.dataset.tourId)) }))
        .sort((a, b) => b.score - a.score || a.index - b.index);
      const before = cards.map(card => card.dataset.tourId).join('|');
      const after = ranked.map(row => row.card.dataset.tourId).join('|');
      if (before === after) return;
      ranked.forEach(row => list.append(row.card));
      changed += 1;
    });
    return changed;
  }

  function cardTourId(card) {
    if (card?.dataset?.tourId) return card.dataset.tourId;
    const onclick = String(card?.getAttribute?.('onclick') || '');
    return onclick.match(/openTour\(['"]([^'"]+)['"]\)/)?.[1] || '';
  }

  function validPrice(value) {
    const text = String(value || '').trim();
    return Boolean(text && text !== '—' && text !== '-');
  }

  function departureIso(departure) {
    const direct = String(departure?.iso || departure?.date || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(direct) ? direct : '';
  }

  function approvedGroupDeparture(tour, date) {
    if (!tour || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
    return (Array.isArray(tour.group?.departures) ? tour.group.departures : []).find(item => {
      const status = lower(item?.status);
      return departureIso(item) === date && !/отмен|лист ожидания|полон/.test(status);
    }) || null;
  }

  function isGroupRequest(tour, state = aiState()) {
    const tripType = String(state?.slots?.tripType || '');
    if (tripType === 'group') return true;
    if (tripType === 'individual') return false;
    const groupOk = validPrice(tour?.group?.from || tour?.group?.adult);
    const individualOk = validPrice(tour?.individual?.from);
    return groupOk && !individualOk;
  }

  function needsManagerApproval(tour, state = aiState()) {
    const date = String(state?.slots?.date || '');
    return Boolean(
      tour &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      isGroupRequest(tour, state) &&
      !approvedGroupDeparture(tour, date)
    );
  }

  function dateLabel(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return String(iso || '');
    try {
      return new Intl.DateTimeFormat('ru-RU', { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' })
        .format(new Date(`${iso}T00:00:00Z`));
    } catch (_) { return iso; }
  }

  function peopleLabel(state = aiState()) {
    const slots = state?.slots || {};
    const parts = [];
    if (Number(slots.adults)) parts.push(`${Number(slots.adults)} взр.`);
    if (Array.isArray(slots.children) && slots.children.length) parts.push(`${slots.children.length} дет.`);
    if (Number(slots.infants)) parts.push(`${Number(slots.infants)} мал.`);
    return parts.join(' + ') || 'состав не указан';
  }

  function telegramContact() {
    try {
      const user = globalThis.Telegram?.WebApp?.initDataUnsafe?.user;
      if (user) {
        const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
        return { name:name || 'Клиент Telegram Mini App', telegram:user.username ? `@${user.username}` : '' };
      }
    } catch (_) {}
    return { name:'Клиент Mini App', telegram:'' };
  }

  function currentRecommendedTour(root = document) {
    const state = aiState();
    const selected = tourById(state?.selectedTourId);
    if (selected) return selected;
    const first = root.querySelector('.ai-sales-results .tour-card[data-tour-id], .ai-sales-results [data-ai-action="book-tour"][data-id]');
    return tourById(first?.dataset?.tourId || first?.dataset?.id || '');
  }

  function pendingMatchesCurrent(state = aiState()) {
    const pending = approvalState();
    if (!pending || pending.status === 'approved') return false;
    const date = String(state?.slots?.date || '');
    if (pending.date !== date) return false;
    const current = currentRecommendedTour(document);
    return !current || String(current.id) === String(pending.tourId);
  }

  function approvalMessage(pending) {
    if (!pending) return '';
    if (pending.status === 'approved') {
      return `Групповой выезд «${pending.title}» на ${dateLabel(pending.date)} подтверждён менеджером MAX TOUR. Теперь можно переходить к бронированию и оплате.`;
    }
    if (pending.status === 'sent') {
      return `Запрос на групповой выезд «${pending.title}» на ${dateLabel(pending.date)} передан менеджеру MAX TOUR. Такой выезд сначала должен быть подтверждён менеджером. До подтверждения оплата недоступна; после согласования можно будет оплатить.`;
    }
    if (pending.status === 'sending') {
      return `На ${dateLabel(pending.date)} пока нет подтверждённого группового выезда «${pending.title}». Отправляю запрос менеджеру MAX TOUR. До подтверждения оплата недоступна.`;
    }
    return `На ${dateLabel(pending.date)} пока нет подтверждённого группового выезда «${pending.title}». Такой выезд сначала согласовывает менеджер MAX TOUR, и только после подтверждения становится доступна оплата.`;
  }

  function ensureApprovalNotice(root = document) {
    const pending = approvalState();
    const messages = root.querySelector('#aiScreen .ai-messages, .ai-consultant-shell .ai-messages');
    if (!messages) return false;
    let notice = messages.querySelector('.ai-group-approval-notice');
    if (!pending) {
      notice?.remove();
      return false;
    }
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'ai-msg bot ai-group-approval-notice';
      notice.innerHTML = '<span class="ai-msg-author">AI-консультант</span><span class="ai-msg-text"></span>';
      messages.append(notice);
    }
    const text = approvalMessage(pending);
    const textNode = notice.querySelector('.ai-msg-text');
    if (textNode && textNode.textContent !== text) textNode.textContent = text;
    return true;
  }

  function refreshApprovalStatus() {
    const pending = approvalState();
    if (!pending || pending.status === 'approved') return false;
    const tour = tourById(pending.tourId);
    if (!tour || !approvedGroupDeparture(tour, pending.date)) return false;
    saveApproval({ ...pending, status:'approved', approvedAt:new Date().toISOString() });
    return true;
  }

  let approvalRequestInFlight = '';
  async function requestGroupApproval(tour) {
    const state = aiState();
    const date = String(state?.slots?.date || '');
    if (!tour || !needsManagerApproval(tour, state)) return false;
    const key = `${tour.id}|${date}`;
    const existing = approvalState();
    if (existing?.tourId === tour.id && existing?.date === date && /sending|sent/.test(existing.status || '')) {
      ensureApprovalNotice(document);
      return true;
    }
    if (approvalRequestInFlight === key) return true;
    approvalRequestInFlight = key;
    saveApproval({ tourId:tour.id, title:tour.title, date, status:'sending', createdAt:new Date().toISOString() });
    ensureApprovalNotice(document);

    const payload = {
      intent:'group_departure_request',
      handoff:true,
      summary:`Запрос на новый групповой выезд: ${tour.title}; дата ${date}; состав ${peopleLabel(state)}. Оплату не открывать до подтверждения менеджером.`,
      payload:{
        tripType:'group', destination:tour.city || tour.region || '', date, dateFlexible:false,
        adults:Number(state?.slots?.adults || 0),
        children:Array.isArray(state?.slots?.children) ? state.slots.children : [],
        infants:Number(state?.slots?.infants || 0),
        preferences:Array.isArray(state?.slots?.preferences) ? state.slots.preferences : [],
        question:'Создать групповой выезд на выбранную дату',
        recommendations:[{
          tourId:tour.id, title:tour.title, format:'group',
          groupUsd:Number(String(tour.group?.adult || tour.group?.from || '').replace(/[^\d.]/g, '')) || 0,
          availability:'Требует подтверждения менеджером перед оплатой',
        }],
        contact:telegramContact(),
        source:'AI-консультант',
      },
    };

    try {
      const response = await fetch('/api/consultations', {
        method:'POST', credentials:'same-origin',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
      saveApproval({
        tourId:tour.id, title:tour.title, date, status:'sent',
        requestId:result.consultation?.id || '', createdAt:new Date().toISOString(),
      });
    } catch (error) {
      console.warn('[MAX TOUR AI] group departure approval request failed:', error);
      saveApproval({ tourId:tour.id, title:tour.title, date, status:'failed', createdAt:new Date().toISOString() });
    } finally {
      approvalRequestInFlight = '';
      ensureApprovalNotice(document);
      schedule();
    }
    return true;
  }

  function isBookingIntent(text) {
    return /хочу.*заброни|заброниру|оформ|бер[еу]м|выбираю|этот вариант|поехали|хочу.*оплат|оплатить/i.test(String(text || ''));
  }

  function isPaymentQuestion(text) {
    return /оплат|депозит|предоплат|карт|qr|сбер/i.test(String(text || ''));
  }

  function gateBookingButton(event) {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest?.('[data-ai-action="book-tour"]');
    if (!button) return false;
    const tour = tourById(button.dataset.id || button.closest('[data-tour-id]')?.dataset.tourId || '');
    if (!needsManagerApproval(tour)) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    void requestGroupApproval(tour);
    return true;
  }

  function gateChatSubmit(event, text) {
    const state = aiState();
    const tour = currentRecommendedTour(document);
    if (isBookingIntent(text) && needsManagerApproval(tour, state)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void requestGroupApproval(tour);
      return true;
    }
    if (isPaymentQuestion(text) && pendingMatchesCurrent(state)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      ensureApprovalNotice(document);
      return true;
    }
    return false;
  }

  function patchGroupApprovalControls(root = document) {
    const state = aiState();
    let changed = 0;
    root.querySelectorAll('.ai-sales-results [data-tour-id]').forEach(card => {
      const tour = tourById(card.dataset.tourId);
      const button = card.querySelector('[data-ai-action="book-tour"]');
      if (!button || !tour) return;
      const blocked = needsManagerApproval(tour, state);
      if (blocked && button.textContent.trim() !== 'Запросить выезд') {
        button.textContent = 'Запросить выезд';
        button.dataset.groupApproval = '1';
        changed += 1;
      } else if (!blocked && button.dataset.groupApproval === '1') {
        button.textContent = 'Забронировать';
        delete button.dataset.groupApproval;
        changed += 1;
      }
    });
    return changed;
  }

  function patchCardFormat(card) {
    const tour = tourById(cardTourId(card));
    if (!tour) return false;

    const groupOk = validPrice(tour.group?.from || tour.group?.adult);
    const individualOk = validPrice(tour.individual?.from);
    const fallbackFormat = groupOk && individualOk ? 'индивидуальный / групповой' : individualOk ? 'индивидуальный' : 'групповой';
    const format = String(tour.formatsLabel || fallbackFormat).trim();
    const meta = card.querySelector('.meta');
    if (meta) {
      const desired = `${tour.city || ''} · ${format} · ${tour.duration || ''}`;
      if (meta.textContent !== desired) meta.textContent = desired;
    }

    const priceBoxes = [...card.querySelectorAll('.price-row > div')];
    if (priceBoxes[0]) priceBoxes[0].hidden = !groupOk;
    if (priceBoxes[1]) priceBoxes[1].hidden = !individualOk;
    return true;
  }

  function patchCardFormats(root = document) {
    let count = 0;
    root.querySelectorAll(ALL_CARD_SELECTOR).forEach(card => {
      if (patchCardFormat(card)) count += 1;
    });
    return count;
  }

  function patchResultLabels(root = document) {
    const origin = locationState()?.origin || '';
    if (!origin) return 0;
    const desired = `Подходящие экскурсии из ${FROM_LABELS[origin] || origin}`;
    let changed = 0;

    root.querySelectorAll('.ai-sales-results').forEach(group => {
      const legacy = group.querySelector('.ai-chat-results-label:not(.ai-chat-results-label-v15)');
      if (!legacy) return;
      let polished = group.querySelector('.ai-chat-results-label-v15');
      if (!polished) {
        polished = legacy.cloneNode(false);
        polished.classList.add('ai-chat-results-label-v15');
        polished.removeAttribute('hidden');
        legacy.insertAdjacentElement('afterend', polished);
        changed += 1;
      }
      legacy.hidden = true;
      if (polished.textContent !== desired) {
        polished.textContent = desired;
        changed += 1;
      }
    });
    return changed;
  }

  let queued = false;
  function run() {
    queued = false;
    patchCardFormats(document);
    reorderIslandRecommendations(document);
    patchResultLabels(document);
    refreshApprovalStatus();
    patchGroupApprovalControls(document);
    ensureApprovalNotice(document);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  }

  document.addEventListener('click', event => {
    if (gateBookingButton(event)) return;
    schedule();
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target instanceof Element ? event.target.closest?.('[data-ai-form="chat"]') : null;
    if (form) {
      const textarea = form.querySelector('textarea[name="message"]');
      const text = textarea?.value?.trim() || '';
      if (text && gateChatSubmit(event, text)) {
        if (textarea) textarea.value = '';
        return;
      }
    }
    schedule();
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    const textarea = event.target instanceof Element ? event.target.closest?.('textarea[name="message"]') : null;
    if (!textarea) return;
    const text = textarea.value.trim();
    if (text && gateChatSubmit(event, text)) textarea.value = '';
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once:true });
  else schedule();

  new MutationObserver(schedule).observe(document.documentElement, { childList:true, subtree:true });

  globalThis.MaxTourAiSelectionV15 = {
    run,
    islandScore,
    reorderIslandRecommendations,
    patchCardFormats,
    patchResultLabels,
    patchGroupApprovalControls,
    needsManagerApproval,
    approvedGroupDeparture,
    requestGroupApproval,
  };
})();
