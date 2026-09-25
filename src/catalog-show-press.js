(() => {
  'use strict';

  // Verified from the current MAX TOUR product pages on 2026-09-15.
  const VERIFIED_NHATRANG_ISLAND_TOURS = [
    {
      id:'orchid-monkey-islands',
      popular:true,
      title:'Остров Орхидей и Остров Обезьян',
      city:'Нячанг',
      region:'Острова Нячанга',
      duration:'1 день',
      time:'07:00 → около 16:00',
      image:'https://thb.tildacdn.one/tild3434-6534-4637-a137-383063623031/-/empty/ostrov-orhidey-i-obe.png',
      fallbackImage:'https://static.tildacdn.one/tild6533-6439-4463-b665-373033396364/_-4.jpg',
      gallery:[
        'https://thb.tildacdn.one/tild3434-6534-4637-a137-383063623031/-/empty/ostrov-orhidey-i-obe.png',
        'https://static.tildacdn.one/tild6533-6439-4463-b665-373033396364/_-4.jpg',
      ],
      tags:['море','острова','лодка','животные','семья'],
      category:'Морские',
      childrenOk:true,
      group:{
        from:'$36', adult:'$36', child:'$28', infant:'до 2 лет бесплатно', deposit:'30% или 100%',
        notes:['Русскоязычный гид','Микроавтобус и лодка','Обед, входные билеты и вода включены'],
        departures:[],
      },
      individual:{
        from:'$350',
        tiers:['1–2 человека — $350','3 человека — $390','4 человека — $430','5 человек — $450','6 человек — $480'],
        deposit:'30% или 100%',
      },
      included:['Бутылка воды','Русскоязычный гид','Трансфер — микроавтобус и лодка','Обед','Все входные билеты'],
      searchText:'остров орхидей остров обезьян нячанг море острова лодка животные семья морская экскурсия',
      formatsLabel:'индивидуальный / групповой',
      priceFromUsd:36,
    },
    {
      id:'hon-tam-island',
      popular:true,
      title:'Остров Хон Там',
      city:'Нячанг',
      region:'Остров Хон Там',
      duration:'1 день',
      time:'07:00 → около 16:00',
      image:'https://thb.tildacdn.one/tild3830-6434-4064-b661-623730373237/-/empty/ostrov-hon-tam-1.png',
      fallbackImage:'https://static.tildacdn.one/tild3330-3430-4530-b438-353765663862/_-4.jpg',
      gallery:[
        'https://thb.tildacdn.one/tild3830-6434-4064-b661-623730373237/-/empty/ostrov-hon-tam-1.png',
        'https://static.tildacdn.one/tild3330-3430-4530-b438-353765663862/_-4.jpg',
      ],
      tags:['море','острова','снорклинг','пляж','лодка','семья'],
      category:'Морские',
      childrenOk:true,
      group:{
        from:'$45', adult:'$45', child:'$35', infant:'до 2 лет бесплатно', deposit:'30% или 100%',
        notes:['Вариант с буфетом — $55','Буфет + грязевые ванны — $60','Русскоязычный гид','Микроавтобус и лодка','Обед, лежаки, маски и трубки включены'],
        departures:[],
      },
      included:['Бутылка воды','Русскоязычный гид','Трансфер — микроавтобус и лодка','Обед','Лежаки','Маски и трубки для снорклинга'],
      searchText:'остров хон там нячанг море острова пляж снорклинг лодка семья морская экскурсия',
      formatsLabel:'групповой',
      priceFromUsd:45,
    },
  ];

  function injectVerifiedIslandTours() {
    try {
      if (!Array.isArray(TOURS)) return 0;
      const existing = new Set(TOURS.map(tour => String(tour?.id || '')));
      let added = 0;
      [...VERIFIED_NHATRANG_ISLAND_TOURS].reverse().forEach(tour => {
        if (existing.has(tour.id)) return;
        TOURS.unshift(tour);
        existing.add(tour.id);
        added += 1;
      });
      return added;
    } catch (_) {
      return 0;
    }
  }

  function verifiedIslandToursReady() {
    try {
      if (!Array.isArray(TOURS)) return false;
      const ids = new Set(TOURS.map(tour => String(tour?.id || '')));
      return VERIFIED_NHATRANG_ISLAND_TOURS.every(tour => ids.has(tour.id));
    } catch (_) {
      return false;
    }
  }

  function ensureVerifiedIslandTours(attempt = 0) {
    injectVerifiedIslandTours();
    if (verifiedIslandToursReady()) return true;
    if (attempt < 120) window.setTimeout(() => ensureVerifiedIslandTours(attempt + 1), 50);
    return false;
  }

  ensureVerifiedIslandTours();

  const TARGETS = new Set(['Показать', 'Сбросить']);
  const MARK = 'catalog-show-press';
  const PRESSED = 'catalog-show-pressed';
  const INDIVIDUAL_WITH_FROM = /^индивидуальный\s+от$/i;
  const PRICE_BOX_SELECTOR = '.tour-card .price-row > div, .wide-card .price-row > div';
  const pressedAt = new WeakMap();

  const normalize = value => String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[→›»]+\s*$/g, '')
    .trim();

  function isTarget(button) {
    return button instanceof HTMLButtonElement && TARGETS.has(normalize(button.textContent));
  }

  function mark(root = document) {
    root.querySelectorAll?.('button').forEach(button => {
      if (isTarget(button)) button.classList.add(MARK);
    });
  }

  function patchIndividualPrices(root = document) {
    const boxes = [];
    if (root instanceof Element && root.matches?.(PRICE_BOX_SELECTOR)) boxes.push(root);
    root.querySelectorAll?.(PRICE_BOX_SELECTOR).forEach(box => boxes.push(box));

    let changed = 0;
    boxes.forEach(box => {
      const label = box.querySelector('.mini, .price-label');
      const value = box.querySelector('.price, .price-value');
      if (!label || !value || !INDIVIDUAL_WITH_FROM.test(normalize(label.textContent))) return;

      const price = normalize(value.textContent).replace(/^от\s+/i, '');
      if (!price) return;

      const row = document.createElement('span');
      row.className = 'catalog-price-row';
      row.style.setProperty('display', 'inline-flex', 'important');
      row.style.setProperty('flex-direction', 'row', 'important');
      row.style.setProperty('flex-wrap', 'nowrap', 'important');
      row.style.setProperty('align-items', 'baseline', 'important');
      row.style.setProperty('white-space', 'nowrap', 'important');
      row.style.setProperty('width', 'max-content', 'important');
      row.style.setProperty('max-width', 'none', 'important');
      row.style.setProperty('gap', '4px', 'important');

      const from = document.createElement('span');
      from.className = 'catalog-price-from';
      from.textContent = 'от';
      from.style.setProperty('display', 'inline-block', 'important');
      from.style.setProperty('white-space', 'nowrap', 'important');
      from.style.setProperty('flex', '0 0 auto', 'important');

      const amount = document.createElement('span');
      amount.className = 'catalog-price-amount';
      amount.textContent = price;
      amount.style.setProperty('display', 'inline-block', 'important');
      amount.style.setProperty('white-space', 'nowrap', 'important');
      amount.style.setProperty('flex', '0 0 auto', 'important');

      row.append(from, amount);
      label.textContent = 'индивидуальный';
      value.replaceChildren(row);
      value.classList.add('catalog-individual-price-inline');
      value.dataset.individualFromInline = 'true';
      value.style.setProperty('white-space', 'nowrap', 'important');
      value.style.setProperty('overflow', 'visible', 'important');
      changed += 1;
    });

    return changed;
  }

  function targetFromEvent(event) {
    const button = event.target?.closest?.(`button.${MARK}`);
    return button && isTarget(button) ? button : null;
  }

  function press(button) {
    if (!button || button.disabled) return;
    pressedAt.set(button, performance.now());
    button.classList.add(PRESSED);
  }

  function release(button) {
    if (!button) return;
    const started = pressedAt.get(button) || performance.now();
    const elapsed = performance.now() - started;
    const delay = Math.max(0, 110 - elapsed);
    window.setTimeout(() => button.classList.remove(PRESSED), delay);
  }

  document.addEventListener('pointerdown', event => {
    ensureVerifiedIslandTours();
    const button = targetFromEvent(event);
    if (button) press(button);
  }, true);

  document.addEventListener('pointerup', event => release(targetFromEvent(event)), true);
  document.addEventListener('pointercancel', event => release(targetFromEvent(event)), true);

  document.addEventListener('keydown', event => {
    ensureVerifiedIslandTours();
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const button = event.target?.closest?.(`button.${MARK}`);
    if (button && isTarget(button)) press(button);
  }, true);

  document.addEventListener('keyup', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const button = event.target?.closest?.(`button.${MARK}`);
    if (button) release(button);
  }, true);

  const observer = new MutationObserver(records => {
    ensureVerifiedIslandTours();
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (node.matches?.('button') && isTarget(node)) node.classList.add(MARK);
        mark(node);
      });
    }
    if (records.some(record => record.type === 'childList')) patchIndividualPrices(document);
  });

  const initialize = () => {
    ensureVerifiedIslandTours();
    mark();
    patchIndividualPrices(document);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
  observer.observe(document.documentElement, { childList: true, subtree: true });

  globalThis.MaxTourCatalogUi = {
    patchIndividualPrices,
    injectVerifiedIslandTours,
    ensureVerifiedIslandTours,
    verifiedIslandToursReady,
  };
})();

