const encoder = new TextEncoder();

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers || {}) },
});

const bad = (error, status = 400) => json({ ok: false, error }, { status });
const nowIso = () => new Date().toISOString();
const addHours = hours => new Date(Date.now() + hours * 3600000).toISOString();

function parseCookie(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim()).filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return i < 0 ? [part, ''] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const clean = String(hex || '');
  if (!/^[a-f0-9]+$/i.test(clean) || clean.length % 2) return new Uint8Array();
  return new Uint8Array(clean.match(/../g).map(v => Number.parseInt(v, 16)));
}

function randomHex(size = 32) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(size)));
}

async function sha256Hex(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))));
}

async function passwordHash(password, saltHex, iterations = 210000) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations,
  }, key, 256);
  return bytesToHex(bits);
}

function timingSafeEqual(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) mismatch |= (left[i % (left.length || 1)] || 0) ^ (right[i % (right.length || 1)] || 0);
  return mismatch === 0;
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

const permissions = {
  manager: new Set(['read', 'booking.write', 'customer.write', 'message.write', 'consultation.write']),
  admin: new Set(['read', 'booking.write', 'customer.write', 'message.write', 'consultation.write', 'tour.write', 'notification.write', 'broadcast.write', 'departure.write', 'task.write']),
  owner: new Set(['read', 'booking.write', 'customer.write', 'message.write', 'consultation.write', 'tour.write', 'notification.write', 'broadcast.write', 'departure.write', 'user.write', 'task.write']),
};

const PUBLIC_DEMO_USER = {
  id: 'demo-public-admin',
  email: 'demo@maxtour.local',
  displayName: 'Демо-администратор',
  role: 'admin',
};

function publicDemoEnabled(env) {
  return String(env.PUBLIC_ADMIN_DEMO || '').toLowerCase() === 'true';
}

async function ensurePublicDemoUser(env) {
  // This account is a technical actor for the public demo only. It lets
  // mutations keep their foreign-key/audit trail without exposing login UI.
  await env.DB.prepare(`INSERT OR IGNORE INTO admin_users
    (id,email,display_name,password_salt,password_hash,password_iterations,role)
    VALUES(?,?,?,?,?,?,?)`)
    .bind(PUBLIC_DEMO_USER.id, PUBLIC_DEMO_USER.email, PUBLIC_DEMO_USER.displayName,
      '00000000000000000000000000000000', '0000000000000000000000000000000000000000000000000000000000000000', 1, 'admin')
    .run();
}

function can(role, permission) {
  return permissions[role]?.has(permission) || false;
}

function sessionCookie(token, maxAge = 28800) {
  return `mt_admin_session=${encodeURIComponent(token)}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function getAuth(request, env) {
  if (publicDemoEnabled(env)) {
    await ensurePublicDemoUser(env);
    return { tokenHash: 'public-demo', csrf: 'public-demo', user: PUBLIC_DEMO_USER };
  }
  const token = parseCookie(request.headers.get('cookie') || '').mt_admin_session;
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`SELECT s.token_hash,s.csrf_token,s.expires_at,u.id,u.email,u.display_name,u.role,u.active
    FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
    WHERE s.token_hash=? AND datetime(s.expires_at)>CURRENT_TIMESTAMP AND u.active=1`).bind(tokenHash).first();
  if (!row) return null;
  await env.DB.prepare('UPDATE admin_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=?').bind(tokenHash).run();
  return { tokenHash, csrf: row.csrf_token, user: { id: row.id, email: row.email, displayName: row.display_name, role: row.role } };
}

async function requireAuth(request, env, permission = 'read') {
  const auth = await getAuth(request, env);
  if (!auth) return { response: bad('unauthorized', 401) };
  if (!can(auth.user.role, permission)) return { response: bad('forbidden', 403) };
  if (!['GET', 'HEAD'].includes(request.method) && !timingSafeEqual(request.headers.get('x-csrf-token') || '', auth.csrf)) {
    return { response: bad('csrf_invalid', 403) };
  }
  return { auth };
}

async function audit(env, userId, action, entityType, entityId, payload = {}) {
  await env.DB.prepare(`INSERT INTO admin_audit_log(user_id,action,entity_type,entity_id,payload_json)
    VALUES(?,?,?,?,?)`).bind(userId, action, entityType, String(entityId), JSON.stringify(payload)).run();
}

function numberFromMoney(value, rate = 100) {
  const raw = String(value ?? '').replace(/\s/g, '').replace(',', '.');
  const amount = Number.parseFloat(raw.replace(/[^0-9.-]/g, '')) || 0;
  return raw.includes('$') ? Math.round(amount * rate) : Math.round(amount);
}

function bookingMoneyFromRubles(value, existing, rate = 100) {
  if (value == null || value === '') return String(existing ?? '');
  const rubles = Math.max(0, Number(value) || 0);
  if (String(existing || '').includes('$')) {
    const dollars = rubles / rate;
    return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
  }
  if (String(existing || '').includes('₽')) return `${Math.round(rubles)} ₽`;
  return String(Math.round(rubles));
}

function peopleCount(value, travelers = []) {
  if (Array.isArray(travelers) && travelers.length) return travelers.length;
  const numbers = String(value || '').match(/\d+/g)?.map(Number) || [];
  return numbers.reduce((sum, n) => sum + n, 0);
}

function safePayload(raw) {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function displayDate(iso) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? new Date(`${iso}T00:00:00Z`) : null;
  return date && !Number.isNaN(date.valueOf())
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)
    : String(iso || '—');
}

function displayShortDate(iso) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? new Date(`${iso}T00:00:00Z`) : null;
  return date && !Number.isNaN(date.valueOf())
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date)
    : String(iso || '—');
}

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function validIsoDate(value) {
  const iso = cleanText(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso;
}

function departureStatusLabel(status) {
  return ({
    draft: 'Черновик', open: 'Открыт набор', almost_full: 'Почти заполнен',
    full: 'Заполнен', cancelled: 'Отменён',
  })[status] || status || 'Открыт набор';
}

function normalizeAdminTravelers(items, fallbackName = '') {
  const source = Array.isArray(items) && items.length ? items : [{ fullName: fallbackName, role: 'adult', primary: true }];
  const result = [];
  const seen = new Set();
  for (const item of source) {
    const fullName = cleanText(item?.fullName || item?.name, 250);
    if (!fullName) continue;
    const birthDate = cleanText(item?.birthDate || item?.birth_date, 32);
    const key = `${fullName.toLocaleLowerCase('ru-RU')}|${birthDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      fullName,
      birthDate,
      role: cleanText(item?.role, 32) || 'adult',
      primary: Boolean(item?.primary),
    });
  }
  if (!result.length) return [];
  let primary = result.findIndex(item => item.primary && item.role === 'adult');
  if (primary < 0) primary = result.findIndex(item => item.role === 'adult');
  if (primary < 0) primary = 0;
  return result.map((item, index) => ({
    ...item,
    primary: index === primary,
    label: index === primary ? 'Основной путешественник' : item.role === 'child' ? 'Попутчик · ребёнок' : 'Попутчик · взрослый',
  }));
}

