# ADR: VIIVERSION Travel Commerce Agent Runtime v1

Status: Accepted  
Project: LoveTravel  
Scope: AI consultant and conversational booking architecture

## Decision

LoveTravel will not implement the AI consultant as a chatbot directly connected to Bókun, and will not use DOM automation as the primary booking integration.

The accepted architecture is a provider-neutral Travel Commerce Agent Runtime in which:

1. AI understands natural language, intent, preferences, corrections and sales context.
2. A deterministic Travel Commerce Kernel owns commercial truth: products, offers, quotes, price, availability, passenger rules, pickup/dropoff rules and booking requirements.
3. A deterministic Transaction Runtime owns all mutating booking actions.
4. External booking systems are isolated behind typed Provider Adapters.
5. Bókun is the first provider implementation, not the permanent architectural center of the product.
6. Adding another provider or a native VIIVERSION booking backend must not require rewriting the conversational intelligence layer.

Canonical direction:

Customer → Conversation Intelligence → structured intent → Travel Commerce Kernel → verified offer/quote → Sales Orchestrator → Transaction Runtime → Provider Adapter → Bókun.

## Core invariant

The model is never the booking authority.

AI may interpret free-form language, infer preferences, recognize corrections, compare verified products, explain verified differences, recommend an option and formulate natural multilingual responses.

AI may not independently decide or invent price, availability, valid rate, valid departure, booking cutoff, passenger category, pickup eligibility, required booking fields, cancellation rules, booking status or whether a booking is ready to reserve.

Those facts and permissions come only from deterministic commerce and provider layers.

## Canonical commerce domain

The runtime uses its own provider-neutral entities instead of exposing Bókun structures directly to AI.

### TravelIntent

Represents what the customer wants. Expected fields include locale, destination, origin, date constraints, flexibility, adults, children with ages, infants, interests, budget, comfort preference, hotel, pickup preference, accessibility requirements and special requests.

TravelIntent is conversational and may be incomplete.

### Product

Provider-neutral descriptive representation of a tour or activity. It contains descriptive facts, not transaction authority.

### Offer

A concrete commercial option combining product, provider, rate, date, start time, passenger mix, pickup/dropoff possibilities, price, currency, availability and relevant restrictions.

### Quote

A verified commercial snapshot created before booking progression.

A Quote contains quote ID, selected offer, provider, source timestamp, current price, currency, availability, required fields, booking questions, passenger requirements, pickup/dropoff requirements, terms, provider references, revision/hash and refresh/expiry policy.

A Quote is the only valid basis for advancing a booking transaction.

### BookingDraft

Contains customer-supplied transaction data bound to a Quote: travellers, main contact, pickup, dropoff, booking answers, extras, payment choice and special requests.

### BookingTransaction

The authoritative state machine for one attempted purchase. It contains transaction ID, revision, provider, provider references, selected Quote, BookingDraft, readiness state, explicit customer approval, idempotency key, external booking reference, provider confirmation and reconciliation state.

Conversation history must never substitute for BookingTransaction state.

## ShoppingSession and BookingTransaction are separate

A ShoppingSession is exploratory. The customer may compare products, change date, budget, interests and language.

A BookingTransaction begins only when a specific offer is selected and the system starts validating or collecting transaction-specific information.

Primary state progression:

SHOPPING → OFFER_SELECTED → QUOTE_CREATED → COLLECTING_REQUIRED_DATA → READY_FOR_APPROVAL → USER_APPROVED → RESERVING → PAYMENT_PENDING or CONFIRMED.

If product, rate, date or another quote-defining field changes, the Quote becomes stale and must be refreshed or replaced.

## Three intelligence layers

### Conversation Intelligence

Understands multilingual natural language, extracts intent patches, recognizes corrections, understands passenger information, preserves context and avoids asking for already known information.

Its output is structured. It does not mutate provider state.

### Sales Intelligence

