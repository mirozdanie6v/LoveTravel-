import type { Env } from '../db/repository';
import { HttpError } from './booking';

export const TELEGRAM_BOT_DESCRIPTION = [
  '👋 Подберём экскурсию во Вьетнаме?',
  '',
  'В каталоге можно посмотреть программы, цены и доступные даты.',
  '',
  'Чтобы начать, нажмите кнопку START внизу 👇',
].join('\n');

function requireTelegramToken(env: Env) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new HttpError(503, 'Telegram bot token ещё не настроен', 'TELEGRAM_NOT_CONFIGURED');
  return token;
}

async function telegramApi(token: string, method: string, payload?: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: payload ? 'POST' : 'GET',
    headers: payload ? { 'content-type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data: any = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new HttpError(502, `Telegram API ${method} failed`, 'TELEGRAM_API_ERROR');
  }
  return data.result;
}

export async function configureTelegramWebhook(env: Env, origin: string) {
  const token = requireTelegramToken(env);
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) throw new HttpError(503, 'Telegram webhook secret ещё не настроен', 'TELEGRAM_WEBHOOK_SECRET_NOT_CONFIGURED');

  const webhookUrl = `${origin.replace(/\/$/, '')}/api/telegram/webhook`;
  const miniAppUrl = env.TELEGRAM_MINIAPP_URL?.trim() || `${origin.replace(/\/$/, '')}/`;
  await telegramApi(token, 'setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: false,
  });
  await telegramApi(token, 'setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: 'Открыть каталог',
      web_app: { url: miniAppUrl },
    },
  });
  await telegramApi(token, 'setMyDescription', {
    description: TELEGRAM_BOT_DESCRIPTION,
  });

  return {
    configured: true,
    webhookUrl,
    miniAppUrl,
    menuButtonConfigured: true,
    descriptionConfigured: true,
    botDescription: TELEGRAM_BOT_DESCRIPTION,
  };
}

export async function getTelegramWebhookInfo(env: Env) {
  const token = requireTelegramToken(env);
  const info: any = await telegramApi(token, 'getWebhookInfo');
  return {
    url: String(info?.url ?? ''),
    pendingUpdateCount: Number(info?.pending_update_count ?? 0),
    hasCustomCertificate: Boolean(info?.has_custom_certificate),
    lastErrorDate: info?.last_error_date ? Number(info.last_error_date) : null,
    lastErrorMessage: info?.last_error_message ? String(info.last_error_message) : null,
    maxConnections: info?.max_connections ? Number(info.max_connections) : null,
    allowedUpdates: Array.isArray(info?.allowed_updates) ? info.allowed_updates : [],
  };
}
