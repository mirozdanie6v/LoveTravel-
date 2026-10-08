
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../src/lovetravel-domain-tour.js',import.meta.url),'utf8');
const semantic=await readFile(new URL('../src/lovetravel-i18n.js',import.meta.url),'utf8');
function load(){
  const c={Intl,Date,console,localStorage:{getItem:()=> 'en',setItem(){}},
    document:{documentElement:{lang:'en'},addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]},
    DOMParser:class{parseFromString(text){return {body:{textContent:String(text).replace(/<[^>]+>/g,'')}};}}};
  c.globalThis=c;vm.createContext(c);vm.runInContext(semantic,c);
  vm.runInContext(source.replace('  install();','globalThis.__tabs={render:informationTabs,activate:activateInformationTab};'),c);
  return c.__tabs;
}
test('the three tabs retain inclusions, exclusions, important details and cancellation rules',()=>{
  const ui=load();const domain={experience:{id:'1287578',accessibility:['Access detail']}};
  const html=ui.render(domain,['Included item'],['Excluded item'],['Important item'],{title:'Policy',penaltyRules:[{cutoffHours:24,percentage:100},{cutoffHours:48,percentage:0}]});
  for(const text of ['Included item','Excluded item','Important item','Access detail','Policy','100%'])assert.ok(html.includes(text),text);
  assert.equal((html.match(/role="tab"/g)||[]).length,3);
  assert.equal((html.match(/aria-selected="true"/g)||[]).length,1);
  assert.equal((html.match(/role="tabpanel"/g)||[]).length,3);
  assert.equal((html.match(/ hidden>/g)||[]).length,2);
  assert.equal(ui.render({experience:{id:'empty'}},[],[],[],null),'');
});
test('switching an information tab reveals exactly its panel and updates keyboard order',()=>{
  const ui=load();const classes=()=>({toggle(){}});
  const tabs=['included','important','cancellation'].map(key=>({dataset:{ltInfoTab:key},classList:classes(),attrs:{},setAttribute(k,v){this.attrs[k]=v;}}));
  const panels=tabs.map(t=>({dataset:{ltInfoPanel:t.dataset.ltInfoTab},hidden:false}));
  const screen={querySelectorAll:s=>s==='[data-lt-info-tab]'?tabs:panels};
  ui.activate(screen,tabs[1]);
  assert.deepEqual(panels.map(p=>p.hidden),[true,false,true]);
  assert.deepEqual(tabs.map(t=>t.attrs['aria-selected']),['false','true','false']);
  assert.deepEqual(tabs.map(t=>t.tabIndex),[-1,0,-1]);
});
