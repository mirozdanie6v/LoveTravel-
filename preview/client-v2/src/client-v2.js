const app=document.querySelector('#app');

const SUPPORTED_LOCALES=['ru','vi','en','zh','ko'];
const LOCALE_STORAGE_KEY='lovetravel-client-v2-locale';
const storedLocale=String(localStorage.getItem(LOCALE_STORAGE_KEY)||'ru').toLowerCase();

const state={
  status:'loading',
  tours:[],
  selectedTourId:'',
  detailTab:'overview',
  appTab:'home',
  locale:SUPPORTED_LOCALES.includes(storedLocale)?storedLocale:'ru',
  languageOpen:false,
  galleryIndexByTour:new Map(),
  visualChoiceByTour:new Map(),
  error:'',
};

const PRODUCT_IDS=new Set(['1287578','1287580']);
const OFFICIAL_LOGO='https://bizweb.dktcdn.net/100/416/263/themes/809458/assets/logo.png?1787117096236';

const COPY={
  ru:{
    location:'Нячанг',operator:'Местный туроператор',live:'Свободные места',
    heroKicker:'NHA TRANG · ISLAND EXPERIENCES',heroTitle:'Откройте Нячанг',heroAccent:'с местной командой',
    heroLead:'Robinson Beach и Hòn Mun — две островные программы с актуальными фотографиями, ценами и ближайшими датами.',
    chooseTour:'Выбрать экскурсию',howItWorks:'Как проходит тур',
    trustLocal:'Местная команда',trustLocalSub:'Нячанг и острова',
    trustDates:'Актуальные даты',trustDatesSub:'из системы туроператора',
    trustPrice:'Прозрачная цена',trustPriceSub:'до подтверждения',
    sectionKicker:'ВЫБЕРИТЕ СВОЙ МАРШРУТ',sectionTitle:'Островные экскурсии',programs:'2 программы',
    liveDates:'Актуальные даты',nearest:'Ближайший выезд',from:'Стоимость от',openTour:'Открыть экскурсию',
    allTours:'Все экскурсии',overview:'Обзор',program:'Программа',included:'Включено',
    about:'ОБ ЭКСКУРСИИ',duration:'Длительность',meeting:'Место встречи',highlights:'ГЛАВНОЕ',whatAwaits:'Что вас ждёт',
    route:'МАРШРУТ',dayProgram:'Программа дня',inPrice:'В СТОИМОСТИ',includedTitle:'Что включено',
    options:'Варианты тура',optionsHint:'Выберите формат программы',selected:'Выбрано',select:'Выбрать',
    dates:'Даты выездов',datesHint:'Ближайшие доступные даты',places:'мест',unlimited:'места есть',soldOut:'нет мест',
    chooseDate:'Выбрать дату',continue:'Продолжить',dateNotSelected:'Выберите дату',
    navHome:'Главная',navCatalog:'Каталог',navTrips:'Мои поездки',navAi:'ИИ‑Помощник',
    catalogTitle:'Все экскурсии',catalogLead:'Две актуальные программы Love Travel в Нячанге.',
    aiTitle:'ИИ‑консультант',aiLead:'Поможет сравнить экскурсии, подобрать вариант и затем перейти к бронированию.',
    aiHello:'Расскажите, какой отдых вам нужен — море, острова, спокойный день или активная программа.',
    aiPlaceholder:'Напишите сообщение…',aiSoon:'AI будет подключён на следующем функциональном слое.',
    tripsTitle:'Мои поездки',tripsLead:'Здесь будут отображаться созданные и подтверждённые бронирования.',
    tripsEmpty:'Пока поездок нет',tripsEmptySub:'После подключения бронирования ваши поездки появятся здесь.',
    language:'Язык',tour:'Экскурсия',dayTour:'Экскурсия на день',activity:'Активность',
    dateLocale:'ru-RU'
  },
  vi:{
    location:'Nha Trang',operator:'Nhà điều hành tour địa phương',live:'Còn chỗ',
    heroKicker:'NHA TRANG · TRẢI NGHIỆM BIỂN ĐẢO',heroTitle:'Khám phá Nha Trang',heroAccent:'cùng đội ngũ địa phương',
    heroLead:'Robinson Beach và Hòn Mun — hai chương trình biển đảo với hình ảnh, giá và lịch khởi hành cập nhật.',
    chooseTour:'Chọn tour',howItWorks:'Tour diễn ra thế nào',
    trustLocal:'Đội ngũ địa phương',trustLocalSub:'Nha Trang và các đảo',
    trustDates:'Lịch cập nhật',trustDatesSub:'từ hệ thống nhà điều hành',
    trustPrice:'Giá rõ ràng',trustPriceSub:'trước khi xác nhận',
    sectionKicker:'CHỌN HÀNH TRÌNH',sectionTitle:'Tour biển đảo',programs:'2 chương trình',
    liveDates:'Lịch cập nhật',nearest:'Khởi hành gần nhất',from:'Giá từ',openTour:'Mở tour',
    allTours:'Tất cả tour',overview:'Tổng quan',program:'Lịch trình',included:'Bao gồm',
    about:'VỀ TOUR',duration:'Thời lượng',meeting:'Điểm hẹn',highlights:'ĐIỂM NỔI BẬT',whatAwaits:'Bạn sẽ trải nghiệm',
    route:'LỊCH TRÌNH',dayProgram:'Chương trình trong ngày',inPrice:'TRONG GIÁ',includedTitle:'Bao gồm',
    options:'Các lựa chọn tour',optionsHint:'Chọn hình thức chương trình',selected:'Đã chọn',select:'Chọn',
    dates:'Ngày khởi hành',datesHint:'Các ngày gần nhất còn chỗ',places:'chỗ',unlimited:'còn chỗ',soldOut:'hết chỗ',
    chooseDate:'Chọn ngày',continue:'Tiếp tục',dateNotSelected:'Chọn ngày',
    navHome:'Trang chủ',navCatalog:'Tour',navTrips:'Chuyến đi',navAi:'Trợ lý AI',
    catalogTitle:'Tất cả tour',catalogLead:'Hai chương trình Love Travel đang hoạt động tại Nha Trang.',
    aiTitle:'Trợ lý AI',aiLead:'Giúp so sánh tour, chọn phương án và sau đó chuyển sang đặt tour.',
    aiHello:'Hãy cho tôi biết bạn muốn biển, đảo, thư giãn hay một ngày năng động.',
    aiPlaceholder:'Nhập tin nhắn…',aiSoon:'AI sẽ được kết nối ở lớp chức năng tiếp theo.',
    tripsTitle:'Chuyến đi của tôi',tripsLead:'Các booking đã tạo và xác nhận sẽ hiển thị tại đây.',
    tripsEmpty:'Chưa có chuyến đi',tripsEmptySub:'Sau khi kết nối booking, chuyến đi của bạn sẽ xuất hiện ở đây.',
    language:'Ngôn ngữ',tour:'Tour',dayTour:'Tour trong ngày',activity:'Hoạt động',
    dateLocale:'vi-VN'
  },
  en:{
    location:'Nha Trang',operator:'Local tour operator',live:'Live availability',
    heroKicker:'NHA TRANG · ISLAND EXPERIENCES',heroTitle:'Discover Nha Trang',heroAccent:'with a local team',
    heroLead:'Robinson Beach and Hòn Mun — two island programs with current photos, prices and upcoming departures.',
    chooseTour:'Choose a tour',howItWorks:'How the tour works',
    trustLocal:'Local team',trustLocalSub:'Nha Trang and islands',
    trustDates:'Live dates',trustDatesSub:'from the operator system',
    trustPrice:'Clear pricing',trustPriceSub:'before confirmation',
    sectionKicker:'CHOOSE YOUR ROUTE',sectionTitle:'Island experiences',programs:'2 programs',
    liveDates:'Live dates',nearest:'Next departure',from:'From',openTour:'Open tour',
    allTours:'All tours',overview:'Overview',program:'Program',included:'Included',
    about:'ABOUT THE TOUR',duration:'Duration',meeting:'Meeting point',highlights:'HIGHLIGHTS',whatAwaits:'What to expect',
    route:'ROUTE',dayProgram:'Day program',inPrice:'INCLUDED',includedTitle:'What is included',
    options:'Tour options',optionsHint:'Choose a program format',selected:'Selected',select:'Select',
    dates:'Departure dates',datesHint:'Nearest available dates',places:'places',unlimited:'available',soldOut:'sold out',
    chooseDate:'Choose date',continue:'Continue',dateNotSelected:'Choose a date',
    navHome:'Home',navCatalog:'Tours',navTrips:'My trips',navAi:'AI Assistant',
    catalogTitle:'All tours',catalogLead:'Two current Love Travel experiences in Nha Trang.',
    aiTitle:'AI consultant',aiLead:'Helps compare tours, choose an option and then move to booking.',
    aiHello:'Tell me what kind of day you want — sea, islands, relaxed or active.',
    aiPlaceholder:'Type a message…',aiSoon:'AI will be connected in the next functional layer.',
    tripsTitle:'My trips',tripsLead:'Created and confirmed bookings will appear here.',
    tripsEmpty:'No trips yet',tripsEmptySub:'Your trips will appear here after booking is connected.',
    language:'Language',tour:'Tour',dayTour:'Day tour',activity:'Activity',
    dateLocale:'en-US'
  },
  zh:{
    location:'芽庄',operator:'芽庄当地旅行社',live:'实时可订',
    heroKicker:'芽庄 · 海岛体验',heroTitle:'探索芽庄',heroAccent:'跟随当地团队',
    heroLead:'Robinson Beach 与 Hòn Mun 两条海岛线路，提供实时图片、价格和近期出发日期。',
    chooseTour:'选择行程',howItWorks:'行程如何进行',
    trustLocal:'当地团队',trustLocalSub:'芽庄与海岛',
    trustDates:'实时日期',trustDatesSub:'来自旅行社系统',
    trustPrice:'价格清晰',trustPriceSub:'确认前可见',
    sectionKicker:'选择您的路线',sectionTitle:'海岛行程',programs:'2 条线路',
    liveDates:'实时日期',nearest:'最近出发',from:'起价',openTour:'查看行程',
    allTours:'全部行程',overview:'概览',program:'行程安排',included:'包含',
    about:'关于行程',duration:'时长',meeting:'集合点',highlights:'亮点',whatAwaits:'体验内容',
    route:'路线',dayProgram:'当日行程',inPrice:'费用包含',includedTitle:'包含内容',
    options:'行程选项',optionsHint:'选择行程形式',selected:'已选择',select:'选择',
    dates:'出发日期',datesHint:'最近可订日期',places:'个名额',unlimited:'可订',soldOut:'售罄',
    chooseDate:'选择日期',continue:'继续',dateNotSelected:'请选择日期',
    navHome:'首页',navCatalog:'行程',navTrips:'我的行程',navAi:'AI 助手',
    catalogTitle:'全部行程',catalogLead:'Love Travel 在芽庄的两条实时线路。',
    aiTitle:'AI 顾问',aiLead:'帮助比较行程、选择方案，然后进入预订。',
    aiHello:'告诉我您想要海岛、轻松还是更活跃的一天。',
    aiPlaceholder:'输入消息…',aiSoon:'AI 将在下一功能层接入。',
    tripsTitle:'我的行程',tripsLead:'已创建和确认的预订将显示在这里。',
    tripsEmpty:'暂无行程',tripsEmptySub:'接入预订后，您的行程会显示在这里。',
    language:'语言',tour:'行程',dayTour:'一日游',activity:'活动',
    dateLocale:'zh-CN'
  },
  ko:{
    location:'나트랑',operator:'나트랑 현지 투어 운영사',live:'실시간 예약 가능',
    heroKicker:'NHA TRANG · ISLAND EXPERIENCES',heroTitle:'나트랑을 만나보세요',heroAccent:'현지 팀과 함께',
    heroLead:'Robinson Beach와 Hòn Mun 두 가지 섬 프로그램의 최신 사진, 가격, 출발 일정을 확인하세요.',
    chooseTour:'투어 선택',howItWorks:'투어 진행 보기',
    trustLocal:'현지 팀',trustLocalSub:'나트랑과 섬',
    trustDates:'실시간 일정',trustDatesSub:'운영 시스템 기준',
    trustPrice:'명확한 가격',trustPriceSub:'확정 전 확인',
    sectionKicker:'여정을 선택하세요',sectionTitle:'아일랜드 투어',programs:'2개 프로그램',
    liveDates:'실시간 일정',nearest:'가장 가까운 출발',from:'최저',openTour:'투어 열기',
    allTours:'모든 투어',overview:'개요',program:'일정',included:'포함 사항',
    about:'투어 소개',duration:'소요 시간',meeting:'미팅 포인트',highlights:'하이라이트',whatAwaits:'무엇을 하나요',
    route:'일정',dayProgram:'하루 프로그램',inPrice:'포함 사항',includedTitle:'포함 내용',
    options:'투어 옵션',optionsHint:'프로그램 형식을 선택하세요',selected:'선택됨',select:'선택',
    dates:'출발 날짜',datesHint:'가까운 예약 가능 날짜',places:'자리',unlimited:'예약 가능',soldOut:'매진',
    chooseDate:'날짜 선택',continue:'계속',dateNotSelected:'날짜를 선택하세요',
    navHome:'홈',navCatalog:'투어',navTrips:'내 여행',navAi:'AI 도우미',
    catalogTitle:'모든 투어',catalogLead:'나트랑 Love Travel의 두 가지 현재 프로그램입니다.',
    aiTitle:'AI 컨설턴트',aiLead:'투어를 비교하고 옵션을 고른 뒤 예약으로 이어집니다.',
    aiHello:'바다, 섬, 여유로운 일정 또는 활동적인 하루 중 원하는 스타일을 알려주세요.',
    aiPlaceholder:'메시지를 입력하세요…',aiSoon:'AI는 다음 기능 단계에서 연결됩니다.',
    tripsTitle:'내 여행',tripsLead:'생성 및 확정된 예약이 여기에 표시됩니다.',
    tripsEmpty:'아직 여행이 없습니다',tripsEmptySub:'예약 기능 연결 후 여행이 여기에 표시됩니다.',
    language:'언어',tour:'투어',dayTour:'당일 투어',activity:'액티비티',
    dateLocale:'ko-KR'
  }
};

