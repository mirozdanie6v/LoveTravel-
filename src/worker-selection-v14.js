const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { 'content-type':'application/json; charset=utf-8', ...(init.headers || {}) },
});

const clean = (value, max = 900) => String(value ?? '').trim().slice(0, max);
const norm = value => clean(value, 1200).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

function historyText(body = {}) {
  const history = Array.isArray(body?.history) ? body.history : [];
  return history
    .filter(item => item?.role === 'user')
    .map(item => clean(item?.text, 500))
    .filter(Boolean)
    .join(' ');
}

function inferOrigin(body = {}) {
  const explicit = clean(body?.context?.origin, 100);
  if (explicit) return explicit;
  const q = norm(`${historyText(body)} ${body?.message || ''}`);
  if (/(?:я|мы|сейчас|нахожусь|находимся|живу|живем|выезд|старт|из)[^.!?]{0,60}нячанг(?:е|а)?(?:$|[^а-яa-z])/i.test(q)) return 'Нячанг';
  if (/(?:я|мы|сейчас|нахожусь|находимся|живу|живем|выезд|старт|из)[^.!?]{0,60}дананг(?:е|а)?(?:$|[^а-яa-z])/i.test(q)) return 'Дананг';
  if (/(?:я|мы|сейчас|нахожусь|находимся|живу|живем|выезд|старт|из)[^.!?]{0,60}хано(?:й|е|я)(?:$|[^а-яa-z])/i.test(q)) return 'Ханой';
  if (/(?:я|мы|сейчас|нахожусь|находимся|живу|живем|выезд|старт|из)[^.!?]{0,60}фу\s*куок(?:е|а)?(?:$|[^а-яa-z])/i.test(q)) return 'Фукуок';
  return '';
}

function peopleKnown(context = {}) {
  const q = norm(context?.people);
  return Boolean(q && !/состав не указан|не указан|неизвест/.test(q));
}

function marinePreference(body = {}) {
  const message = norm(body?.message);
  const prefs = Array.isArray(body?.context?.preferences)
    ? body.context.preferences.map(norm).join(' ')
    : '';
  const q = `${message} ${prefs}`;
  const islands = /остров|сноркл|лодк|катамаран/.test(q);
  const sea = /море|морск|пляж|купани|остров|сноркл/.test(q);
  return { sea, islands };
}

export async function selectionFastPath(request, url) {
  if (url.pathname !== '/api/ai/chat' || request.method !== 'POST') return null;
  const body = await request.clone().json().catch(() => ({}));
  const preference = marinePreference(body);
  if (!preference.sea) return null;

  const origin = inferOrigin(body);
  if (origin !== 'Нячанг') return null;

  const context = body?.context || {};
  const destination = clean(context.destination, 100);
  const destinationIsOnlyOrigin = !destination || norm(destination) === 'нячанг';
  if (!destinationIsOnlyOrigin) return null;

  const date = clean(context.date, 100);
  const label = preference.islands ? 'островную экскурсию' : 'морскую экскурсию';

  // Keep the server question in the same order as the visible quick replies:
  // party first, then date. This avoids asking for a date while showing party chips.
  if (!peopleKnown(context)) {
    return json({
      ok:true,
      reply:'Сколько вас будет? Если будут дети, напишите тоже — подберу тариф сразу правильно.',
      source:'selection-fast-v14',
      faqIntent:'marine_preference',
      tourId:'',
    });
  }

  if (!date) {
    return json({
      ok:true,
      reply:`На какой день ищем ${label} из Нячанга?`,
      source:'selection-fast-v14',
      faqIntent:'marine_preference',
      tourId:'',
    });
  }

  return json({
    ok:true,
    reply:preference.islands
      ? 'Поняла: нужны именно острова, а не просто поездка к морю. Показываю островные варианты из Нячанга первыми.'
      : 'Поняла: нужна морская программа из Нячанга. Показываю подходящие варианты ниже.',
    source:'selection-fast-v14',
    faqIntent:'marine_preference',
    tourId:'',
  });
}

export const _selectionTest = { inferOrigin, marinePreference, peopleKnown };
