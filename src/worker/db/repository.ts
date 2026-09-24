import type { AvailabilityDate, Destination, Locale, OrderSummary, Tour } from '../../shared/types';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_MANAGER_CHAT_ID?: string;
  TELEGRAM_OWNER_CHAT_ID?: string;
  TELEGRAM_MINIAPP_URL?: string;
  TILDA_WEBHOOK_SECRET?: string;
  AUTH_MODE?: 'demo' | 'telegram';
}

type TourRow = {
  id: string; slug: string; title: string; direction: string; category: string; published: number;
  source_url: string; price_mode: Tour['priceMode']; pricing_rules_json: string; required_fields_json: string;
  schedule_mode: Tour['scheduleMode']; pickup: string | null; back: string | null; description: string;
  program_json: string; included_json: string; extra_costs_json: string; what_to_take_json: string;
  images_json: string; badges_json: string; data_status: Tour['dataStatus']; created_at: string; updated_at: string;
};

function json<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function mapTour(row: TourRow): Tour {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    direction: row.direction,
    category: row.category,
    published: Boolean(row.published),
    sourceUrl: row.source_url,
    priceMode: row.price_mode,
    pricingRules: json(row.pricing_rules_json, { childRules: [] }),
    requiredFields: json(row.required_fields_json, []),
    scheduleMode: row.schedule_mode,
    pickup: row.pickup ?? undefined,
    back: row.back ?? undefined,
    description: row.description,
    program: json(row.program_json, []),
    included: json(row.included_json, []),
    extraCosts: json(row.extra_costs_json, []),
    whatToTake: json(row.what_to_take_json, []),
    images: json(row.images_json, []),
    badges: json(row.badges_json, []),
    dataStatus: row.data_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type TourTranslationRow = {
  tour_id: string;
  title: string;
  direction: string;
  category: string;
  pickup: string | null;
  back: string | null;
  description: string;
  program_json: string;
  included_json: string;
  extra_costs_json: string;
  what_to_take_json: string;
  badges_json: string;
  pricing_text_json: string;
};

async function localizeTours(db: D1Database, tours: Tour[], locale: Locale): Promise<Tour[]> {
  if (locale === 'ru' || tours.length === 0) return tours;
  const result = await db.prepare('SELECT * FROM tour_translations WHERE locale=?').bind(locale).all<TourTranslationRow>();
  const translations = new Map((result.results ?? []).map(row => [row.tour_id, row] as const));
  return tours.map(tour => {
    const row = translations.get(tour.id);
    if (!row) return tour;
    const pricingText = json<{ note?: string; childLabels?: string[] }>(row.pricing_text_json, {});
    return {
      ...tour,
      title: row.title,
      direction: row.direction,
      category: row.category,
      pickup: row.pickup ?? undefined,
      back: row.back ?? undefined,
      description: row.description,
      program: json(row.program_json, tour.program),
      included: json(row.included_json, tour.included),
      extraCosts: json(row.extra_costs_json, tour.extraCosts),
      whatToTake: json(row.what_to_take_json, tour.whatToTake),
      badges: json(row.badges_json, tour.badges),
      pricingRules: {
        ...tour.pricingRules,
        ...(pricingText.note ? { note: pricingText.note } : {}),
        childRules: tour.pricingRules.childRules.map((rule, index) => ({
          ...rule,
          label: pricingText.childLabels?.[index] ?? rule.label,
        })),
      },
    };
  });
}

export async function getBaseTours(db: D1Database): Promise<Tour[]> {
  const result = await db.prepare('SELECT * FROM tours ORDER BY rowid').all<TourRow>();
  return (result.results ?? []).map(mapTour);
}

export async function getMergedTours(db: D1Database, sessionId: string, locale: Locale = 'ru'): Promise<Tour[]> {
  const base = await getBaseTours(db);
  const overrides = await db.prepare('SELECT tour_id, override_json FROM demo_tour_overrides WHERE session_id=?').bind(sessionId).all<{ tour_id: string; override_json: string }>();
  const overrideMap = new Map<string, Partial<Tour>>((overrides.results ?? []).map(r => [r.tour_id, json<Partial<Tour>>(r.override_json, {})] as [string, Partial<Tour>]));
  const merged = base.map(t => ({ ...t, ...(overrideMap.get(t.id) ?? {}), dataStatus: overrideMap.has(t.id) ? 'demoOverride' as const : t.dataStatus }));

  const user = await db.prepare('SELECT tour_json FROM demo_user_created_tours WHERE session_id=? ORDER BY created_at DESC').bind(sessionId).all<{ tour_json: string }>();
  for (const row of user.results ?? []) {
    const t = json<Tour | null>(row.tour_json, null);
    if (t) merged.push(t);
  }

  const promos = await db.prepare('SELECT tour_id, enabled, label, value, discount_type, discount_value FROM demo_promotions WHERE session_id=?').bind(sessionId).all<{ tour_id: string; enabled: number; label: string; value: string; discount_type: 'none'|'percent_bps'|'fixed_minor'; discount_value: number }>();
  const promoMap = new Map((promos.results ?? []).map(r => [r.tour_id, r] as const));
  const withPromos: Tour[] = merged.map(t => {
    const p = promoMap.get(t.id);
    return p ? {
      ...t,
      promo: {
        enabled: Boolean(p.enabled),
        label: p.label,
        value: p.value,
        discountType: p.discount_type,
        discountValue: Number(p.discount_value ?? 0),
        dataStatus: 'demoPromo' as const,
      }
    } : t;
  });
  return localizeTours(db, withPromos, locale);
}

export async function getTourByIdOrSlug(db: D1Database, sessionId: string, idOrSlug: string, locale: Locale = 'ru'): Promise<Tour | null> {
  const tours = await getMergedTours(db, sessionId, locale);
  return tours.find(t => t.id === idOrSlug || t.slug === idOrSlug) ?? null;
}

export async function getDestinations(db: D1Database, sessionId: string, locale: Locale = 'ru'): Promise<Destination[]> {
  const base = await db.prepare('SELECT id, name, data_status FROM destinations ORDER BY rowid').all<{ id: string; name: string; data_status: Destination['dataStatus'] }>();
  const demo = await db.prepare('SELECT id, name, data_status FROM demo_directions WHERE session_id=? ORDER BY created_at').bind(sessionId).all<{ id: string; name: string; data_status: Destination['dataStatus'] }>();
  const translations = locale === 'ru'
    ? new Map<string, string>()
    : new Map((await db.prepare('SELECT destination_id,name FROM destination_translations WHERE locale=?').bind(locale).all<{destination_id:string;name:string}>()).results?.map(row => [row.destination_id, row.name] as const) ?? []);
  return [...(base.results ?? []), ...(demo.results ?? [])].map(r => ({
    id: r.id,
    name: translations.get(r.id) ?? r.name,
    dataStatus: r.data_status,
  }));
}

export async function getAvailability(db: D1Database, sessionId: string, tourId: string, locale: Locale = 'ru'): Promise<AvailabilityDate[]> {
  const result = await db.prepare('SELECT date,status,label,data_status FROM demo_availability WHERE session_id=? AND tour_id=? ORDER BY date').bind(sessionId, tourId).all<{date:string;status:AvailabilityDate['status'];label:AvailabilityDate['label'];data_status:'demoAvailability'}>();
  const viLabels: Record<AvailabilityDate['status'], string> = { available: 'còn chỗ', low: 'sắp hết chỗ', request: 'theo yêu cầu' };
  return (result.results ?? []).map(r => ({
    date:r.date,
    status:r.status,
    label:(locale === 'vi' ? viLabels[r.status] : r.label) as AvailabilityDate['label'],
    dataStatus:'demoAvailability'
  }));
}

export function mapOrderRow(row: any): OrderSummary {
  const snapshot = json<any>(row.pricing_snapshot_json ?? '{}', {});
  const participantData = json<any[]>(row.participant_data_json ?? '[]', []);
  return {
    id: row.display_id,
    tourId: row.tour_id,
    tourTitle: row.tour_title,
    selectedDate: row.selected_date,
    participantsSummary: row.participants_summary,
    hotel: row.hotel,
    transferMinor: row.transfer_minor,
    totalMinor: row.total_minor,
    paidMinor: row.paid_minor,
    remainingMinor: row.remaining_minor,
    paymentState: row.payment_state,
    status: row.status,
    source: row.source,
    customer: row.customer,
    contact: row.contact,
    createdAt: row.created_at,
    dataStatus: 'demoInput',
    children: Array.isArray(snapshot?.children) ? snapshot.children : [],
    participantData,
  };
}

export async function listOrders(db: D1Database, sessionId: string): Promise<OrderSummary[]> {
  const result = await db.prepare('SELECT * FROM orders WHERE session_id=? ORDER BY created_at DESC').bind(sessionId).all();
  return (result.results ?? []).map(mapOrderRow);
}

export async function listCustomerOrders(db: D1Database, sessionId: string): Promise<OrderSummary[]> {
  const result = await db.prepare('SELECT * FROM orders WHERE session_id=? AND customer_visible=1 ORDER BY created_at DESC').bind(sessionId).all();
  return (result.results ?? []).map(mapOrderRow);
}

export async function getOrder(db: D1Database, sessionId: string, displayId: string): Promise<(OrderSummary & { raw: any }) | null> {
  const row = await db.prepare('SELECT * FROM orders WHERE session_id=? AND display_id=?').bind(sessionId, displayId).first<any>();
  return row ? { ...mapOrderRow(row), raw: row } : null;
}
