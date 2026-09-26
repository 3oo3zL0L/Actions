
# Actiepagina: UX-plan
 · 
Plan voor de volledige overhaul van de Actiepagina (https://claude.ai/artifact/PqANDMJuGom3jRqvm8k7zv) tot één werkplek voor mail, Teams, agenda, acties, Jira en Confluence. Hoofdcriterium: nul leercurve. Fase 1: alleen dit plan, er wordt nog niets gebouwd.
## In het kort
De Actiepagina wordt herbouwd rond één patroon: links kiezen wat je doet, in het midden de lijst, rechts het detail met altijd dezelfde actiebalk. Alles wat je dagelijks in Outlook, Teams, Jira of Confluence doet, kan dan ter plekke, met directe feedback en ongedaan maken waar dat technisch kan. Claude blijft de collega die je met taal opdrachten geeft; de knoppen dekken de vaste handelingen.
Wat ik anders doe dan gevraagd, met reden:
- Confluence-pagina's toon ik als leesweergave (vereenvoudigde tekst), niet als volledige pagina. De koppeling levert de inhoud als opmaakstructuur, niet als de opgemaakte pagina; macro's en layouts gaan verloren. Een nette leesweergave met één klik naar de echte pagina is eerlijker dan een halve namaak.
- "Mail op gelezen zetten" vervang ik door Afhandelen. De koppeling heeft geen gelezen-tool. Afhandelen (categorie in Outlook + weg uit de lijst, met ongedaan maken) bestaat al en dekt hetzelfde doel: de lijst leeg werken.
- Verzonden mail heeft geen ongedaan maken. Dat kan technisch niet. In plaats daarvan: een verzendbalk die 10 seconden telt voordat de mail echt gaat, met Annuleer. Dat voelt hetzelfde en is wel waar.
- Ik schrap de losse knoppenrij per lijstregel (Antwoord-concept, Maak actie, Vraag Claude, Open per rij). Die acties verhuizen naar één vaste actiebalk in het detailpaneel. Minder herhaling op het scherm, één plek om te kijken, en de lijst wordt rustig en scanbaar.
- De drie snelknoppen boven de pagina vervallen; de Claude-balk gaat op in de command bar (Ctrl+K). Eén invoer voor navigeren, acties en vragen aan Claude is simpeler dan drie aparte ingangen.
- Verwijderen blijft onmogelijk, ook in de nieuwe versie. Mail, afspraken of pagina's weggooien doe je in het bronsysteem. Dat houdt de app veilig genoeg om zonder nadenken te gebruiken.
## Stap 1. Beschikbare bouwstenen
Gecontroleerd in deze sessie (25 sep 2026) tegen de artifact-runtime (contract 0.2.54) en de connectors van Thomas' claude.ai-account.
Runtime-capabilities van de pagina (beschikbaar op dit account): mcp (connectortools aanroepen als de kijker), sample (Claude in de pagina, met page-tools), db (eigen opslag: acties, voorstellen, gebruikslog, voorkeuren), user, comments, room, files, assets, downloads, artifact. De app gebruikt nu mcp + sample + db; dit plan voegt geen nieuwe capabilities toe.
Microsoft 365 (verbonden): lezen: agenda-, mail- en Teams-zoeken, chats/teams/kanalen en kanaalberichten, volledige item-inhoud (read_resource), personen zoeken, beschikbaarheid (find_meeting_availability, outlook_find_available_time), eigen profiel. Schrijven: mail versturen, concepten maken/bijwerken/versturen, allen-beantwoorden, doorsturen, categorieën; afspraken maken/bijwerken/beantwoorden; Teams-chatbericht, nieuwe chat, kanaalbericht en kanaal-antwoord. Ook aanwezig maar bewust niet gebruikt: verwijderen, prullenbak, afwezigheid, filters, SharePoint-beheer.
Atlassian Rovo (verbonden, site planon.atlassian.net): lezen: Jira-zoeken (JQL) en issue-detail met commentaren, transitie-opties, projecten en issue-typen, accountId-lookup; Confluence-zoeken (CQL), pagina-inhoud, spaces, onderliggende pagina's; Rovo-zoeken over alles. Schrijven: Jira-commentaar, issue aanmaken/bewerken, status doorzetten; Confluence-pagina aanmaken/bijwerken, commentaar plaatsen.
Relevante grenzen, in deze sessie vastgesteld of uit de contracten:
- Zoektools van Microsoft 365 geven maximaal 25 items per aanroep; de pagina pagineert of kapt af.
- Er is géén tool om mail als gelezen te markeren, mail terug te trekken, of een Outlook-categorie via de lijstweergave te verwijderen zonder het bericht-id.
- read_resource levert mailtekst als HTML; bijlagen zijn niet als bestand op te halen.
- De pagina kan geen specifiek Claude-model kiezen, alleen een niveau (snel / standaard / meest capabel); het platform bepaalt het model.
- Pushmeldingen bestaan niet: de pagina ververst zelf (agenda elke 5 min, mail en Teams elke 3 min, Jira en Confluence elke 10 min).
- Eén schrijfactie tegelijk per systeem; een afgebroken schrijfactie heeft een onbekende uitkomst, dus de app breekt lopende schrijfacties nooit af.
## Stap 2. Gap-analyse
Functie
Kan?
Toelichting
Mail lezen (volledige inhoud)
Kan
Via read_resource; HTML wordt nette leestekst. Bijlagen alleen als vermelding met link naar Outlook.
Mail beantwoorden en versturen
Kan
Concept + versturen, of direct versturen; altijd in Thomas' mailstijl (Hi, eerst de vraag, KR/Thomas).
Mail doorsturen
Kan
Met begeleidende regel.
Mail afhandelen
Kan
Categorie "Afgehandeld" in Outlook + weg uit de lijst; ongedaan maken haalt hem terug (categorie blijft staan). Bestaat al.
Mail op gelezen zetten
Kan niet
Geen tool in de koppeling. Afhandelen is het alternatief.
Verzonden mail terugtrekken
Kan niet
Vervangen door 10 seconden uitsteltijd met Annuleer vóór het echte versturen.
Teams lezen (chats én kanalen)
Kan
Chats via zoeken; kanalen via teams/kanalen/berichten-tools. Kanalen zijn nieuw op de pagina.
Teams direct antwoorden
Kan
In chat, in kanaal en als antwoord op een kanaalbericht.
Agenda vandaag en morgen
Kan
Morgen is nieuw (nu alleen vandaag).
Vergadering inplannen op beschikbaarheid
Kan
Beschikbaarheid opvragen, voorstel tonen, afspraak aanmaken met Teams-link en uitnodigingen.
Uitnodiging accepteren of afwijzen
Kan
Ook voorlopig, met bericht aan de organisator.
Acties: toevoegen, afvinken, deadline, per programma
Kan
Bestaat al in de eigen opslag; blijft.
Actie maken van mail of Teams-bericht (1 klik)
Kan
Bestaat al; bron-link komt mee.
Jira: openen, reageren, status, toewijzen
Kan
Issue-detail met commentaren; transitie-opties worden opgehaald zodat alleen geldige statussen getoond worden.
Jira: nieuw issue vanuit mail of actie
Kan
Projectkeuze en issue-typen komen uit de koppeling; onderwerp en samenvatting worden voorgevuld.
Confluence: pagina lezen in de app
Deels
Inhoud als vereenvoudigde leesweergave; macro's, layouts en bijlagen niet. Eén klik naar de echte pagina.
Confluence: pagina bijwerken
Kan
Alleen via Claude (taal), niet via een formulier: een pagina-editor nabouwen schaadt de eenvoud.
Claude: vraag of taak over elk item
Kan
Bestaat al (leest zelf, voert uit binnen allowlist, nooit verwijderen, max 5 schrijfacties per eigen vraag).
Mail van directe collega's bovenaan
Deels
Er is geen organogram in de koppeling. Oplossing: een eigen VIP-lijst (namen die Thomas aanwijst, opgeslagen in de pagina) plus automatisch iedereen met wie hij vandaag vergadert.
Voorkeuren en status bewaard tussen sessies
Kan
Eigen opslag (gedeeld over apparaten) voor VIP-lijst en instellingen; per apparaat voor kleinigheden als de laatst gekozen tab.
Optimistisch + ongedaan maken
Deels
Volledig voor alles in de eigen opslag; voor externe systemen geldt: uitstellen vóór verzenden (mail), terugdraai-actie waar die bestaat (afspraak afwijzen na accepteren), en anders eerlijk melden dat het gebeurd is.
Meldingen bij nieuwe items
Deels
Geen push; de tellers en lijsten verversen elke paar minuten vanzelf.
## Stap 3a. Layout en informatiehiërarchie
Het model: één werklijst met drie zones. Links een smalle navigatie met vijf vaste ingangen en tellers. In het midden de lijst van de gekozen ingang. Rechts het detail van het geselecteerde item, met bovenin altijd dezelfde actiebalk. Geen zwevende panelen: het detail is een vaste kolom, en het Claude-paneel vervangt (op verzoek) de detailkolom, nooit eroverheen.
De vijf ingangen:
- Vandaag (start): de dag als één lijst: eerst je afspraken van nu en straks, dan acties met Vandaag-markering, dan nieuwe voorstellen uit de ochtendrun. Dit is het antwoord op "wat moet ik nu?" zonder één klik.
- Inbox: mail en Teams samen, nieuwste bovenaan, met bronicoon. VIP's (zelf aangewezen collega's plus iedereen met wie je vandaag vergadert) staan bovenaan; meldingen en no-reply ingeklapt onder "Meldingen (n)". Waarom samen: één plek leegwerken in plaats van twee tabs.
- Acties: de hoofdlijst, gegroepeerd Vandaag → per PAF-programma, met Klaar en N.v.t. ingeklapt.
- Werk: Jira-issues en Confluence-pagina's waar je bij betrokken bent.
- Agenda: vandaag en morgen als tijdlijn, plus de knop "Plan een vergadering".
Informatiehiërarchie per rij: één regel wie/wat (vet als ongelezen of vandaag), één regel context (onderwerp, deadline, programma of status), rechts de tijd. Niets anders: alle handelingen zitten in het detail, waardoor rijen scanbaar blijven.
Mobiel (≤ 700px): dezelfde vijf ingangen als tabbalk onderaan; lijst en detail zijn dan twee schermen met terug-knop; de actiebalk staat onder het detail, duimbereik. Thema: licht en donker (Dark Forest blijft het donkere thema, met de bestaande illustratie), automatisch via systeemvoorkeur, om te schakelen met één knop.
## Stap 3b. Eén interactiepatroon
Hetzelfde ritme in elk blok, zodat je het één keer leert:
- Selecteer een rij (klik, of pijltjes/j-k). Het detail opent rechts; de lijst blijft staan en houdt je positie.
- Actiebalk bovenin het detail, altijd dezelfde volgorde en plek: primáire actie · Afhandelen/Klaar · Maak actie · Vraag Claude · Open in … ↗. De primáire actie verschilt logisch per type: mail = Beantwoord, Teams = Antwoord, agenda-uitnodiging = Accepteer, actie = Vink af, Jira = Reageer, Confluence = Lees. Knoppen die niet kunnen, staan er niet (geen grijze knoppen om over na te denken).
- Inline invullen, nooit een popup: Beantwoord opent een tekstvak ónder de actiebalk in hetzelfde paneel, met "Laat Claude schrijven" ernaast. Versturen met Ctrl+Enter.
- Directe feedback onderaan het scherm, één balk voor alles: "✓ Verzonden aan Sophie · Annuleer (8s)", "✓ Afgehandeld · Ongedaan maken", "✓ Actie toegevoegd bij OIDC · Bekijk". De balk noemt altijd wát er gebeurde en één uitweg.
- Ongedaan maken, drie smaken, eerlijk benoemd:
- Uitstellen: mail versturen wacht 10 s met zichtbare teller; Annuleer stopt het echt.
- Terugdraaien: afhandelen, afvinken, Vandaag-markering, voorstel-besluit: één klik terug.
- Niet terug te draaien (Teams-bericht, Jira-commentaar, Confluence-wijziging): de feedbackbalk toont dan "Bekijk ↗" in plaats van een nep-ongedaan.
- Laden en fouten per blok: skeleton bij eerste keer laden, daarna verversen op de achtergrond met "bijgewerkt 10:42"; een fout raakt alleen dat blok, in mensentaal met één herstelactie (bestaand gedrag, blijft).
- Lege staten leggen uit wat kan: "Inbox leeg. Nieuwe mail en Teams-berichten verschijnen hier vanzelf; V toont ook wat je al afhandelde."
Claude in dit patroon. "Vraag Claude" opent het Claude-paneel op de plaats van de detailkolom, met het item als contextkaart (bestaand gedrag). Claude voert taken direct uit binnen de bestaande vangrails: alleen op jouw eigen getypte vraag, allowlist, nooit verwijderen, max 5 schrijfacties per vraag; elke stap als regel "✓ Teams-bericht verzonden ↗". De vangrails veranderen niet in deze overhaul.
## Stap 3c. Keyboard-first
Command bar (Ctrl+K of /): één invoer voor drie dingen, zonder modus-keuze vooraf:
- Navigeren: typ "inbox", "agenda", of de naam van een item; Enter springt ernaartoe.
- Uitvoeren: acties op het geselecteerde item ("afhandelen", "beantwoord") en algemene acties ("plan een vergadering", "nieuwe actie", "ververs alles", "thema").
- Vragen: alles wat geen commando is, gaat als vraag naar Claude, met het geselecteerde item als context. De bar toont onderaan altijd "↵ Vraag Claude: …" als vangnet, dus typen kan nooit "fout" zijn.
De bar toont maximaal 7 suggesties met de sneltoets erachter, zodat hij het leermiddel vóór de sneltoetsen is.
Sneltoetsen (nooit actief tijdens typen; ? toont dit overzicht):
Toets
Doet
Ctrl+K of /
Command bar
1 2 3 4 5
Naar Vandaag, Inbox, Acties, Werk, Agenda
↓ ↑ of j k
Volgende / vorige rij
Enter
Detail openen (mobiel), primaire actie als detail al open is
e
Afhandelen / afvinken, met feedbackbalk
r
Beantwoord / Reageer
a
Maak actie van dit item
c
Vraag Claude over dit item
o
Open in bronsysteem (nieuw tabblad)
n
Nieuwe actie
z
Ongedaan maken (laatste terugdraaibare handeling)
Esc
Sluit invulveld, paneel of command bar
Shift+R
Alles verversen
De bestaande toetsen (g+letter, ?) blijven werken voor wie ze al kent; de cijfers en losse letters worden het aangeleerde pad.
Nul-leercurve-toets: elke actieknop toont zijn sneltoets in de tooltip, en de command bar noemt hem bij elke suggestie. Iemand die alleen klikt, mist niets; iemand die typt, wordt vanzelf sneller.
## Stap 4. Bouwplan
Vertrekpunt. Repo 3oo3zL0L/Actions, branch claude/zealous-brahmagupta-fywd7j, één bestand src/index.html (±290 KB), Playwright-suite met 82 groene tests en een nagebootste window.claude (tests/mock-claude.js). De datamodellen (acties, voorstellen, gebruik) en de Claude-taakmodus blijven ongewijzigd; de ochtendrun blijft werken zonder aanpassing.
B0 splitst de code op zodat stappen parallel kunnen. Eén bestand verdraagt geen parallelle bewerking. B0 knipt de app in modules (index.html + app/*.js + styles.css), gepubliceerd als artifact met ondersteunende bestanden. Daarna raakt elke stap vooral zijn eigen module.
Stap
Inhoud
Testcriteria (Playwright tegen de mock, tenzij anders)
Na
Parallel-groep
B0
Code opsplitsen in modules, functioneel identiek
Alle 82 bestaande tests groen zonder wijziging
–
–
B1
Schil: drie zones, vijf ingangen met tellers, selectiemodel, feedbackbalk, voorkeuren-opslag, mobiele tabbalk
Navigeren met 1-5 en klik; selectie opent detail zonder lijstsprong; geen horizontale scroll op 375px; voorkeur overleeft herladen
B0
–
B2
Inbox: mail+Teams samengevoegd, VIP bovenaan, meldingen ingeklapt; maildetail met volledige inhoud; beantwoord/doorstuur inline; verzendbalk met 10s-annuleer; afhandelen+ongedaan
VIP-mail staat boven niet-VIP; annuleren binnen 10s verstuurt niets (geen send-call in mock-log); afhandelen zet categorie en is terug te draaien; volledige inhoud uit read_resource zichtbaar
B1
A
B3
Teams-kanalen lezen en antwoorden (chat-antwoord zit in B2)
Kanaalbericht tonen en beantwoorden roept de juiste tool met teamId/channelId
B2
A
B4
Agenda: vandaag+morgen, uitnodiging accepteren/afwijzen, "Plan een vergadering" op beschikbaarheid
Morgen zichtbaar; accepteren roept respond_to_event; planner toont vrije sloten uit de mock en maakt event met Teams-link
B1
B
B5
Acties en voorstellen in het nieuwe patroon (detailpaneel, e=afvinken, deadline zetten)
Bestaande fase2-gedragingen blijven; afvinken via toets e met feedbackbalk en z=ongedaan
B1
B
B6
Werk: Jira-detail (commentaren, geldige transities, toewijzen, nieuw issue vanuit mail/actie) en Confluence-leesweergave
Alleen transities uit getTransitions getoond; nieuw issue vult onderwerp voor; Confluence-tekst leesbaar zonder rauwe opmaakcodes
B1
C
B7
Command bar (Ctrl+K): navigeren, uitvoeren, vraag-vangnet; sneltoetsen j/k/e/r/a/c/o/n/z
Elke commandogroep testén; onbekende tekst gaat naar Claude met itemcontext; toetsen inactief tijdens typen
B1
C
B8
Claude-paneel in de detailkolom, contextkaart volgt selectie; taakmodus en vangrails ongewijzigd overnemen
Bestaande fase6/7-tests aangepast en groen; paneel bedekt niets (boundingBox)
B1
– (raakt alle modules licht)
B9
Licht thema, mobiel-polish, toegankelijkheid (contrast AA, aria, reduced motion)
Contrastcontrole beide thema's; tabbalk en detail-terugknop op 375px; axe-check zonder kritieke fouten
B2-B8
–
B10
Acceptatie: de twee-minuten-toets als gescripte test (mail afhandelen, actie aanmaken, Claude vragen, elk ≤ 3 klikken vanaf koud openen); testrapport; docs bijwerken; publicatie
Scenario slaagt; volledige suite 2× groen; PO-screenshotronde desktop+mobiel, licht+donker
B9
–
Parallelisatie. Na B1 draaien drie agents naast elkaar: groep A (B2→B3), groep B (B4, B5), groep C (B6, B7). B8 volgt zodra A klaar is; B9 en B10 sluiten af. Elke agent werkt in eigen modules en eigen specbestanden; de PO voegt samen, draait de hele suite en publiceert per afgeronde groep één tussenversie op dezelfde link, zodat Thomas mee kan kijken.
Definition of done per stap: volledige suite groen (niet alleen de eigen specs), geen consolefouten, foutstaten in mensentaal, sneltoets en tooltip aanwezig voor elke nieuwe actie, en de stap-specs testen gedrag (rollen en teksten), niet classnamen.
## Risico's en open vragen
Risico's:
- Mock versus werkelijkheid. De tests draaien tegen een nagebootste omgeving; echte connectorfouten zien we pas bij gebruik. Beperking: elke fout toont code en melding onder Details, en Thomas test na elke gepubliceerde tussenversie één echt scenario.
- De opsplitsing (B0) is de riskantste stap ondanks nul functionele wijziging. Daarom als enige stap met de eis: alle 82 tests groen zónder testwijziging.
- Grote overhaul, één gebruiker. Thomas' spiergeheugen van de huidige pagina verdwijnt. Beperking: tussenversies per groep, en de oude versie blijft als artifact-versie terug te zetten.
- Teams-kanalen kunnen traag zijn (per team en kanaal een aanroep). Beperking: alleen kanalen laden die Thomas aanwijst als gevolgd.
Open vragen voor Thomas (akkoord op het plan mag ook zonder antwoorden; dan kiest de PO de aanbeveling):
- Inbox: mail en Teams in één lijst? Aanbevolen: ja, met bronicoon en filterknoppen Mail/Teams. Alternatief: twee tabs zoals nu.
- VIP-lijst: wie zijn je directe collega's en leidinggevende? Een lijst namen is genoeg; aanvullen kan later in de app zelf.
- Verzenduitstel van 10 seconden bij mail: goed, of liever direct weg?
- De Claude-balk en snelknoppen bovenaan vervallen ten gunste van Ctrl+K en de c-toets: akkoord?
- Confluence als leesweergave met één klik naar de echte pagina: genoeg, of is lezen in de app dan niet nodig?
Wat na akkoord gebeurt: de PO start B0 en B1, publiceert de eerste tussenversie op dezelfde link, en meldt per afgeronde parallel-groep wat er te proberen is. Dit document blijft het referentiepunt; afwijkingen tijdens de bouw komen er als aantekening in.
