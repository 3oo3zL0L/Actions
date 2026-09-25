# Fase 2: bouwbrief voor het team

Referentie: het UX-plan (`docs/UX-PLAN.md`, kopie van https://claude.ai/artifact/6QDSRXVDSjyoQrCEXwNFoB).
Dit document vult het plan aan met wat de echte koppelingen op 25 sep 2026 lieten zien, en legt per stap
vast wat klaar betekent. Bij twijfel: intuïtiviteit weegt zwaarder dan features. Wijk af als iets
aantoonbaar eenvoudiger kan en schrijf de afwijking op onder "Afwijkingen" onderaan.

## Open vragen uit het plan: besluiten (Thomas gaf akkoord zonder antwoord, dus de aanbeveling geldt)
- Inbox: mail en Teams in één lijst, met bronicoon en filterknoppen Alles / Mail / Teams.
- VIP-lijst: namen die Thomas zelf aanwijst (opgeslagen in db) plus automatisch iedereen met wie hij vandaag vergadert.
  Aanwijzen gebeurt in het detail van een mail of Teams-bericht ("Zet <naam> bovenaan", toggle) en via de command bar.
- Verzenduitstel mail: 10 seconden met Annuleer.
- Claude-balk en snelknoppen bovenaan vervallen; Ctrl+K (command bar) en de toets c nemen het over.
- Confluence als leesweergave met één klik naar de echte pagina.

## Echte bevindingen (connectors van Thomas, 25 sep 2026)

### Microsoft 365: rechten
Toegekend (Entra, gedelegeerd): Calendars.ReadWrite, Mail.ReadWrite, Mail.Send, Chat.Read, ChatMessage.Read,
ChatMember.Read, Channel.ReadBasic.All, ChannelMessage.Read.All, User.ReadBasic.All, MailboxSettings.ReadWrite,
Files/Sites lezen, OnlineMeetings.Read.

**Niet** toegekend, met gevolg:
| Ontbreekt | Tools die daardoor falen | Oplossing in de app |
|---|---|---|
| ChatMessage.Send / Chat.ReadWrite / Chat.Create | `teams_send_chat_message`, `teams_create_chat` | Zie "Teams antwoorden" hieronder |
| ChannelMessage.Send | `teams_send_channel_message`, `teams_reply_channel_message` | Idem |
| People.Read | `search_people` | Eigen adresboek (zie hieronder) |
| Team.ReadBasic.All | `teams_list_teams` | teamId/channelId afleiden uit zoekresultaten (zie B3) |

Foutvorm (tool_error, tekst): `FORBIDDEN: Missing scope 'ChatMessage.Send': Microsoft Entra has not granted this
connector ... Granted permissions: ...`. Herken dit met `/Missing scope '([^']+)'/` en toon in mensentaal:
"Teams staat direct versturen niet toe voor jouw account (IT moet toestemming geven)."

### Microsoft 365: vormen (geredigeerd, echte waarden nooit in code of fixtures)
- Zoektools (`outlook_email_search`, `chat_message_search`, `outlook_calendar_search`): één tekstblok per item plus
  een paginatie-object; gebruik de bestaande helper `items()`. `limit` maximaal 25.
- `read_resource({uri})`: één JSON-blok, mailtekst in `body.content` (HTML). Bestaande parser gebruiken.
- `chat_message_search` voor kanaalberichten geeft een uri `teams:///teams/<teamId>/channels/<channelId>/messages/<msgId>`
  (channelId is URL-encoded, begint met `19%3A`). Chatberichten: `teams:///chats/<chatId>/messages/<msgId>`.
- `outlook_find_available_time` → `{nowDateTime, availableTimes:[{start:{dateTime,timeZone}, end:{...}, confidence,
  organizerAvailability, attendeeAvailability:[{email, availability}]}]}`. Tijden zijn wandkloktijd in de
  Windows-tijdzone `W. Europe Standard Time` (bestaande helper in sectie Tijdzones).
- `outlook_send_mail` werkt echt (getest met een mail aan Thomas zelf).
- `outlook_modify_labels({messageId, addCategories?, removeCategories?})`: ongedaan maken van Afhandelen kan nu echt
  met `removeCategories: ["Afgehandeld"]`.
- `outlook_create_event`, `outlook_respond_to_event`: rechten zijn er (Calendars.ReadWrite), maar niet echt getest:
  de veiligheidscontrole van de bouwsessie hield de testafspraak tegen. Thomas test deze met de checklist in B10.

### Atlassian Rovo (cloudId `f5ee9bed-0e04-48ea-aa28-5c3ecd088de8`)
- `getJiraIssue({cloudId, issueIdOrKey})` → `{issues:{nodes:[{key, webUrl, fields:{summary, status:{name, statusCategory},
  assignee:{displayName, accountId}, comment:{comments:[{author:{displayName}, body, created}]}, ...}}]}}`.
- `getTransitionsForJiraIssue` → `{transitions:[{id, name, to:{name, statusCategory}}]}`. Alleen deze tonen.
- `getConfluencePage({cloudId, pageId, contentFormat:"markdown"})` → `{content:{nodes:[{id, title, body (markdown),
  space, webUrl}]}}`. Leesweergave = markdown renderen met de bestaande Claude-markdown-renderer (veilig, geen HTML).
- Schrijven (commentaar, transitie, issue, pagina) is niet echt getest: zichtbaar voor collega's en tegengehouden in de
  bouwsessie. Mock-tests plus Thomas' checklist.

## Beslissingen die uit de bevindingen volgen

**Teams antwoorden (B2, B3).** De Antwoord-knop blijft, met één pad dat altijd werkt:
1. App probeert direct versturen (`teams_send_chat_message` of `teams_reply_channel_message`) zolang geen
   ontbrekende-rechten-vlag gezet is.
2. Bij `Missing scope`: vlag `prefs.teamsSendBlocked = {since: ISO}` in db, tekst naar klembord, bericht openen in
   Teams (webUrl van het bericht, nieuw tabblad). Feedbackbalk: "Tekst gekopieerd. Plak hem in Teams ↗".
3. Met de vlag gezet heet de knop direct "Kopieer en open in Teams" (geen mislukte poging meer). Na 7 dagen probeert
   de app het één keer opnieuw, zodat het vanzelf werkt zodra IT toestemming geeft.
4. 1-op-1 chat met bekend e-mailadres: gebruik de deeplink `https://teams.microsoft.com/l/chat/0/0?users=<email>&message=<tekst>`
   (tekst vooringevuld). Groepschat en kanaal: webUrl van het bericht plus klembord.
Claude-paneel: Teams-schrijftools blijven in de allowlist; `voer_uit` herkent `Missing scope` en geeft Claude de
instructie terug: "Versturen via Teams kan niet voor dit account. Geef de tekst en de link zodat Thomas hem plakt."
De pagina toont dan een stapregel "Teams: kopieer en plak ↗" met kopieerknop.

**Adresboek (B2, B4, Claude).** `search_people` werkt niet. De app bouwt een lokaal adresboek uit afzenders en
ontvangers van mail, deelnemers van afspraken en Teams-afzenders (naam + e-mail, laatst gezien), in het geheugen
plus db-collectie `adresboek` (alleen naam en e-mail, max 300, oudste eruit). Gebruikt voor: Doorsturen-veld,
VIP-toggle, deelnemers bij "Plan een vergadering", en als page-tool `personen_zoeken` voor Claude (vervangt
`search_people` in de read-allowlist; `search_people` blijft als fallback voor als IT het later toestaat).

**Schrijfstijl.** Alles wat de app voor Thomas opstelt volgt EMAIL_STYLE (sectie Claude, `finishMail`,
`styleMailInput`). Voor Teams-berichten en Jira/Confluence-commentaar: dezelfde stem (vraag eerst, dan waarom,
geen opvulling, geen em-dashes, "that being said"), maar zonder "KR / Thomas" (chat en commentaar hebben geen
afsluiter). Helper `finishChat(t)` naast `finishMail`. "Laat Claude schrijven" in elk invulveld gebruikt dezelfde regels.

## Regels voor elke agent
- Lees eerst: `docs/UX-PLAN.md`, dit bestand, `docs/OVERDRACHT.md`, en de sectie(s) van de code die je raakt.
- Tests: Playwright 1.56.1 tegen `tests/mock-claude.js`. Draai met een **eigen poort**:
  `ACTIEPAGINA_PORT=<jouw poort> npx playwright test`. Poorten: B0/B1 4201, groep A 4211, B 4221, C 4231,
  review 4241, B8 4251, B9 4261, B10 4271. Nooit `playwright install`; Chromium staat in /opt/pw-browsers.
- Nooit echte gebruikersdata of ids uit connectorresultaten in code, fixtures of docs. Fixtures zijn verzonnen.
- De mock moet de echte grenzen afdwingen: `limit` ≤ 25, `Missing scope`-fout voor de Teams-schrijftools en
  `search_people` als de fixture `teamsSendBlocked`/`peopleBlocked` zet (standaard: geblokkeerd, zoals bij Thomas).
- Verwijderen, prullenbak, afwezigheid, filters en instellingen blijven onmogelijk (DENY_RE ongewijzigd).
- Schrijfacties op externe systemen alleen na een expliciete klik of eigen getypte vraag van Thomas.
- Nooit een lopende schrijfactie afbreken. Het 10-secondenuitstel zit vóór de aanroep.
- Definition of done per stap: volledige suite groen (niet alleen je eigen specs), geen consolefouten, fouten in
  mensentaal met één herstelactie, sneltoets en tooltip voor elke nieuwe actie, specs testen gedrag via rollen
  en teksten, niet via classnamen.
- Agents committen alleen lokaal in hun eigen worktree (als ze die hebben), nooit pushen. De PO voegt samen.
- Nederlandse labels, kort en duidelijk. Geen em-dashes of en-dashes in UI-tekst.

## Stappen
Zie het plan (Stap 4) voor inhoud en testcriteria; hieronder alleen de aanvullingen.

**B0 Opsplitsen.** `src/index.html` wordt `index.html` (markup), `styles/*.css` (per onderdeel: base, forest, shell,
inbox, acties, werk, agenda, claude) en `app/*.js` (klassieke scripts, in vaste volgorde geladen; gedeelde
functies en state via één globaal namespace-object `AP` of via top-level declaraties, zolang er geen
naambotsingen zijn). Functioneel identiek: alle 82 tests groen zonder testwijziging. Publicatie via Artifact
`files` (paden relatief aan index.html). Script `tools/files-map.js` print de `files`-map voor publicatie.

**B1 Schil.** Drie zones (nav 5 ingangen met tellers · lijst · detail), selectiemodel (één geselecteerd item per
ingang, onthouden), feedbackbalk (één voor alles, met Ongedaan maken / Annuleer (Ns) / Bekijk ↗), voorkeuren in
db-doc `prefs/thomas` (vip, thema, laatste ingang, gevolgde kanalen, filter), mobiele tabbalk ≤ 700px.
Bestaande onderdelen verhuizen voorlopig ongewijzigd naar de juiste ingang, zodat de app na B1 bruikbaar blijft.
Tests die aan de oude layout hangen: aanpassen aan gedrag, niet schrappen; verwijderde functies (snelknoppen,
Claude-balk bovenaan, knoppenrij per rij) krijgen een vervangende test via het nieuwe pad.

**Groep A: B2 Inbox, daarna B3 Teams-kanalen.** B3: gevolgde kanalen = kanalen die voorkomen in recente
`chat_message_search`-resultaten; Thomas zet er een "volgen"-vinkje bij; alleen gevolgde kanalen worden met
`teams_list_channel_messages` ververst.

**Groep B: B4 Agenda, B5 Acties.** Plan een vergadering: deelnemers uit het adresboek, duur 30/60 min,
`outlook_find_available_time` voor de komende 5 werkdagen, drie beste sloten als knoppen, event met
`isOnlineMeeting: true`. Accepteren/afwijzen/voorlopig met optioneel bericht. Ongedaan bij accepteren = "Toch
afwijzen" (terugdraai-actie), niet nep-ongedaan.

**Groep C: B6 Werk, B7 Command bar en sneltoetsen.**

**B8 Claude-paneel** in de detailkolom, contextkaart volgt selectie, taakmodus en vangrails ongewijzigd, plus de
`Missing scope`-afhandeling en `personen_zoeken`.

**B9** licht thema, mobiel, toegankelijkheid. **B10** twee-minutentoets, testrapport, docs, publicatie, checklist
voor Thomas.

## Intuïtiviteitstoets (aparte review-agent, na elke stap)
Toets met screenshots (desktop 1280×860 en mobiel 375×812, forest en licht) en een korte klikroute tegen:
1. Nul leercurve: mail afhandelen, actie maken, Claude vragen, elk ≤ 3 klikken vanaf koud openen, zonder uitleg.
2. Eén patroon: elke ingang selecteer → detail rechts → actiebalk in vaste volgorde.
3. Elke actie één klik bereikbaar; geen grijze knoppen; geen overlappende panelen.
4. Directe feedback plus ongedaan (of eerlijk "Bekijk ↗").
5. Duidelijke Nederlandse labels, geen jargon, geen em-dashes.
6. Toetsenbord: Ctrl+K, 1-5, j/k, e, r, a, c, o, n, z, Esc, Shift+R; tooltips noemen de toets.
7. VIP bovenaan; voorkeuren blijven na herladen.
8. Werkt op mobiel en in beide thema's.
Oordeel per criterium: voldoet / bijna / voldoet niet, met concrete verbetering. "Voldoet niet" blokkeert de stap.

## Afwijkingen van het plan (bijgehouden tijdens de bouw)
- Teams direct versturen kan niet zonder IT-toestemming; tijdelijk "Kopieer en open in Teams" met automatische
  herpoging na 7 dagen.
- Personen zoeken via eigen adresboek in plaats van Microsoft-personenzoeker.
- Teams-overzicht van alle teams kan niet; kanalen worden gevonden via recente berichten.
- B0: splitsing met top-level declaraties (geen namespace-object); enige hernoeming `status` -> `statusEl`
  (window.status bestaat al). De bos-illustratie blijft inline in index.html: een test controleert de SVG-paden.
- B1: Vandaag is een eigen lijst (afspraken van nu en straks, acties voor vandaag, nieuwe voorstellen); de hele
  dag staat onder Agenda. Mail en Teams blijven tot B2 twee tabs in Inbox; de gekozen tab is voorkeur `inboxFilter`.
- B1: het voorstellenblok in Acties houdt tot B5 de knoppen Op de lijst / Weg per rij (triage); in Vandaag zijn
  voorstellen gewone rijen met die knoppen in de actiebalk.
- B1: tot de command bar (B7) openen de knop Vraag Claude bovenaan, / en Ctrl+K het Claude-paneel zonder item.
  De toetsen e, r, a, c, o (en b, v, x) werken al generiek via de actiebalk; B7 voegt de command bar toe.
- B1: het lees-alleen-pad zonder eigen vraag van Thomas (vroeger de snelknoppen) is nu Bereid voor; de
  injectietest gebruikt dat pad.
- B1: thema en laatste ingang staan ook lokaal (eerste paint) met een tijdstip; bij laden wint de nieuwste,
  zodat een db-write die nog onderweg was geen verse keuze overschrijft.
- B1: alleen de actieve ingang heeft rijen in de DOM; bij wisselen roept de schil render() van de ingang aan.

- B2: rijen tonen nieuwste eerst (niet meer ongelezen eerst); VIP-groep "Bovenaan" erboven. Vergaderingen met meer
  dan 15 deelnemers tellen niet mee voor VIP (anders maakt een all-hands iedereen VIP).
- B2: extra acties (Allen beantwoorden l, Doorsturen f, Zet <naam> bovenaan b, Volg kanaal s) staan achter één knop
  "Meer" (m) onder de actiebalk; hun toetsen werken ook zonder Meer te openen. Is er maar één extra, dan staat die direct.
- B2: verzenduitstel met een eigen timer per mail, los van de feedbackbalk: een nieuwe melding annuleert of versnelt
  niets; een wachtende mail is ook te annuleren via de kaart "Wordt zo verzonden" in het detail van die mail.
  Sluiten van het tabblad tijdens het wachten vraagt eerst bevestiging (beforeunload).
- B2: Maak actie vanuit Inbox voegt de actie direct toe (programma geraden uit de tekst, anders Overig plus Claude-
  voorstel) en blijft in de Inbox; de feedbackbalk heeft "Bekijk" die de nieuwe actie selecteert.
- B2: adresboek bewaart per persoon ook "gezien" (datum), nodig om bij meer dan 300 de oudste te verwijderen.
- B2: V (en de knop Afgehandeld) toont afgehandelde berichten onderaan, met Terugzetten (e).
- B3: kanalen staan als ingeklapte groep "Teams-kanalen (n)" onderaan de Inbox, als gewone selecteerbare rijen;
  Volgen/Niet meer volgen (s) zit in de actiebalk van het kanaaldetail (geen vinkjes in de rij, PO-regel: geen knoppen
  in rijen). Kanaalnamen komen uit teams_list_channels (Channel.ReadBasic.All is toegekend), één keer per team.
