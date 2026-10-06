import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  CONTRACT_SCHEMA_VERSIONS,
  ContractError,
} from '../src/travel-commerce-contracts.js';
import {
  createBookingTransaction,
  createShoppingSession,
  executeTransactionCommand,
  selectTransactionOffer,
  setShoppingIntent,
} from '../src/travel-commerce-transaction.js';
import {
  CommerceStoreConflictError,
  createTravelCommerceStore,
} from '../src/travel-commerce-store.js';

const root=resolve(import.meta.dirname,'..');
const at='2026-10-06T11:00:00.000Z';
const plus=min=>new Date(Date.parse(at)+min*60000);

function intent(destination='Nha Trang islands'){
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.TravelIntent,
    locale:'en',
    origin:'Nha Trang',
    destination,
    dateConstraint:{kind:'EXACT',exact:'2026-10-07'},
    party:{adults:2,children:[],infants:0},
    preferences:[{code:'SNORKELING',weight:1}],
    pickupPreference:'PICKUP',
    accessibility:[],
    specialRequests:[],
    freeTextNotes:'',
  };
}

function command(tx,offerId,idempotencyKey,commandId){
  return {
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.TransactionCommand,
    commandId,
    transactionId:tx.transactionId,
    expectedRevision:tx.revision,
    idempotencyKey,
    type:'SELECT_OFFER',
    issuedAt:tx.updatedAt,
    payload:{offerId},
  };
}

class Statement {
  constructor(db,sql,args=[]){
    this.db=db;
    this.sql=sql;
    this.args=args;
  }
  bind(...args){return new Statement(this.db,this.sql,args);}
  _stmt(){return this.db.prepare(this.sql);}
  _runSync(){
    const result=this._stmt().run(...this.args);
    return {meta:{changes:Number(result.changes||0),last_row_id:Number(result.lastInsertRowid||0)}};
  }
  async run(){return this._runSync();}
  async first(){return this._stmt().get(...this.args)||null;}
  async all(){return {results:this._stmt().all(...this.args)};}
}

