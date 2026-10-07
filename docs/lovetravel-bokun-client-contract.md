# LoveTravel Bókun → Domain → Client contract

This document defines the data boundary for LoveTravel Client v2. Its purpose is to prevent provider data, customer content, selection state, and booking-only fields from being mixed into one UI layer.

## Contract layers

### A. Customer-facing tour content

These fields describe the tour and may be shown before the customer starts booking:

| Bókun source | Domain path | Client destination |
| --- | --- | --- |
| title | experience.title | tour title / cards |
| description / excerpt | experience.description / excerpt | hero + Overview |
| locationCode / googlePlace | experience.location | tour meta |
| duration* | experience.duration | tour meta |
| minAge | experience.minAge | Overview |
| languages / guidanceTypes | experience.languages | Overview |
| keyPhoto / photos / videos | experience.media | hero / Photos |
| included / inclusions | experience.content.included / inclusions | Included |
| excluded / exclusions | experience.content.excluded / exclusions | Included / Not included |
| requirements | experience.content.requirements | Overview / Important |
| attention | experience.content.attention | Overview / Important |
| dressCode | experience.content.dressCode | Overview / Before trip |
| knowBeforeYouGoItems | experience.content.knowBeforeYouGoItems | Overview / Before trip |
| agendaItems | experience.itinerary | Program |
| startPoints / meetingType | experience.meeting | Overview |
| supportedAccessibilityTypes | experience.accessibility | Overview |
| ticketMsg | experience.ticket.message | Overview |
| pickupService / pickup metadata | experience.pickup | Overview summary; point selection is booking-stage |
| cancellationPolicy | cancellationPolicy | Overview policy summary |
| reviewCount / reviewRating | experience.reviews | optional customer proof; do not invent reviews |

### B. Departure and option selection

These fields define what the customer can select before entering personal data:

| Bókun source | Domain path | Client destination |
| --- | --- | --- |
| availability[] | availabilitySlots[] | departure calendar |
| availability.rates[] | availabilitySlots[].rates[] | options valid for selected departure |
| availability.rates[].textItems/details | availabilitySlots[].rates[].textItems/details | selected-departure option description |
| pricesByRate[] | availabilitySlots[].priceQuotesByRate[] | option / participant pricing |
| product.rates[] | rates[] | base/fallback option metadata |
| pricingCategories[] | participants[] | guest categories / Stage 3 |
| availabilityCount / soldOut / unavailable | availabilitySlots[] | departure availability |

Selection order is authoritative:

**tour → departure/date/time → valid rate/option → guests → pickup → contact**

The Client must not show a rate that is unavailable for the selected departure.

### C. Booking-only fields

These fields must be preserved in Domain but are not required in the read-only Stage 2 tour screen:

- participants / pricing categories beyond display-only prices;
- extras and offers;
- bookingQuestions;
- requiredCustomerFields;
- mainContactFields;
- passengerFields;
- customFields;
- pickup place selection and room number;
- dropoff selection;
- booking cutoff / request deadline;
- reservation timeout;
- mutation/idempotency state.

They belong to Stage 3 BookingTransaction / BookingConfigurator.

### D. Provider/audit metadata

Provider-only metadata remains available through providerRaw / providerExtensions for diagnostics, but is not customer copy.

Known intentionally ignored top-level fields:

- creationDate
- marketplaceVisibilityType

locationCode is **not** ignored: it maps to experience.location.

## Required invariants

1. Exactly the two LoveTravel products are in the Client v2 scope.
2. Raw provider payload is preserved for audit.
3. Customer-facing content is never inferred from unrelated fields.
4. Included items are not reused as highlights.
5. Product-level rates are fallback metadata only; selected-departure rates are authoritative for availability-specific option text.
6. Rate-level media is preserved if the provider sends it. If the provider sends no rate photos, the Client must not fabricate option photos.
7. Pickup service availability and cancellation rules are customer-facing facts; pickup point choice and contact data are booking-stage.
8. Technical fields must not leak into customer labels.
9. Locale transformation may translate content, but must not change prices, availability, IDs, booking rules, or policy meaning.
10. A field classified as intentionally ignored must be explicit in coverage output; unknown non-empty fields remain audit failures, not silently ignored.
