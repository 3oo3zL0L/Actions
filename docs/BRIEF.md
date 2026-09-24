# Actiepagina — productbrief (PO)

## Klant
Thomas, Software Development Manager, leidt de PAF-programma's (UI/UX, Platform Core, CI Acceleration,
OIDC, Object Store, Jakarta migratie, Platform Stability, Contracten, Overig). Werkt in het Nederlands,
veel via Claude Cowork/chat. Bronnen: Teams, Outlook mail + agenda, PAF actielijst (een ander
Claude-artifact), Confluence, Jira, Claude.

## Doel
Eén pagina waar Thomas zijn werkdag start en doet: zien wat er speelt, beslissen, en direct handelen
(antwoorden, doorzetten, vastleggen), met Claude als collega in de pagina.

## Vorm en platform
- Eén zelfstandig HTML-bestand `src/index.html`, gepubliceerd als claude.ai **Artifact**. Geen build-stap,
  geen framework. Externe scripts alleen van cdnjs.cloudflare.com / cdn.jsdelivr.net/npm, fonts alleen van
  Google Fonts. Alles werkt op telefoonbreedte (16px gutter, geen horizontale scroll).
- Data komt uit de claude.ai-connectors van de kijker via de runtime-capability `mcp`, Claude via `sample`,
  eigen opslag via `db`. Contracten (authoritatief): `docs/contract/*.d.ts`. Lees `claude.d.ts` en `mcp.d.ts`
  eerst. Toegang: `const mcp = await window.claude.use("mcp")` → kan `null` zijn: pagina moet dan nog steeds
  renderen met duidelijke lege staten ("Koppel Microsoft 365 in claude.ai").
- Taal UI: Nederlands. Toon: direct, zakelijk, geen opvulling, geen em-dashes.

## Gedeclareerde capabilities (manifest bij publiceren)
```json
{
  "mcp": { "servers": [
    { "server": "Microsoft 365", "tools": ["outlook_calendar_search","outlook_email_search","chat_message_search",
      "teams_list_chats","read_resource","outlook_create_reply_draft","teams_send_chat_message","get_me"] },
    { "server": "Atlassian Rovo", "tools": ["searchJiraIssuesUsingJql","searchConfluenceUsingCql","addCommentToJiraIssue"] }
  ]},
  "sample": {},
  "db": {}
}
```
Atlassian cloudId: `f5ee9bed-0e04-48ea-aa28-5c3ecd088de8` (site planon.atlassian.net).

## Features (MVP, in volgorde van belang)
1. **Vandaag / agenda** — afspraken van vandaag (tijdlijn), "nu" en "volgende" gemarkeerd, link naar Outlook,
   knop "Bereid voor" → Claude maakt een korte voorbereiding (wie, waarover, gerelateerde mail/Teams/Confluence).
2. **Inbox** — recente mail (ongelezen eerst, ruis zoals no-reply/notificaties inklapbaar) en Teams-berichten
   van vandaag/gisteren. Per item: open in Outlook/Teams, "Antwoord-concept" (Claude schrijft, Thomas past aan,
   pagina maakt een **concept** in Outlook via `outlook_create_reply_draft` — nooit direct versturen),
   "Maak actie" (naar eigen actielijst, zie 4).
3. **Jira & Confluence** — Jira: issues waar Thomas bij betrokken is (JQL instelbaar, default
   `assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser() ORDER BY updated DESC`,
   met fallback-tekst als leeg). Confluence: pagina's die Thomas recent bewerkte/volgt. Links openen in nieuw tab.
   Commentaar plaatsen op Jira-issue met bevestiging.
