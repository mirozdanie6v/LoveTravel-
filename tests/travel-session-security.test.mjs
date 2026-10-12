import test from 'node:test';
import assert from 'node:assert/strict';
import {startBookingUiHarness} from './helpers/booking-ui-harness.mjs';
import {configurationDomains} from './fixtures/booking-configurator-domains.mjs';
import {ensureSalesSession,withSalesSession,ensureCommerceTransaction} from '../src/travel-session.js';
import {executeConversationOperation} from '../src/booking-session-client.js';
import {cleanupExpiredConversations} from '../src/travel-conversation-state.js';
import {quoteDisplayBinding} from '../src/travel-commerce-quote.js';

const request=(cookie,id='shared-client-conversation-12345')=>new Request('https://example.test/api/ai/chat',{
  headers:{...(cookie?{cookie}:{}),'x-lt-conversation-id':id},
});
const cookie=session=>'__Host-lt_guest='+session.token;

test('knowing a conversation ID, internal session ID or old cookie cannot access another guest',async()=>{
  const h=await startBookingUiHarness(configurationDomains());
  try{
    const a=await ensureSalesSession(request(),h.env),b=await ensureSalesSession(request(),h.env);
    assert.notEqual(a.id,b.id);assert.notEqual(a.ownerHash,b.ownerHash);
    assert.equal((await ensureSalesSession(request(cookie(a)),h.env)).id,a.id);
    const stolen=await ensureSalesSession(request(cookie(b),a.id),h.env);
    assert.notEqual(stolen.id,a.id);
    const legacy=await ensureSalesSession(request('lt_sales_sid='+a.id),h.env);
    assert.notEqual(legacy.id,a.id);
    const response=withSalesSession(new Response('{}'),a);
    assert.match(response.headers.get('set-cookie'),/^__Host-lt_guest=.*HttpOnly; Secure; SameSite=Lax/);
    assert.ok(!a.id.includes(a.token));
    await assert.rejects(()=>executeConversationOperation(h.env,{id:a.id,ownerHash:b.ownerHash},{action:'TRANSACTION',method:'GET'}),e=>e.status===403);
    await assert.rejects(()=>ensureSalesSession(new Request('https://example.test/api/ai/chat',{
      headers:{cookie:cookie(a),origin:'https://attacker.test'},
    }),h.env),e=>e.status===403);
  }finally{await h.close();}
});

test('parallel chat turns and form reads share the guest queue and preserve both messages',async()=>{
  const h=await startBookingUiHarness(configurationDomains());
  try{
    const a=await ensureSalesSession(request(),h.env);
    const object=h.env.BOOKING_SESSIONS.get('guest-'+a.ownerHash),perform=object.performConversation.bind(object);
    let active=0,max=0;
    object.performConversation=async body=>{
      active++;max=Math.max(max,active);
      try{await new Promise(r=>setTimeout(r,10));return await perform(body);}finally{active--;}
    };
    const turn=message=>executeConversationOperation(h.env,a,{action:'TURN',locale:'en',message});
    const results=await Promise.all([turn('What is included in Robinson?'),
      executeConversationOperation(h.env,a,{action:'TRANSACTION',method:'GET'}),turn('What is included in Hon Mun?')]);
    assert.ok(results.every(r=>r.ok));assert.equal(max,1);
    const memory=JSON.parse((await h.env.DB.prepare('SELECT memory_json FROM ai_conversation_memory WHERE session_id=?').bind(a.id).first()).memory_json);
    assert.deepEqual(memory.travelSales.turns.filter(t=>t.role==='user').map(t=>t.text),['What is included in Robinson?','What is included in Hon Mun?']);
  }finally{await h.close();}
});

