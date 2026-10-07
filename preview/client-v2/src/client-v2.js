const app=document.querySelector('#app');

const state={
  status:'loading',
  tours:[],
  selectedTourId:'',
  detailTab:'overview',
  galleryIndexByTour:new Map(),
  error:'',
};

const PRODUCT_IDS=new Set(['1287578','1287580']);
const OFFICIAL_LOGO='https://bizweb.dktcdn.net/100/416/263/themes/809458/assets/logo.png?1787117096236';

const esc=value=>String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'","&#39;");

function plainText(value){
  if(Array.isArray(value)) return value.map(plainText).filter(Boolean);
  const source=String(value??'');
  if(!source) return '';
  const doc=new DOMParser().parseFromString(source,'text/html');
  return (doc.body.textContent||'').replace(/\s+/g,' ').trim();
}

function photoUrls(domain){
  const values=Array.isArray(domain?.experience?.media?.photos)
    ? domain.experience.media.photos
    : [];
  return [...new Set(values.map(item=>String(item?.url||item?.originalUrl||'').trim()).filter(Boolean))];
}

function durationLabel(experience){
  const duration=experience?.duration||{};
  const hours=Number(duration.hours);
  const minutes=Number(duration.minutes);
  const source=String(duration.text||'').trim();
  if(Number.isFinite(hours)&&hours>0) return hours+' ч';
  if(Number.isFinite(minutes)&&minutes>0) return Math.round(minutes/60*10)/10+' ч';
  const match=source.match(/(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|h|час)/i);
  if(match) return String(match[1]).replace('.',',')+' ч';
  return source.replace(/hours?/gi,'ч').replace(/hrs?/gi,'ч');
}

function categoryLabel(value){
  const key=String(value||'').toUpperCase();
  const labels={
    DAY_TOUR_OR_ACTIVITY:'Экскурсия на день',
    TOUR_OR_ACTIVITY:'Экскурсия',
    ACTIVITY:'Активность',
  };
  return labels[key]||plainText(String(value||'').replaceAll('_',' ').toLowerCase());
}

function amountValue(value){
  if(value&&typeof value==='object') return amountValue(value.amount);
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function priceLabel(domain){
  const adult=Array.isArray(domain?.participants)
    ? domain.participants.find(item=>String(item?.ticketCategory||'').toUpperCase()==='ADULT')
    : null;
  const slot=(Array.isArray(domain?.availabilitySlots)?domain.availabilitySlots:[])
    .find(item=>!item?.soldOut&&!item?.unavailable)
    || domain?.availabilitySlots?.[0];
  const matrices=Array.isArray(slot?.priceQuotesByRate)?slot.priceQuotesByRate:[];
  for(const matrix of matrices){
    const prices=Array.isArray(matrix?.participantPrices)?matrix.participantPrices:[];
    const preferred=prices.find(item=>String(item?.categoryId??'')===String(adult?.id??''))||prices[0];
    const amount=amountValue(preferred?.amount);
    const currency=String(preferred?.amount?.currency||preferred?.currency||'USD');
    if(amount!==null){
      const formatted=Number.isInteger(amount)?String(amount):amount.toFixed(2).replace(/\.00$/,'');
      return currency==='USD'?'$'+formatted:formatted+' '+currency;
    }
  }
  return '';
}

function nextSlot(domain){
  const slots=Array.isArray(domain?.availabilitySlots)?domain.availabilitySlots:[];
  return slots.find(item=>!item?.soldOut&&!item?.unavailable)||slots[0]||null;
}

function formatDate(iso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||''))) return '';
  return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'})
    .format(new Date(iso+'T00:00:00Z'));
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
  const points=Array.isArray(experience?.meeting?.startPoints)?experience.meeting.startPoints:[];
  const first=points[0];
  return plainText(first?.title||first?.name||first?.address||'');
}

