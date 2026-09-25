const clip = (value, max = 600) => String(value ?? '').trim().slice(0, max);
const list = (value, maxItems = 10, maxLen = 220) => (Array.isArray(value) ? value : [])
  .slice(0, maxItems).map(item => clip(item, maxLen)).filter(Boolean);
const norm = value => clip(value, 2400).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
  .replace(/[«»“”"'`]/g, '').replace(/\s+/g, ' ').trim();

export const MAX_TOUR_GLOBAL_FACTS = {
  payment: 'При бронировании можно оплатить 30% стоимости или сразу 100%. Доступны наличные, карта и перевод в рублях, тенге, долларах и других валютах; конкретный вариант выбирается при оформлении.',
  cancellation: 'Отмена более чем за 48 часов до выезда — бесплатно; до 17:00 за день до выезда удерживается 30%; позже применяется удержание 100%.',
  reschedule: 'Перенос бесплатный до 17:00 за день до выезда; после этого может удерживаться 30% стоимости.',
  forceMajeure: 'При опасных погодных условиях или другом форс-мажоре тур может быть изменён или отменён; тогда возможен перенос либо возврат средств.',
  amianaTransfer: 'Для Amiana трансфер оплачивается отдельно: $20 за машину для 1–6 человек или $30 для 7–14 человек.',
};

const MONTHS = [
  ['янв',1],['фев',2],['мар',3],['апр',4],['ма[йя]',5],['июн',6],
  ['июл',7],['авг',8],['сен',9],['окт',10],['ноя',11],['дек',12],
];

const TITLE_STOPWORDS = new Set([
  'тур','тура','экскурсия','экскурсии','экскурсию','поездка','поездки','маршрут','маршрута',
  'программа','программы','трансфер','трансфера','отель','отеля','групповой','индивидуальный',
]);

const PARTY_WORDS = {
  один:1, одного:1, одна:1,
  два:2, двух:2, двое:2, двоих:2,
  три:3, трех:3, трёх:3, трое:3, троих:3,
  четыре:4, четырех:4, четырёх:4, четверо:4, четверых:4,
  пять:5, пятеро:5, пятерых:5,
  шесть:6, шестеро:6, шестерых:6,
  семь:7, семеро:7, семерых:7,
  восемь:8, восьмерых:8,
  девять:9, девятерых:9,
  десять:10, десятерых:10,
};

function vietnamNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { iso:`${value.year}-${value.month}-${value.day}`, hour:Number(value.hour) || 0 };
}

function addIsoDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0,10);
}

function departureIso(value, today) {
  const raw = clip(value, 50);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const q = norm(raw);
  const day = Number((q.match(/\d{1,2}/) || [])[0]);
  const found = MONTHS.find(([stem]) => new RegExp(stem).test(q));
  if (!day || !found) return '';
  const month = found[1];
  let year = Number(today.slice(0,4));
  let iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0,10);
  if (iso < today && Number(today.slice(5,7)) >= 11 && month <= 2) {
    year += 1;
    iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0,10);
  }
  return iso;
}

export function compactTourForAi(tour = {}) {
  const group = tour.group && typeof tour.group === 'object' ? tour.group : null;
  const individual = tour.individual && typeof tour.individual === 'object' ? tour.individual : null;
  return {
    id: clip(tour.id, 120),
    title: clip(tour.title, 180),
    city: clip(tour.city, 100),
    region: clip(tour.region, 100),
    category: clip(tour.category, 100),
    duration: clip(tour.duration, 80),
    time: clip(tour.time, 120),
    activity: clip(tour.activity, 80),
    tags: list(tour.tags, 8, 40),
    audience: list(tour.audience, 8, 50),
    childrenOk: Boolean(tour.childrenOk),
    included: list(tour.included, 12, 180),
    take: list(tour.take, 12, 180),
    route: (Array.isArray(tour.route) ? tour.route : []).slice(0, 10).map(item => Array.isArray(item)
      ? [clip(item[0], 120), clip(item[1], 260)]
      : clip(item, 300)),
    group: group ? {
      from: clip(group.from, 80),
      adult: clip(group.adult || group.from, 80),
      child: clip(group.child, 80),
      infant: clip(group.infant, 120),
      deposit: clip(group.deposit, 80),
      notes: list(group.notes, 10, 220),
      departures: (Array.isArray(group.departures) ? group.departures : []).slice(0, 10).map(item => ({
        date: clip(item?.date, 50),
        time: clip(item?.time, 30),
        taken: Math.max(0, Number(item?.taken) || 0),
        capacity: Math.max(0, Number(item?.capacity) || 0),
        status: clip(item?.status, 80),
      })),
    } : null,
    individual: individual ? {
      from: clip(individual.from, 80),
      deposit: clip(individual.deposit, 80),
      tiers: list(individual.tiers, 10, 160),
      notes: list(individual.notes, 10, 220),
    } : null,
  };
}

