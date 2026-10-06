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
    if(!response.ok||!data?.ok||!data?.transaction) throw new Error('transaction bootstrap failed');
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
  invariant((await duplicate.count())>0,'Visual source option section is missing from tour renderer');
  invariant(!(await duplicate.first().isVisible()),'Duplicate lower tour options section is still visible');

  const optionStep=page.locator('#tourScreen .lt-booking-config [data-lt-step="option"]');
  await optionStep.click();
  const sheet=page.locator('.lt-booking-sheet.is-open');
  await sheet.waitFor({state:'visible',timeout:10000});

  const cards=sheet.locator('.lt-booking-option-card[data-lt-rate]');
  const cardCount=await cards.count();
  invariant(cardCount>0,'Visual option chooser has no cards');
  invariant((await sheet.locator('.lt-option-card').count())===0,'Legacy dry option list is still rendered');

  const first=cards.first();
  invariant((await first.locator('.lt-domain-rate__media img').count())>0,'Visual option card has no tour photos');
  invariant(Boolean((await first.locator('.lt-domain-rate__title').innerText()).trim()),'Visual option card has no title');
  invariant(Boolean((await first.locator('.lt-domain-rate__description').innerText()).trim()),'Visual option card has no description');
  invariant(Boolean((await first.locator('.lt-domain-rate__price strong').innerText()).trim()),'Visual option card has no price');
  invariant((await sheet.locator('.lt-booking-option-card.is-active').count())===1,'Exactly one visual option must be selected');
  invariant(pageErrors.length===0,'Page errors: '+JSON.stringify(pageErrors));

  console.log(JSON.stringify({
    productId,
    optionCards:cardCount,
    duplicateVisible:await duplicate.first().isVisible(),
    steps,
    selectedRate:await sheet.locator('.lt-booking-option-card.is-active').getAttribute('data-lt-rate'),
  }));
  await context.close();
} finally {
  clearTimeout(watchdog);
  await browser.close();
}
