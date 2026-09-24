# Actiepagina: testplan

Eigenaar: Senior TST. Bronnen: `docs/BRIEF.md`, `docs/UX.md`, `docs/contract/*.d.ts`.
Bevindingen gaan naar `docs/TESTRAPPORT.md`.

## Scope
In scope: `src/index.html` als claude.ai Artifact. Gedrag per MVP-feature (agenda, inbox mail/Teams,
Jira/Confluence, acties + PAF-link, Claude-paneel met bevestigde schrijfacties), lege staten, fouten per
sectie, thema, mobiel, toetsenbord, console-hygiëne.
Buiten scope: de echte connectors en Claude zelf, de PAF actielijst, visuele pixelvergelijking,
performance onder echte netwerklatentie.

## Aanpak
- **Geautomatiseerd**: Playwright (Chromium) tegen `src/index.html` via een statische server
  (`python3 -m http.server`). `window.claude` wordt vervangen door `tests/mock-claude.js`, die de contracten
  volgt: `use()` (memoized, frozen namespaces, `null` bij ontbrekende capability), `mcp.callTool`/`watchTool`/
  `invalidate`/`listTools`/`server`, `sample()` + `.json()` met `onText`-streaming en page-tools,
  `db` met doc/collection/query/onSnapshot.
- **Payloadvormen**: M365-tools geven één text-blok per item plus een paginatieblok; `payload` is alleen het
  eerste blok. Atlassian geeft één blok. De mock bootst dit exact na, zodat een pagina die alleen `payload`
  leest zichtbaar faalt.
- **Data**: verzonnen fixtures in `tests/fixtures/` (example.com, fictieve namen). De agenda staat rond een
  referentietijd van vandaag 10:15 (Europe/Amsterdam); de browserklok staat op datzelfde moment, zodat "Nu" en
  "Volgende" vastliggen.
- **Selectie** op rol en zichtbare tekst (`getByRole`/`getByText`), microcopy volgens UX.md, geen classnames.
- **Invarianten na elke test**: geen call buiten het manifest, geen ongeldige `sample`-aanroep (bv. `cache`
  samen met `tools`), nooit een verstuur-tool (`outlook_send_*`, `forward_mail`), geen uncaught exceptions.
- **Harnas-controle**: de suite draait groen tegen een minimale referentiepagina, en faalt op bewuste mutaties
  (alleen `payload` lezen, schrijven zonder bevestiging).

Draaien:
```
npm install
npx playwright test                         # alles, server op poort 4173
ACTIEPAGINA_PORT=4177 npx playwright test   # andere poort, als iemand anders ook test
npx playwright show-report                  # HTML-rapport
```

## Testgevallen (tests/actiepagina.spec.js)
| Gebied | Wat |
|---|---|
| Zonder capabilities | elke `use()` null: koppen, "koppel Microsoft 365", geen calls, Claude-invoer uit; geen `window.claude`; eerste render < 1s met `aria-busy`-laadstaat |
| Agenda | afspraken van vandaag, wandkloktijd (10:00 blijft 10:00, niet als UTC), Nu/Volgende, Outlook-link, Bereid voor |
| Inbox | alle mailblokken (niet alleen `payload`), ongelezen eerst, meldingen ingeklapt en uit te klappen, Teams van vandaag en gisteren, Antwoord-concept pas na bevestiging via `outlook_create_reply_draft` met de aangepaste tekst |
| Werk | Jira- en Confluence-links met `target=_blank` (+ `rel=noopener`), JQL met `currentUser()`, cloudId gezet, lege Jira-fallback |
| Fouten | `needs_reauth` op Jira: herstelactie, rest werkt, geen automatische retry; retryable fout max 1x herhaald; `tool_error` agenda; M365 niet gekoppeld |
| Acties | PAF-link exact, db-acties zichtbaar, Enter voegt toe (`acties/*`, `status: "open"`, veld leeg), afvinken wordt `status: "klaar"` |
| Claude | streaming zichtbaar vóór het einde, page-tools meegegeven, snelknoppen, schrijfvoorstel: bevestigkaart, pas na `Uitvoeren` de schrijftool, `Annuleren` roept niets aan |
| Layout/a11y | geen horizontale scroll op 375px, donker thema via `prefers-color-scheme` en `data-theme`, `/` en Ctrl+K focussen Claude, `/` niet in een invoerveld, zichtbare focus, "bijgewerkt hh:mm" + ververs, geen console-errors |

