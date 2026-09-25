import profileWorker from './worker-profile.js';
import baseWorker from './worker.js';
import { compactTourForAi, findTourForQuestion } from './ai-faq-knowledge.js';
import { selectionFastPath } from './worker-selection-v14.js';
import { orchestrateAiRequest } from './ai-orchestrator-v23.js';
import { handleAdminTourMediaApi } from './admin-tour-media-api.js';

const CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

const ADMIN_HOST = 'max-tour-demo-admin.viiversion.com';
const ADMIN_SHARED_ASSETS = new Set([
  '/max-tour-logo.svg',
  '/admin-app.css',
  '/admin-app.js',
  '/admin-tour-media.js',
  '/production-embed-polish.css',
  '/production-embed-polish.js',
]);
const ADMIN_TOURIST_ROLE_PATTERN = /\s*<a href="\/" aria-label="Открыть кабинет туриста"><span class="role-long">Турист<\/span><span class="role-short">Турист<\/span><\/a>/i;
const AVAILABILITY_INTENT = /(?:есть|мест[ао]?|свобод|наличи|заброни)/i;
const ORIGIN_CUE = /(?:^|\s)(?:я|мы|сейчас|нахожусь|находимся|живу|живем|живём|из|выезд(?:\s+из)?|старт(?:\s+из)?)(?:\s|$|[^а-яё])/i;
async function requestedLocale(request, url) {
  if (url.pathname !== '/api/ai/chat' || request.method !== 'POST') return 'ru';
  const header = String(request.headers.get('x-max-tour-locale') || '').toLowerCase();
  if (header === 'vi' || header === 'en' || header === 'ko') return header;
  const body = await request.clone().json().catch(() => null);
  const raw = String(body?.locale || body?.context?.locale || '').toLowerCase();
  return raw === 'vi' || raw === 'en' || raw === 'ko' ? raw : 'ru';
}

const MONTHS = [
  ['янв', 1], ['фев', 2], ['мар', 3], ['апр', 4], ['ма[йя]', 5], ['июн', 6],
  ['июл', 7], ['авг', 8], ['сен', 9], ['окт', 10], ['ноя', 11], ['дек', 12],
];

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });
}

function vietnamTodayIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addIsoDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function normalizeRussian(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

function originReply(message) {
  const q = normalizeRussian(message);
  if (!q || !ORIGIN_CUE.test(q)) return '';
  if (/хано(?:й|е|я)|hanoi/.test(q)) {
    return 'Хорошо, выезд из Ханоя. Могу подобрать Ниньбинь, Халонг, обзор Ханоя или другой доступный маршрут.';
  }
  if (/нячанг(?:е|а)?|на-?чанг(?:е|а)?|nha\s*trang/.test(q)) {
    return 'Хорошо, выезд из Нячанга. Могу подобрать острова, Нячанг, Далат, Фуйен и другие доступные маршруты.';
  }
  if (/дананг(?:е|а)?|да-?нанг(?:е|а)?|da\s*nang/.test(q)) {
    return 'Хорошо, выезд из Дананга. Могу подобрать Дананг, Хойан и другие доступные варианты.';
  }
  if (/фу\s*куок(?:е|а)?|фукуок(?:е|а)?|phu\s*quoc/.test(q)) {
    return 'Хорошо, вы на Фукуоке. Подберу варианты с выездом с острова — скажите, что интереснее: море, природа или обзорная программа.';
  }
  return '';
}

async function originFastPath(request, url) {
  if (url.pathname !== '/api/ai/chat' || request.method !== 'POST') return null;
  const body = await request.clone().json().catch(() => ({}));
  const reply = originReply(body?.message);
  if (!reply) return null;
  return json({
    ok: true,
    reply,
    source: 'origin-fast',
    faqIntent: 'origin',
    tourId: '',
    currentDateVietnam: vietnamTodayIso(),
  });
}

function departureIso(value, today) {
  const raw = normalizeRussian(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const day = Number((raw.match(/\d{1,2}/) || [])[0]);
  const month = MONTHS.find(([stem]) => new RegExp(stem).test(raw))?.[1];
  if (!day || !month) return '';
  let year = Number(today.slice(0, 4));
  let iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  if (iso < today && Number(today.slice(5, 7)) >= 11 && month <= 2) {
    year += 1;
    iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  }
  return iso;
}

function requestedPeople(text) {
  const q = normalizeRussian(text);
  const digit = q.match(/(?:нас|для|на)\s*(\d{1,2})\s*(?:человек|чел|взросл)?|(\d{1,2})\s*(?:человек|взросл)/);
  if (digit) return Number(digit[1] || digit[2] || 0);
  if (/дво(?:их|е)|два|две/.test(q)) return 2;
  if (/тро(?:их|е)|три/.test(q)) return 3;
  if (/четвер(?:ых|о)|четыре/.test(q)) return 4;
  return 0;
}

async function loadAvailabilityCatalog(request, env) {
  if (!env.ASSETS) return [];
  try {
    const response = await env.ASSETS.fetch(new Request(new URL('/catalog.v28.json', request.url)));
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data.slice(0, 60).map(compactTourForAi) : [];
  } catch (error) {
    console.warn('availability catalogue unavailable', error?.message || error);
    return [];
  }
}

function availabilityReply(message, catalog, now = new Date()) {
  const q = String(message || '').trim();
  if (!/завтра/i.test(q) || !AVAILABILITY_INTENT.test(q)) return null;
  const tour = findTourForQuestion(q, catalog, {});
  if (!tour) return null;

  const today = vietnamTodayIso(now);
  const target = addIsoDays(today, 1);
  const departure = (tour.group?.departures || []).find(item => departureIso(item.date, today) === target);
  const tourName = tour.title || 'экскурсия';
  if (!departure || /лист ожидания|полон|full|отмен/i.test(String(departure.status || ''))) {
    return {
      tourId: tour.id,
      reply: `В опубликованном расписании ${tourName} на завтра подтверждённого свободного группового выезда не вижу. Могу проверить индивидуальный формат или ближайшую следующую дату.`,
    };
  }

  const capacity = Math.max(0, Number(departure.capacity) || 0);
  const taken = Math.max(0, Number(departure.taken) || 0);
  const seats = capacity ? Math.max(0, capacity - taken) : null;
  const people = requestedPeople(q);
  if (seats !== null && people && seats < people) {
    return {
      tourId: tour.id,
      reply: `На завтра у ${tourName} осталось ${seats} мест — для ${people} человек этого недостаточно. Могу проверить индивидуальный формат или ближайшую следующую дату.`,
    };
  }

  const seatsText = seats === null ? '' : `, свободно ${seats} мест`;
  const time = departure.time ? ` ${departure.time}` : '';
  return {
    tourId: tour.id,
    reply: `На завтра у ${tourName} есть групповой выезд${time}${seatsText}. Для ${people || 'вашего состава'} можно переходить к оформлению — откройте карточку экскурсии.`,
  };
}

async function availabilityFastPath(request, env, url) {
  if (url.pathname !== '/api/ai/chat' || request.method !== 'POST') return null;
  const body = await request.clone().json().catch(() => ({}));
  const message = String(body?.message || '');
  if (!/завтра/i.test(message) || !AVAILABILITY_INTENT.test(message)) return null;
  const catalog = await loadAvailabilityCatalog(request, env);
  const result = availabilityReply(message, catalog);
  if (!result?.reply) return null;
  return json({
    ok: true,
    reply: result.reply,
    source: 'availability-fast',
    faqIntent: 'availability_tomorrow',
    tourId: result.tourId || '',
    currentDateVietnam: vietnamTodayIso(),
  });
}

function mediaKey(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname.slice('/tour-media/'.length));
  } catch {
    return '';
  }
  if (!/^[a-z0-9-]+\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp|avif)$/i.test(decoded)) return '';
  if (decoded.split('/').some(part => !part || part === '.' || part === '..')) return '';
  return decoded;
}

