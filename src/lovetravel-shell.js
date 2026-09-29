(() => {
  'use strict';

  const copy = {
    ru:{home:'Главная',catalog:'Экскурсии',loading:'Загружаем актуальные экскурсии…',from:'от'},
    vi:{home:'Trang chủ',catalog:'Tour',loading:'Đang tải tour mới nhất…',from:'từ'},
    en:{home:'Home',catalog:'Tours',loading:'Loading current tours…',from:'from'}
  };
  const locale=()=>['ru','vi','en'].includes(String(document.documentElement.lang||'').toLowerCase())
    ? String(document.documentElement.lang).toLowerCase() : 'ru';
  const t=()=>copy[locale()];

  globalThis.TOURS = [];
  globalThis.state = { screen:'home', selectedTour:null };

  function money(tour){
    const direct=Number(tour?.priceFromUsd);
    if(Number.isFinite(direct)&&direct>0) return '$'+(Number.isInteger(direct)?direct:direct.toFixed(2));
    const raw=String(tour?.group?.from||tour?.group?.adult||tour?.individual?.from||'').trim();
    return raw || '—';
  }
  function esc(value){
    return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function imageFor(tour){
    return String(tour?.image||tour?.gallery?.[0]||'');
  }
  function renderHome(){
    const screen=document.getElementById('homeScreen');
    if(!screen) return;
    if(!screen.querySelector('.lt-shell-loading') && !screen.querySelector('.lt-hero')){
      screen.innerHTML='<div class="lt-shell-loading">'+esc(t().loading)+'</div>';
    }
    globalThis.LoveTravelBrand?.schedule?.();
  }
  function renderCatalog(){
    const screen=document.getElementById('catalogScreen');
    if(!screen) return;
    if(globalThis.LOVE_TRAVEL_CATALOG_SOURCE==='unavailable') return;
    const tours=Array.isArray(globalThis.TOURS)?globalThis.TOURS:[];
    if(!tours.length){
      screen.innerHTML='<div class="lt-shell-loading">'+esc(t().loading)+'</div>';
      return;
    }
    screen.innerHTML=
      '<div class="catalog-title-v26"><h2>'+esc(t().catalog)+'</h2><span class="hint">'+tours.length+'</span></div>'+
      '<div class="lt-catalog-grid">'+tours.map(tour=>
        '<article class="wide-card" data-tour-id="'+esc(tour.id)+'" tabindex="0" role="button" aria-label="'+esc(tour.title)+'">'+
          '<div class="img-wrap">'+(imageFor(tour)?'<img src="'+esc(imageFor(tour))+'" alt="'+esc(tour.title)+'" loading="lazy">':'')+'</div>'+
          '<div class="lt-shell-card__body">'+
            '<h3>'+esc(tour.title)+'</h3>'+
            '<p>'+esc([tour.city||tour.region,tour.duration].filter(Boolean).join(' · '))+'</p>'+
            '<div class="price-row"><span>'+esc(t().from)+'</span><strong>'+esc(money(tour))+'</strong></div>'+
          '</div>'+
        '</article>'
      ).join('')+'</div>';
    screen.querySelectorAll('[data-tour-id]').forEach(card=>{
      const open=()=>globalThis.openTour?.(card.dataset.tourId);
      card.addEventListener('click',open);
      card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
    });
    globalThis.LoveTravelBrand?.schedule?.();
  }
  function showScreen(name){
    const target=['home','catalog','tour'].includes(String(name))?String(name):'catalog';
    globalThis.state.screen=target;
    document.querySelectorAll('.screen').forEach(screen=>screen.classList.toggle('active',screen.id===target+'Screen'));
    document.querySelectorAll('.bottom-nav .nav-btn').forEach(button=>button.classList.toggle('active',button.dataset.screen===target));
    if(target==='home') renderHome();
    if(target==='catalog') renderCatalog();
    window.scrollTo(0,0);
  }
  function openTour(id){
    const tour=(Array.isArray(globalThis.TOURS)?globalThis.TOURS:[]).find(item=>String(item?.id)===String(id))||null;
    globalThis.state.selectedTour=tour;
    const screen=document.getElementById('tourScreen');
    if(screen) screen.innerHTML='<div class="lt-shell-loading">'+esc(t().loading)+'</div>';
    showScreen('tour');
  }
  function applyLocale(next){
    const value=['ru','vi','en'].includes(next)?next:'ru';
    document.documentElement.lang=value;
    localStorage.setItem('love-travel-locale-v1',value);
    document.querySelectorAll('.mt-language-switcher button').forEach(button=>button.classList.toggle('active',button.dataset.locale===value));
    const home=document.querySelector('[data-screen="home"] .nav-label');
    const catalog=document.querySelector('[data-screen="catalog"] .nav-label');
    if(home) home.textContent=t().home;
    if(catalog) catalog.textContent=t().catalog;
    if(globalThis.state.screen==='catalog') renderCatalog(); else renderHome();
  }

  globalThis.renderHome=renderHome;
  globalThis.renderCatalog=renderCatalog;
  globalThis.showScreen=showScreen;
  globalThis.openTour=openTour;

  document.addEventListener('click',event=>{
    const nav=event.target.closest?.('.bottom-nav .nav-btn');
    if(nav){ event.preventDefault(); showScreen(nav.dataset.screen); return; }
    const lang=event.target.closest?.('.mt-language-switcher button');
    if(lang){ event.preventDefault(); applyLocale(lang.dataset.locale); }
  });

  const initial=String(localStorage.getItem('love-travel-locale-v1')||'ru').toLowerCase();
  applyLocale(initial);
  showScreen('home');
})();
