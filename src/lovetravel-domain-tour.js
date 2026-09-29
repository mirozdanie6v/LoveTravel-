(() => {
  'use strict';

  const PRODUCT_IDS = new Set(['1287578','1287580']);
  let domainPromise = null;
  let currentProductId = null;
  const selectionByProduct = new Map();

  const copy = {
    ru:{
      back:'Назад к экскурсиям',
      live:'Данные из системы туроператора',
      duration:'Длительность',
      languages:'Языки',
      description:'Об экскурсии',
      option:'Вариант экскурсии',
      optionHint:'Цена и доступность зависят от выбранного варианта.',
      from:'от',
      availableDates:'Доступные даты',
      available:'мест доступно',
      unlimited:'места доступны',
      soldOut:'Нет мест',
      select:'Выбрать',
      selected:'Выбрано',
      participants:'Цены по участникам',
      meeting:'Место встречи',
      pickup:'Трансфер',
      pickupOptional:'по выбору',
      pickupRequired:'обязательный',
      pickupUnavailable:'не предусмотрен',
      includedInPrice:'включён в цену',
      itinerary:'Информация о программе',
      itineraryHint:'Пункты ниже переданы в описании продукта. Вариант экскурсии выбирается отдельно выше.',
      included:'Включено',
      excluded:'Не включено',
      conditions:'Условия отмены',
      within:'Менее чем за',
      hours:'ч',
      fee:'удержание',
      earlier:'При более ранней отмене',
      noFee:'без удержания',
      extras:'Дополнительные услуги',
      bookingInfo:'Данные для бронирования',
      questions:'Дополнительные вопросы',
      customerFields:'Контактные данные',
      passengerFields:'Данные пассажиров',
      requirements:'Важно знать',
      accessibility:'Доступность', confirmation:'Подтверждение', onRequest:'После подтверждения туроператором', video:'Видео', difficulty:'Сложность', minAge:'Минимальный возраст', reviews:'Отзывы', passport:'Требуется паспорт', currencies:'Валюты оплаты', offers:'Предложения', pickupTiming:'Время подачи', minutesBefore:'мин до начала',
      priceFor:'Цена для выбранной даты',
      chooseDate:'Выберите дату',
      loading:'Загружаем актуальные данные…',
      loadError:'Не удалось загрузить данные экскурсии. Попробуйте ещё раз.',
      retry:'Повторить',
      adult:'Взрослый',
      child:'Ребёнок',
      infant:'Младенец',
      rateUnavailable:'Нет доступных дат для этого варианта'
    },
    en:{
      back:'Back to tours',
      live:'Live operator data',
      duration:'Duration',
      languages:'Languages',
      description:'About this tour',
      option:'Tour option',
      optionHint:'Price and availability depend on the selected option.',
      from:'from',
      availableDates:'Available dates',
      available:'spots available',
      unlimited:'availability open',
      soldOut:'Sold out',
      select:'Select',
      selected:'Selected',
      participants:'Participant prices',
      meeting:'Meeting point',
      pickup:'Pickup',
      pickupOptional:'optional',
      pickupRequired:'required',
      pickupUnavailable:'not available',
      includedInPrice:'included in price',
      itinerary:'Program information',
      itineraryHint:'These items come from the product description. Choose the tour option separately above.',
      included:'Included',
      excluded:'Excluded',
      conditions:'Cancellation policy',
      within:'Less than',
      hours:'h',
      fee:'charge',
      earlier:'Earlier cancellation',
      noFee:'no charge',
      extras:'Extras',
      bookingInfo:'Booking information',
      questions:'Additional questions',
      customerFields:'Contact details',
      passengerFields:'Passenger details',
      requirements:'Important information',
      accessibility:'Accessibility', confirmation:'Confirmation', onRequest:'After operator confirmation', video:'Video', difficulty:'Difficulty', minAge:'Minimum age', reviews:'Reviews', passport:'Passport required', currencies:'Payment currencies', offers:'Offers', pickupTiming:'Pickup timing', minutesBefore:'min before start',
      priceFor:'Price for selected date',
      chooseDate:'Choose a date',
      loading:'Loading current availability…',
      loadError:'Could not load the tour data. Please try again.',
      retry:'Retry',
      adult:'Adult',
      child:'Child',
      infant:'Infant',
      rateUnavailable:'No available dates for this option'
    },
    vi:{
      back:'Quay lại danh sách tour',
      live:'Dữ liệu trực tiếp từ hệ thống',
      duration:'Thời lượng',
      languages:'Ngôn ngữ',
      description:'Giới thiệu tour',
      option:'Lựa chọn tour',
      optionHint:'Giá và chỗ trống phụ thuộc vào lựa chọn.',
      from:'từ',
      availableDates:'Ngày còn chỗ',
      available:'chỗ còn trống',
      unlimited:'còn chỗ',
      soldOut:'Hết chỗ',
      select:'Chọn',
      selected:'Đã chọn',
      participants:'Giá theo khách',
      meeting:'Điểm gặp',
      pickup:'Đón khách',
      pickupOptional:'tùy chọn',
      pickupRequired:'bắt buộc',
      pickupUnavailable:'không áp dụng',
      includedInPrice:'đã gồm trong giá',
      itinerary:'Thông tin chương trình',
      itineraryHint:'Các nội dung dưới đây đến từ mô tả sản phẩm. Lựa chọn tour được chọn riêng ở trên.',
      included:'Bao gồm',
      excluded:'Không bao gồm',
      conditions:'Chính sách hủy',
      within:'Dưới',
      hours:'giờ',
      fee:'phí',
      earlier:'Hủy sớm hơn',
      noFee:'không tính phí',
      extras:'Dịch vụ thêm',
      bookingInfo:'Thông tin đặt tour',
      questions:'Câu hỏi bổ sung',
      customerFields:'Thông tin liên hệ',
      passengerFields:'Thông tin hành khách',
      requirements:'Thông tin quan trọng',
      accessibility:'Khả năng tiếp cận', confirmation:'Xác nhận', onRequest:'Sau khi nhà điều hành xác nhận', video:'Video', difficulty:'Độ khó', minAge:'Tuổi tối thiểu', reviews:'Đánh giá', passport:'Cần hộ chiếu', currencies:'Tiền tệ thanh toán', offers:'Ưu đãi', pickupTiming:'Thời gian đón', minutesBefore:'phút trước giờ bắt đầu',
      priceFor:'Giá cho ngày đã chọn',
      chooseDate:'Chọn ngày',
      loading:'Đang tải dữ liệu mới nhất…',
      loadError:'Không thể tải dữ liệu tour. Vui lòng thử lại.',
      retry:'Thử lại',
      adult:'Người lớn',
      child:'Trẻ em',
      infant:'Em bé',
      rateUnavailable:'Không có ngày trống cho lựa chọn này'
    },
    ko:{
      back:'투어 목록으로',
      live:'운영사 실시간 데이터',
      duration:'소요 시간',
      languages:'언어',
      description:'투어 소개',
      option:'투어 옵션',
      optionHint:'선택한 옵션에 따라 가격과 예약 가능 여부가 달라집니다.',
      from:'최저',
      availableDates:'예약 가능 날짜',
      available:'자리 남음',
      unlimited:'예약 가능',
      soldOut:'매진',
      select:'선택',
      selected:'선택됨',
      participants:'인원별 가격',
      meeting:'미팅 포인트',
      pickup:'픽업',
      pickupOptional:'선택 가능',
      pickupRequired:'필수',
      pickupUnavailable:'제공되지 않음',
      includedInPrice:'가격에 포함',
      itinerary:'프로그램 정보',
      itineraryHint:'아래 내용은 상품 설명에 포함된 정보입니다. 투어 옵션은 위에서 별도로 선택합니다.',
      included:'포함 사항',
      excluded:'불포함 사항',
      conditions:'취소 정책',
      within:'이내',
      hours:'시간',
      fee:'수수료',
      earlier:'그보다 일찍 취소',
      noFee:'수수료 없음',
      extras:'추가 옵션',
      bookingInfo:'예약 정보',
      questions:'추가 질문',
      customerFields:'연락처 정보',
      passengerFields:'탑승객 정보',
      requirements:'중요 안내',
      accessibility:'접근성', confirmation:'확인', onRequest:'운영사 확인 후', video:'동영상', difficulty:'난이도', minAge:'최소 연령', reviews:'리뷰', passport:'여권 필요', currencies:'결제 통화', offers:'제공 옵션', pickupTiming:'픽업 시간', minutesBefore:'분 전',
      priceFor:'선택 날짜 가격',
      chooseDate:'날짜 선택',
      loading:'최신 정보를 불러오는 중…',
      loadError:'투어 정보를 불러오지 못했습니다. 다시 시도해 주세요.',
      retry:'다시 시도',
      adult:'성인',
      child:'아동',
      infant:'유아',
      rateUnavailable:'이 옵션에 예약 가능한 날짜가 없습니다'
    }
  };

  function locale() {
    const value=String(document.documentElement.lang || localStorage.getItem('max-tour-locale-v1') || 'ru').toLowerCase();
    return copy[value] ? value : 'ru';
  }
  function t(){ return copy[locale()]; }
  function arr(value){ return Array.isArray(value) ? value : []; }
  function esc(value){
    return String(value ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function textFromHtml(value){
    const doc=new DOMParser().parseFromString(String(value ?? ''),'text/html');
    return String(doc.body.textContent || '').replace(/\s+/g,' ').trim();
  }
  function listFromHtml(value){
    const html=String(value ?? '').replace(/<br\s*\/?>/gi,'\n').replace(/<\/li>/gi,'\n');
    const doc=new DOMParser().parseFromString(html,'text/html');
    return [...new Set(String(doc.body.textContent || '').split(/\n+/).map(v=>v.replace(/\s+/g,' ').trim()).filter(Boolean))];
  }
  function money(value){
    if(!value || !Number.isFinite(Number(value.amount))) return '';
    const amount=Number(value.amount);
    const rounded=Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(2)));
    return value.currency === 'USD' ? '$'+rounded : rounded+' '+String(value.currency || '');
  }
  function categoryLabel(item){
    const type=String(item?.ticketCategory || '').toUpperCase();
    if(type==='ADULT') return t().adult;
    if(type==='CHILD') return t().child;
    if(type==='INFANT') return t().infant;
    return item?.title || type || '—';
  }
  function ageLabel(item){
    const min=Number(item?.minAge), max=Number(item?.maxAge);
    return Number.isFinite(min)&&Number.isFinite(max) ? min+'–'+max : '';
  }
  function fieldLabel(value){
    const labels={
      FIRST_NAME:{ru:'Имя',en:'First name',vi:'Tên',ko:'이름'},
      LAST_NAME:{ru:'Фамилия',en:'Last name',vi:'Họ',ko:'성'},
      PHONE:{ru:'Телефон',en:'Phone',vi:'Điện thoại',ko:'전화번호'},
      EMAIL:{ru:'Email',en:'Email',vi:'Email',ko:'이메일'}
    };
    return labels[String(value || '').toUpperCase()]?.[locale()] || String(value || '').replaceAll('_',' ').toLowerCase();
  }
  function quoteFor(slot,rateId){
    return arr(slot?.priceQuotesByRate).find(item=>String(item?.rateId)===String(rateId)) || null;
  }
  function priceFor(slot,rateId,categoryId){
    const quote=quoteFor(slot,rateId);
    return arr(quote?.participantPrices).find(item=>String(item?.categoryId)===String(categoryId))?.amount || null;
  }
  function rateAvailable(slot,rateId){
    return Boolean(quoteFor(slot,rateId)) || arr(slot?.rates).some(rate=>String(rate?.id)===String(rateId));
  }
  function firstAdult(domain){
    return arr(domain?.participants).find(item=>String(item?.ticketCategory).toUpperCase()==='ADULT') || arr(domain?.participants)[0] || null;
  }
  function ratePrice(domain,rate){
    const adult=firstAdult(domain);
    const slot=arr(domain?.availabilitySlots).find(s=>!s.soldOut&&!s.unavailable&&rateAvailable(s,rate.id));
    return slot && adult ? priceFor(slot,rate.id,adult.id) : null;
  }
  function selectedState(domain){
    let state=selectionByProduct.get(String(domain.experience.id));
    if(!state){
      const firstSlot=arr(domain.availabilitySlots).find(s=>!s.soldOut&&!s.unavailable) || arr(domain.availabilitySlots)[0] || null;
      const rateId=firstSlot?.defaultRateId ?? arr(domain.rates)[0]?.id ?? null;
      const slot=arr(domain.availabilitySlots).find(s=>!s.soldOut&&!s.unavailable&&rateAvailable(s,rateId)) || firstSlot;
      state={rateId,slotId:slot?.id || null};
      selectionByProduct.set(String(domain.experience.id),state);
    }
    return state;
  }
  function selectedRate(domain,state){
    return arr(domain.rates).find(rate=>String(rate.id)===String(state.rateId)) || arr(domain.rates)[0] || null;
  }
  function selectedSlot(domain,state){
    return arr(domain.availabilitySlots).find(slot=>String(slot.id)===String(state.slotId)) || null;
  }
  function pickupText(rate,domain){
    if(!domain?.experience?.pickup?.enabled) return '';
    return t().pickupOptional;
  }
  function cancellationRows(policy){
    const rules=arr(policy?.penaltyRules).filter(rule=>Number.isFinite(Number(rule?.cutoffHours))&&Number.isFinite(Number(rule?.percentage ?? rule?.charge)));
    if(!rules.length) return '';
    return rules.map(rule=>{
      const pct=Number.isFinite(Number(rule.percentage)) ? Number(rule.percentage) : Number(rule.charge);
      const hours=Number(rule.cutoffHours);
      if(pct===0) return '<div class="lt-domain-rule"><span>'+esc(t().earlier)+'</span><b>'+esc(t().noFee)+'</b></div>';
      return '<div class="lt-domain-rule"><span>'+esc(t().within)+' '+esc(hours)+' '+esc(t().hours)+'</span><b>'+esc(pct)+'% '+esc(t().fee)+'</b></div>';
    }).join('');
  }
  function photoGallery(domain){
    const photos=arr(domain?.experience?.media?.photos).filter(p=>p?.url);
    if(!photos.length) return '';
    const hero=photos[0];
    const thumbs=photos.slice(1,7);
    return '<section class="lt-domain-gallery">'+
      '<div class="lt-domain-gallery__hero"><img src="'+esc(hero.url)+'" alt="'+esc(domain.experience.title)+'"></div>'+
      (thumbs.length?'<div class="lt-domain-gallery__strip">'+thumbs.map((p,i)=>'<div class="lt-domain-gallery__thumb"><img src="'+esc(p.url)+'" alt="'+esc(domain.experience.title)+' '+(i+2)+'"></div>').join('')+'</div>':'')+
      '</section>';
  }
  function rateCards(domain,state){
    const rates=arr(domain.rates);
    if(!rates.length) return '';
    return '<section class="lt-domain-section"><div class="lt-domain-section__head"><div><span class="lt-domain-eyebrow">'+esc(t().option)+'</span><p>'+esc(t().optionHint)+'</p></div></div>'+
      '<div class="lt-domain-rates">'+rates.map(rate=>{
        const active=String(rate.id)===String(state.rateId);
        const price=ratePrice(domain,rate);
        const details=[
          rate.description,
          ...arr(rate.details).map(item=>item?.description||item?.title||''),
          ...arr(rate.textItems).map(item=>item?.description||item?.title||''),
        ].map(value=>String(value||'').trim()).filter(Boolean);
        const detailText=[...new Set(details)].join(' · ');
        return '<button type="button" class="lt-domain-rate '+(active?'is-active':'')+'" data-lt-domain-rate="'+esc(rate.id)+'">'+
          '<span class="lt-domain-rate__check">'+(active?'✓':'')+'</span>'+
          '<span class="lt-domain-rate__copy"><b>'+esc(rate.title || rate.code || rate.id)+'</b>'+(detailText?'<small>'+esc(detailText)+'</small>':'')+'</span>'+
          '<span class="lt-domain-rate__price">'+(price?'<small>'+esc(t().from)+'</small><strong>'+esc(money(price))+'</strong>':'')+'</span>'+
        '</button>';
      }).join('')+'</div></section>';
  }
  function availabilityCards(domain,state){
    const slots=arr(domain.availabilitySlots).filter(slot=>rateAvailable(slot,state.rateId));
    if(!slots.length) return '<section class="lt-domain-section"><div class="lt-domain-empty">'+esc(t().rateUnavailable)+'</div></section>';
    return '<section class="lt-domain-section"><div class="lt-domain-section__head"><span class="lt-domain-eyebrow">'+esc(t().availableDates)+'</span></div>'+
      '<div class="lt-domain-dates">'+slots.map(slot=>{
        const active=String(slot.id)===String(state.slotId);
        const unavailable=slot.soldOut||slot.unavailable||(!slot.unlimitedAvailability&&Number(slot.availabilityCount)<=0);
        const adult=firstAdult(domain);
        const price=adult ? priceFor(slot,state.rateId,adult.id) : null;
        const count=Number(slot.availabilityCount);
        const availability=slot.unlimitedAvailability ? t().unlimited : unavailable ? t().soldOut : Number.isFinite(count) ? Math.max(0,count)+' '+t().available : t().unlimited;
        return '<button type="button" class="lt-domain-date '+(active?'is-active ':'')+(unavailable?'is-disabled':'')+'" data-lt-domain-slot="'+esc(slot.id)+'" '+(unavailable?'disabled':'')+'>'+
          '<span><b>'+esc(slot.localizedDate || slot.date)+'</b><small>'+esc(slot.startTime || '')+'</small></span>'+
          '<span class="lt-domain-date__availability">'+esc(availability)+'</span>'+
          '<span class="lt-domain-date__price">'+(price?esc(money(price)):'')+'</span>'+
          '<span class="lt-domain-date__action">'+esc(active?t().selected:t().select)+'</span>'+
        '</button>';
      }).join('')+'</div></section>';
  }
  function participantPrices(domain,state){
    const slot=selectedSlot(domain,state);
    if(!slot) return '';
    const rows=arr(domain.participants).map(category=>{
      const price=priceFor(slot,state.rateId,category.id);
      if(!price) return '';
      return '<div class="lt-domain-participant"><div><b>'+esc(categoryLabel(category))+'</b>'+(ageLabel(category)?'<span>'+esc(ageLabel(category))+'</span>':'')+'</div><strong>'+esc(money(price))+'</strong></div>';
    }).filter(Boolean);
    if(!rows.length) return '';
    return '<section class="lt-domain-section"><div class="lt-domain-section__head"><div><span class="lt-domain-eyebrow">'+esc(t().participants)+'</span><p>'+esc(t().priceFor)+' · '+esc(slot.localizedDate || slot.date)+' · '+esc(slot.startTime || '')+'</p></div></div><div class="lt-domain-participants">'+rows.join('')+'</div></section>';
  }
  function meeting(domain,rate){
    const points=arr(domain?.experience?.meeting?.startPoints);
    const pickup=pickupText(rate,domain);
    const pickupMinutes=Number(domain?.experience?.pickup?.minutesBefore);
    const pickupWindow=Number(domain?.experience?.pickup?.timeWindowMinutes);
    const pickupTiming=Number.isFinite(pickupMinutes)&&pickupMinutes>0
      ? pickupMinutes+' '+t().minutesBefore+(Number.isFinite(pickupWindow)&&pickupWindow>0?' · ±'+pickupWindow+' min':'')
      : '';
    const meetingType=String(domain?.experience?.meeting?.type||'').replaceAll('_',' ').toLowerCase();
    if(!points.length && !pickup && !meetingType) return '';
    return '<section class="lt-domain-section lt-domain-grid">'+
      (points.length||meetingType?'<div class="lt-domain-info"><span class="lt-domain-eyebrow">'+esc(t().meeting)+'</span>'+
        (meetingType?'<div class="lt-domain-info__row"><b>'+esc(meetingType)+'</b></div>':'')+
        points.map(point=>'<div class="lt-domain-info__row"><b>'+esc(point.title || point.addressLine1 || '')+'</b><span>'+esc([point.addressLine1,point.city,point.state].filter(Boolean).join(', '))+'</span></div>').join('')+'</div>':'')+
      (pickup?'<div class="lt-domain-info"><span class="lt-domain-eyebrow">'+esc(t().pickup)+'</span><div class="lt-domain-info__row"><b>'+esc(pickup)+'</b></div>'+
        (pickupTiming?'<div class="lt-domain-info__row"><span>'+esc(t().pickupTiming)+'</span><b>'+esc(pickupTiming)+'</b></div>':'')+
        (domain?.experience?.pickup?.noPickupMessage?'<div class="lt-domain-info__row"><span>'+esc(domain.experience.pickup.noPickupMessage)+'</span></div>':'')+
      '</div>':'')+
      '</section>';
  }
  function itinerary(domain){
    const items=arr(domain?.experience?.itinerary).filter(item=>item?.title||item?.body);
    if(!items.length) return '';
    return '<section class="lt-domain-section"><div class="lt-domain-section__head"><div><span class="lt-domain-eyebrow">'+esc(t().itinerary)+'</span>'+(arr(domain.rates).length>1?'<p>'+esc(t().itineraryHint)+'</p>':'')+'</div></div><div class="lt-domain-itinerary">'+items.map((item,index)=>'<div class="lt-domain-itinerary__item"><span>'+(index+1)+'</span><div>'+(item.title?'<b>'+esc(item.title)+'</b>':'')+(item.body?'<p>'+esc(textFromHtml(item.body))+'</p>':'')+'</div></div>').join('')+'</div></section>';
  }
  function videoSection(domain){
    const videos=arr(domain?.experience?.media?.videos).filter(item=>item?.url);
    if(!videos.length) return '';
    return '<section class="lt-domain-section"><div class="lt-domain-section__head"><span class="lt-domain-eyebrow">'+esc(t().video)+'</span></div><div class="lt-domain-video-list">'+
      videos.map((item,index)=>'<a class="lt-domain-video" href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">'+esc(item.title||t().video+' '+(index+1))+'</a>').join('')+
      '</div></section>';
  }
  function listSection(title,items){
    const clean=arr(items).map(v=>typeof v==='string'?v:(v?.title||v?.description||v?.code||v?.currencyCode||v?.id||'')).map(textFromHtml).filter(Boolean);
    if(!clean.length) return '';
    return '<section class="lt-domain-section"><div class="lt-domain-section__head"><span class="lt-domain-eyebrow">'+esc(title)+'</span></div><ul class="lt-domain-list">'+clean.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></section>';
  }
  function bookingDynamic(domain){
    const req=domain?.bookingRequirements || {};
    const extras=arr(domain?.extras);
    const questions=arr(req.questions);
    const customer=arr(req.requiredCustomerFields);
    const passenger=arr(req.passengerFields);
    const custom=arr(req.customFields);
    if(!extras.length&&!questions.length&&!customer.length&&!passenger.length&&!custom.length) return '';
    let inner='';
    if(extras.length) inner+='<div class="lt-domain-info"><span class="lt-domain-eyebrow">'+esc(t().extras)+'</span>'+extras.map(x=>'<div class="lt-domain-info__row"><b>'+esc(x.title||x.code||x.id)+'</b>'+(x.description?'<span>'+esc(x.description)+'</span>':'')+'</div>').join('')+'</div>';
    if(customer.length) inner+='<div class="lt-domain-info"><span class="lt-domain-eyebrow">'+esc(t().customerFields)+'</span><div class="lt-domain-fieldchips">'+customer.map(x=>'<span>'+esc(fieldLabel(x))+'</span>').join('')+'</div></div>';
    if(passenger.length) inner+='<div class="lt-domain-info"><span class="lt-domain-eyebrow">'+esc(t().passengerFields)+'</span><div class="lt-domain-fieldchips">'+passenger.map(x=>'<span>'+esc(fieldLabel(x))+'</span>').join('')+'</div></div>';
    if(questions.length||custom.length) inner+='<div class="lt-domain-info"><span class="lt-domain-eyebrow">'+esc(t().questions)+'</span>'+[...questions,...custom].map(x=>'<div class="lt-domain-info__row"><b>'+esc(x.title||x.code||x.id)+'</b>'+(x.required?'<span>*</span>':'')+'</div>').join('')+'</div>';
    return '<section class="lt-domain-section"><div class="lt-domain-section__head"><span class="lt-domain-eyebrow">'+esc(t().bookingInfo)+'</span></div><div class="lt-domain-grid">'+inner+'</div></section>';
  }
  function renderDomain(domain){
    const screen=document.querySelector('#tourScreen');
    if(!screen) return;
    const state=selectedState(domain);
    const rate=selectedRate(domain,state);
    const slot=selectedSlot(domain,state);
    const languages=arr(domain?.experience?.languages?.guidanceTypes).flatMap(x=>arr(x?.displayLanguages)).filter(Boolean);
    const included=listFromHtml(domain?.experience?.content?.included);
    const excluded=listFromHtml(domain?.experience?.content?.excluded);
    const requirements=[
      ...listFromHtml(domain?.experience?.content?.requirements),
      ...listFromHtml(domain?.experience?.content?.attention),
      ...listFromHtml(domain?.experience?.content?.dressCode),
      ...arr(domain?.experience?.content?.knowBeforeYouGoItems).map(x=>x?.title||x?.text||x?.description||'').filter(Boolean),
      ...(domain?.experience?.passportRequired?[t().passport]:[]),
    ];
    const cancellation=rate?.cancellationPolicy || domain?.cancellationPolicy;
    const firstPhoto=arr(domain?.experience?.media?.photos)[0]?.url || '';

    screen.classList.add('lt-domain-tour');
    screen.dataset.ltDomainProduct=String(domain.experience.id);
    screen.innerHTML=
      '<div class="lt-domain-shell">'+
        '<button type="button" class="lt-domain-back" data-lt-domain-back>← '+esc(t().back)+'</button>'+
        photoGallery(domain)+
        '<section class="lt-domain-hero">'+
          '<div class="lt-domain-live"><span></span>'+esc(t().live)+'</div>'+
          '<h1>'+esc(domain.experience.title)+'</h1>'+
          '<p>'+esc(domain.experience.description || '')+'</p>'+
          '<div class="lt-domain-facts">'+
            (domain.experience.duration?.text?'<div><small>'+esc(t().duration)+'</small><b>'+esc(domain.experience.duration.text)+'</b></div>':'')+
            (languages.length?'<div><small>'+esc(t().languages)+'</small><b>'+esc(languages.join(' · '))+'</b></div>':'')+
            (domain.experience.difficulty?'<div><small>'+esc(t().difficulty)+'</small><b>'+esc(domain.experience.difficulty)+'</b></div>':'')+
            (Number.isFinite(Number(domain.experience.minAge))?'<div><small>'+esc(t().minAge)+'</small><b>'+esc(domain.experience.minAge)+'+</b></div>':'')+
            (Number.isFinite(Number(domain.experience.reviews?.rating))?'<div><small>'+esc(t().reviews)+'</small><b>'+esc(domain.experience.reviews.rating)+(Number.isFinite(Number(domain.experience.reviews?.count))?' · '+esc(domain.experience.reviews.count):'')+'</b></div>':'')+
            (String(domain.experience.booking?.capacityType||'').toUpperCase()==='ON_REQUEST'?'<div><small>'+esc(t().confirmation)+'</small><b>'+esc(t().onRequest)+'</b></div>':'')+
            (slot?'<div><small>'+esc(t().chooseDate)+'</small><b>'+esc((slot.localizedDate||slot.date)+' · '+(slot.startTime||''))+'</b></div>':'')+
          '</div>'+
        '</section>'+
        meeting(domain,null)+
        itinerary(domain)+
        videoSection(domain)+
        listSection(t().included,included)+
        listSection(t().excluded,excluded)+
        listSection(t().requirements,requirements)+
        listSection(t().accessibility,domain?.experience?.accessibility)+
        listSection(t().offers,domain?.offers)+
        listSection(t().currencies,domain?.experience?.paymentCurrencies)+
        (cancellation?'<section class="lt-domain-section"><div class="lt-domain-section__head"><span class="lt-domain-eyebrow">'+esc(t().conditions)+'</span></div><div class="lt-domain-policy"><b>'+esc(cancellation.title||'')+'</b>'+cancellationRows(cancellation)+'</div></section>':'')+
        (firstPhoto?'<div class="lt-domain-source-note" aria-hidden="true"></div>':'')+
      '</div>';

    wire(screen,domain);
    screen.scrollTop=0;
    try { window.scrollTo({top:0,behavior:'instant'}); } catch (_) { window.scrollTo(0,0); }
  }
  function wire(screen,domain){
    screen.querySelector('[data-lt-domain-back]')?.addEventListener('click',()=>typeof showScreen==='function'&&showScreen('catalog'));
    screen.querySelectorAll('[data-lt-domain-rate]').forEach(button=>button.addEventListener('click',()=>{
      const state=selectedState(domain);
      state.rateId=button.dataset.ltDomainRate;
      const slot=arr(domain.availabilitySlots).find(s=>!s.soldOut&&!s.unavailable&&rateAvailable(s,state.rateId));
      state.slotId=slot?.id || null;
      renderDomain(domain);
    }));
    screen.querySelectorAll('[data-lt-domain-slot]').forEach(button=>button.addEventListener('click',()=>{
      const state=selectedState(domain);
      state.slotId=button.dataset.ltDomainSlot;
      renderDomain(domain);
    }));
  }
  async function domains(force=false){
    if(force) domainPromise=null;
    if(!domainPromise){
      domainPromise=fetch('/api/bokun/domain',{cache:'no-store',credentials:'same-origin'})
        .then(async response=>{
          if(!response.ok) throw new Error('domain HTTP '+response.status);
          const data=await response.json();
          if(data?.schema!=='lovetravel.bokun-domain.v1'||!Array.isArray(data?.domains)) throw new Error('invalid domain payload');
          return data.domains;
        })
        .catch(error=>{ domainPromise=null; throw error; });
    }
    return domainPromise;
  }
  function loading(){
    const screen=document.querySelector('#tourScreen');
    if(!screen) return;
    screen.classList.add('lt-domain-tour');
    screen.innerHTML='<div class="lt-domain-loading"><span class="lt-domain-spinner"></span><b>'+esc(t().loading)+'</b></div>';
  }
  function errorView(id){
    const screen=document.querySelector('#tourScreen');
    if(!screen) return;
    screen.classList.add('lt-domain-tour');
    screen.innerHTML='<div class="lt-domain-loading"><b>'+esc(t().loadError)+'</b><button type="button" data-lt-domain-retry>'+esc(t().retry)+'</button></div>';
    screen.querySelector('[data-lt-domain-retry]')?.addEventListener('click',()=>renderProduct(id,true));
  }
  async function renderProduct(id,force=false){
    const productId=String(id||'');
    if(!PRODUCT_IDS.has(productId)) return false;
    currentProductId=productId;
    loading();
    try{
      const list=await domains(force);
      if(currentProductId!==productId) return false;
      const domain=list.find(item=>String(item?.experience?.id)===productId);
      if(!domain) throw new Error('domain not found');
      renderDomain(domain);
      return true;
    }catch(error){
      console.error('[LoveTravel] Domain tour render failed',error);
      if(currentProductId===productId) errorView(productId);
      return false;
    }
  }
  function installOpenTour(){
    if(typeof globalThis.openTour!=='function') return false;
    if(globalThis.openTour.__loveTravelDomain) return true;
    const previous=globalThis.openTour;
    const wrapped=function(id,...args){
      const result=previous.call(this,id,...args);
      const productId=String(id ?? '');
      if(PRODUCT_IDS.has(productId)) queueMicrotask(()=>renderProduct(productId));
      return result;
    };
    wrapped.__loveTravelDomain=true;
    wrapped.__previous=previous;
    globalThis.openTour=wrapped;
    return true;
  }
  let repairQueued=false;
  function repairLegacyOverwrite(){
    const screen=document.querySelector('#tourScreen');
    const productId=String(screen?.dataset?.ltDomainProduct||'');
    if(!screen?.classList.contains('active') || !PRODUCT_IDS.has(productId) || screen.querySelector('.lt-domain-shell')) return;
    if(repairQueued) return;
    repairQueued=true;
    queueMicrotask(async()=>{
      repairQueued=false;
      try{
        const list=await domains();
        const domain=list.find(item=>String(item?.experience?.id)===productId);
        if(domain && !document.querySelector('#tourScreen .lt-domain-shell')) renderDomain(domain);
      }catch(error){
        console.error('[LoveTravel] failed to repair legacy tour overwrite',error);
      }
    });
  }
  function install(){
    if(!installOpenTour()) setTimeout(install,50);
    domains().catch(()=>{});
    const screen=document.querySelector('#tourScreen');
    if(screen){
      new MutationObserver(repairLegacyOverwrite).observe(screen,{subtree:true,childList:true});
    } else {
      setTimeout(install,60);
    }
  }
  document.addEventListener('click',event=>{
    if(event.target.closest?.('.mt-language-switcher button')&&currentProductId&&document.querySelector('#tourScreen')?.classList.contains('active')){
      setTimeout(()=>domains().then(list=>{
        const domain=list.find(item=>String(item?.experience?.id)===currentProductId);
        if(domain) renderDomain(domain);
      }).catch(()=>{}),80);
    }
  },true);
  install();
  globalThis.LoveTravelDomainTour={renderProduct,refresh:()=>currentProductId?renderProduct(currentProductId,true):Promise.resolve(false)};
})();
