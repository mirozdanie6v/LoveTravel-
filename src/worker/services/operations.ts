import type { Env } from '../db/repository';
import { getMergedTours, listOrders } from '../db/repository';
import { getAnalytics } from './analytics';
import { HttpError } from './booking';
import { listAudit, recordAudit } from './internal-workflows';

export interface ManagerOps {
  assignedManager: string;
  pickupNote: string;
  internalNote: string;
  lastContactAt: string | null;
  updatedAt: string | null;
}

function text(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

export async function getManagerOps(env: Env, sessionId: string, displayId: string): Promise<ManagerOps> {
  const order = await env.DB.prepare('SELECT id FROM orders WHERE session_id=? AND display_id=?').bind(sessionId, displayId).first<{id:string}>();
  if (!order) throw new HttpError(404, 'Заказ не найден', 'ORDER_NOT_FOUND');
  const row = await env.DB.prepare('SELECT assigned_manager,pickup_note,internal_note,last_contact_at,updated_at FROM demo_order_operations WHERE session_id=? AND order_id=?').bind(sessionId, order.id).first<any>();
  return {
    assignedManager: row?.assigned_manager ?? '',
    pickupNote: row?.pickup_note ?? '',
    internalNote: row?.internal_note ?? '',
    lastContactAt: row?.last_contact_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function patchManagerOps(env: Env, sessionId: string, displayId: string, input: any, actorId = 'demo'): Promise<ManagerOps> {
  const order = await env.DB.prepare('SELECT id FROM orders WHERE session_id=? AND display_id=?').bind(sessionId, displayId).first<{id:string}>();
  if (!order) throw new HttpError(404, 'Заказ не найден', 'ORDER_NOT_FOUND');
  const before = await getManagerOps(env, sessionId, displayId);
  const assignedManager = text(input?.assignedManager, 80);
  const pickupNote = text(input?.pickupNote, 180);
  const internalNote = text(input?.internalNote, 1200);
  const contacted = input?.markContacted === true;
  await env.DB.prepare(`INSERT INTO demo_order_operations(session_id,order_id,assigned_manager,pickup_note,internal_note,last_contact_at,updated_at)
    VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(session_id,order_id) DO UPDATE SET
      assigned_manager=excluded.assigned_manager,
      pickup_note=excluded.pickup_note,
      internal_note=excluded.internal_note,
      last_contact_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE demo_order_operations.last_contact_at END,
      updated_at=CURRENT_TIMESTAMP`).bind(
        sessionId, order.id, assignedManager, pickupNote, internalNote, contacted ? new Date().toISOString() : null, contacted ? 1 : 0
      ).run();
  const after = await getManagerOps(env, sessionId, displayId);
  await recordAudit(env, sessionId, 'manager', contacted ? 'Контакт с клиентом / обновление заказа' : 'Обновление операционных данных', 'order', displayId, before, after, actorId);
  return after;
}

async function getSlaQueue(env: Env, sessionId: string, managerSlaMinutes: number) {
  const rows = await env.DB.prepare(`SELECT o.display_id,o.tour_title,o.customer,o.source,o.created_at,
      ops.assigned_manager,ops.last_contact_at
    FROM orders o
    LEFT JOIN demo_order_operations ops ON ops.session_id=o.session_id AND ops.order_id=o.id
    WHERE o.session_id=? AND o.status='Новый'
    ORDER BY datetime(o.created_at) ASC`).bind(sessionId).all<any>();
  const now = Date.now();
  const queue = (rows.results ?? []).map((row:any) => {
    const createdMs = Date.parse(String(row.created_at ?? ''));
    const waitingMinutes = Number.isFinite(createdMs) ? Math.max(0, Math.floor((now - createdMs) / 60000)) : 0;
    const contacted = Boolean(row.last_contact_at);
    return {
      orderId: String(row.display_id),
      tourTitle: String(row.tour_title ?? ''),
      customer: String(row.customer ?? ''),
      source: String(row.source ?? ''),
      assignedManager: String(row.assigned_manager ?? ''),
      lastContactAt: row.last_contact_at ?? null,
      waitingMinutes,
      overdue: !contacted && waitingMinutes > managerSlaMinutes,
    };
  });
  return {
    managerSlaMinutes,
    newOrders: queue.length,
    overdueOrders: queue.filter(item => item.overdue).length,
    uncontactedOrders: queue.filter(item => !item.lastContactAt).length,
    oldestWaitingMinutes: queue.reduce((max,item)=>Math.max(max,item.waitingMinutes),0),
    queue: queue.slice(0,12),
  };
}

export async function getOwnerOverview(env: Env, sessionId: string) {
  const orders = await listOrders(env.DB, sessionId);
  const analytics = await getAnalytics(env, sessionId, new URLSearchParams());
  const tours = await getMergedTours(env.DB, sessionId);
  const selectSettings = 'SELECT manager_sla_minutes,manager_notifications,owner_digest,sales_focus,sales_target_minor,updated_at FROM demo_owner_settings WHERE session_id=?';
  const settingsRow = await env.DB.prepare(selectSettings).bind(sessionId).first<any>();
  if (!settingsRow) {
    await env.DB.prepare('INSERT OR IGNORE INTO demo_owner_settings(session_id) VALUES (?)').bind(sessionId).run();
  }
  const settings = settingsRow ?? await env.DB.prepare(selectSettings).bind(sessionId).first<any>();
  const managerSlaMinutes = Number(settings?.manager_sla_minutes ?? 15);
  const salesTargetMinor = Math.max(0, Number(settings?.sales_target_minor ?? 500000));
  const byStatus = ['Новый','Оплачено','Подтверждено'].map(status => ({ status, count: orders.filter(o => o.status === status).length }));
  const grossMinor = orders.reduce((sum, order) => sum + order.totalMinor, 0);
  const paidMinor = orders.reduce((sum, order) => sum + order.paidMinor, 0);
  const [audit,sla] = await Promise.all([listAudit(env, sessionId, 16), getSlaQueue(env,sessionId,managerSlaMinutes)]);
  return {
    demo: true,
    metrics: {
      orders: orders.length,
      grossMinor,
      paidMinor,
      outstandingMinor: Math.max(0, grossMinor - paidMinor),
      conversion: analytics.metrics.conversion,
      averageOrderMinor: analytics.metrics.averageOrderMinor,
      tours: tours.length,
      publishedTours: tours.filter(t => t.published).length,
      slaOverdueOrders: sla.overdueOrders,
      salesTargetMinor,
      targetProgressPercent: salesTargetMinor > 0 ? Math.min(999, Math.round((paidMinor / salesTargetMinor) * 1000) / 10) : 0,
    },
    statuses: byStatus,
    sources: analytics.sources,
    funnel: analytics.funnel,
    recentOrders: orders.slice(0, 6),
    audit,
    sla,
    settings: {
      managerSlaMinutes,
      managerNotifications: Boolean(settings?.manager_notifications ?? 1),
      ownerDigest: String(settings?.owner_digest ?? 'Ежедневно'),
      salesFocus: String(settings?.sales_focus ?? 'Премиум экскурсии'),
      salesTargetMinor,
      updatedAt: settings?.updated_at ?? null,
    },
    workflow: [
      { role: 'Турист', action: 'Выбирает тур, дату, участников и создаёт заказ' },
      { role: 'Менеджер', action: 'Получает заказ, ведёт клиента, уточняет детали, перенос/отмену/неявку и подтверждает' },
      { role: 'Администратор', action: 'Поддерживает каталог, цены, контент, расписание, акции и направления' },
      { role: 'Владелец', action: 'Контролирует показатели, SLA, план продаж, журнал действий и правила работы команды' },
    ],
  };
}

export async function patchOwnerSettings(env: Env, sessionId: string, input: any, actorId = 'demo') {
  const current = await getOwnerOverview(env, sessionId);
  const managerSlaMinutes = Math.min(120, Math.max(5, Number(input?.managerSlaMinutes ?? 15)));
  const managerNotifications = input?.managerNotifications === false ? 0 : 1;
  const allowedDigest = ['Отключено','Ежедневно','Еженедельно'];
  const ownerDigest = allowedDigest.includes(String(input?.ownerDigest)) ? String(input.ownerDigest) : 'Ежедневно';
  const salesFocus = text(input?.salesFocus, 120) || 'Премиум экскурсии';
  const salesTargetMinor = Math.min(100000000, Math.max(0, Math.round(Number(input?.salesTargetMinor ?? current.settings.salesTargetMinor ?? 500000))));
  await env.DB.prepare(`INSERT INTO demo_owner_settings(session_id,manager_sla_minutes,manager_notifications,owner_digest,sales_focus,sales_target_minor,updated_at)
    VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(session_id) DO UPDATE SET
      manager_sla_minutes=excluded.manager_sla_minutes,
      manager_notifications=excluded.manager_notifications,
      owner_digest=excluded.owner_digest,
      sales_focus=excluded.sales_focus,
      sales_target_minor=excluded.sales_target_minor,
      updated_at=CURRENT_TIMESTAMP`).bind(sessionId,managerSlaMinutes,managerNotifications,ownerDigest,salesFocus,salesTargetMinor).run();
  const after = { managerSlaMinutes, managerNotifications: Boolean(managerNotifications), ownerDigest, salesFocus, salesTargetMinor };
  await recordAudit(env, sessionId, 'owner', 'Изменение правил команды', 'settings', 'owner', current.settings, after, actorId);
  return getOwnerOverview(env, sessionId);
}
