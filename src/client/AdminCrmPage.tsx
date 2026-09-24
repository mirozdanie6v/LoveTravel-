import { useEffect, useMemo, useState } from 'react';
import { api } from './lib/api';
import { formatUsd } from '../shared/money';

const segments=[['all','Все клиенты'],['paid','Оплачивавшие'],['repeat','Повторные'],['group','Групповые заявки']] as const;

export function AdminCrmPage(){
  const [customers,setCustomers]=useState<any[]>([]);
  const [campaigns,setCampaigns]=useState<any[]>([]);
  const [refunds,setRefunds]=useState<any[]>([]);
  const [siteSync,setSiteSync]=useState<any[]>([]);
  const [query,setQuery]=useState('');
  const [segment,setSegment]=useState('all');
  const [title,setTitle]=useState('');
  const [message,setMessage]=useState('');
  const [reason,setReason]=useState('');
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true);
  const load=()=>{setLoading(true);Promise.all([api.adminCustomers(),api.adminCampaigns(),api.adminRefunds(),api.adminSiteSync()]).then(([c,ca,r,s])=>{setCustomers(c.items);setCampaigns(ca.items);setRefunds(r.items);setSiteSync(s.items)}).finally(()=>setLoading(false))};
  useEffect(load,[]);
  const visible=useMemo(()=>customers.filter(c=>`${c.name} ${c.contact} ${(c.tags||[]).join(' ')} ${(c.sources||[]).join(' ')}`.toLowerCase().includes(query.toLowerCase())),[customers,query]);
  const prepare=async()=>{if(!title.trim()||!message.trim()){setNotice('Заполните название и текст рассылки');return}setSaving(true);setNotice('');try{const r=await api.createAdminCampaign({title,message,segment,reason});setNotice(`Рассылка подготовлена: ${r.item.recipientCount} получателей. Внешняя отправка включится после привязки Telegram.`);setTitle('');setMessage('');setReason('');load()}catch(e:any){setNotice(e.message)}finally{setSaving(false)}};
  if(loading)return <div className="px-skeleton"/>;
  return <>
    <section className="px-crm-head"><div><span className="px-kicker">ЕДИНАЯ CRM · ADMIN</span><h2>Клиенты и коммуникации</h2><p>Заказы Mini App, групповые заявки и будущие заявки сайта сводятся в один профиль. Рассылки готовятся в D1; внешняя доставка не имитируется до подключения Telegram.</p></div><label><span>Поиск</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Имя, контакт, тег"/></label></section>
    <section className="px-metric-grid"><article className="px-metric"><span>Клиентов</span><b>{customers.length}</b><small>единый профиль</small></article><article className="px-metric"><span>Повторных</span><b>{customers.filter(c=>c.orders>1).length}</b><small>2+ заказа</small></article><article className="px-metric"><span>Групповых заявок</span><b>{customers.reduce((s,c)=>s+Number(c.groupRequests||0),0)}</b><small>сбор групп</small></article><article className="px-metric"><span>Оплачено</span><b>{formatUsd(customers.reduce((s,c)=>s+Number(c.paidMinor||0),0))}</b><small>DEMO / CRM</small></article></section>

    <section className="px-section"><div className="px-section-head"><div><span className="px-kicker">КЛИЕНТСКАЯ БАЗА</span><h2>Быстрая связь</h2></div><span className="px-count-pill">{visible.length}</span></div><div className="px-customer-grid">{visible.map(c=><article className="px-customer-card" key={c.key}><div className="px-customer-top"><div><span className="px-status">{c.orders>1?'Повторный':c.groupRequests?'Групповая заявка':'Клиент'}</span><h3>{c.name}</h3><p>{c.contact||'Контакт пока не указан'}</p></div><b>{formatUsd(c.totalMinor||0)}</b></div><div className="px-customer-meta"><span>{c.orders} заказ(а)</span><span>{c.groupRequests} групп. заявок</span><span>{(c.sources||[]).join(' · ')}</span></div>{c.tags?.length>0&&<div className="px-filter-row">{c.tags.map((t:string)=><span className="px-demo-pill" key={t}>{t}</span>)}</div>}<div className="px-button-row">{c.telegram&&<a className="px-button px-button-dark" href={`https://t.me/${String(c.telegram).replace(/^@/,'')}`} target="_blank" rel="noreferrer">Написать в Telegram</a>}<button className="px-button px-button-light" onClick={()=>navigator.clipboard?.writeText(c.contact||c.name)}>Скопировать контакт</button></div></article>)}</div></section>

    <section className="px-section px-admin-grid"><article className="px-card"><span className="px-kicker">РАССЫЛКИ</span><h2>Подготовить сообщение</h2><label className="px-field"><span>Сегмент</span><select value={segment} onChange={e=>setSegment(e.target.value)}>{segments.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label><label className="px-field"><span>Название</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например: перенос из-за погоды"/></label><label className="px-field"><span>Причина / внутренняя метка</span><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Погода, изменение программы…"/></label><label className="px-field"><span>Сообщение клиенту</span><textarea rows={6} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Текст уведомления"/></label><button className="px-button px-button-primary px-block" disabled={saving} onClick={prepare}>{saving?'Сохраняем…':'Подготовить рассылку'}</button>{notice&&<p className="px-form-note">{notice}</p>}<p className="px-form-note">Пока Telegram chat ID клиентов не подтверждены ботом, система сохраняет аудиторию и текст, но не заявляет сообщение отправленным.</p></article><article className="px-card"><span className="px-kicker">ИСТОРИЯ</span><h2>Подготовленные рассылки</h2><div className="px-stack-list">{campaigns.slice(0,8).map(c=><div key={c.id}><div><b>{c.title}</b><span>{c.segment} · {c.reason||'без причины'}</span></div><strong>{c.recipientCount}</strong></div>)}{!campaigns.length&&<p>Рассылок пока нет.</p>}</div></article></section>

    <section className="px-section px-admin-grid"><article className="px-card"><span className="px-kicker">ВОЗВРАТЫ</span><h2>Refund cases</h2><p>Расчёт удержания формируется по правилам MAX TOUR. Денежная операция не выполняется без платёжного провайдера.</p><div className="px-stack-list">{refunds.slice(0,10).map(r=><div key={r.id}><div><b>{r.display_id||r.tour_title||'Групповой выезд'}</b><span>{r.rule_code} · {r.reason}</span></div><strong>{r.requested_refund_minor==null?'review':formatUsd(Number(r.requested_refund_minor))}</strong></div>)}{!refunds.length&&<p>Активных refund-case нет.</p>}</div></article><article className="px-card"><span className="px-kicker">САЙТ ↔ ADMIN</span><h2>Очередь синхронизации</h2><p>Каждое изменение контента уже регистрируется для будущей Tilda/API интеграции.</p><div className="px-stack-list">{siteSync.slice(0,10).map(s=><div key={s.id}><div><b>{s.entityType} · {s.operation}</b><span>{s.entityId}</span></div><strong>{s.status}</strong></div>)}{!siteSync.length&&<p>Изменений для синхронизации пока нет.</p>}</div></article></section>
  </>;
}