(() => {
  'use strict';

  // Quick replies must not depend on #aiScreen.onclick: other AI layers can
  // remount the screen and replace property handlers. Delegate at document
  // level and submit through the canonical chat form instead.
  const BUTTON_SELECTOR = '#aiScreen .ai-quick-replies [data-ai-action="quick"]';
  const pointerStarts = new Map();
  let lastSubmit = { value:'', at:0 };

  function buttonFrom(target) {
    return target instanceof Element ? target.closest(BUTTON_SELECTOR) : null;
  }

  function submitQuick(button, event) {
    if (!button || button.disabled) return false;
    const value = String(button.dataset.value || button.textContent || '').trim();
    if (!value) return false;

    const screen = button.closest('#aiScreen');
    const form = screen?.querySelector('[data-ai-form="chat"]');
    const textarea = form?.querySelector('textarea[name="message"]');
    if (!form || !textarea || textarea.disabled) return false;

    const now = Date.now();
    if (lastSubmit.value === value && now - lastSubmit.at < 650) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      event?.stopImmediatePropagation?.();
      return true;
    }

    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    lastSubmit = { value, at:now };

    textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles:true }));
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true }));
    return true;
  }

  document.addEventListener('pointerdown', event => {
    const button = buttonFrom(event.target);
    if (!button) return;
    pointerStarts.set(event.pointerId, {
      button,
      x:Number(event.clientX) || 0,
      y:Number(event.clientY) || 0,
    });
  }, true);

  document.addEventListener('pointerup', event => {
    const start = pointerStarts.get(event.pointerId);
    pointerStarts.delete(event.pointerId);
    if (!start) return;
    const button = buttonFrom(event.target);
    if (!button || button !== start.button) return;
    const dx = (Number(event.clientX) || 0) - start.x;
    const dy = (Number(event.clientY) || 0) - start.y;
    if (Math.hypot(dx, dy) > 14) return;
    submitQuick(button, event);
  }, true);

  document.addEventListener('pointercancel', event => {
    pointerStarts.delete(event.pointerId);
  }, true);

  document.addEventListener('click', event => {
    const button = buttonFrom(event.target);
    if (button) submitQuick(button, event);
  }, true);

  globalThis.MaxTourAiQuickRepliesV24 = { submitQuick };
})();
