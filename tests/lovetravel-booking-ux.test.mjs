
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { configurationDomains } from './fixtures/booking-configurator-domains.mjs';
const source=await readFile(new URL('../src/lovetravel-booking-configurator.js',import.meta.url),'utf8');
const domainSource=await readFile(new URL('../src/lovetravel-domain-tour.js',import.meta.url),'utf8');
const semantic=await readFile(new URL('../src/lovetravel-i18n.js',import.meta.url),'utf8');

function context(selected='ru'){
  const nodes=Object.fromEntries(['dateValue','priceLabel','price','cta'].map(k=>[k,{textContent:''}]));
  const quick={disabled:true,addEventListener(){},removeAttribute(){},querySelector(sel){return {
    '[data-lt-summary-price-label]':nodes.priceLabel,'[data-lt-summary-price]':nodes.price,'[data-lt-summary-cta]':nodes.cta
  }[sel];}};
  const date={hidden:true,querySelector:()=>nodes.dateValue};
  const mount={dataset:{},setAttribute(k,v){this[k]=v;},querySelectorAll:()=>[],querySelector:()=>null};
  const shell={querySelector:()=>mount};
  const screen={dataset:{ltDomainProduct:'1287578'},classList:{add(){},contains:()=>true},
    querySelector(sel){return {'[data-lt-summary-date]':date,'[data-lt-jump-booking]':quick,'.lt-domain-shell':shell}[sel]||null;},
    querySelectorAll:()=>[]};
  const c={Intl,Date,console,CSS:{escape:v=>v},MutationObserver:class{},
    window:{scrollTo(){}},CustomEvent:class{},localStorage:{getItem:()=>selected,setItem(){}},
    document:{documentElement:{lang:selected},addEventListener(){},dispatchEvent(){},querySelectorAll:()=>[],
      querySelector(sel){return {'#tourScreen':screen,'#tourScreen .lt-domain-shell':shell,'#tourScreen [data-lt-jump-booking]':quick}[sel]||null;}},
    DOMParser:class{parseFromString(text){return {body:{textContent:text.replace(/<[^>]+>/g,'')}};}},
    renderTour(){},openTour(){},setTimeout(){},};
  c.globalThis=c;vm.createContext(c);vm.runInContext(semantic,c);
  return {c,screen,mount,nodes,quick,date};
}
function configurator(selected){
  const h=context(selected);
  const exports="globalThis.__ux={renderPending,render,syncDomainSummary,quoteLabel,quoteSummary,localizedRateTitle,localizedRateDescription,setResolution(r){activeProductId=r.product.id;resolutionByProduct.set(activeProductId,r);},setProduct(id){activeProductId=id;}};";
  vm.runInContext(source.replace('  start();',exports),h.c);
  return {...h,ui:h.c.__ux};
}
test('first domain paint has one configurator mount and no temporary rate/date/booking controls',async()=>{
  for(const domain of configurationDomains()){
    const h=context();
    h.c.fetch=async()=>({ok:true,json:async()=>({schema:'lovetravel.bokun-domain.v1',domains:[domain]})});
    vm.runInContext(domainSource,h.c);
    await h.c.LoveTravelDomainTour.renderProduct(domain.experience.id);
    assert.equal((h.screen.innerHTML.match(/data-lt-config=/g)||[]).length,1);
    assert.match(h.screen.innerHTML,/data-lt-jump-booking disabled aria-busy="true"/);
    assert.match(h.screen.innerHTML,/data-lt-summary-date hidden/);
    assert.doesNotMatch(h.screen.innerHTML,/data-lt-domain-rate=|data-lt-domain-slot=|data-lt-sticky-book/);
    assert.doesNotMatch(h.screen.innerHTML,/lt-domain-rates|lt-domain-dates|lt-domain-fieldchips/);
  }
});
test('pending and failed initialization stay visible and cannot activate booking CTA',()=>{
  const h=configurator();h.ui.setProduct('1287578');
  h.ui.renderPending('1287578');
  assert.equal(h.mount['aria-busy'],'true');
  assert.equal(h.quick.disabled,true);
  assert.equal((h.mount.innerHTML.match(/class="lt-booking-step" disabled/g)||[]).length,5);
  assert.doesNotMatch(h.mount.innerHTML,/data-lt-config-continue/);
  h.ui.renderPending('1287578',{failed:true});
  assert.equal(h.mount['aria-busy'],'false');
  assert.match(h.mount.innerHTML,/data-lt-config-retry/);
  assert.match(h.mount.innerHTML,/Не удалось обновить/);
});
test('header and configurator share selected date and exact total; clearing date removes stale summary',()=>{
  const h=configurator();
  const r={product:{id:'1287578'},selection:{rateId:'202'},resolved:{slot:{date:'2030-10-15',startTime:'09:00'},rate:{id:'202',title:'Option 202'},participantTotal:2},
    quote:{available:true,total:130,currency:'USD'},constraints:{rates:[]},errors:[],bookingDataIssues:[]};
  h.ui.setResolution(r);h.ui.render('1287578');
  assert.equal(h.date.hidden,false);
  assert.equal(h.nodes.dateValue.textContent,'15 окт. · 09:00');
  assert.equal(h.nodes.price.textContent,'$130');
  assert.equal(h.nodes.priceLabel.textContent,'Итого');
  assert.match(h.mount.innerHTML,/15 окт\. · 09:00/);
  assert.match(h.mount.innerHTML,/<small>Итого<\/small><strong>\$130/);
  assert.equal(h.quick.disabled,false);
  r.resolved.slot=null;r.quote.available=false;
  r.constraints.rates=[{id:'201',fromPrice:{amount:35,currency:'USD'}},{id:'202',fromPrice:{amount:65,currency:'USD'}}];
  h.ui.render('1287578');
  assert.equal(h.date.hidden,true);
  assert.equal(h.nodes.dateValue.textContent,'');
  assert.equal(h.nodes.priceLabel.textContent,'за человека');
  assert.equal(h.nodes.price.textContent,'от $65');
  assert.match(h.mount.innerHTML,/<small>за человека<\/small><strong>от \$65/);
});
test('rate presentation uses server-localized domain content while preserving provider IDs',()=>{
  for(const lang of ['ru','vi','en','zh','ko']){
    const h=configurator(lang);
    h.c.LoveTravelDomainTour={rateContent:(productId,rateId)=>productId==='1287578'&&rateId==='201'?{title:'Localized title',description:'Localized description'}:null};
    const rate={id:'201',title:'Canonical provider title'};
    assert.equal(h.ui.localizedRateTitle('1287578',rate),'Localized title');
    assert.equal(h.ui.localizedRateDescription('1287578',rate),'Localized description');
    assert.equal(rate.id,'201');
    assert.equal(h.ui.localizedRateTitle('1287580',rate),'Canonical provider title');
    const description=h.ui.localizedRateDescription('1287578',{id:'2623660'});
    assert.ok(description && !description.startsWith('tour.ratePresentation.'));
    assert.notEqual(h.c.LoveTravelI18n.t('booking.loading'),'booking.loading');
  }
});

test('rate maximum alone routes back to guests and does not mark an invalid participant selection complete',()=>{
  const h=configurator();
  const r={product:{id:'1287578'},selection:{rateId:'201'},resolved:{participantTotal:7},
    constraints:{participants:[{ticketCategory:'ADULT',count:7}],rates:[]},quote:{available:true,total:350,currency:'USD'},
    errors:[{code:'above_rate_maximum',path:'participants'}],bookingDataIssues:[]};
  h.ui.setResolution(r);h.ui.render('1287578');
  assert.match(h.nodes.cta.textContent,/Укажите участников/);
  assert.match(h.mount.innerHTML,/class="lt-booking-step " data-lt-step="guests"/);
  assert.match(h.mount.innerHTML,/<span>Укажите участников<\/span>/);
  assert.doesNotMatch(h.mount.innerHTML,/<span class="is-live">/);
});
