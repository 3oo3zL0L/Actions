# Actiepagina

Eén pagina om de werkdag vanuit te doen: agenda, Outlook-mail, Teams, Jira, Confluence, je acties en
Claude als collega, samen op één scherm. Draait als claude.ai-Artifact en leest je gegevens via je eigen
claude.ai-connectors (Microsoft 365, Atlassian Rovo). Er staan geen tokens of gegevens in de code.

| Map | Inhoud |
|---|---|
| `src/index.html` | de app, één bestand, geen build-stap |
| `docs/BRIEF.md` | productbrief (PO) |
| `docs/UX.md` | ontwerpspecificatie (UX) |
| `docs/TESTPLAN.md`, `docs/TESTRAPPORT.md` | testaanpak en resultaten (TST) |
| `docs/contract/` | type-definities van de artifact-runtime (`window.claude`) |
| `tests/` | Playwright-tests met een nagebootste `window.claude` |

## Testen

```sh
npm install
npm test
```

## Publiceren

De pagina wordt als Artifact gepubliceerd met de capabilities uit `docs/BRIEF.md` (`mcp`, `sample`, `db`).
Schrijfacties (mailconcept, Teams-bericht, Jira-commentaar) gebeuren altijd pas na jouw klik op **Uitvoeren**;
mail wordt nooit verstuurd, alleen als concept in Outlook gezet.
