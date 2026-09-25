import { handleAdminApi } from './admin-api.js';

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
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
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function secureAdminAsset(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'same-origin');
  headers.set('content-security-policy', "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function safeAll(statement) {
  try { return await statement.all(); } catch (error) {
    console.warn('optional group departure table unavailable', error?.message || error);
    return { results: [] };
  }
}

function consultationText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

/*
 * The customer-facing assistant is deliberately a small, bounded AI layer.
 * Workers AI may phrase the answer, but it is never allowed to invent the
 * catalogue, availability or booking rules.  Those facts are loaded from the
 * same catalogue that the Mini App renders and are supplied on every request.
 */
const DEFAULT_AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const DEFAULT_USD_RUB_RATE = 84.2569;
let aiRateCache = { value: DEFAULT_USD_RUB_RATE, at: 0 };
const AI_RULES = [
  'Отмена более чем за 48 часов — бесплатно; до 17:00 накануне удерживается 30%, позже — 100%.',
  'Перенос до 17:00 накануне выезда — бесплатно; позже может применяться удержание 30%.',
  'Оплата доступна депозитом 30% или полностью; точная сумма показывается при оформлении.',
  'Для ребёнка нужно учитывать возраст, для малыша — возраст до 3 лет; состав группы влияет на расчёт.',
  'Если точного варианта в каталоге нет, нужно спокойно собрать недостающие пожелания: направление, даты, состав группы, длительность, отель/трансфер и бюджет.',
];

const AI_RULES_VI = [
  'Hủy trước giờ khởi hành hơn 48 giờ: miễn phí; đến 17:00 ngày hôm trước giữ lại 30%, muộn hơn giữ lại 100%.',
  'Đổi ngày miễn phí đến 17:00 ngày hôm trước; sau thời điểm đó có thể giữ lại 30%.',
  'Có thể đặt cọc 30% hoặc thanh toán toàn bộ; số tiền chính xác hiển thị khi đặt tour.',
  'Cần tuổi của từng trẻ em; trẻ nhỏ dưới 3 tuổi được tính riêng và số người ảnh hưởng đến giá.',
  'Nếu chưa có phương án chính xác trong danh mục, hãy hỏi thêm điểm đến, ngày, số người, thời lượng, khách sạn/đưa đón và ngân sách.',
];

const AI_RULES_EN = [
  'Cancellation more than 48 hours before departure is free; until 17:00 on the previous day 30% is retained, later 100%.',
  'Rescheduling is free until 17:00 on the previous day; later a 30% charge may apply.',
  'A 30% deposit or full payment is available; the exact amount is shown during booking.',
  'Ask for the age of each child; party composition affects the price.',
  'If there is no exact catalogue match, ask for destination, date, party size, duration, hotel/transfer and budget.',
];

const AI_RULES_KO = [
  '출발 48시간 전까지는 무료 취소가 가능하며, 전날 17:00까지는 30%, 그 이후에는 100%가 공제됩니다.',
  '일정 변경은 전날 17:00까지 무료이며, 이후에는 30% 수수료가 적용될 수 있습니다.',
  '30% 보증금 또는 전액 결제가 가능하며 정확한 금액은 예약 단계에서 표시됩니다.',
  '어린이마다 나이를 확인해야 하며 인원 구성에 따라 가격이 달라질 수 있습니다.',
  '정확히 일치하는 투어가 없으면 목적지, 날짜, 인원, 일정 길이, 호텔/픽업, 예산을 확인합니다.',
];

const AI_TOUR_TITLES_VI = {
  'dalat-premium':'Đà Lạt “Premium”',
  'dalat-vip':'Đà Lạt “VIP”',
  'fuyen':'Tour Phú Yên',
  'nhatrang-day':'City tour Nha Trang ban ngày',
  'nhatrang-night':'City tour Nha Trang buổi tối',
  'dalat-2days':'Tour Đà Lạt 2 ngày',
  'fast-track':'Fast Track + đưa đón',
  'danang-ba-na-hoian':'Bà Nà Hills, Cầu Vàng và Hội An',
  'danang-city-sontra':'Đà Nẵng: Sơn Trà, Ngũ Hành Sơn và các cây cầu',
  'phuquoc-4-islands':'Phú Quốc: 4 đảo và cáp treo',
  'phuquoc-vinwonders-safari':'VinWonders và Safari Phú Quốc',
  'hanoi-halong-2d':'Hà Nội và Vịnh Hạ Long',
  'hanoi-sapa-3d':'Hà Nội và Sa Pa',
  'hanoi-ninhbinh':'Ninh Bình: Tràng An và Hang Múa',
  'muine-dunes-jeep':'Mũi Né: đồi cát, làng chài và Suối Tiên',
};

