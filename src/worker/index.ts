import type { Env } from './db/repository';
import { ensureSession, resetSession } from './db/session';
import { getAvailability, getDestinations, getMergedTours, getOrder, listCustomerOrders, listOrders } from './db/repository';
import { quoteBooking, HttpError } from './services/booking';
import { createOrder, demoPayment, updateOrderStatus } from './services/orders';
import { addDirection, addTour, adminTours, patchTour, setAvailability, setPromo } from './services/admin';
import { getAnalytics, recordEvent } from './services/analytics';
import { getManagerOps, patchManagerOps, getOwnerOverview, patchOwnerSettings } from './services/operations';
import { getCustomerRecord, getOrderWorkflow, listAudit, patchCustomerRecord, patchOrderWorkflow } from './services/internal-workflows';
import { flushTelegramOutbox, getIntegrationStatus, handleTelegramWebhook } from './services/notifications';
import { configureTelegramWebhook, getTelegramWebhookInfo } from './services/telegram-config';
import { getTildaIntegrationStatus, receiveTildaWebhook } from './services/tilda';
import { authenticateTelegramStaff, getAuthReadiness, listAssignableStaff, listStaffAccounts, requireStaffRole, upsertStaffAccount } from './services/telegram-auth';
import { adminPatchGroupDeparture, createGroupDeparture, joinGroupDeparture, listGroupDepartures } from './services/group-departures';
import { campaignRecipients, createCampaign, listAdminCustomers, listCampaigns } from './services/admin-crm';
import { listRefundCases } from './services/refund-policy';
import { listSiteSyncOutbox } from './services/site-sync';
import { sourceSiteCatalog } from '../shared/site-catalog';
import { managerStatusSchema } from '../shared/schemas';

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-max-tour-demo': '1',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      ...extraHeaders,
    },
  });
}

async function body(request: Request) {
  const type = request.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Ожидается JSON', 'UNSUPPORTED_MEDIA_TYPE');
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 131072) throw new HttpError(413, 'JSON-запрос слишком большой', 'PAYLOAD_TOO_LARGE');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 131072) throw new HttpError(413, 'JSON-запрос слишком большой', 'PAYLOAD_TOO_LARGE');
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Некорректный JSON', 'INVALID_JSON'); }
}

function withCookie(response: Response, setCookie?: string) {
  if (!setCookie) return response;
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', setCookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function match(path: string, pattern: RegExp) {
  const result = path.match(pattern);
  return result ? result.slice(1).map(decodeURIComponent) : null;
}

function requiredIdempotencyKey(request: Request) {
  const key = request.headers.get('Idempotency-Key')?.trim() ?? '';
  if (!key || key.length > 128) throw new HttpError(400, 'Нужен корректный Idempotency-Key', 'IDEMPOTENCY_KEY_REQUIRED');
  return key;
}

