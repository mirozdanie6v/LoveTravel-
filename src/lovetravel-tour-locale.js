(() => {
  'use strict';

  const STORAGE_KEY='max-tour-locale-v1';
  const SUPPORTED=['ru','vi','en','ko','zh'];

  function i18n(){ return globalThis.LoveTravelI18n || null; }
  function locale(){
    const fromCore=i18n()?.locale?.();
    if(SUPPORTED.includes(fromCore)) return fromCore;
    const stored=String(localStorage.getItem(STORAGE_KEY)||'').toLowerCase();
    if(SUPPORTED.includes(stored)) return stored;
    const html=String(document.documentElement.lang||'').toLowerCase();
    return SUPPORTED.includes(html)?html:'ru';
  }
  function tr(key,vars={},fallback=''){
    const value=i18n()?.t?.(key,vars);
    return value && value!==key ? value : fallback;
  }

  const exactKeys=Object.freeze({
    'Standard Viator policy':'provider.policy.standard',
    'English':'provider.language.english',
    'Vietnamese':'provider.language.vietnamese',
    'Russian':'provider.language.russian',
    'Korean':'provider.language.korean',
    'Chinese':'provider.language.chinese',
    'Hotel name':'provider.hotelName',
    'Room number':'provider.roomNumber',
    'Private transfer':'provider.privateTransfer',
    'Bring sunscreen':'provider.bringSunscreen',
    'Nha Trang hotels':'provider.nhaTrangHotels',
    'required':'provider.required',
    'WALKING':'provider.walking',
    'индивидуальный':'provider.format.private',
    'групповой':'provider.format.group',
    'available':'provider.availability.available',
    'full':'provider.availability.full'
  });
  const difficultyKeys=Object.freeze({
    EASY:'provider.difficulty.easy',
    MODERATE:'provider.difficulty.moderate',
    CHALLENGING:'provider.difficulty.challenging',
    DIFFICULT:'provider.difficulty.difficult',
    HARD:'provider.difficulty.hard'
  });
  const meetingKeys=Object.freeze({
    MEET_ON_LOCATION:'provider.meeting.meetOnLocation',
    PICK_UP:'provider.meeting.pickup',
    PICKUP:'provider.meeting.pickup',
    MEET_ON_LOCATION_OR_PICK_UP:'provider.meeting.both'
  });

  function productTitle(_productId,fallback=''){ return String(fallback||''); }
  function productDescription(_productId,fallback=''){ return String(fallback||''); }
  function itineraryBody(_productId,_index,fallback=''){ return String(fallback||''); }
  function rateTitle(_productId,_rateId,fallback=''){ return String(fallback||''); }

  function providerText(value){
    const raw=String(value??'').trim();
    if(!raw) return raw;
    const key=exactKeys[raw];
    return key ? tr(key,{},raw) : raw;
  }
  function languageName(value){
    const raw=String(value??'').trim();
    const normalized=raw.toLowerCase().replace('_','-');
    const canonical={
      en:'English','en-gb':'English','en-us':'English','english':'English',
      vi:'Vietnamese','vi-vn':'Vietnamese','vietnamese':'Vietnamese',
      ru:'Russian','ru-ru':'Russian','russian':'Russian',
      ko:'Korean','ko-kr':'Korean','korean':'Korean',
      zh:'Chinese','zh-cn':'Chinese','zh-hans':'Chinese','chinese':'Chinese'
    }[normalized];
    return providerText(canonical||raw);
  }
  function difficulty(value){
    const raw=String(value??'').trim();
    const key=difficultyKeys[raw.toUpperCase()];
    return key ? tr(key,{},raw) : providerText(raw.replaceAll('_',' '));
  }
  function meetingType(value){
    const raw=String(value??'').trim().toUpperCase();
    const key=meetingKeys[raw];
    return key ? tr(key,{},raw) : providerText(raw.replaceAll('_',' ').toLowerCase());
  }
  function policyTitle(value){
    return providerText(value||'Standard Viator policy');
  }
  function duration(value={}){
    const parts=[];
    for(const [unit,n] of [
      ['day',Number(value.days)||0],
      ['hour',Number(value.hours)||0],
      ['minute',Number(value.minutes)||0]
    ]){
      if(!n) continue;
      parts.push(tr('provider.duration.'+unit,{count:n},String(n)));
    }
    if(parts.length) return parts.join(' ');
    const raw=String(value.text||'').trim();
    const parsed=raw.match(/^(\d+(?:\.\d+)?)\s*(days?|hours?|minutes?)$/i);
    if(parsed){
      const number=Number(parsed[1]);
      const token=parsed[2].toLowerCase();
      return duration(token.startsWith('day')?{days:number}:token.startsWith('hour')?{hours:number}:{minutes:number});
    }
    return providerText(raw);
  }
  function formatDate(iso,options={weekday:'short',day:'numeric',month:'short'}){
    const raw=String(iso||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const date=new Date(raw+'T12:00:00Z');
    return new Intl.DateTimeFormat(i18n()?.localeTag?.()||'ru-RU',{...options,timeZone:'UTC'}).format(date);
  }
  function ageRange(min,max){
    const a=Number(min),b=Number(max);
    if(!Number.isFinite(a)||!Number.isFinite(b)) return '';
    return tr('provider.ageRange',{min:a,max:b},a+'–'+b);
  }
  function minutes(value){
    const n=Number(value);
    if(!Number.isFinite(n)) return '';
    return tr('provider.minutes',{count:n},String(n));
  }
  function categoryTitle(type,fallback=''){
    const key={
      ADULT:'provider.category.adult',
      CHILD:'provider.category.child',
      INFANT:'provider.category.infant'
    }[String(type||'').toUpperCase()];
    return key ? tr(key,{},fallback||String(type||'')) : providerText(fallback||String(type||''));
  }

  function serverLocalizationMatches(value){
    const meta=value?.localization;
    if(!meta || meta.locale!==locale() || Number(meta.pendingFields||0)!==0) return false;
    if(meta.source==='viiversion-cache') return true;
    return locale()==='en' && meta.source==='bokun-native';
  }

  function localizeCatalogTour(tour){
    if(!tour||typeof tour!=='object') return tour;
    // Customer content (titles, descriptions, itinerary, rates, questions,
    // extras) is server-authoritative. This client layer only formats stable
    // provider enums and presentation metadata through semantic UI keys.
    const next={
      ...tour,
      duration:tour.duration?duration({text:tour.duration}):tour.duration,
      activity:tour.activity?difficulty(tour.activity):tour.activity,
      languages:Array.isArray(tour.languages)?tour.languages.map(languageName):tour.languages,
      included:Array.isArray(tour.included)?tour.included.map(providerText):tour.included,
      excluded:Array.isArray(tour.excluded)?tour.excluded.map(providerText):tour.excluded,
      formatsLabel:tour.formatsLabel?providerText(tour.formatsLabel):tour.formatsLabel,
    };
    if(Array.isArray(tour.route)){
      next.route=tour.route.map((row,index)=>{
        const title=Array.isArray(row)?String(row[0]||''):String(row?.title||'');
        const body=Array.isArray(row)?String(row[1]||''):String(row?.body||row?.description||'');
        const localizedTitle=/^Stop\s+\d+$/i.test(title)
          ? tr('provider.stop',{count:index+1},title)
          : providerText(title);
        return Array.isArray(row)?[localizedTitle,body]:{...row,title:localizedTitle,body};
      });
    }
    if(tour.group&&typeof tour.group==='object'){
      next.group={...tour.group};
      if(Array.isArray(tour.group.departures)){
        next.group.departures=tour.group.departures.map(item=>({
          ...item,
          date:item?.iso?formatDate(item.iso,{day:'numeric',month:'short'}):item?.date,
          status:providerText(item?.status||'')
        }));
      }
    }
    if(tour.bokun&&typeof tour.bokun==='object'){
      next.bokun={...tour.bokun};
      if(Array.isArray(tour.bokun.rates)){
        next.bokun.rates=tour.bokun.rates.map(rate=>({...rate}));
      }
      if(Array.isArray(tour.bokun.pricingCategories)){
        next.bokun.pricingCategories=tour.bokun.pricingCategories.map(item=>({
          ...item,
          title:categoryTitle(item?.ticketCategory,item?.title)
        }));
      }
    }
    return next;
  }

  function localizeQuestion(item={}){
    return {
      ...item,
      title:providerText(item.title||item.label||''),
      label:providerText(item.label||item.title||''),
      description:providerText(item.description||item.help||''),
      placeholder:providerText(item.placeholder||''),
      options:Array.isArray(item.options)?item.options.map(option=>({
        ...option,
        label:providerText(option?.label||option?.title||option?.value||'')
      })):item.options
    };
  }

  globalThis.LoveTravelTourLocale=Object.freeze({
    SUPPORTED_LOCALES:SUPPORTED.slice(),
    locale,
    productTitle,
    productDescription,
    itineraryBody,
    rateTitle,
    providerText,
    languageName,
    difficulty,
    meetingType,
    policyTitle,
    duration,
    formatDate,
    ageRange,
    minutes,
    localizeCatalogTour,
    localizeQuestion,
    serverLocalizationMatches
  });
})();