async function recordDemoEvent(env, eventType, entityType, entityId, payload = {}, userId = null) {
  try {
    await env.DB.prepare(`INSERT INTO admin_demo_events(id,event_type,entity_type,entity_id,payload_json,created_by)
      VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(), eventType, entityType, String(entityId), JSON.stringify(payload), userId).run();
  } catch (error) {
    // The event stream is additive. A legacy local database without migration
    // 0004 must still be able to load the core booking flow.
    console.warn('admin_demo_events unavailable', error?.message || error);
  }
}

async function safeAll(statement) {
  try { return await statement.all(); } catch (error) {
    console.warn('optional admin demo table unavailable', error?.message || error);
    return { results: [] };
  }
}

function initials(name) {
  return String(name || 'Клиент').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
}

function paymentStatus(paid, total, status) {
  if (/отмен|возврат/i.test(status)) return 'Возврат';
  if (total > 0 && paid >= total) return 'Оплачено 100%';
  if (paid > 0) return 'Депозит';
  return 'Ждёт оплаты';
}

async function getCatalog(env) {
  let canonical = [];
  try {
    const response = await env.ASSETS.fetch(new Request('https://assets.local/catalog.v28.json'));
    if (response.ok) canonical = await response.json();
  } catch {}
  const custom = await env.DB.prepare('SELECT payload_json FROM admin_tours ORDER BY updated_at DESC').all();
  const map = new Map((Array.isArray(canonical) ? canonical : []).map(t => [String(t.id), t]));
  for (const row of custom.results || []) {
    const tour = safePayload(row.payload_json);
    if (tour.id) map.set(String(tour.id), { ...(map.get(String(tour.id)) || {}), ...tour });
  }
  return [...map.values()];
}

async function buildBootstrap(env) {
  const rate = Number(env.ADMIN_USD_RUB_RATE || 100) || 100;
  const [bookingsResult, travelersResult, profilesResult, rulesResult, messagesResult, broadcastsResult, tasksResult, departuresResult, eventsResult, consultationsResult, catalog] = await Promise.all([
    env.DB.prepare('SELECT * FROM bookings ORDER BY trip_date,created_at DESC').all(),
    env.DB.prepare('SELECT session_id,role,label,full_name,birth_date,primary_flag FROM travelers ORDER BY session_id,primary_flag DESC,created_at').all(),
    env.DB.prepare('SELECT * FROM admin_customer_profiles').all(),
    env.DB.prepare('SELECT * FROM admin_notification_rules ORDER BY rowid').all(),
    env.DB.prepare('SELECT id,booking_id,customer_session_id,channel,subject,body,status,created_at FROM admin_messages ORDER BY created_at DESC LIMIT 50').all(),
    env.DB.prepare('SELECT id,segment,body,status,recipient_count,created_at FROM admin_broadcasts ORDER BY created_at DESC LIMIT 50').all(),
    env.DB.prepare('SELECT id,title,description,owner,priority,status,due_date,created_by,created_at,updated_at FROM admin_tasks ORDER BY CASE status WHEN \'new\' THEN 0 WHEN \'in_progress\' THEN 1 ELSE 2 END, CASE priority WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 WHEN \'normal\' THEN 2 ELSE 3 END, created_at DESC LIMIT 100').all(),
    safeAll(env.DB.prepare('SELECT id,tour_id,title,city,trip_date,trip_time,capacity,min_people,status,notes,created_by,created_at,updated_at FROM admin_departures ORDER BY trip_date,trip_time')),
    safeAll(env.DB.prepare('SELECT id,event_type,entity_type,entity_id,payload_json,created_by,created_at FROM admin_demo_events ORDER BY created_at DESC LIMIT 80')),
    safeAll(env.DB.prepare('SELECT id,session_id,status,intent,summary,payload_json,created_at,updated_at FROM ai_consultations ORDER BY created_at DESC LIMIT 100')),
    getCatalog(env),
  ]);

  const travelerMap = new Map();
  for (const row of travelersResult.results || []) {
    if (!travelerMap.has(row.session_id)) travelerMap.set(row.session_id, []);
    travelerMap.get(row.session_id).push({ name: row.full_name, birthDate: row.birth_date, label: row.label, role: row.role, primary: !!row.primary_flag });
  }
  const profileMap = new Map((profilesResult.results || []).map(row => [row.session_id, row]));
  const sessionOrders = new Map();
  const orders = (bookingsResult.results || []).map(row => {
    const payload = safePayload(row.payload_json);
    const travelers = travelerMap.get(row.session_id) || [];
    const primary = travelers.find(t => t.primary) || travelers[0];
    const profile = profileMap.get(row.session_id) || {};
    const total = numberFromMoney(row.total, rate);
    const paid = numberFromMoney(row.paid, rate);
    const rest = Math.max(0, numberFromMoney(row.rest, rate));
    const order = {
      id: row.id, sessionId: row.session_id, customer: primary?.name || 'Клиент без ФИО',
      username: profile.username || '', phone: profile.phone || '', source: payload.source || profile.source || 'Mini App',
      tourId: row.tour_id, tour: row.title, iso: row.trip_date, date: displayDate(row.trip_date), time: row.trip_time || '',
      city: payload.city || payload.destination || '', type: row.booking_type || '', people: row.people || '',
      peopleCount: peopleCount(row.people, payload.travelers), paid, total, guideDue: rest,
      paymentStatus: paymentStatus(paid, total, row.status), method: payload.paymentMethod || payload.method || 'Не указан',
      orderStatus: row.status || 'Новый', action: /жд|нуж|нов/i.test(row.status || '') || paid < total,
      travelers: travelers.map(t => [t.name, t.birthDate, t.label]), createdAt: row.created_at, paidAt: row.paid_at || '', updatedAt: row.updated_at,
    };
    if (!sessionOrders.has(row.session_id)) sessionOrders.set(row.session_id, []);
    sessionOrders.get(row.session_id).push(order);
    return order;
  });

  const sessions = new Set([...travelerMap.keys(), ...profileMap.keys(), ...sessionOrders.keys()]);
  const customers = [...sessions].map(sessionId => {
    const travelers = travelerMap.get(sessionId) || [];
    const primary = travelers.find(t => t.primary) || travelers[0];
    const profile = profileMap.get(sessionId) || {};
    const customerOrders = sessionOrders.get(sessionId) || [];
    const active = customerOrders.find(o => !/отмен|заверш/i.test(o.orderStatus));
    const lifetime = customerOrders.reduce((sum, o) => sum + o.paid, 0);
    const status = profile.status || active?.paymentStatus || 'Без активной поездки';
    return {
      id: sessionId, name: primary?.name || 'Клиент без ФИО', initials: initials(primary?.name),
      username: profile.username || '', phone: profile.phone || '', source: profile.source || 'Mini App',
      segment: profile.segment || (active ? 'Есть активная поездка' : 'Без активной поездки'),
      activeTrip: active ? `${active.tour} · ${active.date}` : 'Нет активной поездки', status,
      travelers: travelers.length, trips: customerOrders.length, lifetime, notes: profile.notes || '',
    };
  });

  const departureMap = new Map();
  for (const order of orders) {
    const key = `${order.tourId}|${order.iso}|${order.time}|${order.type}`;
    if (!departureMap.has(key)) departureMap.set(key, {
      id: `dep-${await sha256Hex(key).then(x => x.slice(0, 12))}`, tourId: order.tourId, tour: order.tour, date: order.date, iso: order.iso,
      time: order.time || 'Время не указано', city: order.city, type: /индив/i.test(order.type) ? 'individual' : 'group',
      manager: 'Не назначен', status: order.orderStatus, action: false, capacity: 0, booked: 0, min: 0, waitlist: 0,
      transport: 'Не назначен', payments: { fullOrders: 0, fullTravelers: 0, depositOrders: 0, depositTravelers: 0, pendingOrders: 0, pendingTravelers: 0, online: 0, guideDue: 0, refund: 0 },
      notes: '', orders: [],
    });
    const dep = departureMap.get(key);
    dep.orders.push(order.id);
    const activeOrder = !/отмен|возврат/i.test(order.orderStatus);
    if (activeOrder) dep.booked += order.peopleCount;
    dep.payments.online += activeOrder ? order.paid : 0;
    dep.payments.guideDue += activeOrder ? order.guideDue : 0;
    if (order.paymentStatus.includes('100')) { dep.payments.fullOrders += 1; dep.payments.fullTravelers += order.peopleCount; }
    else if (order.paymentStatus.includes('Депозит')) { dep.payments.depositOrders += 1; dep.payments.depositTravelers += order.peopleCount; }
    else { dep.payments.pendingOrders += 1; dep.payments.pendingTravelers += order.peopleCount; dep.action = true; }
  }
  for (const dep of departureMap.values()) {
    const tour = catalog.find(t => String(t.id) === String(orders.find(o => dep.orders.includes(o.id))?.tourId));
    dep.capacity = Number(tour?.capacity || tour?.maxPeople || dep.booked || 1);
    dep.min = Number(tour?.minPeople || 1);
  }

  /* Staff-created group dates exist even before the first booking. Merge them
     into the same departure collection so every cabinet sees one schedule. */
  for (const row of departuresResult.results || []) {
    let dep = [...departureMap.values()].find(item => item.tourId === row.tour_id && item.iso === row.trip_date && item.time === (row.trip_time || 'Время не указано'));
    if (!dep) {
      dep = {
        id: row.id, tourId: row.tour_id, tour: row.title, date: displayDate(row.trip_date), iso: row.trip_date,
        time: row.trip_time || 'Время не указано', city: row.city || '', type: 'group', manager: 'Не назначен',
        status: departureStatusLabel(row.status), action: false, capacity: Number(row.capacity) || 1, booked: 0,
        min: Number(row.min_people) || 1, waitlist: 0, transport: 'Не назначен',
        payments: { fullOrders: 0, fullTravelers: 0, depositOrders: 0, depositTravelers: 0, pendingOrders: 0, pendingTravelers: 0, online: 0, guideDue: 0, refund: 0 },
        notes: row.notes || '', orders: [], source: 'Администратор',
      };
      departureMap.set(`${row.tour_id}|${row.trip_date}|${row.trip_time}|admin`, dep);
    } else {
      dep.id = row.id;
      dep.capacity = Number(row.capacity) || dep.capacity;
      dep.min = Number(row.min_people) || dep.min;
      dep.status = departureStatusLabel(row.status);
      dep.notes = row.notes || dep.notes;
      dep.source = 'Администратор';
    }
    dep.action = dep.status !== 'Отменён' && dep.booked < dep.min;
  }

  const received = orders.reduce((sum, o) => sum + o.paid, 0);
  const guideDue = orders.reduce((sum, o) => sum + o.guideDue, 0);
  const sources = Object.entries(orders.reduce((acc, o) => { acc[o.source] = (acc[o.source] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const popular = Object.entries(orders.reduce((acc, o) => { acc[o.tour] = (acc[o.tour] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const consultations = (consultationsResult.results || []).map(row => ({
    id: row.id, sessionId: row.session_id, status: row.status, intent: row.intent,
    summary: row.summary, payload: safePayload(row.payload_json), createdAt: row.created_at, updatedAt: row.updated_at,
  }));
  const consultationSources = Object.entries(consultations.reduce((acc, item) => {
    const source = item.payload?.source || 'AI-консультант'; acc[source] = (acc[source] || 0) + 1; return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  return {
    orders, customers, departures: [...departureMap.values()], catalog,
    notificationRules: (rulesResult.results || []).map(r => ({ key: r.rule_key, title: r.title, description: r.description, enabled: !!r.enabled, requiresConfirmation: !!r.requires_confirmation })),
    messages: messagesResult.results || [], broadcasts: broadcastsResult.results || [], tasks: tasksResult.results || [],
    events: (eventsResult.results || []).map(row => ({ ...row, payload: safePayload(row.payload_json) })),
    consultations,
    analytics: { received, guideDue, orderCount: orders.length, customerCount: customers.length, sources, popular,
      consultationCount: consultations.length,
      consultationOpenCount: consultations.filter(item => item.status !== 'closed').length,
      consultationSources,
    },
  };
}

async function authStatus(request, env) {
  if (publicDemoEnabled(env)) {
    await ensurePublicDemoUser(env);
    return json({ ok: true, setupRequired: false, authenticated: true, user: PUBLIC_DEMO_USER, csrfToken: 'public-demo' });
  }
  const count = await env.DB.prepare('SELECT COUNT(*) count FROM admin_users').first();
  const auth = await getAuth(request, env);
  return json({ ok: true, setupRequired: Number(count?.count || 0) === 0, authenticated: !!auth, user: auth?.user || null, csrfToken: auth?.csrf || null });
}

async function setup(request, env) {
  const count = await env.DB.prepare('SELECT COUNT(*) count FROM admin_users').first();
  if (Number(count?.count || 0) > 0) return bad('setup_closed', 409);
  if (!env.ADMIN_SETUP_TOKEN) return bad('setup_not_configured', 503);
  const body = await readBody(request) || {};
  if (!timingSafeEqual(body.setupToken || '', env.ADMIN_SETUP_TOKEN)) return bad('setup_token_invalid', 403);
  const email = normalizeEmail(body.email);
  const displayName = String(body.displayName || '').trim();
  const password = String(body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || !displayName || password.length < 12) return bad('invalid_setup_data');
  const id = crypto.randomUUID();
  const salt = randomHex(16);
  const iterations = 210000;
  const hash = await passwordHash(password, salt, iterations);
  const created = await env.DB.prepare(`INSERT INTO admin_users(id,email,display_name,password_salt,password_hash,password_iterations,role)
    SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM admin_users)`).bind(id, email, displayName, salt, hash, iterations, 'admin').run();
  if (!created.meta?.changes) return bad('setup_closed', 409);
  await audit(env, id, 'setup', 'admin_user', id, { email, role: 'admin' });
  return json({ ok: true });
}

async function login(request, env) {
  const body = await readBody(request) || {};
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const ipHash = await sha256Hex(request.headers.get('cf-connecting-ip') || 'unknown');
  const attempts = await env.DB.prepare(`SELECT COUNT(*) count FROM admin_login_attempts
    WHERE email=? AND ip_hash=? AND succeeded=0 AND created_at>datetime('now','-15 minutes')`).bind(email, ipHash).first();
  if (Number(attempts?.count || 0) >= 5) return bad('login_rate_limited', 429);
  const user = await env.DB.prepare('SELECT * FROM admin_users WHERE email=? COLLATE NOCASE AND active=1').bind(email).first();
  const computed = user ? await passwordHash(password, user.password_salt, Number(user.password_iterations)) : await passwordHash(password, randomHex(16), 10000);
  const success = !!user && timingSafeEqual(computed, user.password_hash);
  await env.DB.prepare('INSERT INTO admin_login_attempts(email,ip_hash,succeeded) VALUES(?,?,?)').bind(email, ipHash, success ? 1 : 0).run();
  if (!success) return bad('credentials_invalid', 401);
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const csrf = randomHex(24);
  await env.DB.prepare(`INSERT INTO admin_sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)`).bind(tokenHash, user.id, csrf, addHours(8)).run();
  await audit(env, user.id, 'login', 'admin_user', user.id);
  return json({ ok: true, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role }, csrfToken: csrf }, { headers: { 'set-cookie': sessionCookie(token) } });
}

async function logout(request, env) {
  const checked = await requireAuth(request, env);
  if (checked.response) return checked.response;
  await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(checked.auth.tokenHash).run();
  return json({ ok: true }, { headers: { 'set-cookie': sessionCookie('', 0) } });
}

async function patchBooking(request, env, id) {
  const checked = await requireAuth(request, env, 'booking.write');
  if (checked.response) return checked.response;
  const body = await readBody(request) || {};
  const row = await env.DB.prepare('SELECT * FROM bookings WHERE id=?').bind(id).first();
  if (!row) return bad('booking_not_found', 404);
  const existing = safePayload(row.payload_json);
  const rate = Number(env.ADMIN_USD_RUB_RATE || 100) || 100;
  const allowed = {
    status: body.status ?? row.status, date: body.date ?? row.trip_date, time: body.time ?? row.trip_time,
    paid: bookingMoneyFromRubles(body.paid, row.paid, rate), rest: bookingMoneyFromRubles(body.rest, row.rest, rate),
    total: bookingMoneyFromRubles(body.total, row.total, rate), paymentMethod: body.paymentMethod ?? existing.paymentMethod,
    adminNote: body.adminNote ?? existing.adminNote,
  };
  const payload = { ...existing, ...allowed };
  await env.DB.prepare(`UPDATE bookings SET trip_date=?,trip_time=?,status=?,paid=?,rest=?,total=?,payload_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(String(allowed.date), String(allowed.time || ''), String(allowed.status), String(allowed.paid), String(allowed.rest), String(allowed.total), JSON.stringify(payload), id).run();
  await audit(env, checked.auth.user.id, 'update', 'booking', id, allowed);
  await recordDemoEvent(env, 'booking_updated', 'booking', id, {
    status: allowed.status, date: allowed.date, paid: allowed.paid, rest: allowed.rest,
  }, checked.auth.user.id);
  return json({ ok: true });
}

