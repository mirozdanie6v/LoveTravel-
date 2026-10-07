import {
  normalizeTourDomain,
  plainText as modelPlainText,
  money as modelMoney,
  quoteFor as modelQuoteFor,
  rateAvailable as modelRateAvailable,
  priceFor as modelPriceFor,
  ratesForSlot as modelRatesForSlot,
  rateDescription as modelRateDescription,
  participantPriceLines as modelParticipantPriceLines,
  cancellationLines as modelCancellationLines,
  pickupLines as modelPickupLines,
  customerInfoSections as modelCustomerInfoSections,
} from './client-v2-model.js';

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
  datePickerOpenByTour:new Map(),
  localeRequestId:0,
  error:'',
};

const PRODUCT_IDS=new Set(['1287578','1287580']);
const OFFICIAL_LOGO='/brand-logo';

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
    allTours:'Все экскурсии',overview:'Обзор',program:'Программа',included:'Включено',photosTab:'Фото',
    about:'ОБ ЭКСКУРСИИ',duration:'Длительность',meeting:'Место встречи',important:'ВАЖНО ЗНАТЬ',requirementsLabel:'Требования',attentionLabel:'Обратите внимание',knowBefore:'Перед поездкой',notIncluded:'Не включено',languagesLabel:'Языки',minAgeLabel:'Мин. возраст',cancellationLabel:'Условия отмены',pickupLabel:'Трансфер',pickupAvailable:'Трансфер доступен',pickupCustom:'Точку трансфера можно указать при бронировании',cancelLessThan:'При отмене менее чем за',cancelRetention:'удержание',accessibilityLabel:'Доступность',ticketLabel:'Информация по билету',
    route:'МАРШРУТ',dayProgram:'Программа дня',inPrice:'В СТОИМОСТИ',includedTitle:'Что включено',
    options:'Варианты тура',optionsHint:'Выберите формат программы',selected:'Выбрано',select:'Выбрать',
    dates:'Выберите выезд',datesHint:'Выберите дату и время из доступных выездов',places:'мест',unlimited:'места есть',soldOut:'нет мест',
    chooseDate:'Выбрать дату',chooseOption:'Выбрать вариант',continue:'Продолжить',dateNotSelected:'Выберите дату',optionsLocked:'Сначала выберите дату',tourPhotoFallback:'Фото экскурсии',optionDetails:'Информация о варианте',
    navHome:'Главная',navCatalog:'Каталог',navTrips:'Мои поездки',navAi:'ИИ‑Помощник',
    catalogTitle:'Все экскурсии',catalogLead:'Две актуальные программы Love Travel в Нячанге.',
    aiTitle:'ИИ‑консультант',aiLead:'Поможет сравнить экскурсии, подобрать вариант и затем перейти к бронированию.',
    aiHello:'Расскажите, какой отдых вам нужен — море, острова, спокойный день или активная программа.',
    aiPlaceholder:'Напишите сообщение…',aiSoon:'AI будет подключён на следующем функциональном слое.',bookingSoon:'Оформление бронирования подключается следующим слоем.',
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
    allTours:'Tất cả tour',overview:'Tổng quan',program:'Lịch trình',included:'Bao gồm',photosTab:'Ảnh',
    about:'VỀ TOUR',duration:'Thời lượng',meeting:'Điểm hẹn',important:'THÔNG TIN QUAN TRỌNG',requirementsLabel:'Yêu cầu',attentionLabel:'Lưu ý',knowBefore:'Trước chuyến đi',notIncluded:'Không bao gồm',languagesLabel:'Ngôn ngữ',minAgeLabel:'Tuổi tối thiểu',cancellationLabel:'Điều kiện huỷ',pickupLabel:'Đưa đón',pickupAvailable:'Có dịch vụ đưa đón',pickupCustom:'Có thể nhập điểm đón khi đặt tour',cancelLessThan:'Nếu huỷ trong vòng',cancelRetention:'phí giữ lại',accessibilityLabel:'Khả năng tiếp cận',ticketLabel:'Thông tin vé',
    route:'LỊCH TRÌNH',dayProgram:'Chương trình trong ngày',inPrice:'TRONG GIÁ',includedTitle:'Bao gồm',
    options:'Các lựa chọn tour',optionsHint:'Chọn hình thức chương trình',selected:'Đã chọn',select:'Chọn',
    dates:'Chọn chuyến khởi hành',datesHint:'Chọn ngày và giờ còn chỗ',places:'chỗ',unlimited:'còn chỗ',soldOut:'hết chỗ',
    chooseDate:'Chọn ngày',chooseOption:'Chọn phương án',continue:'Tiếp tục',dateNotSelected:'Chọn ngày',optionsLocked:'Hãy chọn ngày trước',tourPhotoFallback:'Ảnh của tour',optionDetails:'Thông tin phương án',
    navHome:'Trang chủ',navCatalog:'Tour',navTrips:'Chuyến đi',navAi:'Trợ lý AI',
    catalogTitle:'Tất cả tour',catalogLead:'Hai chương trình Love Travel đang hoạt động tại Nha Trang.',
    aiTitle:'Trợ lý AI',aiLead:'Giúp so sánh tour, chọn phương án và sau đó chuyển sang đặt tour.',
    aiHello:'Hãy cho tôi biết bạn muốn biển, đảo, thư giãn hay một ngày năng động.',
    aiPlaceholder:'Nhập tin nhắn…',aiSoon:'AI sẽ được kết nối ở lớp chức năng tiếp theo.',bookingSoon:'Bước đặt tour sẽ được kết nối ở lớp chức năng tiếp theo.',
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
    allTours:'All tours',overview:'Overview',program:'Program',included:'Included',photosTab:'Photos',
    about:'ABOUT THE TOUR',duration:'Duration',meeting:'Meeting point',important:'IMPORTANT',requirementsLabel:'Requirements',attentionLabel:'Please note',knowBefore:'Before you go',notIncluded:'Not included',languagesLabel:'Languages',minAgeLabel:'Min. age',cancellationLabel:'Cancellation',pickupLabel:'Pickup',pickupAvailable:'Pickup is available',pickupCustom:'Pickup point can be entered during booking',cancelLessThan:'If cancelled less than',cancelRetention:'retained charge',accessibilityLabel:'Accessibility',ticketLabel:'Ticket information',
    route:'ROUTE',dayProgram:'Day program',inPrice:'INCLUDED',includedTitle:'What is included',
    options:'Tour options',optionsHint:'Choose a program format',selected:'Selected',select:'Select',
    dates:'Choose a departure',datesHint:'Choose an available date and time',places:'places',unlimited:'available',soldOut:'sold out',
    chooseDate:'Choose date',chooseOption:'Choose option',continue:'Continue',dateNotSelected:'Choose a date',optionsLocked:'Choose a date first',tourPhotoFallback:'Tour photo',optionDetails:'Option details',
    navHome:'Home',navCatalog:'Tours',navTrips:'My trips',navAi:'AI Assistant',
    catalogTitle:'All tours',catalogLead:'Two current Love Travel experiences in Nha Trang.',
    aiTitle:'AI consultant',aiLead:'Helps compare tours, choose an option and then move to booking.',
    aiHello:'Tell me what kind of day you want — sea, islands, relaxed or active.',
    aiPlaceholder:'Type a message…',aiSoon:'AI will be connected in the next functional layer.',bookingSoon:'Booking checkout will be connected in the next functional layer.',
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
    allTours:'全部行程',overview:'概览',program:'行程安排',included:'包含',photosTab:'照片',
    about:'关于行程',duration:'时长',meeting:'集合点',important:'重要信息',requirementsLabel:'要求',attentionLabel:'请注意',knowBefore:'出发前须知',notIncluded:'不包含',languagesLabel:'语言',minAgeLabel:'最低年龄',cancellationLabel:'取消政策',pickupLabel:'接送',pickupAvailable:'提供接送服务',pickupCustom:'预订时可填写接送地点',cancelLessThan:'如在少于',cancelRetention:'扣除',accessibilityLabel:'无障碍信息',ticketLabel:'票务信息',
    route:'路线',dayProgram:'当日行程',inPrice:'费用包含',includedTitle:'包含内容',
    options:'行程选项',optionsHint:'选择行程形式',selected:'已选择',select:'选择',
    dates:'选择出发日期',datesHint:'选择可订日期和时间',places:'个名额',unlimited:'可订',soldOut:'售罄',
    chooseDate:'选择日期',chooseOption:'选择方案',continue:'继续',dateNotSelected:'请选择日期',optionsLocked:'请先选择日期',tourPhotoFallback:'行程照片',optionDetails:'方案详情',
    navHome:'首页',navCatalog:'行程',navTrips:'我的行程',navAi:'AI 助手',
    catalogTitle:'全部行程',catalogLead:'Love Travel 在芽庄的两条实时线路。',
    aiTitle:'AI 顾问',aiLead:'帮助比较行程、选择方案，然后进入预订。',
    aiHello:'告诉我您想要海岛、轻松还是更活跃的一天。',
    aiPlaceholder:'输入消息…',aiSoon:'AI 将在下一功能层接入。',bookingSoon:'预订流程将在下一功能层接入。',
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
    allTours:'모든 투어',overview:'개요',program:'일정',included:'포함 사항',photosTab:'사진',
    about:'투어 소개',duration:'소요 시간',meeting:'미팅 포인트',important:'중요 정보',requirementsLabel:'요구 사항',attentionLabel:'주의 사항',knowBefore:'출발 전 안내',notIncluded:'불포함',languagesLabel:'언어',minAgeLabel:'최소 연령',cancellationLabel:'취소 정책',pickupLabel:'픽업',pickupAvailable:'픽업 서비스 이용 가능',pickupCustom:'예약 시 픽업 장소를 입력할 수 있습니다',cancelLessThan:'출발',cancelRetention:'공제',accessibilityLabel:'접근성',ticketLabel:'티켓 안내',
    route:'일정',dayProgram:'하루 프로그램',inPrice:'포함 사항',includedTitle:'포함 내용',
    options:'투어 옵션',optionsHint:'프로그램 형식을 선택하세요',selected:'선택됨',select:'선택',
    dates:'출발 일정 선택',datesHint:'예약 가능한 날짜와 시간을 선택하세요',places:'자리',unlimited:'예약 가능',soldOut:'매진',
    chooseDate:'날짜 선택',chooseOption:'옵션 선택',continue:'계속',dateNotSelected:'날짜를 선택하세요',optionsLocked:'먼저 날짜를 선택하세요',tourPhotoFallback:'투어 사진',optionDetails:'옵션 상세',
    navHome:'홈',navCatalog:'투어',navTrips:'내 여행',navAi:'AI 도우미',
    catalogTitle:'모든 투어',catalogLead:'나트랑 Love Travel의 두 가지 현재 프로그램입니다.',
    aiTitle:'AI 컨설턴트',aiLead:'투어를 비교하고 옵션을 고른 뒤 예약으로 이어집니다.',
    aiHello:'바다, 섬, 여유로운 일정 또는 활동적인 하루 중 원하는 스타일을 알려주세요.',
    aiPlaceholder:'메시지를 입력하세요…',aiSoon:'AI는 다음 기능 단계에서 연결됩니다.',bookingSoon:'예약 단계는 다음 기능 단계에서 연결됩니다.',
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

