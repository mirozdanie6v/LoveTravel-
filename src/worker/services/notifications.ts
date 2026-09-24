import type { Env } from '../db/repository';
import { HttpError } from './booking';

export type NotificationAudience = 'manager' | 'owner' | 'customer';

export const TELEGRAM_WELCOME_TEXT = [
  '👋 Подберём экскурсию во Вьетнаме?',
  '',
  'В каталоге можно посмотреть программы, цены и доступные даты.',
  '',
  'Нажмите кнопку ниже 👇',
].join('\n');

export const TELEGRAM_FALLBACK_TEXT = [
  'Я помогу выбрать экскурсию, посмотреть цены и доступные даты.',
  '',
  'Откройте каталог 👇',
].join('\n');

export async function queueNotification(
  env: Env,
  sessionId: string,
  audience: NotificationAudience,
  eventType: string,
  orderInternalId: string | null,
  payload: Record<string, unknown>,
) {
  await env.DB.prepare(`INSERT INTO notification_outbox
    (id,session_id,audience,event_type,order_id,payload_json,status,attempts)
    VALUES (?,?,?,?,?,?,'queued',0)`)
    .bind(crypto.randomUUID(), sessionId, audience, eventType, orderInternalId, JSON.stringify(payload))
    .run();
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolveChatId(env: Env, audience: NotificationAudience, payload: Record<string, unknown>) {
  if (audience === 'manager') return env.TELEGRAM_MANAGER_CHAT_ID?.trim() || null;
  if (audience === 'owner') return env.TELEGRAM_OWNER_CHAT_ID?.trim() || null;
  const candidate = typeof payload.telegramChatId === 'string' ? payload.telegramChatId.trim() : '';
  return candidate || null;
}

function notificationText(eventType: string, payload: Record<string, unknown>) {
  const displayId = String(payload.displayId ?? 'заказ');
  const tourTitle = String(payload.tourTitle ?? 'Экскурсия');
  const customer = String(payload.customer ?? 'Клиент');
  const amount = typeof payload.amountMinor === 'number' ? `$${(payload.amountMinor / 100).toFixed(2)}` : '';

  if (eventType === 'order_created') return `MAX TOUR · новый заказ ${displayId}\n${tourTitle}\nКлиент: ${customer}${amount ? `\nСумма: ${amount}` : ''}`;
  if (eventType === 'demo_payment_completed') return `MAX TOUR · DEMO-оплата ${displayId}\n${tourTitle}${amount ? `\nПолучено: ${amount}` : ''}`;
  if (eventType === 'order_status_changed') return `MAX TOUR · статус ${displayId}\n${String(payload.fromStatus ?? '')} → ${String(payload.toStatus ?? '')}`;
  return `MAX TOUR · ${eventType}\n${displayId}`;
}

export async function sendTelegramMessage(env: Env, chatId: string, text: string, withMiniAppButton = false) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new HttpError(503, 'Telegram bot token is not configured', 'TELEGRAM_NOT_CONFIGURED');

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  const miniAppUrl = env.TELEGRAM_MINIAPP_URL?.trim();
  if (withMiniAppButton && miniAppUrl) {
    body.reply_markup = {
      inline_keyboard: [[{ text: '🌴 Открыть каталог', web_app: { url: miniAppUrl } }]],
    };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Telegram sendMessage failed: ${response.status} ${detail.slice(0, 300)}`);
  }
}

export async function flushTelegramOutbox(env: Env, sessionId: string, limit = 20) {
  const tokenConfigured = Boolean(env.TELEGRAM_BOT_TOKEN?.trim());
  const result = await env.DB.prepare(`SELECT id,audience,event_type,order_id,payload_json
    FROM notification_outbox
    WHERE session_id=? AND status='queued'
    ORDER BY created_at ASC
    LIMIT ?`).bind(sessionId, Math.max(1, Math.min(100, limit))).all<any>();

  let sent = 0;
  let waitingForConfiguration = 0;
  let failed = 0;

  for (const row of result.results ?? []) {
    const audience = row.audience as NotificationAudience;
    const payload = parsePayload(row.payload_json ?? '{}');
    const chatId = resolveChatId(env, audience, payload);
    if (!tokenConfigured || !chatId) {
      waitingForConfiguration += 1;
      continue;
    }

    try {
      await sendTelegramMessage(env, chatId, notificationText(row.event_type, payload));
      await env.DB.prepare(`UPDATE notification_outbox SET status='sent',attempts=attempts+1,last_error=NULL,sent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND session_id=?`).bind(row.id,sessionId).run();
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown Telegram error';
      await env.DB.prepare(`UPDATE notification_outbox SET status='failed',attempts=attempts+1,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND session_id=?`).bind(message,row.id,sessionId).run();
      failed += 1;
    }
  }

  return { sent, waitingForConfiguration, failed, tokenConfigured };
}

export async function getIntegrationStatus(env: Env, sessionId: string) {
  const counts = await env.DB.prepare(`SELECT status,COUNT(*) AS count FROM notification_outbox WHERE session_id=? GROUP BY status`).bind(sessionId).all<{status:string;count:number}>();
  const byStatus: Record<string, number> = {};
  for (const row of counts.results ?? []) byStatus[row.status] = Number(row.count ?? 0);
  return {
    telegram: {
      botTokenConfigured: Boolean(env.TELEGRAM_BOT_TOKEN?.trim()),
      webhookSecretConfigured: Boolean(env.TELEGRAM_WEBHOOK_SECRET?.trim()),
      managerChatConfigured: Boolean(env.TELEGRAM_MANAGER_CHAT_ID?.trim()),
      ownerChatConfigured: Boolean(env.TELEGRAM_OWNER_CHAT_ID?.trim()),
      miniAppUrlConfigured: Boolean(env.TELEGRAM_MINIAPP_URL?.trim()),
    },
    outbox: {
      queued: byStatus.queued ?? 0,
      sent: byStatus.sent ?? 0,
      failed: byStatus.failed ?? 0,
      skipped: byStatus.skipped ?? 0,
    },
    readyForDelivery: Boolean(env.TELEGRAM_BOT_TOKEN?.trim() && (env.TELEGRAM_MANAGER_CHAT_ID?.trim() || env.TELEGRAM_OWNER_CHAT_ID?.trim())),
  };
}

export async function handleTelegramWebhook(env: Env, update: any) {
  const message = update?.message;
  const chatId = message?.chat?.id != null ? String(message.chat.id) : '';
  const text = String(message?.text ?? '').trim();
  if (!chatId) return { accepted: true, action: 'ignored' };

  const command = text.split(/\s+/, 1)[0]?.split('@', 1)[0]?.toLowerCase();
  if (command === '/start') {
    await sendTelegramMessage(env, chatId, TELEGRAM_WELCOME_TEXT, true);
    return { accepted: true, action: 'start_replied' };
  }

  if (text) {
    await sendTelegramMessage(env, chatId, TELEGRAM_FALLBACK_TEXT, true);
    return { accepted: true, action: 'text_replied' };
  }

  return { accepted: true, action: 'ignored' };
}
