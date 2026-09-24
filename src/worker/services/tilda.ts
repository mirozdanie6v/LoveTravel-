import type { Env } from '../db/repository';
import { HttpError } from './booking';

type TildaPayload = Record<string, string | string[]>;

function appendValue(target: TildaPayload, key: string, value: string) {
  const existing = target[key];
  if (existing === undefined) {
    target[key] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    target[key] = [existing, value];
  }
}

function firstValue(payload: TildaPayload, names: string[]) {
  const wanted = new Set(names.map(name => name.toLowerCase()));
  for (const [key, raw] of Object.entries(payload)) {
    if (!wanted.has(key.toLowerCase())) continue;
    return Array.isArray(raw) ? raw[0] ?? '' : raw;
  }
  return '';
}

async function stablePayloadId(payload: TildaPayload) {
  const canonical = JSON.stringify(
    Object.entries(payload)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value]),
  );
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function authorizeTildaWebhook(request: Request, env: Env) {
  const expected = env.TILDA_WEBHOOK_SECRET?.trim();
  if (!expected) {
    throw new HttpError(503, 'Tilda webhook secret ещё не настроен', 'TILDA_NOT_CONFIGURED');
  }
  const url = new URL(request.url);
  const supplied = url.searchParams.get('key')?.trim() ?? '';
  if (!supplied || supplied !== expected) {
    throw new HttpError(401, 'Неверный Tilda webhook secret', 'TILDA_WEBHOOK_UNAUTHORIZED');
  }
}

export async function receiveTildaWebhook(request: Request, env: Env) {
  authorizeTildaWebhook(request, env);

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/x-www-form-urlencoded') && !contentType.includes('multipart/form-data')) {
    throw new HttpError(415, 'Tilda webhook ожидает form POST', 'TILDA_UNSUPPORTED_MEDIA_TYPE');
  }

  const form = await request.formData();
  const payload: TildaPayload = {};
  for (const [key, raw] of form.entries()) {
    const value = typeof raw === 'string' ? raw : `[file:${raw.name}:${raw.size}]`;
    appendValue(payload, key, value);
  }

  const tranidFromTilda = firstValue(payload, ['tranid']);
  const formid = firstValue(payload, ['formid']) || null;
  const syntheticKey = await stablePayloadId(payload);
  const tranid = tranidFromTilda || `synthetic:${formid ?? 'unknown'}:${syntheticKey}`;
  const referer = request.headers.get('referer') || firstValue(payload, ['referer', 'url']) || null;
  const name = firstValue(payload, ['name', 'fullname', 'full_name']) || null;
  const phone = firstValue(payload, ['phone', 'tel', 'telephone']) || null;
  const email = firstValue(payload, ['email', 'mail']) || null;
  const comments = firstValue(payload, ['comments', 'comment', 'message']) || null;
  const id = crypto.randomUUID();

  await env.DB.prepare(`INSERT INTO tilda_webhook_inbox
    (id,tranid,formid,referer,name,phone,email,comments,payload_json,status)
    VALUES (?,?,?,?,?,?,?,?,?,'received')
    ON CONFLICT(tranid) DO UPDATE SET
      formid=excluded.formid,
      referer=excluded.referer,
      name=COALESCE(excluded.name,tilda_webhook_inbox.name),
      phone=COALESCE(excluded.phone,tilda_webhook_inbox.phone),
      email=COALESCE(excluded.email,tilda_webhook_inbox.email),
      comments=COALESCE(excluded.comments,tilda_webhook_inbox.comments),
      payload_json=excluded.payload_json,
      updated_at=CURRENT_TIMESTAMP`)
    .bind(id,tranid,formid,referer,name,phone,email,comments,JSON.stringify(payload))
    .run();

  return { accepted: true, tranid, formid, duplicateSafe: true };
}

export async function getTildaIntegrationStatus(env: Env) {
  const result = await env.DB.prepare(`SELECT status,COUNT(*) AS count
    FROM tilda_webhook_inbox GROUP BY status`).all<{status:string;count:number}>();
  const counts: Record<string, number> = {};
  for (const row of result.results ?? []) counts[row.status] = Number(row.count ?? 0);

  return {
    configured: Boolean(env.TILDA_WEBHOOK_SECRET?.trim()),
    endpoint: 'https://max-tour.viiversion.com/api/tilda/webhook?key=<TILDA_WEBHOOK_SECRET>',
    inbox: {
      received: counts.received ?? 0,
      mapped: counts.mapped ?? 0,
      ignored: counts.ignored ?? 0,
      failed: counts.failed ?? 0,
    },
    mappingReady: false,
    note: 'Webhook transport is ready. Exact Tilda form-to-order mapping remains disabled until MAX TOUR confirms form fields/hidden tour identifiers.',
  };
}