const t=()=>COPY[state.locale]||COPY.ru;

const esc=value=>String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'","&#39;");

function arr(value){ return Array.isArray(value)?value:[]; }

function plainText(value){
  if(Array.isArray(value)) return value.map(plainText).filter(Boolean);
  const source=String(value??'');
  if(!source) return '';
  const doc=new DOMParser().parseFromString(source,'text/html');
  return (doc.body.textContent||'').replace(/\s+/g,' ').trim();
}

function photoUrls(domain){
  return [...new Set(arr(domain?.experience?.media?.photos)
    .map(item=>String(item?.url||item?.originalUrl||'').trim()).filter(Boolean))];
}

function durationLabel(experience){
  const duration=experience?.duration||{};
  const hours=Number(duration.hours);
  const minutes=Number(duration.minutes);
  const source=String(duration.text||'').trim();
  if(Number.isFinite(hours)&&hours>0) return state.locale==='ru'?hours+' ч':source||hours+' h';
  if(Number.isFinite(minutes)&&minutes>0) return state.locale==='ru'?(Math.round(minutes/60*10)/10)+' ч':source||minutes+' min';
  if(state.locale==='ru'){
    const match=source.match(/(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|h|час)/i);
    if(match) return String(match[1]).replace('.',',')+' ч';
    return source.replace(/hours?/gi,'ч').replace(/hrs?/gi,'ч');
  }
  return source;
}

