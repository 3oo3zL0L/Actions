# Actiepagina: UX-specificatie

Voor: Senior DEV (`src/index.html`) en TST. Bron: `docs/BRIEF.md`, contracten `docs/contract/*.d.ts`.
Regel: alles hieronder is bindend tenzij het botst met een contract; dan wint het contract.

## 1. Informatie-architectuur en prioriteit

Vraag die de pagina in 3 seconden beantwoordt: **"Wat is nu, wat is straks, wat wacht op mij?"**

Leesvolgorde (boven naar beneden, links naar rechts):
1. **Header**: begroeting + datum + globale ververs + thema-toggle.
2. **Nu-strip** (in de header, direct onder de begroeting): één regel, altijd zichtbaar.
   `Nu: Standup Platform Core tot 09:15 · Straks 10:00 Review OIDC (over 42 min) · 4 ongelezen · 2 acties vandaag`
   Elk deel is een link naar de betreffende sectie. Geen data: `Geen afspraken meer vandaag`.
3. **Claude-balk**: invoerveld + 3 snelknoppen. Opent het chatpaneel bij verzenden.
4. **Vandaag** (agenda-tijdlijn): prioriteit 1, altijd eerste kolom/sectie.
5. **Inbox** (tabs Mail / Teams).
6. **Acties** + PAF-link.
7. **Werk** (tabs Jira / Confluence).

Principes:
- Tijd-gevoelig boven werk-gevoelig. Agenda en inbox zijn "boven de vouw" op desktop.
- Elke sectie laadt los; de nu-strip vult zich stuk voor stuk (deel dat nog laadt = grijze placeholder-chip).
- Tellers in tab-labels (`Mail 4`, `Teams 7`, `Jira 12`) zodat Thomas niet hoeft te klikken om volume te zien.
- Versheid per sectie rechts in de sectiekop: `bijgewerkt 10:42`.

## 2. Layout

Gutter 16px mobiel, 24px tablet/desktop. Max-breedte inhoud 1440px, gecentreerd. Nooit horizontale scroll;
lange onderwerpen afkappen met ellipsis op 1 regel (desktop) of 2 regels (mobiel, `-webkit-line-clamp`).

### Desktop (≥1100px)
CSS grid, 3 kolommen `minmax(300px,1fr) minmax(360px,1.3fr) minmax(300px,1fr)`, gap `--sp-5`.
```
grid-template-areas:
  "header header header"
  "claude claude claude"
  "today  inbox  actions"
  "today  inbox  work";
```
- `today` spant twee rijen (tijdlijn is lang). `inbox` idem.
- **Chatpaneel** = zijpaneel rechts, 420px breed, `position: fixed`, schuift over de inhoud (geen herlayout).
  Grid krijgt `padding-right: 420px` alleen als het paneel **vastgezet** is (knop "Vastzetten"). Default: overlay
  zonder scrim, sluit met Esc of X. Hoogte 100vh, eigen scroll.

### Tablet (561–1099px)
2 kolommen `1fr 1fr`.
```
grid-template-areas:
  "header  header"
  "claude  claude"
  "today   inbox"
  "actions work";
```
- Chatpaneel = zijpaneel rechts, `min(420px, 90vw)`, altijd overlay met scrim (`--scrim`), focus-trap.

### Mobiel (≤560px)
1 kolom, volgorde: `header, claude, today, inbox, actions, work`.
- Header compact: begroeting 1 regel, datum klein, nu-strip wordt 2 regels max.
- Claude-balk: invoer volle breedte; snelknoppen horizontaal als chips die **wrappen** (niet scrollen).
- Secties inklapbaar (`<details>`-achtig, kop is knop); Vandaag en Inbox standaard open, Werk dicht.
- **Chatpaneel = onderlade** (bottom sheet), 100vw, 88dvh, afgeronde bovenhoeken, greep-balk bovenaan,
  sluitknop 44px. Invoer onderaan het paneel, `padding-bottom: env(safe-area-inset-bottom)`.
- Zwevende knop "Vraag Claude" (FAB, 56px) rechtsonder zodra de Claude-balk uit beeld is gescrold.

## 3. Componenten en staten

### 3.1 Sectie-kaart (generiek)
Kop: titel (h2) · teller · `bijgewerkt 10:42` · ververs-knop (icoon, `aria-label="Ververs {sectie}"`).
Tabs (indien aanwezig) direct onder kop, `role="tablist"`, pijltjestoetsen wisselen.

