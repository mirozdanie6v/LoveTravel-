const app=document.querySelector('#app');

const state={
  status:'loading',
  tours:[],
  selectedTourId:'',
  error:'',
};

const PRODUCT_IDS=new Set(['1287578','1287580']);

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
  if(duration.text) return String(duration.text);
  const hours=Number(duration.hours);
  const minutes=Number(duration.minutes);
  if(Number.isFinite(hours)&&hours>0) return hours+' ч';
  if(Number.isFinite(minutes)&&minutes>0) return Math.round(minutes/60*10)/10+' ч';
  return '';
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
  return [...doc.body.querySelectorAll('li')].map(item=>plainText(item.textContent)).filter(Boolean).length
    ? [...doc.body.querySelectorAll('li')].map(item=>plainText(item.textContent)).filter(Boolean)
    : plainText(doc.body.textContent).split(/\n+/).map(item=>item.trim()).filter(Boolean);
}

function normalizeTour(domain){
  const experience=domain?.experience||{};
  const id=String(experience.id||domain?.provider?.productId||'');
  const slot=nextSlot(domain);
  const photos=photoUrls(domain);
  return {
    id,
    title:plainText(experience.title)||'Tour',
    description:plainText(experience.description||experience.excerpt),
    city:plainText(experience?.location?.city)||'Nha Trang',
    category:plainText(experience.category),
    duration:durationLabel(experience),
    photos,
    price:priceLabel(domain),
    nextDate:formatDate(slot?.date),
    nextTime:String(slot?.startTime||''),
    included:listFrom(experience?.content?.included||experience?.content?.inclusions),
    itinerary:(Array.isArray(experience?.itinerary)?experience.itinerary:[]).map((item,index)=>({
      title:plainText(item?.title)||'Остановка '+(index+1),
      body:plainText(item?.body),
    })).filter(item=>item.title||item.body),
  };
}

function brand(){
  return '<a class="brand" href="#catalog" aria-label="Love Travel">'
    +'<span class="brand-mark" aria-hidden="true"></span>'
    +'<span class="brand-copy"><strong>LOVE TRAVEL</strong><span>NHA TRANG</span></span>'
    +'</a>';
}

function media(photo,title){
  return photo
    ? '<img src="'+esc(photo)+'" alt="'+esc(title)+'" loading="lazy" referrerpolicy="no-referrer">'
    : '<div class="media-fallback" role="img" aria-label="'+esc(title)+'"></div>';
}

function catalogView(){
  const cards=state.tours.map(tour=>{
    const chips=[tour.city,tour.duration,tour.category].filter(Boolean).slice(0,3)
      .map(value=>'<span class="chip">'+esc(value)+'</span>').join('');
    const slot=[tour.nextDate,tour.nextTime].filter(Boolean).join(' · ');
    return '<button class="tour-card" type="button" data-tour-id="'+esc(tour.id)+'">'
      +'<div class="card-media">'+media(tour.photos[0],tour.title)+'<span class="card-badge">Bókun live</span></div>'
      +'<div class="card-body"><div class="card-meta">'+chips+'</div>'
      +'<h3 class="card-title">'+esc(tour.title)+'</h3>'
      +'<p class="card-desc">'+esc(tour.description||'Актуальная экскурсия из Bókun Love Travel.')+'</p>'
      +'<div class="card-footer">'
      +'<div class="price"><span>от</span><strong>'+esc(tour.price||'по запросу')+'</strong></div>'
      +'<div class="next-slot"><span>ближайшая дата</span><strong>'+esc(slot||'уточняется')+'</strong></div>'
      +'</div></div></button>';
  }).join('');

  return '<main class="page">'
    +'<header class="topbar">'+brand()+'<span class="preview-pill">Client v2 · preview</span></header>'
    +'<section class="hero"><div class="eyebrow">Нячанг · реальные экскурсии</div>'
    +'<h1>Два маршрута. Один чистый интерфейс.</h1>'
    +'<p>Первый экран нового Love Travel Client v2: только актуальные данные Bókun, без legacy renderer, AI и booking-логики.</p></section>'
    +'<div class="section-head"><h2>Экскурсии</h2><span>2 live Bókun products</span></div>'
    +'<section class="tour-grid" aria-label="Экскурсии">'+cards+'</section>'
    +'</main>';
}

