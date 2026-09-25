import test from 'node:test';
import assert from 'node:assert/strict';
import { isCityOverviewIntent, chooseCityOverviewTour, polishCityOverviewResponse } from '../src/ai-city-overview-polish-v27.js';

const cityTour = {
  id:'nhatrang-day',
  title:'Обзорная экскурсия по Нячангу',
  city:'Нячанг',
  region:'Нячанг',
  category:'Городские экскурсии',
  tags:['город','культура','достопримечательности'],
  group:{ adult:'$35' },
  individual:{ from:'$120' },
};
const islandTour = {
  id:'hon-tam',
  title:'Остров Хон Там',
  city:'Нячанг',
  region:'Нячанг',
  category:'Море',
  tags:['море','остров','пляж'],
  group:{ adult:'$45' },
};

const env = {
  ASSETS:{
    async fetch() {
      return new Response(JSON.stringify([islandTour, cityTour]), { status:200, headers:{ 'content-type':'application/json' } });
    },
  },
};

test('typed and quick-reply city overview phrases resolve as the same intent', () => {
  assert.equal(isCityOverviewIntent('Хочу обзорную экскурсию'), true);
  assert.equal(isCityOverviewIntent('Обзор города'), true);
  assert.equal(isCityOverviewIntent('Хочу посмотреть город и достопримечательности'), true);
  assert.equal(isCityOverviewIntent('Хочу море и острова'), false);
});

test('Nha Trang city overview outranks same-origin island products', () => {
  const selected = chooseCityOverviewTour([islandTour, cityTour], 'Нячанг', ['hon-tam','nhatrang-day']);
  assert.equal(selected?.id, 'nhatrang-day');
});

test('orchestrator response is polished into a concrete city recommendation without repeating interest question', async () => {
  const request = new Request('https://max-tour-demo.viiversion.com/api/ai/chat', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ message:'Хочу обзорную экскурсию', context:{ destination:'Нячанг' } }),
  });
  const original = new Response(JSON.stringify({
    ok:true,
    source:'ai-orchestrator-v23',
    reply:'Что вам больше хочется: море и острова, природа и красивые виды или обзор города?',
    tourId:'',
    tourIds:['hon-tam','nhatrang-day'],
    nextStep:'ask_date',
    quickReplies:['Сегодня','Завтра','Дата гибкая'],
    memory:{ origin:'Нячанг', destination:'', preferences:['город и культура'], adults:2, children:[], infants:0, date:'', format:'' },
  }), { status:200, headers:{ 'content-type':'application/json; charset=utf-8' } });

  const polished = await polishCityOverviewResponse(request, env, new URL(request.url), original);
  const payload = await polished.json();
  assert.equal(payload.tourId, 'nhatrang-day');
  assert.equal(payload.nextStep, 'ask_date');
  assert.match(payload.reply, /Обзорная экскурсия по Нячангу/iu);
  assert.match(payload.reply, /На какую дату/iu);
  assert.doesNotMatch(payload.reply, /что вам больше хочется/iu);
});

test('exact mobile flow recovers Nha Trang overview from chat history even when backend memory/source are incomplete', async () => {
  const request = new Request('https://max-tour-demo.viiversion.com/api/ai/chat', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({
      message:'Хочу обзорную экскурсию',
      history:[
        { role:'user', text:'Я в Нячанге' },
        { role:'assistant', text:'Что вам больше хочется?' },
        { role:'user', text:'Нас 2 взрослых' },
      ],
      context:{ people:'2 взр.', destination:'' },
    }),
  });
  const original = new Response(JSON.stringify({
    ok:true,
    source:'fallback-ai',
    reply:'Что вам больше хочется: море и острова, природа и красивые виды или обзор города?',
    tourId:'',
    tourIds:['hon-tam','nhatrang-day'],
    nextStep:'ask_preferences',
    quickReplies:['Острова','Красивые виды','Обзор города'],
    memory:{ origin:'', destination:'', preferences:[], adults:0, children:[], infants:0, date:'', format:'' },
  }), { status:200, headers:{ 'content-type':'application/json; charset=utf-8' } });

  const polished = await polishCityOverviewResponse(request, env, new URL(request.url), original);
  const payload = await polished.json();
  assert.equal(payload.tourId, 'nhatrang-day');
  assert.equal(payload.memory.adults, 2);
  assert.equal(payload.nextStep, 'ask_date');
  assert.match(payload.reply, /по Нячангу/iu);
  assert.match(payload.reply, /На какую дату/iu);
  assert.doesNotMatch(payload.reply, /что вам больше хочется/iu);
});
