(() => {
  'use strict';

  function toCount(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  }

  function countPeople(booking = {}) {
    return toCount(booking.adults) + toCount(booking.children) + toCount(booking.infants);
  }

  function firstMoney(value) {
    const match = String(value || '').match(/\$\s*([\d,.]+)/);
    if (!match) return 0;
    return Number(match[1].replace(/,/g, '')) || 0;
  }

  function parseTier(text) {
    const source = String(text || '').trim();
    const price = firstMoney(source);
    if (!price) return null;

    let min = null;
    let max = null;
    const range = source.match(/(\d+)\s*[–-]\s*(\d+)\s*(?:человек|человека|чел\.?)/i);
    if (range) {
      min = Number(range[1]);
      max = Number(range[2]);
    } else {
      const single = source.match(/(\d+)\s*(?:человек|человека|чел\.?)/i);
      if (single) min = max = Number(single[1]);
    }

    if (!min || !max) return null;
    return {
      min,
      max,
      price,
      perPerson: /с\s+человека/i.test(source),
      source,
    };
  }

  function individualTotal(tour, booking) {
    const people = Math.max(1, countPeople(booking));
    const tiers = (tour?.individual?.tiers || []).map(parseTier).filter(Boolean);

    if (!tiers.length) return firstMoney(tour?.individual?.from);

    let tier = tiers.find(item => people >= item.min && people <= item.max);

    // Для пакетов вроде «2 человека» / «4 человека» выбираем ближайшую
    // вместимость, которая покрывает фактическое число участников.
    if (!tier) {
      tier = tiers
        .filter(item => people <= item.max)
        .sort((a, b) => a.max - b.max || a.min - b.min)[0];
    }

    // Если каталог не содержит следующей ступени, используем последнюю
    // опубликованную цену как минимально известную для этого состава.
    if (!tier) tier = tiers[tiers.length - 1];

    return tier.perPerson ? tier.price * people : tier.price;
  }

  function groupTotal(tour, booking) {
    const adults = toCount(booking?.adults);
    const children = toCount(booking?.children);
    const infants = toCount(booking?.infants);

    const adultPrice = firstMoney(tour?.group?.adult || tour?.group?.from);
    const childPrice = firstMoney(tour?.group?.child);
    const infantPrice = /бесплат/i.test(String(tour?.group?.infant || ''))
      ? 0
      : firstMoney(tour?.group?.infant);

    return adults * adultPrice + children * childPrice + infants * infantPrice;
  }

  function calculateTotal(tour, booking, format) {
    return format === 'group'
      ? groupTotal(tour, booking)
      : individualTotal(tour, booking);
  }

  function plural(value, one, few, many) {
    const n = Math.abs(Number(value) || 0) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  function formatPeopleSummary(booking = {}) {
    const adults = toCount(booking.adults);
    const children = toCount(booking.children);
    const infants = toCount(booking.infants);
    const total = adults + children + infants;
    const parts = [];

    if (adults) parts.push(`${adults} ${plural(adults, 'взрослый', 'взрослых', 'взрослых')}`);
    if (children) parts.push(`${children} ${plural(children, 'ребёнок', 'ребёнка', 'детей')}`);
    if (infants) parts.push(`${infants} ${plural(infants, 'малыш', 'малыша', 'малышей')}`);

    return `${total} ${plural(total, 'человек', 'человека', 'человек')}${parts.length ? ` · ${parts.join(' + ')}` : ''}`;
  }

  globalThis.MaxTourBookingPricing = {
    countPeople,
    calculateTotal,
    groupTotal,
    individualTotal,
    formatPeopleSummary,
    parseTier,
  };

  // v28 остаётся визуально неизменным. Подменяем только расчёт стоимости
  // и итоговую строку состава заявки до того, как runtime-api поставит
  // persistence-wrapper вокруг completePayment.
  if (typeof calcTotal === 'function' && typeof state === 'object') {
    calcTotal = function(tour) {
      return calculateTotal(tour, state.booking, state.format);
    };
  }

  if (typeof completePayment === 'function') {
    const originalCompletePayment = completePayment;
    completePayment = function(...args) {
      const previousId = Array.isArray(demoTrips) ? demoTrips[0]?.id : undefined;
      const result = originalCompletePayment.apply(this, args);
      const created = Array.isArray(demoTrips) ? demoTrips[0] : null;
      if (created?.id && created.id !== previousId && typeof state === 'object') {
        created.people = formatPeopleSummary(state.booking);
      }
      return result;
    };
  }
})();
