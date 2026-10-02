# Droplet

Your focus list as a claude.ai Artifact (plain HTML/CSS/JS, no build). Sources: Outlook mail, Teams chats, your own actions, today's calendar (only to apply R5), your asks to others that are still unanswered (R3), and commitments you made in meetings (R6, from transcripts). Everything goes into one focus list with one Claude ranking. Nothing is sent without your click, and Droplet never posts in Teams.

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
- **Tools that write** are exactly these four, and each runs only on your click: `outlook_create_reply_draft` and `outlook_send_draft` (Send on a reply, or Chase by mail), `outlook_create_draft` with `outlook_send_draft` (Send on a new mail), and `outlook_create_event` (Send invite). Every other declared tool only reads.
- R3 reads Sent Items (`outlook_email_search`, 10 days), your Teams messages (`chat_message_search`, 10 days) and, while waits are open, the Inbox of 10 days to see replies. Chasing happens in Teams: Droplet copies the text and opens a `teams.microsoft.com` chat. For people outside Planon, Chase by mail is the primary action.
- R6 reads your ended meetings of today and the 2 working days before (`outlook_calendar_search`), each event once (`read_resource` on `calendar:///events/…`), and its `meetingTranscriptUrl` verbatim. Find a time reads your calendar and, where shared with you, the attendees' (`calendarOwnerEmail`).
- `db` collections: `rankings`, `done`, `sent`, `feedback`, `handoff` (Teams replies copied out and waiting for you to post them), `actions` (your own actions, also those from meetings with `origin`; finished ones stay stored with `doneAt`), `waits` (your asks to others: open, answered or dismissed), `asks` (sent messages Claude already checked) and `meetings` (meetings whose transcript was read, or "none"). The default rules apply, so anyone you share the artifact with can read these. Keep the artifact private.

## Test

```sh
cd droplet
npm install
npx playwright install chromium   # once
npm test
```

The tests run in Chromium against a stubbed runtime (`tests/helpers/stub.js`): fixture mail, sent mail, Teams, calendar and transcript data in the real result shapes (the transcript shape is not known yet, so fixtures cover WebVTT, plain text and JSON), scripted Claude answers, and an in-memory db. The clock is fixed at Fri 2 Oct 2026 10:00 Europe/Amsterdam. All fixture data is invented. A test fails on any console error and on any request outside the stub and Google Fonts.