const AI_TOUR_TITLES_EN = {
  'dalat-premium':'Da Lat “Premium”',
  'dalat-vip':'Da Lat “VIP”',
  'fuyen':'Phu Yen Province',
  'nhatrang-day':'Nha Trang Day City Tour',
  'nhatrang-night':'Nha Trang Evening City Tour',
  'dalat-2days':'Da Lat — 2 Days',
  'fast-track':'Fast Track + Transfer',
  'danang-ba-na-hoian':'Ba Na Hills, Golden Bridge & Hoi An',
  'danang-city-sontra':'Da Nang: Son Tra, Marble Mountains & Bridges',
  'phuquoc-4-islands':'Phu Quoc: 4 Islands & Cable Car',
  'phuquoc-vinwonders-safari':'VinWonders & Safari Phu Quoc',
  'hanoi-halong-2d':'Hanoi & Ha Long Bay',
  'hanoi-sapa-3d':'Hanoi & Sa Pa',
  'hanoi-ninhbinh':'Ninh Binh: Trang An & Mua Cave',
  'muine-dunes-jeep':'Mui Ne: Sand Dunes, Fishing Village & Fairy Stream',
};

const AI_TOUR_TITLES_KO = {
  'dalat-premium':'달랏 “프리미엄”',
  'dalat-vip':'달랏 “VIP”',
  'fuyen':'푸옌',
  'nhatrang-day':'나트랑 주간 시티투어',
  'nhatrang-night':'나트랑 야간 시티투어',
  'dalat-2days':'달랏 1박 2일',
  'fast-track':'공항 패스트트랙 + 픽업',
  'danang-ba-na-hoian':'바나힐, 골든브리지 & 호이안',
  'danang-city-sontra':'다낭: 선짜, 오행산 & 다리',
  'phuquoc-4-islands':'푸꾸옥 4섬 & 케이블카',
  'phuquoc-vinwonders-safari':'푸꾸옥 빈원더스 & 사파리',
  'hanoi-halong-2d':'하노이 & 하롱베이',
  'hanoi-sapa-3d':'하노이 & 사파',
  'hanoi-ninhbinh':'닌빈: 짱안 & 무아 동굴',
  'muine-dunes-jeep':'무이네: 모래언덕, 어촌 & 요정의 샘',
};

function requestedAiLocale(request, body) {
  const raw = String(body?.locale || body?.context?.locale || request?.headers?.get?.('x-max-tour-locale') || '').toLowerCase();
  if (raw === 'ko') return 'ko';
  if (raw === 'en') return 'en';
  if (raw === 'vi') return 'vi';
  return 'ru';
}

function localizedAiCatalog(catalog, locale) {
  if (locale === 'vi') return catalog.map(item => ({ ...item, title: AI_TOUR_TITLES_VI[item.id] || item.title }));
  if (locale === 'en') return catalog.map(item => ({ ...item, title: AI_TOUR_TITLES_EN[item.id] || item.title }));
  if (locale === 'ko') return catalog.map(item => ({ ...item, title: AI_TOUR_TITLES_KO[item.id] || item.title }));
  return catalog;
}

function rublesFromUsd(value, rate) {
  const usd = Number(value) || 0;
  return Math.max(0, Math.round(usd * rate / 10) * 10);
}

function rubleLabel(value, rate) {
  return `${rublesFromUsd(value, rate).toLocaleString('ru-RU')} ₽`;
}

function replaceDollarAmounts(value, rate) {
  return String(value || '').replace(/\$\s*([\d\s,.]+)/g, (_, raw) => rubleLabel(String(raw).replace(/\s/g, '').replace(',', '.'), rate));
}

function replaceRubleAmounts(value, rate) {
  return String(value || '').replace(/([\d\s,.]+)\s*₽/g, (_, raw) => {
    const rubles = Number(String(raw).replace(/\s/g, '').replace(',', '.')) || 0;
    return `$${Math.max(0, Math.round(rubles / rate))}`;
  });
}

async function currentUsdRubRate(env) {
  const configured = Number(env.USD_RUB_RATE);
  const fallback = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_USD_RUB_RATE;
  if (env.DISABLE_CBR_RATE) return fallback;
  if (Date.now() - aiRateCache.at < 15 * 60 * 1000) return aiRateCache.value;
  try {
    const response = await fetch('https://www.cbr.ru/scripts/XML_daily.asp', { cf: { cacheTtl: 900, cacheEverything: true } });
    const xml = await response.text();
    const usd = xml.match(/<Valute[\s\S]*?<CharCode>USD<\/CharCode>[\s\S]*?<Value>([\d,]+)<\/Value>[\s\S]*?<\/Valute>/i);
    const rate = usd ? Number(usd[1].replace(',', '.')) : 0;
    if (Number.isFinite(rate) && rate > 0) aiRateCache = { value: rate, at: Date.now() };
  } catch (error) {
    console.warn('CBR USD/RUB rate unavailable', error?.message || error);
  }
  if (!aiRateCache.at) aiRateCache = { value: fallback, at: Date.now() };
  return aiRateCache.value || fallback;
}

