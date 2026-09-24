import { describe, expect, it } from 'vitest';
import { validateTelegramInitData } from '../src/worker/services/telegram-auth';

const encoder = new TextEncoder();

async function hmac(key: BufferSource, data: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

async function signedInitData(botToken: string, authDate: number) {
  const values = new URLSearchParams();
  values.set('auth_date', String(authDate));
  values.set('query_id', 'AAE-demo-query');
  values.set('user', JSON.stringify({id:123456789,first_name:'Max',last_name:'Tour',username:'max_tour_staff'}));
  const checkString = [...values.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join('\n');
  const secret = await hmac(encoder.encode('WebAppData'), botToken);
  values.set('hash', hex(await hmac(secret, checkString)));
  return values.toString();
}

describe('Telegram Mini App initData validation',()=>{
  it('accepts correctly signed recent initData and extracts user identity', async()=>{
    const now = 2_000_000_000;
    const data = await signedInitData('123456:TEST_BOT_TOKEN', now - 30);
    const result = await validateTelegramInitData(data, '123456:TEST_BOT_TOKEN', now);
    expect(result.telegramUserId).toBe('123456789');
    expect(result.username).toBe('max_tour_staff');
  });

  it('rejects a modified payload', async()=>{
    const now = 2_000_000_000;
    const data = (await signedInitData('123456:TEST_BOT_TOKEN', now - 30)).replace('Max','Mallory');
    await expect(validateTelegramInitData(data, '123456:TEST_BOT_TOKEN', now)).rejects.toMatchObject({code:'TELEGRAM_INITDATA_INVALID'});
  });

  it('rejects stale initData even when signature is valid', async()=>{
    const now = 2_000_000_000;
    const data = await signedInitData('123456:TEST_BOT_TOKEN', now - 7200);
    await expect(validateTelegramInitData(data, '123456:TEST_BOT_TOKEN', now)).rejects.toMatchObject({code:'TELEGRAM_INITDATA_EXPIRED'});
  });
});
