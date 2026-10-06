import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTravelCommerceRuntimeSchema,
  ensureTravelCommerceRuntimeSchema,
  TRAVEL_COMMERCE_SCHEMA_VERSION,
} from '../src/travel-commerce-migration.js';

function fakeDb(){
  const prepared=[];
  let batches=0;
  return {
    prepare(sql){
      const statement={sql:String(sql)};
      prepared.push(statement);
      return statement;
    },
    async batch(statements){
      batches+=1;
      assert.equal(statements.length,prepared.length);
      return statements.map(()=>({success:true}));
    },
    _prepared(){return [...prepared];},
    _batches(){return batches;},
  };
}

test('Travel Commerce schema bootstrap creates the authoritative runtime tables through bound D1',async()=>{
  const db=fakeDb();
  const result=await applyTravelCommerceRuntimeSchema(db);
  assert.equal(result.schemaVersion,TRAVEL_COMMERCE_SCHEMA_VERSION);
  assert.equal(db._batches(),1);
  const sql=db._prepared().map(item=>item.sql).join('\n');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS travel_shopping_sessions/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS travel_booking_transactions/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS travel_transaction_audit/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS travel_command_receipts/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS travel_provider_evidence/);
});

test('Travel Commerce schema bootstrap runs once per D1 binding in a Worker isolate',async()=>{
  const db=fakeDb();
  const first=await ensureTravelCommerceRuntimeSchema(db);
  const second=await ensureTravelCommerceRuntimeSchema(db);
  assert.equal(first.schemaVersion,TRAVEL_COMMERCE_SCHEMA_VERSION);
  assert.equal(second.schemaVersion,TRAVEL_COMMERCE_SCHEMA_VERSION);
  assert.equal(db._batches(),1);
});
