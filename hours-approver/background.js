// Service worker — handles privileged operations content scripts cannot do directly.
//
// Why the REST API calls live here instead of in content.js:
//  1. The "sid" cookie set on *.lightning.force.com is a Lightning-only session and
//     is rejected by /services/data with INVALID_SESSION_ID. The API session is the
//     "sid" cookie on the org's instance domain (*.my.salesforce.com).
//  2. Calling the instance domain from a content script is a cross-origin request and
//     Salesforce does not send CORS headers unless the origin is whitelisted in Setup.
//     Fetches made from an extension service worker with matching host_permissions
//     bypass CORS entirely, so the request succeeds.

importScripts('schedule.js'); // HoursSchedule: when the Monday 13:00 run is due

const DEFAULT_API_VERSION = 'v59.0';
const MASS_APPROVAL_URL = 'https://planonsoftware.lightning.force.com/lightning/n/Mass_Approval_Lightning_Component';
// The Droplet artifact: opened in a background tab after a scheduled run when no claude.ai tab is open.
const DROPLET_URL = 'https://claude.ai/artifact/L9GCP14h56wSDUWqubY61M';

// myorg.lightning.force.com → myorg.my.salesforce.com
function toInstanceHost(host) {
  const suffix = '.lightning.force.com';
  return host.endsWith(suffix)
    ? host.slice(0, -suffix.length) + '.my.salesforce.com'
    : host;
}

// Locate the API session: the "sid" cookie on the org's instance domain.
async function getApiSession(tabUrl) {
  const pageHost  = new URL(tabUrl).hostname;
  const orgPrefix = pageHost.split('.')[0];

  const instanceUrl = `https://${toInstanceHost(pageHost)}`;
  const direct = await chrome.cookies.get({ url: instanceUrl, name: 'sid' });
  if (direct?.value) return { instanceUrl, sid: direct.value };

  // Fallback: scan every "sid" cookie and pick one on a Salesforce instance domain
  // belonging to the same org (covers sandboxes and enhanced-domain variants).
  const all        = await chrome.cookies.getAll({ name: 'sid' });
  const candidates = all.filter(c => c.domain.includes('salesforce.com'));
  const match      = candidates.find(c => c.domain.includes(orgPrefix)) ?? candidates[0];
  if (!match) return null;

  return {
    instanceUrl: `https://${match.domain.replace(/^\./, '')}`,
    sid:         match.value,
  };
}

// ── Auto-run when the Mass Approval page opens ────────────────────────────────
// Lightning is a single-page app, so a manifest content script would miss in-app
// navigation. tabs.onUpdated reports both full loads and in-app URL changes.

const MASS_APPROVAL = /^https:\/\/[^/]+\.lightning\.force\.com\/lightning\/n\/Mass_Approval_Lightning_Component/;
const lastAutoRun   = new Map(); // tabId → ms; one automatic start per tab per minute

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' && !info.url) return;
  if (!MASS_APPROVAL.test(tab.url || '')) return;

  const sched = await scheduledTab();
  if (sched && sched.tabId === tabId) { if (info.status === 'complete') onScheduledTabLoaded(tabId, tab.url); return; }

  const { autoRun = true } = await chrome.storage.local.get('autoRun');
  if (!autoRun) return;
  if (Date.now() - (lastAutoRun.get(tabId) || 0) < 60000) return;
  lastAutoRun.set(tabId, Date.now());

  await new Promise(r => setTimeout(r, 4000)); // let Lightning and the LWC components boot
  if ((await scheduledTab())?.tabId === tabId) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: () => { window.__sfApproverAuto = true; } });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch (e) { /* tab closed or navigated away */ }
});

chrome.tabs.onRemoved.addListener(tabId => lastAutoRun.delete(tabId));

// ── Weekly schedule: Monday 13:00 Europe/Amsterdam ────────────────────────────
// A "weekly" alarm at the next Monday 13:00, plus a catch-up check on startup, on
// install and every 30 minutes: past Monday 13:00 and this ISO week not run yet → run
// now (covers a laptop that was off). lastRunWeek is stored BEFORE the run starts, so
// a week never runs twice.

