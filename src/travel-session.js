import {
  executeBookingSession,
  initializeBookingSession,
} from './booking-session-client.js';
import {
  createBookingTransaction,
  createShoppingSession,
} from './travel-commerce-transaction.js';
import { createTravelCommerceStore } from './travel-commerce-store.js';
import { createInitialTravelIntent } from './travel-sales-intelligence.js';

const str=(value,max=180)=>String(value??'').trim().slice(0,max);

export function parseCookie(header=''){
  return Object.fromEntries(String(header).split(';').map(value=>value.trim()).filter(Boolean).map(part=>{
    const index=part.indexOf('=');
    return index<0?[part,'']:[part.slice(0,index),decodeURIComponent(part.slice(index+1))];
  }));
}

export function validSalesSessionId(value){
  return /^[A-Za-z0-9._:-]{20,160}$/.test(String(value||''));
}

export async function ensureSalesSession(request,env){
  const cookies=parseCookie(request.headers.get('cookie')||'');
  const existing=validSalesSessionId(cookies.lt_sales_sid)?cookies.lt_sales_sid:'';
  const id=existing||crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO sessions(id) VALUES(?) ON CONFLICT(id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP'
  ).bind(id).run();
  return {id,fresh:!existing};
}

export function withSalesSession(response,session){
  if(!session?.fresh) return response;
  const headers=new Headers(response.headers);
  headers.append(
    'set-cookie',
    `lt_sales_sid=${encodeURIComponent(session.id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
  );
  return new Response(response.body,{
    status:response.status,
    statusText:response.statusText,
    headers,
  });
}

export function shoppingSessionIdForSalesSession(sessionId){
  return `shopping-${str(sessionId)}`;
}

export function transactionIdForSalesSession(sessionId){
  return `txn-${str(sessionId)}`;
}

export async function ensureCommerceTransaction(env,sessionId,{now=new Date(),locale='ru'}={}){
  const shoppingSessionId=shoppingSessionIdForSalesSession(sessionId);
  const store=createTravelCommerceStore(env.DB);
  let shopping=await store.getShoppingSession(shoppingSessionId);
  if(!shopping){
    shopping=createShoppingSession({
      sessionId:shoppingSessionId,
      intent:createInitialTravelIntent(locale),
      candidateOfferIds:[],
      now,
    });
    try{
      await store.createShoppingSession(shopping,{ownerSessionId:sessionId});
    }catch(error){
      // Concurrent AI/UI bootstrap may race to create the same ShoppingSession.
      // Re-read after a failed insert and continue only if the canonical row exists.
      shopping=await store.getShoppingSession(shoppingSessionId);
      if(!shopping) throw error;
    }
  }

  const transactionId=transactionIdForSalesSession(sessionId);
  const transaction=createBookingTransaction({
    transactionId,
    shoppingSessionId,
    now,
  });
  const initialized=await initializeBookingSession(env,transaction);
  return initialized.transaction;
}

export async function currentCommerceTransaction(env,sessionId){
  const transaction=await ensureCommerceTransaction(env,sessionId);
  const result=await executeBookingSession(env,transaction.transactionId,{action:'GET'});
  return result.transaction;
}