function telegramWebhookAuthorized(request: Request, env: Env) {
  const expected = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) return true;
  return request.headers.get('X-Telegram-Bot-Api-Secret-Token') === expected;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const locale = request.headers.get('X-Max-Tour-Locale') === 'vi' || url.searchParams.get('lang') === 'vi' ? 'vi' : 'ru';

    if (!path.startsWith('/api/')) {
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      headers.set('X-Content-Type-Options','nosniff');
      headers.set('Referrer-Policy','strict-origin-when-cross-origin');
      headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
      return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
    }

    try {
      if (path === '/api/health' && request.method === 'GET') {
        const probe = await env.DB.prepare('SELECT 1 AS ok').first<{ok:number}>();
        return json({ ok: probe?.ok === 1, service: 'max-tour-demo', database: 'D1', time: new Date().toISOString() });
      }

      if (path === '/api/telegram/webhook' && request.method === 'POST') {
        if (!telegramWebhookAuthorized(request, env)) throw new HttpError(401, 'Неверный Telegram webhook secret', 'TELEGRAM_WEBHOOK_UNAUTHORIZED');
        if (!env.TELEGRAM_BOT_TOKEN?.trim()) throw new HttpError(503, 'Telegram bot token ещё не настроен', 'TELEGRAM_NOT_CONFIGURED');
        return json(await handleTelegramWebhook(env, await body(request)), 202);
      }
      if (path === '/api/tilda/webhook' && request.method === 'POST') {
        await receiveTildaWebhook(request, env);
        return new Response('ok', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
        });
      }

      const session = await ensureSession(request, env);
      const finish = (r: Response) => withCookie(r, session.setCookie);

      if (path === '/api/session' && (request.method === 'GET' || request.method === 'POST')) return finish(json({ ok: true, demoSession: true }));
      if (path === '/api/demo/reset' && request.method === 'POST') {
        await resetSession(env, session.id);
        return finish(json({ ok: true, reset: true }));
      }
      if (path === '/api/auth/readiness' && request.method === 'GET') return finish(json(await getAuthReadiness(env)));
      if (path === '/api/auth/telegram' && request.method === 'POST') {
        const input: any = await body(request);
        const initData = String(input?.initData ?? '').trim();
        if (!initData) throw new HttpError(400, 'Не передан Telegram initData', 'TELEGRAM_INITDATA_REQUIRED');
        return finish(json(await authenticateTelegramStaff(env, initData)));
      }

      if (path === '/api/integrations/telegram/status' && request.method === 'GET') return finish(json(await getIntegrationStatus(env, session.id)));
      if (path === '/api/integrations/telegram/flush' && request.method === 'POST') return finish(json(await flushTelegramOutbox(env, session.id)));
      if (path === '/api/integrations/telegram/webhook' && request.method === 'POST') return finish(json(await configureTelegramWebhook(env, url.origin)));
      if (path === '/api/integrations/telegram/webhook' && request.method === 'GET') return finish(json(await getTelegramWebhookInfo(env)));
      if (path === '/api/integrations/tilda/status' && request.method === 'GET') return finish(json(await getTildaIntegrationStatus(env)));

      let staffActor: Awaited<ReturnType<typeof requireStaffRole>> | null = null;
      if (path.startsWith('/api/manager/')) staffActor = await requireStaffRole(env, request, 'manager');
      else if (path.startsWith('/api/admin/')) staffActor = await requireStaffRole(env, request, 'admin');
      else if (path.startsWith('/api/owner/')) staffActor = await requireStaffRole(env, request, 'owner');
      const actorId = staffActor?.telegramUserId ?? 'demo';

      if (path === '/api/destinations' && request.method === 'GET') return finish(json({ items: await getDestinations(env.DB, session.id, locale) }));
      if (path === '/api/site-catalog' && request.method === 'GET') return finish(json({ catalog: sourceSiteCatalog() }));
      if (path === '/api/tours' && request.method === 'GET') {
        const all = await getMergedTours(env.DB, session.id, locale);
        const publishedOnly = url.searchParams.get('admin') !== '1';
        return finish(json({ items: publishedOnly ? all.filter(t => t.published) : all }));
      }

      let m = match(path, /^\/api\/tours\/([^/]+)\/availability$/);
      if (m && request.method === 'GET') return finish(json({ items: await getAvailability(env.DB, session.id, m[0], locale), demo: true }));
      m = match(path, /^\/api\/tours\/([^/]+)$/);
      if (m && request.method === 'GET') {
        const tours = await getMergedTours(env.DB, session.id, locale);
        const tour = tours.find(t => t.id === m![0] || t.slug === m![0]);
        if (!tour) throw new HttpError(404, 'Экскурсия не найдена', 'TOUR_NOT_FOUND');
        return finish(json({ item: tour }));
      }

      if (path === '/api/group-departures' && request.method === 'GET') return finish(json({ items: await listGroupDepartures(env, session.id, url.searchParams.get('tourId') ?? undefined) }));
      if (path === '/api/group-departures' && request.method === 'POST') return finish(json({ item: await createGroupDeparture(env, session.id, await body(request)) }, 201));
      m = match(path, /^\/api\/group-departures\/([^/]+)\/join$/);
      if (m && request.method === 'POST') return finish(json({ item: await joinGroupDeparture(env, session.id, m[0], await body(request)) }));

      if (path === '/api/booking/quote' && request.method === 'POST') {
        const input = await body(request);
        const result = await quoteBooking(env, session.id, input, locale);
        await recordEvent(env, session.id, { eventType: 'quote_created', source: result.draft.source, tourId: result.tour.id });
        return finish(json({ quote: result.quote }));
      }

      if (path === '/api/orders' && request.method === 'POST') {
        const input = await body(request);
        const idempotencyKey = requiredIdempotencyKey(request);
        const result = await quoteBooking(env, session.id, input, locale);
        const order = await createOrder(env, session.id, result.draft, result.tour, result.quote, idempotencyKey);
        if (!order) throw new HttpError(500, 'Не удалось создать заказ', 'ORDER_CREATE_FAILED');
        const { raw: _raw, ...safe } = order;
        return finish(json({ order: safe }, 201));
      }
      m = match(path, /^\/api\/orders\/([^/]+)$/);
      if (m && request.method === 'GET') {
        const order = await getOrder(env.DB, session.id, m[0]);
        if (!order || Number(order.raw.customer_visible ?? 0) !== 1) throw new HttpError(404, 'Заказ не найден', 'ORDER_NOT_FOUND');
        const { raw: _raw, ...safe } = order;
        return finish(json({ order: safe }));
      }
      if (path === '/api/my-trips' && request.method === 'GET') return finish(json({ items: await listCustomerOrders(env.DB, session.id) }));
      if (path === '/api/payments/demo' && request.method === 'POST') {
        const input: any = await body(request);
        const orderId = String(input?.orderId ?? '');
        if (!orderId) throw new HttpError(400, 'Не указан orderId', 'ORDER_ID_REQUIRED');
        const idempotencyKey = requiredIdempotencyKey(request);
        const order = await demoPayment(env, session.id, orderId, idempotencyKey);
        if (!order) throw new HttpError(404, 'Заказ не найден', 'ORDER_NOT_FOUND');
        const { raw: _raw, ...safe } = order;
        return finish(json({ order: safe }));
      }

      if (path === '/api/manager/staff' && request.method === 'GET') return finish(json(await listAssignableStaff(env)));
      if (path === '/api/manager/orders' && request.method === 'GET') return finish(json({ items: await listOrders(env.DB, session.id) }));
      m = match(path, /^\/api\/manager\/orders\/([^/]+)$/);
      if (m && request.method === 'GET') {
        const order = await getOrder(env.DB, session.id, m[0]);
        if (!order) throw new HttpError(404, 'Заказ не найден', 'ORDER_NOT_FOUND');
        const { raw: _raw, ...safe } = order;
        return finish(json({ order: safe }));
      }
      m = match(path, /^\/api\/manager\/orders\/([^/]+)\/status$/);
      if (m && request.method === 'PATCH') {
        const parsed = managerStatusSchema.safeParse(await body(request));
        if (!parsed.success) throw new HttpError(400, 'Некорректный статус', 'VALIDATION_ERROR');
        const order = await updateOrderStatus(env, session.id, m[0], parsed.data.status, actorId);
        if (!order) throw new HttpError(404, 'Заказ не найден', 'ORDER_NOT_FOUND');
        const { raw: _raw, ...safe } = order;
        return finish(json({ order: safe }));
      }

      m = match(path, /^\/api\/manager\/orders\/([^/]+)\/ops$/);
      if (m && request.method === 'GET') return finish(json({ ops: await getManagerOps(env, session.id, m[0]) }));
      if (m && request.method === 'PATCH') return finish(json({ ops: await patchManagerOps(env, session.id, m[0], await body(request), actorId) }));
      m = match(path, /^\/api\/manager\/orders\/([^/]+)\/workflow$/);
      if (m && request.method === 'GET') return finish(json({ workflow: await getOrderWorkflow(env, session.id, m[0]) }));
      if (m && request.method === 'PATCH') return finish(json({ workflow: await patchOrderWorkflow(env, session.id, m[0], await body(request), actorId) }));

      if (path === '/api/manager/customer-record' && request.method === 'GET') {
        return finish(json({ record: await getCustomerRecord(env, session.id, url.searchParams.get('key') ?? '') }));
      }
      if (path === '/api/manager/customer-record' && request.method === 'PATCH') {
        const input: any = await body(request);
        return finish(json({ record: await patchCustomerRecord(env, session.id, String(input?.customerKey ?? ''), input, actorId) }));
      }

      if (path === '/api/owner/overview' && request.method === 'GET') return finish(json(await getOwnerOverview(env, session.id)));
      if (path === '/api/owner/settings' && request.method === 'PATCH') return finish(json(await patchOwnerSettings(env, session.id, await body(request), actorId)));
      if (path === '/api/owner/audit' && request.method === 'GET') return finish(json({ items: await listAudit(env, session.id, Number(url.searchParams.get('limit') ?? 30)) }));
      if (path === '/api/owner/staff' && request.method === 'GET') return finish(json(await listStaffAccounts(env)));
      if (path === '/api/owner/staff' && request.method === 'PUT') return finish(json({ item: await upsertStaffAccount(env, session.id, await body(request), actorId) }));

      if (path === '/api/admin/group-departures' && request.method === 'GET') return finish(json({ items: await listGroupDepartures(env, session.id) }));
      m = match(path, /^\/api\/admin\/group-departures\/([^/]+)$/);
      if (m && request.method === 'PATCH') return finish(json({ item: await adminPatchGroupDeparture(env, session.id, m[0], await body(request), actorId) }));
      if (path === '/api/admin/customers' && request.method === 'GET') return finish(json({ items: await listAdminCustomers(env, session.id) }));
      if (path === '/api/admin/campaigns' && request.method === 'GET') return finish(json({ items: await listCampaigns(env, session.id) }));
      if (path === '/api/admin/campaigns' && request.method === 'POST') return finish(json({ item: await createCampaign(env, session.id, await body(request), actorId) }, 201));
      m = match(path, /^\/api\/admin\/campaigns\/([^/]+)\/recipients$/);
      if (m && request.method === 'GET') return finish(json({ items: await campaignRecipients(env, session.id, m[0]) }));
      if (path === '/api/admin/refunds' && request.method === 'GET') return finish(json({ items: await listRefundCases(env, session.id) }));
      if (path === '/api/admin/site-sync' && request.method === 'GET') return finish(json({ items: await listSiteSyncOutbox(env, session.id) }));

      if (path === '/api/admin/tours' && request.method === 'GET') return finish(json({ items: await adminTours(env, session.id) }));
      if (path === '/api/admin/tours' && request.method === 'POST') return finish(json({ item: await addTour(env, session.id, await body(request), actorId) }, 201));
      m = match(path, /^\/api\/admin\/tours\/([^/]+)$/);
      if (m && request.method === 'PATCH') return finish(json({ item: await patchTour(env, session.id, m[0], await body(request), actorId) }));
      m = match(path, /^\/api\/admin\/tours\/([^/]+)\/schedule$/);
      if (m && (request.method === 'POST' || request.method === 'PATCH')) return finish(json({ item: await setAvailability(env, session.id, m[0], await body(request), actorId) }));
      m = match(path, /^\/api\/admin\/tours\/([^/]+)\/promo$/);
      if (m && (request.method === 'POST' || request.method === 'PATCH')) return finish(json({ item: await setPromo(env, session.id, m[0], await body(request), actorId) }));
      if (path === '/api/admin/directions' && request.method === 'GET') return finish(json({ items: await getDestinations(env.DB, session.id) }));
      if (path === '/api/admin/directions' && request.method === 'POST') return finish(json({ item: await addDirection(env, session.id, await body(request), actorId) }, 201));
      if (path === '/api/admin/analytics' && request.method === 'GET') return finish(json(await getAnalytics(env, session.id, url.searchParams)));

      if (path === '/api/analytics/event' && request.method === 'POST') {
        await recordEvent(env, session.id, await body(request));
        return finish(json({ ok: true }, 202));
      }

      return finish(json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found' } }, 404));
    } catch (error) {
      if (error instanceof HttpError) return json({ error: { code: error.code, message: error.message } }, error.status);
      console.error('Unhandled worker error', error instanceof Error ? error.message : 'unknown');
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Временная ошибка сервиса. Повторите попытку.' } }, 500);
    }
  }
} satisfies ExportedHandler<Env>;
