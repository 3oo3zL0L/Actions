# Actiepagina: testrapport

## Fase 2 (B0 t/m B10), 26 sep 2026

### Scope
Fase 2 herbouwt de Actiepagina rond schil + vijf ingangen (`docs/UX-PLAN.md`, `docs/PLAN-FASE2.md`), in
stappen B0 (code opsplitsen) t/m B10 (acceptatie, dit rapport, docs, publicatie). Getest:
`src/index.html` + `src/app/*.js` + `src/styles/*.css` als geheel, tegen `tests/mock-claude.js`.
Buiten scope: zoals in `docs/TESTPLAN.md` (de echte connectors, Claude zelf, de PAF actielijst,
pixelvergelijking, echte netwerklatentie); wat daarvan wél op de echte koppelingen is gecontroleerd staat
hieronder.

### Testbestanden en aantallen (`npx playwright test --list`, 26 sep 2026)
| Bestand | Tests | Dekking |
|---|---:|---|
| `actiepagina.spec.js` | 31 | fase 1: agenda, inbox, Jira/Confluence, acties, Claude-paneel, lege staten, fouten |
| `b1-shell.spec.js` | 26 | schil: drie zones, vijf ingangen, selectiemodel, feedbackbalk, voorkeuren, mobiele tabbalk |
| `b2-inbox.spec.js` | 40 | Inbox: mail+Teams samengevoegd, VIP, meldingen, beantwoorden/doorsturen, verzenduitstel, afhandelen, adresboek |
| `b3-kanalen.spec.js` | 9 | Teams-kanalen: lezen, volgen, beantwoorden |
| `b4-agenda.spec.js` | 20 | Agenda: vandaag+morgen, uitnodigingen, plan een vergadering |
| `b5-acties.spec.js` | 17 | Acties en voorstellen in het nieuwe patroon |
| `b6-werk.spec.js` | 12 | Werk: Jira-detail, transities, toewijzen, nieuw issue, Confluence-leesweergave |
| `b7-commandbar.spec.js` | 14 | Command bar (Ctrl+K/​/) en sneltoetsen |
| `b8-claude.spec.js` | 12 | Claude-paneel in de detailkolom, contextkaart, Missing-scope-afhandeling |
| `b9-toegankelijk.spec.js` | 7 | Licht thema, contrast AA, actiebalk als toolbar (roving tabindex), reduced motion, 375px, landmarks |
| `b10-acceptatie.spec.js` | 3 | Twee-minuten-toets (desktop+mobiel, gegenereerd via een lus) + toetsenbord-only variant |
| `fase2.spec.js` | 8 | Voorstellen uit mail, actierijen en archief (bestaand, fase 1) |
| `fase3.spec.js` | 4 | Send to PO verwijderd, gebruikslog |
| `fase4.spec.js` | 10 | Mailstijl van Thomas |
| `fase5.spec.js` | 7 | Mail afhandelen, Vraag Claude opent direct het paneel |
| `fase6.spec.js` | 9 | Claude geeft antwoord (model, look, tools, fouten) |
| `fase7.spec.js` | 13 | Claude voert uit (schrijfacties, budget, manifest) |
| **Totaal** | **242** | |

### Beide testruns (`ACTIEPAGINA_PORT=4271 npx playwright test`)
| Run | Resultaat | Duur |
|---|---|---|
| 1 | 242/242 geslaagd, 0 gefaald | 2m 54s |
| 2 | 242/242 geslaagd, 0 gefaald | zie commit; geen flaky tests, geen retries nodig |

Geen console-errors, geen contractschendingen, geen uncaught exceptions in beide runs.

