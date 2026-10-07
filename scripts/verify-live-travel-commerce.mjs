// Fresh public provider reads + the local production BookingTransaction flow.
// Never arms a demo token or sends a provider booking mutation.
if(process.env.LIVE_BOKUN_WRITE==='1'){
  throw new Error('Real booking verification is disabled during interface restoration.');
}
process.argv.push('--live');
await import('./verify-restored-booking-ui.mjs');