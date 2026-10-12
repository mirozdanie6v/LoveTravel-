import test from 'node:test';
import assert from 'node:assert/strict';
import {startBookingUiHarness} from './helpers/booking-ui-harness.mjs';
import {configurationDomains} from './fixtures/booking-configurator-domains.mjs';
import {ensureSalesSession} from '../src/travel-session.js';
import {handleTravelConversationApi} from '../src/travel-conversation-api.js';
import {handleTravelTransactionApi} from '../src/travel-transaction-api.js';

const base='https://example.test';
const request=(path,cookie,init={})=>new Request(base+path,{...init,headers:{cookie,...init.headers}});

test('reload after deleting saved conversations authenticates the guest without reviving deleted scopes',async()=>{
 const h=await startBookingUiHarness(configurationDomains());
 try{
  // The previous session bootstrap also registered its default conversation.
  const old=await ensureSalesSession(request('/api/travel-commerce/session',h.fixtureCookie),h.env);
  const other=await ensureSalesSession(new Request(base+'/api/travel-commerce/session'),h.env);
  const otherBefore=await h.env.DB.prepare('SELECT revoked_at FROM travel_conversations WHERE session_id=?').bind(other.id).first();
  const deleted=await handleTravelConversationApi(request('/api/travel-commerce/conversation',h.fixtureCookie,{method:'POST',body:JSON.stringify({action:'DELETE_SAVED_DATA'})}),h.env);
  assert.equal(deleted.status,200);
  const before=h.sqlite.prepare('SELECT count(*) AS n FROM travel_conversations WHERE owner_hash=? AND revoked_at IS NULL').get(old.ownerHash).n;
  assert.equal(before,0);
  // A new tab/reload retains the HttpOnly guest cookie but runs bootstrap again.
  const reloaded=await handleTravelConversationApi(request('/api/travel-commerce/session',h.fixtureCookie),h.env);
  assert.equal(reloaded.status,200,await reloaded.clone().text());
  assert.deepEqual(await reloaded.json(),{ok:true});
  assert.ok(reloaded.headers.get('set-cookie').startsWith(h.fixtureCookie+';'));
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM travel_conversations WHERE owner_hash=? AND revoked_at IS NULL').get(old.ownerHash).n,0);
  await assert.rejects(()=>ensureSalesSession(request('/api/ai/chat',h.fixtureCookie,{headers:{'x-lt-conversation-id':old.conversationId}}),h.env),e=>e.status===410);
  const fresh=await handleTravelTransactionApi(request('/api/travel-commerce/transaction',h.fixtureCookie,{headers:{'x-lt-conversation-id':'fresh-after-reload-conversation-12345'}}),h.env);
  assert.equal(fresh.status,200);
  const state=await fresh.json();assert.equal(state.selection,null);assert.equal(state.providerBooking,null);
  const otherAfter=await h.env.DB.prepare('SELECT revoked_at FROM travel_conversations WHERE session_id=?').bind(other.id).first();
  assert.deepEqual(otherAfter,otherBefore);
  assert.equal(h.upstreamCalls(),0);
 }finally{await h.close();}
});

test('guest bootstrap still rejects cross-origin requests',async()=>{
 const h=await startBookingUiHarness(configurationDomains());
 try{
  const response=await handleTravelConversationApi(request('/api/travel-commerce/session',h.fixtureCookie,{headers:{origin:'https://attacker.test'}}),h.env);
  assert.equal(response.status,403);assert.equal((await response.json()).error,'conversation_origin_denied');
 }finally{await h.close();}
});