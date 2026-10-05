const SUPPORTED_LOCALES = Object.freeze(['ru', 'vi', 'en', 'ko', 'zh']);
const TARGET_NAMES = Object.freeze({
  ru:'Russian',
  vi:'Vietnamese',
  en:'English',
  ko:'Korean',
  zh:'Simplified Chinese',
});
const TRANSLATION_PROVIDER = 'workers-ai:gemma-4-26b-a4b-it:v2';

let tableReadyPromise = null;
const inFlightSync = new Map();
let backgroundSyncQueue = Promise.resolve();

function cleanLocale(value) {
  const raw = String(value ?? '').trim().toLowerCase().replace('_','-');
  if (raw.startsWith('ru')) return 'ru';
  if (raw.startsWith('vi')) return 'vi';
  if (raw.startsWith('ko')) return 'ko';
  if (raw.startsWith('zh')) return 'zh';
  if (raw.startsWith('en')) return 'en';
  return '';
}

export function normalizeContentLocale(value) {
  const locale = cleanLocale(value);
  return SUPPORTED_LOCALES.includes(locale) ? locale : 'ru';
}

export function bokunLanguage(locale) {
  const normalized = normalizeContentLocale(locale);
  // Chinese and Korean are normalized from one stable English Bókun source.
  // The customer-facing copy is then translated through our own verified cache
  // so a partially localized Bókun payload can never leak mixed languages.
  return normalized === 'zh' || normalized === 'ko' ? 'EN' : normalized.toUpperCase();
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nativeLanguageTokens(domain = {}) {
  return [
    domain?.experience?.languages?.base,
    ...asArray(domain?.experience?.languages?.raw),
  ].map(value => cleanLocale(value)).filter(Boolean);
}

export function hasNativeBokunLocale(domain, locale) {
  return nativeLanguageTokens(domain).includes(normalizeContentLocale(locale));
}

function pathSet(target, path, value) {
  let node = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    if (node == null) return;
    node = node[path[i]];
  }
  if (node != null) node[path[path.length - 1]] = value;
}

function safeKeyPart(value, fallback) {
  const clean = String(value ?? '').trim().replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');
  return clean || fallback;
}

