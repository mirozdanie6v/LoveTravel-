import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base=String(process.env.LOVE_TRAVEL_LIVE_BASE_URL||'https://lovetravel.viiversion.com').replace(/\/$/,'');
const allowedProducts=new Set(['1287578','1287580']);
const proofDir='artifacts/ai-dialogue';
await mkdir(proofDir,{recursive:true});

function invariant(value,message){
  if(!value) throw new Error(message);
}

async function vietnamTomorrow(){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date());
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  const today=new Date(Date.UTC(Number(values.year),Number(values.month)-1,Number(values.day)));
  today.setUTCDate(today.getUTCDate()+1);
  return today.toISOString().slice(0,10);
}

const cases=[
  {
    locale:'ru',
    entry:'Спросить AI',
    message:'Нас двое взрослых, хотим завтра на снорклинг с трансфером от Oceanus. Что посоветуете?',
    assistant:'AI-консультант',
    book:'Забронировать',
  },
  {
    locale:'en',
    entry:'Ask AI assistant',
    message:'We are two adults and want snorkeling tomorrow with pickup from Oceanus. What do you recommend?',
    assistant:'AI Assistant',
    book:'Book',
  },
];


const consultationCases=[
  {locale:'ru',questions:['Что входит в экскурсию Robinson Beach? Дату ещё не выбрали.','Чем она отличается от Hòn Mun?','Какие условия отмены бронирования у этой экскурсии?'],inclusions:/питан|еда|еду|напит|обед/i},
  {locale:'vi',questions:['Tour Robinson Beach bao gồm những gì? Tôi chưa chọn ngày.','Tour này khác Hòn Mun như thế nào?','Điều kiện hủy đặt tour này là gì?'],inclusions:/ăn|uống|ẩm thực|bữa/i},
  {locale:'en',questions:['What is included in Robinson Beach? We have not chosen a date.','How does it differ from Hòn Mun?','What are the booking cancellation conditions for this tour?'],inclusions:/food|drink|meal|lunch/i},
  {locale:'zh',questions:['Robinson Beach 行程包含什么？我们还没选日期。','它与 Hòn Mun 有什么区别？','这个行程的预订取消政策是什么？'],inclusions:/餐饮|饮食|食品|食物|饮料|午餐|膳食/},
  {locale:'ko',questions:['Robinson Beach 투어에는 무엇이 포함되나요? 날짜는 아직 정하지 않았어요.','이 투어는 Hòn Mun과 어떻게 다른가요?','이 투어의 예약 취소 규정은 무엇인가요?'],inclusions:/식사|음식|음료|점심/},
];
async function verifyConsultation(browser){
  for(const row of consultationCases){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const page=await context.newPage();
    const mutations=[];
    const chatRequests=[];
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(String(error)));
    try{
    page.on('request',request=>{
      if(request.method()==='POST'&&request.url().includes('/api/ai/chat')){chatRequests.push(request.postDataJSON());console.log(JSON.stringify({stage:'browser-chat-request',locale:row.locale,index:chatRequests.length-1,body:request.postDataJSON()}));}
      if(request.method()==='POST'&&request.url().includes('/api/travel-commerce/transaction')){
        try{const body=request.postDataJSON();if(['RESERVE','RECONCILE'].includes(body?.action))mutations.push(body.action);}catch{}
      }
    });
    await page.addInitScript(locale=>{localStorage.setItem('max-tour-locale-v1',locale);sessionStorage.clear();},row.locale);
    await page.goto(base+'/?aiDialogueGate=1',{waitUntil:'domcontentloaded',timeout:60000});
    const entry=page.locator('#homeScreen [data-lt-action="ai"]');
    await entry.waitFor({state:'visible',timeout:20000});await entry.click();
    const field=page.locator('#aiScreen.active textarea[name="message"]');
    await field.waitFor({state:'visible',timeout:10000});
    let previousReply='';
    for(const [index,question] of row.questions.entries()){
      const started=Date.now();
      const responsePromise=page.waitForResponse(response=>response.url().includes('/api/ai/chat')&&response.request().method()==='POST',{timeout:45000});
      await field.fill(question);await field.press('Enter');
      const response=await responsePromise;const answer=await response.json();
      invariant(chatRequests.length===index+1,'One question sent multiple chat requests: '+row.locale);
      invariant(response.ok()&&answer.ok===true,'Consultation API failed: '+row.locale+' '+JSON.stringify(answer));
      invariant(answer.source==='workers-ai-grounded-sales'&&!answer.degraded,'A template or unavailable AI reply cannot pass consultation: '+row.locale+' '+JSON.stringify(answer));
      invariant(!['ASK_DATE','ASK_PARTY'].includes(answer.agent?.action),'Consultation was blocked by commercial parameters: '+row.locale);
      invariant(answer.agent?.mutationExecuted===false&&!(answer.offers||[]).length,'A factual question prepared another offer: '+row.locale);
      invariant(String(answer.reply||'').length>=12&&answer.reply!==previousReply,'Consultation did not produce a substantive new reply: '+row.locale);
      if(index===0)invariant(row.inclusions.test(answer.reply),'Included services were not explained: '+row.locale+' '+answer.reply);
      if(index===1)invariant(/Robinson|Робинсон|로빈슨|鲁滨逊/i.test(answer.reply)&&/H[oò]n\s*Mun|Хон.{0,3}Мун|혼.{0,2}문/i.test(answer.reply),'Comparison lost the previously discussed tour: '+row.locale+' '+answer.reply);
      previousReply=answer.reply;
      await page.waitForFunction(reply=>[...document.querySelectorAll('#aiScreen .ai-msg.bot .ai-msg-text')].some(node=>node.textContent===reply),answer.reply,{timeout:10000});
      const txResponse=await context.request.get(base+'/api/travel-commerce/transaction');
      const tx=await txResponse.json();
      invariant(txResponse.ok()&&!tx.providerBooking&&!tx.selection,'Consultation changed a booking configuration: '+row.locale);
      invariant(mutations.length===0,'Consultation attempted a booking mutation');
      console.log(JSON.stringify({stage:'consultation',locale:row.locale,index,source:answer.source,intentSource:answer.agent.intentSource,replyFailureReason:answer.agent.replyFailureReason,replyAttempts:answer.agent.replyAttempts,replyFailureReasons:answer.agent.replyFailureReasons,elapsedMs:Date.now()-started,reply:answer.reply}));
    }
    invariant(pageErrors.length===0,'Page errors during consultation: '+row.locale+' '+JSON.stringify(pageErrors));
    await page.screenshot({path:proofDir+'/'+row.locale+'-consultation.png',fullPage:true});
    }catch(error){
      await page.screenshot({path:proofDir+'/'+row.locale+'-failure.png',fullPage:true}).catch(()=>{});
      throw error;
    }finally{await context.close();}
  }
}

