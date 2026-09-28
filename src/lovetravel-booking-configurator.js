(() => {
  'use strict';

  const PRODUCT_IDS = new Set(['1287578','1287580']);
  const stateByProduct = new Map();
  const resolutionByProduct = new Map();
  let activeProductId = null;
  let requestSeq = 0;
  let sheet = null;

  const copy = {
    ru:{
      title:'Соберите поездку', live:'Актуальные места и цены из системы туроператора',
      date:'Дата и время', dateEmpty:'Выберите дату', option:'Вариант', optionEmpty:'Выберите вариант',
      guests:'Участники', guestsEmpty:'Добавьте участников', pickup:'Как добраться', pickupEmpty:'Выберите способ',
      meet:'Встретимся на месте', pickupMode:'Забрать из отеля', included:'включено в цену',
      total:'Итого', from:'от', continue:'Продолжить', check:'Проверить данные', ready:'Конфигурация проверена',
      unavailable:'Комбинация недоступна', updating:'Проверяем актуальные данные…',
      chooseDate:'Выберите дату', chooseTime:'Выберите время', chooseOption:'Выберите вариант экскурсии',
      chooseGuests:'Укажите участников', choosePickup:'Выберите способ встречи',
      available:'мест доступно', spots:'мест', adult:'Взрослый', child:'Ребёнок', infant:'Младенец',
      years:'лет', close:'Закрыть', searchHotel:'Найдите отель или точку посадки',
      pickupPlace:'Место посадки', roomNeeded:'Для этой точки Bókun запрашивает номер комнаты на этапе оформления.',
      contact:'Контактные данные', firstName:'Имя', lastName:'Фамилия', phoneNumber:'Телефон', email:'Email',
      verify:'Проверить', verified:'Данные проверены', noPlaces:'Ничего не найдено',
      select:'Выбрать', selected:'Выбрано', pricePerPerson:'за человека', liveQuote:'Цена проверена сейчас',
      refreshError:'Не удалось обновить доступность. Попробуйте ещё раз.',
      minGuests:'Минимум', maxGuests:'Максимум', noExtra:'Дополнительных услуг сейчас нет',
      bookingNotSent:'Бронирование пока не отправляется в Bókun — на этом этапе проверяется конфигурация.',
      selectDateFirst:'Сначала выберите дату', selectOptionFirst:'Выберите вариант', selectGuestsFirst:'Добавьте участников',
      pickupRequired:'Нужно выбрать способ встречи', contactRequired:'Нужно заполнить контактные данные'
    },
    en:{
      title:'Build your trip', live:'Live availability and pricing from the operator system',
      date:'Date & time', dateEmpty:'Choose a date', option:'Option', optionEmpty:'Choose an option',
      guests:'Guests', guestsEmpty:'Add guests', pickup:'Getting there', pickupEmpty:'Choose a method',
      meet:'Meet on location', pickupMode:'Hotel pickup', included:'included in price',
      total:'Total', from:'from', continue:'Continue', check:'Check details', ready:'Configuration checked',
      unavailable:'Combination unavailable', updating:'Checking live data…',
      chooseDate:'Choose a date', chooseTime:'Choose a time', chooseOption:'Choose a tour option',
      chooseGuests:'Add guests', choosePickup:'Choose how to meet',
      available:'spots available', spots:'spots', adult:'Adult', child:'Child', infant:'Infant',
      years:'years', close:'Close', searchHotel:'Search hotel or pickup point',
      pickupPlace:'Pickup point', roomNeeded:'Bókun asks for a room number for this pickup point during checkout.',
      contact:'Contact details', firstName:'First name', lastName:'Last name', phoneNumber:'Phone', email:'Email',
      verify:'Check', verified:'Details checked', noPlaces:'No matches',
      select:'Select', selected:'Selected', pricePerPerson:'per person', liveQuote:'Price checked live',
      refreshError:'Could not refresh availability. Try again.',
      minGuests:'Minimum', maxGuests:'Maximum', noExtra:'No extras are currently configured',
      bookingNotSent:'The booking is not sent to Bókun yet — this stage validates the configuration.',
      selectDateFirst:'Choose a date first', selectOptionFirst:'Choose an option', selectGuestsFirst:'Add guests',
      pickupRequired:'Choose how to meet', contactRequired:'Complete the contact details'
    },
    vi:{
      title:'Tạo chuyến đi', live:'Giá và chỗ trống trực tiếp từ hệ thống điều hành',
      date:'Ngày & giờ', dateEmpty:'Chọn ngày', option:'Lựa chọn', optionEmpty:'Chọn chương trình',
      guests:'Khách', guestsEmpty:'Thêm khách', pickup:'Di chuyển', pickupEmpty:'Chọn cách gặp',
      meet:'Gặp tại điểm hẹn', pickupMode:'Đón tại khách sạn', included:'đã gồm trong giá',
      total:'Tổng', from:'từ', continue:'Tiếp tục', check:'Kiểm tra thông tin', ready:'Đã kiểm tra cấu hình',
      unavailable:'Lựa chọn không khả dụng', updating:'Đang kiểm tra dữ liệu mới nhất…',
      chooseDate:'Chọn ngày', chooseTime:'Chọn giờ', chooseOption:'Chọn chương trình',
      chooseGuests:'Chọn số khách', choosePickup:'Chọn cách gặp',
      available:'chỗ còn trống', spots:'chỗ', adult:'Người lớn', child:'Trẻ em', infant:'Em bé',
      years:'tuổi', close:'Đóng', searchHotel:'Tìm khách sạn hoặc điểm đón',
      pickupPlace:'Điểm đón', roomNeeded:'Bókun yêu cầu số phòng cho điểm đón này trong bước thanh toán.',
      contact:'Thông tin liên hệ', firstName:'Tên', lastName:'Họ', phoneNumber:'Điện thoại', email:'Email',
      verify:'Kiểm tra', verified:'Đã kiểm tra', noPlaces:'Không có kết quả',
      select:'Chọn', selected:'Đã chọn', pricePerPerson:'mỗi người', liveQuote:'Giá vừa được kiểm tra',
      refreshError:'Không thể cập nhật chỗ trống. Vui lòng thử lại.',
      minGuests:'Tối thiểu', maxGuests:'Tối đa', noExtra:'Hiện không có dịch vụ bổ sung',
      bookingNotSent:'Đặt chỗ chưa được gửi tới Bókun — bước này chỉ xác thực cấu hình.',
      selectDateFirst:'Hãy chọn ngày trước', selectOptionFirst:'Chọn chương trình', selectGuestsFirst:'Thêm khách',
      pickupRequired:'Chọn cách gặp', contactRequired:'Điền thông tin liên hệ'
    },
    ko:{
      title:'여행 구성하기', live:'운영사 시스템의 실시간 좌석 및 가격',
      date:'날짜 및 시간', dateEmpty:'날짜 선택', option:'옵션', optionEmpty:'옵션 선택',
      guests:'인원', guestsEmpty:'인원 추가', pickup:'이동 방법', pickupEmpty:'방법 선택',
      meet:'현장 미팅', pickupMode:'호텔 픽업', included:'가격 포함',
      total:'합계', from:'최저', continue:'계속', check:'정보 확인', ready:'구성 확인 완료',
      unavailable:'선택 불가', updating:'실시간 정보를 확인 중…',
      chooseDate:'날짜 선택', chooseTime:'시간 선택', chooseOption:'투어 옵션 선택',
      chooseGuests:'인원 선택', choosePickup:'미팅 방법 선택',
      available:'자리 남음', spots:'자리', adult:'성인', child:'아동', infant:'유아',
      years:'세', close:'닫기', searchHotel:'호텔 또는 픽업 장소 검색',
      pickupPlace:'픽업 장소', roomNeeded:'이 픽업 장소는 결제 단계에서 객실 번호가 필요합니다.',
      contact:'연락처 정보', firstName:'이름', lastName:'성', phoneNumber:'전화번호', email:'이메일',
      verify:'확인', verified:'확인 완료', noPlaces:'검색 결과 없음',
      select:'선택', selected:'선택됨', pricePerPerson:'1인당', liveQuote:'실시간 가격 확인됨',
      refreshError:'예약 가능 여부를 업데이트하지 못했습니다. 다시 시도해 주세요.',
      minGuests:'최소', maxGuests:'최대', noExtra:'현재 추가 옵션이 없습니다',
      bookingNotSent:'아직 Bókun에 예약을 전송하지 않습니다. 이 단계에서는 구성을 검증합니다.',
      selectDateFirst:'먼저 날짜를 선택하세요', selectOptionFirst:'옵션 선택', selectGuestsFirst:'인원 추가',
      pickupRequired:'미팅 방법을 선택하세요', contactRequired:'연락처 정보를 입력하세요'
    }
  };

  function locale(){
    const value=String(document.documentElement.lang || localStorage.getItem('max-tour-locale-v1') || 'ru').toLowerCase();
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
        participants:{},pickup:{mode:null,placeId:null},extras:{},customer:{},answers:{},passengers:[]
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
    if(mode==='PICKUP') return r?.resolved?.pickupPlace?.title || t().pickupMode;
    return t().pickupEmpty;
  }
  function quoteSummary(r){
    if(r?.quote?.available) return money(r.quote.total,r.quote.currency);
    const from=arr(r?.constraints?.rates).map(x=>x.fromPrice).filter(Boolean).sort((a,b)=>Number(a.amount)-Number(b.amount))[0];
    return from ? t().from+' '+money(from.amount,from.currency) : '—';
  }
  function firstBlockingStep(r){
    const codes=new Set([...(r?.errors||[]).map(x=>x.code),...(r?.bookingDataIssues||[]).map(x=>x.code)]);
    if(codes.has('date_required')||codes.has('slot_required')) return 'date';
    if(codes.has('rate_required')) return 'option';
    if(codes.has('participants_required')||[...codes].some(x=>x.includes('participant')||x.includes('minimum')||x.includes('capacity'))) return 'guests';
    if(codes.has('pickup_mode_required')||codes.has('pickup_location_required')||codes.has('pickup_places_unavailable')) return 'pickup';
    if([...codes].some(x=>x.includes('customer_field')||x.includes('booking_question')||x.includes('passenger'))) return 'contact';
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
    mount.innerHTML=
      '<div class="lt-booking-config__head">'+
        '<div><span class="lt-booking-config__eyebrow"><i></i>'+esc(t().live)+'</span><h2>'+esc(t().title)+'</h2></div>'+
        '<div class="lt-booking-config__quote"><small>'+esc(t().total)+'</small><strong>'+esc(quote)+'</strong></div>'+
      '</div>'+
      '<div class="lt-booking-config__grid">'+
        stepButton('date',t().date,dateSummary(r),Boolean(r?.resolved?.slot))+
        stepButton('option',t().option,optionSummary(r),Boolean(r?.resolved?.rate))+
        stepButton('guests',t().guests,guestSummary(r),Number(r?.resolved?.participantTotal)>0)+
        stepButton('pickup',t().pickup,pickupSummary(r),Boolean(r?.selection?.pickup?.mode))+
      '</div>'+
      '<div class="lt-booking-config__status">'+
        (r?.quote?.available?'<span class="is-live">'+esc(t().liveQuote)+'</span>':'<span>'+esc(statusText(r))+'</span>')+
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
      '<header class="lt-booking-sheet__header"><div><h3>'+esc(title)+'</h3></div><button type="button" data-lt-sheet-close aria-label="'+esc(t().close)+'">×</button></header>'+body;
    requestAnimationFrame(()=>root.classList.add('is-open'));
    document.documentElement.classList.add('lt-sheet-open');
    return root.querySelector('.lt-booking-sheet__content');
  }
  function openSheet(productId,step){
    if(step==='date') return openDateSheet(productId);
    if(step==='option') return openOptionSheet(productId);
    if(step==='guests') return openGuestsSheet(productId);
    if(step==='pickup') return openPickupSheet(productId);
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
  function openDateSheet(productId){
    const r=resolutionByProduct.get(productId); if(!r) return;
    const s=selection(productId);
    const groups=monthGroups(arr(r.constraints?.dates));
    const calendars=groups.map(([key,items])=>{
      const first=items[0]?.date;
      return '<div class="lt-date-group"><h4>'+esc(formatDate(first,{month:'long',year:'numeric'}))+'</h4><div class="lt-date-grid">'+
        items.map(item=>{
          const active=item.date===s.date;
          return '<button type="button" class="lt-date-chip '+(active?'is-active':'')+'" data-lt-date="'+esc(item.date)+'"><small>'+esc(formatDate(item.date,{weekday:'short'}))+'</small><b>'+esc(formatDate(item.date,{day:'numeric'}))+'</b><span>'+esc(item.slots)+'×</span></button>';
        }).join('')+'</div></div>';
    }).join('');
    const times=s.date?'<div class="lt-time-block"><h4>'+esc(t().chooseTime)+'</h4><div class="lt-time-grid">'+
      arr(r.constraints?.times).map(item=>'<button type="button" class="lt-time-chip '+(String(item.id)===String(s.slotId)?'is-active':'')+'" data-lt-slot="'+esc(item.id)+'" data-lt-time="'+esc(item.startTimeId||'')+'"><b>'+esc(item.startTime||'')+'</b><small>'+(item.unlimitedAvailability?esc(t().available):esc((item.availabilityCount??0)+' '+t().available))+'</small></button>').join('')+
      '</div></div>':'';
    const root=showSheet(t().chooseDate,'<div class="lt-sheet-scroll">'+calendars+times+'</div>');
    root.querySelectorAll('[data-lt-date]').forEach(btn=>btn.addEventListener('click',async()=>{
      patchSelection(productId,{date:btn.dataset.ltDate});
      const next=await resolve(productId,{quiet:true});
      const times=arr(next.constraints?.times);
      if(times.length===1){
        patchSelection(productId,{slotId:times[0].id,startTimeId:times[0].startTimeId});
        await resolve(productId,{quiet:true});
        closeSheet();
      } else openDateSheet(productId);
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
    const filterPlaces=value=>{
      const q=String(value||'').trim().toLocaleLowerCase();
      return (q?allPlaces.filter(x=>(x.title+' '+x.wholeAddress+' '+x.city).toLocaleLowerCase().includes(q)):allPlaces).slice(0,60);
    };
    const initialPlaces=filterPlaces(query);
    const body='<div class="lt-sheet-scroll">'+
      '<div class="lt-pickup-modes">'+
        (arr(p.modes).includes('MEET_ON_LOCATION')?pickupModeCard('MEET_ON_LOCATION',t().meet,mode==='MEET_ON_LOCATION',''):'')+
        (arr(p.modes).includes('PICKUP')?pickupModeCard('PICKUP',t().pickupMode,mode==='PICKUP',p.pricingType==='INCLUDED_IN_PRICE'?t().included:''):'')+
      '</div>'+
      (mode==='PICKUP'?'<div class="lt-pickup-search"><label>'+esc(t().pickupPlace)+'</label><input type="search" value="'+esc(query)+'" placeholder="'+esc(t().searchHotel)+'" data-lt-pickup-search autocomplete="off"></div>'+
        '<div class="lt-pickup-results" data-lt-pickup-results>'+pickupPlaceRows(initialPlaces,s)+'</div>':'')+
      '</div>';
    const root=showSheet(t().choosePickup,body);
    root.querySelectorAll('[data-lt-pickup-mode]').forEach(btn=>btn.addEventListener('click',async()=>{
      const selectedMode=btn.dataset.ltPickupMode;
      patchSelection(productId,{pickup:{mode:selectedMode,placeId:selectedMode==='PICKUP'?selection(productId).pickup.placeId:null}});
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
      patchSelection(productId,{pickup:{mode:'PICKUP',placeId:btn.dataset.ltPlace}});
      const next=await resolve(productId,{quiet:true});
      const place=next.resolved?.pickupPlace;
      if(place?.askForRoomNumber){
        if(results) results.innerHTML=pickupPlaceRows(filterPlaces(currentQuery),selection(productId));
        results?.querySelector('[data-lt-place="'+CSS.escape(String(place.id))+'"]')?.insertAdjacentHTML('afterend','<div class="lt-room-note">'+esc(t().roomNeeded)+'</div>');
      } else closeSheet();
    });
  }
  function pickupModeCard(mode,title,active,note){
    return '<button type="button" class="lt-pickup-mode '+(active?'is-active':'')+'" data-lt-pickup-mode="'+esc(mode)+'"><span class="lt-radio"></span><span><b>'+esc(title)+'</b>'+(note?'<small>'+esc(note)+'</small>':'')+'</span></button>';
  }
  function openContactSheet(productId){
    const r=resolutionByProduct.get(productId); if(!r) return;
    const req=r.constraints?.bookingRequirements||{};
    const fields=[...new Set(arr(req.requiredCustomerFields).map(canonicalField))];
    const s=selection(productId);
    const inputs=fields.map(field=>
      '<label class="lt-contact-field"><span>'+esc(fieldLabel(field))+'</span><input type="'+(field==='phoneNumber'?'tel':field==='email'?'email':'text')+'" value="'+esc(s.customer?.[field]||'')+'" data-lt-customer="'+esc(field)+'" autocomplete="'+esc(autoComplete(field))+'"></label>'
    ).join('');
    const body='<div class="lt-sheet-scroll"><div class="lt-contact-grid">'+inputs+'</div>'+
      '<p class="lt-booking-note">'+esc(t().bookingNotSent)+'</p>'+
      '<div class="lt-sheet-action"><button type="button" class="lt-sheet-primary" data-lt-contact-check>'+esc(r.readyToBook?t().verified:t().verify)+'</button></div></div>';
    const root=showSheet(t().contact,body);
    root.querySelector('[data-lt-contact-check]')?.addEventListener('click',async()=>{
      const customer={...selection(productId).customer};
      root.querySelectorAll('[data-lt-customer]').forEach(input=>customer[input.dataset.ltCustomer]=input.value.trim());
      patchSelection(productId,{customer});
      const next=await resolve(productId,{quiet:true});
      if(next.readyToBook){
        const btn=root.querySelector('[data-lt-contact-check]'); if(btn){btn.textContent=t().verified;btn.classList.add('is-success');}
        setTimeout(closeSheet,550);
      }else openContactSheet(productId);
    });
  }
  function canonicalField(field){
    const key=String(field||'').replace(/[^a-z0-9]/gi,'').toLowerCase();
    return ({firstname:'firstName',lastname:'lastName',phonenumber:'phoneNumber',phone:'phoneNumber',email:'email'})[key]||field;
  }
  function fieldLabel(field){ return ({firstName:t().firstName,lastName:t().lastName,phoneNumber:t().phoneNumber,email:t().email})[field]||field; }
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
    if(!PRODUCT_IDS.has(id)) return;
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
    open:step=>activeProductId&&openSheet(activeProductId,step||firstBlockingStep(resolutionByProduct.get(activeProductId))),
  };
})();