const SCHED_LOAD_MIN   = 3;  // the Mass Approval page must be up within 3 minutes
const SCHED_RUN_MIN    = 90; // a run that never reports is ended after 90 minutes
const DELIVERY_MIN     = 10; // a Droplet tab we opened closes after 10 minutes at most

async function scheduleAlarms() {
  await chrome.alarms.create('weekly', { when: HoursSchedule.nextRun(Date.now()) });
  const c = await chrome.alarms.get('catchup');
  if (!c) await chrome.alarms.create('catchup', { periodInMinutes: 30 });
}

let checking = null;
function checkDue() {
  if (checking) return checking;
  checking = (async () => {
    const now = Date.now();
    const { lastRunWeek = '' } = await chrome.storage.local.get('lastRunWeek');
    if (!HoursSchedule.isDue(now, lastRunWeek)) return;
    if (await scheduledTab()) return; // one is already running
    await chrome.storage.local.set({ lastRunWeek: HoursSchedule.weekKey(now), lastRunAt: now });
    await startScheduledRun(now);
  })().catch(() => {}).finally(() => { checking = null; });
  return checking;
}

async function scheduledTab() {
  const { sched = null } = await chrome.storage.local.get('sched');
  return sched;
}

// Open Mass Approval in a NEW background tab; the run starts when it has loaded.
async function startScheduledRun(now) {
  const period = HoursSchedule.previousWeek(now);
  const tab = await chrome.tabs.create({ url: MASS_APPROVAL_URL, active: false });
  await chrome.storage.local.set({ sched: { tabId: tab.id, period, startedAt: now, injected: false } });
  await chrome.alarms.create('schedLoad', { delayInMinutes: SCHED_LOAD_MIN });
  await chrome.alarms.create('schedEnd', { delayInMinutes: SCHED_RUN_MIN });
}

const LOGIN = /login\.salesforce\.com|[?&](ec=30[12]|startURL=)|\/secur\/|\/saml|login\.microsoftonline\.com/i;

async function onScheduledTabLoaded(tabId, url) {
  const sched = await scheduledTab();
  if (!sched || sched.tabId !== tabId || sched.injected) return;
  if (!MASS_APPROVAL.test(url || '')) return; // still redirecting (SSO); schedLoad decides
  sched.injected = true;
  await chrome.storage.local.set({ sched });
  await new Promise(r => setTimeout(r, 4000)); // let Lightning and the LWC components boot
  try {
    await chrome.scripting.executeScript({ target: { tabId }, args: [sched.period], func: p => {
      window.__sfApproverAuto = true; window.__sfApproverTrigger = 'schedule'; window.__sfApproverPeriod = p;
    } });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch (e) {
    await endScheduledRun(`Could not start the run on the Mass Approval page: ${e.message}`);
  }
}

// A scheduled run that can't report by itself: save a fatal report and close its tab.
async function endScheduledRun(fatal) {
  const sched = await scheduledTab();
  if (!sched) return;
  await chrome.storage.local.remove('sched');
  chrome.alarms.clear('schedLoad'); chrome.alarms.clear('schedEnd');
  chrome.tabs.remove(sched.tabId).catch(() => {});
  const report = { id: `sf-${sched.startedAt}`, startedAt: sched.startedAt, finishedAt: Date.now(), auto: true, trigger: 'schedule',
    week: sched.period.week, approved: 0, rejected: 0, errors: 0, rows: [], fatal };
  await storeReport(report);
  await deliverToDroplet(report.id);
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'weekly') { await checkDue(); await scheduleAlarms(); }
  if (alarm.name === 'catchup') { await checkDue(); }
  if (alarm.name === 'schedLoad') {
    const sched = await scheduledTab();
    if (!sched || sched.injected) return;
    const tab = await chrome.tabs.get(sched.tabId).catch(() => null);
    const sid = await chrome.cookies.getAll({ name: 'sid' }).catch(() => []);
    const signedOut = !tab || LOGIN.test(tab.url || '') || !sid.some(c => c.domain.includes('salesforce.com') || c.domain.includes('force.com'));
    await endScheduledRun(signedOut ? 'Not signed in to Salesforce' : 'The Mass Approval page did not load within 3 minutes.');
  }
  if (alarm.name === 'schedEnd') await endScheduledRun('The scheduled run did not finish within 90 minutes.');
  if (alarm.name === 'deliveryEnd') await closeDeliveryTab();
});

