import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BookingSession } from '../src/booking-session-do.js';

function fakeState(bound='txn-do'){
  const map=new Map(bound?[['transaction-id',bound]]:[]);
  return {
    storage:{
      async get(key){return map.get(key);},
      async put(key,value){map.set(key,value);},
    },
  };
}

test('BookingSession Durable Object serializes concurrent execute requests',async()=>{
  const session=new BookingSession(fakeState('txn-do'),{});
  let active=0;
  let maxActive=0;
  const order=[];
  session.perform=async body=>{
    active+=1;
    maxActive=Math.max(maxActive,active);
    order.push('start-'+body.sequence);
    await new Promise(resolveDelay=>setTimeout(resolveDelay,body.sequence===1?25:1));
    order.push('end-'+body.sequence);
    active-=1;
    return {sequence:body.sequence};
  };

  const call=sequence=>session.fetch(new Request('https://booking-session.internal/execute',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({transactionId:'txn-do',action:'GET',sequence}),
  }));

  const [one,two]=await Promise.all([call(1),call(2)]);
  assert.equal(one.status,200);
  assert.equal(two.status,200);
  assert.equal(maxActive,1);
  assert.deepEqual(order,['start-1','end-1','start-2','end-2']);
});

test('BookingSession identity is bound to exactly one BookingTransaction',async()=>{
  const session=new BookingSession(fakeState('txn-a'),{});
  assert.equal(await session.requireBound('txn-a'),'txn-a');
  await assert.rejects(
    ()=>session.requireBound('txn-b'),
    error=>error.code==='transaction_identity_mismatch',
  );
});

test('BookingSession rejects reserve even with a previously validated demo token',async()=>{
  const session=new BookingSession(fakeState('txn-a'),{});
  let seenToken='';
  session.runtime=()=>({
    async reserve(args){
      seenToken=args.demoToken;
      return {transaction:{transactionId:'txn-a'}};
    },
  });

  await assert.rejects(()=>session.perform({
    action:'RESERVE',
    transactionId:'txn-a',
    expectedRevision:3,
    quoteId:'quote-a',
    quoteRevision:1,
    demoToken:'validated-one-time-token',
  }),error=>error.code==='booking_mutations_disabled'&&error.status===423);
  assert.equal(seenToken,'');

  await assert.rejects(
    ()=>session.perform({
      action:'RESERVE',
      transactionId:'txn-a',
      expectedRevision:3,
      quoteId:'quote-a',
      quoteRevision:1,
    }),
    error=>error.code==='booking_mutations_disabled'&&error.status===423,
  );
});

test('Cloudflare configuration binds and migrates BookingSession Durable Object',async()=>{
  const root=resolve(import.meta.dirname,'..');
  const config=JSON.parse(await readFile(resolve(root,'wrangler.jsonc'),'utf8'));
  const worker=await readFile(resolve(root,'src/worker-r2.js'),'utf8');

  assert.deepEqual(config.durable_objects?.bindings,[
    {name:'BOOKING_SESSIONS',class_name:'BookingSession'},
  ]);
  assert.ok(config.migrations?.some(item=>
    item.tag==='v1-booking-session'
    && Array.isArray(item.new_sqlite_classes)
    && item.new_sqlite_classes.includes('BookingSession')
  ));
  assert.match(worker,/export \{ BookingSession \} from '\.\/booking-session-do\.js';/);
});
