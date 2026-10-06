import { createBokunProvider } from './bokun-provider.js';
import { executeBookingSession } from './booking-session-client.js';
import { createTravelCapabilityBroker } from './travel-capability-broker.js';
import {
  composeGroundedSalesPlan,
  createInitialTravelIntent,
  extractConversationIntent,
  mergeIntentPatch,
} from './travel-sales-intelligence.js';
import {
  createShoppingSession,
  selectShoppingOffer,
  setShoppingCandidates,
  setShoppingIntent,
} from './travel-commerce-transaction.js';
import { createTravelCommerceStore } from './travel-commerce-store.js';

const str=(value,max=1600)=>String(value??'').trim().slice(0,max);

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      ...headers,
    },
  });
}

function parseCookie(header=''){
  return Object.fromEntries(String(header).split(';').map(value=>value.trim()).filter(Boolean).map(part=>{
    const index=part.indexOf('=');
    return index<0?[part,'']:[part.slice(0,index),decodeURIComponent(part.slice(index+1))];
  }));
}

function validSessionId(value){
  return /^[A-Za-z0-9._:-]{20,160}$/.test(String(value||''));
}

async function ensureSalesSession(request,env){
  const cookies=parseCookie(request.headers.get('cookie')||'');
  const existing=validSessionId(cookies.lt_sales_sid)?cookies.lt_sales_sid:'';
  const id=existing||crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO sessions(id) VALUES(?) ON CONFLICT(id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP'
  ).bind(id).run();
  return {id,fresh:!existing};
}

