(() => {
  'use strict';

  const PRODUCT_IDS = new Set(['1287578','1287580']);
  let domainPromise = null;
  let domainLocale = null;
  let currentProductId = null;
  const selectionByProduct = new Map();
  const galleryIndexByProduct = new Map();

  function i18n(){ return globalThis.LoveTravelI18n || null; }
  function locale(){ return i18n()?.locale?.() || 'ru'; }
  const UI_FALLBACK=new Proxy(Object.create(null),{get:(_target,key)=>String(key)});
  function t(){ return i18n()?.scope?.('tour') || UI_FALLBACK; }
  function l10n(){ return globalThis.LoveTravelTourLocale || null; }
  function providerText(value){ return l10n()?.providerText?.(value) ?? String(value ?? ''); }
  function serverLocalized(domain){ return Boolean(l10n()?.serverLocalizationMatches?.(domain)); }
  function localizedProductTitle(domain){ return String(domain?.experience?.title||''); }
  function localizedProductDescription(domain){ return String(domain?.experience?.description||''); }
  function localizedRateTitle(_domain,rate){ return String(rate?.title||rate?.code||rate?.id||''); }
  function localizedDate(iso,options){ return l10n()?.formatDate?.(iso,options) ?? String(iso||''); }
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
    return providerText(item?.title || type || '—');
  }
  function ageLabel(item){
    const min=Number(item?.minAge), max=Number(item?.maxAge);
    return Number.isFinite(min)&&Number.isFinite(max)
      ? (l10n()?.ageRange?.(min,max) ?? (min+'–'+max))
      : '';
  }
  function fieldLabel(value){
    const semantic={
      FIRSTNAME:'common.firstName',
      LASTNAME:'common.lastName',
      PHONE:'common.phoneNumber',
      PHONENUMBER:'common.phoneNumber',
      EMAIL:'common.email'
    };
    const key=String(value||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
    return semantic[key] ? (i18n()?.t?.(semantic[key]) || semantic[key]) : providerText(String(value || '').replaceAll('_',' ').toLowerCase());
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
    const selection=String(rate?.pickup?.selectionType || '').toUpperCase();
    const pricing=String(rate?.pickup?.pricingType || '').toUpperCase();
    if(!domain?.experience?.pickup?.enabled && !selection) return '';
    const mode=selection==='OPTIONAL' ? t().pickupOptional : selection==='REQUIRED' ? t().pickupRequired : selection==='UNAVAILABLE' ? t().pickupUnavailable : selection.toLowerCase();
    const included=pricing==='INCLUDED_IN_PRICE' ? ' · '+t().includedInPrice : '';
    return [mode,included].join('');
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
  function galleryPhotos(domain){
    return arr(domain?.experience?.media?.photos).filter(photo=>photo?.url);
  }
  function uniqueGalleryPhotos(domain){
    const seen=new Set();
    return galleryPhotos(domain).filter(photo=>{
      const key=String(photo.url||'');
      if(!key||seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function currentGalleryIndex(domain){
    const productId=String(domain?.experience?.id||'');
    const photos=galleryPhotos(domain);
    const stored=Number(galleryIndexByProduct.get(productId)||0);
    return photos.length ? Math.max(0,Math.min(photos.length-1,stored)) : 0;
  }
  function photoGallery(domain){
    const photos=galleryPhotos(domain);
    if(!photos.length) return '';
    const index=currentGalleryIndex(domain);
    const hero=photos[index];
    const title=localizedProductTitle(domain);
    return '<section class="lt-domain-gallery" data-lt-gallery>'+
      '<div class="lt-domain-gallery__headline"><span>'+esc(t().tourPhotos)+'</span><b data-lt-gallery-count>'+(index+1)+' / '+photos.length+'</b></div>'+
      '<div class="lt-domain-gallery__stage">'+
        '<button class="lt-domain-gallery__hero" type="button" data-lt-gallery-open="'+index+'" aria-label="'+esc(t().photoOfTour)+' '+(index+1)+'">'+
          '<img data-lt-gallery-hero src="'+esc(hero.url)+'" alt="'+esc(title)+' · '+esc(t().photoOfTour)+' '+(index+1)+'">'+
        '</button>'+
        (photos.length>1?'<button type="button" class="lt-domain-gallery__nav is-prev" data-lt-gallery-prev aria-label="'+esc(t().previousPhoto)+'">‹</button><button type="button" class="lt-domain-gallery__nav is-next" data-lt-gallery-next aria-label="'+esc(t().nextPhoto)+'">›</button>':'')+
      '</div>'+
      '<div class="lt-domain-gallery__strip" aria-label="'+esc(t().tourPhotos)+'">'+
        photos.map((photo,photoIndex)=>'<button type="button" class="lt-domain-gallery__thumb '+(photoIndex===index?'is-active':'')+'" data-lt-gallery-thumb="'+photoIndex+'" aria-label="'+esc(t().photoOfTour)+' '+(photoIndex+1)+'"><img loading="lazy" src="'+esc(photo.url)+'" alt="'+esc(title)+' · '+esc(t().photoOfTour)+' '+(photoIndex+1)+'"></button>').join('')+
      '</div>'+
    '</section>';
  }
  function rateDescription(domain,rate){
    const direct=[
      rate?.description,
      ...arr(rate?.details).map(item=>item?.description||item?.title||''),
      ...arr(rate?.textItems).map(item=>item?.description||item?.title||''),
    ].map(value=>providerText(String(value||'').trim())).filter(Boolean);
    if(direct.length) return [...new Set(direct)].join(' · ');
    const key='tour.ratePresentation.'+String(rate?.id||'');
    const curated=i18n()?.t?.(key);
    return curated && curated!==key ? curated : '';
  }
  function ratePhotos(domain,rateIndex){
    const photos=uniqueGalleryPhotos(domain);
    if(!photos.length) return [];
    if(photos.length===1) return [photos[0]];
    const start=(rateIndex*2+1)%photos.length;
    const result=[];
    for(let offset=0;offset<photos.length && result.length<2;offset+=1){
      const photo=photos[(start+offset)%photos.length];
      if(photo&&!result.some(item=>item.url===photo.url)) result.push(photo);
    }
    return result;
  }
  function rateCards(domain,state){
    const rates=arr(domain.rates);
    if(!rates.length) return '';
    return '<section class="lt-domain-section lt-domain-section--options"><div class="lt-domain-section__head"><div><span class="lt-domain-eyebrow">'+esc(t().option)+'</span><p>'+esc(t().optionHint)+'</p></div></div>'+
      '<div class="lt-domain-rates">'+rates.map((rate,rateIndex)=>{
        const active=String(rate.id)===String(state.rateId);
        const price=ratePrice(domain,rate);
        const description=rateDescription(domain,rate);
        const photos=ratePhotos(domain,rateIndex);
        return '<button type="button" class="lt-domain-rate '+(active?'is-active':'')+'" data-lt-domain-rate="'+esc(rate.id)+'" aria-pressed="'+(active?'true':'false')+'">'+
          (photos.length?'<span class="lt-domain-rate__media">'+photos.map((photo,index)=>'<img loading="lazy" src="'+esc(photo.url)+'" alt="'+esc(localizedRateTitle(domain,rate))+' · '+esc(t().photoOfTour)+' '+(index+1)+'">').join('')+'</span>':'')+
          '<span class="lt-domain-rate__body">'+
            '<span class="lt-domain-rate__top"><span class="lt-domain-rate__check">'+(active?'✓':'')+'</span><span class="lt-domain-rate__title">'+esc(localizedRateTitle(domain,rate))+'</span><span class="lt-domain-rate__price">'+(price?'<small>'+esc(t().from)+'</small><strong>'+esc(money(price))+'</strong>':'')+'</span></span>'+
            (description?'<span class="lt-domain-rate__description">'+esc(description)+'</span>':'')+
            '<span class="lt-domain-rate__action">'+esc(active?t().selected:t().select)+' →</span>'+
          '</span>'+
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
          '<span><b>'+esc(localizedDate(slot.date,{weekday:'short',day:'numeric',month:'short'}))+'</b><small>'+esc(slot.startTime || '')+'</small></span>'+
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
    return '<section class="lt-domain-section"><div class="lt-domain-section__head"><div><span class="lt-domain-eyebrow">'+esc(t().participants)+'</span><p>'+esc(t().priceFor)+' · '+esc(localizedDate(slot.date,{day:'numeric',month:'short'}))+' · '+esc(slot.startTime || '')+'</p></div></div><div class="lt-domain-participants">'+rows.join('')+'</div></section>';
  }
  function meeting(domain,rate){
    const points=arr(domain?.experience?.meeting?.startPoints);
    const pickup=pickupText(rate,domain);
    const pickupMinutes=Number(domain?.experience?.pickup?.minutesBefore);
    const pickupWindow=Number(domain?.experience?.pickup?.timeWindowMinutes);
    const pickupTiming=Number.isFinite(pickupMinutes)&&pickupMinutes>0
      ? pickupMinutes+' '+t().minutesBefore+(Number.isFinite(pickupWindow)&&pickupWindow>0?' · ±'+(l10n()?.minutes?.(pickupWindow)??(pickupWindow+' min')):'')
      : '';
    const meetingType=l10n()?.meetingType?.(domain?.experience?.meeting?.type||'') || '';
    if(!points.length && !pickup && !meetingType) return '';
    return '<section class="lt-domain-section lt-domain-grid" data-lt-transport-info>'+
      (points.length||meetingType?'<div class="lt-domain-info" data-lt-start-point-card><span class="lt-domain-eyebrow">'+esc(t().meeting)+'</span>'+
        '<p class="lt-domain-transport-note">'+esc(t().meetingNote)+'</p>'+
        (!points.length&&meetingType?'<div class="lt-domain-info__row"><b>'+esc(meetingType)+'</b></div>':'')+
        points.map(point=>'<div class="lt-domain-info__row"><b>'+esc(providerText(point.title || point.addressLine1 || ''))+'</b><span>'+esc([point.addressLine1,point.city,point.state].filter(Boolean).join(', '))+'</span></div>').join('')+'</div>':'')+
      (pickup?'<div class="lt-domain-info" data-lt-pickup-card><span class="lt-domain-eyebrow">'+esc(t().pickup)+'</span><div class="lt-domain-info__row"><b>'+esc(pickup)+'</b></div>'+
        '<div class="lt-domain-info__row lt-domain-selected-pickup" data-lt-selected-pickup hidden><span>'+esc(t().selectedPickup)+'</span><b data-lt-selected-pickup-value></b></div>'+
        (pickupTiming?'<div class="lt-domain-info__row"><span>'+esc(t().pickupTiming)+'</span><b>'+esc(pickupTiming)+'</b></div>':'')+
        (domain?.experience?.pickup?.noPickupMessage?'<div class="lt-domain-info__row"><span>'+esc(domain.experience.pickup.noPickupMessage)+'</span></div>':'')+
      '</div>':'')+
      '</section>';
  }
  function itinerary(domain){
    const items=arr(domain?.experience?.itinerary).filter(item=>item?.title||item?.body);
    if(!items.length) return '';
    return '<section class="lt-domain-section"><div class="lt-domain-section__head"><div><span class="lt-domain-eyebrow">'+esc(t().itinerary)+'</span>'+(arr(domain.rates).length>1?'<p>'+esc(t().itineraryHint)+'</p>':'')+'</div></div><div class="lt-domain-itinerary">'+items.map((item,index)=>{
      const title=providerText(item.title||'');
      const body=textFromHtml(item.body);
      return '<div class="lt-domain-itinerary__item"><span>'+(index+1)+'</span><div>'+(title?'<b>'+esc(title)+'</b>':'')+(body?'<p>'+esc(body)+'</p>':'')+'</div></div>';
    }).join('')+'</div></section>';
  }
  function videoSection(domain){
    const videos=arr(domain?.experience?.media?.videos).filter(item=>item?.url);
    if(!videos.length) return '';
    return '<section class="lt-domain-section"><div class="lt-domain-section__head"><span class="lt-domain-eyebrow">'+esc(t().video)+'</span></div><div class="lt-domain-video-list">'+
      videos.map((item,index)=>'<a class="lt-domain-video" href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">'+esc(providerText(item.title||t().video+' '+(index+1)))+'</a>').join('')+
      '</div></section>';
  }
  function listSection(title,items,variant=''){
    const clean=arr(items)
      .filter(v=>typeof v!=='boolean' && !/^(?:true|false)$/i.test(String(v??'').trim()))
      .map(v=>typeof v==='string'?v:(v?.title||v?.description||v?.code||v?.currencyCode||v?.id||''))
      .map(textFromHtml).map(providerText).filter(Boolean);
    if(!clean.length) return '';
    const modifier=variant?' lt-domain-section--'+variant:'';
    return '<section class="lt-domain-section'+modifier+'"><div class="lt-domain-section__head"><span class="lt-domain-eyebrow">'+esc(title)+'</span></div><ul class="lt-domain-list">'+clean.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></section>';
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
    if(extras.length) inner+='<div class="lt-domain-info"><span class="lt-domain-eyebrow">'+esc(t().extras)+'</span>'+extras.map(x=>'<div class="lt-domain-info__row"><b>'+esc(providerText(x.title||x.code||x.id))+'</b>'+(x.description?'<span>'+esc(providerText(x.description))+'</span>':'')+'</div>').join('')+'</div>';
    if(customer.length) inner+='<div class="lt-domain-info"><span class="lt-domain-eyebrow">'+esc(t().customerFields)+'</span><div class="lt-domain-fieldchips">'+customer.map(x=>'<span>'+esc(fieldLabel(x))+'</span>').join('')+'</div></div>';
    if(passenger.length) inner+='<div class="lt-domain-info"><span class="lt-domain-eyebrow">'+esc(t().passengerFields)+'</span><div class="lt-domain-fieldchips">'+passenger.map(x=>'<span>'+esc(fieldLabel(x))+'</span>').join('')+'</div></div>';
    if(questions.length||custom.length) inner+='<div class="lt-domain-info"><span class="lt-domain-eyebrow">'+esc(t().questions)+'</span>'+[...questions,...custom].map(x=>'<div class="lt-domain-info__row"><b>'+esc(providerText(x.title||x.code||x.id))+'</b>'+(x.required?'<span>*</span>':'')+'</div>').join('')+'</div>';
    return '<section class="lt-domain-section"><div class="lt-domain-section__head"><span class="lt-domain-eyebrow">'+esc(t().bookingInfo)+'</span></div><div class="lt-domain-grid">'+inner+'</div></section>';
  }
  function renderDomain(domain,{preserveScroll=false}={}){
    const screen=document.querySelector('#tourScreen');
    if(!screen) return;
    // Fail open: domain controls stay interactive until BookingConfigurator has mounted successfully.
    screen.classList.remove('lt-booking-ui');
    const state=selectedState(domain);
    const rate=selectedRate(domain,state);
    const slot=selectedSlot(domain,state);
    const languages=arr(domain?.experience?.languages?.guidanceTypes).flatMap(x=>arr(x?.displayLanguages)).filter(Boolean).map(value=>l10n()?.languageName?.(value)??providerText(value));
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
    const heroPrice=rate ? ratePrice(domain,rate) : null;
    const reviewRating=Number(domain.experience.reviews?.rating);
    const reviewCount=Number(domain.experience.reviews?.count);
    const hasReviews=Number.isFinite(reviewRating)&&reviewRating>0&&Number.isFinite(reviewCount)&&reviewCount>0;

    screen.classList.add('lt-domain-tour');
    screen.dataset.ltDomainProduct=String(domain.experience.id);
    screen.innerHTML=
      '<div class="lt-domain-shell">'+
        '<button type="button" class="lt-domain-back" data-lt-domain-back>← '+esc(t().back)+'</button>'+
        photoGallery(domain)+
        '<section class="lt-domain-hero">'+
          '<div class="lt-domain-hero__accent" aria-hidden="true"><span></span><span></span><span></span></div>'+
          '<div class="lt-domain-live"><span></span>'+esc(t().live)+'</div>'+
          '<h1>'+esc(localizedProductTitle(domain))+'</h1>'+
          '<p>'+esc(localizedProductDescription(domain))+'</p>'+
          '<div class="lt-domain-facts">'+
            (domain.experience.duration?.text?'<div><small>'+esc(t().duration)+'</small><b>'+esc(l10n()?.duration?.(domain.experience.duration)??domain.experience.duration.text)+'</b></div>':'')+
            (languages.length?'<div><small>'+esc(t().languages)+'</small><b>'+esc(languages.join(' · '))+'</b></div>':'')+
            (domain.experience.difficulty?'<div><small>'+esc(t().difficulty)+'</small><b>'+esc(l10n()?.difficulty?.(domain.experience.difficulty)??providerText(domain.experience.difficulty))+'</b></div>':'')+
            (Number.isFinite(Number(domain.experience.minAge))?'<div><small>'+esc(t().minAge)+'</small><b>'+esc(domain.experience.minAge)+'+</b></div>':'')+
            (hasReviews?'<div><small>'+esc(t().reviews)+'</small><b>'+esc(reviewRating)+' · '+esc(reviewCount)+'</b></div>':'')+
            (String(domain.experience.booking?.capacityType||'').toUpperCase()==='ON_REQUEST'?'<div><small>'+esc(t().confirmation)+'</small><b>'+esc(t().onRequest)+'</b></div>':'')+
            (slot?'<div><small>'+esc(t().chooseDate)+'</small><b>'+esc(localizedDate(slot.date,{weekday:'short',day:'numeric',month:'short'})+' · '+(slot.startTime||''))+'</b></div>':'')+
          '</div>'+
          '<button type="button" class="lt-domain-quickbook" data-lt-jump-booking>'+
            '<span>'+(heroPrice?'<small>'+esc(t().from)+'</small><strong>'+esc(money(heroPrice))+'</strong>':'')+'</span>'+
            '<b>'+esc(t().chooseDate)+' →</b>'+
          '</button>'+
        '</section>'+
        rateCards(domain,state)+
        availabilityCards(domain,state)+
        participantPrices(domain,state)+
        meeting(domain,rate)+
        itinerary(domain)+
        videoSection(domain)+
        '<div class="lt-domain-content-grid">'+
          listSection(t().included,included,'included')+
          listSection(t().excluded,excluded,'excluded')+
          listSection(t().requirements,requirements,'requirements')+
          listSection(t().accessibility,domain?.experience?.accessibility,'accessibility')+
          listSection(t().offers,domain?.offers,'offers')+
          listSection(t().currencies,domain?.experience?.paymentCurrencies,'currencies')+
        '</div>'+
        (cancellation?'<section class="lt-domain-section"><div class="lt-domain-section__head"><span class="lt-domain-eyebrow">'+esc(t().conditions)+'</span></div><div class="lt-domain-policy"><b>'+esc(l10n()?.policyTitle?.(cancellation.title||'')??providerText(cancellation.title||''))+'</b>'+cancellationRows(cancellation)+'</div></section>':'')+
        bookingDynamic(domain)+
        (firstPhoto?'<div class="lt-domain-source-note" aria-hidden="true"></div>':'')+
        '<div class="lt-domain-stickybook" data-lt-sticky-book>'+
          '<div class="lt-domain-stickybook__copy"><small>'+esc(t().selectedOption)+'</small><b>'+esc(localizedRateTitle(domain,rate))+'</b></div>'+
          '<div class="lt-domain-stickybook__price">'+(heroPrice?'<small>'+esc(t().from)+'</small><strong>'+esc(money(heroPrice))+'</strong>':'')+'</div>'+
          '<button type="button" data-lt-jump-booking>'+esc(t().bookNow)+'</button>'+
        '</div>'+
      '</div>';

    wire(screen,domain);
    if(!preserveScroll){
      screen.scrollTop=0;
      try { window.scrollTo({top:0,behavior:'instant'}); } catch (_) { window.scrollTo(0,0); }
    }
  }
  function setGalleryIndex(screen,domain,nextIndex){
    const photos=galleryPhotos(domain);
    if(!photos.length) return;
    const normalized=((Number(nextIndex)||0)%photos.length+photos.length)%photos.length;
    galleryIndexByProduct.set(String(domain.experience.id),normalized);
    const hero=screen.querySelector('[data-lt-gallery-hero]');
    const opener=screen.querySelector('[data-lt-gallery-open]');
    const counter=screen.querySelector('[data-lt-gallery-count]');
    if(hero){
      hero.src=photos[normalized].url;
      hero.alt=localizedProductTitle(domain)+' · '+t().photoOfTour+' '+(normalized+1);
    }
    if(opener) opener.dataset.ltGalleryOpen=String(normalized);
    if(counter) counter.textContent=(normalized+1)+' / '+photos.length;
    screen.querySelectorAll('[data-lt-gallery-thumb]').forEach(button=>{
      const active=Number(button.dataset.ltGalleryThumb)===normalized;
      button.classList.toggle('is-active',active);
      if(active) button.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
    });
  }
  function openGalleryLightbox(domain,startIndex=0){
    const photos=galleryPhotos(domain);
    if(!photos.length) return;
    let index=((Number(startIndex)||0)%photos.length+photos.length)%photos.length;
    const overlay=document.createElement('div');
    overlay.className='lt-domain-lightbox';
    overlay.innerHTML='<div class="lt-domain-lightbox__backdrop" data-lt-lightbox-close></div>'+
      '<div class="lt-domain-lightbox__panel" role="dialog" aria-modal="true" aria-label="'+esc(t().tourPhotos)+'">'+
        '<button type="button" class="lt-domain-lightbox__close" data-lt-lightbox-close aria-label="'+esc(t().closePhoto)+'">×</button>'+
        '<button type="button" class="lt-domain-lightbox__nav is-prev" data-lt-lightbox-prev aria-label="'+esc(t().previousPhoto)+'">‹</button>'+
        '<img data-lt-lightbox-image alt="">'+
        '<button type="button" class="lt-domain-lightbox__nav is-next" data-lt-lightbox-next aria-label="'+esc(t().nextPhoto)+'">›</button>'+
        '<div class="lt-domain-lightbox__count" data-lt-lightbox-count></div>'+
      '</div>';
    const image=overlay.querySelector('[data-lt-lightbox-image]');
    const count=overlay.querySelector('[data-lt-lightbox-count]');
    const paint=()=>{
      image.src=photos[index].url;
      image.alt=localizedProductTitle(domain)+' · '+t().photoOfTour+' '+(index+1);
      count.textContent=(index+1)+' / '+photos.length;
    };
    const step=delta=>{ index=(index+delta+photos.length)%photos.length; paint(); };
    const close=()=>{
      document.removeEventListener('keydown',onKey);
      overlay.remove();
      document.documentElement.classList.remove('lt-lightbox-open');
    };
    const onKey=event=>{
      if(event.key==='Escape') close();
      if(event.key==='ArrowLeft') step(-1);
      if(event.key==='ArrowRight') step(1);
    };
    let touchX=null;
    overlay.addEventListener('touchstart',event=>{ touchX=event.changedTouches?.[0]?.clientX ?? null; },{passive:true});
    overlay.addEventListener('touchend',event=>{
      if(touchX===null) return;
      const endX=event.changedTouches?.[0]?.clientX ?? touchX;
      const delta=endX-touchX;
      touchX=null;
      if(Math.abs(delta)>42) step(delta>0?-1:1);
    },{passive:true});
    overlay.querySelectorAll('[data-lt-lightbox-close]').forEach(button=>button.addEventListener('click',close));
    overlay.querySelector('[data-lt-lightbox-prev]')?.addEventListener('click',()=>step(-1));
    overlay.querySelector('[data-lt-lightbox-next]')?.addEventListener('click',()=>step(1));
    document.addEventListener('keydown',onKey);
    document.documentElement.classList.add('lt-lightbox-open');
    document.body.appendChild(overlay);
    paint();
  }
  function wire(screen,domain){
    screen.querySelector('[data-lt-domain-back]')?.addEventListener('click',()=>typeof showScreen==='function'&&showScreen('catalog'));
    screen.querySelector('[data-lt-jump-booking]')?.addEventListener('click',()=>{
      if(globalThis.LoveTravelBookingConfigurator?.open){ globalThis.LoveTravelBookingConfigurator.open('date'); return; }
      screen.querySelector('.lt-booking-config')?.scrollIntoView({behavior:'smooth',block:'center'});
    });
    screen.querySelectorAll('[data-lt-gallery-thumb]').forEach(button=>button.addEventListener('click',()=>setGalleryIndex(screen,domain,button.dataset.ltGalleryThumb)));
    screen.querySelector('[data-lt-gallery-prev]')?.addEventListener('click',()=>setGalleryIndex(screen,domain,currentGalleryIndex(domain)-1));
    screen.querySelector('[data-lt-gallery-next]')?.addEventListener('click',()=>setGalleryIndex(screen,domain,currentGalleryIndex(domain)+1));
    screen.querySelector('[data-lt-gallery-open]')?.addEventListener('click',buttonEvent=>openGalleryLightbox(domain,buttonEvent.currentTarget.dataset.ltGalleryOpen));
    screen.querySelectorAll('[data-lt-domain-rate]').forEach(button=>button.addEventListener('click',()=>{
      const state=selectedState(domain);
      state.rateId=button.dataset.ltDomainRate;
      const slot=arr(domain.availabilitySlots).find(s=>!s.soldOut&&!s.unavailable&&rateAvailable(s,state.rateId));
      state.slotId=slot?.id || null;
      renderDomain(domain,{preserveScroll:true});
    }));
    screen.querySelectorAll('[data-lt-domain-slot]').forEach(button=>button.addEventListener('click',()=>{
      const state=selectedState(domain);
      state.slotId=button.dataset.ltDomainSlot;
      renderDomain(domain,{preserveScroll:true});
    }));
  }
  async function domains(force=false){
    const requestedLocale=locale();
    if(force||domainLocale!==requestedLocale){
      domainPromise=null;
      domainLocale=requestedLocale;
    }
    if(!domainPromise){
      domainPromise=fetch('/api/bokun/domain?locale='+encodeURIComponent(requestedLocale),{cache:'no-store',credentials:'same-origin'})
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
    screen.classList.remove('lt-booking-ui');
    screen.classList.add('lt-domain-tour');
    screen.innerHTML='<div class="lt-domain-loading"><span class="lt-domain-spinner"></span><b>'+esc(t().loading)+'</b></div>';
  }
  function errorView(id){
    const screen=document.querySelector('#tourScreen');
    if(!screen) return;
    screen.classList.remove('lt-booking-ui');
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
  function activateDomainTourScreen(){
    try{
      if(typeof state!=='undefined' && state) state.screen='tour';
    }catch(_){}
    document.querySelectorAll('.screen').forEach(node=>node.classList.remove('active'));
    const screen=document.getElementById('tourScreen');
    if(screen) screen.classList.add('active');
    try{
      if(typeof setNavActive==='function') setNavActive('tour');
    }catch(_){}
    const content=document.getElementById('content');
    if(content) content.scrollTop=0;
  }
  function installOpenTour(){
    if(typeof globalThis.openTour!=='function') return false;
    if(globalThis.openTour.__loveTravelDomain) return true;
    const previous=globalThis.openTour;
    const wrapped=function(id,...args){
      const productId=String(id ?? '');
      if(PRODUCT_IDS.has(productId)){
        activateDomainTourScreen();
        void renderProduct(productId);
        return;
      }
      return previous.call(this,id,...args);
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
      setTimeout(()=>domains(true).then(list=>{
        const domain=list.find(item=>String(item?.experience?.id)===currentProductId);
        if(domain) renderDomain(domain);
      }).catch(()=>{}),80);
    }
  },true);
  install();
  globalThis.LoveTravelDomainTour={renderProduct,refresh:()=>currentProductId?renderProduct(currentProductId,true):Promise.resolve(false)};
})();
