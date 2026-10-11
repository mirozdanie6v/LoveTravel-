import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {correctNativeCardFormats} from '../src/catalog-card-build.mjs';
const manifest=JSON.parse(await readFile(new URL('../source/manifest.json',import.meta.url),'utf8'));
const parts=await Promise.all(manifest.html.parts.map(p=>readFile(new URL('../source/'+p,import.meta.url),'ascii')));
const original=gunzipSync(Buffer.from(parts.join(''),'base64')).toString();
const html=correctNativeCardFormats(original);
const start=html.indexOf('function card(t, wide=false) {'),end=html.indexOf('function priceFacts(',start);
const context=vm.createContext({imageBlock:()=>'<div class="img-wrap"></div>',timeParts:()=>({start:'08:00',finish:'15:00'}),iconSvg:()=>'',groupMin:t=>t.group.from,indivMin:t=>t.individual.from});
vm.runInContext(html.slice(start,end),context);
const tour={id:'1287578',title:'Robinson Beach',city:'Nha Trang',duration:'7h',tags:[]};
test('group-only provider card does not advertise a private tour or empty price',()=>{
  const card=context.card({...tour,group:{from:'35.77 USD'},individual:null});
  assert.match(card,/групповой/);assert.match(card,/35.77 USD/);
  assert.doesNotMatch(card,/индивидуальный|>—</);
  assert.equal((card.match(/class="price"/g)||[]).length,1);
  assert.ok(card.includes("openTour('1287578')"));
});
test('private-only and mixed cards preserve formats actually provided',()=>{
  const privateCard=context.card({...tour,group:null,individual:{from:'200 USD'}});
  assert.match(privateCard,/индивидуальный/);assert.doesNotMatch(privateCard,/групповой/);
  const both=context.card({...tour,group:{from:'35 USD'},individual:{from:'200 USD'}});
  assert.ok(both.includes("групповой / индивидуальный"));
  assert.equal((both.match(/class="price"/g)||[]).length,2);
});
test('card correction leaves every other native runtime function unchanged',()=>{
  const a=original.indexOf('function card(t, wide=false) {'),b=original.indexOf('function priceFacts(',a);
  assert.equal(html.slice(0,start),original.slice(0,a));
  assert.equal(html.slice(end),original.slice(b));
});
