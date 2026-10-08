
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../src/lovetravel-booking-configurator.js',import.meta.url),'utf8');
const semantic=await readFile(new URL('../src/lovetravel-i18n.js',import.meta.url),'utf8');
function node(attrs={},text=''){
  const values=new Map(Object.entries(attrs));const classes=new Set();
  return {dataset:{},disabled:false,isConnected:true,children:[],events:{},className:'',
    get textContent(){return this.text||text;},set textContent(value){this.text=value;this.children=[];},
    classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),contains:v=>classes.has(v),toggle(v,on){if(on)classes.add(v);else classes.delete(v);}},
    setAttribute:(k,v)=>values.set(k,v),getAttribute:k=>values.get(k)||null,hasAttribute:k=>values.has(k),removeAttribute:k=>values.delete(k),
    querySelector:selector=>selector==='b'?{textContent:text}:null,
    appendChild(child){this.children.push(child);},addEventListener(type,fn){this.events[type]=fn;},
  };
}
function harness(kind){
  const specs={rate:['data-lt-rate',{rateId:'new'}],mode:['data-lt-pickup-mode',{pickup:{mode:'PICKUP'}}],hotel:['data-lt-place',{pickup:{mode:'PICKUP',placeId:'501',roomNumber:''}}]};
  const [attribute,patch]=specs[kind];
  const old=node({[attribute]:'old'},'Previous choice'),chosen=node({[attribute]:'new'},'Chosen '+kind);
  old.classList.add('is-active');old.setAttribute('aria-pressed','true');
  const close=node({'data-lt-sheet-close':''}),originallyDisabled=node();originallyDisabled.disabled=true;
  const input=node(),choices=[old,chosen];
  const root={dataset:{},isConnected:true,status:null,
    querySelector(selector){if(selector==='[data-lt-choice-status]')return this.status;if(selector==='.lt-booking-sheet__header')return {insertAdjacentElement:(_where,n)=>{this.status=n;}};return null;},
    querySelectorAll(selector){return selector==='button,input,select,textarea'?[...choices,close,input,originallyDisabled]:choices;},
  };
  const screen={dataset:{ltDomainProduct:'1287578'},classList:{contains:()=>true}};
  const c={Intl,Date,console,CSS:{escape:v=>v},MutationObserver:class{},localStorage:{getItem:()=> 'en',setItem(){}},
    document:{documentElement:{lang:'en'},addEventListener(){},createElement:()=>node(),querySelector:s=>s==='#tourScreen'?screen:null}};
  c.globalThis=c;vm.createContext(c);vm.runInContext(semantic,c);
  vm.runInContext(source.replace('  start();',"globalThis.__feedback={run:withChoiceFeedback,selection,setResolve(fn){resolve=fn;},start(){activeProductId='1287578';},replaceView(){sheetFocusRevision++;}};"),c);
  c.__feedback.start();
  let complete,reject;const result=new Promise((r,j)=>{complete=r;reject=j;});let requests=0,followup=0;
  c.__feedback.setResolve(()=>{requests++;return result;});
  const args={button:chosen,selector:'['+attribute+']',attribute,patch,after:()=>{followup++;}};
  return {c,ui:c.__feedback,root,args,old,chosen,close,input,originallyDisabled,complete,reject,requests:()=>requests,followup:()=>followup};
}
for(const kind of ['rate','mode','hotel']){
  test(kind+' tap is selected immediately while authoritative resolution is pending',async()=>{
    const h=harness(kind);const pending=h.ui.run('1287578',h.root,h.args);
    assert.equal(h.requests(),1);
    assert.equal(h.followup(),0);
    assert.equal(h.chosen.getAttribute('aria-pressed'),'true');
    assert.equal(h.old.getAttribute('aria-pressed'),'false');
    assert.equal(h.chosen.classList.contains('is-pending'),true);
    assert.equal(h.chosen.getAttribute('aria-busy'),'true');
    assert.match(h.root.status.textContent,/Selected: Chosen .*Checking availability/);
    assert.equal(h.chosen.disabled,true);
    assert.equal(h.input.disabled,true);
    assert.equal(h.close.disabled,false);
    assert.equal(await h.ui.run('1287578',h.root,h.args),null);
    assert.equal(h.requests(),1,'a second tap must not submit another selection');
    h.complete({resolved:{}});await pending;
    assert.equal(h.followup(),1);
    assert.equal(h.chosen.classList.contains('is-pending'),false);
    assert.equal(h.chosen.disabled,false);
    assert.equal(h.originallyDisabled.disabled,true);
    assert.equal(h.root.dataset.ltSelectionPending,undefined);
  });
}
test('a failed check is explained, unlocks controls and can be retried',async()=>{
  const h=harness('hotel');const pending=h.ui.run('1287578',h.root,h.args);
  h.reject(new Error('provider read failed'));await pending;
  assert.equal(h.root.status.getAttribute('role'),'alert');
  assert.match(h.root.status.textContent,/Could not verify/);
  assert.equal(h.chosen.disabled,false);
  assert.equal(h.chosen.getAttribute('aria-busy'),null);
  const retry=h.root.status.children[0];
  assert.equal(retry.textContent,'Try again');
  h.ui.setResolve(async()=>({resolved:{}}));await retry.events.click();
  assert.equal(h.followup(),1);
  assert.equal(h.root.status.className,'lt-choice-status');
});
test('a late reply cannot close, reopen or unlock a replacement sheet',async()=>{
  const h=harness('mode');const pending=h.ui.run('1287578',h.root,h.args);
  h.ui.replaceView();h.root.dataset.ltSelectionPending='new-operation';
  h.complete({resolved:{}});await pending;
  assert.equal(h.followup(),0);
  assert.equal(h.root.dataset.ltSelectionPending,'new-operation');
});
