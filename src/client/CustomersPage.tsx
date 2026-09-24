import { useEffect, useMemo, useState } from 'react';
import { api } from './lib/api';
import { formatUsd } from '../shared/money';
import type { OrderSummary } from '../shared/types';

type CustomerRow = {
  key: string;
  name: string;
  contact: string;
  orders: OrderSummary[];
  totalMinor: number;
  paidMinor: number;
  lastDate: string;
  sources: string[];
};

export function CustomersPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.managerOrders().then((r) => setOrders(r.items)).finally(() => setLoading(false)); }, []);
  const customers = useMemo(() => {
    const map = new Map<string, CustomerRow>();
    for (const order of orders) {
      const key = `${order.contact || order.customer}`.trim().toLowerCase();
      const current = map.get(key) || { key, name: order.customer, contact: order.contact, orders: [], totalMinor: 0, paidMinor: 0, lastDate: order.selectedDate, sources: [] };
      current.orders.push(order);
      current.totalMinor += order.totalMinor;
      current.paidMinor += order.paidMinor;
      if (order.selectedDate > current.lastDate) current.lastDate = order.selectedDate;
      if (!current.sources.includes(order.source)) current.sources.push(order.source);
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [orders]);
  const visible = customers.filter((row) => `${row.name} ${row.contact}`.toLowerCase().includes(query.toLowerCase()));
  if (loading) return <div className="px-skeleton" />;
  return <>
    <section className="px-crm-head"><div><span className="px-kicker">DEMO CRM</span><h2>Клиенты</h2><p>Карточки собираются из заказов D1. Менеджер уже может вести теги, внутреннюю заметку и следующую задачу — без внешней CRM.</p></div><label><span>Поиск</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Имя или контакт" /></label></section>
    <section className="px-metric-grid"><article className="px-metric"><span>Клиентов</span><b>{customers.length}</b><small>demo session</small></article><article className="px-metric"><span>Повторных</span><b>{customers.filter((x) => x.orders.length > 1).length}</b><small>2+ заказа</small></article><article className="px-metric"><span>Оплачено</span><b>{formatUsd(customers.reduce((s, x) => s + x.paidMinor, 0))}</b><small>DEMO</small></article></section>
    <section className="px-customer-grid">{visible.map((row) => <CustomerCard key={row.key} row={row} />)}</section>
    {!visible.length && <div className="px-empty"><h3>Ничего не найдено</h3><p>Измените поисковый запрос.</p></div>}
  </>;
}

function CustomerCard({ row }: { row: CustomerRow }) {
  const [open,setOpen]=useState(false);
  const [record,setRecord]=useState<any>(null);
  const [tags,setTags]=useState('');
  const [note,setNote]=useState('');
  const [task,setTask]=useState('');
  const [due,setDue]=useState('');
  const [done,setDone]=useState(false);
  const [saving,setSaving]=useState(false);
  const load=async()=>{const result=await api.customerRecord(row.key);setRecord(result.record);setTags((result.record.tags||[]).join(', '));setNote(result.record.managerNote||'');setTask(result.record.taskText||'');setDue(result.record.taskDue||'');setDone(Boolean(result.record.taskDone))};
  const toggle=()=>{const next=!open;setOpen(next);if(next&&!record)void load()};
  const save=async()=>{setSaving(true);try{const result=await api.patchCustomerRecord({customerKey:row.key,tags:tags.split(',').map(x=>x.trim()).filter(Boolean),managerNote:note,taskText:task,taskDue:due,taskDone:done});setRecord(result.record)}finally{setSaving(false)}};
  return <article className="px-customer-card"><div className="px-customer-top"><div><span className="px-status">{row.orders.length > 1 ? 'Повторный' : 'Новый клиент'}</span><h3>{row.name}</h3><p>{row.contact}</p></div><b>{formatUsd(row.totalMinor)}</b></div><div className="px-customer-meta"><span>{row.orders.length} заказ(а)</span><span>{row.sources.join(' · ')}</span><span>Ближайшая/последняя дата: {row.lastDate}</span></div><div className="px-customer-history">{row.orders.map((order) => <div key={order.id}><div><b>{order.tourTitle}</b><span>{order.selectedDate} · {order.status}</span></div><strong>{formatUsd(order.totalMinor)}</strong></div>)}</div><button className="px-crm-edit-toggle" onClick={toggle}>{open?'Скрыть рабочую карточку':'Открыть рабочую карточку →'}</button>{open&&<div className="px-crm-editor">{!record?<p>Загружаем…</p>:<><label className="px-field"><span>Теги через запятую</span><input value={tags} onChange={e=>setTags(e.target.value)} placeholder="VIP, повторный, семья" /></label><label className="px-field"><span>Внутренняя заметка</span><textarea rows={4} value={note} onChange={e=>setNote(e.target.value)} placeholder="Предпочтения, важные детали" /></label><label className="px-field"><span>Следующая задача</span><input value={task} onChange={e=>setTask(e.target.value)} placeholder="Написать за день до выезда" /></label><div className="px-crm-task-row"><label className="px-field"><span>Срок</span><input type="date" value={due} onChange={e=>setDue(e.target.value)} /></label><label className="px-owner-check"><input type="checkbox" checked={done} onChange={e=>setDone(e.target.checked)} /><span>Выполнено</span></label></div><button className="px-button px-button-dark px-block" disabled={saving} onClick={save}>{saving?'Сохраняем…':'Сохранить карточку'}</button><p className="px-form-note">Изменение записывается в D1 и попадает в журнал действий владельца.</p></>}</div>}</article>;
}
