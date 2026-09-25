const DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';

const clean = (value, max = 1600) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const norm = value => clean(value, 3200).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const uniq = values => [...new Set((Array.isArray(values) ? values : []).map(value => clean(value, 120)).filter(Boolean))];

const ORIGIN_ROUTES = {
  'Нячанг': ['Нячанг', 'Далат', 'Фуйен', 'Муйне/Фантьет'],
  'Ханой': ['Ханой', 'Ниньбинь', 'Халонг'],
  'Дананг': ['Дананг', 'Хойан'],
  'Фукуок': ['Фукуок'],
  'Муйне/Фантьет': ['Муйне/Фантьет'],
};

const PRIMARY_PREFS = new Set([
  'море и острова', 'море', 'город и культура', 'природа и красивые виды', 'природа',
]);

export function classifyPrimaryTheme(message) {
  const q = norm(message);
  if (!q) return '';
  const hits = [];
  if (/(?:остров|море|морск|пляж|сноркл|дайв|коралл|катамаран|яхт|купани)/.test(q)) hits.push('islands');
  if (/(?:обзорн.{0,20}(?:город|экскурс)|обзор\s+города|городск.{0,18}(?:тур|экскурс)|достопримеч|храм|пагод|собор|музе|рынок|город и культур)/.test(q)) hits.push('city');
  if (/(?:природ|водопад|гора|каньон|дюн|озер|пещер|красив.{0,12}вид|панорам)/.test(q)) hits.push('nature');
  const unique = uniq(hits);
  return unique.length === 1 ? unique[0] : '';
}

function tourText(tour) {
  return norm([
    tour?.id, tour?.title, tour?.city, tour?.region, tour?.category, tour?.description,
    ...(tour?.tags || []), ...(tour?.audience || []), ...((tour?.route || []).flat()),
  ].filter(Boolean).join(' '));
}

export function tourMatchesTheme(tour, theme) {
  const hay = tourText(tour);
  if (!hay || !theme) return false;
  if (theme === 'islands') {
    const marine = /остров|море|морск|пляж|сноркл|дайв|коралл|катамаран|яхт/.test(hay);
    const cityOnly = /обзорн.{0,18}(?:нячанг|город)|городск.{0,18}(?:экскурс|тур)/.test(hay) && !marine;
    return marine && !cityOnly;
  }
  if (theme === 'city') {
    const urban = /обзор|город|достопримеч|храм|пагод|собор|музе|рынок|культур|истори/.test(hay);
    const marineOnly = /остров|сноркл|дайв|катамаран/.test(hay) && !urban;
    return urban && !marineOnly;
  }
  if (theme === 'nature') {
    return /природ|водопад|гора|каньон|дюн|озер|пещер|панорам|далат|фуйен|вид/.test(hay);
  }
  return true;
}

function allowedByOrigin(tour, origin) {
  if (!origin) return true;
  const hay = tourText(tour);
  const allowed = ORIGIN_ROUTES[origin] || [origin];
  return allowed.some(place => hay.includes(norm(place).split('/')[0]));
}

function intentScore(tour, theme, origin, preferredIds = []) {
  const hay = tourText(tour);
  let score = preferredIds.includes(String(tour?.id)) ? 30 : 0;
  if (origin && norm(tour?.city || tour?.region) === norm(origin)) score += 20;
  if (theme === 'islands') {
    if (/остров/.test(norm(tour?.title))) score += 50;
    if (/остров/.test(hay)) score += 25;
    if (/море|пляж|сноркл|дайв|коралл/.test(hay)) score += 15;
    if (/обзор|город|храм|пагод|собор|рынок/.test(hay) && !/остров/.test(hay)) score -= 80;
  } else if (theme === 'city') {
    if (/обзор/.test(norm(tour?.title))) score += 50;
    if (/город|достопримеч/.test(hay)) score += 25;
    if (/храм|пагод|собор|рынок|музе/.test(hay)) score += 12;
    if (/остров|сноркл|дайв/.test(hay) && !/город|обзор/.test(hay)) score -= 80;
  } else if (theme === 'nature') {
    if (/природ|водопад|гора|каньон|дюн|озер|пещер|панорам|далат|фуйен/.test(hay)) score += 35;
    if (/остров/.test(hay) && !/природ|вид/.test(hay)) score -= 20;
  }
  if (Number(tour?.popular)) score += 2;
  return score;
}

