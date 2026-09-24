import type { AnalyticsResponse, AvailabilityDate, BookingDraft, Destination, GroupDepartureSummary, GroupMemberInput, OrderSummary, Quote, Tour } from '../../shared/types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type','application/json');
  const initData = typeof window !== 'undefined' ? String((window as any).Telegram?.WebApp?.initData ?? '') : '';
  if (initData && !headers.has('X-Telegram-Init-Data')) headers.set('X-Telegram-Init-Data', initData);
  const multilingualHost = typeof window !== 'undefined' && window.location.hostname === 'max-tour.viiversion.com';
  const locale = multilingualHost && window.localStorage.getItem('max-tour-locale') === 'vi' ? 'vi' : 'ru';
  if (!headers.has('X-Max-Tour-Locale')) headers.set('X-Max-Tour-Locale', locale);
  const response = await fetch(url,{...init,headers,credentials:'same-origin'});
  const data:any = await response.json().catch(()=>({}));
  if(!response.ok) throw new ApiError(data?.error?.message ?? 'Ошибка API',response.status,data?.error?.code);
  return data as T;
}

export const api = {
  session:()=>request<{ok:boolean}>('/api/session'),
  health:()=>request<any>('/api/health'),
  reset:()=>request<{ok:boolean}>('/api/demo/reset',{method:'POST',body:'{}'}),
  authReadiness:()=>request<any>('/api/auth/readiness'),
  authenticateTelegram:()=>request<any>('/api/auth/telegram',{method:'POST',body:JSON.stringify({initData:String((window as any).Telegram?.WebApp?.initData??'')})}),
  destinations:()=>request<{items:Destination[]}>('/api/destinations'),
  tours:(admin=false)=>request<{items:Tour[]}>(`/api/tours${admin?'?admin=1':''}`),
  tour:(id:string)=>request<{item:Tour}>(`/api/tours/${encodeURIComponent(id)}`),
  availability:(id:string)=>request<{items:AvailabilityDate[]}>(`/api/tours/${encodeURIComponent(id)}/availability`),
  quote:(draft:BookingDraft)=>request<{quote:Quote}>('/api/booking/quote',{method:'POST',body:JSON.stringify(draft)}),
  createOrder:(draft:BookingDraft,key:string)=>request<{order:OrderSummary}>('/api/orders',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(draft)}),
  pay:(orderId:string,key:string)=>request<{order:OrderSummary}>('/api/payments/demo',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify({orderId})}),
  groupDepartures:(tourId?:string)=>request<{items:GroupDepartureSummary[]}>(`/api/group-departures${tourId?`?tourId=${encodeURIComponent(tourId)}`:''}`),
  createGroupDeparture:(tourId:string,departureDate:string,member:GroupMemberInput,targetPeople?:number|null)=>request<{item:GroupDepartureSummary}>('/api/group-departures',{method:'POST',body:JSON.stringify({tourId,departureDate,targetPeople:targetPeople??null,member})}),
  joinGroupDeparture:(id:string,member:GroupMemberInput)=>request<{item:GroupDepartureSummary}>(`/api/group-departures/${encodeURIComponent(id)}/join`,{method:'POST',body:JSON.stringify({member})}),
  adminGroupDepartures:()=>request<{items:GroupDepartureSummary[]}>('/api/admin/group-departures'),
  adminPatchGroupDeparture:(id:string,data:{status:string;cancellationReason?:string})=>request<{item:GroupDepartureSummary}>(`/api/admin/group-departures/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(data)}),
  trips:()=>request<{items:OrderSummary[]}>('/api/my-trips'),
  order:(id:string)=>request<{order:OrderSummary}>(`/api/orders/${encodeURIComponent(id)}`),
  managerStaff:()=>request<{mode:string;items:Array<{telegramUserId:string;role:string;displayName:string;active:boolean}>}>('/api/manager/staff'),
  managerOrders:()=>request<{items:OrderSummary[]}>('/api/manager/orders'),
  managerOrder:(id:string)=>request<{order:OrderSummary}>(`/api/manager/orders/${encodeURIComponent(id)}`),
  managerStatus:(id:string,status:OrderSummary['status'])=>request<{order:OrderSummary}>(`/api/manager/orders/${encodeURIComponent(id)}/status`,{method:'PATCH',body:JSON.stringify({status})}),
  managerOps:(id:string)=>request<{ops:{assignedManager:string;pickupNote:string;internalNote:string;lastContactAt:string|null;updatedAt:string|null}}>(`/api/manager/orders/${encodeURIComponent(id)}/ops`),
  patchManagerOps:(id:string,data:any)=>request<{ops:any}>(`/api/manager/orders/${encodeURIComponent(id)}/ops`,{method:'PATCH',body:JSON.stringify(data)}),
  orderWorkflow:(id:string)=>request<{workflow:any}>(`/api/manager/orders/${encodeURIComponent(id)}/workflow`),
  patchOrderWorkflow:(id:string,data:any)=>request<{workflow:any}>(`/api/manager/orders/${encodeURIComponent(id)}/workflow`,{method:'PATCH',body:JSON.stringify(data)}),
  customerRecord:(key:string)=>request<{record:any}>(`/api/manager/customer-record?key=${encodeURIComponent(key)}`),
  patchCustomerRecord:(data:any)=>request<{record:any}>('/api/manager/customer-record',{method:'PATCH',body:JSON.stringify(data)}),
  adminTours:()=>request<{items:Tour[]}>('/api/admin/tours'),
  patchTour:(id:string,patch:any)=>request<{item:Tour}>(`/api/admin/tours/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(patch)}),
  addTour:(data:any)=>request<{item:Tour}>('/api/admin/tours',{method:'POST',body:JSON.stringify(data)}),
  schedule:(id:string,data:any)=>request(`/api/admin/tours/${encodeURIComponent(id)}/schedule`,{method:'POST',body:JSON.stringify(data)}),
  promo:(id:string,data:any)=>request(`/api/admin/tours/${encodeURIComponent(id)}/promo`,{method:'POST',body:JSON.stringify(data)}),
  directions:()=>request<{items:Destination[]}>('/api/admin/directions'),
  addDirection:(name:string)=>request('/api/admin/directions',{method:'POST',body:JSON.stringify({name})}),
  analytics:(params:URLSearchParams)=>request<AnalyticsResponse>(`/api/admin/analytics?${params.toString()}`),
  adminCustomers:()=>request<{items:any[]}>('/api/admin/customers'),
  adminCampaigns:()=>request<{items:any[]}>('/api/admin/campaigns'),
  createAdminCampaign:(data:{title:string;message:string;segment:string;tourId?:string;reason?:string})=>request<{item:any}>('/api/admin/campaigns',{method:'POST',body:JSON.stringify(data)}),
  campaignRecipients:(id:string)=>request<{items:any[]}>(`/api/admin/campaigns/${encodeURIComponent(id)}/recipients`),
  adminRefunds:()=>request<{items:any[]}>('/api/admin/refunds'),
  adminSiteSync:()=>request<{items:any[]}>('/api/admin/site-sync'),
  ownerOverview:()=>request<any>('/api/owner/overview'),
  ownerSettings:(data:any)=>request<any>('/api/owner/settings',{method:'PATCH',body:JSON.stringify(data)}),
  ownerAudit:(limit=30)=>request<{items:any[]}>(`/api/owner/audit?limit=${limit}`),
  ownerStaff:()=>request<{mode:string;items:any[];managementEnabled:boolean}>('/api/owner/staff'),
  saveStaff:(data:any)=>request<{item:any}>('/api/owner/staff',{method:'PUT',body:JSON.stringify(data)}),
  telegramStatus:()=>request<any>('/api/integrations/telegram/status'),
  telegramWebhookInfo:()=>request<any>('/api/integrations/telegram/webhook'),
  configureTelegramWebhook:()=>request<any>('/api/integrations/telegram/webhook',{method:'POST',body:'{}'}),
  flushTelegram:()=>request<any>('/api/integrations/telegram/flush',{method:'POST',body:'{}'}),
  tildaStatus:()=>request<any>('/api/integrations/tilda/status'),
  event:(eventType:string,tourId?:string,source='Telegram')=>request('/api/analytics/event',{method:'POST',body:JSON.stringify({eventType,tourId,source})}).catch(()=>null),
};
