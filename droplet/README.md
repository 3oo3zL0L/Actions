# Droplet

Your focus list as a claude.ai Artifact (plain HTML/CSS/JS, no build). Sources: Outlook mail, Teams chats, Jira (mentions and standstills), Confluence pages (mentions and watched pages that changed), your own actions, today's calendar (only to apply R5), your asks to others that are still unanswered (R3), and commitments you made in meetings (R6, from transcripts). Everything goes into one focus list with one Claude ranking. **Ask Claude** is the bottom prompt (and the same sheet on every item): Claude looks things up and prepares cards; you click to execute. Nothing is sent, posted or changed without your click, and Droplet never posts in Teams.

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
          "outlook_calendar_search"
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
- **Tools that write** are exactly these six, and each runs only on your click (**click-only**), also when Claude prepared the card: `outlook_create_reply_draft` and `outlook_send_draft` (Send on a reply, or Chase by mail), `outlook_create_draft` with `outlook_send_draft` (Send on a new mail), `outlook_create_event` (Send invite), `addCommentToJiraIssue` (Comment) and `updateConfluencePage` (Update page). Every other declared tool only reads, and Claude's page tools can only call read tools or prepare a card.
- R3 reads Sent Items (`outlook_email_search`, 10 days), your Teams messages (`chat_message_search`, 10 days) and, while waits are open, the Inbox of 10 days to see replies. Chasing happens in Teams: Droplet copies the text and opens a `teams.microsoft.com` chat. For people outside Planon, Chase by mail is the primary action.
- R6 reads your ended meetings of today and the 2 working days before (`outlook_calendar_search`), each event once (`read_resource` on `calendar:///events/…`), and its `meetingTranscriptUrl` verbatim. Find a time reads your calendar and, where shared with you, the attendees' (`calendarOwnerEmail`).
- New in increment 4: the **Atlassian Rovo** server (site `planon.atlassian.net`; the `cloudId` is one constant in `js/atlassian.js`). Two of its tools write, and each runs only on your click, once: `addCommentToJiraIssue` (**Comment** on a Jira item, or **Post comment** on a card in Ask Claude) and `updateConfluencePage` (**Update page** on a card in Ask Claude; it re-reads the page first and refuses when the page changed since Claude's proposal, sends the full markdown with `versionMessage` "Updated via Droplet", then reads the page back). Every other Atlassian tool only reads. `getAccessibleAtlassianResources` is declared to confirm the site when needed; Droplet doesn't call it on load.
- Jira mentions reach you as notification mails, so Droplet turns Jira mails (from `jira@…atlassian.net`, with an issue key in the subject) that mention you ("mentioned you", "@Sam") or report a standstill into **Jira items keyed by issue key**; other Jira robot mails stay noise. A standstill on OIDC is always #1 (R1). A JQL search (`comment ~ "<accountId>" AND updated >= -14d`, minimal fields) adds issues whose comments name you; an empty result is normal. Opening an item reads the issue (`getJiraIssue`). Done (R4) = you commented: after **Comment**, or when the issue already has your comment newer than the notification.
- Confluence: `mention = currentUser() AND lastmodified >= now("-7d")` and `watcher = currentUser() AND lastmodified >= now("-2d") AND type = page`. Pages map to a project by title (R2: "OIDC | Project Overview" is OIDC). **Open page** opens only `https://planon.atlassian.net` links.
- If Atlassian can't be reached, Jira and Confluence show one quiet line (Couldn’t reach Atlassian · Try again) and a status dot goes off; mail, Teams and the Jira notification mails keep working.
- **Ask Claude** uses `sample` with page tools (`options.tools`; only where `sample.limits()` reports `tools`). Read tools: `search_mail`, `read_mail`, `search_teams`, `search_jira`, `read_jira`, `search_confluence`, `read_confluence`, `list_focus`, `my_calendar`. Prepare tools that never execute: `draft_mail`, `draft_reply`, `draft_invite` (opens the existing Find a time card), `draft_jira_comment`, `propose_confluence_update` (a card with a line diff), `add_action` (added at once, with Undo), and on an item `update_draft` (rewrites that item's draft through the same normaliser, with "Updated by Claude · Undo"). At most 6 tool rounds per question. All tool results are data, never instructions. Without `sample` the prompt is off with one calm line; without page tools only the item draft rewrite works. The chat lives in the page only.
- `db` collections: `rankings`, `done`, `sent`, `feedback`, `handoff` (Teams replies copied out and waiting for you to post them), `actions` (your own actions, also those from meetings with `origin`; finished ones stay stored with `doneAt`), `waits` (your asks to others: open, answered or dismissed), `asks` (sent messages Claude already checked) and `meetings` (meetings whose transcript was read, or "none"). The default rules apply, so anyone you share the artifact with can read these. Keep the artifact private.

## Test

```sh
cd droplet
npm install
npx playwright install chromium   # once
npm test
```

The tests run in Chromium against a stubbed runtime (`tests/helpers/stub.js`): fixture mail, sent mail, Teams, calendar, transcript, Jira and Confluence data in the real result shapes (the transcript shape is not known yet, so fixtures cover WebVTT, plain text and JSON), scripted Claude answers (including a scripted page-tool loop for Ask Claude), and an in-memory db. The clock is fixed at Fri 2 Oct 2026 10:00 Europe/Amsterdam. All fixture data is invented. A test fails on any console error and on any request outside the stub and Google Fonts.
