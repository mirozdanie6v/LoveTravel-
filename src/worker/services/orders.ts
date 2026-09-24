import type { BookingDraft, OrderStatus, Quote, Tour } from '../../shared/types';
import type { Env } from '../db/repository';
import { getOrder, listOrders } from '../db/repository';
import { HttpError } from './booking';
import { queueNotification, type NotificationAudience } from './notifications';
import { recordAudit } from './internal-workflows';

function participantSummary(draft: BookingDraft) {
  return `${draft.adults} взрослых${draft.children.length ? `, ${draft.children.length} ${draft.children.length === 1 ? 'ребёнок' : 'детей'}` : ''}`;
}

async function nextDisplayId(env: Env, sessionId: string) {
  const row = await env.DB.prepare("SELECT MAX(CAST(SUBSTR(display_id,9) AS INTEGER)) AS n FROM orders WHERE session_id=? AND display_id LIKE 'MT-DEMO-%'").bind(sessionId).first<{n:number|null}>();
  return `MT-DEMO-${Math.max(1047, Number(row?.n ?? 0)) + 1}`;
}

async function bestEffortNotify(
  env: Env,
  sessionId: string,
  audience: NotificationAudience,
  eventType: string,
  orderInternalId: string,
  payload: Record<string, unknown>,
) {
  try {
    await queueNotification(env, sessionId, audience, eventType, orderInternalId, payload);
  } catch (error) {
    console.error('notification_outbox_enqueue_failed', error instanceof Error ? error.message : 'unknown');
  }
}

