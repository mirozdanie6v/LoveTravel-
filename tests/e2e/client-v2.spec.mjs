import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fixturePayload } from '../fixtures/client-v2-domains.mjs';

const root=resolve(import.meta.dirname,'../..');
const sourceRoot=resolve(root,'preview/client-v2/src');
let server;
let baseURL='';

const mime={
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.svg':'image/svg+xml; charset=utf-8',
};

function svg(label){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
    <rect width="1200" height="800" fill="#dceef7"/>
    <circle cx="930" cy="190" r="120" fill="#f6c65b"/>
    <path d="M0 560 C230 470 390 650 620 550 S980 470 1200 590 V800 H0Z" fill="#55a9d9"/>
    <text x="70" y="120" font-family="sans-serif" font-size="54" fill="#18374b">${label}</text>
  </svg>`;
}

test.beforeAll(async()=>{
  server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/', 'http://127.0.0.1');
      if(url.pathname==='/api/tours'){
        const locale=String(url.searchParams.get('locale')||'ru').toLowerCase();
        res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
        res.end(JSON.stringify(fixturePayload(locale)));
        return;
      }
      if(url.pathname==='/brand-logo'){
        res.writeHead(200,{'content-type':'image/svg+xml; charset=utf-8','cache-control':'public,max-age=86400'});
        res.end(svg('LOVE TRAVEL'));
        return;
      }
      if(url.pathname.startsWith('/fixture/')&&url.pathname.endsWith('.svg')){
        res.writeHead(200,{'content-type':mime['.svg'],'cache-control':'public,max-age=3600'});
        res.end(svg(url.pathname.split('/').pop().replace('.svg','')));
        return;
      }
      const relative=url.pathname==='/v2/'?'index.html':url.pathname.replace(/^\/v2\//,'');
      if(!['index.html','client-v2.css','client-v2.js','client-v2-model.js'].includes(relative)){
        res.writeHead(404);res.end('not found');return;
      }
      const body=await readFile(resolve(sourceRoot,relative));
      res.writeHead(200,{'content-type':mime[extname(relative)]||'application/octet-stream','cache-control':'no-store'});
      res.end(body);
    }catch(error){
      res.writeHead(500,{'content-type':'text/plain'});
      res.end(String(error));
    }
  });
  await new Promise((resolveListen,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolveListen);
  });
  const address=server.address();
  baseURL=`http://127.0.0.1:${address.port}`;
});

test.afterAll(async()=>{
  if(server) await new Promise(resolveClose=>server.close(resolveClose));
});

test('mini-app shell and locale switching are deterministic',async({page})=>{
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));

  await page.goto(baseURL+'/v2/',{waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
  await expect(page.locator('.tour-card')).toHaveCount(2);
  await expect(page.locator('.tour-card').first()).toContainText('Островное приключение Robinson Beach');

  await page.locator('[data-language-trigger]').click();
  await page.locator('[data-locale="en"]').click();
  await expect(page.getByTestId('bottom-nav')).toContainText('Home');
  await expect(page.locator('.tour-card').first()).toContainText('Robinson Beach Island Adventure');

  await page.locator('[data-language-trigger]').click();
  await page.locator('[data-locale="ru"]').click();
  await expect(page.getByTestId('bottom-nav')).toContainText('Главная');
  await expect(page.locator('.tour-card').first()).toContainText('Островное приключение Robinson Beach');

  expect(pageErrors).toEqual([]);
});

