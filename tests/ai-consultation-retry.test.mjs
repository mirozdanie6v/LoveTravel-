import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const client=(await readFile(new URL('../src/ai-consultant-v5.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const semantic=await readFile(new URL('../src/lovetravel-i18n.js',import.meta.url),'utf8');
const network=await readFile(new URL('../src/ai-network-guard-v8.js',import.meta.url),'utf8');
const conversationClient=await readFile(new URL('../src/lovetravel-conversation.js',import.meta.url),'utf8');
function harness(locale='ru',savedState=null,storage=new Map()){
  const events=new EventTarget();
  const messagesBox={scrollHeight:0,scrollTop:0};
  const root={innerHTML:'',querySelector:selector=>selector==='.ai-messages'?messagesBox:{focus(){}},querySelectorAll:()=>[]};
  const c={Intl,Date,console,URL,Request,Response,Headers,AbortController,AbortSignal,DOMException,crypto,CustomEvent,setTimeout,clearTimeout,
    addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),
    TOURS:[],localStorage:{getItem:()=>locale,setItem(){}},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    document:{documentElement:{lang:locale},readyState:'loading',addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]},
    location:{origin:'https://lovetravel.viiversion.com',href:'https://lovetravel.viiversion.com/'},
    MutationObserver:class{observe(){}},requestAnimationFrame:callback=>callback()};
  let applicationFetch;
  Object.defineProperty(c,'fetch',{configurable:true,set:value=>{applicationFetch=value;},get:()=>{
    const captured=applicationFetch;
    return (url,init)=>url==='/api/travel-commerce/session'?Promise.resolve(new Response('{"ok":true}')):captured(url,init);
  }});
  c.globalThis=c;vm.createContext(c);vm.runInContext(semantic,c);vm.runInContext(conversationClient,c);
  if(savedState)storage.set('lovetravel-ai-conversation-v1',JSON.stringify({...savedState,conversationId:c.LoveTravelConversation.id()}));
  vm.runInContext(client.replace('    _test:{','    _audit:{handleText,handleClick,deleteSavedData,state:()=>state,pending:()=>pending,retry:()=>retryMessage},\n    _test:{'),c);
  return {c,root,storage};
}
for(const locale of ['ru','vi','en','zh','ko']){
  test('AI failure and retry stay visible without duplicate user messages: '+locale,async()=>{
    const {c,root}=harness(locale);let requests=0;
    c.fetch=async()=>{requests++;throw new Error('Simulated network failure');};
    const ui=c.MaxTourAI._audit;
    await ui.handleText('What is included in Hon Mun?',root);
    assert.equal(ui.pending(),false);
    assert.ok(root.innerHTML.includes(c.LoveTravelI18n.t('ai.unavailable')));
    assert.ok(root.innerHTML.includes(c.LoveTravelI18n.t('ai.retry')));
    assert.ok(root.innerHTML.includes(c.LoveTravelI18n.t('ai.contactConsultant')));
    assert.match(root.innerHTML,/data-ai-contact href="https:\/\/nhatranglove\.com\/lien-he" target="_blank" rel="noopener noreferrer"/);
    assert.equal(requests,1,'Offering a consultant must not send a message automatically');
    assert.ok(root.innerHTML.includes('data-ai-action="retry"'));
    assert.equal(ui.state().messages.filter(item=>item.role==='user').length,1);
    c.fetch=async()=>{requests++;return new Response(JSON.stringify({ok:true,reply:'The tour includes a boat.',source:'workers-ai-grounded-sales'}),{headers:{'content-type':'application/json'}});};
    await ui.handleText(ui.retry(),root,{retry:true});
    assert.equal(requests,2);
    assert.equal(ui.pending(),false);
    assert.equal(ui.state().messages.filter(item=>item.role==='user').length,1);
    assert.equal(ui.state().messages.at(-1).text,'The tour includes a boat.');
    assert.ok(!root.innerHTML.includes('data-ai-action="retry"'));
  });
}

test('a server AI-unavailable reply is presented as a retryable failure',async()=>{
  const {c,root}=harness();
  c.fetch=async()=>new Response(JSON.stringify({ok:true,reply:'Unavailable',degraded:true,source:'deterministic-grounded-fallback'}));
  await c.MaxTourAI._audit.handleText('What is included?',root);
  assert.ok(root.innerHTML.includes(c.LoveTravelI18n.t('ai.unavailable')));
  assert.ok(root.innerHTML.includes('data-ai-action="retry"'));
  assert.ok(root.innerHTML.includes(c.LoveTravelI18n.t('ai.contactConsultant')));
});

test('saved unavailable replies offer the official contact without treating quoted user text as an error',()=>{
  const {c:first}=harness();const text=first.LoveTravelI18n.t('ai.unavailable');
  const {c,root}=harness('ru',{slots:{},messages:[{role:'bot',text},{role:'user',text}]});
  c.MaxTourAI.mount(root);
  assert.equal((root.innerHTML.match(/data-ai-contact/g)||[]).length,1);
  assert.ok(root.innerHTML.includes(c.LoveTravelI18n.t('ai.contactConsultant')));
});

test('network compatibility guards cannot replace the authoritative server reply',async()=>{
  const {c,storage}=harness();
  storage.set('max-tour-ai-origin-v20',JSON.stringify({origin:'Нячанг'}));
  storage.set('max-tour-ai-location-v6',JSON.stringify({origin:'Нячанг'}));
  storage.set('max-tour-ai-consultant-v5',JSON.stringify({slots:{origin:'Нячанг'},recommendations:[]}));
  c.fetch=async()=>new Response(JSON.stringify({ok:true,reply:'Могу подобрать варианты по вашей просьбе.',source:'workers-ai-grounded-sales'}));
  vm.runInContext(network,c);
  const result=await(await c.fetch('/api/ai/chat',{method:'POST',body:JSON.stringify({message:'Хочу море',context:{origin:'Нячанг'}})})).json();
  assert.equal(result.reply,'Могу подобрать варианты по вашей просьбе.');
  assert.equal(result.source,'workers-ai-grounded-sales');
});
for(const [locale,pendingText] of Object.entries({ru:'Подбираю…',vi:'Đang tìm...',en:'Finding options…',zh:'正在查询…',ko:'찾는 중…'})){
  test('temporary UI status is never sent as conversation history: '+locale,async()=>{
    const {c,root}=harness(locale);let payload;
    c.fetch=async(_url,init)=>{payload=JSON.parse(init.body);return new Response(JSON.stringify({ok:true,reply:'The tour includes food and drinks.',source:'workers-ai-grounded-sales'}));};
    await c.MaxTourAI._audit.handleText('What is included?',root);
    assert.ok(payload.history.every(row=>row.text!==pendingText));
    assert.equal(payload.history.at(-1).role,'user');
    assert.equal(payload.history.at(-1).text,'What is included?');
  });
}


test('reply paragraphs and lists retain every character while escaping provider text',()=>{
  const {c}=harness();const format=c.MaxTourAI._test.renderReplyText;
  const text='First paragraph.\n\nOptions:\n1. Robinson & Hon Mun\n2. Robinson <img src=x onerror=alert(1)>\n\nTotal: $98.00 for 2 adults.';
  const html=format(text);
  assert.match(html,/<p>First paragraph\.<\/p>/);
  assert.match(html,/<ol class="ai-reply-list">/);
  assert.equal((html.match(/<li>/g)||[]).length,2);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('$98.00 for 2 adults.'));
  assert.equal(html.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'),text);
});

test('saved long replies gain paragraphs without losing or rewriting sentences in any locale',()=>{
  for(const [locale,sentence] of [['ru','В экскурсию входит трансфер. '],['en','The tour includes transport. '],['vi','Tour bao gồm xe đưa đón. '],['zh','行程包含接送。'],['ko','투어에는 교통편이 포함됩니다. ']]){
    const {c}=harness(locale);const text=sentence.repeat(30);const html=c.MaxTourAI._test.renderReplyText(text);
    assert.ok((html.match(/<p>/g)||[]).length>1,locale);
    assert.equal(html.replace(/<[^>]+>/g,''),text,locale);
  }
});

test('an answer does not reopen the keyboard or scroll a separate message viewport',async()=>{
  const {c,root}=harness();let focused=0;const scrolled=[];
  root.querySelector=selector=>selector==='.ai-msg:last-child'?{scrollIntoView:value=>scrolled.push(value)}:{focus:()=>focused++};
  c.fetch=async()=>new Response(JSON.stringify({ok:true,reply:'The tour includes transport.'}));
  await c.MaxTourAI._audit.handleText('What is included?',root);
  assert.equal(focused,0);
  assert.ok(scrolled.length>=2);
  assert.equal(scrolled.at(-1).block,'start');
});


test('a consultant remount preserves the active draft and cursor without reintroducing keyboard focus after an answer',()=>{
  const {c,root}=harness();let focused=0,cursor;
  let field={value:'Завтра нас двое',selectionStart:4,selectionEnd:7};
  c.document.activeElement=field;
  let markup='';
  Object.defineProperty(root,'innerHTML',{get:()=>markup,set:value=>{markup=value;field={value:'',focus(){focused++;c.document.activeElement=field;},setSelectionRange(a,b){cursor=[a,b];}};}});
  root.querySelector=selector=>selector==='textarea[name="message"]'?field:null;
  c.MaxTourAI.mount(root);
  assert.equal(field.value,'Завтра нас двое');assert.deepEqual(cursor,[4,7]);assert.equal(focused,1);
  c.MaxTourAI._audit.handleClick(root,{target:{closest:()=>({dataset:{aiAction:'clear'}})}});
  assert.equal(field.value,'','Explicit Clear must discard the typed draft');
});

for(const locale of ['ru','vi','en','zh','ko']){
  test('Clear isolates the next request and discards a late reply: '+locale,async()=>{
    const {c,root}=harness(locale);let finish,oldHeader,newHeader;
    c.fetch=(_url,init)=>{oldHeader=new Headers(init.headers).get('x-lt-conversation-id');return new Promise(resolve=>{finish=resolve;});};
    const old=c.MaxTourAI._audit.handleText('Book for two adults and a child tomorrow.',root);
    await new Promise(resolve=>setImmediate(resolve));
    c.MaxTourAI._audit.handleClick(root,{target:{closest:()=>({dataset:{aiAction:'clear'}})}});
    assert.equal(c.MaxTourAI._audit.pending(),false);
    c.fetch=async(_url,init)=>{newHeader=new Headers(init.headers).get('x-lt-conversation-id');const body=JSON.parse(init.body);assert.ok(!body.history.some(row=>row.text.includes('two adults')));return new Response(JSON.stringify({ok:true,reply:'Which tour would you like?',agent:{nextQuestionCode:'PREFERENCE'}}));};
    await c.MaxTourAI._audit.handleText('I want to book.',root);
    finish(new Response(JSON.stringify({ok:true,reply:'Old quote: two adults, one child.'})));await old;
    assert.notEqual(oldHeader,newHeader);assert.equal(newHeader,c.LoveTravelConversation.id());
    assert.equal(c.MaxTourAI._audit.state().messages.at(-1).text,'Which tour would you like?');
    assert.ok(!root.innerHTML.includes('Old quote'));assert.equal(c.MaxTourAI._audit.pending(),false);
  });
  test('Server state owns participants and ready-form next steps: '+locale,async()=>{
    const {c,root}=harness(locale);
    const calls=[];c.fetch=async(_url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify({ok:true,reply:'Ready for the form.',intent:{party:{adults:1,children:[],infants:0}},partyCounts:{ADULT:1,CHILD:0,INFANT:0},agent:{nextQuestionCode:'OPEN_CONFIGURATOR'}}));};
    await c.MaxTourAI._audit.handleText('Нет детей',root);
    assert.equal(c.MaxTourAI._audit.state().slots.children.length,0);assert.equal(c.MaxTourAI._audit.state().slots.adults,1);
    assert.ok(!('people' in calls[0].context));assert.ok(!root.innerHTML.includes('data-ai-action="quick"'));
    await c.MaxTourAI._audit.handleText('Сколько стоит билет для ребёнка?',root);
    assert.equal(c.MaxTourAI._audit.state().slots.children.length,0);
  });
  test('A past date cannot block subsequent factual consultation: '+locale,async()=>{
    const {c,root}=harness(locale,{slots:{dateError:'2020-01-01'},messages:[]});let count=0;
    c.fetch=async()=>{count++;return new Response(JSON.stringify({ok:true,reply:'Lunch is included.',intent:{party:{adults:0,children:[],infants:0}}}));};
    await c.MaxTourAI._audit.handleText('What is included in Hon Mun?',root);
    assert.equal(count,1);assert.equal(c.MaxTourAI._audit.state().messages.at(-1).text,'Lunch is included.');
  });
}
test('Changing locale continues one conversation; Clear starts a fresh one in every locale',async()=>{
  const {c,root,storage}=harness('ru');c.fetch=async()=>new Response(JSON.stringify({ok:true,reply:'Robinson has several options.'}));
  await c.MaxTourAI._audit.handleText('Tell me about Robinson.',root);const id=c.LoveTravelConversation.id();
  for(const locale of ['vi','en','zh','ko']){
    const next=harness(locale,null,storage);assert.equal(next.c.LoveTravelConversation.id(),id);
    assert.ok(next.c.MaxTourAI._audit.state().messages.some(row=>row.text==='Tell me about Robinson.'));
  }
  c.MaxTourAI._audit.handleClick(root,{target:{closest:()=>({dataset:{aiAction:'clear'}})}});
  const next=harness('en',null,storage);assert.notEqual(next.c.LoveTravelConversation.id(),id);
  assert.equal(next.c.MaxTourAI._audit.state().messages.length,1);
});