export async function createOrder(env: Env, sessionId: string, draft: BookingDraft, tour: Tour, quote: Quote, idempotencyKey: string) {
  const existing = await env.DB.prepare('SELECT display_id FROM orders WHERE session_id=? AND idempotency_key=?').bind(sessionId,idempotencyKey).first<{display_id:string}>();
  if (existing) return getOrder(env.DB, sessionId, existing.display_id);

  const id = crypto.randomUUID();
  const displayId = await nextDisplayId(env, sessionId);
  const contact = [draft.contact.phone, draft.contact.telegram].filter(Boolean).join(' · ');
  const paymentState = 'Ожидает DEMO-оплату';
  const snapshot = JSON.stringify({
    quote,
    tourPricing: tour.pricingRules,
    tourPickup: tour.pickup ?? '',
    tourBack: tour.back ?? '',
    paymentChoice: draft.paymentChoice,
    children: draft.children,
    promo: tour.promo ?? null,
  });
  await env.DB.prepare(`INSERT INTO orders(id,display_id,session_id,idempotency_key,tour_id,tour_title,selected_date,participants_summary,pricing_snapshot_json,hotel,transfer_minor,total_minor,paid_minor,remaining_minor,payment_choice,payment_method,payment_state,status,source,customer,contact,participant_data_json,data_status,customer_visible)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).bind(
    id,displayId,sessionId,idempotencyKey,tour.id,tour.title,draft.date,participantSummary(draft),snapshot,draft.hotel,quote.transferMinor,quote.totalMinor,0,quote.totalMinor,draft.paymentChoice,draft.paymentMethod,paymentState,'Новый',draft.source,draft.contact.name,contact,JSON.stringify(draft.participants),'demoInput'
  ).run();

  const participantStatements = draft.participants.map((p, index) => {
    const childIndex = index - draft.adults;
    const child = childIndex >= 0 ? draft.children[childIndex] : undefined;
    const priceMinor = child ? quote.lines[draft.adults > 0 ? childIndex + 1 : childIndex]?.amountMinor ?? null : tour.pricingRules.adultMinor ?? tour.pricingRules.adultFromMinor ?? null;
    return env.DB.prepare('INSERT INTO order_participants(order_id,full_name,birth_date,passport,child_height,child_age,price_minor) VALUES (?,?,?,?,?,?,?)').bind(id,p.fullName,p.birthDate || null,p.passport ?? null,child?.height ?? null,child?.age ?? null,priceMinor);
  });
  if (participantStatements.length) await env.DB.batch(participantStatements);
  await env.DB.prepare('INSERT INTO analytics_events(session_id,event_type,source,tour_id,order_id,amount_minor,metadata_json,demo) VALUES (?,?,?,?,?,?,?,1)').bind(sessionId,'order_created',draft.source,tour.id,displayId,quote.totalMinor,JSON.stringify({ customerVisible: true })).run();
  await recordAudit(env, sessionId, 'tourist', 'Создание заказа', 'order', displayId, {}, { tour: tour.title, date: draft.date, totalMinor: quote.totalMinor, source: draft.source });

  const notificationPayload = { displayId, tourTitle: tour.title, customer: draft.contact.name, amountMinor: quote.totalMinor, selectedDate: draft.date };
  await bestEffortNotify(env, sessionId, 'manager', 'order_created', id, notificationPayload);
  await bestEffortNotify(env, sessionId, 'owner', 'order_created', id, notificationPayload);

  return getOrder(env.DB, sessionId, displayId);
}

export async function demoPayment(env: Env, sessionId: string, displayId: string, idempotencyKey: string) {
  const order = await getOrder(env.DB, sessionId, displayId);
  if (!order || Number(order.raw.customer_visible ?? 0) !== 1) throw new HttpError(404, 'Заказ не найден', 'ORDER_NOT_FOUND');
  const existing = await env.DB.prepare('SELECT id FROM payments WHERE session_id=? AND idempotency_key=?').bind(sessionId,idempotencyKey).first<{id:string}>();
  if (existing) return getOrder(env.DB, sessionId, displayId);

  const raw = order.raw;
  if (Number(raw.paid_minor ?? 0) > 0) return order;

  const snap = JSON.parse(raw.pricing_snapshot_json || '{}');
  const amountMinor = raw.payment_choice === 'full' ? raw.total_minor : Number(snap?.quote?.payNowMinor ?? Math.round(raw.total_minor * 0.3));
  const paymentId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO payments(id,session_id,order_id,idempotency_key,amount_minor,method,status,simulated) VALUES (?,?,?,?,?,?,?,1)').bind(paymentId,sessionId,raw.id,idempotencyKey,amountMinor,raw.payment_method,'completed_demo').run();
  const remaining = Math.max(0, raw.total_minor - amountMinor);
  const paymentState = raw.payment_choice === 'full' ? 'Полная оплата получена — DEMO' : 'Предоплата получена — DEMO';
  await env.DB.prepare("UPDATE orders SET paid_minor=?, remaining_minor=?, payment_state=?, status='Оплачено', updated_at=CURRENT_TIMESTAMP WHERE id=? AND session_id=?").bind(amountMinor,remaining,paymentState,raw.id,sessionId).run();
  await env.DB.prepare('INSERT INTO analytics_events(session_id,event_type,source,tour_id,order_id,amount_minor,metadata_json,demo) VALUES (?,?,?,?,?,?,?,1)').bind(sessionId,'demo_payment_completed',raw.source,raw.tour_id,displayId,amountMinor,'{}').run();
  await recordAudit(env, sessionId, 'tourist', 'DEMO-оплата', 'order', displayId, { paidMinor: 0 }, { paidMinor: amountMinor, remainingMinor: remaining, paymentState });

  const notificationPayload = { displayId, tourTitle: raw.tour_title, customer: raw.customer, amountMinor };
  await bestEffortNotify(env, sessionId, 'manager', 'demo_payment_completed', raw.id, notificationPayload);
  await bestEffortNotify(env, sessionId, 'owner', 'demo_payment_completed', raw.id, notificationPayload);

  return getOrder(env.DB, sessionId, displayId);
}

export async function updateOrderStatus(env: Env, sessionId: string, displayId: string, status: OrderStatus, actorId = 'demo') {
  const order = await getOrder(env.DB, sessionId, displayId);
  if (!order) throw new HttpError(404, 'Заказ не найден', 'ORDER_NOT_FOUND');
  if (order.status === status) return order;

  await env.DB.batch([
    env.DB.prepare('INSERT INTO manager_status_history(session_id,order_id,old_status,new_status) VALUES (?,?,?,?)').bind(sessionId,order.raw.id,order.status,status),
    env.DB.prepare('UPDATE orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND session_id=?').bind(status,order.raw.id,sessionId),
    env.DB.prepare('INSERT INTO analytics_events(session_id,event_type,source,tour_id,order_id,metadata_json,demo) VALUES (?,?,?,?,?,?,1)').bind(sessionId,'manager_status_changed',order.source,order.tourId,displayId,JSON.stringify({from:order.status,to:status}))
  ]);
  await recordAudit(env, sessionId, 'manager', 'Изменение статуса заказа', 'order', displayId, { status: order.status }, { status }, actorId);

  await bestEffortNotify(env, sessionId, 'owner', 'order_status_changed', order.raw.id, {
    displayId,
    tourTitle: order.tourTitle,
    fromStatus: order.status,
    toStatus: status,
  });

  return getOrder(env.DB, sessionId, displayId);
}

export { listOrders };
