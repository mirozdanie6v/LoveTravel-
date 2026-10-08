# Restored BookingConfigurator UX verification

Based on main 09b003419995ed40a9fe2b202cba0acff684440f. Frontend fixes retain the existing domain renderer, BookingConfigurator and one BookingTransaction. No production provider, transaction, contract, store or booking mutation policy was changed.

## Visible behavior

- Opening either tour shows one configurator loading state. Temporary rate/date lists and the duplicate legacy booking bar are no longer emitted by the domain renderer.
- Loading and failure states keep the form visible, disable its CTA and offer retry. A failed bootstrap does not reuse a partially resolved configuration.
- Header date, price and next action come from the same resolved transaction as the form. Until a slot is selected, no default date is displayed. A starting per-person price is distinguished from the exact total; selecting a rate changes the estimate to that rate.
- Selection rows use the actual app container width. Long rate, participant and contact values wrap without line clamping. The price summary follows the rows and does not cover them on mobile.
- Rate titles and descriptions reuse the already loaded server-localized domain. Provider IDs and canonical selection stay unchanged. Provider descriptions take priority over the existing semantic description fallback.
- Booking sheets receive keyboard focus, contain Tab/Shift+Tab and restore focus after Escape/close.
- Participant rate limits are displayed. Invalid maximum/minimum/capacity selections return to the participant step without a completion checkmark.

## Verification

- 463 Node tests passed, including new first-paint, loading/failure, selected date/total, localized presentation and participant-maximum regressions.
- Media validation and production build passed. Asset cache version: 20261008-config-ux-v2; script order unchanged.
- In-app browser verified the existing production frontend served locally, at desktop embed width and 390 px mobile width.
- Public GET snapshots of products 1287578 and 1287580 were used as provider input. All subsequent transactions ran in the local production API/DO/store harness; any upstream provider fetch throws.
- Robinson Beach: 15 October 2026 at 09:00, Robinson + Hòn Mun, one adult, hotel pickup, room 304 and contact fields produced exact Quote $65.
- Hòn Mun: 15 October 2026 at 08:00, Bãi Sỏi, two adults, one child, one infant, meet-on-location and contact fields produced exact Quote $146.
- Extended contract fixture: date, explicit second start time/rate, min/max participants, pickup place/room, custom dropoff, booking extra, passenger extra, both extra question answers, booking select question, custom field, four passenger names and date/number questions produced ready-to-book Quote $158. Local exact Quote approval succeeded.
- Keyboard focus wrapped inside the dialog and returned to the triggering step. Mobile selected values had no measured clipping.
- Mutation blocker tests passed at public API, router, internal BookingSession and provider levels. No real booking was created.

Screenshots from the browser checks are stored locally in artifacts/ux-fix/. The updated automated functional parity gate also verifies synchronized header summaries, absence of legacy controls and unclipped values.

These changes are prepared for review in fix-booking-configurator-ux. This UX task does not enable reservation or deploy the changes to production.
