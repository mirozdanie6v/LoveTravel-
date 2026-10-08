(() => {
  'use strict';

  const storedLocale = String(globalThis.localStorage?.getItem?.('max-tour-locale-v1') || '').toLowerCase();
  const ACTIVE_LOCALE = ['vi','en','ko','zh'].includes(storedLocale) ? storedLocale : 'ru';
  const STORAGE_KEY = 'max-tour-ai-consultant-v5-' + ACTIVE_LOCALE;
  const BOOKING_INTENT_KEY = 'max-tour-ai-booking-intent-v1';
  const LOCATION_KEY = 'max-tour-ai-location-v6';
  const TIME_ZONE = 'Asia/Ho_Chi_Minh';
  const MAX_MESSAGES = 100;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const lower = value => String(value || '').toLocaleLowerCase(ACTIVE_LOCALE === 'vi' ? 'vi-VN' : ACTIVE_LOCALE === 'en' ? 'en-US' : ACTIVE_LOCALE === 'ko' ? 'ko-KR' : ACTIVE_LOCALE === 'zh' ? 'zh-CN' : 'ru-RU');
  const clean = (value, max = 900) => String(value ?? '').trim().slice(0, max);
  const localeText = (ru, vi, en, ko, zh = ru) => ACTIVE_LOCALE === 'vi' ? vi : ACTIVE_LOCALE === 'en' ? en : ACTIVE_LOCALE === 'ko' ? ko : ACTIVE_LOCALE === 'zh' ? zh : ru;
  const UI = Object.freeze({
    ru:{user:'Вы',assistant:'AI-консультант',results:'Подходящие экскурсии',forLabel:'Для',details:'Подробнее',book:'Забронировать',subtitle:'Расскажите, куда и как хотите поехать. Я подберу варианты и доведу до бронирования.',clear:'Очистить',placeholder:'Напишите сообщение...',pending:'Подбираю…',priceTbd:'цена уточняется',partyUnknown:'состав не указан',adultShort:'взр.',childShort:'дет.',infantShort:'мал.',reasonBudget:'выгоднее по цене',reasonSea:'море / острова',reasonNature:'красивые виды',reasonChildren:'подходит с детьми',reasonDefault:'подходит под ваш запрос',exactDeparture:'есть выезд',nearestDeparture:'ближайший выезд',individualDate:'индивидуальная дата подтверждается при оформлении',datesTbd:'даты уточняются',quickSea:'Море и острова',quickSeaValue:'Хочу море и острова',quickViews:'Красивые виды',quickViewsValue:'Хочу природу и красивые виды',quickCity:'Обзор города',quickCityValue:'Хочу обзорную экскурсию',quickTwoAdults:'2 взрослых',quickTwoAdultsValue:'Нас 2 взрослых',quickChild:'С ребёнком',quickChildValue:'2 взрослых и ребёнок 7 лет',today:'Сегодня',tomorrow:'Завтра',flexible:'Дата гибкая'},
    vi:{user:'Bạn',assistant:'Trợ lý AI',results:'Tour phù hợp',forLabel:'Dành cho',details:'Chi tiết',book:'Đặt tour',subtitle:'Hãy cho tôi biết bạn muốn đi đâu và theo cách nào. Tôi sẽ gợi ý lựa chọn phù hợp và hỗ trợ đến bước đặt tour.',clear:'Xóa',placeholder:'Nhập tin nhắn...',pending:'Đang tìm...',priceTbd:'giá đang cập nhật',partyUnknown:'chưa có thông tin số khách',adultShort:'người lớn',childShort:'trẻ em',infantShort:'em bé',reasonBudget:'giá tốt hơn',reasonSea:'biển / đảo',reasonNature:'cảnh đẹp',reasonChildren:'phù hợp với trẻ em',reasonDefault:'phù hợp với yêu cầu của bạn',exactDeparture:'có chuyến',nearestDeparture:'chuyến gần nhất',individualDate:'ngày tour riêng được xác nhận khi đặt',datesTbd:'ngày khởi hành đang cập nhật',quickSea:'Biển và đảo',quickSeaValue:'Tôi muốn đi biển và đảo',quickViews:'Cảnh đẹp',quickViewsValue:'Tôi muốn thiên nhiên và cảnh đẹp',quickCity:'Tham quan thành phố',quickCityValue:'Tôi muốn tour tham quan thành phố',quickTwoAdults:'2 người lớn',quickTwoAdultsValue:'Chúng tôi có 2 người lớn',quickChild:'Có trẻ em',quickChildValue:'2 người lớn và 1 trẻ 7 tuổi',today:'Hôm nay',tomorrow:'Ngày mai',flexible:'Ngày linh hoạt'},
    en:{user:'You',assistant:'AI Assistant',results:'Suitable tours',forLabel:'For',details:'Details',book:'Book',subtitle:'Tell me where and how you would like to travel. I will suggest suitable options and guide you through to booking.',clear:'Clear',placeholder:'Type a message...',pending:'Finding options…',priceTbd:'price being confirmed',partyUnknown:'party not specified',adultShort:'adult',childShort:'child',infantShort:'infant',reasonBudget:'better value',reasonSea:'sea / islands',reasonNature:'scenic views',reasonChildren:'good with children',reasonDefault:'matches your request',exactDeparture:'departure available',nearestDeparture:'nearest departure',individualDate:'private date confirmed during booking',datesTbd:'dates being confirmed',quickSea:'Sea and islands',quickSeaValue:'I want sea and islands',quickViews:'Scenic views',quickViewsValue:'I want nature and scenic views',quickCity:'City sightseeing',quickCityValue:'I want a city sightseeing tour',quickTwoAdults:'2 adults',quickTwoAdultsValue:'We are 2 adults',quickChild:'With a child',quickChildValue:'2 adults and a 7-year-old child',today:'Today',tomorrow:'Tomorrow',flexible:'Flexible date'},
    ko:{user:'회원',assistant:'AI 도우미',results:'추천 투어',forLabel:'대상',details:'자세히 보기',book:'예약하기',subtitle:'원하는 여행과 조건을 알려주세요. 맞는 투어를 추천하고 예약 단계까지 안내해 드립니다.',clear:'지우기',placeholder:'메시지를 입력하세요...',pending:'찾는 중…',priceTbd:'가격 확인 중',partyUnknown:'인원 미입력',adultShort:'성인',childShort:'아동',infantShort:'유아',reasonBudget:'가격이 더 유리함',reasonSea:'바다 / 섬',reasonNature:'멋진 풍경',reasonChildren:'어린이 동반 적합',reasonDefault:'요청에 적합',exactDeparture:'출발 가능',nearestDeparture:'가장 가까운 출발',individualDate:'프라이빗 날짜는 예약 시 확정',datesTbd:'출발 날짜 확인 중',quickSea:'바다와 섬',quickSeaValue:'바다와 섬 투어를 원해요',quickViews:'멋진 풍경',quickViewsValue:'자연과 멋진 풍경을 원해요',quickCity:'시티투어',quickCityValue:'시티투어를 원해요',quickTwoAdults:'성인 2명',quickTwoAdultsValue:'성인 2명입니다',quickChild:'어린이 동반',quickChildValue:'성인 2명과 7세 어린이 1명입니다',today:'오늘',tomorrow:'내일',flexible:'날짜 유동적'},
    zh:{user:'您',assistant:'AI 顾问',results:'适合您的行程',forLabel:'适用于',details:'查看详情',book:'预订',subtitle:'告诉我您想去哪里、希望怎样游玩。我会推荐合适的行程并带您完成预订流程。',clear:'清除',placeholder:'输入消息…',pending:'正在查询…',priceTbd:'价格待确认',partyUnknown:'未填写出行人数',adultShort:'成人',childShort:'儿童',infantShort:'婴儿',reasonBudget:'价格更划算',reasonSea:'海岛',reasonNature:'风景优美',reasonChildren:'适合儿童',reasonDefault:'符合您的需求',exactDeparture:'有可订班次',nearestDeparture:'最近班次',individualDate:'私人行程日期在预订时确认',datesTbd:'日期待确认',quickSea:'海岛',quickSeaValue:'我想去海岛',quickViews:'自然风光',quickViewsValue:'我想看自然风光',quickCity:'城市观光',quickCityValue:'我想参加城市观光',quickTwoAdults:'2 位成人',quickTwoAdultsValue:'我们有 2 位成人',quickChild:'带儿童',quickChildValue:'2 位成人和 1 名 7 岁儿童',today:'今天',tomorrow:'明天',flexible:'日期灵活'}
  });
  const ui = () => UI[ACTIVE_LOCALE] || UI.ru;
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
    return new Intl.DateTimeFormat(ACTIVE_LOCALE === 'vi' ? 'vi-VN' : ACTIVE_LOCALE === 'en' ? 'en-US' : ACTIVE_LOCALE === 'ko' ? 'ko-KR' : ACTIVE_LOCALE === 'zh' ? 'zh-CN' : 'ru-RU', {
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
    if (/(?:^|\s)(?:сегодня|hôm\s*nay|hom\s*nay|今天|今日|오늘)(?:\s|$|[,.!?，。！？])/.test(q)) return { value:today, flexible:false };
    if (/завтра|ngày\s*mai|ngay\s*mai|明天|내일/.test(q)) return { value:addIsoDays(today, 1), flexible:false };
    if (/выходн|cuối\s*tuần|cuoi\s*tuan|周末|주말/.test(q)) return { value:ui().flexible, flexible:true };
    if (/в течение (?:ближайшей )?недел|через неделю|на неделе|trong\s*tuần\s*tới|tuan\s*toi|tuần\s*tới|다음\s*주|이번\s*주|일주일\s*안|未来一周|这周|下周/.test(q)) return { value:ui().flexible, flexible:true };
    if (/дата гибк|неважно когда|дат[ау].*нет|по датам гибк|ngày\s*linh\s*hoạt|ngay\s*linh\s*hoat|không\s*quan\s*trọng\s*ngày|linh\s*hoạt\s*ngày|日期灵活|时间灵活|哪天都可以|날짜.*유동|언제든|아무\s*날/.test(q)) return { value:ui().flexible, flexible:true };

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
    if (/нячанг|на-?чанг|nha\s*trang|芽庄|나트랑/.test(q)) return 'Нячанг';
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
    const zhAdults = Number((q.match(/(\d+)\s*(?:位|个)?\s*成人/) || [])[1] || 0);
    const zhChildren = Number((q.match(/(\d+)\s*(?:位|个)?\s*(?:儿童|孩子|小孩)/) || [])[1] || 0);
    const zhInfants = Number((q.match(/(\d+)\s*(?:位|个)?\s*(?:婴儿|宝宝)/) || [])[1] || 0);
    const koAdults = Number((q.match(/(\d+)\s*(?:명|분)?\s*(?:성인|어른)/) || [])[1] || 0);
    const koChildren = Number((q.match(/(\d+)\s*(?:명)?\s*(?:아동|어린이|아이)/) || [])[1] || 0);
    const koInfants = Number((q.match(/(\d+)\s*(?:명)?\s*(?:유아|영아|아기)/) || [])[1] || 0);
    const explicitAdults = countBefore(q, 'взросл|совершеннолет|родител') || viAdults || zhAdults || koAdults;
    const explicitChildren = countBefore(q, 'дет(?:ей|и)?|ребен(?:ок|ка)?') || viChildren || zhChildren || koChildren;
    const explicitInfants = countBefore(q, 'малыш|младен|груднич') || viInfants || zhInfants || koInfants;
    const totalMatch = q.match(new RegExp(`(?:нас|едем|поедем|всего|семья(?: из)?|группа(?: из)?|на|для)\\s*(\\d+|${Object.keys(PARTY_WORDS).join('|')})`, 'i'));
    const viTotalMatch = q.match(/(?:chúng\s*tôi|chung\s*toi|gia\s*đình|gia\s*dinh|tổng\s*cộng|tong\s*cong|nhóm|nhom)\s*(?:có\s*)?(\d+)\s*(?:người|nguoi)?/);
    const zhTotalMatch = q.match(/(?:我们|一共|总共|共)\s*(\d+)\s*(?:人|位)?/);
    const koTotalMatch = q.match(/(?:저희|우리|총|모두)\s*(?:는|가)?\s*(\d+)\s*(?:명|분)?/);
    const total = totalMatch ? numberWord(totalMatch[1]) : Number(viTotalMatch?.[1] || zhTotalMatch?.[1] || koTotalMatch?.[1] || 0);
    const ages = [...q.matchAll(/(\d{1,2})\s*(?:лет|года|год|tuổi|tuoi|岁|세)/g)].map(item => Number(item[1])).filter(age => age >= 3 && age <= 17).slice(0, 12);
    const hasChild = /дет|ребен|trẻ\s*em|tre\s*em|\bbé\b|\bbe\b|儿童|孩子|小孩|아동|어린이|아이/.test(q);
    const hasNoChildren = /без\s+дет|дет(?:ей|и)?\s+нет|không\s*có\s*trẻ|khong\s*co\s*tre|没有孩子|无儿童|아이\s*없|어린이\s*없|아동\s*없/.test(q);
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
      '질문해 주세요. 알맞은 투어를 추천하고 바로 예약까지 도와드릴게요.',
      '请提问，我会帮助您选择合适的行程并直接进入预订。'
    ) }], recommendations:[], selectedTourId:'' };
  }
  let state = freshState();
  let pending = false;
  let retryMessage = null;
  const semanticText=key=>globalThis.LoveTravelI18n?.t?.(key)||key;
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
    const s = state.slots, parts = [], t=ui();
    if (s.adults) parts.push(`${s.adults} ${t.adultShort}`);
    if (s.children.length) parts.push(`${s.children.length} ${t.childShort}`);
    if (s.infants) parts.push(`${s.infants} ${t.infantShort}`);
    return parts.join(' + ') || t.partyUnknown;
  }

  function parseMessage(text) {
    const q = lower(text), s = state.slots;
    const destination = destinationAlias(q); if (destination) s.destination = destination;
    if (/индив|своей компанией|без группы|частн|tour\s*riêng|riêng\s*tư|riêng|cá\s*nhân|ca\s*nhan|private|프라이빗|개인\s*투어|우리끼리|私人|包车/.test(q)) s.tripType = 'individual';
    if (/групп|присоедин|сборн|tour\s*ghép|tour\s*ghep|ghép|ghep|đoàn|doan|그룹|조인\s*투어|단체|拼团|跟团/.test(q)) s.tripType = 'group';
    if (/сравн|не знаю.*формат|любой формат|so\s*sánh|so\s*sanh|chưa\s*biết.*(?:hình\s*thức|loại)|bất\s*kỳ|bat\s*ky|비교|아무\s*거나|둘\s*다|比较|都可以/.test(q)) s.tripType = 'compare';
    const party = parseParty(text, s); Object.assign(s, party);
    const parsedDate = parseDate(text);
    if (parsedDate) {
      if (parsedDate.invalid) { s.dateError = parsedDate.past || 'past'; s.date = ''; s.dateFlexible = false; }
      else { s.dateError = ''; s.date = parsedDate.value; s.dateFlexible = Boolean(parsedDate.flexible); }
    }
    const prefs = new Set(s.preferences || []);
    if (/море|пляж|остров|сноркл|купани|biển|bien|bãi\s*biển|bai\s*bien|đảo|dao|lặn|lan|tắm\s*biển|바다|해변|섬|스노클|수영|海|海滩|岛|浮潜|游泳/.test(q)) prefs.add('море');
    if (/красив|природ|горы|водопад|фото|вид|thiên\s*nhiên|thien\s*nhien|núi|nui|thác|thac|chụp\s*ảnh|chup\s*anh|cảnh\s*đẹp|canh\s*dep|자연|산|폭포|사진|풍경|自然|山|瀑布|拍照|风景/.test(q)) prefs.add('природа');
    if (/город|храм|культур|истори|музе|thành\s*phố|thanh\s*pho|chùa|chua|văn\s*hóa|van\s*hoa|lịch\s*sử|lich\s*su|bảo\s*tàng|bao\s*tang|도시|사원|문화|역사|박물관|城市|寺庙|文化|历史|博物馆/.test(q)) prefs.add('город и культура');
    if (/легк|лёгк|спокойн|без долг|nhẹ|nhe|thoải\s*mái|thoai\s*mai|không\s*đi\s*nhiều|khong\s*di\s*nhieu|편안|가볍|여유|많이\s*걷지|轻松|悠闲|少走路/.test(q)) prefs.add('лёгкая программа');
    if (/подешев|дешев|бюджет|эконом|не\s+переплач|минимальн.{0,16}цен|цен[ау].{0,16}важн|rẻ|re|tiết\s*kiệm|tiet\s*kiem|ngân\s*sách|ngan\s*sach|giá\s*tốt|gia\s*tot|저렴|가성비|예산|싼|便宜|预算|性价比/.test(q)) {
      prefs.delete('комфорт / премиум');
      prefs.delete('насыщенная программа');
      prefs.add('выгодная цена');
    }
    if (/интересн.{0,16}программ|насыщенн|максимум.{0,20}(?:посмотр|увид)|ярк.{0,16}программ|nhiều\s*điểm|nhieu\s*diem|đa\s*dạng|da\s*dang|nhiều\s*trải\s*nghiệm|nhieu\s*trai\s*nghiem/.test(q)) {
      prefs.delete('выгодная цена');
      prefs.add('насыщенная программа');
    }
    if (/vip|вип|премиум|комфорт|cao\s*cấp|cao\s*cap|sang\s*trọng|sang\s*trong|프리미엄|고급|편안|豪华|高端|舒适/.test(q)) {
      prefs.delete('выгодная цена');
      prefs.add('комфорт / премиум');
    }
    s.preferences = [...prefs];
    s.question = clean(text, 1200);
  }

  function isDiscoveryIntent(text) {
    return /подбер|подобра|покаж|посовет|вариант|экскурс|тур\b|куда.*съезд|куда.*поех|хочу.*(?:остров|море|природ|экскурс)|gợi\s*ý|goi\s*y|đề\s*xuất|de\s*xuat|chọn|chon|tour\b|tham\s*quan|đi\s*đâu|di\s*dau|muốn.*(?:biển|đảo|thiên\s*nhiên)|추천|투어|여행|뭐.*(?:바다|섬)|가고.*(?:바다|섬)|推荐|行程|旅游|有什么.*(?:海|岛)|想去.*(?:海|岛|浮潜)/i.test(String(text || ''));
  }
  function isBookingIntent(text) { return /хочу.*заброни|заброниру|оформ|бер[еу]м|выбираю|этот вариант|поехали|muốn\s*đặt|muon\s*dat|đặt\s*tour|dat\s*tour|đặt\s*chỗ|dat\s*cho|chọn\s*tour\s*này|chon\s*tour\s*nay|lấy\s*tour\s*này|lay\s*tour\s*nay|예약|이\s*투어|이걸로|선택할게|예약하고|我要预订|我想预订|预订这个|订这个|就这个|我要这个/i.test(String(text || '')); }

  function money(value) {
    const match = String(value || '').match(/\$\s*([\d,.]+)/);
    return match ? Math.max(0, Number(match[1].replace(/,/g,'')) || 0) : 0;
  }
  function moneyLabel(value) { const amount = Math.round(Number(value) || 0); return amount ? `${amount.toLocaleString('en-US')}` : ui().priceTbd; }

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
      .filter(row => !/лист ожидания|полон|отмен|waitlist|sold\s*out|cancel|대기|매진|취소|候补|已满|取消/i.test(String(row.item.status || '')))
      .sort((a,b) => a.iso.localeCompare(b.iso));
  }

  function haystack(tour) { return lower(`${tour.title} ${tour.city} ${tour.region} ${tour.category} ${(tour.tags || []).join(' ')} ${(tour.audience || []).join(' ')} ${tour.searchText || ''}`); }
  function scoreTour(tour) {
    const s = state.slots, hay = haystack(tour);
    let score = Number(tour.popular) ? 2 : 0;
    if (s.destination && hay.includes(lower(s.destination).split('/')[0])) score += 8;
    for (const pref of s.preferences) {
      if (pref === 'море' && /море|остров|пляж|сноркл|океан|sea|island|beach|snork|biển|đảo|bãi|바다|섬|해변|스노클|海|岛|海滩|浮潜/.test(hay)) score += 7;
      if (pref === 'природа' && /природ|гора|водопад|дюны|вид|фото|далат|nature|mountain|waterfall|view|photo|thiên\s*nhiên|núi|thác|자연|산|폭포|풍경|사진|自然|山|瀑布|风景|拍照/.test(hay)) score += 5;
      if (pref.includes('город') && /город|храм|культур|истори|обзор|city|temple|culture|history|thành\s*phố|chùa|도시|사원|문화|역사|城市|寺庙|文化|历史/.test(hay)) score += 4;
      if (pref.includes('лёг') && /обзор|легк|лёгк|комфорт|трансфер|easy|comfortable|transfer|thoải\s*mái|편안|여유|轻松|舒适/.test(hay)) score += 3;
      if (pref.includes('премиум') && /премиум|vip|вип|комфорт|premium|luxury|cao\s*cấp|프리미엄|고급|豪华|高端/.test(hay)) score += 4;
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
      ? `${ui().exactDeparture} ${dateLabel(exactDeparture.iso, { short:true, year:false })}${exactDeparture.item.time ? ` · ${exactDeparture.item.time}` : ''}`
      : nearest
        ? `${ui().nearestDeparture} ${dateLabel(nearest.iso, { short:true, year:false })}${nearest.item.time ? ` · ${nearest.item.time}` : ''}`
        : (format === 'individual' || format === 'compare') ? ui().individualDate : ui().datesTbd;
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
    const g=moneyLabel(item.groupPrice), p=moneyLabel(item.individualPrice);
    if (ACTIVE_LOCALE === 'zh') {
      if (item.format === 'compare') return [item.groupPrice && `拼团 ${g} 起`, item.individualPrice && `私人 ${p} 起`].filter(Boolean).join(' · ');
      return item.format === 'group' ? `${g} / 成人起` : `${p} / 行程起`;
    }
    if (ACTIVE_LOCALE === 'ko') {
      if (item.format === 'compare') return [item.groupPrice && `그룹 ${g}부터`, item.individualPrice && `프라이빗 ${p}부터`].filter(Boolean).join(' · ');
      return item.format === 'group' ? `${g}부터 / 성인` : `${p}부터 / 투어`;
    }
    if (ACTIVE_LOCALE === 'vi') {
      if (item.format === 'compare') return [item.groupPrice && `tour ghép từ ${g}`, item.individualPrice && `tour riêng từ ${p}`].filter(Boolean).join(' · ');
      return item.format === 'group' ? `từ ${g} / người lớn` : `từ ${p} / chuyến`;
    }
    if (ACTIVE_LOCALE === 'en') {
      if (item.format === 'compare') return [item.groupPrice && `group from ${g}`, item.individualPrice && `private from ${p}`].filter(Boolean).join(' · ');
      return item.format === 'group' ? `from ${g} / adult` : `from ${p} / trip`;
    }
    if (item.format === 'compare') return [item.groupPrice && `группа от ${g}`, item.individualPrice && `индивидуально от ${p}`].filter(Boolean).join(' · ');
    return item.format === 'group' ? `от ${g} / взрослый` : `от ${p} за поездку`;
  }
  function imageFor(tour) { return tour.image || tour.gallery?.[0] || tour.images?.[0] || tour.fallbackImage || ''; }
  function reasonFor(item) {
    const bits = [], t=ui();
    if (state.slots.preferences.includes('выгодная цена')) bits.push(t.reasonBudget);
    if (state.slots.preferences.includes('море')) bits.push(t.reasonSea);
    if (state.slots.preferences.includes('природа')) bits.push(t.reasonNature);
    if (state.slots.children.length && item.tour.childrenOk !== false) bits.push(t.reasonChildren);
    if (item.availability) bits.push(item.availability);
    return bits.slice(0,3).join(' · ') || t.reasonDefault;
  }

  function nextQuestion() {
    const s = state.slots;
    if (!state.recommendations.length) {
      if (!s.destination && !s.preferences.length) return localeText(
        'Что вам интереснее: море и острова, природа, город или что-то премиальное?',
        'Bạn thích điều gì hơn: biển và đảo, thiên nhiên, thành phố hay trải nghiệm cao cấp?',
        'What interests you most: sea and islands, nature, city sightseeing, or something premium?',
        '바다와 섬, 자연, 시티투어, 프리미엄 중 어떤 여행이 가장 관심 있으신가요?',
        '您更喜欢海岛、自然风光、城市观光还是高端体验？'
      );
      if (!peopleCount()) return localeText(
        'Сколько человек едет?',
        'Có bao nhiêu người đi?',
        'How many people are travelling?',
        '몇 분이 여행하시나요?',
        '一共有几位出行？'
      );
      if (!s.date) return localeText(
        'На какую дату планируете поездку?',
        'Bạn dự định đi vào ngày nào?',
        'What date are you planning to travel?',
        '언제 여행하실 예정인가요?',
        '您计划哪天出行？'
      );
      return localeText(
        'Покажу подходящие варианты.',
        'Tôi sẽ hiển thị các phương án phù hợp.',
        'I will show you suitable options.',
        '알맞은 옵션을 보여드릴게요.',
        '我会为您展示合适的选择。'
      );
    }
    if (!peopleCount()) return localeText(
      'Я уже подобрал варианты. Сколько человек едет?',
      'Tôi đã chọn được một số phương án. Có bao nhiêu người đi?',
      'I have already found some options. How many people are travelling?',
      '적합한 옵션을 찾았습니다. 몇 분이 여행하시나요?',
      '我已经找到合适的选择。一共有几位出行？'
    );
    if (!s.date) return localeText(
      'Варианты уже подобраны. На какую дату хотите поехать?',
      'Các phương án đã sẵn sàng. Bạn muốn đi vào ngày nào?',
      'The options are ready. What date would you like to travel?',
      '옵션을 찾았습니다. 언제 여행하고 싶으신가요?',
      '合适的行程已经找到了。您想哪天出行？'
    );
    return localeText(
      'Выберите вариант ниже — я сразу помогу перейти к бронированию.',
      'Chọn một phương án bên dưới — tôi sẽ giúp bạn chuyển ngay sang bước đặt tour.',
      'Choose an option below and I will take you straight to booking.',
      '아래 옵션을 선택하면 바로 예약 단계로 도와드릴게요.',
      '请选择下面的行程，我会直接带您进入预订。'
    );
  }

  async function requestAiReply(text) {
    const response = await fetch('/api/ai/chat', {
      method:'POST', credentials:'same-origin', headers:{ 'content-type':'application/json', 'x-max-tour-locale':ACTIVE_LOCALE },
      body:JSON.stringify({
        locale:ACTIVE_LOCALE,
        message:clean(text,900),
        history:state.messages.filter(item => item.text !== ui().pending).slice(-10).map(item => ({ role:item.role, text:item.text })),
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
      degraded:Boolean(result.degraded),
    };
  }

  function bookingIntent(item) {
    const s = state.slots;
    return {
      tourId:item.tour.id, title:item.tour.title,
      format:s.tripType === 'group' ? 'group' : s.tripType === 'individual' ? 'individual' : item.format,
      date:/^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : (item.exactDeparture?.iso || ''),
      adults:Math.max(1, Number(s.adults) || 0), children:s.children.slice(), infants:Number(s.infants || 0),
      createdAt:new Date().toISOString(), source:localeText('AI-консультант','Trợ lý AI','AI Assistant','AI 도우미','AI 顾问'),
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
    setCounter(root, localeText('Взрослые','Người lớn','Adults','성인','成人'), intent.adults);
    setCounter(root, localeText('Дети','Trẻ em','Children','아동','儿童'), intent.children.length);
    setCounter(root, localeText('Малыши','Em bé','Infants','유아','婴儿'), intent.infants);
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
    const loveTravelAction = scope.querySelector?.('[data-lt-jump-booking],[data-lt-config-continue]');
    const bookingPattern = /присоединиться|забронировать|оформить|book|reserve|đặt\s*(?:tour|chỗ)?|예약|预订|立即预订/i;
    const exact = buttons.find(btn => /^\s*(?:присоединиться|забронировать|оформить|book(?:\s+now)?|reserve|đặt\s*(?:tour|chỗ)?|예약(?:하기)?|预订|立即预订)\s*$/i.test(btn.textContent || ''));
    const broad = buttons.find(btn => bookingPattern.test(btn.textContent || ''));
    const action = loveTravelAction || exact || broad;
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

  async function startBooking(item, root) {
    if (!item?.tour?.id) return;
    state.selectedTourId = item.tour.id;
    persist();
    add('bot', localeText(
      `Открываю бронирование «${item.tour.title}». Уже выбранные параметры беру из текущей транзакции.`,
      `Đang mở đặt tour “${item.tour.title}”. Các thông tin đã chọn được lấy từ giao dịch hiện tại.`,
      `Opening booking for “${item.tour.title}”. Your selected details are coming from the current booking transaction.`,
      `“${item.tour.title}” 예약을 열고 있습니다. 선택한 정보는 현재 예약 트랜잭션에서 불러옵니다.`,
      `正在打开“${item.tour.title}”的预订。已选择的信息将从当前预订事务中读取。`
    ));
    render(root, { scrollToEnd:true });
    try {
      if (typeof openTour === 'function') openTour(item.tour.id);
      const configurator=globalThis.LoveTravelBookingConfigurator;
      if(!configurator) return;
      const snapshot=await configurator.refreshTransaction?.();
      if(snapshot?.selection&&String(snapshot.selection.productId||'')===String(item.tour.id)){
        await configurator.applySelection?.(snapshot.selection);
      }else{
        await configurator.resolve?.();
      }
      configurator.open?.();
    } catch (error) {
      console.warn('[LoveTravel AI] transaction booking handoff failed:',error?.message||error);
    }
  }

  function renderRecommendations() {
    if (!state.recommendations.length) return '';
    const t=ui();
    return `<div class="ai-chat-results ai-sales-results"><div class="ai-msg-author">${esc(t.assistant)}</div><div class="ai-chat-results-label">${esc(t.results)}</div><div class="ai-recommendations">${state.recommendations.map(item => {
      const image = imageFor(item.tour);
      return `<article class="ai-recommendation ai-sales-card" data-tour-id="${esc(item.tour.id)}">${image ? `<img class="ai-tour-image" src="${esc(image)}" alt="${esc(item.tour.title)}" loading="lazy">` : ''}<div class="ai-tour-card-copy"><span class="ai-tour-meta">${esc([item.tour.city, item.tour.duration].filter(Boolean).join(' · '))}</span><h4>${esc(item.tour.title)}</h4><p>${esc(reasonFor(item))}</p><span class="ai-price">${esc(recommendationPrice(item))}</span>${peopleCount() ? `<span class="ai-party">${esc(t.forLabel)}: ${esc(peopleLabel())}</span>` : ''}</div><div class="ai-card-actions"><button type="button" class="secondary" data-ai-action="open-tour" data-id="${esc(item.tour.id)}">${esc(t.details)}</button><button type="button" class="primary" data-ai-action="book-tour" data-id="${esc(item.tour.id)}">${esc(t.book)}</button></div></article>`;
    }).join('')}</div></div>`;
  }

  function quickReplies() {
    const s = state.slots, t=ui();
    if (!s.preferences.length && !s.destination) return [[t.quickSea,t.quickSeaValue],[t.quickViews,t.quickViewsValue],[t.quickCity,t.quickCityValue]];
    if (!peopleCount()) return [[t.quickTwoAdults,t.quickTwoAdultsValue],[t.quickChild,t.quickChildValue]];
    if (!s.date) return [[t.today,t.today],[t.tomorrow,t.tomorrow],[t.flexible,t.flexible]];
    return [];
  }

  function render(root, options = {}) {
    const t=ui();
    const messages = state.messages.map(item => `<div class="ai-msg ${item.role === 'user' ? 'user' : 'bot'}"><span class="ai-msg-author">${esc(item.role === 'user' ? t.user : t.assistant)}</span><span class="ai-msg-text">${esc(item.text)}</span></div>`).join('');
    const quick = quickReplies();
    root.innerHTML = `<div class="section-title ai-section-head"><div><h2>${esc(t.assistant)}</h2><p class="ai-chat-subtitle">${esc(t.subtitle)}</p></div><button class="secondary ai-clear" type="button" data-ai-action="clear">${esc(t.clear)}</button></div><section class="ai-consultant-shell"><div class="ai-consultant-main ai-chat-panel"><div class="ai-messages" role="log" aria-live="polite">${messages}</div><form class="ai-consultant-input" data-ai-form="chat"><textarea name="message" rows="1" placeholder="${esc(t.placeholder)}" ${pending ? 'disabled' : ''}></textarea><button class="primary" type="submit" ${pending ? 'disabled' : ''}>→</button></form></div><div class="ai-chat-below">${retryMessage ? `<button class="secondary" type="button" data-ai-action="retry">${esc(semanticText('ai.retry'))}</button>` : ''}${quick.length ? `<div class="ai-quick-replies">${quick.map(([label,value]) => `<button type="button" data-ai-action="quick" data-value="${esc(value)}">${esc(label)}</button>`).join('')}</div>` : ''}${renderRecommendations()}</div></section>`;
    const messagesBox = root.querySelector('.ai-messages'); if (options.scrollToEnd && messagesBox) messagesBox.scrollTop = messagesBox.scrollHeight;
    if (options.focus) { const textarea = root.querySelector('textarea[name="message"]'); try { textarea?.focus({preventScroll:true}); } catch (_) { textarea?.focus(); } }
    persist();
  }

  async function handleText(text, root, {retry=false}={}) {
    if (!text || pending) return;
    if(!retry){add('user', text); parseMessage(text);}
    if (state.slots.dateError) {
      const today = vietnamTodayIso();
      add('bot', localeText(
        `Эта дата уже прошла. Сегодня во Вьетнаме ${dateLabel(today)}. Выберите ${dateLabel(today, { year:false })} или любую более позднюю дату.`,
        `Ngày này đã qua. Hôm nay ở Việt Nam là ${dateLabel(today)}. Hãy chọn ${dateLabel(today, { year:false })} hoặc một ngày muộn hơn.`,
        `That date has already passed. Today in Vietnam is ${dateLabel(today)}. Choose ${dateLabel(today, { year:false })} or any later date.`,
        `이미 지난 날짜입니다. 베트남 기준 오늘은 ${dateLabel(today)}입니다. ${dateLabel(today, { year:false })} 또는 그 이후 날짜를 선택해 주세요.`,
        `该日期已经过去。越南今天是 ${dateLabel(today)}。请选择 ${dateLabel(today, { year:false })} 或之后的日期。`
      ));
      updateRecommendations(text); render(root, { scrollToEnd:true, focus:true }); return;
    }
    updateRecommendations(text);
    retryMessage = null;
    pending = true; add('bot', ui().pending); render(root, { scrollToEnd:true });
    try {
      const result = await requestAiReply(text);
      if (state.messages.at(-1)?.text === ui().pending) state.messages.pop();
      applyServerTour(result);
      if(result.degraded){retryMessage=text;add('bot',semanticText('ai.unavailable'));}
      else add('bot',result.reply);
    } catch (error) {
      console.warn('[LoveTravel AI] consultation request failed',error?.message||error);
      if (state.messages.at(-1)?.text === ui().pending) state.messages.pop();
      retryMessage=text;
      add('bot',semanticText('ai.unavailable'));
    } finally { pending = false; render(root, { scrollToEnd:true, focus:true }); }
  }

  function handleClick(root, event) {
    const button = event.target.closest('[data-ai-action]'); if (!button) return;
    const action = button.dataset.aiAction;
    if (action === 'quick') void handleText(button.dataset.value || '', root);
    if (action === 'retry' && retryMessage) void handleText(retryMessage,root,{retry:true});
    if (action === 'clear') { retryMessage=null; state = freshState(); try { sessionStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(BOOKING_INTENT_KEY); } catch (_) {} render(root); }
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


  globalThis.MaxTourAI = {
    mount,
    _test:{
      vietnamTodayIso, parseDate, parseParty, departureIso, isDiscoveryIntent, isBookingIntent,
      recommendationForTourId, applyServerTour, locationAllowsTour, dispatchValue, prefillBooking,
    },
  };
})();
