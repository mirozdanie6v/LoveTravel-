import { useEffect, useState } from 'react';
import { api } from './lib/api';
import type { GroupDepartureSummary } from '../shared/types';

export function AdminGroupsPage(){
  const [items,setItems]=useState<GroupDepartureSummary[]>([]);
  const [reason,setReason]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const load=()=>api.adminGroupDepartures().then(r=>setItems(r.items));
  useEffect(()=>{void load()},[]);
  const patch=async(id:string,status:string)=>{setBusy(id);setMessage('');try{await api.adminPatchGroupDeparture(id,{status,cancellationReason:reason[id]||''});await load();setMessage(status==='cancelled'?'Выезд отменён. Событие записано и поставлено в очередь уведомлений.':'Статус группового выезда обновлён.')}finally{setBusy('')}};
  return <>
    <section className="px-commerce-head"><div><span className="px-kicker">GROUP OPERATIONS</span><h2>Групповые заявки</h2><p>Администратор видит сборы, подтверждает выезд или отменяет его с причиной. В production отмена запускает уведомления участникам и refund workflow, если деньги уже были приняты.</p></div></section>
    <section className="px-admin-group-list">{items.map(item=><article key={item.id}><div className="px-admin-group-main"><span className={`px-status group-${item.status}`}>{item.status}</span><h3>{item.tourTitle}</h3><p>{item.departureDate} · {item.seats} мест · {item.members} заявок</p></div><label className="px-field"><span>Причина отмены / служебная заметка</span><input value={reason[item.id]??item.cancellationReason} onChange={e=>setReason({...reason,[item.id]:e.target.value})} placeholder="Например: погодные условия"/></label><div className="px-admin-group-actions"><button disabled={busy===item.id} onClick={()=>patch(item.id,'gathering')}>Собирается</button><button disabled={busy===item.id} onClick={()=>patch(item.id,'confirmed')}>Подтвердить</button><button className="danger" disabled={busy===item.id} onClick={()=>patch(item.id,'cancelled')}>Отменить</button><button disabled={busy===item.id} onClick={()=>patch(item.id,'completed')}>Завершён</button></div></article>)}</section>
    {!items.length&&<div className="px-empty"><h3>Групповых заявок пока нет</h3><p>Они появятся после создания/присоединения туристов к выездам.</p></div>}
    {message&&<div className="px-notice px-notice-success">{message}</div>}
  </>;
}