function categoryLabel(value){
  const key=String(value||'').toUpperCase();
  if(key==='DAY_TOUR_OR_ACTIVITY') return t().dayTour;
  if(key==='TOUR_OR_ACTIVITY') return t().tour;
  if(key==='ACTIVITY') return t().activity;
  return plainText(String(value||'').replaceAll('_',' ').toLowerCase());
}

function amountValue(value){
  if(value&&typeof value==='object') return amountValue(value.amount);
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function money(value){
  const amount=amountValue(value);
  if(amount===null) return '';
  const currency=String(value?.currency||value?.amount?.currency||'USD');
  const formatted=Number.isInteger(amount)?String(amount):amount.toFixed(2).replace(/\.00$/,'');
  return currency==='USD'?'$'+formatted:formatted+' '+currency;
}

function quoteFor(slot,rateId){
  return arr(slot?.priceQuotesByRate).find(item=>String(item?.rateId)===String(rateId))||null;
}

function rateAvailable(slot,rateId){
  return Boolean(quoteFor(slot,rateId))||arr(slot?.rates).some(rate=>String(rate?.id)===String(rateId));
}

function firstAdult(tour){
  return arr(tour.participants).find(item=>String(item?.ticketCategory||'').toUpperCase()==='ADULT')||arr(tour.participants)[0]||null;
}

function priceFor(tour,slot,rateId){
  const adult=firstAdult(tour);
  const quote=quoteFor(slot,rateId);
  const price=arr(quote?.participantPrices).find(item=>String(item?.categoryId)===String(adult?.id))||arr(quote?.participantPrices)[0];
  return price?.amount||null;
}

function priceLabel(domain){
  const tour={participants:arr(domain?.participants)};
  const slot=arr(domain?.availabilitySlots).find(item=>!item?.soldOut&&!item?.unavailable)||domain?.availabilitySlots?.[0];
  if(!slot) return '';
  const rateId=slot?.defaultRateId??domain?.rates?.[0]?.id;
  return money(priceFor(tour,slot,rateId));
}

function nextSlot(domain){
  return arr(domain?.availabilitySlots).find(item=>!item?.soldOut&&!item?.unavailable)||domain?.availabilitySlots?.[0]||null;
}

function formatDate(iso,weekday=false){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||''))) return '';
  return new Intl.DateTimeFormat(t().dateLocale,{
    weekday:weekday?'short':undefined,day:'numeric',month:'short',timeZone:'UTC'
  }).format(new Date(iso+'T00:00:00Z'));
}

