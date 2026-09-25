import { chromium } from 'playwright';

const url = process.env.I18N_TEST_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless:true });
const liveAi = process.env.I18N_LIVE_AI === '1';
const failures = [];

const clean = value => String(value || '')
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean)
  .join('\n');

async function checkOverflow(page, label) {
  const dims = await page.evaluate(() => ({
    width: window.innerWidth,
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  if (dims.doc > dims.width + 1 || dims.body > dims.width + 1) {
    failures.push({ label: label + '-overflow', dims });
  }
}

async function inspect(page, locale, label, fn, selector) {
  if (fn) await page.evaluate(fn);
  await page.waitForTimeout(420);
  const text = clean(await page.locator(selector).innerText().catch(()=>''));
  const cyr = text.split('\n').filter(line => /[А-Яа-яЁё]/.test(line));
  if (cyr.length) failures.push({ locale, label, cyr:cyr.slice(0,40) });
  console.log(locale.toUpperCase() + ' SCREEN ' + label + ': ' + (cyr.length ? 'FAIL' : 'OK'));
  if (cyr.length) console.log(cyr.slice(0,40).join('\n'));
  await checkOverflow(page, locale + '-' + label);
}

async function runLocale(locale, viewport) {
  const origin = new URL(url).origin;
  const context = await browser.newContext({
    viewport,
    storageState: {
      cookies: [],
      origins: [{
        origin,
        localStorage: [{ name:'max-tour-locale-v1', value:locale }]
      }]
    }
  });
  const page = await context.newPage();
  if (!liveAi) {
    await page.route('**/api/ai/chat', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.locale !== locale || body.context?.locale !== locale) {
        failures.push({ locale, label:'ai-request-locale', bodyLocale:body.locale, contextLocale:body.context?.locale });
      }
      const reply = locale === 'vi'
        ? 'Tôi có thể giúp bạn chọn tour phù hợp.'
        : locale === 'ko'
          ? '적합한 투어를 선택하도록 도와드릴게요.'
          : 'I can help you choose a suitable tour.';
      await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ok:true, reply, source:'smoke' }) });
    });
  }

  await page.goto(url, { waitUntil:'domcontentloaded', timeout:45000 });
  await page.waitForFunction(expected => globalThis.MaxTourI18n?.locale === expected, locale);
  await page.waitForTimeout(650);

  const buttons = await page.locator('.mt-language-switcher button').evaluateAll(nodes => nodes.map(n => n.dataset.locale));
  if (buttons.join(',') !== 'ru,vi,en,ko') failures.push({ locale, label:'switcher', buttons });
  const switcherLayout = await page.locator('.mt-language-switcher').evaluate(el => {
    const rects = [...el.querySelectorAll('button')].map(btn => btn.getBoundingClientRect());
    const style = getComputedStyle(el);
    return {
      display: style.display,
      flexDirection: style.flexDirection,
      flexWrap: style.flexWrap,
      rows: new Set(rects.map(rect => Math.round(rect.top))).size,
    };
  });
  if (switcherLayout.flexDirection !== 'row' || switcherLayout.flexWrap !== 'nowrap' || switcherLayout.rows !== 1) {
    failures.push({ locale, label:'switcher-horizontal', switcherLayout });
  }

  await inspect(page, locale, 'home', () => { showScreen('home'); }, '#homeScreen');
  await inspect(page, locale, 'catalog', () => { showScreen('catalog'); }, '#catalogScreen');
  await inspect(page, locale, 'tour-group', () => { openTour('dalat-premium'); setFormat('group'); }, '#tourScreen');
  await inspect(page, locale, 'tour-individual', () => { setFormat('individual'); }, '#tourScreen');

  const tourIds = await page.evaluate(() => Array.isArray(TOURS) ? TOURS.map(t => String(t.id || '')).filter(Boolean) : []);
  for (const tourId of tourIds) {
    await page.evaluate(id => { openTour(id); setFormat('group'); }, tourId);
    await page.waitForTimeout(80);
    await inspect(page, locale, 'tour-all-' + tourId, null, '#tourScreen');
  }
  await inspect(page, locale, 'booking', () => { startBooking('individual'); }, '#bookingScreen');
  await inspect(page, locale, 'trips-profile', () => { state.tripTab='profile'; showScreen('trips'); }, '#tripsScreen');
  await inspect(page, locale, 'trips-booked', () => { state.tripTab='booked'; renderTrips(); }, '#tripsScreen');
  await page.evaluate(() => {
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('max-tour-ai-consultant-') || key.startsWith('max-tour-ai-location-') || key.startsWith('max-tour-ai-origin-')) {
          sessionStorage.removeItem(key);
        }
      }
    } catch (_) {}
    showScreen('ai');
    globalThis.MaxTourAI?.mount?.(document.getElementById('aiScreen'));
  });
  await inspect(page, locale, 'ai', null, '#aiScreen');

  const quickButton = page.locator('#aiScreen .ai-quick-replies button[data-ai-action="quick"]').first();
  const quickCount = await quickButton.count();
  if (!quickCount) {
    failures.push({ locale, label:'ai-first-quick-missing' });
  } else {
    const beforeUser = await page.locator('#aiScreen .ai-msg.user').count();
    try {
      await quickButton.click({ timeout:5000 });
      await page.waitForTimeout(liveAi ? 4500 : 700);
    } catch (error) {
      const diag = await quickButton.evaluate(btn => {
        const rect = btn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const top = document.elementFromPoint(x, y);
        const root = document.getElementById('aiScreen');
        return {
          html:btn.outerHTML,
          pointerEvents:getComputedStyle(btn).pointerEvents,
          rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},
          topElement:top?.outerHTML?.slice(0,500) || '',
          rootOnClick:typeof root?.onclick,
        };
      }).catch(()=>({}));
      failures.push({ locale, label:'ai-first-quick-click-error', error:String(error), diag });
    }
    const afterUser = await page.locator('#aiScreen .ai-msg.user').count();
    if (afterUser <= beforeUser) failures.push({ locale, label:'ai-first-quick-no-effect', beforeUser, afterUser });
  }

  await page.evaluate(() => {
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('max-tour-ai-consultant-')) sessionStorage.removeItem(key);
      }
    } catch (_) {}
    globalThis.MaxTourAI?.mount?.(document.getElementById('aiScreen'));
  });
  const aiBox = page.locator('#aiScreen textarea[name="message"]');
  await aiBox.fill('hello');
  await aiBox.press('Enter');
  await page.waitForTimeout(liveAi ? 4500 : 500);
  await inspect(page, locale, 'ai-reply', null, '#aiScreen');

  if (locale === 'en') {
    await page.locator('.mt-language-switcher button[data-locale="vi"]').click();
    await page.waitForFunction(() => localStorage.getItem('max-tour-locale-v1') === 'vi');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => globalThis.MaxTourI18n?.locale === 'vi');
    await page.locator('.mt-language-switcher button[data-locale="en"]').click();
    await page.waitForFunction(() => localStorage.getItem('max-tour-locale-v1') === 'en');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => globalThis.MaxTourI18n?.locale === 'en');
  }

  await context.close();
}

await runLocale('vi', { width:390, height:844 });
await runLocale('en', { width:390, height:844 });
await runLocale('ko', { width:390, height:844 });
await runLocale('en', { width:1440, height:900 });
await runLocale('ko', { width:1440, height:900 });

await browser.close();

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('MAX TOUR existing v28 customer UI passed VI/EN/KO smoke with RU/VI/EN/KO horizontal switcher and no horizontal overflow.');
