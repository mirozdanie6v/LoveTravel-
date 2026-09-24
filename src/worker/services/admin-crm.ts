import type { Env } from '../db/repository';
import { HttpError } from './booking';
import { recordAudit } from './internal-workflows';

function clean(value: unknown, max=500) { return String(value ?? '').trim().slice(0,max); }
function keyOf(name:string, contact:string) {
  const normalizedName = clean(name,180).toLowerCase();
  const normalizedContact = clean(contact,220).toLowerCase();
  return `${normalizedName}|${normalizedContact}`;
}

export type CampaignSegment = 'all' | 'paid' | 'repeat' | 'group';

export async function listAdminCustomers(env:Env, sessionId:string) {
  const orderRows = await env.DB.prepare(`SELECT customer,contact,source,tour_id,tour_title,status,total_minor,paid_minor,created_at FROM orders WHERE session_id=? ORDER BY created_at DESC`).bind(sessionId).all<any>();
  const groupRows = await env.DB.prepare(`SELECT m.customer_name,m.contact,m.telegram_username,m.status,m.created_at,d.tour_id,d.tour_title,d.departure_date,d.status AS departure_status FROM demo_group_members m JOIN demo_group_departures d ON d.id=m.departure_id WHERE m.session_id=? ORDER BY m.created_at DESC`).bind(sessionId).all<any>();
  const records = await env.DB.prepare(`SELECT customer_key,tags_json,manager_note,task_text,task_due,task_done,updated_at FROM demo_customer_records WHERE session_id=?`).bind(sessionId).all<any>();
  const recordMap = new Map<string,any>((records.results ?? []).map((r:any)=>[String(r.customer_key),r]));
  const map = new Map<string,any>();
  const ensure=(name:string,contact:string,telegram='')=>{
    const key=keyOf(name,contact);
    const current=map.get(key) ?? { key,name,contact,telegram,orders:0,groupRequests:0,totalMinor:0,paidMinor:0,tours:[] as string[],sources:[] as string[],lastActivity:'',lastTour:'',tags:[] as string[],managerNote:'',taskText:'',taskDue:'',taskDone:false };
    if(!current.telegram && telegram) current.telegram=telegram;
    map.set(key,current); return current;
  };
  for(const row of orderRows.results ?? []) {
    const c=ensure(String(row.customer||'Клиент'),String(row.contact||''));
    c.orders+=1; c.totalMinor+=Number(row.total_minor||0); c.paidMinor+=Number(row.paid_minor||0);
    if(!c.tours.includes(row.tour_id)) c.tours.push(row.tour_id);
    if(!c.sources.includes(row.source)) c.sources.push(row.source);
    if(!c.lastActivity || row.created_at>c.lastActivity){c.lastActivity=row.created_at;c.lastTour=row.tour_title;}
  }
  for(const row of groupRows.results ?? []) {
    const c=ensure(String(row.customer_name||'Клиент'),String(row.contact||''),String(row.telegram_username||''));
    c.groupRequests+=1;
    if(!c.tours.includes(row.tour_id)) c.tours.push(row.tour_id);
    if(!c.sources.includes('Групповой сбор')) c.sources.push('Групповой сбор');
    if(!c.lastActivity || row.created_at>c.lastActivity){c.lastActivity=row.created_at;c.lastTour=row.tour_title;}
  }
  for(const c of map.values()) {
    const record=recordMap.get(c.key);
    if(record){
      try{c.tags=JSON.parse(record.tags_json||'[]')}catch{c.tags=[]}
      c.managerNote=record.manager_note||'';c.taskText=record.task_text||'';c.taskDue=record.task_due||'';c.taskDone=Boolean(record.task_done);
    }
  }
  return [...map.values()].sort((a,b)=>String(b.lastActivity).localeCompare(String(a.lastActivity)));
}

function selectCustomers(customers:any[], segment:CampaignSegment, tourId?:string) {
  return customers.filter(c=>{
    if(tourId && !c.tours.includes(tourId)) return false;
    if(segment==='paid' && c.paidMinor<=0) return false;
    if(segment==='repeat' && c.orders<2) return false;
    if(segment==='group' && c.groupRequests<=0) return false;
    return true;
  });
}