| Staat | Weergave |
|---|---|
| Laden | 3 skeleton-rijen (grijze balken 60%/40% breed, 2 regels), `aria-busy="true"`. Shimmer alleen zonder reduced motion. Bij verversen met bestaande data: data blijft staan, ververs-icoon draait, geen skeleton. |
| Succes | Lijst item-rijen. Max 8 zichtbaar, daaronder `Toon alle (n)`. |
| Leeg | Eén regel grijze tekst + eventueel 1 knop. Geen illustraties. |
| Fout | Inline blok in de kaart (niet toast): icoon ⚠, 1 zin oorzaak, 1 zin wat te doen, knop indien zinvol. Oude data blijft zichtbaar eronder met label `Niet actueel`. |
| Niet beschikbaar | `mcp === null`: kaart toont alleen het niet-beschikbaar-blok, geen skeleton. |

**Foutmapping** (branch op `code`, nooit op tekst; `{bron}` = "Microsoft 365" of "Atlassian"):

| Codes | Categorie | Tekst | Knop |
|---|---|---|---|
| `server_not_connected`, `server_not_found`, `selection_required` | Niet gekoppeld | `{bron} is niet gekoppeld. Koppel het in claude.ai via Instellingen > Connectors.` (bij selection_required: `Kies welke {bron}-koppeling je wilt gebruiken in claude.ai.`) | geen |
| `needs_reauth` | Niet gekoppeld | `Je koppeling met {bron} is verlopen. Koppel opnieuw in claude.ai via Instellingen > Connectors.` | `Opnieuw proberen` |
| `not_in_manifest`, `blocked_by_policy`, `approval_required`, `consent_required` | Geen toestemming | `Deze pagina heeft geen toestemming voor {bron}.` + bij policy: `Je organisatie blokkeert dit.` | alleen bij `consent_required`: `Toestemming vragen` |
| `server_unavailable`, `rate_limited`, retryable `upstream_error` | Tijdelijk | `{bron} reageert nu niet. We proberen het zo opnieuw.` Na 1 automatische retry: `Lukt nog steeds niet.` | `Opnieuw proberen` |
| `tool_error`, `upstream_error`, `bad_request`, `transform_error`, onbekend | Onbekend | `Ophalen mislukt. Probeer het opnieuw of open {bron} direct.` + link naar Outlook/Jira | `Opnieuw proberen` |
| `not_granted`, `capability_disabled`, `capability_removed` | Niet beschikbaar | zie hieronder | geen |
| `user_changed` | | niets renderen, geen calls meer | |

Automatisch opnieuw proberen alleen bij `retryable: true`, alleen reads, max 1x, na `retryAfterMs` of 1–3 s random.
Toon de ruwe code klein in `--text-3` achter `Details` (`<details>`), voor support.

**Niet beschikbaar** (capability `null`): `Geen koppelingen in deze weergave. Open de pagina in claude.ai en koppel Microsoft 365 en Atlassian.`
Acties (`db`) en Claude (`sample`) hebben een eigen null-staat, zie 3.5 en 3.6.

### 3.2 Item-rijen
Alle rijen: min-hoogte 56px (mobiel) / 48px (desktop), hele rij klikbaar = primaire actie (open bron in nieuw
tab, `rel="noopener"`). Secundaire acties als tekst-knoppen rechts; op mobiel achter een `⋯`-knop (menu).
Hover: `--surface-2`. Ongelezen/nieuw: 3px accentbalk links + vette titel.

