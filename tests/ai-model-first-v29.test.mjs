import test from 'node:test';
import assert from 'node:assert/strict';
import { orchestrateAiRequest, _test } from '../src/ai-orchestrator-v23.js';

const cityTour = {
  id:'nhatrang-day',
  title:'Обзорная экскурсия по Нячангу',
  city:'Нячанг',
  region:'Нячанг',
  category:'Городские экскурсии',
  tags:['город','культура','достопримечательности'],
  audience:[], route:['Нячанг'], childrenOk:true,
  group:{ adult:'$35', departures:[] },
  individual:{ from:'$120', tiers:[] },
};

const islandTour = {
  id:'hon-tam',
  title:'Остров Хон Там',
  city:'Нячанг',
  region:'Нячанг',
  category:'Море',
  tags:['море','остров','пляж'],
  audience:[], route:['Нячанг'], childrenOk:true,
  group:{ adult:'$45', departures:[] },
};

function assets(catalog = [islandTour, cityTour]) {
  return {
    async fetch() {
      return new Response(JSON.stringify(catalog), {
        status:200,
        headers:{ 'content-type':'application/json' },
      });
    },
  };
}

test('structured model payload keeps natural reply and catalog ids', () => {
  const parsed = _test.parseModelPayload({ response:JSON.stringify({
    reply:'Для обзорной прогулки подойдёт дневной Нячанг. На какую дату смотрим?',
    selectedTourId:'nhatrang-day',
    tourIds:['nhatrang-day'],
    bookingIntent:false,
  }) });
  assert.equal(parsed.selectedTourId, 'nhatrang-day');
  assert.deepEqual(parsed.tourIds, ['nhatrang-day']);
  assert.match(parsed.reply, /дневной Нячанг/iu);
});

test('repeat detector catches near-identical assistant answers', () => {
  const memory = { lastAssistant:'Что вам больше хочется: море, природа или обзор города?' };
  assert.equal(_test.repetitiveReply('Что вам больше хочется — море, природа или обзор города?', [], memory), true);
  assert.equal(_test.repetitiveReply('Тогда покажу обзорную экскурсию по Нячангу. На какую дату смотрим?', [], memory), false);
});

test('model-first overview keeps exact Nha Trang card while AI writes the answer', async () => {
  let calls = 0;
  const env = {
    ASSETS:assets(),
    AI:{
      async run() {
        calls += 1;
        return { response:JSON.stringify({
          reply:'Для вас подходит «Обзорная экскурсия по Нячангу». На какую дату планируете поездку?',
          selectedTourId:'nhatrang-day',
          tourIds:['nhatrang-day'],
          bookingIntent:false,
        }) };
      },
    },
  };
  const request = new Request('https://max-tour-demo.viiversion.com/api/ai/chat', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({
      message:'Я в Нячанге, хочу обзорную экскурсию',
      context:{ people:'2 взрослых' },
      history:[],
    }),
  });
  const response = await orchestrateAiRequest(request, env, new URL(request.url));
  const payload = await response.json();
  assert.equal(calls, 1);
  assert.equal(payload.modelUsed, true);
  assert.equal(payload.source, 'ai-orchestrator-v29-model');
  assert.equal(payload.tourId, 'nhatrang-day');
  assert.equal(payload.nextStep, 'ask_date');
  assert.match(payload.reply, /Обзорная экскурсия по Нячангу/iu);
});

test('repeated model answer is repaired by the model before deterministic fallback', async () => {
  let calls = 0;
  const repeated = 'Какой отдых вам ближе — море, красивые виды или городская программа?';
  const env = {
    ASSETS:assets(),
    AI:{
      async run() {
        calls += 1;
        if (calls === 1) return { response:JSON.stringify({ reply:repeated, selectedTourId:'', tourIds:[] }) };
        return { response:JSON.stringify({
          reply:'Раз вы выбрали город, покажу обзорный Нячанг. Сколько человек поедет?',
          selectedTourId:'nhatrang-day',
          tourIds:['nhatrang-day'],
        }) };
      },
    },
  };
  const request = new Request('https://max-tour-demo.viiversion.com/api/ai/chat', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({
      message:'Хочу обзор города',
      context:{ origin:'Нячанг' },
      history:[{ role:'bot', text:repeated }],
    }),
  });
  const response = await orchestrateAiRequest(request, env, new URL(request.url));
  const payload = await response.json();
  assert.equal(calls, 2);
  assert.equal(payload.modelUsed, true);
  assert.equal(payload.source, 'ai-orchestrator-v29-model-repair');
  assert.doesNotMatch(payload.reply, /какой отдых вам ближе/iu);
  assert.equal(payload.tourId, 'nhatrang-day');
});