function listFrom(value){
  if(Array.isArray(value)) return value.map(item=>plainText(item)).filter(Boolean);
  const text=String(value??'');
  if(!text) return [];
  const doc=new DOMParser().parseFromString(text.replace(/<br\s*\/?>/gi,'\n'),'text/html');
  const lis=[...doc.body.querySelectorAll('li')].map(item=>plainText(item.textContent)).filter(Boolean);
  if(lis.length) return lis;
  return plainText(doc.body.textContent).split(/\n+/).map(item=>item.trim()).filter(Boolean);
}

function meetingLabel(experience){
  const first=arr(experience?.meeting?.startPoints)[0];
  return plainText(first?.title||first?.name||first?.address||first?.addressLine1||'');
}

function normalizeTour(domain){
  const experience=domain?.experience||{};
  const id=String(experience.id||domain?.provider?.productId||'');
  const slot=nextSlot(domain);
  const included=listFrom(experience?.content?.included||experience?.content?.inclusions);
  return {
    id,
    title:plainText(experience.title)||t().tour,
    description:plainText(experience.description||experience.excerpt),
    city:plainText(experience?.location?.city)||t().location,
    category:categoryLabel(experience.category),
    duration:durationLabel(experience),
    photos:photoUrls(domain),
    price:priceLabel(domain),
    nextDate:formatDate(slot?.date),
    nextTime:String(slot?.startTime||''),
    meeting:meetingLabel(experience),
    included,
    highlights:included.slice(0,3),
    itinerary:arr(experience?.itinerary).map((item,index)=>({
      title:plainText(item?.title)||String(index+1),
      body:plainText(item?.body),
    })).filter(item=>item.title||item.body),
    rates:arr(domain?.rates),
    availabilitySlots:arr(domain?.availabilitySlots),
    participants:arr(domain?.participants),
  };
}

function brand(){
  return '<button class="brand" type="button" data-app-tab="home" aria-label="Nha Trang Love Travel">'
    +'<span class="brand-logo-wrap"><img class="brand-logo" src="'+esc(OFFICIAL_LOGO)+'" alt="Nha Trang Love Travel"></span>'
    +'<span class="brand-fallback"><strong>LOVE TRAVEL</strong><small>NHA TRANG</small></span>'
    +'</button>';
}

function languageSwitcher(){
  const labels={ru:'RU',vi:'VI',en:'EN',zh:'中文',ko:'KO'};
  return '<div class="language-control">'
    +'<button type="button" class="language-trigger" data-language-trigger aria-expanded="'+String(state.languageOpen)+'"><span>文</span>'+labels[state.locale]+' <b>⌄</b></button>'
    +(state.languageOpen?'<div class="language-menu" role="menu" aria-label="'+esc(t().language)+'">'
      +SUPPORTED_LOCALES.map(locale=>'<button type="button" class="'+(locale===state.locale?'is-active':'')+'" data-locale="'+locale+'">'+labels[locale]+'</button>').join('')
      +'</div>':'')
    +'</div>';
}

function topbar(extraClass=''){
  return '<header class="topbar '+extraClass+'">'+brand()+languageSwitcher()+'</header>';
}

function media(photo,title,extra=''){
  return photo
    ? '<img '+extra+' src="'+esc(photo)+'" alt="'+esc(title)+'" loading="lazy" referrerpolicy="no-referrer">'
    : '<div class="media-fallback" role="img" aria-label="'+esc(title)+'"></div>';
}

function slotText(tour){
  return [tour.nextDate,tour.nextTime].filter(Boolean).join(' · ')||t().dateNotSelected;
}

