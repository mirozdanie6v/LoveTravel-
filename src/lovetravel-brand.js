
(() => {
  'use strict';

  const OFFICIAL_LOGO = 'https://bizweb.dktcdn.net/100/416/263/themes/809458/assets/logo.png?1787117096236';
  const PRODUCT_IDS = ['1287578','1287580'];
  const DEFAULT_HERO_IMAGE = 'https://imgcdn.bokun.tools/52c09496-ca88-434c-9e4a-5ec811d31fc2.jpg?w=1200&h=1200';
  const copy = {
    ru:{
      badge:'Местный туроператор Нячанга',
      live:'Актуальные места',
      kicker:'NHA TRANG · ISLAND EXPERIENCES',
      title:'Откройте Нячанг <strong>с местной командой</strong>',
      lead:'Robinson Beach и Hòn Mun — реальные даты, актуальные цены и удобный путь от выбора до бронирования.',
      tours:'Смотреть экскурсии',
      ai:'Спросить AI',
      trust1:['Местная команда','только Нячанг'],
      trust2:['Живые даты','актуальная доступность'],
      trust3:['RU · VI · EN · ZH · KO','5 языков'],
      catalogTitle:'Островные экскурсии',
      catalogHint:'2 тура',
      catalogIntro:'Выберите одну из двух программ',
      catalogText:'Фото, программа, цены и свободные даты загружаются из системы туроператора.',
      card:'Открыть тур'
    },
    vi:{
      badge:'Nhà điều hành tour địa phương',
      live:'Chỗ trống trực tiếp',
      kicker:'NHA TRANG · TRẢI NGHIỆM BIỂN ĐẢO',
      title:'Khám phá Nha Trang <strong>cùng người địa phương</strong>',
      lead:'Robinson Beach và Hòn Mun — lịch khởi hành, giá hiện tại và quy trình đặt tour thuận tiện.',
      tours:'Xem tour',
      ai:'Hỏi trợ lý AI',
      trust1:['Đội ngũ địa phương','chỉ chuyên Nha Trang'],
      trust2:['Lịch trực tiếp','cập nhật chỗ trống'],
      trust3:['RU · VI · EN · ZH · KO','5 ngôn ngữ'],
      catalogTitle:'Trải nghiệm biển đảo',
      catalogHint:'2 tour',
      catalogIntro:'Chọn một trong hai chương trình',
      catalogText:'Hình ảnh, lịch trình, giá và chỗ trống được cập nhật từ hệ thống của nhà điều hành.',
      card:'Xem tour'
    },
    en:{
      badge:'Local Nha Trang operator',
      live:'Live availability',
      kicker:'NHA TRANG · ISLAND EXPERIENCES',
      title:'Discover Nha Trang <strong>with local experts</strong>',
      lead:'Robinson Beach and Hòn Mun with current dates, live pricing and a simple path from discovery to booking.',
      tours:'Explore tours',
      ai:'Ask AI assistant',
      trust1:['Local team','Nha Trang specialists'],
      trust2:['Live dates','current availability'],
      trust3:['RU · VI · EN · ZH · KO','5 languages'],
      catalogTitle:'Island experiences',
      catalogHint:'2 tours',
      catalogIntro:'Choose your island experience',
      catalogText:'Photos, itinerary, pricing and available departures are kept current from the operator system.',
      card:'View tour'
    },
    zh:{
      badge:'芽庄当地旅行社',
      live:'实时可订',
      kicker:'NHA TRANG · 海岛体验',
      title:'跟随当地团队<strong>探索芽庄</strong>',
      lead:'Robinson Beach 与 Hòn Mun 提供实时日期、当前价格和顺畅的一站式预订流程。',
      tours:'查看行程',
      ai:'咨询 AI',
      trust1:['当地团队','专注芽庄'],
      trust2:['实时日期','当前可订情况'],
      trust3:['RU · VI · EN · ZH · KO','5 种语言'],
      catalogTitle:'海岛行程',
      catalogHint:'2 条行程',
      catalogIntro:'请选择两条行程中的一条',
      catalogText:'照片、行程说明、价格和可订日期均实时来自旅行社系统。',
      card:'查看行程'
    },
    ko:{
      badge:'나트랑 현지 투어 운영사',
      live:'실시간 예약 가능',
      kicker:'NHA TRANG · ISLAND EXPERIENCES',
      title:'현지 전문가와 함께 <strong>나트랑을 만나보세요</strong>',
      lead:'Robinson Beach와 Hòn Mun의 최신 일정, 가격 및 예약 가능 정보를 확인하세요.',
      tours:'투어 보기',
      ai:'AI에게 묻기',
      trust1:['현지 팀','나트랑 전문'],
      trust2:['실시간 일정','예약 가능 정보'],
      trust3:['RU · VI · EN · ZH · KO','5개 언어'],
      catalogTitle:'아일랜드 투어',
      catalogHint:'투어 2개',
      catalogIntro:'두 가지 섬 투어 중 선택하세요',
      catalogText:'사진, 일정, 가격 및 출발 가능 정보가 운영 시스템에서 최신 상태로 제공됩니다.',
      card:'투어 보기'
    }
  };

  const locale = () => {
    const localized=globalThis.LoveTravelTourLocale?.locale?.();
    if(localized&&copy[localized]) return localized;
    const stored=String(localStorage.getItem('max-tour-locale-v1')||'').toLowerCase();
    if(copy[stored]) return stored;
    const html=String(document.documentElement.lang||'').toLowerCase();
    return copy[html]?html:'ru';
  };
  const t = () => copy[locale()];

  function tours() {
    try { return Array.isArray(TOURS) ? TOURS : []; } catch (_) { return []; }
  }

  function currentImage() {
    const items=tours();
    const robinson=items.find(item => String(item?.id) === PRODUCT_IDS[0])?.image;
    if (/^https:\/\/imgcdn\.bokun\.tools\//.test(String(robinson || ''))) return robinson;
    const liveBokun=items.find(item => /^https:\/\/imgcdn\.bokun\.tools\//.test(String(item?.image || '')))?.image;
    if (liveBokun) return liveBokun;
    const rendered=document.querySelector('#catalogScreen img[src*="imgcdn.bokun.tools"]')?.currentSrc
      || document.querySelector('#catalogScreen img[src*="imgcdn.bokun.tools"]')?.src;
    return rendered || DEFAULT_HERO_IMAGE;
  }

  function brandHeader() {
    document.documentElement.classList.add('love-travel-branded');
    if (document.title !== 'Nha Trang Love Travel') document.title='Nha Trang Love Travel';
    const brand=document.querySelector('.brandmark-real');
    if (!brand) return;
    brand.setAttribute('aria-label','Nha Trang Love Travel');
    let img=brand.querySelector('img');
    if (!img) {
      img=document.createElement('img');
      brand.replaceChildren(img);
    }
    if (img.src !== OFFICIAL_LOGO) img.src=OFFICIAL_LOGO;
    img.alt='Nha Trang Love Travel';
    img.loading='eager';
    img.decoding='async';
    img.onerror=() => {
      img.onerror=null;
      img.removeAttribute('src');
      img.alt='Nha Trang Love Travel';
      brand.classList.add('lt-logo-fallback');
      if (!brand.querySelector('.lt-wordmark')) {
        const word=document.createElement('span');
        word.className='lt-wordmark';
        word.textContent='Nha Trang Love Travel';
        brand.appendChild(word);
      }
    };
  }

  function heroMarkup() {
    const c=t();
    return `
      <div class="lt-hero__inner">
        <div class="lt-hero__top">
          <span class="lt-hero__badge">${c.badge}</span>
          <span class="lt-hero__status">${c.live}</span>
        </div>
        <div class="lt-hero__content">
          <div class="lt-hero__kicker">${c.kicker}</div>
          <h1>${c.title}</h1>
          <p class="lt-hero__lead">${c.lead}</p>
          <div class="lt-hero__chips" aria-label="Featured tours">
            <span class="lt-hero__chip">Robinson Beach</span>
            <span class="lt-hero__chip">Hòn Mun Marine Park</span>
          </div>
          <div class="lt-hero__actions">
            <button class="lt-hero__action lt-hero__action--primary" type="button" data-lt-action="catalog">${c.tours} →</button>
          </div>
        </div>
      </div>`;
  }

  function trustMarkup() {
    const c=t();
    return `
      <div class="lt-trust-item"><b>${c.trust1[0]}</b><span>${c.trust1[1]}</span></div>
      <div class="lt-trust-item"><b>${c.trust2[0]}</b><span>${c.trust2[1]}</span></div>
      <div class="lt-trust-item"><b>${c.trust3[0]}</b><span>${c.trust3[1]}</span></div>`;
  }

  function hideLegacyDiscovery(screen, hero) {
    const cards=[...screen.querySelectorAll('.quick-destination-card-v23')];
    if (!cards.length) return;
    let container=cards[0].parentElement;
    while (container?.parentElement && container.parentElement !== screen) {
      const candidate=container.parentElement;
      if (candidate.contains(hero)) break;
      if (candidate.querySelectorAll('.quick-destination-card-v23').length !== cards.length) break;
      container=candidate;
    }
    if (container && container !== screen && !container.contains(hero)) {
      container.hidden=true;
      container.setAttribute('aria-hidden','true');
    } else {
      cards.forEach(card => { card.hidden=true; card.setAttribute('aria-hidden','true'); });
    }
  }

  function brandHome() {
    const screen=document.getElementById('homeScreen');
    const hero=screen?.querySelector('.hero');
    if (!screen || !hero) return;
    hideLegacyDiscovery(screen, hero);

    const lang=locale();
    const image=currentImage();
    if (hero.dataset.ltBrandLocale !== lang || hero.dataset.ltBrandImage !== image || !hero.classList.contains('lt-hero')) {
      hero.className='hero lt-hero';
      hero.dataset.ltBrandLocale=lang;
      hero.dataset.ltBrandImage=image;
      hero.style.setProperty('--lt-hero-image', `url("${String(image).replace(/"/g,'%22')}")`);
      hero.innerHTML=heroMarkup();
    }

    let trust=screen.querySelector('.lt-home-trust');
    if (!trust) {
      trust=document.createElement('section');
      trust.className='lt-home-trust';
      hero.insertAdjacentElement('afterend',trust);
    }
    if (trust.dataset.ltLocale !== lang) {
      trust.dataset.ltLocale=lang;
      trust.innerHTML=trustMarkup();
    }
  }

  const legacyCardCopy={
    ru:{departure:'ВЫЕЗД',finish:'ФИНИШ',group:'групповой',from:'от'},
    vi:{departure:'KHỞI HÀNH',finish:'KẾT THÚC',group:'tour nhóm',from:'từ'},
    en:{departure:'DEPARTURE',finish:'FINISH',group:'group',from:'from'},
    zh:{departure:'出发',finish:'结束',group:'拼团',from:'起'},
    ko:{departure:'출발',finish:'종료',group:'그룹',from:'최저'}
  };

  function localizeLegacyCard(card,lang){
    const words=legacyCardCopy[lang]||legacyCardCopy.ru;
    const walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const raw=node.nodeValue||'';
      if(!raw.trim()) return;
      let value=raw;
      value=value.replace(/ВЫЕЗД/g,words.departure);
      value=value.replace(/ФИНИШ/g,words.finish);
      value=value.replace(/групповой\s+от/gi,lang==='zh'?words.group+' '+words.from:words.group+' '+words.from);
      value=value.replace(/\bгрупповой\b/gi,words.group);
      if(value!==raw) node.nodeValue=value;
    });
  }

  function brandCatalog() {
    const screen=document.getElementById('catalogScreen');
    if (!screen) return;
    screen.classList.add('lt-catalog');
    const c=t();
    const lang=locale();
    const title=screen.querySelector('.catalog-title-v26 h2');
    const hint=screen.querySelector('.catalog-title-v26 .hint');
    if (title && title.textContent !== c.catalogTitle) title.textContent=c.catalogTitle;
    if (hint && hint.textContent !== c.catalogHint) hint.textContent=c.catalogHint;

    let intro=screen.querySelector('.lt-catalog-intro');
    const sectionTitle=screen.querySelector('.catalog-title-v26');
    if (!intro && sectionTitle) {
      intro=document.createElement('div');
      intro.className='lt-catalog-intro';
      sectionTitle.insertAdjacentElement('afterend',intro);
    }
    if (intro && intro.dataset.ltLocale !== lang) {
      intro.dataset.ltLocale=lang;
      intro.innerHTML=`<b>${c.catalogIntro}</b><span>${c.catalogText}</span>`;
    }

    screen.querySelectorAll('.wide-card').forEach(card => {
      card.classList.add('lt-tour-card');
      localizeLegacyCard(card,lang);
      const priceRow=card.querySelector('.price-row');
      if (!priceRow) return;
      let action=priceRow.querySelector('.lt-card-action');
      if (!action) {
        action=document.createElement('span');
        action.className='lt-card-action';
        priceRow.appendChild(action);
      }
      const label=`${c.card} →`;
      if (action.textContent !== label) action.textContent=label;
    });
  }

  function replaceLegacyBrandText(root=document.body) {
    if (!root) return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const parent=node.parentElement;
      if (!parent || parent.closest('script,style,noscript')) return;
      const value=node.nodeValue || '';
      if (!/max\s*tour|maxtour/i.test(value)) return;
      node.nodeValue=value.replace(/MAX\s*TOUR|Max\s*Tour|MaxTour/gi,'Nha Trang Love Travel');
    });
  }

  function wireActions(root=document) {
    root.querySelectorAll?.('[data-lt-action]').forEach(button => {
      if (button.dataset.ltWired) return;
      button.dataset.ltWired='1';
      button.addEventListener('click',() => {
        const target=button.dataset.ltAction;
        if (typeof showScreen === 'function') showScreen(target);
      });
    });
  }

  let scheduled=false;
  function apply() {
    scheduled=false;
    brandHeader();
    brandHome();
    brandCatalog();
    replaceLegacyBrandText();
    wireActions();
  }
  function schedule() {
    if (scheduled) return;
    scheduled=true;
    requestAnimationFrame(apply);
  }

  if (typeof renderHome === 'function' && !renderHome.__loveTravelBrand) {
    const previous=renderHome;
    const wrapped=function(...args) {
      const result=previous.apply(this,args);
      schedule();
      return result;
    };
    wrapped.__loveTravelBrand=true;
    renderHome=wrapped;
  }
  if (typeof renderCatalog === 'function' && !renderCatalog.__loveTravelBrand) {
    const previous=renderCatalog;
    const wrapped=function(...args) {
      const result=previous.apply(this,args);
      schedule();
      return result;
    };
    wrapped.__loveTravelBrand=true;
    renderCatalog=wrapped;
  }

  document.addEventListener('click',event => {
    if (event.target.closest?.('.mt-language-switcher button')) setTimeout(schedule,30);
  },true);

  const observer=new MutationObserver(records => {
    if (records.some(record => record.type === 'childList' || record.attributeName === 'lang')) schedule();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['lang']});

  schedule();
  setTimeout(schedule,250);
  setTimeout(schedule,900);
  globalThis.LoveTravelBrand={apply,schedule,logo:OFFICIAL_LOGO};
})();
