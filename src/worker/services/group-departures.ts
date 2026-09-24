import type { Env } from '../db/repository';
import { getAvailability, getTourByIdOrSlug } from '../db/repository';
import type { GroupDepartureSummary, GroupMemberInput } from '../../shared/types';
import { createGroupDepartureSchema, groupDepartureAdminSchema, joinGroupDepartureSchema } from '../../shared/schemas';
import { HttpError } from './booking';
import { recordAudit } from './internal-workflows';
import { queueNotification } from './notifications';
import { prepareGroupCancellationCampaign } from './admin-crm';
import { findSourceSiteTour, sourceTourId } from '../../shared/site-catalog';

function contactOf(member: GroupMemberInput) {
  return [member.phone, member.telegram].filter(Boolean).join(' · ');
}

async function resolveGroupTour(env:Env,sessionId:string,tourId:string){
  const structured=await getTourByIdOrSlug(env.DB,sessionId,tourId);
  if(structured?.published) return {id:structured.id,title:structured.title,structured:true};
  const source=findSourceSiteTour(tourId);
  if(source) return {id:sourceTourId(source.path),title:source.title,structured:false};
  return null;
}

function mapDeparture(row: any): GroupDepartureSummary {
  return {
    id: String(row.id),
    tourId: String(row.tour_id),
    tourTitle: String(row.tour_title),
    departureDate: String(row.departure_date),
    status: row.status,
    targetPeople: row.target_people == null ? null : Number(row.target_people),
    minPeople: row.min_people == null ? null : Number(row.min_people),
    seats: Number(row.seats ?? 0),
    members: Number(row.members ?? 0),
    cancellationReason: String(row.cancellation_reason ?? ''),
    dataStatus: 'demoInput',
    createdAt: String(row.created_at ?? ''),
  };
}

async function fetchDeparture(env: Env, sessionId: string, id: string) {
  const row = await env.DB.prepare(`SELECT d.*,
    COALESCE(SUM(CASE WHEN m.status<>'cancelled' THEN m.seats ELSE 0 END),0) AS seats,
    COUNT(CASE WHEN m.status<>'cancelled' THEN 1 END) AS members
    FROM demo_group_departures d
    LEFT JOIN demo_group_members m ON m.departure_id=d.id AND m.session_id=d.session_id
    WHERE d.session_id=? AND d.id=?
    GROUP BY d.id`).bind(sessionId,id).first<any>();
  if (!row) throw new HttpError(404,'Групповой выезд не найден','GROUP_DEPARTURE_NOT_FOUND');
  return mapDeparture(row);
}

async function addMember(env: Env, sessionId: string, departureId: string, member: GroupMemberInput) {
  const seats = member.adults + member.children.length;
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO demo_group_members(id,departure_id,session_id,customer_name,contact,telegram_username,adults,children_json,seats,status)
    VALUES (?,?,?,?,?,?,?,?,?,'waiting')`).bind(
      id,departureId,sessionId,member.customerName,contactOf(member),member.telegram ?? '',member.adults,JSON.stringify(member.children),seats
    ).run();
  return { id, seats };
}

async function ensureDemoDepartures(env: Env, sessionId: string, requestedTourId: string) {
  const tour = await resolveGroupTour(env,sessionId,requestedTourId);
  if (!tour) return null;

  const canonicalTourId = tour.id;
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM demo_group_departures WHERE session_id=? AND tour_id=? AND status='gathering'").bind(sessionId,canonicalTourId).first<{n:number}>();
  if (Number(count?.n ?? 0) > 0) return canonicalTourId;

  const availability = tour.structured ? await getAvailability(env.DB,sessionId,canonicalTourId).catch(()=>[] as any[]) : [];
  const dates = availability.slice(0,2).map((x:any)=>String(x.date)).filter(Boolean);
  if (!dates.length) {
    const base = new Date();
    for (const offset of [7,14]) {
      const d = new Date(base.getTime()+offset*86400000);
      dates.push(d.toISOString().slice(0,10));
    }
  }
  for (const departureDate of dates) {
    const id=crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO demo_group_departures(id,session_id,tour_id,tour_title,departure_date,status,target_people,min_people,created_by,data_status)
      VALUES (?,?,?,?,?,'gathering',NULL,NULL,'system_demo','demoInput')`).bind(id,sessionId,canonicalTourId,tour.title,departureDate).run();
    const demoMember: GroupMemberInput = {customerName:'DEMO заявка',telegram:'@demo_guest',adults:2,children:[]};
    await addMember(env,sessionId,id,demoMember);
  }
  return canonicalTourId;
}

export async function listGroupDepartures(env: Env, sessionId: string, tourId?: string) {
  let canonicalTourId: string | null = null;
  if (tourId) {
    canonicalTourId = await ensureDemoDepartures(env,sessionId,tourId);
    if (!canonicalTourId) return [];
  }
  const where = canonicalTourId ? 'WHERE d.session_id=? AND d.tour_id=?' : 'WHERE d.session_id=?';
  const stmt = env.DB.prepare(`SELECT d.*,
    COALESCE(SUM(CASE WHEN m.status<>'cancelled' THEN m.seats ELSE 0 END),0) AS seats,
    COUNT(CASE WHEN m.status<>'cancelled' THEN 1 END) AS members
    FROM demo_group_departures d
    LEFT JOIN demo_group_members m ON m.departure_id=d.id AND m.session_id=d.session_id
    ${where}
    GROUP BY d.id
    ORDER BY d.departure_date, d.created_at`);
  const rows = canonicalTourId ? await stmt.bind(sessionId,canonicalTourId).all<any>() : await stmt.bind(sessionId).all<any>();
  return (rows.results ?? []).map(mapDeparture);
}