const browser=await chromium.launch({headless:true});
try{
  await verifyConsultation(browser);
  const tomorrow=await vietnamTomorrow();
  for(const row of cases){
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
    const page=await context.newPage();
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(String(error)));
    await page.addInitScript(locale=>{
      localStorage.setItem('max-tour-locale-v1',locale);
      sessionStorage.clear();
    },row.locale);

    await page.goto(base+'/?clientAiE2E=1',{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>
      globalThis.LOVE_TRAVEL_BOKUN_ACTIVE===true &&
      typeof TOURS!=='undefined' &&
      Array.isArray(TOURS) &&
      TOURS.length===2,
      null,{timeout:60000}
    );

    const entry=page.locator('#homeScreen [data-lt-action="ai"]');
    await entry.waitFor({state:'visible',timeout:15000});
    invariant((await entry.innerText()).includes(row.entry),'AI entry is not localized for '+row.locale);

    await entry.click();
    await page.waitForSelector('#aiScreen.active textarea[name="message"]',{state:'visible',timeout:10000});
    invariant((await page.locator('#aiScreen h2').innerText()).includes(row.assistant),'AI screen heading is not localized for '+row.locale);

    const responsePromise=page.waitForResponse(response=>
      response.url().includes('/api/ai/chat') && response.request().method()==='POST',
      {timeout:60000}
    );
    const textarea=page.locator('#aiScreen textarea[name="message"]');
    await textarea.fill(row.message);
    await textarea.press('Enter');
    const aiResponse=await responsePromise;
    const ai=await aiResponse.json();
    invariant(aiResponse.ok() && ai?.ok===true,'AI request failed for '+row.locale+': '+JSON.stringify(ai));
    invariant(ai?.agent?.version==='travel-commerce-sales-v1','Unexpected AI agent version for '+row.locale+': '+JSON.stringify(ai?.agent));
    invariant(ai?.agent?.mutationExecuted===false,'AI performed a booking mutation for '+row.locale);
    invariant(Array.isArray(ai?.agent?.evidenceRefs) && ai.agent.evidenceRefs.length>0,'AI response has no provider evidence refs for '+row.locale);
    invariant(Boolean(ai?.agent?.selectedOfferId),'AI response has no provider-verified selected offer for '+row.locale);
    invariant(Array.isArray(ai?.offers) && ai.offers.some(item=>String(item?.offer?.offerId||'')===String(ai.agent.selectedOfferId)),'Selected AI offer is absent from verified provider offers for '+row.locale+': '+JSON.stringify(ai?.offers));
    invariant(ai?.bookingSelection && allowedProducts.has(String(ai.bookingSelection.productId||'')),'AI response has no supported Bókun booking selection for '+row.locale+': '+JSON.stringify(ai?.bookingSelection));
    invariant(ai?.transaction?.transactionId,'AI response did not hand off to BookingTransaction for '+row.locale);
    invariant(!ai?.tourId || allowedProducts.has(String(ai.tourId)),'AI selected an unsupported product for '+row.locale);
    console.log(JSON.stringify({
      stage:'ai-response',
      locale:row.locale,
      plannerSource:ai.source,
      intentSource:ai.agent.intentSource,
      selectedOfferId:ai.agent.selectedOfferId,
      evidenceRefs:ai.agent.evidenceRefs,
      productId:ai.bookingSelection.productId,
      transactionId:ai.transaction.transactionId,
    }));

    await page.waitForFunction(expectedPending=>{
      const root=document.querySelector('#aiScreen');
      const cards=root?.querySelectorAll('.ai-sales-results .ai-recommendations > [data-tour-id]')||[];
      const text=root?.innerText||'';
      return cards.length>0 && !text.includes(expectedPending);
    },row.locale==='ru'?'Подбираю…':'Finding options…',{timeout:30000});

    const cards=page.locator('#aiScreen .ai-sales-results .ai-recommendations > [data-tour-id]');
    invariant((await cards.count())>0,'AI did not render Bókun-backed recommendations for '+row.locale);
    const ids=await cards.evaluateAll(nodes=>nodes.map(node=>String(node.getAttribute('data-tour-id')||'')));
    invariant(ids.every(id=>allowedProducts.has(id)),'AI rendered unsupported recommendations for '+row.locale+': '+JSON.stringify(ids));

    const book=page.locator('#aiScreen [data-ai-action="book-tour"]').first();
    await book.waitFor({state:'visible',timeout:10000});
    invariant((await book.innerText()).trim()===row.book,'AI booking CTA is not localized for '+row.locale+': '+JSON.stringify(await book.innerText()));
    const productId=String(await book.getAttribute('data-id')||'');
    invariant(allowedProducts.has(productId),'AI booking CTA has unsupported product for '+row.locale);
    await book.click();

    await page.waitForFunction(id=>
      document.querySelector('#tourScreen.lt-domain-tour')?.dataset.ltDomainProduct===id &&
      Boolean(document.querySelector('#tourScreen .lt-booking-config')) &&
      Boolean(globalThis.LoveTravelBookingConfigurator?.transaction?.()),
      productId,{timeout:30000}
    );

    const handoff=await page.evaluate(()=>({
      transaction:globalThis.LoveTravelBookingConfigurator?.transaction?.()||null,
      selection:globalThis.LoveTravelBookingConfigurator?.selection?.()||null,
      resolution:globalThis.LoveTravelBookingConfigurator?.resolution?.()||null,
      screenActive:document.querySelector('#tourScreen')?.classList.contains('active')||false,
    }));
    invariant(handoff.screenActive,'AI booking CTA did not open the tour booking screen for '+row.locale);
    invariant(handoff.transaction?.transactionId,'AI handoff has no BookingTransaction for '+row.locale);
    invariant(String(handoff.selection?.productId||'')===productId,'AI handoff product differs from BookingTransaction selection for '+row.locale);
    const partyTotal=Object.values(handoff.selection?.participants||{}).reduce((sum,value)=>sum+Number(value||0),0);
    invariant(partyTotal===2,'AI handoff lost the two-adult party for '+row.locale+': '+JSON.stringify(handoff.selection));
    invariant(String(handoff.selection?.date||'')===tomorrow,'AI handoff lost tomorrow date for '+row.locale+': '+JSON.stringify(handoff.selection));
    invariant(!handoff.transaction?.providerBooking,'Provider booking exists before user approval for '+row.locale);
    invariant(pageErrors.length===0,'Page errors in '+row.locale+': '+JSON.stringify(pageErrors));

    console.log(JSON.stringify({
      locale:row.locale,
      productId,
      transactionId:handoff.transaction.transactionId,
      transactionState:handoff.transaction.state,
      readyToQuote:Boolean(handoff.resolution?.readyToQuote),
      readyToBook:Boolean(handoff.resolution?.readyToBook),
      aiSource:ai.source,
    }));
    await context.close();
  }
} finally {
  await browser.close();
}