| Rij | Regel 1 | Regel 2 | Rechts / acties |
|---|---|---|---|
| **Afspraak** | `09:30–10:00` (tabular-nums) · onderwerp | locatie of `Teams` · organisator | `Bereid voor`, `Open`. Status-badge `Nu` (accent-vulling) of `Volgende` (outline). Voorbij: `--text-3`, doorgestreept niet. Geannuleerd: label `Geannuleerd`, gedempt. Hele dag: bovenaan in strook `Hele dag`. |
| **Mail** | afzender (naam uit adres) · tijd (`11:11`, of `gisteren`, `ma 22 sep`) | onderwerp, dan samenvatting in `--text-2` | 📎 als bijlage, `!` bij hoge importance. Acties: `Antwoord-concept`, `Maak actie`, `Open in Outlook`. |
| **Teams-bericht** | afzender · tijd | berichttekst (2 regels) | chatnaam/topic als kleine tag. Acties: `Antwoord`, `Maak actie`, `Open in Teams`. |
| **Jira-issue** | `ABC-123` (mono, `--text-2`) · summary | projectnaam · assignee · `bijgewerkt 13:23` | status-pill (kleur uit statusCategory: `new`=neutraal, `indeterminate`=info, `done`=succes), prioriteit-icoon. Actie: `Commentaar`, `Maak actie`. |
| **Confluence-pagina** | titel | space-naam · `lastModified` letterlijk | Actie: `Open`. |
| **Actie** | checkbox (44px hitbox) · tekst | `wie` · deadline · programma-tag · bron-icoon (link) | deadline vandaag = `--warn`, verlopen = `--danger` + tekst `verlopen`. Klaar: doorgestreept + `--text-3`, onderaan gegroepeerd `Klaar (n)`. Verwijderen via `⋯`. |

Tijdlijn Vandaag: verticale lijn links, rij per afspraak; een horizontale "nu"-lijn (accent, 2px) met label
`nu 09:47` tussen de juiste rijen. Tijd ververst elke minuut (geen netwerk).

### 3.3 Bevestigkaart (schrijfactie voorgesteld door Claude)
Verschijnt in de chatstroom (en bij Antwoord-concept inline onder de mail-rij). Nooit zonder klik uitgevoerd.
```
┌ Concept-antwoord in Outlook ─────────────────┐
│ Aan: Jan de Vries · Re: Planning OIDC         │
│ ┌───────────────────────────────────────────┐ │
│ │ (bewerkbare textarea, auto-grow, 6-16 rg) │ │
│ └───────────────────────────────────────────┘ │
│ Wordt opgeslagen als concept. Niet verstuurd. │
│                    [Annuleren]  [Uitvoeren]   │
└───────────────────────────────────────────────┘
```
- Kop per type: `Concept-antwoord in Outlook` / `Teams-bericht naar {chat}` / `Commentaar op {KEY}`.
- Toelichting per type: concept `Wordt opgeslagen als concept. Niet verstuurd.`; Teams
  `Wordt direct verstuurd naar {chat}.` (in `--warn`); Jira `Wordt direct geplaatst op {KEY}.`
- Staten: **voorstel** (knoppen actief) → **bezig** (`Uitvoeren…`, knoppen disabled, textarea readonly) →
  **gelukt** (kaart klapt in tot 1 regel: `✓ Concept opgeslagen. Open in Outlook` / `✓ Verstuurd` /
  `✓ Commentaar geplaatst. Open {KEY}`; link = `webLink` indien aanwezig) → of **fout** (foutmapping 3.1,
  tekst blijft bewerkbaar, knop `Opnieuw uitvoeren`; geen automatische retry bij schrijfacties) →
  **geannuleerd** (1 regel `Geannuleerd`, grijs).
- Uitvoeren is primaire knop (accent). Ctrl/Cmd+Enter in textarea = Uitvoeren. Esc = Annuleren.
- Lege tekst: Uitvoeren disabled.

### 3.4 Antwoord-concept-flow (vanuit mail)
1. Klik `Antwoord-concept` op mail-rij → rij klapt uit met bevestigkaart in staat **schrijven**:
   textarea toont streamende Claude-tekst (skeleton-regel eerst), label `Claude schrijft…`, knop `Stop`.
2. Claude-instructie: antwoord in Thomas' stijl (direct, kort, NL of taal van de mail), op basis van de mail.
3. Klaar → staat **voorstel**. Extra knop `Opnieuw schrijven` (secundair) en een klein veld
   `Aanwijzing voor Claude` (bv. "korter", "zeg nee") dat bij Enter opnieuw genereert.
4. Uitvoeren → `outlook_create_reply_draft`. Gelukt → `Concept staat in Outlook. Open concept`.
5. Focus: na openen naar textarea; na gelukt/annuleren terug naar de knop `Antwoord-concept` van die rij.
Teams `Antwoord` werkt identiek, maar verstuurt direct (zie waarschuwingstekst 3.3).
Jira `Commentaar`: zelfde kaart, textarea leeg (Thomas typt), knop `Laat Claude schrijven` optioneel.