export async function createGroupDeparture(env: Env, sessionId: string, input: unknown, actorId='demo') {
  const parsed = createGroupDepartureSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400,'Проверьте данные группового выезда','VALIDATION_ERROR');
  const tour = await resolveGroupTour(env, sessionId, parsed.data.tourId);
  if (!tour) throw new HttpError(404,'Экскурсия не найдена','TOUR_NOT_FOUND');
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO demo_group_departures(id,session_id,tour_id,tour_title,departure_date,status,target_people,min_people,created_by,data_status)
    VALUES (?,?,?,?,?,'gathering',?,NULL,'tourist','demoInput')`).bind(
      id,sessionId,tour.id,tour.title,parsed.data.departureDate,parsed.data.targetPeople ?? null
    ).run();
  await addMember(env,sessionId,id,parsed.data.member as GroupMemberInput);
  const departure = await fetchDeparture(env,sessionId,id);
  await recordAudit(env,sessionId,'tourist','Создание группового выезда','group_departure',id,{},departure,actorId);
  try {
    await queueNotification(env,sessionId,'manager','group_departure_created',null,{groupDepartureId:id,tourTitle:tour.title,departureDate:departure.departureDate,seats:departure.seats});
  } catch {}
  return departure;
}

export async function joinGroupDeparture(env: Env, sessionId: string, id: string, input: unknown, actorId='demo') {
  const parsed = joinGroupDepartureSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400,'Проверьте данные участника','VALIDATION_ERROR');
  const current = await fetchDeparture(env,sessionId,id);
  if (current.status !== 'gathering') throw new HttpError(409,'К этому выезду сейчас нельзя присоединиться','GROUP_NOT_GATHERING');
  await addMember(env,sessionId,id,parsed.data.member as GroupMemberInput);
  const after = await fetchDeparture(env,sessionId,id);
  await recordAudit(env,sessionId,'tourist','Присоединение к групповому выезду','group_departure',id,current,after,actorId);
  try {
    await queueNotification(env,sessionId,'manager','group_departure_joined',null,{groupDepartureId:id,tourTitle:after.tourTitle,departureDate:after.departureDate,seats:after.seats});
  } catch {}
  return after;
}

export function isGroupNotFormedReason(reason:string){
  const normalized=reason.toLowerCase().replace(/ё/g,'е');
  return /(?:группа.{0,120})?не\s*(?:собра|набра)/i.test(normalized);
}

async function createGroupRefundCase(env:Env,sessionId:string,departure:GroupDepartureSummary,reason:string){
  const notFormed=isGroupNotFormedReason(reason);
  const existing=await env.DB.prepare(`SELECT id FROM demo_refund_cases WHERE session_id=? AND group_departure_id=? AND status NOT IN ('completed','cancelled') LIMIT 1`).bind(sessionId,departure.id).first<any>();
  const ruleCode=notFormed?'GROUP_NOT_FORMED_FULL_DEPOSIT_REFUND':'FORCE_MAJEURE_MANAGER_REVIEW';
  const note=notFormed?'Группа не набрана: по правилам MAX TOUR внесённый депозит возвращается 100%. Реальный refund ожидает подключения платёжного провайдера.':'Отмена организатором: возврат или перенос требует решения менеджера согласно опубликованным условиям и фактической оплате.';
  if(existing){
    await env.DB.prepare(`UPDATE demo_refund_cases SET reason=?,rule_code=?,retention_percent=?,requested_refund_minor=NULL,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND session_id=?`).bind(reason,ruleCode,notFormed?0:null,note,existing.id,sessionId).run();
    return existing.id;
  }
  const id=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO demo_refund_cases(id,session_id,group_departure_id,reason,rule_code,retention_percent,requested_refund_minor,status,note) VALUES (?,?,?,?,?,?,NULL,'manager_review',?)`).bind(id,sessionId,departure.id,reason,ruleCode,notFormed?0:null,note).run();
  return id;
}

export async function adminPatchGroupDeparture(env: Env, sessionId: string, id: string, input: unknown, actorId='demo') {
  const parsed = groupDepartureAdminSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400,'Некорректный статус группового выезда','VALIDATION_ERROR');
  const before = await fetchDeparture(env,sessionId,id);
  await env.DB.prepare(`UPDATE demo_group_departures SET status=?,cancellation_reason=?,updated_at=CURRENT_TIMESTAMP WHERE session_id=? AND id=?`)
    .bind(parsed.data.status,parsed.data.cancellationReason ?? '',sessionId,id).run();
  const after = await fetchDeparture(env,sessionId,id);
  await recordAudit(env,sessionId,'admin','Изменение группового выезда','group_departure',id,before,after,actorId);
  if (before.status !== 'cancelled' && after.status === 'cancelled') {
    const reason=after.cancellationReason || 'Отмена администратором';
    const refundCaseId=await createGroupRefundCase(env,sessionId,after,reason);
    const campaign=await prepareGroupCancellationCampaign(env,sessionId,id,after.tourId,after.tourTitle,reason,actorId);
    try {
      const payload={groupDepartureId:id,tourTitle:after.tourTitle,departureDate:after.departureDate,reason,refundCaseId,campaignId:campaign.id};
      await queueNotification(env,sessionId,'manager','group_departure_cancelled',null,payload);
      await queueNotification(env,sessionId,'owner','group_departure_cancelled',null,payload);
    } catch {}
  }
  return after;
}
