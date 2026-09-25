import { classifyPrimaryTheme, applyThemeGuardPayload } from './ai-primary-intent-guard-v30.js';

const DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const clean = (value, max = 1600) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const norm = value => clean(value, 2400).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

function sessionIdFrom(request, response) {
  const requestCookie = request.headers.get('cookie') || '';
  const fromRequest = requestCookie.match(/(?:^|;\s*)mt_v28_sid=([a-f0-9-]{20,64})/i)?.[1];
  if (fromRequest) return fromRequest;
  const setCookie = response.headers.get('set-cookie') || '';
  return setCookie.match(/mt_v28_sid=([a-f0-9-]{20,64})/i)?.[1] || '';
}

export function shouldClearStickyTheme(message) {
  const q = norm(message);
  if (!q) return false;
  if (/(?:сброс|начать заново|другая экскурсия|другое направление|сменить направление|не остров|не город|не природа)/.test(q)) return true;
  return /(?:хочу|поех|съезд|давай|покаж|интересует).{0,35}(?:далат|фу[йи]ен|муйне|фантьет|халонг|ниньбинь|хойан|дананг|ханой|фукуок)/.test(q);
}

async function readStoredMemory(env, sessionId) {
  if (!env?.DB || !sessionId) return {};
  try {
    const row = await env.DB.prepare('SELECT memory_json FROM ai_conversation_memory WHERE session_id=?').bind(sessionId).first();
    return row?.memory_json ? JSON.parse(row.memory_json) : {};
  } catch (_) {
    return {};
  }
}

async function writeStoredMemory(env, sessionId, patch) {
  if (!env?.DB || !sessionId) return;
  try {
    const current = await readStoredMemory(env, sessionId);
    const next = { ...current, ...patch };
    await env.DB.prepare(`INSERT INTO ai_conversation_memory(session_id,memory_json,updated_at)
      VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(session_id) DO UPDATE SET memory_json=excluded.memory_json,updated_at=CURRENT_TIMESTAMP`)
      .bind(sessionId, JSON.stringify(next)).run();
  } catch (error) {
    console.warn('sticky intent memory unavailable', error?.message || error);
  }
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

function fallbackReply(theme, lead, step) {
  if (!lead) return '';
  const title = clean(lead.title, 180);
  const first = theme === 'islands' ? `Остаёмся на островном варианте — «${title}».`
    : theme === 'city' ? `Остаёмся на обзорной программе — «${title}».`
    : `Остаёмся на варианте с природой — «${title}».`;
  if (step === 'ask_party') return `${first} Сколько человек поедет?`;
  if (step === 'ask_date') return `${first} На какую дату смотрим?`;
  if (step === 'ask_format') return `${first} Какой формат нужен: групповой или индивидуальный?`;
  if (step === 'ready_to_book') return `${first} Можно перейти к карточке и бронированию.`;
  return first;
}

async function repairWithModel(env, message, payload, theme, allowed) {
  if (!env?.AI || !allowed.length) return '';
  const tours = allowed.slice(0, 3).map(tour => ({
    id:tour.id, title:tour.title, city:tour.city, category:tour.category, tags:tour.tags,
    group:tour.group, individual:tour.individual,
  }));
  const system = [
    'Ты ИИ-консультант MAX TOUR.',
    `В текущем диалоге пользователь уже выбрал тему ${theme}; это решение действует, пока он явно не сменит направление.`,
    'Не возвращайся к экскурсии другой темы из более ранних сообщений.',
    'Используй только VERIFIED_TOURS. Не выдумывай цены, даты или наличие.',
    'Ответ 1–3 коротких предложения, максимум один вопрос. Верни только обычный текст без JSON.',
    `NEXT_STEP=${clean(payload.nextStep, 80)}`,
    `MEMORY=${JSON.stringify(payload.memory || {})}`,
    `VERIFIED_TOURS=${JSON.stringify(tours)}`,
  ].join('\n');
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), 1800); });
  const call = env.AI.run(env.AI_MODEL || DEFAULT_MODEL, {
    messages:[{ role:'system', content:system }, { role:'user', content:clean(message, 900) }],
  }).catch(() => null);
  const result = await Promise.race([call, timeout]);
  clearTimeout(timer);
  let text = typeof result === 'string' ? result : (result?.response || result?.choices?.[0]?.message?.content || result?.choices?.[0]?.text || '');
  text = clean(text, 1600).replace(/^```(?:text)?\s*|```$/g, '').trim();
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      text = clean(parsed.reply || parsed.response || '', 1600);
    } catch (_) {}
  }
  return text;
}

export async function guardStickyIntentResponse(request, env, url, response) {
  if (url.pathname !== '/api/ai/chat' || request.method !== 'POST') return response;
  const contentType = response?.headers?.get?.('content-type') || '';
  if (!response?.ok || !contentType.includes('application/json')) return response;
  const body = await request.clone().json().catch(() => ({}));
  const explicitTheme = classifyPrimaryTheme(body?.message);
  const sessionId = sessionIdFrom(request, response);

  if (shouldClearStickyTheme(body?.message) && !explicitTheme) {
    await writeStoredMemory(env, sessionId, { primaryTheme:'' });
    return response;
  }

  const original = await response.clone().json().catch(() => null);
  if (!original?.ok) return response;
  const stored = await readStoredMemory(env, sessionId);
  const theme = explicitTheme || clean(original.intentTheme || stored.primaryTheme, 40);
  if (!theme) return response;

  const catalog = await loadCatalog(request, env);
  const origin = clean(original?.memory?.origin || body?.context?.origin || '', 100);
  const guarded = applyThemeGuardPayload(original, catalog, theme, origin);
  if (!guarded.allowed.length) return response;

  let payload = guarded.payload;
  if (guarded.changed && !explicitTheme) {
    const repaired = await repairWithModel(env, body?.message, payload, theme, guarded.allowed);
    payload.reply = repaired || fallbackReply(theme, guarded.allowed[0], payload.nextStep) || payload.reply;
    payload.source = `${clean(payload.source, 120)}${repaired ? '+sticky-model-repair' : '+sticky-fallback-repair'}`;
  }

  await writeStoredMemory(env, sessionId, {
    primaryTheme:theme,
    selectedTourId:payload.tourId || stored.selectedTourId || '',
    lastTourIds:Array.isArray(payload.tourIds) ? payload.tourIds : stored.lastTourIds,
    preferences:payload?.memory?.preferences || stored.preferences,
    lastAssistant:payload.reply || stored.lastAssistant || '',
  });

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(payload), {
    status:response.status,
    statusText:response.statusText,
    headers,
  });
}

export const _test = { shouldClearStickyTheme, fallbackReply };
