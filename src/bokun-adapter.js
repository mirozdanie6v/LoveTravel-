const DEFAULT_INTEGRATION_BASE_URL = 'https://integration.viiversion.com';
export const LOVE_TRAVEL_BOKUN_VENDOR_ID = '137689';
export const LOVE_TRAVEL_BOKUN_PRODUCT_IDS = Object.freeze(['1287578', '1287580']);

const text = (value, max = 4000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const asArray = value => Array.isArray(value) ? value : [];
const money = value => {
  const amount = Number(value?.amount);
  const currency = text(value?.currency, 12) || 'USD';
  return Number.isFinite(amount) ? { amount, currency } : null;
};

function htmlToList(value) {
  const source = String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return [...new Set(source.split(/\n+/).map(item => text(item, 300)).filter(Boolean))];
}

function photoUrl(photo = {}) {
  const derived = asArray(photo.derived);
  return text(
    derived.find(item => item?.name === 'large')?.cleanUrl
      || derived.find(item => item?.name === 'large')?.url
      || derived.find(item => item?.name === 'preview')?.cleanUrl
      || derived.find(item => item?.name === 'preview')?.url
      || photo.originalUrl,
    2000,
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function priceMapForAvailability(entry = {}, preferredRateId = 0) {
  const byRate = asArray(entry.pricesByRate);
  const selected = byRate.find(item => Number(item?.activityRateId) === Number(preferredRateId))
    || byRate[0]
    || null;
  return new Map(asArray(selected?.pricePerCategoryUnit).map(item => [
    String(item?.id ?? ''),
    money(item?.amount),
  ]).filter(([, value]) => value));
}

function categoryByType(product = {}, type) {
  return asArray(product.pricingCategories).find(item => String(item?.ticketCategory || '').toUpperCase() === type) || null;
}

function moneyLabel(value) {
  if (!value) return '';
  const rounded = Number.isInteger(value.amount) ? String(value.amount) : String(Number(value.amount.toFixed(2)));
  return value.currency === 'USD' ? `$${rounded}` : `${rounded} ${value.currency}`;
}

function defaultRate(product = {}) {
  const rates = asArray(product.rates);
  return rates.find(rate => Number(rate?.id) === Number(product.defaultRateId)) || rates[0] || null;
}

function normalizeDeparture(entry = {}) {
  const capacity = Math.max(0, Number(entry.availabilityCount) || 0);
  const taken = Math.max(0, Number(entry.bookedParticipants) || 0);
  return {
    id: text(entry.id, 160),
    iso: text(entry.dateIso || entry.iso || '', 20),
    date: text(entry.localizedDate || entry.date || '', 80),
    time: text(entry.startTime, 30),
    taken,
    capacity: capacity + taken,
    available: capacity,
    status: entry.soldOut || entry.unavailable ? 'full' : 'available',
    soldOut: Boolean(entry.soldOut),
    unavailable: Boolean(entry.unavailable),
    startTimeId: Number(entry.startTimeId) || null,
    recurrenceId: Number(entry.recurrenceId) || null,
  };
}

function inferIsoDate(entry = {}) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(entry.dateIso || ''))) return String(entry.dateIso);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(entry.iso || ''))) return String(entry.iso);
  const idMatch = String(entry.id || '').match(/_(\d{4})(\d{2})(\d{2})$/);
  return idMatch ? `${idMatch[1]}-${idMatch[2]}-${idMatch[3]}` : '';
}

export function normalizeBokunAvailability(entries = []) {
  return asArray(entries).map(entry => normalizeDeparture({
    ...entry,
    dateIso: inferIsoDate(entry),
  }));
}

