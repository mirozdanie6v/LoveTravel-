(() => {
  'use strict';

  const FALLBACK_KEY = 'max-tour-v28-demo-state';
  const original = {};
  const LEGACY_DEMO_NAME_REPLACEMENTS = [
    ['Иван Петров','Nguyen Van An'],
    ['Анна Петрова','Tran Thi Mai'],
    ['Марк Петров','Nguyen Minh Khoa'],
  ];

  function sanitizeLegacyDemoData(value) {
    if (Array.isArray(value)) return value.map(sanitizeLegacyDemoData);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeLegacyDemoData(item)]));
    }
    if (typeof value !== 'string') return value;
    return LEGACY_DEMO_NAME_REPLACEMENTS.reduce((text, [from, to]) => text.split(from).join(to), value);
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function snapshot() {
    return sanitizeLegacyDemoData({
      bookings: Array.isArray(demoTrips) ? demoTrips : [],
      travelers: Array.isArray(travelerDirectory) ? travelerDirectory : [],
      favorites: Array.from(liked || []),
    });
  }

  function saveFallback() {
    try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot())); } catch (_) {}
  }

  function restoreFallback() {
    try {
      const raw = localStorage.getItem(FALLBACK_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      applyBootstrap(data);
      return true;
    } catch (_) { return false; }
  }

  function applyBootstrap(data = {}) {
    data = sanitizeLegacyDemoData(data);
    if (Array.isArray(data.bookings) && data.bookings.length) {
      demoTrips.splice(0, demoTrips.length, ...data.bookings);
    }
    if (Array.isArray(data.travelers) && data.travelers.length) {
      travelerDirectory.splice(0, travelerDirectory.length, ...data.travelers);
    }
    if (Array.isArray(data.favorites)) {
      liked.clear();
      data.favorites.forEach(id => liked.add(id));
    }
    if (Array.isArray(data.customTours)) {
      data.customTours.forEach(tour => {
        const index = TOURS.findIndex(t => t.id === tour.id);
        if (index >= 0) TOURS[index] = tour; else TOURS.push(tour);
      });
    }
    applyGroupDepartures(data.groupDepartures);
  }

  function departureLabel(iso) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? new Date(`${iso}T00:00:00Z`) : null;
    return date && !Number.isNaN(date.valueOf())
      ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date)
      : String(iso || '');
  }

  function departureStatus(status, taken, capacity) {
    if (status === 'cancelled') return 'отменена';
    if (Number(taken) >= Number(capacity)) return 'лист ожидания';
    if (status === 'almost_full') return 'почти собрана';
    if (status === 'full') return 'лист ожидания';
    return 'собирается';
  }

  function applyGroupDepartures(departures) {
    if (!Array.isArray(departures)) return;
    departures.forEach(departure => {
      const tour = TOURS.find(item => String(item.id) === String(departure.tourId));
      if (!tour) return;
      tour.group = tour.group || { departures: [] };
      tour.group.departures = Array.isArray(tour.group.departures) ? tour.group.departures : [];
      const next = {
        id: departure.id,
        iso: departure.date,
        date: departureLabel(departure.date),
        time: departure.time || '09:00',
        taken: Number(departure.taken || 0),
        capacity: Number(departure.capacity || 1),
        status: departureStatus(departure.status, departure.taken, departure.capacity),
        source: 'Админка',
        notes: departure.notes || '',
      };
      const index = tour.group.departures.findIndex(item => item.id === next.id || (item.iso === next.iso && item.time === next.time));
      if (index >= 0) tour.group.departures[index] = { ...tour.group.departures[index], ...next };
      else tour.group.departures.push(next);
    });
  }

  async function loadCanonicalCatalog() {
    try {
      const response = await fetch('/catalog.v28.json', { cache: 'no-store' });
      if (!response.ok) return;
      const catalog = await response.json();
      if (!Array.isArray(catalog) || !catalog.length) return;
      TOURS.splice(0, TOURS.length, ...catalog);
      if (!TOURS.some(t => t.id === state.selectedTour?.id)) state.selectedTour = TOURS[0];
      else state.selectedTour = TOURS.find(t => t.id === state.selectedTour.id);
    } catch (_) {}
  }

  async function bootstrap() {
    await loadCanonicalCatalog();
    try {
      let data = await request('/api/bootstrap');
      if (!data.hasData) data = await request('/api/bootstrap', { method:'POST', body:JSON.stringify(snapshot()) });
      applyBootstrap(data);
      saveFallback();
    } catch (error) {
      console.warn('[MAX TOUR v28] API bootstrap fallback:', error);
      restoreFallback();
    }
    if (state.screen === 'home') renderHome();
    else showScreen(state.screen);
  }

  async function persistFavorites() {
    saveFallback();
    try { await request('/api/favorites', { method:'PUT', body:JSON.stringify({ favorites:Array.from(liked) }) }); }
    catch (error) { console.warn('[MAX TOUR v28] favorite persistence:', error); }
  }

  async function persistTrip(trip) {
    saveFallback();
    try { await request('/api/bookings', { method:'POST', body:JSON.stringify(trip) }); }
    catch (error) { console.warn('[MAX TOUR v28] booking persistence:', error); }
  }

  function showRuntimeModal(title, body, actions = '') {
    document.querySelector('.policy-modal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'policy-modal';
    modal.innerHTML = `<div class="policy-dialog">
      <button class="modal-close" type="button">×</button>
      <h3>${escapeHtml(title)}</h3>
      <div class="runtime-modal-body">${body}</div>
      ${actions || '<button class="primary runtime-close" type="button">Готово</button>'}
    </div>`;
    modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
    modal.querySelector('.runtime-close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    return modal;
  }

  function wireCatalogControls() {
    const button = document.querySelector('#catalogScreen .cf-collapse-v26');
    if (!button || button.dataset.wired) return;
    button.dataset.wired = '1';
    button.addEventListener('click', () => {
      const section = button.closest('.catalog-filter-v26');
      if (!section) return;
      const targets = section.querySelectorAll('.cf-grid-v26,.cf-sep-v26,.cf-kids-v26,.cf-actions-v26');
      const collapsed = button.getAttribute('aria-expanded') === 'false';
      targets.forEach(el => { el.hidden = !collapsed; });
      button.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
      button.setAttribute('aria-label', collapsed ? 'Свернуть фильтры' : 'Развернуть фильтры');
      button.style.transform = collapsed ? '' : 'rotate(180deg)';
    });
  }

  function installCatalogSearchFix() {
    const current = globalThis.searchValue;
    if (typeof current !== 'function' || current.__maxTourSearchFix) return;
    const fixed = function(value) {
      const active = document.activeElement;
      const input = active?.matches?.('#catalogScreen .catalog-search-v26 input') ? active : null;
      const start = input && Number.isInteger(input.selectionStart) ? input.selectionStart : String(value || '').length;
      const end = input && Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
      const content = document.getElementById('content');
      const scrollTop = content?.scrollTop;
      current(value);
      const next = document.querySelector('#catalogScreen .catalog-search-v26 input');
      if (input && next) {
        next.focus({ preventScroll: true });
        try { next.setSelectionRange(start, end); } catch (_) {}
      }
      if (content && Number.isFinite(scrollTop)) content.scrollTop = scrollTop;
    };
    fixed.__maxTourSearchFix = true;
    globalThis.searchValue = fixed;
    // The v28 renderer creates the search input again after every keystroke.
    // Capture the event before the old inline handler runs, then re-focus the
    // newly rendered input inside `fixed` so mobile keyboards keep typing.
    document.addEventListener('input', event => {
      const input = event.target;
      if (!input?.matches?.('#catalogScreen .catalog-search-v26 input')) return;
      event.stopImmediatePropagation();
      fixed(input.value);
    }, true);
  }

  function wireTripControls() {
    document.querySelectorAll('#tripsScreen button').forEach(button => {
      if (button.dataset.wired || button.hasAttribute('onclick')) return;
      button.dataset.wired = '1';
      // Online purchase is self-service. The old prototype button invited a
      // manager into the customer flow, so remove it from the rendered card.
      if (button.textContent.trim() === 'Написать менеджеру') button.remove();
    });
  }

  function recommendTours(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/[^a-zа-яё0-9$]+/i).filter(x => x.length > 2);
    return TOURS.map(t => {
      const haystack = `${t.title} ${t.city} ${t.region} ${t.category} ${(t.tags||[]).join(' ')} ${(t.audience||[]).join(' ')} ${t.searchText||''}`.toLowerCase();
      let score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 3 : 0), 0);
      if (/реб|дет|сем/.test(q) && t.childrenOk) score += 4;
      if (/мор|пляж|остров/.test(q) && /мор|остров|пляж/.test(haystack)) score += 4;
      if (/премиум|vip|вип/.test(q) && /премиум|вип|vip/.test(haystack)) score += 4;
      if (/нячанг/.test(q) && t.city === 'Нячанг') score += 4;
      if (/далат/.test(q) && /далат/.test(haystack)) score += 5;
      return { t, score };
    }).sort((a,b) => b.score-a.score || Number(b.t.popular)-Number(a.t.popular)).slice(0,3).map(x => x.t);
  }

  function wireAI() {
    const root = document.getElementById('aiScreen');
    if (!root) return;
    if (globalThis.MaxTourAI?.mount) {
      globalThis.MaxTourAI.mount(root);
      return;
    }
    const input = root.querySelector('.chatbar input');
    const send = root.querySelector('.chatbar button');
    if (!input || !send || send.dataset.wired) return;
    send.dataset.wired = '1';
    const submit = () => {
      const query = input.value.trim();
      if (!query) return;
      const picks = recommendTours(query);
      const panel = root.querySelector('.panel');
      const actions = panel?.querySelector('.ai-actions-row');
      if (!panel) return;
      const user = document.createElement('div'); user.className='ai-msg user'; user.textContent=query;
      const bot = document.createElement('div'); bot.className='ai-msg bot';
      bot.innerHTML = picks.length
        ? `По вашему запросу лучше всего подходят: ${picks.map(t=>`<b>${escapeHtml(t.title)}</b>`).join(', ')}. Откройте карточку, чтобы сравнить программу, формат и цену.`
        : 'Не нашёл точного совпадения. Откройте каталог и уточните город, состав группы или желаемый формат отдыха.';
      if (actions) { panel.insertBefore(user, actions); panel.insertBefore(bot, actions); }
      else { panel.append(user, bot); }
      if (picks[0]) {
        const open = document.createElement('button'); open.className='secondary'; open.textContent=`Открыть ${picks[0].title}`;
        open.addEventListener('click',()=>openTour(picks[0].id));
        actions?.prepend(open);
      }
      input.value='';
    };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }

  function tourFromForm(form) {
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const city = String(fd.get('city') || 'Нячанг').trim();
    const price = Math.max(0, Number(fd.get('price') || 0));
    const id = `custom-${Date.now()}`;
    return {
      id, popular:false, title, city, region:city, duration:String(fd.get('duration') || '1 день'), time:'по запросу',
      image:FALLBACK_SEA, fallbackImage:FALLBACK_SEA, gallery:[FALLBACK_SEA], tags:['новинка'], activity:'средний', audience:['семья','пара','компания'],
      group:{ from:`$${price}`, adult:`$${price}`, child:'по запросу', infant:'по запросу', deposit:'30% или 100%', notes:['Новый тур'], departures:[] },
      individual:{ from:`$${Math.max(price, price*4)}`, tiers:[`от $${Math.max(price, price*4)}`], deposit:'30% или 100%', notes:['Дата и программа по запросу'] },
      route:[], included:[], take:[], liked:false, searchText:`${title} ${city}`.toLowerCase(), formatsLabel:'индивидуальный / групповой', category:'Другое', childrenOk:true, priceFromUsd:price,
    };
  }

  function adminAddTour() {
    const modal = showRuntimeModal('Добавить экскурсию', `
      <form id="runtime-add-tour">
        <div class="field"><label>Название</label><input name="title" required placeholder="Название экскурсии"></div>
        <div class="field"><label>Город</label><input name="city" value="Нячанг" required></div>
        <div class="field"><label>Длительность</label><input name="duration" value="1 день" required></div>
        <div class="field"><label>Групповая цена от, $</label><input name="price" inputmode="numeric" value="50" required></div>
        <div class="inline-actions"><button class="primary" type="submit">Сохранить экскурсию</button></div>
      </form>`, '');
    const form = modal.querySelector('#runtime-add-tour');
    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const tour = tourFromForm(form);
      if (!tour.title) return;
      try {
        const result = await request('/api/admin/tours',{method:'POST',body:JSON.stringify(tour)});
        TOURS.push(result.tour || tour);
      } catch (_) { TOURS.push(tour); }
      modal.remove();
      showRuntimeModal('Экскурсия добавлена', `<p><b>${escapeHtml(tour.title)}</b> уже появилась в каталоге.</p>`);
    });
  }

  function adminGroups() {
    const rows = TOURS.flatMap(t => (t.group?.departures || []).map(d => ({...d,title:t.title})));
    showRuntimeModal('Групповые выезды', rows.length ? `<div class="admin-list">${rows.map(r=>`<div class="order"><b>${escapeHtml(r.title)}</b><br>${escapeHtml(r.date)} · ${escapeHtml(r.time)} · ${r.taken}/${r.capacity} · ${escapeHtml(r.status)}</div>`).join('')}</div>` : '<p>Нет загруженных групповых выездов.</p>');
  }

  function adminWeather() {
    const rows = demoTrips || [];
    const modal = showRuntimeModal('Отмена из-за погоды', rows.length ? `<div class="admin-list">${rows.map((x,i)=>`<div class="order"><b>${escapeHtml(x.title)}</b><br>${escapeHtml(x.date)} · ${escapeHtml(x.status)}<br><button class="secondary runtime-weather" data-index="${i}" type="button">Отменить и зафиксировать</button></div>`).join('')}</div>` : '<p>Нет заявок для изменения.</p>');
    modal.querySelectorAll('.runtime-weather').forEach(btn => btn.addEventListener('click', async () => {
      const trip = demoTrips[Number(btn.dataset.index)];
      if (!trip) return;
      trip.status = 'Отменено из-за погоды';
      saveFallback();
      try { await request(`/api/bookings/${encodeURIComponent(trip.id)}`,{method:'PATCH',body:JSON.stringify({status:trip.status})}); } catch (_) {}
      modal.remove();
      showRuntimeModal('Статус изменён', `<p>${escapeHtml(trip.title)}: <b>${escapeHtml(trip.status)}</b>.</p>`);
    }));
  }

  function adminBroadcast() {
    const modal = showRuntimeModal('Рассылка', `<form id="runtime-mailing"><div class="field"><label>Сообщение</label><textarea name="message" rows="5" required placeholder="Текст сообщения клиентам"></textarea></div><div class="inline-actions"><button class="primary" type="submit">Создать рассылку</button></div></form>`, '');
    modal.querySelector('#runtime-mailing')?.addEventListener('submit', async e => {
      e.preventDefault();
      const message = String(new FormData(e.currentTarget).get('message') || '').trim();
      if (!message) return;
      try { await request('/api/admin/events',{method:'POST',body:JSON.stringify({type:'broadcast',message})}); } catch (_) {}
      modal.remove();
      showRuntimeModal('Рассылка создана','<p>Сообщение поставлено в очередь отправки выбранному сегменту.</p>');
    });
  }

  function wireAdmin() {
    const root = document.getElementById('adminScreen');
    if (!root) return;
    const quick = [...root.querySelectorAll('.quick-tile')];
    [adminAddTour,adminGroups,adminWeather,adminBroadcast].forEach((fn,i) => {
      const b=quick[i]; if (!b || b.dataset.wired) return; b.dataset.wired='1'; b.addEventListener('click',fn);
    });
    root.querySelectorAll('.admin-list .secondary').forEach(button => {
      if (button.dataset.wired || button.hasAttribute('onclick')) return;
      button.dataset.wired='1';
      button.addEventListener('click',()=>showRuntimeModal('Действие по заказу',`<p><b>${escapeHtml(button.textContent.trim())}</b> — действие сохранено.</p>`));
    });
    request('/api/admin/stats').then(stats => {
      const cards=[...root.querySelectorAll('.admin-grid .stat b')];
      if (cards[0] && Number.isFinite(Number(stats.bookings))) cards[0].textContent=String(stats.bookings);
    }).catch(()=>{});
  }

  function installWrappers() {
    original.toggleLike = toggleLike;
    toggleLike = function(...args) { const result = original.toggleLike.apply(this,args); persistFavorites(); return result; };

    original.completePayment = completePayment;
    completePayment = function(...args) {
      const previousId = demoTrips[0]?.id;
      const result = original.completePayment.apply(this,args);
      const created = demoTrips[0];
      if (created?.id && created.id !== previousId) persistTrip(created);
      return result;
    };

    original.renderCatalog = renderCatalog;
    renderCatalog = function(...args) { const result=original.renderCatalog.apply(this,args); wireCatalogControls(); return result; };
    installCatalogSearchFix();

    original.renderTrips = renderTrips;
    renderTrips = function(...args) { const result=original.renderTrips.apply(this,args); wireTripControls(); return result; };

    original.renderAI = renderAI;
    renderAI = function(...args) { const result=original.renderAI.apply(this,args); wireAI(); return result; };

    original.renderAdmin = renderAdmin;
    renderAdmin = function(...args) { const result=original.renderAdmin.apply(this,args); wireAdmin(); return result; };
  }

  installWrappers();
  bootstrap();
})();
