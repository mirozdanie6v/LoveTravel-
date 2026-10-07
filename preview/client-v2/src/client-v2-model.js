const arr=value=>Array.isArray(value)?value:[];

function decodeEntities(value){
  return String(value??'')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'");
}

export function plainText(value){
  if(Array.isArray(value)) return value.map(plainText).filter(Boolean);
  const source=String(value??'');
  if(!source) return '';
  if(typeof DOMParser!=='undefined'){
    const doc=new DOMParser().parseFromString(source,'text/html');
    return (doc.body.textContent||'').replace(/\s+/g,' ').trim();
  }
  return decodeEntities(source.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,' '))
    .replace(/\s+/g,' ').trim();
}

export function listFrom(value){
  if(Array.isArray(value)) return value.map(item=>plainText(item)).filter(Boolean);
  const source=String(value??'');
  if(!source) return [];
  if(typeof DOMParser!=='undefined'){
    const doc=new DOMParser().parseFromString(source.replace(/<br\s*\/?>/gi,'\n'),'text/html');
    const lis=[...doc.body.querySelectorAll('li')].map(item=>plainText(item.textContent)).filter(Boolean);
    if(lis.length) return lis;
    return plainText(doc.body.textContent).split(/\n+/).map(item=>item.trim()).filter(Boolean);
  }
  const liMatches=[...source.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(match=>plainText(match[1])).filter(Boolean);
  if(liMatches.length) return liMatches;
  return source.replace(/<br\s*\/?>/gi,'\n').split(/\n+/).map(item=>plainText(item)).filter(Boolean);
}

export function photoUrlsFromMedia(media){
  return [...new Set(arr(media?.photos)
    .map(item=>String(item?.url||item?.cleanUrl||item?.originalUrl||'').trim()).filter(Boolean))];
}

function rawPhotoUrl(photo){
  if(typeof photo==='string') return photo.trim();
  const derived=arr(photo?.derived);
  return String(
    derived.find(item=>item?.name==='large')?.cleanUrl
      ||derived.find(item=>item?.name==='large')?.url
      ||derived.find(item=>item?.name==='preview')?.cleanUrl
      ||derived.find(item=>item?.name==='preview')?.url
      ||photo?.cleanUrl||photo?.url||photo?.originalUrl||''
  ).trim();
}

export function providerPhotoUrls(entity){
  const media=entity?.media&&typeof entity.media==='object'?entity.media:{};
  const values=[
    entity?.keyPhoto,entity?.photo,entity?.image,
    ...arr(entity?.photos),...arr(entity?.images),
    ...arr(media?.photos),...arr(media?.images),
  ].filter(Boolean);
  return [...new Set(values.map(rawPhotoUrl).filter(Boolean))];
}

export function money(value){
  const amountValue=input=>{
    if(input&&typeof input==='object') return amountValue(input.amount);
    const number=Number(input);
    return Number.isFinite(number)?number:null;
  };
  const amount=amountValue(value);
  if(amount===null) return '';
  const currency=String(value?.currency||value?.amount?.currency||'USD');
  const formatted=Number.isInteger(amount)?String(amount):amount.toFixed(2).replace(/\.00$/,'');
  return currency==='USD'?'$'+formatted:formatted+' '+currency;
}

export function quoteFor(slot,rateId){
  return arr(slot?.priceQuotesByRate).find(item=>String(item?.rateId)===String(rateId))||null;
}

export function rateAvailable(slot,rateId){
  return Boolean(quoteFor(slot,rateId))||arr(slot?.rates).some(rate=>String(rate?.id)===String(rateId));
}

function firstAdult(tour){
  return arr(tour?.participants).find(item=>String(item?.ticketCategory||'').toUpperCase()==='ADULT')
    ||arr(tour?.participants)[0]||null;
}

export function priceFor(tour,slot,rateId){
  const adult=firstAdult(tour);
  const quote=quoteFor(slot,rateId);
  const price=arr(quote?.participantPrices).find(item=>String(item?.categoryId)===String(adult?.id))
    ||arr(quote?.participantPrices)[0];
  return price?.amount||null;
}

export function nextSlot(domain){
  return arr(domain?.availabilitySlots).find(item=>!item?.soldOut&&!item?.unavailable)
    ||domain?.availabilitySlots?.[0]||null;
}

function durationLabel(experience,locale){
  const duration=experience?.duration||{};
  const hours=Number(duration.hours);
  const minutes=Number(duration.minutes);
  const source=String(duration.text||'').trim();
  if(Number.isFinite(hours)&&hours>0) return locale==='ru'?hours+' ч':source||hours+' h';
  if(Number.isFinite(minutes)&&minutes>0) return locale==='ru'?(Math.round(minutes/60*10)/10)+' ч':source||minutes+' min';
  if(locale==='ru'){
    const match=source.match(/(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|h|час)/i);
    if(match) return String(match[1]).replace('.',',')+' ч';
    return source.replace(/hours?/gi,'ч').replace(/hrs?/gi,'ч');
  }
  return source;
}

function categoryLabel(value,labels){
  const key=String(value||'').toUpperCase();
  if(key==='DAY_TOUR_OR_ACTIVITY') return labels.dayTour||'';
  if(key==='TOUR_OR_ACTIVITY') return labels.tour||'';
  if(key==='ACTIVITY') return labels.activity||'';
  return plainText(String(value||'').replaceAll('_',' ').toLowerCase());
}

function meetingLabel(experience){
  const first=arr(experience?.meeting?.startPoints)[0];
  return plainText(first?.title||first?.name||first?.address||first?.addressLine1||'');
}

function guidanceLanguages(experience){
  const direct=arr(experience?.languages?.raw).map(item=>plainText(item?.name||item?.title||item)).filter(Boolean);
  const guided=arr(experience?.languages?.guidanceTypes)
    .flatMap(item=>arr(item?.displayLanguages).map(plainText)).filter(Boolean);
  return [...new Set([...direct,...guided])];
}

export function normalizeTourDomain(domain,{locale='ru',labels={},formatDate=value=>String(value||'')}={}){
  const experience=domain?.experience||{};
  const content=experience?.content||{};
  const id=String(experience.id||domain?.provider?.productId||'');
  const slot=nextSlot(domain);
  const included=[...new Set([...listFrom(content.included),...listFrom(content.inclusions)])];
  const excluded=[...new Set([...listFrom(content.excluded),...listFrom(content.exclusions)])];
  const rates=arr(domain?.rates).map(rate=>({
    ...rate,
    optionPhotos:[...new Set([
      ...photoUrlsFromMedia(rate?.media),
      ...providerPhotoUrls(rate?.providerData||{}),
    ])],
  }));
  const tourForPrice={participants:arr(domain?.participants)};
  const rateId=slot?.defaultRateId??rates?.[0]?.id;
  return {
    id,
    title:plainText(experience.title)||labels.tour||'',
    description:plainText(experience.description||experience.excerpt),
    excerpt:plainText(experience.excerpt),
    city:plainText(experience?.location?.city)||labels.location||'',
    category:categoryLabel(experience.category,labels),
    duration:durationLabel(experience,locale),
    photos:[...new Set(arr(experience?.media?.photos)
      .map(item=>String(item?.url||item?.cleanUrl||item?.originalUrl||'').trim()).filter(Boolean))],
    videos:arr(experience?.media?.videos),
    price:slot?money(priceFor(tourForPrice,slot,rateId)):'',
    nextDate:formatDate(slot?.date),
    nextTime:String(slot?.startTime||''),
    meeting:meetingLabel(experience),
    meetingPoints:arr(experience?.meeting?.startPoints),
    included,
    excluded,
    requirements:listFrom(content.requirements),
    attention:listFrom(content.attention),
    knowBefore:listFrom(content.knowBeforeYouGoItems),
    dressCode:listFrom(content.dressCode),
    languages:guidanceLanguages(experience),
    minAge:Number.isFinite(Number(experience?.minAge))?Number(experience.minAge):null,
    accessibility:arr(experience?.accessibility).map(plainText).filter(Boolean),
    pickup:experience?.pickup||null,
    ticketMessage:plainText(experience?.ticket?.message),
    cancellationPolicy:domain?.cancellationPolicy||null,
    itinerary:arr(experience?.itinerary).map((item,index)=>({
      title:plainText(item?.title)||String(index+1),
      body:plainText(item?.body),
    })).filter(item=>item.title||item.body),
    rates,
    availabilitySlots:arr(domain?.availabilitySlots),
    participants:arr(domain?.participants),
  };
}

function mergeRateLists(...lists){
  const seen=new Set();
  return lists.flatMap(arr).filter(item=>{
    const key=[item?.id,item?.title,item?.description,item?.code].map(value=>String(value??'')).join('|');
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function rateForSlot(tour,slot,rateId){
  const base=arr(tour?.rates).find(rate=>String(rate?.id)===String(rateId))||{};
  const live=arr(slot?.rates).find(rate=>String(rate?.id)===String(rateId))||{};
  const livePhotos=[
    ...photoUrlsFromMedia(live?.media),
    ...providerPhotoUrls(live?.providerData||{}),
  ];
  return {
    ...base,
    ...live,
    id:live?.id??base?.id??rateId,
    title:plainText(live?.title)||plainText(base?.title),
    description:plainText(live?.description)||plainText(base?.description),
    details:mergeRateLists(base?.details,live?.details),
    textItems:mergeRateLists(base?.textItems,live?.textItems),
    optionPhotos:[...new Set([...arr(base?.optionPhotos),...livePhotos])],
  };
}

export function ratesForSlot(tour,slot){
  if(!slot) return [];
  const ids=[
    ...arr(slot?.rates).map(rate=>rate?.id),
    ...arr(tour?.rates).filter(rate=>rateAvailable(slot,rate?.id)).map(rate=>rate?.id),
  ].filter(id=>id!==null&&id!==undefined&&id!=='');
  return [...new Set(ids.map(String))].map(rateId=>rateForSlot(tour,slot,rateId));
}

export function rateDescription(rate){
  const parts=[
    plainText(rate?.description),
    ...arr(rate?.details).flatMap(item=>[plainText(item?.title),plainText(item?.description)]),
    ...arr(rate?.textItems).flatMap(item=>[plainText(item?.title),plainText(item?.description)]),
  ].filter(Boolean);
  return [...new Set(parts)].join(' · ');
}

export function participantPriceLines(tour,slot,rateId){
  const quote=quoteFor(slot,rateId);
  if(!quote) return [];
  const categories=new Map(arr(tour?.participants).map(item=>[String(item.id),item]));
  return arr(quote.participantPrices).map(item=>{
    const cat=categories.get(String(item.categoryId));
    const label=plainText(cat?.title||cat?.ticketCategory||item.categoryId);
    const value=money(item.amount);
    return label&&value?label+': '+value:'';
  }).filter(Boolean);
}

function cancellationRulePercent(rule){
  const direct=Number(rule?.percentage);
  if(Number.isFinite(direct)) return direct;
  const charge=Number(rule?.charge);
  if(Number.isFinite(charge)&&/percent/i.test(String(rule?.chargeType||''))) return charge;
  return null;
}

export function cancellationLines(policy,{locale='ru',labels={}}={}){
  if(!policy) return [];
  const lines=[];
  const title=plainText(policy.title);
  if(title) lines.push(title);
  for(const rule of arr(policy.penaltyRules)){
    const hours=Number(rule?.cutoffHours);
    const percent=cancellationRulePercent(rule);
    if(!Number.isFinite(hours)||percent===null) continue;
    if(locale==='ru') lines.push((labels.cancelLessThan||'При отмене менее чем за')+' '+hours+' ч — '+(labels.cancelRetention||'удержание')+' '+percent+'%');
    else if(locale==='vi') lines.push((labels.cancelLessThan||'Nếu huỷ trong vòng')+' '+hours+' giờ — '+(labels.cancelRetention||'phí giữ lại')+' '+percent+'%');
    else if(locale==='zh') lines.push((labels.cancelLessThan||'如在少于')+' '+hours+' 小时内取消 — '+(labels.cancelRetention||'扣除')+' '+percent+'%');
    else if(locale==='ko') lines.push((labels.cancelLessThan||'출발')+' '+hours+'시간 이내 취소 — '+(labels.cancelRetention||'공제')+' '+percent+'%');
    else lines.push((labels.cancelLessThan||'If cancelled less than')+' '+hours+' h — '+(labels.cancelRetention||'retained charge')+' '+percent+'%');
  }
  return [...new Set(lines)];
}

export function pickupLines(tour,{labels={}}={}){
  if(!tour?.pickup?.enabled) return [];
  const lines=[labels.pickupAvailable||'Pickup available'];
  if(tour.pickup.customAllowed) lines.push(labels.pickupCustom||'Pickup point can be entered during booking');
  const groups=arr(tour.pickup.placeGroups).map(item=>plainText(item?.title)).filter(Boolean);
  return [...new Set([...lines,...groups])];
}

export function customerInfoSections(tour,{locale='ru',labels={}}={}){
  const sections=[];
  const add=(id,title,items)=>{
    const values=arr(items).filter(Boolean);
    if(values.length) sections.push({id,title,items:values});
  };
  add('requirements',labels.requirementsLabel,tour?.requirements);
  add('attention',labels.attentionLabel,tour?.attention);
  add('know-before',labels.knowBefore,tour?.knowBefore);
  add('dress-code',labels.knowBefore,tour?.dressCode);
  add('accessibility',labels.accessibilityLabel,tour?.accessibility);
  add('ticket',labels.ticketLabel,tour?.ticketMessage?[tour.ticketMessage]:[]);
  add('pickup',labels.pickupLabel,pickupLines(tour,{labels}));
  add('cancellation',labels.cancellationLabel,cancellationLines(tour?.cancellationPolicy,{locale,labels}));
  return sections;
}
