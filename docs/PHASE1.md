# Droplet: Phase 0 report and Phase 1 analysis (revised 2 Oct 2026)

Status: waiting for Thomas's approval of the architecture below. No Phase 2 code yet.

Revision note: the first version of this analysis looked at an outdated Rails snapshot of the repo. The real
current app is on `main`: the claude.ai artifact "Droplet" (https://claude.ai/artifact/PqANDMJuGom3jRqvm8k7zv).
That merge is in. This version is based on it and on Thomas's answers of 2 Oct.

## Phase 0: inventory of the current app

The current app is a single artifact page with one screen per source: Agenda, Inbox (mail and Teams), Work (Jira,
Confluence), Actions, Proposals, a Claude panel and a command bar. It reads every source live from the page.

| Part | Verdict | Why |
|---|---|---|
| Color tokens, dark (`src/styles/base.css`) | **Keep** | `--bg #101113`, `--surface #18191c`, `--surface-2 #222328`, `--border #2f3137`, `--text #ecebe6`, `--accent #e8a317` (amber, the only action color), `--danger #ff8a80`, `--success #5fcf8a`, `--info #7fb0ff`. Light theme tokens are dropped: dark only. |
| Dark Forest theme (`src/styles/forest.css`, `tools/forest-svg.py`) | **Keep** | Black ground with a Dark Forest illustration (Three-Body). Fits the mood brief. |
| Login | **Keep as is** | The artifact runs behind your claude.ai login (passkey). No auth code of our own. |
| Source connections: helpers in `src/app/core.js` | **Keep** | `items()` parses M365 multi-block results and Atlassian payloads, `errCode`/`missingScope` map connector errors. Proven against your real connectors. |
| Usage log (`src/app/gebruik.js`, db `gebruik/<date>`) | **Keep** | Feeds the analyst. Counts and event names only, no content. |
| Preferences (`src/app/prefs.js`, db `prefs/thomas`) | **Keep** | Small, works. Includes the Teams-send-blocked flag. |
| Test harness (`tests/mock-claude.js`, `tests/helpers.js`, `tests/fixtures/`, Playwright config) | **Keep** | Mock of `window.claude` that enforces the real limits (limit 25, missing Teams scopes). |
| Runtime contracts (`docs/contract/*.d.ts`), `tools/check-globals.js`, `tools/files-map.js` | **Keep** | Needed to build and publish. |
| Data in the live database (`acties`, `adresboek`, `gebruik`) | **Keep, migrate in Phase 2** | Open actions become tickets. |
| Agenda, Inbox, Work, Tabs, Card, Claude panel, Command bar, Proposals, Actions UI, their CSS and tests | **Delete** | These are the one-screen-per-source screens. |
| Old docs (BRIEF, UX, UX-PLAN, PLAN-FASE2, TESTPLAN, TESTRAPPORT, OCHTENDRUN, OVERDRACHT) | **Delete** | Superseded. Connector findings carried over below. |
| `node_modules/` committed to git (524 files) | **Remove from git** | It is in `.gitignore` already. |

Deletion is **pending your go** (the session's safety check asks for explicit confirmation before removing the
old app's files). The live artifact keeps running the old version until Phase 2 republishes it.

## Verified connectors (your account, 2 Oct)

| Source | Status | Notes |
|---|---|---|
| Outlook mail | Connected | Read, draft, **send** (`outlook_send_mail` tested in the old build). Search `limit` max 25. |
| Calendar | Connected | Read and write. |
| Teams | Connected, **read only** | No `ChatMessage.Send` / `ChannelMessage.Send`. Fallback: copy and open in Teams (your answer 2). Transcripts disabled tenant-wide, meeting chats readable. |
| OneDrive / SharePoint / PowerPoint | Connected | Read and write. |
| Jira, Confluence, Loom | Connected (Atlassian Rovo and Atlassian MCP) | Rovo is what the existing app and Steerco routine use. |
| Google Drive | Not connected | Not needed for the MVP. |
| `search_people` | Fails (no `People.Read`) | Keep using the app's own address book. |

## Architecture: no server

You don't want DigitalOcean and don't care about the domain. Since Droplet already is a claude.ai artifact, the
simplest setup is to keep it there and drop the server entirely.

```
        Microsoft 365 · Atlassian
              ▲ read / act through your connectors
              │
  ┌───────────┴────────────────────────┐
  │ Claude Routines (cloud)            │
  │  Ingest   hourly, workdays         │──── push to iPhone (Claude app)
  │  Morning  07:30 · Midday 12:30     │
  │  Execute  fired per delegation     │
  │  Analyst  weekly                   │
  └──────┬──────────────────▲──────────┘
  writes │ tickets           │ fire_trigger (your tap)
         ▼                   │
  ┌──────────────────────────┴─────────┐
  │ Droplet artifact (claude.ai)       │
  │  one screen: today's queue         │
  │  db: tickets, decisions, runs ...  │
  └────────────────────────────────────┘
        ▲ your claude.ai login (passkey)
     iPhone · laptop
```

- **UI**: the existing artifact URL, rebuilt as one screen. Same link, so your pin keeps working.
- **Store**: the artifact's own database (`db` capability). Routines read and write it with ArtifactData; the
  existing analyst routine already does this, so the route is proven.
- **Triggering Claude**: the page calls the `Claude Code Remote` connector's `fire_trigger` through the `mcp`
  capability. Your tap starts the Execute routine at once, with your credentials, no tokens in the page.
  Fallback if that is refused: the tap sets status `delegated` and the next hourly run picks it up.
- **Push**: Routine notifications go to the Claude app on your iPhone. No web push, no PWA install needed.
  - 07:30 Morning routine: top 3 and what was cleaned up. Push always.
  - 12:30 Midday routine: reads only the database, no sources. Push only if a deadline or decision is due today.
    To verify in Phase 2: that a run with nothing to say stays silent. If not, it pushes one line at most.
- **Ingest**: hourly, workdays 07:00 to 18:00 (your answer 7). Reads mail and calendar since the last run
  (Phase 2), merges by topic, drafts the action, writes proposed tickets.
- **Execute**: carries out a delegated ticket. Mail is **sent** (your answer 1). Teams: copy and open (answer 2).
  Results and the run link are written on the ticket.
- **Cowork**: no direct route from a page or routine into a Cowork session. Execute routines do the work with the
  same connectors. For work that needs your laptop, "Open in Cowork" copies the drafted prompt.
- **Security**: claude.ai login, private artifact, no secrets anywhere (connectors use your own credentials).
  Minimal retention: tickets store Claude's summary, draft and links, never mail or chat bodies. Done and
  dismissed tickets are deleted after 30 days; the decision log keeps metadata for 12 months.
- **Autonomy**: `autonomy/<action type>` docs in the database, all `off`. Every Execute run checks them.

## Ticket data model (artifact db)

```
tickets/<id>
  kind          action | proposal          proposal = from sources, becomes action when you accept
  status        proposed | open | delegated | running | done | snoozed | dismissed
  program       UI/UX | Platform Core | CI Acceleration | OIDC | Object Store | Jakarta | Platform Stability
                | Contracts | Private | Unsorted
  title, what, whyNow, proposal
  draftType     mail_reply | mail_new | teams_message | calendar_response | cowork_prompt | none
  draft         pre-drafted text, editable before delegating
  target        recipients, message or event ID, chat link
  due           ISO date or datetime (drives the countdown)
  decisionDue   true when a decision is expected from you
  rank, rankReason
  topicKey      merge key: a new signal on the same topic updates the ticket instead of adding one
  signals[]     { source, url, at }: links only
  snoozedUntil, runUrl, result, createdAt, updatedAt

decisions/<id>  ticketId, action (accept | delegate | edit_delegate | do_myself | snooze | dismiss | done),
                edited (bool), program, sources, rank, at
runs/<id>       kind (ingest | morning | midday | execute | analyst), at, summary, cleanedUp[], runUrl
autonomy/<type> level: off
gebruik/<date>  usage log (kept)
prefs/thomas    preferences (kept)
```

Quick add (typed or dictated) lands as an `open` action with program `Unsorted`. One tap sets the program
(your answer 6). Private actions are only what you add yourself (answer 8).

Learning: each Ingest run gets a short summary of the last 60 days of decisions (per program, sender, source:
delegated, snoozed, dismissed) and ranks with it.

## Your two new requests

**Analyst: improvements every week.** Weekly routine (Monday 07:00), reads `gebruik`, `decisions` and `tickets`,
and adds 2 to 3 concrete improvements to the Droplet backlog, each with what, why (with a number), and size.
It replaces the old analyst routine (your answer 10), switched over when Droplet goes live.

**Requirements list for later.** A Claude Docs document, [Droplet backlog](https://claude.ai/code/artifact/9cb9a474-8876-4d87-a099-7a7b5b7818c0) (created 2 Oct): one line per requirement, typed from
your phone or laptop. The PO round reads it weekly, refines the items, and asks you which to build. Nothing is
built without your go. Once Droplet is live, quick add can drop an item there too.

## Imports

- `todos.md` (answer 5): a one-shot Cowork prompt, in `docs/IMPORT-TODOS.md` in Phase 2, that reads your memory
  list and writes it into Droplet, then points the `thomas-todos` skill at Droplet.
- The live `acties` collection migrates into `tickets` in Phase 2.

## Phase 2 scope

1. Delete the old screens (on your go).
2. One screen: today's queue, 7 in focus, rest folded. One-tap actions. Quick add with dictation.
3. Ticket store and decision log in the artifact db; migration of `acties`; todos.md import prompt.
4. Routines: Ingest (mail and calendar), Execute, Morning push, Midday check.
5. Republish to the same artifact URL.

## Not decided yet

Nothing blocking. Open for later: autonomy settings UI, Teams sending (needs IT to grant the scopes).
