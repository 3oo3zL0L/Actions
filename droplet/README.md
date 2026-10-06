# Droplet

Your focus list as a claude.ai Artifact (plain HTML/CSS/JS, no build). Sources: Outlook mail, Teams chats, Jira (mentions and standstills), Confluence pages (mentions and watched pages that changed), your own actions, today's calendar (only to apply R5), your asks to others that are still unanswered (R3), and commitments you made in meetings (R6, from transcripts). Everything goes into one focus list with one Claude ranking: **Today** on top, Everything else below, Recently done (7 days) under that. **Ask Claude** is the bottom prompt (and the same sheet on every item): Claude looks things up and prepares cards; you click to execute. Nothing is sent, posted or changed without your click, with one exception you asked for: the weekly hours reminder mails (below). Droplet never posts in Teams.

## Publish

Publish `index.html` with `css/` and `js/` as supporting files, and declare these capabilities:

```json
{
  "mcp": {
    "servers": [
      {
        "server": "Microsoft 365",
        "tools": [
          "get_me",
          "outlook_email_search",
          "read_resource",
          "outlook_create_reply_draft",
          "outlook_create_draft",
          "outlook_send_draft",
          "outlook_create_event",
          "chat_message_search",
          "outlook_calendar_search",
          "search_people"
        ]
      },
      {
        "server": "Atlassian Rovo",
        "tools": [
          "atlassianUserInfo",
          "getAccessibleAtlassianResources",
          "searchJiraIssuesUsingJql",
          "getJiraIssue",
          "addCommentToJiraIssue",
          "searchConfluenceUsingCql",
          "getConfluencePage",
          "updateConfluencePage"
        ]
      }
    ]
  },
  "sample": {},
  "db": {}
}
```

