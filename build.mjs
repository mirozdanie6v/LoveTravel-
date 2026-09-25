import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname);
const dist = resolve(root, 'dist');
const sourceDir = resolve(root, 'source');
const manifest = JSON.parse(await readFile(resolve(sourceDir, 'manifest.json'), 'utf8'));
const imageOverrides = JSON.parse(await readFile(resolve(root, 'src/catalog-image-overrides.json'), 'utf8'));

async function restore(entry) {
  const encoded = (await Promise.all(entry.parts.map(p => readFile(resolve(sourceDir, p), 'ascii')))).join('');
  const raw = gunzipSync(Buffer.from(encoded,'base64'));
  const sha = createHash('sha256').update(raw).digest('hex');
  if (raw.length !== entry.size_bytes) throw new Error(`${entry.original_name}: size mismatch`);
  if (sha !== entry.sha256) throw new Error(`${entry.original_name}: checksum mismatch`);
  return raw;
}

const [prototypeRaw, catalogRaw, adminPrototype, directorPrototype] = await Promise.all([
  restore(manifest.html),
  restore(manifest.catalog),
  readFile(resolve(root, 'src/admin-v3.html'), 'utf8'),
  readFile(resolve(root, 'src/director-v3.html'), 'utf8'),
]);
const prototypeHtml = prototypeRaw.toString('utf8');
const sourceCatalog = JSON.parse(catalogRaw.toString('utf8'));
if (!Array.isArray(sourceCatalog) || sourceCatalog.length < 1) throw new Error('v28 catalog must be a non-empty array');
if (!prototypeHtml.includes('MaxTour Mini App Prototype v28')) throw new Error('Unexpected prototype source');
if (!prototypeHtml.includes('const TOURS =')) throw new Error('Prototype does not contain expected catalog binding');

function applyCatalogImageOverrides(catalog, overrides) {
  const catalogIds = new Set(catalog.map(tour => String(tour.id)));
  const overrideIds = Object.keys(overrides);
  const missing = catalog.filter(tour => !overrides[tour.id]).map(tour => `${tour.id}: ${tour.title}`);
  const unknown = overrideIds.filter(id => !catalogIds.has(id));
  if (missing.length || unknown.length) {
    throw new Error(`Catalog image policy mismatch. Missing overrides: [${missing.join(' | ')}]. Unknown override ids: [${unknown.join(' | ')}]. Catalog ids: [${[...catalogIds].join(', ')}]`);
  }

  return catalog.map(tour => {
    const override = overrides[tour.id];
    if (!override?.image || !Array.isArray(override.gallery) || override.gallery.length < 1) {
      throw new Error(`Invalid image override for ${tour.id}`);
    }
    const gallery = [...new Set([override.image, ...override.gallery].filter(Boolean))];
    return {
      ...tour,
      image: override.image,
      fallbackImage: override.image,
      gallery,
    };
  });
}

const catalog = applyCatalogImageOverrides(sourceCatalog, imageOverrides);
const curatedCatalogRaw = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

function replaceLegacyAdmin(html) {
  const oldEntry = "function showAdmin() { showScreen('admin'); }";
  const adminStart = html.indexOf('function renderAdmin() {');
  const adminEndMarker = '\nrenderHome();';
  const adminEnd = html.indexOf(adminEndMarker, adminStart);
  if (!html.includes(oldEntry)) throw new Error('Prototype admin entry point was not found');
  if (adminStart < 0 || adminEnd < 0) throw new Error('Prototype legacy admin renderer was not found');

  const withoutLegacyAdmin = `${html.slice(0, adminStart)}function renderAdmin() { window.location.assign('/admin/'); }${html.slice(adminEnd)}`;
  return withoutLegacyAdmin.replace(oldEntry, "function showAdmin() { window.location.assign('/admin/'); }");
}

const brandLogoPath = '/max-tour-logo.svg';