function normalizeTour(domain){
  const experience=domain?.experience||{};
  const id=String(experience.id||domain?.provider?.productId||'');
  const slot=nextSlot(domain);
  const photos=photoUrls(domain);
  const included=listFrom(experience?.content?.included||experience?.content?.inclusions);
  return {
    id,
    title:plainText(experience.title)||'Экскурсия',
    description:plainText(experience.description||experience.excerpt),
    city:plainText(experience?.location?.city)||'Nha Trang',
    category:categoryLabel(experience.category),
    duration:durationLabel(experience),
    photos,
    price:priceLabel(domain),
    nextDate:formatDate(slot?.date),
    nextTime:String(slot?.startTime||''),
    meeting:meetingLabel(experience),
    included,
    highlights:included.slice(0,3),
    itinerary:(Array.isArray(experience?.itinerary)?experience.itinerary:[]).map((item,index)=>({
      title:plainText(item?.title)||'Остановка '+(index+1),
      body:plainText(item?.body),
    })).filter(item=>item.title||item.body),
  };
}

function brand(){
  return '<a class="brand" href="#catalog" aria-label="Nha Trang Love Travel">'
    +'<span class="brand-logo-wrap"><img class="brand-logo" src="'+esc(OFFICIAL_LOGO)+'" alt="Nha Trang Love Travel"></span>'
    +'<span class="brand-fallback"><strong>LOVE TRAVEL</strong><small>NHA TRANG</small></span>'
    +'</a>';
}

function media(photo,title,extra=''){
  return photo
    ? '<img '+extra+' src="'+esc(photo)+'" alt="'+esc(title)+'" loading="lazy" referrerpolicy="no-referrer">'
    : '<div class="media-fallback" role="img" aria-label="'+esc(title)+'"></div>';
}

function slotText(tour){
  return [tour.nextDate,tour.nextTime].filter(Boolean).join(' · ')||'Даты уточняются';
}

function tourThemeLabel(tour){
  return tour.id==='1287578'?'Robinson Beach':'Hòn Mun Marine Park';
}

function catalogView(){
  const heroTour=state.tours[0];
  const heroPhoto=heroTour?.photos?.[0]||'';
  const cards=state.tours.map(tour=>{
    const detailMeta=[tour.duration,tour.category].filter(Boolean)
      .map(value=>'<span class="card-chip">'+esc(value)+'</span>').join('');
    return '<button class="tour-card" type="button" data-tour-id="'+esc(tour.id)+'">'
      +'<span class="card-media">'+media(tour.photos[0],tour.title)
      +'<span class="card-media-shade"></span>'
      +'<span class="card-place">'+esc(tourThemeLabel(tour))+'</span>'
      +'<span class="card-live"><i></i> Актуальные даты</span></span>'
      +'<span class="card-body">'
      +'<span class="card-meta">'+detailMeta+'</span>'
      +'<strong class="card-title">'+esc(tour.title)+'</strong>'
      +'<span class="card-desc">'+esc(tour.description||'Островная экскурсия по Нячангу с актуальными датами и ценой.')+'</span>'
      +'<span class="card-facts">'
      +'<span><small>Ближайший выезд</small><b>'+esc(slotText(tour))+'</b></span>'
      +'<span><small>Стоимость от</small><b class="card-price">'+esc(tour.price||'по запросу')+'</b></span>'
      +'</span>'
      +'<span class="card-action">Открыть экскурсию <b>→</b></span>'
      +'</span></button>';
  }).join('');

  return '<main class="page catalog-page">'
    +'<header class="topbar">'+brand()+'<span class="location-pill"><span>●</span> Нячанг</span></header>'
    +'<section class="catalog-hero" style="--hero-image:url(&quot;'+esc(heroPhoto).replaceAll('&quot;','%22')+'&quot;)">'
    +'<div class="catalog-hero__shade"></div>'
    +'<div class="catalog-hero__top"><span class="glass-pill">Местный туроператор</span><span class="glass-pill glass-pill--live"><i></i> Свободные места</span></div>'
    +'<div class="catalog-hero__content">'
    +'<div class="hero-kicker">NHA TRANG · ISLAND EXPERIENCES</div>'
    +'<h1>Откройте Нячанг <strong>с местной командой</strong></h1>'
    +'<p>Robinson Beach и Hòn Mun — две островные программы с актуальными фотографиями, ценами и ближайшими датами.</p>'
    +'<div class="hero-chips"><span>Robinson Beach</span><span>Hòn Mun</span></div>'
    +'<div class="hero-actions"><button type="button" class="hero-cta hero-cta--primary" data-scroll-tours>Выбрать экскурсию <b>→</b></button>'
    +'<button type="button" class="hero-cta hero-cta--glass" data-scroll-info>Как проходит тур</button></div>'
    +'</div></section>'
    +'<section class="trust-row" data-info-anchor>'
    +'<div><span class="trust-icon">✦</span><b>Местная команда</b><small>Нячанг и острова</small></div>'
    +'<div><span class="trust-icon">◷</span><b>Актуальные даты</b><small>из системы туроператора</small></div>'
    +'<div><span class="trust-icon">◎</span><b>Прозрачная цена</b><small>до выбора бронирования</small></div>'
    +'</section>'
    +'<section class="catalog-section" data-tours-anchor>'
    +'<div class="section-head"><div><span class="section-kicker">ВЫБЕРИТЕ СВОЙ МАРШРУТ</span><h2>Островные экскурсии</h2></div><span class="section-count">2 программы</span></div>'
    +'<div class="tour-grid">'+cards+'</div>'
    +'</section>'
    +'</main>';
}

