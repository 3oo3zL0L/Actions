# Hours Approver (for Droplet)

A Chrome extension that approves Salesforce timecards every Monday at 13:00 (Europe/Amsterdam) and hands the result to Droplet, which mails reminders to whoever hasn't written 40 hours.

Based on the **Salesforce Hours Approver** extension by svenb1980, from <https://github.com/svenb1980/claude> (`salesforce-approver/`). The Mass Approval automation (`content.js`), the hours check and the bridge are his work. This copy adds the weekly schedule and delivery to Droplet.

There is no Salesforce connector for claude.ai, so Salesforce is reached only through this extension. It uses your own Salesforce session in your Chrome.

## What it does

- **Every Monday at 13:00** it opens Mass Approval in a new background tab, approves timecards, rejects overhead and runs the hours report (`00OQu000005z8FVMAY`) for the **previous ISO week**: the report's date filter is set to Monday to Sunday of last week. Everyone in `reports.txt` with fewer than 40 hours is listed. Then the tab closes.
- **Catch-up:** when Chrome starts, when the extension is installed, and every 30 minutes, it checks: is it past Monday 13:00 and has this ISO week not run yet? Then it runs now. So a laptop that was off on Monday runs as soon as Chrome is back. Each week runs once (`lastRunWeek`).
- **Not signed in:** if Salesforce shows its login page (or the page doesn't load within 3 minutes), the report says `fatal: "Not signed in to Salesforce"` and Droplet sends no reminders.
- **Delivery:** reports wait in the extension until Droplet stores them. If no claude.ai tab is open after a scheduled run, it opens Droplet (`DROPLET_URL` in `background.js`) in a background tab, and closes it once Droplet has acked the report and finished its reminder mails, or after 10 minutes.
- The popup's **Approve Hours** button still runs it by hand (trigger `manual`, with the report's own filters).

The report: `{id, startedAt, finishedAt, auto, trigger: 'schedule' | 'manual', week: '2026-W40', approved, rejected, errors, rows: [{label, assignment, outcome, error?}], fatal, hours: {week, period, required, checked, missing: [{name, hours, inReport}], truncated} | {error}}`.

## Install

1. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose this `hours-approver` folder.
2. Sign in to Salesforce (`https://planonsoftware.lightning.force.com`) in the same Chrome profile, and stay signed in.
3. Sign in to claude.ai in that profile, and open Droplet once so its Microsoft 365 access is granted.
4. Keep Chrome running on Mondays around 13:00 (it may be in the background). If it was closed, the run happens when Chrome starts again that week.

## Test

```sh
node test/schedule.test.js
```

Plain Node, no Chrome: the next Monday 13:00 in Amsterdam, catch-up after the laptop was off, once per ISO week, and daylight saving time.

## Files

- `schedule.js`: when the run is due (pure functions, also used by the test).
- `background.js`: alarms, the scheduled run, the hours report (Analytics API), the waiting reports, delivery to Droplet.
- `content.js`: the Mass Approval automation and the run report.
- `bridge.js`: runs in claude.ai pages; talks to Droplet (`source: 'droplet'`) and to the older Action Desk (`source: 'action-desk'`).
- `popup.html` / `popup.js`: the manual button and the status.
- `reports.txt`: whose hours are checked.
