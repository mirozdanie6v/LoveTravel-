import type { Env } from './repository';
import { cleanupExpiredDemoSessions } from '../services/maintenance';

const COOKIE = 'max_tour_demo_session';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function demoDate(offsetDays: number) {
  return new Date(Date.now() + VIETNAM_UTC_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

export function sessionCookie(id: string, secure = true): string {
  return `${COOKIE}=${encodeURIComponent(id)}; Path=/; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

async function seedDemoSession(env: Env, sessionId: string) {
  const availability = [
    ['dalat-premium',demoDate(1),'available','доступно'],['dalat-premium',demoDate(3),'low','мало мест'],['dalat-premium',demoDate(6),'request','по запросу'],['dalat-premium',demoDate(9),'available','доступно'],['dalat-premium',demoDate(13),'available','доступно'],
    ['phuyen',demoDate(2),'available','доступно'],['phuyen',demoDate(8),'low','мало мест'],
    ['dalat-vip',demoDate(4),'available','доступно'],['dalat-vip',demoDate(11),'available','доступно'],
    ['dalat-glass',demoDate(5),'low','мало мест'],['dalat-glass',demoDate(12),'available','доступно'],
    ['nha-day',demoDate(1),'available','доступно'],['nha-day',demoDate(7),'available','доступно'],
    ['nha-evening',demoDate(1),'request','по запросу'],['nha-evening',demoDate(10),'request','по запросу'],
    ['dalat-2d',demoDate(7),'request','по запросу'],['dalat-2d',demoDate(14),'available','доступно'],
    ['hanoi-halong',demoDate(9),'request','по запросу'],['hanoi-halong',demoDate(16),'request','по запросу']
  ];
  const stmts = availability.map(v => env.DB.prepare('INSERT OR REPLACE INTO demo_availability(session_id,tour_id,date,status,label) VALUES (?,?,?,?,?)').bind(sessionId,...v));
  await env.DB.batch(stmts);

  const samples = [
    { display:'MT-DEMO-1039', tour:'nha-day', title:'Дневная обзорная экскурсия по Нячангу', date:demoDate(1), total:7000, paid:2100, source:'Telegram', status:'Новый', customer:'Анна К. · DEMO', hotel:'Libra Nha Trang' },
    { display:'MT-DEMO-1040', tour:'phuyen', title:'Экскурсия в провинцию Фуйен', date:demoDate(2), total:8000, paid:8000, source:'Сайт', status:'Подтверждено', customer:'Сергей М. · DEMO', hotel:'Citadines Bayfront' },
    { display:'MT-DEMO-1041', tour:'dalat-vip', title:'Экскурсия в Далат «ВИП»', date:demoDate(4), total:11000, paid:3300, source:'Реклама', status:'Оплачено', customer:'Мария Л. · DEMO', hotel:'Amiana Resort' },
    { display:'MT-DEMO-1042', tour:'dalat-2d', title:'Экскурсия в Далат на 2 дня', date:demoDate(7), total:22000, paid:6600, source:'Telegram', status:'Оплачено', customer:'Дмитрий П. · DEMO', hotel:'Mia Resort' },
    { display:'MT-DEMO-1043', tour:'nha-evening', title:'Вечерняя обзорная экскурсия по Нячангу', date:demoDate(10), total:9600, paid:0, source:'Другие каналы', status:'Новый', customer:'Елена В. · DEMO', hotel:'InterContinental Nha Trang' }
  ] as const;
  for (const s of samples) {
    const internal = crypto.randomUUID();
    const paymentState = s.paid === 0 ? 'Ожидает DEMO-оплату' : s.paid === s.total ? 'Полная оплата получена — DEMO' : 'Предоплата получена — DEMO';
    await env.DB.prepare(`INSERT INTO orders(id,display_id,session_id,idempotency_key,tour_id,tour_title,selected_date,participants_summary,pricing_snapshot_json,hotel,transfer_minor,total_minor,paid_minor,remaining_minor,payment_choice,payment_method,payment_state,status,source,customer,contact,participant_data_json,data_status,customer_visible)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`).bind(
      internal,s.display,sessionId,`seed-${s.display}`,s.tour,s.title,s.date,'2 взрослых','{}',s.hotel,0,s.total,s.paid,s.total-s.paid,'deposit','card',paymentState,s.status,s.source,s.customer,'demo contact','[]','demoInput'
    ).run();
  }

  await env.DB.prepare('INSERT OR IGNORE INTO demo_owner_settings(session_id,manager_sla_minutes,manager_notifications,owner_digest,sales_focus) VALUES (?,15,1,?,?)').bind(sessionId,'Ежедневно','Премиум экскурсии').run();
  const opsSeed = [
    ['MT-DEMO-1039','Менеджер 1','Уточнить время сбора в отеле','Клиент ещё не подтвердил детали — DEMO'],
    ['MT-DEMO-1040','Менеджер 2','Лобби отеля','Полная оплата получена — передать гиду — DEMO'],
    ['MT-DEMO-1041','Менеджер 1','Amiana — отдельная зона трансфера','Проверить трансфер и даты рождения участников — DEMO']
  ];
  for (const [display,assigned,pickup,note] of opsSeed) {
    const row=await env.DB.prepare('SELECT id FROM orders WHERE session_id=? AND display_id=?').bind(sessionId,display).first<{id:string}>();
    if(row) await env.DB.prepare('INSERT OR REPLACE INTO demo_order_operations(session_id,order_id,assigned_manager,pickup_note,internal_note) VALUES (?,?,?,?,?)').bind(sessionId,row.id,assigned,pickup,note).run();
  }

  await env.DB.batch([
    env.DB.prepare('INSERT INTO demo_audit_log(session_id,actor_role,action,entity_type,entity_id,after_json) VALUES (?,?,?,?,?,?)').bind(sessionId,'manager','Назначен ответственный','order','MT-DEMO-1039','{"assignedManager":"Менеджер 1","demo":true}'),
    env.DB.prepare('INSERT INTO demo_audit_log(session_id,actor_role,action,entity_type,entity_id,after_json) VALUES (?,?,?,?,?,?)').bind(sessionId,'admin','Проверено расписание','availability','dalat-premium','{"demo":true}'),
    env.DB.prepare('INSERT INTO demo_audit_log(session_id,actor_role,action,entity_type,entity_id,after_json) VALUES (?,?,?,?,?,?)').bind(sessionId,'owner','Установлены правила команды','settings','owner','{"managerSlaMinutes":15,"demo":true}')
  ]);

  const events: Array<[string,string,string|null,string|null,number|null]> = [
    ['view_tour','Telegram','dalat-premium',null,null],['view_tour','Telegram','dalat-premium',null,null],['view_tour','Telegram','dalat-premium',null,null],['view_tour','Telegram','dalat-premium',null,null],['start_booking','Telegram','dalat-premium',null,null],['start_booking','Telegram','dalat-premium',null,null],
    ['view_tour','Сайт','phuyen',null,null],['view_tour','Сайт','phuyen',null,null],['view_tour','Сайт','phuyen',null,null],['start_booking','Сайт','phuyen',null,null],
    ['view_tour','Реклама','dalat-vip',null,null],['view_tour','Реклама','dalat-vip',null,null],['view_tour','Реклама','dalat-vip',null,null],['start_booking','Реклама','dalat-vip',null,null],['start_booking','Реклама','dalat-vip',null,null],
    ['view_tour','Telegram','dalat-2d',null,null],['view_tour','Telegram','dalat-2d',null,null],['view_tour','Telegram','dalat-2d',null,null],['start_booking','Telegram','dalat-2d',null,null],
    ['view_tour','Другие каналы','nha-evening',null,null],['view_tour','Другие каналы','nha-evening',null,null],['start_booking','Другие каналы','nha-evening',null,null],
    ['order_created','Telegram','nha-day','MT-DEMO-1039',7000],['demo_payment_completed','Telegram','nha-day','MT-DEMO-1039',2100],
    ['order_created','Сайт','phuyen','MT-DEMO-1040',8000],['demo_payment_completed','Сайт','phuyen','MT-DEMO-1040',8000],
    ['order_created','Реклама','dalat-vip','MT-DEMO-1041',11000],['demo_payment_completed','Реклама','dalat-vip','MT-DEMO-1041',3300],
    ['order_created','Telegram','dalat-2d','MT-DEMO-1042',22000],['demo_payment_completed','Telegram','dalat-2d','MT-DEMO-1042',6600],
    ['order_created','Другие каналы','nha-evening','MT-DEMO-1043',9600]
  ];
  await env.DB.batch(events.map(e => env.DB.prepare('INSERT INTO analytics_events(session_id,event_type,source,tour_id,order_id,amount_minor,metadata_json,demo) VALUES (?,?,?,?,?,?,?,1)').bind(sessionId,...e,'{"seed":"DEMO ANALYTICS"}')));
}

export async function ensureSession(request: Request, env: Env): Promise<{ id: string; setCookie?: string }> {
  const candidate = getCookie(request, COOKIE);
  const nextExpiry = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  if (candidate && /^[0-9a-f-]{36}$/i.test(candidate)) {
    const exists = await env.DB.prepare('SELECT id,expires_at FROM demo_sessions WHERE id=?').bind(candidate).first<{id:string;expires_at:string|null}>();
    const expiresAt = exists?.expires_at ? Date.parse(exists.expires_at) : Number.POSITIVE_INFINITY;
    if (exists && expiresAt > Date.now()) {
      await env.DB.prepare('UPDATE demo_sessions SET last_seen_at=CURRENT_TIMESTAMP,expires_at=? WHERE id=?').bind(nextExpiry,candidate).run();
      return { id: candidate, setCookie: sessionCookie(candidate, new URL(request.url).protocol === 'https:') };
    }
    if (exists) await env.DB.prepare('DELETE FROM demo_sessions WHERE id=?').bind(candidate).run();
  }

  await cleanupExpiredDemoSessions(env);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO demo_sessions(id,expires_at) VALUES (?,?)').bind(id,nextExpiry).run();
  await seedDemoSession(env, id);
  return { id, setCookie: sessionCookie(id, new URL(request.url).protocol === 'https:') };
}

export async function resetSession(env: Env, sessionId: string) {
  // Delete child tables before their parents. All names are fixed constants, never user-controlled.
  const tables = [
    'demo_broadcast_recipients',
    'demo_broadcast_campaigns',
    'demo_site_sync_outbox',
    'demo_refund_cases',
    'demo_group_members',
    'demo_group_departures',
    'demo_tour_overrides',
    'demo_user_created_tours',
    'demo_availability',
    'demo_promotions',
    'demo_directions',
    'notification_outbox',
    'demo_order_workflows',
    'demo_customer_records',
    'demo_audit_log',
    'demo_order_operations',
    'demo_owner_settings',
    'manager_status_history',
    'payments',
    'order_participants',
    'orders',
    'analytics_events',
  ];
  for (const table of tables) {
    const predicate = table === 'order_participants'
      ? 'order_id IN (SELECT id FROM orders WHERE session_id=?)'
      : 'session_id=?';
    await env.DB.prepare(`DELETE FROM ${table} WHERE ${predicate}`).bind(sessionId).run();
  }
  await seedDemoSession(env, sessionId);
}