function tourThemeLabel(tour){
  return tour.id==='1287578'?'Robinson Beach':'Hòn Mun Marine Park';
}

function cardsMarkup(){
  return state.tours.map(tour=>{
    const detailMeta=[tour.duration,tour.category].filter(Boolean)
      .map(value=>'<span class="card-chip">'+esc(value)+'</span>').join('');
    return '<button class="tour-card" type="button" data-tour-id="'+esc(tour.id)+'">'
      +'<span class="card-media">'+media(tour.photos[0],tour.title)
      +'<span class="card-media-shade"></span>'
      +'<span class="card-place">'+esc(tourThemeLabel(tour))+'</span>'
      +'<span class="card-live"><i></i> '+esc(t().liveDates)+'</span></span>'
      +'<span class="card-body"><span class="card-meta">'+detailMeta+'</span>'
      +'<strong class="card-title">'+esc(tour.title)+'</strong>'
      +'<span class="card-desc">'+esc(tour.description||'')+'</span>'
      +'<span class="card-facts"><span><small>'+esc(t().nearest)+'</small><b>'+esc(slotText(tour))+'</b></span>'
      +'<span><small>'+esc(t().from)+'</small><b class="card-price">'+esc(tour.price||'—')+'</b></span></span>'
      +'<span class="card-action">'+esc(t().openTour)+' <b>→</b></span></span></button>';
  }).join('');
}

function homeView(){
  const heroPhoto=state.tours[0]?.photos?.[0]||'';
  return '<main class="page catalog-page">'
    +topbar()
    +'<section class="catalog-hero" style="--hero-image:url(&quot;'+esc(heroPhoto).replaceAll('&quot;','%22')+'&quot;)">'
    +'<div class="catalog-hero__shade"></div>'
    +'<div class="catalog-hero__top"><span class="glass-pill">'+esc(t().operator)+'</span><span class="glass-pill glass-pill--live"><i></i> '+esc(t().live)+'</span></div>'
    +'<div class="catalog-hero__content"><div class="hero-kicker">'+esc(t().heroKicker)+'</div>'
    +'<h1>'+esc(t().heroTitle)+' <strong>'+esc(t().heroAccent)+'</strong></h1>'
    +'<p>'+esc(t().heroLead)+'</p><div class="hero-chips"><span>Robinson Beach</span><span>Hòn Mun</span></div>'
    +'<div class="hero-actions"><button type="button" class="hero-cta hero-cta--primary" data-app-tab="catalog">'+esc(t().chooseTour)+' <b>→</b></button>'
    +'<button type="button" class="hero-cta hero-cta--glass" data-scroll-info>'+esc(t().howItWorks)+'</button></div></div></section>'
    +'<section class="trust-row" data-info-anchor>'
    +'<div><span class="trust-icon">✦</span><b>'+esc(t().trustLocal)+'</b><small>'+esc(t().trustLocalSub)+'</small></div>'
    +'<div><span class="trust-icon">◷</span><b>'+esc(t().trustDates)+'</b><small>'+esc(t().trustDatesSub)+'</small></div>'
    +'<div><span class="trust-icon">◎</span><b>'+esc(t().trustPrice)+'</b><small>'+esc(t().trustPriceSub)+'</small></div></section>'
    +'<section class="catalog-section"><div class="section-head"><div><span class="section-kicker">'+esc(t().sectionKicker)+'</span><h2>'+esc(t().sectionTitle)+'</h2></div><span class="section-count">'+esc(t().programs)+'</span></div>'
    +'<div class="tour-grid">'+cardsMarkup()+'</div></section></main>';
}

function catalogView(){
  return '<main class="page app-section-page">'+topbar()
    +'<section class="app-page-head"><span>'+esc(t().sectionKicker)+'</span><h1>'+esc(t().catalogTitle)+'</h1><p>'+esc(t().catalogLead)+'</p></section>'
    +'<div class="tour-grid">'+cardsMarkup()+'</div></main>';
}

function assistantView(){
  const quick=['Robinson Beach','Hòn Mun',t().chooseTour];
  return '<main class="page app-section-page">'+topbar()
    +'<section class="assistant-shell"><div class="assistant-orb">✦</div><span class="app-eyebrow">LOVE TRAVEL AI</span><h1>'+esc(t().aiTitle)+'</h1><p>'+esc(t().aiLead)+'</p>'
    +'<div class="assistant-chat"><div class="assistant-message">'+esc(t().aiHello)+'</div>'
    +'<div class="assistant-quick">'+quick.map(x=>'<button type="button" data-ai-preview>'+esc(x)+'</button>').join('')+'</div></div>'
    +'<div class="assistant-input"><input type="text" placeholder="'+esc(t().aiPlaceholder)+'" data-ai-input><button type="button" data-ai-preview>↑</button></div>'
    +'<small class="assistant-stage-note">'+esc(t().aiSoon)+'</small></section></main>';
}

function tripsView(){
  return '<main class="page app-section-page">'+topbar()
    +'<section class="app-page-head"><span>LOVE TRAVEL</span><h1>'+esc(t().tripsTitle)+'</h1><p>'+esc(t().tripsLead)+'</p></section>'
    +'<section class="empty-app-state"><div>✦</div><h2>'+esc(t().tripsEmpty)+'</h2><p>'+esc(t().tripsEmptySub)+'</p><button type="button" data-app-tab="catalog">'+esc(t().chooseTour)+'</button></section></main>';
}

