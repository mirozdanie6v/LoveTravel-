import { chromium } from 'playwright';

const base=String(process.env.LOVE_TRAVEL_LIVE_BASE_URL||'https://lovetravel.viiversion.com').replace(/\/$/,'');
const allowedProducts=new Set(['1287578','1287580']);

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
  },
  {
    locale:'en',
    entry:'Ask AI assistant',
    message:'We are two adults and want snorkeling tomorrow with pickup from Oceanus. What do you recommend?',
    assistant:'AI Assistant',
  },
];

const browser=await chromium.launch({headless:true});
try{
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
    invariant(String(ai?.source||'').includes('bokun'),'AI response is not grounded in Bókun for '+row.locale);
    invariant(ai?.agent?.mutationExecuted===false,'AI performed a booking mutation for '+row.locale);
    invariant(!ai?.tourId || allowedProducts.has(String(ai.tourId)),'AI selected an unsupported product for '+row.locale);

    await page.waitForFunction(expectedPending=>{
      const root=document.querySelector('#aiScreen');
      const cards=root?.querySelectorAll('.ai-recommendation')||[];
      const text=root?.innerText||'';
      return cards.length>0 && !text.includes(expectedPending);
    },row.locale==='ru'?'Подбираю…':'Finding options…',{timeout:30000});

    const cards=page.locator('#aiScreen .ai-recommendation');
    invariant((await cards.count())>0,'AI did not render Bókun-backed recommendations for '+row.locale);
    const ids=await cards.evaluateAll(nodes=>nodes.map(node=>String(node.getAttribute('data-tour-id')||'')));
    invariant(ids.every(id=>allowedProducts.has(id)),'AI rendered unsupported recommendations for '+row.locale+': '+JSON.stringify(ids));

    const book=page.locator('#aiScreen [data-ai-action="book-tour"]').first();
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
