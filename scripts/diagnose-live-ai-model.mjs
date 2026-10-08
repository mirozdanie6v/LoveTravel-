import {createTravelCapabilityBroker} from '../src/travel-capability-broker.js';
import {createBokunProvider} from '../src/bokun-provider.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const provider=createBokunProvider({fetchImpl:fetch,baseUrl:'https://integration.viiversion.com'});
const broker=createTravelCapabilityBroker({provider});
const rows=[
  {locale:'ru',questions:['Что входит в экскурсию Robinson Beach? Дату ещё не выбрали.','Чем она отличается от Hòn Mun?','Какие условия отмены бронирования у этой экскурсии?'],inclusions:/питан|еда|еду|напит/i},
  {locale:'vi',questions:['Tour Robinson Beach bao gồm những gì? Tôi chưa chọn ngày.','Tour này khác Hòn Mun như thế nào?','Điều kiện hủy đặt tour này là gì?'],inclusions:/ăn|uống|ẩm thực|bữa/i},
  {locale:'en',questions:['What is included in Robinson Beach? We have not chosen a date.','How does it differ from Hòn Mun?','What are the booking cancellation conditions for this tour?'],inclusions:/food|drink|meal|lunch/i},
  {locale:'zh',questions:['Robinson Beach 行程包含什么？我们还没选日期。','它与 Hòn Mun 有什么区别？','这个行程的预订取消政策是什么？'],inclusions:/餐饮|饮食|食品|食物|饮料|午餐|膳食/},
  {locale:'ko',questions:['Robinson Beach 투어에는 무엇이 포함되나요? 날짜는 아직 정하지 않았어요.','이 투어는 Hòn Mun과 어떻게 다른가요?','이 투어의 예약 취소 규정은 무엇인가요?'],inclusions:/식사|음식|음료|점심/},
];
const folder='artifacts/ai-model-audit';
await mkdir(folder,{recursive:true});
await writeFile(folder+'/worker.mjs',"import {composeGroundedSalesPlan,createInitialTravelIntent} from '../../src/travel-sales-intelligence.js';\nexport default {\n  async fetch(request,env){\n    if(request.method==='GET')return Response.json({ready:true});\n    const body=await request.json();\n    const raw=[];\n    const binding=env.AI;\n    const modelEnv={AI_MODEL:env.AI_MODEL,TRAVEL_SALES_AI_TIMEOUT_MS:'15000',AI:{async run(model,input){\n      if(body.format==='json_object')input={...input,response_format:{type:'json_object'}};\n      const started=Date.now();\n      try{\n        const result=await binding.run(model,input);\n        raw.push({ms:Date.now()-started,inputChars:JSON.stringify(input).length,result});\n        return result;\n      }catch(error){\n        raw.push({ms:Date.now()-started,code:error.code,message:error.message});\n        throw error;\n      }\n    }}};\n    const started=Date.now();\n    const plan=await composeGroundedSalesPlan({env:modelEnv,message:body.message,locale:body.locale,intent:createInitialTravelIntent(body.locale),evidence:[body.evidence],goal:body.goal||'DETAILS',history:body.history||[]});\n    return Response.json({format:body.format,ms:Date.now()-started,raw,plan});\n  },\n};\n");
await writeFile(folder+'/wrangler.jsonc',JSON.stringify({name:'love-travel-v28',main:'./worker.mjs',compatibility_date:'2026-09-09',vars:{AI_MODEL:'@cf/google/gemma-4-26b-a4b-it'},ai:{binding:'AI'}}));
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--config',folder+'/wrangler.jsonc','--remote','--ip','127.0.0.1','--port','8799'],{stdio:['ignore','pipe','pipe']});
let cliLog='';child.stdout.on('data',data=>{cliLog+=data;});child.stderr.on('data',data=>{cliLog+=data;});
try{
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
    if(child.exitCode!==null)throw new Error('Remote preview exited: '+cliLog.slice(-2500));
    try{const response=await fetch('http://127.0.0.1:8799',{signal:AbortSignal.timeout(2000)});if(response.ok&&(await response.json()).ready){ready=true;break;}}catch{}
    await delay(500);
  }
  if(!ready)throw new Error('Remote preview did not start: '+cliLog.slice(-2500));
  for(const row of rows){
    const history=[];
    for(const [index,message] of row.questions.entries()){
      const evidence=await broker.execute('searchProducts',{lang:'EN',includePickupPlaces:false},{principal:'ORCHESTRATOR'});
      const response=await fetch('http://127.0.0.1:8799',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({format:'json_schema',locale:row.locale,message,evidence,history,goal:index===1?'COMPARE':'DETAILS'}),signal:AbortSignal.timeout(25000)});
      const result=await response.json();
      const plan=result.plan;
      console.log(JSON.stringify({stage:'preview-dialogue',locale:row.locale,index,status:response.status,ms:result.ms,plan,...(plan?.degraded?{raw:result.raw}:{})}));
      if(!response.ok||plan?.source!=='workers-ai-grounded-sales'||plan.degraded)throw new Error('Actual binding consultation failed: '+row.locale+' '+JSON.stringify(result));
      if(['ASK_DATE','ASK_PARTY'].includes(plan.action))throw new Error('Factual consultation asks commercial parameters');
      if(index===0&&!row.inclusions.test(plan.reply))throw new Error('Verified food/drinks inclusion not explained: '+row.locale);
      if(index===1&&!(/Robinson|Робинсон|로빈슨|鲁滨逊/i.test(plan.reply)&&/H[oò]n\s*Mun|Хон.{0,3}Мун|혼.{0,2}문/i.test(plan.reply)))throw new Error('Comparison is not specific to both products: '+row.locale);
      history.push({role:'user',text:message},{role:'assistant',text:plan.reply});
    }
  }
}finally{child.kill('SIGTERM');}