function canonicalPreference(theme) {
  if (theme === 'islands') return 'море и острова';
  if (theme === 'city') return 'город и культура';
  if (theme === 'nature') return 'природа и красивые виды';
  return '';
}

function normalizePreferences(preferences, theme) {
  const next = (Array.isArray(preferences) ? preferences : []).filter(value => !PRIMARY_PREFS.has(norm(value)));
  const canonical = canonicalPreference(theme);
  if (canonical) next.unshift(canonical);
  return uniq(next).slice(0, 8);
}

function referencedTourConflict(reply, catalog, theme) {
  const q = norm(reply);
  if (!q) return false;
  return catalog.some(tour => {
    const title = norm(tour?.title);
    if (title.length < 5 || !q.includes(title)) return false;
    return !tourMatchesTheme(tour, theme);
  });
}

export function applyThemeGuardPayload(payload, catalog, theme, origin) {
  if (!payload || !theme || !Array.isArray(catalog) || !catalog.length) return { payload, changed:false, allowed:[] };
  const preferredIds = uniq([payload.tourId, ...(payload.tourIds || [])]).map(String);
  const allowed = catalog
    .filter(tour => allowedByOrigin(tour, origin) && tourMatchesTheme(tour, theme))
    .map(tour => ({ tour, score:intentScore(tour, theme, origin, preferredIds) }))
    .sort((a, b) => b.score - a.score)
    .map(row => row.tour);
  if (!allowed.length) return { payload, changed:false, allowed:[] };

  const allowedIds = new Set(allowed.map(tour => String(tour.id)));
  const currentId = clean(payload.tourId, 120);
  const currentValid = currentId && allowedIds.has(currentId);
  const lead = currentValid ? allowed.find(tour => String(tour.id) === currentId) : allowed[0];
  const leadId = String(lead.id);
  const filteredIds = uniq([
    leadId,
    ...(payload.tourIds || []).map(String).filter(id => allowedIds.has(id)),
    ...allowed.slice(0, 3).map(tour => String(tour.id)),
  ]).slice(0, 3);

  const memory = payload.memory && typeof payload.memory === 'object' ? { ...payload.memory } : {};
  memory.preferences = normalizePreferences(memory.preferences, theme);
  memory.selectedTourId = leadId;

  const changed = !currentValid || filteredIds.join('|') !== (payload.tourIds || []).map(String).slice(0, 3).join('|') || referencedTourConflict(payload.reply, catalog, theme);
  return {
    changed,
    allowed,
    payload:{
      ...payload,
      tourId:leadId,
      tourIds:filteredIds,
      memory,
      intentTheme:theme,
      source:`${clean(payload.source, 120) || 'ai'}+primary-intent-v30`,
    },
  };
}

async function loadCatalog(request, env) {
  if (!env?.ASSETS) return [];
  try {
    const response = await env.ASSETS.fetch(new Request(new URL('/catalog.v28.json', request.url)));
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function stepInstruction(step) {
  if (step === 'ask_origin') return 'Спроси только город выезда.';
  if (step === 'ask_party') return 'Спроси только состав туристов.';
  if (step === 'ask_date') return 'Спроси только дату поездки.';
  if (step === 'ask_format') return 'Спроси только групповой или индивидуальный формат.';
  if (step === 'ready_to_book') return 'Предложи открыть карточку и перейти к бронированию, без нового опроса.';
  return 'Продолжи разговор без повторения уже известных вопросов.';
}

async function runRepairModel(env, message, payload, allowed, theme) {
  if (!env?.AI || !allowed.length) return '';
  const facts = allowed.slice(0, 3).map(tour => ({
    id:tour.id, title:tour.title, city:tour.city, region:tour.region, category:tour.category,
    tags:tour.tags, duration:tour.duration, time:tour.time, group:tour.group, individual:tour.individual,
  }));
  const system = [
    'Ты ИИ-консультант MAX TOUR. Пользователь только что явно уточнил тип экскурсии.',
    `Актуальный тип запроса: ${theme}.` ,
    'Используй только VERIFIED_TOURS ниже. Нельзя предлагать экскурсию другого типа, даже если она обсуждалась раньше.',
    'Не выдумывай цены, даты, наличие или условия. Максимум 1 вопрос. 1–3 коротких предложения по-русски.',
    stepInstruction(payload.nextStep),
    `MEMORY=${JSON.stringify(payload.memory || {})}`,
    `VERIFIED_TOURS=${JSON.stringify(facts)}`,
  ].join('\n');
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), 1800); });
  const call = env.AI.run(env.AI_MODEL || DEFAULT_MODEL, {
    messages:[{ role:'system', content:system }, { role:'user', content:clean(message, 900) }],
  }).catch(() => null);
  const result = await Promise.race([call, timeout]);
  clearTimeout(timer);
  const text = typeof result === 'string' ? result : (result?.response || result?.choices?.[0]?.message?.content || result?.choices?.[0]?.text || '');
  return clean(text, 1600).replace(/^```(?:text)?\s*|```$/g, '').trim();
}

