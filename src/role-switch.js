(() => {
  'use strict';

  const adminButton = document.querySelector('.admin-top');
  if (adminButton) {
    // The public Mini App must not expose internal role navigation.
    // Admin and director cabinets live on the dedicated admin host.
    adminButton.remove();
  }

  // Default location photos are mirrored into the demo's private R2 bucket.
  // An admin-uploaded R2 cover always wins over these defaults.
  const IMAGES = {
    muine: '/tour-media/muine-dunes-jeep/card-cover.jpg',
    orchidMonkey: '/tour-media/orchid-monkey-islands/card-cover.jpg',
    honTam: '/tour-media/hon-tam-island/card-cover.jpg',
  };

  const isMuiNe = value => /муйне|mui\s*ne/i.test(String(value || ''));
  const isAdminCover = value => /\/tour-media\/[^/]+\/admin-cover-/i.test(String(value || ''));

  function defaultImageFor(id, title = '') {
    if (id === 'orchid-monkey-islands') return IMAGES.orchidMonkey;
    if (id === 'hon-tam-island') return IMAGES.honTam;
    if (id === 'muine-dunes-jeep' || isMuiNe(title)) return IMAGES.muine;
    return '';
  }

  function configuredImageFor(id, title = '') {
    try {
      if (typeof TOURS !== 'undefined' && Array.isArray(TOURS)) {
        const tour = TOURS.find(item => String(item?.id || '') === String(id))
          || TOURS.find(item => title && String(item?.title || '') === String(title));
        if (tour && isAdminCover(tour.image)) return tour.image;
      }
    } catch (_) {}
    return defaultImageFor(id, title);
  }

  function patchTourData() {
    try {
      if (typeof TOURS === 'undefined' || !Array.isArray(TOURS)) return;
      TOURS.forEach(tour => {
        const id = String(tour?.id || '');
        const fallback = defaultImageFor(id, tour?.title);
        if (!fallback || isAdminCover(tour.image)) return;
        tour.image = fallback;
        tour.fallbackImage = fallback;
        tour.gallery = [fallback];
      });
    } catch (_) {}
  }

  function patchTripData() {
    try {
      if (typeof demoTrips === 'undefined' || !Array.isArray(demoTrips)) return;
      demoTrips.forEach(trip => {
        const id = String(trip?.tourId || '');
        if (id !== 'muine-dunes-jeep' && !isMuiNe(trip?.title)) return;
        const image = configuredImageFor('muine-dunes-jeep', trip?.title) || IMAGES.muine;
        trip.image = image;
        trip.fallbackImage = image;
        if ('gallery' in trip) trip.gallery = [image];
      });
    } catch (_) {}
  }

  function applyImage(card, image) {
    if (!(card instanceof Element) || !image) return;

    card.querySelectorAll('img').forEach(img => {
      img.src = image;
      img.removeAttribute('srcset');
      img.style.removeProperty('display');
      img.style.removeProperty('visibility');
      img.style.removeProperty('opacity');
    });

    const media = card.querySelector('.tour-image,.trip-image,.trip-photo,.card-image,.booking-image,.tour-photo,.wide-card-image,[class*="tour-image"],[class*="trip-image"],[class*="trip-photo"],[class*="card-image"],[class*="booking-image"],.photo,.thumb');
    if (media) {
      media.style.backgroundImage = `url("${image}")`;
      media.style.backgroundSize = 'cover';
      media.style.backgroundPosition = 'center';
      media.style.backgroundRepeat = 'no-repeat';
    }
  }

  function patchRenderedCards(root = document) {
    const selector = '.tour-card,.wide-card,.trip-card,.booking-card,.booked-card,.trip-item,[class*="tour-card"],[class*="trip-card"],[class*="booking-card"],article,.card';
    const cards = [];
    if (root instanceof Element && root.matches?.(selector)) cards.push(root);
    root.querySelectorAll?.(selector).forEach(card => cards.push(card));

    cards.forEach(card => {
      const text = String(card.textContent || '');
      if (/Остров Орхидей|Остров Обезьян/i.test(text)) applyImage(card, configuredImageFor('orchid-monkey-islands', 'Остров Орхидей и Остров Обезьян'));
      else if (/Остров Хон Там/i.test(text)) applyImage(card, configuredImageFor('hon-tam-island', 'Остров Хон Там'));
      else if (isMuiNe(text)) applyImage(card, configuredImageFor('muine-dunes-jeep', text));
    });
  }

  function patchAll(root = document) {
    patchTourData();
    patchTripData();
    patchRenderedCards(root);
  }

  const schedulePatch = root => requestAnimationFrame(() => patchAll(root || document));
  schedulePatch(document);
  window.setTimeout(() => patchAll(document), 100);
  window.setTimeout(() => patchAll(document), 500);
  window.setTimeout(() => patchAll(document), 1500);

  // Island tours can be injected after this file runs, and trip cards are
  // rebuilt on navigation/actions. Re-apply after mounts while respecting
  // any cover uploaded by an administrator.
  new MutationObserver(records => {
    patchTourData();
    patchTripData();
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof Element) schedulePatch(node);
    }));
  }).observe(document.body, { childList:true, subtree:true });

  globalThis.MaxTourCardImages = { patchAll, images: IMAGES };
})();