test('deletion removes own drafts and chat, preserves other guests and rejects queued old turns',async()=>{
  const h=await startBookingUiHarness(configurationDomains());
  try{
    const a=await ensureSalesSession(request(),h.env),b=await ensureSalesSession(request(),h.env);
    for(const session of [a,b]){
      await executeConversationOperation(h.env,session,{action:'TURN',locale:'en',message:'What is included in Robinson?'});
    }
    const deletion=executeConversationOperation(h.env,a,{action:'DELETE_SAVED_DATA'});
    const late=executeConversationOperation(h.env,a,{action:'TURN',locale:'en',message:'What is included?'});
    const settled=await Promise.allSettled([deletion,late]);
    assert.equal(settled[0].value.deleted,1);assert.equal(settled[1].reason.status,410);
    assert.equal(await h.env.DB.prepare('SELECT memory_json FROM ai_conversation_memory WHERE session_id=?').bind(a.id).first(),null);
    assert.equal(await h.env.DB.prepare('SELECT snapshot_json FROM travel_booking_transactions WHERE transaction_id=?').bind('txn-'+a.id).first(),null);
    assert.ok(await h.env.DB.prepare('SELECT memory_json FROM ai_conversation_memory WHERE session_id=?').bind(b.id).first());
    await assert.rejects(()=>ensureSalesSession(request(cookie(a)),h.env),e=>e.status===410);
    const fresh=await ensureSalesSession(request(cookie(a),'fresh-client-conversation-12345'),h.env);
    assert.notEqual(fresh.id,a.id);assert.equal(fresh.ownerHash,a.ownerHash);
  }finally{await h.close();}
});

test('scheduled retention removes old dialogue and draft records while retaining active scopes',async()=>{
  const h=await startBookingUiHarness(configurationDomains());
  try{
    const a=await ensureSalesSession(request(),h.env),b=await ensureSalesSession(request(),h.env);
    for(const session of [a,b])await executeConversationOperation(h.env,session,{action:'TURN',locale:'en',message:'What is included in Robinson?'});
    await h.env.DB.prepare("UPDATE travel_conversations SET updated_at=datetime('now','-31 days') WHERE session_id=?").bind(a.id).run();
    await cleanupExpiredConversations(h.env);
    assert.equal(await h.env.DB.prepare('SELECT memory_json FROM ai_conversation_memory WHERE session_id=?').bind(a.id).first(),null);
    assert.ok(await h.env.DB.prepare('SELECT memory_json FROM ai_conversation_memory WHERE session_id=?').bind(b.id).first());
  }finally{await h.close();}
});

test('exact display price binds to the full selection, including extras and transport',async()=>{
  const domains=configurationDomains(),h=await startBookingUiHarness(domains);
  try{
    const session=await ensureSalesSession(request(),h.env);
    const initial=await executeConversationOperation(h.env,session,{action:'TRANSACTION',method:'GET'});
    const selection={productId:domains[0].experience.id,date:domains[0].availabilitySlots[0].date,rateId:'201',startTimeId:'301',
      participants:{101:2},pickup:{mode:'MEET_ON_LOCATION'},dropoff:{mode:'NO_DROPOFF'}};
    const result=await executeConversationOperation(h.env,session,{action:'TRANSACTION',method:'POST',body:{action:'SYNC_SELECTION',expectedRevision:initial.body.revision,selection}});
    assert.equal(result.status,200);assert.ok(result.body.quoteBinding);
    const actual=result.body.selection,tx=result.body.transaction;
    assert.equal(result.body.quoteBinding.selectionFingerprint,tx.quote.selectionFingerprint);
    for(const patch of [{extras:{701:1}},{date:'2026-10-20'},{rateId:'202'},
      {participants:{101:1}},{pickup:{mode:'PICKUP',placeId:'501'}}]){
      assert.equal(await quoteDisplayBinding(tx,{...actual,...patch}),null);
    }
  }finally{await h.close();}
});

