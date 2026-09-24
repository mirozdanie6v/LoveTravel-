# MAX TOUR — audit against the commercial proposal and buyer request

Updated: 2026-09-09

## Current demo — implemented

The current product is a working full-stack demonstration of the future MAX TOUR sales and operations system: React/TypeScript frontend, Cloudflare Worker API and D1 persistence.

### Tourist
- Premium MAX TOUR travel UI and current-site brand graphic.
- Catalog, directions and detailed excursion pages.
- Excursion content for the eight detailed demo routes rechecked against the current MAX TOUR site; programs and stop descriptions expanded.
- 4–6 itinerary-specific photos per detailed excursion where source-quality material can be represented safely.
- Fullscreen photo viewer with tap/click, mobile swipe, previous/next, keyboard arrows/Escape, counter and captions.
- Program, pickup/return, included items, extras, what-to-take and link to the official MAX TOUR source page.
- Date, adults/children, participant data, hotel/transfer, server-authoritative quote, D1 order, DEMO payment and My Trips.

### Manager
- D1 order queue and status editing.
- Responsible DEMO manager selector.
- Pickup/transfer clarification, internal note and customer-contact marker.
- DEMO CRM customer view derived from the D1 order history: search, repeat-customer indicator, order history and spend/paid totals.

### Administrator
- Create a DEMO excursion.
- Edit title, adult price, description and program.
- Edit included items, extra costs and what-to-take.
- Edit ordered gallery URLs.
- Publish/unpublish.
- Edit DEMO availability and promotions.
- Add directions and inspect analytics.

### Owner
- Orders, gross amount, paid/outstanding, conversion and catalog status.
- Queue by status, sources and recent orders.
- Manager SLA, notification preference, digest frequency and sales focus.
- Clear role-responsibility model for Tourist / Manager / Admin / Owner.

### Integration placeholders
The UI now explicitly distinguishes implemented internal logic from external integration work:
- Telegram Bot transport — Mini App/WebView is ready; token/initData/webhook are placeholders.
- Tilda — unified order model is ready; site webhook/API mapping is a placeholder.
- Payment — quote/order/payment-state demo is ready; real provider/callbacks are placeholders.
- Live inventory — DEMO availability is ready; authoritative capacity/seat locking is a placeholder.
- Notifications/SLA — rules UI is ready; real transport/automation is a placeholder.

## Comparison with the buyer request

| Buyer/client requirement | Current status |
|---|---|
| Show the Telegram Mini App customer experience | DONE |
| Tourist independently chooses an excursion | DONE |
| Detailed excursion information | DONE and enriched from client site |
| Tour photos | DONE; fullscreen viewer added |
| Choose date and number of people | DONE (DEMO availability) |
| Server-side pricing | DONE |
| Create order without manager | DONE |
| Payment path without manager | DONE as DEMO |
| Order becomes visible to manager | DONE |
| Manager can work with/edit operational order data | DONE |
| Customer/order history for manager | DONE as DEMO CRM |
| Tilda + Telegram unified-system concept | DONE as architecture proof |
| Add/edit tours | DONE as DEMO |
| Change prices/content/program | DONE as DEMO |
| Change schedule/promotions | DONE as DEMO |
| Analytics | DONE as DEMO |
| Owner/director control panel | DONE |
| Multi-direction architecture | DONE |
| Real Telegram transport/auth | NOT YET — integration |
| Real Tilda sync | NOT YET — integration |
| Real acquiring | NOT YET — integration |
| Live capacity/seat locking | NOT YET — integration |

## Remaining work before production

### P0 — requires external integrations or client credentials
1. Real Telegram Bot token, initData validation, webhook and confirmations.
2. Real Tilda → Worker/D1 synchronization.
3. Real payment provider, callbacks/webhooks, reconciliation and refunds.
4. Authoritative live schedule/capacity with seat locking.
5. Real customer/manager notifications and SLA automation.

### P1 — internal hardening still possible
6. Production authentication/RBAC for Manager/Admin/Owner.
7. Real staff directory instead of DEMO manager names.
8. Immutable audit log for all back-office edits.
9. Extend CRM with tasks, tags/segments and communication history if included in scope.
10. Cancellation/reschedule/no-show workflow; actual refund execution still depends on payment integration.
11. Real file upload/reorder for gallery rather than ordered image URLs.
12. Richer Owner reporting periods, targets and exports.
13. Android/iOS Telegram WebView QA at 360/390/430 px and slow-network fallbacks.

### P1 — client assets/content ownership
14. Obtain original client-approved SVG/high-resolution logo.
15. Move licensed/client-approved imagery to project-owned Cloudflare assets and WebP/AVIF.

### P2 — package dependent
16. RU/EN/VI localization if included.
17. Marketing attribution integrations if included.
18. Full Tilda/site modernization if included beyond integration.

Detailed content comparison: `docs/SITE_CONTENT_AUDIT_V3.md`.
Detailed role/business workflow: `docs/ROLE_WORKFLOW_V2.md`.
