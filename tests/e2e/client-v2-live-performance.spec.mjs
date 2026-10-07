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

test('capture live Client v2 performance baseline',async({page,request})=>{
  const outputDir=resolve(process.cwd(),'performance-artifacts');
  await mkdir(outputDir,{recursive:true});

  const apiSamples=[];
  let apiBytes=0;
  for(let i=0;i<3;i+=1){
    const started=performance.now();
    const response=await request.get(base+'/api/tours?locale=ru',{timeout:60_000});
    const body=await response.body();
    apiSamples.push(performance.now()-started);
    apiBytes=body.byteLength;
    expect(response.ok()).toBeTruthy();
  }

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
    api:{
      samplesMs:apiSamples,
      medianMs:median(apiSamples),
      minMs:Math.min(...apiSamples),
      maxMs:Math.max(...apiSamples),
      payloadBytes:apiBytes,
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
