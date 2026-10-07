const UPSTREAM_DEFAULT='https://lovetravel.viiversion.com';
const PRODUCT_IDS=Object.freeze(['1287578','1287580']);

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

async function proxyTours(env){
  const start=vietnamTodayIso();
  const upstream=String(env?.LOVE_TRAVEL_UPSTREAM||UPSTREAM_DEFAULT).replace(/\/+$/,'');
  const url=new URL(upstream+'/api/bokun/domain');
  url.searchParams.set('locale','ru');
  url.searchParams.set('start',start);
  url.searchParams.set('end',addIsoDays(start,14));
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

  return json({
    ok:true,
    schema:'lovetravel.client-v2.preview.v1',
    source:'production-bokun-read-only',
    vendorId:String(payload.vendorId||'137689'),
    productIds:[...PRODUCT_IDS],
    fetchedAt:payload.fetchedAt||new Date().toISOString(),
    domains:payload.domains,
  });
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);

    if(url.pathname==='/'){
      return Response.redirect(new URL('/v2/',url),302);
    }
    if(url.pathname==='/v2'){
      return Response.redirect(new URL('/v2/',url),308);
    }

    if(url.pathname==='/api/tours'){
      if(request.method!=='GET'){
        return json({ok:false,error:'method_not_allowed'},405,{allow:'GET'});
      }
      return proxyTours(env);
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

export const _test={vietnamTodayIso,addIsoDays};
