(() => {
  'use strict';

  const FALLBACK_KEY = 'max-tour-v28-demo-state';
  const OFFSET = '+07:00';
  const MONTHS = { янв:1, фев:2, мар:3, апр:4, май:5, мая:5, июн:6, июл:7, авг:8, сен:9, сент:9, окт:10, ноя:11, дек:12 };

  const amount = value => {
    const m = String(value || '').match(/-?\d[\d,.]*/);
    return m ? Number(m[0].replace(/,/g, '')) || 0 : 0;
  };
  const cash = value => `$${Math.max(0, Math.round(Number(value) || 0))}`;

  function shiftIsoDate(iso, days) {
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function vietnamToday(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit'
    }).formatToParts(now);
    const get = type => parts.find(p => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function firstTime(value) {
    const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '05:30';
  }

  function tripMoment(trip) {
    const date = String(trip?.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const d = new Date(`${date}T${firstTime(trip?.time)}:00${OFFSET}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatMoment(d) {
    if (!d || Number.isNaN(d.getTime())) return 'по дате';
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone:'Asia/Ho_Chi_Minh', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
    }).format(d).replace(',', ' ·');
  }

  function policySnapshot(trip, now = new Date()) {
    const d = tripMoment(trip);
    const total = amount(trip?.total) || amount(trip?.paid) + amount(trip?.rest);
    const paid = amount(trip?.paid);
    if (!d) return { d:null, total, paid, now };
    const cancelFree = new Date(d.getTime() - 48 * 60 * 60 * 1000);
    const dayBefore17 = new Date(`${shiftIsoDate(trip.date, -1)}T17:00:00${OFFSET}`);
    return { d, total, paid, now, cancelFree, dayBefore17 };
  }

  function cancellationTerms(trip, now = new Date()) {
    const p = policySnapshot(trip, now);
    if (!p.d) return { valid:false, detail:'Не удалось определить дату выезда.' };
    const rate = p.now < p.cancelFree ? 0 : p.now < p.dayBefore17 ? 0.30 : 1;
    const retained = Math.round(p.total * rate);
    const refund = Math.max(0, p.paid - retained);
    return {
      valid:true,
      rate,
      total:p.total,
      paid:p.paid,
      retained,
      refund,
      additionalPolicyBalance:Math.max(0, retained - p.paid),
      evaluatedAt:p.now,
      cancelFree:p.cancelFree,
      dayBefore17:p.dayBefore17,
      detail: rate === 0
        ? `Отмена сейчас бесплатная. Бесплатная отмена действует до ${formatMoment(p.cancelFree)}.`
        : rate === 0.30
          ? `При отмене сейчас удерживается 30% стоимости: ${cash(retained)}.`
          : `Сейчас действует удержание 100% стоимости: ${cash(retained)}.`
    };
  }

  function rescheduleTerms(trip, now = new Date()) {
    const p = policySnapshot(trip, now);
    if (!p.d) return { valid:false, detail:'Не удалось определить дату выезда.' };
    const rate = p.now < p.dayBefore17 ? 0 : 0.30;
    const fee = Math.round(p.total * rate);
    return {
      valid:true,
      rate,
      total:p.total,
      paid:p.paid,
      fee,
      evaluatedAt:p.now,
      dayBefore17:p.dayBefore17,
      detail: rate === 0
        ? `Перенос сейчас бесплатный. Бесплатный перенос действует до ${formatMoment(p.dayBefore17)}.`
        : `При переносе сейчас удерживается 30% стоимости: ${cash(fee)}.`
    };
  }

  // Исходный v28 использовал фиксированное время 09.09.2026 17:04.
  // Сохраняем его UI, но подаём в существующие cancelPolicy/reschedulePolicy реальное время.
  function livePolicyBase(trip) {
    const p = policySnapshot(trip, new Date());
    return { d:p.d, total:p.total, now:p.now, cancelFree:p.cancelFree, dayBefore17:p.dayBefore17 };
  }
  if (typeof policyBase === 'function') policyBase = livePolicyBase;

  function saveFallback() {
    try {
      const current = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '{}');
      current.bookings = Array.isArray(demoTrips) ? demoTrips : [];
      current.travelers = Array.isArray(travelerDirectory) ? travelerDirectory : [];
      current.favorites = Array.from(liked || []);
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(current));
    } catch (_) {}
  }

  async function persistPatch(trip, patch) {
    saveFallback();
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(trip.id)}`, {
        method:'PATCH',
        credentials:'same-origin',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(patch)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return { ok:true, booking:data.booking };
    } catch (error) {
      console.warn('[MAX TOUR v28] trip action persistence:', error);
      return { ok:false, error };
    }
  }

  function showModal(title, html) {
    document.querySelector('.policy-modal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'policy-modal';
    modal.innerHTML = `<div class="policy-dialog trip-action-dialog">
      <button class="modal-close" type="button">×</button>
      <h3>${escapeHtml(title)}</h3>
      <div class="trip-action-modal-body">${html}</div>
    </div>`;
    modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    return modal;
  }

  function summaryRows(terms, kind) {
    const retained = kind === 'cancel' ? terms.retained : terms.fee;
    const rate = terms.rate === 0 ? 'Без удержания' : `${Math.round(terms.rate * 100)}%`;
    return `<div class="trip-action-summary">
      <div><span>Расчёт актуален на</span><b>${escapeHtml(formatMoment(terms.evaluatedAt))}</b></div>
      <div><span>Стоимость поездки</span><b>${cash(terms.total)}</b></div>
      <div><span>Удержание</span><b>${rate} · ${cash(retained)}</b></div>
      ${kind === 'cancel' ? `<div><span>Уже внесено</span><b>${cash(terms.paid)}</b></div><div><span>К возврату</span><b>${cash(terms.refund)}</b></div>` : ''}
    </div>`;
  }

  const findTrip = id => (Array.isArray(demoTrips) ? demoTrips : []).find(x => String(x.id) === String(id));
  const isCancelled = trip => /^Отменено/.test(String(trip?.status || ''));

  function openCancelTrip(id) {
    const trip = findTrip(id);
    if (!trip || isCancelled(trip)) return;
    const terms = cancellationTerms(trip, new Date());
    if (!terms.valid) return;

    const modal = showModal('Отменить поездку?', `
      <p>${escapeHtml(terms.detail)}</p>
      ${summaryRows(terms, 'cancel')}
      ${terms.additionalPolicyBalance > 0 ? `<p class="hint">Текущий депозит меньше суммы удержания на ${cash(terms.additionalPolicyBalance)}. Перед подтверждением приложение покажет полный расчёт по поездке.</p>` : ''}
      <p class="hint">При подтверждении условия будут рассчитаны ещё раз на текущую секунду.</p>
      <div class="inline-actions trip-action-buttons">
        <button class="secondary trip-action-back" type="button">Не отменять</button>
        <button class="primary trip-action-confirm" type="button">Подтвердить отмену</button>
      </div>`);
    modal.querySelector('.trip-action-back')?.addEventListener('click', () => modal.remove());
    modal.querySelector('.trip-action-confirm')?.addEventListener('click', () => confirmCancelTrip(id, modal));
  }

  async function confirmCancelTrip(id, modal) {
    const trip = findTrip(id);
    if (!trip || isCancelled(trip)) return modal?.remove();
    const terms = cancellationTerms(trip, new Date());
    if (!terms.valid) return;

    const patch = {
      status:'Отменено',
      rest:'$0',
      cancelledAt:formatMoment(terms.evaluatedAt),
      cancellation:{
        rate:terms.rate,
        retained:cash(terms.retained),
        refund:cash(terms.refund),
        previousRest:trip.rest,
        additionalPolicyBalance:cash(terms.additionalPolicyBalance),
        evaluatedAt:terms.evaluatedAt.toISOString()
      },
      actionNote:`Отмена подтверждена ${formatMoment(terms.evaluatedAt)} · удержание ${Math.round(terms.rate * 100)}% (${cash(terms.retained)}) · к возврату ${cash(terms.refund)}`
    };
    Object.assign(trip, patch);
    const persisted = await persistPatch(trip, patch);
    modal?.remove();
    renderTrips();
    const result = showModal('Поездка отменена', `<p>${escapeHtml(patch.actionNote)}.</p><p class="hint">${persisted.ok ? 'Статус и расчёт обновлены.' : 'Изменение пока не подтверждено. Повторите попытку позже.'}</p><button class="primary runtime-close" type="button">Готово</button>`);
    result.querySelector('.runtime-close')?.addEventListener('click', () => result.remove());
  }

  function parseDepartureDate(label, year) {
    const source = String(label || '').toLowerCase().replace(/ё/g, 'е');
    const iso = source.match(/(20\d{2})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const m = source.match(/(\d{1,2})(?:\s*[–-]\s*\d{1,2})?\s*([а-я]+)/i);
    if (!m) return null;
    const key = Object.keys(MONTHS).find(k => m[2].startsWith(k));
    const month = key ? MONTHS[key] : null;
    if (!month) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  }

  function groupDepartureOptions(trip, now = new Date()) {
    const tour = TOURS.find(t => t.id === trip.tourId);
    const year = Number(String(trip.date || '').slice(0, 4)) || Number(vietnamToday(now).slice(0, 4));
    return (tour?.group?.departures || []).map(dep => {
      const date = parseDepartureDate(dep.date, year);
      const time = firstTime(dep.time);
      const moment = date ? new Date(`${date}T${time}:00${OFFSET}`) : null;
      const freePlaces = Math.max(0, Number(dep.capacity || 0) - Number(dep.taken || 0));
      return { ...dep, date, time, moment, freePlaces };
    }).filter(dep => dep.date && dep.date !== trip.date && dep.moment > now && dep.freePlaces > 0);
  }

  function openRescheduleTrip(id) {
    const trip = findTrip(id);
    if (!trip || isCancelled(trip)) return;
    const terms = rescheduleTerms(trip, new Date());
    if (!terms.valid) return;

    const group = /группов/i.test(String(trip.type || ''));
    const options = group ? groupDepartureOptions(trip, new Date()) : [];
    const minDate = shiftIsoDate(vietnamToday(new Date()), 1);
    const suggested = shiftIsoDate(trip.date, 1) < minDate ? minDate : shiftIsoDate(trip.date, 1);
    const picker = group
      ? (options.length
        ? `<div class="field"><label>Новый выезд</label><select id="tripRescheduleDate">${options.map(d => `<option value="${escapeHtml(d.date)}|${escapeHtml(d.time)}">${escapeHtml(d.date)} · ${escapeHtml(d.time)} · свободно ${d.freePlaces}</option>`).join('')}</select></div>`
        : `<div class="form-error">В опубликованном расписании сейчас нет другого доступного группового выезда.</div>`)
      : `<div class="field"><label>Новая дата</label><input id="tripRescheduleDate" type="date" min="${minDate}" value="${suggested}"></div>`;

    const modal = showModal('Перенести поездку', `
      <p>${escapeHtml(terms.detail)}</p>
      ${summaryRows(terms, 'reschedule')}
      ${picker}
      <p class="hint">При подтверждении условия переноса будут пересчитаны ещё раз по старой дате поездки.</p>
      <div class="inline-actions trip-action-buttons">
        <button class="secondary trip-action-back" type="button">Оставить дату</button>
        <button class="primary trip-action-confirm" type="button" ${group && !options.length ? 'disabled' : ''}>Подтвердить перенос</button>
      </div>`);
    modal.querySelector('.trip-action-back')?.addEventListener('click', () => modal.remove());
    modal.querySelector('.trip-action-confirm')?.addEventListener('click', () => confirmRescheduleTrip(id, modal));
  }

  async function confirmRescheduleTrip(id, modal) {
    const trip = findTrip(id);
    if (!trip || isCancelled(trip)) return modal?.remove();
    const input = modal?.querySelector('#tripRescheduleDate');
    const raw = String(input?.value || '');
    const group = /группов/i.test(String(trip.type || ''));
    let newDate = raw;
    let newTime = trip.time;
    if (group) [newDate, newTime] = raw.split('|');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || newDate === trip.date) return;
    const newMoment = new Date(`${newDate}T${firstTime(newTime)}:00${OFFSET}`);
    if (!(newMoment > new Date())) return;

    const terms = rescheduleTerms(trip, new Date());
    if (!terms.valid) return;
    const oldDate = trip.date;
    const oldTime = trip.time;
    const history = Array.isArray(trip.rescheduleHistory) ? [...trip.rescheduleHistory] : [];
    history.push({ fromDate:oldDate, fromTime:oldTime, toDate:newDate, toTime:newTime, rate:terms.rate, fee:cash(terms.fee), at:terms.evaluatedAt.toISOString() });

    const patch = {
      date:newDate,
      time:newTime,
      status:terms.rate ? 'Перенесено · удержание 30%' : 'Перенесено',
      rescheduleFee:cash(terms.fee),
      rescheduledAt:formatMoment(terms.evaluatedAt),
      rescheduleHistory:history,
      actionNote:`Перенос подтверждён: ${oldDate} → ${newDate} · ${terms.rate ? `удержание 30% (${cash(terms.fee)})` : 'без удержания'}`
    };
    Object.assign(trip, patch);
    const persisted = await persistPatch(trip, patch);
    modal?.remove();
    renderTrips();
    const result = showModal('Поездка перенесена', `<p>${escapeHtml(patch.actionNote)}.</p><p class="hint">${persisted.ok ? 'Новая дата, время и статус обновлены.' : 'Изменение пока не подтверждено. Повторите попытку позже.'}</p><button class="primary runtime-close" type="button">Готово</button>`);
    result.querySelector('.runtime-close')?.addEventListener('click', () => result.remove());
  }

  function wireTripActions() {
    if (state.tripTab !== 'booked') return;
    [...document.querySelectorAll('#tripsScreen .trip-card')].forEach((card, index) => {
      const trip = demoTrips[index];
      if (!trip) return;
      const buttons = [...card.querySelectorAll('button')];
      const cancelButton = buttons.find(b => b.textContent.trim() === 'Отменить');
      const moveButton = buttons.find(b => b.textContent.trim() === 'Перенести');

      if (cancelButton) {
        cancelButton.removeAttribute('onclick');
        cancelButton.onclick = null;
        cancelButton.disabled = isCancelled(trip);
        cancelButton.textContent = isCancelled(trip) ? 'Отменено' : 'Отменить';
        if (!isCancelled(trip)) cancelButton.addEventListener('click', () => openCancelTrip(trip.id));
      }
      if (moveButton) {
        moveButton.removeAttribute('onclick');
        moveButton.onclick = null;
        moveButton.disabled = isCancelled(trip);
        if (!isCancelled(trip)) moveButton.addEventListener('click', () => openRescheduleTrip(trip.id));
      }
      if (trip.actionNote && !card.querySelector('.trip-action-result')) {
        const note = document.createElement('div');
        note.className = 'trip-action-result';
        note.textContent = trip.actionNote;
        card.querySelector('.trip-meta')?.insertAdjacentElement('afterend', note);
      }
    });
  }

  function injectStyles() {
    if (document.getElementById('max-tour-trip-action-styles')) return;
    const style = document.createElement('style');
    style.id = 'max-tour-trip-action-styles';
    style.textContent = `
      .trip-action-modal-body{margin-top:8px}.trip-action-summary{display:grid;gap:8px;margin:12px 0}
      .trip-action-summary>div{display:flex;justify-content:space-between;gap:14px;padding:10px 12px;border:1px solid var(--line,#eadfce);border-radius:14px;background:#fff}
      .trip-action-summary span{font-size:11px;color:var(--muted,#806f61);font-weight:750}.trip-action-summary b{font-size:12px;text-align:right}
      .trip-action-buttons{margin-top:12px}.trip-action-result{margin:9px 0 0;padding:9px 11px;border-radius:13px;background:#fff3df;border:1px solid rgba(255,139,31,.24);font-size:11px;font-weight:800;line-height:1.4}
      .trip-action-dialog select,.trip-action-dialog input[type=date]{width:100%}#tripsScreen button:disabled{opacity:.48;cursor:not-allowed}
    `;
    document.head.appendChild(style);
  }

  injectStyles();
  const originalRenderTrips = renderTrips;
  renderTrips = function(...args) {
    const result = originalRenderTrips.apply(this, args);
    wireTripActions();
    return result;
  };

  globalThis.openCancelTrip = openCancelTrip;
  globalThis.openRescheduleTrip = openRescheduleTrip;
  globalThis.MaxTourTripActions = { policySnapshot, cancellationTerms, rescheduleTerms, tripMoment, groupDepartureOptions };
})();
