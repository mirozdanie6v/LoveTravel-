import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { BookingSession } from '../../src/booking-session-do.js';
import { createBokunProvider } from '../../src/bokun-provider.js';
import { projectBokunDomainToLegacyTour } from '../../src/bokun-adapter.js';
import { handleTravelTransactionApi } from '../../src/travel-transaction-api.js';
import { handleBlockedBookingRoute } from '../../src/booking-mutation-policy.js';

const root=resolve(import.meta.dirname,'../..');
class Statement {
  constructor(db,sql,args=[]){Object.assign(this,{db,sql,args});}
  bind(...args){return new Statement(this.db,this.sql,args);}
  async first(){return this.db.prepare(this.sql).get(...this.args)||null;}
  async all(){return {results:this.db.prepare(this.sql).all(...this.args)};}
  runSync(){const r=this.db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}};}
  async run(){return this.runSync();}
}

// Runs the production transaction API, Durable Object, store, resolver and
// Quote code. Only D1/DO hosting and provider input data are substituted.
export async function startBookingUiHarness(domains,{delayMs=0,presentationDomains=domains}={}){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(await readFile(resolve(root,'migrations/0001_init.sql'),'utf8'));
  sqlite.exec(await readFile(resolve(root,'migrations/0008_travel_commerce_runtime.sql'),'utf8'));
  const DB={
    prepare:sql=>new Statement(sqlite,sql),
    async batch(statements){
      sqlite.exec('BEGIN');
      try{const r=statements.map(s=>s.runSync());sqlite.exec('COMMIT');return r;}
      catch(e){sqlite.exec('ROLLBACK');throw e;}
    },
  };
  const sessions=new Map();
  const requests=[];
  let upstreamCalls=0;
  const provider=createBokunProvider({fetchImpl:async()=>{
    upstreamCalls+=1;
    throw new Error('Unexpected upstream request in configuration acceptance');
  }});
  const providerForFixture={...provider,async resolveOffer(options){
    if(delayMs) await new Promise(r=>setTimeout(r,delayMs));
    const domain=domains.find(d=>String(d.experience.id)===String(options.selection?.productId));
    return provider.resolveOffer({...options,domain});
  }};
  const env={DB,BOOKING_SESSIONS:{
    idFromName:id=>id,
    get(id){
      if(!sessions.has(id)){
        const storage=new Map();
        const session=new BookingSession({storage:{get:async k=>storage.get(k),put:async(k,v)=>storage.set(k,v)}},env);
        session.provider=()=>providerForFixture;
        sessions.set(id,session);
      }
      return sessions.get(id);
    },
  }};
  const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
  const server=createServer(async(req,res)=>{
    try{
      const parts=[];for await(const part of req) parts.push(part);
      const body=Buffer.concat(parts).toString();
      const url=new URL(req.url,'http://127.0.0.1');
      requests.push({path:url.pathname,method:req.method,body:body?JSON.parse(body):null});
      const headers={...req.headers,cookie:'lt_sales_sid=acceptance-session-00000001'};
      const request=new Request(url,{method:req.method,headers,...(body?{body}:{})});
      let response=handleBlockedBookingRoute(request,url);
      if(!response) response=await handleTravelTransactionApi(request,env,url);
      if(!response&&url.pathname==='/api/bokun/domain') response=json({ok:true,schema:'lovetravel.bokun-domain.v1',domains:presentationDomains});
      if(!response&&url.pathname==='/api/bokun/tours') response=json({ok:true,source:'bokun',vendorId:'137689',tours:domains.map(projectBokunDomainToLegacyTour)});
      if(!response&&url.pathname==='/api/bokun/booking-selection/resolve'){
        const result=await providerForFixture.resolveOffer(JSON.parse(body));
        response=json({ok:true,...result.resolution,start:domains[0].availabilitySlots[0]?.date,end:domains[0].availabilitySlots.at(-1)?.date});
      }
      if(!response&&url.pathname==='/api/bootstrap') response=json({hasData:true,profile:{},travelers:[],favorites:[],bookings:[]});
      if(!response&&url.pathname.startsWith('/api/')) response=json({ok:true});
      if(!response){
        const dist=resolve(root,'dist');
        const file=resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
        if(!file.startsWith(dist+sep)) throw new Error('Invalid static path');
        const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
        const bytes=await readFile(file).catch(()=>null);
        response=new Response(bytes||'',{status:bytes?200:404,headers:{'content-type':types[extname(file)]||'application/octet-stream'}});
      }
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return {
    base:`http://127.0.0.1:${server.address().port}`,requests,env,
    upstreamCalls:()=>upstreamCalls,
    async close(){await new Promise(r=>server.close(r));sqlite.close();},
  };
}
