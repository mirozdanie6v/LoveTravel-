import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { BookingSession } from '../../src/booking-session-do.js';
import { createBokunProvider } from '../../src/bokun-provider.js';
import { projectBokunDomainToLegacyTour } from '../../src/bokun-adapter.js';
import { handleTravelTransactionApi } from '../../src/travel-transaction-api.js';
import { handleBlockedBookingRoute } from '../../src/booking-mutation-policy.js';
import {handleTravelBookingAccessApi} from '../../src/travel-booking-access.js';
import {handleTravelBookingsApi} from '../../src/travel-bookings-api.js';
import {conversationHash} from '../../src/travel-conversation-state.js';
import {ensureSalesSession} from '../../src/travel-session.js';
import {handleTravelConversationApi} from '../../src/travel-conversation-api.js';
import {handleLoveTravelSalesAgent} from '../../src/travel-sales-orchestrator.js';

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
export async function startBookingUiHarness(domains,{delayMs=0,presentationDomains=domains,AI=null,sharedGuest=true,booking=null}={}){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(await readFile(resolve(root,'migrations/0001_init.sql'),'utf8'));
  sqlite.exec(await readFile(resolve(root,'migrations/0008_travel_commerce_runtime.sql'),'utf8'));
  sqlite.exec(await readFile(resolve(root,'migrations/0006_ai_conversation_memory.sql'),'utf8'));
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
  let reservationCalls=0;
  const savedBookings=new Map();
  const invite='a'.repeat(64);
  const provider=createBokunProvider({fetchImpl:async()=>{
    upstreamCalls+=1;
    throw new Error('Unexpected upstream request in configuration acceptance');
  }});
  const providerForFixture={...provider,async resolveOffer(options){
    if(delayMs) await new Promise(r=>setTimeout(r,delayMs));
    const domain=domains.find(d=>String(d.experience.id)===String(options.selection?.productId));
    return provider.resolveOffer({...options,domain});
  },async getCheckoutContract({resolution}){
    if(!booking)throw new Error('Checkout fixture not enabled');
    return {options:[{type:'CUSTOMER_FULL_PAYMENT',amount:booking.amount??resolution.quote.total,currency:'USD',paymentMethods:{allowedMethods:['RESERVE_FOR_EXTERNAL_PAYMENT']}}],
      questions:{mainContactDetails:['firstName','lastName','email','phoneNumber'].map(questionId=>({questionId,required:true})),activityBookings:[]}};
  },
  async submitClientDemoBooking({checkoutRequestTemplate,demoToken}){
    if(!booking||demoToken!=='fixture-provider-secret')throw new Error('Unexpected booking fixture capability');
    reservationCalls++;
    if(booking.delayMs)await new Promise(r=>setTimeout(r,booking.delayMs));
    const reference=checkoutRequestTemplate.directBooking.externalBookingReference;
    const raw={confirmationCode:'NHA-123456789',externalBookingReference:reference,status:'CONFIRMED',paymentType:'NOT_PAID',totalPaid:0};
    savedBookings.set(reference,raw);
    if(booking.lostResponse)throw new Error('Fixture lost response after provider write');
    return structuredClone(raw);
  },
  async reconcileBooking({externalBookingReference}){
    return booking?.missingReadback?null:structuredClone(savedBookings.get(externalBookingReference)||null);
  },
  async getDomains({productIds}={}){return structuredClone(domains.filter(d=>!productIds||productIds.includes(String(d.experience.id))));}};
  const env={DB,AI,...(booking?{CLIENT_BOOKING_ENABLED:'true',BOKUN_CLIENT_BOOKING_TOKEN:'fixture-provider-secret',CLIENT_BOOKING_INVITE_SHA256:await conversationHash(invite),CLIENT_BOOKING_EXPIRES_AT:'2030-01-01T00:00:00Z'}:{}),BOOKING_SESSIONS:{
    idFromName:id=>id,
    get(id){
      if(!sessions.has(id)){
        const storage=new Map();
        const session=new BookingSession({storage:{get:async k=>storage.get(k),put:async(k,v)=>storage.set(k,v),delete:async k=>storage.delete(k)}},env);
        session.provider=()=>providerForFixture;
        sessions.set(id,session);
      }
      return sessions.get(id);
    },
  }};
  const guest=await ensureSalesSession(new Request('http://127.0.0.1/api/travel-commerce/session'),env);
  const fixtureCookie='__Host-lt_guest='+guest.token;
  const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
  const server=createServer(async(req,res)=>{
    try{
      const parts=[];for await(const part of req) parts.push(part);
      const body=Buffer.concat(parts).toString();
      const url=new URL(req.url,'http://'+req.headers.host);
      requests.push({path:url.pathname,method:req.method,body:body?JSON.parse(body):null});
      const headers={...req.headers,cookie:req.headers.cookie||(sharedGuest?fixtureCookie:'')};
      const request=new Request(url,{method:req.method,headers,...(body?{body}:{})});
      let response=handleBlockedBookingRoute(request,url);
      if(!response)response=await handleTravelBookingAccessApi(request,env,url);
      if(!response)response=await handleTravelBookingsApi(request,env,url);
      if(!response)response=await handleTravelConversationApi(request,env,url);
      if(!response) response=await handleTravelTransactionApi(request,env,url);
      if(!response)response=await handleLoveTravelSalesAgent(request,env,url);
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
    invite,reservationCalls:()=>reservationCalls,
    base:`http://127.0.0.1:${server.address().port}`,requests,env,sqlite,fixtureCookie,
    upstreamCalls:()=>upstreamCalls,
    async close(){await new Promise(r=>server.close(r));sqlite.close();},
  };
}
