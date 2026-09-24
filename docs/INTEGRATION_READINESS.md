# MAX TOUR — Integration Readiness

Updated: 2026-09-09
Source of truth repository: `mirozdanie6v/MAX-TOUR`
Production URL: `https://max-tour.viiversion.com`
Cloudflare Worker: `max-tour-demo`
D1 database: `max-tour-demo`
D1 binding: `DB`

## Status

The application is integrated as one Cloudflare project: React client + Worker API + D1.

Everything that can be implemented without external credentials is prepared in code. Telegram delivery remains dormant until its server-side secrets/chat IDs are configured. Real payment processing remains intentionally unimplemented because MAX TOUR has not selected a production payment provider and commission model.

## Completed integration

### Tourist

- Server-created HttpOnly demo session.
- Session isolation in D1.
- Seven-day sliding session expiry.
- Future-safe DEMO availability generated relative to the current Vietnam date.
- Verified catalog merged with only the current session's DEMO overrides.
- Tour detail and DEMO schedule API.
- Server-authoritative booking quote.
- Participant validation.
- Published child/group/private pricing rules.
- Official private-price conflicts fail closed instead of selecting a hidden interpretation.
- Verified transfer surcharge calculation.
- Functional session-scoped DEMO promotions.
- Required `Idempotency-Key` for order creation.
- Tourist-created orders separated from seeded manager samples.
- `My trips` shows only tourist-created orders from the current session.
- DEMO payment is idempotent and cannot be applied to seeded manager samples.

### Manager

- Session-scoped order queue.
- Order detail.
- Status changes.
- Status history.
- Assigned manager.
- Pickup note.
- Internal note.
- Contact marker.
- Manager and owner notification events are queued when orders/payments change.

### Admin

- Tour list.
- Tour edits via DEMO override without mutating verified source records.
- Create DEMO tour.
- Add DEMO direction.
- Add/update DEMO schedule dates.
- Add/update DEMO promotion.
- Existing `-10%` promo UI is converted into an actual 1000 bps DEMO discount by the server.
- Analytics from D1 events/orders/payments.

### Owner

- Orders, sales volume, paid/outstanding amounts.
- Conversion shown as a true percentage.
- Published/total catalog metrics.
- Channel breakdown.
- Team workflow.
- Owner rules stored in the current D1 demo session.
- Telegram configuration/readiness panel.
- Notification outbox counts.

### Telegram-ready layer

Implemented without embedding any secret:

- `notification_outbox` in D1.
- Manager/owner notification events for new orders.
- Manager/owner notification events for DEMO payments.
- Owner notification events for status changes.
- Outbox flush service.
- `/start` handler.
- Telegram Mini App inline button support.
- Secret-token validation for Telegram webhook requests.
- Self-registration of the Telegram webhook after secrets are configured.
- Telegram webhook status inspection.

API:

- `GET /api/integrations/telegram/status`
- `POST /api/integrations/telegram/flush`
- `GET /api/integrations/telegram/webhook`
- `POST /api/integrations/telegram/webhook`
- `POST /api/telegram/webhook`

## D1 migrations

- `0001_init.sql` — catalog/session/orders/payments/analytics base.
- `0002_indexes.sql` — indexes.
- `0003_operations_owner.sql` — manager operations + owner settings.
- `0004_integration_hardening.sql` — customer-visible order separation, session expiry, functional promo fields, Telegram notification outbox.

The CI pipeline applies all migrations to a fresh local D1, runs the verified seed twice, checks the expected schema and verified Dalat Premium price, then builds a Wrangler dry-run bundle.

## Verified data rules

Verified MAX TOUR facts remain separate from DEMO data.

Known official-source conflicts are not silently normalized. For example, the Nha Trang daytime private pricing publishes overlapping tiers at exactly seven people. The quote engine therefore requires a manual quote for that ambiguous combination instead of selecting one price behind the user's back.

DEMO schedule, DEMO promo, seeded orders and DEMO analytics are explicitly demo data.

## Remaining secrets / values

These are the only Telegram values that still need to be entered externally:

- `TELEGRAM_BOT_TOKEN` — Cloudflare secret.
- `TELEGRAM_WEBHOOK_SECRET` — Cloudflare secret.
- `TELEGRAM_MANAGER_CHAT_ID` — Cloudflare secret/variable.
- `TELEGRAM_OWNER_CHAT_ID` — Cloudflare secret/variable.

`TELEGRAM_MINIAPP_URL=https://max-tour-demo.viiversion.com` is already configured as a non-secret Worker variable.

GitHub production deployment expects repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

If they already exist in the repository, no new Cloudflare credentials need to be entered.

## After Telegram secrets are added

No code changes are required.

1. Deploy the Worker.
2. Call `POST /api/integrations/telegram/webhook` once. The Worker uses its own Bot Token to register `https://max-tour.viiversion.com/api/telegram/webhook` with Telegram and applies `TELEGRAM_WEBHOOK_SECRET`.
3. Open the bot and send `/start`.
4. The bot returns an `Open MAX TOUR` Mini App button.
5. Create a demo order and flush/check the outbox.

## Deployment pipeline

`.github/workflows/deploy.yml` performs:

1. credential presence check;
2. `npm ci`;
3. TypeScript check;
4. unit tests;
5. frontend/Worker build;
6. remote D1 migrations;
7. idempotent verified seed;
8. Worker/assets deploy;
9. production smoke test.

The smoke test validates:

- public application;
- D1 health;
- HttpOnly browser session;
- catalog;
- Dalat Premium verified price;
- future DEMO availability;
- server quote;
- Telegram integration-status endpoint;
- demo reset.

## Deliberate production boundary

The current payment endpoint is a DEMO payment simulator. It records simulated payment state in D1 and never claims a real charge occurred.

A real payment provider must be implemented only after MAX TOUR confirms:

- provider;
- acquiring/payment methods;
- commission rules;
- webhook signature contract;
- refund behavior;
- production settlement currency.

Until then there should be no fake provider name, fake commission or fake successful production payment.
