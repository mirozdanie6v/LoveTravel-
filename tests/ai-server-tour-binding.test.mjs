import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(root, 'src/ai-consultant-v5.js'), 'utf8');

function boot() {
  const store = new Map();
  const context = {
    console,Intl,Date,JSON,Math,String,Number,Array,Object,RegExp,Set,
    sessionStorage:{
      getItem:key=>store.has(key)?store.get(key):null,
      setItem:(key,value)=>store.set(key,String(value)),
      removeItem:key=>store.delete(key),
    },
    document:{documentElement:{},querySelector(){return null;}},
    setTimeout(){return 0;},
    LoveTravelI18n:{
      apiLocale(){return 'ru';}, locale(){return 'ru-RU';},
      t(key){return key;}, formatDate(v){return v;}
    },
    TOURS:[{
      id:'1287578',title:'Robinson',city:'Nha Trang',region:'Khánh Hòa',category:'Island tour',
      tags:['sea'],audience:[],popular:true,group:{adult:'$35.77',from:'$35.77',departures:[]},individual:null,
    }],
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context);
  return {context,store,api:context.MaxTourAI._test};
}

test('client understands Russian collective party form "на двоих"',()=>{
  const {api}=boot();
  const party=api.parseParty('Нас на двоих завтра',{adults:0,children:[],infants:0});
  assert.equal(party.adults,2);
  assert.deepEqual(Array.from(party.children),[]);
});

test('verified server tour id resolves to the exact live catalog tour model',()=>{
  const {api}=boot();
  const item=api.recommendationForTourId('1287578');
  assert.equal(item?.tour?.id,'1287578');
  assert.equal(api.applyServerTour({tourId:'1287578'}),true);
});

test('server metadata is preserved and applied after the AI response',()=>{
  assert.match(source,/tourId:clean\(result\.tourId,120\)/);
  assert.match(source,/faqIntent:clean\(result\.faqIntent,120\)/);
  assert.match(source,/applyServerTour\(result\)/);
});

test('location policy is language-neutral and fixed to Nha Trang for this product',()=>{
  assert.match(source,/state\.slots\.destination==='NHA_TRANG'/);
  assert.doesNotMatch(source,/max-tour-ai-location-v6/);
});
