const UPSTREAM_DEFAULT='https://lovetravel.viiversion.com';
const PRODUCT_IDS=Object.freeze(['1287578','1287580']);
const CLIENT_CACHE_TTL_SECONDS=20;
const OFFICIAL_LOGO_URL='https://bizweb.dktcdn.net/100/416/263/themes/809458/assets/logo.png?1787117096236';
const AUDIT_ONLY_KEYS=new Set(['providerData','providerRaw','providerExtensions','coverage']);

function stripAuditOnly(value){
  if(Array.isArray(value)) return value.map(stripAuditOnly);
  if(!value||typeof value!=='object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key])=>!AUDIT_ONLY_KEYS.has(key))
      .map(([key,item])=>[key,stripAuditOnly(item)])
  );
}

function cacheApi(){
  return globalThis.caches?.default||null;
}

function cacheKey(locale,start,end){
  const url=new URL('https://love-travel-client-v2-preview-cache.invalid/tours');
  url.searchParams.set('locale',locale);
  url.searchParams.set('start',start);
  url.searchParams.set('end',end);
  return new Request(url.toString(),{method:'GET'});
}

function clientJsonResponse(data,{cacheState='BYPASS'}={}){
  return new Response(JSON.stringify(data),{
    status:200,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      'x-client-v2-cache':cacheState,
    },
  });
}

async function fromCachedResponse(response){
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');
  headers.set('x-client-v2-cache','HIT');
  return new Response(await response.arrayBuffer(),{
    status:response.status,
    statusText:response.statusText,
    headers,
  });
}

async function storeCachedPayload(cache,key,payload,ctx){
  if(!cache) return;
  const response=new Response(JSON.stringify(payload),{
    status:200,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':`public, max-age=${CLIENT_CACHE_TTL_SECONDS}`,
      'x-content-type-options':'nosniff',
    },
  });
  const work=cache.put(key,response);
  if(ctx?.waitUntil) ctx.waitUntil(work);
  else await work;
}

async function brandLogo(ctx=null){
  const cache=cacheApi();
  const key=new Request('https://love-travel-client-v2-preview-cache.invalid/brand-logo');
  if(cache){
    const hit=await cache.match(key);
    if(hit) return hit;
  }
  const upstream=await fetch(OFFICIAL_LOGO_URL,{
    headers:{accept:'image/avif,image/webp,image/png,image/*,*/*;q=0.8'},
    cf:{cacheEverything:true,cacheTtl:86400},
  });
  if(!upstream.ok) return new Response('',{status:502});
  const headers=new Headers(upstream.headers);
  headers.set('cache-control','public, max-age=86400, immutable');
  headers.set('x-content-type-options','nosniff');
  const response=new Response(upstream.body,{status:upstream.status,headers});
  if(cache){
    const work=cache.put(key,response.clone());
    if(ctx?.waitUntil) ctx.waitUntil(work);
    else void work.catch(()=>{});
  }
  return response;
}

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      ...headers,
    },
  });
}

function vietnamTodayIso(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Ho_Chi_Minh',
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
  }).formatToParts(now);
  const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addIsoDays(iso,days){
  const date=new Date(iso+'T00:00:00Z');
  date.setUTCDate(date.getUTCDate()+Number(days||0));
  return date.toISOString().slice(0,10);
}

async function proxyTours(env,locale='ru',ctx=null){
  const start=vietnamTodayIso();
  const upstream=String(env?.LOVE_TRAVEL_UPSTREAM||UPSTREAM_DEFAULT).replace(/\/+$/,'');
  const end=addIsoDays(start,14);
  const cache=cacheApi();
  const key=cacheKey(locale,start,end);
  if(cache){
    const hit=await cache.match(key);
    if(hit) return fromCachedResponse(hit);
  }

  const url=new URL(upstream+'/api/bokun/domain');
  url.searchParams.set('locale',locale);
  url.searchParams.set('start',start);
  url.searchParams.set('end',end);
  url.searchParams.set('includePickupPlaces','0');

  const response=await fetch(url,{
    headers:{accept:'application/json'},
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload?.ok||!Array.isArray(payload?.domains)){
    return json({ok:false,error:'upstream_bokun_unavailable'},502);
  }

  const ids=payload.domains
    .map(domain=>String(domain?.provider?.productId||domain?.experience?.id||''))
    .filter(Boolean)
    .sort();
  const expected=[...PRODUCT_IDS].sort();
  if(ids.length!==2||ids.some((id,index)=>id!==expected[index])){
    return json({ok:false,error:'unexpected_product_scope',productIds:ids},502);
  }

  const clientPayload={
    ok:true,
    schema:'lovetravel.client-v2.preview.v1',
    source:'production-bokun-read-only',
    vendorId:String(payload.vendorId||'137689'),
    productIds:[...PRODUCT_IDS],
    fetchedAt:payload.fetchedAt||new Date().toISOString(),
    domains:payload.domains.map(stripAuditOnly),
  };
  await storeCachedPayload(cache,key,clientPayload,ctx);
  return clientJsonResponse(clientPayload,{cacheState:cache?'MISS':'BYPASS'});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(url.pathname==='/'){
      return Response.redirect(new URL('/v2/',url),302);
    }
    if(url.pathname==='/v2'){
      return Response.redirect(new URL('/v2/',url),308);
    }

    if(url.pathname==='/brand-logo'){
      if(request.method!=='GET'&&request.method!=='HEAD') return json({ok:false,error:'method_not_allowed'},405,{allow:'GET, HEAD'});
      return brandLogo(ctx);
    }

    if(url.pathname==='/api/tours'){
      if(request.method!=='GET'){
        return json({ok:false,error:'method_not_allowed'},405,{allow:'GET'});
      }
      const locale=String(url.searchParams.get('locale')||'ru').toLowerCase();
      const supported=new Set(['ru','vi','en','zh','ko']);
      return proxyTours(env,supported.has(locale)?locale:'ru',ctx);
    }

    if(url.pathname.startsWith('/api/')){
      return json({ok:false,error:'not_found'},404);
    }

    if(url.pathname==='/v2/'){
      return env.ASSETS.fetch(new Request(new URL('/v2/index.html',url),request));
    }

    return env.ASSETS.fetch(request);
  },
};

export const _test={vietnamTodayIso,addIsoDays,stripAuditOnly,cacheKey};