function galleryMarkup(tour){
  const photos=tour.photos;
  const rawIndex=Number(state.galleryIndexByTour.get(tour.id)||0);
  const index=photos.length?Math.max(0,Math.min(photos.length-1,rawIndex)):0;
  return '<div class="detail-photo">'+media(photos[index]||'',tour.title,'data-detail-hero-image')
    +'<div class="detail-photo__shade"></div><div class="detail-photo__top"><button type="button" class="glass-back" data-back>← '+esc(t().allTours)+'</button>'
    +'<span class="photo-count">'+(photos.length?(index+1)+' / '+photos.length:'')+'</span></div>'
    +(photos.length>1?'<button type="button" class="gallery-nav gallery-nav--prev" data-gallery-prev>‹</button><button type="button" class="gallery-nav gallery-nav--next" data-gallery-next>›</button>':'')
    +'</div>';
}

function visualChoice(tour){
  let choice=state.visualChoiceByTour.get(tour.id);
  if(choice) return choice;
  const firstSlot=arr(tour.availabilitySlots).find(slot=>!slot.soldOut&&!slot.unavailable)||tour.availabilitySlots[0]||null;
  const rateId=firstSlot?.defaultRateId??tour.rates[0]?.id??null;
  const slot=arr(tour.availabilitySlots).find(item=>!item.soldOut&&!item.unavailable&&rateAvailable(item,rateId))||firstSlot;
  choice={rateId,slotId:slot?.id||null};
  state.visualChoiceByTour.set(tour.id,choice);
  return choice;
}

function rateDescription(rate){
  return plainText(rate?.description||arr(rate?.details)[0]?.description||arr(rate?.textItems)[0]?.description||'');
}

function optionsMarkup(tour){
  const choice=visualChoice(tour);
  const rates=arr(tour.rates);
  if(!rates.length) return '';
  return '<section class="selection-section"><div class="selection-head"><div><span>'+esc(t().options)+'</span><p>'+esc(t().optionsHint)+'</p></div></div>'
    +'<div class="rate-options">'+rates.map((rate,index)=>{
      const active=String(rate.id)===String(choice.rateId);
      const slot=arr(tour.availabilitySlots).find(item=>!item.soldOut&&!item.unavailable&&rateAvailable(item,rate.id));
      const price=slot?money(priceFor(tour,slot,rate.id)):'';
      const accent=index%2===0?'orange':'blue';
      return '<button type="button" class="rate-option '+(active?'is-active ':'')+'rate-option--'+accent+'" data-preview-rate="'+esc(rate.id)+'">'
        +'<span class="rate-marker">'+(active?'✓':String(index+1))+'</span><span class="rate-copy"><b>'+esc(plainText(rate.title||rate.code||rate.id))+'</b>'
        +(rateDescription(rate)?'<small>'+esc(rateDescription(rate))+'</small>':'')+'</span>'
        +(price?'<span class="rate-price"><small>'+esc(t().from)+'</small><strong>'+esc(price)+'</strong></span>':'')
        +'<span class="rate-action">'+esc(active?t().selected:t().select)+'</span></button>';
    }).join('')+'</div></section>';
}

function datesMarkup(tour){
  const choice=visualChoice(tour);
  const slots=arr(tour.availabilitySlots).filter(slot=>rateAvailable(slot,choice.rateId)).slice(0,8);
  if(!slots.length) return '';
  return '<section class="selection-section"><div class="selection-head"><div><span>'+esc(t().dates)+'</span><p>'+esc(t().datesHint)+'</p></div></div>'
    +'<div class="departure-list">'+slots.map(slot=>{
      const active=String(slot.id)===String(choice.slotId);
      const unavailable=Boolean(slot.soldOut||slot.unavailable||(!slot.unlimitedAvailability&&Number(slot.availabilityCount)<=0));
      const count=Number(slot.availabilityCount);
      const availability=slot.unlimitedAvailability?t().unlimited:unavailable?t().soldOut:(Number.isFinite(count)?Math.max(0,count)+' '+t().places:t().unlimited);
      const price=money(priceFor(tour,slot,choice.rateId));
      return '<button type="button" class="departure-option '+(active?'is-active ':'')+(unavailable?'is-disabled':'')+'" data-preview-slot="'+esc(slot.id)+'" '+(unavailable?'disabled':'')+'>'
        +'<span class="departure-date"><b>'+esc(formatDate(slot.date,true))+'</b><small>'+esc(slot.startTime||'')+'</small></span>'
        +'<span class="departure-availability">'+esc(availability)+'</span>'
        +(price?'<strong>'+esc(price)+'</strong>':'')+'<span class="departure-check">'+(active?'✓':'→')+'</span></button>';
    }).join('')+'</div></section>';
}

function overviewPanel(tour){
  const facts=[[t().duration,tour.duration||'—'],[t().nearest,slotText(tour)],[t().meeting,tour.meeting||'—']];
  const highlights=(tour.highlights.length?tour.highlights:[tourThemeLabel(tour)]).slice(0,3)
    .map(item=>'<li>'+esc(item)+'</li>').join('');
  return '<div class="tab-panel tab-panel--overview">'
    +'<article class="content-card content-card--intro"><span class="content-kicker">'+esc(t().about)+'</span><h2>'+esc(tourThemeLabel(tour))+'</h2><p>'+esc(tour.description||'')+'</p></article>'
    +'<div class="fact-grid">'+facts.map(([label,value])=>'<div class="fact-card"><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div>').join('')+'</div>'
    +'<article class="content-card"><span class="content-kicker">'+esc(t().highlights)+'</span><h2>'+esc(t().whatAwaits)+'</h2><ul class="accent-list">'+highlights+'</ul></article></div>';
}

