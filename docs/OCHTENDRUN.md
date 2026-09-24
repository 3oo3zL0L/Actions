# Ochtendrun in Cowork → Actiepagina

Vanaf fase 2 schrijft de ochtendrun niet meer naar de PAF actielijst, maar naar de database van de
Actiepagina (https://claude.ai/artifact/PqANDMJuGom3jRqvm8k7zv). De pagina toont nieuwe voorstellen
live onder **Acties → Uit je mail**, zonder dat de pagina opnieuw gepubliceerd hoeft te worden.

## Wat je in Cowork aanpast
Vervang in de geplande ochtendtaak het deel dat de PAF-pagina republiceert door onderstaande prompt.

```text
Actiepagina-ochtendrun (werkdagen).

1. Lees mijn mail van de afgelopen 24 uur (Microsoft 365). Negeer no-reply, notificaties en nieuwsbrieven.
2. Bepaal per mail of er iets van mij (Thomas) verwacht wordt: een beslissing, akkoord, antwoord of taak.
3. Lees de bestaande database van de Actiepagina (artifact https://claude.ai/artifact/PqANDMJuGom3jRqvm8k7zv):
   collecties "acties" en "voorstellen". Sla voorstellen over die al bestaan (zelfde mail-url) of al als actie
   op de lijst staan.
4. Schrijf elk nieuw voorstel als document in collectie "voorstellen" (doc-id: "v-" + datum + "-" + volgnummer,
   bv. "v-20260925-1") met velden:
   text      korte gebiedende actie, geen datum of naam erin, geen punt aan het eind
   van       naam afzender
   onderwerp onderwerp van de mail
   prog      precies een van: UI/UX, Platform Core, CI Acceleration, OIDC, Object Store, Jakarta migratie,
             Platform Stability, Contracten, Overig
   mail      de webLink van de mail (https)
   why       optioneel, één korte zin waarom dit bij mij ligt
   status    "nieuw"
   run       datum van vandaag, bv. "25 sep 2026"
   createdAt ISO-tijdstip
5. Zet in collectie "acties" op maximaal drie open acties "vandaag": true met een "why" die verwijst naar
   vandaag's agenda (bv. "Je zit om 14:00 met Paul"). Haal "vandaag" weg bij acties die gisteren door de run
   (niet door mij) op vandaag zijn gezet en nog open staan, tenzij ze nog steeds urgent zijn.
6. Raak acties met status "done" of "dropped" niet aan. Verwijder niets.
7. Toon: direct, zakelijk, Nederlands, geen em-dashes.
```

## Velden in `acties` (ter referentie)
`text, who ("eigen actie" | naam | "prive"), due (kort, "1 okt"), dueIso (optioneel, JJJJ-MM-DD), prog, extra,
why, status ("open"|"done"|"dropped"), vandaag, bron ("klad"|"mail"|"teams"|"jira"|"cowork"|"paf"), bronUrl,
van, onderwerp, createdAt, updatedAt`.

## Migratie (gedaan op 24 sep 2026)
De PAF actielijst is geïmporteerd: 7 acties (5 open, 2 afgerond), doc-id's `paf-<oud id>`. Besliste
voorstellen uit de PAF-lijst zijn niet overgenomen. De PAF actielijst blijft bestaan als archief.