test('retry after a lost response reuses the completed turn, while a reused request ID with different text is rejected',async()=>{
  const domains=configurationDomains();domains[0].experience.content.included='Lunch';
  const h=await startBookingUiHarness(domains);
  try{
    const session=await ensureSalesSession(request(),h.env);
    const operation={action:'TURN',locale:'en',message:'What is included in Robinson?',requestId:crypto.randomUUID()};
    const first=await executeConversationOperation(h.env,session,operation);
    const retried=await executeConversationOperation(h.env,session,operation);
    assert.deepEqual(retried,first);
    const memory=JSON.parse((await h.env.DB.prepare('SELECT memory_json FROM ai_conversation_memory WHERE session_id=?').bind(session.id).first()).memory_json);
    assert.equal(memory.travelSales.turns.length,2,'Retry must not append a second user/assistant pair');
    await assert.rejects(()=>executeConversationOperation(h.env,session,{...operation,message:'Another question'}),e=>e.status===409);
  }finally{await h.close();}
});

test('retention also removes old unsigned drafts and their audit snapshots, preserving provider-order records',async()=>{
  const h=await startBookingUiHarness(configurationDomains());
  try{
    const date=new Date(Date.now()-31*86400000);
    for(const id of ['legacy-draft-session-1234567890','legacy-order-session-1234567890']){
      await h.env.DB.prepare('INSERT INTO sessions(id) VALUES(?)').bind(id).run();
      await ensureCommerceTransaction(h.env,id,{now:date});
    }
    // Retention uses the persisted order-state column to protect business records.
    await h.env.DB.prepare("UPDATE travel_booking_transactions SET state='CONFIRMED' WHERE transaction_id=?").bind('txn-legacy-order-session-1234567890').run();
    await cleanupExpiredConversations(h.env);
    assert.equal(await h.env.DB.prepare('SELECT state FROM travel_booking_transactions WHERE transaction_id=?').bind('txn-legacy-draft-session-1234567890').first(),null);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS count FROM travel_transaction_audit WHERE shopping_session_id=?').get('shopping-legacy-draft-session-1234567890').count,0);
    assert.equal((await h.env.DB.prepare('SELECT state FROM travel_booking_transactions WHERE transaction_id=?').bind('txn-legacy-order-session-1234567890').first()).state,'CONFIRMED');
  }finally{await h.close();}
});
test('a grounded fallback after model failure is visible but cannot freeze the retry receipt',async()=>{
 const domains=configurationDomains();domains[0].experience.content.included='Lunch';
 let healthy=false,calls=0;
 const h=await startBookingUiHarness(domains,{AI:{async run(_model,input){
  calls++;
  if(!healthy)throw Object.assign(new Error('Controlled answer timeout'),{code:'ai_timeout'});
  if(input.messages[0].content.includes('Conversation Intelligence parser'))return {response:{intentPatch:{goal:'DETAILS',selectedProductId:'love-travel-robinson-island'}}};
  return {response:{reply:'Robinson includes lunch.',recommendedProductId:'love-travel-robinson-island',selectedOfferId:'',action:'GENERAL',nextQuestionCode:'',evidenceRefs:[]}};
 }}});
 try{
  const session=await ensureSalesSession(request(),h.env);
  const operation={action:'TURN',locale:'en',message:'What is included in Robinson?',requestId:crypto.randomUUID()};
  const first=await executeConversationOperation(h.env,session,operation);
  assert.equal(first.degraded,false);assert.match(first.reply,/Lunch/i);assert.equal(first.agent.replyFailureReason,'timeout');
  assert.equal(first.generationFailed,true);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM travel_conversation_requests').get().n,0);
  const before=calls;healthy=true;
  const retried=await executeConversationOperation(h.env,session,operation);
  assert.ok(calls>before);assert.equal(retried.generationFailed,false);assert.equal(retried.source,'workers-ai-grounded-sales');
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM travel_conversation_requests').get().n,1);
  assert.deepEqual(await executeConversationOperation(h.env,session,operation),retried);
  assert.equal(h.upstreamCalls(),0);
 }finally{await h.close();}
});