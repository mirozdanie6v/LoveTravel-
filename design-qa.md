# Chat presentation design QA

final result: passed

## Source and scope

The user supplied 519.jpg (an unreadable AI response with literal newline artifacts) and 520.jpg (the existing booking option sheet). This change applies the second image's card language inside the existing consultant and repairs the first image's defects. It preserves the application's Montserrat font, branding, navigation and existing contact destination. No new image, logo, icon, font or asset is required.

## Comparable capture

Chrome mobile viewport: 393 × 852 CSS pixels, touch enabled, DPR 1. The reference is a 591 × 1280 screenshot with browser chrome. Its first three cards were cropped and scaled proportionally to the implementation's 364-pixel card width. Both captures were opened together in `artifacts/consultant-stabilization/readable/design-comparison.png` and inspected. The reference crop is 299 pixels high; the chat crop is 332 pixels high. The intentional difference is a slightly larger readable title and touch-friendly chat layout; this is an inline list, not a replacement for the booking sheet.

## Findings and repairs

- P2, repaired: the application shell centered option buttons. Chat-specific styles restore left-aligned names and descriptions with prices aligned right.
- P2, repaired: shell paragraph styles made ordinary replies too bold. The chat now uses 500-weight body text, separate paragraphs/list items and 800-weight accents.
- P2, repaired: repeated per-adult labels and option numbers crowded narrow cards. A shared heading identifies adult starting prices; cards keep the reference's name, description and orange price hierarchy.
- P2, repaired: literal newline escapes produced monolithic prose. Normalization handles escaped newlines and the exact `.n.`/`.nnHon` artifacts from the screenshot; HTML fragments remain escaped.

No remaining P0/P1/P2 presentation findings in the tested states. Card descriptions use the existing localized booking option copy. Prices are provider-derived, not screenshot constants. USD cents are preserved; unavailable prices are not invented. The final card can be scrolled entirely above bottom navigation. The permanent administrator link is below the composer, at least 44 pixels high, and appears exactly once after successful and failed replies.

## Verification evidence

- `ru-reply-contact.png`: paragraph separation, selective emphasis, contact beneath composer.
- `ru-options-first-three.png`: name/description/price layout matching the supplied example.
- `ru-options-last.png`: last option visible without navigation overlap.
- `report.json`: RU/EN/VI/KO/ZH mobile checks using fresh read-only public Bókun domains and controlled local model responses.
- 732 Node tests passed, including price authority, explicit card choice, text escaping and persistent contact.

The browser report discloses controlled local model responses. Deployment and live-model acceptance are recorded separately; this document does not claim native-speaker translation review or real booking creation.
