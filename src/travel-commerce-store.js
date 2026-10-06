import {
  ContractError,
  validateBookingTransaction,
  validateCommandReceipt,
  validateProviderEvidence,
  validateShoppingSession,
} from './travel-commerce-contracts.js';

const str=value=>String(value??'').trim();

export class CommerceStoreConflictError extends Error {
  constructor(message='Travel Commerce snapshot revision conflict'){
    super(message);
    this.name='CommerceStoreConflictError';
    this.code='stale_revision';
  }
}

export class CommerceStoreNotFoundError extends Error {
  constructor(resource,id){
    super(`${resource} not found: ${id}`);
    this.name='CommerceStoreNotFoundError';
    this.code='not_found';
    this.resource=resource;
    this.id=id;
  }
}

function dbOf(envOrDb){
  const db=envOrDb?.DB||envOrDb;
  if(!db||typeof db.prepare!=='function') throw new TypeError('D1 database binding is required');
  return db;
}

function json(value){
  return JSON.stringify(value);
}

function parseSnapshot(row,key='snapshot_json'){
  if(!row) return null;
  try{return JSON.parse(row[key]);}
  catch{throw new Error(`Invalid persisted JSON in ${key}`);}
}

function changes(result){
  return Number(result?.meta?.changes??result?.changes??0);
}

function eventTime(value){
  return String(value||new Date().toISOString());
}

function evidenceStatements(db,evidence=[]){
  return evidence.map(raw=>{
    const item=validateProviderEvidence(raw);
    return db.prepare(`INSERT INTO travel_provider_evidence(
      evidence_id,transaction_id,quote_id,fact_type,evidence_json,retrieved_at
    ) VALUES(?,?,?,?,?,?)
    ON CONFLICT(evidence_id) DO NOTHING`)
      .bind(
        item.evidenceId,
        item.transactionId||null,
        item.quoteId||null,
        item.factType,
        json(item),
        item.retrievedAt,
      );
  });
}

