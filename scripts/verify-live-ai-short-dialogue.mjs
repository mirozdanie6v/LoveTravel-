import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=String(process.env.LOVE_TRAVEL_LIVE_BASE_URL||'https://lovetravel.viiversion.com').replace(/\/$/,'');
const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
const today=Object.fromEntries(parts.map(p=>[p.type,p.value]));
const tomorrow=new Date(Date.UTC(Number(today.year),Number(today.month)-1,Number(today.day))+86400000).toISOString().slice(0,10);
const cases=[
 {locale:'ru',messages:['Хочу забронировать Robinson и Mini Beach.','Завтра.','Двое.','Без детей.','Заберите от Oceanus.','Да.','Что входит в выбранную экскурсию?']},
 {locale:'en',messages:['Book Robinson & Mini Beach.','Tomorrow.','Two.','No children.','Pickup from Oceanus.','Yes.','What is included in the selected tour?']},
];
const folder='artifacts/ai-short-dialogue';await mkdir(folder,{recursive:true});
const report={source:'published API, controlled audit conversations; not user transcripts',cases:[],providerBookings:0};
for(const row of cases){
 const cookies=new Map(),turns=[];
 const call=async(path,body)=>{
   const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-max-tour-locale':row.locale,...(cookies.size?{cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
   for(const value of response.headers.getSetCookie?.()||[]){const pair=value.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}
   assert.ok(response.ok,'HTTP '+response.status+' '+path);return response.json();
 };
 let shoppingId=null;const summaries=[];
 for(const [index,message] of row.messages.entries()){
   const history=turns.flatMap(t=>[{role:'user',text:t.message},{role:'assistant',text:t.reply}]).slice(-10);
   let answer=await call('/api/ai/chat',{locale:row.locale,message,history});
   if(answer.degraded&&['timeout','output_truncated','invalid_json'].includes(answer.agent?.replyFailureReason)){
     answer=await call('/api/ai/chat',{locale:row.locale,message,history});
   }
   assert.ok(answer.ok&&!answer.degraded,'Consultant failed: '+row.locale+' step '+index);
   assert.equal(answer.agent.mutationExecuted,false);
   assert.ok(answer.shoppingSession?.id);
   if(shoppingId)assert.equal(answer.shoppingSession.id,shoppingId,'Session reset');else shoppingId=answer.shoppingSession.id;
   assert.equal(answer.intent.optionPreference?.rateRef.externalId,'2623668','Option lost');
   if(index>=1)assert.equal(answer.intent.dateConstraint?.exact,tomorrow,'Date lost');
   if(index===2){assert.equal(answer.intent.party.adults,0,'Unclarified total became two adults');assert.equal(answer.agent.action,'ASK_PARTY');}
   if(index>=3){assert.equal(answer.intent.party.adults,2,'Adults lost');assert.deepEqual(answer.intent.party.children,[]);}
   if(index>=4)assert.equal(answer.intent.hotel,'Oceanus','Hotel lost');
   const summary={locale:row.locale,index,source:answer.source,action:answer.agent.action,reply:answer.reply,date:answer.intent.dateConstraint?.exact,adults:answer.intent.party.adults,rate:answer.intent.optionPreference.rateRef.externalId};
   summaries.push(summary);console.log(JSON.stringify(summary));
   turns.push({message,reply:answer.reply});
 }
 const payload=await call('/api/travel-commerce/transaction');
 assert.ok(payload.ok&&payload.transaction,'Transaction envelope missing');
 const tx=payload.transaction;
 assert.equal(tx.providerBooking||null,null,'A provider booking exists');
 assert.notEqual(tx.state,'CONFIRMED');
 assert.equal(tx.selection?.productRef.externalId,'1287578');
 assert.equal(tx.selection?.rateRef.externalId,'2623668');
 assert.equal(tx.selection?.date,tomorrow);
 assert.equal(tx.selection?.participants.find(p=>p.role==='ADULT')?.count,2);
 assert.ok(tx.quote?.price?.amount>0,'Authoritative Quote missing');
 assert.equal(tx.quote?.offer?.rateRef.externalId,'2623668');
 report.cases.push({locale:row.locale,steps:summaries,quote:tx.quote.price,state:tx.state,providerBooking:null});
 await writeFile(folder+'/report.json',JSON.stringify(report,null,2));
}