export function collectTranslatableFields(domain = {}) {
  const fields = [];
  const add = (key, path, value) => {
    const source = text(value);
    if (!source) return;
    fields.push({
      key,
      path,
      source,
      kind:/<[^>]+>/.test(source) ? 'html' : 'text',
    });
  };
  const addEntityArray = (prefix, path, items) => {
    asArray(items).forEach((item,index) => {
      if (typeof item === 'string') {
        add(prefix + '.' + index, [...path,index], item);
        return;
      }
      if (!item || typeof item !== 'object') return;
      for (const field of ['title','label','description','body','text','name']) {
        add(prefix + '.' + index + '.' + field, [...path,index,field], item[field]);
      }
    });
  };

  add('experience.title', ['experience','title'], domain?.experience?.title);
  add('experience.description', ['experience','description'], domain?.experience?.description);

  const content = domain?.experience?.content || {};
  for (const name of ['included','excluded','requirements','attention','dressCode']) {
    add('experience.content.' + name, ['experience','content',name], content[name]);
  }
  addEntityArray('experience.content.inclusions', ['experience','content','inclusions'], content.inclusions);
  addEntityArray('experience.content.exclusions', ['experience','content','exclusions'], content.exclusions);
  addEntityArray('experience.content.knowBeforeYouGoItems', ['experience','content','knowBeforeYouGoItems'], content.knowBeforeYouGoItems);
  addEntityArray('experience.accessibility', ['experience','accessibility'], domain?.experience?.accessibility);
  addEntityArray('offers', ['offers'], domain?.offers);
  addEntityArray('experience.media.videos', ['experience','media','videos'], domain?.experience?.media?.videos);

  add('experience.ticket.message', ['experience','ticket','message'], domain?.experience?.ticket?.message);
  add('experience.pickup.noPickupMessage', ['experience','pickup','noPickupMessage'], domain?.experience?.pickup?.noPickupMessage);

  asArray(domain?.experience?.itinerary).forEach((item, index) => {
    const part = safeKeyPart(item?.id, String(index));
    add('experience.itinerary.' + part + '.title', ['experience','itinerary',index,'title'], item?.title);
    add('experience.itinerary.' + part + '.body', ['experience','itinerary',index,'body'], item?.body);
  });

  asArray(domain?.rates).forEach((rate, index) => {
    const part = safeKeyPart(rate?.id, String(index));
    add('rates.' + part + '.title', ['rates',index,'title'], rate?.title);
    add('rates.' + part + '.description', ['rates',index,'description'], rate?.description);

    asArray(rate?.details).forEach((item, detailIndex) => {
      add('rates.' + part + '.details.' + detailIndex + '.title', ['rates',index,'details',detailIndex,'title'], item?.title);
      add('rates.' + part + '.details.' + detailIndex + '.description', ['rates',index,'details',detailIndex,'description'], item?.description);
    });
    asArray(rate?.textItems).forEach((item, textIndex) => {
      add('rates.' + part + '.textItems.' + textIndex + '.title', ['rates',index,'textItems',textIndex,'title'], item?.title);
      add('rates.' + part + '.textItems.' + textIndex + '.description', ['rates',index,'textItems',textIndex,'description'], item?.description);
    });
  });

  asArray(domain?.extras).forEach((item, index) => {
    const part = safeKeyPart(item?.id ?? item?.code, String(index));
    add('extras.' + part + '.title', ['extras',index,'title'], item?.title);
    add('extras.' + part + '.description', ['extras',index,'description'], item?.description);
  });

  const requirements = domain?.bookingRequirements || {};
  asArray(requirements.questions).forEach((item, index) => {
    const part = safeKeyPart(item?.id ?? item?.code, String(index));
    add('questions.' + part + '.title', ['bookingRequirements','questions',index,'title'], item?.title);
    add('questions.' + part + '.label', ['bookingRequirements','questions',index,'label'], item?.label);
    add('questions.' + part + '.description', ['bookingRequirements','questions',index,'description'], item?.description);
    add('questions.' + part + '.placeholder', ['bookingRequirements','questions',index,'placeholder'], item?.placeholder);
    asArray(item?.options).forEach((option, optionIndex) => {
      if (typeof option === 'string') {
        add('questions.' + part + '.options.' + optionIndex, ['bookingRequirements','questions',index,'options',optionIndex], option);
      } else {
        add('questions.' + part + '.options.' + optionIndex + '.label', ['bookingRequirements','questions',index,'options',optionIndex,'label'], option?.label ?? option?.title);
      }
    });
  });

  asArray(requirements.customFields).forEach((item, index) => {
    const part = safeKeyPart(item?.id ?? item?.code, String(index));
    add('customFields.' + part + '.title', ['bookingRequirements','customFields',index,'title'], item?.title);
    add('customFields.' + part + '.description', ['bookingRequirements','customFields',index,'description'], item?.description);
  });

  add('cancellationPolicy.title', ['cancellationPolicy','title'], domain?.cancellationPolicy?.title);

  return fields;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('');
}

async function prepareFields(domain) {
  const fields = collectTranslatableFields(domain);
  return Promise.all(fields.map(async field => ({...field, sourceHash:await sha256(field.source)})));
}

async function ensureTable(env) {
  if (!env?.DB) return false;
  if (!tableReadyPromise) {
    tableReadyPromise = (async () => {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS bokun_content_localizations (
          product_id TEXT NOT NULL,
          locale TEXT NOT NULL,
          field_key TEXT NOT NULL,
          source_hash TEXT NOT NULL,
          source_text TEXT NOT NULL,
          translated_text TEXT NOT NULL,
          provider TEXT NOT NULL DEFAULT 'workers-ai',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (product_id, locale, field_key)
        )
      `).run();
      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_bokun_content_localizations_hash
        ON bokun_content_localizations(product_id, locale, source_hash)
      `).run();
      return true;
    })().catch(error => {
      tableReadyPromise = null;
      throw error;
    });
  }
  return tableReadyPromise;
}