test('Structured snorkeling preferences cannot turn a verified recommendation into a UI failure',async()=>{
  const {c,root}=harness('ru');
  c.TOURS.push({id:'1287580',title:'Hon Mun',city:'Нячанг',group:{adult:'$49',from:'$49',departures:[]},individual:{from:'—'},tags:['snorkeling'],audience:[]});
  c.fetch=async()=>new Response(JSON.stringify({ok:true,reply:'Hon Mun costs $98 for two adults.',bookingSelection:{productId:'1287580'},intent:{party:{adults:2,children:[],infants:0},preferences:[{code:'SNORKELING',weight:1}]},agent:{nextQuestionCode:'OPEN_CONFIGURATOR'}}));
  await c.MaxTourAI._audit.handleText('Нас двое взрослых, хотим завтра на снорклинг с трансфером от Oceanus. Что посоветуете?',root);
  assert.equal(c.MaxTourAI._audit.state().messages.at(-1).text,'Hon Mun costs $98 for two adults.');
  assert.ok(root.innerHTML.includes('data-tour-id="1287580"'));assert.equal(c.MaxTourAI._audit.retry(),null);
  assert.ok(!root.innerHTML.includes('data-ai-action="quick"'));
});


test('Missing conversation runtime cannot silently submit against an old persistent cookie',async()=>{
 const {c,root}=harness();let requests=0;c.fetch=async()=>{requests++;throw Error('Must not send unscoped request')};
 const runtime=c.LoveTravelConversation;vm.runInContext("globalThis.LoveTravelConversation=undefined",c);
 await c.MaxTourAI._audit.handleText('Хочу забронировать',root);assert.equal(requests,0);assert.equal(c.MaxTourAI._audit.state().slots.children.length,0);
 c.LoveTravelConversation=runtime;c.fetch=async()=>{requests++;return new Response(JSON.stringify({ok:true,reply:'На какую дату?',intent:{party:{adults:0,children:[],infants:0}},agent:{nextQuestionCode:'DATE'}}));};
 await c.MaxTourAI._audit.handleText('Хочу забронировать',root);assert.equal(requests,1);assert.equal(c.MaxTourAI._audit.state().messages.at(-1).text,'На какую дату?');
});