async function serveTourMedia(request, env, pathname) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  if (!env.TOUR_MEDIA) return new Response('Tour media storage unavailable', { status: 503 });

  const key = mediaKey(pathname);
  if (!key) return new Response('Bad media path', { status: 400 });

  const object = request.method === 'HEAD'
    ? await env.TOUR_MEDIA.head(key)
    : await env.TOUR_MEDIA.get(key);
  if (!object) return new Response('Not Found', { status: 404 });

  const ext = key.split('.').pop().toLowerCase();
  const headers = new Headers({
    'content-type': CONTENT_TYPES[ext] || 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'content-length': String(object.size),
  });
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  if (object.uploaded) headers.set('last-modified', new Date(object.uploaded).toUTCString());

  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

function isAdminHostAllowedPath(pathname) {
  return pathname === '/' ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/director' ||
    pathname.startsWith('/director/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/tour-media/') ||
    ADMIN_SHARED_ASSETS.has(pathname);
}

function routeAdminHost(url) {
  if (url.hostname !== ADMIN_HOST) return null;
  if (url.pathname === '/') return Response.redirect(new URL('/admin/', url), 302);
  if (url.pathname === '/director') return Response.redirect(new URL('/director/', url), 308);
  if (!isAdminHostAllowedPath(url.pathname)) {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }
  return null;
}

async function filterAdminHostRoles(response, url) {
  if (url.hostname !== ADMIN_HOST) return response;
  if (!(url.pathname.startsWith('/admin') || url.pathname.startsWith('/director'))) return response;
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('text/html')) return response;

  const html = await response.text();
  const filteredHtml = html.replace(ADMIN_TOURIST_ROLE_PATTERN, '');
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  return new Response(filteredHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const _availabilityTest = { vietnamTodayIso, addIsoDays, departureIso, requestedPeople, availabilityReply, originReply };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const locale = await requestedLocale(request, url);
    const adminHostResponse = routeAdminHost(url);
    if (adminHostResponse) return adminHostResponse;
    const mediaAdminResponse = await handleAdminTourMediaApi(request, env, url);
    if (mediaAdminResponse) return mediaAdminResponse;
    if (url.pathname.startsWith('/tour-media/')) {
      return serveTourMedia(request, env, url.pathname);
    }
    // VI/EN use the locale-aware AI core directly. All fast-path/orchestrator
    // layers below were written for Russian and may emit Russian fallback copy.
    if (url.pathname === '/api/ai/chat' && request.method === 'POST' && locale !== 'ru') {
      return baseWorker.fetch(request, env, ctx);
    }
    const orchestrated = await orchestrateAiRequest(request, env, url);
    if (orchestrated) return orchestrated;
    const selectionResponse = await selectionFastPath(request, url);
    if (selectionResponse) return selectionResponse;
    const originResponse = await originFastPath(request, url);
    if (originResponse) return originResponse;
    const availabilityResponse = await availabilityFastPath(request, env, url);
    if (availabilityResponse) return availabilityResponse;
    const response = await profileWorker.fetch(request, env, ctx);
    return filterAdminHostRoles(response, url);
  },
};