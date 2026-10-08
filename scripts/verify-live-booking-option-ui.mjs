import { chromium } from 'playwright';

const base=String(process.env.LOVE_TRAVEL_LIVE_BASE_URL||'https://lovetravel.viiversion.com').replace(/\/$/,'');
const allowedProducts=new Set(['1287578','1287580']);

function invariant(value,message){
  if(!value) throw new Error(message);
}

const watchdog=setTimeout(()=>{
  console.error('booking option smoke exceeded 60s');
  process.exit(124);
},60000);

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  const page=await context.newPage();
  const mutationAttempts=[];
  await page.route('**/*',async route=>{
    const req=route.request();
    const path=new URL(req.url()).pathname;
    const body=req.postDataJSON();
    if(['RESERVE','RECONCILE'].includes(String(body?.action||'').toUpperCase())
      ||(req.method()==='POST'&&(path==='/api/bookings'||path.includes('/demo-submit')||path.includes('/client-demo/')))){
      mutationAttempts.push(path);
      return route.abort();
    }
    return route.continue();
  });
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.addInitScript(()=>{
    localStorage.setItem('max-tour-locale-v1','ru');
    sessionStorage.clear();
  });

  await page.goto(base+'/?bookingOptionSmoke=1',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>
    globalThis.LOVE_TRAVEL_BOKUN_ACTIVE===true &&
    typeof TOURS!=='undefined' &&
    Array.isArray(TOURS) &&
    TOURS.length===2,
    null,{timeout:60000}
  );
  console.log('catalog-ready');

  await page.waitForFunction(()=>
    typeof openTour==='function' &&
    openTour.__loveTravelDomain===true &&
    Boolean(globalThis.LoveTravelBookingConfigurator),
    null,{timeout:20000}
  );

  const tx=await page.evaluate(async()=>{
    const response=await fetch('/api/travel-commerce/transaction',{
      method:'GET',
      cache:'no-store',
      credentials:'same-origin',
      headers:{accept:'application/json'},
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok||!data?.transaction){
      throw new Error('transaction bootstrap failed: '+JSON.stringify({
        status:response.status,
        ok:Boolean(data?.ok),
        error:data?.error||null,
        message:data?.message||null,
      }));
    }
    return {transactionId:data.transaction.transactionId,state:data.transaction.state};
  });
  console.log(JSON.stringify({stage:'transaction-ready',...tx}));

  const catalogEntry=page.locator('#homeScreen [data-lt-action="catalog"]');
  await catalogEntry.waitFor({state:'visible',timeout:10000});
  await catalogEntry.click();
  await page.waitForSelector('#catalogScreen.active .lt-tour-card',{state:'visible',timeout:15000});
  console.log('catalog-open');

  const tourCard=page.locator('#catalogScreen.active .lt-tour-card').first();
  await tourCard.evaluate(node=>setTimeout(()=>node.click(),0));
  console.log('tour-card-clicked');

  await page.waitForFunction(allowed=>{
    const screen=document.querySelector('#tourScreen.lt-domain-tour');
    const id=String(screen?.dataset.ltDomainProduct||'');
    return allowed.includes(id) &&
      Boolean(screen.querySelector('.lt-booking-config [data-lt-step="option"]'));
  },[...allowedProducts],{timeout:20000});

  const productId=String(await page.locator('#tourScreen').getAttribute('data-lt-domain-product')||'');
  invariant(allowedProducts.has(productId),'Unexpected product opened: '+productId);
  console.log(JSON.stringify({stage:'booking-config-ready',productId}));

  const steps=await page.locator('#tourScreen .lt-booking-config [data-lt-step]').evaluateAll(nodes=>
    nodes.map(node=>String(node.getAttribute('data-lt-step')||''))
  );
  for(const required of ['date','option','guests','pickup','contact']){
    invariant(steps.includes(required),'BookingConfigurator lost required step '+required+': '+JSON.stringify(steps));
  }

  const duplicate=page.locator('#tourScreen .lt-domain-section--options');
  invariant((await duplicate.count())===0,'Legacy lower tour option controls must not be emitted');
  invariant((await page.locator('#tourScreen [data-lt-domain-rate],#tourScreen [data-lt-domain-slot]').count())===0,
    'Legacy rate/date controls compete with BookingConfigurator');

  const optionStep=page.locator('#tourScreen .lt-booking-config [data-lt-step="option"]');
  await optionStep.click();
  const sheet=page.locator('.lt-booking-sheet.is-open');
  await sheet.waitFor({state:'visible',timeout:10000});

  const options=sheet.locator('.lt-option-card[data-lt-rate]');
  const optionCount=await options.count();
  invariant(optionCount>0,'Restored Bókun option chooser has no rates');
  const firstOption=options.first();
  const selectedRate=String(await firstOption.getAttribute('data-lt-rate')||'');
  invariant(Boolean(selectedRate),'First restored option has no Bókun rate id');
  invariant(Boolean((await firstOption.locator('b').innerText()).trim()),'First restored option has no title');

  await firstOption.click();
  await page.waitForFunction(rateId=>
    String(globalThis.LoveTravelBookingConfigurator?.selection?.()?.rateId||'')===String(rateId),
    selectedRate,{timeout:20000}
  );
  await page.waitForFunction(()=>
    !document.querySelector('.lt-booking-sheet')?.classList.contains('is-open'),
    null,{timeout:10000}
  );

  const guestStep=page.locator('#tourScreen .lt-booking-config [data-lt-step="guests"]');
  await guestStep.click();
  await page.locator('.lt-booking-sheet.is-open').waitFor({state:'visible',timeout:10000});
  const guestRows=page.locator('.lt-booking-sheet.is-open .lt-guest-row[data-lt-guest-row]');
  const guestCount=await guestRows.count();
  invariant(guestCount>0,'Restored configurator exposes no Bókun participant categories');
  invariant((await page.locator('.lt-booking-sheet.is-open [data-lt-guest-count]').count())===guestCount,
    'Participant rows are missing quantity controls');

  const participantCategories=await page.evaluate(()=>
    (globalThis.LoveTravelBookingConfigurator?.resolution?.()?.constraints?.participants||[]).map(item=>({
      id:String(item?.id||''),
      ticketCategory:String(item?.ticketCategory||''),
      minAge:item?.minAge,
      maxAge:item?.maxAge,
    }))
  );
  invariant(participantCategories.length===guestCount,'Visible participant controls diverge from Bókun constraints');

  await page.locator('.lt-booking-sheet.is-open [data-lt-sheet-close-button]').click();
  await page.waitForFunction(()=>
    !document.querySelector('.lt-booking-sheet')?.classList.contains('is-open'),
    null,{timeout:10000}
  );

  invariant(mutationAttempts.length===0,'UI attempted a forbidden booking mutation');

  invariant(pageErrors.length===0,'Page errors: '+JSON.stringify(pageErrors));

  console.log(JSON.stringify({
    productId,
    optionCount,
    selectedRate,
    participantCategories,
    duplicateOptionsCount:await duplicate.count(),
    steps,
    mutationAttempts,
  }));
  await context.close();
} finally {
  clearTimeout(watchdog);
  await browser.close();
}
