import type { Tour } from '../../shared/types';
import { addTourSchema, adminTourPatchSchema, availabilitySchema, promoSchema } from '../../shared/schemas';
import { getMergedTours, getTourByIdOrSlug, getDestinations } from '../db/repository';
import type { Env } from '../db/repository';
import { HttpError } from './booking';
import { recordAudit } from './internal-workflows';
import { queueSiteSync } from './site-sync';

function mergePricingRules(current: Tour['pricingRules'], input: unknown, legacyAdultMinor?: number): Tour['pricingRules'] {
  const patch = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const next: Record<string, unknown> = { ...current };
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key);

  if (has('adultMinor')) {
    if (patch.adultMinor == null) delete next.adultMinor;
    else next.adultMinor = patch.adultMinor;
  }
  if (has('adultFromMinor')) {
    if (patch.adultFromMinor == null) delete next.adultFromMinor;
    else next.adultFromMinor = patch.adultFromMinor;
  }
  if (has('childRules')) next.childRules = patch.childRules;
  if (has('privateTiers')) next.privateTiers = patch.privateTiers;
  if (has('note')) next.note = patch.note;

  if (legacyAdultMinor != null) next.adultMinor = legacyAdultMinor;
  if (!Array.isArray(next.childRules)) next.childRules = [];
  return next as unknown as Tour['pricingRules'];
}

export async function patchTour(env: Env, sessionId: string, tourId: string, input: unknown, actorId = 'demo') {
  const parsed = adminTourPatchSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400,'Некорректные данные тура','VALIDATION_ERROR');
  const current = await getTourByIdOrSlug(env.DB,sessionId,tourId);
  if (!current) throw new HttpError(404,'Экскурсия не найдена','TOUR_NOT_FOUND');
  const { adultMinor, pricingRules, ...tourPatch } = parsed.data;

  if (current.dataStatus === 'userCreatedDemo') {
    const next: Tour = {
      ...current,
      ...tourPatch,
      pricingRules: mergePricingRules(current.pricingRules, pricingRules, adultMinor),
      dataStatus:'userCreatedDemo',
      updatedAt:new Date().toISOString()
    };
    await env.DB.prepare('UPDATE demo_user_created_tours SET tour_json=?, updated_at=CURRENT_TIMESTAMP WHERE session_id=? AND id=?').bind(JSON.stringify(next),sessionId,current.id).run();
    await recordAudit(env,sessionId,'admin','Редактирование экскурсии','tour',current.id,current,next,actorId);
    await queueSiteSync(env,sessionId,'tour',current.id,'upsert',next);
    return next;
  }

  const existing = await env.DB.prepare('SELECT override_json FROM demo_tour_overrides WHERE session_id=? AND tour_id=?').bind(sessionId,current.id).first<{override_json:string}>();
  const oldOverride = existing ? JSON.parse(existing.override_json) : {};
  const patch:any = { ...oldOverride, ...tourPatch };
  if (pricingRules !== undefined || adultMinor != null) {
    const currentPricing = { ...current.pricingRules, ...(oldOverride.pricingRules ?? {}) } as Tour['pricingRules'];
    patch.pricingRules = mergePricingRules(currentPricing, pricingRules, adultMinor);
  }
  patch.updatedAt = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO demo_tour_overrides(session_id,tour_id,override_json) VALUES (?,?,?)
    ON CONFLICT(session_id,tour_id) DO UPDATE SET override_json=excluded.override_json,updated_at=CURRENT_TIMESTAMP`).bind(sessionId,current.id,JSON.stringify(patch)).run();
  const next = await getTourByIdOrSlug(env.DB,sessionId,current.id);
  await recordAudit(env,sessionId,'admin','Редактирование экскурсии','tour',current.id,current,next ?? patch,actorId);
  await queueSiteSync(env,sessionId,'tour',current.id,'upsert',next ?? patch);
  return next;
}

export async function addTour(env: Env, sessionId: string, input: unknown, actorId = 'demo') {
  const parsed=addTourSchema.safeParse(input);
  if(!parsed.success) throw new HttpError(400,'Некорректные данные новой экскурсии','VALIDATION_ERROR');
  const directions = await getDestinations(env.DB, sessionId);
  if (!directions.some(direction => direction.name.toLowerCase() === parsed.data.direction.toLowerCase())) {
    throw new HttpError(400,'Сначала добавьте направление или выберите существующее','DIRECTION_NOT_FOUND');
  }
  const id=`demo-tour-${crypto.randomUUID()}`;
  const slug=`demo-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
  const d=parsed.data;
  const tour:Tour={id,slug,title:d.title,direction:d.direction,category:'DEMO',published:d.published,sourceUrl:'DEMO USER INPUT',priceMode:d.priceMode,pricingRules:{adultMinor:d.adultMinor,childRules:[]},requiredFields:['fullName'],scheduleMode:d.scheduleMode,description:d.description,program:[],included:[],extraCosts:[],whatToTake:[],images:d.images,badges:[],dataStatus:'userCreatedDemo',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  await env.DB.prepare('INSERT INTO demo_user_created_tours(id,session_id,tour_json) VALUES (?,?,?)').bind(id,sessionId,JSON.stringify(tour)).run();
  await recordAudit(env,sessionId,'admin','Создание экскурсии','tour',id,{},tour,actorId);
  await queueSiteSync(env,sessionId,'tour',id,'create',tour);
  return tour;
}

