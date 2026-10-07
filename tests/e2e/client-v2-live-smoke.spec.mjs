import { test, expect } from '@playwright/test';

const base=String(process.env.CLIENT_V2_LIVE_URL||'').replace(/\/+$/,'');
if(!base) throw new Error('CLIENT_V2_LIVE_URL is required');

test('live preview connects real Bókun data to the mini-app shell',async({page})=>{
  const pageErrors=[];
  const failedRequests=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  page.on('requestfailed',request=>failedRequests.push(request.url()+' :: '+(request.failure()?.errorText||'failed')));

  await page.goto(base+'/v2/',{waitUntil:'domcontentloaded',timeout:60_000});

  await expect(page.getByTestId('bottom-nav')).toBeVisible();
  const cards=page.locator('.tour-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.locator('.card-title').first()).not.toHaveText('');

  await page.screenshot({
    path:'preview-artifacts/client-v2-live-home.png',
    fullPage:true,
  });

  await cards.first().click();
  await expect(page.locator('.detail-hero h1')).not.toHaveText('');
  await expect(page.getByTestId('departure-calendar')).toBeAttached();
  await expect(page.getByTestId('tour-options')).toBeAttached();
  await expect(page.locator('[data-preview-slot]')).toHaveCount(await page.locator('[data-preview-slot]').count());
  expect(await page.locator('[data-preview-slot]').count()).toBeGreaterThan(0);
  expect(await page.locator('[data-preview-rate]').count()).toBeGreaterThan(0);

  await page.screenshot({
    path:'preview-artifacts/client-v2-live-tour.png',
    fullPage:true,
  });

  expect(pageErrors).toEqual([]);
  const criticalFailures=failedRequests.filter(item=>item.includes('/api/tours'));
  expect(criticalFailures).toEqual([]);
});
