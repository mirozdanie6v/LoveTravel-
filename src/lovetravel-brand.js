(() => {
  'use strict';

  const OFFICIAL_LOGO='https://bizweb.dktcdn.net/100/416/263/themes/809458/assets/logo.png?1787117096236';
  const PRODUCT_IDS=new Set(['1287578','1287580']);
  const DEFAULT_HERO_IMAGE='https://imgcdn.bokun.tools/52c09496-ca88-434c-9e4a-5ec811d31fc2.jpg?w=1200&h=1200';

  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const i18n=()=>globalThis.LoveTravelI18n;
  const tr=(key,params,options)=>i18n()?.t(key,params,options) ?? '⟦'+key+'⟧';
  const localizer=()=>globalThis.LoveTravelTourLocale || null;

  function rawTours(){
    try { return Array.isArray(globalThis.TOURS) ? globalThis.TOURS.filter(tour=>PRODUCT_IDS.has(String(tour?.id))) : []; }
    catch (_) { return []; }
  }

  function visibleTours(){
    return rawTours().map(tour=>localizer()?.localizeCatalogTour?.(tour) || structuredClone(tour));
  }

  function currentImage(){
    const items=visibleTours();
    const robinson=items.find(item=>String(item?.id)==='1287578')?.image;
    if(/^https:\/\/imgcdn\.bokun\.tools\//.test(String(robinson||''))) return robinson;
    const any=items.find(item=>/^https:\/\/imgcdn\.bokun\.tools\//.test(String(item?.image||'')))?.image;
    return any || DEFAULT_HERO_IMAGE;
  }

  function brandHeader(){
    document.documentElement.classList.add('love-travel-branded');
    document.title='Nha Trang Love Travel';
    i18n()?.ensureSwitcher?.();
    const brand=document.querySelector('.brandmark-real');
    if(!brand) return;
    brand.setAttribute('aria-label','Nha Trang Love Travel');
    let img=brand.querySelector('img');
    if(!img){
      img=document.createElement('img');
      brand.replaceChildren(img);
    }
    if(img.src!==OFFICIAL_LOGO) img.src=OFFICIAL_LOGO;
    img.alt='Nha Trang Love Travel';
    img.loading='eager';
    img.decoding='async';
    img.onerror=()=>{
      img.onerror=null;
      img.removeAttribute('src');
      img.alt='Nha Trang Love Travel';
      brand.classList.add('lt-logo-fallback');
      if(!brand.querySelector('.lt-wordmark')){
        const word=document.createElement('span');
        word.className='lt-wordmark';
        word.textContent='Nha Trang Love Travel';
        brand.appendChild(word);
      }
    };
  }

  function heroMarkup(){
    return `
      <div class="hero lt-hero" data-lux-hero="2" style="--lt-hero-image:url(&quot;${esc(currentImage()).replace(/&amp;/g,'&')}&quot;)">
        <div class="lt-hero__inner">
          <div class="lt-hero__top">
            <span class="lt-hero__badge">${esc(tr('brand.badge'))}</span>
            <span class="lt-hero__status">${esc(tr('brand.live'))}</span>
          </div>
          <div class="lt-hero__content">
            <div class="lt-hero__kicker">${esc(tr('brand.kicker'))}</div>
            <h1>${tr('brand.title')}</h1>
            <p class="lt-hero__lead">${esc(tr('brand.lead'))}</p>
            <div class="lt-hero__chips" aria-label="Robinson Beach, Hòn Mun Marine Park">
              <span class="lt-hero__chip">Robinson Beach</span>
              <span class="lt-hero__chip">Hòn Mun Marine Park</span>
            </div>
            <div class="lt-hero__actions">
              <button class="lt-hero__action lt-hero__action--primary" type="button" data-lt-action="catalog">${esc(tr('brand.tours'))} →</button>
            </div>
          </div>
        </div>
      </div>
      <section class="lt-home-trust">
        <div class="lt-trust-item"><b>${esc(tr('brand.trust1.0'))}</b><span>${esc(tr('brand.trust1.1'))}</span></div>
        <div class="lt-trust-item"><b>${esc(tr('brand.trust2.0'))}</b><span>${esc(tr('brand.trust2.1'))}</span></div>
        <div class="lt-trust-item"><b>${esc(tr('brand.trust3.0'))}</b><span>${esc(tr('brand.trust3.1'))}</span></div>
      </section>`;
  }

  function renderHome(){
    const screen=document.getElementById('homeScreen');
    if(!screen) return false;
    screen.innerHTML=heroMarkup();
    wireActions(screen);
    return true;
  }

  function tourImage(tour){
    return String(tour?.image || tour?.gallery?.[0] || tour?.fallbackImage || DEFAULT_HERO_IMAGE);
  }

  function tourPrice(tour){
    const value=tour?.group?.from || tour?.group?.adult || '';
    if(value) return String(value);
    const amount=Number(tour?.priceFromUsd);
    return Number.isFinite(amount)&&amount>0 ? i18n()?.formatCurrency?.(amount,'USD') || '$'+amount : '—';
  }

  function catalogCard(tour){
    const id=String(tour?.id||'');
    const title=String(tour?.title||'');
    const city=String(tour?.city||tr('catalog.city'));
    const format=String(tour?.formatsLabel||'').trim();
    const duration=String(tour?.duration||'').trim();
    const meta=[city,format,duration].filter(Boolean).join(' · ');
    const time=String(tour?.time||'—');
    return `
      <article class="wide-card lt-tour-card" data-lt-open-tour="${esc(id)}" tabindex="0" role="button" aria-label="${esc(title)}">
        <div class="img-wrap"><img src="${esc(tourImage(tour))}" alt="${esc(title)}" loading="lazy"></div>
        <div class="card-body">
          <h3>${esc(title)}</h3>
          <div class="meta">${esc(meta)}</div>
          <div class="time card-time">
            <span><em>${esc(tr('catalog.departure'))}</em><b>${esc(time)}</b></span>
            <span><em>${esc(tr('catalog.finish'))}</em><b>${esc(tr('catalog.finishByProgram'))}</b></span>
          </div>
          <div class="price-row">
            <div><div class="mini">${esc(tr('catalog.groupFrom'))}</div><div class="price">${esc(tourPrice(tour))}</div></div>
            <span class="lt-card-action">${esc(tr('brand.card'))} →</span>
          </div>
        </div>
      </article>`;
  }

  function renderCatalog(){
    const screen=document.getElementById('catalogScreen');
    if(!screen) return false;
    screen.classList.add('lt-catalog');
    const items=visibleTours();
    screen.innerHTML=`
      <div class="section-title catalog-title-v26">
        <h2>${esc(tr('brand.catalogTitle'))}</h2>
        <span class="hint">${esc(tr('brand.catalogHint'))}</span>
      </div>
      <div class="lt-catalog-intro">
        <b>${esc(tr('brand.catalogIntro'))}</b>
        <span>${esc(tr('brand.catalogText'))}</span>
      </div>
      <div class="lt-catalog-list">${items.map(catalogCard).join('')}</div>`;
    wireCatalog(screen);
    return true;
  }

  function wireCatalog(screen){
    if(screen.dataset.ltCatalogWired==='1') return;
    screen.dataset.ltCatalogWired='1';
    const open=target=>{
      const card=target?.closest?.('[data-lt-open-tour]');
      if(!card) return;
      const id=card.dataset.ltOpenTour;
      if(typeof globalThis.openTour==='function') globalThis.openTour(id);
    };
    screen.addEventListener('click',event=>open(event.target));
    screen.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ') return;
      const card=event.target.closest?.('[data-lt-open-tour]');
      if(!card) return;
      event.preventDefault();
      open(card);
    });
  }

  function wireActions(root=document){
    root.querySelectorAll?.('[data-lt-action]').forEach(button=>{
      if(button.dataset.ltWired) return;
      button.dataset.ltWired='1';
      button.addEventListener('click',()=>{
        const target=button.dataset.ltAction;
        if(typeof globalThis.showScreen==='function') globalThis.showScreen(target);
      });
    });
  }

  function apply(){
    brandHeader();
    renderHome();
    renderCatalog();
  }

  function wrapRenderer(name,after){
    const original=globalThis[name];
    if(typeof original!=='function'||original.__loveTravelSemanticRenderer) return;
    const wrapped=function(...args){
      const result=original.apply(this,args);
      after();
      return result;
    };
    wrapped.__loveTravelSemanticRenderer=true;
    wrapped.__previous=original;
    globalThis[name]=wrapped;
  }

  function install(){
    brandHeader();
    wrapRenderer('renderHome',renderHome);
    wrapRenderer('renderCatalog',renderCatalog);
    renderHome();
    renderCatalog();
    document.addEventListener('lovetravel:catalog-updated',renderCatalog);
  }

  install();
  globalThis.LoveTravelBrand=Object.freeze({apply,renderHome,renderCatalog,logo:OFFICIAL_LOGO});
})();
