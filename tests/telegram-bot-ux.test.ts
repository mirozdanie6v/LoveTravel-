import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/worker/db/repository';
import {
  handleTelegramWebhook,
  TELEGRAM_FALLBACK_TEXT,
  TELEGRAM_WELCOME_TEXT,
} from '../src/worker/services/notifications';
import {
  configureTelegramWebhook,
  TELEGRAM_BOT_DESCRIPTION,
} from '../src/worker/services/telegram-config';

const env = {
  TELEGRAM_BOT_TOKEN: '123456:TEST_BOT_TOKEN',
  TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
  TELEGRAM_MINIAPP_URL: 'https://max-tour-demo.viiversion.com',
} as Env;

function telegramSuccess() {
  return new Response(JSON.stringify({ ok: true, result: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function sentPayload(fetchMock: ReturnType<typeof vi.spyOn>, call = 0) {
  const options = fetchMock.mock.calls[call]?.[1] as RequestInit;
  return JSON.parse(String(options.body));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Telegram bot catalogue entry UX', () => {
  it('answers /start with clear guidance and a real Mini App button', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => telegramSuccess());

    const result = await handleTelegramWebhook(env, {
      message: { chat: { id: 101 }, text: '/start campaign' },
    });

    expect(result).toEqual({ accepted: true, action: 'start_replied' });
    const payload = sentPayload(fetchMock);
    expect(payload.text).toBe(TELEGRAM_WELCOME_TEXT);
    expect(payload.reply_markup.inline_keyboard).toEqual([[
      {
        text: '🌴 Открыть каталог',
        web_app: { url: 'https://max-tour-demo.viiversion.com' },
      },
    ]]);
  });

  it('answers any ordinary text with a concise explanation and the same button', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => telegramSuccess());

    const result = await handleTelegramWebhook(env, {
      message: { chat: { id: 202 }, text: 'Что ты умеешь?' },
    });

    expect(result).toEqual({ accepted: true, action: 'text_replied' });
    const payload = sentPayload(fetchMock);
    expect(payload.text).toBe(TELEGRAM_FALLBACK_TEXT);
    expect(payload.reply_markup.inline_keyboard[0][0].text).toBe('🌴 Открыть каталог');
  });

  it('does not reply to non-message updates or service messages without text', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => telegramSuccess());

    await expect(handleTelegramWebhook(env, { callback_query: { id: '1' } }))
      .resolves.toEqual({ accepted: true, action: 'ignored' });
    await expect(handleTelegramWebhook(env, { message: { chat: { id: 303 }, photo: [{}] } }))
      .resolves.toEqual({ accepted: true, action: 'ignored' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('configures the bottom menu and pre-start bot description', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => telegramSuccess());

    const result = await configureTelegramWebhook(env, 'https://max-tour.viiversion.com');

    expect(result.menuButtonConfigured).toBe(true);
    expect(result.descriptionConfigured).toBe(true);
    expect(result.botDescription).toBe(TELEGRAM_BOT_DESCRIPTION);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/setChatMenuButton');
    expect(sentPayload(fetchMock, 1)).toEqual({
      menu_button: {
        type: 'web_app',
        text: 'Открыть каталог',
        web_app: { url: 'https://max-tour-demo.viiversion.com' },
      },
    });
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/setMyDescription');
    expect(sentPayload(fetchMock, 2)).toEqual({
      description: TELEGRAM_BOT_DESCRIPTION,
    });
  });
});