chrome.runtime.onStartup.addListener(async () => { await scheduleAlarms(); await checkDue(); });

// ── Delivery to Droplet ───────────────────────────────────────────────────────
// After a scheduled run: if no claude.ai tab is open, open Droplet in a background tab so
// the report gets there (Droplet sends the reminders). That tab closes when Droplet has
// acked the report AND said its reminder run is done, or after 10 minutes.

async function deliverToDroplet(reportId) {
  pushToActionDesk();
  const pages = chrome.runtime.getManifest().content_scripts?.[0]?.matches || [];
  const open = await chrome.tabs.query({ url: pages });
  if (open.length) return;
  const tab = await chrome.tabs.create({ url: DROPLET_URL, active: false });
  await chrome.storage.local.set({ delivery: { tabId: tab.id, reportId, acked: false, done: false, openedAt: Date.now() } });
  await chrome.alarms.create('deliveryEnd', { delayInMinutes: DELIVERY_MIN });
}

async function closeDeliveryTab() {
  const { delivery = null } = await chrome.storage.local.get('delivery');
  if (!delivery) return;
  await chrome.storage.local.remove('delivery');
  chrome.alarms.clear('deliveryEnd');
  chrome.tabs.remove(delivery.tabId).catch(() => {});
}

async function noteDelivery(kind, ids) {
  const { delivery = null } = await chrome.storage.local.get('delivery');
  if (!delivery || !ids.includes(delivery.reportId)) return;
  delivery[kind] = true;
  await chrome.storage.local.set({ delivery });
  if (delivery.acked && delivery.done) await closeDeliveryTab();
}

// Chrome only adds manifest content scripts to pages opened after an install or update:
// put the bridge into claude.ai tabs that are already open, so Action Desk needs no reload.
chrome.runtime.onInstalled.addListener(async () => {
  scheduleAlarms().then(checkDue);
  const pages = chrome.runtime.getManifest().content_scripts?.[0]?.matches || [];
  for (const tab of await chrome.tabs.query({ url: pages })) {
    chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['bridge.js'] }).catch(() => {});
  }
});

// ── Reports waiting for Action Desk ───────────────────────────────────────────
// content.js saves a report after each run; bridge.js (running inside the Action
// Desk artifact) collects them and acknowledges once Action Desk has stored them.

// Hand new reports to any open Action Desk right away (bridge.js passes them on).
async function pushToActionDesk() {
  const pages = chrome.runtime.getManifest().content_scripts?.[0]?.matches || [];
  for (const tab of await chrome.tabs.query({ url: pages })) {
    chrome.tabs.sendMessage(tab.id, { action: 'pushReports' }).catch(() => {});
  }
}

// One change to the waiting list at a time: a report saved while an ack is being
// handled must not be lost (both read the list, change it and write it back).
let pendingChain = Promise.resolve();
const withPending = fn => (pendingChain = pendingChain.then(fn, fn));

// Keep a report until Droplet acks it. week: the ISO week the hours check covers
// (from the run's period, else the report period's start, else the week of the run).
function storeReport(report) {
  return withPending(async () => {
    report.trigger = report.trigger === 'schedule' ? 'schedule' : 'manual';
    if (!report.week) report.week = report.hours?.week || HoursSchedule.weekKey(report.startedAt || Date.now());
    // A run with nothing approved only carries the hours check: one per period, the latest wins.
    if (!report.rows?.length && !report.fatal && report.hours) {
      report.id = `hours-${report.week}-${report.hours.period || 'unknown'}`.replace(/[^\w-]+/g, '-').slice(0, 70);
    }
    const pending = (await pendingReports()).filter(r => r.id !== report.id);
    pending.push(report);
    await chrome.storage.local.set({ pending: pending.slice(-20) });
    return report;
  });
}

async function pendingReports() {
  const { pending = [] } = await chrome.storage.local.get('pending');
  return pending;
}

// ── Hours check: everyone in reports.txt must have 40 hours in the hours report ──
// Runs the saved report through the Analytics API, so its own filters (period, team)
// apply and the numbers match what the report page shows.

