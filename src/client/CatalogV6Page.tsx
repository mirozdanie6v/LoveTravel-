import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './lib/api';
import { formatUsd } from '../shared/money';
import { useI18n } from './i18n';
import type { Tour } from '../shared/types';

type SiteTour = {
  url:string; path:string; title:string; description:string; photos:string[]; photoCount:number;
  priceLines:string[];
  facets:{tags:string[];ageHints:string[];genderTags:string[];directionHints:string[]};
  textExcerpt:string;
};
type SiteCatalog={generatedAt:string;source:string;tours:SiteTour[]};

const tagFilters=['Все','семейный','активный','спокойный отдых','море','природа','культура','город','премиум','несколько дней'];

function slugFromPath(path:string){return path.replace(/^\//,'')||'tour'}
function normalizedUrl(value:string){return value.replace(/\/$/,'')}

export function CatalogV6Page(){
  const navigate=useNavigate();
  const { t, locale } = useI18n();
  const [site,setSite]=useState<SiteCatalog|null>(null);
  const [nativeTours,setNativeTours]=useState<Tour[]>([]);
  const [query,setQuery]=useState('');
  const [direction,setDirection]=useState(t('catalog.allPlaces'));
  const [tag,setTag]=useState('Все');
  const [childrenOnly,setChildrenOnly]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    setDirection(t('catalog.allPlaces'));
  },[locale,t]);

  useEffect(()=>{
    setError('');
    Promise.all([
      fetch('/site-catalog.json',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Каталог сайта ещё синхронизируется');return await r.json() as SiteCatalog}),
      api.tours(),
    ]).then(([catalog,tours])=>{setSite(catalog);setNativeTours(tours.items)}).catch(e=>setError(e.message||'Не удалось загрузить каталог'));
  },[locale]);

  const nativeDirections=useMemo(()=>[t('catalog.allPlaces'),...Array.from(new Set(nativeTours.map(tour=>tour.direction))).sort()],[nativeTours,t,locale]);
  const siteDirections=useMemo(()=>[t('catalog.allPlaces'),...Array.from(new Set((site?.tours??[]).flatMap(tour=>tour.facets.directionHints))).sort()],[site,t,locale]);
  const directions=locale==='vi'?nativeDirections:siteDirections;
  const nativeBySource=useMemo(()=>new Map(nativeTours.map(tour=>[normalizedUrl(tour.sourceUrl),tour])),[nativeTours]);

  const viItems=useMemo(()=>{
    if(locale!=='vi')return [];
    return nativeTours.filter(tour=>{
      const hay=`${tour.title} ${tour.description} ${tour.direction} ${tour.category}`.toLowerCase();
      if(query&&!hay.includes(query.toLowerCase()))return false;
      if(direction!==t('catalog.allPlaces')&&tour.direction!==direction)return false;
      return true;
    });
  },[locale,nativeTours,query,direction,t]);

  const items=useMemo(()=>{
    if(locale==='vi')return [];
    const list=site?.tours??[];
    return list.filter(item=>{
      const hay=`${item.title} ${item.description} ${item.facets.tags.join(' ')} ${item.facets.directionHints.join(' ')}`.toLowerCase();
      if(query&&!hay.includes(query.toLowerCase()))return false;
      if(direction!==t('catalog.allPlaces')&&!item.facets.directionHints.includes(direction))return false;
      if(tag!=='Все'&&!item.facets.tags.includes(tag))return false;
      if(childrenOnly&&!item.facets.ageHints.length)return false;
      return true;
    });
  },[locale,site,query,direction,tag,childrenOnly,t]);

  const open=(item:SiteTour)=>{
    const native=nativeBySource.get(normalizedUrl(item.url));
    if(native)navigate(`/tour/${native.id}`); else navigate(`/site-tour/${encodeURIComponent(slugFromPath(item.path))}`);
  };

  return <>
    <section className="px-catalog-v6-head"><div><span className="px-kicker">{t('catalog.kicker')}</span><h1>{t('catalog.title')}</h1><p>{t('catalog.text')}</p></div><div className="px-catalog-sync"><span>{t('catalog.source')}</span><b>maxtourvietnam.com</b><small>{site?`${site.tours.length} ${t('catalog.pages')}`:t('catalog.sync')}</small></div></section>
    <section className="px-catalog-v6-controls"><label className="px-field"><span>{t('catalog.search')}</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={locale==='vi'?'Đà Lạt, Nha Trang, Hà Nội…':'Далат, острова, дайвинг…'}/></label><div className="px-catalog-selects"><label className="px-field"><span>{t('catalog.place')}</span><select value={direction} onChange={e=>setDirection(e.target.value)}>{directions.map(x=><option key={x}>{x}</option>)}</select></label>{locale==='ru'&&<label className="px-field"><span>{t('catalog.style')}</span><select value={tag} onChange={e=>setTag(e.target.value)}>{tagFilters.map(x=><option key={x}>{x}</option>)}</select></label>}</div>{locale==='ru'&&<><label className="px-owner-check"><input type="checkbox" checked={childrenOnly} onChange={e=>setChildrenOnly(e.target.checked)}/><span>{t('catalog.children')}</span></label><div className="px-filter-row px-site-tags">{tagFilters.slice(1).map(x=><button key={x} className={tag===x?'active':''} onClick={()=>setTag(tag===x?'Все':x)}>{x}</button>)}</div></>}</section>
    {error&&<div className="px-notice">{error}</div>}
    {locale==='vi'&&<><div className="px-catalog-count"><b>{viItems.length}</b><span>{t('catalog.results')}</span></div><section className="px-site-tour-grid">{viItems.map((tour,index)=>{
      const price=tour.pricingRules.adultMinor??tour.pricingRules.adultFromMinor??0;
      return <article className="px-site-tour-card" key={tour.id} onClick={()=>navigate(`/tour/${tour.id}`)}><div className="px-site-tour-media">{tour.images[0]?<img src={tour.images[0]} alt={tour.title} loading="lazy"/>:<div className="px-site-photo-empty">MAX TOUR</div>}<span>{String(index+1).padStart(2,'0')}</span><em>ONLINE READY</em></div><div className="px-site-tour-copy"><div className="px-site-tag-line"><span>{tour.direction}</span><span>{tour.category}</span></div><h2>{tour.title}</h2><p>{tour.description}</p><div className="px-site-tour-price"><b>{tour.priceMode==='fixed'?'':t('catalog.from')+' '}{formatUsd(price)}</b><span>{tour.images.length} {t('catalog.photos')} · {t('catalog.more')}</span></div></div></article>})}</section><section className="px-section px-policy-box"><p>{t('catalog.viNote')}</p></section></>}
    {locale==='ru'&&<>
      {!site&&!error&&<div className="px-skeleton"/>}
      {site&&<><div className="px-catalog-count"><b>{items.length}</b><span>{t('catalog.results')}</span></div><section className="px-site-tour-grid">{items.map((item,index)=>{
        const native=nativeBySource.get(normalizedUrl(item.url));
        const price=native?(native.pricingRules.adultMinor??native.pricingRules.adultFromMinor??0):0;
        return <article className="px-site-tour-card" key={item.url} onClick={()=>open(item)}><div className="px-site-tour-media">{item.photos[0]?<img src={item.photos[0]} alt={item.title} loading="lazy"/>:<div className="px-site-photo-empty">MAX TOUR</div>}<span>{String(index+1).padStart(2,'0')}</span>{native&&<em>ONLINE READY</em>}</div><div className="px-site-tour-copy"><div className="px-site-tag-line">{item.facets.directionHints.slice(0,2).map(x=><span key={x}>{x}</span>)}{item.facets.tags.slice(0,2).map(x=><span key={x}>{x}</span>)}</div><h2>{item.title}</h2><p>{item.description||item.textExcerpt.slice(0,180)}</p><div className="px-site-tour-price">{native&&price>0?<b>{native.priceMode==='fixed'?'':t('catalog.from')+' '}{formatUsd(price)}</b>:<b>{item.priceLines[0]||t('catalog.priceOnPage')}</b>}<span>{item.photoCount} {t('catalog.photos')} · {t('catalog.more')}</span></div></div></article>})}</section></>}
      <section className="px-section px-policy-box"><b>Про фильтр по полу</b><p>На сайте MAX TOUR нет надёжной структурированной маркировки «для мужчин / для женщин». Мы не определяем её по фотографиям или стереотипам. Если компании нужна такая коммерческая сегментация, администратор сможет назначать эти теги вручную.</p></section>
    </>}
  </>;
}
