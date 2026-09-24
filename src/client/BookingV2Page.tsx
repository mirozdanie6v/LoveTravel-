import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from './lib/api';
import { formatUsd } from '../shared/money';
import { useI18n } from './i18n';
import type { BookingDraft, PaymentChoice, PaymentMethod, Quote, Tour, AvailabilityDate, OrderSummary } from '../shared/types';

function telegramPrefill() {
  const user = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
  if (!user) return { name:'', telegram:'' };
  const name = [user.first_name,user.last_name].filter(Boolean).join(' ').trim();
  const telegram = user.username ? `@${user.username}` : '';
  return { name, telegram };
}

function blankDraft(tourId=''): BookingDraft {
  const profile = telegramPrefill();
  return {
    tourId, format:'private', date:'', adults:2, children:[], hotel:'',
    participants:[{fullName:'',birthDate:''},{fullName:'',birthDate:''}],
    contact:{name:profile.name,telegram:profile.telegram,phone:''},
    paymentChoice:'deposit', paymentMethod:'sbp', source:'Telegram',
  };
}

const paymentMethods:Array<{id:PaymentMethod;title:string;note:string}> = [
  {id:'sbp',title:'СБП',note:'Россия · online'},
  {id:'kaspi',title:'Kaspi',note:'Казахстан · online'},
  {id:'vnpay',title:'VNPay',note:'Вьетнам · online'},
  {id:'card',title:'Банковская карта',note:'provider после подключения'},
  {id:'transfer',title:'Банковский / международный перевод',note:'по реквизитам'},
  {id:'other',title:'Другой способ',note:'через менеджера'},
];