## Risico's
| Risico | Gevolg | Maatregel |
|---|---|---|
| Echte payloadvormen wijken af van de brief (andere velden, `structuredContent`, `nextCursor`) | lege of kapotte secties | robuuste `items()`-helper; handmatige check in de viewer (hieronder) |
| Wandkloktijd als UTC geparsed | agenda 1-2 uur verschoven, verkeerde "Nu" | automatische test met vaste klok, plus handmatige check rond zomer/wintertijd |
| Schrijfactie zonder klik (Claude of de page-tool roept direct `outlook_create_reply_draft` aan) | ongewenste concepten of berichten | bevestigtests, invariant "nooit verstuur-tool" |
| `teams_send_chat_message` en `addCommentToJiraIssue` versturen direct | onomkeerbaar | alleen na Uitvoeren, waarschuwingstekst (UX 3.3), handmatig controleren |
| De mock wijkt af van de echte runtime (timing, consent, cache-replay met `cache.storedAt`) | groene tests, rood in productie | handmatige ronde in claude.ai vóór publicatie |
| Microcopy verandert | tests falen zonder dat het gedrag kapot is | regexen centraal bovenin de spec |
| db-veldnamen (`tekst`, `status: open/klaar`) | bestaande data onleesbaar na wijziging | vastgelegd in de test, DEV en PO stemmen af |
| Parallelle testruns op dezelfde poort | `ERR_CONNECTION_REFUSED` | `ACTIEPAGINA_PORT` per run |

## Handmatige checks in de echte claude.ai-viewer (niet gedekt door de mock)
1. **Consentdialogen**: eerste call per connector (`Microsoft 365`, `Atlassian Rovo`) en eerste `sample`-call
   vragen toestemming; weigeren geeft nette staten (`not_in_manifest` of `not_granted`), geen herhaald vragen.
2. **Echte payloadvormen**: per read-tool in DevTools `result.content` en `result.payload` bekijken: aantal
   blokken, paginatieblok, lege resultaten (0 items: is het eerste blok dan paginatie?), `structuredContent`.
3. **Tijdzone**: afspraken kloppen met Outlook, ook voor een afspraak in een andere tijdzone en voor
   hele-dag-afspraken.
4. **Links**: Outlook-, Teams-, Jira- en Confluence-links openen het juiste item in een nieuw tabblad
   vanuit het artifact-frame.
5. **Schrijfacties echt uitvoeren** op een testmail, testchat en testissue: concept verschijnt in Outlook
   Concepten en wordt NIET verstuurd; Teams-bericht en Jira-commentaar komen aan; `webLink` in succesmelding.
6. **sample met tools**: Claude haalt zelf context op (agenda/mail), duur en Stop-knop, gedrag bij
   `rate_limited`, lange antwoorden (`truncated`).
7. **db**: acties blijven na herladen en zijn zichtbaar op een tweede apparaat (realtime).
8. **Top-level weergave** (artifact-eigen host) en een gedownloade kopie: pagina rendert zonder connectors.
9. **Mobiel** op een echte telefoon: onderlade, FAB, touch-doelen van 44px, safe-area.
10. **Schermlezer** (VoiceOver/NVDA): koppen, tabs, live-regio's praten niet per token.
11. **Reauth tijdens gebruik**: connector intrekken, pagina verversen, herstelmelding per sectie.
12. **Contrast AA** in beide thema's (tokens uit UX.md) met een contrastchecker.
