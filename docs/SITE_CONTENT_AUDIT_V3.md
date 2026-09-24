# MAX TOUR — client-site content audit v3

Updated: 2026-09-09

## Scope

Source of truth for excursion facts in this pass: the current MAX TOUR website (`https://maxtourvietnam.com/`) and the individual excursion pages linked from the product data. The demo image policy still permits better external travel photography, but every image must depict an actual stop/location from the corresponding excursion.

This pass audits the eight detailed excursions already represented in the Mini App. It does **not** invent full records for the many additional tours that are only visible as short catalog/marketing summaries on the site. Those should be imported later only when their individual pages/data can be mapped safely.

## Comparison and changes

| Excursion | Before | Verified/enriched now | Gallery |
|---|---|---|---:|
| Далат «Премиум» | Correct price/basic route, abbreviated stop names | Detailed stop context for coffee plantations, pass, Clay Village, Crazy House, Linh Phuoc, lunch, Datanla, animal/coffee farm, cable car; existing verified inclusions/extras/what-to-take preserved | 6 exact route photos |
| Далат «ВИП» | Correct price and list, short description | Added Hobbit village, tasting, golden Buddha and richer stop descriptions; cable-car image removed because it is not in this program | 5 exact route photos |
| Далат «Стеклянный мост» | Correct price/basic list; no actual bridge photo | Detailed route context + bridge fact from MAX TOUR page (about 325 m long / about 90 m above ground); actual Ngàn Thông glass-bridge photo added | 6 exact route photos |
| Фуйен | Correct price/basic list; one image | Added context for wild beach, Tuy Hoa/Cham tower, Nghinh Phong, cape/lighthouse, temple, Thanh Luong, basalt garden and Mang Lang | 6 exact route photos |
| Дневной Нячанг | Correct price/basic list; one image | Added context for Long Son, cathedral, Hon Chong, Chuc Lam Phung, Po Nagar, north beach and lunch; removed DO Theatre from gallery because it is not on the day route | 4 exact route photos |
| Вечерний Нячанг | Correct price/basic list; one image | Added context for Da Bao, Hon Chong, cathedral, DO Theatre, Po Nagar, Long Son and Old Nha Trang restaurant; added condition that this program runs on restaurant-show days and should be confirmed in advance | 4 exact route photos |
| Далат 2 дня | Correct price variants/basic route, heavily abbreviated | Expanded Day 1 / Day 2 sequence, hotel/night-market/free-evening context, chocolate tasting, Linh An, Pongour, railway station, silk factory, cable car and Elephant waterfall | 6 exact route photos |
| Ханой + Халонг 2д/1н | Correct package price/basic list, one image | Expanded airport/Hanoi sightseeing/meal/hotel/Halong transfer/Diamond Era/Sung Sot/Luon/Titov/sunset/return sequence; retained seasonal/airfare price caveat | 4 exact route photos |

## Global MAX TOUR terms added to UI

The Help screen now reflects site-supported terms already relevant to the demo:
- deposit range 30–100% depending on booking;
- cancellation/reschedule timing and refund timing;
- 100% deposit return if MAX TOUR cancels because a group does not form;
- remote-area transfer matrix: Cam Ranh; Diamond Bay / Amiana / Alibu / DO Theatre; Zoklet / GM Resort / Paradise;
- payment methods named on the site;
- weather note used by MAX TOUR.

All real-money behavior remains clearly marked as not connected in the demo.

## Product improvements completed without external integrations

- Fullscreen excursion lightbox: tap any gallery photo, swipe on mobile, previous/next arrows, keyboard arrows and Escape on desktop, image counter and caption.
- Manager mini-CRM: customer grouping from D1 orders, search, repeat-customer indicator, order history and DEMO spend/paid aggregation.
- Manager assignment changed from arbitrary free text to a small DEMO staff selector.
- Admin editor expanded to title, adult price, description, program, included items, extra costs, what-to-take, gallery URL order and published state.
- Each excursion detail now exposes its official MAX TOUR source page.
- Integration screen now shows explicit truthful placeholders for Telegram Bot transport, Tilda sync, payment provider, live inventory/seat locking and notifications/SLA transport.

## Deliberately not fabricated

The MAX TOUR site advertises a much broader catalog (including many short premium package summaries and more than 150 products overall). A catalog tile with only a marketing title/from-price is not enough to safely invent a full itinerary, child rules, inclusions or booking requirements. Those records remain outside the detailed demo dataset until their individual source pages/data are mapped.

## Remaining non-integration hardening

1. Replace hotlinked demo imagery with client-approved/licensed files stored in project-owned Cloudflare assets and generate WebP/AVIF variants.
2. Obtain the original client logo/brand asset rather than relying on a site-rendered graphic.
3. Add real file upload/reorder UX for Admin gallery (current demo edits ordered image URLs).
4. Add immutable audit history for Admin/Manager/Owner edits.
5. Expand CRM with tasks, tags/segments and communication history.
6. Add demo cancellation/reschedule workflow and operation history without touching real refunds.
7. Add richer Owner reporting periods/targets/exports using synthetic demo history.
8. Complete screenshot/device QA in Telegram WebView at 360/390/430 px and slow-network image fallback checks.

Integration-dependent work remains tracked separately in GitHub Issue #1.