function galleryMarkup(tour){
  const photos=tour.photos.length?tour.photos:[];
  const rawIndex=Number(state.galleryIndexByTour.get(tour.id)||0);
  const index=photos.length?Math.max(0,Math.min(photos.length-1,rawIndex)):0;
  const photo=photos[index]||'';
  return '<div class="detail-photo">'
    +media(photo,tour.title,'data-detail-hero-image')
    +'<div class="detail-photo__shade"></div>'
    +'<div class="detail-photo__top"><button type="button" class="glass-back" data-back>← Все экскурсии</button><span class="photo-count">'+(photos.length?(index+1)+' / '+photos.length:'Фото')+'</span></div>'
    +(photos.length>1?'<button type="button" class="gallery-nav gallery-nav--prev" data-gallery-prev aria-label="Предыдущее фото">‹</button><button type="button" class="gallery-nav gallery-nav--next" data-gallery-next aria-label="Следующее фото">›</button>':'')
    +'</div>';
}

function overviewPanel(tour){
  const facts=[
    ['Длительность',tour.duration||'уточняется'],
    ['Ближайший выезд',slotText(tour)],
    ['Место встречи',tour.meeting||'уточняется'],
  ];
  const highlights=(tour.highlights.length?tour.highlights:['Островной маршрут по Нячангу'])
    .slice(0,3).map(item=>'<li>'+esc(item)+'</li>').join('');
  return '<div class="tab-panel tab-panel--overview">'
    +'<article class="content-card content-card--intro"><span class="content-kicker">ОБ ЭКСКУРСИИ</span><h2>'+esc(tourThemeLabel(tour))+'</h2><p>'+esc(tour.description||'Описание экскурсии загружается из системы туроператора.')+'</p></article>'
    +'<div class="fact-grid">'+facts.map(([label,value])=>'<div class="fact-card"><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div>').join('')+'</div>'
    +'<article class="content-card"><span class="content-kicker">ГЛАВНОЕ</span><h2>Что вас ждёт</h2><ul class="accent-list">'+highlights+'</ul></article>'
    +'</div>';
}

function itineraryPanel(tour){
  const itinerary=(tour.itinerary.length?tour.itinerary:[{title:'Островной маршрут',body:'Подробная программа уточняется в системе туроператора.'}])
    .slice(0,10).map((stop,index)=>'<div class="timeline-stop"><span class="timeline-index">'+(index+1)+'</span><div><h3>'+esc(stop.title)+'</h3><p>'+esc(stop.body)+'</p></div></div>').join('');
  return '<article class="content-card"><span class="content-kicker">МАРШРУТ</span><h2>Программа дня</h2><div class="timeline">'+itinerary+'</div></article>';
}

function includedPanel(tour){
  const included=(tour.included.length?tour.included:['Состав программы уточняется в системе туроператора'])
    .slice(0,12).map(item=>'<li>'+esc(item)+'</li>').join('');
  return '<article class="content-card"><span class="content-kicker">В СТОИМОСТИ</span><h2>Что включено</h2><ul class="included-list">'+included+'</ul></article>';
}

