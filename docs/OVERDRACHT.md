# Overdracht: waar staan we

Lees dit als je (Claude, als PO) in een nieuwe sessie verdergaat met de Actiepagina.

## Rollen
- **Klant**: Thomas. Praat alleen met de PO.
- **PO (orkestratie)**: jij. Briefs, prioriteit, acceptatie, publicatie, commits.
- **Team (subagents)**: Senior UX, Senior DEV, Senior TST, Analist. Elk krijgt een gerichte opdracht met verwijzing naar de docs hieronder.

## Links
- App (artifact): https://claude.ai/artifact/PqANDMJuGom3jRqvm8k7zv (titel nu "Droplet"), bron `src/index.html`
  plus `src/app/*.js` en `src/styles/*.css` (als `files`, map via `node tools/files-map.js`). Publiceren met
  `Artifact` + `url` van deze app (anders ontstaat een nieuwe). Capabilities: mcp (Microsoft 365, Atlassian Rovo), sample, db.
- Verbeterpunten-document: https://claude.ai/code/artifact/e119fb53-6e4d-44c4-b628-513c70e9488a
- Oude PAF actielijst (archief): https://claude.ai/artifact/Ar6sRYzLNFu5dzdLw1Y4gw
- Repo-branch: `claude/zealous-brahmagupta-fywd7j`

## Documenten
| Bestand | Inhoud |
|---|---|
| `docs/UX-PLAN.md` | UX-plan fase 2 (criteria, bouwplan B0-B10) |
| `docs/PLAN-FASE2.md` | bouwbrief fase 2: echte bevindingen connectors, beslissingen, afwijkingen |
| `docs/BRIEF.md` | productbrief fase 1, besluiten klant, datamodel `acties` |
| `docs/UX.md` | ontwerpspec fase 1 |
| `docs/TESTPLAN.md`, `docs/TESTRAPPORT.md` | testaanpak en bevindingen (fase 2 bovenaan) |
| `docs/CHECKLIST-THOMAS.md` | handmatige checklist voor Thomas: schrijfacties die niet echt getest zijn |
| `docs/OCHTENDRUN.md` | prompt voor de Cowork-ochtendrun (schrijft `voorstellen`) |
| `docs/ANALIST.md` | rol en rapport van de analist |
| `docs/contract/*.d.ts` | runtime-contracten van `window.claude` |

## Architectuur fase 2
**Bestanden**: `src/index.html` (alleen markup) laadt `src/styles/*.css` (base, forest, shell, agenda, inbox,
acties, werk, claude, commandbar) en `src/app/*.js` (klassieke scripts, geen modules) in vaste volgorde: `core.js`,
`prefs.js`, `shell.js`, `bronnen.js`, `agenda.js`, `vandaag.js`, `inbox.js`, `werk.js`, `tabs.js`, `kaart.js`,
`vraag.js`, `claude.js`, `acties.js`, `voorstellen.js`, `commandbar.js`, `events.js`, `gebruik.js`, `start.js`
(zie de `<script>`-volgorde in `src/index.html` voor de exacte lijst; nieuwe modules altijd ná `shell.js` en
vóór `events.js`). Gedeelde functies en state staan als top-level declaraties (geen namespace-object; enige
hernoeming: `status` → `statusEl`). Controle op naambotsingen: `node tools/check-globals.js`.
**Publiceren**: `node tools/files-map.js` print de `files`-map (paden relatief aan `index.html`, bv.
`"app/shell.js": "src/app/shell.js"`); die map gaat als `files` mee met `Artifact` (publish, met `url` van de
bestaande app, anders ontstaat een nieuwe artifact).
**Schil (plug-in API)**: `src/app/shell.js`, uitgebreide uitleg bovenin dat bestand. Een ingang registreren:
`Shell.entry(id, {label, count, empty, first, render})`; een itemtype (detail + actiebalk):
`Shell.type(id, {label, title, detail, inline, context, ask, actions})`; een rij selecteerbaar maken:
`Shell.row(li, type, key, item)`. Verder: `Shell.go/select/current/showDetail/refreshDetail/changed/
inlineSlot/focusSoon`, feedbackbalk via `feedback({text, undo, countdown, link, ...})`, voorkeuren via
`getPref/setPref` (`src/app/prefs.js`), opgeslagen als db-doc `prefs/thomas` (vip, theme, lastEntry,
followedChannels, inboxFilter, teamsSendBlocked) plus een lokale kopie (thema/laatste ingang) voor de eerste
paint, met tijdstip zodat de nieuwste wint.

