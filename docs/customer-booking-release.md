# Customer booking on the main LoveTravel address

This release enables a scoped customer invitation on https://lovetravel.viiversion.com.
The browser exchanges the invitation fragment for a guest-owned server grant, then removes the fragment.
Only the canonical transaction API can reserve a user-approved exact Quote. AI tools, legacy booking routes, direct Bókun routes and forged client provider tokens remain blocked.

## Payment and delivery

Bookings use Bókun RESERVE_FOR_EXTERNAL_PAYMENT. The integration confirms a reservation without recording a payment.
Online charges and customer notification emails are disabled.
A successful application result requires an independent Bókun lookup by the stable external booking reference and matching confirmation code.
The returned provider status and payment status are shown, including RESERVED and UNKNOWN payment status when applicable.
Pending or lost responses cannot trigger a new reservation. The customer can request read-only reconciliation.

## Customer invitation and scope

The invitation expires on the configured CLIENT_BOOKING_EXPIRES_AT date.
The provider credential stays in Worker secrets; only its SHA-256 is configured on the integration Worker.
The deployment job derives a stable scoped credential, updates those two specific secret bindings and verifies the read-only booking lookup.
The existing upstream customer-demo guard allows at most one successful booking per product for this credential (Robinson and Hon Mun).
It does not enable generic booking writes. The customer should use their own contact details and a date they intend to reserve.
Real orders occupy availability. No order is created by installation, opening the invitation, chatting, filling fields, checking checkout options, build, CI or smoke checks.
Only the explicit final Book now click sends RESERVE.

## Verification without orders

Node tests exercise ownership, explicit consent, fresh checkout price, double clicks, lost responses, independent readback and history.
The browser verifier uses isolated D1, DO and provider fixtures, blocks external network calls and asserts zero upstream booking calls.
The read-only live checkout verifier only permits product, availability, pickup and checkout/options requests, checks all 11 current provider variants and writes no orders.
Production browser verification must intercept RESERVE before network transmission and use a clearly identified controlled response to inspect the receipt UI.
Such a browser check demonstrates UI delivery; it does not demonstrate a completed real Bókun transaction.
