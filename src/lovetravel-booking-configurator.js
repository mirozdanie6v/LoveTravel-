(() => {
  'use strict';

  const PRODUCT_IDS = new Set(['1287578','1287580']);
  const RELEASE_ID = '2026-10-06-semantic-i18n-core-v1';
  const CHECKOUT_REQUIRED_CUSTOMER_FIELDS = ['firstName','lastName','email','phoneNumber'];
  const stateByProduct = new Map();
  const resolutionByProduct = new Map();
  const calendarByKey = new Map();
  const calendarRequestSeqByProduct = new Map();
  let activeProductId = null;
  let requestSeq = 0;
  let sheet = null;
  let sheetReturnFocus = null;
  let sheetReturnStep = null;
  let sheetFocusRevision = 0;
  let transactionSnapshot = null;
  const bootstrapping = new Set();
  const bootstrapPromises = new Map();

  async function loadTransaction({applySelection=true}={}){
    const response=await fetch('/api/travel-commerce/transaction',{
      method:'GET',
      cache:'no-store',
      credentials:'same-origin',
      headers:{'accept':'application/json'},
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok||!data?.transaction) throw new Error(data?.error||'transaction snapshot unavailable');
    transactionSnapshot=data.transaction;
    const txSelection=data.selection;
    const productId=String(txSelection?.productId||'');
    if(applySelection&&PRODUCT_IDS.has(productId)) saveSelection(productId,txSelection);
    return data;
  }

  async function transactionAction(action,payload={}){
    const response=await fetch('/api/travel-commerce/transaction',{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json'},
      cache:'no-store',
      credentials:'same-origin',
      body:JSON.stringify({action,...payload}),
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok){
      const error=new Error(data?.message||data?.error||('transaction '+action+' failed'));
      error.status=response.status;
      error.code=data?.error||'transaction_action_failed';
      throw error;
    }
    if(data.transaction) transactionSnapshot=data.transaction;
    return data;
  }

  async function syncTransactionSelection(productId,{retryStale=true}={}){
    if(!transactionSnapshot) await loadTransaction({applySelection:false});
    try{
      const data=await transactionAction('SYNC_SELECTION',{
        expectedRevision:Number(transactionSnapshot.revision),
        selection:selection(productId),
      });
      if(data.selection) saveSelection(productId,data.selection);
      return data;
    }catch(error){
      if(retryStale&&Number(error.status)===409){
        await loadTransaction({applySelection:false});
        return syncTransactionSelection(productId,{retryStale:false});
      }
      throw error;
    }
  }
  function i18n(){ return globalThis.LoveTravelI18n || null; }
  function locale(){ return i18n()?.locale?.() || 'ru'; }
  const UI_FALLBACK=new Proxy(Object.create(null),{get:(_target,key)=>String(key)});
  function t(){ return i18n()?.scope?.('booking') || UI_FALLBACK; }
  function l10n(){ return globalThis.LoveTravelTourLocale || null; }
  function providerText(value){ return l10n()?.providerText?.(value) ?? String(value ?? ''); }
  function localizedRateTitle(_productId,rate,_localization=null){
    return globalThis.LoveTravelDomainTour?.rateContent?.(_productId,rate?.id)?.title || String(rate?.title||rate?.code||rate?.id||'');
  }
  function localizedRateDescription(productId,rate){
    const content=globalThis.LoveTravelDomainTour?.rateContent?.(productId,rate?.id);
    if(content?.description) return content.description;
    const key='tour.ratePresentation.'+String(rate?.id||'');
    const curated=i18n()?.t?.(key);
    return curated && curated!==key ? curated : '';
  }
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
        participants:{},pickup:{mode:null,placeId:null,customLocation:null,roomNumber:''},dropoff:{mode:null,placeId:null,customLocation:null},extras:{},customer:{},answers:{},extraAnswers:{},passengers:[]
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
    if(patch.dropoff) next.dropoff={...current.dropoff,...patch.dropoff};
    if(patch.participants) next.participants={...patch.participants};
    if(patch.customer) next.customer={...current.customer,...patch.customer};
    saveSelection(productId,next);
    return next;
  }
  function calendarKey(productId,rateId=null){
    return String(productId)+':'+(rateId ? String(rateId) : '*');
  }
  function addIsoDays(iso,days){
    const date=new Date(String(iso||'')+'T00:00:00Z');
    if(Number.isNaN(date.getTime())) return '';
    date.setUTCDate(date.getUTCDate()+Number(days||0));
    return date.toISOString().slice(0,10);
  }
  function mergeCalendarRows(previous,incoming,keyOf){
    const merged=new Map();
    for(const item of [...arr(previous),...arr(incoming)]){
      const key=keyOf(item);
      if(key) merged.set(key,item);
    }
    return [...merged.values()].sort((a,b)=>String(a?.date||'').localeCompare(String(b?.date||'')) || String(a?.startTime||'').localeCompare(String(b?.startTime||'')));
  }
  function storeCalendar(productId,data,{append=false}={}){
    const incomingDates=arr(data?.constraints?.dates);
    const incomingTimes=arr(data?.constraints?.times);
    const rateId=data?.selection?.rateId || null;
    const key=calendarKey(productId,rateId);
    const previous=calendarByKey.get(key);
    const dates=append&&previous
      ? mergeCalendarRows(previous.dates,incomingDates,item=>String(item?.date||''))
      : incomingDates;
    const times=append&&previous
      ? mergeCalendarRows(previous.times,incomingTimes,item=>String(item?.id||'')+'|'+String(item?.date||'')+'|'+String(item?.startTimeId||''))
      : incomingTimes;
    const value={
      productId:String(productId),
      rateId:rateId ? String(rateId) : null,
      dates,
      times,
      fetchedAt:Date.now(),
      start:append&&previous ? (previous.start || data?.start || null) : (data?.start || null),
      end:data?.end || previous?.end || null,
    };
    calendarByKey.set(key,value);
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
  async function refreshCalendar(productId,{force=false,append=false}={}){
    const currentSelection=selection(productId);
    const rateId=currentSelection.rateId || null;
    const cached=calendarByKey.get(calendarKey(productId,rateId));
    if(!append && !force && cached && Date.now()-cached.fetchedAt < 60000) return cached;

    const seq=(calendarRequestSeqByProduct.get(productId)||0)+1;
    calendarRequestSeqByProduct.set(productId,seq);
    const calendarSelection={
      ...currentSelection,
      date:null,
      startTimeId:null,
      slotId:null,
      pickup:{mode:null,placeId:null,customLocation:null,roomNumber:''},
      dropoff:{mode:null,placeId:null,customLocation:null},
    };
    const calendarRange=append&&cached?.end
      ? {start:addIsoDays(cached.end,1),end:addIsoDays(addIsoDays(cached.end,1),30)}
      : null;
    const response=await fetch('/api/bokun/booking-selection/resolve',{
      method:'POST',
      headers:{'content-type':'application/json'},
      cache:'no-store',
      credentials:'same-origin',
      body:JSON.stringify({selection:calendarSelection,locale:locale(),...(calendarRange?{calendarRange}:{})}),
    });
    if(!response.ok) throw new Error('calendar resolve HTTP '+response.status);
    const data=await response.json();
    if(!data?.ok || data?.schemaVersion!=='lovetravel.booking-selection-resolution.v1') throw new Error('invalid calendar resolution');
    if(calendarRequestSeqByProduct.get(productId)!==seq) return calendarFor(productId);
    return storeCalendar(productId,data,{append});
  }
  async function resolve(productId,{quiet=false}={}){
    const seq=++requestSeq;
    const card=document.querySelector('[data-lt-config="'+CSS.escape(productId)+'"]');
    if(card && !quiet) card.classList.add('is-updating');
    try{
      const txData=await syncTransactionSelection(productId);
      const data=txData?.resolution;
      if(!data || typeof data!=='object') throw new Error('invalid transaction resolution');
      if(seq!==requestSeq || activeProductId!==productId) return data;
      resolutionByProduct.set(productId,data);
      saveSelection(productId,data.selection||selection(productId));
      if(!data.selection?.date) storeCalendar(productId,data);
      if(!bootstrapping.has(productId)) render(productId);
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
    return new Intl.DateTimeFormat(locale()==='ru'?'ru-RU':locale()==='vi'?'vi-VN':locale()==='ko'?'ko-KR':locale()==='zh'?'zh-CN':'en-US',options).format(d);
  }
  function guestLabel(item){
    const type=String(item?.ticketCategory||'').toUpperCase();
    if(type==='ADULT') return t().adult;
    if(type==='CHILD') return t().child;
    if(type==='INFANT') return t().infant;
    return providerText(item?.title || type);
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
  function optionSummary(r){ return r?.resolved?.rate ? localizedRateTitle(r?.product?.id||activeProductId,r.resolved.rate,r?.product?.localization) : t().optionEmpty; }
  function pickupStepLabel(r){
    const mode=r?.selection?.pickup?.mode;
    if(mode==='PICKUP') return t().pickupHotelLabel;
    if(mode==='MEET_ON_LOCATION') return t().startPointLabel;
    return t().pickup;
  }
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
  function dropoffSummary(r){
    const mode=r?.selection?.dropoff?.mode;
    if(mode==='NO_DROPOFF') return t().noDropoff;
    if(mode==='DROPOFF'){
      if(r?.resolved?.dropoffPlace?.title) return r.resolved.dropoffPlace.title;
      const custom=r?.selection?.dropoff?.customLocation;
      if(custom?.wholeAddress||custom?.addressLine1) return custom.wholeAddress||custom.addressLine1;
      return t().dropoffMode;
    }
    return t().dropoffEmpty;
  }
  function extrasSummary(r){
    const bookingCount=Object.values(r?.selection?.extras||{}).reduce((sum,value)=>sum+Math.max(0,Number(value)||0),0);
    const passengerCount=arr(r?.selection?.passengers).reduce((sum,passenger)=>
      sum+Object.values(passenger?.extras||{}).reduce((inner,item)=>inner+Math.max(0,Number(item?.quantity??item)||0),0),0);
    const count=bookingCount+passengerCount;
    return count>0 ? String(count) : t().extrasEmpty;
  }
  function checkoutContactComplete(r){
    const customer=r?.selection?.customer||{};
    return CHECKOUT_REQUIRED_CUSTOMER_FIELDS.every(field=>String(customer?.[field]??'').trim()!=='');
  }
  function contactSummary(r){
    const contactCodes=new Set(['required_customer_field_missing','required_booking_question_missing','invalid_booking_question_answer','required_custom_field_missing','passenger_details_incomplete','passenger_field_missing','required_passenger_booking_question_missing','invalid_passenger_booking_question_answer']);
    const pending=arr(r?.bookingDataIssues).some(item=>contactCodes.has(item.code)) || !checkoutContactComplete(r);
    return pending ? t().contactRequired : t().verified;
  }
  function ctaLabel(r,ready){
    if(ready) return t().reviewQuote;
    const step=firstBlockingStep(r);
    if(step==='date') return t().chooseDate;
    if(step==='option') return t().chooseOption;
    if(step==='guests') return t().chooseGuests;
    if(step==='pickup') return t().choosePickup;
    if(step==='dropoff') return t().chooseDropoff;
    if(step==='extras') return t().chooseExtras;
    return t().fillContact;
  }
  function quoteSummary(r){
    if(r?.quote?.available) return money(r.quote.total,r.quote.currency);
    const rates=arr(r?.constraints?.rates);
    const selected=rates.find(x=>String(x.id)===String(r?.selection?.rateId));
    const from=selected?.fromPrice || rates.map(x=>x.fromPrice).filter(Boolean).sort((a,b)=>Number(a.amount)-Number(b.amount))[0];
    return from ? t().from+' '+money(from.amount,from.currency) : '—';
  }
  function hasParticipantIssue(r){
    return [...arr(r?.errors),...arr(r?.bookingDataIssues),...arr(r?.warnings)].some(item=>
      String(item.path||'').startsWith('participants') ||
      /participant|minimum|maximum|capacity/.test(String(item.code||''))
    );
  }
  function firstBlockingStep(r){
    const codes=new Set([
      ...(r?.errors||[]).map(x=>x.code),
      ...(r?.bookingDataIssues||[]).map(x=>x.code),
      ...(r?.warnings||[]).map(x=>x.code),
    ]);
    if(codes.has('date_required')||codes.has('slot_required')) return 'date';
    if(codes.has('rate_required')) return 'option';
    if(hasParticipantIssue(r)) return 'guests';
    if(codes.has('required_extra_missing')||codes.has('required_passenger_extra_missing')||codes.has('extras_price_unresolved')||[...codes].some(x=>x.includes('extra_booking_question'))) return 'extras';
    if(
      codes.has('pickup_mode_required')||
      codes.has('pickup_location_required')||
      codes.has('pickup_places_unavailable')||
      codes.has('pickup_room_number_required')||
      codes.has('custom_pickup_location_incomplete')
    ) return 'pickup';
    if(
      codes.has('dropoff_mode_required')||
      codes.has('dropoff_location_required')||
      codes.has('dropoff_places_unavailable')||
      codes.has('custom_dropoff_location_incomplete')||
      codes.has('dropoff_price_unresolved')||
      codes.has('dropoff_required')||
      codes.has('dropoff_not_available')||
      codes.has('no_dropoff_not_allowed')
    ) return 'dropoff';
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
  function syncDomainTransport(r){
    const screen=document.querySelector('#tourScreen');
    if(!screen || !r) return;
    const mode=String(r?.selection?.pickup?.mode||'');
    const startPointCard=screen.querySelector('[data-lt-start-point-card]');
    const pickupCard=screen.querySelector('[data-lt-pickup-card]');
    if(startPointCard) startPointCard.hidden=mode==='PICKUP';
    if(pickupCard) pickupCard.hidden=mode==='MEET_ON_LOCATION';
    const selectedPickup=screen.querySelector('[data-lt-selected-pickup]');
    const selectedPickupValue=screen.querySelector('[data-lt-selected-pickup-value]');
    const selectedTitle=r?.resolved?.pickupPlace?.title || r?.selection?.pickup?.customLocation?.wholeAddress || r?.selection?.pickup?.customLocation?.addressLine1 || '';
    if(selectedPickup){
      selectedPickup.hidden=!(mode==='PICKUP' && selectedTitle);
      if(selectedPickupValue) selectedPickupValue.textContent=selectedTitle;
    }
  }
  function quoteLabel(r){
    return r?.quote?.available ? t().total : t().pricePerPerson;
  }
  function syncDomainSummary(r){
    const screen=document.querySelector('#tourScreen');
    if(!screen || String(screen.dataset.ltDomainProduct)!==String(r?.product?.id||activeProductId)) return;
    globalThis.LoveTravelDomainTour?.syncCancellation?.(r?.product?.id||activeProductId,r?.selection?.rateId);
    const date=screen.querySelector('[data-lt-summary-date]');
    if(date){
      date.hidden=!r?.resolved?.slot;
      date.querySelector('[data-lt-summary-date-value]').textContent=r?.resolved?.slot ? dateSummary(r) : '';
    }
    const quick=screen.querySelector('[data-lt-jump-booking]');
    if(quick){
      quick.disabled=false;
      quick.removeAttribute('aria-busy');
      quick.querySelector('[data-lt-summary-price-label]').textContent=quoteLabel(r);
      quick.querySelector('[data-lt-summary-price]').textContent=quoteSummary(r);
      quick.querySelector('[data-lt-summary-cta]').textContent=ctaLabel(r,Boolean(r.readyToBook&&checkoutContactComplete(r)));
    }
  }
  function configMount(productId){
    const shell=document.querySelector('#tourScreen .lt-domain-shell');
    if(!shell || String(document.querySelector('#tourScreen')?.dataset.ltDomainProduct)!==String(productId)) return null;
    let mount=shell.querySelector('[data-lt-config="'+CSS.escape(productId)+'"]');
    if(!mount){
      mount=document.createElement('section');
      mount.dataset.ltConfig=productId;
      const hero=shell.querySelector('.lt-domain-hero');
      if(hero) hero.insertAdjacentElement('afterend',mount); else shell.prepend(mount);
    }
    return mount;
  }
  function renderPending(productId,{failed=false}={}){
    if(activeProductId!==productId) return;
    const mount=configMount(productId);
    if(!mount) return;
    markLegacySelection();
    mount.className='lt-booking-config'+(failed?' has-error':' is-loading');
    delete mount.dataset.ltConfigReady;
    mount.setAttribute('aria-busy',String(!failed));
    const labels=[t().date,t().option,t().guests,t().pickup,t().contact];
    mount.innerHTML='<div class="lt-booking-config__head"><h2>'+esc(t().title)+'</h2></div>'+
      '<div class="lt-booking-config__grid">'+labels.map(label=>'<button type="button" class="lt-booking-step" disabled><span class="lt-booking-step__copy"><small>'+esc(label)+'</small><b>'+esc(t().loading)+'</b></span></button>').join('')+'</div>'+
      '<div class="lt-booking-config__status" role="status">'+esc(failed?t().refreshError:t().loading)+'</div>'+
      '<div class="lt-booking-sticky"><div><small>'+esc(t().total)+'</small><strong>&mdash;</strong></div><button type="button" class="lt-booking-cta" disabled>'+esc(t().loading)+'</button></div>'+
      (failed?'<button type="button" class="lt-sheet-secondary" data-lt-config-retry>'+esc(i18n()?.t?.('tour.retry'))+'</button>':'');
    const quick=document.querySelector('#tourScreen [data-lt-jump-booking]');
    if(quick) quick.disabled=true;
    mount.querySelector('[data-lt-config-retry]')?.addEventListener('click',()=>{
      resolutionByProduct.delete(productId);
      detectProduct();
    });
  }
  function render(productId){
    if(activeProductId!==productId) return;
    const r=resolutionByProduct.get(productId);
    const mount=configMount(productId);
    if(!mount || !r) return;
    markLegacySelection();
    syncDomainTransport(r);
    syncDomainSummary(r);
    mount.dataset.ltConfigReady='true';
    mount.setAttribute('aria-busy','false');
    mount.className='lt-booking-config'+(r.readyToQuote?' has-quote':'');
    const quote=quoteSummary(r);
    const ready=Boolean(r.readyToBook && checkoutContactComplete(r));
    const cta=ctaLabel(r,ready);
    const extras=arr(r?.constraints?.extras);
    const extrasComplete=!arr(r?.bookingDataIssues).some(item=>item.code==='required_extra_missing'||item.code==='required_passenger_extra_missing'||String(item.code).includes('extra_booking_question'));
    const detailsComplete=!arr(r?.bookingDataIssues).some(item=>
      ['required_customer_field_missing','required_booking_question_missing','invalid_booking_question_answer','required_custom_field_missing','passenger_details_incomplete','passenger_field_missing','required_passenger_booking_question_missing','invalid_passenger_booking_question_answer'].includes(item.code)
    ) && checkoutContactComplete(r);
    mount.innerHTML=
      '<div class="lt-booking-config__head">'+
        '<div><span class="lt-booking-config__eyebrow"><i></i>'+esc(t().live)+'</span><h2>'+esc(t().title)+'</h2></div>'+
        '<div class="lt-booking-config__quote"><small>'+esc(quoteLabel(r))+'</small><strong>'+esc(quote)+'</strong></div>'+
      '</div>'+
      '<div class="lt-booking-config__grid">'+
        stepButton('date',t().date,dateSummary(r),Boolean(r?.resolved?.slot))+
        stepButton('option',t().option,optionSummary(r),Boolean(r?.resolved?.rate))+
        stepButton('guests',t().guests,guestSummary(r),Number(r?.resolved?.participantTotal)>0&&!hasParticipantIssue(r))+
        stepButton('pickup',pickupStepLabel(r),pickupSummary(r),Boolean(r?.selection?.pickup?.mode)&&!arr(r?.bookingDataIssues).some(item=>String(item.code).startsWith('pickup_')||item.code==='custom_pickup_location_incomplete'))+
        (arr(r?.constraints?.dropoff?.modes).includes('DROPOFF')?stepButton('dropoff',t().dropoff,dropoffSummary(r),Boolean(r?.selection?.dropoff?.mode)&&!arr(r?.bookingDataIssues).some(item=>String(item.code).startsWith('dropoff_')||item.code==='custom_dropoff_location_incomplete')):'')+
        (extras.length?stepButton('extras',t().extras,extrasSummary(r),extrasComplete):'')+
        stepButton('contact',t().contact,contactSummary(r),detailsComplete)+
      '</div>'+
      '<div class="lt-booking-config__status">'+
        (r?.quote?.available&&!arr(r?.errors).length?'<span class="is-live">'+esc(t().liveQuote)+'</span>':'<span>'+esc(statusText(r))+'</span>')+
        (r?.product?.confirmationMode==='ON_REQUEST'?'<span class="is-request">'+esc(t().onRequest)+'</span>':'')+
        '<span data-lt-config-error="'+esc(productId)+'" hidden></span>'+
      '</div>'+
      '<div class="lt-booking-sticky">'+
        '<div><small>'+esc(quoteLabel(r))+'</small><strong>'+esc(quote)+'</strong></div>'+
        '<button type="button" class="lt-booking-cta '+(ready?'is-ready':'')+'" data-lt-config-continue>'+esc(cta)+'</button>'+
      '</div>';

    mount.querySelectorAll('[data-lt-step]').forEach(btn=>btn.addEventListener('click',()=>openSheet(productId,btn.dataset.ltStep)));
    mount.querySelector('[data-lt-config-continue]')?.addEventListener('click',()=>{
      const step=firstBlockingStep(r);
      if(ready) openQuoteSheet(productId);
      else openSheet(productId,step);
    });
  }
  function statusText(r){
    const step=firstBlockingStep(r);
    if(step==='date') return t().selectDateFirst;
    if(step==='option') return t().selectOptionFirst;
    if(step==='guests') return t().chooseGuests;
    if(step==='extras') return t().extrasRequired;
    if(step==='pickup') return t().pickupRequired;
    if(step==='dropoff') return t().dropoffRequired;
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
    document.addEventListener('keydown',e=>{
      if(sheet.hidden||!sheet.classList.contains('is-open')) return;
      if(e.key==='Escape'){ e.preventDefault(); closeSheet(); }
      if(e.key==='Tab'){
        const controls=[...sheet.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(node=>!node.disabled&&node.getClientRects().length);
        const first=controls[0],last=controls.at(-1);
        if(!controls.includes(document.activeElement)||(e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)){
          e.preventDefault();
          (e.shiftKey?last:first)?.focus();
        }
      }
    });
    return sheet;
  }
  function closeSheet(){
    if(!sheet) return;
    sheetFocusRevision++;
    sheet.classList.remove('is-open');
    document.documentElement.classList.remove('lt-sheet-open');
    const target=sheetReturnFocus?.isConnected ? sheetReturnFocus : document.querySelector('[data-lt-config-ready] [data-lt-step="'+CSS.escape(sheetReturnStep||'date')+'"]');
    target?.focus({preventScroll:true});
    setTimeout(()=>{ if(sheet&&!sheet.classList.contains('is-open')) sheet.hidden=true; },180);
  }
  function showSheet(title,body){
    const root=ensureSheet();
    if(!root.classList.contains('is-open')){
      sheetReturnFocus=document.activeElement;
      sheetReturnStep=sheetReturnFocus?.dataset?.ltStep||null;
    }
    root.hidden=false;
    root.querySelector('[role="dialog"]').setAttribute('aria-label',title);
    syncVisualViewport();
    delete root.querySelector('.lt-booking-sheet__content').dataset.ltSelectionPending;
    root.querySelector('.lt-booking-sheet__content').innerHTML=
      '<header class="lt-booking-sheet__header"><div><h3>'+esc(title)+'</h3></div><button type="button" data-lt-sheet-close data-lt-sheet-close-button aria-label="'+esc(t().close)+'">×</button></header>'+body;
    const focusRevision=++sheetFocusRevision;
    requestAnimationFrame(()=>{
      if(focusRevision!==sheetFocusRevision) return;
      root.classList.add('is-open');
      root.querySelector('[data-lt-sheet-close-button]')?.focus({preventScroll:true});
    });
    document.documentElement.classList.add('lt-sheet-open');
    return root.querySelector('.lt-booking-sheet__content');
  }
  function openSheet(productId,step){
    if(step==='date') return openDateSheet(productId);
    if(step==='option') return openOptionSheet(productId);
    if(step==='guests') return openGuestsSheet(productId);
    if(step==='pickup') return openPickupSheet(productId);
    if(step==='dropoff') return openDropoffSheet(productId);
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
          return '<button type="button" class="lt-date-chip '+(active?'is-active':'')+'" aria-pressed="'+(active?'true':'false')+'" '+(active?'aria-current="date" ':'')+'data-lt-date="'+esc(item.date)+'"><small>'+esc(formatDate(item.date,{weekday:'short'}))+'</small><b>'+esc(formatDate(item.date,{day:'numeric'}))+'</b><span>'+esc(i18n()?.t?.('booking.timeCount',{count:Number(item.slots)}) || String(item.slots))+'</span></button>';
        }).join('')+'</div></div>';
    }).join('');
    const times=s.date?'<div class="lt-time-block"><h4>'+esc(t().chooseTime)+'</h4><div class="lt-time-grid">'+
      timeRows.map(item=>{ const active=String(item.id)===String(s.slotId); return '<button type="button" class="lt-time-chip '+(active?'is-active':'')+'" aria-pressed="'+(active?'true':'false')+'" data-lt-slot="'+esc(item.id)+'" data-lt-time="'+esc(item.startTimeId||'')+'"><b>'+esc(item.startTime||'')+'</b><small>'+esc(availabilityLabel(item))+'</small></button>'; }).join('')+
      '</div></div>':'';
    const moreDates='<div class="lt-sheet-action"><button type="button" class="lt-sheet-secondary" data-lt-calendar-more>'+esc(t().moreDates)+'</button></div>';
    const root=showSheet(t().chooseDate,'<div class="lt-sheet-scroll">'+(calendars||'<div class="lt-empty">'+esc(t().unavailable)+'</div>')+times+moreDates+'</div>');

    root.querySelector('[data-lt-calendar-more]')?.addEventListener('click',async event=>{
      const button=event.currentTarget;
      button.disabled=true;
      try{
        await refreshCalendar(productId,{force:true,append:true});
        openDateSheet(productId,{skipRefresh:true});
      }catch(error){
        console.error('[LoveTravel] later calendar refresh failed',error);
        button.disabled=false;
        button.textContent=t().refreshError;
      }
    });

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
      root.querySelectorAll('[data-lt-date]').forEach(node=>{
        const active=node===btn;
        node.classList.toggle('is-active',active);
        node.setAttribute('aria-pressed',active?'true':'false');
        if(active) node.setAttribute('aria-current','date'); else node.removeAttribute('aria-current');
      });
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
      root.querySelectorAll('[data-lt-slot]').forEach(node=>{
        const active=node===btn;
        node.classList.toggle('is-active',active);
        node.setAttribute('aria-pressed',active?'true':'false');
      });
      patchSelection(productId,{slotId:btn.dataset.ltSlot,startTimeId:btn.dataset.ltTime||null});
      await resolve(productId,{quiet:true});
      closeSheet();
    }));
  }
  async function withChoiceFeedback(productId,root,{button,selector,attribute,patch,after}){
    if(root.dataset.ltSelectionPending) return null;
    const viewRevision=sheetFocusRevision;
    const current=()=>activeProductId===productId&&sheetFocusRevision===viewRevision&&root.isConnected&&document.querySelector('#tourScreen')?.classList.contains('active')&&String(document.querySelector('#tourScreen')?.dataset.ltDomainProduct||'')===productId;
    const value=button.getAttribute(attribute);
    root.dataset.ltSelectionPending='true';
    root.querySelectorAll(selector).forEach(choice=>{
      const active=choice.getAttribute(attribute)===value;
      choice.classList.toggle('is-active',active);
      choice.classList.toggle('is-pending',active);
      choice.setAttribute('aria-pressed',String(active));
      if(active) choice.setAttribute('aria-busy','true'); else choice.removeAttribute('aria-busy');
    });
    let status=root.querySelector('[data-lt-choice-status]');
    if(!status){
      status=document.createElement('div');
      status.dataset.ltChoiceStatus='';
      root.querySelector('.lt-booking-sheet__header').insertAdjacentElement('afterend',status);
    }
    status.className='lt-choice-status';
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    status.textContent=i18n()?.t?.('booking.selectionChecking',{choice:button.querySelector('b')?.textContent||button.textContent});
    const controls=[...root.querySelectorAll('button,input,select,textarea')].filter(control=>!control.hasAttribute('data-lt-sheet-close'));
    const disabled=controls.map(control=>({control,disabled:control.disabled}));
    controls.forEach(control=>{control.disabled=true;});
    patchSelection(productId,patch);
    try{
      const next=await resolve(productId,{quiet:true});
      if(current()) after(next);
      return next;
    }catch(error){
      if(current()){
        status.className='lt-choice-status is-error';
        status.setAttribute('role','alert');
        status.textContent=t().selectionError;
        const retry=document.createElement('button');
        retry.type='button';
        retry.className='lt-sheet-secondary';
        retry.dataset.ltChoiceRetry='';
        retry.textContent=t().retrySelection;
        retry.addEventListener('click',()=>withChoiceFeedback(productId,root,{button,selector,attribute,patch,after}));
        status.appendChild(retry);
      }
      return null;
    }finally{
      if(current()){
        delete root.dataset.ltSelectionPending;
        disabled.forEach(item=>{item.control.disabled=item.disabled;});
        root.querySelectorAll(selector).forEach(choice=>{
          choice.classList.remove('is-pending');
          choice.removeAttribute('aria-busy');
        });
      }
    }
  }
  function openOptionSheet(productId){
    const r=resolutionByProduct.get(productId); if(!r) return;
    const s=selection(productId);
    const rows=arr(r.constraints?.rates);
    const body='<div class="lt-sheet-scroll"><div class="lt-option-list">'+rows.map(rate=>
      '<button type="button" class="lt-option-card '+(String(rate.id)===String(s.rateId)?'is-active':'')+'" data-lt-rate="'+esc(rate.id)+'" aria-pressed="'+(String(rate.id)===String(s.rateId)?'true':'false')+'">'+
        '<span><b>'+esc(localizedRateTitle(productId,rate,r?.product?.localization))+'</b>'+(localizedRateDescription(productId,rate)?'<small class="lt-option-card__description">'+esc(localizedRateDescription(productId,rate))+'</small>':'')+'</span>'+
        '<span class="lt-option-card__price">'+(rate.fromPrice?'<small>'+esc(t().from)+'</small><strong>'+esc(money(rate.fromPrice.amount,rate.fromPrice.currency))+'</strong>':'')+'</span>'+
      '</button>'
    ).join('')+'</div></div>';
    const root=showSheet(t().chooseOption,body);
    root.querySelectorAll('[data-lt-rate]').forEach(btn=>btn.addEventListener('click',async()=>{
      const next=await withChoiceFeedback(productId,root,{
        button:btn,selector:'[data-lt-rate]',attribute:'data-lt-rate',patch:{rateId:btn.dataset.ltRate},
        after:()=>closeSheet(),
      });
      if(next) refreshCalendar(productId,{force:true}).catch(error=>console.error('[LoveTravel] rate calendar refresh failed',error));
    }));
  }
  function openGuestsSheet(productId){
    const r=resolutionByProduct.get(productId); if(!r) return;
    const participants=arr(r.constraints?.participants);
    const rate=r.resolved?.rate;
    const limits=[Number(rate?.minPerBooking)>0?t().minGuests+' '+rate.minPerBooking:'',Number(rate?.maxPerBooking)>0?t().maxGuests+' '+rate.maxPerBooking:''].filter(Boolean).join(' · ');
    const body='<div class="lt-sheet-scroll">'+(limits?'<p class="lt-guest-limits">'+esc(limits)+'</p>':'')+'<div class="lt-guest-list">'+participants.map(item=>
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
      '<button type="button" class="lt-pickup-place '+(String(place.id)===String(s.pickup?.placeId)?'is-active':'')+'" data-lt-place="'+esc(place.id)+'" aria-pressed="'+(String(place.id)===String(s.pickup?.placeId)?'true':'false')+'">'+
        '<span><b>'+esc(place.title)+'</b><small>'+esc(place.wholeAddress||[place.addressLine1,place.city].filter(Boolean).join(', '))+'</small></span>'+
      '</button>'
    ).join('');
  }
  function openPickupSheet(productId,query='',resolutionOverride=null){
    const r=resolutionOverride || resolutionByProduct.get(productId); if(!r) return;
    const p=r.constraints?.pickup||{};
    const s=selection(productId);
    const mode=s.pickup?.mode;
    const allPlaces=arr(p.places);
    const resolvedPlace=r?.resolved?.pickupPlace||null;
    const selectedPlace=allPlaces.find(place=>String(place.id)===String(s.pickup?.placeId))
      || (String(resolvedPlace?.id||'')===String(s.pickup?.placeId||'') ? resolvedPlace : null);
    const roomRequired=Boolean(
      selectedPlace?.askForRoomNumber ||
      (String(resolvedPlace?.id||'')===String(s.pickup?.placeId||'') && resolvedPlace?.askForRoomNumber) ||
      arr(r?.bookingDataIssues).some(item=>item.code==='pickup_room_number_required')
    );
    const filterPlaces=value=>{
      const q=String(value||'').trim().toLocaleLowerCase();
      if(!q) return selectedPlace ? [selectedPlace] : [];
      return allPlaces.filter(x=>(x.title+' '+x.wholeAddress+' '+x.city).toLocaleLowerCase().includes(q));
    };
    const initialPlaces=filterPlaces(query);
    const pickupDetails=mode==='PICKUP'
      ? '<div class="lt-pickup-search"><label>'+esc(t().pickupPlace)+'</label><input type="search" value="'+esc(query)+'" placeholder="'+esc(t().searchHotel)+'" data-lt-pickup-search autocomplete="off"></div>'+
        '<div class="lt-pickup-results" data-lt-pickup-results>'+(initialPlaces.length?pickupPlaceRows(initialPlaces,s):'<div class="lt-empty lt-pickup-hint">'+esc(t().searchHint)+'</div>')+'</div>'+
        (roomRequired
          ? '<div class="lt-pickup-room"><label><span>'+esc(t().roomNumber)+' *</span><input type="text" value="'+esc(s.pickup?.roomNumber||'')+'" data-lt-room-number autocomplete="off"></label><button type="button" class="lt-sheet-primary" data-lt-room-save>'+esc(t().save)+'</button></div>'
          : '')+
        (p.customAllowed
          ? '<div class="lt-custom-pickup"><span class="lt-form-caption">'+esc(t().customPickup)+'</span><label><span>'+esc(t().customPickupAddress)+'</span><input type="text" value="'+esc(s.pickup?.customLocation?.wholeAddress||s.pickup?.customLocation?.addressLine1||'')+'" data-lt-custom-pickup autocomplete="street-address"></label><button type="button" class="lt-sheet-secondary" data-lt-custom-pickup-save>'+esc(t().save)+'</button></div>'
          : '')
      : '';
    const pickupNote=[t().pickupModeNote,p.pricingType==='INCLUDED_IN_PRICE'?t().included:''].filter(Boolean).join(' · ');
    const body='<div class="lt-sheet-scroll">'+
      '<div class="lt-pickup-modes">'+
        (arr(p.modes).includes('MEET_ON_LOCATION')?pickupModeCard('MEET_ON_LOCATION',t().meet,mode==='MEET_ON_LOCATION',t().meetNote):'')+
        (arr(p.modes).includes('PICKUP')?pickupModeCard('PICKUP',t().pickupMode,mode==='PICKUP',pickupNote):'')+
      '</div>'+pickupDetails+'</div>';
    const sheetTitle=roomRequired?t().enterRoom:(mode==='PICKUP'?t().chooseHotel:t().choosePickup);
    const root=showSheet(sheetTitle,body);
    if(roomRequired) setTimeout(()=>root.querySelector('[data-lt-room-number]')?.focus({preventScroll:true}),0);
    root.querySelectorAll('[data-lt-pickup-mode]').forEach(btn=>btn.addEventListener('click',async()=>{
      const selectedMode=btn.dataset.ltPickupMode;
      await withChoiceFeedback(productId,root,{
        button:btn,selector:'[data-lt-pickup-mode]',attribute:'data-lt-pickup-mode',
        patch:{pickup:{
          mode:selectedMode,
          placeId:selectedMode==='PICKUP'?selection(productId).pickup.placeId:null,
          customLocation:selectedMode==='PICKUP'?selection(productId).pickup.customLocation:null,
          roomNumber:selectedMode==='PICKUP'?selection(productId).pickup.roomNumber:'',
        }},
        after:()=>{if(selectedMode==='MEET_ON_LOCATION') closeSheet(); else openPickupSheet(productId);},
      });
    }));
    const search=root.querySelector('[data-lt-pickup-search]');
    const results=root.querySelector('[data-lt-pickup-results]');
    search?.addEventListener('input',e=>{
      if(results) results.innerHTML=pickupPlaceRows(filterPlaces(e.target.value),selection(productId));
    });
    results?.addEventListener('click',async e=>{
      const btn=e.target.closest('[data-lt-place]'); if(!btn) return;
      const currentQuery=search?.value||'';
      await withChoiceFeedback(productId,root,{
        button:btn,selector:'[data-lt-place]',attribute:'data-lt-place',
        patch:{pickup:{mode:'PICKUP',placeId:btn.dataset.ltPlace,customLocation:null,roomNumber:''}},
        after:next=>{
          const place=next.resolved?.pickupPlace;
          if(place?.askForRoomNumber || arr(next?.bookingDataIssues).some(item=>item.code==='pickup_room_number_required')) openPickupSheet(productId,currentQuery,next);
          else closeSheet();
        },
      });
    });
    root.querySelector('[data-lt-room-save]')?.addEventListener('click',async()=>{
      const roomNumber=root.querySelector('[data-lt-room-number]')?.value.trim()||'';
      patchSelection(productId,{pickup:{roomNumber}});
      const next=await resolve(productId,{quiet:true});
      if(arr(next.bookingDataIssues).some(item=>item.code==='pickup_room_number_required')) openPickupSheet(productId,search?.value||'',next);
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
    return '<button type="button" class="lt-pickup-mode '+(active?'is-active':'')+'" aria-pressed="'+(active?'true':'false')+'" data-lt-pickup-mode="'+esc(mode)+'"><span class="lt-radio"></span><span><b>'+esc(title)+'</b>'+(note?'<small>'+esc(note)+'</small>':'')+'</span></button>';
  }
  function dropoffPlaceRows(places,s){
    if(!places.length) return '<div class="lt-empty">'+esc(t().noPlaces)+'</div>';
    return places.map(place=>
      '<button type="button" class="lt-pickup-place '+(String(place.id)===String(s.dropoff?.placeId)?'is-active':'')+'" data-lt-dropoff-place="'+esc(place.id)+'">'+
        '<span><b>'+esc(place.title)+'</b><small>'+esc(place.wholeAddress||[place.addressLine1,place.city].filter(Boolean).join(', '))+'</small></span>'+
      '</button>'
    ).join('');
  }
  function dropoffModeCard(mode,title,active,note=''){
    return '<button type="button" class="lt-pickup-mode '+(active?'is-active':'')+'" aria-pressed="'+(active?'true':'false')+'" data-lt-dropoff-mode="'+esc(mode)+'"><span class="lt-radio"></span><span><b>'+esc(title)+'</b>'+(note?'<small>'+esc(note)+'</small>':'')+'</span></button>';
  }
  function openDropoffSheet(productId,query='',resolutionOverride=null){
    const r=resolutionOverride || resolutionByProduct.get(productId); if(!r) return;
    const p=r.constraints?.dropoff||{};
    const s=selection(productId);
    const mode=s.dropoff?.mode;
    const allPlaces=arr(p.places);
    const resolvedPlace=r?.resolved?.dropoffPlace||null;
    const selectedPlace=allPlaces.find(place=>String(place.id)===String(s.dropoff?.placeId))
      || (String(resolvedPlace?.id||'')===String(s.dropoff?.placeId||'') ? resolvedPlace : null);
    const filterPlaces=value=>{
      const q=String(value||'').trim().toLocaleLowerCase();
      if(!q) return selectedPlace ? [selectedPlace] : [];
      return allPlaces.filter(x=>(x.title+' '+x.wholeAddress+' '+x.city).toLocaleLowerCase().includes(q));
    };
    const initialPlaces=filterPlaces(query);
    const details=mode==='DROPOFF'
      ? '<div class="lt-pickup-search"><label>'+esc(t().dropoffPlace)+'</label><input type="search" value="'+esc(query)+'" placeholder="'+esc(t().searchDropoff)+'" data-lt-dropoff-search autocomplete="off"></div>'+
        '<div class="lt-pickup-results" data-lt-dropoff-results>'+(initialPlaces.length?dropoffPlaceRows(initialPlaces,s):'<div class="lt-empty lt-pickup-hint">'+esc(t().searchHint)+'</div>')+'</div>'+
        (p.customAllowed
          ? '<div class="lt-custom-pickup"><span class="lt-form-caption">'+esc(t().customDropoff)+'</span><label><span>'+esc(t().customDropoffAddress)+'</span><input type="text" value="'+esc(s.dropoff?.customLocation?.wholeAddress||s.dropoff?.customLocation?.addressLine1||'')+'" data-lt-custom-dropoff autocomplete="street-address"></label><button type="button" class="lt-sheet-secondary" data-lt-custom-dropoff-save>'+esc(t().save)+'</button></div>'
          : '')
      : '';
    const dropoffNote=p.pricingType==='INCLUDED_IN_PRICE'?t().included:'';
    const body='<div class="lt-sheet-scroll"><div class="lt-pickup-modes">'+
      (arr(p.modes).includes('NO_DROPOFF')?dropoffModeCard('NO_DROPOFF',t().noDropoff,mode==='NO_DROPOFF'):'')+
      (arr(p.modes).includes('DROPOFF')?dropoffModeCard('DROPOFF',t().dropoffMode,mode==='DROPOFF',dropoffNote):'')+
      '</div>'+details+'</div>';
    const root=showSheet(mode==='DROPOFF'?t().chooseDropoffPlace:t().chooseDropoff,body);
    root.querySelectorAll('[data-lt-dropoff-mode]').forEach(btn=>btn.addEventListener('click',async()=>{
      const selectedMode=btn.dataset.ltDropoffMode;
      patchSelection(productId,{dropoff:{
        mode:selectedMode,
        placeId:selectedMode==='DROPOFF'?selection(productId).dropoff.placeId:null,
        customLocation:selectedMode==='DROPOFF'?selection(productId).dropoff.customLocation:null,
      }});
      const next=await resolve(productId,{quiet:true});
      if(selectedMode==='NO_DROPOFF') closeSheet(); else openDropoffSheet(productId,'',next);
    }));
    const search=root.querySelector('[data-lt-dropoff-search]');
    const results=root.querySelector('[data-lt-dropoff-results]');
    search?.addEventListener('input',e=>{
      if(results) results.innerHTML=dropoffPlaceRows(filterPlaces(e.target.value),selection(productId));
    });
    results?.addEventListener('click',async e=>{
      const btn=e.target.closest('[data-lt-dropoff-place]'); if(!btn) return;
      patchSelection(productId,{dropoff:{mode:'DROPOFF',placeId:btn.dataset.ltDropoffPlace,customLocation:null}});
      const next=await resolve(productId,{quiet:true});
      if(arr(next.bookingDataIssues).some(item=>item.code==='dropoff_location_required'||item.code==='unknown_dropoff_place')) openDropoffSheet(productId,search?.value||'',next);
      else closeSheet();
    });
    root.querySelector('[data-lt-custom-dropoff-save]')?.addEventListener('click',async()=>{
      const address=root.querySelector('[data-lt-custom-dropoff]')?.value.trim()||'';
      patchSelection(productId,{dropoff:{
        mode:'DROPOFF',
        placeId:null,
        customLocation:address?{addressLine1:address,wholeAddress:address}: {},
      }});
      const next=await resolve(productId,{quiet:true});
      if(arr(next.bookingDataIssues).some(item=>item.code==='custom_dropoff_location_incomplete')) openDropoffSheet(productId,query,next);
      else closeSheet();
    });
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
    const view=l10n()?.localizeQuestion?.(item) || item;
    const title=view?.title||view?.code||key;
    const required=item?.required?' *':'';
    const description=view?.description?'<small>'+esc(view.description)+'</small>':'';
    const attrs=' '+attributeName+'="'+esc(key)+'" '+extraAttributes;
    const options=arr(view?.options);
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
      control='<select'+attrs+'><option value=""></option><option value="true"'+(current==='true'||current==='1'||current==='yes'?' selected':'')+'>'+esc(t().yes)+'</option><option value="false"'+(current==='false'||current==='0'||current==='no'?' selected':'')+'>'+esc(t().no)+'</option></select>';
    }else{
      const type=typeName.includes('DATE')?'date':typeName.includes('NUMBER')||typeName.includes('INTEGER')||typeName.includes('DECIMAL')?'number':'text';
      control='<input type="'+type+'" value="'+esc(Array.isArray(value)?value[0]||'':value||'')+'"'+attrs+
        (view?.placeholder?' placeholder="'+esc(view.placeholder)+'"':'')+
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
              '<div><b>'+esc(descriptor.label)+' '+descriptor.categoryIndex+'</b><small>'+esc(providerText(item.title||item.code||id))+(item.required?' · '+esc(providerText('required')):'')+'</small></div>'+
              '<div class="lt-counter"><button type="button" data-lt-passenger-extra-minus data-lt-extra-id="'+esc(id)+'" data-lt-passenger-index="'+index+'">−</button><strong data-lt-passenger-extra-count="'+index+':'+esc(id)+'">'+quantity+'</strong><button type="button" data-lt-passenger-extra-plus data-lt-extra-id="'+esc(id)+'" data-lt-passenger-index="'+index+'">+</button></div>'+
            '</div>'+questionHtml+
          '</div>';
        }).join('');
        return '<div class="lt-extra-card" data-lt-extra-card="'+esc(id)+'"><div class="lt-extra-card__head"><b>'+esc(providerText(item.title||item.code||id))+(item.required?' *':'')+'</b>'+(item.description?'<small>'+esc(providerText(item.description))+'</small>':'')+'</div>'+paxRows+'</div>';
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
          '<div><b>'+esc(providerText(item.title||item.code||id))+(item.required?' *':'')+'</b>'+(item.description?'<small>'+esc(providerText(item.description))+'</small>':'')+'</div>'+
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
    const customerSpecMap=new Map(CHECKOUT_REQUIRED_CUSTOMER_FIELDS.map(field=>[field,{field,required:true}]));
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
        return '<label class="lt-contact-field lt-contact-field--wide"><span>'+esc(providerText(item.title||item.code||key))+(item.required?' *':'')+'</span>'+
          (item.description?'<small>'+esc(providerText(item.description))+'</small>':'')+
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
      const passengers=passengerRows.length?passengerRows.map((row,index)=>{
        const item={...previousPassengers[index],categoryId:row.dataset.ltCategory||null,answers:{...(previousPassengers[index]?.answers||{})}};
        row.querySelectorAll('[data-lt-passenger-field]').forEach(input=>item[input.dataset.ltPassengerField]=input.value.trim());
        row.querySelectorAll('[data-lt-passenger-answer]').forEach(control=>item.answers[control.dataset.ltPassengerAnswer]=controlValue(control));
        return item;
      }):previousPassengers;

      patchSelection(productId,{customer,answers,passengers});
      const next=await resolve(productId,{quiet:true});
      const hasContactIssues=arr(next.bookingDataIssues).some(item=>
        ['required_customer_field_missing','required_booking_question_missing','invalid_booking_question_answer','required_custom_field_missing','passenger_details_incomplete','passenger_field_missing','required_passenger_booking_question_missing','invalid_passenger_booking_question_answer'].includes(item.code)
      ) || !checkoutContactComplete(next);
      if(!hasContactIssues){
        const btn=root.querySelector('[data-lt-contact-check]'); if(btn){btn.textContent=t().verified;btn.classList.add('is-success');}
        setTimeout(closeSheet,550);
      }else openContactSheet(productId);
    });
  }


  function openQuoteSheet(productId){
    const r=resolutionByProduct.get(productId);
    if(!r?.readyToBook || !checkoutContactComplete(r)) return openContactSheet(productId);
    const tx=transactionSnapshot;
    if(!tx?.quote || !['READY_FOR_APPROVAL','USER_APPROVED'].includes(tx.state)){
      return openContactSheet(productId);
    }
    const body='<div class="lt-sheet-scroll">'+
      '<div class="lt-form-section"><span class="lt-form-caption">'+esc(t().total)+'</span><strong class="lt-demo-total">'+esc(money(tx.quote.price.amount,tx.quote.price.currency))+'</strong><p class="lt-booking-note">'+esc(t().bookingDisabled)+'</p></div>'+
      '<div class="lt-sheet-action"><button type="button" class="lt-sheet-primary" data-lt-quote-approve '+(tx.state==='USER_APPROVED'?'disabled':'')+'>'+esc(tx.state==='USER_APPROVED'?t().quoteApproved:t().approveQuote)+'</button></div>'+
      '<p class="lt-booking-note" data-lt-quote-error hidden></p></div>';
    const root=showSheet(t().reviewQuote,body);
    // Approval is pinned to the quote the customer has just seen.
    const displayedQuote={quoteId:tx.quote.quoteId,quoteRevision:tx.quote.revision,expectedRevision:tx.revision};
    root.querySelector('[data-lt-quote-approve]')?.addEventListener('click',async event=>{
      const button=event.currentTarget;
      const errorNode=root.querySelector('[data-lt-quote-error]');
      button.disabled=true;
      if(errorNode) errorNode.hidden=true;
      try{
        await transactionAction('APPROVE',displayedQuote);
        button.textContent=t().quoteApproved;
        render(productId);
      }catch(error){
        console.error('[LoveTravel] quote approval failed',error);
        button.disabled=false;
        if(errorNode){errorNode.textContent=t().refreshError;errorNode.hidden=false;}
      }
    });
  }

  function syncVisualViewport(){
    const viewport=window.visualViewport;
    const height=Math.max(320,Math.round(viewport?.height||window.innerHeight||720));
    const inset=Math.max(0,Math.round((window.innerHeight||height)-(height+(viewport?.offsetTop||0))));
    document.documentElement.style.setProperty('--lt-vv-height',height+'px');
    document.documentElement.style.setProperty('--lt-keyboard-inset',inset+'px');
  }
  function keepFocusedFieldVisible(target){
    if(!target?.closest?.('.lt-booking-sheet')) return;
    setTimeout(()=>target.scrollIntoView?.({block:'center',inline:'nearest',behavior:'auto'}),180);
  }

  function canonicalField(field){
    const key=String(field||'').replace(/[^a-z0-9]/gi,'').toLowerCase();
    return ({firstname:'firstName',lastname:'lastName',phonenumber:'phoneNumber',phone:'phoneNumber',email:'email'})[key]||String(field||'');
  }
  function fieldLabel(field){
    const known={firstName:t().firstName,lastName:t().lastName,phoneNumber:t().phoneNumber,email:t().email};
    if(known[field]) return known[field];
    return providerText(String(field||'').replace(/[_-]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').trim());
  }
  function autoComplete(field){ return ({firstName:'given-name',lastName:'family-name',phoneNumber:'tel',email:'email'})[field]||'off'; }

  async function bootstrap(productId){
    if(bootstrapping.has(productId)) return;
    bootstrapping.add(productId);
    activeProductId=productId;
    selection(productId);
    renderPending(productId);
    try{
      try{
        const snapshot=await loadTransaction();
        if(String(snapshot?.selection?.productId||'')!==String(productId)){
          selection(productId);
        }
      }catch(error){
        console.warn('[LoveTravel] transaction bootstrap unavailable',error?.message||error);
      }
      if(activeProductId!==productId) return;
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
    }catch(_){
      resolutionByProduct.delete(productId);
      renderPending(productId,{failed:true});
    }finally{
      bootstrapping.delete(productId);
      if(activeProductId!==productId) detectProduct();
    }
  }
  function detectProduct(){
    const screen=document.querySelector('#tourScreen');
    if(!screen?.classList.contains('active')){
      if(activeProductId){activeProductId=null;requestSeq++;closeSheet();}
      return;
    }
    const id=String(screen?.dataset?.ltDomainProduct||'');
    if(!PRODUCT_IDS.has(id) || !screen.querySelector('.lt-domain-shell')) return;
    const mounted=Boolean(screen.querySelector('[data-lt-config="'+CSS.escape(id)+'"][data-lt-config-ready]'));
    if(bootstrapping.has(id)) return;
    if(id!==activeProductId || !resolutionByProduct.has(id)){
      const pending=bootstrap(id);
      bootstrapPromises.set(id,pending);
      pending.finally(()=>{
        if(bootstrapPromises.get(id)===pending) bootstrapPromises.delete(id);
      });
    }
    else if(!mounted) render(id);
  }
  const observer=new MutationObserver(()=>detectProduct());
  function start(){
    const screen=document.querySelector('#tourScreen');
    if(!screen){ setTimeout(start,60); return; }
    syncVisualViewport();
    window.addEventListener('resize',syncVisualViewport,{passive:true});
    window.visualViewport?.addEventListener('resize',syncVisualViewport,{passive:true});
    window.visualViewport?.addEventListener('scroll',syncVisualViewport,{passive:true});
    document.addEventListener('focusin',event=>{
      if(event.target?.matches?.('.lt-booking-sheet input,.lt-booking-sheet select,.lt-booking-sheet textarea')) keepFocusedFieldVisible(event.target);
    });
    observer.observe(screen,{attributes:true,attributeFilter:['data-lt-domain-product','class']});
    document.addEventListener('lovetravel:tour-rendered',detectProduct);
    detectProduct();
  }
  document.addEventListener('click',e=>{
    if(e.target.closest?.('.mt-language-switcher button') && activeProductId) setTimeout(()=>render(activeProductId),100);
  },true);
  start();
  globalThis.LoveTravelBookingConfigurator={
    ready:async productId=>{
      const id=String(productId||activeProductId||'');
      if(!PRODUCT_IDS.has(id)) return false;
      await globalThis.LoveTravelDomainTour?.renderProduct?.(id);
      await bootstrapPromises.get(id);
      return activeProductId===id&&Boolean(resolutionByProduct.get(id));
    },
    resolve:()=>activeProductId?resolve(activeProductId):Promise.resolve(null),
    selection:()=>activeProductId?selection(activeProductId):null,
    resolution:()=>activeProductId?resolutionByProduct.get(activeProductId)||null:null,
    transaction:()=>transactionSnapshot,
    revision:()=>Number(transactionSnapshot?.revision||0),
    refreshTransaction:()=>loadTransaction(),
    applySelection:async next=>{
      const productId=String(next?.productId||activeProductId||'');
      if(!PRODUCT_IDS.has(productId)) throw new Error('unsupported product');
      activeProductId=productId;
      saveSelection(productId,{...selection(productId),...next,productId});
      return resolve(productId,{quiet:true});
    },
    calendar:()=>activeProductId?calendarFor(activeProductId):null,
    refreshCalendar:()=>activeProductId?refreshCalendar(activeProductId,{force:true}):Promise.resolve(null),
    open:step=>{
      if(!activeProductId) return;
      const r=resolutionByProduct.get(activeProductId);
      if(!r) return;
      if(!step&&r.readyToBook&&checkoutContactComplete(r)) return openQuoteSheet(activeProductId);
      return openSheet(activeProductId,step||firstBlockingStep(r));
    },
  };
})();