async function loadAiCatalog(request, env, rate = DEFAULT_USD_RUB_RATE) {
  try {
    if (!env.ASSETS) return [];
    const url = new URL('/catalog.v28.json', request.url);
    const response = await env.ASSETS.fetch(new Request(url));
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.slice(0, 30).map(tour => ({
      id: consultationText(tour.id, 120),
      title: consultationText(tour.title, 180),
      city: consultationText(tour.city || tour.region, 100),
      duration: consultationText(tour.duration, 80),
      tags: Array.isArray(tour.tags) ? tour.tags.slice(0, 8).map(tag => consultationText(tag, 40)) : [],
      childrenOk: Boolean(tour.childrenOk),
      group: tour.group ? {
        adult: consultationText(tour.group.adult || tour.group.from, 80),
        child: consultationText(tour.group.child, 80),
      } : null,
      individual: tour.individual ? {
        from: consultationText(tour.individual.from, 80),
        tiers: Array.isArray(tour.individual.tiers) ? tour.individual.tiers.slice(0, 8).map(item => consultationText(item, 120)) : [],
      } : null,
      departures: tour.group && Array.isArray(tour.group.departures) ? tour.group.departures.slice(0, 8).map(item => ({
        date: consultationText(item.date, 50),
        time: consultationText(item.time, 20),
        taken: Number(item.taken) || 0,
        capacity: Number(item.capacity) || 0,
        status: consultationText(item.status, 50),
      })) : [],
    }));
  } catch (error) {
    console.warn('AI catalogue unavailable', error?.message || error);
    return [];
  }
}

async function loadAiDepartures(env) {
  try {
    const [departures, bookings] = await Promise.all([
      safeAll(env.DB.prepare("SELECT tour_id,title,city,trip_date,trip_time,capacity,min_people,status,notes FROM admin_departures WHERE status IN ('open','almost_full','full') ORDER BY trip_date,trip_time")),
      safeAll(env.DB.prepare('SELECT tour_id,trip_date,trip_time,people,status FROM bookings')),
    ]);
    const countPeople = value => (String(value || '').match(/\d+/g) || []).map(Number).reduce((sum, number) => sum + number, 0);
    return (departures.results || []).map(row => ({
      tourId: consultationText(row.tour_id, 120),
      title: consultationText(row.title, 180),
      city: consultationText(row.city, 80),
      date: consultationText(row.trip_date, 40),
      time: consultationText(row.trip_time, 20),
      capacity: Number(row.capacity) || 0,
      minPeople: Number(row.min_people) || 0,
      taken: (bookings.results || [])
        .filter(item => item.tour_id === row.tour_id && item.trip_date === row.trip_date && item.trip_time === row.trip_time && !/отмен|возврат/i.test(String(item.status || '')))
        .reduce((sum, item) => sum + countPeople(item.people), 0),
      status: consultationText(row.status, 40),
      notes: consultationText(row.notes, 160),
    })).slice(0, 30);
  } catch (error) {
    console.warn('AI departure availability unavailable', error?.message || error);
    return [];
  }
}

function aiText(value, max = 1800) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function aiHistory(value) {
  return (Array.isArray(value) ? value : []).slice(-10).map(item => ({
    role: item?.role === 'user' ? 'user' : 'assistant',
    content: aiText(item?.text || item?.content, 700),
  })).filter(item => item.content);
}

function unsafeAiCopy(value) {
  return /\b(?:CRM|D1|API|Cloudflare|Workers? AI|база данных|техническ|менеджер|админ|передам|передать|интеграц)/iu.test(String(value || ''));
}