test('tour flow is departure first and renders semantic customer sections',async({page})=>{
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));

  await page.goto(baseURL+'/v2/',{waitUntil:'domcontentloaded'});
  await page.locator('.tour-card').first().click();

  const dates=page.getByTestId('departure-calendar');
  const options=page.getByTestId('tour-options');
  await expect(dates).toBeAttached();
  await expect(options).toBeAttached();
  const datesBeforeOptions=await page.evaluate(()=>{
    const datesNode=document.querySelector('[data-testid="departure-calendar"]');
    const optionsNode=document.querySelector('[data-testid="tour-options"]');
    return Boolean(datesNode&&optionsNode&&(datesNode.compareDocumentPosition(optionsNode)&Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(datesBeforeOptions).toBe(true);

  const pickup=page.getByTestId('tour-pickup');
  const cancellation=page.getByTestId('tour-cancellation');
  await expect(pickup).toContainText('Трансфер доступен');
  await expect(cancellation).toContainText('Условия отмены');
  await expect(cancellation).toContainText('24 ч');
  await pickup.scrollIntoViewIfNeeded();
  await expect(pickup).toBeInViewport();
  await expect(pickup).toBeVisible();

  const dateTrigger=page.locator('[data-date-picker-trigger]');
  await expect(dateTrigger).toContainText('Выбрать дату');
  await expect(page.locator('[data-preview-slot]')).toHaveCount(0);

  await dateTrigger.click();
  const departures=page.locator('[data-preview-slot]');
  await expect(departures).toHaveCount(2);
  await departures.nth(1).click();

  await expect(dateTrigger).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.date-picker-trigger__copy strong')).not.toHaveText('Выберите дату');
  await expect(page.locator('.rate-option')).toHaveCount(1);

  const option=page.locator('.rate-option').first();
  await expect(option.locator('.rate-thumb')).toHaveCount(0);
  await expect(page.locator('.rate-photo em')).toHaveCount(0);
  await expect(page.locator('.rate-description')).toHaveCount(0);

  await option.click();
  await expect(option).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('.rate-description')).toContainText('Bích Đầm fishing village extension');

  await page.getByRole('button',{name:'Программа'}).click();
  await expect(page.getByTestId('tour-program')).toContainText('Harbour');

  await page.getByRole('button',{name:'Включено'}).click();
  await expect(page.getByTestId('tour-included')).toContainText('Lunch');
  await expect(page.getByTestId('tour-included')).toContainText('Personal expenses');

  await page.getByTestId('tour-tabs').getByRole('button',{name:'Фото',exact:true}).click();
  await expect(page.getByTestId('tour-photos')).toBeVisible();
  await expect(page.locator('.photo-thumb')).toHaveCount(2);

  expect(pageErrors).toEqual([]);
});

test('bottom navigation exposes the AI shell without live AI dependency',async({page})=>{
  await page.goto(baseURL+'/v2/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-app-tab="assistant"]').last().click();
  await expect(page.getByTestId('ai-assistant-shell')).toBeVisible();
  await expect(page.getByTestId('ai-assistant-shell')).toContainText(/ИИ.консультант/);
});


test('performance audit records render boundaries and content-visibility geometry',async({page})=>{
  await mkdir(resolve(root,'performance-artifacts'),{recursive:true});
  await page.goto(baseURL+'/v2/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.tour-card')).toHaveCount(2);

  const geometry=async locator=>{
    const before=await locator.evaluate(el=>{
      const style=getComputedStyle(el);
      const rect=el.getBoundingClientRect();
      return {
        top:rect.top,
        height:rect.height,
        contentVisibility:style.contentVisibility,
        containIntrinsicSize:style.containIntrinsicSize,
      };
    });
    await locator.scrollIntoViewIfNeeded();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const after=await locator.evaluate(el=>{
      const rect=el.getBoundingClientRect();
      return {top:rect.top,height:rect.height};
    });
    return {...before,afterHeight:after.height,heightDelta:after.height-before.height};
  };

  const secondCardGeometry=await geometry(page.locator('.tour-card').nth(1));

  await page.locator('.tour-card').first().click();
  await expect(page.getByTestId('departure-calendar')).toBeAttached();
  await expect(page.getByTestId('tour-options')).toBeAttached();

  const optionsGeometry=await geometry(page.getByTestId('tour-options'));

  const measureClick=async selector=>{
    return page.evaluate(async selectorValue=>{
      const candidates=[...document.querySelectorAll(selectorValue)];
      const target=candidates.find(el=>!el.classList.contains('is-active')&&!el.disabled)||candidates[0];
      if(!target) return null;
      const beforeRender=window.__loveTravelRenderCount||0;
      const started=performance.now();
      target.click();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      return {
        durationMs:performance.now()-started,
        beforeRender,
        afterRender:window.__loveTravelRenderCount||0,
      };
    },selector);
  };

  await page.locator('[data-date-picker-trigger]').click();
  const departureInteraction=await measureClick('[data-preview-slot]');
  const departureRenderAfter=departureInteraction?.afterRender??null;

  await page.locator('[data-date-picker-trigger]').click();
  const firstDeparture=page.locator('[data-preview-slot]').first();
  await firstDeparture.click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const rateInteraction=await measureClick('[data-preview-rate]');
  const tabInteraction=await measureClick('[data-tab="itinerary"]');

  const sourceBytes={};
  for(const file of ['client-v2.js','client-v2-model.js','client-v2.css']){
    const body=await readFile(resolve(sourceRoot,file));
    sourceBytes[file]=body.byteLength;
  }

  const report={
    sourceBytes,
    fullRenderCount:await page.evaluate(()=>window.__loveTravelRenderCount||0),
    secondCardGeometry,
    optionsGeometry,
    interactions:{
      departure:departureInteraction,
      rate:rateInteraction,
      tab:tabInteraction,
    },
  };

  for(const interaction of Object.values(report.interactions)){
    if(!interaction) continue;
    expect(interaction.afterRender).toBe(interaction.beforeRender);
  }
  expect(departureRenderAfter).not.toBeNull();

  await writeFile(
    resolve(root,'performance-artifacts/client-v2-deterministic.json'),
    JSON.stringify(report,null,2)
  );
  console.log('CLIENT_V2_PERF_BASELINE '+JSON.stringify(report));
});
