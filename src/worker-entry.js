import worker from './worker-r2.js';
import { handleAdminTourMediaApi } from './admin-tour-media-api.js';
import { polishCityOverviewResponse } from './ai-city-overview-polish-v27.js';
import { guardPrimaryIntentResponse } from './ai-primary-intent-guard-v30.js';
import { guardStickyIntentResponse } from './ai-sticky-intent-v31.js';
import {
  normalizePartyCountRequest,
  servePartyContextGuard,
  injectPartyContextGuard,
} from './ai-party-context-guard-v32.js';
import {
  prepareConversationRequest,
  guardConversationResponse,
  serveConversationController,
  injectConversationController,
} from './ai-conversation-quality-v33.js';

async function requestLocale(request, url) {
  if (url.pathname !== '/api/ai/chat' || request.method !== 'POST') return 'ru';
  const header = String(request.headers.get('x-max-tour-locale') || '').toLowerCase();
  if (header === 'vi' || header === 'en' || header === 'ko') return header;
  const body = await request.clone().json().catch(() => null);
  const raw = String(body?.locale || body?.context?.locale || '').toLowerCase();
  return raw === 'vi' || raw === 'en' || raw === 'ko' ? raw : 'ru';
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const locale = await requestLocale(request, url);
    const conversationAsset = serveConversationController(url);
    if (conversationAsset) return conversationAsset;
    const partyGuardAsset = servePartyContextGuard(url);
    if (partyGuardAsset) return partyGuardAsset;

    const mediaAdminResponse = await handleAdminTourMediaApi(request, env, url);
    if (mediaAdminResponse) return mediaAdminResponse;

    // The v27/v30/v31/v32/v33 AI guard stack was designed for Russian copy.
    // VI/EN already use the locale-aware core worker; bypass Russian post-processors
    // so they cannot replace a localized answer with a Russian fallback.
    if (url.pathname === '/api/ai/chat' && request.method === 'POST' && locale !== 'ru') {
      return worker.fetch(request, env, ctx);
    }

    const preparedRequest = await prepareConversationRequest(request, env, url);
    const normalizedRequest = await normalizePartyCountRequest(preparedRequest, url);
    const response = await worker.fetch(normalizedRequest, env, ctx);
    const polished = await polishCityOverviewResponse(normalizedRequest, env, url, response);
    const guarded = await guardPrimaryIntentResponse(normalizedRequest, env, url, polished);
    const sticky = await guardStickyIntentResponse(normalizedRequest, env, url, guarded);
    const quality = await guardConversationResponse(normalizedRequest, env, url, sticky);
    const withPartyGuard = await injectPartyContextGuard(quality);
    return injectConversationController(withPartyGuard);
  },
};
