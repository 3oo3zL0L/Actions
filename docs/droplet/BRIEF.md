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