async function cachedRows(env, productId, locale) {
  if (!await ensureTable(env)) return [];
  const result = await env.DB.prepare(`
    SELECT field_key, source_hash, translated_text, provider
    FROM bokun_content_localizations
    WHERE product_id = ? AND locale = ?
  `).bind(String(productId), locale).all();
  return asArray(result?.results);
}

function aiResponseText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  const choice = result?.choices?.[0];
  return choice?.message?.content || choice?.text || '';
}

function parseJsonObject(value) {
  const raw = String(value ?? '').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(raw.slice(start,end+1));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch (_) {}
    }
    return {};
  }
}

function chunks(fields, maxChars = 12000, maxItems = 24) {
  const result = [];
  let current = [];
  let chars = 0;
  for (const field of fields) {
    const size = field.source.length + field.key.length + 40;
    if (current.length && (current.length >= maxItems || chars + size > maxChars)) {
      result.push(current);
      current = [];
      chars = 0;
    }
    current.push(field);
    chars += size;
  }
  if (current.length) result.push(current);
  return result;
}

async function translateChunk(env, locale, fields) {
  if (!env?.AI || !fields.length) return {};
  const target = TARGET_NAMES[locale];
  const payload = Object.fromEntries(fields.map(field => [field.key, field.source]));
  const system = [
    'You are a translation engine for a travel booking application.',
    'Translate every JSON value into ' + target + '.',
    'Return one valid JSON object with exactly the same keys and no commentary or markdown.',
    'Preserve HTML tags, URLs, IDs, numbers, currencies and formatting.',
    'Preserve proper names of hotels, islands, beaches, streets, brands and people; transliterate only when natural for the target language.',
    'Do not add, remove, summarize, reinterpret or invent facts.',
    'Keep booking conditions, prices, ages, pickup instructions and cancellation meaning exact.',
  ].join(' ');
  const result = await env.AI.run(env.BOKUN_TRANSLATION_MODEL || '@cf/google/gemma-4-26b-a4b-it', {
    messages:[
      {role:'system', content:system},
      {role:'user', content:JSON.stringify(payload)},
    ],
    response_format:{type:'json_object'},
  });
  const parsed = parseJsonObject(aiResponseText(result));
  const allowed = new Set(fields.map(field => field.key));
  const translated = Object.fromEntries(Object.entries(parsed)
    .filter(([key,value]) => allowed.has(key) && typeof value === 'string' && value.trim())
    .map(([key,value]) => [key,value.trim()]));

  if (!Object.keys(translated).length && fields.length > 1) {
    const recovered = {};
    for (const field of fields) Object.assign(recovered, await translateChunk(env, locale, [field]));
    return recovered;
  }
  return translated;
}

