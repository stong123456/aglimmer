# Design QA — A Glimmer, 2026-10-14

final result: passed

## Scope and evidence
Three visual directions retained as selectable themes; bright blue excluded at user request. The common product layout and working content remain shared across themes. Sources: `outputs/ui-reference-warm-postoffice.png`, `outputs/ui-night-radio.png`, `outputs/ui-pink-journal.png` in the parent workspace. Rendered captures: `theme-warm-final.png`, `theme-night-final.png`, `theme-pink-final.png`, `night-selected-fixed.png`, `account-avatar-preview.png`, `account-avatar-pink-en.png`, `account-mobile-preview.png`, `theme-pink-mobile.png`, `studio-mobile-preview.png`, `postcard-night-preview.png`. Source and implementation images were opened together in the same comparison input.

Source frames 1487×1058; desktop captures 1265×712 from a 1280×720 CSS viewport, browser scrollbar excluded. Compare the hero region by proportional width rather than claiming pixel-exact equality. Mobile captures 375×844 from a 390×844 CSS viewport. No original mobile mock exists; mobile is a responsive extension.

## Design comparison
- Typography: Chinese serif display and readable body hierarchy retained; English uses natural wrapping. Exact generated typography is not a font specification.
- Spacing/layout: common navigation, left-side hero copy, right focal imagery and real sample player; added appearance/language controls. Warm uses the already retained landscape version, rather than replacing it with the concept's envelope collage. Theme concepts are palette/asset directions, not three independently rebuilt product flows. Postcard action is placed below the hero so all existing community sections remain available.
- Color: warm sage/paper, navy/gold and blush/burgundy visibly distinct. Inputs, dialogs, account and player share semantic theme tokens.
- Imagery: actual generated raster assets; night lighthouse and pink vase/book focal points stay right of hero text. Mobile art becomes a lighter lower backdrop to keep text legible.
- Copy: bilingual interface, preserved authored text/signatures/date snapshots; AI sample labels and local-only QR disclosure remain visible.
- Icons: shared Lucide controls; QR uses qrcode library. User avatar is a real uploaded image, centered and compressed by browser canvas.

## Findings and retest
1. P2: English mood heading forced nowrap and produced a 395px document at 390px viewport. Fixed narrow heading wrapping. Post-fix DOM: innerWidth=390, scrollWidth=375; screenshot `theme-pink-mobile.png` has no horizontal scrollbar.
2. P2: midnight selected chip and player icon had insufficient contrast. Selected chip now uses gold background/dark text; screenshot `night-selected-fixed.png` confirms readable active state.
3. P2: mobile inspiration preceded recording controls. Recording panel now appears first visually; `studio-mobile-preview.png` confirms. Step 2 and Next disabled without audio.
4. P3: the generated mock includes a larger decorative postcard composition than the shared implementation. Retain as a future composition iteration; no broken workflow or missing share action.

## Behavior and boundaries
Verified actual avatar file chooser upload, 512×512 rendering in header/account, persistence on reload, translated status and removal. API tests verify replacement, file validation, private access/caching and export. Theme and locale persist through reload; original text and backend values remain unchanged. Postcard modal renders QR/date/signature and Download click has no visible error; OS download file was not independently inspected. Fresh isolated test tab reports no app error/warn logs. Production build, typecheck, 20 unit checks, 17 voice checks, 11 channel checks, podcast/avatars and production identity tests passed. Real email delivery, real mobile devices, and public hosting remain outside this local QA pass.
