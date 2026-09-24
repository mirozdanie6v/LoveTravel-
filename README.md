# MAX TOUR — Full-stack Telegram Mini App Demo

Production: https://max-tour.viiversion.com/
Health: https://max-tour.viiversion.com/api/health

## Stack

- React + TypeScript + Vite
- Cloudflare Worker API
- Cloudflare D1 (`DB` binding)
- Cloudflare Worker Static Assets
- GitHub Actions CI
- Shared Cloudflare deployment runner using the existing authorized `rusinfocenter` repository secrets for the `viiversion.com` account. Secret values are never copied into this repository.

## Architecture

```text
React Mini App / browser demo
          ↓ same-origin /api/*
Cloudflare Worker (TypeScript)
          ↓ DB binding
Cloudflare D1
```

Verified MAX TOUR catalog data and mutable demo data are separated. Demo changes are isolated by a cryptographically random server-created session stored in a Secure + HttpOnly + SameSite cookie.

## Demo roles

Role switching is available from the right hamburger menu in the public demo.

- **Tourist** — catalog → detail → date → participants → hotel/transfer → quote → order → simulated payment → My Trips.
- **Manager** — receives the same D1 order, changes status, assigns a responsible manager, edits pickup/transfer clarification, adds internal operational notes and marks customer contact.
- **Administrator** — creates tours and edits title, adult price, description, program, publication state, demo schedule, promo and directions.
- **Owner** — sees business-level demo KPIs/order queue/source mix and edits demo operating rules such as manager SLA, notification preference, digest frequency and sales focus.

Detailed responsibility/business logic: `docs/ROLE_WORKFLOW_V2.md`.
Client-promise audit and remaining production work: `docs/CLIENT_PROMISE_AUDIT.md`.

## Important demo boundary

The public role switch is a demonstration device, not production authorization. Manager/Admin/Owner access is intentionally session-scoped and must be protected by real authentication + RBAC before live use.

## API overview

System/session:
- `GET /api/health`
- `GET|POST /api/session`
- `POST /api/demo/reset`

Catalog/booking:
- `GET /api/destinations`
- `GET /api/tours`
- `GET /api/tours/:id`
- `GET /api/tours/:id/availability`
- `POST /api/booking/quote`
- `POST /api/orders`
- `GET /api/orders/:id`
- `GET /api/my-trips`
- `POST /api/payments/demo`

Manager:
- `GET /api/manager/orders`
- `GET /api/manager/orders/:id`
- `PATCH /api/manager/orders/:id/status`
- `GET /api/manager/orders/:id/ops`
- `PATCH /api/manager/orders/:id/ops`

Admin:
- `GET|POST /api/admin/tours`
- `PATCH /api/admin/tours/:id`
- `POST|PATCH /api/admin/tours/:id/schedule`
- `POST|PATCH /api/admin/tours/:id/promo`
- `GET|POST /api/admin/directions`
- `GET /api/admin/analytics`

Owner:
- `GET /api/owner/overview`
- `PATCH /api/owner/settings`

Analytics:
- `POST /api/analytics/event`

## D1

Database: `max-tour-demo`
Binding: `DB`

Migrations:
- `0001_init.sql`
- `0002_indexes.sql`
- `0003_operations_owner.sql`

Money is stored in integer minor units. SQL user values use prepared statements. Quote/order totals are calculated server-side.

## Local development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Apply local migrations with Wrangler using the project `wrangler.jsonc`. Verified seed lives in `seed/verified-max-tour-data.sql` and is idempotent.

## Real vs simulated

Real in this demo:
- React UI
- Worker API
- D1 persistence
- session isolation
- server-side pricing
- order persistence
- manager status and operations persistence
- admin mutations
- owner demo settings/overview
- analytics event persistence/querying
- production deployment

Still simulated/not connected to live business systems:
- real money movement/payment provider
- production Tilda synchronization
- live seat inventory/capacity locking
- real Telegram bot transport/identity when credentials are absent
- real company-wide historical analytics
- production staff authentication/RBAC
- real notification/SLA automation

## Source/data policy

Business facts must come from the official MAX TOUR website or the buyer request used to prepare this demo. Artificial operational values are marked as DEMO data. Images are the explicit exception: higher-quality replacements may be used, but must be semantically exact to the excursion/location.

Official source: https://maxtourvietnam.com/

## Branding/images

The header currently uses a corrected current-site MAX TOUR graphic with a text fallback. A client-supplied original vector/high-resolution logo should replace the remote website asset before production launch. Demo travel imagery may be externally sourced under the project image policy; production should move approved/licensed media to project-owned Cloudflare assets.

## Telegram behavior

The frontend calls `window.Telegram?.WebApp?.ready()` and `expand()` when available and remains fully usable in a normal browser. Real Telegram identity must only be trusted after backend `initData` validation using a bot token stored as a Cloudflare secret.

## Deployment

The source of truth is `mirozdanie6v/MAX-TOUR@main`. Cloudflare deployment is executed by a shared GitHub Actions runner in `mirozdanie6v/rusinfocenter` because that repository already holds the authorized Cloudflare secrets for the `viiversion.com` account. The runner checks out only this repository's `main`, runs CI/migrations/seed/deploy and verifies the production domain.

No Cloudflare secret value is committed here.

## Production verification

Production deployment is considered successful only after:
- typecheck/tests/build succeed;
- remote D1 migrations apply;
- verified seed succeeds;
- Worker + assets deploy;
- custom domain is attached;
- `/api/health` succeeds;
- homepage smoke succeeds.

For current remaining work see GitHub Issue #1 and `docs/CLIENT_PROMISE_AUDIT.md`.
