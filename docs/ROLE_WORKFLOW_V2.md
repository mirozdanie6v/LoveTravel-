# MAX TOUR — Role workflow v3

Updated: 2026-09-09

## Goal

The demo separates operational responsibilities instead of treating Manager/Admin/Owner as interchangeable dashboards. Mutable actions are isolated to the current public demo session and stored in D1.

## Tourist

**Purpose:** complete the purchase path without a manager.

Flow: select excursion → review full program/photos/conditions → select DEMO date → add adults/children and participant data → hotel/transfer → server-authoritative quote → order → simulated payment → My Trips.

Excursion galleries now open fullscreen. Mobile supports swipe; desktop supports arrows and Escape. The same D1 order enters Manager and Owner views.

## Manager

**Purpose:** execute and confirm orders, not rewrite the commercial product.

Manager can:
- filter the order queue;
- open an order;
- change status: New / Paid / Confirmed;
- assign a responsible DEMO manager from the team selector;
- edit pickup/transfer clarification;
- add an internal note;
- mark that the customer was contacted;
- see customer/contact, hotel, source, amount, paid and remaining;
- open the DEMO CRM customer view, search customers, see repeat customers and their order history.

Manager deliberately cannot change tour price/program. That belongs to Admin and prevents uncontrolled commercial changes while processing a booking.

## Administrator

**Purpose:** maintain the product sold through Telegram/site.

Admin can:
- create a new DEMO tour with a backend-valid payload;
- edit title and adult price;
- edit description and program;
- edit included items, extra costs and what-to-take;
- edit the ordered gallery URL list;
- publish/unpublish an excursion;
- add/update DEMO availability;
- create/update DEMO promotion;
- add a DEMO direction;
- inspect source analytics.

Changes to verified tours are stored as session-scoped D1 overrides. Base verified MAX TOUR records remain unchanged.

## Owner

**Purpose:** control the business rather than process every individual booking.

Owner panel shows order volume, paid/outstanding amounts, conversion, catalog status, queue by status, source mix, recent orders and the role workflow. Owner can edit DEMO manager SLA, notification preference, digest frequency and sales focus.

These settings demonstrate governance UX only. Actual notifications/SLA automation require production integrations.

## Shared business logic

```text
Telegram Mini App / Tilda
          ↓
   Unified order model
          ↓
 Manager: execution + communication + CRM view
          ↕
 Admin: product + prices + content + schedule
          ↓
 Owner: KPIs + queue + team rules
```

### Responsibility boundary

| Domain | Tourist | Manager | Admin | Owner |
|---|---:|---:|---:|---:|
| Browse/book/pay demo | ✓ |  |  | view outcome |
| Fullscreen excursion gallery | ✓ |  | edit source list |  |
| Order status |  | edit |  | monitor |
| Responsible manager / notes |  | edit |  | monitor |
| Customer/order history | own trips | CRM view |  | recent orders |
| Tour title/content |  |  | edit | monitor |
| Price |  |  | edit | monitor |
| Program/included/extras/what-to-take |  |  | edit | monitor |
| Gallery order |  |  | edit URLs | monitor |
| Schedule/promo/directions |  |  | edit | monitor |
| Analytics | own journey | queue KPIs | source/product analytics | business overview |
| Team operating rules |  | follow | follow | edit |

## Integration placeholders now visible in the product

The integration screen explicitly marks what is already implemented and what is waiting for credentials/provider decisions:
- Telegram Bot transport: Mini App/WebView ready; placeholder for token, initData validation and webhook.
- Tilda: unified order architecture ready; placeholder for webhook/API mapping.
- Payment: quote/order/payment-state demo ready; placeholder for real provider and callbacks.
- Live inventory: DEMO availability editor ready; placeholder for authoritative capacity and seat locking.
- Notifications/SLA: owner rules ready; placeholder for notification transport and automation.

## Still not production-complete

### Integration-dependent P0
1. Real Telegram bot transport and identity validation.
2. Real Tilda → Worker/D1 synchronization.
3. Real payment provider, callbacks/webhooks, reconciliation, retries/refunds.
4. Authoritative live schedule/capacity and seat locking.
5. Real customer/manager notifications and SLA automation.

### Identity/operations P1
6. Production authentication + RBAC for Manager/Admin/Owner. Public role switching is demo-only.
7. Map DEMO managers to actual staff accounts/team directory.
8. Immutable actor/time/before/after audit history for all back-office edits.
9. Extend CRM from order-derived customer cards to tasks/tags/segments/communication history if included.
10. Add cancellation/reschedule/refund/no-show operational workflow; real refund execution depends on payment integration.

### Content/media/QA P1
11. Replace ordered image-URL editor with real file upload/reorder to project-owned storage.
12. Move approved/licensed imagery into project-owned Cloudflare assets and WebP/AVIF.
13. Obtain the client-approved original vector/high-resolution MAX TOUR logo.
14. Add richer Owner reporting periods/targets/exports using production data.
15. Complete Telegram WebView QA on Android/iOS at 360/390/430 px, safe areas, keyboard and slow-network fallbacks.

### Package dependent P2
16. RU/EN/VI localization if included.
17. Marketing attribution integrations if included.
18. Full Tilda/site modernization if included beyond integration.

For excursion-by-excursion source comparison see `docs/SITE_CONTENT_AUDIT_V3.md`.
