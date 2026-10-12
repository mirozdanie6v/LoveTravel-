import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {optionCatalogDomains} from '../tests/fixtures/travel-option-catalog.mjs';
import {startBookingUiHarness} from '../tests/helpers/booking-ui-harness.mjs';
const {chromium}=await import(process.env.LOVE_TRAVEL_PLAYWRIGHT_MODULE||'playwright');
const locales=['ru','en','vi','ko','zh'];
const domains=optionCatalogDomains();
const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
for(const domain of domains){
  domain.experience.content.included='Lunch<br>Air-conditioned vehicle<br>Use of snorkeling equipment';
  for(const slot of domain.availabilitySlots){slot.date=date;slot.id=String(slot.startTimeId)+'_'+date;}
}
const messages={
  ru:(tour,option)=>'Выбираю «'+option+'» экскурсии «'+tour+'» на '+date+', 2 взрослых. Покажи точную цену.',
  en:(tour,option)=>'Choose "'+option+'" of "'+tour+'" on '+date+', 2 adults. Show the exact price.',
  vi:(tour,option)=>'Chọn phương án "'+option+'" của tour "'+tour+'" ngày '+date+', 2 người lớn. Cho biết tổng giá chính xác.',
  ko:(tour,option)=>'"'+tour+'" 투어의 "'+option+'" 옵션을 선택해 주세요. 날짜 '+date+', 성인 2명. 정확한 총액을 알려 주세요.',
  zh:(tour,option)=>'选择“'+tour+'”的“'+option+'”选项，日期 '+date+'，2位成人。请给出准确总价。',
};
const proof='artifacts/consultant-stabilization';await mkdir(proof,{recursive:true});
const report={source:'local production API, SQLite/D1 adapter, real Durable Object class, deterministic provider fixtures',
  startedAt:new Date().toISOString(),matrix:[],checks:{},errors:[],upstreamBookingCalls:0};
