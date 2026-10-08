import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const client=await readFile(new URL('../src/ai-consultant-v5.js',import.meta.url),'utf8');
const semantic=await readFile(new URL('../src/lovetravel-i18n.js',import.meta.url),'utf8');
const network=await readFile(new URL('../src/ai-network-guard-v8.js',import.meta.url),'utf8');
function harness(locale='ru'){
  const storage=new Map();
  const messagesBox={scrollHeight:0,scrollTop:0};
  const root={innerHTML:'',querySelector:selector=>selector==='.ai-messages'?messagesBox:{focus(){}},querySelectorAll:()=>[]};
  const c={Intl,Date,console,URL,Request,Response,Headers,AbortController,DOMException,setTimeout,clearTimeout,
    TOURS:[],localStorage:{getItem:()=>locale,setItem(){}},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    document:{documentElement:{lang:locale},readyState:'loading',addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]},
    location:{origin:'https://lovetravel.viiversion.com',href:'https://lovetravel.viiversion.com/'},
    MutationObserver:class{observe(){}},requestAnimationFrame:callback=>callback()};
  c.globalThis=c;vm.createContext(c);vm.runInContext(semantic,c);
  vm.runInContext(client.replace('    mount,\n    _test:{','    mount,\n    _audit:{handleText,handleClick,state:()=>state,pending:()=>pending,retry:()=>retryMessage},\n    _test:{'),c);
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