function replaceBrandLogos(html) {
  let replacements = 0;
  const replace = (pattern, markup) => {
    html = html.replace(pattern, () => {
      replacements += 1;
      return markup;
    });
  };

  replace(
    /<img\s+src="data:image\/png;base64,[^"]+"\s+alt="Max Tour — Экскурсионное бюро"\s+loading="eager">/g,
    `<img src="${brandLogoPath}" alt="Max Tour — Экскурсионное бюро" loading="eager">`,
  );
  replace(
    /<img\s+alt="MaxTour"\s+src="data:image\/png;base64,[^"]+">/g,
    `<img alt="MaxTour" src="${brandLogoPath}">`,
  );
  replace(
    /const logoSrc = "data:image\/png;base64,[^"]+";/g,
    `const logoSrc = '${brandLogoPath}';`,
  );

  if (replacements === 0 && !html.includes(brandLogoPath)) throw new Error('Brand logo was not found in HTML');
  return html;
}

function stripSalesContinuityV24(source) {
  const pattern = /\(\(\) => \{\n  'use strict';\n\n  const AI_STATE_KEY = 'max-tour-ai-consultant-v5';\n  const LOCATION_KEY = 'max-tour-ai-location-v6';\n  const ORIGIN_KEY = 'max-tour-ai-origin-v20';[\s\S]*?  globalThis\.MaxTourAISalesContinuityV24 = \{ sanitizeStoredState, releaseLocationGuard, salesStage, nextReply \};\n\}\)\(\);\n?/;
  if (!pattern.test(source)) throw new Error('sales-continuity-v24 reply rewriter block was not found');
  const stripped = source.replace(pattern, "/* sales-continuity-v24 removed: server AI reply is authoritative. */\n");
  if (stripped.includes('MaxTourAISalesContinuityV24') || stripped.includes("source:'sales-continuity-v24'")) {
    throw new Error('sales-continuity-v24 reply rewriter survived build stripping');
  }
  return stripped;
}

const telegramSdk = '<script src="https://telegram.org/js/telegram-web-app.js?63"></script>';
const analyticsTracker = '<script defer src="https://dashboard.viiversion.com/tracker.js" data-project="MAX TOUR Demo"></script>';
const productionEmbedCss = '<link rel="stylesheet" href="/production-embed-polish.css">';
const i18nCss = '<link rel="stylesheet" href="/i18n-v1.css">';
const productionEmbedJs = '<script defer src="/production-embed-polish.js"></script>';
const i18nJs = '<script defer src="/i18n-en-v1.js"></script>\n<script defer src="/i18n-ko-v1.js"></script>\n<script defer src="/i18n-v1.js"></script>';

function withViiversionAnalytics(html) {
  let result = html;
  if (!result.includes('telegram-web-app.js')) {
    if (!result.includes('</head>')) throw new Error('HTML has no </head> marker');
    result = result.replace('</head>', `${telegramSdk}\n</head>`);
  }
  if (!result.includes('production-embed-polish.css')) {
    if (!result.includes('</head>')) throw new Error('HTML has no </head> marker');
    result = result.replace('</head>', `${productionEmbedCss}\n</head>`);
  }
  if (!result.includes('i18n-v1.css')) {
    if (!result.includes('</head>')) throw new Error('HTML has no </head> marker');
    result = result.replace('</head>', `${i18nCss}\n</head>`);
  }
  if (!result.includes('dashboard.viiversion.com/tracker.js')) {
    if (!result.includes('</body>')) throw new Error('HTML has no </body> marker');
    result = result.replace('</body>', `${analyticsTracker}\n</body>`);
  }
  if (!result.includes('production-embed-polish.js')) {
    if (!result.includes('</body>')) throw new Error('HTML has no </body> marker');
    result = result.replace('</body>', `${productionEmbedJs}\n</body>`);
  }
  if (!result.includes('i18n-v1.js')) {
    if (!result.includes('</body>')) throw new Error('HTML has no </body> marker');
    result = result.replace('</body>', `${i18nJs}\n</body>`);
  }
  return result;
}