Compares verified offers, explains tradeoffs, recommends based on customer priorities and guides the customer toward a concrete bookable option.

It receives verified commerce evidence and never invents commercial facts.

### Transaction Intelligence

Primarily deterministic rather than generative.

It validates the selected offer, creates and refreshes Quotes, determines required fields, validates passenger and pickup rules, determines readiness, requires explicit approval when needed, executes reserve/confirm/cancel commands and reconciles ambiguous provider responses.

## Typed capability boundary

The AI layer must not receive generic Bókun, REST, MCP, database or network access.

It operates through typed capabilities such as:

- searchProducts
- compareProducts
- searchOffers
- getOfferDetails
- createQuote
- refreshQuote
- getBookingRequirements
- previewBooking
- reserveBooking
- confirmBooking
- cancelBooking

Read capabilities may be used during consultation. Mutation capabilities are protected by deterministic policy.

A model request alone can never authorize a mutation.

Before reserve or confirm, the runtime must verify at minimum:

- Quote is current.
- Quote revision matches transaction revision.
- Required fields are complete.
- Price is current.
- Availability is current.
- Booking rules are satisfied.
- Explicit customer approval exists where required.
- Idempotency key exists.

## Provider adapters

Provider adapters translate canonical VIIVERSION entities and commands into provider-specific APIs.

Initial provider: BokunProvider.

Future providers may include other activity platforms, OTA/travel-commerce providers, Odoo/operator backends or a native VIIVERSION Booking System.

A provider may expose REST, MCP or another transport. Transport choice is an adapter concern and must not leak into AI or Sales Intelligence.

## Bókun role in v1

Bókun remains the source of truth for the initial LoveTravel release.

Existing modules to preserve and evolve:

- Bókun domain adapter
- booking-selection-engine
- Bókun booking draft builder
- Bókun localization pipeline
- client demo booking submit path
- external booking reference mechanism

These modules already contain major parts of the future Provider Adapter and Transaction Runtime and should be formalized rather than bypassed.

## Quote-before-booking invariant

A verified Quote must exist between conversational selection and booking mutation.

Any material change to product, rate, date, participants or pickup requirements invalidates or refreshes the Quote.

This prevents the assistant from acting on stale conversation data.

## Shared state between chat and booking UI

The chat and visual booking configurator must operate on the same BookingTransaction.

The target architecture is not:

AI text → search DOM → click matching buttons → infer whether booking UI matches.

The target architecture is:

AI intent → BookingTransaction → both Chat UI and Booking UI.

The new path should expose structured application of transaction state to the BookingConfigurator. DOM text matching, button heuristics and MutationObserver-based booking handoff are transitional mechanisms and are not part of the target architecture.

## Multilingual invariant

Transactional state is language-neutral.

Participant roles, provider category IDs, rate IDs, product IDs, pickup place IDs and other transactional keys are stored semantically, not as translated labels.

Localization is applied only at presentation and conversational-response layers.

The existing semantic localization architecture remains the basis for UI and provider-content presentation.

## Provenance

Commercial facts exposed to customers must be internally traceable.

Where relevant, store provider, provider product ID, rate ID, field path, retrieval timestamp, Quote ID, Quote revision and source revision/hash.

If the customer asks why the assistant quoted a specific price or condition, the system must be able to reconstruct the provider evidence that produced that statement.

## Idempotency and reconciliation

Every mutation command must include transaction ID, command ID, idempotency key and external booking reference.

If the provider times out or returns an ambiguous result, the runtime must reconcile the existing transaction before retrying.

It must never blindly repeat a create/reserve operation that may already have succeeded.

## Live transaction ownership

Preferred future Cloudflare model: one BookingSession Durable Object per active BookingTransaction.

The Durable Object serializes mutations, owns the live transaction revision, prevents concurrent conflicting updates and coordinates reserve/confirm/reconciliation.

