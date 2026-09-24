# MAX TOUR — implementation roadmap v6

## Product boundary
Russian-language MAX TOUR sales system for Russian-speaking customers in Vietnam. Single Worker/D1 backend for Telegram Mini App, website/Tilda entry points and later additional sources.

## Source-grounded commercial rules
- Advance payment: customer chooses 30% deposit or 100% payment.
- Tour reschedule: free until 17:00 on the day before the tour; after that 30% is retained.
- Cancellation: free more than 48 hours before departure; until 17:00 on the day before departure 30% is retained; on departure day/no-show 100% is retained.
- Force majeure can result in refund or reschedule; medical cancellation can be reviewed with documents.
- Refund: up to 7 business days; bank fees may apply.
- If a group is not formed, paid deposit is returned 100%.
- Site-listed payment families: card, SBP/Kaspi, bank/international transfers. Product target also includes VNPay and an extensible `other` payment method.

## Phase 1 — individual booking and payment choice
1. Explicit format selection: Individual / Group.
2. Individual flow uses verified private pricing tiers where the source publishes unambiguous tiers.
3. Adults + children inputs stay available; required per-tour participant fields remain authoritative.
4. Date selection.
5. Contact/profile fields prefill from Telegram when available (name + username; phone only when explicitly available from a trusted source).
6. Server-side quote.
7. Customer chooses 30% or 100%.
8. Payment method selector: SBP, Kaspi, VNPay, card, bank/international transfer, other.
9. Real provider execution remains disabled until provider credentials/merchant contract exist; demo never fakes a real charge.
10. Order snapshot stores selected payment choice/method and the server quote.

## Phase 2 — group departure assembly
1. Selecting Group opens a dedicated departure board rather than immediate checkout.
2. User sees departures already gathering for this tour.
3. User can join an existing departure.
4. User can create a desired date and wait for the group to form.
5. D1 stores departure, members, requested seats, adults/children and contacts.
6. Statuses are designed for: gathering, confirmed, cancelled, completed.
7. Group capacity/minimum are per-tour configuration, not global invented values; demo fallbacks are explicitly labelled DEMO.
8. When production group confirmation is connected, the system can trigger payment/notification steps.
9. If a group is cancelled because it did not form, refund logic must support 100% deposit refund if a deposit had already been taken.

## Phase 3 — unified CRM and Mini App administration
- One order/customer model for Mini App + site/Tilda + later traffic sources.
- Administrator manages tours, directions, prices, content, schedules, promos, group departures and statuses.
- Administrator can cancel a departure for operational reasons (for example weather) and trigger segmented notifications.
- Customer card: Telegram identity where available, contact details, orders, tags, notes, tasks, communication state.
- Fast customer contact action in Manager/Admin screens.
- Owner audit log keeps actor/time/before/after.
- Future website synchronization uses the same canonical backend: admin changes become website/Mini App content changes instead of two separate catalogs.

## Phase 4 — full site catalog + imagery + facets
- Build a site-sync importer against maxtourvietnam.com category/detail pages.
- Import only data actually present on the source pages; never infer unpublished prices/rules.
- Preserve official tour source URL.
- Collect page imagery from MAX TOUR/Tilda CDN for each imported tour.
- Facets for discovery: destination/place, tour format, family/active/relaxed, age suitability when supported, child rules, premium, water/nature/city/culture and other grounded tags.
- Ambiguous demographic tags such as gender are not inferred from photos or stereotypes; they must be explicitly configured in Admin if MAX TOUR wants such merchandising.

## Phase 5 — production integrations and QA
- Telegram bot token, initData auth/RBAC, webhook and notifications.
- Tilda/site field mapping into the common order pipeline.
- Chosen payment providers and merchant credentials; callbacks, reconciliation, retries and refunds.
- Authoritative schedule/capacity and seat locking.
- Project-owned approved image storage (Cloudflare) after client asset approval.
- Telegram WebView QA at 360/390/430 px; slow-network/error states.

## Refund implementation rule
The backend must not invent a refund result in a time window that cannot be evaluated from stored departure time and source rules. Automatic refunds require a real provider transaction and enough schedule metadata to evaluate the policy. Otherwise the system creates a manager-review refund case with the source rule attached.