4. **Acties** — lichte eigen actielijst in `db` (collectie `acties`): tekst, wie, deadline, programma, bron-link
   (mail/Teams/Jira), status open/klaar. Snel toevoegen (Enter). Prominente link naar de **PAF actielijst**
   (https://claude.ai/artifact/Ar6sRYzLNFu5dzdLw1Y4gw) — die heeft eigen opslag en blijft de hoofdlijst.
5. **Claude-paneel ("Vraag Claude")** — chat onderin/rechts. `sample` met `tools`: page-functies die de
   read-tools aanroepen (agenda, mail, teams, jira, confluence zoeken) zodat Claude zelf context ophaalt.
   Schrijfacties (concept maken, Teams-bericht, Jira-commentaar) stelt Claude alleen **voor**; de pagina toont
   een bevestigkaart, Thomas klikt "Uitvoeren". Snelknoppen: "Wat moet ik vandaag?", "Vat mijn inbox samen",
   "Wat is er gebeurd in Teams?".

## Niet-functioneel
- Eerste render < 1s zonder data; secties laden onafhankelijk, elk met skeleton, fout en lege staat.
- Foutcodes van `mcp` per sectie tonen in mensentaal; alleen `retryable` opnieuw proberen.
- Versheid tonen ("bijgewerkt 10:42"). Handmatige ververs-knop per sectie en globaal.
- Nooit tokens/secrets in de pagina. Geen echte klantdata als voorbeelddata in de broncode.
- Toegankelijk: toetsenbord, focus zichtbaar, contrast AA, `prefers-reduced-motion`.
- Licht + donker thema via tokens op `:root` (`prefers-color-scheme`, plus `[data-theme]`).

## Waargenomen resultaatvormen (gestript; echte calls, waarden vervangen)
Let op: de M365-tools geven **meerdere content-blokken**, één JSON-object per item, plus een laatste
paginatie-object (`{"moreResults":true,"nextOffset":2}` of `nextCursor`). Controleer in `mcp.d.ts` hoe `payload`
/ `content` dan in de page binnenkomt en parse robuust (array van text-blokken → JSON.parse per blok,
paginatieregel negeren).

outlook_calendar_search(query:"*", afterDateTime:"today", beforeDateTime:"tomorrow", limit) per item:
```json
{"uri":"calendar:///events/…","id":"…","subject":"…","organizer":"x@y.com","attendees":["x@y.com"],
 "start":{"dateTime":"2026-09-24T08:30:00.0000000","timeZone":"W. Europe Standard Time"},
 "end":{"dateTime":"…","timeZone":"…"},"location":"Microsoft Teams Meeting","summary":"…",
 "importance":"normal","showAs":"busy","isAllDay":false,"isCancelled":false,"isOrganizer":false,
 "recurrence":null,"webLink":"https://outlook.office365.com/owa/?itemid=…","categories":null}
```
(dateTime is wandkloktijd in de genoemde zone — niet als UTC parsen.)

outlook_email_search(order:"newest", limit) per item:
```json
{"uri":"mail:///messages/…","id":"…","subject":"…","sender":"x@y.com","recipients":["…"],
 "receivedDateTime":"2026-09-24T11:11:49.000Z","summary":"…","hasAttachments":false,"importance":"normal",
 "isRead":true,"webLink":"https://outlook.office365.com/owa/?ItemID=…"}
```
chat_message_search(query:"*", afterDateTime:"yesterday", limit) per item:
```json
{"uri":"teams:///chats/…/messages/…","id":"…","chatId":"19:…","subject":"","summary":"tekst",
 "createdDateTime":"…Z","from":{"displayName":"…","email":"…"},"importance":"normal","webUrl":"https://teams.microsoft.com/l/message/…"}
```
teams_list_chats(limit) per item: `{"id","chatType":"meeting|oneOnOne|group","topic","lastUpdatedDateTime","memberCount","members":[{"displayName","email"}]}`

searchJiraIssuesUsingJql(cloudId, jql, maxResults, fields:["summary","status","priority","updated","project","issuetype","assignee"]) → één blok:
```json
{"issues":{"nodes":[{"id":"…","key":"ABC-1","fields":{"summary":"…","issuetype":{"name":"…","iconUrl":"…"},
  "project":{"key":"…","name":"…"},"assignee":{"displayName":"…"},"priority":{"name":"Major"},
  "updated":"2026-09-24T13:23:53.024+0200","status":{"name":"Review","statusCategory":{"key":"indeterminate","colorName":"yellow"}}},
  "webUrl":"https://planon.atlassian.net/browse/ABC-1"}],"webUrl":"…","pageInfo":{"hasNextPage":true,"endCursor":"…"}}}
```
searchConfluenceUsingCql(cloudId, cql:"contributor = currentUser() AND type = page ORDER BY lastmodified DESC", limit) → één blok:
```json
{"content":{"totalCount":2,"nodes":[{"id":"…","type":"page","title":"…","lastModified":"yesterday at 9:28 AM",
  "summary":"…","space":{"key":"DEV","name":"Development"},"author":{"displayName":"…"},"webUrl":"https://planon.atlassian.net/wiki/…"}]}}
```
Schrijftools (NIET aangeroepen tijdens verkenning; argumenten uit schema):
- outlook_create_reply_draft `{messageId, body, bodyType:"html"|"text"}` of `{messageId, comment}` → id + webLink.
- teams_send_chat_message `{chatId, body, bodyType?}`.
- addCommentToJiraIssue `{cloudId, issueIdOrKey, commentBody, contentFormat:"markdown"}`.
Resultaatvorm van schrijftools is onbekend: behandel succes generiek, zoek een `webLink` als die er is.

## Team en werkwijze
- PO (orkestratie): brief, prioriteiten, acceptatie, publicatie.
- Senior UX: `docs/UX.md` (IA, layout desktop/mobiel, componenten, tokens, microcopy, staten).
- Senior DEV: `src/index.html`, volgt UX.md + contracten.
- Senior TST: `tests/` Playwright met een mock van `window.claude` (mcp/sample/db), `docs/TESTPLAN.md`,
  rapporteert bevindingen in `docs/TESTRAPPORT.md`.

## Besluit PO: parsen van mcp-resultaten
`result.payload` is alleen `structuredContent` of het **eerste** text-blok. Voor M365 (één blok per item)
is dat dus te weinig. Regel: gebruik `callTool`/`watchTool` en parse **alle** `result.content`-blokken met
`type === "text"` via JSON.parse (try/catch per blok), laat objecten met `moreResults`/`nextOffset`/`nextCursor`
weg. Voor Atlassian volstaat het eerste blok (`payload`). Eén helper `items(result)` doet dit voor beide.