export function normalizeBokunProduct(product = {}, availability = []) {
  const productId = text(product.id, 40);
  if (!productId) throw new Error('Bókun product is missing id');

  const departures = normalizeBokunAvailability(availability);
  const firstAvailable = asArray(availability).find(item => !item?.soldOut && !item?.unavailable) || asArray(availability)[0] || {};
  const selectedRate = defaultRate(product);
  const prices = priceMapForAvailability(firstAvailable, selectedRate?.id);
  const adult = categoryByType(product, 'ADULT');
  const child = categoryByType(product, 'CHILD');
  const infant = categoryByType(product, 'INFANT');
  const adultPrice = prices.get(String(adult?.id ?? '')) || money(product.nextDefaultPriceMoney);
  const childPrice = prices.get(String(child?.id ?? ''));
  const infantPrice = prices.get(String(infant?.id ?? ''));

  const gallery = unique([
    photoUrl(product.keyPhoto),
    ...asArray(product.photos).map(photoUrl),
  ]);

  const route = asArray(product.agendaItems)
    .map((item, index) => [
      text(item?.title, 140) || `Stop ${index + 1}`,
      text(item?.body, 1200),
    ])
    .filter(item => item[1]);

  const languages = unique(asArray(product.guidanceTypes)
    .flatMap(item => asArray(item?.displayLanguages).map(value => text(value, 80))));

  const included = htmlToList(product.included);
  const excluded = htmlToList(product.excluded);
  const rateOptions = asArray(product.rates).map(rate => {
    const live = asArray(firstAvailable?.pricesByRate)
      .find(item => Number(item?.activityRateId) === Number(rate?.id));
    const livePrices = new Map(asArray(live?.pricePerCategoryUnit).map(item => [
      String(item?.id ?? ''),
      money(item?.amount),
    ]).filter(([, value]) => value));
    return {
      id: Number(rate?.id) || null,
      code: text(rate?.rateCode, 80),
      title: text(rate?.title, 180),
      description: text(rate?.description, 800),
      minPerBooking: Math.max(0, Number(rate?.minPerBooking) || 0),
      maxPerBooking: Math.max(0, Number(rate?.maxPerBooking) || 0),
      pricedPerPerson: Boolean(rate?.pricedPerPerson),
      prices: {
        adult: moneyLabel(livePrices.get(String(adult?.id ?? ''))),
        child: moneyLabel(livePrices.get(String(child?.id ?? ''))),
        infant: moneyLabel(livePrices.get(String(infant?.id ?? ''))),
      },
    };
  });

  const priceFromUsd = adultPrice?.currency === 'USD' ? adultPrice.amount : 0;
  const searchText = [
    product.title,
    product.description,
    product.locationCode?.name,
    product.startPoints?.[0]?.title,
    ...languages,
    ...included,
    ...route.flat(),
    ...rateOptions.map(rate => rate.title),
  ].map(value => text(value, 500)).filter(Boolean).join(' ').toLocaleLowerCase('en-US');

  return {
    id: productId,
    source: 'bokun',
    popular: true,
    bokunProductId: productId,
    externalId: text(product.externalId, 120),
    title: text(product.title, 240),
    description: text(product.description, 3000),
    city: text(product.locationCode?.name || product.googlePlace?.city || 'Nha Trang', 100),
    region: text(product.startPoints?.[0]?.address?.state || product.locationCode?.country || 'Khánh Hòa', 100),
    category: text(product.activityType || product.productCategory, 100),
    duration: text(product.durationText, 80),
    time: departures[0]?.time || '',
    activity: text(product.difficultyLevel, 80),
    tags: unique([
      ...asArray(product.keywords).map(value => text(value, 60)),
      ...asArray(product.activityCategories).map(value => text(value, 60)),
      ...asArray(product.activityAttributes).map(value => text(value, 60)),
    ]),
    audience: [],
    childrenOk: Boolean(child || infant),
    image: gallery[0] || '',
    fallbackImage: gallery[0] || '',
    gallery,
    included,
    excluded,
    take: [],
    route,
    languages,
    meetingPoint: {
      title: text(product.startPoints?.[0]?.title, 180),
      address: text(product.startPoints?.[0]?.address?.addressLine1, 180),
      city: text(product.startPoints?.[0]?.address?.city, 100),
      latitude: Number(product.startPoints?.[0]?.address?.geoPoint?.latitude) || null,
      longitude: Number(product.startPoints?.[0]?.address?.geoPoint?.longitude) || null,
    },
    searchText,
    formatsLabel: 'групповой',
    priceFromUsd,
    liked: false,
    group: {
      from: moneyLabel(adultPrice),
      adult: moneyLabel(adultPrice),
      child: moneyLabel(childPrice),
      infant: moneyLabel(infantPrice),
      deposit: '',
      notes: [],
      departures,
    },
    individual: null,
    bokun: {
      vendorId: LOVE_TRAVEL_BOKUN_VENDOR_ID,
      productId,
      defaultRateId: Number(selectedRate?.id) || null,
      pricingCategories: asArray(product.pricingCategories).map(item => ({
        id: Number(item?.id) || null,
        title: text(item?.title, 100),
        ticketCategory: text(item?.ticketCategory, 40),
        minAge: Number.isFinite(Number(item?.minAge)) ? Number(item.minAge) : null,
        maxAge: Number.isFinite(Number(item?.maxAge)) ? Number(item.maxAge) : null,
      })),
      rates: rateOptions,
      bookingCutoffHours: Math.max(0, Number(product.bookingCutoffHours) || 0),
      pickupService: Boolean(product.pickupService),
      cancellationPolicy: product.cancellationPolicy || null,
      rawAvailabilityCount: asArray(availability).length,
    },
  };
}

function buildUrl(baseUrl, path, params) {
  const base = String(baseUrl || DEFAULT_INTEGRATION_BASE_URL).replace(/\/+$/, '');
  const url = new URL(`${base}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function jsonRequest(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Bókun integration HTTP ${response.status}`);
  return data;
}

export async function fetchLoveTravelBokunTours({
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_INTEGRATION_BASE_URL,
  vendorId = LOVE_TRAVEL_BOKUN_VENDOR_ID,
  productIds = LOVE_TRAVEL_BOKUN_PRODUCT_IDS,
  start,
  end,
  currency = 'USD',
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');

  return Promise.all(productIds.map(async productId => {
    const productUrl = buildUrl(baseUrl, '/api/bokun/product', { vendorId, productId });
    const availabilityUrl = buildUrl(baseUrl, '/api/bokun/availability', {
      vendorId,
      productId,
      start,
      end,
      currency,
    });
    const [product, availability] = await Promise.all([
      jsonRequest(fetchImpl, productUrl),
      jsonRequest(fetchImpl, availabilityUrl),
    ]);
    return normalizeBokunProduct(product, availability);
  }));
}

export const _test = {
  htmlToList,
  moneyLabel,
  photoUrl,
  inferIsoDate,
  priceMapForAvailability,
};