function aiFallbackReply(message, catalog = [], locale = 'ru') {
  const q = String(message || '').toLocaleLowerCase(locale === 'vi' ? 'vi-VN' : locale === 'en' ? 'en-US' : locale === 'ko' ? 'ko-KR' : 'ru-RU');
  if (locale === 'vi') {
    if (/hủy|huy|đổi\s*ngày|doi\s*ngay|hoàn\s*tiền|hoan\s*tien/.test(q)) {
      return 'Hủy trước hơn 48 giờ được miễn phí. Đến 17:00 ngày hôm trước giữ lại 30%; muộn hơn giữ lại 100%. Nếu bạn cho tôi ngày khởi hành, tôi sẽ giải thích chính xác hơn.';
    }
    if (/thanh\s*toán|thanh\s*toan|đặt\s*cọc|dat\s*coc|30\s*%/.test(q)) {
      return 'Bạn có thể đặt cọc 30% hoặc thanh toán 100%. Số tiền chính xác sẽ hiển thị ở bước đặt tour.';
    }
    if (/đưa\s*đón|dua\s*don|sân\s*bay|san\s*bay|khách\s*sạn|khach\s*san/.test(q)) {
      return 'Có thể thêm dịch vụ đưa đón. Hãy cho tôi biết khách sạn hoặc điểm đón để tôi tính vào phương án phù hợp.';
    }
    if (/trẻ|tre|bé|be|em\s*bé|em\s*be/.test(q)) {
      return 'Hãy cho tôi biết tuổi của từng trẻ em và trẻ nhỏ để tôi tính đúng số người và giá.';
    }
    if (/bao\s*gồm|bao\s*gom|lịch\s*trình|lich\s*trinh|chương\s*trình|chuong\s*trinh/.test(q)) {
      return 'Lịch trình và các dịch vụ bao gồm được ghi trong thẻ tour. Hãy cho tôi biết điểm đến hoặc tên tour, tôi sẽ giải thích cụ thể.';
    }
    return 'Tôi có thể giúp bạn chọn tour phù hợp. Hãy cho tôi biết điểm đến, ngày dự kiến và số người đi.';
  }
  if (locale === 'en') {
    if (/cancel|refund|reschedul|change\s*date/.test(q)) return 'Cancellation is free more than 48 hours before departure. Until 17:00 on the previous day, 30% is retained; later, 100%. Tell me your departure date and I can explain the rule more precisely.';
    if (/pay|deposit|30\s*%|full\s*payment/.test(q)) return 'You can pay a 30% deposit or the full amount. The exact total is shown during booking.';
    if (/transfer|airport|pickup|hotel/.test(q)) return 'A transfer can be added to the trip. Tell me your hotel or pickup point and I will take it into account.';
    if (/child|children|kid|baby|infant/.test(q)) return 'Please tell me the age of each child so I can account for the party correctly.';
    if (/included|itinerary|route|program/.test(q)) return 'The itinerary and included services are shown in each tour card. Tell me the destination or tour name and I can explain it.';
    const matches = catalog.filter(item => `${item.title} ${item.city} ${(item.tags || []).join(' ')}`.toLowerCase().split(/\s+/).some(token => token.length > 3 && q.includes(token)));
    if (matches.length) return `I can suggest “${matches[0].title}”. Tell me your preferred date and party size.`;
    return 'I can help you choose a tour. Tell me the destination, preferred date and how many people are travelling.';
  }
  if (locale === 'ko') {
    if (/취소|환불|일정\s*변경|날짜\s*변경/.test(q)) return '출발 48시간 전까지는 무료 취소가 가능합니다. 전날 17:00까지는 30%, 그 이후에는 100%가 공제됩니다. 출발 날짜를 알려주시면 더 정확히 안내해 드릴게요.';
    if (/결제|보증금|예약금|30\s*%|전액/.test(q)) return '30% 보증금 또는 전액 결제가 가능합니다. 정확한 금액은 예약 단계에서 표시됩니다.';
    if (/픽업|공항|호텔|이동/.test(q)) return '픽업·샌딩을 추가할 수 있습니다. 호텔이나 출발 지점을 알려주시면 일정에 반영해 드릴게요.';
    if (/어린이|아이|아기|유아/.test(q)) return '각 어린이와 유아의 나이를 알려주세요. 인원 구성에 맞춰 정확하게 안내해 드릴게요.';
    if (/포함|일정|코스|프로그램/.test(q)) return '각 투어 카드에서 일정과 포함 사항을 확인할 수 있습니다. 목적지나 투어 이름을 알려주시면 자세히 설명해 드릴게요.';
    const matches = catalog.filter(item => `${item.title} ${item.city} ${(item.tags || []).join(' ')}`.toLocaleLowerCase('ko-KR').split(/\s+/).some(token => token.length > 1 && q.includes(token)));
    if (matches.length) return `“${matches[0].title}”을 추천드릴 수 있어요. 원하는 날짜와 인원을 알려주세요.`;
    return '알맞은 투어를 찾아드릴게요. 목적지, 원하는 날짜와 여행 인원을 알려주세요.';
  }
  if (/отмен|перенос|возврат/.test(q)) return AI_RULES[0] + ' Если назовёте дату выезда, подскажу точнее.';
  if (/оплат|депозит|предоплат|30\s*%|сто процент/.test(q)) return AI_RULES[2];
  if (/трансфер|аэропорт|встреч/.test(q)) return 'Трансфер можно добавить к поездке — напишите отель или точку встречи, чтобы я учёл это при подборе.';
  if (/ребён|ребен|дет|малыш|коляск/.test(q)) return 'Напишите возраст каждого ребёнка и малыша — я учту состав группы при подборе.';
  if (/что входит|включен|программ|маршрут/.test(q)) return 'Программа и включённые услуги указаны в карточке экскурсии. Назовите город или поездку, и я подскажу по ней.';
  const matches = catalog.filter(item => `${item.title} ${item.city} ${(item.tags || []).join(' ')}`.toLocaleLowerCase('ru-RU')
    .split(/\s+/).some(token => token.length > 3 && q.includes(token)));
  if (matches.length) return `Могу подобрать вариант «${matches[0].title}». Напишите желаемую дату и состав группы.`;
  return 'Конечно. Напишите направление, желаемые даты и сколько взрослых, детей или малышей едет — подберу подходящие варианты.';
}

function aiResponseText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  const choice = result?.choices?.[0];
  return choice?.message?.content || choice?.text || '';
}