test('a server form invitation opens the existing configurator without another confirmation message',async()=>{
  const {c,root}=harness('en');
  c.TOURS.push({id:'1287578',title:'Robinson',group:{adult:'$49'}});
  const calls=[];
  c.openTour=id=>calls.push('tour:'+id);
  c.LoveTravelBookingConfigurator={
    ready:async()=>{calls.push('ready');return true;},
    refreshTransaction:async()=>({selection:{productId:'1287578',rateId:'201'}}),
    applySelection:async value=>calls.push('rate:'+value.rateId),open:()=>calls.push('open'),
  };
  c.fetch=async()=>new Response(JSON.stringify({ok:true,reply:'Opening the form.',uiAction:'OPEN_CONFIGURATOR',
    bookingSelection:{productId:'1287578',rateId:'201'},agent:{nextQuestionCode:'OPEN_CONFIGURATOR'}}));
  await c.MaxTourAI._audit.handleText('Yes.',root);
  assert.deepEqual(calls,['tour:1287578','ready','rate:201','open']);
  assert.equal(c.MaxTourAI._audit.state().messages.filter(m=>m.role==='bot'&&m.text.includes('Opening')).length,1);
});

test('the card shows the bound exact total with cents, and discards mismatched or expired quotes',async()=>{
  const {c,root}=harness('en');c.TOURS.push({id:'1287578',title:'Robinson',group:{adult:'$49'}});
  const result={ok:true,reply:'Your total is 97.09 USD.',tourId:'1287578',
    transaction:{transactionId:'txn-1',revision:4,quote:{transactionId:'txn-1',revision:2,status:'ACTIVE',selectionFingerprint:'current',
      expiresAt:new Date(Date.now()+60000).toISOString(),price:{amount:97.09,currency:'USD'},offer:{date:'2026-10-13',rateRef:{externalId:'201'}}}},
    quoteBinding:{transactionId:'txn-1',transactionRevision:4,quoteRevision:2,productId:'1287578',rateId:'201',selectionFingerprint:'current'}};
  c.fetch=async()=>new Response(JSON.stringify(result));
  await c.MaxTourAI._audit.handleText('What is the price?',root);
  assert.equal(c.MaxTourAI.pricePresentation('1287578').amount,'97.09 USD');
  assert.equal(c.MaxTourAI.pricePresentation('1287580'),null);
  result.quoteBinding.selectionFingerprint='other';
  await c.MaxTourAI._audit.handleText('Check again',root);assert.equal(c.MaxTourAI.pricePresentation('1287578'),null);
  result.quoteBinding.selectionFingerprint='current';result.transaction.quote.expiresAt=new Date(Date.now()-1).toISOString();
  await c.MaxTourAI._audit.handleText('Check once more',root);assert.equal(c.MaxTourAI.pricePresentation('1287578'),null);
});

