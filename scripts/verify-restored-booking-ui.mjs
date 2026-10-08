import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { configurationDomains } from '../tests/fixtures/booking-configurator-domains.mjs';
import { startBookingUiHarness } from '../tests/helpers/booking-ui-harness.mjs';

const {chromium}=await import(process.env.LOVE_TRAVEL_PLAYWRIGHT_MODULE||'playwright');
const live=process.argv.includes('--live');
const fixtureDomains=configurationDomains();
if(process.argv.includes('--minimal-passengers')){
  fixtureDomains[1].bookingRequirements.passengerFields=[];
  fixtureDomains[1].bookingRequirements.questions=fixtureDomains[1].bookingRequirements.questions.filter(q=>q.context!=='PASSENGER');
}
const domains=live?await (async()=>{
  // The live acceptance obtains only public provider reads. Every browser
  // transaction subsequently runs locally; no upstream booking call is possible.
  const base=process.env.LOVE_TRAVEL_LIVE_BASE_URL||'https://lovetravel.viiversion.com';
  const response=await fetch(base+'/api/bokun/domain?locale=en&includePickupPlaces=1',{signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.domains.length,2);
  return data.domains;
})():fixtureDomains;
const harness=await startBookingUiHarness(domains,{delayMs:30});
const browser=await chromium.launch({headless:true,channel:process.env.LOVE_TRAVEL_BROWSER_CHANNEL||'chrome'});
const watchdog=setTimeout(()=>process.exit(124),55000);
const report={source:live?'fresh Bókun domain reads':'functional contract fixtures',products:[],errors:[]};
try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  // Photos/fonts are outside this functional contract; keep the test offline.
  await context.route(/^https?:\/\//,async route=>{
    if(route.request().url().startsWith(harness.base)) return route.continue();
    return route.fulfill({status:200,body:'',contentType:'text/plain'});
  });
  const page=await context.newPage();
  page.on('pageerror',e=>{report.errors.push(e.message);console.error('pageerror',e.message);});
  page.on('console',m=>{if(m.type()==='error') console.error(m.text().slice(0,300));});
  await page.goto(harness.base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>globalThis.LOVE_TRAVEL_BOKUN_ACTIVE===true);
  const snapshot=()=>page.evaluate(()=>({selection:LoveTravelBookingConfigurator.selection(),resolution:LoveTravelBookingConfigurator.resolution(),transaction:LoveTravelBookingConfigurator.transaction()}));
  const sheet=()=>page.locator('.lt-booking-sheet.is-open');
  const closed=()=>page.waitForFunction(()=>!document.querySelector('.lt-booking-sheet.is-open'),null,{timeout:8000});
  async function open(step){await page.locator('[data-lt-config] [data-lt-step="'+step+'"]').click();await sheet().waitFor();}
  async function syncClick(locator){
    const response=page.waitForResponse(r=>r.url().endsWith('/api/travel-commerce/transaction')&&r.request().method()==='POST');
    await locator.click();const r=await response;
    assert.equal(r.status(),200,await r.text());
  }
  async function fillControls(selector){
    const controls=sheet().locator(selector);
    for(let i=0;i<await controls.count();i++){
      const control=controls.nth(i);
      const spec=await control.evaluate(n=>({tag:n.tagName,type:n.type,key:n.dataset.ltCustomer||n.dataset.ltPassengerField||n.name||'',options:n.options?[...n.options].map(o=>o.value).filter(Boolean):[]}));
      if(spec.tag==='SELECT') await control.selectOption(spec.options[0]);
      else if(spec.type==='checkbox') await control.check();
      else await control.fill(spec.type==='date'?'2000-01-01':spec.type==='number'?'60':spec.type==='email'?'acceptance@example.com':spec.type==='tel'?'+84900000000':spec.key==='phoneNumber'?'+84900000000':'Acceptance');
    }
  }
  for(const domain of domains){
    const productId=String(domain.experience.id);
    console.log('opening',productId);
    // Use the existing catalog and its real click handler.
    await page.evaluate(()=>showScreen('catalog'));
    await page.locator('#catalogScreen article[onclick*="'+productId+'"]').first().click({timeout:5000});
    await page.locator('[data-lt-config="'+productId+'"][data-lt-config-ready]').waitFor({timeout:15000});
    const result=await page.evaluate(()=>({
      selection:LoveTravelBookingConfigurator.selection(),
      resolution:LoveTravelBookingConfigurator.resolution(),
      transaction:LoveTravelBookingConfigurator.transaction(),
    }));
    console.log('mounted',productId,'revision',result.transaction?.revision);
    // A legacy refresh must preserve the existing domain/configurator nodes.
    const beforeRefresh=await snapshot();
    await page.evaluate(()=>{
      globalThis.__acceptanceMount=document.querySelector('[data-lt-config]');
      renderTour();renderTour();
    });
    assert.equal(await page.evaluate(()=>globalThis.__acceptanceMount===document.querySelector('[data-lt-config]')),true);
    assert.equal((await snapshot()).transaction.revision,beforeRefresh.transaction.revision);
    await open('date');
    await sheet().locator('[data-lt-date]').first().click();
    if(await sheet().locator('[data-lt-slot]').count()) await syncClick(sheet().locator('[data-lt-slot]').first());
    await closed();
    await open('option');
    const availableRates=await sheet().locator('[data-lt-rate]').evaluateAll(nodes=>nodes.map(n=>n.dataset.ltRate));
    assert.ok(availableRates.length);
    await syncClick(sheet().locator('[data-lt-rate]').first());await closed();
    for(const rateId of availableRates.slice(1)){
      await open('option');await syncClick(sheet().locator('[data-lt-rate="'+rateId+'"]'));await closed();
      assert.equal(String((await snapshot()).selection.rateId),rateId);
    }
    if(availableRates.length>1){await open('option');await syncClick(sheet().locator('[data-lt-rate]').first());await closed();}
    await open('guests');
    const categories=(await snapshot()).resolution.constraints.participants;
    for(const category of categories){
      const id=String(category.id);
      const target=String(category.ticketCategory).toUpperCase()==='ADULT'?2:1;
      let count=Number(await sheet().locator('[data-lt-guest-count="'+id+'"]').innerText());
      while(count<target){await sheet().locator('[data-lt-guest-plus="'+id+'"]').click();count++;}
    }
    await syncClick(sheet().locator('[data-lt-guests-done]'));await closed();
    if(!live){
      // Provider min/max constraints remain authoritative; an oversized party
      // cannot become an approval-ready transaction.
      await open('guests');
      await sheet().locator('[data-lt-guest-plus="101"]').click({clickCount:4});
      await syncClick(sheet().locator('[data-lt-guests-done]'));await closed();
      const oversized=await snapshot();
      assert.equal(oversized.resolution.readyToBook,false);
      assert.ok(oversized.resolution.errors.some(error=>error.code==='above_rate_maximum'));
      await open('guests');
      await sheet().locator('[data-lt-guest-minus="101"]').click({clickCount:4});
      await syncClick(sheet().locator('[data-lt-guests-done]'));await closed();
    }
    await open('pickup');
    const pickup=(await snapshot()).resolution.constraints.pickup;
    if(pickup.modes.includes('PICKUP')){
      await syncClick(sheet().locator('[data-lt-pickup-mode="PICKUP"]'));
      await sheet().locator('[data-lt-pickup-search]').waitFor();
      if(pickup.customAllowed){
        await sheet().locator('[data-lt-custom-pickup]').fill('Acceptance Hotel, Nha Trang');
        await syncClick(sheet().locator('[data-lt-custom-pickup-save]'));await closed();await open('pickup');
      }
      if(pickup.places.length){
        const place=pickup.places.find(p=>p.askForRoomNumber)||pickup.places[0];
        await sheet().locator('[data-lt-pickup-search]').fill(place.title);
        await syncClick(sheet().locator('[data-lt-place="'+place.id+'"]'));
        if(place.askForRoomNumber){
          await sheet().locator('[data-lt-room-number]').fill('804');
          await syncClick(sheet().locator('[data-lt-room-save]'));
        }
        await closed();
      }else if(await sheet().count()) await sheet().locator('[data-lt-sheet-close-button]').click();
    }else{
      await syncClick(sheet().locator('[data-lt-pickup-mode]').first());await closed();
    }
    const dropoff=(await snapshot()).resolution.constraints.dropoff;
    if(dropoff.modes.includes('DROPOFF')){
      await open('dropoff');await syncClick(sheet().locator('[data-lt-dropoff-mode="DROPOFF"]'));
      await sheet().locator('[data-lt-dropoff-search]').waitFor();
      if(dropoff.customAllowed){
        await sheet().locator('[data-lt-custom-dropoff]').fill('Acceptance Return Hotel, Nha Trang');
        await syncClick(sheet().locator('[data-lt-custom-dropoff-save]'));await closed();
      }else if(dropoff.places.length){
        await sheet().locator('[data-lt-dropoff-search]').fill(dropoff.places[0].title);
        await syncClick(sheet().locator('[data-lt-dropoff-place]').first());await closed();
      }
    }
    const extras=(await snapshot()).resolution.constraints.extras;
    if(extras.length){
      await open('extras');
      for(const extra of extras){
        const plus=extra.pricedPerPerson?sheet().locator('[data-lt-passenger-extra-plus][data-lt-extra-id="'+extra.id+'"]').first():sheet().locator('[data-lt-extra-plus="'+extra.id+'"]');
        if(await plus.count()) await plus.click();
      }
      await fillControls('[data-lt-extra-answer],[data-lt-passenger-extra-answer]');
      await syncClick(sheet().locator('[data-lt-extras-done]'));
      if((await snapshot()).resolution.bookingDataIssues.some(issue=>issue.code.includes('extra_booking_question'))){
        await fillControls('[data-lt-extra-answer],[data-lt-passenger-extra-answer]');
        await syncClick(sheet().locator('[data-lt-extras-done]'));
      }
      await closed();
    }
    await open('contact');
    await fillControls('[data-lt-customer],[data-lt-answer],[data-lt-passenger-field],[data-lt-passenger-answer]');
    await syncClick(sheet().locator('[data-lt-contact-check]'));await closed();
    const ready=await snapshot();
    assert.equal(ready.resolution.readyToBook,true,JSON.stringify(ready.resolution));
    assert.equal(ready.transaction.state,'READY_FOR_APPROVAL');
    assert.equal(ready.transaction.quote.readyToBook,true);
    assert.equal(ready.transaction.quote.price.amount,ready.resolution.quote.total);
    const presentation=await page.evaluate(()=>({
      headerDate:document.querySelector('[data-lt-summary-date-value]')?.textContent,
      selectedDate:document.querySelector('[data-lt-step="date"] b')?.textContent,
      headerPrice:document.querySelector('[data-lt-summary-price]')?.textContent,
      configPrice:document.querySelector('.lt-booking-config__quote strong')?.textContent,
      rawControls:document.querySelectorAll('#tourScreen [data-lt-domain-rate],#tourScreen [data-lt-domain-slot]').length,
      clippedValues:[...document.querySelectorAll('.lt-booking-step__copy b')].some(n=>n.scrollWidth>n.clientWidth||n.scrollHeight>n.clientHeight),
    }));
    assert.equal(presentation.headerDate,presentation.selectedDate);
    assert.equal(presentation.headerPrice,presentation.configPrice);
    assert.equal(presentation.rawControls,0);
    assert.equal(presentation.clippedValues,false);
    if(!live) assert.equal(ready.transaction.quote.price.amount,138);
    if(!live) assert.equal(ready.selection.passengers[0].extras['702'].quantity,1);
    await mkdir('artifacts/restoration',{recursive:true});
    await page.locator('[data-lt-config-continue]').click();await sheet().waitFor();
    await sheet().locator('[data-lt-quote-approve]').waitFor();
    await page.screenshot({path:'artifacts/restoration/'+(live?'live':'fixture')+'-'+productId+'-quote.png'});
    await syncClick(sheet().locator('[data-lt-quote-approve]'));
    assert.equal((await snapshot()).transaction.state,'USER_APPROVED');
    await sheet().locator('[data-lt-sheet-close-button]').click();
    if(!live){
      const approved=await snapshot();
      for(const locale of ['vi','en','zh','ko','ru']){
        const reloaded=page.waitForEvent('domcontentloaded');
        await page.locator('.mt-language-switcher [data-locale="'+locale+'"]').click();
        await reloaded;
        await page.waitForFunction(()=>globalThis.LOVE_TRAVEL_BOKUN_ACTIVE===true);
        await page.evaluate(()=>showScreen('catalog'));
        await page.locator('#catalogScreen article[onclick*="'+productId+'"]').first().click();
        await page.locator('[data-lt-config="'+productId+'"][data-lt-config-ready]').waitFor();
        const localized=await snapshot();
        // Canonical transport stores custom address text; the UI may also
        // supply an identical addressLine1 alias before its first round-trip.
        const comparable=value=>{
          const copy=structuredClone(value);
          for(const transport of [copy.pickup,copy.dropoff]){
            const location=transport?.customLocation;
            if(location&&location.addressLine1===location.wholeAddress) delete location.addressLine1;
          }
          return copy;
        };
        assert.deepEqual(comparable(localized.selection),comparable(approved.selection));
        assert.equal(localized.transaction.quote.price.amount,approved.transaction.quote.price.amount);
        assert.equal(localized.transaction.quote.readyToBook,true);
      }
      await page.locator('[data-lt-config-continue]').click();await sheet().waitFor();
      await syncClick(sheet().locator('[data-lt-quote-approve]'));
      await sheet().locator('[data-lt-sheet-close-button]').click();
    }
    const sourceRates=domain.rates.filter(rate=>domain.availabilitySlots.some(slot=>slot.priceQuotesByRate?.some(q=>String(q.rateId)===String(rate.id))));
    assert.deepEqual(new Set(availableRates),new Set(sourceRates.map(r=>String(r.id))));
    report.products.push({productId,rates:availableRates,categories:categories.map(c=>c.ticketCategory),pickup:{modes:pickup.modes,places:pickup.places.length,customAllowed:pickup.customAllowed,roomNumber:ready.selection.pickup.roomNumber},dropoff:{modes:dropoff.modes,customAllowed:dropoff.customAllowed},extras:extras.map(e=>e.id),quote:ready.transaction.quote.price,transactionState:'USER_APPROVED',readyToBook:true});
  }
  assert.deepEqual(report.errors,[]);
  if(!live){
    const target=String(domains[1].experience.id);
    await page.evaluate(target=>{
      openTour('1287578');openTour('1287580');openTour(target);
    },target);
    await page.waitForFunction(target=>LoveTravelBookingConfigurator.selection()?.productId===target,target);
    assert.equal((await snapshot()).transaction.selection.productRef.externalId,target);
    await page.evaluate(()=>showScreen('catalog'));
    assert.equal(await page.evaluate(()=>LoveTravelBookingConfigurator.selection()),null);
    assert.equal(await page.evaluate(async target=>MaxTourAiBookingBridgeV25.openStructuredBooking(target),target),true);
    await page.waitForFunction(()=>document.querySelector('.lt-booking-sheet.is-open'));
    assert.equal((await snapshot()).transaction.selection.productRef.externalId,target);
    await sheet().locator('[data-lt-sheet-close-button]').click();
  }
  assert.equal(harness.upstreamCalls(),0);
  assert.equal(harness.requests.filter(r=>['RESERVE','RECONCILE'].includes(r.body?.action)).length,0);
  await mkdir('artifacts/restoration',{recursive:true});
  await writeFile('artifacts/restoration/'+(live?'live':'fixture')+'-acceptance.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{
  clearTimeout(watchdog);
  await browser.close();await harness.close();
}
