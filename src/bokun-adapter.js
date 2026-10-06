import { buildBokunDomain, quoteMatrix } from './bokun-domain.js';

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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function categoryByType(domain = {}, type) {
  return asArray(domain.participants).find(item => String(item?.ticketCategory || '').toUpperCase() === type) || null;
}

function moneyLabel(value) {
  if (!value || !Number.isFinite(Number(value.amount))) return '';
  const amount = Number(value.amount);
  const rounded = Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(2)));
  return value.currency === 'USD' ? `$${rounded}` : `${rounded} ${value.currency || ''}`.trim();
}

function quoteMap(slot = {}, rateId = null) {
  const selected = asArray(slot.priceQuotesByRate)
    .find(item => String(item.rateId) === String(rateId))
    || asArray(slot.priceQuotesByRate)[0]
    || null;
  return new Map(asArray(selected?.participantPrices).map(item => [
    String(item.categoryId ?? ''),
    item.amount,
  ]).filter(([, value]) => value));
}

function defaultRate(domain = {}) {
  const product = domain.providerRaw?.product || {};
  const rates = asArray(domain.rates);
  return rates.find(rate => String(rate?.id) === String(product.defaultRateId))
    || rates[0]
    || null;
}

function firstBookableSlot(domain = {}) {
  return asArray(domain.availabilitySlots).find(item => !item?.soldOut && !item?.unavailable)
    || asArray(domain.availabilitySlots)[0]
    || {};
}

function compatibilityDeparture(slot = {}) {
  const available = Math.max(0, Number(slot.availabilityCount) || 0);
  const taken = Math.max(0, Number(slot.bookedParticipants) || 0);
  return {
    id:text(slot.id, 160),
    iso:text(slot.date, 20),
    date:text(slot.localizedDate || slot.date, 80),
    time:text(slot.startTime, 30),
    taken,
    capacity:available + taken,
    available,
    status:slot.soldOut || slot.unavailable ? 'full' : 'available',
    soldOut:Boolean(slot.soldOut),
    unavailable:Boolean(slot.unavailable),
    startTimeId:Number(slot.startTimeId) || null,
    recurrenceId:Number(slot.recurrenceId) || null,
    minParticipants:Number(slot.minParticipants) || 0,
    minParticipantsToBookNow:Number(slot.minParticipantsToBookNow) || 0,
    pickupAvailabilityCount:Number.isFinite(Number(slot.pickup?.availabilityCount)) ? Number(slot.pickup.availabilityCount) : null,
    unlimitedAvailability:Boolean(slot.unlimitedAvailability),
    defaultRateId:slot.defaultRateId ?? null,
  };
}

