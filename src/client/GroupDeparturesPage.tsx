import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from './lib/api';
import type { GroupDepartureSummary, GroupMemberInput, Tour } from '../shared/types';

function telegramMember(): GroupMemberInput {
  const user=(window as any).Telegram?.WebApp?.initDataUnsafe?.user;
  const customerName=user?[user.first_name,user.last_name].filter(Boolean).join(' '):'';
  return {customerName,telegram:user?.username?`@${user.username}`:'',phone:'',adults:1,children:[]};
}

export function GroupDeparturesPage(){
  const {tourId=''}=useParams();
  const navigate=useNavigate();
  const [tour,setTour]=useState<Tour|null>(null);
  const [items,setItems]=useState<GroupDepartureSummary[]>([]);
  const [member,setMember]=useState<GroupMemberInput>(()=>telegramMember());
  const [createDate,setCreateDate]=useState('');
  const [selected,setSelected]=useState<string>('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const seats=member.adults+member.children.length;
  const load=async()=>{const [t,g]=await Promise.all([api.tour(tourId),api.groupDepartures(tourId)]);setTour(t.item);setItems(g.items)};
  useEffect(()=>{void load().catch(e=>setError(e.message))},[tourId]);
  const current=useMemo(()=>items.find(x=>x.id===selected)||null,[items,selected]);
  const resizeChildren=(n:number)=>setMember(m=>({...m,children:Array.from({length:n},(_,i)=>m.children[i]||{height:110,age:null})}));
  const join=async()=>{if(!selected)return;setBusy(true);setError('');setMessage('');try{const r=await api.joinGroupDeparture(selected,member);setMessage(`Вы добавлены в сбор на ${r.item.departureDate}. Мест в заявке: ${seats}.`);await load()}catch(e:any){setError(e.message||'Не удалось присоединиться')}finally{setBusy(false)}};
  const create=async()=>{if(!createDate)return;setBusy(true);setError('');setMessage('');try{const r=await api.createGroupDeparture(tourId,createDate,member,null);setSelected(r.item.id);setMessage(`Создан новый сбор на ${r.item.departureDate}. Теперь к нему смогут присоединяться другие путешественники.`);await load()}catch(e:any){setError(e.message||'Не удалось создать сбор')}finally{setBusy(false)}};
  if(!tour)return <div className="px-skeleton"/>;
  return <section className="px-group-page">
    <div className="px-commerce-head"><div><span className="px-kicker">GROUP DEPARTURES · DEMO</span><h1>{tour.title}</h1><p>Выберите уже собирающийся выезд или создайте свою дату. Это отдельный сценарий от мгновенной индивидуальной оплаты.</p></div><button className="px-button px-button-dark" onClick={()=>navigate(`/booking?tourId=${tour.id}`)}>Индивидуально →</button></div>
    <div className="px-policy-box"><b>Как будет работать production</b><p>Система хранит сборы, участников и статусы. После подтверждения группы включается следующий шаг оплаты/подтверждения. Если группа не сформировалась после внесённого депозита, правило MAX TOUR — вернуть депозит 100%.</p><span>В текущем DEMO реальных денег не списываем.</span></div>
    <section className="px-group-grid">
      <div className="px-group-board"><div className="px-section-heading"><div><span className="px-kicker">УЖЕ СОБИРАЮТСЯ</span><h2>Выезды</h2></div></div>{items.length?items.map(item=><button key={item.id} className={`px-group-card ${selected===item.id?'active':''}`} onClick={()=>setSelected(item.id)}><div><span>{item.status==='gathering'?'Собирается':item.status}</span><h3>{item.departureDate}</h3><p>{item.seats} мест в заявках · {item.members} заявок</p></div><em>DEMO →</em></button>):<div className="px-empty"><h3>Пока нет открытых сборов</h3><p>Создайте дату — она появится в общей доске.</p></div>}</div>
      <div className="px-group-form"><span className="px-kicker">ВАША ЗАЯВКА</span><h2>{current?'Присоединиться':'Создать свой выезд'}</h2><label className="px-field"><span>Имя</span><input value={member.customerName} onChange={e=>setMember({...member,customerName:e.target.value})}/></label><div className="px-admin-editor-grid"><label className="px-field"><span>Телефон</span><input value={member.phone||''} onChange={e=>setMember({...member,phone:e.target.value})}/></label><label className="px-field"><span>Telegram</span><input value={member.telegram||''} onChange={e=>setMember({...member,telegram:e.target.value})}/></label></div><div className="px-counter-list"><Counter label="Взрослые" value={member.adults} min={1} onChange={v=>setMember({...member,adults:v})}/><Counter label="Дети" value={member.children.length} min={0} onChange={resizeChildren}/></div>{member.children.map((c,i)=><div className="px-child-row" key={i}><label className="px-field"><span>Рост ребёнка {i+1}, см</span><input type="number" value={c.height??''} onChange={e=>setMember(m=>({...m,children:m.children.map((x,j)=>j===i?{...x,height:Number(e.target.value)}:x)}))}/></label><label className="px-field"><span>Возраст</span><input type="number" value={c.age??''} onChange={e=>setMember(m=>({...m,children:m.children.map((x,j)=>j===i?{...x,age:e.target.value===''?null:Number(e.target.value)}:x)}))}/></label></div>)}{current?<><div className="px-group-selected"><b>{current.departureDate}</b><span>{current.seats} мест уже заявлено</span></div><button className="px-button px-button-primary px-block" disabled={busy} onClick={join}>{busy?'Сохраняем…':`Присоединиться · ${seats} чел.`}</button><button className="px-link" onClick={()=>setSelected('')}>Или создать другую дату</button></>:<><label className="px-field"><span>Желаемая дата</span><input type="date" value={createDate} onChange={e=>setCreateDate(e.target.value)}/></label><button className="px-button px-button-primary px-block" disabled={busy||!createDate} onClick={create}>{busy?'Создаём…':'Создать сбор и ждать группу'}</button></>}<p className="px-form-note">Telegram-имя и username подставляем автоматически, когда они доступны Mini App. Телефон просим отдельно, если его нет.</p></div>
    </section>
    {message&&<div className="px-notice px-notice-success">{message}</div>}{error&&<div className="px-notice">{error}</div>}
  </section>;
}

function Counter({label,value,min,onChange}:{label:string;value:number;min:number;onChange:(v:number)=>void}){return <div className="px-counter"><div><b>{label}</b></div><div><button onClick={()=>onChange(Math.max(min,value-1))}>−</button><strong>{value}</strong><button onClick={()=>onChange(value+1)}>+</button></div></div>}