async function createAdminOrder(request, env) {
  const checked = await requireAuth(request, env, 'booking.write');
  if (checked.response) return checked.response;
  const body = await readBody(request) || {};
  const customerName = cleanText(body.customerName || body.customer || body.name, 250);
  const tourId = cleanText(body.tourId, 160);
  const title = cleanText(body.title || body.tour, 250);
  const date = cleanText(body.date, 20);
  const time = cleanText(body.time, 32);
  const source = cleanText(body.source, 80) || 'Офис';
  if (!customerName || !tourId || !title || !validIsoDate(date)) return bad('order_invalid');

  const id = `OFF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const sessionId = `admin-customer-${crypto.randomUUID()}`;
  const travelers = normalizeAdminTravelers(body.travelers, customerName);
  const peopleCountValue = Math.max(1, Math.round(Number(body.peopleCount || travelers.length || 1) || 1));
  const totalRubles = Math.max(0, Math.round(Number(body.total || 0) || 0));
  const paidRubles = Math.max(0, Math.min(totalRubles, Math.round(Number(body.paid || 0) || 0)));
  const restRubles = Math.max(0, totalRubles - paidRubles);
  const status = cleanText(body.status, 80) || (paidRubles >= totalRubles && totalRubles > 0 ? 'Подтверждён' : 'Новый');
  const type = cleanText(body.type || body.bookingType, 80) || 'Офлайн-покупка';
  const city = cleanText(body.city || body.destination, 120);
  const payload = {
    source, city, destination: city, paymentMethod: cleanText(body.paymentMethod, 80) || 'Офис',
    adminNote: cleanText(body.adminNote, 4000), travelers: travelers.map(item => ({
      fullName: item.fullName, birthDate: item.birthDate, role: item.role, primary: item.primary,
    })),
    createdBy: checked.auth.user.id,
  };

  await env.DB.prepare('INSERT INTO sessions(id) VALUES(?)').bind(sessionId).run();
  for (const traveler of travelers) {
    const travelerKey = `${traveler.fullName.toLocaleLowerCase('ru-RU')}|${traveler.birthDate}`;
    await env.DB.prepare(`INSERT INTO travelers(session_id,traveler_key,role,label,full_name,birth_date,primary_flag)
      VALUES(?,?,?,?,?,?,?)`).bind(sessionId, travelerKey, traveler.role, traveler.label, traveler.fullName, traveler.birthDate, traveler.primary ? 1 : 0).run();
  }
  await env.DB.prepare(`INSERT INTO admin_customer_profiles(session_id,phone,username,source,segment,status,notes,updated_by)
    VALUES(?,?,?,?,?,?,?,?)`).bind(sessionId, cleanText(body.phone, 80), cleanText(body.username, 120), source,
    'Офлайн-покупка', status, cleanText(body.adminNote, 4000), checked.auth.user.id).run();
  await env.DB.prepare(`INSERT INTO bookings(id,session_id,tour_id,title,trip_date,trip_time,status,paid,rest,total,booking_type,receipt,paid_at,people,image,rules,payload_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, sessionId, tourId, title, date, time, status, `${paidRubles} ₽`, `${restRubles} ₽`, `${totalRubles} ₽`, type,
      `OFFICE-DEMO-${id}`, paidRubles > 0 ? new Date().toISOString() : '', `${peopleCountValue} человек`, '', '', JSON.stringify(payload),
    ).run();
  await audit(env, checked.auth.user.id, 'create', 'booking', id, { source, type, tourId, date, totalRubles, paidRubles });
  await recordDemoEvent(env, 'booking_created', 'booking', id, { source, type, tourId, title, date, totalRubles, paidRubles }, checked.auth.user.id);
  return json({ ok: true, orderId: id, sessionId, source, status }, { status: 201 });
}

