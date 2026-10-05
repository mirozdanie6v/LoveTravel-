(() => {
  'use strict';

  const REGISTRY=globalThis.LoveTravelLocaleRegistry=globalThis.LoveTravelLocaleRegistry||Object.create(null);
  const STORAGE_KEY='lovetravel.locale.v1';
  const LEGACY_STORAGE_KEY='max-tour-locale-v1';
  const DEFAULT_LOCALE='ru-RU';
  const SUPPORTED=Object.freeze(['ru-RU','en-US','vi-VN','zh-CN','ko-KR']);
  const API_LOCALE=Object.freeze({'ru-RU':'ru','en-US':'en','vi-VN':'vi','zh-CN':'zh','ko-KR':'ko'});
  const ALIAS=Object.freeze({
    ru:'ru-RU','ru-ru':'ru-RU',
    en:'en-US','en-us':'en-US','en-gb':'en-US',
    vi:'vi-VN','vi-vn':'vi-VN',
    zh:'zh-CN','zh-cn':'zh-CN','zh-hans':'zh-CN',
    ko:'ko-KR','ko-kr':'ko-KR'
  });
  const listeners=new Set();
  const missing=new Set();

  function normalize(value){
    const raw=String(value??'').trim().replace('_','-');
    if(!raw) return '';
    if(SUPPORTED.includes(raw)) return raw;
    const lower=raw.toLowerCase();
    if(ALIAS[lower]) return ALIAS[lower];
    const prefix=lower.split('-')[0];
    return ALIAS[prefix]||'';
  }

  function readStored(){
    try {
      const current=normalize(globalThis.localStorage?.getItem?.(STORAGE_KEY));
      if(current) return current;
      const legacy=normalize(globalThis.localStorage?.getItem?.(LEGACY_STORAGE_KEY));
      if(legacy) {
        globalThis.localStorage?.setItem?.(STORAGE_KEY,legacy);
        return legacy;
      }
    } catch (_) {}
    const html=normalize(globalThis.document?.documentElement?.lang);
    if(html) return html;
    return DEFAULT_LOCALE;
  }

  let activeLocale=readStored();

  function bundle(locale=activeLocale){
    return REGISTRY[normalize(locale)||activeLocale]||null;
  }

  function interpolate(template,params={}){
    return String(template).replace(/\{([a-zA-Z0-9_.-]+)\}/g,(match,key)=>
      Object.prototype.hasOwnProperty.call(params,key) ? String(params[key]??'') : match
    );
  }

  function t(key,params={},options={}){
    const name=String(key||'');
    const value=bundle()?.[name];
    if(value!==undefined&&value!==null) return interpolate(value,params);
    const signature=activeLocale+':'+name;
    if(!missing.has(signature)){
      missing.add(signature);
      console.error('[LoveTravel i18n] missing key',signature);
    }
    if(Object.prototype.hasOwnProperty.call(options,'fallback')) return interpolate(options.fallback,params);
    return '⟦'+name+'⟧';
  }

  function has(key,locale=activeLocale){
    const b=bundle(locale);
    return Boolean(b&&Object.prototype.hasOwnProperty.call(b,String(key)));
  }

  function plural(key,count,params={}){
    const number=Number(count);
    const category=Number.isFinite(number)
      ? new Intl.PluralRules(intlLocale()).select(number)
      : 'other';
    const exact=String(key)+'.'+category;
    const other=String(key)+'.other';
    const chosen=has(exact)?exact:other;
    return t(chosen,{...params,count:Number.isFinite(number)?formatNumber(number):count});
  }

  function apiLocale(locale=activeLocale){
    return API_LOCALE[normalize(locale)||activeLocale]||'ru';
  }

  function locale(){
    return activeLocale;
  }

  function shortLocale(){
    return apiLocale();
  }

  function intlLocale(localeValue=activeLocale){
    return normalize(localeValue)||activeLocale;
  }

  function formatDate(value,options={}){
    const raw=String(value??'');
    const date=/^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw+'T12:00:00Z') : value instanceof Date ? value : new Date(value);
    if(Number.isNaN(date?.valueOf?.())) return raw;
    return new Intl.DateTimeFormat(intlLocale(),{timeZone:'UTC',...options}).format(date);
  }

  function formatNumber(value,options={}){
    const number=Number(value);
    if(!Number.isFinite(number)) return String(value??'');
    return new Intl.NumberFormat(intlLocale(),options).format(number);
  }

  function formatCurrency(value,currency='USD',options={}){
    const number=Number(value);
    if(!Number.isFinite(number)) return String(value??'');
    return new Intl.NumberFormat(intlLocale(),{
      style:'currency',currency,
      currencyDisplay:'narrowSymbol',
      maximumFractionDigits:Number.isInteger(number)?0:2,
      ...options
    }).format(number);
  }

  function formatUnit(value,unit,options={}){
    const number=Number(value);
    if(!Number.isFinite(number)) return String(value??'');
    try {
      return new Intl.NumberFormat(intlLocale(),{style:'unit',unit,unitDisplay:'long',...options}).format(number);
    } catch (_) {
      return formatNumber(number)+' '+unit;
    }
  }

  function formatDuration(value={}){
    const units=[['day',Number(value.days)||0],['hour',Number(value.hours)||0],['minute',Number(value.minutes)||0]];
    const parts=units.filter(([,n])=>n).map(([unit,n])=>formatUnit(n,unit));
    if(parts.length) return typeof Intl.ListFormat==='function'
      ? new Intl.ListFormat(intlLocale(),{style:'short',type:'unit'}).format(parts)
      : parts.join(' ');
    return String(value.text||'');
  }

  function formatAgeRange(min,max){
    return t('format.ageRange',{min:formatNumber(min),max:formatNumber(max)});
  }

  function formatMinutes(value){
    return formatUnit(value,'minute',{unitDisplay:'short'});
  }

  function formatList(values,options={}){
    const list=(Array.isArray(values)?values:[]).map(value=>String(value)).filter(Boolean);
    if(typeof Intl.ListFormat!=='function') return list.join(', ');
    return new Intl.ListFormat(intlLocale(),{style:'short',type:'conjunction',...options}).format(list);
  }

  function writeLocale(next){
    try {
      globalThis.localStorage?.setItem?.(STORAGE_KEY,next);
      globalThis.localStorage?.setItem?.(LEGACY_STORAGE_KEY,API_LOCALE[next]);
    } catch (_) {}
  }

  function applyDocumentLocale(){
    if(globalThis.document?.documentElement) globalThis.document.documentElement.lang=activeLocale;
  }

  function setLocale(value,{reload=true}={}){
    const next=normalize(value);
    if(!next||!SUPPORTED.includes(next)) return false;
    if(next===activeLocale){
      writeLocale(next);
      applyDocumentLocale();
      return true;
    }
    activeLocale=next;
    writeLocale(next);
    applyDocumentLocale();
    const detail={locale:activeLocale,apiLocale:apiLocale()};
    try { globalThis.document?.dispatchEvent?.(new CustomEvent('lovetravel:localechange',{detail})); } catch (_) {}
    listeners.forEach(fn=>{try{fn(detail);}catch(_){}});
    if(reload&&globalThis.location?.reload) globalThis.location.reload();
    return true;
  }

  function subscribe(fn){
    if(typeof fn!=='function') return ()=>{};
    listeners.add(fn);
    return ()=>listeners.delete(fn);
  }

  function ensureSwitcher(){
    const doc=globalThis.document;
    if(!doc) return null;
    let wrap=doc.querySelector('.lt-language-switcher,.mt-language-switcher');
    if(!wrap){
      const target=doc.querySelector('.top-actions')||doc.querySelector('.brandrow');
      if(!target) return null;
      wrap=doc.createElement('div');
      target.prepend(wrap);
    }
    wrap.classList.add('mt-language-switcher','lt-language-switcher');
    wrap.setAttribute('role','group');
    if(wrap.dataset.ltLocaleWired!=='1'){
      wrap.dataset.ltLocaleWired='1';
      wrap.addEventListener('click',event=>{
        const button=event.target.closest?.('button[data-locale]');
        if(button) setLocale(button.dataset.locale);
      });
    }
    wrap.setAttribute('aria-label',t('common.languageSwitcher'));
    const buttons=[
      ['ru-RU','RU'],['vi-VN','VI'],['en-US','EN'],['zh-CN','ZH'],['ko-KR','KO']
    ];
    wrap.innerHTML=buttons.map(([code,label])=>
      '<button type="button" data-locale="'+code+'" aria-pressed="'+(code===activeLocale?'true':'false')+'" class="'+(code===activeLocale?'active':'')+'">'+label+'</button>'
    ).join('');
    return wrap;
  }

  function assertComplete(referenceLocale=DEFAULT_LOCALE){
    const reference=REGISTRY[referenceLocale]||{};
    const referenceKeys=Object.keys(reference).filter(key=>!key.startsWith('meta.'));
    const report={};
    for(const code of SUPPORTED){
      const current=REGISTRY[code]||{};
      const missingKeys=referenceKeys.filter(key=>!Object.prototype.hasOwnProperty.call(current,key));
      const extraKeys=Object.keys(current).filter(key=>!key.startsWith('meta.')&&!Object.prototype.hasOwnProperty.call(reference,key));
      report[code]={missing:missingKeys,extra:extraKeys};
    }
    return report;
  }

  applyDocumentLocale();

  const api=Object.freeze({
    STORAGE_KEY,LEGACY_STORAGE_KEY,DEFAULT_LOCALE,SUPPORTED,
    normalize,locale,shortLocale,apiLocale,t,has,plural,setLocale,subscribe,
    formatDate,formatNumber,formatCurrency,formatUnit,formatDuration,formatAgeRange,formatMinutes,formatList,
    ensureSwitcher,assertComplete,bundle
  });
  globalThis.LoveTravelI18n=api;

  // Temporary compatibility surface while the old MAX TOUR shell is being removed.
  globalThis.MaxTourI18n=Object.freeze({
    get locale(){ return apiLocale(); },
    setLocale(value){ return setLocale(value); },
    t(value){ return String(value??''); },
    patchTours(){ return undefined; }
  });
})();
