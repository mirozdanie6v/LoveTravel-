import {
  bokunSelectionFromCanonicalSelection,
  createBokunProvider,
} from './bokun-provider.js';
import { localizeDomainFromCache } from './bokun-content-localization.js';
import { executeBookingSession } from './booking-session-client.js';
import { createTravelCapabilityBroker, evidenceEnvelope, pickupSelection, participantSelection } from './travel-capability-broker.js';
import {
  COMMERCIAL_GOALS,
  composeGroundedSalesPlan,
  createInitialTravelIntent,
  extractConversationIntent,
  mergeIntentPatch,
  pickupChangeRequested,
  partyCompositionQuestion,
  optionChoiceQuestion,
} from './travel-sales-intelligence.js';
import {
  createShoppingSession,
  selectShoppingOffer,
  setShoppingCandidates,
  setShoppingIntent,
} from './travel-commerce-transaction.js';
import { createTravelCommerceStore } from './travel-commerce-store.js';
import { ensureTravelCommerceRuntimeSchema } from './travel-commerce-migration.js';
import {
  ensureCommerceTransaction,
  ensureSalesSession,
  shoppingSessionIdForSalesSession,
  withSalesSession,
} from './travel-session.js';

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

function commercialPatch(patch={}){
  return ['dateConstraint','party','hotel','pickupPreference','selectedProductId','selectedOption']
    .some(key=>Object.prototype.hasOwnProperty.call(patch,key));
}

function trimPassengersForParticipants(passengers=[],participants={}){
  const remaining=Object.fromEntries(Object.entries(participants||{}).map(([key,value])=>[
    String(key),Math.max(0,Math.floor(Number(value)||0)),
  ]));
  const out=[];
  for(const passenger of Array.isArray(passengers)?passengers:[]){
    const id=String(passenger?.categoryId||'');
    if(!id||!remaining[id]) continue;
    out.push(structuredClone(passenger));
    remaining[id]-=1;
  }
  return out;
}

function correctedParticipants(domain,current,patch){
  const party={adults:patch.adults||0,children:(patch.childrenAges||[]).map(age=>({age})),infants:patch.infants||0};
  const mapped=participantSelection(domain,{party});
  const wanted=party.adults+party.children.length+party.infants;
  if(Object.values(mapped).reduce((sum,count)=>sum+count,0)!==wanted){
    throw new TypeError('participant_category_unavailable');
  }
  const changedRoles=new Set([
    ...(patch.adults!==undefined?['ADULT']:[]),
    ...(patch.childrenAges!==undefined?['CHILD']:[]),
    ...(patch.infants!==undefined?['INFANT']:[]),
  ]);
  const roles=new Map((domain.participants||[]).map(category=>[String(category.id),category.ticketCategory]));
  return {...Object.fromEntries(Object.entries(current).filter(([id])=>!changedRoles.has(roles.get(String(id))))),...mapped};
}