function itineraryPanel(tour){
  const itinerary=(tour.itinerary.length?tour.itinerary:[{title:t().dayProgram,body:''}])
    .slice(0,10).map((stop,index)=>'<div class="timeline-stop"><span class="timeline-index">'+(index+1)+'</span><div><h3>'+esc(stop.title)+'</h3><p>'+esc(stop.body)+'</p></div></div>').join('');
  return '<article class="content-card"><span class="content-kicker">'+esc(t().route)+'</span><h2>'+esc(t().dayProgram)+'</h2><div class="timeline">'+itinerary+'</div></article>';
}

function includedPanel(tour){
  const included=(tour.included.length?tour.included:['—']).slice(0,12).map(item=>'<li>'+esc(item)+'</li>').join('');
  return '<article class="content-card"><span class="content-kicker">'+esc(t().inPrice)+'</span><h2>'+esc(t().includedTitle)+'</h2><ul class="included-list">'+included+'</ul></article>';
}

function detailPanel(tour){
  if(state.detailTab==='itinerary') return itineraryPanel(tour);
  if(state.detailTab==='included') return includedPanel(tour);
  return overviewPanel(tour);
}

function selectedSlotForTour(tour){
  const choice=visualChoice(tour);
  return arr(tour.availabilitySlots).find(slot=>String(slot.id)===String(choice.slotId))||null;
}

function selectedPrice(tour){
  const choice=visualChoice(tour);
  const slot=selectedSlotForTour(tour);
  return slot?money(priceFor(tour,slot,choice.rateId)):tour.price;
}

function detailView(tour){
  const choice=visualChoice(tour);
  const selectedSlot=selectedSlotForTour(tour);
  const currentPrice=selectedPrice(tour)||tour.price||'—';
  const meta=[tour.city,tour.duration,tour.category].filter(Boolean).map(value=>'<span class="hero-chip">'+esc(value)+'</span>').join('');
  const tabs=[['overview',t().overview],['itinerary',t().program],['included',t().included]];
  return '<main class="page tour-page">'+topbar('topbar--detail')
    +'<section class="detail-hero">'+galleryMarkup(tour)
    +'<div class="detail-hero__content"><div class="detail-meta">'+meta+'</div><h1>'+esc(tour.title)+'</h1><p class="detail-lead">'+esc(tour.description||'')+'</p>'
    +'<div class="detail-purchase"><div><small>'+esc(t().from)+'</small><strong>'+esc(currentPrice)+'</strong></div><div><small>'+esc(t().nearest)+'</small><b>'+esc(selectedSlot?[formatDate(selectedSlot.date),selectedSlot.startTime].filter(Boolean).join(' · '):slotText(tour))+'</b></div></div>'
    +'</div></section>'
    +optionsMarkup(tour)+datesMarkup(tour)
    +'<nav class="tour-tabs" aria-label="'+esc(t().overview)+'">'+tabs.map(([id,label])=>'<button type="button" class="tour-tab '+(state.detailTab===id?'is-active':'')+'" data-tab="'+id+'">'+esc(label)+'</button>').join('')+'</nav>'
    +'<section class="tour-content" id="tour-content">'+detailPanel(tour)+'</section>'
    +'<div class="mobile-booking-bar mobile-booking-bar--with-nav"><div><small>'+esc(t().from)+'</small><strong>'+esc(currentPrice)+'</strong></div>'
    +'<button type="button" data-visual-booking>'+esc(selectedSlot?t().continue:t().chooseDate)+'</button></div></main>';
}

function bottomNav(){
  const tabs=[
    ['home','⌂',t().navHome],
    ['catalog','▦',t().navCatalog],
    ['trips','◇',t().navTrips],
    ['assistant','✦',t().navAi],
  ];
  const active=state.selectedTourId?'catalog':state.appTab;
  return '<nav class="bottom-nav" aria-label="Mini app navigation">'+tabs.map(([id,icon,label])=>'<button type="button" class="bottom-nav__item '+(active===id?'is-active':'')+'" data-app-tab="'+id+'"><span>'+icon+'</span><b>'+esc(label)+'</b></button>').join('')+'</nav>';
}

function showStageNotice(message){
  document.querySelector('.stage-notice')?.remove();
  const notice=document.createElement('div');
  notice.className='stage-notice';
  notice.textContent=message;
  document.body.appendChild(notice);
  requestAnimationFrame(()=>notice.classList.add('is-visible'));
  window.setTimeout(()=>{notice.classList.remove('is-visible');window.setTimeout(()=>notice.remove(),220);},2400);
}