function photosPanel(tour){
  const photos=(tour.photos.length?tour.photos:[]).slice(0,10);
  return '<article class="content-card"><span class="content-kicker">ГАЛЕРЕЯ</span><h2>Фотографии тура</h2><div class="photo-grid">'
    +(photos.length?photos.map((photo,index)=>'<button type="button" class="photo-thumb" data-photo-index="'+index+'" aria-label="Открыть фото '+(index+1)+'">'+media(photo,tour.title)+'</button>').join(''):'<p class="empty-copy">Фотографии уточняются.</p>')
    +'</div></article>';
}

function detailPanel(tour){
  if(state.detailTab==='itinerary') return itineraryPanel(tour);
  if(state.detailTab==='included') return includedPanel(tour);
  if(state.detailTab==='photos') return photosPanel(tour);
  return overviewPanel(tour);
}

function detailView(tour){
  const price=tour.price||'по запросу';
  const meta=[tour.city,tour.duration,tour.category].filter(Boolean)
    .map(value=>'<span class="hero-chip">'+esc(value)+'</span>').join('');
  const tabs=[
    ['overview','Обзор'],
    ['itinerary','Программа'],
    ['included','Включено'],
    ['photos','Фото'],
  ];
  return '<main class="page tour-page">'
    +'<header class="topbar topbar--detail">'+brand()+'<span class="location-pill">Нячанг</span></header>'
    +'<section class="detail-hero">'
    +galleryMarkup(tour)
    +'<div class="detail-hero__content"><div class="detail-meta">'+meta+'</div><h1>'+esc(tour.title)+'</h1>'
    +'<p class="detail-lead">'+esc(tour.description||'Островная экскурсия по Нячангу.')+'</p>'
    +'<div class="detail-purchase"><div><small>Стоимость от</small><strong>'+esc(price)+'</strong></div><div><small>Ближайший выезд</small><b>'+esc(slotText(tour))+'</b></div></div>'
    +'<div class="detail-actions"><button type="button" class="primary-cta" data-visual-booking>Выбрать дату <b>→</b></button><button type="button" class="secondary-cta" data-open-photos>Смотреть фото</button></div>'
    +'</div></section>'
    +'<nav class="tour-tabs" aria-label="Разделы экскурсии">'+tabs.map(([id,label])=>'<button type="button" class="tour-tab '+(state.detailTab===id?'is-active':'')+'" data-tab="'+id+'">'+label+'</button>').join('')+'</nav>'
    +'<section class="tour-content" id="tour-content">'+detailPanel(tour)+'</section>'
    +'<div class="mobile-booking-bar"><div><small>от</small><strong>'+esc(price)+'</strong></div><button type="button" data-visual-booking>Выбрать дату</button></div>'
    +'</main>';
}

function showBookingPreviewNotice(){
  document.querySelector('.stage-notice')?.remove();
  const notice=document.createElement('div');
  notice.className='stage-notice';
  notice.textContent='Экран выбора даты подключается следующим слоем. Сейчас проверяем только дизайн тура.';
  document.body.appendChild(notice);
  requestAnimationFrame(()=>notice.classList.add('is-visible'));
  window.setTimeout(()=>{notice.classList.remove('is-visible');window.setTimeout(()=>notice.remove(),220);},2600);
}