async function generateAiReply(request, env, body) {
  const locale = requestedAiLocale(request, body);
  const message = aiText(body?.message, 900);
  const usdRubRate = await currentUsdRubRate(env);
  const rawCatalog = await loadAiCatalog(request, env, usdRubRate);
  const catalog = localizedAiCatalog(rawCatalog, locale);
  const liveDepartures = env.DB ? await loadAiDepartures(env) : [];
  const safeContext = {
    selected: body?.context && typeof body.context === 'object' ? {
      destination: consultationText(body.context.destination, 100),
      format: consultationText(body.context.format, 50),
      people: consultationText(body.context.people, 160),
      date: consultationText(body.context.date, 100),
      preferences: Array.isArray(body.context.preferences) ? body.context.preferences.slice(0, 8).map(item => consultationText(item, 50)) : [],
    } : {},
    rules: locale === 'vi' ? AI_RULES_VI : locale === 'en' ? AI_RULES_EN : locale === 'ko' ? AI_RULES_KO : AI_RULES,
    catalogue: catalog,
    liveDepartures,
  };
  const fallback = aiFallbackReply(message, catalog, locale);
  if (!message || !env.AI) return { reply: fallback, source: 'catalog-fallback', usdRubRate };

  const system = locale === 'vi' ? [
    'Bạn là trợ lý AI thân thiện của ứng dụng du lịch MAX TOUR.',
    'Chỉ trả lời bằng tiếng Việt, ngắn gọn và tự nhiên như trò chuyện thông thường: 1–4 câu ngắn.',
    'Chỉ sử dụng dữ kiện trong VERIFIED_CONTEXT. Không được tự tạo giá, ngày, địa điểm, lịch trình hoặc tình trạng chỗ.',
    'Nếu thiếu thông tin, chỉ hỏi một câu rõ ràng để bổ sung dữ liệu cần thiết.',
    'Không nhắc đến hệ thống nội bộ, CRM, cơ sở dữ liệu, API, quá trình phát triển, mô hình AI hoặc việc chuyển yêu cầu cho nhân viên.',
    'Chỉ nêu số tiền bằng đô la Mỹ ($) như trong danh mục. Không dùng ký hiệu rúp (₽).',
    'Không hứa thanh toán hoặc xác nhận trước khi người dùng mở thẻ tour và hoàn tất bước đặt tour.',
    'Tên tour có thể được diễn đạt bằng tiếng Việt nhưng phải giữ nguyên ý nghĩa và dữ kiện của danh mục.',
    `VERIFIED_CONTEXT=${JSON.stringify(safeContext)}`,
  ].join('\n') : locale === 'en' ? [
    'You are the friendly AI travel assistant for the MAX TOUR application.',
    'Reply only in English, naturally and concisely in 1–4 short sentences.',
    'Use only facts from VERIFIED_CONTEXT. Never invent prices, dates, places, itinerary details or availability.',
    'If information is missing, ask one clear follow-up question.',
    'Do not mention internal systems, CRM, databases, APIs, development, the AI model or handing the request to staff.',
    'Use US dollars ($) exactly as shown in the catalogue. Do not use the ruble symbol (₽).',
    'Do not promise payment or confirmation before the user opens the tour card and completes booking.',
    'Tour names may be phrased naturally in English while preserving the exact catalogue meaning and facts.',
    `VERIFIED_CONTEXT=${JSON.stringify(safeContext)}`,
  ].join('\n') : locale === 'ko' ? [
    '당신은 MAX TOUR 앱의 친절한 AI 여행 도우미입니다.',
    '반드시 한국어로만 자연스럽고 간결하게 1–4개의 짧은 문장으로 답하세요.',
    'VERIFIED_CONTEXT에 있는 정보만 사용하세요. 가격, 날짜, 장소, 일정, 좌석 상황을 임의로 만들지 마세요.',
    '정보가 부족하면 필요한 내용을 한 가지 명확한 질문으로 확인하세요.',
    '내부 시스템, CRM, 데이터베이스, API, 개발 과정, AI 모델 또는 직원 전달에 대해 언급하지 마세요.',
    '가격은 카탈로그에 표시된 미국 달러($)만 사용하세요. 루블 기호(₽)를 사용하지 마세요.',
    '사용자가 투어 카드를 열고 예약을 완료하기 전에는 결제나 확정을 약속하지 마세요.',
    '투어 이름은 카탈로그의 의미와 사실을 유지하면서 자연스러운 한국어로 표현할 수 있습니다.',
    `VERIFIED_CONTEXT=${JSON.stringify(safeContext)}`,
  ].join('\n') : [
    'Ты доброжелательный AI-консультант туристического приложения MAX TOUR.',
    'Отвечай только на русском, коротко и естественно, как в обычном чате: 1–4 коротких предложения.',
    'Используй только факты из VERIFIED_CONTEXT. Не придумывай цены, даты, места, состав программы или наличие.',
    'Если не хватает данных, задай один понятный уточняющий вопрос.',
    'Не упоминай внутренние системы, CRM, базы, API, разработку, модель, технические детали или передачу обращения сотруднику.',
    'Называй суммы только в долларах ($), как указано в каталоге. Не используй знак рубля (₽).',
    'Не обещай оплату или подтверждение, пока пользователь не открыл карточку и не оформил поездку.',
    `VERIFIED_CONTEXT=${JSON.stringify(safeContext)}`,
  ].join('\n');
  const messages = [
    { role: 'system', content: system },
    ...aiHistory(body?.history),
    { role: 'user', content: message },
  ];
  try {
    const result = await env.AI.run(env.AI_MODEL || DEFAULT_AI_MODEL, { messages });
    const reply = replaceRubleAmounts(aiText(aiResponseText(result), 1800).replace(/^```[\s\S]*?```$/g, '').trim(), usdRubRate);
    const wrongLocale = locale !== 'ru' && /[А-Яа-яЁё]/u.test(reply);
    if (!reply || wrongLocale || unsafeAiCopy(reply)) return { reply: fallback, source: wrongLocale ? 'locale-fallback' : 'catalog-fallback', usdRubRate };
    return { reply, source: 'cloudflare-workers-ai', usdRubRate };
  } catch (error) {
    console.warn('Workers AI reply unavailable', error?.message || error);
    return { reply: fallback, source: 'catalog-fallback', usdRubRate };
  }
}