function titleTokens(title) {
  return norm(title).split(/[^a-zа-я0-9]+/i)
    .filter(token => token.length >= 4 && !TITLE_STOPWORDS.has(token));
}

export function findTourForQuestion(message, catalog = [], options = {}) {
  const context = options.context && typeof options.context === 'object' ? options.context : {};
  const directId = clip(context.tourId || context.selectedTourId, 120);
  if (directId) {
    const byId = catalog.find(item => String(item?.id) === directId);
    if (byId) return byId;
  }

  const history = (Array.isArray(options.history) ? options.history : []).slice(-6)
    .map(item => clip(item?.text || item?.content, 500)).join(' ');
  const current = norm(message);
  const combined = norm(`${history} ${message}`);
  let best = null;
  let bestScore = 0;

  for (const tour of catalog) {
    const title = norm(tour?.title);
    if (!title) continue;
    let score = 0;
    if (current.includes(title)) score += 140;
    else if (history && norm(history).includes(title)) score += 80;
    const tokens = titleTokens(tour.title);
    const currentHits = tokens.filter(token => current.includes(token)).length;
    const historyHits = tokens.filter(token => !current.includes(token) && combined.includes(token)).length;
    score += currentHits * 30 + historyHits * 12;
    if (/далат/.test(current) && /далат/.test(`${title} ${norm(tour.region)}`)) score += 18;
    if (/премиум/.test(current) && /премиум/.test(title)) score += 40;
    if (/вип|vip/.test(current) && /вип|vip/.test(title)) score += 40;
    if (score > bestScore) { best = tour; bestScore = score; }
  }

  return bestScore >= 30 ? best : null;
}

function noteMatching(items, regex) {
  return (Array.isArray(items) ? items : []).find(item => regex.test(String(item || ''))) || '';
}

function sentenceCase(value) {
  const text = clip(value, 260);
  return text ? text.charAt(0).toLocaleLowerCase('ru-RU') + text.slice(1) : '';
}