### 3.5 Acties
- Invoer bovenaan: placeholder `Nieuwe actie… (Enter)`. Enter voegt toe; optioneel `@wie`, `#programma`,
  `!vr` of `!2026-10-01` in de tekst worden geparsed naar velden (tonen als chips na toevoegen).
- Programma-tags: UI/UX, Platform Core, CI Acceleration, OIDC, Object Store, Jakarta migratie,
  Platform Stability, Contracten, Overig.
- `Maak actie` vanuit mail/Teams/Jira: vult invoer met onderwerp + bron-link, focus in invoer, Thomas bevestigt met Enter.
- **PAF-link**: kaart-footer, volle breedte knop in secundaire stijl met accent-rand:
  `PAF actielijst openen ↗` + subregel `Hoofdlijst. Deze lijst is voor losse acties van vandaag.`
- `db` null: `Acties opslaan kan hier niet. Gebruik de PAF actielijst.` (PAF-link blijft zichtbaar).
- Optimistisch toevoegen; bij fout rij rood gemarkeerd met `Niet opgeslagen. Opnieuw`.

### 3.6 Claude-balk en chatpaneel
- Balk: invoer (placeholder `Vraag Claude iets over je dag, mail, Teams of Jira…`), verzendknop, snelknoppen.
  Verzenden opent het paneel met de vraag als eerste bericht.
- Paneel: kop `Vraag Claude` · `Nieuw gesprek` · `Vastzetten` (alleen desktop) · sluit X.
  Berichten: Thomas rechts (`--surface-2`), Claude links zonder ballon (platte tekst, markdown licht: vet,
  lijsten, links). Tool-gebruik als kleine grijze regel: `Agenda bekeken`, `Mail doorzocht (12)`.
- Streaming: cursor-blokje aan het eind; knop `Stop` vervangt verzendknop tijdens stream.
- `sample` null: balk disabled met tekst `Claude is niet beschikbaar in deze weergave.`; snelknoppen verborgen.
- Fout: in stroom `Claude kon niet antwoorden. Opnieuw` (knop).
- `Bereid voor` (agenda) opent paneel met prompt en toont antwoord in blokken **Wie**, **Waarover**,
  **Gerelateerd** (links naar mail/Teams/Confluence).

## 4. Design tokens

Eén font: **Archivo** (Google Fonts, 400/500/600/700, `display=swap`), fallback `system-ui, sans-serif`.
Mono voor Jira-keys en tijden: `ui-monospace, SFMono-Regular, Menlo, monospace`.
Aansluiting PAF actielijst: zacht zwart `#101113` en honinggeel `#e8a317`. Honinggeel alleen als **vulling**
(met `#101113` tekst, contrast 8.9:1) of rand/indicator; nooit als tekstkleur op licht (2.2:1, faalt).
Voor accent-tekst op licht: `--accent-text #8a5a00` (6.0:1 op wit).

```css
:root {
  --font: "Archivo", system-ui, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --fs-xs: 12px; --fs-sm: 13px; --fs-md: 15px; --fs-lg: 18px; --fs-xl: 24px; --fs-2xl: 30px;
  --lh: 1.45; --fw-reg: 400; --fw-med: 500; --fw-bold: 700;
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px; --sp-6: 32px; --sp-7: 48px;
  --r-sm: 6px; --r-md: 10px; --r-lg: 16px; --r-pill: 999px;
  --dur: 160ms; --ease: cubic-bezier(.2,.7,.2,1);

  /* licht */
  --bg: #f6f5f1;          --surface: #ffffff;     --surface-2: #efede7;  --border: #dedbd2;
  --text: #101113;        --text-2: #4a4c52;      --text-3: #6b6e75;     /* 5.0:1 op wit */
  --accent: #e8a317;      --on-accent: #101113;   --accent-text: #8a5a00; --accent-soft: #fbefd3;
  --info: #1f5fbf;  --success: #1c7a43;  --warn: #9a5b00;  --danger: #b3261e;
  --info-soft: #e6eefb; --success-soft: #e3f3e9; --warn-soft: #fbefd3; --danger-soft: #fbe6e4;
  --focus: #101113;  --scrim: rgb(16 17 19 / .45);
  --shadow-1: 0 1px 2px rgb(16 17 19 / .06), 0 1px 1px rgb(16 17 19 / .04);
  --shadow-2: 0 8px 24px rgb(16 17 19 / .12);
  color-scheme: light;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* donker-set */ } }
:root[data-theme="dark"] { /* identieke donker-set */ }
/* donker-set: */
  --bg: #101113;          --surface: #18191c;     --surface-2: #222328;  --border: #2f3137;
  --text: #ecebe6;        --text-2: #b4b3ad;      --text-3: #8e8d88;     /* 5.6:1 op surface */
  --accent: #e8a317;      --on-accent: #101113;   --accent-text: #f0b640; --accent-soft: #3a2c0c;
  --info: #7fb0ff;  --success: #5fcf8a;  --warn: #f0b640;  --danger: #ff8a80;
  --info-soft: #172338; --success-soft: #13291c; --warn-soft: #3a2c0c; --danger-soft: #3a1714;
  --focus: #e8a317;  --scrim: rgb(0 0 0 / .6);
  --shadow-1: 0 1px 2px rgb(0 0 0 / .4); --shadow-2: 0 8px 24px rgb(0 0 0 / .5);
  color-scheme: dark;

body { background: var(--bg); color: var(--text); font: var(--fw-reg) var(--fs-md)/var(--lh) var(--font); }
```
- Kaarten: `--surface`, 1px `--border`, `--r-lg`, `--shadow-1`, padding `--sp-4` (mobiel) / `--sp-5`.
- Focus: `outline: 2px solid var(--focus); outline-offset: 2px` via `:focus-visible` op alles interactief.
- Thema-toggle in header cyclet Systeem → Licht → Donker, zet/verwijdert `data-theme` op `<html>`,
  keuze in `localStorage` (try/catch).
