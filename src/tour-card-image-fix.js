(() => {
  'use strict';

  const IMAGES = {
    muine: '/tour-card-media/muine.jpg',
    orchidMonkey: '/tour-card-media/orchid-monkey.jpg',
    honTam: '/tour-card-media/hon-tam.jpg',
  };

  const isMuiNe = value => /муйне|mui\s*ne/i.test(String(value || ''));

  function patchTours() {
    try {
      if (typeof TOURS === 'undefined' || !Array.isArray(TOURS)) return;
      TOURS.forEach(tour => {
        const id = String(tour?.id || '');
        let image = '';
        if (id === 'orchid-monkey-islands') image = IMAGES.orchidMonkey;
        else if (id === 'hon-tam-island') image = IMAGES.honTam;
        else if (id === 'muine-dunes-jeep' || isMuiNe(tour?.title)) image = IMAGES.muine;
        if (!image) return;
        tour.image = image;
        tour.fallbackImage = image;
        tour.gallery = [image];
      });
    } catch (_) {}
  }

  function patchTrips() {
    try {
      if (typeof demoTrips === 'undefined' || !Array.isArray(demoTrips)) return;
      demoTrips.forEach(trip => {
        if (String(trip?.tourId || '') !== 'muine-dunes-jeep' && !isMuiNe(trip?.title)) return;
        trip.image = IMAGES.muine;
        trip.fallbackImage = IMAGES.muine;
        if ('gallery' in trip) trip.gallery = [IMAGES.muine];
      });
    } catch (_) {}
  }

  function patchCard(card, image) {
    if (!(card instanceof Element)) return;
    card.querySelectorAll('img').forEach(img => {
      if (img.getAttribute('src') !== image) img.setAttribute('src', image);
      img.removeAttribute('srcset');
      img.style.removeProperty('display');
      img.style.removeProperty('visibility');
      img.style.removeProperty('opacity');
    });
    card.querySelectorAll('[style*="background-image"]').forEach(node => {
      node.style.backgroundImage = `url("${image}")`;
    });
  }

  function patchDom(root = document) {
    const selectors = '.tour-card,.wide-card,.trip-card,.booking-card,[class*="tour-card"],[class*="trip-card"],[class*="booking-card"],article';
    const cards = [];
    if (root instanceof Element && root.matches?.(selectors)) cards.push(root);
    root.querySelectorAll?.(selectors).forEach(card => cards.push(card));
    cards.forEach(card => {
      const text = String(card.textContent || '');
      if (/Остров Орхидей|Остров Обезьян/i.test(text)) patchCard(card, IMAGES.orchidMonkey);
      else if (/Остров Хон Там/i.test(text)) patchCard(card, IMAGES.honTam);
      else if (isMuiNe(text)) patchCard(card, IMAGES.muine);
    });
  }

  function patchAll() {
    patchTours();
    patchTrips();
    patchDom();
  }

  function wrapRenderTrips() {
    try {
      if (typeof renderTrips !== 'function' || renderTrips.__maxTourImageFix) return;
      const previous = renderTrips;
      const wrapped = function(...args) {
        patchTours();
        patchTrips();
        const result = previous.apply(this, args);
        queueMicrotask(() => patchDom());
        return result;
      };
      wrapped.__maxTourImageFix = true;
      renderTrips = wrapped;
    } catch (_) {}
  }

  function initialize() {
    patchAll();
    wrapRenderTrips();
    window.setTimeout(patchAll, 100);
    window.setTimeout(patchAll, 500);
    window.setTimeout(patchAll, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once:true });
  else initialize();

  const observer = new MutationObserver(records => {
    patchTours();
    patchTrips();
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (node instanceof Element) patchDom(node);
      });
    }
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });

  globalThis.MaxTourCardImageFix = { patchAll, images: IMAGES };
})();