test('successful deletion resets displayed history only after the server confirms it',async()=>{
  const {c,root}=harness('en');c.confirm=()=>true;
  c.fetch=async()=>new Response('{"ok":true,"reply":"Lunch is included."}');
  await c.MaxTourAI._audit.handleText('What is included?',root);
  const oldId=c.LoveTravelConversation.id();
  c.fetch=async(url,init)=>{assert.equal(url,'/api/travel-commerce/conversation');assert.equal(JSON.parse(init.body).action,'DELETE_SAVED_DATA');return new Response('{"ok":true,"deleted":1}');};
  await c.MaxTourAI._audit.deleteSavedData(root);
  assert.notEqual(c.LoveTravelConversation.id(),oldId);
  assert.ok(!c.MaxTourAI._audit.state().messages.some(m=>m.text==='Lunch is included.'));
  assert.equal(c.MaxTourAI._audit.pending(),false);
});

test('a verified fallback preserves useful facts and offers model retry without duplicating the user message',async()=>{
 const {c,root}=harness('ko');let calls=0;const ids=[];
 c.fetch=async(_url,init)=>{ids.push(JSON.parse(init.body).requestId);calls++;return new Response(JSON.stringify(calls===1
  ?{ok:true,reply:'Lunch is included.',degraded:false,generationFailed:true,source:'deterministic-grounded-fallback',agent:{replyFailureReason:'timeout'}}
  :{ok:true,reply:'Lunch and transport are included.',generationFailed:false,source:'workers-ai-grounded-sales'}));};
 const ui=c.MaxTourAI._audit;
 await ui.handleText('What is included?',root);
 assert.ok(root.innerHTML.includes('Lunch is included.'));assert.ok(root.innerHTML.includes('data-ai-action="retry"'));
 assert.equal(ui.state().messages.filter(m=>m.role==='user').length,1);
 await ui.handleText(ui.retry(),root,{retry:true});
 assert.equal(calls,2);assert.equal(ids[0],ids[1]);assert.equal(ui.state().messages.filter(m=>m.role==='user').length,1);
 assert.ok(root.innerHTML.includes('Lunch and transport are included.'));assert.ok(!root.innerHTML.includes('data-ai-action="retry"'));
});