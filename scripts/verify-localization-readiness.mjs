// Public GETs only. This produces a review sheet, not a linguistic certification.
import {mkdir,writeFile} from 'node:fs/promises';
import {collectTranslatableFields} from '../src/bokun-content-localization.js';
const base=String(process.env.LOVE_TRAVEL_LIVE_BASE_URL||'https://lovetravel.viiversion.com').replace(/\/$/,'');
const locales=['en','ru','vi','ko','zh'];
const reads=await Promise.all(locales.map(async locale=>{
  const response=await fetch(base+'/api/bokun/domain?locale='+locale,{signal:AbortSignal.timeout(45000)});
  const body=await response.json();
  if(!response.ok||!body.ok||body.domains?.length!==2)throw new Error('Domain read failed: '+locale);
  return {locale,domains:body.domains};
}));
const canonical=reads[0].domains,report={base,checkedAt:new Date().toISOString(),method:'public GET only',humanReview:false,products:[]};
for(const original of canonical){
  const source=new Map(collectTranslatableFields(original).map(field=>[field.key,field.source]));
  for(const read of reads){
    const domain=read.domains.find(d=>String(d.experience.id)===String(original.experience.id));
    if(!domain)throw new Error('Missing product in '+read.locale);
    const meta=domain.localization||{},ready=read.locale==='en'||meta.contentReady
      ||meta.source==='viiversion-cache'&&Number(meta.pendingFields)===0
      ||meta.source==='viiversion-cache-stale'&&meta.staleWhileRevalidate&&Number(meta.translatedFields)>0;
    report.products.push({productId:String(domain.experience.id),locale:read.locale,cacheReady:Boolean(ready),localization:meta,
      options:domain.rates.map(rate=>({id:String(rate.id),title:rate.title})),
      fields:collectTranslatableFields(domain).map(field=>({key:field.key,source:source.get(field.key)||'',translation:field.source})),
    });
  }
}
await mkdir('artifacts/consultant-stabilization',{recursive:true});
await writeFile('artifacts/consultant-stabilization/localization-review.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({products:canonical.length,optionLocalePairs:report.products.reduce((sum,row)=>sum+row.options.length,0),
  ready:report.products.filter(row=>row.cacheReady).length,total:report.products.length,humanReview:false}));
if(report.products.some(row=>!row.cacheReady))process.exitCode=1;
