import type { Env } from '../db/repository';
import { HttpError } from './booking';
import { recordAudit } from './internal-workflows';

export type StaffRole = 'manager' | 'admin' | 'owner';

export interface TelegramIdentity {
  telegramUserId: string;
  firstName: string;
  lastName: string;
  username: string;
  authDate: number;
  role: StaffRole | null;
  staffDisplayName: string;
}

export interface StaffAccount {
  telegramUserId: string;
  role: StaffRole;
  displayName: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const MAX_AUTH_AGE_SECONDS = 60 * 60;
const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2,'0')).join('');
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length || a.length % 2 !== 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(key: BufferSource, data: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

function bootstrapOwnerId(env: Env) {
  return String((env as any).BOOTSTRAP_OWNER_TELEGRAM_ID ?? '').trim();
}

function bootstrapOwnerName(env: Env) {
  return String((env as any).BOOTSTRAP_OWNER_NAME ?? '').trim().slice(0,120);
}

export async function validateTelegramInitData(initData: string, botToken: string, nowSeconds = Math.floor(Date.now()/1000)) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash')?.toLowerCase() ?? '';
  if (!/^[0-9a-f]{64}$/.test(receivedHash)) throw new HttpError(401,'Telegram initData не содержит корректную подпись','TELEGRAM_INITDATA_INVALID');

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!Number.isInteger(authDate) || authDate <= 0) throw new HttpError(401,'Telegram auth_date отсутствует','TELEGRAM_INITDATA_INVALID');
  if (authDate > nowSeconds + 60 || nowSeconds - authDate > MAX_AUTH_AGE_SECONDS) throw new HttpError(401,'Telegram initData устарел','TELEGRAM_INITDATA_EXPIRED');

  const checkString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([key,value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = await hmac(encoder.encode('WebAppData'), botToken);
  const calculatedHash = hex(await hmac(secretKey, checkString));
  if (!timingSafeEqualHex(calculatedHash, receivedHash)) throw new HttpError(401,'Подпись Telegram initData не прошла проверку','TELEGRAM_INITDATA_INVALID');

  let user: any = null;
  try { user = JSON.parse(params.get('user') ?? 'null'); } catch { /* handled below */ }
  const telegramUserId = String(user?.id ?? '');
  if (!/^\d+$/.test(telegramUserId)) throw new HttpError(401,'Telegram user отсутствует','TELEGRAM_USER_INVALID');
  return {
    telegramUserId,
    firstName: String(user?.first_name ?? '').slice(0,100),
    lastName: String(user?.last_name ?? '').slice(0,100),
    username: String(user?.username ?? '').slice(0,100),
    authDate,
  };
}

async function maybeBootstrapFirstOwner(env: Env, identity: {telegramUserId:string;firstName:string;lastName:string;username:string}) {
  const configuredId = bootstrapOwnerId(env);
  if (!configuredId || configuredId !== identity.telegramUserId) return false;
  const counts = await env.DB.prepare('SELECT COUNT(*) AS total FROM staff_accounts').first<{total:number}>();
  if (Number(counts?.total ?? 0) !== 0) return false;
  const fallbackName = [identity.firstName, identity.lastName].filter(Boolean).join(' ') || identity.username || `Telegram ${identity.telegramUserId}`;
  const displayName = bootstrapOwnerName(env) || fallbackName.slice(0,120);
  await env.DB.prepare(`INSERT OR IGNORE INTO staff_accounts(telegram_user_id,role,display_name,active,updated_at)
    VALUES (?,'owner',?,1,CURRENT_TIMESTAMP)`).bind(identity.telegramUserId, displayName).run();
  return true;
}

export async function authenticateTelegramStaff(env: Env, initData: string): Promise<TelegramIdentity> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new HttpError(503,'Telegram Bot Token ещё не настроен','TELEGRAM_NOT_CONFIGURED');
  const identity = await validateTelegramInitData(initData, token);
  await maybeBootstrapFirstOwner(env, identity);
  const staff = await env.DB.prepare('SELECT role,display_name,active FROM staff_accounts WHERE telegram_user_id=?').bind(identity.telegramUserId).first<{role:StaffRole;display_name:string;active:number}>();
  return {
    ...identity,
    role: staff && Number(staff.active) === 1 ? staff.role : null,
    staffDisplayName: staff?.display_name ?? '',
  };
}

const roleAccess: Record<StaffRole, StaffRole[]> = {
  manager: ['manager','admin','owner'],
  admin: ['admin','owner'],
  owner: ['owner'],
};

export function telegramInitDataFromRequest(request: Request) {
  return request.headers.get('X-Telegram-Init-Data')?.trim() ?? '';
}

export async function requireStaffRole(env: Env, request: Request, requiredRole: StaffRole) {
  if ((env.AUTH_MODE ?? 'demo') !== 'telegram') return { mode:'demo' as const, role:requiredRole, telegramUserId:'demo', staffDisplayName:'DEMO' };
  const initData = telegramInitDataFromRequest(request);
  if (!initData) throw new HttpError(401,'Откройте служебный интерфейс через Telegram','TELEGRAM_AUTH_REQUIRED');
  const identity = await authenticateTelegramStaff(env, initData);
  if (!identity.role || !roleAccess[requiredRole].includes(identity.role)) throw new HttpError(403,'Недостаточно прав для этого раздела','FORBIDDEN');
  return { mode:'telegram' as const, ...identity };
}