- Kopgroottes: begroeting `--fs-2xl`/700 (mobiel `--fs-xl`), sectie h2 `--fs-lg`/600, rijen `--fs-md`, meta `--fs-sm`.
- Tijden en tellers: `font-variant-numeric: tabular-nums`.

## 5. Microcopy (NL, direct, geen em-dashes)

| Plek | Tekst |
|---|---|
| Begroeting | `Goedemorgen, Thomas` (<12u) · `Goedemiddag, Thomas` (<18u) · `Goedenavond, Thomas`. Naam uit `get_me`, fallback zonder naam. |
| Datum | `donderdag 24 september` |
| Globale ververs | `Alles verversen` · tijdens: `Verversen…` |
| Sectiekoppen | `Vandaag` · `Inbox` (tabs `Mail`, `Teams`) · `Werk` (tabs `Jira`, `Confluence`) · `Acties` |
| Claude-balk placeholder | `Vraag Claude iets over je dag, mail, Teams of Jira…` |
| Snelknoppen | `Wat moet ik vandaag?` · `Vat mijn inbox samen` · `Wat speelt er in Teams?` |
| Knoppen | `Bereid voor` · `Antwoord-concept` · `Antwoord` · `Commentaar` · `Maak actie` · `Open in Outlook` · `Open in Teams` · `Open` · `Uitvoeren` · `Annuleren` · `Opnieuw proberen` · `Toon alle (n)` · `Stop` |
| Leeg Vandaag | `Geen afspraken vandaag.` / na laatste: `Je agenda is klaar voor vandaag.` |
| Leeg Mail | `Geen nieuwe mail.` |
| Leeg Teams | `Geen Teams-berichten sinds gisteren.` |
| Leeg Jira | `Geen issues gevonden voor deze zoekopdracht.` + knop `Zoekopdracht aanpassen` |
| Leeg Confluence | `Geen pagina's die je recent bewerkte.` |
| Leeg Acties | `Geen open acties. Typ hierboven en druk op Enter.` |
| JQL-instelling | label `Jira-zoekopdracht (JQL)`, knoppen `Toepassen`, `Standaard herstellen` |
| Nu-strip | `Nu: {onderwerp} tot {tijd}` · `Straks {tijd} {onderwerp} (over {n} min)` · `{n} ongelezen` · `{n} acties vandaag` |
| Versheid | `bijgewerkt 10:42` · bij fout: `Niet actueel, laatst 10:42` |

Tijd relatief alleen voor <60 min (`over 42 min`, `5 min geleden`), anders klok.

## 6. Interactie en toegankelijkheid