function withSalesSession(response,session){
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

function localeFrom(request,body){
  const header=str(request.headers.get('x-max-tour-locale'),8).toLowerCase();
  const bodyLocale=str(body?.locale||body?.context?.locale,8).toLowerCase();
  const candidate=['ru','en','vi','zh','ko'].includes(bodyLocale)?bodyLocale:header;
  return ['ru','en','vi','zh','ko'].includes(candidate)?candidate:'ru';
}

function exactDate(intent){
  return intent?.dateConstraint?.kind==='EXACT'?String(intent.dateConstraint.exact||''):'';
}

function partyKnown(intent){
  return Number(intent?.party?.adults)>0
    ||Array.isArray(intent?.party?.children)&&intent.party.children.length>0
    ||Number(intent?.party?.infants)>0;
}

function productRows(packet){
  return Array.isArray(packet?.data)?packet.data:[];
}

function canonicalToProviderProducts(packet,canonicalId){
  if(!canonicalId) return null;
  const row=productRows(packet).find(item=>item?.product?.productId===canonicalId);
  const external=row?.product?.providerRef?.externalId;
  return external?[String(external)]:null;
}

function externalTourId(packet,canonicalId){
  if(!canonicalId) return '';
  const row=productRows(packet).find(item=>item?.product?.productId===canonicalId);
  return String(row?.product?.providerRef?.externalId||'');
}

function shoppingSessionId(sessionId){
  return `shopping-${sessionId}`;
}

async function loadConversationMemory(env,sessionId){
  try{
    const row=await env.DB.prepare(
      'SELECT memory_json FROM ai_conversation_memory WHERE session_id=?'
    ).bind(sessionId).first();
    if(!row?.memory_json) return {turns:[]};
    const parsed=JSON.parse(row.memory_json);
    const sales=parsed?.travelSales;
    return sales&&typeof sales==='object'?sales:{turns:[]};
  }catch{
    return {turns:[]};
  }
}

async function saveConversationMemory(env,sessionId,memory){
  const row=await env.DB.prepare(
    'SELECT memory_json FROM ai_conversation_memory WHERE session_id=?'
  ).bind(sessionId).first();
  let root={};
  try{root=row?.memory_json?JSON.parse(row.memory_json):{};}catch{root={};}
  root.travelSales=memory;
  await env.DB.prepare(`INSERT INTO ai_conversation_memory(session_id,memory_json,updated_at)
    VALUES(?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(session_id) DO UPDATE SET memory_json=excluded.memory_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(sessionId,JSON.stringify(root)).run();
}

function appendTurns(memory,message,reply){
  const turns=Array.isArray(memory?.turns)?memory.turns:[];
  return {
    ...memory,
    turns:[
      ...turns,
      {role:'user',text:str(message,1200)},
      {role:'assistant',text:str(reply,2400)},
    ].slice(-20),
  };
}

async function ensureShopping(store,sessionId,locale,now){
  const id=shoppingSessionId(sessionId);
  const existing=await store.getShoppingSession(id);
  if(existing) return existing;
  const created=createShoppingSession({
    sessionId:id,
    intent:createInitialTravelIntent(locale),
    candidateOfferIds:[],
    now,
  });
  await store.createShoppingSession(created,{ownerSessionId:sessionId});
  return created;
}

export function createLoveTravelSalesOrchestrator({
  env,
  provider=createBokunProvider({
    fetchImpl:fetch,
    baseUrl:env.BOKUN_INTEGRATION_BASE_URL||'https://integration.viiversion.com',
  }),
  store=createTravelCommerceStore(env.DB),
  now=()=>new Date(),
}={}){
  const broker=createTravelCapabilityBroker({
    provider,
    now,
    bookingSessionExecutor:(transactionId,payload)=>executeBookingSession(env,transactionId,payload),
  });

  async function turn({sessionId,locale,message,context={}}={}){
    let shopping=await ensureShopping(store,sessionId,locale,now());

    const date=exactDate(shopping.intent);
    const productsPacket=await broker.execute('searchProducts',{
      start:date||undefined,
      end:date||undefined,
      lang:'EN',
      includePickupPlaces:true,
    },{principal:'ORCHESTRATOR'});

    const extracted=await extractConversationIntent({
      env,
      message,
      currentIntent:shopping.intent,
      locale,
      products:productsPacket.data,
      context,
      now:now(),
    });
    const merged=mergeIntentPatch(shopping.intent,{
      ...extracted.patch,
      locale,
    });

    if(JSON.stringify(merged)!==JSON.stringify(shopping.intent)){
      const next=setShoppingIntent(shopping,merged,{now:now()});
      await store.saveShoppingSession(shopping,next,{eventType:'SALES_INTENT_UPDATED'});
      shopping=next;
    }

    const evidence=[productsPacket];
    let offersPacket=null;
    if(exactDate(shopping.intent)&&partyKnown(shopping.intent)){
      const productIds=canonicalToProviderProducts(
        productsPacket,
        extracted.selectedProductId,
      );
      offersPacket=await broker.execute('searchOffers',{
        intent:shopping.intent,
        ...(productIds?{productIds}:{}),
        lang:'EN',
      },{principal:'ORCHESTRATOR'});
      evidence.push(offersPacket);

      const candidateIds=offersPacket.data
        .map(item=>item?.offer?.offerId)
        .filter(Boolean);
      const next=setShoppingCandidates(shopping,candidateIds,{now:now()});
      await store.saveShoppingSession(shopping,next,{eventType:'SALES_CANDIDATES_UPDATED'});
      shopping=next;
    }

    const plan=await composeGroundedSalesPlan({
      env,
      message,
      locale,
      intent:shopping.intent,
      evidence,
      goal:extracted.goal,
    });

    if(plan.selectedOfferId&&shopping.candidateOfferIds.includes(plan.selectedOfferId)
      &&shopping.selectedOfferId!==plan.selectedOfferId){
      const next=selectShoppingOffer(shopping,plan.selectedOfferId,{now:now()});
      await store.saveShoppingSession(shopping,next,{eventType:'SALES_OFFER_SELECTED'});
      shopping=next;
    }

    const memory=await loadConversationMemory(env,sessionId);
    await saveConversationMemory(env,sessionId,appendTurns(memory,message,plan.reply));

    return {
      reply:plan.reply,
      tourId:externalTourId(productsPacket,plan.recommendedProductId),
      faqIntent:String(extracted.goal||'GENERAL').toLowerCase(),
      source:plan.source,
      agent:{
        version:'travel-commerce-sales-v1',
        intentSource:extracted.source,
        action:plan.action,
        nextQuestionCode:plan.nextQuestionCode,
        recommendedProductId:plan.recommendedProductId,
        selectedOfferId:plan.selectedOfferId,
        evidenceRefs:plan.evidenceRefs,
        bookingRequested:extracted.bookingRequested,
        mutationExecuted:false,
      },
      shoppingSession:{
        id:shopping.sessionId,
        revision:shopping.revision,
        status:shopping.status,
        candidateOfferIds:shopping.candidateOfferIds,
        selectedOfferId:shopping.selectedOfferId||'',
      },
      intent:shopping.intent,
      offers:offersPacket
        ? offersPacket.data.filter(item=>item?.offer).map(item=>({
            productId:item.product?.productId||'',
            offer:item.offer,
            readyToBook:item.readyToBook,
            bookingDataIssues:item.bookingDataIssues,
          }))
        : [],
    };
  }

  return Object.freeze({turn,broker});
}

export async function handleLoveTravelSalesAgent(
  request,
  env,
  url=new URL(request.url),
){
  if(url.pathname!=='/api/ai/chat') return null;
  if(request.method!=='POST'){
    return json({ok:false,error:'method_not_allowed'},405,{allow:'POST'});
  }
  if(!env?.DB){
    return json({ok:false,error:'sales_runtime_unavailable'},503);
  }
  const body=await request.clone().json().catch(()=>null);
  const message=str(body?.message,1200);
  if(!body||!message){
    return json({ok:false,error:'message_required'},400);
  }

  const session=await ensureSalesSession(request,env);
  try{
    const orchestrator=createLoveTravelSalesOrchestrator({env});
    const result=await orchestrator.turn({
      sessionId:session.id,
      locale:localeFrom(request,body),
      message,
      context:body.context&&typeof body.context==='object'?body.context:{},
    });
    return withSalesSession(json({ok:true,...result}),session);
  }catch(error){
    console.error('LoveTravel Sales Orchestrator failed',error?.message||error);
    return withSalesSession(json({
      ok:false,
      error:'sales_orchestrator_unavailable',
    },502),session);
  }
}
