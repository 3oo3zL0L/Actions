# Overdracht: waar staan we

Lees dit als je (Claude, als PO) in een nieuwe sessie verdergaat met de Actiepagina.

## Rollen
- **Klant**: Thomas. Praat alleen met de PO.
- **PO (orkestratie)**: jij. Briefs, prioriteit, acceptatie, publicatie, commits.
- **Team (subagents)**: Senior UX, Senior DEV, Senior TST, Analist. Elk krijgt een gerichte opdracht met verwijzing naar de docs hieronder.

## Links
- App (artifact): https://claude.ai/artifact/PqANDMJuGom3jRqvm8k7zv, bron `src/index.html`. Publiceren met
  `Artifact` + `url` van deze app (anders ontstaat een nieuwe). Capabilities: mcp (Microsoft 365, Atlassian Rovo), sample, db.
- Verbeterpunten-document: https://claude.ai/code/artifact/e119fb53-6e4d-44c4-b628-513c70e9488a
- Oude PAF actielijst (archief): https://claude.ai/artifact/Ar6sRYzLNFu5dzdLw1Y4gw
- Repo-branch: `claude/zealous-brahmagupta-fywd7j`

## Documenten
| Bestand | Inhoud |
|---|---|
| `docs/BRIEF.md` | productbrief, besluiten klant, datamodel `acties` |
| `docs/UX.md` | ontwerpspec |
| `docs/TESTPLAN.md`, `docs/TESTRAPPORT.md` | testaanpak en bevindingen |
| `docs/OCHTENDRUN.md` | prompt voor de Cowork-ochtendrun (schrijft `voorstellen`) |
| `docs/ANALIST.md` | rol en rapport van de analist |
| `docs/contract/*.d.ts` | runtime-contracten van `window.claude` |

## Database van de app
`acties` (hoofdlijst), `voorstellen` (ochtendrun en scan), `gebruik/<datum>` (gebruikslog). `feedback` is niet meer in gebruik.

## Lessen
- Microsoft 365-zoektools accepteren `limit` maximaal 25. De mock dwingt dit af.
- M365 geeft één contentblok per item; `read_resource` geeft één JSON-blok met `body.content` (HTML).
- Schrijfacties alleen na klik op Uitvoeren. Mail nooit versturen, alleen concept.

## Bij een nieuwe sessie
1. Lees dit bestand en `git log --oneline | head`.
2. Feedback komt via het verbeterpunten-document. Verwerk het, bewaar de afgehandelde punten in
   `docs/verbeterpunten/<datum>.md` en maak de tabel daarna leeg voor een nieuwe ronde.
3. Controleer de wekelijkse analist-routine (list_triggers) en laat hem naar de nieuwe sessie wijzen.
