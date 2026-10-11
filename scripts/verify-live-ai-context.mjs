// Own controlled scenario using the real published AI and provider reads.
// Never submit a booking. Stops before the native form's final mutation.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=String(process.env.LOVE_TRAVEL_LIVE_BASE_URL||'https://lovetravel.viiversion.com').replace(/\/$/,'');
const browser=await chromium.launch({headless:true,channel:process.env.LOVE_TRAVEL_BROWSER_CHANNEL||'chromium'});
const folder='artifacts/ai-context';await mkdir(folder,{recursive:true});
const report={source:'Own browser dialogue with real production AI and Bókun reads; no booking mutations',base,turns:[],mutations:[]};
const context=await browser.newContext({viewport:{width:390,height:844}});
const watchdog=setTimeout(()=>process.exit(124),300000);
let conversationId='';
try{
 await context.route('**/*',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let action='';try{action=String(req.postDataJSON()?.action||'').toUpperCase();}catch{}
  if(req.method()==='POST'&&(['RESERVE','RECONCILE'].includes(action)||path==='/api/bookings'||path.includes('/demo-submit')||path.includes('/client-demo/')||(path.startsWith('/api/bokun/')&&path!=='/api/bokun/booking-selection/resolve'))){report.mutations.push({path,action});return route.abort();}
  return route.continue();
 });
 const page=await context.newPage();await page.addInitScript(()=>localStorage.setItem('max-tour-locale-v1','ru'));
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('.bottom-nav [data-nav="ai"]').click();
 const field=page.locator('#aiScreen.active textarea[name="message"]');await field.waitFor({state:'visible'});
 const vietnam=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const target=new Date(vietnam+'T00:00:00Z');target.setUTCDate(target.getUTCDate()+2);
 const date=target.toISOString().slice(0,10),shortDate=date.slice(0,7)===vietnam.slice(0,7)?String(target.getUTCDate()):new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',timeZone:'UTC'}).format(target);
 async function send(message){
  const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/ai/chat'&&r.request().postDataJSON()?.message===message,{timeout:45000});
  await field.fill(message);await field.press('Enter');const response=await wait;const data=await response.json();assert.ok(data.ok,JSON.stringify(data));
  const id=response.request().headers()['x-lt-conversation-id'];assert.ok(id);if(conversationId)assert.equal(id,conversationId);else conversationId=id;
  await page.waitForFunction(reply=>document.querySelector('#aiScreen .ai-msg.bot:last-child .ai-msg-text')?.textContent===reply,data.reply,{timeout:10000});
  report.turns.push({message,reply:data.reply,source:data.source,intent:data.intent,agent:data.agent,quote:data.transaction?.quote||null});
  console.log(JSON.stringify({message,source:data.source,date:data.intent?.dateConstraint?.exact,rate:data.bookingSelection?.rateId,reply:data.reply}));
  return data;
 }
 async function transaction(){const response=await context.request.get(base+'/api/travel-commerce/transaction',{headers:{'x-lt-conversation-id':conversationId}});const data=await response.json();assert.ok(data.ok);return data;}
 assert.equal((await send('Хочу забронировать Робинсон')).agent.nextQuestionCode,'DATE');
 const before=await transaction();
 const dated=await send(shortDate);assert.equal(dated.intent.dateConstraint.exact,date);
 const party=await send('2 взрослых');assert.equal(party.intent.dateConstraint.exact,date);assert.equal(party.source,'provider-catalog-options');
 assert.equal((await transaction()).selection||null,null,'A product request must not choose the first rate');
 const guide=await send('Как мне выбрать? Чем отличаются варианты?');assert.equal(guide.intent.dateConstraint.exact,date);assert.match(guide.reply,/1\..*Hon Mun/);
 const chosen=await send('1 вариант');assert.equal(chosen.bookingSelection.rateId,'2623660');assert.equal(chosen.bookingSelection.date,date);assert.equal(chosen.transaction.transactionId,before.transaction.transactionId);assert.equal(chosen.transaction.quote.offer.rateRef.externalId,'2623660');
 assert.ok(chosen.transaction.quote.offer.participantMix.every(p=>p.role==='ADULT'));
 const kept=await transaction();
 for(const message of ['Нет детей. Сколько стоят варианты тура','Для всех']){
  const data=await send(message);assert.equal(data.source,'provider-option-prices');assert.equal(data.offers.length,7);assert.equal(data.intent.dateConstraint.exact,date);assert.ok(data.offers.every(row=>row.productId==='love-travel-robinson-island'));assert.doesNotMatch(data.reply,/На какую дату/);
  const tx=await transaction();assert.equal(tx.transaction.transactionId,kept.transaction.transactionId);assert.equal(tx.selection.rateId,'2623660');assert.equal(tx.selection.date,date);
 }
 await page.locator('#aiScreen .ai-recommendations').evaluate(n=>n.scrollIntoView({block:'center'}));await page.screenshot({path:folder+'/ru-all-option-prices.png'});
 const oldId=conversationId;await page.locator('#aiScreen [data-ai-action="clear"]').click();conversationId='';
 await send('Хочу забронировать экскурсию Hon Mun Marine Park Snorkeling and Nha Trang Island Tour');assert.notEqual(conversationId,oldId);assert.equal((await transaction()).selection||null,null);
 await send(shortDate);const second=await send('2 взрослых');assert.equal(second.source,'provider-catalog-options');assert.equal(second.tourId,'1287580');
 const mud=await send('Выбираю Hon Tam Mud Bath');assert.equal(mud.bookingSelection.productId,'1287580');assert.equal(mud.bookingSelection.rateId,'2581229');assert.equal(mud.bookingSelection.date,date);
 const quote=await transaction();assert.ok(quote.transaction.quote);assert.equal(quote.providerBooking||null,null);
 await page.locator('#aiScreen .ai-recommendations > [data-ai-action="book-tour"][data-id="1287580"]').click();
 await page.locator('#tourScreen.active .lt-booking-config').waitFor({state:'visible',timeout:30000});
 const handoff=await transaction();assert.equal(handoff.transaction.transactionId,quote.transaction.transactionId);assert.equal(handoff.selection.rateId,'2581229');assert.equal(handoff.selection.date,date);assert.equal(handoff.providerBooking||null,null);
 await page.screenshot({path:folder+'/hon-mun-quote-handoff.png'});
 assert.deepEqual(report.mutations,[]);report.passed=true;
}catch(error){report.error=error.message;await context.pages().at(-1)?.screenshot({path:folder+'/failure.png'}).catch(()=>{});throw error;}
finally{clearTimeout(watchdog);await writeFile(folder+'/report.json',JSON.stringify(report,null,2));await browser.close();}