function joinNatural(items, max = 6) {
  const values = (Array.isArray(items) ? items : []).filter(Boolean).slice(0, max).map(sentenceCase);
  if (!values.length) return '';
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(', ')} и ${values.at(-1)}`;
}

function peopleRequested(q) {
  const normalized = norm(q);
  const numeric = normalized.match(/(?:нас|для|на)\s*(\d{1,2})\s*(?:человек|чел|взросл)?|(?:^|\D)(\d{1,2})\s*(?:человек|взросл)/);
  if (numeric) return Number(numeric[1] || numeric[2] || 0);
  const words = Object.keys(PARTY_WORDS).join('|');
  const wordMatch = normalized.match(new RegExp(`(?:нас|для|на)\\s+(${words})(?:\\s+(?:человек|взросл\\w*))?`, 'i'));
  return PARTY_WORDS[wordMatch?.[1]] || 0;
}

function individualTierFor(tour, people) {
  if (!people) return '';
  return (tour?.individual?.tiers || []).find(item => new RegExp(`(?:^|\\D)${people}(?:\\D|$)`).test(String(item))) || '';
}

function tomorrowAvailability(tour, now = new Date()) {
  const today = vietnamNow(now).iso;
  const target = addIsoDays(today, 1);
  const departures = Array.isArray(tour?.group?.departures) ? tour.group.departures : [];
  const departure = departures.find(item => departureIso(item?.date, today) === target);
  if (!departure) return { target, departure:null, seats:null };
  const seats = departure.capacity > 0 ? Math.max(0, departure.capacity - departure.taken) : null;
  return { target, departure, seats };
}

function scheduleReply(tour) {
  const raw = clip(tour?.time, 120);
  const [start, finish] = raw.split(/\s*→\s*/);
  if (start && finish) return `${tour.title}: выезд ${start}, возвращение ${finish}.`;
  return `${tour.title}: ${raw}.`;
}

function genericGuideReply(catalog) {
  const dalat = catalog.find(item => item.id === 'dalat-premium');
  const guide = noteMatching(dalat?.included, /русск|гид/i) || noteMatching(dalat?.group?.notes, /русск|гид/i);
  if (guide) return `Зависит от экскурсии. У Далат «Премиум» — ${sentenceCase(guide)}. Если речь о другом туре, назовите его.`;
  return 'Язык гида зависит от экскурсии. Назовите тур — проверю по опубликованной программе.';
}

function genericStrollerReply() {
  return 'Зависит от маршрута: общего подтверждения полной доступности с коляской нет. Назовите экскурсию — проверю её условия; коляску лучше подтвердить до оплаты.';
}

const FAQ_STYLE_OPENERS = {
  transfer_hotel: ['', 'По трансферу из Amiana — ', 'По Amiana правило такое: ', 'Для Amiana считаем так: '],
  transfer: ['', 'По трансферу — ', 'Что касается трансфера: ', 'Здесь по трансферу так: '],
  schedule: ['', 'По времени — ', 'Расписание такое: ', 'Если смотреть по времени: '],
  included: ['', 'По составу стоимости — ', 'Что уже включено: ', 'В этой части всё просто: '],
  stroller: ['', 'По коляске — ', 'С коляской важный момент: ', 'Здесь лучше учитывать маршрут: '],
  child_price: ['', 'По детскому тарифу — ', 'Для ребёнка расчёт такой: ', 'По детям здесь так: '],
  guide: ['', 'По гиду — ', 'Что касается гида: ', 'По языку сопровождения — '],
  group_size: ['', 'По размеру группы — ', 'Обычно по группе так: ', 'По составу группы — '],
  payment: ['', 'По оплате — ', 'Варианты оплаты такие: ', 'Здесь можно выбрать: '],
  reschedule: ['', 'По переносу — ', 'Условия переноса такие: ', 'Если менять дату: '],
  cancellation: ['', 'По отмене — ', 'Условия отмены такие: ', 'Если отменять поездку: '],
  weather_force_majeure: ['', 'По погоде — ', 'Если погода испортится: ', 'При плохой погоде действует такое правило: '],
  what_to_take: ['', 'По вещам с собой — ', 'Что лучше взять: ', 'Для поездки пригодится следующее: '],
  dietary: ['', 'По питанию — ', 'Если есть ограничения по еде: ', 'С питанием важный момент: '],
  senior_load: ['', 'По нагрузке — ', 'Если оцениваем комфорт поездки: ', 'Для старшего путешественника важнее всего нагрузка и длительность: '],
  availability_tomorrow: ['', 'По местам на завтра — ', 'На завтра ситуация такая: ', 'Если смотреть завтрашний выезд: '],
  individual: ['', 'По индивидуальному формату — ', 'Для вашей компании расчёт такой: ', 'Если ехать индивидуально: '],
};

function faqHash(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function faqHistory(options = {}) {
  return (Array.isArray(options.history) ? options.history : []).slice(-10).map(item => ({
    role: item?.role === 'assistant' || item?.role === 'bot' ? 'assistant' : 'user',
    text: clip(item?.text || item?.content, 700),
  })).filter(item => item.text);
}

function stripLeadAgreement(reply) {
  return String(reply || '').replace(/^(?:Да|Конечно)\.\s*/u, '').trim();
}

const FAQ_COMMON_SENTENCE_LEADS = /^(При|На|В|Если|Для|У|С|Размер|Язык|Отмена|Перенос|Обычный|Вегетарианское|Уровень|Точная|Индивидуальный|Завтра|Зависит)(?=\s|[,:;.!?—-]|$)/u;

function conversationalContinuation(reply) {
  const text = stripLeadAgreement(reply);
  return text.replace(FAQ_COMMON_SENTENCE_LEADS, word => word.charAt(0).toLocaleLowerCase('ru-RU') + word.slice(1));
}

function applyFaqStyle(result, message, options = {}) {
  if (!result?.reply) return result;
  const openers = FAQ_STYLE_OPENERS[result.intent] || ['', 'Коротко: ', 'По этому вопросу — ', 'Здесь так: '];
  const history = faqHistory(options);
  const lastAssistant = [...history].reverse().find(item => item.role === 'assistant')?.text || '';
  const seed = `${result.intent}|${result.tourId || ''}|${norm(message)}|${history.length}|${norm(lastAssistant)}`;
  let index = faqHash(seed) % openers.length;
  const base = String(result.reply).trim();

  for (let attempt = 0; attempt < openers.length; attempt += 1) {
    const opener = openers[index] || '';
    const body = opener ? conversationalContinuation(base) : base;
    const candidate = opener ? `${opener}${body}` : body;
    if (!lastAssistant || norm(candidate) !== norm(lastAssistant)) {
      return { ...result, reply:candidate, replyVariant:index, styleVersion:'faq-style-v11.2' };
    }
    index = (index + 1) % openers.length;
  }
  return { ...result, reply:base, replyVariant:0, styleVersion:'faq-style-v11.2' };
}

function deterministicFaqReplyBase(message, catalog = [], options = {}) {
  const q = norm(message);
  if (!q) return null;
  const tour = findTourForQuestion(message, catalog, options);
  const tourName = tour?.title || 'эта экскурсия';

  if (/amiana|амиан/.test(q) && /(трансфер|забер|отел|доплат|встреч)/.test(q)) {
    const people = peopleRequested(q);
    const exact = people >= 1 && people <= 6 ? ' Для вашего состава это $20 за машину.'
      : people >= 7 && people <= 14 ? ' Для вашего состава это $30 за машину.' : '';
    return { intent:'transfer_hotel', tourId:'', reply:`Да. ${MAX_TOUR_GLOBAL_FACTS.amianaTransfer}${exact || ' Напишите, сколько вас — назову точную доплату.'}` };
  }

  if (tour && /(трансфер|забер|отел|точк.*встреч)/.test(q)) {
    const transfer = noteMatching(tour.included, /трансфер|микроавтобус|автобус/i) || noteMatching(tour.group?.notes, /трансфер/i);
    if (transfer) return { intent:'transfer', tourId:tour.id, reply:`У ${tourName} ${sentenceCase(transfer)}. Для отеля вне стандартной зоны напишите название — проверю доплату.` };
  }

  if (tour && /(во сколько|время выезд|когда выезд|вернем|вернём|возвращ|финиш|начина)/.test(q) && tour.time) {
    return { intent:'schedule', tourId:tour.id, reply:scheduleReply(tour) };
  }

  if (tour && /(что входит|входит в стоимость|что включ|включено|включены)/.test(q)) {
    const included = joinNatural(tour.included, 7);
    if (included) return { intent:'included', tourId:tour.id, reply:`В ${tourName} включены: ${included}.` };
  }

  if (/коляск/.test(q)) {
    if (!tour) return { intent:'stroller', tourId:'', reply:genericStrollerReply() };
    return { intent:'stroller', tourId:tour.id, reply:`С коляской на ${tourName} я бы не обещал полностью беспрепятственный маршрут: в карточке нет подтверждения безбарьерности. Укажите коляску при бронировании — маршрут должны подтвердить до оплаты.` };
  }

  if (tour && /(ребен|ребён|детск|малыш|до\s*100\s*см|110\s*см|120\s*см|рост)/.test(q)) {
    if (tour.id === 'dalat-premium') {
      return { intent:'child_price', tourId:tour.id, reply:'На Далат «Премиум» ребёнок ростом 110 см стоит $38, малыш до 100 см едет бесплатно.' };
    }
    const parts = [];
    if (tour.group?.child) parts.push(`детский тариф — ${tour.group.child}`);
    if (tour.group?.infant) parts.push(sentenceCase(tour.group.infant));
    if (parts.length) return { intent:'child_price', tourId:tour.id, reply:`Для ${tourName}: ${parts.join('; ')}.` };
  }

  if (/(русск|язык.*гид|гид.*язык|какой гид)/.test(q)) {
    if (!tour) return { intent:'guide', tourId:'', reply:genericGuideReply(catalog) };
    const guide = noteMatching(tour.included, /русск|гид/i) || noteMatching(tour.group?.notes, /русск|гид/i);
    if (guide) return { intent:'guide', tourId:tour.id, reply:`Да. На ${tourName} — ${sentenceCase(guide)}.` };
  }

  if (/(сколько человек|размер групп|человек.*групп)/.test(q)) {
    if (tour) {
      const groupSize = noteMatching(tour.group?.notes, /групп.*\d|\d+.*человек/i);
      if (groupSize) return { intent:'group_size', tourId:tour.id, reply:`На ${tourName} ${sentenceCase(groupSize)}.` };
    }
    const dalat = catalog.find(item => item.id === 'dalat-premium');
    const groupSize = noteMatching(dalat?.group?.notes, /групп.*\d|\d+.*человек/i);
    if (groupSize) return { intent:'group_size', tourId:'', reply:`Размер зависит от экскурсии. Например, на Далат «Премиум» ${sentenceCase(groupSize)}.` };
  }

  if (/(оплат|депозит|предоплат|карто|налич|перевод|валют)/.test(q)) {
    return { intent:'payment', tourId:tour?.id || '', reply:MAX_TOUR_GLOBAL_FACTS.payment };
  }

  if (/перенос/.test(q)) {
    return { intent:'reschedule', tourId:tour?.id || '', reply:MAX_TOUR_GLOBAL_FACTS.reschedule };
  }

  if (/отмен|возврат/.test(q) && !/(погод|шторм|дожд|форс)/.test(q)) {
    if (/завтра/.test(q) && /утр|до\s*17/.test(q)) {
      return { intent:'cancellation', tourId:tour?.id || '', reply:'Если выезд завтра, а отмена сегодня до 17:00, удержат 30% стоимости. После 17:00 накануне удержание составит 100%.' };
    }
    return { intent:'cancellation', tourId:tour?.id || '', reply:MAX_TOUR_GLOBAL_FACTS.cancellation };
  }

  if (/(погод|дожд|шторм|тайфун|форс.?мажор|опасн.*погод)/.test(q)) {
    return { intent:'weather_force_majeure', tourId:tour?.id || '', reply:`${MAX_TOUR_GLOBAL_FACTS.forceMajeure} Обычный дождь сам по себе не означает автоматическую отмену: решение принимают по безопасности маршрута.` };
  }

  if (tour && /(что взять|взять с собой|одежд|обув|дождевик|кофт)/.test(q)) {
    const take = joinNatural(tour.take, 7);
    if (take) return { intent:'what_to_take', tourId:tour.id, reply:`Для ${tourName} возьмите: ${take}.` };
  }

  if (/(вегетари|аллерг|морепродукт|без глютен|питани)/.test(q)) {
    return { intent:'dietary', tourId:tour?.id || '', reply:'Вегетарианское или другое специальное питание нужно запросить заранее — в опубликованной программе оно не гарантировано. При сильной аллергии перечислите продукты-аллергены при оформлении и дождитесь подтверждения до оплаты.' };
  }

  if (tour && /(пожил|72\s*год|70\s*лет|маме|папе|тяжело|нагрузк|ходить)/.test(q)) {
    const activity = tour.activity ? `Уровень нагрузки — ${tour.activity}.` : 'Точная нагрузка зависит от маршрута.';
    const timing = tour.time ? ` День длинный: ${tour.time}.` : '';
    const calmer = tour.individual ? ' По одному возрасту нельзя сказать, будет ли тяжело: если сложно долго быть на ногах, индивидуальный формат позволит сделать темп спокойнее.' : '';
    return { intent:'senior_load', tourId:tour.id, reply:`${activity}${timing}${calmer}`.trim() };
  }

  if (tour && /(заброни|есть места|свободн|наличие)/.test(q) && /завтра/.test(q)) {
    const availability = tomorrowAvailability(tour, options.now || new Date());
    const dep = availability.departure;
    if (dep && !/лист ожидания|полон|full|отмен/i.test(dep.status || '') && (availability.seats === null || availability.seats > 0)) {
      const people = peopleRequested(q);
      const enough = availability.seats === null || !people || availability.seats >= people;
      if (!enough) return { intent:'availability_tomorrow', tourId:tour.id, reply:`На завтра осталось ${availability.seats} мест, а нужно ${people}. Для такой компании лучше проверить индивидуальный формат или следующую дату.` };
      const seats = availability.seats === null ? 'есть свободные места' : `свободно ${availability.seats} мест`;
      const party = people ? ` Для ${people} ${people === 1 ? 'человека' : 'человек'} места есть.` : '';
      return { intent:'availability_tomorrow', tourId:tour.id, reply:`Да. Завтра у ${tourName} выезд в ${dep.time || 'указанное время'}, ${seats}.${party} Можно переходить к оформлению.` };
    }
    return { intent:'availability_tomorrow', tourId:tour.id, reply:`На завтра у ${tourName} свободного группового выезда в опубликованном расписании нет. Проверьте индивидуальный формат или следующую дату.` };
  }

  if (tour && /(индив|своей компанией|частн)/.test(q) && /(сколько|стоим|цен|маршрут|измен|помен)/.test(q)) {
    const people = peopleRequested(q);
    const tier = individualTierFor(tour, people);
    const price = tier || (tour.individual?.from ? `от ${tour.individual.from}` : 'цена уточняется');
    const wantsRouteChange = /измен|помен.*маршрут|маршрут.*измен/.test(q);
    const routeNote = wantsRouteChange
      ? 'Темп программы можно сделать комфортнее; замену самих точек маршрута нужно согласовать при оформлении.'
      : sentenceCase(noteMatching(tour.individual?.notes, /маршрут|темп|комфорт/i));
    return { intent:'individual', tourId:tour.id, reply:`Индивидуальный ${tourName}: ${price}. ${routeNote || ''}`.trim() };
  }

  return null;
}

export function deterministicFaqReply(message, catalog = [], options = {}) {
  const result = deterministicFaqReplyBase(message, catalog, options);
  return result ? applyFaqStyle(result, message, options) : null;
}
