import type { AnalyticsResponse } from '../../shared/types';
import type { Env } from '../db/repository';
import { getMergedTours } from '../db/repository';

export async function recordEvent(env:Env,sessionId:string,input:any){
  const allowed=['view_tour','start_booking','quote_created'];
  const eventType=String(input?.eventType??'');
  if(!allowed.includes(eventType)) return;
  const allowedSources=['Telegram','Сайт','Реклама','Другие каналы'];
  const rawSource=String(input?.source??'Telegram');
  const source=allowedSources.includes(rawSource)?rawSource:'Другие каналы';
  const tourId=input?.tourId?String(input.tourId):null;
  await env.DB.prepare('INSERT INTO analytics_events(session_id,event_type,source,tour_id,metadata_json,demo) VALUES (?,?,?,?,?,1)').bind(sessionId,eventType,source,tourId,'{}').run();
}

export async function getAnalytics(env:Env,sessionId:string,filters:URLSearchParams):Promise<AnalyticsResponse>{
  const source=filters.get('source')??'Все';
  const tourId=filters.get('tourId')??'Все';
  const direction=filters.get('direction')??'Все';
  const period=Math.max(1,Math.min(365,Number(filters.get('period')??30)||30));
  const tours=await getMergedTours(env.DB,sessionId);
  const tourMap=new Map(tours.map(t=>[t.id,t]));
  const cutoff=Date.now()-period*24*60*60*1000;

  const eventResult=await env.DB.prepare('SELECT event_type,source,tour_id,order_id,amount_minor,created_at FROM analytics_events WHERE session_id=?').bind(sessionId).all<any>();
  const rows=(eventResult.results??[]).filter(r=>{
    if(source!=='Все'&&r.source!==source)return false;
    if(tourId!=='Все'&&r.tour_id!==tourId)return false;
    if(direction!=='Все'&&tourMap.get(r.tour_id)?.direction!==direction)return false;
    const t=Date.parse(String(r.created_at??''));
    return !Number.isFinite(t)||t>=cutoff;
  });

  const count=(t:string)=>rows.filter(r=>r.event_type===t).length;
  const views=count('view_tour'),started=count('start_booking'),orders=count('order_created'),paid=count('demo_payment_completed');
  const revenueMinor=rows.filter(r=>r.event_type==='demo_payment_completed').reduce((a,r)=>a+Number(r.amount_minor??0),0);
  const grouped=new Map<string,{source:string;views:number;started:number;orders:number;paid:number;revenueMinor:number}>();
  for(const r of rows){const key=r.source??'Другие каналы';const g=grouped.get(key)??{source:key,views:0,started:0,orders:0,paid:0,revenueMinor:0};if(r.event_type==='view_tour')g.views++;if(r.event_type==='start_booking')g.started++;if(r.event_type==='order_created')g.orders++;if(r.event_type==='demo_payment_completed'){g.paid++;g.revenueMinor+=Number(r.amount_minor??0)}grouped.set(key,g)}
  const tg=new Map<string,{tourId:string;title:string;views:number;started:number;orders:number;paid:number;revenueMinor:number}>();
  for(const r of rows){if(!r.tour_id)continue;const g=tg.get(r.tour_id)??{tourId:r.tour_id,title:tourMap.get(r.tour_id)?.title??r.tour_id,views:0,started:0,orders:0,paid:0,revenueMinor:0};if(r.event_type==='view_tour')g.views++;if(r.event_type==='start_booking')g.started++;if(r.event_type==='order_created')g.orders++;if(r.event_type==='demo_payment_completed'){g.paid++;g.revenueMinor+=Number(r.amount_minor??0)}tg.set(r.tour_id,g)}

  const orderResult=await env.DB.prepare('SELECT source,tour_id,tour_title,status,payment_state,total_minor,created_at FROM orders WHERE session_id=? ORDER BY created_at DESC LIMIT 100').bind(sessionId).all<any>();
  const orderRows=(orderResult.results??[]).filter(r=>{
    if(source!=='Все'&&r.source!==source)return false;
    if(tourId!=='Все'&&r.tour_id!==tourId)return false;
    if(direction!=='Все'&&tourMap.get(r.tour_id)?.direction!==direction)return false;
    const t=Date.parse(String(r.created_at??''));
    return !Number.isFinite(t)||t>=cutoff;
  }).slice(0,30);

  return {
    metrics:{views,started,orders,paid,revenueMinor,conversion:views?Math.round((paid/views)*1000)/10:0,averageOrderMinor:paid?Math.round(revenueMinor/paid):0},
    sources:[...grouped.values()],
    tours:[...tg.values()],
    funnel:[{stage:'Просмотры',value:views},{stage:'Начали бронирование',value:started},{stage:'Заказы',value:orders},{stage:'Оплаты',value:paid}],
    orders:orderRows.map(r=>({source:r.source,tour:r.tour_title,orderStatus:r.status,paymentStatus:r.payment_state,amountMinor:r.total_minor})),
    demo:true
  };
}
