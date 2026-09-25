(() => {
  'use strict';

  // Bump the client state key so an older conversation created by the previous
  // guided flow cannot reappear after the chat interaction model changes.
  const storedLocale = String(globalThis.localStorage?.getItem?.('max-tour-locale-v1') || '').toLowerCase();
  const ACTIVE_LOCALE = ['vi','en','ko'].includes(storedLocale) ? storedLocale : 'ru';
  const STORAGE_KEY = 'max-tour-ai-consultant-v4-' + ACTIVE_LOCALE;
  const MAX_MESSAGES = 120;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const lower = value => String(value || '').toLocaleLowerCase(ACTIVE_LOCALE === 'vi' ? 'vi-VN' : ACTIVE_LOCALE === 'en' ? 'en-US' : ACTIVE_LOCALE === 'ko' ? 'ko-KR' : 'ru-RU');
  const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
  const localeText = (ru, vi, en, ko) => ACTIVE_LOCALE === 'vi' ? vi : ACTIVE_LOCALE === 'en' ? en : ACTIVE_LOCALE === 'ko' ? ko : ru;
  const tours = () => {
    try { return Array.isArray(TOURS) ? TOURS : []; } catch (_) { return []; }
  };

  const freshSlots = () => ({
    tripType: '', destination: '', date: '', dateFlexible: false, adults: 0,
    children: [], infants: 0, hotel: '', transfer: '', budget: '', preferences: [],
    question: '', contact: { name: '', phone: '', telegram: '' }, source: 'Telegram Mini App',
  });

  const freshState = () => ({
    slots: freshSlots(), messages: [{ role:'bot', text:localeText(
      'Задавайте вопрос — я помогу с поездкой.',
      'Hãy đặt câu hỏi — tôi sẽ giúp bạn với chuyến đi.',
      'Ask a question — I will help you with your trip.',
      '궁금한 점을 물어보세요. 여행을 도와드릴게요.'
    ) }],
    recommendations: [], handoff: null, handoffHidden: false, showContact: false,
  });

  let state = freshState();
  let aiPending = false;
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (stored?.slots && Array.isArray(stored.messages)) state = {
      ...freshState(), ...stored, slots: { ...freshSlots(), ...stored.slots, contact: { ...freshSlots().contact, ...(stored.slots.contact || {}) } },
    };
  } catch (_) {}

  function persist() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, messages: state.messages.slice(-MAX_MESSAGES) })); } catch (_) {}
  }

  function addMessage(role, text) {
    const message = clean(text, 1600);
    if (!message) return;
    const last = state.messages[state.messages.length - 1];
    if (last?.role === role && last.text === message) return;
    state.messages.push({ role, text: message });
    state.messages = state.messages.slice(-MAX_MESSAGES);
  }

  function firstMoney(value) {
    const match = String(value || '').match(/\$\s*([\d,.]+)/);
    return match ? Number(match[1].replace(/,/g, '')) || 0 : 0;
  }

  function dollarLabel(value) {
    const amount = Math.max(0, Math.round(Number(value) || 0));
    return amount ? `$${amount.toLocaleString('en-US')}` : 'уточняется';
  }

  function formatPeople() {
    const s = state.slots;
    const total = Number(s.adults || 0) + s.children.length + Number(s.infants || 0);
    const parts = [];
    if (s.adults) parts.push(`${s.adults} взр.`);
    if (s.children.length) parts.push(`${s.children.length} дет. (${s.children.join(', ')} лет)`);
    if (s.infants) parts.push(`${s.infants} мал.`);
    return total ? `${total} · ${parts.join(' + ')}` : 'состав группы не указан';
  }

  function destinationAlias(value) {
    const q = lower(value);
    if (/нячанг|на-?чанг/.test(q)) return 'Нячанг';
    if (/дананг|да-?нанг/.test(q)) return 'Дананг';
    if (/фукуок|фу-?куок/.test(q)) return 'Фукуок';
    if (/ханой/.test(q)) return 'Ханой';
    if (/муйн|фантьет/.test(q)) return 'Муйне/Фантьет';
    if (/далат/.test(q)) return 'Далат';
    if (/фуйен|фу[йи]ен|туй\s*хоа/.test(q)) return 'Фуйен';
    if (/хойан|хой\s*ан/.test(q)) return 'Хойан';
    if (/нин[ьъ]?бинь|чанган/.test(q)) return 'Ниньбинь';
    if (/сапа|саппу?/.test(q)) return 'Сапа';
    if (/халонг|ха\s*лонг/.test(q)) return 'Халонг';
    if (/сон\s*тра/.test(q)) return 'Сон Тра';
    if (/ба\s*на|банахилл|золот(?:ой|ого) мост/.test(q)) return 'Ба На Хилл';
    if (/fast\s*track|фаст\s*трек|аэропорт/.test(q)) return 'Fast Track';
    return '';
  }

  function normalizeDate(day, month, year) {
    const now = new Date();
    let y = Number(year || now.getFullYear());
    if (y < 100) y += 2000;
    const d = new Date(Date.UTC(y, Number(month) - 1, Number(day)));
    if (Number.isNaN(d.valueOf()) || d.getUTCDate() !== Number(day) || d.getUTCMonth() !== Number(month) - 1) return '';
    if (d < new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) && !year) d.setUTCFullYear(y + 1);
    return d.toISOString().slice(0, 10);
  }

  function dateLabel(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    return new Intl.DateTimeFormat('ru-RU', { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  }

  function parseDate(text) {
    const q = lower(text);
    const numeric = q.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
    if (numeric) return { value: normalizeDate(numeric[1], numeric[2], numeric[3]), flexible: false };
    if (/завтра/.test(q)) { const d = new Date(); d.setDate(d.getDate() + 1); return { value:d.toISOString().slice(0,10), flexible:false }; }
    if (/выходн/.test(q)) return { value:'Ближайшие выходные', flexible:true };
    if (/через\s+недел|на\s+недел|в\s+течени/.test(q)) return { value:'В течение ближайшей недели', flexible:true };
    if (/гибк|неважно|пока не выбрал|дат[ау].*нет/.test(q)) return { value:'Дата гибкая', flexible:true };
    // JS \b is ASCII-only and does not form a boundary before Cyrillic.
    // Use a non-letter boundary so natural phrases like «20 сентября» parse.
    const monthNames = ['январ','феврал','март','апрел','май','июн','июл','август','сентябр','октябр','ноябр','декабр'];
    const named = q.match(/(?:^|[^а-яё])(\d{1,2})\s*(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-яё]*(?:\s*(20\d{2}))?/);
    if (named) {
      const monthIndex = monthNames.findIndex(name => named[2].startsWith(name));
      const normalized = monthIndex >= 0 ? normalizeDate(named[1], monthIndex + 1, named[3]) : '';
      return normalized ? { value: normalized, flexible:false } : { value:`${named[2]} — даты уточним`, flexible:true };
    }
    const month = q.match(/(?:^|[^а-яё])(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-яё]*/);
    return month ? { value:`${month[1]} — даты уточним`, flexible:true } : null;
  }

  function parseBudget(text) {
    const q = lower(text);
    // A bare «до 3 лет» is an age, not a budget.  Only parse an amount when
    // the user explicitly names a budget/price or supplies a currency.
    const amount = '[\\d\\s.,]+';
    const unit = '(тыс|к|млн)?';
    const currency = '(?:\\$|usd|доллар(?:ов|а)?|руб(?:лей|ля)?\\.?|₽)';
    const explicit = q.match(new RegExp(`(?:бюджет|цена|стоимость)[^\\d]{0,32}(?:${currency})?\\s*(${amount})\\s*${unit}`));
    const withCurrency = q.match(new RegExp(`(?:до|около|примерно)\\s*(?:${currency})\\s*(${amount})\\s*${unit}`));
    const suffixCurrency = q.match(new RegExp(`(?:до|около|примерно)\\s*(${amount})\\s*(?:${currency})\\s*${unit}`));
    const match = explicit || withCurrency || suffixCurrency;
    if (!match) return '';
    const number = String(match[1] || '').replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(number)) return '';
    const raw = Number(number);
    if (!Number.isFinite(raw) || raw <= 0 || raw > 100000000) return '';
    const suffix = match[2] || '';
    const hasRubles = /руб|₽/.test(match[0]);
    return `${number}${suffix ? ` ${suffix === 'к' ? 'тыс.' : suffix}` : ''}${hasRubles ? ' ₽' : ''}`.trim();
  }

  const PARTY_COUNTS = Object.freeze({
    один:1, одна:1, одно:1, одиного:1,
    два:2, две:2, двое:2,
    три:3, трое:3,
    четыре:4, четверо:4,
    пять:5, пятеро:5,
    шесть:6, шестеро:6,
    семь:7, семеро:7,
    восемь:8, восьмеро:8,
    девять:9, девятеро:9,
    десять:10, десятеро:10,
  });
  const partyCountPattern = `(?:\\d+|${Object.keys(PARTY_COUNTS).join('|')})`;

  function partyCount(value) {
    const token = lower(value).trim().replace(/ё/g, 'е');
    if (/^\d+$/.test(token)) return Math.max(0, Number(token));
    return PARTY_COUNTS[token] || 0;
  }

  function firstPartyCount(text, expression) {
    const match = lower(text).replace(/ё/g, 'е').match(expression);
    return match ? partyCount(match[1]) : 0;
  }

  function parseParty(text, current = {}) {
    const q = lower(text).replace(/ё/g, 'е');
    const previousChildren = Array.isArray(current.children) ? current.children.slice(0, 12) : [];
    const previousInfants = Math.max(0, Number(current.infants) || 0);
    const previousAdults = Math.max(0, Number(current.adults) || 0);

    const adultCount = firstPartyCount(q, new RegExp(`(?:^|[^а-яё\\d])(${partyCountPattern})\\s*(?:взросл|совершеннолет|родител)`, 'i'));
    const infantCount = firstPartyCount(q, new RegExp(`(?:^|[^а-яё\\d])(${partyCountPattern})\\s*(?:малыш|младен|груднич|ребенок?\\s+до\\s*3)`, 'i'));
    const hasInfantWord = /малыш|младен|груднич|ребенок?\s+до\s*3|до\s*3\s*лет/.test(q);
    const hasNoChildren = /без\s+дет|дет(?:ей|и)?\s+нет|никого\s+из\s+дет/.test(q);
    const hasChildWord = /дет|ребен/.test(q) && !hasNoChildren;
    const explicitParty = Boolean(adultCount || infantCount || hasInfantWord || hasChildWord);

    const childCount = firstPartyCount(q, new RegExp(`(?:^|[^а-яё\\d])(${partyCountPattern})\\s*(?:дет(?:ей|и)?|ребен(?:ок|ка|ка)?|ребят)`, 'i'));
    const ageMatches = [...q.matchAll(/(\d{1,2})\s*(?:лет|года|год|[-\u2011\u2013]?летн(?:ий|яя|ие|их))/g)]
      .map(match => Number(match[1])).filter(age => age >= 3 && age <= 17);
    const childAgeBlock = q.match(/(?:дет(?:и|ей)?|ребен(?:ок|ка)?)[^.!?\n]{0,40}/);
    const listedChildAges = childAgeBlock
      ? (childAgeBlock[0].match(/\d{1,2}/g) || []).map(Number).filter(age => age >= 3 && age <= 17)
      : ageMatches;
    const childAges = listedChildAges.slice(0, 12);
    let children = previousChildren;
    if (hasChildWord) {
      if (childAges.length) {
        children = childAges.slice();
        const expected = Math.min(12, childCount || children.length);
        while (children.length < expected) children.push(children[children.length - 1] || 8);
      } else if (childCount) {
        children = Array.from({ length:Math.min(12, childCount) }, () => 8);
      } else if (!children.length) {
        children = [8];
      }
    } else if (adultCount || infantCount || /(?:^|[^а-яё\d])(?:нас|семья|групп|едем|поедем|будет|всего)\b/.test(q)) {
      // A new explicit adult/total answer replaces an earlier guided guess.
      children = [];
    }

    const totalPatterns = [
      new RegExp(`(?:^|[^а-яё])(?:нас|семь(?:я|и)|групп(?:а|ой|у)?|едем|поедем|будет|всего|состав(?:ом)?)(?:\\s+из)?\\s*(${partyCountPattern})\\s*(?:чел(?:овек)?|турист(?:ов|а)?|гост(?:ей|я)?)?`, 'i'),
      new RegExp(`(?:^|[^а-яё\\d])(${partyCountPattern})\\s*(?:чел(?:овек)?|турист(?:ов|а)?|гост(?:ей|я)?)`, 'i'),
    ];
    const total = totalPatterns.map(expression => firstPartyCount(q, expression)).find(value => value > 0) || 0;
    let adults = adultCount || previousAdults;
    const infants = infantCount || (hasInfantWord ? Math.max(1, previousInfants) : (total && !hasChildWord ? 0 : previousInfants));
    if (total) adults = adultCount ? adultCount : Math.max(0, total - children.length - infants);
    if (total && !adultCount && !children.length && !infants) adults = total;
    if (!adults && (hasChildWord || hasInfantWord) && !total) adults = 1;
    if (explicitParty && !adults && !children.length && !infants) adults = 1;
    return {
      adults:Math.min(30, Math.max(0, adults)),
      children:children.slice(0, 12),
      infants:Math.min(12, Math.max(0, infants)),
    };
  }

  function parseMessage(text) {
    const q = lower(text);
    const s = state.slots;
    const destination = destinationAlias(q);
    if (destination) s.destination = destination;
    if (!destination && /не реш.*(куда|город|направ)|не определ.*(куда|город|направ)|любой город|без разниц|куда угодно/.test(q)) s.destination = 'Любое направление';
    if (/индив|личн|под вас|под нас|сво[йя]|частн|без группы/.test(q)) s.tripType = 'individual';
    if (/групп|готовый выезд|сборн|тургрупп/.test(q)) s.tripType = 'group';
    if (/сравн.*оба|оба формат|пока не решил формат/.test(q)) s.tripType = 'compare';

    const party = parseParty(text, s);
    s.adults = party.adults;
    s.children = party.children;
    s.infants = party.infants;

    const parsedDate = parseDate(q);
    if (parsedDate) { s.date = parsedDate.value; s.dateFlexible = parsedDate.flexible; }
    if (/(?:^|\s)(?:не|без)\s+(?:хочу\s+)?(?:море|пляж|остров)/.test(q)) s.preferences = s.preferences.filter(item => item !== 'море');
    else if (/море|пляж|остров|сноркл|купани/.test(q)) s.preferences = [...new Set([...s.preferences, 'море'])];
    if (/природ|горы|горы|водопад|фото|красив/.test(q)) s.preferences = [...new Set([...s.preferences, 'природа'])];
    if (/город|культур|храм|музе|истори/.test(q)) s.preferences = [...new Set([...s.preferences, 'город и культура'])];
    if (/лёгк|легк|не тяж|без долг|спокойн/.test(q)) s.preferences = [...new Set([...s.preferences, 'лёгкая программа'])];
    if (/премиум|vip|вип|комфорт/.test(q)) s.preferences = [...new Set([...s.preferences, 'комфорт / премиум'])];
    if (/трансфер/.test(q)) s.transfer = /без\s+трансфер|трансфер не нужен|сами добер/.test(q) ? 'не нужен' : 'нужен';
    if (/отел/.test(q)) s.hotel = /без\s+отел|отель не нужен/.test(q) ? 'не нужен' : 'нужен / уточнить';
    const budget = parseBudget(q);
    if (budget) s.budget = clean(budget);
    const phone = text.match(/(?:\+?\d[\d\s()\-]{8,}\d)/);
    if (phone) s.contact.phone = clean(phone[0]);
    const telegram = text.match(/@[a-zA-Z0-9_]{4,32}/);
    if (telegram) s.contact.telegram = clean(telegram[0]);
    const named = text.match(/(?:меня зовут|имя)\s+([А-ЯЁA-Z][а-яёa-z-]{2,}(?:\s+[А-ЯЁA-Z][а-яёa-z-]{2,})?)/i);
    if (named) s.contact.name = clean(named[1], 160);
    s.question = clean(text, 1200);
  }

  function stage() {
    const s = state.slots;
    if (!s.destination) return 'destination';
    if (!s.tripType) return 'tripType';
    if (!s.adults && !s.children.length && !s.infants) return 'party';
    if (!s.date) return 'date';
    if (!s.preferences.length) return 'preferences';
    if (!s.contact.name && !s.contact.phone && !s.contact.telegram) return 'contact';
    return 'done';
  }

  function promptFor(current = stage()) {
    return ({
      destination: 'Куда хотите поехать?',
      tripType: 'Индивидуальная поездка или групповой выезд?',
      party: 'Сколько взрослых, детей и малышей едет?',
      date: 'На какие даты планируете?',
      preferences: 'Что важно в поездке: море, природа, город или комфорт?',
      contact: 'Подходящие варианты уже ниже — выберите понравившийся.',
      done: 'Готово. Выберите подходящий вариант ниже.',
    })[current];
  }

  function quickReplies(current = stage()) {
    if (current === 'destination') return [['Нячанг','Нячанг'],['Дананг','Дананг'],['Фукуок','Фукуок'],['Ханой','Ханой'],['Муйне','Муйне/Фантьет']];
    if (current === 'tripType') return [['Индивидуально','индивидуальная поездка'],['Групповой выезд','групповой выезд'],['Сравнить оба','пока не решил формат']];
    if (current === 'party') return [['2 взрослых','2 взрослых'],['2 взрослых + ребёнок 7 лет','2 взрослых, ребёнок 7 лет']];
    if (current === 'date') return [['Ближайшие выходные','ближайшие выходные'],['В течение недели','в течение ближайшей недели'],['Дата гибкая','дата гибкая']];
    if (current === 'preferences') return [['Море и острова','море, острова'],['Природа и фото','природа, горы, фото'],['Легко и комфортно','лёгкая программа, комфорт']];
    return [];
  }

  function hasParty() {
    const s = state.slots;
    return Boolean(Number(s.adults || 0) || s.children.length || Number(s.infants || 0));
  }

  function budgetNumber(value) {
    const match = String(value || '').replace(/\s/g, '').match(/\d+(?:[.,]\d+)?/);
    if (!match) return 0;
    const number = Number(match[0].replace(',', '.'));
    if (!Number.isFinite(number)) return 0;
    return /млн/i.test(value) ? number * 1000000 : /тыс|к/i.test(value) ? number * 1000 : number;
  }

  function departureMatchesDate(departure, isoDate) {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return true;
    const date = new Date(`${isoDate}T00:00:00Z`);
    const day = date.getUTCDate();
    const month = date.getUTCMonth();
    const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    const label = lower(departure?.date || '');
    const days = (label.match(/\d{1,2}/g) || []).map(Number);
    return days.includes(day) && label.includes(months[month]);
  }

  function evaluateTour(tour, format) {
    const s = state.slots;
    const people = { adults:Math.max(1, Number(s.adults) || 0), children:s.children.length, infants:Math.max(0, Number(s.infants) || 0) };
    const formatData = format === 'group' ? tour.group : tour.individual;
    const hay = lower(`${tour.title} ${tour.city} ${tour.region} ${tour.category} ${(tour.tags || []).join(' ')} ${tour.searchText || ''} ${(Array.isArray(formatData?.notes) ? formatData.notes : []).join(' ')}`);
    let score = Number(tour.popular) ? 1 : 0;
    if (!formatData?.from || formatData.from === '—') score -= 100;
    if (s.destination && s.destination !== 'Любое направление' && hay.includes(lower(s.destination).split('/')[0])) score += 7;
    if (s.destination === 'Далат' && /далат/.test(hay)) score += 8;
    if (format === 'group' && formatData?.from && formatData.from !== '—') score += 3;
    if (format === 'individual' && formatData?.from) score += 3;
    if (s.children.length && tour.childrenOk !== false) score += 4;
    if (!s.children.length && /дети|семья/.test(hay) && score > 0) score += 1;
    for (const pref of s.preferences) {
      if (pref === 'море' && /море|остров|пляж|сноркл/.test(hay)) score += 4;
      if (pref === 'природа' && /природ|горы|фото|дюны|водопад/.test(hay)) score += 4;
      if (pref.includes('город') && /город|культур|мост|храм/.test(hay)) score += 3;
      if (pref.includes('лёг') && /легк|обзорн|трансфер/.test(hay)) score += 3;
      if (pref.includes('премиум') && /премиум|vip|вип|комфорт/.test(hay)) score += 3;
    }

    const base = format === 'group' ? firstMoney(formatData?.adult || formatData?.from) : firstMoney(formatData?.from);
    const total = globalThis.MaxTourBookingPricing?.calculateTotal?.(tour, people, format) || 0;
    const fallback = format === 'group' ? base * (people.adults + people.children) : base;
    const estimateUsd = total || fallback;
    let availability = 'даты уточняются';
    let available = true;
    if (format === 'group') {
      const departures = Array.isArray(formatData?.departures) ? formatData.departures : [];
      const matching = departures.filter(item => departureMatchesDate(item, s.dateFlexible ? '' : s.date));
      const suitable = matching.find(item => Number(item.capacity || 0) - Number(item.taken || 0) >= people.adults + people.children + people.infants && !/лист ожидания|полон/i.test(String(item.status || '')));
      const open = suitable || matching.find(item => !/лист ожидания|полон/i.test(String(item.status || '')));
      if (open) {
        const remaining = Math.max(0, Number(open.capacity || 0) - Number(open.taken || 0));
        availability = remaining ? `ближайший выезд ${open.date || ''}${open.time ? ` · ${open.time}` : ''}`.trim() : 'осталось мало мест';
        available = !s.date || s.dateFlexible || Boolean(suitable);
        score += suitable ? 5 : 1;
      } else if (departures.length) {
        availability = s.date && !s.dateFlexible ? 'на эту дату выезд не найден' : 'сейчас нет свободного выезда';
        available = false;
        score -= 4;
      }
    } else if (formatData?.from) {
      availability = s.date ? 'дата подтверждается при бронировании' : 'дата выбирается при бронировании';
    }
    if (s.hotel && /нужен/.test(lower(s.hotel)) && /отел|размещ|номер|прожив/.test(hay)) score += 2;
    if (s.transfer === 'нужен' && /трансфер|отел/.test(hay)) score += 2;
    const budget = budgetNumber(s.budget);
    if (budget && estimateUsd) score += estimateUsd <= budget ? 3 : -3;
    const note = s.children.length && tour.childrenOk !== false
      ? 'подходит для семьи'
      : availability;
    return { tour, format, score, estimateUsd, availability, available, note, people, partyLabel:formatPeople() };
  }

  function matchTours() {
    const mode = state.slots.tripType === 'group' ? 'group' : state.slots.tripType === 'compare' ? 'compare' : 'individual';
    if (mode === 'compare') {
      return tours().map(tour => {
        const individual = evaluateTour(tour, 'individual');
        const group = evaluateTour(tour, 'group');
        return {
          tour,
          format: 'compare',
          score: Math.max(individual.score, group.score) + (individual.available && group.available ? 1 : 0),
          estimateUsd: individual.estimateUsd,
          individual,
          group,
          note: 'сравнение двух форматов',
          people: individual.people,
          partyLabel: individual.partyLabel,
        };
      }).filter(item => item.individual.estimateUsd || item.group.estimateUsd)
        .sort((a,b) => b.score - a.score || Number(b.tour.popular) - Number(a.tour.popular)).slice(0, 3);
    }
    return tours().map(tour => evaluateTour(tour, mode))
      .filter(item => item.estimateUsd)
      .sort((a,b) => b.score - a.score || Number(b.tour.popular) - Number(a.tour.popular)).slice(0, 3);
  }

  function shouldShowRecommendations() {
    const s = state.slots;
    const explicit = /подбер|подобра|покаж|вариант|тур|экскурс|что есть/.test(lower(s.question));
    return Boolean(s.destination && (explicit || (s.tripType && hasParty() && s.date && s.preferences.length)));
  }

  function updateRecommendations() {
    state.recommendations = shouldShowRecommendations() ? matchTours() : [];
  }

  function recommendationReason(item) {
    const s = state.slots;
    const reasons = [];
    if (s.destination) reasons.push(`направление ${s.destination}`);
    if (item.format === 'compare') reasons.push('сравнила индивидуальный и групповой форматы');
    if (s.tripType === 'group' && item.availability) reasons.push(item.availability);
    if (s.tripType === 'individual' && item.tour.individual?.from) reasons.push('подходит для индивидуальной поездки');
    if (s.children.length && item.tour.childrenOk) reasons.push('подходит для семьи');
    if (s.date && item.format !== 'compare') reasons.push(item.availability || 'дата учитывается');
    const preferenceLabels = { море:'море', природа:'природа', 'город и культура':'культура', 'лёгкая программа':'спокойный темп', 'комфорт / премиум':'комфорт' };
    for (const preference of s.preferences) {
      if (preferenceLabels[preference]) reasons.push(preferenceLabels[preference]);
    }
    return [...new Set(reasons)].slice(0, 3).join(' · ') || 'совпадает с вашим запросом';
  }

  function answerQuestion(text) {
    const q = lower(text);
    if (/отмен|перенос|возврат/.test(q)) return 'Отмена бесплатна более чем за 48 часов; до 17:00 накануне удерживается 30%, позже — 100%. Перенос до 17:00 накануне бесплатный.';
    if (/оплат|депозит|предоплат|30\s*%|сто процент|карт|наличн|рубл|доллар/.test(q)) return 'Для поездки можно выбрать депозит 30–100% или полную оплату. Точная сумма появится перед подтверждением бронирования.';
    if (/трансфер|аэропорт|встреч|заберут|забрать/.test(q)) return 'Трансфер из отеля или к точке встречи можно добавить к поездке. Напишите название отеля — я учту его при подборе.';
    if (/отел|прожив|номер|где ноч/.test(q)) return 'Если поездка с проживанием, это указано в карточке и входит в параметры выбранной программы. Напишите, нужен ли отель.';
    if (/ребён|ребен|дет|малыш|коляск|возраст/.test(q)) return 'Дети участвуют по возрастным условиям конкретной экскурсии. Напишите возраст каждого ребёнка и малыша — я учту это в расчёте.';
    if (/питан|обед|ужин|завтрак|еда|wi[ -]?fi|интернет|связь/.test(q)) return 'Питание и другие включённые услуги зависят от программы. Откройте понравившуюся поездку — в карточке будет полный состав включённых услуг.';
    if (/что входит|включен|программ|маршрут|посмотрим|увидим|локац/.test(q)) return 'Маршрут, длительность, точки поездки и включённые услуги указаны в карточке каждой экскурсии.';
    if (/сколько дл|продолж|во сколько|время выезда|рано/.test(q)) return 'Время и длительность зависят от маршрута. Откройте карточку подходящей поездки, чтобы увидеть точное расписание.';
    if (/гид|язык|русск|экскурсовод/.test(q)) return 'В карточке каждой поездки указано, предусмотрен ли русскоязычный гид и какой формат сопровождения входит в программу.';
    if (/багаж|вещ|одежд|обув|что взять|подготов/.test(q)) return 'Для поездки обычно нужны удобная обувь, лёгкая одежда, вода и защита от солнца. Точные рекомендации зависят от маршрута.';
    if (/погода|дожд|сезон|температур|море холод/.test(q)) return 'Погода во Вьетнаме зависит от региона и даты. Напишите город и период поездки — я помогу подобрать подходящий формат.';
    if (/безопас|страхов|документ|паспорт|виза/.test(q)) return 'Возьмите паспорт и документы, необходимые для вашей поездки. Перед выездом приложение покажет важные детали выбранной программы.';
    if (/цена|стоим|сколько стоит|бюджет|дорог|дешев|дешёв/.test(q)) return state.recommendations.length
      ? 'Стоимость уже рассчитана по составу вашей поездки и показана в карточках ниже.'
      : 'Стоимость зависит от маршрута, формата, даты и состава группы. Укажите эти параметры — я покажу подходящие варианты.';
    if (/дата|когда|выезд|свобод|места|заброниров/.test(q)) return 'Укажите желаемую дату и количество участников — я покажу доступные варианты и ближайшие выезды.';
    if (/тур|экскурс|вариант|подбер|покаж/.test(q)) return 'Покажу подходящие поездки ниже. Укажите город, формат, состав группы и желаемую дату.';
    // These are answers to the guided slots, not knowledge questions.  Let
    // the flow continue with its next prompt instead of showing a generic
    // help message after every chip or short typed reply.
    if (destinationAlias(q) || parseDate(q) || /индив|групп|сравн|взросл|дет|ребён|ребен|малыш|младен|море|пляж|остров|природ|горы|водопад|фото|город|культур|храм|лёгк|легк|премиум|комфорт/.test(q)) return '';
    return 'Я подскажу по маршрутам, цене, датам, детям, трансферу, оплате и условиям поездки. Напишите вопрос своими словами.';
  }

  async function requestAiReply(text, history) {
    const s = state.slots;
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-max-tour-locale':ACTIVE_LOCALE },
      body: JSON.stringify({
        locale: ACTIVE_LOCALE,
        message: clean(text, 900),
        history: (history || []).slice(-10).map(item => ({ role:item.role, text:item.text })),
        context: {
          destination: s.destination,
          format: s.tripType,
          people: formatPeople(),
          date: s.date,
          preferences: s.preferences,
          locale: ACTIVE_LOCALE,
        },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.reply) throw new Error(result.error || `HTTP ${response.status}`);
    return { reply:clean(result.reply, 1800) };
  }

  function defaultAssistantReply(text) {
    const current = stage();
    const answer = answerQuestion(text);
    const next = current === 'contact'
      ? (state.recommendations.length ? 'Подходящие варианты уже ниже — выберите понравившийся.' : 'Уточните ещё один момент, и я покажу варианты.')
      : promptFor(current);
    return answer ? `${answer}${current === 'contact' || current === 'done' ? '' : ` ${next}`}` : next;
  }

  function summaryRows() {
    const s = state.slots;
    const rows = [];
    if (s.destination) rows.push(['Направление', s.destination]);
    if (s.tripType) rows.push(['Формат', s.tripType === 'group' ? 'Готовый групповой выезд' : s.tripType === 'compare' ? 'Сравнить групповой и индивидуальный' : 'Индивидуальная программа']);
    if (s.adults || s.children.length || s.infants) rows.push(['Состав группы', formatPeople()]);
    if (s.date) rows.push(['Дата', s.dateFlexible ? s.date : dateLabel(s.date)]);
    if (s.preferences.length) rows.push(['Пожелания', s.preferences.join(', ')]);
    if (s.hotel) rows.push(['Отель', s.hotel]);
    if (s.transfer) rows.push(['Трансфер', s.transfer]);
    if (s.budget) rows.push(['Бюджет', s.budget]);
    if (s.contact.name || s.contact.phone || s.contact.telegram) rows.push(['Контакт', [s.contact.name, s.contact.phone, s.contact.telegram].filter(Boolean).join(' · ')]);
    return rows;
  }

  function renderRecommendations() {
    if (!state.recommendations.length) return '';
    return `<div class="ai-chat-results"><div class="ai-msg-author">AI-консультант</div><div class="ai-chat-results-label">Советую эти поездки</div><p class="ai-chat-results-reason">Почему: ${esc(recommendationReason(state.recommendations[0]))}</p><div class="ai-recommendations">${state.recommendations.map(item => {
      const price = item.format === 'compare'
          ? `Индивидуально: ${dollarLabel(item.individual.estimateUsd)} · групповой выезд: ${dollarLabel(item.group.estimateUsd)}`
        : item.estimateUsd
          ? `ориентировочно ${dollarLabel(item.estimateUsd)} · ${item.format === 'group' ? 'за состав поездки' : 'за поездку'}`
          : 'стоимость уточняется после выбора даты';
      const note = item.format === 'compare'
        ? 'два формата для сравнения'
        : [item.note, item.availability && item.note !== item.availability ? item.availability : ''].filter(Boolean).join(' · ');
      return `<article class="ai-recommendation"><div><h4>${esc(item.tour.title)}</h4><p>${esc(item.tour.city || '')} · ${esc(note)}</p><span class="ai-price">${esc(price)}</span><span class="ai-party">Расчёт для группы: ${esc(item.partyLabel || formatPeople())}</span></div><button type="button" class="secondary" data-ai-action="open-tour" data-id="${esc(item.tour.id)}" aria-label="Открыть ${esc(item.tour.title)}">Открыть</button></article>`;
    }).join('')}</div></div>`;
  }

  function renderContactForm() {
    const s = state.slots;
    if (!['contact','done'].includes(stage()) || state.handoff) return '';
    if (!state.showContact) return '<div class="ai-save-selection"><button type="button" class="secondary" data-ai-action="show-contact">Сохранить подбор</button></div>';
    return `<form class="ai-contact-form" data-ai-form="contact"><div class="ai-contact-heading"><h4>Сохранить подбор</h4><button class="ai-contact-close" type="button" data-ai-action="hide-contact" aria-label="Свернуть форму">Свернуть</button></div><p>Укажите один контакт, чтобы сохранить параметры поездки и вернуться к бронированию.</p><div class="ai-contact-grid"><label>Имя<input name="name" value="${esc(s.contact.name)}" placeholder="Как к вам обращаться"></label><label>Телефон<input name="phone" value="${esc(s.contact.phone)}" placeholder="+7 ..."></label><label>Telegram<input name="telegram" value="${esc(s.contact.telegram)}" placeholder="@username"></label><label>Бюджет / комментарий<input name="budget" value="${esc(s.budget)}" placeholder="Например, до $600"></label><label class="wide">Отель и трансфер<input name="hotelTransfer" value="${esc([s.hotel && `отель: ${s.hotel}`, s.transfer && `трансфер: ${s.transfer}`].filter(Boolean).join('; '))}" placeholder="Отель, нужен ли трансфер"></label></div><div class="ai-contact-actions"><button class="primary" type="submit">Сохранить подбор</button><button class="secondary" type="button" data-ai-action="skip-contact">Только открыть варианты</button></div><div class="form-error" role="alert"></div></form>`;
  }

  function renderHandoff() {
    if (!state.handoff || state.handoffHidden) return '';
    const id = state.handoff.id || '—';
    return `<div class="ai-handoff" role="status"><div><b>Подбор сохранён</b><span>Номер подбора: ${esc(id)}</span></div><button type="button" class="secondary" data-ai-action="hide-handoff">Скрыть</button></div>`;
  }

  function renderQuickReplies(quick) {
    if (!quick.length) return '';
    return `<div class="ai-quick-replies" aria-label="Варианты ответа">${quick.map(item => `<button type="button" data-ai-action="quick" data-value="${esc(item[1])}">${esc(item[0])}</button>`).join('')}</div>`;
  }

  function render(root, options = {}) {
    const content = root.closest('.content');
    const previousContentScroll = content ? content.scrollTop : 0;
    const wasAtContentEnd = content
      ? content.scrollTop + content.clientHeight >= content.scrollHeight - 24
      : true;
    const active = document.activeElement;
    const hadComposerFocus = Boolean(active && active.matches && active.matches('#aiScreen textarea[name="message"]'));
    const selectionStart = hadComposerFocus && Number.isInteger(active.selectionStart) ? active.selectionStart : 0;
    const selectionEnd = hadComposerFocus && Number.isInteger(active.selectionEnd) ? active.selectionEnd : selectionStart;
    const current = stage();
    const quick = quickReplies(current);
    const messageMarkup = state.messages.map(message => {
      const role = message.role === 'user' ? 'user' : 'bot';
      const author = role === 'user' ? 'Вы' : 'AI-консультант';
      return `<div class="ai-msg ${role}"><span class="ai-msg-author">${author}</span><span class="ai-msg-text">${esc(message.text)}</span></div>`;
    }).join('');
    root.innerHTML = `<div class="section-title ai-section-head"><div><h2>AI-консультант</h2><p class="ai-chat-subtitle">Я AI-консультант, задайте мне любые вопросы, я подскажу вам с поездкой и помогу разобраться во всем.</p></div><button class="secondary ai-clear" type="button" data-ai-action="clear">Очистить</button></div><section class="ai-consultant-shell"><div class="ai-consultant-main ai-chat-panel"><div class="ai-messages" role="log" aria-label="Диалог с AI-консультантом" aria-live="polite">${messageMarkup}</div><form class="ai-consultant-input" data-ai-form="chat" aria-busy="${aiPending ? 'true' : 'false'}"><textarea name="message" rows="1" placeholder="Напишите сообщение..." aria-label="Сообщение AI-консультанту" ${aiPending ? 'disabled' : ''}></textarea><button class="primary" type="submit" aria-label="Отправить" ${aiPending ? 'disabled' : ''}>→</button></form></div><div class="ai-chat-below">${renderQuickReplies(quick)}${renderRecommendations()}${renderContactForm()}${renderHandoff()}</div></section>`;
    const messages = root.querySelector('.ai-messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
    if (content) {
      const nextContentEnd = Math.max(0, content.scrollHeight - content.clientHeight);
      content.scrollTop = options.scrollToEnd || wasAtContentEnd
        ? nextContentEnd
        : Math.min(previousContentScroll, nextContentEnd);
    }
    if (options.focusComposer || hadComposerFocus) {
      const textarea = root.querySelector('textarea[name="message"]');
      if (textarea) {
        try { textarea.focus({ preventScroll:true }); } catch (_) { textarea.focus(); }
        try { textarea.setSelectionRange(selectionStart, selectionEnd); } catch (_) {}
      }
    }
    if (options.focusContact) {
      const contactInput = root.querySelector('.ai-contact-form input[name="name"]');
      if (contactInput) {
        try { contactInput.focus({ preventScroll:false }); } catch (_) { contactInput.focus(); }
        try { contactInput.scrollIntoView({ block:'center', behavior:'smooth' }); } catch (_) {}
      }
    }
    persist();
  }

  async function handleChatText(text, root) {
    if (!text || aiPending) return;
    state.showContact = false;
    addMessage('user', text);
    parseMessage(text);
    updateRecommendations();
    const history = state.messages.slice(-10);
    const fallback = defaultAssistantReply(text);
    aiPending = true;
    addMessage('bot', 'Подбираю подходящий ответ…');
    render(root, { scrollToEnd:true });
    try {
      const aiResult = await requestAiReply(text, history);
      if (state.messages[state.messages.length - 1]?.text === 'Подбираю подходящий ответ…') state.messages.pop();
      addMessage('bot', aiResult.reply);
    } catch (_) {
      if (state.messages[state.messages.length - 1]?.text === 'Подбираю подходящий ответ…') state.messages.pop();
      addMessage('bot', fallback);
    } finally {
      aiPending = false;
      render(root, { focusComposer:true, scrollToEnd:true });
    }
  }

  function handleChat(form, root) {
    const text = String(new FormData(form).get('message') || '').trim();
    if (!text) return;
    void handleChatText(text, root);
  }

  async function handleContact(form, root) {
    const data = Object.fromEntries(new FormData(form));
    state.slots.contact = { name:clean(data.name,160), phone:clean(data.phone,80), telegram:clean(data.telegram,120) };
    state.slots.budget = clean(data.budget,120) || state.slots.budget;
    const extra = clean(data.hotelTransfer,250);
    if (extra) {
      state.slots.hotel = /отел/i.test(extra) ? extra : state.slots.hotel;
      state.slots.transfer = /трансфер/i.test(extra) ? extra : (state.slots.transfer || extra);
    }
    if (!state.slots.contact.name && !state.slots.contact.phone && !state.slots.contact.telegram) {
      form.querySelector('.form-error').textContent = 'Укажите имя, телефон или Telegram — иначе подбор нельзя будет сохранить.';
      return;
    }
    const summary = summaryRows().map(row => `${row[0]}: ${row[1]}`).join('\n');
    const payload = {
      ...state.slots,
      recommendations:state.recommendations.map(item => ({
        tourId:item.tour.id,
        title:item.tour.title,
        format:item.format,
        estimateUsd:item.estimateUsd,
        individualUsd:item.individual?.estimateUsd || 0,
        groupUsd:item.group?.estimateUsd || 0,
        availability:item.availability || item.group?.availability || '',
      })),
      conversation:state.messages.slice(-MAX_MESSAGES),
    };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const response = await fetch('/api/consultations', { method:'POST', credentials:'same-origin', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ intent:'complex_tour', handoff:true, summary, payload }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'consultation_failed');
      state.handoff = result.consultation || { id:'—' };
      state.handoffHidden = false;
      addMessage('bot', 'Готово — параметры поездки сохранены вместе с составом группы, пожеланиями и предварительным подбором. Откройте подходящий вариант и переходите к бронированию.');
      render(root, { scrollToEnd:true });
    } catch (error) {
      form.querySelector('.form-error').textContent = 'Не удалось сохранить заявку. Проверьте соединение и повторите отправку.';
      button.disabled = false;
    }
  }

  function handle(root, event) {
    const action = event.target.closest('[data-ai-action]')?.dataset.aiAction;
    if (action === 'quick') {
      const value = event.target.closest('[data-ai-action]').dataset.value || '';
      if (!value) return;
      void handleChatText(value, root);
    }
    if (action === 'open-tour') {
      const id = event.target.closest('[data-ai-action]').dataset.id;
      try { if (typeof openTour === 'function') openTour(id); } catch (_) {}
    }
    if (action === 'skip-contact') {
      state.showContact = false;
      addMessage('user', 'Пока только посмотрю варианты');
      addMessage('bot', 'Конечно. Выберите экскурсию ниже и переходите к бронированию.');
      render(root, { scrollToEnd:true });
    }
    if (action === 'show-contact') {
      state.showContact = true;
      render(root, { focusContact:true });
    }
    if (action === 'hide-contact') {
      state.showContact = false;
      render(root);
    }
    if (action === 'hide-handoff') {
      state.handoffHidden = true;
      render(root);
    }
    if (action === 'reset') {
      state = freshState();
      render(root);
    }
    if (action === 'clear') {
      state = freshState();
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
      render(root);
    }
  }

  function mount(root) {
    if (!root) return;
    render(root);
    root.onclick = event => handle(root, event);
    root.oninput = event => {
      const textarea = event.target.closest('textarea[name="message"]');
      if (!textarea) return;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(120, Math.max(45, textarea.scrollHeight))}px`;
    };
    root.onkeydown = event => {
      const textarea = event.target.closest('textarea[name="message"]');
      if (!textarea || event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      const form = textarea.closest('[data-ai-form="chat"]');
      if (form) handleChat(form, root);
    };
    root.onsubmit = event => {
      const form = event.target.closest('[data-ai-form]');
      if (!form) return;
      event.preventDefault();
      if (form.dataset.aiForm === 'chat') handleChat(form, root);
      if (form.dataset.aiForm === 'contact') handleContact(form, root);
    };
  }

  globalThis.MaxTourAI = { mount, _test: { parseBudget, parseParty, departureMatchesDate } };
})();