async function createDeparture(request, env) {
  const checked = await requireAuth(request, env, 'departure.write');
  if (checked.response) return checked.response;
  const body = await readBody(request) || {};
  const tourId = cleanText(body.tourId, 160);
  const title = cleanText(body.title || body.tour, 250);
  const city = cleanText(body.city, 120);
  const date = cleanText(body.date, 20);
  const time = cleanText(body.time, 32) || '09:00';
  const capacity = Math.max(1, Math.round(Number(body.capacity || 1) || 1));
  const minPeople = Math.max(1, Math.min(capacity, Math.round(Number(body.minPeople || body.min || 1) || 1)));
  const status = ['draft', 'open', 'almost_full', 'full', 'cancelled'].includes(String(body.status)) ? String(body.status) : 'open';
  if (!tourId || !title || !validIsoDate(date)) return bad('departure_invalid');
  const existing = await env.DB.prepare('SELECT id FROM admin_departures WHERE tour_id=? AND trip_date=? AND trip_time=? AND status<>\'cancelled\'').bind(tourId, date, time).first();
  if (existing) return bad('departure_exists', 409);
  const id = `DEP-${date.replace(/-/g, '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const notes = cleanText(body.notes, 4000);
  await env.DB.prepare(`INSERT INTO admin_departures(id,tour_id,title,city,trip_date,trip_time,capacity,min_people,status,notes,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id, tourId, title, city, date, time, capacity, minPeople, status, notes, checked.auth.user.id).run();
  const departure = { id, tourId, title, city, date, dateLabel: displayShortDate(date), time, capacity, minPeople, status, statusLabel: departureStatusLabel(status), notes };
  await audit(env, checked.auth.user.id, 'create', 'departure', id, departure);
  await recordDemoEvent(env, 'departure_created', 'departure', id, departure, checked.auth.user.id);
  return json({ ok: true, departure }, { status: 201 });
}

