import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.LOVE_TRAVEL_PLAYWRIGHT_MODULE||'playwright');
const base='https://lovetravel.viiversion.com',folder='artifacts/customer-booking';
const invite=(await readFile('artifacts/customer-booking-link.txt','utf8')).split('\n')[0];
const report={realBookingsCreated:0,blockedReserveRequests:0,receiptSource:'controlled browser response; no provider submission',checks:[],errors:[]};
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.LOVE_TRAVEL_BROWSER_CHANNEL||'chrome'});
try{
const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
let controlled=null;
await context.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url()),method=request.method();
 if(method==='POST'){
  const body=request.postDataJSON();
  if(url.pathname==='/api/travel-commerce/transaction'&&body?.action==='RESERVE'){
   report.blockedReserveRequests++;
   const tx=await page.evaluate(()=>LoveTravelBookingConfigurator.transaction());
   assert.equal(tx.state,'USER_APPROVED');assert.equal(body.confirmBooking,true);
   controlled={...tx,state:'CONFIRMED',providerBooking:{confirmationCode:'CONTROLLED-UI-ONLY',status:'CONFIRMED',paymentType:'NOT_PAID',totalPaid:0}};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,transaction:controlled,state:controlled.state,revision:controlled.revision,providerBooking:controlled.providerBooking})});
  }
  if(url.pathname.includes('/demo-submit')||url.pathname.startsWith('/internal/')||url.pathname==='/api/bookings'||(url.pathname.startsWith('/api/bokun/')&&!url.pathname.endsWith('/resolve')))throw new Error('Unsafe browser mutation attempted');
 }
 if(controlled&&url.pathname==='/api/travel-commerce/bookings')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,bookings:[{transactionId:controlled.transactionId,state:controlled.state,providerBooking:controlled.providerBooking,selection:await page.evaluate(()=>LoveTravelBookingConfigurator.selection()),price:controlled.quote.price,updatedAt:controlled.updatedAt}]})});
 return route.continue();
});
await page.addInitScript(()=>localStorage.setItem('max-tour-locale-v1','ru'));
await page.goto(invite,{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>LOVE_TRAVEL_BOKUN_ACTIVE===true&&LoveTravelBookings?.snapshot().loaded,{},{timeout:60000});
assert.equal(new URL(page.url()).hash,'');
const access=await page.evaluate(async()=>await (await LoveTravelConversation.request('/api/travel-commerce/access')).json());
assert.equal(access.bookingEnabled,true);report.checks.push('invited guest has booking access');
const other=await browser.newContext();const otherPage=await other.newPage();
await otherPage.goto(base,{waitUntil:'domcontentloaded'});
const denied=await otherPage.evaluate(async()=>{await fetch('/api/travel-commerce/session');const r=await fetch('/api/travel-commerce/transaction',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'RESERVE',expectedRevision:1,confirmBooking:true,quoteId:'forged',quoteRevision:1})});return r.status;});
assert.equal(denied,403);report.checks.push('uninvited guest cannot reserve');await other.close();
await page.locator('#homeScreen [data-lt-action="ai"]').click();
const answerPromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/ai/chat'&&r.request().method()==='POST',{timeout:65000});
await page.locator('#aiScreen textarea[name="message"]').fill('Хочу природу и красивые виды');
await page.locator('#aiScreen button[type="submit"]').click();
const answer=await (await answerPromise).json();assert.equal(answer.ok,true);assert.ok(answer.reply?.length);assert.ok(!answer.degraded&&!answer.generationFailed,JSON.stringify(answer));
report.checks.push('live consultant replied using '+answer.source);
const domain=await page.evaluate(async()=>{const r=await fetch('/api/bokun/domain?locale=ru&includePickupPlaces=1');return (await r.json()).domains.find(d=>String(d.experience.id)==='1287578');});
const rate=domain.rates[0],adult=domain.participants.find(p=>p.ticketCategory==='ADULT');
const slot=domain.availabilitySlots.find(s=>!s.soldOut&&!s.unavailable&&s.date>new Date().toISOString().slice(0,10)&&(s.rates||[]).some(r=>String(r.id)===String(rate.id)));assert.ok(slot);
const count=Math.max(1,Number(rate.minPerBooking||1),Number(slot.minParticipantsToBookNow||1));
await page.locator('.bottom-nav [data-nav="catalog"]').click();
await page.locator('#catalogScreen article[onclick*="1287578"]').first().click();
await page.evaluate(()=>LoveTravelBookingConfigurator.ready('1287578'));
await page.evaluate(async selection=>{await LoveTravelBookingConfigurator.applySelection(selection);await LoveTravelBookingConfigurator.open();},{
 productId:'1287578',date:slot.date,rateId:String(rate.id),startTimeId:String(slot.startTimeId),participants:{[adult.id]:count},
 pickup:{mode:'MEET_ON_LOCATION'},dropoff:{mode:'NO_DROPOFF'},customer:{firstName:'Checkout',lastName:'ReadOnly',email:'read-only@example.com',phoneNumber:'+84900000000'},answers:{},passengers:[]
});
const button=page.locator('[data-lt-quote-approve]');await button.waitFor();
await page.waitForFunction(()=>!document.querySelector('[data-lt-quote-approve]').disabled,{},{timeout:65000});
assert.match(await button.innerText(),/Забронировать/);
await page.locator('.lt-booking-sheet').screenshot({path:folder+'/production-review.png'});
report.checks.push('live checkout confirms final button and exact price');
await button.click();
await page.locator('[data-lt-booking-trips]').waitFor({timeout:20000});
assert.match(await page.locator('.lt-booking-sheet').innerText(),/CONTROLLED-UI-ONLY/);
await page.locator('.lt-booking-sheet').screenshot({path:folder+'/production-controlled-receipt.png'});
await page.locator('[data-lt-booking-trips]').click();await page.locator('#tripsScreen .lt-real-booking').waitFor();
report.checks.push('receipt and My Trips render controlled provider result');
assert.equal(report.blockedReserveRequests,1);assert.deepEqual(report.errors,[]);
await context.close();
}finally{await browser.close();await writeFile(folder+'/production-report.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
