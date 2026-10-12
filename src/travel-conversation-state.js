// Guest credentials never appear in JSON responses or conversation IDs.
export const GUEST_COOKIE='__Host-lt_guest';
export const CONVERSATION_RETENTION_DAYS=30;
const schema=[
  `CREATE TABLE IF NOT EXISTS travel_guest_sessions (
    token_hash TEXT PRIMARY KEY, default_conversation_id TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS travel_conversations (
    session_id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, client_id TEXT NOT NULL,
    revoked_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE INDEX IF NOT EXISTS idx_travel_conversations_owner ON travel_conversations(owner_hash)',
  'CREATE INDEX IF NOT EXISTS idx_travel_conversations_age ON travel_conversations(updated_at)',
  `CREATE TABLE IF NOT EXISTS travel_conversation_requests (
    session_id TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
    response_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(session_id,request_id)
  )`,
];
const ready=new WeakMap();
export async function ensureConversationSchema(db){
  if(!ready.has(db))ready.set(db,db.batch(schema.map(sql=>db.prepare(sql))).catch(error=>{ready.delete(db);throw error;}));
  await ready.get(db);
}
export async function conversationHash(value){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function conversationError(code,status){
  return Object.assign(new Error(code),{code,status});
}
export async function requireOwnedConversation(env,{id,ownerHash}){
  const row=await env.DB.prepare('SELECT owner_hash,revoked_at FROM travel_conversations WHERE session_id=?').bind(id).first();
  if(!row||row.owner_hash!==ownerHash)throw conversationError('conversation_access_denied',403);
  if(row.revoked_at)throw conversationError('conversation_deleted',410);
}

// Called inside the guest Durable Object queue. Finished/provider-pending orders
// keep their business records; chat memory and access to the old scope are removed.
export async function deleteSavedConversations(env,ownerHash,{expiredOnly=false}={}){
  const rows=await env.DB.prepare(`SELECT session_id FROM travel_conversations
    WHERE owner_hash=? AND revoked_at IS NULL
    ${expiredOnly?"AND datetime(updated_at)<datetime('now','-30 days')":''}`)
    .bind(ownerHash).all();
  let deleted=0;
  for(const {session_id:id} of rows.results||[]){
    const txId='txn-'+id,shoppingId='shopping-'+id;
    const tx=await env.DB.prepare('SELECT state FROM travel_booking_transactions WHERE transaction_id=?').bind(txId).first();
    const protectedOrder=tx&&['CONFIRMED','RESERVING','FAILED_NEEDS_RECONCILIATION'].includes(tx.state);
    const statements=[
      env.DB.prepare('UPDATE travel_conversations SET revoked_at=CURRENT_TIMESTAMP WHERE session_id=?').bind(id),
      env.DB.prepare('DELETE FROM ai_conversation_memory WHERE session_id=?').bind(id),
      env.DB.prepare('DELETE FROM travel_conversation_requests WHERE session_id=?').bind(id),
    ];
    if(!protectedOrder){
      statements.push(
        env.DB.prepare('DELETE FROM travel_command_receipts WHERE transaction_id=?').bind(txId),
        env.DB.prepare('DELETE FROM travel_provider_evidence WHERE transaction_id=?').bind(txId),
        env.DB.prepare('DELETE FROM travel_transaction_audit WHERE transaction_id=? OR shopping_session_id=?').bind(txId,shoppingId),
        env.DB.prepare('DELETE FROM travel_booking_transactions WHERE transaction_id=?').bind(txId),
        env.DB.prepare('DELETE FROM travel_shopping_sessions WHERE session_id=?').bind(shoppingId),
      );
    }
    await env.DB.batch(statements);
    const stub=env.BOOKING_SESSIONS.get(env.BOOKING_SESSIONS.idFromName(txId));
    const purged=await stub.fetch(new Request('https://booking-session.internal/purge',{method:'POST'}));
    if(!purged.ok)throw conversationError('conversation_storage_cleanup_failed',502);
    deleted++;
  }
  return {deleted,retentionDays:CONVERSATION_RETENTION_DAYS};
}

export async function cleanupExpiredConversations(env){
  await ensureConversationSchema(env.DB);
  const rows=await env.DB.prepare(`SELECT DISTINCT owner_hash FROM travel_conversations
    WHERE revoked_at IS NULL AND datetime(updated_at)<datetime('now','-30 days') LIMIT 100`).all();
  for(const {owner_hash:ownerHash} of rows.results||[]){
    const stub=env.BOOKING_SESSIONS.get(env.BOOKING_SESSIONS.idFromName('guest-'+ownerHash));
    const response=await stub.fetch(new Request('https://booking-session.internal/conversation',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ownerHash,action:'DELETE_EXPIRED'}),
    }));
    if(!response.ok)throw conversationError('conversation_retention_cleanup_failed',502);
  }
  // Old unsigned scopes cannot be resumed after the ownership upgrade. Remove
  // their inactive drafts too; finished or unresolved provider orders stay intact.
  const legacy=await env.DB.prepare(`SELECT tx.transaction_id,tx.shopping_session_id
    FROM travel_booking_transactions tx
    LEFT JOIN travel_shopping_sessions shop ON shop.session_id=tx.shopping_session_id
    WHERE datetime(tx.updated_at)<datetime('now','-30 days')
      AND tx.state NOT IN ('CONFIRMED','RESERVING','FAILED_NEEDS_RECONCILIATION')
      AND NOT EXISTS (SELECT 1 FROM travel_conversations c WHERE c.session_id=shop.owner_session_id)
    LIMIT 100`).all();
  for(const row of legacy.results||[]){
    await env.DB.batch([
      env.DB.prepare('DELETE FROM travel_command_receipts WHERE transaction_id=?').bind(row.transaction_id),
      env.DB.prepare('DELETE FROM travel_provider_evidence WHERE transaction_id=?').bind(row.transaction_id),
      env.DB.prepare('DELETE FROM travel_transaction_audit WHERE transaction_id=?').bind(row.transaction_id),
      env.DB.prepare('DELETE FROM travel_booking_transactions WHERE transaction_id=?').bind(row.transaction_id),
      env.DB.prepare(`DELETE FROM travel_transaction_audit WHERE shopping_session_id=?
        AND NOT EXISTS (SELECT 1 FROM travel_booking_transactions WHERE shopping_session_id=?)`).bind(row.shopping_session_id,row.shopping_session_id),
      env.DB.prepare(`DELETE FROM travel_shopping_sessions WHERE session_id=?
        AND NOT EXISTS (SELECT 1 FROM travel_booking_transactions WHERE shopping_session_id=?)`).bind(row.shopping_session_id,row.shopping_session_id),
    ]);
    const stub=env.BOOKING_SESSIONS.get(env.BOOKING_SESSIONS.idFromName(row.transaction_id));
    const response=await stub.fetch(new Request('https://booking-session.internal/purge',{method:'POST'}));
    if(!response.ok)throw conversationError('legacy_draft_cleanup_failed',502);
  }
  // Tombstones contain no dialogue or passenger data, and prevent old requests
  // from recreating deleted scopes during the lifetime of the guest cookie.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM travel_conversations WHERE datetime(revoked_at)<datetime('now','-30 days')"),
    env.DB.prepare("DELETE FROM travel_guest_sessions WHERE datetime(updated_at)<datetime('now','-30 days')"),
    env.DB.prepare("DELETE FROM ai_conversation_memory WHERE datetime(updated_at)<datetime('now','-30 days')"),
    env.DB.prepare("DELETE FROM travel_conversation_requests WHERE datetime(updated_at)<datetime('now','-30 days')"),
  ]);
}