function bindInteractions(){
  app.querySelectorAll('[data-tour-id]').forEach(button=>{
    button.addEventListener('click',()=>{
      state.selectedTourId=button.dataset.tourId||'';
      state.detailTab='overview';
      history.replaceState(null,'','#tour/'+encodeURIComponent(state.selectedTourId));
      render();
      window.scrollTo({top:0,behavior:'auto'});
    });
  });

  app.querySelector('[data-back]')?.addEventListener('click',()=>{
    state.selectedTourId='';
    state.detailTab='overview';
    history.replaceState(null,'','#catalog');
    render();
    window.scrollTo({top:0,behavior:'auto'});
  });

  app.querySelector('[data-scroll-tours]')?.addEventListener('click',()=>{
    app.querySelector('[data-tours-anchor]')?.scrollIntoView({behavior:'smooth',block:'start'});
  });
  app.querySelector('[data-scroll-info]')?.addEventListener('click',()=>{
    app.querySelector('[data-info-anchor]')?.scrollIntoView({behavior:'smooth',block:'center'});
  });

  app.querySelectorAll('[data-tab]').forEach(button=>{
    button.addEventListener('click',()=>{
      state.detailTab=button.dataset.tab||'overview';
      render();
      app.querySelector('#tour-content')?.scrollIntoView({behavior:'auto',block:'start'});
    });
  });

  app.querySelector('[data-open-photos]')?.addEventListener('click',()=>{
    state.detailTab='photos';
    render();
    app.querySelector('#tour-content')?.scrollIntoView({behavior:'smooth',block:'start'});
  });

  const tour=state.tours.find(item=>item.id===state.selectedTourId);
  if(tour){
    const moveGallery=delta=>{
      const count=tour.photos.length;
      if(!count) return;
      const current=Number(state.galleryIndexByTour.get(tour.id)||0);
      state.galleryIndexByTour.set(tour.id,(current+delta+count)%count);
      render();
    };
    app.querySelector('[data-gallery-prev]')?.addEventListener('click',()=>moveGallery(-1));
    app.querySelector('[data-gallery-next]')?.addEventListener('click',()=>moveGallery(1));
    app.querySelectorAll('[data-photo-index]').forEach(button=>{
      button.addEventListener('click',()=>{
        state.galleryIndexByTour.set(tour.id,Number(button.dataset.photoIndex)||0);
        state.detailTab='overview';
        render();
        window.scrollTo({top:0,behavior:'smooth'});
      });
    });
  }

  app.querySelectorAll('[data-visual-booking]').forEach(button=>{
    button.addEventListener('click',showBookingPreviewNotice);
  });

  const logo=app.querySelector('.brand-logo');
  if(logo) logo.addEventListener('error',()=>app.querySelector('.brand')?.classList.add('is-fallback'),{once:true});
}

function render(){
  if(state.status==='loading'){
    app.innerHTML='<main class="page"><header class="topbar">'+brand()+'<span class="location-pill">Нячанг</span></header><section class="state-panel"><div class="spinner" aria-hidden="true"></div><h2>Загружаем экскурсии</h2><p>Подготавливаем актуальные программы Love Travel.</p></section></main>';
    return;
  }
  if(state.status==='error'){
    app.innerHTML='<main class="page"><header class="topbar">'+brand()+'<span class="location-pill">Нячанг</span></header><section class="state-panel"><h2>Не удалось загрузить туры</h2><p>'+esc(state.error)+'</p><button class="retry" type="button" data-retry>Повторить</button></section></main>';
    app.querySelector('[data-retry]')?.addEventListener('click',loadTours);
    return;
  }

  const tour=state.tours.find(item=>item.id===state.selectedTourId);
  app.innerHTML=tour?detailView(tour):catalogView();
  bindInteractions();
}

function routeFromHash(){
  const match=location.hash.match(/^#tour\/([^/?#]+)/);
  state.selectedTourId=match?decodeURIComponent(match[1]):'';
}

async function loadTours(){
  state.status='loading';
  state.error='';
  render();
  try{
    const response=await fetch('/api/tours',{headers:{accept:'application/json'}});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.ok||!Array.isArray(payload.domains)){
      throw new Error(payload?.error||'Не удалось получить актуальные экскурсии');
    }
    const tours=payload.domains.map(normalizeTour).filter(tour=>PRODUCT_IDS.has(tour.id));
    if(tours.length!==2||new Set(tours.map(tour=>tour.id)).size!==2){
      throw new Error('Сейчас недоступен полный список экскурсий');
    }
    state.tours=tours;
    state.status='ready';
    routeFromHash();
    render();
  }catch(error){
    state.status='error';
    state.error=String(error?.message||error||'Неизвестная ошибка');
    render();
  }
}

window.addEventListener('hashchange',()=>{
  routeFromHash();
  state.detailTab='overview';
  render();
});

loadTours();
