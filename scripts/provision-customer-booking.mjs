import {createHmac,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const cfg=JSON.parse(await readFile('wrangler.jsonc','utf8'));
if(cfg.vars.CLIENT_BOOKING_ENABLED!=='true')process.exit(0);
const credential=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!credential||!account)throw new Error('Deployment credentials are required');
const providerToken=createHmac('sha256',credential).update('LOVE_TRAVEL_CUSTOMER_BOOKING_20261013_V1').digest('hex');
console.log('::add-mask::'+providerToken);
async function secret(worker,name,text){
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/workers/scripts/'+encodeURIComponent(worker)+'/secrets',{
   method:'PUT',headers:{authorization:'Bearer '+credential,'content-type':'application/json'},body:JSON.stringify({name,type:'secret_text',text}),signal:AbortSignal.timeout(30000)});
 const data=await response.json();if(!response.ok||!data.success)throw new Error('Failed to configure booking credential for '+worker);
}
await secret('viiversion-integration','LOVE_TRAVEL_CLIENT_DEMO_TOKEN_SHA256',createHash('sha256').update(providerToken).digest('hex'));
await secret(cfg.name,'BOKUN_CLIENT_BOOKING_TOKEN',providerToken);
// This route searches bookings by reference and performs no writes.
const response=await fetch(cfg.vars.BOKUN_INTEGRATION_BASE_URL+'/internal/lovetravel/bokun/reconcile?vendorId=137689',{
 method:'POST',headers:{'content-type':'application/json','x-love-travel-demo-token':providerToken,'x-viiversion-booking-intent':'RECONCILE_LOVE_TRAVEL_CLIENT_DEMO_BOOKING'},
 body:JSON.stringify({externalBookingReference:'LT-TEST-CLIENT-READINESS-20261013',bookingDate:new Date().toISOString().slice(0,10)}),signal:AbortSignal.timeout(60000)});
const result=await response.json().catch(()=>null);
if(!response.ok||result?.ok!==true)throw new Error('Read-only Bókun booking lookup verification failed');
console.log('Customer booking credentials configured; read-only Bókun lookup passed; no booking created.');
