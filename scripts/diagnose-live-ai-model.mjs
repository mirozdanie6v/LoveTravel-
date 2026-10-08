import {createTravelCapabilityBroker} from '../src/travel-capability-broker.js';
import {createBokunProvider} from '../src/bokun-provider.js';
import {composeGroundedSalesPlan,createInitialTravelIntent} from '../src/travel-sales-intelligence.js';

const provider=createBokunProvider({fetchImpl:fetch,baseUrl:'https://integration.viiversion.com'});
const broker=createTravelCapabilityBroker({provider});
const readStarted=Date.now();
const evidence=await broker.execute('searchProducts',{lang:'EN',includePickupPlaces:false},{principal:'ORCHESTRATOR'});
console.log(JSON.stringify({stage:'provider-evidence',readMs:Date.now()-readStarted,chars:JSON.stringify(evidence).length,products:evidence.data.map(row=>({id:row.product.productId,summary:row.product.summary.length,description:row.facts.description.length,itinerary:JSON.stringify(row.facts.itinerary).length,inclusions:JSON.stringify(row.facts.inclusions).length,cancellation:JSON.stringify(row.facts.cancellationPolicy).length}))}));
const model='@cf/google/gemma-4-26b-a4b-it';
for(const format of ['json_object','json_schema']){
  const env={AI_MODEL:model,TRAVEL_SALES_AI_TIMEOUT_MS:'30000',AI:{async run(_model,input){
    if(format==='json_object')input={...input,response_format:{type:'json_object'}};
    const started=Date.now();
    const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/ai/run/'+model,{
      method:'POST',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(35000),
    });
    const body=await response.json();
    console.log(JSON.stringify({stage:'raw-model',format,status:response.status,ms:Date.now()-started,inputChars:JSON.stringify(input).length,errors:body.errors,result:body.result}));
    if(!response.ok||body.success===false)throw new Error('Diagnostic REST request failed: HTTP '+response.status);
    return body.result;
  }}};
  const started=Date.now();
  const plan=await composeGroundedSalesPlan({env,message:'Что входит в экскурсию Robinson Beach? Дату ещё не выбрали.',locale:'ru',intent:createInitialTravelIntent('ru'),evidence:[evidence],goal:'DETAILS'});
  console.log(JSON.stringify({stage:'validated-model',format,ms:Date.now()-started,plan}));
}
