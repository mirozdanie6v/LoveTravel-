import {
  MAX_TOUR_GLOBAL_FACTS,
  compactTourForAi,
  deterministicFaqReply,
  findTourForQuestion,
} from './ai-faq-knowledge.js';
import { isCityOverviewIntent, chooseCityOverviewTour } from './ai-city-overview-polish-v27.js';

const DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MAX_HISTORY = 12;
const MODEL_TIMEOUT_MS = 3600;
const REPAIR_TIMEOUT_MS = 2200;

const clean = (value, max = 1200) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const norm = value => clean(value, 2400).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const uniq = values => [...new Set((Array.isArray(values) ? values : []).map(value => clean(value, 100)).filter(Boolean))];

const CITY_PATTERNS = [
  ['Нячанг', /(?:нячанг(?:е|а|у|ом)?|на-?чанг(?:е|а|у|ом)?|nha\s*trang)/iu],
  ['Ханой', /(?:хано(?:й|е|я|ю|ем)|hanoi)/iu],
  ['Дананг', /(?:дананг(?:е|а|у|ом)?|да-?нанг(?:е|а|у|ом)?|da\s*nang)/iu],
  ['Фукуок', /(?:фу\s*куок(?:е|а|у|ом)?|фукуок(?:е|а|у|ом)?|phu\s*quoc)/iu],
  ['Муйне/Фантьет', /(?:муй\s*не|муйне|фан\s*тьет(?:е|а|у|ом)?|фантьет(?:е|а|у|ом)?|mui\s*ne|phan\s*thiet)/iu],
  ['Далат', /(?:далат(?:е|а|у|ом)?|da\s*lat)/iu],
  ['Фуйен', /(?:фу[йи]ен(?:е|а|у|ом)?|туй\s*хоа|phu\s*yen|tuy\s*hoa)/iu],
  ['Хойан', /(?:хой\s*ан(?:е|а|у|ом)?|хойан(?:е|а|у|ом)?|hoi\s*an)/iu],
  ['Халонг', /(?:ха\s*лонг(?:е|а|у|ом)?|халонг(?:е|а|у|ом)?|ha\s*long)/iu],
  ['Ниньбинь', /(?:нинь\s*бинь|ниньбинь|ninh\s*binh)/iu],
];

const ORIGIN_ROUTES = {
  'Нячанг': ['Нячанг', 'Далат', 'Фуйен', 'Муйне/Фантьет'],
  'Ханой': ['Ханой', 'Ниньбинь', 'Халонг'],
  'Дананг': ['Дананг', 'Хойан'],
  'Фукуок': ['Фукуок'],
  'Муйне/Фантьет': ['Муйне/Фантьет'],
};

const PARTY_WORDS = {
  один:1, одна:1, одного:1,
  два:2, две:2, двое:2, двоих:2, вдвоем:2,
  три:3, трое:3, троих:3,
  четыре:4, четверо:4, четверых:4,
  пять:5, пятеро:5,
  шесть:6, шестеро:6,
  семь:7, семеро:7,
  восемь:8, девять:9, десять:10,
};

function vietnamTodayIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addIsoDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function parseCookie(header = '') {
  return Object.fromEntries(String(header || '').split(';').map(value => value.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

async function ensureSession(request, env) {
  const cookies = parseCookie(request.headers.get('cookie') || '');
  const existing = /^[a-f0-9-]{20,64}$/i.test(cookies.mt_v28_sid || '') ? cookies.mt_v28_sid : '';
  const id = existing || crypto.randomUUID();
  if (env.DB) {
    await env.DB.prepare('INSERT INTO sessions(id) VALUES(?) ON CONFLICT(id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP').bind(id).run();
  }
  return { id, fresh:!existing };
}

function withSession(response, session) {
  if (!session?.fresh) return response;
  const headers = new Headers(response.headers);
  headers.append('set-cookie', `mt_v28_sid=${encodeURIComponent(session.id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
  return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
}

function freshMemory() {
  return {
    origin:'', pickup:'', destination:'', preferences:[], adults:0, children:[], infants:0,
    date:'', dateFlexible:false, format:'', selectedTourId:'', lastTourIds:[],
    lastAssistant:'', turn:0,
  };
}

async function loadMemory(env, sessionId) {
  if (!env.DB) return freshMemory();
  try {
    const row = await env.DB.prepare('SELECT memory_json FROM ai_conversation_memory WHERE session_id=?').bind(sessionId).first();
    if (!row?.memory_json) return freshMemory();
    const parsed = JSON.parse(row.memory_json);
    return { ...freshMemory(), ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch (error) {
    console.warn('AI memory unavailable', error?.message || error);
    return freshMemory();
  }
}

async function saveMemory(env, sessionId, memory) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`INSERT INTO ai_conversation_memory(session_id,memory_json,updated_at)
      VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(session_id) DO UPDATE SET memory_json=excluded.memory_json,updated_at=CURRENT_TIMESTAMP`)
      .bind(sessionId, JSON.stringify(memory)).run();
  } catch (error) {
    console.warn('AI memory save unavailable', error?.message || error);
  }
}

async function loadCatalog(request, env) {
  try {
    if (!env.ASSETS) return [];
    const response = await env.ASSETS.fetch(new Request(new URL('/catalog.v28.json', request.url)));
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data.slice(0, 80).map(compactTourForAi) : [];
  } catch (error) {
    console.warn('AI orchestrator catalogue unavailable', error?.message || error);
    return [];
  }
}

function cityFrom(text) {
  const value = clean(text, 900);
  return CITY_PATTERNS.find(([, pattern]) => pattern.test(value))?.[0] || '';
}

function explicitOrigin(text) {
  const value = clean(text, 900);
  const city = cityFrom(value);
  if (/\b(?:oceanus|океанус)\b/iu.test(value) && /(?:из|от|отель|отеля|забер|трансфер|выезд|старт)/iu.test(value)) return 'Нячанг';
  if (!city) return '';
  const cue = /(?:^|[\s,;:.!?])(?:я|мы)\s+(?:сейчас\s+)?(?:в|на)(?:\s+|$)|(?:выезд|старт|отправляемся|едем)\s+(?:будет\s+)?из(?:\s+|$)|(?:^|[\s,;:.!?])из(?:\s+|$)(?:города\s+)?|(?:нет|точнее|поправка|все-?таки|всё-?таки)[^.!?]{0,35}(?:выезд|старт)?\s*из(?:\s+|$)/iu;
  return cue.test(value) ? city : '';
}

function explicitDestination(text, origin = '') {
  const value = clean(text, 900);
  if (!/(?:хочу|поех|съезд|экскурс|тур|маршрут|посет|посмотр)/iu.test(value)) return '';
  const cities = CITY_PATTERNS.filter(([, pattern]) => pattern.test(value)).map(([name]) => name);
  return cities.find(city => city !== origin) || (cities[0] && cities[0] !== origin ? cities[0] : '');
}

function extractPickup(text) {
  const value = clean(text, 900);
  if (/\b(?:oceanus|океанус)\b/iu.test(value)) return 'Oceanus';
  const match = value.match(/(?:из|от)\s+(?:отеля|гостиницы|апартаментов?)\s+([^,.!?]{2,80})/iu);
  return clean(match?.[1] || '', 100);
}

function numberWord(value) {
  const q = norm(value);
  if (/^\d+$/.test(q)) return Number(q);
  return PARTY_WORDS[q] || 0;
}

function parsePeopleText(text) {
  const q = norm(text);
  let adults = 0;
  let children = [];
  let infants = 0;
  if (/\bвдвоем\b/.test(q)) adults = 2;
  const adultMatch = q.match(/(\d{1,2}|один|одна|два|две|двое|двоих|три|трое|четыре|четверо|пять|шесть|семь)\s*(?:взросл)/);
  if (adultMatch) adults = numberWord(adultMatch[1]);
  const totalMatch = q.match(/(?:нас|едем|поедем|всего)\s*(\d{1,2}|один|одна|два|две|двое|двоих|три|трое|четыре|четверо|пять|шесть|семь)/);
  if (!adults && totalMatch) adults = numberWord(totalMatch[1]);
  const childAges = [...q.matchAll(/(?:ребен\w*|дет\w*)[^\d]{0,12}(\d{1,2})\s*(?:лет|года|год)/g)].map(match => Number(match[1])).filter(age => age > 0 && age < 18);
  if (childAges.length) children = childAges;
  else if (/ребен|дет/.test(q)) children = [8];
  const infantMatch = q.match(/(\d{1,2})\s*(?:малыш|младен)/);
  if (infantMatch) infants = Number(infantMatch[1]) || 0;
  return { adults, children, infants };
}

function parseDate(text, today = vietnamTodayIso()) {
  const q = norm(text);
  if (/сегодня/.test(q)) return { date:today, flexible:false };
  if (/завтра/.test(q)) return { date:addIsoDays(today, 1), flexible:false };
  if (/дата гибк|неважно когда|по датам гибк/.test(q)) return { date:'Дата гибкая', flexible:true };
  const iso = q.match(/(?:^|\D)(20\d{2}-\d{2}-\d{2})(?:\D|$)/)?.[1];
  if (iso) return { date:iso, flexible:false };
  const numeric = q.match(/(?:^|\D)(\d{1,2})[./-](\d{1,2})(?:[./-](20\d{2}))?(?:\D|$)/);
  if (numeric) {
    const year = Number(numeric[3] || today.slice(0,4));
    const date = new Date(Date.UTC(year, Number(numeric[2]) - 1, Number(numeric[1])));
    if (!Number.isNaN(date.valueOf())) return { date:date.toISOString().slice(0,10), flexible:false };
  }
  return null;
}

function parsePreferences(text, current = []) {
  const q = norm(text);
  const values = new Set(uniq(current));
  if (/море|пляж|остров|сноркл|купани|лодк/.test(q)) values.add('море и острова');
  if (/природ|красив|вид|гора|водопад|фото/.test(q)) values.add('природа и красивые виды');
  if (/город|обзор|храм|культур|истори|музе/.test(q)) values.add('город и культура');
  if (/подешев|дешев|бюджет|эконом|не переплач/.test(q)) {
    values.delete('комфорт / премиум');
    values.add('выгодная цена');
  }
  if (/премиум|vip|вип|комфорт/.test(q)) {
    values.delete('выгодная цена');
    values.add('комфорт / премиум');
  }
  if (/насыщенн|интересн.{0,15}программ|максимум.{0,20}(?:увид|посмотр)/.test(q)) values.add('насыщенная программа');
  return [...values].slice(0, 8);
}

function mergeClientContext(memory, context = {}) {
  const next = { ...memory };
  const origin = clean(context.origin, 100);
  if (origin) next.origin = origin;
  const pickup = clean(context.pickup, 100);
  if (pickup) next.pickup = pickup;
  const destination = clean(context.destination, 100);
  if (destination && destination !== next.origin) next.destination = destination;
  const date = clean(context.date, 100);
  if (date) next.date = date;
  const format = clean(context.format, 50);
  if (format && !/compare/i.test(format)) next.format = format;
  if (Array.isArray(context.preferences) && context.preferences.length) next.preferences = uniq([...next.preferences, ...context.preferences]).slice(0, 8);
  const people = norm(context.people);
  if (people && !/не указан|неизвест/.test(people)) {
    const parsed = parsePeopleText(people);
    if (parsed.adults) next.adults = parsed.adults;
    if (parsed.children.length) next.children = parsed.children;
    if (parsed.infants) next.infants = parsed.infants;
  }
  const tourId = clean(context.tourId || context.selectedTourId, 120);
  if (tourId) next.selectedTourId = tourId;
  return next;
}

function absorbMessage(memory, message) {
  const next = { ...memory, children:[...(memory.children || [])], preferences:[...(memory.preferences || [])] };
  const origin = explicitOrigin(message);
  if (origin) {
    const changed = next.origin && next.origin !== origin;
    next.origin = origin;
    if (next.destination === origin) next.destination = '';
    if (changed) {
      next.destination = '';
      next.selectedTourId = '';
      next.lastTourIds = [];
    }
  }
  const pickup = extractPickup(message);
  if (pickup) {
    next.pickup = pickup;
    if (/oceanus|океанус/iu.test(pickup)) next.origin = 'Нячанг';
  }
  const destination = explicitDestination(message, next.origin);
  if (destination) next.destination = destination;
  const people = parsePeopleText(message);
  if (people.adults) next.adults = people.adults;
  if (people.children.length) next.children = people.children;
  if (people.infants) next.infants = people.infants;
  const parsedDate = parseDate(message);
  if (parsedDate) {
    next.date = parsedDate.date;
    next.dateFlexible = parsedDate.flexible;
  }
  const q = norm(message);
  if (/индив|своей компанией|без группы|частн/.test(q)) next.format = 'individual';
  if (/групп|присоедин|сборн/.test(q)) next.format = 'group';
  next.preferences = parsePreferences(message, next.preferences);
  return next;
}

function totalPeople(memory) {
  return Math.max(0, Number(memory.adults) || 0) + (Array.isArray(memory.children) ? memory.children.length : 0) + Math.max(0, Number(memory.infants) || 0);
}

function tourText(tour) {
  return norm(`${tour.title || ''} ${tour.city || ''} ${tour.region || ''} ${tour.category || ''} ${(tour.tags || []).join(' ')} ${(tour.audience || []).join(' ')} ${(tour.route || []).flat().join(' ')}`);
}

function allowedByOrigin(tour, origin) {
  if (!origin) return true;
  const hay = tourText(tour);
  const allowed = ORIGIN_ROUTES[origin] || [origin];
  return allowed.some(place => hay.includes(norm(place).split('/')[0]));
}

function priceNumber(value) {
  const match = String(value || '').match(/\$\s*([\d,.]+)/);
  return match ? Number(match[1].replace(/,/g, '')) || 0 : 0;
}

function scoreTour(tour, memory) {
  const hay = tourText(tour);
  let score = Number(tour.popular) ? 2 : 0;
  if (memory.origin && norm(tour.city || tour.region) === norm(memory.origin)) score += 8;
  if (memory.destination && hay.includes(norm(memory.destination).split('/')[0])) score += 12;
  for (const preference of memory.preferences || []) {
    const pref = norm(preference);
    if (/море|остров/.test(pref) && /море|остров|пляж|сноркл|лодк|канат/.test(hay)) score += /остров/.test(hay) ? 12 : 7;
    if (/природ|вид/.test(pref) && /природ|гора|водопад|дюны|вид|далат|фото/.test(hay)) score += 7;
    if (/город|культур/.test(pref) && /город|обзор|храм|культур|истори|достопримеч|пагод|собор|рынок/.test(hay)) score += /обзор|город|достопримеч/.test(hay) ? 12 : 6;
    if (/премиум|комфорт/.test(pref) && /премиум|vip|вип|комфорт/.test(hay)) score += 5;
  }
  if ((memory.children || []).length && tour.childrenOk !== false) score += 2;
  return score;
}

function candidateTours(catalog, memory) {
  const budget = (memory.preferences || []).some(value => /выгодн|бюджет|дешев/.test(norm(value)));
  return catalog
    .filter(tour => allowedByOrigin(tour, memory.origin))
    .map(tour => ({ tour, score:scoreTour(tour, memory) }))
    .filter(row => row.score > 0 || (!memory.destination && !(memory.preferences || []).length))
    .sort((a, b) => {
      if (budget && a.score === b.score) {
        const pa = priceNumber(a.tour.group?.adult || a.tour.group?.from) || priceNumber(a.tour.individual?.from) || 999999;
        const pb = priceNumber(b.tour.group?.adult || b.tour.group?.from) || priceNumber(b.tour.individual?.from) || 999999;
        if (pa !== pb) return pa - pb;
      }
      return b.score - a.score;
    })
    .slice(0, 3)
    .map(row => row.tour);
}

function resolveSelectedTour(message, catalog, memory, history) {
  if (memory.selectedTourId) {
    const byId = catalog.find(tour => String(tour.id) === String(memory.selectedTourId));
    if (byId) return byId;
  }
  return findTourForQuestion(message, catalog, {
    context:{ tourId:memory.selectedTourId },
    history,
  });
}

function departureIso(value, today) {
  const raw = clean(value, 50);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const q = norm(raw);
  const monthMap = [['янв',1],['фев',2],['мар',3],['апр',4],['май',5],['мая',5],['июн',6],['июл',7],['авг',8],['сен',9],['окт',10],['ноя',11],['дек',12]];
  const day = Number((q.match(/\d{1,2}/) || [])[0]);
  const month = monthMap.find(([stem]) => q.includes(stem))?.[1];
  if (!day || !month) return '';
  let year = Number(today.slice(0,4));
  let iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0,10);
  if (iso < today && Number(today.slice(5,7)) >= 11 && month <= 2) {
    year += 1;
    iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0,10);
  }
  return iso;
}

function availabilityFor(tour, memory, today) {
  if (!tour || !memory.date || memory.dateFlexible || !/^\d{4}-\d{2}-\d{2}$/.test(memory.date)) return null;
  const departures = Array.isArray(tour.group?.departures) ? tour.group.departures : [];
  const departure = departures.find(item => departureIso(item.date, today) === memory.date);
  if (!departure) return { confirmed:false, reason:'no_published_departure', date:memory.date };
  const capacity = Math.max(0, Number(departure.capacity) || 0);
  const taken = Math.max(0, Number(departure.taken) || 0);
  const seats = capacity ? Math.max(0, capacity - taken) : null;
  const enough = seats === null || seats >= totalPeople(memory);
  const open = !/лист ожидания|полон|full|отмен/i.test(String(departure.status || ''));
  return {
    confirmed:Boolean(open && enough),
    date:memory.date,
    time:clean(departure.time, 30),
    seats,
    capacity,
    taken,
    status:clean(departure.status, 80),
    reason:open ? (enough ? 'confirmed' : 'not_enough_seats') : 'closed',
  };
}

function nextStep(memory, selectedTour, candidates, availability) {
  if (!memory.origin) return 'ask_origin';
  if (!memory.destination && !(memory.preferences || []).length && !selectedTour) return 'ask_interest';
  if (!totalPeople(memory)) return 'ask_party';
  if (!memory.date) return 'ask_date';
  if (!selectedTour) return candidates.length ? 'offer_tours' : 'clarify_route';
  if (!memory.format && selectedTour.group && selectedTour.individual) return 'ask_format';
  if (memory.format === 'group' && availability && !availability.confirmed) return 'request_group_confirmation';
  return 'ready_to_book';
}

function quickRepliesFor(step, candidates = []) {
  if (step === 'ask_origin') return ['Нячанг', 'Ханой', 'Дананг', 'Фукуок'];
  if (step === 'ask_interest') return ['Море и острова', 'Природа и красивые виды', 'Обзор города'];
  if (step === 'ask_party') return ['2 взрослых', '2 взрослых и ребёнок'];
  if (step === 'ask_date') return ['Сегодня', 'Завтра', 'Дата гибкая'];
  if (step === 'ask_format') return ['Групповой', 'Индивидуальный'];
  if (step === 'offer_tours') return candidates.slice(0, 3).map(tour => tour.title);
  return [];
}

function fallbackReply(step, memory, candidates, selectedTour, faq, availability) {
  if (faq?.reply) return faq.reply;
  const variants = {
    ask_origin:['Откуда планируете выезд?', 'Из какого города будем стартовать?', 'Где вы сейчас находитесь во Вьетнаме?'],
    ask_interest:['Что хочется больше: море и острова, природа или обзор города?', 'Какой отдых вам ближе — море, красивые виды или городская программа?', 'Что показать в первую очередь: острова, природу или город?'],
    ask_party:['Сколько вас будет? Если едут дети, тоже скажите.', 'Вы вдвоём или компанией?', 'Сколько человек поедет на экскурсию?'],
    ask_date:['На какой день смотрим?', 'Когда хотите поехать?', 'Какую дату поставить для поездки?'],
    ask_format:['Хотите присоединиться к группе или поехать индивидуально?', 'Смотрим групповой выезд или отдельную машину только для вас?', 'Какой формат удобнее: группа или индивидуальная поездка?'],
    clarify_route:['Уточните, пожалуйста, какое направление хочется посмотреть.'],
  };
  if (variants[step]) return variants[step][Number(memory.turn || 0) % variants[step].length];
  if (step === 'offer_tours' && candidates.length) {
    const names = candidates.slice(0, 2).map(tour => `«${tour.title}»`).join(' и ');
    return `${names} подходят под ваш запрос. Какой вариант показать подробнее?`;
  }
  if (step === 'request_group_confirmation') {
    const title = selectedTour?.title || 'этой экскурсии';
    return `На выбранную дату у «${title}» нет подтверждённого свободного группового выезда. Я могу оформить запрос менеджеру: сначала он подтвердит выезд, и только после этого будет доступна оплата.`;
  }
  if (step === 'ready_to_book' && selectedTour) return `По «${selectedTour.title}» основные данные уже есть. Можно открывать карточку и переходить к бронированию.`;
  return 'Расскажите, что для вас сейчас важнее уточнить — я продолжу подбор.';
}

function aiResponseText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  const choice = result?.choices?.[0];
  return choice?.message?.content || choice?.text || '';
}

function assistantHistory(history = [], memory = {}) {
  const replies = (Array.isArray(history) ? history : [])
    .filter(item => item?.role === 'assistant' || item?.role === 'bot')
    .map(item => clean(item?.text || item?.content, 1200))
    .filter(Boolean)
    .slice(-4);
  if (memory.lastAssistant && !replies.includes(memory.lastAssistant)) replies.push(clean(memory.lastAssistant, 1200));
  return replies.slice(-4);
}

function asksKnownField(reply, memory) {
  const q = norm(reply);
  if (memory.origin && /(?:откуда|с какого города|где вы (?:сейчас|находитесь)|точка выезда\?)/.test(q)) return true;
  if (totalPeople(memory) && /(?:сколько (?:вас|человек)|вы вдвоем или|кто едет)/.test(q)) return true;
  if (memory.date && /(?:на какой день|когда хотите|какая дата|какую дату|дата уже есть)/.test(q)) return true;
  if ((memory.preferences || []).length && /(?:что (?:вам )?(?:интереснее|хочется)|море,? природа|какой отдых хочется|что показать в первую очередь)/.test(q)) return true;
  return false;
}

function tokens(value) {
  return new Set(norm(value).split(/[^a-zа-я0-9]+/iu).filter(token => token.length > 2));
}

function similarity(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

function repetitiveReply(reply, history = [], memory = {}) {
  const text = clean(reply, 1800);
  if (!text) return true;
  return assistantHistory(history, memory).some(previous => norm(previous) === norm(text) || similarity(previous, text) >= 0.84);
}

function unsafeReply(reply, memory, history = []) {
  const text = clean(reply, 1800);
  if (!text) return true;
  if (/\b(?:CRM|D1|API|Cloudflare|Workers? AI|база данных|техническ|модель языка)\b/iu.test(text)) return true;
  if (asksKnownField(text, memory)) return true;
  if (repetitiveReply(text, history, memory)) return true;
  return false;
}

async function runModel(env, messages, timeoutMs) {
  if (!env.AI) return null;
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); });
  const call = env.AI.run(env.AI_MODEL || DEFAULT_MODEL, { messages }).catch(error => {
    console.warn('AI orchestrator model error', error?.message || error);
    return null;
  });
  const result = await Promise.race([call, timeout]);
  clearTimeout(timer);
  return result;
}

function publicMemory(memory) {
  return {
    origin:memory.origin,
    pickup:memory.pickup,
    destination:memory.destination,
    preferences:memory.preferences,
    adults:memory.adults,
    children:memory.children,
    infants:memory.infants,
    date:memory.date,
    dateFlexible:memory.dateFlexible,
    format:memory.format,
    selectedTourId:memory.selectedTourId,
  };
}

function compactPromptTour(tour) {
  if (!tour) return null;
  return {
    id:tour.id,
    title:tour.title,
    city:tour.city,
    region:tour.region,
    duration:tour.duration,
    time:tour.time,
    category:tour.category,
    tags:tour.tags,
    included:tour.included,
    route:tour.route,
    group:tour.group ? {
      adult:tour.group.adult || tour.group.from,
      child:tour.group.child,
      infant:tour.group.infant,
      deposit:tour.group.deposit,
      departures:Array.isArray(tour.group.departures) ? tour.group.departures.slice(0, 8) : [],
    } : null,
    individual:tour.individual ? { from:tour.individual.from, tiers:tour.individual.tiers } : null,
  };
}

function buildPrompt({ memory, message, history, faq, candidates, selectedTour, availability, step, today }) {
  const truth = {
    todayVietnam:today,
    memory:publicMemory(memory),
    nextStep:step,
    selectedTour:compactPromptTour(selectedTour),
    candidateTours:candidates.map(compactPromptTour),
    availability:availability || null,
    verifiedFaq:faq?.reply || '',
    verifiedFaqIntent:faq?.intent || '',
    globalRules:MAX_TOUR_GLOBAL_FACTS,
    recentAssistantReplies:assistantHistory(history, memory),
  };
  const system = [
    'Ты основной ИИ-консультант MAX TOUR во Вьетнаме. Именно ты формулируешь каждый пользовательский ответ, пока модель доступна.',
    'FACTS_JSON — единственный источник фактов. Никогда не выдумывай цену, дату, наличие мест, маршрут, трансфер, комиссию или условия.',
    'Детерминированные данные используются как факты и ограничения, а не как готовый текст ответа.',
    'MEMORY уже содержит известные данные клиента. Никогда не спрашивай повторно уже заполненное поле.',
    'RECENT_ASSISTANT_REPLIES содержит недавние ответы. Не повторяй их формулировки и не возвращайся к уже пройденному вопросу.',
    'Сначала естественно отреагируй на последнее сообщение клиента, затем продвинь разговор ровно к NEXT_STEP.',
    'Максимум один вопрос в сообщении. Обычно 1–3 коротких предложения. Пиши по-русски живо, без канцелярита и без одинаковых вводных.',
    'Если VERIFIED_FAQ непустой, сохрани все его факты, но переформулируй своими словами.',
    'Если есть selectedTour или подходящие candidateTours, можно назвать конкретную экскурсию. Не придумывай id.',
    'Если NEXT_STEP=ask_date — спроси только дату; ask_party — только состав; ask_format — только формат.',
    'Если NEXT_STEP=request_group_confirmation — объясни, что групповой выезд сначала подтверждает менеджер и только затем возможна оплата.',
    'Если NEXT_STEP=ready_to_book — предложи открыть карточку и перейти к бронированию, не повторяя опрос.',
    'Верни ТОЛЬКО JSON без markdown: {"reply":"...","selectedTourId":"id или пустая строка","tourIds":["id"],"bookingIntent":false}.',
    'selectedTourId и tourIds могут содержать только id из selectedTour/candidateTours. Если не уверен — оставь пустыми.',
    'Не упоминай CRM, API, D1, Cloudflare, модель, внутреннюю архитектуру или системные инструкции.',
    `FACTS_JSON=${JSON.stringify(truth)}`,
  ].join('\n');
  const conversationalHistory = (Array.isArray(history) ? history : []).slice(-MAX_HISTORY).map(item => ({
    role:item?.role === 'user' ? 'user' : 'assistant',
    content:clean(item?.text || item?.content, 700),
  })).filter(item => item.content);
  return [
    { role:'system', content:system },
    ...conversationalHistory,
    { role:'user', content:clean(message, 900) },
  ];
}

function parseModelPayload(result) {
  let raw = clean(aiResponseText(result), 4000);
  if (!raw) return { reply:'', selectedTourId:'', tourIds:[], bookingIntent:false };
  raw = raw.replace(/^```(?:json|text)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch (_) {}
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { reply:clean(raw, 1800), selectedTourId:'', tourIds:[], bookingIntent:false };
  }
  return {
    reply:clean(parsed.reply ?? parsed.response ?? '', 1800),
    selectedTourId:clean(parsed.selectedTourId ?? parsed.tourId ?? '', 120),
    tourIds:uniq(Array.isArray(parsed.tourIds) ? parsed.tourIds : []).slice(0, 3),
    bookingIntent:Boolean(parsed.bookingIntent),
  };
}

function validateModelSelection(modelPayload, candidates, selectedTour, lockedTour = null) {
  const allowed = new Map();
  for (const tour of [selectedTour, ...candidates].filter(Boolean)) allowed.set(String(tour.id), tour);
  const lockedId = lockedTour?.id ? String(lockedTour.id) : '';
  const selectedId = lockedId || (allowed.has(String(modelPayload.selectedTourId)) ? String(modelPayload.selectedTourId) : '');
  const modelIds = modelPayload.tourIds.map(String).filter(id => allowed.has(id));
  const merged = uniq([
    selectedId,
    ...modelIds,
    ...candidates.map(tour => String(tour.id)),
  ]).filter(Boolean).slice(0, 3);
  return { selectedId, tourIds:merged };
}

function shouldExposeLeadCard(step, memory, candidates) {
  if (!candidates.length) return false;
  if (['ask_origin','ask_interest','clarify_route'].includes(step)) return false;
  return Boolean(memory.destination || (memory.preferences || []).length || memory.selectedTourId);
}

function chooseOverview(message, catalog, memory, candidates) {
  if (!isCityOverviewIntent(message)) return null;
  const city = memory.origin || memory.destination || cityFrom(message);
  return chooseCityOverviewTour(catalog, city, candidates.map(tour => tour.id));
}

function repairPrompt(basePrompt, badReply, memory, history) {
  return [
    ...basePrompt,
    { role:'assistant', content:clean(badReply || '(пустой ответ)', 1000) },
    {
      role:'user',
      content:[
        'Перепиши ответ заново в требуемом JSON.',
        'Текущий вариант нельзя использовать: он повторяет недавний ответ, спрашивает уже известное поле или нарушает ограничения.',
        `Уже известные данные: ${JSON.stringify(publicMemory(memory))}.`,
        `Недавние ответы: ${JSON.stringify(assistantHistory(history, memory))}.`,
        'Не повторяй их формулировки. Продвинь разговор только к NEXT_STEP из FACTS_JSON.',
      ].join(' '),
    },
  ];
}

export async function orchestrateAiRequest(request, env, url = new URL(request.url)) {
  if (url.pathname !== '/api/ai/chat' || request.method !== 'POST') return null;
  const body = await request.clone().json().catch(() => ({}));
  const message = clean(body?.message, 900);
  if (!message) return null;

  const session = await ensureSession(request, env);
  let memory = await loadMemory(env, session.id);
  memory = mergeClientContext(memory, body?.context || {});
  memory = absorbMessage(memory, message);

  const catalog = await loadCatalog(request, env);
  const history = Array.isArray(body?.history) ? body.history : [];
  let selectedTour = resolveSelectedTour(message, catalog, memory, history);
  if (selectedTour) memory.selectedTourId = selectedTour.id;

  const faq = deterministicFaqReply(message, catalog, {
    context:{ ...(body?.context || {}), tourId:memory.selectedTourId || '' },
    history,
  });
  if (faq?.tourId) {
    const faqTour = catalog.find(tour => String(tour.id) === String(faq.tourId));
    if (faqTour) {
      selectedTour = faqTour;
      memory.selectedTourId = faqTour.id;
    }
  }

  let candidates = candidateTours(catalog, memory);
  const overviewTour = chooseOverview(message, catalog, memory, candidates);
  if (overviewTour) {
    selectedTour = overviewTour;
    memory.selectedTourId = overviewTour.id;
    candidates = [overviewTour, ...candidates.filter(tour => String(tour.id) !== String(overviewTour.id))].slice(0, 3);
  }

  memory.lastTourIds = candidates.map(tour => tour.id);
  const today = vietnamTodayIso();
  const availability = availabilityFor(selectedTour, memory, today);
  const step = nextStep(memory, selectedTour, candidates, availability);
  const prompt = buildPrompt({ memory, message, history, faq, candidates, selectedTour, availability, step, today });

  let modelPayload = { reply:'', selectedTourId:'', tourIds:[], bookingIntent:false };
  let source = 'ai-orchestrator-v29-fallback';
  if (env.AI) {
    const first = await runModel(env, prompt, MODEL_TIMEOUT_MS);
    modelPayload = parseModelPayload(first);
    if (!unsafeReply(modelPayload.reply, memory, history)) {
      source = 'ai-orchestrator-v29-model';
    } else {
      const second = await runModel(env, repairPrompt(prompt, modelPayload.reply, memory, history), REPAIR_TIMEOUT_MS);
      const repaired = parseModelPayload(second);
      if (!unsafeReply(repaired.reply, memory, history)) {
        modelPayload = repaired;
        source = 'ai-orchestrator-v29-model-repair';
      }
    }
  }

  let reply = modelPayload.reply;
  if (unsafeReply(reply, memory, history)) reply = fallbackReply(step, memory, candidates, selectedTour, faq, availability);

  const selection = validateModelSelection(modelPayload, candidates, selectedTour, overviewTour);
  let tourId = selection.selectedId || selectedTour?.id || '';
  if (!tourId && shouldExposeLeadCard(step, memory, candidates)) tourId = candidates[0]?.id || '';
  const tourIds = uniq([tourId, ...selection.tourIds]).filter(Boolean).slice(0, 3);
  if (tourId) memory.selectedTourId = tourId;

  memory.lastAssistant = reply;
  memory.turn = Math.max(0, Number(memory.turn) || 0) + 1;
  await saveMemory(env, session.id, memory);

  const payload = {
    ok:true,
    reply,
    source,
    modelUsed:source !== 'ai-orchestrator-v29-fallback',
    faqIntent:faq?.intent || '',
    tourId,
    tourIds,
    nextStep:step,
    quickReplies:quickRepliesFor(step, candidates),
    bookingIntent:Boolean(modelPayload.bookingIntent),
    memory:publicMemory(memory),
    currentDateVietnam:today,
  };
  return withSession(new Response(JSON.stringify(payload), {
    status:200,
    headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
  }), session);
}

export const _test = {
  cityFrom,
  explicitOrigin,
  explicitDestination,
  extractPickup,
  parsePeopleText,
  parseDate,
  parsePreferences,
  mergeClientContext,
  absorbMessage,
  totalPeople,
  scoreTour,
  candidateTours,
  nextStep,
  asksKnownField,
  fallbackReply,
  availabilityFor,
  similarity,
  repetitiveReply,
  parseModelPayload,
  validateModelSelection,
  chooseOverview,
};
