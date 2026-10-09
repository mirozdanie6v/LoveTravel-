import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=String(process.env.LOVE_TRAVEL_LIVE_BASE_URL||'https://lovetravel.viiversion.com').replace(/\/$/,'');
const proofDir='artifacts/ai-options';
await mkdir(proofDir,{recursive:true});
const report={base,startedAt:new Date().toISOString(),catalog:[],options:[],errors:[]};
const invariant=(condition,message)=>{if(!condition)throw new Error(message);};
const name=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\band\b/gu,' ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/gu,' ').trim();
const includesTitle=(reply,...titles)=>titles.filter(Boolean).some(title=>name(reply).includes(name(title)));
const locales=['ru','en','vi','zh','ko'];
const catalogQuestions={
  ru:tour=>'Перечисли все варианты экскурсии '+tour+'. Дату пока не выбираем.',
  en:tour=>'List all tour options for '+tour+'. We have not chosen a date.',
  vi:tour=>'Liệt kê tất cả các lựa chọn cho tour '+tour+'. Tôi chưa chọn ngày.',
  zh:tour=>'请列出 '+tour+' 的所有选项。我们还没有选择日期。',
  ko:tour=>tour+' 투어의 모든 옵션을 나열해 주세요. 날짜는 아직 정하지 않았어요.',
};
const priceQuestions={
  ru:(tour,option,date)=>'Подготовь вариант «'+option+'» экскурсии «'+tour+'» на '+date+', 2 взрослых. Покажи точную итоговую цену.',
  en:(tour,option,date)=>'Choose the option "'+option+'" of "'+tour+'" on '+date+', 2 adults. Show the exact total price.',
  vi:(tour,option,date)=>'Chọn phương án "'+option+'" của tour "'+tour+'" ngày '+date+', 2 người lớn. Cho biết tổng giá chính xác.',
  zh:(tour,option,date)=>'选择“'+tour+'”的“'+option+'”选项，日期 '+date+'，2位成人。请给出准确总价。',
  ko:(tour,option,date)=>'"'+tour+'" 투어의 "'+option+'" 옵션을 선택해 주세요. 날짜 '+date+', 성인 2명. 정확한 총액을 알려 주세요.',
};
const vietnamDay=()=>{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return values.year+'-'+values.month+'-'+values.day;
};
const addDay=iso=>{const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
const date=addDay(vietnamDay());
const browser=await chromium.launch({headless:true});
const probe=await browser.newContext();
async function domains(locale){
  const response=await probe.request.get(base+'/api/bokun/domain?locale='+locale+'&start='+date+'&end='+date,{timeout:45000});
  const data=await response.json();
  invariant(response.ok()&&data.ok&&data.domains?.length===2,'Cannot read current catalog '+locale);
  return data.domains;
}
async function start(locale){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const mutations=[],errors=[];
  // Abort all browser-side booking mutations rather than merely observing them.
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()==='POST'){
      let action='';try{action=String(request.postDataJSON()?.action||'').trim().toUpperCase();}catch{}
      const blocked=['RESERVE','RECONCILE'].includes(action)
        ||/\/api\/(?:bookings|bokun\/(?:reserve|client-demo\/submit))(?:\/|$)/.test(url.pathname);
      if(blocked){mutations.push({path:url.pathname,action});return route.abort();}
    }
    return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(locale=>{localStorage.setItem('max-tour-locale-v1',locale);sessionStorage.clear();},locale);
  await page.goto(base+'/?aiOptionGate=1',{waitUntil:'domcontentloaded',timeout:60000});
  const entry=page.locator('#homeScreen [data-lt-action="ai"]');await entry.waitFor({state:'visible',timeout:30000});await entry.click();
  await page.locator('#aiScreen.active textarea[name="message"]').waitFor({state:'visible',timeout:15000});
  return {context,page,mutations,errors};
}
async function ask(page,question){
  const responsePromise=page.waitForResponse(r=>r.url().includes('/api/ai/chat')&&r.request().method()==='POST',{timeout:45000});
  const field=page.locator('#aiScreen.active textarea[name="message"]');await field.fill(question);await field.press('Enter');
  const response=await responsePromise,answer=await response.json();
  invariant(response.ok()&&answer.ok,'AI API failed: '+JSON.stringify(answer));
  invariant(answer.agent?.mutationExecuted===false,'AI reports a mutation');
  await page.waitForFunction(reply=>[...document.querySelectorAll('#aiScreen .ai-msg.bot .ai-msg-text')].some(node=>node.textContent===reply),answer.reply,{timeout:15000});
  return answer;
}
try{
  const source=await domains('en');
  invariant(source[0].rates.length===7&&source[1].rates.length===4,'Provider catalog ownership/count changed; review before acceptance');
  for(const locale of locales){
    const native=locale==='en'?source:await domains(locale);
    const h=await start(locale);
    try{
      for(const domain of source){
        const nativeDomain=native.find(d=>String(d.experience.id)===String(domain.experience.id));
        const answer=await ask(h.page,catalogQuestions[locale](domain.experience.title));
        invariant(answer.source==='provider-catalog-options'&&!answer.degraded,'Provider catalog question degraded: '+locale+' '+JSON.stringify(answer));
        invariant(!(answer.offers||[]).length&&!answer.transaction,'Catalog question prepared a commercial selection: '+locale);
        for(const rate of domain.rates){
          const translated=nativeDomain.rates.find(r=>String(r.id)===String(rate.id));
          invariant(includesTitle(answer.reply,rate.title,translated?.title),'Missing option '+rate.id+' in '+locale+': '+answer.reply);
        }
        const tx=await (await h.context.request.get(base+'/api/travel-commerce/transaction')).json();
        invariant(!tx.selection&&!tx.providerBooking,'Catalog question changed the canonical booking state');
        report.catalog.push({locale,productId:String(domain.experience.id),rates:domain.rates.map(r=>String(r.id)),reply:answer.reply});
      }
      invariant(!h.mutations.length&&!h.errors.length,'Catalog browser failures: '+JSON.stringify({mutations:h.mutations,errors:h.errors}));
      await h.page.screenshot({path:proofDir+'/'+locale+'-catalog.png',fullPage:true});
    }catch(error){await h.page.screenshot({path:proofDir+'/'+locale+'-catalog-failure.png',fullPage:true}).catch(()=>{});throw error;}
    finally{await h.context.close();}
  }
  let caseIndex=0;
  for(const domain of source)for(const rate of domain.rates){
    const locale=locales[caseIndex++%locales.length],native=await domains(locale);
    const nativeRate=native.find(d=>String(d.experience.id)===String(domain.experience.id)).rates.find(r=>String(r.id)===String(rate.id));
    const h=await start(locale);
    try{
      const answer=await ask(h.page,priceQuestions[locale](domain.experience.title,nativeRate.title,date));
      invariant(answer.bookingSelection?.productId===String(domain.experience.id),'Wrong product for '+rate.id+': '+JSON.stringify(answer));
      invariant(String(answer.bookingSelection?.rateId)===String(rate.id),'Default or wrong rate substituted for '+rate.id+': '+JSON.stringify(answer));
      invariant(answer.transaction?.quote?.status==='ACTIVE','No exact active Quote for '+rate.id);
      invariant(String(answer.transaction.quote.offer.rateRef.externalId)===String(rate.id),'Quote rate differs from requested option');
      invariant(includesTitle(answer.reply,rate.title,nativeRate.title),'Reply does not identify the priced option: '+answer.reply);
      const selection=answer.bookingSelection;
      invariant(Object.values(selection.participants||{}).reduce((sum,count)=>sum+Number(count),0)===2&&selection.date===date,'Party/date lost');
      const checkedResponse=await h.context.request.post(base+'/api/bokun/booking-selection/resolve',{data:{selection,locale:'en'},timeout:45000});
      const checked=await checkedResponse.json();
      invariant(checkedResponse.ok()&&checked.readyToQuote,'Fresh read-only Quote revalidation failed: '+JSON.stringify(checked));
      invariant(Number(answer.transaction.quote.price.amount)===Number(checked.quote.total)&&answer.transaction.quote.price.currency===checked.quote.currency,'Quote differs from fresh provider-backed resolution');
      const book=h.page.locator('#aiScreen [data-ai-action="book-tour"][data-id="'+domain.experience.id+'"]');
      await book.waitFor({state:'visible',timeout:15000});await book.click();
      await h.page.waitForFunction(expected=>document.querySelector('#tourScreen.active [data-lt-config="'+expected.productId+'"][data-lt-config-ready]')
        &&String(globalThis.LoveTravelBookingConfigurator?.selection?.()?.rateId)===expected.rateId
        &&globalThis.LoveTravelBookingConfigurator?.transaction?.()?.transactionId===expected.transactionId,
        {productId:String(domain.experience.id),rateId:String(rate.id),transactionId:answer.transaction.transactionId},{timeout:45000});
      const handoff=await h.page.evaluate(()=>({selection:LoveTravelBookingConfigurator.selection(),transaction:LoveTravelBookingConfigurator.transaction(),resolution:LoveTravelBookingConfigurator.resolution()}));
      invariant(handoff.transaction.transactionId===answer.transaction.transactionId,'UI created another transaction');
      invariant(String(handoff.selection.rateId)===String(rate.id)&&handoff.selection.date===date,'Configurator lost the requested option/date');
      invariant(handoff.resolution.readyToQuote&&!handoff.transaction.providerBooking,'Configurator is not quote-ready or a booking exists');
      invariant(handoff.transaction.quote.price.amount===answer.transaction.quote.price.amount,'UI price differs from exact Quote');
      invariant(!h.mutations.length&&!h.errors.length,'Option browser failure: '+JSON.stringify({mutations:h.mutations,errors:h.errors}));
      await h.page.screenshot({path:proofDir+'/'+domain.experience.id+'-'+rate.id+'-handoff.png'});
      report.options.push({locale,productId:String(domain.experience.id),rateId:String(rate.id),title:nativeRate.title,transactionId:handoff.transaction.transactionId,
        quote:handoff.transaction.quote.price,readyToQuote:handoff.resolution.readyToQuote,readyToBook:handoff.resolution.readyToBook,source:answer.source,reply:answer.reply,providerBooking:null});
      console.log(JSON.stringify({stage:'exact-option-handoff',...report.options.at(-1)}));
    }catch(error){await h.page.screenshot({path:proofDir+'/'+rate.id+'-failure.png',fullPage:true}).catch(()=>{});throw error;}
    finally{await h.context.close();}
  }
  invariant(report.catalog.length===10&&report.options.length===11,'Acceptance coverage incomplete');
}catch(error){report.errors.push(error.message);throw error;}
finally{
  report.finishedAt=new Date().toISOString();
  await writeFile(proofDir+'/report.json',JSON.stringify(report,null,2));
  await probe.close();await browser.close();
}
