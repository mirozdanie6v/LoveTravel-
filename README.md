# MAX TOUR — standalone v28 demo

Standalone implementation of the exact supplied `maxtour-miniapp-prototype-v28.html` and `maxtour-demo-catalog-v28.json`.

It does **not** import, extend or depend on the repository's existing React application.

## Exact-source guarantee

The two supplied source files are stored in `source/` as checksummed gzip+base64 chunks because the original HTML contains large embedded image payloads. `build.mjs` reconstructs them byte-for-byte and verifies SHA-256 before every build.

- HTML SHA-256: `be7cceb157e1169f869ad11ead32bdc012f076d7aeddf5a36adf10fe25ca9472`
- Catalog SHA-256: `fc380915d882e9ed27b55a957c86dbba5dbcedb2e8be4892593b1bb5a427c1d4`

The build then injects the runtime adapters before `</body>`. No existing v28 source HTML is rewritten.

The administrator prototype is published separately at `/admin/`, and the director prototype at `/director/`. Both are based on the approved v3 cabinet prototypes and are linked to the tourist interface through the role switch in every header. The demo cabinets use the same D1 source of truth: a tourist booking and demo payment appear in admin orders, an admin-created offline order or group departure is visible to the Mini App, and the director reads the resulting order/payment/source metrics. Director tasks are persisted to D1 and appear in the admin task queue.

## Demonstration flow

1. Create a booking and complete the demo payment in the tourist Mini App.
2. Open `/admin/` and show the order, payment status, customer and departure.
3. Use **Создать офлайн-заказ** to demonstrate a manual sale, or **Создать групповой выезд** to publish a new date.
4. Refresh the Mini App to see the new group departure.
5. Open `/director/`: the shared D1 order, payment, source and revenue layer is shown above the interactive analytical slices.
6. Create a task in the director cabinet and complete it from **Задачи директора** in the admin cabinet.

The analytics prototype keeps demographic slices as explanatory fixtures until the selected CRM supplies gender, age and origin fields; order, payment, source and departure metrics are live in the demo.

## Architecture

- `source/` — exact supplied v28 sources, losslessly packaged and checksummed.
- `src/runtime-api.js` — persistence plus wiring for prototype controls that had no handler.
- `src/admin-v3.html` — self-contained administrator cabinet prototype.
- `src/director-v3.html` — self-contained director cabinet prototype.
- `docs/director-v3-*` — supplied UX and QA notes for the director prototype.
- `src/role-switch.*` — top-level tourist/administrator/director role navigation.
- `src/worker.js` — Cloudflare Worker API + static assets.
- `migrations/` — dedicated D1 schema for demo sessions, bookings, travelers, favorites, admin demo actions and qualified AI-consultant leads.

The Mini App includes a domain-aware AI-consultant demo for complex tours. It collects party composition (including children and infants), format, dates, preferences, hotel/transfer and budget, shows an indicative catalog quote, and stores a structured manager brief in `ai_consultations`. The adapter is deliberately API-ready: a production deployment can replace the deterministic dialog layer with an LLM/amoCRM or Bitrix integration without changing the customer flow.
- `build.mjs` — reconstructs exact sources and produces `dist/`.

The original React project at repository root is not used by this demo.