## Database van de app
`acties` (hoofdlijst), `voorstellen` (ochtendrun en scan), `gebruik/<datum>` (gebruikslog), `inbox_verborgen`
(afgehandelde mail), `adresboek` (eigen personenlijst uit afzenders/deelnemers, max 300, `search_people`
werkt niet voor Thomas), `prefs/thomas` (voorkeuren: vip, theme, lastEntry, followedChannels, inboxFilter,
teamsSendBlocked). `feedback` is niet meer in gebruik.

## Teams versturen: terugval en IT-toestemming
Thomas' Entra-rechten missen `ChatMessage.Send`, `ChannelMessage.Send`, `People.Read` en
`Team.ReadBasic.All`; de bijbehorende tools (`teams_send_chat_message`, `teams_reply_channel_message`,
`teams_create_chat`, `search_people`, `teams_list_teams`) falen met `FORBIDDEN: Missing scope '...'`. De app
herkent dit (`/Missing scope '([^']+)'/`), zet `prefs.teamsSendBlocked` en valt terug op "Kopieer en open in
Teams" (tekst naar klembord, bericht/chat openen in een nieuw tabblad); na 7 dagen probeert de app het
vanzelf één keer opnieuw. Personen zoeken loopt via het eigen `adresboek` in plaats van `search_people`.
Zie `docs/PLAN-FASE2.md` ("Teams antwoorden", "Adresboek") en de conceptmail in `docs/CHECKLIST-THOMAS.md`
om IT om deze rechten te vragen.

## Testpoorten (afspraak binnen het team)
Playwright draait altijd met een eigen `ACTIEPAGINA_PORT` zodat gelijktijdige runs elkaar niet raken:
B0/B1 4201, groep A 4211, groep B 4221, groep C 4231, review 4241, B8 4251, B9 4261, B10 4271. Nooit
`playwright install` (Chromium staat al in `/opt/pw-browsers`), nooit twee suites tegelijk op dezelfde poort.

## Lessen
- Microsoft 365-zoektools accepteren `limit` maximaal 25. De mock dwingt dit af.
- M365 geeft één contentblok per item; `read_resource` geeft één JSON-blok met `body.content` (HTML).
- Claude-paneel werkt als Cowork-taak: schrijfacties direct, alleen via allowlist, alleen op eigen vraag van Thomas (budget 5), nooit verwijderen of instellingen.
- **Worktrees per parallel groep**: elke agent (groep A/B/C, en de review-agent) werkt in zijn eigen worktree
  en committed alleen lokaal, nooit pushen; de PO voegt samen. Dat voorkomt dat twee agents dezelfde
  gedeelde bestanden (`shell.js`, `events.js`) tegelijk bewerken.
- **Mergevolgorde**: B1 eerst (alle drie de groepen bouwen erop verder), dan groep A/B/C parallel, dan B8 zodra
  groep A klaar is, dan B9 en B10 als laatste (raken alle modules licht). Bij conflicten: de module-indeling
  uit B0 hield de overlap klein; alleen `shell.js` en `events.js` kregen af en toe een conflict tussen groepen.
- **Rate limits**: maximaal 2 agents parallel op de Anthropic/claude.ai-kant (meer gaf rate limit-fouten
  tijdens de bouwsessie); de drie parallel-groepen liepen daarom in koppels van twee, niet alle drie tegelijk.

## Bij een nieuwe sessie
1. Lees dit bestand en `git log --oneline | head`.
2. Feedback komt via het verbeterpunten-document. Verwerk het, bewaar de afgehandelde punten in
   `docs/verbeterpunten/<datum>.md` en maak de tabel daarna leeg voor een nieuwe ronde.
3. Controleer de wekelijkse analist-routine (list_triggers) en laat hem naar de nieuwe sessie wijzen.
