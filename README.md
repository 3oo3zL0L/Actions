# Actielijst

De PAF-actielijst uit Cowork, als echte app op je eigen computer, alleen voor jou. Gebouwd zoals DHH
het zou doen: Rails 8.1 omakase, één SQLite-bestand, Hotwire in plaats van een JavaScript-framework,
geen build-stap. Niets gaat het internet op, behalve de tekst van een actie naar Claude als je een
API-sleutel hebt ingesteld.

## Wat hij doet

- **Klad**: typ een actie, Enter en hij staat erop. Meerdere regels worden meerdere acties.
- **Inspreken**: de microfoonknop luistert in het Nederlands (Chrome, Safari) of wijst de dicteerknop
  van je toetsenbord aan. Claude splitst het dictaat in losse acties en deelt ze in.
- **Vandaag**: Prioritiseer zet een actie bovenaan, met de reden erbij.
- **Uit je mail**: voorstellen van de Cowork-ochtendrun. Op de lijst of weg, met ongedaan maken.
- **Herschrijven in gewone taal**: tik op een actie en typ "deadline naar 1 okt en Santhosh erbij".
- **Klaar is weg**: afgevinkt blijft vandaag zichtbaar, na twee weken ruimt een nachtelijke job het op.
- **Live**: open in twee tabbladen, en een wijziging in het ene ververst het andere mee.

Zonder `ANTHROPIC_API_KEY` werkt alles gewoon, alleen komt nieuw werk dan onder Overig.

## Hoe hij in elkaar zit

| | |
|---|---|
| `Item` | een actie, met gedrag in concerns: `Closeable`, `Prioritizable`, `Classifiable`, `Rewritable`, `Transcribable` |
| `Program` | de kopjes: UI/UX, Platform Core, CI Acceleration, OIDC, Object Store, Jakarta migratie, Platform Stability, Contracten, Overig |
| `Proposal` | een voorstel uit de mail, `Decidable` |
| `Capture` | wat je in het klad typt of inspreekt, zodat ruwe tekst nooit verloren gaat |
| `Assistant` | Claude (Messages API, structured outputs) voor indelen, splitsen en herschrijven |

Toestanden zijn resources, geen custom acties: `POST /items/:id/completion`, `DELETE /items/:id/priority`,
`POST /proposals/:id/acceptance`. Achtergrondwerk (indelen, splitsen, herschrijven, opruimen) loopt via Solid Queue in Puma.

## Installeren (eenmalig)

Je hebt geen Ruby nodig, alleen een programma dat containers draait:

1. Installeer [Docker Desktop](https://www.docker.com/products/docker-desktop/) en zet in de
   instellingen "Start Docker Desktop when you sign in" aan. Is Docker Desktop niet toegestaan op je
   werkcomputer, dan werkt [Rancher Desktop](https://rancherdesktop.io) (gratis) precies zo.
2. Download deze repository (groene knop **Code** → **Download ZIP**) en pak hem uit.
3. Wil je de slimme functies? Maak in die map een bestand `.env` met daarin
   `ANTHROPIC_API_KEY=sk-ant-...`
4. Open een terminal in die map en start hem:

```sh
docker compose up -d
```

De eerste keer duurt dat een paar minuten. Open daarna **http://localhost:3000**. Het eerste bezoek
maakt je account aan.

## Gebruiken

Gewoon http://localhost:3000 in je browser. De app start vanzelf mee met Docker Desktop, dus na een
herstart van je computer staat hij er weer. In Chrome of Edge kun je hem via het installeer-icoon in de
adresbalk als losse app in je Dock of taakbalk zetten. Alleen jouw computer kan erbij.

| Wat | Commando, in de map van de app |
|---|---|
| Stoppen | `docker compose stop` |
| Weer starten | `docker compose start` |
| Nieuwe versie | nieuwe ZIP uitpakken over de oude, dan `docker compose up -d --build` |
| Back-up maken | `docker compose exec actielijst sqlite3 storage/production.sqlite3 ".backup storage/backup.sqlite3"` en dan `docker compose cp actielijst:/rails/storage/backup.sqlite3 ./actielijst-backup.sqlite3` |

Je lijst staat in een Docker-volume, niet in de map. Een nieuwe versie of een herstart laat hem staan.
Alleen `docker compose down -v` wist hem: gebruik die nooit.

## Voor ontwikkelaars

Met Ruby 3.3.6: `bin/setup` en dan `bin/dev` (http://localhost:3000, eigen database in `storage/`).
`bin/ci` draait alles wat CI ook draait, inclusief de browsertests.

## Overzetten vanuit Cowork

Ga naar **Importeren** onderaan de pagina en plak de inhoud van `/areas/todos.md`. Kopjes worden
programma's, `- [ ] actie | wie | deadline` wordt een actie.

## Koppeling met de Cowork-ochtendrun

Vraag je token op (`docker compose exec actielijst bin/rails runner 'puts User.first.api_token'`) en geef de run:

```sh
# De lijst lezen, in hetzelfde formaat als todos.md
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/items.md

# Een voorstel uit de mail neerzetten
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"proposal":{"text":"Status teruggeven op contract","sender":"Sophie","program_name":"Contracten","mail_url":"https://outlook.office365.com/..."}}' \
  http://localhost:3000/proposals.json

# Een actie toevoegen
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"capture":{"body":"Rogier bellen"}}' http://localhost:3000/captures.json
```

Het token opent alleen deze JSON- en markdown-endpoints, nooit de app zelf. De run moet op dezelfde
computer draaien, terwijl de app aanstaat.