function detailView(tour){
  const chips=[tour.city,tour.duration,tour.category].filter(Boolean)
    .map(value=>'<span class="chip">'+esc(value)+'</span>').join('');
  const included=(tour.included.length?tour.included:['Состав программы уточняется в Bókun'])
    .slice(0,8).map(item=>'<li>'+esc(item)+'</li>').join('');
  const itinerary=(tour.itinerary.length?tour.itinerary:[{title:'Маршрут',body:'Подробная программа загружается из Bókun.'}])
    .slice(0,8).map((stop,index)=>'<div class="stop"><span class="stop-index">'+(index+1)+'</span><div><h3>'+esc(stop.title)+'</h3><p>'+esc(stop.body)+'</p></div></div>').join('');
  const slot=[tour.nextDate,tour.nextTime].filter(Boolean).join(' · ');

  return '<main class="page tour-page">'
    +'<header class="detail-topbar"><button class="back-button" type="button" data-back>← Все экскурсии</button><span class="preview-pill">read-only preview</span></header>'
    +'<section class="detail-hero">'
    +'<div class="detail-gallery">'+media(tour.photos[0],tour.title)+'</div>'
    +'<article class="detail-summary"><div><div class="card-meta">'+chips+'</div><h1>'+esc(tour.title)+'</h1><p>'+esc(tour.description||'Описание загружается из Bókun.')+'</p></div>'
    +'<div><div class="summary-foot"><div class="summary-price"><span>стоимость от</span><strong>'+esc(tour.price||'по запросу')+'</strong></div><div class="summary-date"><span>ближайший выезд</span><strong>'+esc(slot||'уточняется')+'</strong></div></div>'
    +'<div class="readonly-note">На этом этапе экран только показывает актуальный тур. Выбор даты, тарифа и гостей будет подключён следующим слоем через единый BookingTransaction.</div></div></article>'
    +'</section>'
    +'<section class="detail-grid"><article class="detail-block"><h2>Что включено</h2><ul class="clean-list">'+included+'</ul></article>'
    +'<article class="detail-block"><h2>О маршруте</h2><div class="itinerary">'+itinerary+'</div></article></section>'
    +'</main>';
}

function render(){
  if(state.status==='loading'){
    app.innerHTML='<main class="page"><header class="topbar">'+brand()+'<span class="preview-pill">Client v2 · preview</span></header><section class="state-panel"><div class="spinner" aria-hidden="true"></div><h2>Загружаем экскурсии</h2><p>Получаем два актуальных продукта Love Travel из Bókun.</p></section></main>';
    return;
  }
  if(state.status==='error'){
    app.innerHTML='<main class="page"><header class="topbar">'+brand()+'<span class="preview-pill">Client v2 · preview</span></header><section class="state-panel"><h2>Не удалось загрузить туры</h2><p>'+esc(state.error)+'</p><button class="retry" type="button" data-retry>Повторить</button></section></main>';
    app.querySelector('[data-retry]')?.addEventListener('click',loadTours);
    return;
  }

  const tour=state.tours.find(item=>item.id===state.selectedTourId);
  app.innerHTML=tour?detailView(tour):catalogView();

  app.querySelectorAll('[data-tour-id]').forEach(button=>{
    button.addEventListener('click',()=>{
      state.selectedTourId=button.dataset.tourId||'';
      history.replaceState(null,'','#tour/'+encodeURIComponent(state.selectedTourId));
      render();
      window.scrollTo({top:0,behavior:'instant'});
    });
  });
  app.querySelector('[data-back]')?.addEventListener('click',()=>{
    state.selectedTourId='';
    history.replaceState(null,'','#catalog');
    render();
    window.scrollTo({top:0,behavior:'instant'});
  });
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
      throw new Error(payload?.error||'Bókun API недоступен');
    }
    const tours=payload.domains.map(normalizeTour).filter(tour=>PRODUCT_IDS.has(tour.id));
    if(tours.length!==2||new Set(tours.map(tour=>tour.id)).size!==2){
      throw new Error('Ожидались ровно два live Bókun-тура');
    }
    state.tours=tours;
    state.status='ready';
    routeFromHash();
    render();
  }catch(error){
    state.status='error';
    state.error=String(error?.message||error||'Unknown error');
    render();
  }
}

window.addEventListener('hashchange',()=>{
  routeFromHash();
  render();
});

loadTours();