export function BookingV2Page() {
  const navigate=useNavigate();
  const { t, locale } = useI18n();
  const paymentMethods = [
    {id:'sbp' as const,title:t('payment.sbp'),note:t('payment.sbpNote')},
    {id:'kaspi' as const,title:t('payment.kaspi'),note:t('payment.kaspiNote')},
    {id:'vnpay' as const,title:t('payment.vnpay'),note:t('payment.vnpayNote')},
    {id:'card' as const,title:t('payment.card'),note:t('payment.cardNote')},
    {id:'transfer' as const,title:t('payment.transfer'),note:t('payment.transferNote')},
    {id:'other' as const,title:t('payment.other'),note:t('payment.otherNote')},
  ];
  const params=new URLSearchParams(useLocation().search);
  const initialTourId=params.get('tourId')||'';
  const [tours,setTours]=useState<Tour[]>([]);
  const [draft,setDraft]=useState<BookingDraft>(()=>blankDraft(initialTourId));
  const [availability,setAvailability]=useState<AvailabilityDate[]>([]);
  const [step,setStep]=useState(1);
  const [quote,setQuote]=useState<Quote|null>(null);
  const [order,setOrder]=useState<OrderSummary|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const tour=useMemo(()=>tours.find(x=>x.id===draft.tourId||x.slug===draft.tourId)||null,[tours,draft.tourId]);
  const people=draft.adults+draft.children.length;

  useEffect(()=>{api.tours().then(r=>{setTours(r.items);if(!draft.tourId&&r.items[0])setDraft(d=>({...d,tourId:r.items[0].id}))}).catch(e=>setError(e.message))},[locale]);
  useEffect(()=>{if(!draft.tourId)return;api.availability(draft.tourId).then(r=>setAvailability(r.items)).catch(()=>setAvailability([]))},[draft.tourId,locale]);
  useEffect(()=>{setDraft(d=>({...d,participants:Array.from({length:d.adults+d.children.length},(_,i)=>d.participants[i]||{fullName:'',birthDate:''})}))},[draft.adults,draft.children.length]);

  const selectTour=(tourId:string)=>{setDraft(blankDraft(tourId));setQuote(null);setOrder(null);setStep(1);setError('')};
  const resizeChildren=(n:number)=>setDraft(d=>({...d,children:Array.from({length:n},(_,i)=>d.children[i]||{height:110,age:null})}));
  const nextToQuote=async()=>{setBusy(true);setError('');try{const r=await api.quote(draft);setQuote(r.quote);setStep(5)}catch(e:any){setError(e.message||'Не удалось рассчитать стоимость')}finally{setBusy(false)}};
  const choosePayment=async(choice:PaymentChoice)=>{const next={...draft,paymentChoice:choice};setDraft(next);setBusy(true);try{const r=await api.quote(next);setQuote(r.quote)}catch(e:any){setError(e.message||'Не удалось пересчитать оплату')}finally{setBusy(false)}};
  const createOrder=async()=>{setBusy(true);setError('');try{const r=await api.createOrder(draft,`v6-order-${crypto.randomUUID()}`);setOrder(r.order)}catch(e:any){setError(e.message||'Не удалось создать заказ')}finally{setBusy(false)}};
  const pay=async()=>{if(!order)return;setBusy(true);setError('');try{const r=await api.pay(order.id,`v6-pay-${order.id}`);setOrder(r.order);setStep(6)}catch(e:any){setError(e.message||'Не удалось выполнить DEMO-оплату')}finally{setBusy(false)}};

  if(!tours.length&&!error)return <div className="px-skeleton"/>;
  return <section className="px-commerce-flow">
    <div className="px-commerce-head"><div><span className="px-kicker">MAX TOUR · ONLINE BOOKING</span><h1>{t('booking.title')}</h1><p>{t('booking.subtitle')}</p></div><span className="px-demo-pill">{t('booking.noCharge')}</span></div>
    <div className="px-commerce-progress">{[1,2,3,4,5].map(n=><i key={n} className={step>=n?'active':''}/>)}</div>

    {step===1&&<div className="px-commerce-card"><span className="px-kicker">{t('booking.step1')}</span><h2>{t('booking.what')}</h2><label className="px-field"><span>{t('booking.tour')}</span><select value={draft.tourId} onChange={e=>selectTour(e.target.value)}>{tours.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>{tour&&<><div className="px-format-choice"><button className="active" onClick={()=>setDraft(d=>({...d,format:'private'}))}><b>{t('booking.private')}</b><span>{t('booking.privateNote')}</span></button><button onClick={()=>navigate(`/groups/${tour.id}`)}><b>{t('booking.group')}</b><span>{t('booking.groupNote')}</span></button></div><div className="px-policy-mini"><b>{t('booking.payment')}</b><span>{t('booking.paymentNote')}</span></div>{tour.pricingRules.privateTiers?.length?<button className="px-button px-button-primary px-block" onClick={()=>setStep(2)}>{t('booking.continuePrivate')}</button>:<div className="px-commerce-warning"><b>{t('booking.noPrivateRate')}</b><span>{t('booking.noPrivateRateText')}</span></div>}</>}</div>}

    {step===2&&<div className="px-commerce-card"><span className="px-kicker">{t('booking.step2')}</span><h2>{t('booking.who')}</h2><div className="px-counter-list"><Counter label={t('booking.adults')} value={draft.adults} min={1} onChange={v=>setDraft(d=>({...d,adults:v}))}/><Counter label={t('booking.children')} value={draft.children.length} min={0} onChange={resizeChildren}/></div>{draft.children.map((c,i)=><div className="px-child-row" key={i}><label className="px-field"><span>{t('booking.childHeight')} {i+1}, cm</span><input type="number" value={c.height??''} onChange={e=>setDraft(d=>({...d,children:d.children.map((x,j)=>j===i?{...x,height:Number(e.target.value)}:x)}))}/></label><label className="px-field"><span>{t('booking.age')}</span><input type="number" value={c.age??''} onChange={e=>setDraft(d=>({...d,children:d.children.map((x,j)=>j===i?{...x,age:e.target.value===''?null:Number(e.target.value)}:x)}))}/></label></div>)}<div className="px-policy-mini"><b>{people} {t('booking.travelersCount')}</b><span>{t('booking.priceServer')}</span></div><button className="px-button px-button-primary px-block" onClick={()=>setStep(3)}>{t('booking.selectDate')}</button></div>}

    {step===3&&<div className="px-commerce-card"><span className="px-kicker">{t('booking.step3')}</span><h2>{t('booking.when')}</h2>{availability.length?<div className="px-date-grid">{availability.map(d=><button key={d.date} className={draft.date===d.date?'active':''} onClick={()=>setDraft(x=>({...x,date:d.date}))}><b>{d.date}</b><span>{d.label}</span><em>DEMO</em></button>)}</div>:<label className="px-field"><span>{t('booking.desiredDate')}</span><input type="date" value={draft.date} onChange={e=>setDraft(d=>({...d,date:e.target.value}))}/></label>}<label className="px-field"><span>{t('booking.hotel')}</span><input value={draft.hotel} onChange={e=>setDraft(d=>({...d,hotel:e.target.value}))} placeholder="Например: Amiana Resort"/></label><div className="px-policy-mini"><b>{t('booking.transferAuto')}</b><span>{t('booking.transferText')}</span></div><button className="px-button px-button-primary px-block" disabled={!draft.date||!draft.hotel.trim()} onClick={()=>setStep(4)}>{t('booking.travelers')}</button></div>}

    {step===4&&<div className="px-commerce-card"><span className="px-kicker">{t('booking.step4')}</span><h2>{t('booking.confirmData')}</h2><div className="px-admin-editor-grid"><label className="px-field"><span>{t('booking.name')}</span><input value={draft.contact.name} onChange={e=>setDraft(d=>({...d,contact:{...d.contact,name:e.target.value}}))}/></label><label className="px-field"><span>{t('booking.phone')}</span><input value={draft.contact.phone||''} onChange={e=>setDraft(d=>({...d,contact:{...d.contact,phone:e.target.value}}))} placeholder="+7 / +84"/></label></div><label className="px-field"><span>Telegram</span><input value={draft.contact.telegram||''} onChange={e=>setDraft(d=>({...d,contact:{...d.contact,telegram:e.target.value}}))} placeholder="@username"/></label>{draft.participants.map((p,i)=><div className="px-participant-v2" key={i}><b>{i+1}. {i<draft.adults?'Взрослый':'Ребёнок'}</b><div className="px-admin-editor-grid"><label className="px-field"><span>{t('booking.fullName')}</span><input value={p.fullName} onChange={e=>setDraft(d=>({...d,participants:d.participants.map((x,j)=>j===i?{...x,fullName:e.target.value}:x)}))}/></label><label className="px-field"><span>{t('booking.birthDate')}</span><input type="date" value={p.birthDate||''} onChange={e=>setDraft(d=>({...d,participants:d.participants.map((x,j)=>j===i?{...x,birthDate:e.target.value}:x)}))}/></label></div></div>)}<p className="px-form-note">{t('booking.telegramPrefill')}</p><button className="px-button px-button-primary px-block" disabled={busy} onClick={nextToQuote}>{busy?t('booking.processing'):t('booking.total')}</button></div>}

    {step===5&&quote&&<div className="px-commerce-card"><span className="px-kicker">{t('booking.step5')}</span><h2>{formatUsd(quote.totalMinor)}</h2><p>{t('booking.totalNote')}</p><div className="px-quote-lines">{quote.lines.map((l,i)=><div key={`${l.label}-${i}`}><span>{l.label}</span><b>{formatUsd(l.amountMinor)}</b></div>)}</div><div className="px-pay-choice"><button className={draft.paymentChoice==='deposit'?'active':''} onClick={()=>choosePayment('deposit')}><b>30%</b><span>Депозит сейчас · {formatUsd(Math.round(quote.totalMinor*.3))}</span></button><button className={draft.paymentChoice==='full'?'active':''} onClick={()=>choosePayment('full')}><b>100%</b><span>Полная оплата · {formatUsd(quote.totalMinor)}</span></button></div><div className="px-payment-grid-v2">{paymentMethods.map(m=><button key={m.id} className={draft.paymentMethod===m.id?'active':''} onClick={()=>setDraft(d=>({...d,paymentMethod:m.id}))}><b>{m.title}</b><span>{m.note}</span></button>)}</div><div className="px-policy-box"><b>{t('booking.cancel')}</b><p>{t('booking.cancelPolicy')}</p><span>{t('booking.refundPolicy')}</span></div>{!order?<button className="px-button px-button-dark px-block" disabled={busy} onClick={createOrder}>{busy?t('booking.creating'):`${draft.paymentChoice==='deposit'?'30%':'100%'} ${t('booking.payment')}`}</button>:<><div className="px-order-created"><b>{t('booking.orderCreated')} · {order.id}</b><span>Метод: {paymentMethods.find(x=>x.id===draft.paymentMethod)?.title}</span></div><button className="px-button px-button-primary px-block" disabled={busy} onClick={pay}>{busy?t('booking.processingPayment'):`DEMO ${formatUsd(draft.paymentChoice==='full'?order.totalMinor:Math.round(order.totalMinor*.3))}`}</button></>}</div>}

    {step===6&&order&&<div className="px-commerce-card px-commerce-success"><div className="px-success-icon">✓</div><span className="px-kicker">{t('booking.confirmation')}</span><h2>{order.tourTitle}</h2><p>{t('booking.created')}</p><div className="px-order-detail-grid"><div className="px-detail-cell"><span>{t('booking.paid')}</span><b>{formatUsd(order.paidMinor)}</b></div><div className="px-detail-cell"><span>{t('booking.remaining')}</span><b>{formatUsd(order.remainingMinor)}</b></div></div><button className="px-button px-button-dark px-block" onClick={()=>navigate(`/trips/${order.id}`)}>{t('booking.openTrip')}</button></div>}
    {error&&<div className="px-notice">{error}</div>}
  </section>;
}

function Counter({label,value,min,onChange}:{label:string;value:number;min:number;onChange:(v:number)=>void}){
  return <div className="px-counter"><div><b>{label}</b></div><div><button onClick={()=>onChange(Math.max(min,value-1))}>−</button><strong>{value}</strong><button onClick={()=>onChange(value+1)}>+</button></div></div>;
}
