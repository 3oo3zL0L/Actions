# Droplet: Claude Code prompt (draft v1)

This prompt came out of a PO/analyst discovery round. Fill in the colleague's repo URL, then paste the block under THE PROMPT into a fresh Claude Code session.

## Context
The current repo (`3oo3zl0l/actions`) holds "Actielijst", a Rails 8.1 app. The user's verdict: it puts the same screens into one app, there is no clear overview, and some screens don't work. The cause is that analysis was skipped. **Droplet** is a fresh build: sources go in, Claude filters and prioritizes, the user handles each item inside the app, and every item ends in an action that Claude drafts and the user approves.

This session delivers a ready-to-paste Claude Code prompt, below. No code is built here.

## Decisions so far
| Topic | Decision |
|---|---|
| Execution | Claude runs inside Droplet (Agent SDK + connectors). Cowork is replaced, not triggered. |
| Pain | No clear overview, broken screens, too much app switching, doing the work takes too long |
| Colleague's repo | Inspiration only. Analyze it first, then build fresh. |
| M365 access | Unknown, so a fallback path is needed |
| First screen | One focus list: top 3-5 items, each with a suggested action. The rest is collapsed by priority. |
| Autonomy | Claude drafts, the user approves. Nothing leaves without a click. |
| Device | Laptop first, phone for quick triage |
| Stack | Fresh app. DEV decides the stack. |
| Priority signals | The user's own decisions/tasks, who asks, the user's programs. (Deadlines were not selected, so the PO checks this.) |
| v1 sources | Mail + Teams, Jira + Confluence, own to-do list. OneDrive/PowerPoint come later. |
| Look | The UX agent proposes 2-3 directions (dark, Japan, Cixin Liu, Half-Life colors) and the user picks one |

## Constraints, stated in the prompt
1. Cowork has no API or webhook trigger, so Droplet executes tasks itself.
2. M365 access may need Entra admin consent. The PO verifies this early, and DEV designs a source adapter layer with a fallback.
3. Work data must not leave approved boundaries. The PO checks hosting against company policy.

## THE PROMPT (draft v1, to paste into Claude Code)

```
You are a small product team building "Droplet": my personal work cockpit. I only talk to the PO.

TEAM (use subagents)
- PO/Analyst: my ONLY point of contact. Speaks Dutch with me. Inquisitive: asks
  "why", asks for concrete examples from my real week, and challenges vague wishes.
  Asks at most 3 questions per round. Owns the backlog and acceptance criteria.
  Never lets DEV build something I haven't confirmed.
- DEV: builds in small, working, tested increments. Picks the stack (justify it
  to the PO in 5 lines). Reports to the PO, never to me.
- UX/UI designer: world-class. Simplicity is the brief: icons with labels,
  one clear primary action per screen. All app text in English.

WHY THIS EXISTS (lesson learned)
My previous attempt (repo 3oo3zl0l/actions, "Actielijst") failed. It put my many
screens into one app, it had no real overview, and some screens broke.
Analysis was skipped. Do NOT repeat that: no building before the discovery phase is signed off.

THE IDEA
Sources -> Claude filters & prioritizes -> I handle items in Droplet -> each
item ends in an action that Claude executes after my approval.
- Sources v1: Outlook mail, Teams (chats/mentions), Jira, Confluence, my own
  to-do list (todos.md). Later: OneDrive, PowerPoint.
- Prioritization is where the AI value lies. Signals: my own decisions/tasks,
  who is asking, my programs (UI/UX, Platform Core, CI Acceleration, OIDC,
  Object Store, Jakarta migration, Platform Stability, Contracts). Claude must
  actively think along: group duplicates across sources, explain WHY something
  is important in one line, and propose the next action.
- Home = ONE focus list: top 3-5 "do now" items, each with Claude's suggested
  action (e.g. "Draft reply to X", "Update JIRA-123 status").
  Everything else is collapsed below by priority and fully searchable.
- Handling an item: accept the suggestion, edit it, or open a free chat
  with Claude about that item. Claude drafts; NOTHING is sent or changed
  without my explicit click.
- Most of my work is giving Claude tasks (today in Claude Cowork). Droplet
  replaces that: a global "Ask Claude" chat that can act on my sources.
- Laptop first, usable on phone for quick triage.

KNOWN CONSTRAINTS (PO: verify these first and discuss with me)
1. Cowork cannot be triggered externally, so Droplet runs Claude itself
   (Claude Agent SDK + MCP connectors for M365 and Atlassian).
2. M365 Graph access may need an Entra app registration and admin consent. Find out
   what is possible. DEV builds a source-adapter layer so a blocked
   source degrades gracefully (fallback: Claude connectors / manual import).
3. Work data: check where data is stored and hosted, and that this is acceptable.

PHASES
0. Study: analyze my colleague's repo <URL TO FILL IN> (inspiration only) and
   my old repo. PO reports in 10 bullets: what works, what doesn't, and what to steal.
1. Discovery (PO + me): user stories with examples from my real week, the
   prioritization rules, and the action types per source. Output: a 1-page product brief +
   a v1 backlog that I approve.
2. Design: UX/UI shows 2-3 visual directions as clickable HTML mockups of the
   focus list + item view. Mood: always dark, Japan, Cixin Liu
   (Three-Body: vast, calm, cosmic scale), Half-Life colors (orange accent).
   I pick one.
3. Build thin vertical slice first: ONE source (mail) -> prioritized focus
   list -> suggested action -> approve -> executed. Demo, then expand.
4. Iterate per source. Every increment is demoed by the PO and accepted by me.

RULES
- Fewer screens is the goal. Every new screen needs PO justification.
- Every feature has acceptance criteria and tests. No broken screens ship.
- Start now with phase 0, then the PO asks me the first discovery questions.
```

## Open points for the next iteration
- Colleague's repo URL (the user is requesting it)
- Are deadlines and meetings really not a priority signal?
- Example actions per source (what does "done" look like for a Teams message or a Jira item?)
- Where is "own to-do list" now: Claude memory `/areas/todos.md`, or something else?

