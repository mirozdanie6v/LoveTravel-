import {createTravelCapabilityBroker} from '../src/travel-capability-broker.js';
import {createBokunProvider} from '../src/bokun-provider.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const provider=createBokunProvider({fetchImpl:fetch,baseUrl:'https://integration.viiversion.com'});
const broker=createTravelCapabilityBroker({provider});
const readStarted=Date.now();
const evidence=await broker.execute('searchProducts',{lang:'EN',includePickupPlaces:false},{principal:'ORCHESTRATOR'});
console.log(JSON.stringify({stage:'provider-evidence',readMs:Date.now()-readStarted,chars:JSON.stringify(evidence).length,products:evidence.data.map(row=>({id:row.product.productId,summary:row.product.summary.length,description:row.facts.description.length,itinerary:JSON.stringify(row.facts.itinerary).length,inclusions:JSON.stringify(row.facts.inclusions).length,cancellation:JSON.stringify(row.facts.cancellationPolicy).length}))}));
const folder='artifacts/ai-model-audit';
await mkdir(folder,{recursive:true});
await writeFile(folder+'/worker.mjs',"import {composeGroundedSalesPlan,createInitialTravelIntent} from '../../src/travel-sales-intelligence.js';\nexport default {\n  async fetch(request,env){\n    if(request.method==='GET')return Response.json({ready:true});\n    const body=await request.json();\n    const raw=[];\n    const binding=env.AI;\n    const modelEnv={AI_MODEL:env.AI_MODEL,TRAVEL_SALES_AI_TIMEOUT_MS:'30000',AI:{async run(model,input){\n      if(body.format==='json_object')input={...input,response_format:{type:'json_object'}};\n      const started=Date.now();\n      try{\n        const result=await binding.run(model,input);\n        raw.push({ms:Date.now()-started,inputChars:JSON.stringify(input).length,result});\n        return result;\n      }catch(error){\n        raw.push({ms:Date.now()-started,code:error.code,message:error.message});\n        throw error;\n      }\n    }}};\n    const started=Date.now();\n    const plan=await composeGroundedSalesPlan({env:modelEnv,message:body.message,locale:body.locale,intent:createInitialTravelIntent(body.locale),evidence:[body.evidence],goal:'DETAILS'});\n    return Response.json({format:body.format,ms:Date.now()-started,raw,plan});\n  },\n};\n");
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
  for(const format of ['json_object','json_schema']){
    const response=await fetch('http://127.0.0.1:8799',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({format,locale:'ru',message:'Что входит в экскурсию Robinson Beach? Дату ещё не выбрали.',evidence}),signal:AbortSignal.timeout(45000)});
    const result=await response.json();
    console.log(JSON.stringify({stage:'actual-binding-model',status:response.status,...result}));
  }
}finally{child.kill('SIGTERM');}