**Sneltoetsen** (niet actief terwijl focus in een invoerveld staat, behalve Esc en Ctrl+K):
| Toets | Actie |
|---|---|
| `/` of `Ctrl/Cmd+K` | focus Claude-balk |
| `r` | ververs sectie met focus; `Shift+R` alles |
| `g` dan `v` / `i` / `w` / `a` | spring naar Vandaag / Inbox / Werk / Acties |
| `n` | focus nieuwe-actie-invoer |
| `Esc` | sluit paneel/menu/bevestigkaart (= Annuleren) |
| `?` | toon sneltoetsen-overzicht (dialog) |
Toon hint `/` rechts in de Claude-balk (desktop).

**Focusvolgorde**: skip-link `Naar inhoud` → header (ververs, thema) → nu-strip-links → Claude-balk →
snelknoppen → Vandaag → Inbox (tablist, dan rijen) → Acties → Werk. DOM-volgorde = visuele volgorde op elk
breakpoint (grid-areas mogen de volgorde niet omgooien t.o.v. DOM). Chatpaneel: bij openen focus op invoer,
focus-trap op tablet/mobiel, bij sluiten focus terug naar de opener.

**ARIA**:
- Chatlog `role="log" aria-live="polite" aria-relevant="additions"`. Streamende tekst: schrijf tokens in een
  visueel element met `aria-hidden="true"`; plaats het complete antwoord pas na afronding (of per zin,
  gebufferd, max 1x per 1,5 s) in de live-regio, zodat schermlezers niet per token praten.
- Status-regio `role="status"` (visueel verborgen) voor `Inbox bijgewerkt, 4 ongelezen` en schrijfactie-resultaten.
- Secties `<section aria-labelledby>`; skeleton `aria-busy="true"` + visueel verborgen `Laden…`.
- Tabs volgens WAI-ARIA tabs-patroon; `Nu`-afspraak `aria-current="true"`.
- Iconknoppen altijd `aria-label`. Externe links: visueel `↗`, sr-tekst `(opent in nieuw tabblad)`.

**Reduced motion** (`prefers-reduced-motion: reduce`): geen shimmer (statisch grijs), geen slide van paneel
(direct tonen), geen draaiend ververs-icoon (tekst `Verversen…`), `scroll-behavior: auto`.

**Touch**: alle doelen ≥44×44px op ≤560px (checkbox, `⋯`, tabs, snelknoppen, sluitknop); 8px tussenruimte.
Geen hover-only acties: op touch staan secundaire acties achter `⋯`.

## 7. Ruisfilter mail

Een mail is **melding** als één regel matcht (afzender lowercase, onderwerp case-insensitief):
1. Afzender lokaal deel matcht `^(no-?reply|do-?not-?reply|noreply|notifications?|notify|alerts?|mailer-daemon|postmaster|bounce|automated|system)` of bevat `noreply`.
2. Afzenderdomein is een bekende notificatiebron: `atlassian.net`, `atlassian.com`, `github.com`,
   `microsoft.com`, `office365.com`, `teams.mail.microsoft`, `sharepoint.com`, `yammer.com`, `jenkins`, `sonarcloud.io`.
3. Onderwerp begint met of bevat: `[JIRA]`, `[Confluence]`, `Automatic reply`, `Automatisch antwoord`,
   `Out of Office`, `Afwezig`, `Undeliverable`, `Onbestelbaar`, `Accepted:`, `Geaccepteerd:`, `Declined:`,
   `Tentative:`, `digest`, `newsletter`, `nieuwsbrief`.
Uitzondering: `importance === "high"` is nooit melding.

Weergave: normale mail eerst (ongelezen bovenaan, dan nieuwste). Daaronder één ingeklapte rij
`Meldingen (n)` met chevron, `aria-expanded`. Uitgeklapt: compacte rijen (1 regel, geen acties behalve Open).
Teller `Mail n` in de tab telt alleen ongelezen niet-meldingen. Keuze open/dicht onthouden in `localStorage`.

## 8. Wireframes

