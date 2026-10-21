# Mockups v2 (21 Oct 2026): the visual and UX reference for the front-end rebuild

Decision (Damian, 21 Oct): the current web app is replaced by a new front end built from scratch that reproduces these boards faithfully ("to be reproduced exactly; small errors in the boards are possible, but this is how it must look"). Mobile is the primary product; desktop is the wardrobe control centre; the landing is board 13. The core (solver, certificate), the Worker API, the recordings manifest and the avatars stay.

Files: `WearAgain-NN-*.png` (1536x1024 boards; mobile boards show three 390-wide phone screens each), `WearAgain-prompty-v2.txt` (the exact copy and layout of every screen, in Polish; use the UI texts verbatim), `WearAgain-zalozenia-UX-v2.txt` (ten UX decisions; binding), `WearAgain-prompty.txt` (earlier prompts, context only).

| Board | Screens | Flow |
|---|---|---|
| 01 Aplikacja | 01 Twoja szafa (grid, search, tabs Wszystko/Góry/Doły/Buty, "Ułóż zestaw z moich rzeczy"), 02 Stylistka "Na jaką okazję?" (free-text occasion, chips, date, style line "Twój styl: Klasyka · beż i granat · bez wzorów", "Zacznę od tego, co już masz"), 03 Gotowa stylizacja (full-bleed preview on the demo model, outfit items, "Zapisz stylizację", "Zobacz inną propozycję") | Wardrobe and occasion stylist |
| 02 Decyzja zakupowa | candidate from a shop, separate previews next to own items, one-sentence verdict with "why" (buy / don't buy / you already own the equivalent) | Purchase check (existing core) |
| 03 Personalizacja i wyjazd | style profile in natural language (what I wear, how I want to look), trip planning (several occasions), what is missing | Personalisation, trip |
| 05 Desktop Szafa | sidebar (Szafa, Stylistka, Sprawdź zakup, Zapisane zestawy, Zakupy w galerii, profile "Anna · Mój styl"), wardrobe inventory grid 4 columns | Desktop inventory |
| 06 Desktop Przegląd | "Twoja garderoba": summary strip (items, worn this month, waiting for decision), "Warto się nimi zająć" rows (repair, long unworn, two similar), "Czego naprawdę brakuje?" | Wardrobe control centre |
| 07 Desktop Stylistka | occasion stylist on desktop | Stylist |
| 08 Desktop Sprawdź zakup | purchase check on desktop | Purchase check |
| 09 Mobile Poranek | voice request "Do biura. Na szybko, bez prasowania. Tylko z tego, co mam." → stylist works in background ("Możesz zamknąć aplikację", notify when ready) → three ready outfits, "Zakładam ten zestaw" saves today's outfit | Morning scenario |
| 10 Mobile Galeria/Aparat | photographing candidates in a shopping mall, shop context entered once, next photo does not wait for the previous preview | Shopping session |
| 11 Mobile Kawa i powrót | browsing ready previews over coffee, "pomijam / wracam po to", return list with shop, floor and photo | Shopping session |
| 12 Mobile Przegląd | mobile wardrobe overview (same content as 06, phone layout) | Control centre on mobile |
| 13 Landing v2 | marketing landing in the same visual system | Landing |

Implementation rules:
- Visual system from the boards: warm ivory/stone backgrounds, near-black olive text and primary buttons, refined serif display, clean sans body, square-ish photo tiles without borders or heavy shadows, 390x844 phone layouts, bottom tabs Szafa / Stylistka / Sprawdź / Profil, desktop sidebar ~208 px. No generic gradients, no framework default components, no walls of text.
- UI language ENGLISH (default locale en). The boards and the prompts file are in Polish only because they were generated that way: translate every text faithfully, same meaning and tone, through an i18n layer so Polish can be added later. Honest captions in English: "Demo model", "Style preview, not size fit". Shop names, floors and availability on the boards are examples, not data.
- Demo uses the synthetic model and recorded previews; own photo is a private production option (not in the demo). The purchase check uses the existing solver and certificate; the stylist uses the Worker agent (PR4b) with deterministic verification; morning and shopping flows may run on demo data where the API is not ready yet, but the UI must be complete.
- Mobile first; PWA only as an install shell. If a web shell cannot reproduce a board, document it in docs/UX_V2_GAPS.md instead of simplifying the design; the product path is native apps (Capacitor wrapper of this UI).

## Boards 14-17 (21 Oct 2026, second batch): retailers and judges
Brief (binding, Polish): `WearAgain-brief-hackathon-Fable.txt`; exact copy: `WearAgain-prompty-hackathon.txt`. Existing consumer views are not redesigned by this batch.

| Board | Route | Content |
|---|---|---|
| 14 Retail Landing | `/retail` | "Your collection. Her wardrobe. A reason to buy." Primary CTA to the demo product page, secondary to the pilot plan; one-category pilot measured by conversion vs control, returns after the return window, margin after returns and API costs. The measurement plan is a plan, never a claim of results. Fictional store, sample prices. |
| 15 Retail Product | `/retail/demo` | Fictional store product page (product, price, size stay with the store) with the WearAgain side panel "With what you own." opened by "See it with my wardrobe"; sample wardrobe and demo model; own items shown separately next to the preview; style, not size. Private photos and the whole wardrobe are never shared with the retailer. |
| 16 Judges Landing | `/judges` | English jury entry page: "Try it on. Know why." Shortest path "Start the guided demo", 2-minute video, code and test instructions; one sentence on roles: YouCam visualizes the garment, WearAgain adds wardrobe context and the reason; three scenes (ready wardrobe, candidate on the model, honest verdict incl. "keep your own blazer"); "Where YouCam fits"; "Review your way" index (technology, product, impact, idea); Oliwia named as the submission representative, no unconfirmed titles. |
| 17 Judges Demo | `/judges/demo` | Three-step guided path with visible progress and ready data; video, code and instructions reachable at any step; saved previews and fresh generation clearly labelled differently; the technical part shows real input, task state and output without exposing the key. |

Navigation: add a highlighted "Judges · Start here ↗" to the header of the existing site, visible above the fold (on mobile a visible header action or the first highlighted menu item, never only in the footer); "For retailers" leads to `/retail`. Judges materials in English. Remove "design concept" notes once the real backend, video and repository links are wired. The ImageGen boards are not evidence of YouCam output; the demo uses real saved YouCam results labelled as saved, and fresh generation is a separate action.
Rules facts from the brief: deadline 2 Nov 2026 11:45 ET (17:45 Warsaw), internal 31 Oct; required: working YouCam-integrated prototype, code and test access, 1-3 minute video, English materials; Women in Tech opt-in with a real role for Oliwia; equal-weight criteria: technical implementation, experience design, potential impact, idea quality.
