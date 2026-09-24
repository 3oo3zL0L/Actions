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
- **Klaar is weg**: afgevinkt blijft vandaag zichtbaar, daarna is hij van je lijst verdwenen.
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
`POST /proposals/:id/acceptance`. Achtergrondwerk (indelen, splitsen, herschrijven) loopt mee in het serverproces.

## Opstarten

Eenmalig: installeer Ruby 3.3.6 met je Ruby-installer (rbenv, mise of asdf), dan:

```sh
bin/setup          # gems en database, start daarna meteen de app
```

Daarna elke dag:

```sh
bin/dev            # open http://localhost:3000
```

Het eerste bezoek maakt je account aan. In Chrome of Edge kun je hem via het installeer-icoon in de
adresbalk als losse app in je Dock of taakbalk zetten.

**Slimme functies aan**: start met je sleutel erbij, of zet hem in je shellprofiel.

```sh
ANTHROPIC_API_KEY=sk-ant-... bin/dev
```

Model: `claude-opus-5`, te wijzigen met `ASSISTANT_MODEL`.

**Je gegevens** staan in `storage/development.sqlite3`. Kopieer dat bestand als back-up. Draai nooit
`bin/setup --reset` of `bin/rails db:reset`: dat wist je lijst.

**Tests**: `bin/ci` draait alles wat het team ook draait.

## Overzetten vanuit Cowork

Ga naar **Importeren** onderaan de pagina en plak de inhoud van `/areas/todos.md`. Kopjes worden
programma's, `- [ ] actie | wie | deadline` wordt een actie.

## Koppeling met de Cowork-ochtendrun

Maak een token aan in de console (`bin/rails runner 'puts User.first.api_token'`) en geef de run:

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
computer draaien, terwijl `bin/dev` aanstaat.