D1 remains appropriate for completed transactions, audit history, analytics, ShoppingSession/conversation history, qualified leads and reporting.

## Existing modules: treatment

Keep and evolve:
- bokun-domain
- booking-selection-engine
- bokun-booking-draft
- Bókun content localization
- client demo booking submit
- external booking reference
- semantic multilingual UI foundation

Reuse selectively:
- state-machine concepts and useful tests from ai-orchestrator-v23
- parsing ideas from the current AI consultant
- sales-card UX
- conversation tests
- ai_consultations lead/handoff path

Replace on the LoveTravel critical path:
- DOM button-search booking handoff
- regex-driven UI control selection as the primary integration
- MutationObserver as transaction orchestration
- direct model-to-booking assumptions
- one undifferentiated conversation memory acting as booking state

## First implementation vertical

The first complete vertical must support a request equivalent to:

“Two adults, tomorrow, snorkeling, pickup from Oceanus.”

The system must:

1. Extract intent.
2. Identify relevant products.
3. Query Bókun-backed commerce data.
4. Compare valid offers.
5. Recommend using verified facts only.
6. Create or refresh a Quote.
7. Collect only missing required fields.
8. Present a booking preview.
9. Obtain explicit confirmation.
10. Apply the same transaction to the visual booking UI.
11. Submit the LoveTravel client-demo booking.
12. Receive a valid Bókun confirmation code.
13. Persist provenance and audit state.

The same architectural path must pass in RU, EN, VI, ZH and KO.

## Required negative paths

Before production readiness the architecture must handle:

- unavailable date
- sold out or insufficient capacity
- changed price
- invalid passenger category
- child age rules
- pickup unavailable
- required booking answer missing
- provider temporarily unavailable
- customer changes date mid-conversation
- customer changes product after Quote
- customer switches language
- duplicate submit/retry
- provider timeout after a possibly successful booking
- stale Quote
- unsupported customer request
- AI response contradicting verified commerce data

## Implementation order

1. Define canonical commerce schemas.
2. Define ShoppingSession and BookingTransaction schemas.
3. Wrap current Bókun logic as a formal BokunProvider adapter.
4. Introduce Quote as a first-class entity.
5. Implement deterministic transaction state machine.
6. Define typed AI capabilities over the Commerce Kernel.
7. Build the new LoveTravel Sales Orchestrator.
8. Connect current chat UI to structured state.
9. Add structured BookingConfigurator handoff.
10. Remove DOM-heuristic orchestration from the new path.
11. Add provenance, idempotency and reconciliation.
12. Add multilingual end-to-end sales tests.
13. Run the complete demo-booking vertical against Bókun.

## Product objective

The target is not an AI chatbot for two LoveTravel tours.

The target is a reusable VIIVERSION capability:

A conversational travel-commerce engine that converts natural-language customer intent into a verified provider transaction while keeping inventory, pricing, availability and booking rules under deterministic commerce control.

LoveTravel plus Bókun is the first implementation and validation environment.

## Non-negotiable invariants

1. AI never becomes the source of commercial truth.
2. Provider data never bypasses canonical commerce validation before transaction use.
3. Shopping state and transaction state are separate.
4. A verified Quote precedes booking mutation.
5. All mutations are idempotent.
6. Ambiguous provider responses are reconciled before retry.
7. UI and chat share one structured BookingTransaction.
8. Internal transactional state is language-neutral.
9. Provider-specific details stay behind adapters.
10. Customer-facing commercial facts are traceable to provider evidence.
11. A new provider must not require rewriting Conversation Intelligence.
12. The architecture must remain usable if VIIVERSION later replaces Bókun with its own booking backend.

## Supersession

This ADR supersedes earlier approaches that treat the LoveTravel AI consultant primarily as a chatbot, prompt layer, DOM automation or direct Bókun integration.

All future implementation of the LoveTravel AI consultant should be evaluated against this document.