function mapStaff(row: any): StaffAccount {
  return {
    telegramUserId: String(row.telegram_user_id),
    role: row.role as StaffRole,
    displayName: String(row.display_name ?? ''),
    active: Number(row.active) === 1,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export async function listStaffAccounts(env: Env) {
  if ((env.AUTH_MODE ?? 'demo') !== 'telegram') {
    return { mode:'demo' as const, items:[] as StaffAccount[], managementEnabled:false };
  }
  const rows = await env.DB.prepare('SELECT telegram_user_id,role,display_name,active,created_at,updated_at FROM staff_accounts ORDER BY CASE role WHEN \'owner\' THEN 1 WHEN \'admin\' THEN 2 ELSE 3 END, display_name, telegram_user_id').all<any>();
  return { mode:'telegram' as const, items:(rows.results ?? []).map(mapStaff), managementEnabled:true };
}

export async function listAssignableStaff(env: Env) {
  if ((env.AUTH_MODE ?? 'demo') !== 'telegram') {
    return {
      mode:'demo' as const,
      items:[
        { telegramUserId:'demo-manager-1', role:'manager' as const, displayName:'Менеджер 1', active:true },
        { telegramUserId:'demo-manager-2', role:'manager' as const, displayName:'Менеджер 2', active:true },
        { telegramUserId:'demo-manager-3', role:'manager' as const, displayName:'Менеджер 3', active:true },
      ],
    };
  }
  const rows = await env.DB.prepare("SELECT telegram_user_id,role,display_name,active,created_at,updated_at FROM staff_accounts WHERE active=1 ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, display_name").all<any>();
  return { mode:'telegram' as const, items:(rows.results ?? []).map(mapStaff) };
}

export async function upsertStaffAccount(env: Env, sessionId: string, input: any, actorId: string) {
  if ((env.AUTH_MODE ?? 'demo') !== 'telegram') throw new HttpError(409,'Управление сотрудниками включается вместе с Telegram авторизацией','STAFF_MANAGEMENT_REQUIRES_TELEGRAM_MODE');
  const telegramUserId = String(input?.telegramUserId ?? '').trim();
  const role = String(input?.role ?? '') as StaffRole;
  const displayName = String(input?.displayName ?? '').trim().slice(0,120);
  const active = input?.active !== false;
  if (!/^\d+$/.test(telegramUserId)) throw new HttpError(400,'Нужен корректный Telegram user ID','VALIDATION_ERROR');
  if (!['manager','admin','owner'].includes(role)) throw new HttpError(400,'Некорректная роль сотрудника','VALIDATION_ERROR');
  if (displayName.length < 2) throw new HttpError(400,'Укажите имя сотрудника','VALIDATION_ERROR');

  const beforeRow = await env.DB.prepare('SELECT telegram_user_id,role,display_name,active,created_at,updated_at FROM staff_accounts WHERE telegram_user_id=?').bind(telegramUserId).first<any>();
  const before = beforeRow ? mapStaff(beforeRow) : null;
  if (before?.role === 'owner' && before.active && (role !== 'owner' || !active)) {
    const owners = await env.DB.prepare("SELECT COUNT(*) AS n FROM staff_accounts WHERE role='owner' AND active=1 AND telegram_user_id<>?").bind(telegramUserId).first<{n:number}>();
    if (Number(owners?.n ?? 0) < 1) throw new HttpError(409,'В системе должен оставаться хотя бы один активный владелец','LAST_ACTIVE_OWNER_REQUIRED');
  }

  await env.DB.prepare(`INSERT INTO staff_accounts(telegram_user_id,role,display_name,active,updated_at)
    VALUES (?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_user_id) DO UPDATE SET role=excluded.role,display_name=excluded.display_name,active=excluded.active,updated_at=CURRENT_TIMESTAMP`)
    .bind(telegramUserId, role, displayName, active ? 1 : 0).run();
  const afterRow = await env.DB.prepare('SELECT telegram_user_id,role,display_name,active,created_at,updated_at FROM staff_accounts WHERE telegram_user_id=?').bind(telegramUserId).first<any>();
  const after = mapStaff(afterRow);
  await recordAudit(env, sessionId, 'owner', before ? 'Изменение сотрудника' : 'Добавление сотрудника', 'staff_account', telegramUserId, before ?? {}, after, actorId);
  return after;
}

export async function getAuthReadiness(env: Env) {
  const counts = await env.DB.prepare(`SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active,
    SUM(CASE WHEN active=1 AND role='owner' THEN 1 ELSE 0 END) AS owners
    FROM staff_accounts`).first<{total:number;active:number;owners:number}>();
  const bootstrapConfigured = /^\d+$/.test(bootstrapOwnerId(env));
  const active = Number(counts?.active ?? 0);
  const owners = Number(counts?.owners ?? 0);
  return {
    authMode: env.AUTH_MODE ?? 'demo',
    botTokenConfigured: Boolean(env.TELEGRAM_BOT_TOKEN?.trim()),
    initDataValidationPrepared: true,
    bootstrapOwnerConfigured: bootstrapConfigured,
    staffAccounts: Number(counts?.total ?? 0),
    activeStaffAccounts: active,
    activeOwners: owners,
    enforcementReady: Boolean(env.TELEGRAM_BOT_TOKEN?.trim()) && (active > 0 || bootstrapConfigured),
  };
}
