(() => {
  'use strict';

  if (typeof document === 'undefined') return;

  const AI_STATE_KEY = 'max-tour-ai-consultant-v5';
  const BOOKING_INTENT_KEY = 'max-tour-ai-booking-intent-v1';
  let transitionInFlight = false;

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const lower = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const isIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

  function readAiState() {
    try { return JSON.parse(sessionStorage.getItem(AI_STATE_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function tourById(id) {
    try { return Array.isArray(TOURS) ? TOURS.find(tour => String(tour?.id) === String(id)) || null : null; }
    catch (_) { return null; }
  }

  function bookingIntent(tourId) {
    const state = readAiState();
    const slots = state?.slots || {};
    const tour = tourById(tourId);
    const tripType = String(slots.tripType || '');
    const format = tripType === 'group' || tripType === 'individual' ? tripType : 'compare';
    const date = isIsoDate(slots.date) ? String(slots.date) : '';
    return {
      tourId:String(tourId || ''),
      title:clean(tour?.title || ''),
      format,
      date,
      adults:Math.max(1, Number(slots.adults || 0)),
      children:Array.isArray(slots.children) ? slots.children.slice(0, 12) : [],
      infants:Math.max(0, Number(slots.infants || 0)),
      createdAt:new Date().toISOString(),
      source:'AI-консультант',
    };
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && !element.hidden && rect.width > 0 && rect.height > 0;
  }

  function activeTourScreen() {
    const candidates = [
      document.getElementById('tourScreen'),
      ...document.querySelectorAll('[id*="tour" i][class*="screen" i], [data-screen="tour"]'),
    ].filter(Boolean);
    return candidates.find(isVisible) || null;
  }

  function isBookingButton(button) {
    if (!isVisible(button) || button.disabled) return false;
    if (button.closest('#aiScreen') || button.matches('[data-ai-action]')) return false;
    const text = lower(button.textContent || button.getAttribute('aria-label') || '');
    return /^(?:присоединиться|продолжить бронирование|забронировать|оформить|выбрать дату|к бронированию)$/.test(text)
      || /присоединиться|продолжить бронирование|забронировать|оформить бронирование|перейти к бронированию/.test(text);
  }

  function bookingButtonInTour(screen, intent = null) {
    if (!screen) return null;

    // Refresh departure metadata synchronously before choosing a button. The
    // live-departure layer marks the exact date selected in the AI dialog.
    try { globalThis.MaxTourDepartureLiveV3?.process?.(screen); } catch (_) {}

    const buttons = [...screen.querySelectorAll('button,[role="button"]')].filter(isBookingButton);
    const targetDate = isIsoDate(intent?.date) ? String(intent.date) : '';
    const departureCards = [...screen.querySelectorAll('.depart-card')].filter(isVisible);

    if (targetDate && departureCards.length) {
      // A concrete date from the AI quick reply is authoritative. Never fall
      // through to the first departure card with another date.
      const targetCard = departureCards.find(card => {
        if (String(card?.dataset?.departureIso || '') !== targetDate) return false;
        if (card?.dataset?.liveDepartureState === 'past' || card?.dataset?.liveDepartureState === 'full') return false;
        return true;
      });
      if (!targetCard) return null;
      return buttons.find(button => button.closest('.depart-card') === targetCard) || null;
    }

    return buttons[0] || null;
  }

  function bookingScreenVisible() {
    const direct = document.getElementById('bookingScreen');
    if (direct && isVisible(direct)) return true;
    return [...document.querySelectorAll('[id*="booking" i][class*="screen" i], [data-screen="booking"]')].some(isVisible);
  }

  function applyIntentToBooking(intent) {
    if (!intent) return false;
    let applied = false;

    // Preferred path: the departure layer knows the prototype booking shape
    // and updates date + party atomically without losing the chosen departure.
    try {
      if (typeof globalThis.MaxTourDepartureLiveV3?.applyIntentToBooking === 'function') {
        applied = Boolean(globalThis.MaxTourDepartureLiveV3.applyIntentToBooking(intent, intent.date)) || applied;
      }
    } catch (_) {}

    // Defensive fallback for tours without fixed departure cards (for example,
    // individual tours). This also protects against a stale prototype date.
    try {
      if (typeof state === 'object' && state) {
        if (intent.format === 'group' || intent.format === 'individual') state.format = intent.format;
        if (!state.booking || typeof state.booking !== 'object') state.booking = {};
        if (isIsoDate(intent.date) && state.booking.date !== intent.date) {
          state.booking.date = intent.date;
          applied = true;
        }
      }
    } catch (_) {}

    try {
      const input = document.querySelector('#bookingScreen input[type="date"]');
      if (input && isIsoDate(intent.date) && input.value !== intent.date) {
        input.value = intent.date;
        input.dispatchEvent?.(new Event('input', { bubbles:true }));
        input.dispatchEvent?.(new Event('change', { bubbles:true }));
        applied = true;
      }
    } catch (_) {}

    return applied;
  }

  function openTourSafely(tourId) {
    if (typeof globalThis.openTour !== 'function') return false;
    globalThis.openTour(tourId);
    return true;
  }

  function continueOnceToBooking(intent, attempt = 0) {
    if (bookingScreenVisible()) {
      // Re-apply after the legacy booking renderer finishes. This is critical
      // for quick replies such as “завтра”: the booking screen must show the
      // exact date selected in the AI dialog, not a stale/default date.
      applyIntentToBooking(intent);
      transitionInFlight = false;
      return;
    }

    const screen = activeTourScreen();
    if (screen) {
      const button = bookingButtonInTour(screen, intent);
      if (button && !button.dataset.aiBridgeClicked) {
        button.dataset.aiBridgeClicked = '1';
        button.click();
        window.setTimeout(() => continueOnceToBooking(intent, attempt + 1), 90);
        return;
      }
    }

    if (attempt < 25) {
      window.setTimeout(() => continueOnceToBooking(intent, attempt + 1), 100);
      return;
    }

    // If a concrete AI date has no matching group departure, keep the tour
    // card open instead of silently booking another day. For tours without
    // fixed departure cards the normal booking button is still used above.
    transitionInFlight = false;
  }

  function handleAiBookingClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest?.('#aiScreen [data-ai-action="book-tour"]');
    if (!button) return;

    // The manager-approval guard is registered earlier in capture phase. If it
    // blocks this click with stopImmediatePropagation, this handler is never
    // reached, which preserves the approval-before-payment rule.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (transitionInFlight) return;
    const tourId = clean(button.dataset.id || button.closest('[data-tour-id]')?.dataset.tourId || '');
    if (!tourId) return;

    const intent = bookingIntent(tourId);
    transitionInFlight = true;
    try { sessionStorage.setItem(BOOKING_INTENT_KEY, JSON.stringify(intent)); } catch (_) {}

    try {
      if (!openTourSafely(tourId)) {
        transitionInFlight = false;
        return;
      }
      window.setTimeout(() => continueOnceToBooking(intent, 0), 80);
    } catch (error) {
      console.warn('[MAX TOUR AI] safe booking bridge failed:', error);
      transitionInFlight = false;
    }
  }

  document.addEventListener('click', handleAiBookingClick, true);

  globalThis.MaxTourAiBookingBridgeV25 = {
    bookingIntent,
    activeTourScreen,
    bookingButtonInTour,
    bookingScreenVisible,
    applyIntentToBooking,
    _test:{ isVisible, isBookingButton, isIsoDate },
  };
})();