function fallbackReply(theme, allowed, payload) {
  const lead = allowed[0];
  if (!lead) return clean(payload.reply, 1600);
  const title = clean(lead.title, 180);
  const prefix = theme === 'islands' ? `Для поездки на острова подходит «${title}».`
    : theme === 'city' ? `Для обзорной программы подходит «${title}».`
    : `Для природы и красивых видов подходит «${title}».`;
  const step = payload.nextStep;
  if (step === 'ask_party') return `${prefix} Сколько человек поедет?`;
  if (step === 'ask_date') return `${prefix} На какую дату смотрим?`;
  if (step === 'ask_format') return `${prefix} Хотите групповой или индивидуальный формат?`;
  if (step === 'ready_to_book') return `${prefix} Можно открыть карточку и перейти к бронированию.`;
  return prefix;
}

function sessionIdFrom(request, response) {
  const cookie = request.headers.get('cookie') || '';
  const fromRequest = cookie.match(/(?:^|;\s*)mt_v28_sid=([a-f0-9-]{20,64})/i)?.[1];
  if (fromRequest) return fromRequest;
  const setCookie = response.headers.get('set-cookie') || '';
  return setCookie.match(/mt_v28_sid=([a-f0-9-]{20,64})/i)?.[1] || '';
}

async function persistCorrectedMemory(env, sessionId, payload) {
  if (!env?.DB || !sessionId || !payload?.memory) return;
  try {
    const row = await env.DB.prepare('SELECT memory_json FROM ai_conversation_memory WHERE session_id=?').bind(sessionId).first();
    const current = row?.memory_json ? JSON.parse(row.memory_json) : {};
    const next = {
      ...current,
      ...payload.memory,
      selectedTourId:payload.tourId || payload.memory.selectedTourId || '',
      lastTourIds:Array.isArray(payload.tourIds) ? payload.tourIds : current.lastTourIds,
      lastAssistant:payload.reply || current.lastAssistant || '',
    };
    await env.DB.prepare(`INSERT INTO ai_conversation_memory(session_id,memory_json,updated_at)
      VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(session_id) DO UPDATE SET memory_json=excluded.memory_json,updated_at=CURRENT_TIMESTAMP`)
      .bind(sessionId, JSON.stringify(next)).run();
  } catch (error) {
    console.warn('primary intent memory correction unavailable', error?.message || error);
  }
}

export async function guardPrimaryIntentResponse(request, env, url, response) {
  if (url.pathname !== '/api/ai/chat' || request.method !== 'POST') return response;
  const body = await request.clone().json().catch(() => ({}));
  const theme = classifyPrimaryTheme(body?.message);
  if (!theme) return response;
  const contentType = response?.headers?.get?.('content-type') || '';
  if (!response?.ok || !contentType.includes('application/json')) return response;
  const original = await response.clone().json().catch(() => null);
  if (!original?.ok) return response;

  const catalog = await loadCatalog(request, env);
  const origin = clean(original?.memory?.origin || body?.context?.origin || '', 100);
  const guarded = applyThemeGuardPayload(original, catalog, theme, origin);
  if (!guarded.allowed.length) return response;

  let payload = guarded.payload;
  if (guarded.changed) {
    const repaired = await runRepairModel(env, body?.message, payload, guarded.allowed, theme);
    payload.reply = repaired || fallbackReply(theme, guarded.allowed, payload);
    payload.source = `${clean(payload.source, 120)}${repaired ? '+model-repair' : '+fallback-repair'}`;
  }

  await persistCorrectedMemory(env, sessionIdFrom(request, response), payload);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(payload), {
    status:response.status,
    statusText:response.statusText,
    headers,
  });
}

export const _test = { classifyPrimaryTheme, tourMatchesTheme, applyThemeGuardPayload, normalizePreferences, allowedByOrigin };
