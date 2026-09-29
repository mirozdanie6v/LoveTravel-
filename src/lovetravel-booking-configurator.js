(() => {
  'use strict';

  const PRODUCT_IDS = new Set(['1287578','1287580']);
  const RELEASE_ID = '2026-09-29-bokun-complete-v1';
  const stateByProduct = new Map();
  const resolutionByProduct = new Map();
  const calendarByKey = new Map();
  const calendarRequestSeqByProduct = new Map();
  let activeProductId = null;
  let requestSeq = 0;
  let sheet = null;

  const copy = {
    ru:{
      title:'Соберите поездку', live:'Актуальные места и цены',
      date:'Дата и время', dateEmpty:'Выберите дату', option:'Вариант', optionEmpty:'Выберите вариант',
      guests:'Участники', guestsEmpty:'Добавьте участников', pickup:'Как добраться', pickupEmpty:'Выберите способ',
      meet:'Встретимся на месте', pickupMode:'Забрать из отеля', included:'включено в цену',
      total:'Итого', from:'от', continue:'Продолжить', check:'Проверить данные', ready:'Данные проверены',
      unavailable:'Комбинация недоступна', updating:'Проверяем актуальные данные…',
      chooseDate:'Выберите дату', chooseTime:'Выберите время', chooseOption:'Выберите вариант экскурсии',
      chooseGuests:'Укажите участников', choosePickup:'Выберите способ встречи',
      available:'мест доступно', spots:'мест', adult:'Взрослый', child:'Ребёнок', infant:'Младенец',
      years:'лет', close:'Закрыть', searchHotel:'Найдите отель или точку посадки',
      pickupPlace:'Место посадки', roomNeeded:'Для этой точки нужен номер комнаты при оформлении.',
      contact:'Контактные данные', firstName:'Имя', lastName:'Фамилия', phoneNumber:'Телефон', email:'Email',
      verify:'Проверить', verified:'Данные проверены', noPlaces:'Ничего не найдено',
      select:'Выбрать', selected:'Выбрано', pricePerPerson:'за человека', liveQuote:'Цена проверена сейчас', onRequest:'Требуется подтверждение туроператора',
      refreshError:'Не удалось обновить доступность. Попробуйте ещё раз.',
      minGuests:'Минимум', maxGuests:'Максимум', noExtra:'Дополнительных услуг сейчас нет', extras:'Дополнительно', extrasEmpty:'Без дополнений', chooseExtras:'Дополнительные услуги', extrasRequired:'Выберите обязательную услугу', passengerDetails:'Данные участников', passenger:'Участник', questions:'Вопросы для бронирования', additionalInfo:'Дополнительные данные', roomNumber:'Номер комнаты', save:'Сохранить', customPickup:'Другой адрес', customPickupAddress:'Адрес для посадки',
      bookingNotSent:'Данные пока не отправлены туроператору.',
      selectDateFirst:'Сначала выберите дату', selectOptionFirst:'Выберите вариант', selectGuestsFirst:'Добавьте участников',
      pickupRequired:'Нужно выбрать способ встречи', contactRequired:'Нужно заполнить контактные данные'
    },
    en:{
      title:'Build your trip', live:'Live availability and pricing',
      date:'Date & time', dateEmpty:'Choose a date', option:'Option', optionEmpty:'Choose an option',
      guests:'Guests', guestsEmpty:'Add guests', pickup:'Getting there', pickupEmpty:'Choose a method',
      meet:'Meet on location', pickupMode:'Hotel pickup', included:'included in price',
      total:'Total', from:'from', continue:'Continue', check:'Check details', ready:'Details checked',
      unavailable:'Combination unavailable', updating:'Checking live data…',
      chooseDate:'Choose a date', chooseTime:'Choose a time', chooseOption:'Choose a tour option',
      chooseGuests:'Add guests', choosePickup:'Choose how to meet',
      available:'spots available', spots:'spots', adult:'Adult', child:'Child', infant:'Infant',
      years:'years', close:'Close', searchHotel:'Search hotel or pickup point',
      pickupPlace:'Pickup point', roomNeeded:'A room number is required for this pickup point during checkout.',
      contact:'Contact details', firstName:'First name', lastName:'Last name', phoneNumber:'Phone', email:'Email',
      verify:'Check', verified:'Details checked', noPlaces:'No matches',
      select:'Select', selected:'Selected', pricePerPerson:'per person', liveQuote:'Price checked live', onRequest:'Operator confirmation required',
      refreshError:'Could not refresh availability. Try again.',
      minGuests:'Minimum', maxGuests:'Maximum', noExtra:'No extras are currently configured', extras:'Extras', extrasEmpty:'No extras', chooseExtras:'Additional services', extrasRequired:'Choose the required extra', passengerDetails:'Guest details', passenger:'Guest', questions:'Booking questions', additionalInfo:'Additional details', roomNumber:'Room number', save:'Save', customPickup:'Other address', customPickupAddress:'Pickup address',
      bookingNotSent:'Your details have not been sent to the operator yet.',
      selectDateFirst:'Choose a date first', selectOptionFirst:'Choose an option', selectGuestsFirst:'Add guests',
      pickupRequired:'Choose how to meet', contactRequired:'Complete the contact details'
    },
    vi:{
      title:'Tạo chuyến đi', live:'Giá và chỗ trống cập nhật',
      date:'Ngày & giờ', dateEmpty:'Chọn ngày', option:'Lựa chọn', optionEmpty:'Chọn chương trình',
      guests:'Khách', guestsEmpty:'Thêm khách', pickup:'Di chuyển', pickupEmpty:'Chọn cách gặp',
      meet:'Gặp tại điểm hẹn', pickupMode:'Đón tại khách sạn', included:'đã gồm trong giá',
      total:'Tổng', from:'từ', continue:'Tiếp tục', check:'Kiểm tra thông tin', ready:'Đã kiểm tra thông tin',
      unavailable:'Lựa chọn không khả dụng', updating:'Đang kiểm tra dữ liệu mới nhất…',
      chooseDate:'Chọn ngày', chooseTime:'Chọn giờ', chooseOption:'Chọn chương trình',
      chooseGuests:'Chọn số khách', choosePickup:'Chọn cách gặp',
      available:'chỗ còn trống', spots:'chỗ', adult:'Người lớn', child:'Trẻ em', infant:'Em bé',
      years:'tuổi', close:'Đóng', searchHotel:'Tìm khách sạn hoặc điểm đón',
      pickupPlace:'Điểm đón', roomNeeded:'Điểm đón này yêu cầu số phòng khi đặt tour.',
      contact:'Thông tin liên hệ', firstName:'Tên', lastName:'Họ', phoneNumber:'Điện thoại', email:'Email',
      verify:'Kiểm tra', verified:'Đã kiểm tra', noPlaces:'Không có kết quả',
      select:'Chọn', selected:'Đã chọn', pricePerPerson:'mỗi người', liveQuote:'Giá vừa được kiểm tra', onRequest:'Cần nhà điều hành xác nhận',
      refreshError:'Không thể cập nhật chỗ trống. Vui lòng thử lại.',
      minGuests:'Tối thiểu', maxGuests:'Tối đa', noExtra:'Hiện không có dịch vụ bổ sung', extras:'Dịch vụ thêm', extrasEmpty:'Không chọn thêm', chooseExtras:'Dịch vụ bổ sung', extrasRequired:'Chọn dịch vụ bắt buộc', passengerDetails:'Thông tin hành khách', passenger:'Hành khách', questions:'Câu hỏi đặt chỗ', additionalInfo:'Thông tin bổ sung', roomNumber:'Số phòng', save:'Lưu', customPickup:'Địa chỉ khác', customPickupAddress:'Địa chỉ đón',
      bookingNotSent:'Thông tin chưa được gửi tới nhà điều hành.',
      selectDateFirst:'Hãy chọn ngày trước', selectOptionFirst:'Chọn chương trình', selectGuestsFirst:'Thêm khách',
      pickupRequired:'Chọn cách gặp', contactRequired:'Điền thông tin liên hệ'
    },
    ko:{
      title:'여행 구성하기', live:'실시간 좌석 및 가격',
      date:'날짜 및 시간', dateEmpty:'날짜 선택', option:'옵션', optionEmpty:'옵션 선택',
      guests:'인원', guestsEmpty:'인원 추가', pickup:'이동 방법', pickupEmpty:'방법 선택',
      meet:'현장 미팅', pickupMode:'호텔 픽업', included:'가격 포함',
      total:'합계', from:'최저', continue:'계속', check:'정보 확인', ready:'정보 확인 완료',
      unavailable:'선택 불가', updating:'실시간 정보를 확인 중…',
      chooseDate:'날짜 선택', chooseTime:'시간 선택', chooseOption:'투어 옵션 선택',
      chooseGuests:'인원 선택', choosePickup:'미팅 방법 선택',
      available:'자리 남음', spots:'자리', adult:'성인', child:'아동', infant:'유아',
      years:'세', close:'닫기', searchHotel:'호텔 또는 픽업 장소 검색',
      pickupPlace:'픽업 장소', roomNeeded:'이 픽업 장소는 결제 단계에서 객실 번호가 필요합니다.',
      contact:'연락처 정보', firstName:'이름', lastName:'성', phoneNumber:'전화번호', email:'이메일',
      verify:'확인', verified:'확인 완료', noPlaces:'검색 결과 없음',
      select:'선택', selected:'선택됨', pricePerPerson:'1인당', liveQuote:'실시간 가격 확인됨', onRequest:'운영사 확인 필요',
      refreshError:'예약 가능 여부를 업데이트하지 못했습니다. 다시 시도해 주세요.',
      minGuests:'최소', maxGuests:'최대', noExtra:'현재 추가 옵션이 없습니다', extras:'추가 옵션', extrasEmpty:'추가 옵션 없음', chooseExtras:'추가 서비스', extrasRequired:'필수 추가 서비스를 선택하세요', passengerDetails:'참가자 정보', passenger:'참가자', questions:'예약 질문', additionalInfo:'추가 정보', roomNumber:'객실 번호', save:'저장', customPickup:'다른 주소', customPickupAddress:'픽업 주소',
      bookingNotSent:'아직 운영사에 정보가 전송되지 않았습니다.',
      selectDateFirst:'먼저 날짜를 선택하세요', selectOptionFirst:'옵션 선택', selectGuestsFirst:'인원 추가',
      pickupRequired:'미팅 방법을 선택하세요', contactRequired:'연락처 정보를 입력하세요'
    }
  };

  function locale(){
    const value=String(document.documentElement.lang || localStorage.getItem('love-travel-locale-v1') || localStorage.getItem('max-tour-locale-v1') || 'ru').toLowerCase();
    return copy[value] ? value : 'ru';
  }
  function t(){ return copy[locale()]; }
  function arr(v){ return Array.isArray(v) ? v : []; }
  function esc(v){ return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function money(amount,currency='USD'){
    if(!Number.isFinite(Number(amount))) return '';
    const n=Number(amount), value=Number.isInteger(n)?String(n):String(Number(n.toFixed(2)));
    return currency==='USD' ? '$'+value : value+' '+currency;
  }
  function selection(productId){
    if(!stateByProduct.has(productId)){
      stateByProduct.set(productId,{
        productId,date:null,startTimeId:null,slotId:null,rateId:null,
        participants:{},pickup:{mode:null,placeId:null,customLocation:null,roomNumber:''},extras:{},customer:{},answers:{},extraAnswers:{},passengers:[]
      });
    }
    return stateByProduct.get(productId);
  }
  function saveSelection(productId,next){
    stateByProduct.set(productId,next);
    return next;
  }
  function patchSelection(productId,patch){
    const current=selection(productId);
    const next={...current,...patch};
    if(Object.prototype.hasOwnProperty.call(patch,'date')){
      next.slotId=null; next.startTimeId=null;
    }
    if(Object.prototype.hasOwnProperty.call(patch,'startTimeId') && !Object.prototype.hasOwnProperty.call(patch,'slotId')) next.slotId=null;
    if(patch.pickup) next.pickup={...current.pickup,...patch.pickup};
    if(patch.participants) next.participants={...patch.participants};
    if(patch.customer) next.customer={...current.customer,...patch.customer};
    saveSelection(productId,next);
    return next;
  }
  function calendarKey(productId,rateId=null){
    return String(productId)+':'+(rateId ? String(rateId) : '*');
  }
  function storeCalendar(productId,data){
    const dates=arr(data?.constraints?.dates);
    const times=arr(data?.constraints?.times);
    if(!dates.length) return null;
    const rateId=data?.selection?.rateId || null;
    const value={
      productId:String(productId),
      rateId:rateId ? String(rateId) : null,
      dates,
      times,
      fetchedAt:Date.now(),
      start:data?.start || null,
      end:data?.end || null,
    };
    calendarByKey.set(calendarKey(productId,value.rateId),value);
    return value;
  }
  function calendarFor(productId){
    const rateId=selection(productId).rateId || null;
    return calendarByKey.get(calendarKey(productId,rateId))
      || calendarByKey.get(calendarKey(productId,null))
      || null;
  }
  function availabilityLabel(item){
    if(item?.unlimitedAvailability) return t().available;
    const count=Number(item?.availabilityCount);
    return Number.isFinite(count) ? String(Math.max(0,count))+' '+t().available : t().available;
  }
  function calendarTimesForDate(productId,date){
    return arr(calendarFor(productId)?.times).filter(item=>String(item?.date||'')===String(date||''));
  }
  async function refreshCalendar(productId,{force=false}={}){
    const currentSelection=selection(productId);
    const rateId=currentSelection.rateId || null;
    const cached=calendarByKey.get(calendarKey(productId,rateId));
    if(!force && cached && Date.now()-cached.fetchedAt < 60000) return cached;

    const seq=(calendarRequestSeqByProduct.get(productId)||0)+1;
    calendarRequestSeqByProduct.set(productId,seq);
    const calendarSelection={
      ...currentSelection,
      date:null,
      startTimeId:null,
      slotId:null,
      pickup:{mode:null,placeId:null,customLocation:null,roomNumber:''},
    };
    const response=await fetch('/api/bokun/booking-selection/resolve',{
      method:'POST',
      headers:{'content-type':'application/json'},
      cache:'no-store',
      credentials:'same-origin',
      body:JSON.stringify({selection:calendarSelection}),
    });
    if(!response.ok) throw new Error('calendar resolve HTTP '+response.status);
    const data=await response.json();
    if(!data?.ok || data?.schemaVersion!=='lovetravel.booking-selection-resolution.v1') throw new Error('invalid calendar resolution');
    if(calendarRequestSeqByProduct.get(productId)!==seq) return calendarFor(productId);
    return storeCalendar(productId,data);
  }
  async function resolve(productId,{quiet=false}={}){
    const seq=++requestSeq;
    const card=document.querySelector('[data-lt-config="'+CSS.escape(productId)+'"]');
    if(card && !quiet) card.classList.add('is-updating');
    try{
      const response=await fetch('/api/bokun/booking-selection/resolve',{
        method:'POST',headers:{'content-type':'application/json'},cache:'no-store',credentials:'same-origin',
        body:JSON.stringify({selection:selection(productId)})
      });
      if(!response.ok) throw new Error('resolve HTTP '+response.status);
      const data=await response.json();
      if(!data?.ok || data?.schemaVersion!=='lovetravel.booking-selection-resolution.v1') throw new Error('invalid resolution');
      if(seq!==requestSeq || activeProductId!==productId) return data;
      resolutionByProduct.set(productId,data);
      saveSelection(productId,data.selection);
      if(!data.selection?.date) storeCalendar(productId,data);
      render(productId);
      return data;
    }catch(error){
      console.error('[LoveTravel] booking configurator resolve failed',error);
      if(seq===requestSeq && activeProductId===productId){
        const el=document.querySelector('[data-lt-config-error="'+CSS.escape(productId)+'"]');
        if(el){ el.textContent=t().refreshError; el.hidden=false; }
      }
      throw error;
    }finally{
      if(card) card.classList.remove('is-updating');
    }
  }
  function formatDate(iso,options={}){
    if(!iso) return '';
    const d=new Date(iso+'T12:00:00Z');
    return new Intl.DateTimeFormat(locale()==='ru'?'ru-RU':locale()==='vi'?'vi-VN':locale()==='ko'?'ko-KR':'en-US',options).format(d);
  }
  function guestLabel(item){
    const type=String(item?.ticketCategory||'').toUpperCase();
    if(type==='ADULT') return t().adult;
    if(type==='CHILD') return t().child;
    if(type==='INFANT') return t().infant;
    return item?.title || type;
  }
  function guestSummary(r){
    const items=arr(r?.constraints?.participants).filter(x=>Number(x.count)>0);
    if(!items.length) return t().guestsEmpty;
    return items.map(x=>guestLabel(x)+' '+x.count).join(' · ');
  }
  function dateSummary(r){
    const slot=r?.resolved?.slot;
    if(!slot) return t().dateEmpty;
    return formatDate(slot.date,{day:'numeric',month:'short'})+(slot.startTime?' · '+slot.startTime:'');
  }
  function optionSummary(r){ return r?.resolved?.rate?.title || t().optionEmpty; }
  function pickupSummary(r){
    const mode=r?.selection?.pickup?.mode;
    if(mode==='MEET_ON_LOCATION') return t().meet;
    if(mode==='PICKUP'){
      if(r?.resolved?.pickupPlace?.title) return r.resolved.pickupPlace.title;
      const custom=r?.selection?.pickup?.customLocation;
      if(custom?.wholeAddress||custom?.addressLine1) return custom.wholeAddress||custom.addressLine1;
      return t().pickupMode;
    }
    return t().pickupEmpty;
  }
  function extrasSummary(r){
    const bookingCount=Object.values(r?.selection?.extras||{}).reduce((sum,value)=>sum+Math.max(0,Number(value)||0),0);
    const passengerCount=arr(r?.selection?.passengers).reduce((sum,passenger)=>
      sum+Object.values(passenger?.extras||{}).reduce((inner,item)=>inner+Math.max(0,Number(item?.quantity??item)||0),0),0);
    const count=bookingCount+passengerCount;
    return count>0 ? String(count) : t().extrasEmpty;
  }
  function requiredCustomerComplete(r){
    const req=r?.constraints?.bookingRequirements||{};
    const required=new Set(arr(req.requiredCustomerFields).map(canonicalField).filter(Boolean));
    for(const spec of arr(req.mainContactFields).map(item=>bookingFieldSpec(item,true)).filter(Boolean)){
      if(spec.required) required.add(spec.field);
    }
    const customer=r?.selection?.customer||{};
    return [...required].every(field=>String(customer?.[field]??'').trim().length>0);
  }
  function contactSummary(r){
    const contactCodes=new Set(['required_customer_field_missing','required_booking_question_missing','invalid_booking_question_answer','required_custom_field_missing','passenger_details_incomplete','passenger_field_missing','required_passenger_booking_question_missing','invalid_passenger_booking_question_answer']);
    const pending=arr(r?.bookingDataIssues).some(item=>contactCodes.has(item.code)) || !requiredCustomerComplete(r);
    return pending ? t().contactRequired : t().verified;
  }
  function quoteSummary(r){
    if(r?.quote?.available) return money(r.quote.total,r.quote.currency);
    const from=arr(r?.constraints?.rates).map(x=>x.fromPrice).filter(Boolean).sort((a,b)=>Number(a.amount)-Number(b.amount))[0];
    return from ? t().from+' '+money(from.amount,from.currency) : '—';
  }
  function firstBlockingStep(r){
    const codes=new Set([
      ...(r?.errors||[]).map(x=>x.code),
      ...(r?.bookingDataIssues||[]).map(x=>x.code),
      ...(r?.warnings||[]).map(x=>x.code),
    ]);
    if(codes.has('date_required')||codes.has('slot_required')) return 'date';
    if(codes.has('rate_required')) return 'option';
    if(codes.has('participants_required')||[...codes].some(x=>x.includes('participant')||x.includes('minimum')||x.includes('capacity'))) return 'guests';
    if(codes.has('required_extra_missing')||codes.has('required_passenger_extra_missing')||codes.has('extras_price_unresolved')||[...codes].some(x=>x.includes('extra_booking_question'))) return 'extras';
    if(
      codes.has('pickup_mode_required')||
      codes.has('pickup_location_required')||
      codes.has('pickup_places_unavailable')||
      codes.has('pickup_room_number_required')||
      codes.has('custom_pickup_location_incomplete')
    ) return 'pickup';
    if([...codes].some(x=>x.includes('customer_field')||x.includes('booking_question')||x.includes('custom_field')||x.includes('passenger'))) return 'contact';
    return r?.readyToQuote ? 'contact' : 'date';
  }
  function markLegacySelection(){
    const screen=document.querySelector('#tourScreen');
    if(!screen) return;
    screen.classList.add('lt-booking-ui');
    ['.lt-domain-rates','.lt-domain-dates','.lt-domain-participants','.lt-domain-fieldchips'].forEach(sel=>{
      screen.querySelector(sel)?.closest('.lt-domain-section')?.classList.add('lt-domain-legacy-selection');
    });
  }
  function render(productId){
    if(activeProductId!==productId) return;
    const r=resolutionByProduct.get(productId);
    const shell=document.querySelector('#tourScreen .lt-domain-shell');
    if(!shell || !r) return;
    markLegacySelection();
    let mount=shell.querySelector('[data-lt-config="'+CSS.escape(productId)+'"]');
    if(!mount){
      mount=document.createElement('section');
      const hero=shell.querySelector('.lt-domain-hero');
      if(hero) hero.insertAdjacentElement('afterend',mount); else shell.prepend(mount);
    }
    mount.dataset.ltConfig=productId;
    mount.className='lt-booking-config'+(r.readyToQuote?' has-quote':'');
    const quote=quoteSummary(r);
    const ready=r.readyToBook;
    const cta=ready?t().ready:(r.readyToQuote?t().continue:t().continue);
    const extras=arr(r?.constraints?.extras);
    const extrasComplete=!arr(r?.bookingDataIssues).some(item=>item.code==='required_extra_missing'||item.code==='required_passenger_extra_missing'||String(item.code).includes('extra_booking_question'));
    const detailsComplete=requiredCustomerComplete(r) && !arr(r?.bookingDataIssues).some(item=>
      ['required_customer_field_missing','required_booking_question_missing','invalid_booking_question_answer','required_custom_field_missing','passenger_details_incomplete','passenger_field_missing','required_passenger_booking_question_missing','invalid_passenger_booking_question_answer'].includes(item.code)
    );
    mount.innerHTML=
      '<div class="lt-booking-config__head">'+
        '<div><span class="lt-booking-config__eyebrow"><i></i>'+esc(t().live)+'</span><h2>'+esc(t().title)+'</h2></div>'+
        '<div class="lt-booking-config__quote"><small>'+esc(t().total)+'</small><strong>'+esc(quote)+'</strong></div>'+
      '</div>'+
      '<div class="lt-booking-config__grid">'+
        stepButton('date',t().date,dateSummary(r),Boolean(r?.resolved?.slot))+
        stepButton('option',t().option,optionSummary(r),Boolean(r?.resolved?.rate))+
        stepButton('guests',t().guests,guestSummary(r),Number(r?.resolved?.participantTotal)>0)+
        stepButton('pickup',t().pickup,pickupSummary(r),Boolean(r?.selection?.pickup?.mode)&&!arr(r?.bookingDataIssues).some(item=>String(item.code).startsWith('pickup_')||item.code==='custom_pickup_location_incomplete'))+
        (extras.length?stepButton('extras',t().extras,extrasSummary(r),extrasComplete):'')+
        stepButton('contact',t().contact,contactSummary(r),detailsComplete)+
      '</div>'+
      '<div class="lt-booking-config__status">'+
        (r?.quote?.available?'<span class="is-live">'+esc(t().liveQuote)+'</span>':'<span>'+esc(statusText(r))+'</span>')+
        (r?.product?.confirmationMode==='ON_REQUEST'?'<span class="is-request">'+esc(t().onRequest)+'</span>':'')+
        '<span data-lt-config-error="'+esc(productId)+'" hidden></span>'+
      '</div>'+
      '<div class="lt-booking-sticky">'+
        '<div><small>'+esc(t().total)+'</small><strong>'+esc(quote)+'</strong></div>'+
        '<button type="button" class="lt-booking-cta '+(ready?'is-ready':'')+'" data-lt-config-continue>'+esc(cta)+'</button>'+
      '</div>';

    mount.querySelectorAll('[data-lt-step]').forEach(btn=>btn.addEventListener('click',()=>openSheet(productId,btn.dataset.ltStep)));
    mount.querySelector('[data-lt-config-continue]')?.addEventListener('click',()=>{
      const step=firstBlockingStep(r);
      if(ready) openSheet(productId,'contact');
      else openSheet(productId,step);
    });
  }
  function statusText(r){
    const step=firstBlockingStep(r);
    if(step==='date') return t().selectDateFirst;
    if(step==='option') return t().selectOptionFirst;
    if(step==='guests') return t().selectGuestsFirst;
    if(step==='extras') return t().extrasRequired;
    if(step==='pickup') return t().pickupRequired;
    if(step==='contact') return t().contactRequired;
    return t().unavailable;
  }
  function stepButton(step,label,value,complete){
    return '<button type="button" class="lt-booking-step '+(complete?'is-complete':'')+'" data-lt-step="'+esc(step)+'">'+
      '<span class="lt-booking-step__icon">'+(complete?'✓':'')+'</span>'+
      '<span class="lt-booking-step__copy"><small>'+esc(label)+'</small><b>'+esc(value)+'</b></span>'+
      '<span class="lt-booking-step__arrow">›</span>'+
    '</button>';
  }
  function ensureSheet(){
    if(sheet) return sheet;
    sheet=document.createElement('div');
    sheet.className='lt-booking-sheet';
    sheet.hidden=true;
    sheet.innerHTML='<div class="lt-booking-sheet__backdrop" data-lt-sheet-close></div><section class="lt-booking-sheet__panel" role="dialog" aria-modal="true"><div class="lt-booking-sheet__handle"></div><div class="lt-booking-sheet__content"></div></section>';
    document.body.appendChild(sheet);
    sheet.addEventListener('click',e=>{ if(e.target.closest('[data-lt-sheet-close]')) closeSheet(); });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!sheet.hidden) closeSheet(); });
    return sheet;
  }
  function closeSheet(){
    if(!sheet) return;
    sheet.classList.remove('is-open');
    document.documentElement.classList.remove('lt-sheet-open');
    setTimeout(()=>{ if(sheet&&!sheet.classList.contains('is-open')) sheet.hidden=true; },180);
  }
  function showSheet(title,body){
    const root=ensureSheet();
    root.hidden=false;
    root.querySelector('.lt-booking-sheet__content').innerHTML=
      '<header class="lt-booking-sheet__header"><div><h3>'+esc(title)+'</h3></div><button type="button" data-lt-sheet-close data-lt-sheet-close-button aria-label="'+esc(t().close)+'">×</button></header>'+body;
    requestAnimationFrame(()=>root.classList.add('is-open'));
    document.documentElement.classList.add('lt-sheet-open');
    return root.querySelector('.lt-booking-sheet__content');
  }
  function openSheet(productId,step){
    if(step==='date') return openDateSheet(productId);
    if(step==='option') return openOptionSheet(productId);
    if(step==='guests') return openGuestsSheet(productId);
    if(step==='pickup') return openPickupSheet(productId);
    if(step==='extras') return openExtrasSheet(productId);
    if(step==='contact') return openContactSheet(productId);
  }
  function monthGroups(dates){
    const groups=new Map();
    for(const item of dates){
      const key=String(item.date||'').slice(0,7);
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(item);
    }
    return [...groups.entries()];
  }
  function openDateSheet(productId,{skipRefresh=false}={}){
    const r=resolutionByProduct.get(productId); if(!r) return;
    const s=selection(productId);
    const calendar=calendarFor(productId);
    const dateRows=arr(calendar?.dates).length ? arr(calendar.dates) : arr(r.constraints?.dates);
    const timeRows=s.date
      ? (calendarTimesForDate(productId,s.date).length ? calendarTimesForDate(productId,s.date) : arr(r.constraints?.times))
      : [];
    const groups=monthGroups(dateRows);
    const calendars=groups.map(([key,items])=>{
      const first=items[0]?.date;
      return '<div class="lt-date-group"><h4>'+esc(formatDate(first,{month:'long',year:'numeric'}))+'</h4><div class="lt-date-grid">'+
        items.map(item=>{
          const active=item.date===s.date;
          return '<button type="button" class="lt-date-chip '+(active?'is-active':'')+'" data-lt-date="'+esc(item.date)+'"><small>'+esc(formatDate(item.date,{weekday:'short'}))+'</small><b>'+esc(formatDate(item.date,{day:'numeric'}))+'</b><span>'+esc(item.slots)+'×</span></button>';
        }).join('')+'</div></div>';
    }).join('');
    const times=s.date?'<div class="lt-time-block"><h4>'+esc(t().chooseTime)+'</h4><div class="lt-time-grid">'+
      timeRows.map(item=>'<button type="button" class="lt-time-chip '+(String(item.id)===String(s.slotId)?'is-active':'')+'" data-lt-slot="'+esc(item.id)+'" data-lt-time="'+esc(item.startTimeId||'')+'"><b>'+esc(item.startTime||'')+'</b><small>'+esc(availabilityLabel(item))+'</small></button>').join('')+
      '</div></div>':'';
    const root=showSheet(t().chooseDate,'<div class="lt-sheet-scroll">'+calendars+times+'</div>');

    if(!skipRefresh){
      const matching=calendarByKey.get(calendarKey(productId,s.rateId||null));
      const stale=!matching || Date.now()-matching.fetchedAt>=60000;
      if(stale){
        refreshCalendar(productId,{force:true}).then(()=>{
          if(activeProductId===productId && sheet && !sheet.hidden && sheet.classList.contains('is-open')){
            openDateSheet(productId,{skipRefresh:true});
          }
        }).catch(error=>console.error('[LoveTravel] calendar refresh failed',error));
      }
    }

    root.querySelectorAll('[data-lt-date]').forEach(btn=>btn.addEventListener('click',async()=>{
      const date=btn.dataset.ltDate;
      patchSelection(productId,{date});
      const cachedTimes=calendarTimesForDate(productId,date);
      if(cachedTimes.length===1){
        patchSelection(productId,{slotId:cachedTimes[0].id,startTimeId:cachedTimes[0].startTimeId});
        await resolve(productId,{quiet:true});
        closeSheet();
        return;
      }
      if(cachedTimes.length>1){
        openDateSheet(productId,{skipRefresh:true});
        return;
      }
      const next=await resolve(productId,{quiet:true});
      const exactTimes=arr(next.constraints?.times);
      if(exactTimes.length===1){
        patchSelection(productId,{slotId:exactTimes[0].id,startTimeId:exactTimes[0].startTimeId});
        await resolve(productId,{quiet:true});
        closeSheet();
      } else {
        openDateSheet(productId,{skipRefresh:true});
      }
    }));
    root.querySelectorAll('[data-lt-slot]').forEach(btn=>btn.addEventListener('click',async()=>{
      patchSelection(productId,{slotId:btn.dataset.ltSlot,startTimeId:btn.dataset.ltTime||null});
      await resolve(productId,{quiet:true});
      closeSheet();
    }));
  }
  function openOptionSheet(productId){
    const r=resolutionByProduct.get(productId); if(!r) return;
    const s=selection(productId);
    const rows=arr(r.constraints?.rates);
    const body='<div class="lt-sheet-scroll"><div class="lt-option-list">'+rows.map(rate=>
      '<button type="button" class="lt-option-card '+(String(rate.id)===String(s.rateId)?'is-active':'')+'" data-lt-rate="'+esc(rate.id)+'">'+
        '<span><b>'+esc(rate.title||rate.code||rate.id)+'</b>'+(rate.code?'<small>'+esc(rate.code)+'</small>':'')+'</span>'+
        '<span class="lt-option-card__price">'+(rate.fromPrice?'<small>'+esc(t().from)+'</small><strong>'+esc(money(rate.fromPrice.amount,rate.fromPrice.currency))+'</strong>':'')+'</span>'+
      '</button>'
    ).join('')+'</div></div>';
    const root=showSheet(t().chooseOption,body);
    root.querySelectorAll('[data-lt-rate]').forEach(btn=>btn.addEventListener('click',async()=>{
      patchSelection(productId,{rateId:btn.dataset.ltRate});
      await resolve(productId,{quiet:true});
      closeSheet();
      refreshCalendar(productId,{force:true}).catch(error=>console.error('[LoveTravel] rate calendar refresh failed',error));
    }));
  }
  function openGuestsSheet(productId){
    const r=resolutionByProduct.get(productId); if(!r) return;
    const participants=arr(r.constraints?.participants);
    const body='<div class="lt-sheet-scroll"><div class="lt-guest-list">'+participants.map(item=>
      '<div class="lt-guest-row" data-lt-guest-row="'+esc(item.id)+'">'+
        '<div><b>'+esc(guestLabel(item))+'</b><small>'+esc(item.minAge+'–'+item.maxAge+' '+t().years)+'</small></div>'+
        '<div class="lt-counter"><button type="button" data-lt-guest-minus="'+esc(item.id)+'">−</button><strong data-lt-guest-count="'+esc(item.id)+'">'+esc(item.count||0)+'</strong><button type="button" data-lt-guest-plus="'+esc(item.id)+'">+</button></div>'+
      '</div>'
    ).join('')+'</div><div class="lt-sheet-action"><button type="button" class="lt-sheet-primary" data-lt-guests-done>'+esc(t().verify)+'</button></div></div>';
    const root=showSheet(t().chooseGuests,body);
    const updateCount=(id,delta)=>{
      const current=selection(productId);
      const participants={...current.participants};
      participants[id]=Math.max(0,Number(participants[id]||0)+delta);
      patchSelection(productId,{participants});
      const node=root.querySelector('[data-lt-guest-count="'+CSS.escape(id)+'"]'); if(node) node.textContent=participants[id];
    };
    root.querySelectorAll('[data-lt-guest-minus]').forEach(btn=>btn.addEventListener('click',()=>updateCount(btn.dataset.ltGuestMinus,-1)));
    root.querySelectorAll('[data-lt-guest-plus]').forEach(btn=>btn.addEventListener('click',()=>updateCount(btn.dataset.ltGuestPlus,1)));
    root.querySelector('[data-lt-guests-done]')?.addEventListener('click',async()=>{ await resolve(productId,{quiet:true}); closeSheet(); });
  }
  function pickupPlaceRows(places,s){
    if(!places.length) return '<div class="lt-empty">'+esc(t().noPlaces)+'</div>';
    return places.map(place=>
      '<button type="button" class="lt-pickup-place '+(String(place.id)===String(s.pickup?.placeId)?'is-active':'')+'" data-lt-place="'+esc(place.id)+'">'+
        '<span><b>'+esc(place.title)+'</b><small>'+esc(place.wholeAddress||[place.addressLine1,place.city].filter(Boolean).join(', '))+'</small></span>'+
        (place.askForRoomNumber?'<i>room</i>':'')+
      '</button>'
    ).join('');
  }
  function openPickupSheet(productId,query=''){
    const r=resolutionByProduct.get(productId); if(!r) return;
    const p=r.constraints?.pickup||{};
    const s=selection(productId);
    const mode=s.pickup?.mode;
    const allPlaces=arr(p.places);
    const selectedPlace=allPlaces.find(place=>String(place.id)===String(s.pickup?.placeId))||null;
    const filterPlaces=value=>{
      const q=String(value||'').trim().toLocaleLowerCase();
      return (q?allPlaces.filter(x=>(x.title+' '+x.wholeAddress+' '+x.city).toLocaleLowerCase().includes(q)):allPlaces).slice(0,60);
    };
    const initialPlaces=filterPlaces(query);
    const pickupDetails=mode==='PICKUP'
      ? '<div class="lt-pickup-search"><label>'+esc(t().pickupPlace)+'</label><input type="search" value="'+esc(query)+'" placeholder="'+esc(t().searchHotel)+'" data-lt-pickup-search autocomplete="off"></div>'+
        '<div class="lt-pickup-results" data-lt-pickup-results>'+pickupPlaceRows(initialPlaces,s)+'</div>'+
        (selectedPlace?.askForRoomNumber
          ? '<div class="lt-pickup-room"><label><span>'+esc(t().roomNumber)+' *</span><input type="text" value="'+esc(s.pickup?.roomNumber||'')+'" data-lt-room-number autocomplete="off"></label><button type="button" class="lt-sheet-primary" data-lt-room-save>'+esc(t().save)+'</button></div>'
          : '')+
        (p.customAllowed
          ? '<div class="lt-custom-pickup"><span class="lt-form-caption">'+esc(t().customPickup)+'</span><label><span>'+esc(t().customPickupAddress)+'</span><input type="text" value="'+esc(s.pickup?.customLocation?.wholeAddress||s.pickup?.customLocation?.addressLine1||'')+'" data-lt-custom-pickup autocomplete="street-address"></label><button type="button" class="lt-sheet-secondary" data-lt-custom-pickup-save>'+esc(t().save)+'</button></div>'
          : '')
      : '';
    const body='<div class="lt-sheet-scroll">'+
      '<div class="lt-pickup-modes">'+
        (arr(p.modes).includes('MEET_ON_LOCATION')?pickupModeCard('MEET_ON_LOCATION',t().meet,mode==='MEET_ON_LOCATION',''):'')+
        (arr(p.modes).includes('PICKUP')?pickupModeCard('PICKUP',t().pickupMode,mode==='PICKUP',p.pricingType==='INCLUDED_IN_PRICE'?t().included:''):'')+
      '</div>'+pickupDetails+'</div>';
    const root=showSheet(t().choosePickup,body);
    root.querySelectorAll('[data-lt-pickup-mode]').forEach(btn=>btn.addEventListener('click',async()=>{
      const selectedMode=btn.dataset.ltPickupMode;
      patchSelection(productId,{pickup:{
        mode:selectedMode,
        placeId:selectedMode==='PICKUP'?selection(productId).pickup.placeId:null,
        customLocation:selectedMode==='PICKUP'?selection(productId).pickup.customLocation:null,
        roomNumber:selectedMode==='PICKUP'?selection(productId).pickup.roomNumber:'',
      }});
      await resolve(productId,{quiet:true});
      if(selectedMode==='MEET_ON_LOCATION') closeSheet(); else openPickupSheet(productId);
    }));
    const search=root.querySelector('[data-lt-pickup-search]');
    const results=root.querySelector('[data-lt-pickup-results]');
    search?.addEventListener('input',e=>{
      if(results) results.innerHTML=pickupPlaceRows(filterPlaces(e.target.value),selection(productId));
    });
    results?.addEventListener('click',async e=>{
      const btn=e.target.closest('[data-lt-place]'); if(!btn) return;
      const currentQuery=search?.value||'';
      patchSelection(productId,{pickup:{mode:'PICKUP',placeId:btn.dataset.ltPlace,customLocation:null,roomNumber:''}});
      const next=await resolve(productId,{quiet:true});
      const place=next.resolved?.pickupPlace;
      if(place?.askForRoomNumber) openPickupSheet(productId,currentQuery);
      else closeSheet();
    });
    root.querySelector('[data-lt-room-save]')?.addEventListener('click',async()=>{
      const roomNumber=root.querySelector('[data-lt-room-number]')?.value.trim()||'';
      patchSelection(productId,{pickup:{roomNumber}});
      const next=await resolve(productId,{quiet:true});
      if(arr(next.bookingDataIssues).some(item=>item.code==='pickup_room_number_required')) openPickupSheet(productId,search?.value||'');
      else closeSheet();
    });
    root.querySelector('[data-lt-custom-pickup-save]')?.addEventListener('click',async()=>{
      const address=root.querySelector('[data-lt-custom-pickup]')?.value.trim()||'';
      patchSelection(productId,{pickup:{
        mode:'PICKUP',
        placeId:null,
        roomNumber:'',
        customLocation:address?{addressLine1:address,wholeAddress:address}: {},
      }});
      const next=await resolve(productId,{quiet:true});
      if(arr(next.bookingDataIssues).some(item=>item.code==='custom_pickup_location_incomplete')) openPickupSheet(productId,search?.value||'');
      else closeSheet();
    });
  }
  function pickupModeCard(mode,title,active,note){
    return '<button type="button" class="lt-pickup-mode '+(active?'is-active':'')+'" data-lt-pickup-mode="'+esc(mode)+'"><span class="lt-radio"></span><span><b>'+esc(title)+'</b>'+(note?'<small>'+esc(note)+'</small>':'')+'</span></button>';
  }
  function questionContext(item){
    const value=String(item?.context||'').toUpperCase();
    if(value.includes('PASSENGER')||value.includes('PARTICIPANT')) return 'PASSENGER';
    if(value.includes('EXTRA')) return 'EXTRA';
    return 'BOOKING';
  }
  function questionAppliesToCategory(item,categoryId){
    if(String(item?.pricingCategoryTriggerSelection||'').toUpperCase()!=='SELECTED_ONLY') return true;
    return arr(item?.pricingCategoryTriggers).some(value=>String(value?.id??value)===String(categoryId));
  }
  function questionAppliesToExtra(item,extraId){
    if(String(item?.extraTriggerSelection||'').toUpperCase()!=='SELECTED_ONLY') return true;
    return arr(item?.extraTriggers).some(value=>String(value?.id??value)===String(extraId));
  }
  function controlValue(node){
    if(!node) return '';
    if(node.tagName==='SELECT'&&node.multiple) return [...node.selectedOptions].map(option=>option.value);
    return String(node.value??'').trim();
  }
  function questionControl(item,value,attributeName,attributeValue,extraAttributes=''){
    const key=String(attributeValue||answerKey(item));
    const title=item?.title||item?.code||key;
    const required=item?.required?' *':'';
    const description=item?.description?'<small>'+esc(item.description)+'</small>':'';
    const attrs=' '+attributeName+'="'+esc(key)+'" '+extraAttributes;
    const options=arr(item?.options);
    const normalizedValues=Array.isArray(value)?value.map(String):[String(value??'')];
    let control='';
    const typeName=String(item?.dataType||'').toUpperCase();
    if((item?.selectFromOptions||options.length)&&options.length){
      control='<select'+attrs+(item?.selectMultiple?' multiple':'')+'>'+
        (item?.selectMultiple?'':'<option value=""></option>')+
        options.map(option=>{
          const optionValue=String(option?.value??option?.id??option?.label??'');
          const selected=normalizedValues.includes(optionValue)?' selected':'';
          return '<option value="'+esc(optionValue)+'"'+selected+'>'+esc(option?.label||optionValue)+'</option>';
        }).join('')+
      '</select>';
    }else if(typeName.includes('BOOLEAN')){
      const current=String(Array.isArray(value)?value[0]??'':value??'').toLowerCase();
      control='<select'+attrs+'><option value=""></option><option value="true"'+(current==='true'||current==='1'||current==='yes'?' selected':'')+'>Yes</option><option value="false"'+(current==='false'||current==='0'||current==='no'?' selected':'')+'>No</option></select>';
    }else{
      const type=typeName.includes('DATE')?'date':typeName.includes('NUMBER')||typeName.includes('INTEGER')||typeName.includes('DECIMAL')?'number':'text';
      control='<input type="'+type+'" value="'+esc(Array.isArray(value)?value[0]||'':value||'')+'"'+attrs+
        (item?.placeholder?' placeholder="'+esc(item.placeholder)+'"':'')+
        (item?.pattern?' pattern="'+esc(item.pattern)+'"':'')+
        ' autocomplete="off">';
    }
    return '<label class="lt-contact-field lt-contact-field--wide"><span>'+esc(title)+required+'</span>'+description+control+'</label>';
  }
  function bookingFieldSpec(item,defaultRequired=true){
    if(typeof item==='string') return {field:canonicalField(item),required:defaultRequired};
    const field=canonicalField(item?.field||item?.name||item?.code||'');
    if(!field) return null;
    return {field,required:item?.required===undefined?defaultRequired:Boolean(item.required)};
  }
  function answerKey(item){ return String(item?.id||item?.code||item?.title||''); }
  function inputType(field){ return field==='phoneNumber'?'tel':field==='email'?'email':'text'; }
  function passengerBlueprint(r){
    const list=[];
    for(const category of arr(r?.constraints?.participants)){
      const count=Math.max(0,Number(category.count)||0);
      for(let i=0;i<count;i+=1) list.push({categoryId:String(category.id),label:guestLabel(category),categoryIndex:i+1});
    }
    return list;
  }
  function passengerExtraState(passenger,extraId){
    const item=passenger?.extras?.[extraId];
    if(item&&typeof item==='object') return {quantity:Math.max(0,Number(item.quantity)||0),answers:{...(item.answers||{})}};
    return {quantity:Math.max(0,Number(item)||0),answers:{}};
  }
  function normalizedPassengerList(r,s){
    const blueprint=passengerBlueprint(r);
    return blueprint.map((descriptor,index)=>{
      const previous=s.passengers?.[index]||{};
      return {
        ...previous,
        categoryId:descriptor.categoryId,
        answers:{...(previous.answers||{})},
        extras:{...(previous.extras||{})},
      };
    });
  }
  function openExtrasSheet(productId){
    const r=resolutionByProduct.get(productId); if(!r) return;
    const extras=arr(r.constraints?.extras);
    const req=r.constraints?.bookingRequirements||{};
    if(!extras.length){
      showSheet(t().chooseExtras,'<div class="lt-sheet-scroll"><div class="lt-empty">'+esc(t().noExtra)+'</div></div>');
      return;
    }

    let s=selection(productId);
    const bookingExtras={...s.extras};
    const passengers=normalizedPassengerList(r,s);
    let preselectedChanged=false;
    for(const extra of extras.filter(item=>item.required)){
      const id=String(extra.id||'');
      if(!id) continue;
      if(extra.pricedPerPerson){
        passengers.forEach(passenger=>{
          const current=passengerExtraState(passenger,id);
          if(current.quantity<1){
            passenger.extras={...passenger.extras,[id]:{...current,quantity:1}};
            preselectedChanged=true;
          }
        });
      }else if(Number(bookingExtras[id]||0)<1){
        bookingExtras[id]=1;
        preselectedChanged=true;
      }
    }
    if(preselectedChanged){
      patchSelection(productId,{extras:bookingExtras,passengers});
      s=selection(productId);
    }

    const extraQuestions=arr(req.questions).filter(item=>questionContext(item)==='EXTRA');
    const blueprint=passengerBlueprint(r);
    const body='<div class="lt-sheet-scroll"><div class="lt-extra-list">'+extras.map(item=>{
      const id=String(item.id||'');
      if(item.pricedPerPerson){
        const paxRows=blueprint.map((descriptor,index)=>{
          const passenger=s.passengers?.[index]||{categoryId:descriptor.categoryId,extras:{}};
          const extraState=passengerExtraState(passenger,id);
          const quantity=extraState.quantity;
          const questions=quantity>0?extraQuestions.filter(question=>
            questionAppliesToExtra(question,id)&&questionAppliesToCategory(question,descriptor.categoryId)
          ):[];
          const questionHtml=questions.length?'<div class="lt-extra-questions">'+questions.map(question=>{
            const key=answerKey(question);
            return questionControl(
              question,
              extraState.answers?.[key],
              'data-lt-passenger-extra-answer',
              key,
              'data-lt-extra-id="'+esc(id)+'" data-lt-passenger-index="'+index+'"'
            );
          }).join('')+'</div>':'';
          return '<div class="lt-passenger-extra" data-lt-passenger-extra="'+index+':'+esc(id)+'">'+
            '<div class="lt-extra-row">'+
              '<div><b>'+esc(descriptor.label)+' '+descriptor.categoryIndex+'</b><small>'+esc(item.title||item.code||id)+(item.required?' · required':'')+'</small></div>'+
              '<div class="lt-counter"><button type="button" data-lt-passenger-extra-minus data-lt-extra-id="'+esc(id)+'" data-lt-passenger-index="'+index+'">−</button><strong data-lt-passenger-extra-count="'+index+':'+esc(id)+'">'+quantity+'</strong><button type="button" data-lt-passenger-extra-plus data-lt-extra-id="'+esc(id)+'" data-lt-passenger-index="'+index+'">+</button></div>'+
            '</div>'+questionHtml+
          '</div>';
        }).join('');
        return '<div class="lt-extra-card" data-lt-extra-card="'+esc(id)+'"><div class="lt-extra-card__head"><b>'+esc(item.title||item.code||id)+(item.required?' *':'')+'</b>'+(item.description?'<small>'+esc(item.description)+'</small>':'')+'</div>'+paxRows+'</div>';
      }

      const quantity=Number(s.extras?.[id]||0);
      const questions=quantity>0?extraQuestions.filter(question=>questionAppliesToExtra(question,id)):[];
      const questionHtml=questions.length?'<div class="lt-extra-questions">'+questions.map(question=>{
        const key=answerKey(question);
        return questionControl(
          question,
          s.extraAnswers?.[id]?.[key],
          'data-lt-extra-answer',
          key,
          'data-lt-extra-id="'+esc(id)+'"'
        );
      }).join('')+'</div>':'';
      return '<div class="lt-extra-card" data-lt-extra-card="'+esc(id)+'">'+
        '<div class="lt-extra-row" data-lt-extra-row="'+esc(id)+'">'+
          '<div><b>'+esc(item.title||item.code||id)+(item.required?' *':'')+'</b>'+(item.description?'<small>'+esc(item.description)+'</small>':'')+'</div>'+
          '<div class="lt-counter"><button type="button" data-lt-extra-minus="'+esc(id)+'">−</button><strong data-lt-extra-count="'+esc(id)+'">'+esc(quantity)+'</strong><button type="button" data-lt-extra-plus="'+esc(id)+'">+</button></div>'+
        '</div>'+questionHtml+
      '</div>';
    }).join('')+'</div><div class="lt-sheet-action"><button type="button" class="lt-sheet-primary" data-lt-extras-done>'+esc(t().verify)+'</button></div></div>';
    const root=showSheet(t().chooseExtras,body);

    const updateBookingExtra=(id,delta)=>{
      const state=selection(productId);
      const extrasState={...state.extras};
      const item=extras.find(extra=>String(extra.id)===String(id));
      const min=item?.required?1:0;
      const max=item?.maxQuantity===null||item?.maxQuantity===undefined?Infinity:Number(item.maxQuantity);
      const next=Math.max(min,Math.min(max,Number(extrasState[id]||0)+delta));
      if(next>0) extrasState[id]=next; else delete extrasState[id];
      patchSelection(productId,{extras:extrasState});
      const node=root.querySelector('[data-lt-extra-count="'+CSS.escape(id)+'"]'); if(node) node.textContent=String(next);
    };
    root.querySelectorAll('[data-lt-extra-minus]').forEach(btn=>btn.addEventListener('click',()=>updateBookingExtra(btn.dataset.ltExtraMinus,-1)));
    root.querySelectorAll('[data-lt-extra-plus]').forEach(btn=>btn.addEventListener('click',()=>updateBookingExtra(btn.dataset.ltExtraPlus,1)));

    const updatePassengerExtra=(index,id,delta)=>{
      const state=selection(productId);
      const passengerList=normalizedPassengerList(r,state);
      const item=extras.find(extra=>String(extra.id)===String(id));
      const passenger=passengerList[index]; if(!passenger) return;
      const current=passengerExtraState(passenger,id);
      const totalBefore=passengerList.reduce((sum,pax)=>sum+passengerExtraState(pax,id).quantity,0);
      const min=item?.required?1:0;
      const maxTotal=item?.maxQuantity===null||item?.maxQuantity===undefined?Infinity:Number(item.maxQuantity);
      const desired=Math.max(min,current.quantity+delta);
      const allowed=Math.max(min,Math.min(desired,current.quantity+Math.max(0,maxTotal-totalBefore)));
      passenger.extras={...passenger.extras};
      if(allowed>0) passenger.extras[id]={...current,quantity:allowed}; else delete passenger.extras[id];
      patchSelection(productId,{passengers:passengerList});
      const node=root.querySelector('[data-lt-passenger-extra-count="'+CSS.escape(index+':'+id)+'"]'); if(node) node.textContent=String(allowed);
    };
    root.querySelectorAll('[data-lt-passenger-extra-minus]').forEach(btn=>btn.addEventListener('click',()=>updatePassengerExtra(Number(btn.dataset.ltPassengerIndex),btn.dataset.ltExtraId,-1)));
    root.querySelectorAll('[data-lt-passenger-extra-plus]').forEach(btn=>btn.addEventListener('click',()=>updatePassengerExtra(Number(btn.dataset.ltPassengerIndex),btn.dataset.ltExtraId,1)));

    root.querySelector('[data-lt-extras-done]')?.addEventListener('click',async()=>{
      const state=selection(productId);
      const extraAnswers={...state.extraAnswers};
      root.querySelectorAll('[data-lt-extra-answer]').forEach(control=>{
        const extraId=control.dataset.ltExtraId;
        const key=control.dataset.ltExtraAnswer;
        extraAnswers[extraId]={...(extraAnswers[extraId]||{}),[key]:controlValue(control)};
      });

      const passengerList=normalizedPassengerList(r,state);
      root.querySelectorAll('[data-lt-passenger-extra-answer]').forEach(control=>{
        const index=Number(control.dataset.ltPassengerIndex);
        const extraId=control.dataset.ltExtraId;
        const key=control.dataset.ltPassengerExtraAnswer;
        const passenger=passengerList[index]; if(!passenger) return;
        const current=passengerExtraState(passenger,extraId);
        passenger.extras={...passenger.extras,[extraId]:{
          ...current,
          answers:{...current.answers,[key]:controlValue(control)},
        }};
      });
      patchSelection(productId,{extraAnswers,passengers:passengerList});
      const next=await resolve(productId,{quiet:true});
      if(arr(next.bookingDataIssues).some(item=>
        item.code==='required_extra_missing'||
        item.code==='required_passenger_extra_missing'||
        String(item.code).includes('extra_booking_question')
      )) openExtrasSheet(productId);
      else closeSheet();
    });
  }
  function openContactSheet(productId){
    const r=resolutionByProduct.get(productId); if(!r) return;
    const req=r.constraints?.bookingRequirements||{};
    const s=selection(productId);
    const customerSpecMap=new Map();
    for(const field of arr(req.requiredCustomerFields).map(canonicalField).filter(Boolean)){
      customerSpecMap.set(field,{field,required:true});
    }
    for(const spec of arr(req.mainContactFields).map(item=>bookingFieldSpec(item,true)).filter(Boolean)){
      const previous=customerSpecMap.get(spec.field);
      customerSpecMap.set(spec.field,{field:spec.field,required:Boolean(previous?.required||spec.required)});
    }
    const customerSpecs=[...customerSpecMap.values()];
    const customerInputs=customerSpecs.map(spec=>{
      const field=spec.field;
      return '<label class="lt-contact-field"><span>'+esc(fieldLabel(field))+(spec.required?' *':'')+'</span><input type="'+inputType(field)+'" value="'+esc(s.customer?.[field]||'')+'" data-lt-customer="'+esc(field)+'" autocomplete="'+esc(autoComplete(field))+'"></label>';
    }).join('');

    const bookingQuestions=arr(req.questions).filter(item=>questionContext(item)==='BOOKING');
    const questionInputs=[
      ...bookingQuestions.map(item=>questionControl(item,s.answers?.[answerKey(item)],'data-lt-answer',answerKey(item))),
      ...arr(req.customFields).map(item=>{
        const key=answerKey(item);
        return '<label class="lt-contact-field lt-contact-field--wide"><span>'+esc(item.title||item.code||key)+(item.required?' *':'')+'</span>'+
          (item.description?'<small>'+esc(item.description)+'</small>':'')+
          '<input type="text" value="'+esc(s.answers?.[key]||'')+'" data-lt-answer="'+esc(key)+'" autocomplete="off"></label>';
      }),
    ].join('');

    const passengerSpecMap=new Map();
    for(const spec of arr(req.passengerFields).map(item=>bookingFieldSpec(item,true)).filter(Boolean)){
      const previous=passengerSpecMap.get(spec.field);
      passengerSpecMap.set(spec.field,{field:spec.field,required:Boolean(previous?.required||spec.required)});
    }
    const passengerSpecs=[...passengerSpecMap.values()];
    const passengerQuestions=arr(req.questions).filter(item=>questionContext(item)==='PASSENGER');
    const passengers=passengerBlueprint(r);
    const passengerInputs=(passengerSpecs.length||passengerQuestions.length)?passengers.map((descriptor,index)=>{
      const existing=s.passengers?.[index]||{};
      const questions=passengerQuestions.filter(question=>questionAppliesToCategory(question,descriptor.categoryId));
      return '<div class="lt-passenger-card" data-lt-passenger="'+index+'" data-lt-category="'+esc(descriptor.categoryId)+'">'+
        '<div class="lt-passenger-card__head"><b>'+esc(t().passenger)+' '+(index+1)+'</b><small>'+esc(descriptor.label)+' '+descriptor.categoryIndex+'</small></div>'+
        '<div class="lt-contact-grid">'+
          passengerSpecs.map(spec=>{
            const field=spec.field;
            return '<label class="lt-contact-field"><span>'+esc(fieldLabel(field))+(spec.required?' *':'')+'</span><input type="'+inputType(field)+'" value="'+esc(existing?.[field]||'')+'" data-lt-passenger-field="'+esc(field)+'" autocomplete="'+esc(autoComplete(field))+'"></label>';
          }).join('')+
          questions.map(question=>questionControl(
            question,
            existing?.answers?.[answerKey(question)],
            'data-lt-passenger-answer',
            answerKey(question)
          )).join('')+
        '</div></div>';
    }).join(''):'';

    const body='<div class="lt-sheet-scroll">'+
      (customerInputs?'<div class="lt-form-section"><span class="lt-form-caption">'+esc(t().contact)+'</span><div class="lt-contact-grid">'+customerInputs+'</div></div>':'')+
      (questionInputs?'<div class="lt-form-section"><span class="lt-form-caption">'+esc(t().questions)+'</span><div class="lt-contact-grid">'+questionInputs+'</div></div>':'')+
      (passengerInputs?'<div class="lt-form-section"><span class="lt-form-caption">'+esc(t().passengerDetails)+'</span>'+passengerInputs+'</div>':'')+
      '<p class="lt-booking-note">'+esc(t().bookingNotSent)+'</p>'+
      '<div class="lt-sheet-action"><button type="button" class="lt-sheet-primary" data-lt-contact-check>'+esc(r.readyToBook?t().verified:t().verify)+'</button></div></div>';
    const root=showSheet(t().contact,body);
    root.querySelector('[data-lt-contact-check]')?.addEventListener('click',async()=>{
      const customer={...selection(productId).customer};
      root.querySelectorAll('[data-lt-customer]').forEach(input=>customer[input.dataset.ltCustomer]=input.value.trim());

      const answers={...selection(productId).answers};
      root.querySelectorAll('[data-lt-answer]').forEach(input=>answers[input.dataset.ltAnswer]=controlValue(input));

      const previousPassengers=selection(productId).passengers||[];
      const passengerRows=[...root.querySelectorAll('[data-lt-passenger]')];
      const passengers=passengerRows.map((row,index)=>{
        const item={...previousPassengers[index],categoryId:row.dataset.ltCategory||null,answers:{...(previousPassengers[index]?.answers||{})}};
        row.querySelectorAll('[data-lt-passenger-field]').forEach(input=>item[input.dataset.ltPassengerField]=input.value.trim());
        row.querySelectorAll('[data-lt-passenger-answer]').forEach(control=>item.answers[control.dataset.ltPassengerAnswer]=controlValue(control));
        return item;
      });

      patchSelection(productId,{customer,answers,passengers});
      const next=await resolve(productId,{quiet:true});
      const hasContactIssues=arr(next.bookingDataIssues).some(item=>
        ['required_customer_field_missing','required_booking_question_missing','invalid_booking_question_answer','required_custom_field_missing','passenger_details_incomplete','passenger_field_missing','required_passenger_booking_question_missing','invalid_passenger_booking_question_answer'].includes(item.code)
      );
      if(next.readyToBook||(!hasContactIssues&&requiredCustomerComplete(next))){
        const btn=root.querySelector('[data-lt-contact-check]'); if(btn){btn.textContent=t().verified;btn.classList.add('is-success');}
        setTimeout(closeSheet,550);
      }else openContactSheet(productId);
    });
  }

  function canonicalField(field){
    const key=String(field||'').replace(/[^a-z0-9]/gi,'').toLowerCase();
    return ({firstname:'firstName',lastname:'lastName',phonenumber:'phoneNumber',phone:'phoneNumber',email:'email'})[key]||String(field||'');
  }
  function fieldLabel(field){
    const known={firstName:t().firstName,lastName:t().lastName,phoneNumber:t().phoneNumber,email:t().email};
    if(known[field]) return known[field];
    return String(field||'').replace(/[_-]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').trim();
  }
  function autoComplete(field){ return ({firstName:'given-name',lastName:'family-name',phoneNumber:'tel',email:'email'})[field]||'off'; }

  async function bootstrap(productId){
    activeProductId=productId;
    selection(productId);
    try{
      let r=await resolve(productId,{quiet:true});
      if(activeProductId!==productId) return;
      const current=selection(productId);
      if(!Object.values(current.participants||{}).some(x=>Number(x)>0)){
        const adult=arr(r.constraints?.participants).find(x=>String(x.ticketCategory).toUpperCase()==='ADULT') || arr(r.constraints?.participants)[0];
        if(adult){
          patchSelection(productId,{participants:{[String(adult.id)]:1}});
          r=await resolve(productId,{quiet:true});
        }
      }
      render(productId);
    }catch(_){}
  }
  function detectProduct(){
    const screen=document.querySelector('#tourScreen');
    const id=String(screen?.dataset?.ltDomainProduct||'');
    if(!PRODUCT_IDS.has(id) || !screen.querySelector('.lt-domain-shell')) return;
    const mounted=Boolean(screen.querySelector('[data-lt-config="'+CSS.escape(id)+'"]'));
    if(id!==activeProductId || !resolutionByProduct.has(id) || !mounted) bootstrap(id);
  }
  const observer=new MutationObserver(()=>detectProduct());
  function start(){
    const screen=document.querySelector('#tourScreen');
    if(!screen){ setTimeout(start,60); return; }
    observer.observe(screen,{subtree:true,childList:true,attributes:true,attributeFilter:['data-lt-domain-product','class']});
    detectProduct();
  }
  document.addEventListener('click',e=>{
    if(e.target.closest?.('.mt-language-switcher button') && activeProductId) setTimeout(()=>render(activeProductId),100);
  },true);
  start();
  globalThis.LoveTravelBookingConfigurator={
    resolve:()=>activeProductId?resolve(activeProductId):Promise.resolve(null),
    selection:()=>activeProductId?selection(activeProductId):null,
    resolution:()=>activeProductId?resolutionByProduct.get(activeProductId)||null:null,
    calendar:()=>activeProductId?calendarFor(activeProductId):null,
    refreshCalendar:()=>activeProductId?refreshCalendar(activeProductId,{force:true}):Promise.resolve(null),
    open:step=>activeProductId&&openSheet(activeProductId,step||firstBlockingStep(resolutionByProduct.get(activeProductId))),
  };
})();