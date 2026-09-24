import type { Env } from '../db/repository';
import { HttpError } from './booking';
import { upsertRefundCase } from './refund-policy';

function text(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanObject(value: unknown) {
  try { return JSON.parse(JSON.stringify(value ?? {})); } catch { return {}; }
}

export async function recordAudit(env: Env, sessionId: string, actorRole: string, action: string, entityType: string, entityId: string, before: unknown = {}, after: unknown = {}, actorId = 'demo', metadata: Record<string, unknown> = {}) {
  await env.DB.prepare('INSERT INTO demo_audit_log(session_id,actor_role,actor_id,action,entity_type,entity_id,before_json,after_json,metadata_json) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(sessionId, text(actorRole, 40), text(actorId, 120), text(action, 80), text(entityType, 50), text(entityId, 120), JSON.stringify(cleanObject(before)), JSON.stringify(cleanObject(after)), JSON.stringify(cleanObject(metadata))).run();
}

export async function listAudit(env: Env, sessionId: string, limit = 30) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
  const rows = await env.DB.prepare('SELECT id,actor_role,actor_id,action,entity_type,entity_id,before_json,after_json,metadata_json,created_at FROM demo_audit_log WHERE session_id=? ORDER BY id DESC LIMIT ?')
    .bind(sessionId, safeLimit).all<any>();
  return (rows.results ?? []).map((row:any) => ({
    id: row.id,
    actorRole: row.actor_role,
    actorId: row.actor_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: JSON.parse(row.before_json || '{}'),
    after: JSON.parse(row.after_json || '{}'),
    metadata: JSON.parse(row.metadata_json || '{}'),
    createdAt: row.created_at,
  }));
}

async function resolveOrder(env: Env, sessionId: string, displayId: string) {
  const row = await env.DB.prepare('SELECT id,display_id,selected_date,status,total_minor,paid_minor,pricing_snapshot_json FROM orders WHERE session_id=? AND display_id=?').bind(sessionId, displayId).first<any>();
  if (!row) throw new HttpError(404, 'Заказ не найден', 'ORDER_NOT_FOUND');
  return row;
}

export async function getOrderWorkflow(env: Env, sessionId: string, displayId: string) {
  const order = await resolveOrder(env, sessionId, displayId);
  const row = await env.DB.prepare('SELECT operation_type,requested_date,reason,manager_note,workflow_status,updated_at FROM demo_order_workflows WHERE session_id=? AND order_id=?').bind(sessionId, order.id).first<any>();
  return {
    operationType: row?.operation_type ?? 'none',
    requestedDate: row?.requested_date ?? '',
    reason: row?.reason ?? '',
    managerNote: row?.manager_note ?? '',
    workflowStatus: row?.workflow_status ?? 'Нет запроса',
    updatedAt: row?.updated_at ?? null,
  };
}

export async function patchOrderWorkflow(env: Env, sessionId: string, displayId: string, input: any, actorId = 'demo') {
  const order = await resolveOrder(env, sessionId, displayId);
  const before = await getOrderWorkflow(env, sessionId, displayId);
  const operationType = ['none','reschedule','cancel','no_show'].includes(String(input?.operationType)) ? String(input.operationType) : 'none';
  const requestedDate = operationType === 'reschedule' && /^\d{4}-\d{2}-\d{2}$/.test(String(input?.requestedDate ?? '')) ? String(input.requestedDate) : null;
  if (operationType === 'reschedule' && !requestedDate) throw new HttpError(400, 'Для переноса выберите новую дату', 'VALIDATION_ERROR');
  const reason = text(input?.reason, 400);
  const managerNote = text(input?.managerNote, 800);
  const allowedStatuses = ['Нет запроса','Запрошено','Согласовано','Отклонено'];
  const workflowStatus = allowedStatuses.includes(String(input?.workflowStatus)) ? String(input.workflowStatus) : (operationType === 'none' ? 'Нет запроса' : 'Запрошено');
  await env.DB.prepare(`INSERT INTO demo_order_workflows(session_id,order_id,operation_type,requested_date,reason,manager_note,workflow_status,updated_at)
    VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(session_id,order_id) DO UPDATE SET operation_type=excluded.operation_type,requested_date=excluded.requested_date,reason=excluded.reason,manager_note=excluded.manager_note,workflow_status=excluded.workflow_status,updated_at=CURRENT_TIMESTAMP`)
    .bind(sessionId, order.id, operationType, requestedDate, reason, managerNote, workflowStatus).run();
  const after = await getOrderWorkflow(env, sessionId, displayId);
  let refundCase: any = null;
  if ((operationType === 'cancel' || operationType === 'no_show') && Number(order.paid_minor ?? 0) > 0) {
    refundCase = await upsertRefundCase(env, sessionId, order, operationType, reason);
  }
  await recordAudit(env, sessionId, 'manager', operationType === 'cancel' ? 'Запрос отмены' : operationType === 'reschedule' ? 'Запрос переноса' : operationType === 'no_show' ? 'Фиксация неявки' : 'Сброс операции', 'order', displayId, before, { ...after, refundCase }, actorId);
  return { ...after, refundCase };
}

export async function getCustomerRecord(env: Env, sessionId: string, customerKey: string) {
  const key = text(customerKey, 180).toLowerCase();
  if (!key) throw new HttpError(400, 'Не указан клиент', 'CUSTOMER_REQUIRED');
  const row = await env.DB.prepare('SELECT tags_json,manager_note,task_text,task_due,task_done,updated_at FROM demo_customer_records WHERE session_id=? AND customer_key=?').bind(sessionId, key).first<any>();
  return {
    customerKey: key,
    tags: row ? JSON.parse(row.tags_json || '[]') : [],
    managerNote: row?.manager_note ?? '',
    taskText: row?.task_text ?? '',
    taskDue: row?.task_due ?? '',
    taskDone: Boolean(row?.task_done ?? 0),
    updatedAt: row?.updated_at ?? null,
  };
}

export async function patchCustomerRecord(env: Env, sessionId: string, customerKey: string, input: any, actorId = 'demo') {
  const before = await getCustomerRecord(env, sessionId, customerKey);
  const tags = Array.isArray(input?.tags) ? input.tags.map((x:unknown)=>text(x,40)).filter(Boolean).slice(0,8) : before.tags;
  const managerNote = text(input?.managerNote, 1600);
  const taskText = text(input?.taskText, 300);
  const taskDue = /^\d{4}-\d{2}-\d{2}$/.test(String(input?.taskDue ?? '')) ? String(input.taskDue) : null;
  const taskDone = input?.taskDone === true ? 1 : 0;
  await env.DB.prepare(`INSERT INTO demo_customer_records(session_id,customer_key,tags_json,manager_note,task_text,task_due,task_done,updated_at)
    VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(session_id,customer_key) DO UPDATE SET tags_json=excluded.tags_json,manager_note=excluded.manager_note,task_text=excluded.task_text,task_due=excluded.task_due,task_done=excluded.task_done,updated_at=CURRENT_TIMESTAMP`)
    .bind(sessionId, before.customerKey, JSON.stringify(tags), managerNote, taskText, taskDue, taskDone).run();
  const after = await getCustomerRecord(env, sessionId, before.customerKey);
  await recordAudit(env, sessionId, 'manager', 'Обновление карточки клиента', 'customer', before.customerKey, before, after, actorId);
  return after;
}