function plainText(value){ return modelPlainText(value); }

function photoUrls(domain){
  return [...new Set(arr(domain?.experience?.media?.photos)
    .map(item=>String(item?.url||item?.cleanUrl||item?.originalUrl||'').trim()).filter(Boolean))];
}

function photoUrlsFromMedia(media){
  return [...new Set(arr(media?.photos)
    .map(item=>String(item?.url||item?.cleanUrl||item?.originalUrl||'').trim()).filter(Boolean))];
}

function rawPhotoUrl(photo){
  if(typeof photo==='string') return photo.trim();
  const derived=arr(photo?.derived);
  return String(
    derived.find(item=>item?.name==='large')?.cleanUrl
      ||derived.find(item=>item?.name==='large')?.url
      ||derived.find(item=>item?.name==='preview')?.cleanUrl
      ||derived.find(item=>item?.name==='preview')?.url
      ||photo?.cleanUrl||photo?.url||photo?.originalUrl||''
  ).trim();
}

function providerPhotoUrls(entity){
  const media=entity?.media&&typeof entity.media==='object'?entity.media:{};
  const values=[
    entity?.keyPhoto,entity?.photo,entity?.image,
    ...arr(entity?.photos),...arr(entity?.images),
    ...arr(media?.photos),...arr(media?.images),
  ].filter(Boolean);
  return [...new Set(values.map(rawPhotoUrl).filter(Boolean))];
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

function money(value){ return modelMoney(value); }

function quoteFor(slot,rateId){ return modelQuoteFor(slot,rateId); }

function rateAvailable(slot,rateId){ return modelRateAvailable(slot,rateId); }

function firstAdult(tour){
  return arr(tour.participants).find(item=>String(item?.ticketCategory||'').toUpperCase()==='ADULT')||arr(tour.participants)[0]||null;
}

function priceFor(tour,slot,rateId){ return modelPriceFor(tour,slot,rateId); }

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

function guidanceLanguages(experience){
  const direct=arr(experience?.languages?.raw).map(item=>plainText(item?.name||item?.title||item)).filter(Boolean);
  const guided=arr(experience?.languages?.guidanceTypes).flatMap(item=>arr(item?.displayLanguages).map(plainText)).filter(Boolean);
  return [...new Set([...direct,...guided])];
}

function normalizeTour(domain){
  return normalizeTourDomain(domain,{
    locale:state.locale,
    labels:t(),
    formatDate:iso=>formatDate(iso),
  });
}

function brand(){
  return '<button class="brand" type="button" data-app-tab="home" aria-label="Nha Trang Love Travel">'
    +'<span class="brand-logo-wrap"><img class="brand-logo" src="'+esc(OFFICIAL_LOGO)+'" alt="Nha Trang Love Travel" decoding="async" fetchpriority="low"></span>'
    +'<span class="brand-fallback"><strong>LOVE TRAVEL</strong><small>NHA TRANG</small></span>'
    +'</button>';
}

function languageSwitcher(){
  const labels={ru:'RU',vi:'VI',en:'EN',zh:'中文',ko:'KO'};
  return '<div class="language-control" data-testid="language-control">'
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
  const hero=/data-detail-hero-image/.test(extra);
  return photo
    ? '<img '+extra+' src="'+esc(photo)+'" alt="'+esc(title)+'" loading="'+(hero?'eager':'lazy')+'" '+(hero?'fetchpriority="high" ':'')+'referrerpolicy="no-referrer">'
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
    +'<section class="assistant-shell" data-testid="ai-assistant-shell"><div class="assistant-orb">✦</div><span class="app-eyebrow">LOVE TRAVEL AI</span><h1>'+esc(t().aiTitle)+'</h1><p>'+esc(t().aiLead)+'</p>'
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
  const slots=arr(tour.availabilitySlots);
  const stored=state.visualChoiceByTour.get(tour.id)||{};
  const slot=slots.find(item=>String(item.id)===String(stored.slotId))||null;
  const availableRates=slot?ratesForSlot(tour,slot):[];
  const rateId=availableRates.some(rate=>String(rate.id)===String(stored.rateId))?stored.rateId:null;
  const choice={slotId:slot?.id||null,rateId};
  state.visualChoiceByTour.set(tour.id,choice);
  return choice;
}

function datePickerOpen(tour){
  return Boolean(state.datePickerOpenByTour.get(tour.id));
}

function selectedDateText(tour){
  const slot=selectedSlotForTour(tour);
  return slot?[formatDate(slot.date),slot.startTime].filter(Boolean).join(' · '):t().dateNotSelected;
}

function mergeRateLists(...lists){
  const seen=new Set();
  return lists.flatMap(arr).filter(item=>{
    const key=[item?.id,item?.title,item?.description,item?.code].map(value=>String(value??'')).join('|');
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rateForSlot(tour,slot,rateId){
  const base=arr(tour.rates).find(rate=>String(rate?.id)===String(rateId))||{};
  const live=arr(slot?.rates).find(rate=>String(rate?.id)===String(rateId))||{};
  const livePhotos=[
    ...photoUrlsFromMedia(live?.media),
    ...providerPhotoUrls(live?.providerData||{}),
  ];
  return {
    ...base,
    ...live,
    id:live?.id??base?.id??rateId,
    title:plainText(live?.title)||plainText(base?.title),
    description:plainText(live?.description)||plainText(base?.description),
    details:mergeRateLists(base?.details,live?.details),
    textItems:mergeRateLists(base?.textItems,live?.textItems),
    optionPhotos:[...new Set([...arr(base?.optionPhotos),...livePhotos])],
  };
}

function ratesForSlot(tour,slot){ return modelRatesForSlot(tour,slot); }

function rateDescription(rate){ return modelRateDescription(rate); }

function participantPriceLines(tour,slot,rateId){
  return modelParticipantPriceLines(tour,slot,rateId);
}

function optionsMarkup(tour){
  const choice=visualChoice(tour);
  const slot=selectedSlotForTour(tour);
  if(!slot){
    return '<section class="selection-section selection-section--rates is-locked" data-testid="tour-options" aria-labelledby="tour-options-title">'
      +'<div class="selection-head"><div><span id="tour-options-title">'+esc(t().options)+'</span><p>'+esc(t().optionsHint)+'</p></div></div>'
      +'<div class="selection-locked"><span>2</span><p>'+esc(t().optionsLocked)+'</p></div></section>';
  }
  const rates=ratesForSlot(tour,slot);
  if(!rates.length) return '';
  return '<section class="selection-section selection-section--rates" data-testid="tour-options" aria-labelledby="tour-options-title"><div class="selection-head"><div><span id="tour-options-title">'+esc(t().options)+'</span><p>'+esc(t().optionsHint)+'</p></div></div>'
    +'<div class="rate-options">'+rates.map((rate,index)=>{
      const active=String(rate.id)===String(choice.rateId);
      const price=money(priceFor(tour,slot,rate.id));
      const description=rateDescription(rate);
      const ownPhotos=arr(rate.optionPhotos);
      const fallbackPhoto=!ownPhotos.length&&tour.photos.length?tour.photos[index%tour.photos.length]:'';
      const photo=ownPhotos[0]||fallbackPhoto;
      const fallback=Boolean(photo&&!ownPhotos[0]);
      const priceLines=participantPriceLines(tour,slot,rate.id);
      const title=plainText(rate.title||rate.code||rate.id);
      return '<article class="rate-card '+(active?'is-active':'')+'">'
        +'<button type="button" class="rate-option" data-preview-rate="'+esc(rate.id)+'" aria-expanded="'+(active?'true':'false')+'">'
        +(photo?'<span class="rate-photo">'+media(photo,title||tour.title)+(fallback?'<em>'+esc(t().tourPhotoFallback)+'</em>':'')+'</span>':'')
        +'<span class="rate-summary"><span class="rate-marker">'+(active?'✓':String(index+1))+'</span><span class="rate-summary__copy"><b>'+esc(title)+'</b><small>'+esc(t().optionDetails)+'</small></span>'
        +(price?'<strong>'+esc(price)+'</strong>':'')+'<span class="rate-chevron">⌄</span></span></button>'
        +(active?'<div class="rate-expanded" data-rate-expanded="'+esc(rate.id)+'">'
          +(description?'<p class="rate-description">'+esc(description)+'</p>':'')
          +(priceLines.length?'<div class="rate-price-lines">'+priceLines.map(line=>'<small>'+esc(line)+'</small>').join('')+'</div>':'')
          +'<span class="rate-action">'+esc(t().selected)+'</span></div>':'')
        +'</article>';
    }).join('')+'</div></section>';
}

function datesMarkup(tour){
  const choice=visualChoice(tour);
  const slots=arr(tour.availabilitySlots).slice(0,14);
  if(!slots.length) return '';
  const open=datePickerOpen(tour);
  const selected=selectedSlotForTour(tour);
  return '<section class="selection-section selection-section--dates" data-testid="departure-calendar" aria-labelledby="departure-calendar-title">'
    +'<div class="selection-head selection-head--compact"><div><span id="departure-calendar-title">'+esc(t().dates)+'</span><p>'+esc(t().datesHint)+'</p></div></div>'
    +'<button type="button" class="date-picker-trigger '+(selected?'has-value':'')+'" data-date-picker-trigger aria-expanded="'+(open?'true':'false')+'" aria-controls="departure-list-'+esc(tour.id)+'">'
    +'<span class="date-picker-trigger__icon">◷</span><span class="date-picker-trigger__copy"><small>'+esc(selected?t().selected:t().chooseDate)+'</small><strong>'+esc(selectedDateText(tour))+'</strong></span>'
    +'<span class="date-picker-trigger__chevron">'+(open?'⌃':'⌄')+'</span></button>'
    +(open?'<div class="departure-calendar" id="departure-list-'+esc(tour.id)+'">'+slots.map(slot=>{
      const active=String(slot.id)===String(choice.slotId);
      const unavailable=Boolean(slot.soldOut||slot.unavailable||(!slot.unlimitedAvailability&&Number(slot.availabilityCount)<=0));
      const count=Number(slot.availabilityCount);
      const availability=slot.unlimitedAvailability?t().unlimited:unavailable?t().soldOut:(Number.isFinite(count)?Math.max(0,count)+' '+t().places:t().unlimited);
      const availableRates=ratesForSlot(tour,slot);
      const minPrice=availableRates.map(rate=>money(priceFor(tour,slot,rate.id))).find(Boolean)||'';
      return '<button type="button" class="departure-day '+(active?'is-active ':'')+(unavailable?'is-disabled':'')+'" data-preview-slot="'+esc(slot.id)+'" '+(unavailable?'disabled':'')+'>'
        +'<span class="departure-weekday">'+esc(formatDate(slot.date,true))+'</span>'
        +'<strong>'+esc(String(slot.date||'').slice(8,10))+'</strong>'
        +'<span class="departure-time">'+esc(slot.startTime||'')+'</span>'
        +'<small>'+esc(availability)+'</small>'
        +(minPrice?'<b>'+esc(minPrice)+'</b>':'')+'</button>';
    }).join('')+'</div>':'')+'</section>';
}

function infoBlock(section){
  const list=arr(section?.items).filter(Boolean);
  if(!list.length) return '';
  const id=String(section?.id||'info').replace(/[^a-z0-9-]/gi,'-').toLowerCase();
  const headingId='tour-'+id+'-title';
  return '<section class="info-block" data-testid="tour-'+esc(id)+'" aria-labelledby="'+esc(headingId)+'">'
    +'<h3 id="'+esc(headingId)+'">'+esc(section?.title||'')+'</h3>'
    +'<ul>'+list.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></section>';
}

function cancellationRulePercent(rule){
  const direct=Number(rule?.percentage);
  if(Number.isFinite(direct)) return direct;
  const charge=Number(rule?.charge);
  if(Number.isFinite(charge)&&/percent/i.test(String(rule?.chargeType||''))) return charge;
  return null;
}

function cancellationLines(policy){
  return modelCancellationLines(policy,{locale:state.locale,labels:t()});
}

function pickupLines(tour){
  return modelPickupLines(tour,{labels:t()});
}

function overviewPanel(tour){
  const facts=[
    [t().duration,tour.duration||'—'],
    [t().meeting,tour.meeting||'—'],
    ...(tour.languages.length?[[t().languagesLabel,tour.languages.join(', ')]]:[]),
    ...(tour.minAge!==null?[[t().minAgeLabel,String(tour.minAge)+'+']]:[]),
  ];
  const sections=modelCustomerInfoSections(tour,{locale:state.locale,labels:t()});
  const important=sections.map(infoBlock).filter(Boolean).join('');
  return '<div class="tab-panel tab-panel--overview" data-testid="tour-overview">'
    +'<article class="content-card content-card--intro" data-testid="tour-about"><span class="content-kicker">'+esc(t().about)+'</span><h2>'+esc(tourThemeLabel(tour))+'</h2><p>'+esc(tour.description||'')+'</p></article>'
    +'<dl class="fact-grid" data-testid="tour-facts">'+facts.map(([label,value])=>'<div class="fact-card"><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>'
    +(important?'<article class="content-card" data-testid="tour-important"><span class="content-kicker">'+esc(t().important)+'</span><div class="info-grid">'+important+'</div></article>':'')
    +'</div>';
}

function itineraryPanel(tour){
  const itinerary=(tour.itinerary.length?tour.itinerary:[{title:t().dayProgram,body:''}])
    .slice(0,10).map((stop,index)=>'<div class="timeline-stop"><span class="timeline-index">'+(index+1)+'</span><div><h3>'+esc(stop.title)+'</h3><p>'+esc(stop.body)+'</p></div></div>').join('');
  return '<article class="content-card" data-testid="tour-program"><span class="content-kicker">'+esc(t().route)+'</span><h2>'+esc(t().dayProgram)+'</h2><div class="timeline">'+itinerary+'</div></article>';
}

function includedPanel(tour){
  const included=(tour.included.length?tour.included:['—']).slice(0,20).map(item=>'<li>'+esc(item)+'</li>').join('');
  const excluded=tour.excluded.slice(0,20).map(item=>'<li>'+esc(item)+'</li>').join('');
  return '<div class="tab-panel" data-testid="tour-included"><article class="content-card"><span class="content-kicker">'+esc(t().inPrice)+'</span><h2>'+esc(t().includedTitle)+'</h2><ul class="included-list">'+included+'</ul></article>'
    +(excluded?'<article class="content-card content-card--excluded"><span class="content-kicker">'+esc(t().notIncluded)+'</span><h2>'+esc(t().notIncluded)+'</h2><ul class="excluded-list">'+excluded+'</ul></article>':'')
    +'</div>';
}

function photosPanel(tour){
  if(!tour.photos.length) return '<article class="content-card"><p class="empty-copy">—</p></article>';
  return '<article class="content-card" data-testid="tour-photos"><span class="content-kicker">'+esc(t().photosTab)+'</span><h2>'+esc(t().photosTab)+'</h2><div class="photo-grid">'
    +tour.photos.map((photo,index)=>'<button class="photo-thumb" type="button" data-photo-index="'+index+'">'+media(photo,tour.title)+'</button>').join('')
    +'</div></article>';
}

function detailPanel(tour){
  if(state.detailTab==='itinerary') return itineraryPanel(tour);
  if(state.detailTab==='included') return includedPanel(tour);
  if(state.detailTab==='photos') return photosPanel(tour);
  return overviewPanel(tour);
}

function selectedSlotForTour(tour){
  const choice=visualChoice(tour);
  return arr(tour.availabilitySlots).find(slot=>String(slot.id)===String(choice.slotId))||null;
}

function selectedPrice(tour){
  const choice=visualChoice(tour);
  const slot=selectedSlotForTour(tour);
  if(!slot) return tour.price;
  if(choice.rateId) return money(priceFor(tour,slot,choice.rateId));
  return ratesForSlot(tour,slot).map(rate=>money(priceFor(tour,slot,rate.id))).find(Boolean)||tour.price;
}

function detailView(tour){
  const selectedSlot=selectedSlotForTour(tour);
  const currentPrice=selectedPrice(tour)||tour.price||'—';
  const meta=[tour.city,tour.duration,tour.category].filter(Boolean).map(value=>'<span class="hero-chip">'+esc(value)+'</span>').join('');
  const tabs=[['overview',t().overview],['itinerary',t().program],['included',t().included],['photos',t().photosTab]];
  return '<main class="page tour-page">'+topbar('topbar--detail')
    +'<section class="detail-hero">'+galleryMarkup(tour)
    +'<div class="detail-hero__content"><div class="detail-meta">'+meta+'</div><h1>'+esc(tour.title)+'</h1><p class="detail-lead">'+esc(tour.description||'')+'</p>'
    +'<div class="detail-purchase"><div><small>'+esc(t().from)+'</small><strong data-selected-price>'+esc(currentPrice)+'</strong></div><div><small>'+esc(t().nearest)+'</small><b data-selected-date>'+esc(selectedSlot?[formatDate(selectedSlot.date),selectedSlot.startTime].filter(Boolean).join(' · '):slotText(tour))+'</b></div></div>'
    +'</div></section>'
    +'<div class="selection-flow" data-selection-flow>'+datesMarkup(tour)+optionsMarkup(tour)+'</div>'
    +'<nav class="tour-tabs" data-testid="tour-tabs" aria-label="'+esc(t().overview)+'">'+tabs.map(([id,label])=>'<button type="button" class="tour-tab '+(state.detailTab===id?'is-active':'')+'" data-tab="'+id+'">'+esc(label)+'</button>').join('')+'</nav>'
    +'<section class="tour-content" id="tour-content" data-testid="tour-content" aria-live="polite">'+detailPanel(tour)+'</section>'
    +'<div class="mobile-booking-bar mobile-booking-bar--with-nav"><div><small>'+esc(t().from)+'</small><strong data-selected-price>'+esc(currentPrice)+'</strong></div>'
    +'<button type="button" data-visual-booking>'+esc(!selectedSlot?t().chooseDate:(visualChoice(tour).rateId?t().continue:t().chooseOption))+'</button></div></main>';
}

function refreshDetailSelection(tour){
  const flow=app.querySelector('[data-selection-flow]');
  if(flow) flow.innerHTML=datesMarkup(tour)+optionsMarkup(tour);
  const slot=selectedSlotForTour(tour);
  const price=selectedPrice(tour)||tour.price||'—';
  app.querySelectorAll('[data-selected-price]').forEach(node=>node.textContent=price);
  app.querySelectorAll('[data-selected-date]').forEach(node=>node.textContent=slot?[formatDate(slot.date),slot.startTime].filter(Boolean).join(' · '):slotText(tour));
  bindSelectionInteractions(tour);
}

function bindSelectionInteractions(tour){
  app.querySelector('[data-date-picker-trigger]')?.addEventListener('click',()=>{
    state.datePickerOpenByTour.set(tour.id,!datePickerOpen(tour));
    refreshDetailSelection(tour);
  });
  app.querySelectorAll('[data-preview-rate]').forEach(button=>{
    button.addEventListener('click',()=>{
      const choice=visualChoice(tour);
      state.visualChoiceByTour.set(tour.id,{...choice,rateId:button.dataset.previewRate});
      refreshDetailSelection(tour);
    });
  });
  app.querySelectorAll('[data-preview-slot]').forEach(button=>{
    button.addEventListener('click',()=>{
      const slotId=button.dataset.previewSlot;
      state.visualChoiceByTour.set(tour.id,{slotId,rateId:null});
      state.datePickerOpenByTour.set(tour.id,false);
      refreshDetailSelection(tour);
      app.querySelector('[data-testid="tour-options"]')?.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
  });
}

function bottomNav(){
  const tabs=[
    ['home','⌂',t().navHome],
    ['catalog','▦',t().navCatalog],
    ['trips','◇',t().navTrips],
    ['assistant','✦',t().navAi],
  ];
  const active=state.selectedTourId?'catalog':state.appTab;
  return '<nav class="bottom-nav" data-testid="bottom-nav" aria-label="Mini app navigation">'+tabs.map(([id,icon,label])=>'<button type="button" class="bottom-nav__item '+(active===id?'is-active':'')+'" data-app-tab="'+id+'"><span>'+icon+'</span><b>'+esc(label)+'</b></button>').join('')+'</nav>';
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
      const previousLocale=state.locale;
      const routeAtRequest=location.hash;
      const requestId=++state.localeRequestId;
      state.locale=locale; state.languageOpen=false; localStorage.setItem(LOCALE_STORAGE_KEY,locale);
      document.documentElement.lang=locale;
      render();
      const ok=await loadTours({preserveRoute:true,silent:true,renderOnSuccess:false});
      if(requestId!==state.localeRequestId) return;
      if(!ok){
        state.locale=previousLocale;
        localStorage.setItem(LOCALE_STORAGE_KEY,previousLocale);
        document.documentElement.lang=previousLocale;
        if(location.hash===routeAtRequest) render();
        return;
      }
      if(location.hash===routeAtRequest) render();
    });
  });

  app.querySelector('[data-scroll-info]')?.addEventListener('click',()=>app.querySelector('[data-info-anchor]')?.scrollIntoView({behavior:'smooth',block:'center'}));

  app.querySelectorAll('[data-tab]').forEach(button=>{
    button.addEventListener('click',()=>{
      state.detailTab=button.dataset.tab||'overview';
      app.querySelectorAll('[data-tab]').forEach(tab=>tab.classList.toggle('is-active',tab.dataset.tab===state.detailTab));
      const panel=app.querySelector('#tour-content');
      if(panel) panel.innerHTML=detailPanel(state.tours.find(item=>item.id===state.selectedTourId));
      bindPhotoGrid();
      panel?.scrollIntoView({behavior:'auto',block:'start'});
    });
  });

  const tour=state.tours.find(item=>item.id===state.selectedTourId);
  if(tour){
    const setGalleryIndex=index=>{
      const count=tour.photos.length;if(!count)return;
      const next=(index+count)%count;
      state.galleryIndexByTour.set(tour.id,next);
      const image=app.querySelector('[data-detail-hero-image]');
      if(image) image.src=tour.photos[next];
      const countNode=app.querySelector('.photo-count');
      if(countNode) countNode.textContent=(next+1)+' / '+count;
    };
    const moveGallery=delta=>setGalleryIndex(Number(state.galleryIndexByTour.get(tour.id)||0)+delta);
    app.querySelector('[data-gallery-prev]')?.addEventListener('click',()=>moveGallery(-1));
    app.querySelector('[data-gallery-next]')?.addEventListener('click',()=>moveGallery(1));
    bindSelectionInteractions(tour);
    window.__loveTravelSetGalleryIndex=setGalleryIndex;
    bindPhotoGrid();
  }

  app.querySelectorAll('[data-visual-booking]').forEach(button=>button.addEventListener('click',()=>{
    const activeTour=state.tours.find(item=>item.id===state.selectedTourId);
    if(!activeTour) return;
    const choice=visualChoice(activeTour);
    if(!choice.slotId){
      state.datePickerOpenByTour.set(activeTour.id,true);
      refreshDetailSelection(activeTour);
      app.querySelector('[data-date-picker-trigger]')?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    if(!choice.rateId){
      app.querySelector('[data-testid="tour-options"]')?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    showStageNotice(t().bookingSoon);
  }));
  app.querySelectorAll('[data-ai-preview]').forEach(button=>button.addEventListener('click',()=>showStageNotice(t().aiSoon)));

  const logo=app.querySelector('.brand-logo');
  if(logo) logo.addEventListener('error',()=>app.querySelector('.brand')?.classList.add('is-fallback'),{once:true});
}

function bindPhotoGrid(){
  app.querySelectorAll('[data-photo-index]').forEach(button=>{
    button.addEventListener('click',()=>{
      const index=Number(button.dataset.photoIndex||0);
      window.__loveTravelSetGalleryIndex?.(index);
      app.querySelector('.detail-photo')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
  });
}

function render(){
  window.__loveTravelRenderCount=(window.__loveTravelRenderCount||0)+1;
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

async function loadTours({preserveRoute=false,silent=false,renderOnSuccess=true}={}){
  if(!silent){
    state.status='loading';
    state.error='';
    render();
  }
  try{
    const response=await fetch('/api/tours?locale='+encodeURIComponent(state.locale),{headers:{accept:'application/json'}});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.ok||!Array.isArray(payload.domains)) throw new Error(payload?.error||'Love Travel');
    const tours=payload.domains.map(normalizeTour).filter(tour=>PRODUCT_IDS.has(tour.id));
    if(tours.length!==2||new Set(tours.map(tour=>tour.id)).size!==2) throw new Error('Love Travel');
    state.tours=tours;
    state.status='ready';
    state.error='';
    if(!preserveRoute) routeFromHash();
    if(renderOnSuccess) render();
    return true;
  }catch(error){
    if(silent) return false;
    state.status='error';
    state.error=String(error?.message||error||'Love Travel');
    render();
    return false;
  }
}

window.addEventListener('hashchange',()=>{routeFromHash();state.detailTab='overview';render();});
document.documentElement.lang=state.locale;
routeFromHash();
loadTours({preserveRoute:true});