async function patchCustomer(request, env, sessionId) {
  const checked = await requireAuth(request, env, 'customer.write');
  if (checked.response) return checked.response;
  const body = await readBody(request) || {};
  const clean = key => String(body[key] || '').trim().slice(0, key === 'notes' ? 4000 : 250);
  await env.DB.prepare(`INSERT INTO admin_customer_profiles(session_id,phone,username,source,segment,status,notes,updated_by)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET phone=excluded.phone,username=excluded.username,
    source=excluded.source,segment=excluded.segment,status=excluded.status,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
    .bind(sessionId, clean('phone'), clean('username'), clean('source') || 'Mini App', clean('segment'), clean('status'), clean('notes'), checked.auth.user.id).run();
  await audit(env, checked.auth.user.id, 'update', 'customer', sessionId, { phone: clean('phone'), segment: clean('segment'), status: clean('status') });
  return json({ ok: true });
}

async function putTour(request, env, id) {
  const checked = await requireAuth(request, env, 'tour.write');
  if (checked.response) return checked.response;
  const body = await readBody(request) || {};
  const safeId = String(id || body.id || '').replace(/[^a-z0-9_-]/gi, '-').toLowerCase().slice(0, 100);
  if (!safeId || !String(body.title || '').trim()) return bad('tour_invalid');
  const tour = { ...body, id: safeId, title: String(body.title).trim().slice(0, 250) };
  await env.DB.prepare(`INSERT INTO admin_tours(id,payload_json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP`).bind(safeId, JSON.stringify(tour)).run();
  await audit(env, checked.auth.user.id, 'update', 'tour', safeId, { title: tour.title });
  return json({ ok: true, tour });
}

async function createMessage(request, env) {
  const checked = await requireAuth(request, env, 'message.write');
  if (checked.response) return checked.response;
  const body = await readBody(request) || {};
  const text = String(body.body || '').trim();
  if (!text || text.length > 4000) return bad('message_invalid');
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO admin_messages(id,booking_id,customer_session_id,channel,subject,body,status,created_by)
    VALUES(?,?,?,?,?,?,?,?)`).bind(id, body.bookingId || null, body.customerSessionId || null, String(body.channel || 'telegram'), String(body.subject || '').slice(0, 250), text, 'queued', checked.auth.user.id).run();
  await audit(env, checked.auth.user.id, 'create', 'message', id, { bookingId: body.bookingId || null });
  return json({ ok: true, id, status: 'queued' }, { status: 201 });
}

async function patchRule(request, env, key) {
  const checked = await requireAuth(request, env, 'notification.write');
  if (checked.response) return checked.response;
  const body = await readBody(request) || {};
  const result = await env.DB.prepare('UPDATE admin_notification_rules SET enabled=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE rule_key=?')
    .bind(body.enabled ? 1 : 0, checked.auth.user.id, key).run();
  if (!result.meta?.changes) return bad('rule_not_found', 404);
  await audit(env, checked.auth.user.id, 'update', 'notification_rule', key, { enabled: !!body.enabled });
  return json({ ok: true });
}

async function createBroadcast(request, env) {
  const checked = await requireAuth(request, env, 'broadcast.write');
  if (checked.response) return checked.response;
  const body = await readBody(request) || {};
  const text = String(body.body || '').trim();
  const segment = String(body.segment || 'all').trim().slice(0, 100);
  if (!text || text.length > 4000) return bad('broadcast_invalid');
  const recipients = Number((await env.DB.prepare('SELECT COUNT(DISTINCT session_id) count FROM bookings').first())?.count || 0);
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO admin_broadcasts(id,segment,body,status,recipient_count,created_by) VALUES(?,?,?,?,?,?)`)
    .bind(id, segment, text, 'queued', recipients, checked.auth.user.id).run();
  await audit(env, checked.auth.user.id, 'create', 'broadcast', id, { segment, recipients });
  return json({ ok: true, id, status: 'queued', recipientCount: recipients }, { status: 201 });
}

const taskPriorities = new Set(['low', 'normal', 'high', 'urgent']);
const taskStatuses = new Set(['new', 'in_progress', 'done', 'cancelled']);

function cleanTaskText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

async function createTask(request, env) {
  const checked = await requireAuth(request, env, 'task.write');
  if (checked.response) return checked.response;
  const body = await readBody(request) || {};
  const title = cleanTaskText(body.title, 200);
  const description = cleanTaskText(body.description ?? body.note, 4000);
  const owner = cleanTaskText(body.owner, 100) || 'Администратор';
  const priority = taskPriorities.has(String(body.priority)) ? String(body.priority) : 'normal';
  const dueDate = cleanTaskText(body.dueDate ?? body.due_date, 32);
  if (!title) return bad('task_invalid');
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return bad('task_due_date_invalid');
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO admin_tasks(id,title,description,owner,priority,status,due_date,created_by)
    VALUES(?,?,?,?,?,?,?,?)`).bind(id, title, description, owner, priority, 'new', dueDate || null, checked.auth.user.id).run();
  await audit(env, checked.auth.user.id, 'create', 'task', id, { title, owner, priority, dueDate: dueDate || null });
  const task = await env.DB.prepare('SELECT id,title,description,owner,priority,status,due_date,created_by,created_at,updated_at FROM admin_tasks WHERE id=?').bind(id).first();
  return json({ ok: true, task }, { status: 201 });
}