class D1Adapter {
  constructor(db){this.db=db;}
  prepare(sql){return new Statement(this.db,sql);}
  async batch(statements){
    this.db.exec('BEGIN');
    try{
      const results=statements.map(statement=>statement._runSync());
      this.db.exec('COMMIT');
      return results;
    }catch(error){
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

async function database(){
  const db=new DatabaseSync(':memory:');
  const init=await readFile(resolve(root,'migrations/0001_init.sql'),'utf8');
  const commerce=await readFile(resolve(root,'migrations/0008_travel_commerce_runtime.sql'),'utf8');
  db.exec(init);
  db.exec(commerce);
  return {db,d1:new D1Adapter(db)};
}

test('migration creates dedicated authoritative commerce tables separate from AI conversation memory',async()=>{
  const {db}=await database();
  try{
    const rows=db.prepare(`SELECT name FROM sqlite_master
      WHERE type='table' AND name LIKE 'travel_%' ORDER BY name`).all();
    assert.deepEqual(rows.map(row=>row.name),[
      'travel_booking_transactions',
      'travel_command_receipts',
      'travel_provider_evidence',
      'travel_shopping_sessions',
      'travel_transaction_audit',
    ]);
    const txSql=db.prepare(`SELECT sql FROM sqlite_master WHERE name='travel_booking_transactions'`).get().sql;
    assert.doesNotMatch(txSql,/ai_conversation_memory/i);
  }finally{db.close();}
});

test('ShoppingSession canonical snapshot persists with optimistic revision',async()=>{
  const {db,d1}=await database();
  try{
    const store=createTravelCommerceStore(d1);
    const first=createShoppingSession({
      sessionId:'shopping-store-1',
      intent:intent(),
      now:new Date(at),
    });
    await store.createShoppingSession(first);

    const second=setShoppingIntent(first,intent('Hòn Mun'),{now:plus(1)});
    await store.saveShoppingSession(first,second);

    const loaded=await store.getShoppingSession(first.sessionId);
    assert.equal(loaded.revision,2);
    assert.equal(loaded.intent.destination,'Hòn Mun');

    const competing=setShoppingIntent(first,intent('Robinson'),{now:plus(2)});
    await assert.rejects(
      ()=>store.saveShoppingSession(first,competing),
      error=>error instanceof CommerceStoreConflictError&&error.code==='stale_revision',
    );
  }finally{db.close();}
});

test('accepted command is committed atomically with receipt and append-only audit',async()=>{
  const {db,d1}=await database();
  try{
    const store=createTravelCommerceStore(d1);
    const tx=createBookingTransaction({transactionId:'txn-store-1',now:new Date(at)});
    await store.createTransaction(tx);

    const cmd=command(tx,'offer-1','idem-select-1','cmd-select-1');
    const executed=executeTransactionCommand(tx,cmd,{now:plus(1)});
    assert.equal(executed.receipt.status,'APPLIED');

    const committed=await store.commitCommand({
      before:tx,
      after:executed.transaction,
      receipt:executed.receipt,
      idempotencyKey:cmd.idempotencyKey,
      eventType:'SELECT_OFFER_APPLIED',
    });
    assert.equal(committed.replayed,false);
    assert.equal(committed.transaction.revision,2);
    assert.equal(committed.transaction.state,'OFFER_SELECTED');

    const loaded=await store.requireTransaction(tx.transactionId);
    assert.equal(loaded.selectedOfferId,'offer-1');

    const receipt=await store.getReceiptByIdempotencyKey('idem-select-1');
    assert.equal(receipt.commandId,'cmd-select-1');

    const audit=await store.listAudit(tx.transactionId);
    assert.equal(audit.length,2);
    assert.deepEqual(audit.map(item=>item.eventType),['TRANSACTION_CREATED','SELECT_OFFER_APPLIED']);
    assert.deepEqual(audit.map(item=>item.revisionAfter),[1,2]);
  }finally{db.close();}
});

test('same idempotency key replays the persisted result instead of executing a second write',async()=>{
  const {db,d1}=await database();
  try{
    const store=createTravelCommerceStore(d1);
    const tx=createBookingTransaction({transactionId:'txn-replay',now:new Date(at)});
    await store.createTransaction(tx);

    const cmd=command(tx,'offer-1','idem-replay','cmd-replay');
    const executed=executeTransactionCommand(tx,cmd,{now:plus(1)});
    await store.commitCommand({
      before:tx,after:executed.transaction,receipt:executed.receipt,idempotencyKey:cmd.idempotencyKey,
    });

    const replay=await store.commitCommand({
      before:tx,after:executed.transaction,receipt:executed.receipt,idempotencyKey:cmd.idempotencyKey,
    });
    assert.equal(replay.replayed,true);
    assert.equal(replay.transaction.revision,2);
    assert.equal(replay.transaction.selectedOfferId,'offer-1');

    const count=db.prepare('SELECT COUNT(*) AS n FROM travel_command_receipts').get().n;
    assert.equal(Number(count),1);
  }finally{db.close();}
});

test('idempotency key cannot be rebound to a different command',async()=>{
  const {db,d1}=await database();
  try{
    const store=createTravelCommerceStore(d1);
    const tx=createBookingTransaction({transactionId:'txn-idem-collision',now:new Date(at)});
    await store.createTransaction(tx);

    const first=command(tx,'offer-1','same-key','cmd-one');
    const firstResult=executeTransactionCommand(tx,first,{now:plus(1)});
    await store.commitCommand({
      before:tx,after:firstResult.transaction,receipt:firstResult.receipt,idempotencyKey:first.idempotencyKey,
    });

    const second=command(tx,'offer-2','same-key','cmd-two');
    const secondResult=executeTransactionCommand(tx,second,{now:plus(1)});
    await assert.rejects(
      ()=>store.commitCommand({
        before:tx,after:secondResult.transaction,receipt:secondResult.receipt,idempotencyKey:second.idempotencyKey,
      }),
      error=>error instanceof ContractError&&error.issues.some(item=>item.code==='idempotency_key_reused'),
    );
  }finally{db.close();}
});

test('database optimistic lock rejects a competing stale transaction snapshot',async()=>{
  const {db,d1}=await database();
  try{
    const store=createTravelCommerceStore(d1);
    const tx=createBookingTransaction({transactionId:'txn-stale-db',now:new Date(at)});
    await store.createTransaction(tx);

    const first=command(tx,'offer-1','idem-one','cmd-one');
    const applied=executeTransactionCommand(tx,first,{now:plus(1)});
    await store.commitCommand({
      before:tx,after:applied.transaction,receipt:applied.receipt,idempotencyKey:first.idempotencyKey,
    });

    const competing=command(tx,'offer-2','idem-two','cmd-two');
    const competingResult=executeTransactionCommand(tx,competing,{now:plus(1)});
    await assert.rejects(
      ()=>store.commitCommand({
        before:tx,
        after:competingResult.transaction,
        receipt:competingResult.receipt,
        idempotencyKey:competing.idempotencyKey,
      }),
      error=>error instanceof CommerceStoreConflictError&&error.code==='stale_revision',
    );

    const current=await store.requireTransaction(tx.transactionId);
    assert.equal(current.revision,2);
    assert.equal(current.selectedOfferId,'offer-1');
    assert.equal(await store.getReceiptByIdempotencyKey('idem-two'),null);
  }finally{db.close();}
});

test('rejected stale command receipt persists without advancing transaction revision',async()=>{
  const {db,d1}=await database();
  try{
    const store=createTravelCommerceStore(d1);
    const initial=createBookingTransaction({transactionId:'txn-rejected',now:new Date(at)});
    await store.createTransaction(initial);
    const current=selectTransactionOffer(initial,'offer-1',{now:plus(1)});

    const appliedCommand=command(initial,'offer-1','first-key','cmd-first');
    const applied=executeTransactionCommand(initial,appliedCommand,{now:plus(1)});
    await store.commitCommand({
      before:initial,after:applied.transaction,receipt:applied.receipt,idempotencyKey:appliedCommand.idempotencyKey,
    });

    const staleCommand={
      ...command(current,'offer-2','stale-key','cmd-stale'),
      expectedRevision:1,
    };
    const rejected=executeTransactionCommand(current,staleCommand,{now:plus(2)});
    assert.equal(rejected.receipt.status,'REJECTED');
    await store.persistRejectedCommand({
      transaction:current,
      receipt:rejected.receipt,
      idempotencyKey:staleCommand.idempotencyKey,
    });

    const loaded=await store.requireTransaction(initial.transactionId);
    assert.equal(loaded.revision,2);
    const receipt=await store.getReceiptByIdempotencyKey('stale-key');
    assert.equal(receipt.status,'REJECTED');

    const audit=await store.listAudit(initial.transactionId);
    assert.equal(audit.at(-1).eventType,'COMMAND_REJECTED');
    assert.equal(audit.at(-1).revisionBefore,2);
    assert.equal(audit.at(-1).revisionAfter,2);
  }finally{db.close();}
});
