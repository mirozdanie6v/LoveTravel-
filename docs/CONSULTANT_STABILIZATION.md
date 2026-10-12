# LoveTravel consultant stabilization

Base: `41729ed936140cde4f86ec72967c1ec831b57edb`. Work proceeds on a separate branch.
Provider writes remain blocked by `booking-mutation-policy.js` at the public API,
BookingSession and provider boundaries. Opening a form does not approve a Quote.

## Active request path

`wrangler.jsonc` uses `src/worker-r2.js`, not `worker-entry.js`.

1. Browser `LoveTravelConversation` initializes the server-issued guest cookie.
2. `ensureSalesSession` resolves a conversation within that guest's namespace.
3. Chat, transaction changes and deletion enter the same guest Durable Object queue.
4. Chat uses Sales Orchestrator → Conversation Intelligence → capability broker and Bókun provider.
5. Canonical selection/Quote commands enter a separate transaction Durable Object.
6. Response Composer presents the result; the existing configurator receives the same transaction.

The guest and transaction objects use different names in the existing
`BOOKING_SESSIONS` binding. This avoids a nested call to the same queue.
D1 remains authoritative. Objects no longer retain passenger snapshots in
`last-known-transaction`; old copies are purged on use and deletion.

The legacy orchestrator/selection/availability fallthrough was unreachable after
the Sales Agent handled `/api/ai/chat`. It has been removed from production routing.
Legacy modules and tested pure helper exports remain available for their existing
consumers. They are not another production chat route.

## Guest ownership and data lifecycle

- `__Host-lt_guest` is a server-generated 256-bit credential with Secure, HttpOnly,
  SameSite=Lax and a 30-day lifetime. Only its hash is stored in D1.
- A browser conversation ID selects a dialogue within the authenticated guest;
  knowing another client's dialogue or internal transaction ID is insufficient.
- The old unsigned `lt_sales_sid` is not an access credential. Existing anonymous
  scopes cannot be safely adopted: the first upgraded visit starts a fresh server
  scope. Previously created order records are preserved.
- New conversation clears the current browser context and configurator, without
  deleting previous saved dialogues.
- Delete saved conversations removes chat and unfinished transaction snapshots,
  receipts, evidence and audit snapshots belonging to that guest. Completed orders
  and orders needing reconciliation keep their separate business records.
- Revocation tombstones reject late requests for deleted dialogues. The hourly
  cron cleans inactive dialogues/drafts after 30 days and retains tombstones for
  another 30 days. Completed order retention is outside this chat policy.
- Migration `0009_conversation_ownership.sql` describes the added metadata tables;
  runtime initialization is idempotent.

## Pricing and conversation

Exact card prices require an active, unexpired Quote, matching transaction/Quote
revisions and a fingerprint computed from the current provider selection. The
fingerprint includes option, date, time, passengers, extras and transport.
Parameter edits clear exact card prices immediately; an expired Quote falls back
to the catalog's price from. Decimal totals are retained.

Unchanged commercial terms are not repeated in full after a hotel update or a
short continuation. Explicit acceptance of an existing form invitation opens the
form; it never calls APPROVE or RESERVE. Changed commercial terms receive a full
updated summary. Inclusion lists use bullets; option-choice numbering is preserved.

## Languages

Complete cache entries are applied atomically. A complete previous translation is
accepted only for matching source hashes. Missing translations explicitly identify
the English original in the selected language. Numeric prices and provider IDs are
never translated or inferred by the model.

`verify-live-ai-option-catalog.mjs --full-matrix` checks all 55 exact option/locale
pairs. Without the flag, its report explicitly records the 11-case sample.
`verify-localization-readiness.mjs` performs public GETs and produces a field-level
review sheet. Cache readiness does not certify linguistic quality; review of
cancellation, pickup, inclusions and child restrictions by native speakers remains
a release consideration.

## Checkpoints

| Stage | Verification at checkpoint |
| --- | --- |
| 1. DOM stability | Regression failed on repeated text writes before the fix; 707 tests passed after it. |
| 2. Ownership and state | Same-ID guests isolated, parallel turns retained, revoked requests rejected, retention tested; 711 tests passed. |
| 3. Conversation | Follow-up composition, changed terms, numbered choices and form handoff; 716 tests passed. |
| 4. Exact price | Fingerprint covers transport/extras, mismatched and expired prices discarded; 718 tests passed. |
| 5. Languages | Atomic translation/fallback metadata, locale notices, full-matrix option; 719 tests passed. |

Browser acceptance, final totals and release limitations are recorded after the
last verification run. Production deployment is a separate step: merging this
repository's main branch automatically triggers a production release.