async function patchTask(request, env, id) {
  const checked = await requireAuth(request, env, 'task.write');
  if (checked.response) return checked.response;
  const body = await readBody(request) || {};
  const existing = await env.DB.prepare('SELECT * FROM admin_tasks WHERE id=?').bind(id).first();
  if (!existing) return bad('task_not_found', 404);
  const status = taskStatuses.has(String(body.status)) ? String(body.status) : existing.status;
  const priority = taskPriorities.has(String(body.priority)) ? String(body.priority) : existing.priority;
  const owner = body.owner == null ? existing.owner : (cleanTaskText(body.owner, 100) || 'Администратор');
  const title = body.title == null ? existing.title : cleanTaskText(body.title, 200);
  const description = body.description == null && body.note == null ? existing.description : cleanTaskText(body.description ?? body.note, 4000);
  const dueDate = body.dueDate == null && body.due_date == null ? existing.due_date : cleanTaskText(body.dueDate ?? body.due_date, 32);
  if (!title) return bad('task_invalid');
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return bad('task_due_date_invalid');
  await env.DB.prepare(`UPDATE admin_tasks SET title=?,description=?,owner=?,priority=?,status=?,due_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(title, description, owner, priority, status, dueDate || null, id).run();
  await audit(env, checked.auth.user.id, 'update', 'task', id, { status, priority, owner, dueDate: dueDate || null });
  const task = await env.DB.prepare('SELECT id,title,description,owner,priority,status,due_date,created_by,created_at,updated_at FROM admin_tasks WHERE id=?').bind(id).first();
  return json({ ok: true, task });
}

const consultationStatuses = new Set(['new', 'sent_to_manager', 'in_progress', 'closed']);

async function patchConsultation(request, env, id) {
  const checked = await requireAuth(request, env, 'consultation.write');
  if (checked.response) return checked.response;
  const body = await readBody(request) || {};
  const existing = await env.DB.prepare('SELECT * FROM ai_consultations WHERE id=?').bind(id).first();
  if (!existing) return bad('consultation_not_found', 404);
  const status = consultationStatuses.has(String(body.status)) ? String(body.status) : existing.status;
  await env.DB.prepare('UPDATE ai_consultations SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status, id).run();
  await audit(env, checked.auth.user.id, 'update', 'ai_consultation', id, { status });
  await recordDemoEvent(env, 'consultation_updated', 'ai_consultation', id, { status }, checked.auth.user.id);
  return json({ ok: true, id, status });
}

export async function handleAdminApi(request, env, url = new URL(request.url)) {
  if (!url.pathname.startsWith('/api/admin/')) return null;
  const path = url.pathname;
  if (path === '/api/admin/auth/session' && request.method === 'GET') return authStatus(request, env);
  if (path === '/api/admin/auth/setup' && request.method === 'POST') return setup(request, env);
  if (path === '/api/admin/auth/login' && request.method === 'POST') return login(request, env);
  if (path === '/api/admin/auth/logout' && request.method === 'POST') return logout(request, env);

  if (path === '/api/admin/bootstrap' && request.method === 'GET') {
    const checked = await requireAuth(request, env);
    if (checked.response) return checked.response;
    return json({ ok: true, user: checked.auth.user, csrfToken: checked.auth.csrf, ...(await buildBootstrap(env)) });
  }
  const booking = path.match(/^\/api\/admin\/bookings\/([^/]+)$/);
  if (booking && request.method === 'PATCH') return patchBooking(request, env, decodeURIComponent(booking[1]));
  if (path === '/api/admin/orders' && request.method === 'POST') return createAdminOrder(request, env);
  if (path === '/api/admin/departures' && request.method === 'POST') return createDeparture(request, env);
  const customer = path.match(/^\/api\/admin\/customers\/([^/]+)$/);
  if (customer && request.method === 'PATCH') return patchCustomer(request, env, decodeURIComponent(customer[1]));
  const tour = path.match(/^\/api\/admin\/tours\/([^/]+)$/);
  if (tour && request.method === 'PUT') return putTour(request, env, decodeURIComponent(tour[1]));
  const rule = path.match(/^\/api\/admin\/notification-rules\/([^/]+)$/);
  if (rule && request.method === 'PATCH') return patchRule(request, env, decodeURIComponent(rule[1]));
  if (path === '/api/admin/messages' && request.method === 'POST') return createMessage(request, env);
  if (path === '/api/admin/broadcasts' && request.method === 'POST') return createBroadcast(request, env);
  if (path === '/api/admin/tasks' && request.method === 'POST') return createTask(request, env);
  const task = path.match(/^\/api\/admin\/tasks\/([^/]+)$/);
  if (task && request.method === 'PATCH') return patchTask(request, env, decodeURIComponent(task[1]));
  const consultation = path.match(/^\/api\/admin\/consultations\/([^/]+)$/);
  if (consultation && request.method === 'PATCH') return patchConsultation(request, env, decodeURIComponent(consultation[1]));
  return bad('not_found', 404);
}

export const _test = { passwordHash, timingSafeEqual, can, numberFromMoney, bookingMoneyFromRubles, paymentStatus, peopleCount };