function bindInteractions(){
  app.querySelectorAll('[data-tour-id]').forEach(button=>{
    button.addEventListener('click',()=>{
      state.selectedTourId=button.dataset.tourId||'';
      state.detailTab='overview';
      history.replaceState(null,'','#tour/'+encodeURIComponent(state.selectedTourId));
      render(); window.scrollTo({top:0,behavior:'auto'});
    });
  });

  app.querySelectorAll('[data-app-tab]').forEach(button=>{
    button.addEventListener('click',()=>{
      const tab=button.dataset.appTab||'home';
      state.appTab=tab; state.selectedTourId=''; state.detailTab='overview'; state.languageOpen=false;
      history.replaceState(null,'','#'+tab); render(); window.scrollTo({top:0,behavior:'auto'});
    });
  });

  app.querySelector('[data-back]')?.addEventListener('click',()=>{
    state.selectedTourId=''; state.appTab='catalog'; state.detailTab='overview';
    history.replaceState(null,'','#catalog'); render(); window.scrollTo({top:0,behavior:'auto'});
  });

  app.querySelector('[data-language-trigger]')?.addEventListener('click',()=>{
    state.languageOpen=!state.languageOpen; render();
  });
  app.querySelectorAll('[data-locale]').forEach(button=>{
    button.addEventListener('click',async()=>{
      const locale=button.dataset.locale;
      if(!SUPPORTED_LOCALES.includes(locale)||locale===state.locale){ state.languageOpen=false; render(); return; }
      state.locale=locale; state.languageOpen=false; localStorage.setItem(LOCALE_STORAGE_KEY,locale);
      document.documentElement.lang=locale;
      await loadTours({preserveRoute:true});
    });
  });

  app.querySelector('[data-scroll-info]')?.addEventListener('click',()=>app.querySelector('[data-info-anchor]')?.scrollIntoView({behavior:'smooth',block:'center'}));

  app.querySelectorAll('[data-tab]').forEach(button=>{
    button.addEventListener('click',()=>{
      state.detailTab=button.dataset.tab||'overview'; render();
      app.querySelector('#tour-content')?.scrollIntoView({behavior:'auto',block:'start'});
    });
  });

  const tour=state.tours.find(item=>item.id===state.selectedTourId);
  if(tour){
    const moveGallery=delta=>{
      const count=tour.photos.length;if(!count)return;
      const current=Number(state.galleryIndexByTour.get(tour.id)||0);
      state.galleryIndexByTour.set(tour.id,(current+delta+count)%count);render();
    };
    app.querySelector('[data-gallery-prev]')?.addEventListener('click',()=>moveGallery(-1));
    app.querySelector('[data-gallery-next]')?.addEventListener('click',()=>moveGallery(1));

    app.querySelectorAll('[data-preview-rate]').forEach(button=>{
      button.addEventListener('click',()=>{
        const rateId=button.dataset.previewRate;
        const slot=arr(tour.availabilitySlots).find(item=>!item.soldOut&&!item.unavailable&&rateAvailable(item,rateId));
        state.visualChoiceByTour.set(tour.id,{rateId,slotId:slot?.id||null});render();
      });
    });
    app.querySelectorAll('[data-preview-slot]').forEach(button=>{
      button.addEventListener('click',()=>{
        const choice=visualChoice(tour);
        state.visualChoiceByTour.set(tour.id,{...choice,slotId:button.dataset.previewSlot});render();
      });
    });
  }

  app.querySelectorAll('[data-visual-booking]').forEach(button=>button.addEventListener('click',()=>showStageNotice(t().aiSoon.replace('AI',state.locale==='ru'?'Бронирование':'Booking'))));
  app.querySelectorAll('[data-ai-preview]').forEach(button=>button.addEventListener('click',()=>showStageNotice(t().aiSoon)));

  const logo=app.querySelector('.brand-logo');
  if(logo) logo.addEventListener('error',()=>app.querySelector('.brand')?.classList.add('is-fallback'),{once:true});
}

function render(){
  if(state.status==='loading'){
    app.innerHTML='<main class="page">'+topbar()+'<section class="state-panel"><div class="spinner"></div><h2>Love Travel</h2><p>…</p></section></main>'+bottomNav();
    return;
  }
  if(state.status==='error'){
    app.innerHTML='<main class="page">'+topbar()+'<section class="state-panel"><h2>Love Travel</h2><p>'+esc(state.error)+'</p><button class="retry" type="button" data-retry>↻</button></section></main>'+bottomNav();
    app.querySelector('[data-retry]')?.addEventListener('click',()=>loadTours({preserveRoute:true}));
    bindInteractions(); return;
  }

  const tour=state.tours.find(item=>item.id===state.selectedTourId);
  let content='';
  if(tour) content=detailView(tour);
  else if(state.appTab==='catalog') content=catalogView();
  else if(state.appTab==='assistant') content=assistantView();
  else if(state.appTab==='trips') content=tripsView();
  else content=homeView();
  app.innerHTML=content+bottomNav();
  bindInteractions();
}

function routeFromHash(){
  const tourMatch=location.hash.match(/^#tour\/([^/?#]+)/);
  if(tourMatch){state.selectedTourId=decodeURIComponent(tourMatch[1]);state.appTab='catalog';return;}
  state.selectedTourId='';
  const tab=location.hash.replace(/^#/,'');
  if(['home','catalog','assistant','trips'].includes(tab)) state.appTab=tab;
}

async function loadTours({preserveRoute=false}={}){
  state.status='loading';state.error='';render();
  try{
    const response=await fetch('/api/tours?locale='+encodeURIComponent(state.locale),{headers:{accept:'application/json'}});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.ok||!Array.isArray(payload.domains)) throw new Error(payload?.error||'Love Travel');
    const tours=payload.domains.map(normalizeTour).filter(tour=>PRODUCT_IDS.has(tour.id));
    if(tours.length!==2||new Set(tours.map(tour=>tour.id)).size!==2) throw new Error('Love Travel');
    state.tours=tours;state.status='ready';
    if(!preserveRoute) routeFromHash();
    render();
  }catch(error){
    state.status='error';state.error=String(error?.message||error||'Love Travel');render();
  }
}

window.addEventListener('hashchange',()=>{routeFromHash();state.detailTab='overview';render();});
document.documentElement.lang=state.locale;
routeFromHash();
loadTours({preserveRoute:true});