function mergeChatSelection(transaction,incoming){
  if(!transaction?.selection) return structuredClone(incoming);
  const current=bokunSelectionFromCanonicalSelection(transaction.selection);
  return {
    ...structuredClone(incoming),
    customer:structuredClone(current.customer||{}),
    answers:structuredClone(current.answers||{}),
    extras:structuredClone(current.extras||{}),
    passengers:trimPassengersForParticipants(current.passengers,incoming.participants),
    pickup:{
      ...(current.pickup||{}),
      ...(incoming.pickup||{}),
    },
    dropoff:{
      ...(current.dropoff||{}),
      ...(incoming.dropoff||{}),
    },
  };
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
  const id=shoppingSessionIdForSalesSession(sessionId);
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
    optionTitles:async (domain,requestedLocale='en')=>{
      if(requestedLocale==='en') return {};
      // Reuse the same cached names as the UI. This reads titles only; no model
      // generation or additional provider request is performed for localization.
      const localized=await localizeDomainFromCache({
        provider:domain.provider,experience:{id:domain.experience.id,title:domain.experience.title},
        rates:(domain.rates||[]).map(rate=>({id:rate.id,title:rate.title})),
      },{DB:env.DB},requestedLocale);
      return {_productTitle:localized.experience.title,...Object.fromEntries((localized.rates||[]).map(rate=>[String(rate.id),rate.title]))};
    },
    bookingSessionExecutor:(transactionId,payload)=>executeBookingSession(env,transactionId,payload),
  });

  async function turn({sessionId,locale,message,context={},history=[]}={}){
    await ensureTravelCommerceRuntimeSchema(env.DB);
    let shopping=await ensureShopping(store,sessionId,locale,now());
    const memory=await loadConversationMemory(env,sessionId);
    const conversation=memory.turns?.length?memory.turns:history;

    const date=exactDate(shopping.intent);
    const productsPacket=await broker.execute('searchProducts',{
      start:date||undefined,
      end:date||undefined,
      lang:'EN',
      locale,
      // Product discovery does not need the ~900-place pickup directory.
      // Load pickup places only once we have a concrete dated offer to resolve.
      includePickupPlaces:false,
    },{principal:'ORCHESTRATOR'});

    const activeTransaction=env.BOOKING_SESSIONS?await ensureCommerceTransaction(env,sessionId,{now:now(),locale}):null;
    const activeProviderId=activeTransaction?.selection?.productRef?.externalId;
    const activeProduct=productsPacket.data.find(row=>String(row.product.providerRef?.externalId)===String(activeProviderId||''));
    const activeAdultCount=activeTransaction?.selection
      ? (activeTransaction.selection.participants||[]).filter(item=>item.role==='ADULT').reduce((sum,item)=>sum+Number(item.count||0),0)
      : undefined;
    const activeParty=activeTransaction?.selection ? Object.fromEntries(['ADULT','CHILD','INFANT'].map(role=>[role,(activeTransaction.selection.participants||[]).filter(item=>item.role===role).reduce((sum,item)=>sum+Number(item.count||0),0)])) : null;
    if(activeTransaction?.selection){
      const current=activeTransaction.selection;
      const party={adults:activeParty.ADULT,infants:activeParty.INFANT};
      if(activeParty.CHILD===0)party.childrenAges=[];
      const projected=mergeIntentPatch(shopping.intent,{
        party,
        dateConstraint:current.date?{kind:'EXACT',exact:current.date}:null,
        ...(activeProduct&&current.rateRef?{selectedProductId:activeProduct.product.productId,selectedOption:{productId:activeProduct.product.productId,rateRef:current.rateRef}}:{}),
      });
      if(JSON.stringify(projected)!==JSON.stringify(shopping.intent)){
        const next=setShoppingIntent(shopping,projected,{now:now()});
        await store.saveShoppingSession(shopping,next,{eventType:'CANONICAL_SELECTION_PROJECTED'});shopping=next;
      }
    }
    const extracted=await extractConversationIntent({
      env,
      message,
      currentIntent:activeParty && activeParty.CHILD!==shopping.intent.party.children.length ? {...shopping.intent,party:{...shopping.intent.party,children:[]}} : shopping.intent,
      locale,
      products:productsPacket.data,
      context:{...context,CURRENT_SELECTION:activeParty?{partyCounts:activeParty,date:activeTransaction.selection.date,rateRef:activeTransaction.selection.rateRef}:null,currentAdultCount:activeAdultCount,currentProductId:activeProduct?.product.productId||memory.productFocus||'',commercialGoal:memory.commercialGoal||((shopping.intent.optionPreference||activeTransaction?.selection)?'BOOK':null),nextQuestionCode:memory.nextQuestionCode||'',pendingPartyTotal:memory.pendingPartyTotal||null,optionList:memory.optionList||[],...(activeProduct?{currentOption:activeTransaction.selection.rateRef}:{})},
      history:conversation,
      now:now(),
    });
    const readOnlyQuestion=['DETAILS','COMPARE','PICKUP'].includes(extracted.goal);
    const intentPatch={...extracted.patch};
    const pickupOnlyChange=extracted.goal==='GENERAL'&&pickupChangeRequested(message)&&Boolean(intentPatch.hotel)
      &&!['dateConstraint','party','selectedProductId','selectedOption'].some(key=>Object.prototype.hasOwnProperty.call(extracted.explicitPatch||{},key));
    if(pickupOnlyChange){for(const key of ['dateConstraint','party','selectedProductId','selectedOption','preferenceAdds','preferenceRemoves'])delete intentPatch[key];}
    if(readOnlyQuestion){
      for(const key of ['dateConstraint','party','hotel','pickupPreference','selectedProductId','selectedOption','bookingRequested']) delete intentPatch[key];
    }
    const merged=mergeIntentPatch(shopping.intent,{
      ...intentPatch,
      locale,
    });

    if(JSON.stringify(merged)!==JSON.stringify(shopping.intent)){
      const next=setShoppingIntent(shopping,merged,{now:now()});
      await store.saveShoppingSession(shopping,next,{eventType:'SALES_INTENT_UPDATED'});
      shopping=next;
    }

    const evidence=[productsPacket];
    let offersPacket=null;
    let bookingTransaction=null;
    let bookingSelection=null;
    let canonicalScopeUsed=false;
    const currentQuoteRequest=COMMERCIAL_GOALS.includes(extracted.goal)&&!commercialPatch(extracted.explicitPatch||{});
    const canonicalCorrection=!readOnlyQuestion&&!currentQuoteRequest&&activeProduct&&commercialPatch(intentPatch)
      &&(!intentPatch.selectedProductId||intentPatch.selectedProductId===activeProduct.product.productId);
    if((pickupOnlyChange||currentQuoteRequest||canonicalCorrection)&&env.BOOKING_SESSIONS){
      const currentTx=activeTransaction;
      if(currentTx.selection&&!['RESERVING','FAILED_NEEDS_RECONCILIATION','CONFIRMED','ABANDONED'].includes(currentTx.state)){
        const current=bokunSelectionFromCanonicalSelection(currentTx.selection);
        let incoming=current;
        if(canonicalCorrection||pickupOnlyChange){
          const nextDate=intentPatch.dateConstraint?.kind==='EXACT'?intentPatch.dateConstraint.exact:current.date;
          incoming={...current,date:nextDate,...(intentPatch.selectedOption?{rateId:String(intentPatch.selectedOption.rateRef.externalId)}:{})};
          const needsDomain=nextDate!==current.date||intentPatch.party||intentPatch.hotel||intentPatch.pickupPreference;
          if(needsDomain){
            const [domain]=await provider.getDomains({productIds:[current.productId],start:nextDate,end:nextDate,lang:'EN',includePickupPlaces:Boolean(intentPatch.hotel||intentPatch.pickupPreference==='PICKUP')});
            if(nextDate!==current.date){
              const slot=(domain.availabilitySlots||[]).find(slot=>slot.date===nextDate&&String(slot.startTimeId)===String(current.startTimeId));
              delete incoming.slotId;
              if(slot?.id)incoming.slotId=String(slot.id);
            }
            if(intentPatch.party){
              incoming.participants=correctedParticipants(domain,current.participants||{},intentPatch.party);
              incoming.passengers=trimPassengersForParticipants(current.passengers,incoming.participants);
            }
            if(intentPatch.hotel||intentPatch.pickupPreference){
              const {placeId:oldPlace,customLocation:oldAddress,mode:oldMode,...pickupDetails}=current.pickup||{};
              incoming.pickup={...pickupDetails,...pickupSelection(domain,{hotel:intentPatch.hotel,pickupPreference:intentPatch.pickupPreference||'PICKUP'})};
            }
          }
        }
        const freshQuote=currentTx.quote?.status==='ACTIVE'&&Date.parse(currentTx.quote.expiresAt)>now().getTime();
        if(currentQuoteRequest&&freshQuote&&!canonicalCorrection&&!pickupOnlyChange){
          bookingTransaction=currentTx;
          bookingSelection=current;
        }else{
          const synced=await executeBookingSession(env,currentTx.transactionId,{action:'SYNC_SELECTION',expectedRevision:currentTx.revision,selection:incoming});
          bookingTransaction=synced.transaction;
          bookingSelection=synced.resolution?.selection||bokunSelectionFromCanonicalSelection(bookingTransaction.selection);
        }
        canonicalScopeUsed=true;
        const quote=bookingTransaction.quote;
        const product=productsPacket.data.find(row=>row.product.productId===quote?.offer?.productId)?.product;
        if(quote?.offer&&product){
          // Only commercial evidence goes to the model; the complete selection
          // remains in the authoritative transaction and in the user's UI response.
          offersPacket=await evidenceEnvelope('getOfferDetails',{transactionId:currentTx.transactionId,revision:bookingTransaction.revision},{
            product,offer:quote.offer,readyToQuote:true,readyToBook:Boolean(quote.readyToBook),
            option:activeProduct?.facts?.options.find(option=>String(option.rateRef.externalId)===String(quote.offer.rateRef?.externalId))||null,
            bookingDataIssues:structuredClone(quote.issues?.bookingDataIssues||[]),
          },now());
        }
      }
    }
    const offersRequested=COMMERCIAL_GOALS.includes(extracted.goal)||(['DISCOVER','GENERAL'].includes(extracted.goal)&&commercialPatch(intentPatch));
    if(!canonicalScopeUsed&&offersRequested&&exactDate(shopping.intent)&&partyKnown(shopping.intent)){
      const productIds=canonicalToProviderProducts(
        productsPacket,
        shopping.intent.optionPreference?.productId||extracted.selectedProductId||memory.productFocus,
      );
      offersPacket=await broker.execute('searchOffers',{
        intent:shopping.intent,
        ...(productIds?{productIds}:{}),
        lang:'EN',
      },{principal:'ORCHESTRATOR'});
    }
    const offeredRows=offersPacket?(Array.isArray(offersPacket.data)?offersPacket.data:[offersPacket.data]):[];
    if(offersPacket){
      evidence.push(offersPacket);

      const candidateIds=offeredRows
        .map(item=>item?.offer?.offerId)
        .filter(Boolean);
      const next=setShoppingCandidates(shopping,candidateIds,{now:now()});
      await store.saveShoppingSession(shopping,next,{eventType:'SALES_CANDIDATES_UPDATED'});
      shopping=next;
    }

    const plan=extracted.optionChoiceUnavailable?{
      reply:optionChoiceQuestion(locale),recommendedProductId:'',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'OPTION',evidenceRefs:[productsPacket.evidenceId],source:'booking-continuation',degraded:false,
    }:extracted.pendingPartyTotal?{
      reply:partyCompositionQuestion(locale,extracted.pendingPartyTotal),recommendedProductId:extracted.selectedProductId||memory.productFocus||'',selectedOfferId:'',action:'ASK_PARTY',nextQuestionCode:'PARTY',evidenceRefs:[productsPacket.evidenceId],source:'booking-continuation',degraded:false,
    }:await composeGroundedSalesPlan({
      env,
      message,
      locale,
      intent:shopping.intent,
      evidence,
      currentSelection:(bookingTransaction||activeTransaction)?.selection ? {date:(bookingTransaction||activeTransaction).selection.date,rateRef:(bookingTransaction||activeTransaction).selection.rateRef,participants:(bookingTransaction||activeTransaction).selection.participants.map(({role,count})=>({role,count}))} : null,
      goal:extracted.goal,
      history:conversation,
    });

    if(plan.selectedOfferId&&shopping.candidateOfferIds.includes(plan.selectedOfferId)
      &&shopping.selectedOfferId!==plan.selectedOfferId){
      const next=selectShoppingOffer(shopping,plan.selectedOfferId,{now:now()});
      await store.saveShoppingSession(shopping,next,{eventType:'SALES_OFFER_SELECTED'});
      shopping=next;
    }

    const selectedRow=offeredRows.find(item=>item?.offer?.offerId===plan.selectedOfferId)||null;
    if(!bookingTransaction&&selectedRow?.selection&&plan.selectedOfferId){
      try{
        let currentTx=await ensureCommerceTransaction(env,sessionId,{now:now()});
        const needsSync=
          !currentTx.selection
          ||currentTx.selectedOfferId!==plan.selectedOfferId
          ||commercialPatch(extracted.patch);
        if(needsSync&&!['RESERVING','FAILED_NEEDS_RECONCILIATION','CONFIRMED','ABANDONED'].includes(currentTx.state)){
          const synced=await executeBookingSession(env,currentTx.transactionId,{
            action:'SYNC_SELECTION',
            expectedRevision:currentTx.revision,
            selection:mergeChatSelection(currentTx,selectedRow.selection),
          });
          currentTx=synced.transaction;
          bookingSelection=synced.resolution?.selection||selectedRow.selection;
        }else if(currentTx.selection){
          bookingSelection=bokunSelectionFromCanonicalSelection(currentTx.selection);
        }
        bookingTransaction=currentTx;
      }catch(error){
        console.warn('Sales transaction handoff unavailable',error?.message||error);
      }
    }

    const nextMemory=appendTurns(memory,message,plan.reply);
    if(COMMERCIAL_GOALS.includes(extracted.goal))nextMemory.commercialGoal=extracted.goal;
    if(extracted.selectedProductId)nextMemory.productFocus=extracted.selectedProductId;
    if(plan.nextQuestionCode||!readOnlyQuestion)nextMemory.nextQuestionCode=plan.nextQuestionCode||'';
    if(extracted.pendingPartyTotal)nextMemory.pendingPartyTotal=extracted.pendingPartyTotal;
    if(intentPatch.party?.adults!==undefined||intentPatch.party===null)delete nextMemory.pendingPartyTotal;
    if(plan.source==='provider-catalog-options'){
      nextMemory.nextQuestionCode='OPTION';nextMemory.optionList=[];
    }
    if(plan.source==='provider-catalog-options'&&plan.recommendedProductId){
      nextMemory.productFocus=plan.recommendedProductId;
      nextMemory.nextQuestionCode='OPTION';
      nextMemory.optionList=productsPacket.data.find(row=>row.product.productId===plan.recommendedProductId)?.facts?.options.map(option=>({productId:plan.recommendedProductId,rateRef:option.rateRef}))||[];
    }
    await saveConversationMemory(env,sessionId,nextMemory);

    return {
      reply:plan.reply,
      degraded:Boolean(plan.degraded),
      tourId:externalTourId(productsPacket,plan.recommendedProductId),
      faqIntent:String(extracted.goal||'GENERAL').toLowerCase(),
      source:plan.source,
      agent:{
        version:'travel-commerce-sales-v1',
        intentSource:extracted.source,
        intentFailureReason:extracted.intentFailureReason||null,
        replyFailureReason:plan.replyFailureReason||null,
        replyAttempts:plan.replyAttempts||0,
        replyFailureReasons:plan.replyFailureReasons||[],
        action:plan.action,
        nextQuestionCode:plan.nextQuestionCode,
        recommendedProductId:plan.recommendedProductId,
        selectedOfferId:plan.selectedOfferId,
        evidenceRefs:plan.evidenceRefs,
        bookingRequested:extracted.bookingRequested,
        mutationExecuted:false,
      },
      transaction:bookingTransaction ? {
        transactionId:bookingTransaction.transactionId,
        revision:bookingTransaction.revision,
        state:bookingTransaction.state,
        selectedOfferId:bookingTransaction.selectedOfferId||'',
        quote:bookingTransaction.quote||null,
        draft:bookingTransaction.draft||null,
      } : null,
      bookingSelection,
      partyCounts:(bookingTransaction||activeTransaction)?.selection ? Object.fromEntries(['ADULT','CHILD','INFANT'].map(role=>[role,((bookingTransaction||activeTransaction).selection.participants||[]).filter(item=>item.role===role).reduce((sum,item)=>sum+Number(item.count||0),0)])) : null,
      shoppingSession:{
        id:shopping.sessionId,
        revision:shopping.revision,
        status:shopping.status,
        candidateOfferIds:shopping.candidateOfferIds,
        selectedOfferId:shopping.selectedOfferId||'',
      },
      intent:shopping.intent,
      offers:offersPacket
        ? offeredRows.filter(item=>item?.offer).map(item=>({
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
      history:Array.isArray(body.history)?body.history:[],
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