const HOURS_REPORT_ID = '00OQu000005z8FVMAY';
const HOURS_REQUIRED  = 40;

// "André de Kleijn" and "Kleijn, André de" both become "andre de kleijn" sorted by word
const nameKey = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

const asNumber = cell => {
  const v = cell?.value && typeof cell.value === 'object' ? cell.value.amount : cell?.value;
  const n = typeof v === 'number' ? v : parseFloat(String(cell?.label ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Hours per person, from the report's detail rows, or from its groupings when it is
// grouped by person without details.
function hoursFromReport(rep) {
  const ext     = rep.reportExtendedMetadata || {};
  const columns = rep.reportMetadata?.detailColumns || [];
  const info    = ext.detailColumnInfo || {};
  const label   = c => info[c]?.label || c;
  const numeric = c => ['double', 'currency', 'int', 'percent'].includes(info[c]?.dataType);

  const nameCol  = columns.findIndex(c => /resource|employee|contact|person/i.test(label(c)));
  const totalCol = columns.findIndex(c => numeric(c) && /total.*hour|hours?$/i.test(label(c)) && !/day$|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(label(c)));
  const dayCols  = columns.map((c, i) => numeric(c) && /(mon|tues|wednes|thurs|fri|satur|sun)day/i.test(label(c)) ? i : -1).filter(i => i >= 0);

  const hours = new Map(); // nameKey → { name, hours }
  const add = (name, h) => {
    const k = nameKey(name);
    if (!k) return;
    const e = hours.get(k) || { name, hours: 0 };
    e.hours += h;
    hours.set(k, e);
  };

  if (nameCol >= 0 && (totalCol >= 0 || dayCols.length)) {
    for (const [key, fact] of Object.entries(rep.factMap || {})) {
      if (!key.endsWith('!T') || !Array.isArray(fact.rows)) continue;
      for (const row of fact.rows) {
        const cells = row.dataCells || [];
        const h = totalCol >= 0 ? asNumber(cells[totalCol]) : dayCols.reduce((s, i) => s + asNumber(cells[i]), 0);
        add(cells[nameCol]?.label, h);
      }
    }
    if (hours.size) return hours;
  }

  // Grouped by person: the first grouping level, with the hours aggregate.
  const aggs   = rep.reportMetadata?.aggregates || [];
  const aggIdx = aggs.findIndex(a => /hour/i.test(ext.aggregateColumnInfo?.[a]?.label || a));
  const groups = rep.groupingsDown?.groupings || [];
  if (aggIdx >= 0 && groups.length) {
    for (const g of groups) add(g.label, asNumber(rep.factMap?.[`${g.key}!T`]?.aggregates?.[aggIdx]));
    return hours;
  }
  throw new Error('Could not find a person column and an hours column in the report.');
}

function reportPeriod(rep) {
  const f = rep.reportMetadata?.standardDateFilter;
  if (f?.startDate && f?.endDate) return `${f.startDate} – ${f.endDate}`;
  return (f?.durationValue || 'report period').replace(/_/g, ' ').toLowerCase();
}

// The hours report for a given period ({start, end}, "YYYY-MM-DD"): its standard date filter
// is set to that period (the scheduled run checks the PREVIOUS week). Without a period the
// report runs with its own filters, as before.
async function runHoursReport(session, apiVersion, period) {
  const base = `${session.instanceUrl}/services/data/${apiVersion || DEFAULT_API_VERSION}/analytics/reports/${HOURS_REPORT_ID}`;
  const headers = { 'Authorization': `Bearer ${session.sid}`, 'Accept': 'application/json' };
  if (!period) {
    const res = await fetch(`${base}?includeDetails=true`, { headers });
    if (!res.ok) throw new Error(`Report API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  const d = await fetch(`${base}/describe`, { headers });
  if (!d.ok) throw new Error(`Report API ${d.status}: ${(await d.text()).slice(0, 200)}`);
  const meta = (await d.json()).reportMetadata;
  const column = meta?.standardDateFilter?.column;
  if (!column) throw new Error('The hours report has no date filter that can be set to last week.');
  meta.standardDateFilter = { column, durationValue: 'CUSTOM', startDate: period.start, endDate: period.end };
  const res = await fetch(`${base}?includeDetails=true`, {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify({ reportMetadata: meta }),
  });
  if (!res.ok) throw new Error(`Report API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rep = await res.json();
  const f = rep.reportMetadata?.standardDateFilter;
  if (f?.startDate !== period.start || f?.endDate !== period.end) throw new Error('Salesforce did not run the hours report for last week.');
  return rep;
}

async function hoursCheck(tabUrl, apiVersion, period) {
  const expected = (await fetch(chrome.runtime.getURL('reports.txt')).then(r => r.text()))
    .split('\n').map(n => n.trim()).filter(Boolean);

  const session = await getApiSession(tabUrl);
  if (!session) throw new Error('No Salesforce API session cookie found.');
  const rep = await runHoursReport(session, apiVersion, period);

  const hours   = hoursFromReport(rep);
  const missing = expected
    .map(name => ({ name, hours: Math.round((hours.get(nameKey(name))?.hours ?? 0) * 100) / 100, inReport: hours.has(nameKey(name)) }))
    .filter(p => p.hours < HOURS_REQUIRED);

  const f = rep.reportMetadata?.standardDateFilter;
  return {
    week:     period?.week || HoursSchedule.weekOfDate(f?.startDate) || '',
    period:   reportPeriod(rep),
    required: HOURS_REQUIRED,
    checked:  expected.length,
    missing,
    truncated: rep.allData === false, // more than 2,000 detail rows: totals may be incomplete
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.action === 'hoursCheck') {
    hoursCheck(sender.tab?.url, msg.apiVersion, msg.period && typeof msg.period === 'object' ? msg.period : null)
      .then(result => sendResponse({ result }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.action === 'saveReport') {
    (async () => {
      const report = await storeReport(msg.report);
      sendResponse({ ok: true });
      const sched = await scheduledTab();
      if (sched && sender.tab?.id === sched.tabId) {
        // The scheduled run reported: close its tab and get the report to Droplet.
        await chrome.storage.local.remove('sched');
        chrome.alarms.clear('schedLoad'); chrome.alarms.clear('schedEnd');
        chrome.tabs.remove(sched.tabId).catch(() => {});
        await deliverToDroplet(report.id);
      } else pushToActionDesk();
    })();
    return true;
  }

  if (msg.action === 'bridgeDone') {
    noteDelivery('done', (msg.ids || []).map(String)).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.action === 'bridgePending') {
    pendingReports().then(reports => sendResponse({ reports }));
    return true;
  }

  if (msg.action === 'bridgeAck') {
    withPending(async () => {
      const ids = new Set(msg.ids || []);
      const pending = (await pendingReports()).filter(r => !ids.has(r.id));
      await chrome.storage.local.set({ pending, lastDelivered: Date.now() });
      sendResponse({ ok: true });
    });
    noteDelivery('acked', (msg.ids || []).map(String));
    return true;
  }

  // Run a SOQL query against the Salesforce REST API on the org's instance domain.
  if (msg.action === 'soqlQuery') {
    (async () => {
      const tabUrl = sender.tab?.url;
      if (!tabUrl) return sendResponse({ error: 'No sender tab URL available.' });

      const session = await getApiSession(tabUrl);
      if (!session) {
        return sendResponse({
          error: 'No Salesforce API session cookie found. Open the org\'s ' +
                 'my.salesforce.com domain once in this browser profile, then retry.',
        });
      }

      const version = msg.apiVersion || DEFAULT_API_VERSION;
      const url = `${session.instanceUrl}/services/data/${version}/query/`
                + `?q=${encodeURIComponent(msg.soql)}`;

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.sid}`,
          'Accept':        'application/json',
        },
      });

      if (!res.ok) {
        return sendResponse({ error: `API ${res.status}: ${(await res.text()).slice(0, 200)}` });
      }

      sendResponse({ data: await res.json() });
    })().catch(err => sendResponse({ error: err.message }));

    return true; // keep channel open for async sendResponse
  }

  // Open a new tab (window.open() from content scripts is blocked by popup blockers)
  if (msg.action === 'openTab') {
    chrome.tabs.create({ url: msg.url, active: true });
    sendResponse({ ok: true });
  }

});

