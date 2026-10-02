# Droplet: Phase 0 report and Phase 1 analysis

Status: waiting for Thomas's approval. Nothing beyond the Phase 0 cleanup is built.

## Phase 0: inventory of the old app (Actielijst)

| Part | Verdict | Why |
|---|---|---|
| Color tokens (`app/assets/stylesheets/application.css`) | **Kept** | Near-black ground `#101113`, amber `#e8a317` as the only action color, alarm `#e2664a`, sage `#7fc796`, steel `#8aa9c9`. This is the Half-Life HUD palette. |
| Buttons (`buttons.css`) | Kept | Pill buttons on the same tokens. Will be restyled, not replaced. |
| Login (password + signed session cookie, rate limited) | **Kept, to harden** | Works, but "first visitor creates the account" is unsafe on a public server. Replace with passkeys (see Hosting). |
| PWA shell (manifest, service worker) | Kept | Installable already. Needs Web Push added. |
| Dictation controller (Stimulus, browser speech API) | Kept | Exactly what quick add needs. Switches to English. |
| Kamal deploy, Dockerfile, CI (brakeman, bundler-audit, rubocop, tests) | Kept | One-command deploy to a single server. |
| Source connections | **None existed** | The app had no integrations. A Cowork morning run pushed proposals into it via a bearer token API. That pattern (Claude run writes into the server) is the only thing worth keeping, and it is the core of the new design. |
| Items, proposals, captures, import, Assistant (direct Anthropic API), jobs, views | **Deleted** | Domain was one list per source. Replaced by the ticket model below. |

The repo now holds a bootable Rails 8.1 skeleton: login, PWA shell, tokens, deploy. Tests pass (7 runs, 0 failures).

## Verified: connectors and tools

| Source | Connector | Status | Notes |
|---|---|---|---|
| Outlook mail | Microsoft 365 | Connected | Read, write, draft, send (`Mail.ReadWrite`, `Mail.Send`). |
| Calendar | Microsoft 365 | Connected | Read and write (`Calendars.ReadWrite`). |
| Teams chats and channels | Microsoft 365 | Connected, **read only** | `Chat.Read`, `ChannelMessage.Read.All`. No send scope granted, so Claude can draft Teams messages but probably not post them. Meeting transcripts are disabled tenant-wide at Planon (known from the Steerco routine); meeting chats work. |
| OneDrive / SharePoint / PowerPoint | Microsoft 365 | Connected | Read and write files. |
| Jira, Confluence, Loom | Atlassian MCP + Atlassian Rovo | Connected | Both connected; one will be picked in Phase 3. |
| Google Drive | Google Drive | **Installed, not connected** | Connect at claude.ai/customize/connectors if wanted. |
| todos.md | Claude memory | **Not reachable from cloud runs** | Memory lives in your claude.ai/Cowork chats, not in Routines. See question 5. |

## How the droplet triggers Claude runs

**Claude Code Routines with an API trigger.** Verified:

