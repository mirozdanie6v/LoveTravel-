import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const localeFiles=['ru-RU','en-US','vi-VN','zh-CN','ko-KR'];

async function loadRuntime(initial='ru'){
  const storage=new Map([['max-tour-locale-v1',initial]]);
  const documentElement={lang:'',};
  const context={
    console:{error(){},warn(){},log(){}},
    Intl,
    Date,
    CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
    localStorage:{
      getItem:key=>storage.has(key)?storage.get(key):null,
      setItem:(key,value)=>storage.set(key,String(value))
    },
    document:{
      documentElement,
      querySelector(){return null;},
      dispatchEvent(){return true;}
    },
    location:{reload(){}},
  };
  context.globalThis=context;
  vm.createContext(context);
  for(const code of localeFiles){
    const source=await readFile(new URL('../src/locales/'+code+'.js',import.meta.url),'utf8');
    vm.runInContext(source,context,{filename:code+'.js'});
  }
  const core=await readFile(new URL('../src/lovetravel-i18n-core.js',import.meta.url),'utf8');
  vm.runInContext(core,context,{filename:'lovetravel-i18n-core.js'});
  return {context,storage};
}

test('all five locale bundles have identical semantic key coverage',async()=>{
  const {context}=await loadRuntime();
  const report=context.LoveTravelI18n.assertComplete();
  for(const [locale,row] of Object.entries(report)){
    assert.deepEqual(Array.from(row.missing),[],locale+' missing keys');
    assert.deepEqual(Array.from(row.extra),[],locale+' extra keys');
  }
});

test('semantic keys are language-independent identifiers',async()=>{
  const {context}=await loadRuntime();
  for(const [locale,bundle] of Object.entries(context.LoveTravelLocaleRegistry)){
    for(const key of Object.keys(bundle)){
      assert.match(key,/^[a-zA-Z0-9_.-]+$/,locale+' invalid key '+key);
      assert.doesNotMatch(key,/[А-Яа-яЁё\u3400-\u9FFF가-힣]/u);
    }
  }
});

test('core canonicalizes locale and never silently falls back to another language',async()=>{
  const {context}=await loadRuntime('zh');
  assert.equal(context.LoveTravelI18n.locale(),'zh-CN');
  assert.equal(context.LoveTravelI18n.apiLocale(),'zh');
  assert.equal(context.LoveTravelI18n.t('booking.date'),'日期和时间');
  assert.equal(context.LoveTravelI18n.t('missing.critical.key'),'⟦missing.critical.key⟧');
  context.LoveTravelI18n.setLocale('ko',{reload:false});
  assert.equal(context.LoveTravelI18n.locale(),'ko-KR');
  assert.equal(context.LoveTravelI18n.t('booking.date'),'날짜 및 시간');
});

test('Chinese and Korean UI bundles contain no Russian leakage',async()=>{
  const {context}=await loadRuntime();
  for(const locale of ['zh-CN','ko-KR']){
    const values=Object.values(context.LoveTravelLocaleRegistry[locale]).map(String);
    assert.equal(values.filter(value=>/[А-Яа-яЁё]/u.test(value)).length,0,locale+' contains Cyrillic');
  }
  const zh=Object.values(context.LoveTravelLocaleRegistry['zh-CN']).map(String);
  const ko=Object.values(context.LoveTravelLocaleRegistry['ko-KR']).map(String);
  assert.equal(zh.filter(value=>/[가-힣]/u.test(value)).length,0,'Chinese contains Hangul');
  assert.equal(ko.filter(value=>/[\u3400-\u9FFF]/u.test(value)).length,0,'Korean contains Han characters');
});

test('Intl formatting is driven by active locale',async()=>{
  const {context}=await loadRuntime('zh');
  assert.match(context.LoveTravelI18n.formatDate('2026-10-06',{month:'long',day:'numeric'}),/10月|十月/);
  context.LoveTravelI18n.setLocale('ko',{reload:false});
  assert.match(context.LoveTravelI18n.formatDate('2026-10-06',{month:'long',day:'numeric'}),/10월/);
});