async function saveTranslations(env, productId, locale, fields, translated, provider = TRANSLATION_PROVIDER) {
  if (!await ensureTable(env)) return 0;
  const rows = fields.filter(field => typeof translated[field.key] === 'string' && translated[field.key].trim());
  if (!rows.length) return 0;
  const statements = rows.map(field => env.DB.prepare(`
    INSERT INTO bokun_content_localizations
      (product_id, locale, field_key, source_hash, source_text, translated_text, provider, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(product_id, locale, field_key) DO UPDATE SET
      source_hash=excluded.source_hash,
      source_text=excluded.source_text,
      translated_text=excluded.translated_text,
      provider=excluded.provider,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    String(productId),
    locale,
    field.key,
    field.sourceHash,
    field.source,
    translated[field.key],
    provider,
  ));
  await env.DB.batch(statements);
  return rows.length;
}

function enqueueBackgroundSync(task) {
  const next = backgroundSyncQueue
    .catch(() => undefined)
    .then(task);
  backgroundSyncQueue = next.catch(() => undefined);
  return next;
}

export async function syncDomainTranslations(domain, env, requestedLocale) {
  const locale = normalizeContentLocale(requestedLocale);
  const productId = String(domain?.experience?.id || domain?.provider?.productId || '');
  const strictLocale = locale === 'zh' || locale === 'ko';
  if (!productId || locale === 'en' || (!strictLocale && hasNativeBokunLocale(domain, locale)) || !env?.DB || !env?.AI) {
    return {ok:true, productId, locale, translated:0, skipped:true};
  }

  const syncKey = productId + ':' + locale;
  if (inFlightSync.has(syncKey)) return inFlightSync.get(syncKey);

  const promise = (async () => {
    const fields = await prepareFields(domain);
    const rows = await cachedRows(env, productId, locale);
    const cache = new Map(rows.map(row => [String(row.field_key), row]));
    const missing = fields.filter(field => {
      const row = cache.get(field.key);
      return !row || String(row.source_hash) !== field.sourceHash || !text(row.translated_text) || String(row.provider || '') !== TRANSLATION_PROVIDER;
    });
    if (!missing.length) return {ok:true, productId, locale, translated:0, skipped:false};

    let translatedCount = 0;
    for (const batch of chunks(missing)) {
      const translated = await translateChunk(env, locale, batch);
      translatedCount += await saveTranslations(env, productId, locale, batch, translated);
    }
    return {ok:true, productId, locale, translated:translatedCount, skipped:false};
  })().finally(() => inFlightSync.delete(syncKey));

  inFlightSync.set(syncKey, promise);
  return promise;
}

export async function localizeDomainFromCache(domain, env, requestedLocale, ctx = null) {
  const locale = normalizeContentLocale(requestedLocale);
  const clone = structuredClone(domain);
  const productId = String(clone?.experience?.id || clone?.provider?.productId || '');

  const strictLocale = locale === 'zh' || locale === 'ko';
  if (locale === 'en' || (!strictLocale && hasNativeBokunLocale(clone, locale))) {
    clone.localization = {
      locale,
      source:'bokun-native',
      translatedFields:0,
      pendingFields:0,
    };
    return clone;
  }

  const fields = await prepareFields(clone);
  let rows = [];
  try {
    rows = await cachedRows(env, productId, locale);
    if (strictLocale) {
      const cache = new Map(rows.map(row => [String(row.field_key), row]));
      const missing = fields.some(field => {
        const row = cache.get(field.key);
        return !row ||
          String(row.source_hash) !== field.sourceHash ||
          !text(row.translated_text) ||
          String(row.provider || '') !== TRANSLATION_PROVIDER;
      });
      if (missing && env?.AI && env?.DB) {
        await syncDomainTranslations(domain, env, locale);
        rows = await cachedRows(env, productId, locale);
      }
    }
  } catch (error) {
    console.warn('Bókun localization cache unavailable', error?.message || error);
  }
  const cache = new Map(rows.map(row => [String(row.field_key), row]));
  let translatedFields = 0;
  let pendingFields = 0;

  for (const field of fields) {
    const row = cache.get(field.key);
    if (row && String(row.source_hash) === field.sourceHash && text(row.translated_text)) {
      pathSet(clone, field.path, row.translated_text);
      translatedFields += 1;
      if (String(row.provider || '') !== TRANSLATION_PROVIDER) pendingFields += 1;
    } else {
      pendingFields += 1;
    }
  }

  clone.localization = {
    locale,
    source:translatedFields && pendingFields === 0
      ? 'viiversion-cache'
      : translatedFields
        ? 'viiversion-cache-partial'
        : 'source',
    translatedFields,
    pendingFields,
  };

  if (pendingFields && env?.AI && env?.DB && ctx?.waitUntil) {
    ctx.waitUntil(enqueueBackgroundSync(() => syncDomainTranslations(domain, env, locale)).catch(error => {
      console.warn('Bókun localization background sync failed', error?.message || error);
    }));
  }

  return clone;
}

export async function syncAllDomainLocales(domains, env) {
  const results = [];
  for (const domain of asArray(domains)) {
    const productId = String(domain?.experience?.id || domain?.provider?.productId || '');
    for (const locale of ['ru','vi','ko','zh']) {
      try {
        results.push(await syncDomainTranslations(domain, env, locale));
      } catch (error) {
        results.push({
          ok:false,
          productId,
          locale,
          translated:0,
          error:error instanceof Error ? error.message : String(error || 'Unknown localization sync error'),
        });
      }
    }
  }
  return results;
}

export const _localizationTest = {
  cleanLocale,
  nativeLanguageTokens,
  pathSet,
  parseJsonObject,
  chunks,
  enqueueBackgroundSync,
};
