import {screenshotReply,screenshotReplyClean} from '../tests/fixtures/chat-newline-artifacts.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {optionCatalogDomains} from '../tests/fixtures/travel-option-catalog.mjs';
import {startBookingUiHarness} from '../tests/helpers/booking-ui-harness.mjs';
import {resolveBookingSelection} from '../src/booking-selection-engine.js';
const {chromium}=await import(process.env.LOVE_TRAVEL_PLAYWRIGHT_MODULE||'playwright');
const locales=['ru','en','vi','ko','zh'],live=process.argv.includes('--live-data');
const folder='artifacts/consultant-stabilization/readable';await mkdir(folder,{recursive:true});
const questions={ru:'Какие варианты экскурсии Robinson?',en:'What options does Robinson have?',vi:'Những phương án của Robinson là gì?',ko:'Robinson의 모든 옵션은 무엇인가요?',zh:'Robinson有哪些选项？'};
const comparisons={ru:screenshotReply,en:'Two island tours.n- Robinson Beach — beach time.n- Hòn Mun — snorkeling and marine views.',vi:'Hai tour đảo.n- Robinson Beach — nghỉ ngơi trên biển.n- Hòn Mun — lặn ống thở và ngắm biển.',ko:'두 섬 투어.n- Robinson Beach — 해변 휴식.n- Hòn Mun — 스노클링과 바다 풍경.',zh:'两种海岛行程。n- Robinson Beach — 海滩休闲。n- Hòn Mun — 浮潜与海景。'};
const priceQuestions={ru:date=>'Покажи цены всех вариантов Robinson на '+date+', 2 взрослых',en:date=>'Show all option prices for Robinson on '+date+', 2 adults',vi:date=>'Giá tất cả phương án Robinson ngày '+date+', 2 người lớn',ko:date=>'Robinson 모든 옵션 가격 '+date+', 성인 2명',zh:date=>'Robinson所有选项价格 '+date+'，2位成人'};
const report={source:live?'local UI with fresh public read-only domains; controlled model replies':'local UI and provider fixtures; controlled model replies',checks:[],pageErrors:[]};
const browser=await chromium.launch({headless:true,channel:process.env.LOVE_TRAVEL_BROWSER_CHANNEL||'chrome'});
try{
 for(const locale of process.argv.includes('--ru-only')?['ru']:locales){
  let domains;
  if(live){const response=await fetch('https://lovetravel.viiversion.com/api/bokun/domain?locale='+locale+'&includePickupPlaces=0',{signal:AbortSignal.timeout(30000)});assert.ok(response.ok);domains=(await response.json()).domains;}
  else{domains=optionCatalogDomains();const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);for(const domain of domains)for(const slot of domain.availabilitySlots){slot.date=date;slot.id=slot.startTimeId+'_'+date;}}
  const h=await startBookingUiHarness(domains,{AI:{async run(_model,input){return input.messages[0].content.includes('Conversation Intelligence parser')?{response:{intentPatch:{goal:'COMPARE'}}}:{response:{reply:comparisons[locale],recommendedProductId:'love-travel-robinson-island',selectedOfferId:'',action:'COMPARE',nextQuestionCode:'',evidenceRefs:[]}};}}});
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  try{
   await context.route('**/*',route=>{const req=route.request(),url=req.url();if(url.startsWith(h.base)||live&&(url.includes('fonts.googleapis.com')||url.includes('fonts.gstatic.com')))return route.continue();return route.fulfill({status:200,body:'',contentType:'text/plain'});});
   const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
   await page.addInitScript(locale=>localStorage.setItem('max-tour-locale-v1',locale),locale);
   await page.goto(h.base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>globalThis.LOVE_TRAVEL_BOKUN_ACTIVE===true);
   await page.locator('#homeScreen [data-lt-action="ai"]').click();
   const contact=page.locator('#aiScreen .ai-administrator-contact');await contact.waitFor();
   assert.equal(await contact.getAttribute('href'),'https://nhatranglove.com/lien-he');assert.ok((await contact.boundingBox()).height>=44);
   const inputBox=await page.locator('#aiScreen [data-ai-form="chat"]').boundingBox(),contactBox=await contact.boundingBox();assert.ok(contactBox.y>=inputBox.y+inputBox.height-1);
   const ask=async(message,locator=null)=>{await page.waitForFunction(()=>!document.querySelector('#aiScreen textarea[name="message"]').disabled);const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/ai/chat'&&r.request().method()==='POST');if(locator)await locator.tap();else{await page.locator('#aiScreen textarea[name="message"]').fill(message);await page.locator('#aiScreen button[type="submit"]').tap();}const response=await wait,answer=await response.json();assert.ok(response.ok()&&answer.ok&&!answer.degraded,JSON.stringify(answer));await page.waitForFunction(()=>!document.querySelector('#aiScreen textarea[name="message"]').disabled);return answer;};
   const comparison=await ask('Compare Robinson and Hon Mun');assert.equal(comparison.source,'workers-ai-grounded-sales');
   const reply=page.locator('#aiScreen .ai-msg.bot').last();assert.ok(await reply.locator('.ai-msg-text p,.ai-msg-text li').count()>=2);assert.ok(await reply.locator('strong').count()>=2);assert.equal(await reply.locator('li').count(),2);assert.ok(!/[.!?。！？]n(?:[-*•]|\.)/.test(await reply.innerText()));if(locale==='ru')assert.equal(comparison.reply,screenshotReplyClean);
   await page.locator('#aiScreen .ai-chat-panel').screenshot({path:folder+'/'+locale+'-reply-contact.png'});
   await page.evaluate(raw=>{const key='lovetravel-ai-conversation-v1',saved=JSON.parse(sessionStorage.getItem(key));saved.messages.findLast(m=>m.role==='bot').text=raw;sessionStorage.setItem(key,JSON.stringify(saved));},comparisons[locale]);
   await page.reload({waitUntil:'domcontentloaded'});await page.locator('#homeScreen [data-lt-action="ai"]').click();
   const restored=page.locator('#aiScreen .ai-messages .ai-msg.bot').last();assert.equal(await restored.locator('li').count(),2);assert.ok(!/[.!?。！？]n(?:[-*•]|\.)/.test(await restored.innerText()));

   const catalog=await ask(questions[locale]);assert.equal(catalog.source,'provider-catalog-options');assert.equal(catalog.bookingSelection,null);
   const list=page.locator('#aiScreen .ai-msg.bot').last().locator('.ai-option-list');const cards=list.locator('.ai-option-card');const options=catalog.optionCatalog.groups[0].options;assert.equal(await cards.count(),options.length);assert.equal(options.length,7);
   for(const [i,option] of options.entries()){
    assert.equal(await cards.nth(i).getAttribute('data-rate-id'),option.rateId);assert.ok((await cards.nth(i).innerText()).includes(option.title));assert.ok((await cards.nth(i).locator('.ai-option-description').innerText()).length>15);
    const label=option.price.currency==='USD'?'$'+option.price.amount.toLocaleString('en-US',{maximumFractionDigits:2}):new Intl.NumberFormat(locale,{style:'currency',currency:option.price.currency,maximumFractionDigits:2}).format(option.price.amount);assert.equal(await cards.nth(i).locator('.ai-option-price strong').innerText(),label);assert.equal(option.price.kind,'FROM_ADULT');
   }
   await cards.first().scrollIntoViewIfNeeded();
   const firstBox=await cards.first().boundingBox(),thirdBox=await cards.nth(2).boundingBox();
   await page.screenshot({path:folder+'/'+locale+'-options-first-three.png',clip:{x:firstBox.x,y:firstBox.y,width:firstBox.width,height:thirdBox.y+thirdBox.height-firstBox.y}});
   assert.equal(await cards.first().locator('.ai-option-copy').evaluate(n=>getComputedStyle(n).textAlign),'left');
   await cards.last().scrollIntoViewIfNeeded();
   const bottomCard=await cards.last().boundingBox(),navBox=await page.locator('.bottom-nav').boundingBox();
   assert.ok(bottomCard.y+bottomCard.height<=navBox.y+1,'Last option is obscured by navigation');
   await cards.last().screenshot({path:folder+'/'+locale+'-options-last.png'});
   await cards.first().scrollIntoViewIfNeeded();await page.screenshot({path:folder+'/'+locale+'-options-page.png',fullPage:true});
   const hon=await ask(questions[locale].replace('Robinson','Hon Mun'));assert.equal(hon.optionCatalog.groups[0].externalProductId,'1287580');assert.equal(hon.optionCatalog.groups[0].options.length,4);assert.equal(await page.locator('#aiScreen .ai-msg.bot').last().locator('.ai-option-card').count(),4);assert.equal(hon.transaction.quote,null);
   const date=resolveBookingSelection(domains[0],{}).constraints.dates[0].date;
   const priced=await ask(priceQuestions[locale](date));assert.equal(priced.source,'provider-option-prices');assert.equal(priced.optionCatalog.groups[0].options[0].price.kind,'GROUP_TOTAL');
   const pricedCard=page.locator('#aiScreen .ai-msg.bot').last().locator('.ai-option-card').first();
   const chosen=await ask('',pricedCard);assert.equal(String(chosen.bookingSelection?.rateId),options[0].rateId);assert.equal(chosen.transaction.quote.price.amount,priced.optionCatalog.groups[0].options[0].price.amount);assert.equal(chosen.agent.mutationExecuted,false);
   assert.equal(await page.locator('#aiScreen [data-ai-contact]').count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(locale==='ru'){
    assert.equal(await page.evaluate(()=>MaxTourAiBookingBridgeV25.openStructuredBooking('1287578')),true);
    await page.locator('.lt-booking-sheet.is-open [data-lt-sheet-close-button]').waitFor({state:'visible'});
    await page.evaluate(()=>{
     const frames=[],original=window.requestAnimationFrame;window.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};
     window.__readableTestFrames={frames,original};
     document.querySelector('.lt-booking-sheet.is-open [data-lt-sheet-close-button]').click();LoveTravelBookingConfigurator.open('date');
    });
    await page.waitForTimeout(240);
    assert.equal(await page.locator('.lt-booking-sheet').evaluate(node=>node.hidden),false,'An old close timer hid the reopened sheet before its animation frame');
    await page.evaluate(()=>{const {frames,original}=window.__readableTestFrames;window.requestAnimationFrame=original;delete window.__readableTestFrames;for(const frame of frames)frame(performance.now());});
    await page.locator('.lt-booking-sheet.is-open [data-lt-sheet-close-button]').click();
   }
   assert.equal(h.upstreamCalls(),0);report.checks.push({locale,cards:options.length,honMunCards:4,contactBelowInput:true,paragraphs:true,emphasis:true,startingPrice:options[0].price,groupPrice:priced.optionCatalog.groups[0].options[0].price,selectedRateId:chosen.bookingSelection.rateId});
   console.log(JSON.stringify(report.checks.at(-1)));
  }finally{await context.close();await h.close();}
 }
 assert.deepEqual(report.pageErrors,[]);report.passed=true;
}catch(e){report.error=e.stack;process.exitCode=1;console.error(e.stack);}finally{await browser.close();await writeFile(folder+'/report.json',JSON.stringify(report,null,2));}