function cleanCustomerCopy(html) {
  return html
    .replace(/demo-экскурсий/g, 'экскурсий')
    .replace(/MT-DEMO-/g, 'MT-')
    .replaceAll('Иван Петров', 'Nguyen Van An')
    .replaceAll('Анна Петрова', 'Tran Thi Mai')
    .replaceAll('Марк Петров', 'Nguyen Minh Khoa');
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await mkdir(resolve(dist, 'admin'), { recursive: true });
await mkdir(resolve(dist, 'director'), { recursive: true });
const marker = '</body>';
const injection = '<script src="/booking-pricing.js"></script>\n<script src="/traveler-profile.js"></script>\n<link rel="stylesheet" href="/traveler-picker-list.css">\n<script src="/trip-actions.js"></script>\n<script src="/trip-policy-live-v2.js"></script>\n<link rel="stylesheet" href="/hero-redesign.css">\n<script src="/hero-redesign.js"></script>\n<link rel="stylesheet" href="/role-switch.css">\n<script src="/role-switch.js"></script>\n<link rel="stylesheet" href="/ai-consultant.css">\n<link rel="stylesheet" href="/ai-consultant-v5.css">\n<script src="/ai-network-guard-v8.js"></script>\n<script src="/ai-consultant.js"></script>\n<script src="/ai-consultant-v5.js?v=26"></script>\n<script src="/ai-location-guard-v6.js"></script>\n<script src="/ai-catalog-card-v7.js"></script>\n<script src="/tour-departure-live-v3.js"></script>\n<link rel="stylesheet" href="/catalog-show-press.css">\n<script src="/catalog-show-press.js" defer></script>\n<script src="/ai-selection-polish-v15.js" defer></script>\n<script src="/ai-explicit-tour-v16.js" defer></script>\n<script src="/ai-booking-bridge-v25.js" defer></script>\n<link rel="stylesheet" href="/tour-lightbox.css">\n<script src="/tour-lightbox.js" defer></script>\n<script src="/runtime-api.js" defer></script>\n';
if (!prototypeHtml.includes(marker)) throw new Error('Prototype has no </body> marker');
const builtHtml = withViiversionAnalytics(cleanCustomerCopy(replaceBrandLogos(replaceLegacyAdmin(prototypeHtml)).replace(marker, `${injection}${marker}`)));
await writeFile(resolve(dist, 'index.html'), builtHtml, 'utf8');
await writeFile(resolve(dist, 'catalog.v28.json'), curatedCatalogRaw);
await copyFile(resolve(root, 'src/booking-pricing.js'), resolve(dist, 'booking-pricing.js'));
await copyFile(resolve(root, 'src/traveler-profile.js'), resolve(dist, 'traveler-profile.js'));
await copyFile(resolve(root, 'src/traveler-picker-list.css'), resolve(dist, 'traveler-picker-list.css'));
await copyFile(resolve(root, 'src/trip-actions.js'), resolve(dist, 'trip-actions.js'));
await copyFile(resolve(root, 'src/trip-policy-live-v2.js'), resolve(dist, 'trip-policy-live-v2.js'));
await copyFile(resolve(root, 'src/hero-redesign.css'), resolve(dist, 'hero-redesign.css'));
await copyFile(resolve(root, 'src/hero-redesign.js'), resolve(dist, 'hero-redesign.js'));
await copyFile(resolve(root, 'src/role-switch.css'), resolve(dist, 'role-switch.css'));
await copyFile(resolve(root, 'src/role-switch.js'), resolve(dist, 'role-switch.js'));
await copyFile(resolve(root, 'src/ai-consultant.css'), resolve(dist, 'ai-consultant.css'));
await copyFile(resolve(root, 'src/ai-network-guard-v8.js'), resolve(dist, 'ai-network-guard-v8.js'));
await copyFile(resolve(root, 'src/ai-consultant.js'), resolve(dist, 'ai-consultant.js'));
await copyFile(resolve(root, 'src/ai-consultant-v5.css'), resolve(dist, 'ai-consultant-v5.css'));
await copyFile(resolve(root, 'src/ai-consultant-v5.js'), resolve(dist, 'ai-consultant-v5.js'));
await copyFile(resolve(root, 'src/ai-location-guard-v6.js'), resolve(dist, 'ai-location-guard-v6.js'));
await copyFile(resolve(root, 'src/ai-catalog-card-v7.js'), resolve(dist, 'ai-catalog-card-v7.js'));
await copyFile(resolve(root, 'src/ai-selection-polish-v15.js'), resolve(dist, 'ai-selection-polish-v15.js'));
const explicitTourSource = await readFile(resolve(root, 'src/ai-explicit-tour-v16.js'), 'utf8');
await writeFile(resolve(dist, 'ai-explicit-tour-v16.js'), stripSalesContinuityV24(explicitTourSource), 'utf8');
await copyFile(resolve(root, 'src/ai-booking-bridge-v25.js'), resolve(dist, 'ai-booking-bridge-v25.js'));
await copyFile(resolve(root, 'src/tour-departure-live-v3.js'), resolve(dist, 'tour-departure-live-v3.js'));
await copyFile(resolve(root, 'src/catalog-show-press.css'), resolve(dist, 'catalog-show-press.css'));
await copyFile(resolve(root, 'src/catalog-show-press.js'), resolve(dist, 'catalog-show-press.js'));
await copyFile(resolve(root, 'src/tour-lightbox.css'), resolve(dist, 'tour-lightbox.css'));
await copyFile(resolve(root, 'src/tour-lightbox.js'), resolve(dist, 'tour-lightbox.js'));
await copyFile(resolve(root, 'src/production-embed-polish.css'), resolve(dist, 'production-embed-polish.css'));
await copyFile(resolve(root, 'src/production-embed-polish.js'), resolve(dist, 'production-embed-polish.js'));
await copyFile(resolve(root, 'src/i18n-v1.css'), resolve(dist, 'i18n-v1.css'));
await copyFile(resolve(root, 'src/i18n-v1.js'), resolve(dist, 'i18n-v1.js'));
await copyFile(resolve(root, 'src/i18n-en-v1.js'), resolve(dist, 'i18n-en-v1.js'));
await copyFile(resolve(root, 'src/i18n-ko-v1.js'), resolve(dist, 'i18n-ko-v1.js'));
await copyFile(resolve(root, 'src/max-tour-logo.svg'), resolve(dist, 'max-tour-logo.svg'));
const adminBuilt = withViiversionAnalytics(replaceBrandLogos(adminPrototype)
  .replace('</head>', '<link rel="stylesheet" href="/admin-app.css">\n</head>')
  .replace('</body>', '<script src="/admin-app.js" defer></script>\n<script src="/admin-tour-media.js" defer></script>\n</body>'));
await writeFile(resolve(dist, 'admin/index.html'), adminBuilt, 'utf8');
await writeFile(resolve(dist, 'director/index.html'), withViiversionAnalytics(directorPrototype), 'utf8');
await copyFile(resolve(root, 'src/admin-app.css'), resolve(dist, 'admin-app.css'));
await copyFile(resolve(root, 'src/admin-app.js'), resolve(dist, 'admin-app.js'));
await copyFile(resolve(root, 'src/admin-tour-media.js'), resolve(dist, 'admin-tour-media.js'));
await copyFile(resolve(root, 'src/runtime-api.js'), resolve(dist, 'runtime-api.js'));
console.log(`Built standalone v28: ${catalog.length} tours with curated location-correct imagery + photo lightbox + live trip/departure policy + AI consultant v8 network guard, v15 selection ranking and v16 explicit-tour guard without sales-continuity reply rewriting + v25 safe booking bridge + v7 catalog-card parity + admin v3 + editable R2 tour photos + director v3 + Telegram analytics; exact source checksums verified.`);
