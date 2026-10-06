import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTravelCommerceRuntimeSchema,
  handleTravelCommerceMigration,
  TRAVEL_COMMERCE_SCHEMA_VERSION,
} from '../src/travel-commerce-migration.js';

async function sha256Hex(value){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

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

test('Travel Commerce migration requires explicit one-time token hash',async()=>{
  const db=fakeDb();
  const response=await handleTravelCommerceMigration(
    new Request('https://lovetravel.viiversion.com/internal/travel-commerce/migrate',{method:'POST'}),
    {DB:db},
  );
  assert.equal(response.status,403);
  assert.equal((await response.json()).error,'migration_access_denied');
  assert.equal(db._batches(),0);
});

test('Travel Commerce migration creates the authoritative runtime schema through bound D1',async()=>{
  const token='migration-test-token';
  const db=fakeDb();
  const response=await handleTravelCommerceMigration(
    new Request('https://lovetravel.viiversion.com/internal/travel-commerce/migrate',{
      method:'POST',
      headers:{'x-viiversion-migration-token':token},
    }),
    {
      DB:db,
      LOVE_TRAVEL_MIGRATION_TOKEN_SHA256:await sha256Hex(token),
    },
  );
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.schemaVersion,TRAVEL_COMMERCE_SCHEMA_VERSION);
  assert.equal(db._batches(),1);
  const sql=db._prepared().map(item=>item.sql).join('\n');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS travel_shopping_sessions/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS travel_booking_transactions/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS travel_transaction_audit/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS travel_command_receipts/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS travel_provider_evidence/);
});
