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
- UI language Polish, copy verbatim from the prompts file; captions "Modelka demo" and "Podgląd stylu, nie dopasowania rozmiaru" stay. Shop names, floors and availability on the boards are examples, not data.
- Demo uses the synthetic model and recorded previews; own photo is a private production option (not in the demo). The purchase check uses the existing solver and certificate; the stylist uses the Worker agent (PR4b) with deterministic verification; morning and shopping flows may run on demo data where the API is not ready yet, but the UI must be complete.
- Mobile first; PWA only as an install shell. If a web shell cannot reproduce a board, document it in docs/UX_V2_GAPS.md instead of simplifying the design; the product path is native apps (Capacitor wrapper of this UI).