- New in increment 2: `chat_message_search` (Teams) and `outlook_calendar_search` (R5). `read_resource` was already declared; it now also reads `teams:///chats/…/messages/…`.
- Teams is read-only. The granted scopes have no `ChatMessage.Send`, so no Teams send tool is declared. "Copy & open in Teams" copies your reply and opens the chat on `teams.microsoft.com`.
- New in increment 3: `outlook_create_draft` (a new mail from an own action) and `outlook_create_event` (Find a time).
- **Tools that write** are exactly these six, and each runs only on your click (**click-only**), also when Claude prepared the card: `outlook_create_reply_draft` and `outlook_send_draft` (Send on a reply, or Chase by mail), `outlook_create_draft` with `outlook_send_draft` (Send on a new mail), `outlook_create_event` (Send invite), `addCommentToJiraIssue` (Comment) and `updateConfluencePage` (Update page). The one exception: `outlook_create_draft` with `outlook_send_draft` also runs without a click for the weekly hours reminders (see Weekly hours run). New: `search_people` (reads; finds a reminder's address). Every other declared tool only reads, and Claude's page tools can only call read tools or prepare a card.
- R3 reads Sent Items (`outlook_email_search`, 10 days), your Teams messages (`chat_message_search`, 10 days) and, while waits are open, the Inbox of 10 days to see replies. Chasing happens in Teams: Droplet copies the text and opens a `teams.microsoft.com` chat. For people outside Planon, Chase by mail is the primary action.
- R6 reads your ended meetings of today and the 2 working days before (`outlook_calendar_search`), each event once (`read_resource` on `calendar:///events/…`), and its `meetingTranscriptUrl` verbatim. Find a time reads your calendar and, where shared with you, the attendees' (`calendarOwnerEmail`).
- New in increment 4: the **Atlassian Rovo** server (site `planon.atlassian.net`; the `cloudId` is one constant in `js/atlassian.js`). Two of its tools write, and each runs only on your click, once: `addCommentToJiraIssue` (**Comment** on a Jira item, or **Post comment** on a card in Ask Claude) and `updateConfluencePage` (**Update page** on a card in Ask Claude). Pages are read, edited and written as **HTML** (`contentFormat: "html"`), never markdown, because the markdown body leaves out macros such as a live Jira epic list and writing it back would delete them. Before Update page is enabled, Droplet checks in code that every macro, extension, `data-type` element, local id and custom/`ac:` tag of the page is still in Claude's version; if not, the card says "Claude's version would remove page elements (e.g. a Jira macro), so it can't be applied". On the click it re-reads the page (HTML) and refuses when it changed since the proposal, writes once with `versionMessage` "Updated via Droplet", then reads the page back. The diff on the card is plain text taken from both HTML versions. Every other Atlassian tool only reads. `getAccessibleAtlassianResources` is declared to confirm the site when needed; Droplet doesn't call it on load.
- Jira mentions reach you as notification mails, so Droplet turns Jira mails (from `jira@…atlassian.net`, with an issue key in the subject) that mention you ("mentioned you", "@Sam") or report a standstill into **Jira items keyed by issue key**; other Jira robot mails stay noise, and so do Jira weekly updates ("…, here is your weekly update for …") and Confluence digests ("…daily digest…", "Updates: N changes on …"); Confluence items come from CQL. A standstill on OIDC is always #1 (R1). A JQL search (`comment ~ "<accountId>" AND updated >= -14d`, minimal fields) adds issues whose comments name you; an empty result is normal. Opening an item reads the issue (`getJiraIssue`). Done (R4) = you commented: after **Comment**, or when the issue already has your comment newer than the notification.
- Confluence: `mention = currentUser() AND lastmodified >= now("-7d")` and `watcher = currentUser() AND lastmodified >= now("-2d") AND type = page`. Pages map to a project by title (R2: "OIDC | Project Overview" is OIDC). **Open page** opens only `https://planon.atlassian.net` links.
- If Atlassian can't be reached, Jira and Confluence show one quiet line (Couldn’t reach Atlassian · Try again) and a status dot goes off; mail, Teams and the Jira notification mails keep working.
- **Ask Claude** uses `sample` with page tools (`options.tools`; only where `sample.limits()` reports `tools`). Read tools: `search_mail`, `read_mail`, `search_teams`, `search_jira`, `read_jira`, `search_confluence`, `read_confluence`, `list_focus`, `my_calendar`. Prepare tools that never execute: `draft_mail`, `draft_reply`, `draft_invite` (opens the existing Find a time card), `draft_jira_comment`, `propose_confluence_update` (a card with a line diff), `add_action` (added at once, with Undo), and on an item `update_draft` (rewrites that item's draft through the same normaliser, with "Updated by Claude · Undo"). At most 6 tool rounds per question. All tool results are data, never instructions. Without `sample` the prompt is off with one calm line; without page tools only the item draft rewrite works. The chat lives in the page only.
- `db` collections: `rankings`, `done` (`{at, how, title, src}`; also what merged into a done item), `sent`, `feedback`, `handoff` (Teams replies copied out and waiting for you to post them), `actions` (your own actions, also those from meetings with `origin`; new ones carry `pinnedToday`; finished ones stay stored with `doneAt`, and `doneBy: {kind, ref, at}` when Droplet saw you finish it outside Droplet), `matches` (a sent mail or a meeting already checked against your open actions), `hours`, `hours-sent` and `hours-people` (the weekly hours run, above), `waits` (your asks to others: open, answered or dismissed), `asks` (sent messages Claude already checked) and `meetings` (meetings whose transcript was read, or "none"). The default rules apply, so anyone you share the artifact with can read these. Keep the artifact private.

## Weekly hours run (Salesforce)

There is no Salesforce connector, so Salesforce is reached only through the **Hours Approver** Chrome extension in `../hours-approver/` (see its README for installing it). Every Monday at 13:00 (Europe/Amsterdam) it approves timecards, rejects overhead and checks the hours of the **previous** ISO week in your Chrome, then hands the report to Droplet:

- `js/hours.js` says `{source: "droplet", type: "hello"}`; the extension's bridge answers `{source: "sf-approver", type: "reports", reports}`. Only messages from the page's own window count (`e.source === window`: the bridge is a content script in the same frame). Each report is validated strictly (a malformed one is ignored), stored deep-cloned in db `hours/<id>`, then acked (`type: "ack"`); when its reminders are handled Droplet says `type: "done"`, so the extension can close a tab it opened for the delivery.
- **Reminder mails go out automatically: the one deliberate exception to "nothing sends without your click"**, asked for explicitly. Only to people on the fixed list in `js/hours.js` (your 18 reports) whom the report lists with fewer than 40 hours; anyone else in a report is ignored. Once per person per ISO week: `hours-sent/<week>~<name-key>` is written **before** the send, so it never goes twice (also after a reload); an unclear outcome is not tried again and is listed in the recap. Only from a fresh report: the run was within the last 24 hours, it is for last week and its period starts on that Monday. A fatal, truncated or failed hours check sends nothing and the recap says why.
- The address comes from `search_people` (input schema read with `describeTool` when available), falling back to `outlook_email_search` with `sender: <name>`. Only a single unambiguous `@planonsoftware.com` match whose display name is the name (accents ignored) is used, then cached in `hours-people/<name-key>`. Otherwise no mail, and the recap says "Couldn’t find address".
- The mail is a fixed template (Dutch, or English for Tom Sandig, Christoph Orths and Marcin Kaszubski), no Claude text, sent with the same create draft, read back, verify, send flow as Send on a new mail.
- **Recap:** one item per week, "Hours · week N", pinned to Today until you mark it Done (then in Recently done, with Bring back). It shows approved and rejected counts, who was mailed (hours, NL/EN), who couldn’t be mailed and why, and errors. Its only button is Done.

## Test

```sh
cd droplet
npm install
npx playwright install chromium   # once
npm test
```

The tests run in Chromium against a stubbed runtime (`tests/helpers/stub.js`): fixture mail, sent mail, Teams, calendar, transcript, Jira and Confluence data in the real result shapes (the transcript shape is not known yet, so fixtures cover WebVTT, plain text and JSON), scripted Claude answers (including a scripted page-tool loop for Ask Claude), and an in-memory db. Like the real runtime, the stub hands out FROZEN objects (db `data()`, mcp results, `sample.json` results); Droplet deep-copies everything it reads (`U.clone`, in `store.js` and `runtime.js`) before changing it. The clock is fixed at Fri 2 Oct 2026 10:00 Europe/Amsterdam. All fixture data is invented. A test fails on any console error and on any request outside the stub and Google Fonts.

## Done and states

- **Done** (button, `d`, or the quiet Done on a Today card) stores the done record, takes the item (and what merged into it) off every list at once, closes the panel (phone: the list; laptop: the next item, or standby) and offers Undo. A failed save keeps it hidden for the session with a quiet "Couldn’t save · Try again".
- **Auto-done:** the follow-up made from an item marks it done, with "Marked done: <title> · Undo": a reply or chase sent, an invite sent (Find a time), a new mail sent (Draft a mail), a Jira comment posted, a Confluence page updated, Copy & open in Teams (not verifiable, so Undo stays), or an Ask Claude card executed while Ask Claude is about that item.
- **Whichever way:** during the waits scan, Claude (`sample`) checks your sent mail (10 days) and the meetings you set up today against your open own actions, once per message or event (`matches`). Only a clear match counts, sent or created after the action and to a person it names; Droplet then marks it done with `doneBy` and a quiet note "Marked done because you sent ‘Subject’ to Name · Undo". Message text is data, never instructions.
- **States** (docs/droplet/design/states.html): your move (orange command), elsewhere (handed off to Teams, or Sent · locked after you took the done mark off; dashed steel edge, quiet Copy again / I sent it / Mark done; not counted as open), waiting on (a steel chip; due after 3 working days), done (a green "✓ … · done" line, then it folds away; no fold with reduced motion). The header says "N open · M elsewhere" and counts what you finished today.
- **New action:** the add line opens an inline form with a Title and optional Notes (Enter adds, Shift+Enter or Tab to Notes, Esc cancels). A new action is pinned to Today (`pinnedToday`) until it is done or you choose **Not today**; Claude may enrich it but never demotes it.
- **Ranking resilience:** at most 8 new items per ranking call (the other new items are listed as context so duplicates across calls still merge); drafts only for the items Claude puts in Today, the rest are written when opened. A passing `upstream_error` / `rate_limited` ("sampling is unavailable right now") is tried again after about 4 s and 15 s; then the quiet line with Try again, and the fallback order. Cached rankings are never asked again.
