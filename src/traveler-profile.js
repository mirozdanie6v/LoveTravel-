(() => {
  'use strict';

  const PROFILE_STATE = { editingIndex: null, error: '' };
  const FALLBACK_KEY = 'max-tour-v28-demo-state';

  function travelerKey(t) {
    return `${String(t?.fullName || '').trim().toLowerCase()}|${String(t?.birthDate || '').trim()}`;
  }

  function normalizeDirectory(list = travelerDirectory) {
    const clean = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach(item => {
      const fullName = String(item?.fullName || '').trim();
      const birthDate = String(item?.birthDate || '').trim();
      if (!fullName || !birthDate) return;
      const key = `${fullName.toLowerCase()}|${birthDate}`;
      if (seen.has(key)) return;
      seen.add(key);
      clean.push({
        role: item?.role || 'adult',
        label: item?.label || 'Попутчик',
        fullName,
        birthDate,
        primary: !!item?.primary,
      });
    });

    let primaryIndex = clean.findIndex(t => t.primary && t.role === 'adult');
    if (primaryIndex < 0) primaryIndex = clean.findIndex(t => t.role === 'adult');
    if (primaryIndex < 0 && clean.length) primaryIndex = 0;

    clean.forEach((t, index) => {
      t.primary = index === primaryIndex;
      if (t.primary) t.label = 'Основной путешественник';
      else if (t.role === 'adult') t.label = 'Попутчик · взрослый';
      else if (t.role === 'child') t.label = 'Попутчик · ребёнок';
      else t.label = 'Попутчик · малыш';
    });

    travelerDirectory.splice(0, travelerDirectory.length, ...clean);
    return clean;
  }

  function saveFallback() {
    try {
      const current = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '{}');
      current.travelers = travelerDirectory;
      current.bookings = Array.isArray(demoTrips) ? demoTrips : (current.bookings || []);
      current.favorites = Array.from(liked || []);
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(current));
    } catch (_) {}
  }

  async function persistDirectory() {
    const normalized = normalizeDirectory();
    saveFallback();
    try {
      const response = await fetch('/api/travelers', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ travelers: normalized }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (Array.isArray(data.travelers)) normalizeDirectory(data.travelers);
      return true;
    } catch (error) {
      console.warn('[MAX TOUR v28] traveler directory persistence:', error);
      return false;
    }
  }

  function formatBirthDate(value) {
    const raw = String(value || '');
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : raw;
  }

  function usedTravelerKeys(exceptIndex) {
    const used = new Set();
    (state.booking?.travelers || []).forEach((t, index) => {
      if (index === exceptIndex) return;
      const key = travelerKey(t);
      if (key !== '|') used.add(key);
    });
    return used;
  }

  function savedTravelerPickerHtml(tr, index) {
    normalizeDirectory();
    const used = usedTravelerKeys(index);
    const choices = travelerDirectory
      .map((item, directoryIndex) => ({ item, directoryIndex }))
      .filter(({ item }) => item.role === tr.role)
      .sort((a, b) => Number(b.item.primary) - Number(a.item.primary));

    if (!choices.length) return '';
    return `<div class="saved-traveler-picker" id="savedTravelerPicker-${index}" hidden>
      <div class="saved-traveler-title">Выбрать из сохранённых</div>
      <div class="saved-traveler-options">
        ${choices.map(({ item, directoryIndex }) => {
          const isUsed = used.has(travelerKey(item));
          return `<button type="button" class="saved-traveler-option ${item.primary ? 'primary-person' : ''}" ${isUsed ? 'disabled' : ''} onclick="useSavedTraveler(${index},${directoryIndex})">
            <b>${escapeHtml(item.fullName)}</b>
            <span>${item.primary ? 'Основной · ' : ''}${escapeHtml(formatBirthDate(item.birthDate))}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
  }

  function openSavedTravelerPicker(index) {
    document.querySelectorAll('.saved-traveler-picker').forEach((node, i) => {
      node.hidden = i !== index;
    });
    const node = document.getElementById(`savedTravelerPicker-${index}`);
    if (node) node.hidden = false;
  }

  function useSavedTraveler(slotIndex, directoryIndex) {
    syncTravelers();
    normalizeDirectory();
    const saved = travelerDirectory[directoryIndex];
    const slot = state.booking.travelers?.[slotIndex];
    if (!saved || !slot) return;

    const used = usedTravelerKeys(slotIndex);
    if (used.has(travelerKey(saved))) {
      state.booking.error = 'Этот путешественник уже выбран в заявке.';
      renderBooking();
      return;
    }

    slot.fullName = saved.fullName;
    slot.birthDate = saved.birthDate;
    state.booking.error = '';
    renderBooking();
  }

  function travelerCardHtmlEnhanced(tr, i) {
    return `<div class="traveler-card ${tr.primary ? 'main' : ''}">
      <div class="traveler-head">
        <b>${escapeHtml(tr.label)}</b>
        <span>${escapeHtml(roleName(tr.role))}</span>
      </div>
      <div class="traveler-fields">
        <div class="field">
          <label>ФИО</label>
          <input required placeholder="Фамилия Имя" value="${escapeHtml(tr.fullName)}" onfocus="openSavedTravelerPicker(${i})" oninput="setTravelerField(${i},'fullName',this.value)">
          ${savedTravelerPickerHtml(tr, i)}
        </div>
        <div class="field">
          <label>Дата рождения</label>
          <input required type="date" value="${escapeHtml(tr.birthDate)}" onchange="setTravelerField(${i},'birthDate',this.value)">
        </div>
      </div>
    </div>`;
  }

  function beginTravelerEdit(index) {
    normalizeDirectory();
    PROFILE_STATE.editingIndex = index;
    PROFILE_STATE.error = '';
    renderTrips();
  }

  function cancelTravelerEdit() {
    PROFILE_STATE.editingIndex = null;
    PROFILE_STATE.error = '';
    renderTrips();
  }

  async function removeTraveler(index) {
    normalizeDirectory();
    const target = travelerDirectory[index];
    if (!target || target.primary) return;
    if (!window.confirm(`Удалить попутчика «${target.fullName}» из сохранённых данных?`)) return;

    const previous = travelerDirectory.map(item => ({ ...item }));
    travelerDirectory.splice(index, 1);
    normalizeDirectory();
    PROFILE_STATE.editingIndex = null;
    PROFILE_STATE.error = '';
    saveFallback();
    renderTrips();

    const persisted = await persistDirectory();
    if (!persisted) {
      travelerDirectory.splice(0, travelerDirectory.length, ...previous);
      normalizeDirectory();
      saveFallback();
      renderTrips();
    }
  }

  function editFormHtml(t, index) {
    return `<div class="traveler-edit-form">
      <div class="field"><label>ФИО</label><input id="profileTravelerName-${index}" value="${escapeHtml(t.fullName)}" placeholder="Фамилия Имя"></div>
      <div class="field"><label>Дата рождения</label><input id="profileTravelerBirth-${index}" type="date" value="${escapeHtml(t.birthDate)}"></div>
      ${PROFILE_STATE.error ? `<div class="form-error">${escapeHtml(PROFILE_STATE.error)}</div>` : ''}
      <div class="inline-actions profile-edit-actions">
        <button class="primary" type="button" onclick="saveTravelerEdit(${index})">Сохранить</button>
        <button class="secondary" type="button" onclick="cancelTravelerEdit()">Отмена</button>
      </div>
    </div>`;
  }

  async function saveTravelerEdit(index) {
    normalizeDirectory();
    const target = travelerDirectory[index];
    if (!target) return;

    const fullName = String(document.getElementById(`profileTravelerName-${index}`)?.value || '').trim();
    const birthDate = String(document.getElementById(`profileTravelerBirth-${index}`)?.value || '').trim();
    if (!fullName || !birthDate) {
      PROFILE_STATE.error = 'Заполните ФИО и дату рождения.';
      renderTrips();
      return;
    }

    const nextKey = `${fullName.toLowerCase()}|${birthDate}`;
    const duplicate = travelerDirectory.some((item, itemIndex) => itemIndex !== index && travelerKey(item) === nextKey);
    if (duplicate) {
      PROFILE_STATE.error = 'Такой путешественник уже есть в личном кабинете.';
      renderTrips();
      return;
    }

    target.fullName = fullName;
    target.birthDate = birthDate;
    normalizeDirectory();
    PROFILE_STATE.editingIndex = null;
    PROFILE_STATE.error = '';
    saveFallback();
    renderTrips();
    await persistDirectory();
  }

  function profileTravelerCard(t, index, primary) {
    if (PROFILE_STATE.editingIndex === index) {
      return `<div class="traveler-profile-card ${primary ? 'main' : ''}">
        <div class="profile-traveler-head"><h3>${primary ? 'Основной путешественник' : escapeHtml(t.label || 'Попутчик')}</h3></div>
        ${editFormHtml(t, index)}
      </div>`;
    }

    return `<div class="traveler-profile-card ${primary ? 'main' : ''}">
      <div class="profile-traveler-head">
        <h3>${primary ? 'Основной путешественник' : escapeHtml(t.label || 'Попутчик')}</h3>
        <div class="profile-traveler-actions"><button class="secondary profile-edit-button" type="button" onclick="beginTravelerEdit(${index})">Изменить</button>${primary ? '' : `<button class="secondary danger-soft profile-delete-button" type="button" onclick="removeTraveler(${index})">Удалить</button>`}</div>
      </div>
      <div class="traveler-mini"><div><span>ФИО</span><b>${escapeHtml(t.fullName)}</b></div><small>${escapeHtml(formatBirthDate(t.birthDate))}</small></div>
    </div>`;
  }

  function renderPersonalCabinetEnhanced() {
    normalizeDirectory();
    const primaryIndex = travelerDirectory.findIndex(t => t.primary);
    const primary = primaryIndex >= 0 ? travelerDirectory[primaryIndex] : null;
    const companions = travelerDirectory.map((t, index) => ({ t, index })).filter(({ index }) => index !== primaryIndex);

    return `
      <div class="trip-profile-card">
        <h3>Личный кабинет</h3>
        <div class="hint">Данные путешественников сохраняются после оформления заявки и доступны для быстрого выбора при следующем бронировании.</div>
        <div class="profile-grid">
          <div class="profile-chip"><span>Telegram</span><b>@maxtour_guest</b></div>
          <div class="profile-chip"><span>Телефон</span><b>добавить</b></div>
          <div class="profile-chip"><span>Язык</span><b>Русский</b></div>
          <div class="profile-chip"><span>Согласия</span><b>актуальны</b></div>
        </div>
      </div>
      ${primary ? profileTravelerCard(primary, primaryIndex, true) : `<div class="empty">После первой заявки здесь появится основной путешественник.</div>`}
      <div class="traveler-profile-card companions-card">
        <div class="profile-traveler-head"><h3>Попутчики</h3><span class="hint">${companions.length}</span></div>
        ${companions.length ? `<div class="traveler-profile-stack">${companions.map(({ t, index }) => profileTravelerCard(t, index, false)).join('')}</div>` : `<div class="hint">Добавятся автоматически после заполнения ФИО и даты рождения в заявке.</div>`}
      </div>
      <div class="agreement-card">
        <h3>Соглашения и данные</h3>
        <div class="agreement-list">
          <div class="agreement-row">Согласие на обработку данных для бронирования экскурсии и связи по поездке.</div>
          <div class="agreement-row">Правила оплаты, переноса и отмены показываются до оплаты в оформлении поездки.</div>
          <div class="agreement-row">Сохранённые путешественники доступны для повторного выбора в новых заявках.</div>
        </div>
      </div>
    `;
  }

  function mergeTravelerDirectory(list) {
    normalizeDirectory();
    const incoming = (Array.isArray(list) ? list : []).filter(t => t?.fullName && t?.birthDate);
    if (!incoming.length) return;

    const incomingPrimary = incoming.find(t => t.primary);
    incoming.forEach(t => {
      const key = travelerKey(t);
      const index = travelerDirectory.findIndex(x => travelerKey(x) === key);
      const normalized = {
        role: t.role || 'adult',
        label: t.label || 'Попутчик',
        fullName: String(t.fullName).trim(),
        birthDate: String(t.birthDate).trim(),
        primary: !!t.primary,
      };
      if (index >= 0) travelerDirectory[index] = { ...travelerDirectory[index], ...normalized };
      else travelerDirectory.push(normalized);
    });

    if (incomingPrimary) {
      const primaryKey = travelerKey(incomingPrimary);
      travelerDirectory.forEach(t => { t.primary = travelerKey(t) === primaryKey; });
    }
    normalizeDirectory();
    persistDirectory();
  }

  function injectStyles() {
    if (document.getElementById('max-tour-traveler-profile-styles')) return;
    const style = document.createElement('style');
    style.id = 'max-tour-traveler-profile-styles';
    style.textContent = `
      .saved-traveler-picker{margin-top:8px;padding:10px;border:1px solid var(--line,#e6e8ec);border-radius:14px;background:var(--surface,#fff)}
      .saved-traveler-title{font-size:12px;font-weight:700;margin-bottom:8px}
      .saved-traveler-options{display:grid;grid-template-columns:1fr;gap:8px;overflow:visible;padding-bottom:2px}
      .saved-traveler-option{width:100%;min-width:0;text-align:left;border:1px solid var(--line,#e6e8ec);border-radius:12px;background:#fff;padding:9px 10px;color:inherit}
      .saved-traveler-option b,.saved-traveler-option span{display:block}.saved-traveler-option span{font-size:11px;opacity:.65;margin-top:3px}
      .saved-traveler-option.primary-person{border-color:currentColor}.saved-traveler-option:disabled{opacity:.35}
      .profile-traveler-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.profile-traveler-head h3{margin:0}
      .profile-traveler-actions{display:flex;align-items:center;gap:7px;flex:0 0 auto}.profile-edit-button,.profile-delete-button{flex:0 0 auto}.traveler-edit-form{margin-top:12px}.profile-edit-actions{margin-top:10px}
      .traveler-profile-stack{display:grid;gap:10px;margin-top:10px}.companions-card>.traveler-profile-stack>.traveler-profile-card{margin:0}
      @media(max-width:420px){.profile-traveler-head{align-items:flex-start;flex-wrap:wrap}.profile-traveler-actions{width:100%;justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  normalizeDirectory();
  injectStyles();

  travelerCardHtml = travelerCardHtmlEnhanced;
  renderPersonalCabinet = renderPersonalCabinetEnhanced;
  updateTravelerDirectory = mergeTravelerDirectory;

  globalThis.openSavedTravelerPicker = openSavedTravelerPicker;
  globalThis.useSavedTraveler = useSavedTraveler;
  globalThis.beginTravelerEdit = beginTravelerEdit;
  globalThis.cancelTravelerEdit = cancelTravelerEdit;
  globalThis.saveTravelerEdit = saveTravelerEdit;
  globalThis.removeTraveler = removeTraveler;
  globalThis.MaxTourTravelerProfile = { normalizeDirectory, persistDirectory, travelerKey };
})();
