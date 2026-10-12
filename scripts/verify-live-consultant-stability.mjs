import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.LOVE_TRAVEL_PLAYWRIGHT_MODULE||'playwright');
const base='https://lovetravel.viiversion.com';
const proof='artifacts/consultant-live';await mkdir(proof,{recursive:true});
const report={base,startedAt:new Date().toISOString(),assets:[],turns:[],checks:{},errors:[],blockedMutations:[],recoveryEvents:[]};
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+2*86400000));
const browser=await chromium.launch({headless:true,channel:process.env.LOVE_TRAVEL_BROWSER_CHANNEL||'chromium'});
const contexts=[];
async function start(locale='ru'){
 const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);
 await context.route('**/*',async route=>{
  const r=route.request(),path=new URL(r.url()).pathname;let action='';try{action=String(r.postDataJSON()?.action||'').toUpperCase();}catch{}
  if(r.method()==='POST'&&(['RESERVE','RECONCILE','APPROVE'].includes(action)||path==='/api/bookings'||path.includes('/client-demo/')||path.includes('/demo-submit'))){report.blockedMutations.push({path,action});return route.abort();}
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.addInitScript(locale=>{localStorage.setItem('max-tour-locale-v1',locale);sessionStorage.clear();},locale);
 await page.goto(base+'/?consultantStabilityGate=1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('#homeScreen [data-lt-action="ai"]').click();
 await page.locator('#aiScreen.active textarea[name="message"]').waitFor();
 return {context,page};
}
async function ask(page,message){
 await page.waitForFunction(()=>!document.querySelector('#aiScreen textarea[name="message"]').disabled);
 const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/ai/chat'&&r.request().method()==='POST',{timeout:60000});
 const input=page.locator('#aiScreen textarea[name="message"]');await input.fill(message);await input.press('Enter');
 let r=await wait,a=await r.json();
 if(r.ok()&&(a.degraded||a.generationFailed)&&['timeout','output_truncated','invalid_json'].includes(a.agent?.replyFailureReason)){
  report.recoveryEvents.push({message,reason:a.agent.replyFailureReason,firstSource:a.source});
  const retry=page.locator('#aiScreen [data-ai-action="retry"]');await retry.waitFor({state:'visible',timeout:10000});
  const retryWait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/ai/chat'&&r.request().method()==='POST',{timeout:60000});
  const firstId=r.request().postDataJSON().requestId;await retry.click();r=await retryWait;a=await r.json();
  assert.equal(r.request().postDataJSON().requestId,firstId);
 }
 assert.ok(r.ok()&&a.ok&&!a.degraded&&!a.generationFailed,JSON.stringify(a));assert.equal(a.agent.mutationExecuted,false);
 await page.waitForFunction(()=>!document.querySelector('#aiScreen textarea[name="message"]').disabled);
 report.turns.push({message,reply:a.reply,source:a.source,uiAction:a.uiAction,quote:a.transaction?.quote?.price||null});
 console.log(JSON.stringify({stage:'stability-turn',...report.turns.at(-1)}));return a;
}
async function tx(h,id){return (await h.context.request.get(base+'/api/travel-commerce/transaction',{headers:{'x-lt-conversation-id':id||await h.page.evaluate(()=>LoveTravelConversation.id())}})).json();}
async function back(page){await page.evaluate(()=>{document.querySelector('.lt-booking-sheet [data-lt-sheet-close]')?.click();showScreen('ai');MaxTourAI.mount(document.querySelector('#aiScreen'));});}
try{
 const h=await start();
 for(const path of ['lovetravel-conversation.js','ai-consultant-v5.js','ai-catalog-card-v7.js','lovetravel-booking-configurator.js']){
  const response=await h.context.request.get(base+'/'+path+'?verify='+Date.now());assert.ok(response.ok());
  const live=await response.body(),local=await readFile('src/'+path);
  const hash=b=>createHash('sha256').update(b.toString('utf8').replaceAll('\r\n','\n')).digest('hex');assert.equal(hash(live),hash(local),'Published asset differs: '+path);
  report.assets.push({path,sha256:hash(live),matchesSource:true});
 }
 const first=await ask(h.page,'Выбираю Robinson & Mini Beach на '+date+', 2 взрослых. Покажи точную цену.');
 assert.equal(first.bookingSelection.rateId,'2623668');assert.ok(first.quoteBinding);
 await h.page.locator('#aiScreen [data-lt-exact-price]').waitFor();
 const presentation=await h.page.evaluate(()=>MaxTourAI.pricePresentation('1287578'));assert.equal(presentation.rateId,'2623668');
 const pickup=await ask(h.page,'Заберите от Oceanus.');assert.notEqual(pickup.reply,first.reply);assert.equal(pickup.intent.hotel,'Oceanus');
 const yes=await ask(h.page,'Да');assert.equal(yes.uiAction,'OPEN_CONFIGURATOR');
 await h.page.locator('.lt-booking-sheet.is-open').waitFor({timeout:45000});
 const form=await h.page.evaluate(()=>({tx:LoveTravelBookingConfigurator.transaction(),selection:LoveTravelBookingConfigurator.selection()}));
 assert.equal(form.tx.transactionId,first.transaction.transactionId);assert.equal(form.selection.rateId,'2623668');assert.equal(form.tx.quote.price.amount,first.transaction.quote.price.amount);assert.equal(form.tx.providerBooking||null,null);
 report.checks.form={sameTransaction:true,rateId:form.selection.rateId,quote:form.tx.quote.price};
 await back(h.page);
 for(let i=0;i<6;i++)await ask(h.page,i%2?'Я уже сказал':'Хорошо');
 await h.page.evaluate(()=>{globalThis.__mutations=0;globalThis.__observer=new MutationObserver(r=>globalThis.__mutations+=r.length);__observer.observe(document.querySelector('#aiScreen'),{childList:true,subtree:true,characterData:true});});
 await h.page.waitForTimeout(2000);await h.page.evaluate(()=>globalThis.__mutations=0);await h.page.waitForTimeout(12000);
 const mutations=await h.page.evaluate(()=>{__observer.disconnect();return __mutations;});assert.equal(mutations,0);
 const overflow=await h.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
 report.checks.idle={seconds:12,mutations,overflow};await h.page.screenshot({path:proof+'/long-dialogue.png',fullPage:true});
 let lostAnswer,lostBody,lost=true;
 await h.page.route('**/api/ai/chat',async route=>{const response=await route.fetch({timeout:60000});if(lost){lost=false;lostBody=route.request().postDataJSON();lostAnswer=await response.json();return route.abort('failed');}return route.fulfill({response});});
 await h.page.locator('#aiScreen textarea[name="message"]').fill('Покажи точную цену выбранного варианта.');await h.page.locator('#aiScreen textarea[name="message"]').press('Enter');
 await h.page.locator('#aiScreen [data-ai-action="retry"]').waitFor({timeout:60000});assert.ok(lostAnswer.ok&&!lostAnswer.degraded);
 const wait=h.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/ai/chat'&&r.request().method()==='POST',{timeout:60000});
 await h.page.locator('#aiScreen [data-ai-action="retry"]').click();const retry=await wait;
 assert.equal(retry.request().postDataJSON().requestId,lostBody.requestId);assert.deepEqual(await retry.json(),lostAnswer);
 await h.page.waitForFunction(()=>!document.querySelector('#aiScreen textarea[name="message"]').disabled);await h.page.unroute('**/api/ai/chat');
 report.checks.lostResponse={sameRequestId:true,identicalServerReceipt:true};
 const oldId=await h.page.evaluate(()=>LoveTravelConversation.id());await h.page.locator('#aiScreen [data-ai-action="clear"]').click();
 const cleared=await tx(h);assert.equal(cleared.selection,null);assert.notEqual(cleared.transaction.transactionId,first.transaction.transactionId);
 report.checks.newConversation={newTransaction:true,selection:null};
 const a=await start('en'),b=await start('en');
 for(const c of [a,b])await c.page.evaluate(()=>LoveTravelConversation.request('/api/travel-commerce/session'));
 const id='shared-production-verification-'+crypto.randomUUID();
 const ta=await tx(a,id),tb=await tx(b,id);assert.ok(ta.ok&&tb.ok);assert.notEqual(ta.transaction.transactionId,tb.transaction.transactionId);
 const seeded=await a.context.request.post(base+'/api/ai/chat',{headers:{'x-lt-conversation-id':id},data:{locale:'en',message:'Choose Robinson & Mini Beach on '+date+', 2 adults. Show the exact price.'},timeout:60000});assert.ok((await seeded.json()).ok);
 const newer=new Date(date+'T00:00:00Z');newer.setUTCDate(newer.getUTCDate()+1);const changedDate=newer.toISOString().slice(0,10);
 const parallel=await Promise.all(['Change the date to '+changedDate+'.','We are 3 adults, no children.'].map(message=>a.context.request.post(base+'/api/ai/chat',{headers:{'x-lt-conversation-id':id},data:{locale:'en',message,requestId:crypto.randomUUID()},timeout:90000})));
 for(const r of parallel)assert.ok(r.ok()&&(await r.json()).ok);
 const final=await tx(a,id);assert.equal(final.selection.date,changedDate);assert.equal(Object.values(final.selection.participants).reduce((a,b)=>a+Number(b),0),3);assert.equal(final.providerBooking,null);
 report.checks.parallel={date:changedDate,adults:3,sameTransaction:final.transaction.transactionId===ta.transaction.transactionId};
 const untouched=await tx(b,id);assert.equal(untouched.selection,null);
 const deleted=await a.context.request.post(base+'/api/travel-commerce/conversation',{headers:{'x-lt-conversation-id':id},data:{action:'DELETE_SAVED_DATA'}});assert.ok(deleted.ok());
 const revoked=await a.context.request.get(base+'/api/travel-commerce/transaction',{headers:{'x-lt-conversation-id':id}});assert.equal(revoked.status(),410);
 assert.equal((await tx(b,id)).transaction.transactionId,tb.transaction.transactionId);
 report.checks.guestIsolationAndDeletion={differentTransactions:true,oldScopeStatus:410,otherGuestPreserved:true};
 // Reproduce a guest whose old bootstrap registered a default conversation.
 const legacyDefault=await h.context.request.get(base+'/api/travel-commerce/transaction');assert.ok(legacyDefault.ok());
 const guestBefore=(await h.context.cookies(base)).find(c=>c.name==='__Host-lt_guest')?.value;
 h.page.once('dialog',d=>d.accept());const beforeDelete=await h.page.evaluate(()=>LoveTravelConversation.id());
 await h.page.locator('#aiScreen [data-ai-action="delete-data"]').click();await h.page.waitForFunction(id=>LoveTravelConversation.id()!==id,beforeDelete);
 const old=await h.context.request.get(base+'/api/travel-commerce/transaction',{headers:{'x-lt-conversation-id':oldId}});assert.equal(old.status(),410);
 report.checks.deleteUi={reset:true,earlierScopeStatus:410};
 await h.page.reload({waitUntil:'domcontentloaded'});
 await h.page.locator('#homeScreen [data-lt-action="ai"]').click();
 const afterReload=await ask(h.page,'Что входит в экскурсию Robinson Beach?');
 const guestAfter=(await h.context.cookies(base)).find(c=>c.name==='__Host-lt_guest')?.value;
 assert.equal(guestAfter,guestBefore);assert.equal(afterReload.source,'workers-ai-grounded-sales');
 const defaultStillDeleted=await h.context.request.get(base+'/api/travel-commerce/transaction');assert.equal(defaultStillDeleted.status(),410);
 report.checks.deleteReload={sameGuest:true,replySource:afterReload.source,oldDefaultScopeStatus:410};
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.blockedMutations,[]);report.passed=true;
 console.log(JSON.stringify({stage:'stability-result',checks:report.checks,assets:report.assets,passed:true}));
}catch(e){report.errors.push(e.stack||e.message);process.exitCode=1;console.error(e.stack);for(const c of contexts)await c.pages()[0]?.screenshot({path:proof+'/failure-'+contexts.indexOf(c)+'.png'}).catch(()=>{});}
finally{report.finishedAt=new Date().toISOString();await writeFile(proof+'/stability-report.json',JSON.stringify(report,null,2));for(const c of contexts)await c.close();await browser.close();}