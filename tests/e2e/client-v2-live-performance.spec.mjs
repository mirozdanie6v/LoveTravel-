import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const base=String(process.env.CLIENT_V2_LIVE_URL||'').replace(/\/+$/,'');
if(!base) throw new Error('CLIENT_V2_LIVE_URL is required');

function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}

function vietnamTodayIso(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Ho_Chi_Minh',
    year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(now);
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addIsoDays(iso,days){
  const date=new Date(iso+'T00:00:00Z');
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}

async function sampleRequest(request,url,count=3){
  const samples=[];
  let bytes=0;
  let status=0;
  for(let i=0;i<count;i+=1){
    const started=performance.now();
    const response=await request.get(url,{timeout:60_000});
    const body=await response.body();
    samples.push(performance.now()-started);
    bytes=body.byteLength;
    status=response.status();
    expect(response.ok()).toBeTruthy();
  }
  return {
    url,
    status,
    samplesMs:samples,
    medianMs:median(samples),
    minMs:Math.min(...samples),
    maxMs:Math.max(...samples),
    payloadBytes:bytes,
  };
}

test('capture live Client v2 performance baseline',async({page,request})=>{
  const outputDir=resolve(process.cwd(),'performance-artifacts');
  await mkdir(outputDir,{recursive:true});

  const today=vietnamTodayIso();
  const end=addIsoDays(today,14);
  const previewApi=await sampleRequest(request,base+'/api/tours?locale=ru');
  const upstreamDomain=await sampleRequest(
    request,
    'https://lovetravel.viiversion.com/api/bokun/domain?locale=ru'
      +'&start='+encodeURIComponent(today)
      +'&end='+encodeURIComponent(end)
      +'&includePickupPlaces=0'
  );
  const previewHtml=await sampleRequest(request,base+'/v2/',2);
  const externalLogo=await sampleRequest(
    request,
    'https://bizweb.dktcdn.net/100/416/263/themes/809458/assets/logo.png?1787117096236',
    2
  );

  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));

  const homeStarted=performance.now();
  await page.goto(base+'/v2/',{waitUntil:'domcontentloaded',timeout:60_000});
  await expect(page.locator('.tour-card')).toHaveCount(2);
  const homeReadyMs=performance.now()-homeStarted;

  const detailStarted=performance.now();
  await page.locator('.tour-card').first().click();
  await expect(page.locator('.detail-hero h1')).not.toHaveText('');
  await expect(page.getByTestId('departure-calendar')).toBeAttached();
  const detailReadyMs=performance.now()-detailStarted;

  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>({
    name:entry.name,
    duration:entry.duration,
    transferSize:entry.transferSize||0,
    encodedBodySize:entry.encodedBodySize||0,
    initiatorType:entry.initiatorType,
  })));

  const report={
    capturedAt:new Date().toISOString(),
    base,
    network:{
      previewApi,
      upstreamDomain,
      previewHtml,
      externalLogo,
      previewProxyOverheadMedianMs:Math.max(0,previewApi.medianMs-upstreamDomain.medianMs),
    },
    browser:{
      homeReadyMs,
      detailReadyMs,
      fullRenderCount:await page.evaluate(()=>window.__loveTravelRenderCount||0),
      resourceCount:resources.length,
      resources,
      pageErrors,
    },
  };

  expect(pageErrors).toEqual([]);
  await writeFile(resolve(outputDir,'client-v2-live.json'),JSON.stringify(report,null,2));
  console.log('CLIENT_V2_LIVE_PERF '+JSON.stringify(report));
});
