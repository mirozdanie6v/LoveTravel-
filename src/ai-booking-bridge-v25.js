(() => {
  'use strict';

  if (typeof document === 'undefined') return;

  let transitionInFlight=false;

  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();

  async function openStructuredBooking(tourId){
    const id=clean(tourId);
    if(!id) return false;
    if(typeof globalThis.openTour==='function') globalThis.openTour(id);

    const configurator=globalThis.LoveTravelBookingConfigurator;
    if(!configurator) return false;

    const snapshot=await configurator.refreshTransaction?.();
    const txSelection=snapshot?.selection||null;
    if(txSelection&&String(txSelection.productId||'')===id){
      await configurator.applySelection?.(txSelection);
    }else{
      await configurator.resolve?.();
    }
    configurator.open?.();
    return true;
  }

  async function handleAiBookingClick(event){
    const target=event.target instanceof Element?event.target:null;
    const button=target?.closest?.('#aiScreen [data-ai-action="book-tour"]');
    if(!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(transitionInFlight) return;

    const tourId=clean(button.dataset.id||button.closest('[data-tour-id]')?.dataset.tourId||'');
    if(!tourId) return;

    transitionInFlight=true;
    try{
      await openStructuredBooking(tourId);
    }catch(error){
      console.warn('[LoveTravel AI] structured booking handoff failed:',error?.message||error);
    }finally{
      transitionInFlight=false;
    }
  }

  document.addEventListener('click',event=>{ void handleAiBookingClick(event); },true);

  globalThis.MaxTourAiBookingBridgeV25={
    openStructuredBooking,
  };
})();
