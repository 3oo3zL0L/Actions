# Checklist voor Thomas: schrijfacties in het echt

Dit zijn de schrijfacties die de bouwsessie niet zelf kon testen (blokkeerde, of onveilig zonder overleg met
collega's of IT). Alles is wel tegen de mock getest, zie `docs/TESTRAPPORT.md`. Loop deze lijst één keer door
na het publiceren van deze versie. Elke regel: doe X, controleer Y.

## Agenda
- Accepteer een uitnodiging met een bericht erbij → verwacht: bericht komt aan bij de organisator, afspraak
  staat op Geaccepteerd in Outlook.
- Wijs een uitnodiging af, klik daarna op "Toch accepteren" in de feedbackbalk → verwacht: afspraak staat
  weer op Geaccepteerd, geen dubbele mail naar de organisator.
- Plan een vergadering van 30 minuten met een collega → verwacht: afspraak in Outlook met Teams-link erin,
  en de collega krijgt de uitnodiging in zijn agenda.

## Jira
- Reageer op een issue via de knop Reageer → verwacht: commentaar staat onder het issue in Jira, zichtbaar
  voor je collega's.
- Vraag Claude om te reageren op hetzelfde issue → verwacht: commentaar staat in Jira, in dezelfde
  schrijfstijl (geen KR/Thomas, geen opvulling).
- Zet de status van een issue op een andere waarde → verwacht: nieuwe status klopt in Jira, alleen de
  statussen die daar ook echt geldig zijn stonden ter keuze.
- Wijs een issue toe aan jezelf → verwacht: jij staat als assignee in Jira.
- Maak een nieuw Jira-issue vanuit een mail → verwacht: issue bestaat in het juiste project, onderwerp en
  samenvatting kloppen met de mail.

## Confluence
- Open een Confluence-pagina in de app → verwacht: leesbare tekst, geen rare tekens of kapotte tabellen; een
  klik op de link opent de echte pagina in Confluence.
- Vraag Claude om een Confluence-pagina bij te werken → verwacht: wijziging staat op de echte pagina in
  Confluence, zichtbaar voor collega's.

## Mail
- Beantwoord een mail, wacht de 10 seconden uit → verwacht: mail staat verzonden in Outlook.
- Beantwoord een mail en klik binnen 10 seconden op Annuleer → verwacht: er is niets verstuurd, geen concept
  en geen mail in Outlook.
- Stuur een mail door → verwacht: mail komt aan bij de ontvanger, met je eigen regel erboven.
- Handel een mail af, klik daarna Ongedaan maken → verwacht: mail staat weer in de Inbox, en de categorie
  Afgehandeld staat niet meer op het bericht in Outlook.

## Teams
- Beantwoord een Teams-bericht (chat of kanaal) → verwacht: knop heet "Kopieer naar Teams", tekst staat op
  je klembord, Teams opent met het juiste bericht; plak en verstuur daar. Dit blijft zo tot IT toestemming
  geeft (zie hieronder).

## Wat te doen bij een fout
Elke foutmelding heeft onderaan "Details" staan. Klik daarop: je ziet een code en een korte tekst. Stuur die
regel (code + tekst) naar de PO als het probleem blijft; zonder die regel is een fout niet te herleiden.

## Toestemming vragen aan IT voor Teams versturen

Concept, in jouw stijl, klaar om te versturen naar IT:

> Hi <naam>,
>
> Kun je vier Entra-rechten toevoegen aan de Actiepagina-koppeling (Microsoft 365, gedelegeerd):
> ChatMessage.Send, ChannelMessage.Send, People.Read, Team.ReadBasic.All.
>
> Zonder deze rechten kan de app geen Teams-bericht rechtstreeks versturen, geen collega's opzoeken en geen
> volledige teamlijst tonen. Ik werk nu met een omweg (tekst kopiëren en zelf in Teams plakken), dat werkt
> maar kost een paar klikken extra bij elk bericht.
>
> Laat het weten als er iets van jullie kant voor nodig is, dan lever ik dat aan.
>
> KR
> Thomas
