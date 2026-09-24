# Werkplek

Eén plek om je werk vanuit te doen: agenda, mail en Teams van vandaag, epics, Confluence-pagina's,
decks en Claude-projecten per programma, en de actielijst ernaast. Van alles wat binnenkomt maak je
met **+ Actie** een actie, met de link terug naar de bron.

## Bronnen

| Bron | Wat | Hoe |
|---|---|---|
| Outlook-mail | ongelezen of gemarkeerd, afgelopen week | Microsoft Graph, `Mail.Read` |
| Outlook-agenda | vandaag tot en met volgende week, met Teams-link | `Calendars.Read` |
| Teams | chats met het laatste bericht, afgelopen week | `Chat.Read` |
| OneDrive/SharePoint | recente PowerPoints | Microsoft Search, `Files.Read.All` |
| Jira | alleen epics, niet afgerond (`JIRA_EPIC_JQL`) | Atlassian OAuth 2.0, `read:jira-work` |
| Confluence | pagina's waar je aan werkt of die je volgt (`CONFLUENCE_CQL`) | `search:confluence` |
| Claude | per programma een link naar het project; met Enterprise ook automatisch | Compliance API |

Alles is alleen-lezen. Elke tien minuten haalt Solid Queue alles opnieuw op (`Source.sync_all_later`);
wat er niet meer bij zit (gelezen mail, afgesloten epic) verdwijnt. Wat binnenkomt landt bij het programma
waarvan de naam of een trefwoord erin staat: geef elk programma trefwoorden via **Programma's → Aanpassen**,
zoals Jira-sleutels (`PLAT`), systeemnamen en mensen.

claude.ai heeft geen API voor je eigen projecten. Alleen de Compliance API van Claude Enterprise kan ze
opsommen (met een beheerderssleutel). Zonder zo'n sleutel zet je per programma de link naar het project.

### Koppelen

**Microsoft 365**: registreer een app in Entra ID (Web, redirect `https://<host>/sources/microsoft/authorization`),
maak een client secret aan en zet `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` en `MICROSOFT_TENANT_ID`.
Staat je tenant geen gebruikerstoestemming toe, dan moet een beheerder de rechten één keer goedkeuren.

**Atlassian**: maak een OAuth 2.0 (3LO)-app op developer.atlassian.com, geef Jira- en Confluence-scopes
(zie `Source::Atlassian.scopes`), callback `https://<host>/sources/atlassian/authorization`, en zet
`ATLASSIAN_CLIENT_ID` en `ATLASSIAN_CLIENT_SECRET`. Meerdere sites? Kies er één met `ATLASSIAN_SITE`.

Druk daarna op **Koppelingen** op Koppelen. Tokens staan versleuteld in de database (Active Record Encryption).
Alles mag ook in `bin/rails credentials:edit`, onder `microsoft:` en `atlassian:`.

## Actielijst

De PAF-actielijst uit Cowork, als echte app. Gebouwd zoals DHH het zou doen: Rails 8.1 omakase,
één SQLite-database, Hotwire in plaats van een JavaScript-framework, geen build-stap, en met Kamal
op je eigen server. Installeer hem als app op je telefoon via "Zet op beginscherm".

## Wat hij doet

- **Klad**: typ een actie, Enter en hij staat erop. Meerdere regels worden meerdere acties.
- **Inspreken**: de microfoonknop luistert in het Nederlands (Chrome, Safari) of wijst de dicteerknop
  van je toetsenbord aan. Claude splitst het dictaat in losse acties en deelt ze in.
- **Vandaag**: Prioritiseer zet een actie bovenaan, met de reden erbij.
- **Uit je mail**: voorstellen van de Cowork-ochtendrun. Op de lijst of weg, met ongedaan maken.
- **Herschrijven in gewone taal**: tik op een actie en typ "deadline naar 1 okt en Santhosh erbij".
- **Klaar is weg**: afgevinkt blijft vandaag zichtbaar, na twee weken ruimt een nachtelijke job het op.
- **Live**: verandert er iets op je laptop, dan ververst je telefoon mee (Turbo morphing via Solid Cable).

Zonder `ANTHROPIC_API_KEY` werkt alles gewoon, alleen komt nieuw werk dan onder Overig.

## Hoe hij in elkaar zit

| | |
|---|---|
| `Item` | een actie, met gedrag in concerns: `Closeable`, `Prioritizable`, `Classifiable`, `Rewritable`, `Transcribable` |
| `Program` | de kopjes: UI/UX, Platform Core, CI Acceleration, OIDC, Object Store, Jakarta migratie, Platform Stability, Contracten, Overig |
| `Proposal` | een voorstel uit de mail, `Decidable` |
| `Capture` | wat je in het klad typt of inspreekt, zodat ruwe tekst nooit verloren gaat |
| `Assistant` | Claude (Messages API, structured outputs) voor indelen, splitsen en herschrijven |
| `Source` | een koppeling (`Microsoft`, `Atlassian`, `Claude`), met `Authorizable`, `Requestable`, `Syncable` |
| `Entry` | wat een bron teruggeeft: afspraak, mail, chat, deck, pagina, epic, project; `Actionable` |

Toestanden zijn resources, geen custom acties: `POST /items/:id/completion`, `DELETE /items/:id/priority`,
`POST /proposals/:id/acceptance`. Achtergrondwerk loopt via Solid Queue in Puma.

## Lokaal draaien

```sh
bin/setup          # gems, database, programma's
bin/dev            # http://localhost:3000, eerste bezoek maakt je account aan
bin/rails test     # Minitest met fixtures
```

Zet `ANTHROPIC_API_KEY` in je omgeving (of in `bin/rails credentials:edit` onder `anthropic.api_key`)
voor de slimme functies. Model: `claude-opus-5`, te wijzigen met `ASSISTANT_MODEL`.

## Overzetten vanuit Cowork

Ga naar **Importeren** onderaan de pagina en plak de inhoud van `/areas/todos.md`. Kopjes worden
programma's, `- [ ] actie | wie | deadline` wordt een actie.

## Koppeling met de Cowork-ochtendrun

Maak een token aan in de console (`bin/rails runner 'puts User.first.api_token'`) en geef de run:

```sh
# De lijst lezen, in hetzelfde formaat als todos.md
curl -H "Authorization: Bearer $TOKEN" https://actielijst.example.com/items.md

# Een voorstel uit de mail neerzetten
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"proposal":{"text":"Status teruggeven op contract","sender":"Sophie","program_name":"Contracten","mail_url":"https://outlook.office365.com/..."}}' \
  https://actielijst.example.com/proposals.json

# Een actie toevoegen
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"capture":{"body":"Rogier bellen"}}' https://actielijst.example.com/captures.json
```

Het token opent alleen deze JSON- en markdown-endpoints, nooit de app zelf.

## Deployen

Vul in `config/deploy.yml` het IP-adres van een server en je hostnaam in, dan:

```sh
bin/kamal setup    # eerste keer
bin/kamal deploy   # daarna
```
