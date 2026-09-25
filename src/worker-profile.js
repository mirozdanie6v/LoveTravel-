import baseWorker from './worker.js';
import { compactTourForAi, deterministicFaqReply } from './ai-faq-knowledge.js';

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { 'content-type':'application/json; charset=utf-8', ...(init.headers || {}) },
});

function parseCookie(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim()).filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return i < 0 ? [part, ''] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
}

async function ensureSession(request, env) {
  const cookies = parseCookie(request.headers.get('cookie') || '');
  const existing = /^[a-f0-9-]{20,64}$/i.test(cookies.mt_v28_sid || '') ? cookies.mt_v28_sid : null;
  const id = existing || crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO sessions(id) VALUES(?) ON CONFLICT(id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP`).bind(id).run();
  return { id, fresh: !existing };
}

function withSession(response, session) {
  if (!session?.fresh) return response;
  const headers = new Headers(response.headers);
  headers.append('set-cookie', `mt_v28_sid=${encodeURIComponent(session.id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
  return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
}

function vietnamTodayIso() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function vietnamDateLabel(iso) {
  return new Intl.DateTimeFormat('ru-RU', { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

const MONTHS = [
  ['январ',1],['феврал',2],['март',3],['апрел',4],['май',5],['мая',5],['июн',6],['июл',7],['август',8],['сентябр',9],['октябр',10],['ноябр',11],['декабр',12],
];

function isoFromParts(day, month, year) {
  const y = Number(year);
  const d = new Date(Date.UTC(y, Number(month) - 1, Number(day)));
  if (Number.isNaN(d.valueOf()) || d.getUTCDate() !== Number(day) || d.getUTCMonth() !== Number(month) - 1) return '';
  return d.toISOString().slice(0,10);
}

function containsPastDate(text, today = vietnamTodayIso()) {
  const source = String(text || '');
  for (const match of source.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)) if (match[1] < today) return true;
  for (const match of source.matchAll(/(?:^|[^\d])(\d{1,2})[./-](\d{1,2})[./-](20\d{2})(?:[^\d]|$)/g)) {
    const iso = isoFromParts(match[1], match[2], match[3]); if (iso && iso < today) return true;
  }
  const currentYear = Number(today.slice(0,4));
  const q = source.toLocaleLowerCase('ru-RU');
  const named = /(?:^|[^а-яё])(\d{1,2})\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-яё]*(?:\s+(20\d{2}))?/g;
  for (const match of q.matchAll(named)) {
    const month = MONTHS.find(([stem]) => match[2].startsWith(stem))?.[1];
    const iso = month ? isoFromParts(match[1], month, match[3] || currentYear) : '';
    if (iso && iso < today) return true;
  }
  return false;
}

function pastDateReply(today = vietnamTodayIso()) {
  return `Эта дата уже прошла. Сегодня во Вьетнаме ${vietnamDateLabel(today)}. Могу предложить только сегодняшние и будущие даты — напишите удобный день, и я покажу актуальные варианты.`;
}

function clean(value, max = 1200) {
  return String(value ?? '').trim().slice(0, max);
}

async function loadFaqCatalog(request, env) {
  try {
    if (!env.ASSETS) return [];
    const response = await env.ASSETS.fetch(new Request(new URL('/catalog.v28.json', request.url)));
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data.slice(0, 40).map(compactTourForAi) : [];
  } catch (error) {
    console.warn('FAQ catalogue unavailable', error?.message || error);
    return [];
  }
}

function fastDeterministicReply(body = {}) {
  const message = clean(body?.message, 900);
  const q = message.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

  if (/(?:я|мы|сейчас|нахожусь|находимся|выезд|старт).*хано(?:й|е|я)(?:$|[^а-яa-z])/i.test(q)) {
    return 'Хорошо, выезд из Ханоя. Могу подобрать Ниньбинь, Халонг, обзор Ханоя или другой доступный маршрут.';
  }
  if (/(?:я|мы|сейчас|нахожусь|находимся|выезд|старт).*нячанг(?:е|а)?(?:$|[^а-яa-z])/i.test(q)) {
    return 'Хорошо, выезд из Нячанга. Могу подобрать острова, Нячанг, Далат, Фуйен и другие доступные маршруты.';
  }
  if (/(?:я|мы|сейчас|нахожусь|находимся|выезд|старт).*дананг(?:е|а)?(?:$|[^а-яa-z])/i.test(q)) {
    return 'Хорошо, выезд из Дананга. Могу подобрать Дананг, Хойан и другие доступные варианты.';
  }
  if (/(?:я|мы|сейчас|нахожусь|находимся).*фу\s*куок(?:е|а)?(?:$|[^а-яa-z])/i.test(q)) {
    return 'Хорошо, вы на Фукуоке. Подберу варианты с выездом с острова — скажите, что интереснее: море, природа или обзорная программа.';
  }
  if (/нинь\s*бинь|ниньбинь|ninh\s*binh/.test(q)) {
    return 'Ниньбинь можно подобрать с выездом из Ханоя. Если готовой карточки с подтверждённой ценой сейчас нет, покажу маршрут по запросу и уточню только дату и состав группы.';
  }
  if (/ха\s*лонг|халонг|ha\s*long/.test(q)) {
    return 'Халонг можно подобрать с выездом из Ханоя. Уточните дату и сколько человек едет — покажу подходящий вариант.';
  }
  return '';
}

function conversationUserText(body = {}) {
  const history = Array.isArray(body?.history) ? body.history : [];
  return [...history.filter(item => item?.role === 'user').map(item => clean(item?.text, 700)), clean(body?.message, 900)]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

function inferredOrigin(body = {}) {
  const q = conversationUserText(body);
  const patterns = [
    ['Нячанг', /(?:я|мы|сейчас|нахожусь|находимся|живу|живем|выезд|старт|отправляемся|едем из)[^.!?]{0,50}нячанг(?:е|а)?(?:$|[^а-яa-z])/i],
    ['Дананг', /(?:я|мы|сейчас|нахожусь|находимся|живу|живем|выезд|старт|отправляемся|едем из)[^.!?]{0,50}дананг(?:е|а)?(?:$|[^а-яa-z])/i],
    ['Ханой', /(?:я|мы|сейчас|нахожусь|находимся|живу|живем|выезд|старт|отправляемся|едем из)[^.!?]{0,50}хано(?:й|е|я)(?:$|[^а-яa-z])/i],
    ['Фукуок', /(?:я|мы|сейчас|нахожусь|находимся|живу|живем|выезд|старт|отправляемся|едем из)[^.!?]{0,50}фу\s*куок(?:е|а)?(?:$|[^а-яa-z])/i],
    ['Муйне', /(?:я|мы|сейчас|нахожусь|находимся|живу|живем|выезд|старт|отправляемся|едем из)[^.!?]{0,50}(?:муйне|фантьет(?:е|а)?)(?:$|[^а-яa-z])/i],
  ];
  return patterns.find(([, pattern]) => pattern.test(q))?.[0] || '';
}

function hasKnownPeople(context = {}) {
  const value = clean(context?.people, 120).toLocaleLowerCase('ru-RU');
  return Boolean(value && !/не указан|неизвест|состав/.test(value));
}

function hasKnownInterest(context = {}) {
  const values = Array.isArray(context?.preferences) ? context.preferences : [];
  return values.some(value => /море|остров|природ|вид|город|обзор|истор|культур|пляж|горы/i.test(clean(value, 120)));
}

function lastAssistantText(body = {}) {
  const history = Array.isArray(body?.history) ? body.history : [];
  const replies = history.filter(item => item?.role === 'assistant' || item?.role === 'bot').map(item => clean(item?.text, 900)).filter(Boolean);
  return replies.at(-1) || '';
}

function chooseHumanQuestion(body, variants) {
  const list = (Array.isArray(variants) ? variants : []).filter(Boolean);
  if (!list.length) return 'Что вам сейчас важнее уточнить?';
  const previous = lastAssistantText(body).toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ').trim();
  const historySize = Array.isArray(body?.history) ? body.history.length : 0;
  const seed = historySize + clean(body?.message, 900).length;
  for (let offset = 0; offset < list.length; offset += 1) {
    const candidate = list[(seed + offset) % list.length];
    const normalized = candidate.toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ').trim();
    if (!previous || normalized !== previous) return candidate;
  }
  return list[0];
}

function explicitPreference(body = {}) {
  const q = clean(body?.message, 900).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (/подешев|дешев|бюджет|эконом|не\s+переплач|минимальн[^.!?]{0,16}цен|цен[ау][^.!?]{0,16}важн/.test(q)) return 'budget';
  if (/интересн[^.!?]{0,16}программ|насыщенн|максимум[^.!?]{0,20}(?:посмотр|увид)|ярк[^.!?]{0,16}программ/.test(q)) return 'program';
  if (/комфорт|премиум|vip|вип/.test(q)) return 'comfort';
  return '';
}

function preferenceReply(body, preference, nextField = '') {
  const suffix = nextField ? ` ${nextField}` : '';
  if (preference === 'budget') return chooseHumanQuestion(body, [
    `Поняла, тогда ориентируемся на цену.${suffix}`,
    `Хорошо, ищем без переплаты.${suffix}`,
    `Тогда в приоритете самые доступные варианты.${suffix}`,
    `Принято — сначала смотрим, где выгоднее.${suffix}`,
  ]);
  if (preference === 'program') return chooseHumanQuestion(body, [
    `Поняла, тогда важнее сама программа.${suffix}`,
    `Хорошо, смотрим самые интересные и насыщенные варианты.${suffix}`,
    `Тогда экономить на впечатлениях не будем — выбираем по программе.${suffix}`,
  ]);
  if (preference === 'comfort') return chooseHumanQuestion(body, [
    `Поняла, ставим комфорт выше минимальной цены.${suffix}`,
    `Хорошо, тогда смотрим более комфортные варианты.${suffix}`,
    `Принято — приоритет комфорту.${suffix}`,
  ]);
  return '';
}

function interestAwareNextQuestion(body, origin, date, peopleKnown) {
  if (!peopleKnown) return chooseHumanQuestion(body, [
    'Сколько человек едет?',
    'Вы вдвоём или компанией?',
    'Сколько вас будет? Если едут дети, тоже скажите — это влияет на цену.',
  ]);
  if (!date) return chooseHumanQuestion(body, [
    'На какой день планируете поездку?',
    `Когда хотите поехать? Подберу актуальные варианты с выездом из ${origin}.`,
    'Дата уже есть или пока можно смотреть ближайшие дни?',
  ]);
  return chooseHumanQuestion(body, [
    'Подходящие варианты уже показываю ниже. Хотите групповой формат или индивидуальный?',
    'По интересам и составу всё понятно. Рассматривать группу или отдельную машину только для вас?',
  ]);
}

function timeoutFallback(body = {}) {
  const deterministic = fastDeterministicReply(body);
  if (deterministic) return deterministic;
  const q = clean(body?.message, 900).toLocaleLowerCase('ru-RU');
  if (/отмен|перенос|возврат/.test(q)) return 'Подскажу по правилам отмены и переноса. Назовите дату и время выезда — расчёт зависит от того, сколько осталось до экскурсии.';
  if (/оплат|депозит|предоплат/.test(q)) return 'Можно оплатить депозит или полную стоимость. Точная сумма и доступный способ оплаты показываются при оформлении выбранной экскурсии.';

  const context = body?.context || {};
  const origin = inferredOrigin(body);
  const destination = clean(context?.destination, 100);
  const date = clean(context?.date, 100);
  const peopleKnown = hasKnownPeople(context);
  const interestKnown = hasKnownInterest(context);
  const preference = explicitPreference(body);

  if (preference && !origin) return preferenceReply(body, preference, 'Откуда планируете ехать?');
  if (preference && !destination) return preferenceReply(body, preference, `Из ${origin} куда хочется поехать?`);
  if (preference && !date) return preferenceReply(body, preference, 'На какой день планируете поездку?');
  if (preference && !peopleKnown) return preferenceReply(body, preference, 'Сколько вас будет?');
  if (preference) return preferenceReply(body, preference, 'Подходящие варианты уже показываю ниже.');

  if (!origin) {
    return chooseHumanQuestion(body, [
      'Откуда планируете ехать?',
      'А вы сейчас где — в Нячанге, Дананге, Ханое или в другом городе?',
      'С какого города начинаем поездку?',
      'Где вы сейчас находитесь? От этого сразу пойму, какие экскурсии реально подходят.',
    ]);
  }

  if (!destination && interestKnown) {
    return interestAwareNextQuestion(body, origin, date, peopleKnown);
  }

  if (!destination) {
    return chooseHumanQuestion(body, [
      `Выезжаем из ${origin}. Куда хочется больше — к морю, в горы или посмотреть город?`,
      `Поняла, стартуем из ${origin}. Что вам сейчас больше интересно: природа, море или что-то историческое?`,
      `Из ${origin} вариантов много. Какой отдых хочется — спокойный, насыщенный или с красивыми видами?`,
      `Хорошо, ${origin}. Есть направление, которое уже присмотрели, или подобрать по настроению?`,
    ]);
  }

  if (!date) {
    return chooseHumanQuestion(body, [
      `Когда хотите поехать в ${destination}?`,
      `На какой день смотрим ${destination}?`,
      `По ${destination} поняла. Дата уже есть или пока выбираете?`,
      `Хорошо, ${destination}. Когда вам удобно ехать?`,
    ]);
  }

  if (!peopleKnown) {
    return chooseHumanQuestion(body, [
      'Сколько вас будет?',
      'Вы вдвоём или компанией?',
      'А сколько человек едет? Если есть дети, тоже скажите — это влияет на цену.',
      'Кто едет с вами — только взрослые или будут дети?',
    ]);
  }

  return chooseHumanQuestion(body, [
    'Что для вас важнее при выборе — цена, комфорт или чтобы программа была максимально насыщенной?',
    'По основным данным всё понятно. Хотите спокойный вариант или чтобы за день посмотреть максимум?',
    'Тогда ещё один момент: больше цените комфорт или яркую насыщенную программу?',
    'Поняла. Вы бы выбрали вариант подешевле или тот, где программа интереснее, даже если чуть дороже?',
  ]);
}

async function safeAiChat(request, env) {
  const copy = request.clone();
  const body = await copy.json().catch(() => ({}));
  const today = vietnamTodayIso();
  const selectedDate = String(body?.context?.date || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(selectedDate) && selectedDate < today) {
    return json({ ok:true, reply:pastDateReply(today), source:'date-guard', currentDateVietnam:today });
  }

  const faqCatalog = await loadFaqCatalog(request, env);
  const faq = deterministicFaqReply(body?.message, faqCatalog, { context:body?.context, history:body?.history });
  if (faq?.reply) {
    return json({
      ok:true,
      reply:faq.reply,
      source:'faq-verified',
      faqIntent:faq.intent,
      tourId:faq.tourId || '',
      currentDateVietnam:today,
    });
  }

  const instant = fastDeterministicReply(body);
  if (instant) {
    return json({ ok:true, reply:instant, source:'fast-path', currentDateVietnam:today });
  }

  const timeoutMs = Math.max(2500, Math.min(10000, Number(env.AI_CHAT_TIMEOUT_MS) || 6500));
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const response = await Promise.race([baseWorker.fetch(request, env), timeout]);
  clearTimeout(timer);

  if (!response) {
    return json({ ok:true, reply:timeoutFallback(body), source:'timeout-fallback', currentDateVietnam:today });
  }
  if (!response.ok) return response;
  const data = await response.clone().json().catch(() => null);
  if (!data?.reply || !containsPastDate(data.reply, today)) return response;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(JSON.stringify({ ...data, reply:pastDateReply(today), source:'date-guard', currentDateVietnam:today }), {
    status:response.status, statusText:response.statusText, headers,
  });
}

const travelerKey = t => `${String(t.fullName || '').trim().toLowerCase()}|${String(t.birthDate || '').trim()}`;

function normalizeTravelers(travelers) {
  const cleanTravelers = [];
  const seen = new Set();
  for (const item of Array.isArray(travelers) ? travelers : []) {
    const fullName = String(item?.fullName || '').trim();
    const birthDate = String(item?.birthDate || '').trim();
    if (!fullName || !birthDate) continue;
    const key = `${fullName.toLowerCase()}|${birthDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleanTravelers.push({
      role: String(item?.role || 'adult'),
      label: String(item?.label || 'Попутчик'),
      fullName,
      birthDate,
      primary: !!item?.primary,
    });
  }

  let primaryIndex = cleanTravelers.findIndex(t => t.primary && t.role === 'adult');
  if (primaryIndex < 0) primaryIndex = cleanTravelers.findIndex(t => t.role === 'adult');
  if (primaryIndex < 0 && cleanTravelers.length) primaryIndex = 0;
  cleanTravelers.forEach((t, index) => {
    t.primary = index === primaryIndex;
    if (t.primary) t.label = 'Основной путешественник';
    else if (t.role === 'adult') t.label = 'Попутчик · взрослый';
    else if (t.role === 'child') t.label = 'Попутчик · ребёнок';
    else t.label = 'Попутчик · малыш';
  });
  return cleanTravelers;
}

async function replaceTravelers(env, sid, travelers) {
  const normalized = normalizeTravelers(travelers);
  const statements = [env.DB.prepare('DELETE FROM travelers WHERE session_id=?').bind(sid)];
  for (const t of normalized) {
    statements.push(env.DB.prepare(`INSERT INTO travelers(session_id,traveler_key,role,label,full_name,birth_date,primary_flag)
      VALUES(?,?,?,?,?,?,?)`).bind(sid, travelerKey(t), t.role, t.label, t.fullName, t.birthDate, t.primary ? 1 : 0));
  }
  await env.DB.batch(statements);
  return normalized;
}

export const _test = { vietnamTodayIso, containsPastDate, pastDateReply, fastDeterministicReply, timeoutFallback, loadFaqCatalog };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ai/chat' && request.method === 'POST') {
      try { return await safeAiChat(request, env); }
      catch (error) { console.error(error); return json({ ok:false, error:'internal_error' }, { status:500 }); }
    }
    if (url.pathname === '/api/travelers' && request.method === 'PUT') {
      try {
        const session = await ensureSession(request, env);
        const payload = await request.json().catch(() => ({}));
        const travelers = await replaceTravelers(env, session.id, payload.travelers || []);
        return withSession(json({ ok:true, travelers }), session);
      } catch (error) {
        console.error(error);
        return json({ ok:false, error:'internal_error' }, { status:500 });
      }
    }
    return baseWorker.fetch(request, env);
  },
};