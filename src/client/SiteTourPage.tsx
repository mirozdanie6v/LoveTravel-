import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FullscreenGallery } from './FullscreenGallery';
import { api } from './lib/api';

type SiteTour={url:string;path:string;title:string;description:string;photos:string[];photoCount:number;priceLines:string[];facets:{tags:string[];ageHints:string[];genderTags:string[];directionHints:string[]};textExcerpt:string};
type SiteCatalog={generatedAt:string;source:string;tours:SiteTour[]};

function normalizeText(text:string){
  return text.replace(/^.*?(?=(?:Программа|Описание|Что входит|Стоимость|Взрослые|Индивидуальный))/i,'').trim();
}
function excerptSection(text:string,start:RegExp,stops:RegExp[],max=1800){
  const m=text.match(start); if(!m||m.index==null)return '';
  const from=m.index+m[0].length; const tail=text.slice(from);
  let end=Math.min(tail.length,max);
  for(const stop of stops){const s=tail.search(stop);if(s>=0&&s<end)end=s}
  return tail.slice(0,end).replace(/\s+/g,' ').trim();
}

export function SiteTourPage(){
  const {slug=''}=useParams();
  const navigate=useNavigate();
  const [item,setItem]=useState<SiteTour|null>(null);
  const [nativeId,setNativeId]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    Promise.all([fetch('/site-catalog.json',{cache:'no-store'}).then(r=>r.json() as Promise<SiteCatalog>),api.tours()]).then(([cat,native])=>{
      const found=cat.tours.find(t=>t.path.replace(/^\//,'')===decodeURIComponent(slug));
      if(!found)throw new Error('Экскурсия не найдена в синхронизированном каталоге');
      setItem(found);
      const n=native.items.find(t=>t.sourceUrl.replace(/\/$/,'')===found.url.replace(/\/$/,''));
      if(n)setNativeId(n.id);
    }).catch(e=>setError(e.message));
  },[slug]);
  const sections=useMemo(()=>{
    if(!item)return {program:'',included:'',take:''};
    const t=normalizeText(item.textExcerpt);
    return {
      program:excerptSection(t,/Программ[аы]\s*:*/i,[/Что входит/i,/В стоимость/i,/Стоимость/i,/Цена/i,/Что взять/i]),
      included:excerptSection(t,/(?:Что входит|В стоимость входит)\s*:*/i,[/Что взять/i,/Дополнитель/i,/Стоимость/i,/Цена/i,/Правила/i]),
      take:excerptSection(t,/(?:Что взять|Рекомендуем взять)\s*:*/i,[/Стоимость/i,/Цена/i,/Брониров/i,/Часто задаваемые/i,/Важно/i]),
    };
  },[item]);
  if(error)return <div className="px-notice">{error}</div>;
  if(!item)return <div className="px-skeleton"/>;
  return <>
    <section className="px-site-detail-hero">{item.photos[0]&&<img src={item.photos[0]} alt={item.title}/>}<div className="px-hero-shade"/><button className="px-back" onClick={()=>navigate('/catalog')}>←</button><div><span className="px-kicker px-kicker-light">ОФИЦИАЛЬНАЯ СТРАНИЦА MAX TOUR</span><h1>{item.title}</h1><div className="px-site-detail-tags">{[...item.facets.directionHints,...item.facets.tags].slice(0,6).map(x=><span key={x}>{x}</span>)}</div></div></section>
    <section className="px-section px-detail-intro"><div><span className="px-kicker">О ТУРЕ</span><h2>Коротко и по делу</h2></div><p>{item.description||item.textExcerpt.slice(0,420)}</p></section>
    {!!item.priceLines.length&&<section className="px-section px-source-prices"><span className="px-kicker">ЦЕНЫ НА СТРАНИЦЕ MAX TOUR</span><div>{item.priceLines.slice(0,10).map((line,i)=><p key={`${line}-${i}`}>{line}</p>)}</div><small>Показываем формулировки, найденные на официальной странице. Для автоматической оплаты используется только структурированный и однозначный тариф.</small></section>}
    {!!item.photos.length&&<section className="px-section"><div className="px-section-heading"><div><span className="px-kicker">ФОТО С САЙТА MAX TOUR</span><h2>{item.photos.length} кадров</h2></div></div><FullscreenGallery images={item.photos.slice(0,30)} title={item.title}/></section>}
    {sections.program&&<section className="px-section px-source-section"><span className="px-kicker">ПРОГРАММА</span><h2>Маршрут</h2><p>{sections.program}</p></section>}
    {sections.included&&<section className="px-section px-source-section"><span className="px-kicker">ЧТО ВХОДИТ</span><h2>В поездке</h2><p>{sections.included}</p></section>}
    {sections.take&&<section className="px-section px-source-section"><span className="px-kicker">ЧТО ВЗЯТЬ</span><h2>Перед выездом</h2><p>{sections.take}</p></section>}
    <section className="px-section px-policy-box"><b>Оплата, перенос и отмена MAX TOUR</b><p>При бронировании клиент выбирает депозит 30% или полную оплату 100%. Перенос бесплатен до 17:00 за день до экскурсии; после этого удерживается 30%. Отмена бесплатна более чем за 48 часов, до 17:00 за день до выезда удерживается 30%, в день выезда или при неявке — 100%.</p><span>Возврат — до 7 рабочих дней; возможны банковские комиссии. Если группа не сформировалась после внесения депозита, депозит возвращается 100%.</span></section>
    <section className="px-section px-source-note"><span>Официальный источник</span><a href={item.url} target="_blank" rel="noreferrer">Открыть страницу MAX TOUR ↗</a></section>
    <div className="px-sticky-cta"><div><span>{nativeId?'ONLINE READY':'SOURCE-DERIVED'}</span><b>{nativeId?'Можно рассчитать':'Тариф требует структуры'}</b></div>{nativeId?<button className="px-button px-button-primary" onClick={()=>navigate(`/booking?tourId=${nativeId}`)}>Выбрать формат</button>:<button className="px-button px-button-primary" onClick={()=>navigate(`/groups/${encodeURIComponent(slug)}`)}>Групповой сбор</button>}</div>
  </>;
}