function normalizeConsultationPayload(body = {}) {
  const source = body.payload && typeof body.payload === 'object'
    ? body.payload
    : (body.slots && typeof body.slots === 'object' ? body.slots : body);
  const children = (Array.isArray(source.children) ? source.children : [])
    .map(age => Math.max(0, Math.min(17, Number(age) || 0)))
    .filter(age => Number.isFinite(age))
    .slice(0, 12);
  const preferences = [...new Set((Array.isArray(source.preferences) ? source.preferences : [])
    .map(item => consultationText(item, 80)).filter(Boolean))].slice(0, 12);
  const recommendations = (Array.isArray(source.recommendations) ? source.recommendations : [])
    .slice(0, 5).map(item => ({
      tourId: consultationText(item?.tourId || item?.id, 160),
      title: consultationText(item?.title, 250),
      format: consultationText(item?.format, 40),
      estimateUsd: Math.max(0, Math.round(Number(item?.estimateUsd || item?.price || 0) || 0)),
      individualUsd: Math.max(0, Math.round(Number(item?.individualUsd) || 0)),
      groupUsd: Math.max(0, Math.round(Number(item?.groupUsd) || 0)),
      availability: consultationText(item?.availability, 160),
    })).filter(item => item.tourId || item.title);
  const conversation = (Array.isArray(source.conversation) ? source.conversation : [])
    .slice(-120).map(item => ({
      role: item?.role === 'user' ? 'user' : 'bot',
      text: consultationText(item?.text, 1600),
    })).filter(item => item.text);
  const contact = source.contact && typeof source.contact === 'object' ? source.contact : {};
  return {
    tripType: consultationText(source.tripType || source.format, 60),
    destination: consultationText(source.destination || source.city, 120),
    date: consultationText(source.date || source.dateLabel, 80),
    dateFlexible: Boolean(source.dateFlexible || source.flexible),
    adults: Math.max(0, Math.min(30, Math.round(Number(source.adults) || 0))),
    children,
    infants: Math.max(0, Math.min(12, Math.round(Number(source.infants) || 0))),
    hotel: consultationText(source.hotel, 250),
    transfer: consultationText(source.transfer, 120),
    budget: consultationText(source.budget, 120),
    preferences,
    question: consultationText(source.question || source.notes, 1200),
    recommendations,
    conversation,
    contact: {
      name: consultationText(contact.name || source.contactName, 160),
      phone: consultationText(contact.phone || source.phone, 80),
      telegram: consultationText(contact.telegram || source.telegram || source.username, 120),
    },
    source: consultationText(source.source || body.source, 80) || 'Telegram Mini App',
  };
}

async function saveConsultation(env, sid, body) {
  const payload = normalizeConsultationPayload(body);
  const summary = consultationText(body.summary, 2400);
  if (!summary || (!payload.contact.name && !payload.contact.phone && !payload.contact.telegram)) {
    return { error: 'consultation_contact_required' };
  }
  const id = `AI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const status = body.handoff === false ? 'new' : 'sent_to_manager';
  try {
    await env.DB.prepare(`INSERT INTO ai_consultations(id,session_id,status,intent,summary,payload_json)
      VALUES(?,?,?,?,?,?)`).bind(id, sid, status, consultationText(body.intent, 80) || 'complex_tour', summary, JSON.stringify(payload)).run();
  } catch (error) {
    console.error('ai_consultations unavailable', error?.message || error);
    return { error: 'consultation_unavailable' };
  }
  try {
    await env.DB.prepare(`INSERT INTO admin_demo_events(id,event_type,entity_type,entity_id,payload_json,created_by)
      VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(), 'consultation_created', 'ai_consultation', id, JSON.stringify({
        sessionId: sid, destination: payload.destination, tripType: payload.tripType,
        people: payload.adults + payload.children.length + payload.infants, source: payload.source,
      }), 'ai-consultant').run();
  } catch (error) {
    console.warn('admin_demo_events unavailable', error?.message || error);
  }
  return { consultation: { id, status, createdAt: new Date().toISOString(), payload, summary } };
}

async function bodyJson(request) {
  try { return await request.json(); } catch { return null; }
}

const travelerKey = t => `${String(t.fullName || '').trim().toLowerCase()}|${String(t.birthDate || '').trim()}`;