const h=await startBookingUiHarness(domains,{sharedGuest:false});
const browser=await chromium.launch({headless:true,channel:process.env.LOVE_TRAVEL_BROWSER_CHANNEL||'chromium'});
async function start(locale,width=390){
  const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();
  context.on('page',p=>p.on('pageerror',error=>report.errors.push(error.message)));
  page.on('pageerror',error=>report.errors.push(error.message));
  await context.route(/^https?:\/\//,async route=>route.request().url().startsWith(h.base)
    ?route.continue():route.fulfill({status:200,body:'',contentType:'text/plain'}));
  await page.addInitScript(locale=>localStorage.setItem('max-tour-locale-v1',locale),locale);
  await page.goto(h.base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>globalThis.LOVE_TRAVEL_BOKUN_ACTIVE===true);
  await page.locator('#homeScreen [data-lt-action="ai"]').click();
  await page.locator('#aiScreen.active textarea[name="message"]').waitFor();
  return {context,page};
}
async function ask(page,message,{expectSuccess=true}={}){
  const input=page.locator('#aiScreen textarea[name="message"]');
  await input.waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('#aiScreen textarea[name="message"]').disabled);
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/ai/chat')&&r.request().method()==='POST');
  await input.fill(message);await input.press('Enter');
  const response=await responsePromise,result=await response.json();
  if(expectSuccess)assert.ok(response.ok()&&result.ok&&!result.degraded,JSON.stringify(result));
  await page.waitForFunction(()=>!document.querySelector('#aiScreen textarea[name="message"]').disabled);
  return result;
}
async function returnToChat(page){
  await page.evaluate(()=>{document.querySelector('.lt-booking-sheet [data-lt-sheet-close]')?.click();showScreen('ai');MaxTourAI.mount(document.querySelector('#aiScreen'));});
}
try{
  for(const locale of process.argv.includes('--focus')?[]:locales){
    const {page,context}=await start(locale,locale==='zh'?320:390);
    try{
      for(const domain of domains)for(const rate of domain.rates){
        await page.locator('#aiScreen [data-ai-action="clear"]').click();
        const answer=await ask(page,messages[locale](domain.experience.title,rate.title));
        assert.equal(String(answer.bookingSelection?.rateId),String(rate.id));
        assert.equal(answer.bookingSelection.productId,String(domain.experience.id));
        assert.equal(answer.transaction.quote.price.amount,answer.offers.find(row=>row.offer.offerId===answer.agent.selectedOfferId).offer.price.amount);
        assert.equal(answer.agent.mutationExecuted,false);
        await page.locator('#aiScreen [data-lt-exact-price]').waitFor();
        const price=await page.evaluate(id=>MaxTourAI.pricePresentation(id),String(domain.experience.id));
        assert.ok(price&&price.amount.includes(answer.transaction.quote.price.currency));
        assert.equal(price.rateId,String(rate.id));
        await page.locator('#aiScreen [data-ai-action="book-tour"]').click();
        await page.locator('[data-lt-config="'+domain.experience.id+'"][data-lt-config-ready]').waitFor({timeout:15000});
        const form=await page.evaluate(()=>({selection:LoveTravelBookingConfigurator.selection(),tx:LoveTravelBookingConfigurator.transaction()}));
        assert.equal(form.tx.transactionId,answer.transaction.transactionId);
        assert.equal(String(form.selection.rateId),String(rate.id));
        assert.equal(form.tx.quote.price.amount,answer.transaction.quote.price.amount);
        assert.equal(form.tx.providerBooking||null,null);
        if(rate===domain.rates[0])await page.screenshot({path:proof+'/'+locale+'-'+domain.experience.id+'.png',fullPage:true});
        report.matrix.push({locale,productId:String(domain.experience.id),rateId:String(rate.id),amount:form.tx.quote.price.amount,currency:form.tx.quote.price.currency});
        await returnToChat(page);
      }
      console.log(JSON.stringify({stage:'matrix',locale,passed:report.matrix.filter(row=>row.locale===locale).length}));
    }finally{await context.close();}
  }
  if(!process.argv.includes('--focus'))assert.equal(report.matrix.length,55);
  const {page,context}=await start('ru');
  try{
    const domain=domains[0],rate=domain.rates[4];
    const first=await ask(page,messages.ru(domain.experience.title,rate.title));
    const pickup=await ask(page,'Заберите от Fixture Hotel.');
    assert.notEqual(pickup.reply,first.reply);
    const yes=await ask(page,'Да');assert.equal(yes.uiAction,'OPEN_CONFIGURATOR');
    await page.locator('.lt-booking-sheet.is-open').waitFor({timeout:15000});
    await returnToChat(page);
    for(let i=0;i<12;i++)await ask(page,i%2?'Что входит в выбранную экскурсию?':'Я уже сказал');
    await page.evaluate(()=>{
      globalThis.__idleMutations=0;
      globalThis.__idleObserver=new MutationObserver(records=>globalThis.__idleMutations+=records.length);
      __idleObserver.observe(document.querySelector('#aiScreen'),{childList:true,subtree:true,characterData:true});
    });
    await page.waitForTimeout(2000);
    await page.evaluate(()=>globalThis.__idleMutations=0);
    await page.waitForTimeout(12000);
    assert.equal(await page.evaluate(()=>__idleMutations),0,'Idle chat keeps changing DOM');
    report.checks.idleDom={seconds:12,mutations:0};
    const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,
      button:document.querySelector('#aiScreen [data-ai-action="book-tour"]')?.getBoundingClientRect().width,
      input:document.querySelector('#aiScreen textarea[name="message"]')?.getBoundingClientRect().width}));
    assert.equal(layout.overflow,false);assert.ok(layout.button>0&&layout.input>0);
    report.checks.longDialogue={turns:15,layout};
    await page.screenshot({path:proof+'/ru-long-dialogue.png',fullPage:true});

    // The server completes the turn, but the browser loses its response.
    let lost=true;
    await page.route('**/api/ai/chat',async route=>{
      const response=await route.fetch();
      if(lost){lost=false;return route.abort('failed');}
      return route.fulfill({response});
    });
    const before=h.sqlite.prepare('SELECT count(*) AS count FROM travel_conversation_requests').get().count;
    await page.locator('#aiScreen textarea[name="message"]').fill('Что входит в выбранную экскурсию?');
    await page.locator('#aiScreen textarea[name="message"]').press('Enter');
    await page.locator('#aiScreen [data-ai-action="retry"]').waitFor();
    const afterLost=h.sqlite.prepare('SELECT count(*) AS count FROM travel_conversation_requests').get().count;
    assert.equal(afterLost,before+1);
    await page.locator('#aiScreen [data-ai-action="retry"]').click();
    await page.waitForFunction(()=>!document.querySelector('#aiScreen [data-ai-action="retry"]'));
    assert.equal(h.sqlite.prepare('SELECT count(*) AS count FROM travel_conversation_requests').get().count,afterLost);
    report.checks.lostResponseRetry={completedTurns:1};await page.unroute('**/api/ai/chat');

    const oldId=await page.evaluate(()=>LoveTravelConversation.id());
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#aiScreen [data-ai-action="delete-data"]').click();
    await page.waitForFunction(id=>LoveTravelConversation.id()!==id,oldId);
    assert.equal(await page.locator('#aiScreen .ai-recommendations').count(),0);
    report.checks.deleteData={newScope:true};
  }finally{await context.close();}

  // Two isolated guests deliberately use the same client-chosen conversation ID.
  const a=await start('en'),b=await start('en');
  try{
    await a.page.evaluate(()=>LoveTravelConversation.request('/api/travel-commerce/session'));
    await b.page.evaluate(()=>LoveTravelConversation.request('/api/travel-commerce/session'));
    const id='deliberately-shared-conversation-12345';
    const call=ctx=>ctx.request.get(h.base+'/api/travel-commerce/transaction',{headers:{'x-lt-conversation-id':id}});
    const [one,two]=await Promise.all([call(a.context),call(b.context)]);
    const ta=await one.json(),tb=await two.json();assert.ok(ta.ok&&tb.ok);
    assert.notEqual(ta.transaction.transactionId,tb.transaction.transactionId);
    report.checks.guestIsolation={sameClientId:true,differentTransactions:true};
  }finally{await a.context.close();await b.context.close();}
  assert.equal(h.upstreamCalls(),0);
  assert.equal(h.requests.filter(r=>['RESERVE','RECONCILE'].includes(r.body?.action)).length,0);
  assert.deepEqual(report.errors,[]);
  console.log(JSON.stringify({matrixPairs:report.matrix.length,checks:report.checks,errors:report.errors,upstreamCalls:h.upstreamCalls()}));
}catch(error){
  report.errors.push(error.stack||error.message);process.exitCode=1;console.error(error.stack);
}finally{
  report.finishedAt=new Date().toISOString();
  await writeFile(proof+'/browser-report.json',JSON.stringify(report,null,2));
  await browser.close();await h.close();
}
