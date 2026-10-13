import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startBookingUiHarness} from '../tests/helpers/booking-ui-harness.mjs';
import {configurationDomains} from '../tests/fixtures/booking-configurator-domains.mjs';
const {chromium}=await import(process.env.LOVE_TRAVEL_PLAYWRIGHT_MODULE||'playwright');
const folder='artifacts/customer-booking';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.LOVE_TRAVEL_BROWSER_CHANNEL||'chrome'});
const report={realBookingsCreated:0,cases:[],errors:[]};
try{
for(const [locale,mode] of [['ru','normal'],['en','normal'],['vi','normal'],['ko','normal'],['zh','normal'],['ru','lost-response'],['ru','pending']]){
 const domains=configurationDomains(),h=await startBookingUiHarness(domains,{booking:{delayMs:100,missingReadback:mode==='pending'}});
 const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
 try{
  await context.route('**/*',route=>route.request().url().startsWith(h.base)?route.continue():route.fulfill({status:200,body:''}));
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(locale=>localStorage.setItem('max-tour-locale-v1',locale),locale);
  await page.goto(h.base+'/#booking-invite='+h.invite,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>globalThis.LOVE_TRAVEL_BOKUN_ACTIVE===true&&globalThis.LoveTravelBookings?.snapshot().loaded);
  assert.equal(new URL(page.url()).hash,'');
  const access=await page.evaluate(async()=>await (await LoveTravelConversation.request('/api/travel-commerce/access')).json());
  assert.equal(access.bookingEnabled,true);
  await page.locator('.bottom-nav [data-nav="catalog"]').click();
  await page.locator('#catalogScreen article[onclick*="1287578"]').first().click();
  await page.evaluate(()=>LoveTravelBookingConfigurator.ready('1287578'));
  const date=domains[0].availabilitySlots[0].date;
  await page.evaluate(async date=>{
    await LoveTravelBookingConfigurator.applySelection({productId:'1287578',date,rateId:'201',startTimeId:'301',participants:{101:2},
      pickup:{mode:'MEET_ON_LOCATION'},dropoff:{mode:'NO_DROPOFF'},
      customer:{firstName:'Customer',lastName:'Acceptance',email:'customer@example.com',phoneNumber:'+84900000000'},
      answers:{diet:'none',reference:'acceptance'},passengers:[0,1].map(()=>({categoryId:'101',firstName:'Customer',lastName:'Acceptance',answers:{birth:'2000-01-01',weight:60}}))});
    LoveTravelBookingConfigurator.open();
  },date);
  console.log('configured',locale,mode,await page.evaluate(()=>({state:LoveTravelBookingConfigurator.transaction()?.state,ready:LoveTravelBookingConfigurator.resolution()?.readyToBook,issues:LoveTravelBookingConfigurator.resolution()?.bookingDataIssues})));
  const button=page.locator('[data-lt-quote-approve]');
  await button.waitFor();await page.waitForFunction(()=>!document.querySelector('[data-lt-quote-approve]').disabled);
  assert.equal(h.reservationCalls(),0);
  if(mode==='lost-response'){
    let dropped=false;
    await page.route('**/api/travel-commerce/transaction',async route=>{
      const body=route.request().postDataJSON();
      if(body?.action==='RESERVE'&&!dropped){dropped=true;await route.fetch();return route.abort();}
      return route.continue();
    });
  }
  await button.evaluate(node=>{node.click();node.click();});
  if(mode==='pending')await page.locator('[data-lt-booking-recheck]').waitFor();
  else await page.locator('[data-lt-booking-trips]').waitFor();
  assert.equal(h.reservationCalls(),1);assert.equal(h.upstreamCalls(),0);
  await page.locator('.lt-booking-sheet').screenshot({path:folder+'/'+locale+'-'+mode+'-result.png'});
  if(mode!=='pending'){
    assert.match(await page.locator('.lt-booking-sheet').innerText(),/NHA-123456789/);
    await page.locator('[data-lt-booking-trips]').click();
    await page.locator('#tripsScreen .lt-real-booking').waitFor();
    assert.match(await page.locator('#tripsScreen').innerText(),/NHA-123456789/);
    await page.locator('#tripsScreen').screenshot({path:folder+'/'+locale+'-trips.png'});
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>LoveTravelBookings?.snapshot().loaded);
    await page.locator('.bottom-nav [data-nav="trips"]').click();
    await page.locator('#tripsScreen .lt-real-booking').waitFor();
    assert.match(await page.locator('#tripsScreen').innerText(),/NHA-123456789/);
  }else{
    assert.doesNotMatch(await page.locator('.lt-booking-sheet').innerText(),/NHA-/);
    await page.locator('[data-lt-booking-recheck]').click();
    await page.locator('[data-lt-booking-recheck]').waitFor();
    assert.equal(h.reservationCalls(),1);
  }
  report.cases.push({locale,mode,fixtureBookings:h.reservationCalls(),upstreamCalls:h.upstreamCalls()});
 }finally{await context.close();await h.close();}
}
assert.deepEqual(report.errors,[]);
}finally{await browser.close();await writeFile(folder+'/browser-report.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
