const encoder = new TextEncoder();

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', ...(init.headers || {}) },
});

const bad = (error, status = 400) => json({ ok:false, error }, { status });

function parseCookie(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim()).filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return i < 0 ? [part, ''] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))));
}

function timingSafeEqual(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) mismatch |= (left[i % (left.length || 1)] || 0) ^ (right[i % (right.length || 1)] || 0);
  return mismatch === 0;
}

function publicDemoEnabled(env) {
  return String(env.PUBLIC_ADMIN_DEMO || '').toLowerCase() === 'true';
}

async function authorize(request, env) {
  if (publicDemoEnabled(env)) {
    if (!timingSafeEqual(request.headers.get('x-csrf-token') || '', 'public-demo')) return { response:bad('csrf_invalid', 403) };
    return { user:{ id:'demo-public-admin', role:'admin' } };
  }

  const token = parseCookie(request.headers.get('cookie') || '').mt_admin_session;
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return { response:bad('unauthorized', 401) };
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`SELECT s.csrf_token,s.expires_at,u.id,u.role,u.active
    FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
    WHERE s.token_hash=? AND datetime(s.expires_at)>CURRENT_TIMESTAMP AND u.active=1`).bind(tokenHash).first();
  if (!row) return { response:bad('unauthorized', 401) };
  if (!['admin','owner'].includes(String(row.role || ''))) return { response:bad('forbidden', 403) };
  if (!timingSafeEqual(request.headers.get('x-csrf-token') || '', row.csrf_token || '')) return { response:bad('csrf_invalid', 403) };
  return { user:{ id:row.id, role:row.role } };
}

const MIME_EXT = new Map([
  ['image/jpeg','jpg'],
  ['image/png','png'],
  ['image/webp','webp'],
  ['image/avif','avif'],
]);

function safeTourId(value) {
  return String(value || '').replace(/[^a-z0-9_-]/gi, '-').toLowerCase().slice(0, 100);
}

function safePayload(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

async function loadTour(env, id) {
  const custom = await env.DB.prepare('SELECT payload_json FROM admin_tours WHERE id=?').bind(id).first();
  if (custom?.payload_json) {
    const tour = safePayload(custom.payload_json);
    if (tour?.id) return tour;
  }

  try {
    const response = await env.ASSETS.fetch(new Request('https://assets.local/catalog.v28.json'));
    if (response.ok) {
      const catalog = await response.json();
      const tour = Array.isArray(catalog) ? catalog.find(item => String(item?.id) === id) : null;
      if (tour) return tour;
    }
  } catch {}
  return null;
}

async function saveTour(env, userId, tour) {
  await env.DB.prepare(`INSERT INTO admin_tours(id,payload_json) VALUES(?,?)
    ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(tour.id, JSON.stringify(tour)).run();
  try {
    await env.DB.prepare(`INSERT INTO admin_audit_log(user_id,action,entity_type,entity_id,payload_json)
      VALUES(?,?,?,?,?)`).bind(userId, 'image.update', 'tour', tour.id, JSON.stringify({ image:tour.image })).run();
  } catch {}
}

export async function handleAdminTourMediaApi(request, env, url = new URL(request.url)) {
  const match = url.pathname.match(/^\/api\/admin\/tours\/([^/]+)\/image$/);
  if (!match || request.method !== 'POST') return null;

  const checked = await authorize(request, env);
  if (checked.response) return checked.response;
  if (!env.TOUR_MEDIA) return bad('media_storage_unavailable', 503);

  const id = safeTourId(decodeURIComponent(match[1]));
  if (!id) return bad('tour_invalid');
  const tour = await loadTour(env, id);
  if (!tour) return bad('tour_not_found', 404);

  const contentType = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = MIME_EXT.get(contentType);
  if (!ext) return bad('image_type_invalid', 415);

  const declared = Number(request.headers.get('content-length') || 0);
  const maxBytes = 8 * 1024 * 1024;
  if (declared > maxBytes) return bad('image_too_large', 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return bad('image_empty');
  if (bytes.byteLength > maxBytes) return bad('image_too_large', 413);

  const key = `${id}/admin-cover-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await env.TOUR_MEDIA.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      source: 'admin-upload',
      tourId: id,
      uploadedBy: String(checked.user.id || ''),
    },
  });

  const image = `/tour-media/${key}`;
  const previousGallery = Array.isArray(tour.gallery) ? tour.gallery : [];
  const gallery = [image, ...previousGallery.filter(item => item && item !== tour.image && !/\/admin-cover-/i.test(String(item))).slice(0, 7)];
  const updated = { ...tour, id, image, fallbackImage:image, gallery };
  await saveTour(env, checked.user.id, updated);

  return json({ ok:true, image, tour:updated });
}