export async function createCampaign(env:Env, sessionId:string, input:any, actorId='demo') {
  const title=clean(input?.title,120), message=clean(input?.message,2000), reason=clean(input?.reason,300), tourId=clean(input?.tourId,160)||null;
  const segment:CampaignSegment=['all','paid','repeat','group'].includes(String(input?.segment)) ? input.segment : 'all';
  if(title.length<2 || message.length<2) throw new HttpError(400,'Укажите название и текст рассылки','VALIDATION_ERROR');
  const customers=selectCustomers(await listAdminCustomers(env,sessionId),segment,tourId||undefined);
  const id=crypto.randomUUID();
  let deliverable=0;
  const recipientStatements=customers.map((c:any)=>{
    const username=String(c.telegram||'').replace(/^@/,'').trim();
    const contact=String(c.contact||'');
    const status=username||contact ? 'manual_contact_ready' : 'waiting_contact';
    if(status==='manual_contact_ready') deliverable++;
    return env.DB.prepare(`INSERT INTO demo_broadcast_recipients(id,session_id,campaign_id,customer_key,customer_name,contact,telegram_username,delivery_status) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),sessionId,id,c.key,c.name,contact,username,status);
  });
  await env.DB.prepare(`INSERT INTO demo_broadcast_campaigns(id,session_id,title,message,segment,tour_id,reason,status,recipient_count,deliverable_count,created_by) VALUES (?,?,?,?,?,?,?,'prepared',?,?,?)`)
    .bind(id,sessionId,title,message,segment,tourId,reason,customers.length,deliverable,actorId).run();
  if(recipientStatements.length) await env.DB.batch(recipientStatements);
  const result={id,title,message,segment,tourId,reason,status:'prepared',recipientCount:customers.length,deliverableCount:deliverable};
  await recordAudit(env,sessionId,'admin','Подготовка рассылки','campaign',id,{},result,actorId,{externalDelivery:false});
  return result;
}

export async function listCampaigns(env:Env,sessionId:string) {
  const rows=await env.DB.prepare(`SELECT id,title,message,segment,tour_id,reason,status,recipient_count,deliverable_count,created_by,created_at,updated_at FROM demo_broadcast_campaigns WHERE session_id=? ORDER BY created_at DESC`).bind(sessionId).all<any>();
  return (rows.results ?? []).map((r:any)=>({id:r.id,title:r.title,message:r.message,segment:r.segment,tourId:r.tour_id,reason:r.reason,status:r.status,recipientCount:Number(r.recipient_count||0),deliverableCount:Number(r.deliverable_count||0),createdBy:r.created_by,createdAt:r.created_at,updatedAt:r.updated_at}));
}

export async function campaignRecipients(env:Env,sessionId:string,campaignId:string) {
  const rows=await env.DB.prepare(`SELECT customer_key,customer_name,contact,telegram_username,telegram_chat_id,delivery_status,created_at FROM demo_broadcast_recipients WHERE session_id=? AND campaign_id=? ORDER BY customer_name`).bind(sessionId,campaignId).all<any>();
  return (rows.results ?? []).map((r:any)=>({customerKey:r.customer_key,customerName:r.customer_name,contact:r.contact,telegramUsername:r.telegram_username,telegramChatId:r.telegram_chat_id,deliveryStatus:r.delivery_status,createdAt:r.created_at}));
}

export async function prepareGroupCancellationCampaign(env:Env,sessionId:string,departureId:string,tourId:string,tourTitle:string,reason:string,actorId='demo') {
  const title=`Отмена: ${tourTitle}`;
  const message=`Экскурсия «${tourTitle}» отменена. Причина: ${reason || 'организационные обстоятельства'}. Менеджер свяжется с вами по переносу или возврату согласно условиям MAX TOUR.`;
  const id=crypto.randomUUID();
  const members=await env.DB.prepare(`SELECT customer_name,contact,telegram_username FROM demo_group_members WHERE session_id=? AND departure_id=? AND status<>'cancelled'`).bind(sessionId,departureId).all<any>();
  let deliverable=0;
  await env.DB.prepare(`INSERT INTO demo_broadcast_campaigns(id,session_id,title,message,segment,tour_id,reason,status,recipient_count,deliverable_count,created_by) VALUES (?,?,?,?,'group',?,?,'prepared',?,?,?)`)
    .bind(id,sessionId,title,message,tourId,reason,Number(members.results?.length||0),0,actorId).run();
  const statements=(members.results??[]).map((m:any)=>{
    const contact=String(m.contact||''), username=String(m.telegram_username||'').replace(/^@/,'').trim();
    const status=username||contact?'manual_contact_ready':'waiting_contact'; if(status==='manual_contact_ready')deliverable++;
    return env.DB.prepare(`INSERT INTO demo_broadcast_recipients(id,session_id,campaign_id,customer_key,customer_name,contact,telegram_username,delivery_status) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),sessionId,id,keyOf(String(m.customer_name||'Клиент'),contact),String(m.customer_name||'Клиент'),contact,username,status);
  });
  if(statements.length) await env.DB.batch(statements);
  await env.DB.prepare('UPDATE demo_broadcast_campaigns SET deliverable_count=? WHERE id=? AND session_id=?').bind(deliverable,id,sessionId).run();
  await recordAudit(env,sessionId,'admin','Авторассылка при отмене группы','campaign',id,{}, {title,recipientCount:Number(members.results?.length||0),deliverableCount:deliverable,departureId},actorId);
  return {id,title,recipientCount:Number(members.results?.length||0),deliverableCount:deliverable};
}
