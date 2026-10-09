import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {configurationDomains} from '../tests/fixtures/booking-configurator-domains.mjs';
import {startBookingUiHarness} from '../tests/helpers/booking-ui-harness.mjs';
const {chromium}=await import(process.env.LOVE_TRAVEL_PLAYWRIGHT_MODULE||'playwright');

async function runMobileChatUx(){
  const live=process.argv.includes('--live');
  const harness=live?null:await startBookingUiHarness(configurationDomains());
  const base=live?String(process.env.LOVE_TRAVEL_LIVE_BASE_URL||'https://lovetravel.viiversion.com').replace(/\/$/,''):harness.base;
  const folder='artifacts/ai-chat-ux';
  await mkdir(folder,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:process.env.LOVE_TRAVEL_BROWSER_CHANNEL||'chromium'});
  const watchdog=setTimeout(()=>process.exit(124),180000);
  const report={source:live?'published frontend, controlled AI responses':'local frontend, controlled AI responses',base,cases:[],errors:[]};
  const cases=[
    {locale:'ru',width:390,height:844,question:'Расскажите, что входит в экскурсию Robinson Beach и что важно знать перед поездкой.',sentence:'Для экскурсии можно выбрать подходящий вариант. Подробности поездки и условия следует прочитать перед подтверждением. '},
    {locale:'en',width:390,height:844,question:'What is included in Robinson Beach and what should I know before the trip?',sentence:'You can choose the suitable tour option. Read the trip details and conditions before confirming your selection. '},
    {locale:'vi',width:360,height:740,question:'Tour Robinson Beach bao gồm những gì và tôi cần biết điều gì trước chuyến đi?',sentence:'Bạn có thể chọn phương án tour phù hợp. Hãy đọc thông tin chuyến đi và các điều kiện trước khi xác nhận lựa chọn. '},
    {locale:'zh',width:320,height:568,question:'Robinson Beach 行程包含什么？出发前需要了解哪些信息？',sentence:'您可以选择适合的行程选项。请在确认选择之前阅读行程详情和相关条件。'},
    {locale:'ko',width:360,height:740,question:'Robinson Beach 투어에는 무엇이 포함되며 여행 전에 무엇을 알아야 하나요?',sentence:'알맞은 투어 옵션을 선택할 수 있습니다. 선택을 확정하기 전에 여행 정보와 조건을 읽어 주세요. '},
  ];
  const contrast=(foreground,background)=>{
    const lum=value=>{
      const rgb=value.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4);
      return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
    };
    const a=lum(foreground),b=lum(background);
    return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
  };
  try{
    for(const row of cases){
      const context=await browser.newContext({viewport:{width:row.width,height:row.height}});
      const mutations=[],errors=[];
      const reply=((row.sentence.repeat(50)).slice(0,1600)+'\n'+row.sentence).trim();
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(request.method()==='POST'){
          let action='';try{action=String(request.postDataJSON()?.action||'').toUpperCase();}catch{}
          if(['RESERVE','RECONCILE'].includes(action)||url.pathname==='/api/bookings'||(url.pathname.startsWith('/api/bokun/')&&url.pathname!=='/api/bokun/booking-selection/resolve')){
            mutations.push({path:url.pathname,action});return route.abort();
          }
        }
        if(url.pathname==='/api/ai/chat')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,reply,source:'workers-ai-grounded-sales',degraded:false})});
        if(!live&&!request.url().startsWith(base))return route.fulfill({status:200,contentType:'text/plain',body:''});
        return route.continue();
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(locale=>localStorage.setItem('max-tour-locale-v1',locale),row.locale);
      try{
        await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
        await page.locator('#homeScreen [data-lt-action="ai"]').click({timeout:30000});
        const field=page.locator('#aiScreen.active textarea[name="message"]');
        await field.waitFor({state:'visible'});
        for(let index=0;index<2;index++){
          await field.fill(row.question+(index?' '+row.question:''));await field.press('Enter');
          await page.waitForFunction(reply=>document.querySelector('#aiScreen .ai-msg.bot:last-child .ai-msg-text')?.textContent===reply,reply,{timeout:10000});
        }
        const metrics=()=>page.evaluate(()=>{
          const messages=document.querySelector('#aiScreen .ai-messages'),form=document.querySelector('#aiScreen .ai-consultant-input');
          const user=document.querySelector('#aiScreen .ai-msg.user'),author=user.querySelector('.ai-msg-author');
          const text=document.querySelector('#aiScreen .ai-msg.bot:last-child .ai-msg-text');
          const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
          return {messages:rect(messages),form:rect(form),panel:rect(document.querySelector('#aiScreen .ai-chat-panel')),tail:rect(text),nav:rect(document.querySelector('.bottom-nav')),
            scrollHeight:messages.scrollHeight,clientHeight:messages.clientHeight,scrollWidth:messages.scrollWidth,clientWidth:messages.clientWidth,
            overflowY:getComputedStyle(messages).overflowY,inputPosition:getComputedStyle(form).position,inputFont:getComputedStyle(form.querySelector('textarea')).fontSize,
            foreground:getComputedStyle(user).color,background:getComputedStyle(user).backgroundColor,author:getComputedStyle(author).color};
        });
        const value=await metrics(),ratio=contrast(value.foreground,value.background),authorRatio=contrast(value.author,value.background);
        const background=value.background.match(/[\d.]+/g).map(Number);
        assert.ok(background.length===3||background[3]===1,'User message background is transparent: '+row.locale);
        assert.ok(ratio>=4.5,'Low user message contrast: '+row.locale+' '+ratio);
        assert.ok(authorRatio>=4.5,'Low user author contrast: '+row.locale+' '+authorRatio);
        assert.ok(value.form.top>=value.messages.bottom-1,'Composer overlaps messages: '+row.locale);
        assert.ok(value.form.bottom<=value.nav.top+1,'Composer is hidden by navigation: '+row.locale);
        assert.ok(value.scrollHeight>value.clientHeight,'Long history does not scroll: '+row.locale);
        assert.ok(value.scrollWidth<=value.clientWidth+1,'Horizontal chat overflow: '+row.locale);
        assert.ok(['auto','scroll'].includes(value.overflowY));
        assert.ok(!['sticky','fixed'].includes(value.inputPosition));
        assert.ok(parseFloat(value.inputFont)>=16);
        const messages=page.locator('#aiScreen .ai-messages');
        await messages.evaluate(node=>node.scrollTop=node.scrollHeight);
        const end=await metrics();
        assert.ok(end.tail.bottom<=end.messages.bottom+1,'End of the reply cannot be read: '+row.locale);
        assert.ok(end.tail.bottom<=end.form.top+1,'Reply is covered by the composer: '+row.locale);
        await page.locator('#aiScreen .ai-chat-panel').screenshot({path:folder+'/'+row.locale+'-'+row.width+'x'+row.height+'-reply.png'});
        await messages.evaluate(node=>{
          const user=node.querySelector('.ai-msg.user');
          node.scrollTop+=user.getBoundingClientRect().top-node.getBoundingClientRect().top-12;
        });
        await page.locator('#aiScreen .ai-chat-panel').screenshot({path:folder+'/'+row.locale+'-'+row.width+'x'+row.height+'-user.png'});
        const result={locale:row.locale,width:row.width,height:row.height,contrast:Number(ratio.toFixed(2)),authorContrast:Number(authorRatio.toFixed(2)),inputOverlaps:false,scrollable:true,inputFont:value.inputFont};
        if(row.locale==='ru'){
          await page.setViewportSize({width:390,height:500});
          await field.focus();
          await page.waitForFunction(()=>parseFloat(document.documentElement.style.getPropertyValue('--lt-vv-height'))<=500);
          const reduced=await metrics();
          assert.ok(reduced.form.top>=reduced.messages.bottom-1);
          assert.ok(reduced.form.bottom<=reduced.nav.top+1,'Composer hidden at reduced viewport height');
          assert.ok(reduced.clientHeight>0);
          await page.locator('#aiScreen .ai-chat-panel').screenshot({path:folder+'/ru-390x500-reduced-height.png'});
          result.reducedHeight={height:500,inputOverlaps:false};
        }
        assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);
        report.cases.push(result);console.log(JSON.stringify(result));
      }finally{await context.close();}
    }
    if(harness)assert.equal(harness.upstreamCalls(),0);
  }catch(error){report.errors.push(error.message);throw error;}
  finally{
    clearTimeout(watchdog);
    await writeFile(folder+'/report.json',JSON.stringify(report,null,2));
    await browser.close();if(harness)await harness.close();
  }
}
await runMobileChatUx();