export async function setAvailability(env: Env, sessionId:string, tourId:string, input:unknown, actorId = 'demo'){
  const tour=await getTourByIdOrSlug(env.DB,sessionId,tourId); if(!tour) throw new HttpError(404,'Экскурсия не найдена','TOUR_NOT_FOUND');
  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400,'Некорректная demo-дата или статус','VALIDATION_ERROR');
  const labels = {available:'доступно',low:'мало мест',request:'по запросу'} as const;
  const { date, status } = parsed.data;
  const before = await env.DB.prepare('SELECT date,status,label FROM demo_availability WHERE session_id=? AND tour_id=? AND date=?').bind(sessionId,tour.id,date).first<any>();
  await env.DB.prepare(`INSERT INTO demo_availability(session_id,tour_id,date,status,label) VALUES (?,?,?,?,?) ON CONFLICT(session_id,tour_id,date) DO UPDATE SET status=excluded.status,label=excluded.label,updated_at=CURRENT_TIMESTAMP`).bind(sessionId,tour.id,date,status,labels[status]).run();
  const after = {date,status,label:labels[status],dataStatus:'demoAvailability'};
  await recordAudit(env,sessionId,'admin','Изменение расписания','availability',`${tour.id}:${date}`,before ?? {},after,actorId);
  await queueSiteSync(env,sessionId,'availability',`${tour.id}:${date}`,'upsert',{tourId:tour.id,...after});
  return after;
}

function inferPromoDiscount(value: string, explicitType: 'none'|'percent_bps'|'fixed_minor', explicitValue: number) {
  if (explicitType !== 'none') return { discountType: explicitType, discountValue: explicitValue };
  const percent = value.match(/^\s*-?\s*(\d+(?:[.,]\d+)?)\s*%\s*$/);
  if (percent) {
    const pct = Number(percent[1]!.replace(',','.'));
    if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      return { discountType: 'percent_bps' as const, discountValue: Math.round(pct * 100) };
    }
  }
  return { discountType: 'none' as const, discountValue: 0 };
}

export async function setPromo(env:Env,sessionId:string,tourId:string,input:unknown, actorId = 'demo'){
  const tour=await getTourByIdOrSlug(env.DB,sessionId,tourId); if(!tour) throw new HttpError(404,'Экскурсия не найдена','TOUR_NOT_FOUND');
  const parsed = promoSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400,'Некорректные параметры DEMO-акции','VALIDATION_ERROR');
  const before = await env.DB.prepare('SELECT enabled,label,value,discount_type,discount_value FROM demo_promotions WHERE session_id=? AND tour_id=?').bind(sessionId,tour.id).first<any>();
  const { enabled, label, value } = parsed.data;
  const discount = inferPromoDiscount(value, parsed.data.discountType, parsed.data.discountValue);
  await env.DB.prepare(`INSERT INTO demo_promotions(session_id,tour_id,enabled,label,value,discount_type,discount_value) VALUES (?,?,?,?,?,?,?) ON CONFLICT(session_id,tour_id) DO UPDATE SET enabled=excluded.enabled,label=excluded.label,value=excluded.value,discount_type=excluded.discount_type,discount_value=excluded.discount_value,updated_at=CURRENT_TIMESTAMP`).bind(sessionId,tour.id,enabled?1:0,label,value,discount.discountType,discount.discountValue).run();
  const after={enabled,label,value,...discount,dataStatus:'demoPromo'};
  await recordAudit(env,sessionId,'admin','Изменение акции','promotion',tour.id,before ?? {},after,actorId);
  await queueSiteSync(env,sessionId,'promotion',tour.id,'upsert',{tourId:tour.id,...after});
  return after;
}

export async function addDirection(env:Env,sessionId:string,input:any, actorId = 'demo'){
  const name=String(input?.name??'').trim(); if(name.length<2) throw new HttpError(400,'Введите название направления','VALIDATION_ERROR');
  const current=await getDestinations(env.DB,sessionId); if(current.some(d=>d.name.toLowerCase()===name.toLowerCase())) throw new HttpError(409,'Такое направление уже есть','ALREADY_EXISTS');
  const id=`demo-dir-${crypto.randomUUID()}`;
  await env.DB.prepare('INSERT INTO demo_directions(id,session_id,name) VALUES (?,?,?)').bind(id,sessionId,name).run();
  const result={id,name,dataStatus:'userCreatedDemo'};
  await recordAudit(env,sessionId,'admin','Создание направления','direction',id,{},result,actorId);
  await queueSiteSync(env,sessionId,'direction',id,'create',result);
  return result;
}

export async function adminTours(env:Env,sessionId:string){ return getMergedTours(env.DB,sessionId); }
