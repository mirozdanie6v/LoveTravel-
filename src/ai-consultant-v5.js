(() => {
  'use strict';

  const storedLocale = String(globalThis.localStorage?.getItem?.('max-tour-locale-v1') || '').toLowerCase();
  const ACTIVE_LOCALE = ['vi','en','ko'].includes(storedLocale) ? storedLocale : 'ru';
  const STORAGE_KEY = 'max-tour-ai-consultant-v5-' + ACTIVE_LOCALE;
  const BOOKING_INTENT_KEY = 'max-tour-ai-booking-intent-v1';
  const LOCATION_KEY = 'max-tour-ai-location-v6';
  const TIME_ZONE = 'Asia/Ho_Chi_Minh';
  const MAX_MESSAGES = 100;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const lower = value => String(value || '').toLocaleLowerCase(ACTIVE_LOCALE === 'vi' ? 'vi-VN' : ACTIVE_LOCALE === 'en' ? 'en-US' : ACTIVE_LOCALE === 'ko' ? 'ko-KR' : 'ru-RU');
  const clean = (value, max = 900) => String(value ?? '').trim().slice(0, max);
  const localeText = (ru, vi, en, ko) => ACTIVE_LOCALE === 'vi' ? vi : ACTIVE_LOCALE === 'en' ? en : ACTIVE_LOCALE === 'ko' ? ko : ru;
  const catalog = () => { try { return Array.isArray(TOURS) ? TOURS : []; } catch (_) { return []; } };

  function vietnamTodayIso() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  function addIsoDays(iso, days) {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function dateLabel(iso, options = {}) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return String(iso || '');
    return new Intl.DateTimeFormat(ACTIVE_LOCALE === 'vi' ? 'vi-VN' : ACTIVE_LOCALE === 'en' ? 'en-US' : ACTIVE_LOCALE === 'ko' ? 'ko-KR' : 'ru-RU', {
      day: 'numeric', month: options.short ? 'short' : 'long', year: options.year === false ? undefined : 'numeric', timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`));
  }

  function buildIso(day, month, year) {
    const today = vietnamTodayIso();
    const currentYear = Number(today.slice(0, 4));
    let y = Number(year || currentYear);
    if (y < 100) y += 2000;
    const date = new Date(Date.UTC(y, Number(month) - 1, Number(day)));
    if (Number.isNaN(date.valueOf()) || date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) return { value:'', invalid:true };
    const iso = date.toISOString().slice(0, 10);
    if (iso < today) return { value:'', invalid:true, past:iso };
    return { value:iso, invalid:false };
  }

  const MONTHS = [
    ['январ',1],['феврал',2],['март',3],['апрел',4],['май',5],['мая',5],['июн',6],['июл',7],['август',8],['сентябр',9],['октябр',10],['ноябр',11],['декабр',12],
  ];

  function parseDate(text) {
    const q = lower(text);
    const today = vietnamTodayIso();
    if (/(?:^|\s)(?:сегодня|hôm\s*nay|hom\s*nay)(?:\s|$|[,.!?])/.test(q)) return { value:today, flexible:false };
    if (/завтра|ngày\s*mai|ngay\s*mai/.test(q)) return { value:addIsoDays(today, 1), flexible:false };
    if (/выходн|cuối\s*tuần|cuoi\s*tuan/.test(q)) return { value:'Ближайшие выходные', flexible:true };
    if (/в течение (?:ближайшей )?недел|через неделю|на неделе|trong\s*tuần\s*tới|tuan\s*toi|tuần\s*tới/.test(q)) return { value:'В течение ближайшей недели', flexible:true };
    if (/дата гибк|неважно когда|дат[ау].*нет|по датам гибк|ngày\s*linh\s*hoạt|ngay\s*linh\s*hoat|không\s*quan\s*trọng\s*ngày|linh\s*hoạt\s*ngày/.test(q)) return { value:'Дата гибкая', flexible:true };

    const numeric = q.match(/(?:^|[^\d])(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?(?:[^\d]|$)/);
    if (numeric) return { ...buildIso(numeric[1], numeric[2], numeric[3]), flexible:false };

    const named = q.match(/(?:^|[^а-яё])(\d{1,2})\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-яё]*(?:\s+(20\d{2}))?/);
    if (named) {
      const month = MONTHS.find(([stem]) => named[2].startsWith(stem))?.[1];
      return month ? { ...buildIso(named[1], month, named[3]), flexible:false } : null;
    }
    return null;
  }

  function destinationAlias(text) {
    const q = lower(text);
    if (/нячанг|на-?чанг|nha\s*trang/.test(q)) return 'Нячанг';
    if (/дананг|да-?нанг|đà\s*nẵng|da\s*nang/.test(q)) return 'Дананг';
    if (/фукуок|фу-?куок|phú\s*quốc|phu\s*quoc/.test(q)) return 'Фукуок';
    if (/ханой|hà\s*nội|ha\s*noi/.test(q)) return 'Ханой';
    if (/муйн|фантьет|mũi\s*né|mui\s*ne|phan\s*thiết|phan\s*thiet/.test(q)) return 'Муйне/Фантьет';
    if (/далат|đà\s*lạt|da\s*lat/.test(q)) return 'Далат';
    if (/фуйен|фу[йи]ен|туй\s*хоа|phú\s*yên|phu\s*yen|tuy\s*hòa|tuy\s*hoa/.test(q)) return 'Фуйен';
    if (/хойан|хой\s*ан|hội\s*an|hoi\s*an/.test(q)) return 'Хойан';
    if (/халонг|ха\s*лонг|hạ\s*long|ha\s*long/.test(q)) return 'Халонг';
    return '';
  }

  const PARTY_WORDS = {
    один:1, одна:1,
    двое:2, два:2, две:2, двоих:2,
    трое:3, три:3, троих:3,
    четверо:4, четыре:4, четверых:4,
    пятеро:5, пять:5, пятерых:5,
    шестеро:6, шесть:6, шестерых:6,
    семеро:7, семь:7, семерых:7,
    восемь:8, восьмерых:8,
    девять:9, девятерых:9,
    десять:10, десятерых:10,
  };
  function numberWord(value) { const q = lower(value).replace(/ё/g,'е'); return /^\d+$/.test(q) ? Number(q) : PARTY_WORDS[q] || 0; }
  function countBefore(text, noun) {
    const words = Object.keys(PARTY_WORDS).join('|');
    const match = lower(text).replace(/ё/g,'е').match(new RegExp(`(?:^|[^а-яё\\d])(\\d+|${words})\\s*(?:${noun})`, 'i'));
    return match ? numberWord(match[1]) : 0;
  }

  function parseParty(text, current) {
    const q = lower(text).replace(/ё/g,'е');
    const viAdults = Number((q.match(/(\d+)\s*(?:người\s*lớn|nguoi\s*lon|người\s*trưởng\s*thành)/) || [])[1] || 0);
    const viChildren = Number((q.match(/(\d+)\s*(?:trẻ\s*em|tre\s*em|trẻ|bé|be)(?!\s*sơ\s*sinh)/) || [])[1] || 0);
    const viInfants = Number((q.match(/(\d+)\s*(?:em\s*bé|em\s*be|trẻ\s*sơ\s*sinh|tre\s*so\s*sinh|bé\s*nhỏ|be\s*nho)/) || [])[1] || 0);
    const explicitAdults = countBefore(q, 'взросл|совершеннолет|родител') || viAdults;
    const explicitChildren = countBefore(q, 'дет(?:ей|и)?|ребен(?:ок|ка)?') || viChildren;
    const explicitInfants = countBefore(q, 'малыш|младен|груднич') || viInfants;
    const totalMatch = q.match(new RegExp(`(?:нас|едем|поедем|всего|семья(?: из)?|группа(?: из)?|на|для)\\s*(\\d+|${Object.keys(PARTY_WORDS).join('|')})`, 'i'));
    const viTotalMatch = q.match(/(?:chúng\s*tôi|chung\s*toi|gia\s*đình|gia\s*dinh|tổng\s*cộng|tong\s*cong|nhóm|nhom)\s*(?:có\s*)?(\d+)\s*(?:người|nguoi)?/);
    const total = totalMatch ? numberWord(totalMatch[1]) : Number(viTotalMatch?.[1] || 0);
    const ages = [...q.matchAll(/(\d{1,2})\s*(?:лет|года|год|tuổi|tuoi)/g)].map(item => Number(item[1])).filter(age => age >= 3 && age <= 17).slice(0, 12);
    const hasChild = /дет|ребен|trẻ\s*em|tre\s*em|\bbé\b|\bbe\b/.test(q);
    const hasNoChildren = /без\s+дет|дет(?:ей|и)?\s+нет|không\s*có\s*trẻ|khong\s*co\s*tre/.test(q);
    let children = hasNoChildren ? [] : (hasChild ? (ages.length ? ages : Array.from({ length:explicitChildren || 1 }, () => 8)) : current.children);
    let infants = explicitInfants || current.infants;
    let adults = explicitAdults || current.adults;
    if (total && !explicitAdults) adults = Math.max(0, total - children.length - infants);
    if (total && !children.length && !infants) adults = total;
    return { adults:Math.min(30, Math.max(0, adults)), children:children.slice(0, 12), infants:Math.min(12, Math.max(0, infants)) };
  }

  function freshSlots() {
    return { destination:'', tripType:'', date:'', dateFlexible:false, dateError:'', adults:0, children:[], infants:0, preferences:[], question:'' };
  }
  function freshState() {
    return { slots:freshSlots(), messages:[{ role:'bot', text:localeText(
      'Задавайте вопрос — я помогу подобрать экскурсию и сразу перейти к бронированию.',
      'Hãy đặt câu hỏi — tôi sẽ giúp bạn chọn tour và chuyển ngay đến bước đặt tour.',
      'Ask a question — I will help you choose a tour and continue straight to booking.',
      '질문해 주세요. 알맞은 투어를 추천하고 바로 예약까지 도와드릴게요.'
    ) }], recommendations:[], selectedTourId:'' };
  }
  let state = freshState();
  let pending = false;
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.slots && Array.isArray(saved.messages)) state = { ...freshState(), ...saved, slots:{ ...freshSlots(), ...saved.slots } };
  } catch (_) {}

  function persist() { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, messages:state.messages.slice(-MAX_MESSAGES) })); } catch (_) {} }
  function add(role, text) {
    const value = clean(text, 1800); if (!value) return;
    const last = state.messages[state.messages.length - 1];
    if (last?.role === role && last.text === value) return;
    state.messages.push({ role, text:value }); state.messages = state.messages.slice(-MAX_MESSAGES);
  }
  function peopleCount() { return Number(state.slots.adults || 0) + state.slots.children.length + Number(state.slots.infants || 0); }
  function peopleLabel() {
    const s = state.slots, parts = [];
    if (s.adults) parts.push(`${s.adults} взр.`);
    if (s.children.length) parts.push(`${s.children.length} дет.`);
    if (s.infants) parts.push(`${s.infants} мал.`);
    return parts.join(' + ') || 'состав не указан';
  }

  function parseMessage(text) {
    const q = lower(text), s = state.slots;
    const destination = destinationAlias(q); if (destination) s.destination = destination;
    if (/индив|своей компанией|без группы|частн|tour\s*riêng|riêng\s*tư|riêng|cá\s*nhân|ca\s*nhan|private/.test(q)) s.tripType = 'individual';
    if (/групп|присоедин|сборн|tour\s*ghép|tour\s*ghep|ghép|ghep|đoàn|doan/.test(q)) s.tripType = 'group';
    if (/сравн|не знаю.*формат|любой формат|so\s*sánh|so\s*sanh|chưa\s*biết.*(?:hình\s*thức|loại)|bất\s*kỳ|bat\s*ky/.test(q)) s.tripType = 'compare';
    const party = parseParty(text, s); Object.assign(s, party);
    const parsedDate = parseDate(text);
    if (parsedDate) {
      if (parsedDate.invalid) { s.dateError = parsedDate.past || 'past'; s.date = ''; s.dateFlexible = false; }
      else { s.dateError = ''; s.date = parsedDate.value; s.dateFlexible = Boolean(parsedDate.flexible); }
    }
    const prefs = new Set(s.preferences || []);
    if (/море|пляж|остров|сноркл|купани|biển|bien|bãi\s*biển|bai\s*bien|đảo|dao|lặn|lan|tắm\s*biển/.test(q)) prefs.add('море');
    if (/красив|природ|горы|водопад|фото|вид|thiên\s*nhiên|thien\s*nhien|núi|nui|thác|thac|chụp\s*ảnh|chup\s*anh|cảnh\s*đẹp|canh\s*dep/.test(q)) prefs.add('природа');
    if (/город|храм|культур|истори|музе|thành\s*phố|thanh\s*pho|chùa|chua|văn\s*hóa|van\s*hoa|lịch\s*sử|lich\s*su|bảo\s*tàng|bao\s*tang/.test(q)) prefs.add('город и культура');
    if (/легк|лёгк|спокойн|без долг|nhẹ|nhe|thoải\s*mái|thoai\s*mai|không\s*đi\s*nhiều|khong\s*di\s*nhieu/.test(q)) prefs.add('лёгкая программа');
    if (/подешев|дешев|бюджет|эконом|не\s+переплач|минимальн.{0,16}цен|цен[ау].{0,16}важн|rẻ|re|tiết\s*kiệm|tiet\s*kiem|ngân\s*sách|ngan\s*sach|giá\s*tốt|gia\s*tot/.test(q)) {
      prefs.delete('комфорт / премиум');
      prefs.delete('насыщенная программа');
      prefs.add('выгодная цена');
    }
    if (/интересн.{0,16}программ|насыщенн|максимум.{0,20}(?:посмотр|увид)|ярк.{0,16}программ|nhiều\s*điểm|nhieu\s*diem|đa\s*dạng|da\s*dang|nhiều\s*trải\s*nghiệm|nhieu\s*trai\s*nghiem/.test(q)) {
      prefs.delete('выгодная цена');
      prefs.add('насыщенная программа');
    }
    if (/vip|вип|премиум|комфорт|cao\s*cấp|cao\s*cap|sang\s*trọng|sang\s*trong/.test(q)) {
      prefs.delete('выгодная цена');
      prefs.add('комфорт / премиум');
    }
    s.preferences = [...prefs];
    s.question = clean(text, 1200);
  }

  function isDiscoveryIntent(text) {
    return /подбер|подобра|покаж|посовет|вариант|экскурс|тур\b|куда.*съезд|куда.*поех|хочу.*(?:остров|море|природ|экскурс)|gợi\s*ý|goi\s*y|đề\s*xuất|de\s*xuat|chọn|chon|tour\b|tham\s*quan|đi\s*đâu|di\s*dau|muốn.*(?:biển|đảo|thiên\s*nhiên)/i.test(String(text || ''));
  }
  function isBookingIntent(text) { return /хочу.*заброни|заброниру|оформ|бер[еу]м|выбираю|этот вариант|поехали|muốn\s*đặt|muon\s*dat|đặt\s*tour|dat\s*tour|đặt\s*chỗ|dat\s*cho|chọn\s*tour\s*này|chon\s*tour\s*nay|lấy\s*tour\s*này|lay\s*tour\s*nay/i.test(String(text || '')); }

  function money(value) {
    const match = String(value || '').match(/\$\s*([\d,.]+)/);
    return match ? Math.max(0, Number(match[1].replace(/,/g,'')) || 0) : 0;
  }
  function moneyLabel(value) { const amount = Math.round(Number(value) || 0); return amount ? `$${amount.toLocaleString('en-US')}` : 'цена уточняется'; }

  function departureIso(departure) {
    const direct = String(departure?.iso || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct >= vietnamTodayIso() ? direct : '';
    const date = String(departure?.date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date >= vietnamTodayIso() ? date : '';
    const q = lower(date);
    const day = Number((q.match(/\d{1,2}/) || [])[0]);
    const month = MONTHS.find(([stem]) => q.includes(stem))?.[1];
    if (!day || !month) return '';
    const year = Number(vietnamTodayIso().slice(0,4));
    const iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0,10);
    return iso >= vietnamTodayIso() ? iso : '';
  }

  function futureDepartures(tour) {
    return (Array.isArray(tour?.group?.departures) ? tour.group.departures : [])
      .map(item => ({ item, iso:departureIso(item) })).filter(row => row.iso)
      .filter(row => !/лист ожидания|полон|отмен/i.test(String(row.item.status || '')))
      .sort((a,b) => a.iso.localeCompare(b.iso));
  }

  function haystack(tour) { return lower(`${tour.title} ${tour.city} ${tour.region} ${tour.category} ${(tour.tags || []).join(' ')} ${(tour.audience || []).join(' ')} ${tour.searchText || ''}`); }
  function scoreTour(tour) {
    const s = state.slots, hay = haystack(tour);
    let score = Number(tour.popular) ? 2 : 0;
    if (s.destination && hay.includes(lower(s.destination).split('/')[0])) score += 8;
    for (const pref of s.preferences) {
      if (pref === 'море' && /море|остров|пляж|сноркл|океан/.test(hay)) score += 7;
      if (pref === 'природа' && /природ|гора|водопад|дюны|вид|фото|далат/.test(hay)) score += 5;
      if (pref.includes('город') && /город|храм|культур|истори|обзор/.test(hay)) score += 4;
      if (pref.includes('лёг') && /обзор|легк|лёгк|комфорт|трансфер/.test(hay)) score += 3;
      if (pref.includes('премиум') && /премиум|vip|вип|комфорт/.test(hay)) score += 4;
    }
    if (state.slots.children.length && tour.childrenOk !== false) score += 3;
    return score;
  }

  function evaluate(tour) {
    const s = state.slots;
    const groupPrice = money(tour.group?.adult || tour.group?.from);
    const individualPrice = money(tour.individual?.from);
    const future = futureDepartures(tour);
    const exactDeparture = /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? future.find(row => row.iso === s.date) : null;
    const mode = s.tripType || 'compare';
    let format = mode;
    if (mode === 'group' && !groupPrice) return null;
    if (mode === 'individual' && !individualPrice) return null;
    if (mode === 'compare') format = individualPrice && groupPrice ? 'compare' : (individualPrice ? 'individual' : 'group');
    if (!groupPrice && !individualPrice) return null;
    let score = scoreTour(tour);
    if (s.date && !s.dateFlexible && mode === 'group') score += exactDeparture ? 6 : -6;
    if (mode !== 'group' && individualPrice) score += 2;
    const nearest = exactDeparture || future[0];
    const availability = exactDeparture
      ? `есть выезд ${dateLabel(exactDeparture.iso, { short:true, year:false })}${exactDeparture.item.time ? ` · ${exactDeparture.item.time}` : ''}`
      : nearest
        ? `ближайший выезд ${dateLabel(nearest.iso, { short:true, year:false })}${nearest.item.time ? ` · ${nearest.item.time}` : ''}`
        : (format === 'individual' || format === 'compare') ? 'индивидуальная дата подтверждается при оформлении' : 'даты уточняются';
    return { tour, format, score, groupPrice, individualPrice, availability, exactDeparture, nearest };
  }

  function priceForSort(item) {
    if (item.format === 'group') return item.groupPrice || Number.POSITIVE_INFINITY;
    if (item.format === 'individual') return item.individualPrice || Number.POSITIVE_INFINITY;
    return item.groupPrice || item.individualPrice || Number.POSITIVE_INFINITY;
  }

  function matchTours() {
    const budgetFirst = state.slots.preferences.includes('выгодная цена');
    return catalog().map(evaluate).filter(Boolean).sort((a,b) => {
      if (budgetFirst) {
        const relevanceA = a.score - (Number(a.tour.popular) ? 2 : 0);
        const relevanceB = b.score - (Number(b.tour.popular) ? 2 : 0);
        if (relevanceA !== relevanceB) return relevanceB - relevanceA;
        const byPrice = priceForSort(a) - priceForSort(b);
        if (byPrice) return byPrice;
      }
      return b.score - a.score || Number(b.tour.popular) - Number(a.tour.popular);
    }).slice(0,3);
  }

  function shouldShowRecommendations(text) {
    const s = state.slots;
    const signals = [Boolean(s.destination), Boolean(s.date), peopleCount() > 0, s.preferences.length > 0].filter(Boolean).length;
    return isDiscoveryIntent(text) || signals >= 2;
  }
  function updateRecommendations(text) { state.recommendations = shouldShowRecommendations(text) ? matchTours() : []; }

  function locationAllowsTour(tour) {
    let location = null;
    try { location = JSON.parse(sessionStorage.getItem(LOCATION_KEY) || 'null'); } catch (_) {}
    if (!location?.origin) return true;
    const guard = globalThis.MaxTourAI?._locationTest;
    if (!guard?.allowed || !guard?.tourPlacesFromTour) return true;
    const destinations = guard.tourPlacesFromTour(tour);
    return !destinations.length || destinations.some(destination => guard.allowed(location.origin, destination));
  }

  function recommendationForTourId(tourId) {
    const id = clean(tourId, 120);
    if (!id) return null;
    const tour = catalog().find(item => String(item?.id) === id);
    if (!tour || !locationAllowsTour(tour)) return null;
    return evaluate(tour);
  }

  function applyServerTour(result) {
    const item = recommendationForTourId(result?.tourId);
    if (!item) return false;
    state.selectedTourId = String(item.tour.id);
    state.recommendations = [item];
    return true;
  }

  function recommendationPrice(item) {
    if (item.format === 'compare') return [item.groupPrice && `группа от ${moneyLabel(item.groupPrice)}`, item.individualPrice && `индивидуально от ${moneyLabel(item.individualPrice)}`].filter(Boolean).join(' · ');
    return item.format === 'group' ? `от ${moneyLabel(item.groupPrice)} / взрослый` : `от ${moneyLabel(item.individualPrice)} за поездку`;
  }
  function imageFor(tour) { return tour.image || tour.gallery?.[0] || tour.images?.[0] || tour.fallbackImage || ''; }
  function reasonFor(item) {
    const bits = [];
    if (state.slots.preferences.includes('выгодная цена')) bits.push('выгоднее по цене');
    if (state.slots.preferences.includes('море')) bits.push('море / острова');
    if (state.slots.preferences.includes('природа')) bits.push('красивые виды');
    if (state.slots.children.length && item.tour.childrenOk !== false) bits.push('подходит с детьми');
    if (item.availability) bits.push(item.availability);
    return bits.slice(0,3).join(' · ') || 'подходит под ваш запрос';
  }

  function nextQuestion() {
    const s = state.slots;
    if (!state.recommendations.length) {
      if (!s.destination && !s.preferences.length) return localeText(
        'Что вам интереснее: море и острова, природа, город или что-то премиальное?',
        'Bạn thích điều gì hơn: biển và đảo, thiên nhiên, thành phố hay trải nghiệm cao cấp?',
        'What interests you most: sea and islands, nature, city sightseeing, or something premium?',
        '바다와 섬, 자연, 시티투어, 프리미엄 중 어떤 여행이 가장 관심 있으신가요?'
      );
      if (!peopleCount()) return localeText(
        'Сколько человек едет?',
        'Có bao nhiêu người đi?',
        'How many people are travelling?',
        '몇 분이 여행하시나요?'
      );
      if (!s.date) return localeText(
        'На какую дату планируете поездку?',
        'Bạn dự định đi vào ngày nào?',
        'What date are you planning to travel?',
        '언제 여행하실 예정인가요?'
      );
      return localeText(
        'Покажу подходящие варианты.',
        'Tôi sẽ hiển thị các phương án phù hợp.',
        'I will show you suitable options.',
        '알맞은 옵션을 보여드릴게요.'
      );
    }
    if (!peopleCount()) return localeText(
      'Я уже подобрал варианты. Сколько человек едет?',
      'Tôi đã chọn được một số phương án. Có bao nhiêu người đi?',
      'I have already found some options. How many people are travelling?',
      '적합한 옵션을 찾았습니다. 몇 분이 여행하시나요?'
    );
    if (!s.date) return localeText(
      'Варианты уже подобраны. На какую дату хотите поехать?',
      'Các phương án đã sẵn sàng. Bạn muốn đi vào ngày nào?',
      'The options are ready. What date would you like to travel?',
      '옵션을 찾았습니다. 언제 여행하고 싶으신가요?'
    );
    return localeText(
      'Выберите вариант ниже — я сразу помогу перейти к бронированию.',
      'Chọn một phương án bên dưới — tôi sẽ giúp bạn chuyển ngay sang bước đặt tour.',
      'Choose an option below and I will take you straight to booking.',
      '아래 옵션을 선택하면 바로 예약 단계로 도와드릴게요.'
    );
  }

  async function requestAiReply(text) {
    const response = await fetch('/api/ai/chat', {
      method:'POST', credentials:'same-origin', headers:{ 'content-type':'application/json', 'x-max-tour-locale':ACTIVE_LOCALE },
      body:JSON.stringify({
        locale:ACTIVE_LOCALE,
        message:clean(text,900),
        history:state.messages.slice(-10).map(item => ({ role:item.role, text:item.text })),
        context:{
          destination:state.slots.destination, format:state.slots.tripType, people:peopleLabel(), date:state.slots.date,
          preferences:state.slots.preferences, currentDateVietnam:vietnamTodayIso(), timeZone:TIME_ZONE, locale:ACTIVE_LOCALE,
        },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.reply) throw new Error(result.error || 'ai_unavailable');
    return {
      reply:clean(result.reply,1800),
      tourId:clean(result.tourId,120),
      faqIntent:clean(result.faqIntent,120),
      source:clean(result.source,120),
    };
  }

  function bookingIntent(item) {
    const s = state.slots;
    return {
      tourId:item.tour.id, title:item.tour.title,
      format:s.tripType === 'group' ? 'group' : s.tripType === 'individual' ? 'individual' : item.format,
      date:/^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : (item.exactDeparture?.iso || ''),
      adults:Math.max(1, Number(s.adults) || 0), children:s.children.slice(), infants:Number(s.infants || 0),
      createdAt:new Date().toISOString(), source:localeText('AI-консультант','Trợ lý AI','AI Assistant','AI 도우미'),
    };
  }

  function dispatchValue(input, value) {
    if (!input || value == null || value === '') return false;
    const nextValue = String(value);
    if (String(input.value ?? '') === nextValue) return false;
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
    if (descriptor?.set) {
      try { descriptor.set.call(input, nextValue); } catch (_) { input.value = nextValue; }
    } else {
      input.value = nextValue;
    }
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
    return true;
  }

  function smallestCounterRow(root, label) {
    const candidates = [...root.querySelectorAll('div,section,article,label')].filter(el => lower(el.textContent).includes(lower(label)) && el.querySelectorAll('button').length >= 2);
    return candidates.sort((a,b) => a.textContent.length - b.textContent.length)[0] || null;
  }
  function setCounter(root, label, target) {
    const row = smallestCounterRow(root, label); if (!row) return;
    const numberInput = row.querySelector('input[type="number"]');
    if (numberInput) { dispatchValue(numberInput, target); return; }
    const leafNumber = [...row.querySelectorAll('*')].find(el => el.children.length === 0 && /^\s*\d+\s*$/.test(el.textContent || ''));
    const current = leafNumber ? Number(leafNumber.textContent.trim()) : NaN;
    if (!Number.isFinite(current)) return;
    const buttons = [...row.querySelectorAll('button')];
    const minus = buttons.find(btn => /−|-|уменьш/i.test(`${btn.textContent} ${btn.getAttribute('aria-label') || ''}`));
    const plus = buttons.find(btn => /\+|увелич/i.test(`${btn.textContent} ${btn.getAttribute('aria-label') || ''}`));
    const delta = Math.max(-12, Math.min(12, Number(target) - current));
    const button = delta > 0 ? plus : minus;
    for (let i=0; button && i<Math.abs(delta); i += 1) button.click();
  }

  function prefillBooking(intent) {
    const root = document.getElementById('bookingScreen') || document.querySelector('[id*="booking" i]');
    if (!root) return false;
    if (root.id === 'bookingScreen' && !root.classList?.contains('active')) return false;
    const date = root.querySelector('input[type="date"]');
    if (date) {
      date.min = vietnamTodayIso();
      if (intent.date && intent.date >= vietnamTodayIso()) dispatchValue(date, intent.date);
    }
    setCounter(root, 'Взрослые', intent.adults);
    setCounter(root, 'Дети', intent.children.length);
    setCounter(root, 'Малыши', intent.infants);
    return true;
  }

  function visibleButtons(scope = document) {
    return [...scope.querySelectorAll('button,[role="button"]')].filter(el => {
      const style = getComputedStyle(el); const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
  }

  function continueToBooking(intent, attempt = 0) {
    if (prefillBooking(intent)) return;
    const scope = document.getElementById('tourScreen') || document;
    const buttons = visibleButtons(scope);
    const exact = buttons.find(btn => /^\s*(присоединиться|забронировать|оформить)\s*$/i.test(btn.textContent || ''));
    const broad = buttons.find(btn => /присоединиться|забронировать|оформить/i.test(btn.textContent || ''));
    const action = exact || broad;
    if (action && !action.dataset.aiBookingClicked) {
      action.dataset.aiBookingClicked = '1'; action.click();
    }
    if (intent.date) {
      const dateControl = document.querySelector(`[data-date="${CSS.escape(intent.date)}"],button[value="${CSS.escape(intent.date)}"],input[type="date"]`);
      if (dateControl?.matches?.('input')) dispatchValue(dateControl, intent.date);
      else if (dateControl && !dateControl.dataset.aiDateClicked) { dateControl.dataset.aiDateClicked = '1'; dateControl.click(); }
    }
    if (attempt < 12) setTimeout(() => continueToBooking(intent, attempt + 1), 120);
  }

  function startBooking(item, root) {
    if (!item?.tour?.id) return;
    state.selectedTourId = item.tour.id;
    const intent = bookingIntent(item);
    try { sessionStorage.setItem(BOOKING_INTENT_KEY, JSON.stringify(intent)); } catch (_) {}
    persist();
    add('bot', `Открываю бронирование «${item.tour.title}». Дату и состав группы, которые вы уже назвали, перенесу в оформление.`);
    render(root, { scrollToEnd:true });
    try {
      if (typeof openTour === 'function') openTour(item.tour.id);
      setTimeout(() => continueToBooking(intent), 100);
    } catch (_) {}
  }

  function renderRecommendations() {
    if (!state.recommendations.length) return '';
    return `<div class="ai-chat-results ai-sales-results"><div class="ai-msg-author">AI-консультант</div><div class="ai-chat-results-label">Подходящие экскурсии</div><div class="ai-recommendations">${state.recommendations.map(item => {
      const image = imageFor(item.tour);
      return `<article class="ai-recommendation ai-sales-card" data-tour-id="${esc(item.tour.id)}">${image ? `<img class="ai-tour-image" src="${esc(image)}" alt="${esc(item.tour.title)}" loading="lazy">` : ''}<div class="ai-tour-card-copy"><span class="ai-tour-meta">${esc([item.tour.city, item.tour.duration].filter(Boolean).join(' · '))}</span><h4>${esc(item.tour.title)}</h4><p>${esc(reasonFor(item))}</p><span class="ai-price">${esc(recommendationPrice(item))}</span>${peopleCount() ? `<span class="ai-party">Для: ${esc(peopleLabel())}</span>` : ''}</div><div class="ai-card-actions"><button type="button" class="secondary" data-ai-action="open-tour" data-id="${esc(item.tour.id)}">Подробнее</button><button type="button" class="primary" data-ai-action="book-tour" data-id="${esc(item.tour.id)}">Забронировать</button></div></article>`;
    }).join('')}</div></div>`;
  }

  function quickReplies() {
    const s = state.slots;
    if (!s.preferences.length && !s.destination) return [['Море и острова','Хочу море и острова'],['Красивые виды','Хочу природу и красивые виды'],['Обзор города','Хочу обзорную экскурсию']];
    if (!peopleCount()) return [['2 взрослых','Нас 2 взрослых'],['С ребёнком','2 взрослых и ребёнок 7 лет']];
    if (!s.date) return [['Сегодня','Сегодня'],['Завтра','Завтра'],['Дата гибкая','Дата гибкая']];
    return [];
  }

  function render(root, options = {}) {
    const messages = state.messages.map(item => `<div class="ai-msg ${item.role === 'user' ? 'user' : 'bot'}"><span class="ai-msg-author">${item.role === 'user' ? 'Вы' : 'AI-консультант'}</span><span class="ai-msg-text">${esc(item.text)}</span></div>`).join('');
    const quick = quickReplies();
    root.innerHTML = `<div class="section-title ai-section-head"><div><h2>AI-консультант</h2><p class="ai-chat-subtitle">Расскажите, куда и как хотите поехать. Я подберу варианты и доведу до бронирования.</p></div><button class="secondary ai-clear" type="button" data-ai-action="clear">Очистить</button></div><section class="ai-consultant-shell"><div class="ai-consultant-main ai-chat-panel"><div class="ai-messages" role="log" aria-live="polite">${messages}</div><form class="ai-consultant-input" data-ai-form="chat"><textarea name="message" rows="1" placeholder="Напишите сообщение..." ${pending ? 'disabled' : ''}></textarea><button class="primary" type="submit" ${pending ? 'disabled' : ''}>→</button></form></div><div class="ai-chat-below">${quick.length ? `<div class="ai-quick-replies">${quick.map(([label,value]) => `<button type="button" data-ai-action="quick" data-value="${esc(value)}">${esc(label)}</button>`).join('')}</div>` : ''}${renderRecommendations()}</div></section>`;
    const messagesBox = root.querySelector('.ai-messages'); if (options.scrollToEnd && messagesBox) messagesBox.scrollTop = messagesBox.scrollHeight;
    if (options.focus) { const textarea = root.querySelector('textarea[name="message"]'); try { textarea?.focus({preventScroll:true}); } catch (_) { textarea?.focus(); } }
    persist();
  }

  async function handleText(text, root) {
    if (!text || pending) return;
    add('user', text); parseMessage(text);
    if (state.slots.dateError) {
      const today = vietnamTodayIso();
      add('bot', `Эта дата уже прошла. Сегодня во Вьетнаме ${dateLabel(today)}. Выберите ${dateLabel(today, { year:false })} или любую более позднюю дату.`);
      updateRecommendations(text); render(root, { scrollToEnd:true, focus:true }); return;
    }
    updateRecommendations(text);
    if (isBookingIntent(text) && state.recommendations.length) {
      const item = state.recommendations.find(row => row.tour.id === state.selectedTourId) || state.recommendations[0];
      startBooking(item, root); return;
    }
    pending = true; add('bot', 'Подбираю…'); render(root, { scrollToEnd:true });
    try {
      const result = await requestAiReply(text);
      if (state.messages.at(-1)?.text === 'Подбираю…') state.messages.pop();
      applyServerTour(result);
      add('bot', result.reply || nextQuestion());
    } catch (_) {
      if (state.messages.at(-1)?.text === 'Подбираю…') state.messages.pop();
      add('bot', nextQuestion());
    } finally { pending = false; render(root, { scrollToEnd:true, focus:true }); }
  }

  function handleClick(root, event) {
    const button = event.target.closest('[data-ai-action]'); if (!button) return;
    const action = button.dataset.aiAction;
    if (action === 'quick') void handleText(button.dataset.value || '', root);
    if (action === 'clear') { state = freshState(); try { sessionStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(BOOKING_INTENT_KEY); } catch (_) {} render(root); }
    if (action === 'open-tour') {
      const item = state.recommendations.find(row => row.tour.id === button.dataset.id); if (!item) return;
      state.selectedTourId = item.tour.id; persist();
      try { if (typeof openTour === 'function') openTour(item.tour.id); } catch (_) {}
    }
    if (action === 'book-tour') {
      const item = state.recommendations.find(row => row.tour.id === button.dataset.id); if (item) startBooking(item, root);
    }
  }

  function mount(root) {
    if (!root) return;
    render(root);
    root.onclick = event => handleClick(root, event);
    root.onkeydown = event => {
      const textarea = event.target.closest('textarea[name="message"]');
      if (!textarea || event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault(); const value = textarea.value.trim(); if (value) void handleText(value, root);
    };
    root.onsubmit = event => {
      const form = event.target.closest('[data-ai-form="chat"]'); if (!form) return;
      event.preventDefault(); const textarea = form.querySelector('textarea[name="message"]'); const value = textarea?.value.trim(); if (value) void handleText(value, root);
    };
  }

  const observer = new MutationObserver(() => {
    let intent = null; try { intent = JSON.parse(sessionStorage.getItem(BOOKING_INTENT_KEY) || 'null'); } catch (_) {}
    if (intent?.tourId) prefillBooking(intent);
  });
  try { observer.observe(document.documentElement, { childList:true, subtree:true }); } catch (_) {}

  globalThis.MaxTourAI = {
    mount,
    _test:{
      vietnamTodayIso, parseDate, parseParty, departureIso, isDiscoveryIntent, isBookingIntent,
      recommendationForTourId, applyServerTour, locationAllowsTour, dispatchValue, prefillBooking,
    },
  };
})();
