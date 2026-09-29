(() => {
  'use strict';

  const PRODUCT_IDS = ['1287578','1287580'];
  const PRODUCT_SET = new Set(PRODUCT_IDS);
  let catalogPromise = null;

  function catalogArray() {
    try { return Array.isArray(TOURS) ? TOURS : null; } catch (_) { return null; }
  }

  function clearLegacyState() {
    const tours = catalogArray();
    if (tours) tours.splice(0, tours.length);
    try { if (Array.isArray(demoTrips)) demoTrips.splice(0, demoTrips.length); } catch (_) {}
    globalThis.LOVE_TRAVEL_BOKUN_ACTIVE = false;
    globalThis.LOVE_TRAVEL_CATALOG_SOURCE = 'loading';
    document.documentElement.classList.remove('lt-bokun-ready','lt-bokun-error');
    document.documentElement.classList.add('lt-bokun-loading');
  }

  function exactCatalog(data) {
    if (data?.ok !== true || data?.source !== 'bokun' || String(data?.vendorId || '') !== '137689') return null;
    if (!Array.isArray(data?.tours) || data.tours.length !== 2) return null;
    const ids = data.tours.map(tour => String(tour?.id || '')).sort();
    if (ids.join(',') !== PRODUCT_IDS.slice().sort().join(',')) return null;
    return data.tours;
  }

  function rerender() {
    try {
      const active = document.querySelector('.screen.active')?.id || '';
      if (active === 'catalogScreen' && typeof renderCatalog === 'function') renderCatalog();
      if (active === 'homeScreen' && typeof renderHome === 'function') renderHome();
    } catch (_) {}
    globalThis.LoveTravelBrand?.schedule?.();
  }

  function renderUnavailable() {
    const catalog = document.getElementById('catalogScreen');
    if (catalog) {
      catalog.innerHTML = '<section class="lt-catalog-unavailable" role="status"><b>Не удалось загрузить актуальные экскурсии</b><span>Проверьте подключение и попробуйте обновить данные.</span><button type="button" data-lt-retry-catalog>Повторить</button></section>';
      catalog.querySelector('[data-lt-retry-catalog]')?.addEventListener('click', () => loadCatalog(true));
    }
  }

  async function loadCatalog(force = false) {
    if (catalogPromise && !force) return catalogPromise;
    catalogPromise = (async () => {
      try {
        const response = await fetch('/api/bokun/tours', { cache:'no-store', credentials:'same-origin' });
        if (!response.ok) throw new Error('catalog HTTP '+response.status);
        const data = await response.json();
        const live = exactCatalog(data);
        if (!live) throw new Error('invalid LoveTravel catalog');
        const tours = catalogArray();
        if (tours) tours.splice(0, tours.length, ...live);
        globalThis.LOVE_TRAVEL_BOKUN_ACTIVE = true;
        globalThis.LOVE_TRAVEL_CATALOG_SOURCE = 'bokun';
        document.documentElement.classList.remove('lt-bokun-loading','lt-bokun-error');
        document.documentElement.classList.add('lt-bokun-ready');
        rerender();
        return live;
      } catch (error) {
        console.error('[LoveTravel] canonical Bókun catalog unavailable', error);
        const tours = catalogArray();
        if (tours) tours.splice(0, tours.length);
        globalThis.LOVE_TRAVEL_BOKUN_ACTIVE = false;
        globalThis.LOVE_TRAVEL_CATALOG_SOURCE = 'unavailable';
        document.documentElement.classList.remove('lt-bokun-loading','lt-bokun-ready');
        document.documentElement.classList.add('lt-bokun-error');
        renderUnavailable();
        globalThis.LoveTravelBrand?.schedule?.();
        throw error;
      } finally {
        if (force) catalogPromise = null;
      }
    })();
    return catalogPromise;
  }

  function removeLegacyNavigation() {
    document.querySelector('.admin-top')?.remove();
    document.querySelectorAll('.bottom-nav .nav-btn').forEach(button => {
      const action = String(button.getAttribute('onclick') || button.dataset?.screen || '').toLowerCase();
      const text = String(button.textContent || '').toLowerCase();
      if (/trips|ai|admin|director/.test(action) || /мои поездки|ии-помощник|ai assistant|chuyến đi|trợ lý ai|내 여행|ai 도우미/.test(text)) button.remove();
    });
    document.querySelectorAll('.mt-language-switcher button').forEach(button => {
      if (String(button.textContent || '').trim().toUpperCase() === 'KO') button.remove();
    });
  }

  function guardLegacyScreens() {
    if (typeof globalThis.showScreen !== 'function' || globalThis.showScreen.__loveTravelGuard) return;
    const previous = globalThis.showScreen;
    const wrapped = function(name, ...args) {
      const target = String(name || '').toLowerCase();
      if (['trips','ai','admin','director','booking'].includes(target)) {
        return previous.call(this, target === 'booking' ? 'catalog' : 'catalog', ...args);
      }
      return previous.call(this, name, ...args);
    };
    wrapped.__loveTravelGuard = true;
    wrapped.__previous = previous;
    globalThis.showScreen = wrapped;
  }

  function enforceShell() {
    removeLegacyNavigation();
    guardLegacyScreens();
  }

  clearLegacyState();
  enforceShell();
  new MutationObserver(enforceShell).observe(document.documentElement,{childList:true,subtree:true});
  loadCatalog().catch(()=>{});

  globalThis.LoveTravelRuntime = {
    loadCatalog,
    productIds: PRODUCT_IDS.slice(),
    isProduct: id => PRODUCT_SET.has(String(id || '')),
  };
})();
