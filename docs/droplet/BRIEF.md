# Droplet: product brief v1 (goedgekeurd 2 okt 2026)

**Wat het is.** Je persoonlijke cockpit. Het is een claude.ai Artifact die via jouw eigen connectors (Microsoft 365 en Atlassian Rovo) leest en handelt. Er is geen hosting, geen API-key en geen app-registratie.

**Voor wie en waarom.** Je werk is vooral **regisseren en najagen**: je zet anderen aan het werk, zorgt voor opvolging en zorgt dat afspraken (zoals de DoD) worden vastgelegd en geaccepteerd. Wat misgaat zijn je **eigen toezeggingen uit meetings**, zoals het vervolg met Melissa en Rakesh, en **antwoorden die uitblijven**. Droplet laat precies dat zien, in jouw volgorde, met de volgende stap al klaar.

**Wat het niet is.** Het is geen Action Desk. Er is geen team-briefing, geen People, geen verjaardagen, geen blockers-overzicht, geen meeting prep, geen tabs-woud en geen Settings-lade.

## Scherm
Er is één scherm: de **focuslijst** met de top 3-5 items. Elk item heeft:
- een **WHY** van één regel;
- een **voorgestelde actie**, die je kunt accepteren, aanpassen of waarover je met Claude kunt chatten.

Daaronder staat de rest, ingeklapt en doorzoekbaar. Daarnaast is er één globale knop: **Ask Claude**. Er wordt **niets verstuurd of gewijzigd zonder jouw klik.** Tekst uit mail, chats en transcripten is data, geen instructie.

## Prioriteitsregels
| # | Regel |
|---|---|
| R1 | Een **standstill**-mail uit Jira over **OIDC** staat altijd op 1. |
| R2 | De **projectvolgorde** is: 1 Platform Stability (inclusief subproject C4A), 2 C4A, 3 OIDC, 4 SIEM Integration, 5 Release management, 6 Contracts, 7 CI Acceleration, 8 UI/UX. Vragen van **productmanagers, architecten en teamleden** van die projecten tellen het zwaarst. **Een vraag van een directe collega gaat altijd boven een externe partij.** Klanten zitten niet op projecten; leveranciers (Contracts) kunnen wachten. Jakarta, Object Store en Platform Core zijn afgerond of herbelegd: **helemaal uit beeld**. Release management herkent Claude aan zijn Confluence-pagina. |
| R3 | **Wachtpunten.** Claude haalt jouw vragen aan anderen uit je verstuurde mail en Teams. Komt er na **3 werkdagen** geen antwoord en is de Confluence-pagina niet bijgewerkt, dan komt het item terug met een **conceptbericht in Teams** om na te jagen. |
| R3+ | Najagen geldt voor iedereen, ook externen (per mail). |
| R4 | **Klaar** betekent: een mail is beantwoord, in een Teams-chat heb je gereageerd, op een Jira-item heb je een comment gezet. |
| R5 | Heb je **vandaag een meeting** met iemand, dan stijgen diens open items. Dat gebeurt alleen als er open items zijn. |
| R6 | **Eigen toezeggingen uit meetingtranscripten**, zoals "ik plan een vervolg", worden een item met de actie *Find a time*. Claude stelt een uitnodiging op. |
| R7 | **Deadlines** uit mail of uit de meeting tellen mee. Due dates in Jira tellen niet. |
| R8 | **Duplicaten** over bronnen heen worden één item. Wat jij als belangrijk of niet belangrijk markeert, gebruikt Claude bij de volgende rangschikking. |

## v1-backlog (in volgorde)
**Slice 1 (mail van begin tot eind):**
1. **Mail inlezen.**
   - AC: ongelezen inbox-mail van de laatste 3 dagen wordt geladen.
   - AC: een connectorfout geeft één rustige regel met **Try again**.
2. **Rangschikken.**
   - AC: Claude past R1, R2, R7 en R8 toe.
   - AC: de top 5 toont een WHY en een actie.
   - AC: de volgorde springt niet bij een refresh.