export function projectBokunDomainToLegacyTour(domain = {}) {
  const product = domain.providerRaw?.product || {};
  const firstSlot = firstBookableSlot(domain);
  const selectedRate = defaultRate(domain);
  const prices = quoteMap(firstSlot, selectedRate?.id);
  const adult = categoryByType(domain, 'ADULT');
  const child = categoryByType(domain, 'CHILD');
  const infant = categoryByType(domain, 'INFANT');

  const adultPrice = prices.get(String(adult?.id ?? '')) || money(product.nextDefaultPriceMoney);
  const childPrice = prices.get(String(child?.id ?? ''));
  const infantPrice = prices.get(String(infant?.id ?? ''));

  const gallery = unique(asArray(domain.experience?.media?.photos).map(item => text(item?.url, 2000)));
  const route = asArray(domain.experience?.itinerary)
    .map((item, index) => [
      text(item?.title, 140) || `Stop ${index + 1}`,
      text(item?.body, 1200),
    ])
    .filter(item => item[1]);

  const languages = unique(asArray(product.guidanceTypes)
    .flatMap(item => asArray(item?.displayLanguages).map(value => text(value, 80))));

  const included = htmlToList(domain.experience?.content?.included);
  const excluded = htmlToList(domain.experience?.content?.excluded);

  const rateOptions = asArray(domain.rates).map(rate => {
    const livePrices = quoteMap(firstSlot, rate.id);
    return {
      id:Number(rate?.id) || rate?.id || null,
      code:text(rate?.code, 80),
      title:text(rate?.title, 180),
      description:text(rate?.description, 800),
      minPerBooking:Math.max(0, Number(rate?.minPerBooking) || 0),
      maxPerBooking:Math.max(0, Number(rate?.maxPerBooking) || 0),
      pricedPerPerson:Boolean(rate?.pricedPerPerson),
      pickup:rate?.pickup || null,
      dropoff:rate?.dropoff || null,
      cancellationPolicy:rate?.cancellationPolicy || null,
      startTimeIds:asArray(rate?.startTimeIds),
      tieredPricingEnabled:Boolean(rate?.tieredPricingEnabled),
      tiers:asArray(rate?.tiers),
      extraConfigs:asArray(rate?.extraConfigs),
      prices:{
        adult:moneyLabel(livePrices.get(String(adult?.id ?? ''))),
        child:moneyLabel(livePrices.get(String(child?.id ?? ''))),
        infant:moneyLabel(livePrices.get(String(infant?.id ?? ''))),
      },
    };
  });

  const priceFromUsd = adultPrice?.currency === 'USD' ? Number(adultPrice.amount) || 0 : 0;
  const meetingPoints = asArray(domain.experience?.meeting?.startPoints);
  const productFlags = asArray(product.flags).map(value =>
    text(typeof value === 'string' ? value : (value?.code || value?.name || value?.title), 80).toUpperCase()
  ).filter(Boolean);
  const popular = productFlags.some(value => /POPULAR|FEATURED|HIGHLIGHT/.test(value));
  const formatsLabel = product.privateActivity === true
    ? 'индивидуальный'
    : product.privateActivity === false
      ? 'групповой'
      : '';
  const searchText = [
    domain.experience?.title,
    domain.experience?.description,
    domain.experience?.location?.city,
    ...meetingPoints.map(item => item.title),
    ...languages,
    ...included,
    ...route.flat(),
    ...rateOptions.map(rate => rate.title),
  ].map(value => text(value, 500)).filter(Boolean).join(' ').toLocaleLowerCase('en-US');

  return {
    id:String(domain.experience?.id || domain.provider?.productId || ''),
    source:'bokun',
    popular,
    bokunProductId:String(domain.provider?.productId ?? ''),
    externalId:text(domain.experience?.externalId, 120),
    title:text(domain.experience?.title, 240),
    description:text(domain.experience?.description, 3000),
    city:text(domain.experience?.location?.city || meetingPoints[0]?.city, 100),
    region:text(meetingPoints[0]?.state, 100),
    category:text(domain.experience?.category, 100),
    duration:text(domain.experience?.duration?.text, 80),
    time:text(firstSlot?.startTime, 30),
    activity:text(domain.experience?.difficulty, 80),
    tags:unique([
      ...asArray(product.keywords).map(value => text(value, 60)),
      ...asArray(product.activityCategories).map(value => text(value, 60)),
      ...asArray(product.activityAttributes).map(value => text(value, 60)),
    ]),
    audience:[],
    childrenOk:Boolean(child || infant),
    image:gallery[0] || '',
    fallbackImage:gallery[0] || '',
    gallery,
    included,
    excluded,
    take:[],
    route,
    languages,
    meetingPoint:meetingPoints[0] ? {
      title:text(meetingPoints[0].title, 180),
      address:text(meetingPoints[0].addressLine1, 180),
      city:text(meetingPoints[0].city, 100),
      latitude:meetingPoints[0].latitude,
      longitude:meetingPoints[0].longitude,
    } : null,
    meetingPoints,
    searchText,
    formatsLabel,
    priceFromUsd,
    liked:false,
    localization:domain.localization || null,
    group:{
      from:moneyLabel(adultPrice),
      adult:moneyLabel(adultPrice),
      child:moneyLabel(childPrice),
      infant:moneyLabel(infantPrice),
      deposit:'',
      notes:[],
      departures:asArray(domain.availabilitySlots).map(compatibilityDeparture),
    },
    individual:null,
    bokun:{
      domainSchemaVersion:domain.schemaVersion,
      vendorId:String(domain.provider?.vendorId ?? LOVE_TRAVEL_BOKUN_VENDOR_ID),
      productId:String(domain.provider?.productId ?? ''),
      defaultRateId:selectedRate?.id ?? null,
      pricingCategories:asArray(domain.participants).map(item => ({
        id:item.id,
        title:text(item.title, 100),
        ticketCategory:text(item.ticketCategory, 40),
        minAge:item.minAge,
        maxAge:item.maxAge,
      })),
      rates:rateOptions,
      bookingRequirements:domain.bookingRequirements || null,
      bookingCutoffHours:Math.max(0, Number(domain.bookingRequirements?.cutoff?.hours) || 0),
      pickup:domain.experience?.pickup || null,
      dropoff:domain.experience?.dropoff || null,
      pickupService:Boolean(domain.experience?.pickup?.enabled),
      cancellationPolicy:domain.cancellationPolicy || null,
      extras:asArray(domain.extras),
      accessibility:asArray(domain.experience?.accessibility),
      content:{
        requirements:domain.experience?.content?.requirements ?? null,
        attention:domain.experience?.content?.attention ?? null,
        dressCode:domain.experience?.content?.dressCode ?? null,
        knowBeforeYouGoItems:asArray(domain.experience?.content?.knowBeforeYouGoItems),
      },
      quoteMatrix:quoteMatrix(domain),
      coverage:domain.coverage,
      rawAvailabilityCount:asArray(domain.availabilitySlots).length,
    },
  };
}

