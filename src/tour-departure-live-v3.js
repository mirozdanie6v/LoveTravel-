(() => {
  'use strict';

  const BOOKING_INTENT_KEY = 'max-tour-ai-booking-intent-v1';
  const STYLE_ID = 'max-tour-departure-live-v3-style';
  const MONTHS = [
    ['янв',1],['фев',2],['мар',3],['апр',4],['ма[йя]',5],['июн',6],
    ['июл',7],['авг',8],['сен',9],['окт',10],['ноя',11],['дек',12],
  ];

  function vietnamTodayIso(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit',
    }).formatToParts(now);
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  function parseDepartureLabel(value, today = vietnamTodayIso()) {
    const raw = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
    const direct = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (direct) return direct[1];
    const day = Number((raw.match(/\d{1,2}/) || [])[0]);
    const month = MONTHS.find(([stem]) => new RegExp(stem).test(raw))?.[1];
    if (!day || !month) return '';
    const currentYear = Number(today.slice(0, 4));
    let year = currentYear;
    let iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
    if (iso < today && Number(today.slice(5, 7)) >= 11 && month <= 2) {
      year += 1;
      iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
    }
    return iso;
  }

  function readIntent() {
    try { return JSON.parse(sessionStorage.getItem(BOOKING_INTENT_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function sameTour(root, intent) {
    if (!intent?.tourId) return false;
    const selectedId = (() => {
      try { return String(state?.selectedTour?.id || ''); } catch (_) { return ''; }
    })();
    if (selectedId) return selectedId === String(intent.tourId);
    const title = String(intent.title || '').trim();
    if (!title) return true;
    const heading = root.querySelector('h1,h2,.tour-title');
    const text = String(heading?.textContent || root.textContent || '');
    return text.includes(title);
  }

  function isFullCard(card) {
    const text = String(card?.textContent || '').toLocaleLowerCase('ru-RU');
    if (/лист ожидания|мест нет|полон|заполнен/.test(text)) return true;
    const seats = text.match(/(\d+)\s+из\s+(\d+)\s+мест/);
    return seats ? Number(seats[1]) >= Number(seats[2]) : false;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #tourScreen .depart-card[data-live-departure-state="past"]{display:none!important}
      #tourScreen .depart-card[data-live-departure-state="full"] button{opacity:.62;cursor:not-allowed}
      #tourScreen .depart-card.ai-target-departure-v3{outline:2px solid currentColor;outline-offset:2px}
      #tourScreen .ai-target-badge-v3{display:inline-flex;align-items:center;gap:6px;margin:0 0 8px;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700;background:rgba(255,255,255,.16);backdrop-filter:blur(8px)}
    `;
    document.head.appendChild(style);
  }

  function processTourDepartures(root = document.getElementById('tourScreen')) {
    if (!root) return { past:0, full:0, target:'' };
    ensureStyle();
    const today = vietnamTodayIso();
    const intent = readIntent();
    const targetDate = sameTour(root, intent) && /^\d{4}-\d{2}-\d{2}$/.test(String(intent?.date || '')) ? intent.date : '';
    let past = 0;
    let full = 0;
    let target = '';

    root.querySelectorAll('.depart-card').forEach(card => {
      const labelNode = card.querySelector('.small-row b,b');
      const iso = parseDepartureLabel(labelNode?.textContent, today);
      if (iso) card.dataset.departureIso = iso;

      if (iso && iso < today) {
        card.dataset.liveDepartureState = 'past';
        past += 1;
        return;
      }

      if (card.dataset.liveDepartureState === 'past') delete card.dataset.liveDepartureState;
      const button = [...card.querySelectorAll('button')].find(item => /присоединиться|забронировать|лист ожидания|продолжить бронирование/i.test(item.textContent || ''));

      if (isFullCard(card)) {
        card.dataset.liveDepartureState = 'full';
        full += 1;
        if (button) {
          if (!button.disabled) button.disabled = true;
          if (button.textContent.trim() !== 'Лист ожидания') button.textContent = 'Лист ожидания';
          button.setAttribute('aria-disabled', 'true');
        }
      } else {
        if (card.dataset.liveDepartureState === 'full') delete card.dataset.liveDepartureState;
        if (button?.disabled) button.disabled = false;
        button?.removeAttribute('aria-disabled');
      }

      const isTarget = Boolean(targetDate && iso === targetDate && !isFullCard(card));
      card.classList.toggle('ai-target-departure-v3', isTarget);
      const badge = card.querySelector('.ai-target-badge-v3');
      if (isTarget) {
        target = iso;
        if (!badge) {
          const node = document.createElement('div');
          node.className = 'ai-target-badge-v3';
          node.textContent = 'Дата из AI-консультанта';
          card.prepend(node);
        }
        if (button && button.textContent.trim() !== 'Продолжить бронирование') button.textContent = 'Продолжить бронирование';
      } else {
        badge?.remove();
        if (button && !button.disabled && button.textContent.trim() === 'Продолжить бронирование') button.textContent = 'Присоединиться';
      }
    });

    return { past, full, target };
  }

  function departureIndexForCard(card, button) {
    const inline = String(button?.getAttribute('onclick') || '');
    const direct = inline.match(/joinDeparture\((\d+)\)/);
    if (direct) return Number(direct[1]);
    const iso = String(card?.dataset?.departureIso || '');
    try {
      const departures = state?.selectedTour?.group?.departures || [];
      return departures.findIndex(item => {
        const source = item?.iso || item?.date || '';
        return parseDepartureLabel(source) === iso;
      });
    } catch (_) {
      return -1;
    }
  }

  function intentChildCount(intent) {
    if (Array.isArray(intent?.children)) return intent.children.length;
    return Math.max(0, Number(intent?.children) || 0);
  }

  function applyIntentToBooking(intent, chosenDate = '') {
    try {
      if (!state?.booking) return false;
      const today = vietnamTodayIso();
      const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(chosenDate || ''))
        ? String(chosenDate)
        : /^\d{4}-\d{2}-\d{2}$/.test(String(intent?.date || '')) ? String(intent.date) : '';
      const next = {
        adults:Math.max(1, Number(intent?.adults) || 1),
        children:intentChildCount(intent),
        infants:Math.max(0, Number(intent?.infants) || 0),
      };
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (Number(state.booking[key]) !== value) {
          state.booking[key] = value;
          changed = true;
        }
      }
      if (targetDate && targetDate >= today && state.booking.date !== targetDate) {
        state.booking.date = targetDate;
        changed = true;
      }
      if (state.booking.error) {
        state.booking.error = '';
        changed = true;
      }
      if (changed && typeof renderBooking === 'function') renderBooking();
      const root = document.getElementById('bookingScreen');
      const dateInput = root?.querySelector('input[type="date"]');
      if (dateInput) {
        dateInput.min = today;
        if (targetDate && targetDate >= today && dateInput.value !== targetDate) dateInput.value = targetDate;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function handoffAiBooking(event, root) {
    const button = event.target?.closest?.('#tourScreen button');
    if (!button || button.disabled) return;
    const intent = readIntent();
    if (!intent?.tourId || !sameTour(root, intent)) return;

    const card = button.closest('.depart-card');
    const createOwnGroup = !card && /создать свою группу/i.test(button.textContent || '');
    if (!card && !createOwnGroup) return;
    if (card?.dataset.liveDepartureState === 'past' || card?.dataset.liveDepartureState === 'full' || isFullCard(card)) return;

    const chosenDate = String(card?.dataset?.departureIso || intent.date || '');
    const index = card ? departureIndexForCard(card, button) : -1;
    if (card && index < 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    try { sessionStorage.removeItem(BOOKING_INTENT_KEY); } catch (_) {}

    if (card && typeof joinDeparture === 'function') joinDeparture(index);
    else if (createOwnGroup && typeof createGroup === 'function') createGroup();
    else return;

    applyIntentToBooking(intent, chosenDate);
    requestAnimationFrame(() => applyIntentToBooking(intent, chosenDate));
  }

  const root = document.getElementById('tourScreen');
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      processTourDepartures(root);
    });
  };

  if (root) {
    const observer = new MutationObserver(mutations => {
      if (!mutations.some(item => item.addedNodes?.length || item.removedNodes?.length)) return;
      schedule();
    });
    observer.observe(root, { childList:true,subtree:true });
    root.addEventListener('click', event => handoffAiBooking(event, root), true);
    schedule();
  }

  globalThis.MaxTourDepartureLiveV3 = {
    process:processTourDepartures,
    applyIntentToBooking,
    _test:{ vietnamTodayIso, parseDepartureLabel, isFullCard, intentChildCount },
  };
})();