### Desktop ≥1100px
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Goedemorgen, Thomas              donderdag 24 september     [Alles verversen] [◐]    │
│ Nu: Standup Platform Core tot 09:15 · Straks 10:00 Review OIDC (over 42 min) · 4 ong │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ [ Vraag Claude iets over je dag, mail, Teams of Jira…                    /  ] [➤]    │
│ (Wat moet ik vandaag?) (Vat mijn inbox samen) (Wat speelt er in Teams?)              │
├──────────────────────┬─────────────────────────────┬─────────────────────────────────┤
│ Vandaag   10:42 ⟳    │ Inbox            10:42 ⟳    │ Acties 3                    ⟳   │
│ 08:30 Standup  [Nu]  │ [Mail 4] [Teams 7]          │ [Nieuwe actie… (Enter)       ]  │
│ ── nu 09:47 ──────── │ ▌Jan de Vries        11:11  │ ☐ OIDC scope mailen  vr  #OIDC  │
│ 10:00 Review [Volg.] │ ▌Planning OIDC · Kun je…    │ ☐ Budget CI checken  vandaag    │
│   Teams · Anna       │   [Antwoord-concept][Actie] │ [ PAF actielijst openen ↗     ] │
│   [Bereid voor][Open]│ Piet Jansen          09:02  ├─────────────────────────────────┤
│ 13:00 1:1 Mark       │ Re: Jakarta release…        │ Werk            10:40 ⟳         │
│ 15:30 Stuurgroep     │ ▸ Meldingen (12)            │ [Jira 12] [Confluence 5]        │
│                      │                             │ ABC-123 Token refresh  (Review) │
│                      │                             │ ABC-98  Pipeline cache (Open)   │
└──────────────────────┴─────────────────────────────┴─────────────────────────────────┘
 Chatpaneel: overlay rechts 420px, 100vh; "Vastzetten" reserveert 420px rechts in de grid.
```

### Tablet 561–1099px
```
┌─────────────────────────────────────────────┐
│ Goedemorgen, Thomas      24 sep  [⟳] [◐]    │
│ Nu: Standup tot 09:15 · Straks 10:00 Review │
├─────────────────────────────────────────────┤
│ [ Vraag Claude…                        ][➤] │
│ (Wat moet ik vandaag?) (Vat mijn inbox…)    │
│ (Wat speelt er in Teams?)                   │
├──────────────────────┬──────────────────────┤
│ Vandaag          ⟳   │ Inbox            ⟳   │
│ 08:30 Standup [Nu]   │ [Mail 4][Teams 7]    │
│ 10:00 Review  [Volg.]│ Jan de Vries 11:11   │
│ 13:00 1:1 Mark       │ ▸ Meldingen (12)     │
├──────────────────────┼──────────────────────┤
│ Acties           ⟳   │ Werk             ⟳   │
│ [Nieuwe actie…     ] │ [Jira 12][Confl. 5]  │
│ [PAF actielijst ↗  ] │ ABC-123 …   (Review) │
└──────────────────────┴──────────────────────┘
 Chatpaneel: overlay rechts min(420px,90vw) + scrim
```

### Mobiel ≤560px
```
┌──────────────────────────┐        ┌──────────────────────────┐
│ Goedemorgen, Thomas  [◐] │        │          ───             │
│ do 24 sep       [⟳]      │        │ Vraag Claude    [+] [✕]  │
│ Nu: Standup tot 09:15    │        │                          │
│ Straks 10:00 Review (42m)│        │        Wat moet ik       │
├──────────────────────────┤        │        vandaag?  ▐       │
│ [ Vraag Claude…     ][➤] │        │ Om 10:00 heb je de       │
│ (Wat moet ik vandaag?)   │        │ OIDC-review. Eerst…      │
│ (Vat mijn inbox samen)   │        │ · Agenda bekeken         │
│ (Wat speelt er in Teams?)│        │ ┌ Concept-antwoord ────┐ │
├──────────────────────────┤        │ │ [tekst            ]  │ │
│ ▾ Vandaag            ⟳   │        │ │ [Annuleren][Uitvoer.]│ │
│ 08:30 Standup     [Nu]   │        │ └──────────────────────┘ │
│ 10:00 Review OIDC  [⋯]   │        │ [ Vraag verder…    ][➤]  │
├──────────────────────────┤        └──────────────────────────┘
│ ▾ Inbox              ⟳   │         Onderlade 88dvh
│ [Mail 4]   [Teams 7]     │
│ ▌Jan de Vries  11:11 [⋯] │
│ ▌Planning OIDC · Kun…    │
│ ▸ Meldingen (12)         │
├──────────────────────────┤
│ ▾ Acties                 │
│ [Nieuwe actie… (Enter) ] │
│ [PAF actielijst openen ↗]│
├──────────────────────────┤
│ ▸ Werk (Jira 12 · Conf 5)│
└──────────────────────────┘
                     (FAB ✦)
```