export function normalizeBokunProduct(product = {}, availability = []) {
  const domain = buildBokunDomain(product, availability, { vendorId:LOVE_TRAVEL_BOKUN_VENDOR_ID });
  return projectBokunDomainToLegacyTour(domain);
}

function buildUrl(baseUrl, path, params) {
  const base = String(baseUrl || DEFAULT_INTEGRATION_BASE_URL).replace(/\/+$/, '');
  const url = new URL(`${base}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
}

const DEFAULT_PROVIDER_READ_TIMEOUT_MS = 20000;

async function jsonRequest(fetchImpl, url, { timeoutMs = DEFAULT_PROVIDER_READ_TIMEOUT_MS } = {}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  if (controller && Number(timeoutMs) > 0) {
    timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs)));
  }
  try {
    const response = await fetchImpl(url, {
      headers:{ accept:'application/json' },
      ...(controller ? { signal:controller.signal } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Bókun integration HTTP ${response.status}`);
    return data;
  } catch (error) {
    if (controller?.signal?.aborted) {
      const timeout = new Error('Bókun integration request timed out');
      timeout.code = 'bokun_integration_timeout';
      throw timeout;
    }
    throw error;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

async function fetchRawProductPair({
  fetchImpl,
  baseUrl,
  vendorId,
  productId,
  start,
  end,
  currency,
  lang,
  includePickupPlaces = false,
  requestTimeoutMs = DEFAULT_PROVIDER_READ_TIMEOUT_MS,
}) {
  const productUrl = buildUrl(baseUrl, '/api/bokun/product', { vendorId, productId, lang });
  const availabilityUrl = buildUrl(baseUrl, '/api/bokun/availability', {
    vendorId,
    productId,
    start,
    end,
    currency,
  });
  const pickupPlacesUrl = buildUrl(baseUrl, '/api/bokun/pickup-places', { vendorId, productId });
  const [product, availability, pickupPlaces] = await Promise.all([
    jsonRequest(fetchImpl, productUrl, { timeoutMs:requestTimeoutMs }),
    jsonRequest(fetchImpl, availabilityUrl, { timeoutMs:requestTimeoutMs }),
    includePickupPlaces
      ? jsonRequest(fetchImpl, pickupPlacesUrl, { timeoutMs:requestTimeoutMs })
      : Promise.resolve({ pickupPlaces:[], dropoffPlaces:[] }),
  ]);
  return { product, availability, pickupPlaces };
}

export async function fetchLoveTravelBokunDomains({
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_INTEGRATION_BASE_URL,
  vendorId = LOVE_TRAVEL_BOKUN_VENDOR_ID,
  productIds = LOVE_TRAVEL_BOKUN_PRODUCT_IDS,
  start,
  end,
  currency = 'USD',
  lang = 'EN',
  includePickupPlaces = false,
  requestTimeoutMs = DEFAULT_PROVIDER_READ_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  const pairs = await Promise.all(productIds.map(productId => fetchRawProductPair({
    fetchImpl,
    baseUrl,
    vendorId,
    productId,
    start,
    end,
    currency,
    lang,
    includePickupPlaces,
    requestTimeoutMs,
  })));
  return pairs.map(({ product, availability, pickupPlaces }) => buildBokunDomain(product, availability, { vendorId, pickupPlaces }));
}

export async function fetchLoveTravelBokunTours(options = {}) {
  const domains = await fetchLoveTravelBokunDomains({ ...options, includePickupPlaces:false });
  return domains.map(projectBokunDomainToLegacyTour);
}

export const _test = {
  htmlToList,
  moneyLabel,
  quoteMap,
  firstBookableSlot,
  compatibilityDeparture,
};