- A Routine stores a prompt plus a set of connectors. Your existing "PAF Steerco deck" Routine already runs with Microsoft 365 and Atlassian Rovo, so connector access from a scheduled cloud run works on your account.
- A Routine can get an API trigger: `POST https://api.anthropic.com/v1/claude_code/routines/{id}/fire` with a per-routine bearer token and an optional `text` field. The response returns the session ID and URL. ([docs](https://platform.claude.com/docs/en/api/claude-code/routines-fire), [routines guide](https://code.claude.com/docs/en/routines))
- Routines can also run on a cron schedule in Europe/Amsterdam time.

So the droplet never talks to Microsoft or Atlassian. It stores tickets and fires Routines. The Routines read and act through your connectors and write back to the droplet API over HTTPS.

Two Routines, both created by me in Phase 2 with your approval:

1. **Ingest** (cron, weekdays 07:10, plus fired on demand). Reads the droplet context, reads sources since the last run, merges, ranks, drafts, and posts tickets.
2. **Execute** (API trigger only). Fired when you tap Delegate. Gets the ticket ID, carries out the approved draft, reports the result back on the ticket.

## How a delegated ticket reaches Cowork

**There is no direct route.** I found no public API that lets a server start a Cowork session. (The `remote_cowork` environment exists inside Claude's own session tools, but it is not exposed to a server, and it is not in your environment list.)

Proposal:

- **Default: Delegate = Execute Routine.** Same connectors as Cowork, runs in the cloud, reports back to the ticket with a link to the run. For mail, calendar, Jira and documents this covers what Cowork would do. You never have to open anything.
- **Fallback for work that needs your desktop or local files: "Open in Cowork".** Copies the pre-drafted prompt and opens Claude. One extra tap and a paste. Used only when the ticket's draft is marked as needing Cowork.
- Phase 2 test: whether the Execute Routine can hand a task into a Cowork session itself. If it can, the fallback disappears.

## Architecture

```
            Microsoft 365 · Atlassian · (Google Drive)
                  ▲ read / act via your connectors
                  │
   ┌──────────────┴───────────────┐
   │  Claude Routines (cloud)     │
   │  Ingest  (07:10 + on demand) │
   │  Execute (per delegation)    │
   └──────┬───────────────▲───────┘
  POST tickets,           │ fire (HTTPS, bearer token)
  results (HTTPS, token)  │
   ┌──────▼───────────────┴───────┐
   │  Droplet (DigitalOcean)      │
   │  Rails 8 · SQLite · Hotwire  │
   │  Ticket store · Decision log │
   │  Scheduler · Web Push        │
   └──────────────▲───────────────┘
                  │ HTTPS, passkey login
              Your phone (PWA)
```

- **One app, one database, one process.** Rails 8.1, SQLite, Solid Queue for schedules. Same stack as before, so no relearning.
- **Rhythm**:
  - 07:10 Ingest Routine runs.
  - 07:30 droplet sends the push: top 3, plus what was cleaned up. If ingest has not finished, it sends with what it has and says so.
  - 12:30 droplet checks its own store, no Claude run. Push only if a deadline or decision is due today.
- **Learning from decisions**: no model training. Each ingest run receives a short summary of your last 60 days of decisions (per program, sender, and source type: how often delegated, snoozed, dismissed) and ranks with it. Simple, visible, adjustable.
- **Autonomy**: a table with one row per action type (`mail_reply`, `mail_new`, `teams_message`, `calendar_response`, `cowork_task`, `cleanup`), all `off`. Every Execute run checks it. No UI for it yet.

## Ticket data model

```
Ticket
  id
  kind            action | proposal        (proposal = derived from sources, needs your accept)
  status          proposed | open | delegated | running | done | snoozed | dismissed
  program         UI/UX | Platform Core | CI Acceleration | OIDC | Object Store | Jakarta
                  | Platform Stability | Contracts | Private | Other
  title           one line
  what            what is it (1-2 sentences)
  why_now         why it is in today's queue
  proposal        what Claude proposes
  draft_type      mail_reply | mail_new | teams_message | calendar_response | cowork_prompt | none
  draft           the pre-drafted text (editable before delegating)
  draft_target    json: recipients, thread or event ID, chat ID
  due_at          deadline, drives the countdown
  decision_due    boolean: a decision is expected from you
  rank            0-100, set by Claude
  rank_reason     one line
  topic_key       stable key for merging signals about the same topic
  snoozed_until
  run_url         link to the last Claude run on this ticket
  result          what Claude did (after delegation)
  timestamps

Signal (where a ticket came from, links only, no content)
  ticket_id, source (mail | calendar | teams | jira | confluence | loom | drive | manual | todos),
  external_id, url, seen_at

Decision (the log)
  ticket_id, action (accept | delegate | edit_delegate | do_myself | snooze | dismiss | done),
  edited_draft (if edited), program, source types, rank at decision time, decided_at

Run
  kind (ingest | execute), status, run_url, started_at, finished_at, summary, cleaned_up (json)

AutonomySetting
  action_type, level (off | ask | auto), default off

PushSubscription
  endpoint, keys, user_agent
```

Merging: the Ingest Routine gets all open `topic_key`s with titles. A new signal on an existing topic adds a Signal and updates `why_now`, instead of creating a second ticket.

## Hosting and security

- **Server**: one DigitalOcean droplet, Ubuntu 24.04 LTS, Basic 1 vCPU / 2 GB, region AMS3. About $12/month, plus $2.40 for weekly backups.
- **Deploy**: Kamal (already in the repo). kamal-proxy issues the Let's Encrypt certificate, forces HTTPS with HSTS.
- **Login**: passkey (Face ID / fingerprint) for the single user, no passwords. Account is created once with a one-time setup code from the server console, not "first visitor wins". Sessions expire after 30 days of inactivity.
- **Server hardening**: SSH key only, no root login, firewall open on 22, 80, 443 only (DO cloud firewall), unattended security upgrades.
- **Secrets**: never in the repo. Kamal reads them from environment variables at deploy time. On the server they live only in the container environment. Routine fire tokens are stored there; the droplet's API tokens for the Routines are stored hashed in the database and are scoped to the ticket API only.
- **Data retention**: no mail bodies or chat content stored. Tickets hold Claude's summary and draft, plus links. Dismissed and done tickets are deleted after 30 days, their signals with them. The decision log keeps only the fields above, for 12 months. Database backups via DO weekly snapshots.

## Phase 2 scope (after approval)

Mail, calendar, and your action list, end to end:

1. Ticket model, queue screen (7 in focus, rest folded), one-tap actions, quick add.
2. Import of todos.md.
3. Ticket API for Routines, plus the Ingest and Execute Routines.
4. Delegate via Execute Routine, with the result reported on the ticket.
5. Web Push: 07:30 morning push, 12:30 silent check.
6. Deploy to the droplet.

## Questions

1. **Delegate on a mail ticket**: may Claude *send* the drafted mail after your tap, or only place it in Outlook Drafts for you to send? (My suggestion: send. Your tap is the approval.)
2. **Teams**: the connector has no send permission. OK to deliver Teams drafts as copy-and-open in Teams for now?
3. **Domain**: which hostname should Droplet run on, and do you already have a DigitalOcean droplet, or should I specify one for you to create?
4. **Login**: is a passkey on your phone and laptop enough, or do you want a second layer (for example Cloudflare Access with your Microsoft login in front of it)?
5. **todos.md import**: Routines cannot read Claude memory. Should you paste it once into Droplet, or should I give you a one-line Cowork prompt that sends it over? And after import, should the `thomas-todos` skill point to Droplet so Cowork and Droplet stay one list?
6. **Quick add**: to assign the program instantly, the droplet needs a small direct Claude API call (an Anthropic API key on the server). The alternative is that new items sit under "Unsorted" until the next ingest run. Which do you prefer?
7. **Ingest frequency**: only 07:10, or also hourly during working hours? More runs mean fresher tickets and more usage on your plan.
8. **Private actions**: any private sources to read (a personal mailbox, private calendar), or are private actions only what you add yourself?
9. **Phone**: iPhone or Android? On iPhone, push works only after "Add to Home Screen" (iOS 16.4 or later).
10. **Old automations**: the "Actiepagina: wekelijkse analist-ronde" Routine and its artifact belong to the old app. Retire them once Droplet is live? (Separate note: your "PAF Steerco deck" Routine failed on 1 October.)
