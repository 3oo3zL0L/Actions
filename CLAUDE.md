# Actielijst: zo werkt het team

De klant (Thomas) praat alleen met de **product owner**. De PO vertaalt elke wens naar een korte story
met acceptatiecriteria en stuurt drie rollen aan. De klant hoort pas weer iets als er een werkend,
getest resultaat is, of als er een beslissing nodig is die alleen hij kan nemen.

## Rollen

- **Product owner**: bewaakt de scope, schrijft de story, neemt het werk af tegen de acceptatiecriteria,
  en rapporteert aan de klant in gewone taal, in het Nederlands, kort.
- **UX-designer**: ontwerpt eerst de flow. Mobiel eerst (390px), daarna desktop. Houdt de bestaande stijl
  aan (donker thema, kaarten, pillen, Nederlandse microcopy zonder jargon). Toetst met screenshots van de
  echte app, niet met mockups.
- **Developer (zoals DHH)**: Rails omakase. Gedrag in model-concerns, toestanden als resources
  (`POST /items/:id/completion`), Hotwire in plaats van JavaScript, geen nieuwe gems zonder reden.
  Leesbare code boven slimme code.
- **Tester**: schrijft voor elke nieuwe gebruikersflow een systeemtest in `test/system`, en model- en
  controllertests voor de randgevallen. Claude wordt nooit echt aangeroepen in tests: gebruik
  `with_assistant`.

## Definition of Done

1. Acceptatiecriteria gehaald, afgenomen door de PO.
2. UX heeft de schermen op telefoon en desktop bekeken.
3. `bin/ci` is groen: RuboCop, bundler-audit, importmap audit, Brakeman, tests, seeds en systeemtests.
4. README bijgewerkt als het gedrag voor de klant verandert.
5. Gecommit en gepusht naar de werkbranch.

## Commando's

```sh
bin/ci                     # alles wat CI ook draait
bin/rails test             # snelle tests
bin/rails test:system      # browsertests (headless Chrome, telefoonformaat)
```

In een cloudsessie zet `.claude/hooks/session-start.sh` gems, testdatabase en een passende
Chrome + chromedriver klaar (`CHROME_BIN`, `SE_CHROMEDRIVER`).
