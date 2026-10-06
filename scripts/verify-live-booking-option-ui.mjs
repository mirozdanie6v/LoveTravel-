import { chromium } from 'playwright';

const base=String(process.env.LOVE_TRAVEL_LIVE_BASE_URL||'https://lovetravel.viiversion.com').replace(/\/$/,'');
const productId='1287578';

function invariant(value,message){
  if(!value) throw new Error(message);
}

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

  await page.waitForFunction(()=>
    typeof openTour==='function' && openTour.__loveTravelDomain===true,
    null,{timeout:15000}
  );

  await page.evaluate(id=>{
    if(typeof openTour!=='function' || openTour.__loveTravelDomain!==true) throw new Error('LoveTravel domain openTour is unavailable');
    void openTour(id);
  },productId);

  await page.waitForFunction(id=>{
    const screen=document.querySelector('#tourScreen.lt-domain-tour');
    return screen?.dataset.ltDomainProduct===id &&
      Boolean(screen.querySelector('.lt-booking-config')) &&
      Boolean(globalThis.LoveTravelBookingConfigurator?.resolution?.());
  },productId,{timeout:30000});

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
  invariant((await cards.locator('.is-active').count())>=0,'Option cards failed to render selected state');
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
  await browser.close();
}
