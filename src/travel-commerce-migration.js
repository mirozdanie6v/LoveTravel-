export const TRAVEL_COMMERCE_SCHEMA_VERSION='0008_travel_commerce_runtime';

const STATEMENTS=Object.freeze([
  `CREATE TABLE IF NOT EXISTS travel_shopping_sessions (
    session_id TEXT PRIMARY KEY,
    owner_session_id TEXT,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    status TEXT NOT NULL CHECK (status IN ('ACTIVE','COMPLETED','ABANDONED')),
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_session_id) REFERENCES sessions(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_travel_shopping_sessions_owner
    ON travel_shopping_sessions(owner_session_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS travel_booking_transactions (
    transaction_id TEXT PRIMARY KEY,
    shopping_session_id TEXT,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    state TEXT NOT NULL CHECK (state IN (
      'SHOPPING','OFFER_SELECTED','QUOTED','COLLECTING_REQUIRED_DATA',
      'READY_FOR_APPROVAL','USER_APPROVED','RESERVING','CONFIRMED',
      'FAILED_NEEDS_RECONCILIATION','ABANDONED'
    )),
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (shopping_session_id) REFERENCES travel_shopping_sessions(session_id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_travel_booking_transactions_session
    ON travel_booking_transactions(shopping_session_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_travel_booking_transactions_state
    ON travel_booking_transactions(state, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS travel_transaction_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT,
    shopping_session_id TEXT,
    command_id TEXT,
    event_type TEXT NOT NULL,
    revision_before INTEGER,
    revision_after INTEGER,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES travel_booking_transactions(transaction_id) ON DELETE SET NULL,
    FOREIGN KEY (shopping_session_id) REFERENCES travel_shopping_sessions(session_id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_travel_transaction_audit_tx
    ON travel_transaction_audit(transaction_id, id)`,
  `CREATE INDEX IF NOT EXISTS idx_travel_transaction_audit_session
    ON travel_transaction_audit(shopping_session_id, id)`,
  `CREATE TABLE IF NOT EXISTS travel_command_receipts (
    command_id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    receipt_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES travel_booking_transactions(transaction_id) ON DELETE RESTRICT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_travel_command_receipts_tx
    ON travel_command_receipts(transaction_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS travel_provider_evidence (
    evidence_id TEXT PRIMARY KEY,
    transaction_id TEXT,
    quote_id TEXT,
    fact_type TEXT NOT NULL,
    evidence_json TEXT NOT NULL,
    retrieved_at TEXT NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES travel_booking_transactions(transaction_id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_travel_provider_evidence_tx
    ON travel_provider_evidence(transaction_id, retrieved_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_travel_provider_evidence_quote
    ON travel_provider_evidence(quote_id, retrieved_at DESC)`,
]);

const readiness=new WeakMap();

export async function applyTravelCommerceRuntimeSchema(db){
  if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function'){
    throw new TypeError('D1 database binding is required');
  }
  const statements=STATEMENTS.map(sql=>db.prepare(sql));
  await db.batch(statements);
  return {
    schemaVersion:TRAVEL_COMMERCE_SCHEMA_VERSION,
    statementCount:STATEMENTS.length,
  };
}

export async function ensureTravelCommerceRuntimeSchema(db){
  if(!db||typeof db!=='object'){
    throw new TypeError('D1 database binding is required');
  }
  const existing=readiness.get(db);
  if(existing) return existing;
  const pending=applyTravelCommerceRuntimeSchema(db).catch(error=>{
    readiness.delete(db);
    throw error;
  });
  readiness.set(db,pending);
  return pending;
}
