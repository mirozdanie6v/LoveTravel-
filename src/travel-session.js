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
import { ensureTravelCommerceRuntimeSchema } from './travel-commerce-migration.js';
import {GUEST_COOKIE,ensureConversationSchema,conversationHash,conversationError} from './travel-conversation-state.js';

const str=(value,max=180)=>String(value??'').trim().slice(0,max);

export function parseCookie(header=''){
  return Object.fromEntries(String(header).split(';').map(value=>value.trim()).filter(Boolean).map(part=>{
    const index=part.indexOf('=');
    if(index<0)return [part,''];
    try{return [part.slice(0,index),decodeURIComponent(part.slice(index+1))];}catch{return [part.slice(0,index),''];}
  }));
}

export function validSalesSessionId(value){
  return /^[A-Za-z0-9._:-]{20,160}$/.test(String(value||''));
}

export async function ensureSalesGuest(request,env){
  const origin=request.headers.get('origin');
  if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site'){
    throw conversationError('conversation_origin_denied',403);
  }
  await ensureConversationSchema(env.DB);
  const cookies=parseCookie(request.headers.get('cookie')||'');
  let token=/^[a-f0-9]{64}$/.test(cookies[GUEST_COOKIE]||'')?cookies[GUEST_COOKIE]:'';
  let ownerHash=token?await conversationHash(token):'';
  let owner=ownerHash?await env.DB.prepare(`SELECT default_conversation_id FROM travel_guest_sessions
    WHERE token_hash=? AND datetime(updated_at)>=datetime('now','-30 days')`).bind(ownerHash).first():null;
  const fresh=!owner;
  if(!owner){
    token=(crypto.randomUUID()+crypto.randomUUID()).replaceAll('-','');
    ownerHash=await conversationHash(token);
    owner={default_conversation_id:crypto.randomUUID()};
    await env.DB.prepare('INSERT INTO travel_guest_sessions(token_hash,default_conversation_id) VALUES(?,?)')
      .bind(ownerHash,owner.default_conversation_id).run();
  }else await env.DB.prepare('UPDATE travel_guest_sessions SET updated_at=CURRENT_TIMESTAMP WHERE token_hash=?').bind(ownerHash).run();
  return {ownerHash,defaultConversationId:owner.default_conversation_id,fresh,token};
}

export async function ensureSalesSession(request,env){
  const {ownerHash,defaultConversationId,fresh,token}=await ensureSalesGuest(request,env);
  // A client ID is a tab/conversation selector, never an access credential.
  const requested=request.headers.get('x-lt-conversation-id');
  const conversationId=validSalesSessionId(requested)?requested:defaultConversationId;
  const id=await conversationHash(ownerHash+':'+conversationId);
  const prior=await env.DB.prepare('SELECT revoked_at FROM travel_conversations WHERE session_id=?').bind(id).first();
  if(prior?.revoked_at)throw conversationError('conversation_deleted',410);
  await env.DB.prepare(
    'INSERT INTO sessions(id) VALUES(?) ON CONFLICT(id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP'
  ).bind(id).run();
  await env.DB.prepare(`INSERT INTO travel_conversations(session_id,owner_hash,client_id) VALUES(?,?,?)
    ON CONFLICT(session_id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP`).bind(id,ownerHash,conversationId).run();
  return {id,ownerHash,conversationId,fresh,token};
}

export function withSalesSession(response,session){
  if(!session?.token) return response;
  const headers=new Headers(response.headers);
  headers.append(
    'set-cookie',
    `${GUEST_COOKIE}=${session.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
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
  await ensureTravelCommerceRuntimeSchema(env.DB);
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
