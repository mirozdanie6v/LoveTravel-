
// Existing production frontend with the real API/DO/store running locally.
// Upstream booking requests are rejected, even if a UI regression tried one.
import { configurationDomains } from '../tests/fixtures/booking-configurator-domains.mjs';
import { startBookingUiHarness } from '../tests/helpers/booking-ui-harness.mjs';
const fixtures=await startBookingUiHarness(configurationDomains(),{delayMs:1200});
console.log('Fixture preview (all configuration dimensions, delayed provider): '+fixtures.base);
let live=null;
if(process.argv.includes('--live')){
  const get=async locale=>{
    const response=await fetch('https://lovetravel.viiversion.com/api/bokun/domain?locale='+locale+'&includePickupPlaces=1',{signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw new Error('Read-only domain request failed: '+response.status);
    return (await response.json()).domains;
  };
  const [canonical,presentation]=await Promise.all([get('en'),get('ru')]);
  live=await startBookingUiHarness(canonical,{delayMs:1200,presentationDomains:presentation});
  console.log('Real product preview (public GET snapshots, local transactions): '+live.base);
}
process.on('SIGINT',async()=>{
  console.log(JSON.stringify({fixtureUpstreamCalls:fixtures.upstreamCalls(),liveUpstreamCalls:live?.upstreamCalls()||0,
    mutationAttempts:[...fixtures.requests,...(live?.requests||[])].filter(r=>['RESERVE','RECONCILE'].includes(r.body?.action))}));
  await fixtures.close();if(live) await live.close();process.exit(0);
});
