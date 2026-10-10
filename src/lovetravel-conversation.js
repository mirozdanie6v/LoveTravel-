(() => {
  'use strict';
  const KEY='lovetravel-active-conversation-v1';
  const MAX_IDLE_MS=24*60*60*1000;
  let active;
  const valid=value=>/^[A-Za-z0-9._:-]{20,160}$/.test(String(value||''));
  function save(){try{sessionStorage.setItem(KEY,JSON.stringify(active));}catch{}}
  function fresh(){return {id:crypto.randomUUID(),touchedAt:Date.now()};}
  try{active=JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{}
  if(!valid(active?.id)||!Number.isFinite(active?.touchedAt)||Date.now()-active.touchedAt>MAX_IDLE_MS)active=fresh();
  save();
  function reset(){
    active=fresh();save();
    globalThis.dispatchEvent?.(new CustomEvent('lovetravel:conversation-reset'));
    return active.id;
  }
  async function request(input,init={}){
    const id=active.id;active.touchedAt=Date.now();save();
    const headers=new Headers(init.headers);headers.set('x-lt-conversation-id',id);
    const controller=new AbortController();
    const abort=()=>controller.abort(new DOMException('Conversation changed','AbortError'));
    globalThis.addEventListener?.('lovetravel:conversation-reset',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(new DOMException('Request timed out','TimeoutError')),35000);
    try{
      const response=await fetch(input,{...init,headers:Object.fromEntries(headers),signal:controller.signal});
      // Await the body too: a clear between response headers and JSON must not restore old state.
      const body=await response.text();
      if(active.id!==id)throw new DOMException('Conversation changed','AbortError');
      return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
    }finally{clearTimeout(timer);globalThis.removeEventListener?.('lovetravel:conversation-reset',abort);}
  }
  globalThis.LoveTravelConversation=Object.freeze({id:()=>active.id,reset,request});
})();