### Wat is echt tegen de connectors getest (bouwsessie 25 sep 2026, `docs/PLAN-FASE2.md`)
**Echt getest**: mail, agenda, Teams (chats en kanalen), Jira- en Confluence-vormen lezen (`read_resource`,
`getJiraIssue`, `getConfluencePage`, zoektools); een mail versturen aan Thomas zelf
(`outlook_send_mail`); de `Missing scope`-fout voor Teams-versturen, personen zoeken en teams-lijst
(vastgesteld op Thomas' account, zie tabel in `docs/PLAN-FASE2.md`).
**Niet echt getest** (blokkeerde in de bouwsessie of onveilig zonder toestemming van collega's/IT): agenda
aanmaken/beantwoorden (`outlook_create_event`, `outlook_respond_to_event`), Jira-commentaar/transitie/
toewijzen/aanmaken, Confluence-pagina's lezen in de app zelf (leesweergave), Teams direct versturen (kan
sowieso niet zonder IT-toestemming). Dit alles is wel gedekt door de mock en staat als checklist voor
Thomas in `docs/CHECKLIST-THOMAS.md`.

### UX-review rondes en uitkomst
Bevindingen van de losse review-agent stonden in de scratchpad (niet in de repo); onderstaande is de
samenvatting per ronde, af te leiden uit de review-fix-commits.
- **B1**: schil-fixes na de eerste review (selectie, actiebalk, feedbackbalk verfijnd). Alle blokkerende
  bevindingen opgelost.
- **B2-B3 (Inbox, Teams-kanalen)**: Meer-menu verhuisde in de detailkolom, pijltjesnavigatie in dat menu,
  command bar vindt ook Teams-berichten en -kanalen. Alle blokkerende bevindingen opgelost.
- **B4-B5 (Agenda, Acties)**: eerlijke melding na Ongedaan maken, het invulformulier staat los van de
  actiebalk eronder, volledig detail zichtbaar in Vandaag, Ctrl+K werkt ook hier. Alle blokkerende
  bevindingen opgelost.
- **B6-B7 (Werk, command bar)**: invulkaart valt niet meer onder de mobiele actiebalk, Status en Toegewezen
  goed bewerkbaar, geen grijze (niet-klikbare) knoppen meer. Alle blokkerende bevindingen opgelost.
- **B8 (Claude-paneel)**: mobiel opnieuw openen scrolt de pagina niet meer weg, eigen budgettekst, duidelijke
  placeholder, focus keert terug na Esc. Alle blokkerende bevindingen opgelost.
- **Ruimtegebruik**: de lijst kreeg de overgebleven ruimte, het detail is hoogstens 560px breed (rustiger op
  brede schermen). Alle blokkerende bevindingen opgelost.
- **B9 (eigen ronde, geen los review-verslag)**: licht thema overal, tabletfix actiebalk, toegankelijkheid
  (AA-contrast, roving tabindex) rechtstreeks in de teststap gedekt (zie `b9-toegankelijk.spec.js`).

### Bekende beperkingen
- De testsuite draait tegen een nagebootste `window.claude` (`tests/mock-claude.js`); echte connectorfouten,
  payloadvormen die van de brief afwijken, en consentdialogen zijn niet gedekt (zie `docs/TESTPLAN.md`,
  "Handmatige checks in de echte claude.ai-viewer").
- Teams direct versturen blijft "Kopieer en open in Teams" zolang IT geen toestemming geeft
  (`ChatMessage.Send`, `ChannelMessage.Send`, `People.Read`, `Team.ReadBasic.All`); zie de conceptmail in
  `docs/CHECKLIST-THOMAS.md`.
- Schrijfacties op Jira, Confluence en agenda zijn alleen tegen de mock getest; Thomas controleert deze zelf
  met de checklist voordat hij erop vertrouwt.
- Confluence in de app blijft een leesweergave (markdown), geen opgemaakte pagina; macro's, layouts en
  bijlagen ontbreken (bewuste keuze, zie `docs/UX-PLAN.md`).
- Verzonden mail kent geen echte ongedaan maken, alleen het verzenduitstel van 10 seconden vóór het
  versturen.

---

Ronde 1, 24 sep 2026. Getest: `src/index.html` zoals opgeleverd door DEV (2372 regels).
Omgeving: Playwright 1.56.1, Chromium, Europe/Amsterdam, klok op 10:15, mock van `window.claude`
(`tests/mock-claude.js`), fixtures uit `tests/fixtures/`. De echte claude.ai-viewer is niet getest; zie de
handmatige checks in `docs/TESTPLAN.md`.

## Samenvatting
- **Geautomatiseerd**: `tests/actiepagina.spec.js`, **31/31 geslaagd**. Het actiemodel in de tests is
  bijgewerkt naar het PAF-model (besluit klant): `text`, `status` = `open`, `done` of `dropped`.
- **Exploratief**: geen blokkerende of hoge bevindingen. Geen XSS, parsing robuust, foutafhandeling volgens
  contract en UX. Wel 5 lage bevindingen en 4 punten ter info.
- **Advies**: vrijgeven voor de handmatige ronde in de echte viewer. B1 t/m B3 kunnen in dezelfde ronde mee.

## Bevindingen

Ernst: **Hoog** = verkeerde of onveilige actie of dataverlies; **Midden** = feature werkt niet zoals
bedoeld; **Laag** = cosmetisch of klein afwijkend gedrag; **Info** = keuze voor de PO of UX.

| # | Ernst | Onderwerp |
|---|---|---|
| B1 | Laag | "1 acties vandaag": meervoud bij 1 |
| B2 | Laag | Claude-knop (FAB) bedekt de ververs-knop van Werk op 375px |
| B3 | Laag | `#Platform Core` laat "Core" achter in de actietekst |
| B4 | Laag | Alle secties dezelfde fout: 3 losse meldingen i.p.v. één paginamelding |
| B5 | Laag | Mailtijd < 60 min als klok, UX vraagt relatief ("12 min geleden") |
| I1 | Info | Afspraak zonder geldige starttijd wordt stil weggelaten |
| I2 | Info | `user_changed`: "Verversen…" blijft staan, nu-strip toont "Geen afspraken meer vandaag" |
| I3 | Info | "Klaar (n)" telt ook vervallen acties mee |
| I4 | Info | Extra veld `dueIso` in actie-documenten, buiten het PAF-model |

### B1 (Laag): "1 acties vandaag"
- Stappen: laad de pagina met precies één actie met `vandaag: true` (standaardfixture).
- Verwacht: `1 actie vandaag` in de nu-strip.
- Werkelijk: `1 acties vandaag` (`index.html` r. 930, vaste tekst `" acties vandaag"`).

### B2 (Laag): FAB bedekt content op mobiel
- Stappen: viewport 375x812, scroll naar het einde van de pagina.
- Verwacht: de laatste content blijft vrij van de zwevende "Vraag Claude"-knop (extra `padding-bottom`
  onder de laatste sectie).
- Werkelijk: de FAB van 56px ligt over de ververs-knop (⟳) van de sectie Werk, die dan niet te tikken is.

### B3 (Laag): programma-tag met spatie
- Stappen: typ in Acties `Review plannen !2026-10-01 #Platform Core`, druk op Enter.
- Verwacht: `text: "Review plannen"`, `prog: "Platform Core"`.
- Werkelijk: `text: "Review plannen Core"`, `prog: "Platform Core"`. De tag wordt herkend, maar het tweede
  woord blijft in de tekst. Hetzelfde geldt voor `#CI Acceleration`, `#Object Store` enz.
- Voorstel: matchen op de langste programmanaam inclusief spaties, of alleen `#PlatformCore`/`#platform-core`
  documenteren in de hint onder de invoer.

### B4 (Laag): identieke fout in alle secties
- Stappen: laat elke read-tool van beide connectors `needs_reauth` geven.
- Verwacht (mcp.d.ts, failure design): "When every section fails at once with the same code, treat it as a
  page-level condition: show one message with a reload affordance."
- Werkelijk: drie losse, identieke meldingen ("Je koppeling met … is verlopen") in Vandaag, Inbox en Werk.
  Werkt wel, maar is druk. UX.md noemt dit geval niet; UX beslist.

### B5 (Laag): relatieve tijd bij mail
- Stappen: standaardfixture, mail van Eva Jansen is 12 minuten oud.
- Verwacht (UX.md §5): "Tijd relatief alleen voor <60 min (…, 5 min geleden), anders klok", dus `12 min geleden`.
- Werkelijk: `10:03`. De mailrij-spec in §3.2 toont zelf een klok (`11:11`), dus UX moet kiezen welke regel geldt.

### I1 (Info): afspraak zonder geldige start
- Een afspraak zonder `start` of met `dateTime: "morgen"` verschijnt niet, en er is geen melding of
  console-waarschuwing. Andere afspraken en een onbekende tijdzone werken wel. Acceptabel; voor support is een
  `console.warn` wel handig.

### I2 (Info): `user_changed`
- De pagina stopt correct (geen calls meer, data weg). Wel blijft de globale knop op `Verversen…` staan en toont
  de nu-strip `Geen afspraken meer vandaag`. De runtime vervangt de pagina, dus weinig impact.

### I3 (Info): vervallen acties onder "Klaar"
- `dropped`-acties staan in de ingeklapte groep `Klaar (n)` met een label `vervallen`, en tellen mee in n.
  Voor de PO: is `Klaar en vervallen (n)` duidelijker, zeker richting fase 2 (hoofdlijst)?

### I4 (Info): extra veld `dueIso`
- Nieuwe acties krijgen naast `due: "25 sep"` ook `dueIso: "2026-09-25"`. Handig voor sorteren. Het is geen
  probleem, maar wel een afwijking van het PAF-model; meenemen bij de import in fase 2.

## Wat is exploratief getest en in orde
| Gebied | Resultaat |
|---|---|
| XSS | `<img onerror>` en `<script>` in onderwerp, samenvatting, afzender, Teams-tekst, Jira-summary, Confluence-titel, actietekst en in het Claude-antwoord (markdown); `javascript:`-URL's als webLink, webUrl, bronUrl en markdown-link. Niets uitgevoerd, geen `<img>` of `javascript:`-links in de DOM, tekst letterlijk getoond. `safeUrl` laat alleen https toe. |
| Kapotte blokken | leeg blok, geen JSON, `null`, `42`, `[]`, image-blok, items zonder velden, `sender: null`, `isRead: "nee"`, Jira-node `null`, `fields: null`, Confluence-payload als string. Geen exceptions, geen `undefined`/`NaN`/`[object Object]`, bruikbare items wel getoond. |
| Lege resultaten | alle lege-staatteksten precies volgens UX.md §5 (Vandaag, Mail, Teams, Jira, Confluence, Acties). |
| Retryable mcp-fout | precies 1 automatische retry na `retryAfterMs`, dan `Lukt nog steeds niet.` + `Opnieuw proberen`; handmatige retry werkt. `needs_reauth` wordt niet herhaald. |
| Schrijfactie faalt | geen automatische retry, knop `Opnieuw uitvoeren`, tekst waarschuwt dat de uitkomst onzeker is. Lege concepttekst maakt Uitvoeren disabled; Esc annuleert (`Geannuleerd`); Ctrl+Enter voert uit; focus terug naar `Antwoord-concept`. |
| sample-fouten | `not_granted`: balk disabled, snelknoppen weg, geen nieuwe calls. `rate_limited`, `refused`, `upstream_error`: eigen tekst per code, invoer blijft bruikbaar. Fout na streamen: deeltekst blijft staan. |
| 375px | geen horizontale scroll, ook niet met onderwerpen van 150 tekens zonder spaties. Tabs, snelknoppen, checkboxen en `⋯` zijn 44px hoog. |
| Thema | licht en donker via `prefers-color-scheme` en `data-theme`; toggle cyclet licht, donker, systeem. Contrast visueel in orde, geen tekst onder AA gevonden. |
| Reduced motion | geen animaties actief. |
| Toetsenbord | skip-link, tabvolgorde volgens UX §6, `/` en Ctrl+K (ook vanuit een invoerveld), `n`, `?` (dialog), `g w`, pijltjes in tabs, Esc sluit het paneel met focus terug. Sneltoetsen niet actief tijdens typen (`n/r?g` blijft tekst). |
| Acties | `@wie #prog !vr` goed geparsed (vr = 25 sep), `Maak actie` vult tekst + bron (`mail`, bronUrl, van, onderwerp) en zet de focus, dubbele Enter geeft 1 document, lege Enter niets. |

## Testbestanden
- Suite: `tests/actiepagina.spec.js` (31 tests), mock: `tests/mock-claude.js`, data: `tests/fixtures/`.
- De exploratieve scripts stonden in de scratch-map van TST en zitten niet in de repo; de gevallen staan
  hierboven beschreven en zijn te reproduceren met de mock (`window.__MOCK__`).
- Draaien: `ACTIEPAGINA_PORT=4177 npx playwright test tests/actiepagina.spec.js`.