export function createTravelCommerceStore(envOrDb){
  const db=dbOf(envOrDb);

  async function getShoppingSession(sessionId){
    const row=await db.prepare(
      'SELECT snapshot_json FROM travel_shopping_sessions WHERE session_id=?'
    ).bind(str(sessionId)).first();
    return row?validateShoppingSession(parseSnapshot(row)):null;
  }

  async function createShoppingSession(session,{ownerSessionId=null,eventType='SHOPPING_SESSION_CREATED'}={}){
    const item=validateShoppingSession(session);
    const snapshot=json(item);
    const result=await db.batch([
      db.prepare(`INSERT INTO travel_shopping_sessions(
        session_id,owner_session_id,revision,status,snapshot_json,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?)`)
        .bind(item.sessionId,ownerSessionId,item.revision,item.status,snapshot,item.createdAt,item.updatedAt),
      db.prepare(`INSERT INTO travel_transaction_audit(
        transaction_id,shopping_session_id,command_id,event_type,revision_before,revision_after,snapshot_json,created_at
      ) VALUES(NULL,?,NULL,?,NULL,?,?,?)`)
        .bind(item.sessionId,eventType,item.revision,snapshot,item.updatedAt),
    ]);
    return {session:item,result};
  }

  async function saveShoppingSession(before,after,{eventType='SHOPPING_SESSION_UPDATED'}={}){
    const previous=validateShoppingSession(before);
    const next=validateShoppingSession(after);
    if(previous.sessionId!==next.sessionId){
      throw new ContractError('ShoppingSession',[{code:'session_mismatch',path:'sessionId',message:'ShoppingSession identity cannot change'}]);
    }
    if(next.revision!==previous.revision+1){
      throw new ContractError('ShoppingSession',[{code:'revision_step_required',path:'revision',message:'ShoppingSession revision must advance exactly by one'}]);
    }
    const snapshot=json(next);
    const results=await db.batch([
      db.prepare(`UPDATE travel_shopping_sessions
        SET revision=?,status=?,snapshot_json=?,updated_at=?
        WHERE session_id=? AND revision=?`)
        .bind(next.revision,next.status,snapshot,next.updatedAt,next.sessionId,previous.revision),
      db.prepare(`INSERT INTO travel_transaction_audit(
        transaction_id,shopping_session_id,command_id,event_type,revision_before,revision_after,snapshot_json,created_at
      )
      SELECT NULL,?,NULL,?,?,?,?,?
      WHERE (SELECT snapshot_json FROM travel_shopping_sessions WHERE session_id=?)=?`)
        .bind(
          next.sessionId,eventType,previous.revision,next.revision,snapshot,next.updatedAt,
          next.sessionId,snapshot,
        ),
    ]);
    if(changes(results?.[0])!==1) throw new CommerceStoreConflictError();
    return next;
  }

  async function getTransaction(transactionId){
    const row=await db.prepare(
      'SELECT snapshot_json FROM travel_booking_transactions WHERE transaction_id=?'
    ).bind(str(transactionId)).first();
    return row?validateBookingTransaction(parseSnapshot(row)):null;
  }

  async function requireTransaction(transactionId){
    const transaction=await getTransaction(transactionId);
    if(!transaction) throw new CommerceStoreNotFoundError('BookingTransaction',transactionId);
    return transaction;
  }

  async function createTransaction(transaction,{eventType='TRANSACTION_CREATED'}={}){
    const item=validateBookingTransaction(transaction);
    const snapshot=json(item);
    const result=await db.batch([
      db.prepare(`INSERT INTO travel_booking_transactions(
        transaction_id,shopping_session_id,revision,state,snapshot_json,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?)`)
        .bind(
          item.transactionId,item.shoppingSessionId||null,item.revision,item.state,
          snapshot,item.createdAt,item.updatedAt,
        ),
      db.prepare(`INSERT INTO travel_transaction_audit(
        transaction_id,shopping_session_id,command_id,event_type,revision_before,revision_after,snapshot_json,created_at
      ) VALUES(?,?,NULL,?,NULL,?,?,?)`)
        .bind(
          item.transactionId,item.shoppingSessionId||null,eventType,item.revision,snapshot,item.updatedAt,
        ),
    ]);
    return {transaction:item,result};
  }

  async function getReceiptByIdempotencyKey(idempotencyKey){
    const row=await db.prepare(
      'SELECT receipt_json FROM travel_command_receipts WHERE idempotency_key=?'
    ).bind(str(idempotencyKey)).first();
    return row?validateCommandReceipt(parseSnapshot(row,'receipt_json')):null;
  }

  async function getReceiptByCommandId(commandId){
    const row=await db.prepare(
      'SELECT receipt_json FROM travel_command_receipts WHERE command_id=?'
    ).bind(str(commandId)).first();
    return row?validateCommandReceipt(parseSnapshot(row,'receipt_json')):null;
  }

  async function commitCommand({
    before,
    after,
    receipt,
    evidence=[],
    eventType='COMMAND_APPLIED',
  }={}){
    const previous=validateBookingTransaction(before);
    const next=validateBookingTransaction(after);
    const commandReceipt=validateCommandReceipt(receipt);
    if(previous.transactionId!==next.transactionId||commandReceipt.transactionId!==previous.transactionId){
      throw new ContractError('BookingTransaction',[{code:'transaction_mismatch',path:'transactionId',message:'Command commit must target one transaction'}]);
    }
    if(commandReceipt.status!=='APPLIED'){
      throw new ContractError('CommandReceipt',[{code:'applied_receipt_required',path:'status',message:'commitCommand accepts only APPLIED receipts'}]);
    }
    if(next.revision!==previous.revision+1||commandReceipt.revisionBefore!==previous.revision||commandReceipt.revisionAfter!==next.revision){
      throw new ContractError('CommandReceipt',[{code:'revision_mismatch',path:'revisionAfter',message:'Receipt and transaction revisions must advance exactly once'}]);
    }

    const duplicate=await getReceiptByIdempotencyKey(
      // idempotency key is persisted from transaction mutation when available;
      // callers may also pass it explicitly through the private receipt metadata argument below.
      next.mutation?.commandId===commandReceipt.commandId
        ? next.mutation.idempotencyKey
        : commandReceipt.commandId
    );
    if(duplicate) return {transaction:previous,receipt:duplicate,replayed:true};

    const snapshot=json(next);
    const idempotencyKey=next.mutation?.commandId===commandReceipt.commandId
      ? next.mutation.idempotencyKey
      : commandReceipt.commandId;
    const statements=[
      db.prepare(`UPDATE travel_booking_transactions
        SET revision=?,state=?,shopping_session_id=?,snapshot_json=?,updated_at=?
        WHERE transaction_id=? AND revision=?`)
        .bind(
          next.revision,next.state,next.shoppingSessionId||null,snapshot,next.updatedAt,
          next.transactionId,previous.revision,
        ),
      db.prepare(`INSERT INTO travel_command_receipts(
        command_id,transaction_id,idempotency_key,receipt_json,created_at
      )
      SELECT ?,?,?,?,?
      WHERE (SELECT snapshot_json FROM travel_booking_transactions WHERE transaction_id=?)=?`)
        .bind(
          commandReceipt.commandId,next.transactionId,idempotencyKey,json(commandReceipt),commandReceipt.createdAt,
          next.transactionId,snapshot,
        ),
      db.prepare(`INSERT INTO travel_transaction_audit(
        transaction_id,shopping_session_id,command_id,event_type,revision_before,revision_after,snapshot_json,created_at
      )
      SELECT ?,?,?,?,?,?,?,?
      WHERE (SELECT snapshot_json FROM travel_booking_transactions WHERE transaction_id=?)=?`)
        .bind(
          next.transactionId,next.shoppingSessionId||null,commandReceipt.commandId,eventType,
          previous.revision,next.revision,snapshot,commandReceipt.createdAt,
          next.transactionId,snapshot,
        ),
      ...evidenceStatements(db,evidence),
    ];
    const results=await db.batch(statements);
    if(changes(results?.[0])!==1) throw new CommerceStoreConflictError();
    return {transaction:next,receipt:commandReceipt,replayed:false};
  }

  async function persistRejectedCommand({
    transaction,
    receipt,
    idempotencyKey,
    eventType='COMMAND_REJECTED',
  }={}){
    const current=validateBookingTransaction(transaction);
    const commandReceipt=validateCommandReceipt(receipt);
    if(commandReceipt.status!=='REJECTED'){
      throw new ContractError('CommandReceipt',[{code:'rejected_receipt_required',path:'status',message:'persistRejectedCommand requires REJECTED receipt'}]);
    }
    if(commandReceipt.revisionBefore!==current.revision||commandReceipt.revisionAfter!==current.revision){
      throw new ContractError('CommandReceipt',[{code:'revision_mismatch',path:'revisionAfter',message:'Rejected receipt cannot change transaction revision'}]);
    }
    const key=str(idempotencyKey)||commandReceipt.commandId;
    const existing=await getReceiptByIdempotencyKey(key);
    if(existing) return {transaction:current,receipt:existing,replayed:true};

    await db.batch([
      db.prepare(`INSERT INTO travel_command_receipts(
        command_id,transaction_id,idempotency_key,receipt_json,created_at
      ) VALUES(?,?,?,?,?)`)
        .bind(commandReceipt.commandId,current.transactionId,key,json(commandReceipt),commandReceipt.createdAt),
      db.prepare(`INSERT INTO travel_transaction_audit(
        transaction_id,shopping_session_id,command_id,event_type,revision_before,revision_after,snapshot_json,created_at
      ) VALUES(?,?,?,?,?,?,?,?)`)
        .bind(
          current.transactionId,current.shoppingSessionId||null,commandReceipt.commandId,eventType,
          current.revision,current.revision,json(current),commandReceipt.createdAt,
        ),
    ]);
    return {transaction:current,receipt:commandReceipt,replayed:false};
  }

  async function commitSystemTransition({
    before,
    after,
    evidence=[],
    eventType,
    createdAt,
  }={}){
    const previous=validateBookingTransaction(before);
    const next=validateBookingTransaction(after);
    if(previous.transactionId!==next.transactionId){
      throw new ContractError('BookingTransaction',[{code:'transaction_mismatch',path:'transactionId',message:'System transition cannot change transaction identity'}]);
    }
    if(next.revision!==previous.revision+1){
      throw new ContractError('BookingTransaction',[{code:'revision_step_required',path:'revision',message:'System transition revision must advance exactly by one'}]);
    }
    const snapshot=json(next);
    const at=eventTime(createdAt||next.updatedAt);
    const results=await db.batch([
      db.prepare(`UPDATE travel_booking_transactions
        SET revision=?,state=?,shopping_session_id=?,snapshot_json=?,updated_at=?
        WHERE transaction_id=? AND revision=?`)
        .bind(
          next.revision,next.state,next.shoppingSessionId||null,snapshot,next.updatedAt,
          next.transactionId,previous.revision,
        ),
      db.prepare(`INSERT INTO travel_transaction_audit(
        transaction_id,shopping_session_id,command_id,event_type,revision_before,revision_after,snapshot_json,created_at
      )
      SELECT ?,?,NULL,?,?,?,?,?
      WHERE (SELECT snapshot_json FROM travel_booking_transactions WHERE transaction_id=?)=?`)
        .bind(
          next.transactionId,next.shoppingSessionId||null,str(eventType)||'SYSTEM_TRANSITION',
          previous.revision,next.revision,snapshot,at,
          next.transactionId,snapshot,
        ),
      ...evidenceStatements(db,evidence),
    ]);
    if(changes(results?.[0])!==1) throw new CommerceStoreConflictError();
    return next;
  }

  async function putProviderEvidence(evidence){
    const items=(Array.isArray(evidence)?evidence:[evidence]).map(validateProviderEvidence);
    if(!items.length) return [];
    await db.batch(evidenceStatements(db,items));
    return items;
  }

  async function listAudit(transactionId){
    const result=await db.prepare(`SELECT id,command_id,event_type,revision_before,revision_after,snapshot_json,created_at
      FROM travel_transaction_audit WHERE transaction_id=? ORDER BY id ASC`)
      .bind(str(transactionId)).all();
    return (result?.results||[]).map(row=>({
      id:row.id,
      commandId:row.command_id||null,
      eventType:row.event_type,
      revisionBefore:row.revision_before,
      revisionAfter:row.revision_after,
      snapshot:parseSnapshot(row),
      createdAt:row.created_at,
    }));
  }

  return Object.freeze({
    getShoppingSession,
    createShoppingSession,
    saveShoppingSession,
    getTransaction,
    requireTransaction,
    createTransaction,
    getReceiptByIdempotencyKey,
    getReceiptByCommandId,
    commitCommand,
    persistRejectedCommand,
    commitSystemTransition,
    putProviderEvidence,
    listAudit,
  });
}