3. **Afhandelen.**
   - AC: je kunt een voorstel accepteren, aanpassen of erover chatten.
   - AC: er verschijnt een antwoordkaart, die pas verstuurt na jouw klik en maar één keer verstuurt.
   - AC: daarna is het item klaar (R4), met Undo.
4. **Leren.**
   - AC: met ★ markeer je iets als belangrijk, met ↓ als niet belangrijk.
   - AC: die keuze wordt opgeslagen en weegt mee in de volgende rangschikking.
5. **Rest en zoeken.**
   - AC: de rest staat ingeklapt op prioriteit en is doorzoekbaar.
6. **Telefoon.**
   - AC: geen horizontaal scrollen, tikvlakken van minimaal 44 px.
   - AC: goedkeuren kan met één hand.

**Daarna, per bron, telkens met een demo:**

7. Teams-chats en mentions (R4).
8. Wachtpunten en najagen (R3).
9. Toezeggingen uit transcripten met *Find a time* (R6).
10. Meeting vandaag (R5).
11. Jira-mentions met comment, en de standstill-regel (R1).
12. Confluence-pagina's.
13. **Ask Claude** globaal. Twee doelen staan vast: *een Confluence-pagina aanpassen* en *mails naar leveranciers sturen*. Bij mail naar buiten Planon verschijnt een waarschuwing.
14. Eigen to-do met snelle invoer.

**Later:** Office-bestanden (Excel, Word, PowerPoint op het Planon-template), OneDrive en PowerPoint als bron.

## Technische risico's (DEV-spike vóór slice 1)
- **Transcripten.** De M365-connector kent `meeting-transcript:///`. DEV controleert of dat voor jouw meetings echt iets teruggeeft.
- **Teams versturen.** Volgens Action Desk was daarvoor een IT-permissie nodig. Krijgen we die niet, dan biedt de najaagkaart **Open in Teams** en **Copy**.
- **Release management.** De Cowork-projecten zijn niet via een connector bereikbaar. Daarom geldt alleen de Confluence-pagina als signaal.
- **Confluence schrijven.** De Rovo-scope `write:page:confluence` is aanwezig.

## Wijzigingen na gebruik (5 okt 2026)
- **"Do now" heet "Today".**
- **Nieuwe actie:** een titel en een korte notitie. Een nieuwe actie komt altijd in Today en blijft daar tot hij Done is of tot "Not today" is gekozen.
- **Vier toestanden** (ontwerp `design/states.html`, goedgekeurd):
  - *Jouw zet*: oranje.
  - *Ligt elders*: staalblauw, telt niet als open.
  - *Wacht op iemand*: staalblauw label; na 3 werkdagen weer jouw zet.
  - *Klaar*: verdwijnt uit de lijst.
- **Recently done** staat standaard dichtgeklapt, toont 7 dagen en heeft Bring back.
- **Automatisch afvinken:** een taak wordt afgevinkt zodra de vervolgactie is gedaan, in Droplet of daarbuiten. Daarbuiten alleen bij een duidelijke match. Undo kan altijd.

### Layout C · Today-first split (5 okt 2026)
Gekozen door Thomas: Today groot links; rechts een live overzicht (Waiting on, Elsewhere, Later, Hours reminders, Recently done) in plaats van Standing by. Een geopend item vervangt het overzicht.
Kaarten verschuiven van Today naar Later (en terug) door te slepen; ook met de knop Later / Today en de toets m. Herschikken binnen Today kan door te slepen. Opgeslagen in db `places/<key>`, met Undo; overleeft reload en nieuwe ranking. Telefoon: Today eerst, daaronder het overzicht; slepen na lang indrukken.

## Layout B · Board with STEERCO (6 okt 2026)

Thomas chose layout B after using C. It replaces C:

- **Today** on the left, as before (large cards, Done, Later, drag to reorder).
- **Waiting on** lane: waits (R3) with a solid steel line; **Elsewhere** under it with the dashed steel line.
- **Later** lane = what to raise in **STEERCO** (lilac). Cards dragged or moved here (db `places/<key>`, `place: "later"`) carry his own note (`note`, saved as he types). He can add his own points (db `steerco/<id>`, `{text, at}`). ✕ takes a card off the list (`place: "off"`: out of Today, under Everything else); a point is removed with Undo. **Copy** puts the list with notes on the clipboard; nothing is sent.
- **Everything else** folds under the STEERCO list (`/` opens it and searches everything).
- **Week** lane (green): hours reminders recap, Recently done.
- Ask Claude sits top right on a laptop (as in the mockup), a bar at the bottom on a phone.
- As in the mockup: one header across the top; Today is a lane with compact cards (command inline, Done on the right). Moving is by drag (whole card; touch: hold) or m; no Later/Today buttons. Drop targets: Today, Waiting on (db place "wait"; own points get lane "wait"), Later, Everything else, Recently done; an open item is a drawer (max 660 px) over the right lanes with a scrim, Today stays in view. Laptop 960–1199 px: Week goes under Waiting and Later. Phone: lanes stack under Today with a sticky jump bar.

## STEERCO panel, transcripts, alerts (6 okt 2026)

- **STEERCO** is its own panel, bottom right across Later and Week (points two across). Waiting on runs full height on the left of it. **Later** is a plain lane again: what Thomas moved out of Today, then Everything else (folded).
- **Transcripts** (R6, extended): window about a week (4 working days back). Besides Thomas's own commitments, Claude lists actions others took on (owner by name, quote checked against the transcript) → own actions with `owner`, shown in Waiting on; and up to 3 key points per meeting → STEERCO suggestions ("From meetings": Add / Skip, stored on `meetings/<key>.points`).
- Droplet re-checks its sources every 30 minutes while open (visible tab).
- **Push alerts**: an Artifact cannot send OS notifications. A Routine "Droplet new-task alerts" (weekdays 07:55–17:55 Amsterdam, push + email, read-only prompt) exists but is disabled: Routines created from this session carry no connectors. Thomas adds Microsoft 365 and Atlassian Rovo to it in claude.ai → Routines, then enables it.

## STEERCO tray (6 okt 2026, UX direction A)

Thomas rejected STEERCO as a column and as a big panel ("klein, ergens"). UX proposed three small collectors (`docs/droplet/design/steerco.html`); he chose **A, the header tray**:
- Closed: a lilac bar left of Ask Claude: `STEERCO n [+suggestions] ⌄ | + Add a point… | Add`. Adding (`s`, type, Enter) never opens it.
- While dragging: the tray lights up and a pocket opens under it ("Drop to raise in STEERCO"). Dragging out of the open panel fades the panel so the lanes show.
- Open (click, `Shift+S`): a 480 px panel under the tray with the list (notes, Done / Off list / Remove / Ask), Copy and the "From meetings" suggestions; it still takes drops. Esc, ✕, the tray or a click outside close it; focus returns to the tray.
- Phone: the tray is a full-width row under the header; open is a bottom sheet (80% height).
- The lanes are again three full-height columns next to Today: Waiting on, Later, Week.

## Agenda in Today (7 okt 2026)

- Today's appointments with the Outlook categories **Green / Blue / Red** (default names, Dutch too) appear in Today until they have ended, in time order, with a small colour dot. Command: Open in Outlook; Done hides the card (db `done/cal-…`).
- **STEERCO** and the **quarterly release plan** ("Release plan Qn", "Qn release") appear from **14 days** before ("In 10 days · …"). STEERCO's command opens the STEERCO list.
- Read-only (`js/agenda.js`): three `outlook_calendar_search` calls per sync (today, "steerco", "release"); nothing in the calendar changes.

## Approved leave (7 okt 2026)

- Source: the colleague's Chrome extension "Planon Verlof Goedkeurder" v1.1+ (not in this repo). Its bridge runs in claude.ai frames and talks to "Action Desk"; Droplet speaks the same messages (`js/leave.js`): hello → reports → store `leave/<run-id>` → `leave-ack`.
- Thomas only wants to hear what was **approved**: a run with approved requests is one card in Today ("Leave approved · n requests", who / when / hours); Done takes it off. Skipped or failed checks are not shown. Droplet never approves or starts a run.
- Checked end-to-end with the real extension loaded in Chromium (report saved by its background → pushed → card → ack → extension's pending list empty → Done).
