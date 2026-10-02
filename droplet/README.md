# Droplet

Your focus list as a claude.ai Artifact (plain HTML/CSS/JS, no build). Sources: Outlook mail, Teams chats, your own actions, and today's calendar (only to apply R5). Everything goes into one focus list with one Claude ranking. Nothing is sent without your click, and Droplet never posts in Teams.

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
          "outlook_send_draft",
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
- `db` collections: `rankings`, `done`, `sent`, `feedback`, `handoff` (Teams replies copied out and waiting for you to post them), and `actions` (your own actions; finished ones stay stored with `doneAt`). The default rules apply, so anyone you share the artifact with can read these. Keep the artifact private.

## Test

```sh
cd droplet
npm install
npx playwright install chromium   # once
npm test
```

The tests run in Chromium against a stubbed runtime (`tests/helpers/stub.js`): fixture mail, Teams and calendar data in the real result shapes, scripted Claude answers, and an in-memory db. The clock is fixed at Fri 2 Oct 2026 10:00 Europe/Amsterdam. All fixture data is invented. A test fails on any console error and on any request outside the stub and Google Fonts.