function normalizeTravelers(travelers) {
  const clean = [];
  const seen = new Set();
  for (const item of Array.isArray(travelers) ? travelers : []) {
    const fullName = String(item?.fullName || '').trim();
    const birthDate = String(item?.birthDate || '').trim();
    if (!fullName || !birthDate) continue;
    const key = `${fullName.toLowerCase()}|${birthDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({
      role: String(item?.role || 'adult'),
      label: String(item?.label || 'Попутчик'),
      fullName,
      birthDate,
      primary: !!item?.primary,
    });
  }
  let primaryIndex = clean.findIndex(t => t.primary && t.role === 'adult');
  if (primaryIndex < 0) primaryIndex = clean.findIndex(t => t.role === 'adult');
  if (primaryIndex < 0 && clean.length) primaryIndex = 0;
  clean.forEach((t, index) => {
    t.primary = index === primaryIndex;
    if (t.primary) t.label = 'Основной путешественник';
    else if (t.role === 'adult') t.label = 'Попутчик · взрослый';
    else if (t.role === 'child') t.label = 'Попутчик · ребёнок';
    else t.label = 'Попутчик · малыш';
  });
  return clean;
}

async function replaceFavorites(env, sid, ids) {
  const normalized = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
  const statements = [env.DB.prepare('DELETE FROM favorites WHERE session_id=?').bind(sid)];
  for (const id of normalized) statements.push(env.DB.prepare('INSERT INTO favorites(session_id,tour_id) VALUES(?,?)').bind(sid, id));
  await env.DB.batch(statements);
  return normalized;
}

async function upsertTravelers(env, sid, travelers) {
  const normalized = normalizeTravelers(travelers);
  if (normalized.some(t => t.primary)) {
    await env.DB.prepare('UPDATE travelers SET primary_flag=0, updated_at=CURRENT_TIMESTAMP WHERE session_id=?').bind(sid).run();
  }
  for (const t of normalized) {
    const key = travelerKey(t);
    await env.DB.prepare(`INSERT INTO travelers(session_id,traveler_key,role,label,full_name,birth_date,primary_flag)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(session_id,traveler_key) DO UPDATE SET
      role=excluded.role,label=excluded.label,full_name=excluded.full_name,birth_date=excluded.birth_date,
      primary_flag=excluded.primary_flag,updated_at=CURRENT_TIMESTAMP`)
      .bind(sid, key, t.role, t.label, t.fullName, t.birthDate, t.primary ? 1 : 0).run();
  }
  return normalized;
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

async function saveBooking(env, sid, trip) {
  if (!trip?.id || !trip?.tourId || !trip?.title || !trip?.date) throw new Error('Invalid booking payload');
  await upsertTravelers(env, sid, trip.travelers || []);
  await env.DB.prepare(`INSERT INTO bookings(id,session_id,tour_id,title,trip_date,trip_time,status,paid,rest,total,booking_type,receipt,paid_at,people,image,rules,payload_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      tour_id=excluded.tour_id,title=excluded.title,trip_date=excluded.trip_date,trip_time=excluded.trip_time,
      status=excluded.status,paid=excluded.paid,rest=excluded.rest,total=excluded.total,booking_type=excluded.booking_type,
      receipt=excluded.receipt,paid_at=excluded.paid_at,people=excluded.people,image=excluded.image,rules=excluded.rules,
      payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(String(trip.id), sid, String(trip.tourId), String(trip.title), String(trip.date), String(trip.time || ''), String(trip.status || ''), String(trip.paid || '$0'), String(trip.rest || '$0'), String(trip.total || '$0'), String(trip.type || ''), String(trip.receipt || ''), String(trip.paidAt || ''), String(trip.people || ''), String(trip.image || ''), String(trip.rules || ''), JSON.stringify(trip)).run();
  try {
    await env.DB.prepare(`INSERT INTO admin_demo_events(id,event_type,entity_type,entity_id,payload_json,created_by)
      VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(), 'booking_created', 'booking', String(trip.id), JSON.stringify({
        source: trip.source || 'Telegram Mini App', tourId: trip.tourId, title: trip.title,
        date: trip.date, total: trip.total, paid: trip.paid, sessionId: sid,
      }), 'tourist').run();
  } catch (error) {
    console.warn('admin_demo_events unavailable', error?.message || error);
  }
}

async function bootstrap(env, sid) {
  const [favs, travelers, bookings, customTours, groupDepartures, allBookings, consultations] = await Promise.all([
    env.DB.prepare('SELECT tour_id FROM favorites WHERE session_id=? ORDER BY created_at').bind(sid).all(),
    env.DB.prepare('SELECT role,label,full_name,birth_date,primary_flag FROM travelers WHERE session_id=? ORDER BY primary_flag DESC, created_at').bind(sid).all(),
    env.DB.prepare('SELECT payload_json FROM bookings WHERE session_id=? ORDER BY created_at DESC').bind(sid).all(),
    env.DB.prepare('SELECT payload_json FROM admin_tours ORDER BY created_at DESC').all(),
    safeAll(env.DB.prepare('SELECT id,tour_id,title,city,trip_date,trip_time,capacity,min_people,status,notes FROM admin_departures WHERE status IN (\'open\',\'almost_full\',\'full\') ORDER BY trip_date,trip_time')),
    env.DB.prepare('SELECT tour_id,trip_date,trip_time,people,status FROM bookings ORDER BY created_at').all(),
    safeAll(env.DB.prepare('SELECT id,status,intent,summary,payload_json,created_at,updated_at FROM ai_consultations WHERE session_id=? ORDER BY created_at DESC LIMIT 20').bind(sid)),
  ]);
  const countStoredPeople = value => (String(value || '').match(/\d+/g) || []).map(Number).reduce((sum, n) => sum + n, 0);
  return {
    favorites: favs.results.map(r => r.tour_id),
    travelers: travelers.results.map(r => ({ role:r.role, label:r.label, fullName:r.full_name, birthDate:r.birth_date, primary:!!r.primary_flag })),
    bookings: bookings.results.map(r => JSON.parse(r.payload_json)),
    customTours: customTours.results.map(r => JSON.parse(r.payload_json)),
    groupDepartures: (groupDepartures.results || []).map(row => ({
      id: row.id, tourId: row.tour_id, title: row.title, city: row.city, date: row.trip_date,
      time: row.trip_time, capacity: Number(row.capacity) || 1, minPeople: Number(row.min_people) || 1,
      status: row.status, notes: row.notes || '', taken: (allBookings.results || [])
        .filter(booking => booking.tour_id === row.tour_id && booking.trip_date === row.trip_date && booking.trip_time === row.trip_time && !/отмен|возврат/i.test(String(booking.status || '')))
        .reduce((sum, booking) => sum + countStoredPeople(booking.people), 0),
    })),
    consultations: (consultations.results || []).map(row => ({
      id: row.id, status: row.status, intent: row.intent, summary: row.summary,
      payload: JSON.parse(row.payload_json || '{}'), createdAt: row.created_at, updatedAt: row.updated_at,
    })),
    hasData: favs.results.length > 0 || travelers.results.length > 0 || bookings.results.length > 0,
  };
}

async function api(request, env, url) {
  if (url.pathname === '/api/health') return json({ ok:true, app:'max-tour-v28-standalone', database:'D1', env:env.APP_ENV || 'demo' });
  const adminResponse = await handleAdminApi(request, env, url);
  if (adminResponse) return adminResponse;
  const session = await ensureSession(request, env);
  let response;

  if (url.pathname === '/api/bootstrap' && request.method === 'GET') {
    response = json({ ok:true, ...(await bootstrap(env, session.id)) });
  } else if (url.pathname === '/api/bootstrap' && request.method === 'POST') {
    const payload = await bodyJson(request) || {};
    const current = await bootstrap(env, session.id);
    if (!current.hasData) {
      await replaceFavorites(env, session.id, payload.favorites || []);
      await upsertTravelers(env, session.id, payload.travelers || []);
      for (const trip of Array.isArray(payload.bookings) ? payload.bookings : []) await saveBooking(env, session.id, trip);
    }
    response = json({ ok:true, ...(await bootstrap(env, session.id)) });
  } else if (url.pathname === '/api/favorites' && request.method === 'PUT') {
    const payload = await bodyJson(request) || {};
    response = json({ ok:true, favorites:await replaceFavorites(env, session.id, payload.favorites) });
  } else if (url.pathname === '/api/travelers' && request.method === 'PUT') {
    const payload = await bodyJson(request) || {};
    response = json({ ok:true, travelers:await replaceTravelers(env, session.id, payload.travelers || []) });
  } else if (url.pathname === '/api/bookings' && request.method === 'POST') {
    const payload = await bodyJson(request);
    await saveBooking(env, session.id, payload);
    response = json({ ok:true });
  } else if (url.pathname === '/api/consultations' && request.method === 'POST') {
    const result = await saveConsultation(env, session.id, await bodyJson(request) || {});
    response = result.error
      ? json({ ok:false, error:result.error }, { status: result.error === 'consultation_unavailable' ? 503 : 400 })
      : json({ ok:true, ...result }, { status: 201 });
  } else if (url.pathname === '/api/ai/chat' && request.method === 'POST') {
    const result = await generateAiReply(request, env, await bodyJson(request) || {});
    response = json({ ok:true, ...result });
  } else if (url.pathname.startsWith('/api/bookings/') && request.method === 'PATCH') {
    const id = decodeURIComponent(url.pathname.slice('/api/bookings/'.length));
    const payload = await bodyJson(request) || {};
    const row = await env.DB.prepare('SELECT payload_json FROM bookings WHERE id=? AND session_id=?').bind(id, session.id).first();
    if (!row) response = json({ ok:false, error:'booking_not_found' }, { status:404 });
    else {
      const trip = { ...JSON.parse(row.payload_json), ...payload };
      await env.DB.prepare(`UPDATE bookings SET trip_date=?,trip_time=?,status=?,paid=?,rest=?,total=?,payload_json=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND session_id=?`)
        .bind(String(trip.date || ''), String(trip.time || ''), String(trip.status || ''), String(trip.paid || '$0'), String(trip.rest || '$0'), String(trip.total || '$0'), JSON.stringify(trip), id, session.id).run();
      try {
        await env.DB.prepare(`INSERT INTO admin_demo_events(id,event_type,entity_type,entity_id,payload_json,created_by)
          VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(), 'booking_updated', 'booking', id, JSON.stringify({
            status: trip.status, date: trip.date, paid: trip.paid, rest: trip.rest, sessionId: session.id,
          }), 'tourist').run();
      } catch (error) {
        console.warn('admin_demo_events unavailable', error?.message || error);
      }
      response = json({ ok:true, booking:trip });
    }
  } else {
    response = json({ ok:false, error:'not_found' }, { status:404 });
  }
  return withSession(response, session);
}

export const _test = {
  normalizeConsultationPayload,
  consultationText,
  aiFallbackReply,
  aiResponseText,
  unsafeAiCopy,
  generateAiReply,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(request, env, url);
      if (url.pathname === '/admin') return Response.redirect(new URL('/admin/', url), 308);
      const asset = await env.ASSETS.fetch(request);
      return url.pathname.startsWith('/admin/') ? secureAdminAsset(asset) : asset;
    } catch (error) {
      console.error(error);
      return json({ ok:false, error:'internal_error' }, { status:500 });
    }
  },
};
