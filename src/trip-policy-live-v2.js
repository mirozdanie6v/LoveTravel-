(() => {
  'use strict';

  const TIME_ZONE = 'Asia/Ho_Chi_Minh';
  const OFFSET = '+07:00';
  const MONTHS = [
    ['янв',1],['фев',2],['мар',3],['апр',4],['ма[йя]',5],['июн',6],
    ['июл',7],['авг',8],['сен',9],['окт',10],['ноя',11],['дек',12],
  ];

  const amount = value => {
    const match = String(value || '').match(/-?\d[\d,.]*/);
    return match ? Number(match[0].replace(/,/g, '')) || 0 : 0;
  };
  const cash = value => `$${Math.max(0, Math.round(Number(value) || 0))}`;

  function shiftIsoDate(iso, days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return '';
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function vietnamTodayIso(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  function parseDepartureDate(value, today = vietnamTodayIso()) {
    const raw = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
    const direct = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (direct) return direct[1];

    const day = Number((raw.match(/\d{1,2}/) || [])[0]);
    const month = MONTHS.find(([stem]) => new RegExp(stem).test(raw))?.[1];
    if (!day || !month) return '';

    let year = Number(today.slice(0, 4));
    let iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
    const currentMonth = Number(today.slice(5, 7));
    if (iso < today && currentMonth >= 11 && month <= 2) {
      year += 1;
      iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
    }
    return iso;
  }

  function fixedGroupDepartureIso(today = vietnamTodayIso()) {
    try {
      if (state?.format !== 'group') return '';
      const departure = state?.selectedDeparture;
      if (!departure) return '';
      const label = String(departure?.date || '').trim();
      if (/своя дата|дата на выбор|по согласованию/i.test(label)) return '';
      return parseDepartureDate(departure?.iso || label, today);
    } catch (_) {
      return '';
    }
  }

  function syncBookingDate(now = new Date()) {
    const today = vietnamTodayIso(now);
    const tomorrow = shiftIsoDate(today, 1);
    try {
      if (!state?.booking) return { changed:false, date:'', fixed:'', today };
      const parsedFixed = fixedGroupDepartureIso(today);
      const fixed = parsedFixed && parsedFixed >= today ? parsedFixed : '';
      const current = String(state.booking.date || '').trim();
      const currentValid = /^\d{4}-\d{2}-\d{2}$/.test(current) && current >= today;
      const next = fixed || (currentValid ? current : tomorrow);
      const changed = Boolean(next && next !== current);
      if (changed) state.booking.date = next;
      return { changed, date:next, fixed, today };
    } catch (_) {
      return { changed:false, date:'', fixed:'', today };
    }
  }

  function enforceBookingDateInput(now = new Date()) {
    const synced = syncBookingDate(now);
    const input = document.querySelector('#bookingScreen input[type="date"]');
    if (!input) return synced;

    if (synced.date && input.value !== synced.date) input.value = synced.date;
    if (synced.fixed) {
      input.min = synced.fixed;
      input.max = synced.fixed;
      input.readOnly = true;
      input.setAttribute('aria-readonly', 'true');
      input.title = 'Дата группового выезда фиксирована';
    } else {
      input.min = synced.today;
      input.removeAttribute('max');
      input.readOnly = false;
      input.removeAttribute('aria-readonly');
      input.removeAttribute('title');
    }
    return synced;
  }

  function firstTime(value) {
    const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '05:30';
  }

  function tripMoment(trip) {
    const date = String(trip?.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const moment = new Date(`${date}T${firstTime(trip?.time)}:00${OFFSET}`);
    return Number.isNaN(moment.getTime()) ? null : moment;
  }

  function formatMoment(moment) {
    if (!moment || Number.isNaN(moment.getTime())) return 'дата не определена';
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: TIME_ZONE,
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(moment).replace(',', ' ·');
  }

  function livePolicy(trip, now = new Date()) {
    const departure = tripMoment(trip);
    const total = amount(trip?.total) || amount(trip?.paid) + amount(trip?.rest);
    if (!departure) return { valid:false, departure:null, isPast:false };

    const cancelFree = new Date(departure.getTime() - 48 * 60 * 60 * 1000);
    const dayBefore = shiftIsoDate(String(trip.date || ''), -1);
    const rescheduleFree = dayBefore ? new Date(`${dayBefore}T17:00:00${OFFSET}`) : null;
    const isPast = now >= departure;

    let cancel;
    if (isPast) {
      cancel = { tone:'closed', headline:'Поездка завершена', detail:`выезд был ${formatMoment(departure)}`, rate:null, allowed:false };
    } else if (now < cancelFree) {
      cancel = { tone:'free', headline:`Бесплатно до ${formatMoment(cancelFree)}`, detail:'сейчас бесплатно', rate:0, allowed:true };
    } else if (rescheduleFree && now < rescheduleFree) {
      const retained = Math.round(total * 0.30);
      cancel = { tone:'warning', headline:`30% до ${formatMoment(rescheduleFree)}`, detail:`сейчас удержание ${cash(retained)}`, rate:0.30, allowed:true };
    } else {
      cancel = { tone:'danger', headline:'Удержание 100%', detail:`до выезда ${formatMoment(departure)}`, rate:1, allowed:true };
    }

    let reschedule;
    if (isPast) {
      reschedule = { tone:'closed', headline:'Поездка завершена', detail:`выезд был ${formatMoment(departure)}`, rate:null, allowed:false };
    } else if (rescheduleFree && now < rescheduleFree) {
      reschedule = { tone:'free', headline:`Бесплатно до ${formatMoment(rescheduleFree)}`, detail:'сейчас бесплатно', rate:0, allowed:true };
    } else {
      const fee = Math.round(total * 0.30);
      reschedule = { tone:'warning', headline:'Удержание 30%', detail:`сейчас ${cash(fee)} · до выезда ${formatMoment(departure)}`, rate:0.30, allowed:true };
    }

    return { valid:true, departure, cancelFree, rescheduleFree, isPast, total, cancel, reschedule };
  }

  function smallestPolicyBox(card, label) {
    const pattern = new RegExp(`(?:^|\\s)${label}(?:\\s|$)`, 'i');
    const candidates = [...card.querySelectorAll('div,section,article')]
      .filter(node => pattern.test(String(node.textContent || '').trim()) && !node.querySelector('button'))
      .sort((a, b) => String(a.textContent || '').length - String(b.textContent || '').length);
    return candidates[0] || null;
  }

  function renderPolicyBox(box, label, policy) {
    if (!box || !policy) return;
    box.classList.add('trip-live-policy');
    box.dataset.policyTone = policy.tone || '';
    box.innerHTML = `<span class="trip-live-policy-label">${label}</span><b class="trip-live-policy-headline">${policy.headline}</b><small class="trip-live-policy-detail">${policy.detail}</small>`;
  }

  function disablePastActions(card, trip, policy) {
    const cancelled = /^Отменено/i.test(String(trip?.status || ''));
    const blocked = cancelled || policy?.isPast;
    [...card.querySelectorAll('button')].forEach(button => {
      const text = String(button.textContent || '').trim();
      if (!/^(Отменить|Перенести|Отменено|Недоступно)$/i.test(text)) return;
      if (!blocked) return;
      button.disabled = true;
      if (policy?.isPast && !cancelled) {
        button.textContent = text === 'Перенести' ? 'Перенос недоступен' : 'Отмена недоступна';
      }
    });
  }

  function refreshLivePolicies(now = new Date()) {
    const trips = (() => { try { return Array.isArray(demoTrips) ? demoTrips : []; } catch (_) { return []; } })();
    const cards = [...document.querySelectorAll('#tripsScreen .trip-card')];
    cards.forEach((card, index) => {
      const trip = trips[index];
      if (!trip) return;
      const policy = livePolicy(trip, now);
      if (!policy.valid) return;
      renderPolicyBox(smallestPolicyBox(card, 'ОТМЕНА'), 'ОТМЕНА', policy.cancel);
      renderPolicyBox(smallestPolicyBox(card, 'ПЕРЕНОС'), 'ПЕРЕНОС', policy.reschedule);
      disablePastActions(card, trip, policy);
    });
  }

  function injectStyles() {
    if (document.getElementById('max-tour-live-policy-v2')) return;
    const style = document.createElement('style');
    style.id = 'max-tour-live-policy-v2';
    style.textContent = `
      #tripsScreen .trip-live-policy{display:flex;flex-direction:column;justify-content:center;gap:3px;min-height:78px}
      #tripsScreen .trip-live-policy-label{font-size:10px;line-height:1;font-weight:950;letter-spacing:.05em;color:#8b6652}
      #tripsScreen .trip-live-policy-headline{font-size:14px;line-height:1.2;color:var(--ink,#2c2019)}
      #tripsScreen .trip-live-policy-detail{font-size:10px;line-height:1.25;font-weight:800;color:var(--muted,#7d6b60)}
      #tripsScreen .trip-live-policy[data-policy-tone="free"]{background:#effaf3!important;border-color:rgba(22,116,76,.22)!important}
      #tripsScreen .trip-live-policy[data-policy-tone="warning"]{background:#fff7e8!important;border-color:rgba(213,146,26,.30)!important}
      #tripsScreen .trip-live-policy[data-policy-tone="danger"]{background:#fff0f0!important;border-color:rgba(196,50,35,.26)!important}
      #tripsScreen .trip-live-policy[data-policy-tone="closed"]{background:#f3f1ef!important;border-color:rgba(80,70,64,.18)!important}
      #tripsScreen button:disabled{opacity:.48;cursor:not-allowed}
    `;
    document.head.appendChild(style);
  }

  injectStyles();

  try {
    const previousStartBooking = startBooking;
    startBooking = function(format, ...args) {
      try { if (format) state.format = format; } catch (_) {}
      syncBookingDate(new Date());
      const result = previousStartBooking.apply(this, [format, ...args]);
      enforceBookingDateInput(new Date());
      return result;
    };
  } catch (_) {}

  try {
    const previousRenderBooking = renderBooking;
    renderBooking = function(...args) {
      syncBookingDate(new Date());
      const result = previousRenderBooking.apply(this, args);
      enforceBookingDateInput(new Date());
      return result;
    };
  } catch (_) {}

  try {
    const previousCompletePayment = completePayment;
    completePayment = function(...args) {
      syncBookingDate(new Date());
      return previousCompletePayment.apply(this, args);
    };
  } catch (_) {}

  try {
    const previousRenderTrips = renderTrips;
    renderTrips = function(...args) {
      const result = previousRenderTrips.apply(this, args);
      refreshLivePolicies(new Date());
      return result;
    };
  } catch (_) {}

  setTimeout(() => refreshLivePolicies(new Date()), 0);
  setInterval(() => refreshLivePolicies(new Date()), 60 * 1000);

  globalThis.MaxTourLivePolicy = {
    livePolicy,
    tripMoment,
    refreshLivePolicies,
    syncBookingDate,
    enforceBookingDateInput,
    _test:{ vietnamTodayIso, parseDepartureDate, fixedGroupDepartureIso, shiftIsoDate },
  };
})();
