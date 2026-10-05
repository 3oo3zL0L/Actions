/* Robust, progressive loading: saved state first, every source bounded by a
   timeout, one quiet line per source, permissions read without prompting,
   and diagnostics a user can copy into a bug report. */
const { test, expect } = require('./helpers/harness');
const { teamsConfig, TID } = require('./helpers/fixtures');
const { atlConfig, PLAN4 } = require('./helpers/fixtures4');

/* Short app timeouts so a hanging call settles quickly in a test. */
const FAST = { callMs: 700, pageMs: 900, storeMs: 700, useMs: 1500, sampleMs: 900, rankDebounceMs: 50 };
const ACTION = (text) => ({ text, created: '2026-10-01T08:00:00.000Z', done: false, doneAt: null, due: null, dueBy: null, notes: '' });
const SEED = { 'actions/act-one': ACTION('Plan DoD follow-up meeting'), 'actions/act-two': ACTION('Review the SIEM test plan') };
/* Mail, Teams, Jira and Confluence together. */
function both(over = {}) {
  const a = atlConfig();
  delete a.rankPlan;
  return teamsConfig(Object.assign(a, { planExtra: PLAN4 }, over));
}
const has = (page, id) => page.evaluate((i) => !!window.Droplet.state.byId[i], id);
const actionRow = (page, text) => page.locator('#focus .fi, #restList li').filter({ hasText: text });

test.describe('Hanging sources never block the page', () => {
  test('a hanging get_me: mail renders, Teams uses the Atlassian email, diagnostics say timeout', async ({ app, page }) => {
    await app.boot(teamsConfig({ hang: { tools: ['get_me'] }, dropletConfig: FAST, atlassian: { issues: {}, pages: {} } }));
    expect(await app.focusIds()).toContain('a3-bram');
    expect(await app.focusIds()).toContain(TID('iris')); // Teams knew which messages are yours
    await expect(page.locator('[data-note="teams"]')).toHaveCount(0);
    await expect(page.locator('[data-loading]')).toHaveCount(0);
    await page.click('#diagBtn');
    await expect(page.locator('[data-diag-src="me"] .d-state')).toHaveText('timeout · using the Atlassian email');
    await expect(page.locator('[data-diag-src="mail"] .d-state')).toHaveText('ok');
  });

  test('a hanging mail search: Teams and Atlassian render, mail becomes a timeout note with Try again', async ({ app, page }) => {
    await app.boot(both(({ hang: { tools: ['outlook_email_search'] }, dropletConfig: FAST })));
    expect(await app.focusIds()).toContain(TID('iris'));
    expect(await has(page, 'conf:9001')).toBe(true);
    expect(await has(page, 'a3-bram')).toBe(false);
    await expect(page.locator('[data-note="mail"]')).toContainText('Couldn’t reach your Outlook mail: no answer in time.');
    await expect(page.locator('[data-note="mail"] button')).toHaveText('Try again');
    await expect(page.locator('[data-loading]')).toHaveCount(0);
    await expect(page.locator('.loading-line')).toHaveCount(0);
  });

  test('a hanging Atlassian call: mail and Teams render, Atlassian becomes its own note', async ({ app, page }) => {
    await app.boot(both(({ hang: { servers: ['Atlassian Rovo'] }, dropletConfig: FAST })));
    const ids = await app.focusIds();
    expect(ids).toContain('a3-bram');
    expect(await has(page, TID('iris'))).toBe(true);
    expect(await has(page, 'conf:9001')).toBe(false);
    await expect(page.locator('[data-note="atl"]')).toContainText('Couldn’t reach Atlassian.');
    await expect(page.locator('[data-note="mail"]')).toHaveCount(0);
    await expect(page.locator('.status [data-dot="atlassian"] i.off')).toHaveCount(1);
  });

  test('a hanging sample: the list shows newest first and says Claude didn’t answer in time', async ({ app, page }) => {
    await app.boot({ hang: { sample: true }, dropletConfig: FAST });
    await expect(page.locator('[data-note="rank"]')).toContainText('Claude didn’t answer in time, so new mail is newest first.');
    expect(await app.focusIds()).toEqual(['jira:OIDC-77', 'a2-anouk', 'inj-eve', 'a3-bram', 'a4-lena']);
    await expect(page.locator('[data-note="rank"] button')).toHaveText('Try again');
  });

  test('a hanging db read: a timeout note with Try again; mail renders and a new action works in memory', async ({ app, page }) => {
    await app.boot({ hang: { dbGet: true }, dropletConfig: FAST });
    await expect(page.locator('[data-note="store"]')).toContainText('Couldn’t load your saved items.');
    await expect(page.locator('[data-note="store"] button')).toHaveText('Try again');
    expect(await app.focusIds()).toHaveLength(5);
    await page.fill('#addIn', 'Call the hosting vendor today');
    await page.press('#addIn', 'Enter');
    await expect(actionRow(page, 'Call the hosting vendor today')).toHaveCount(1);
    await app.ready();
    await expect(actionRow(page, 'Call the hosting vendor today')).toHaveCount(1);
  });

  test('a db read that answers after its timeout is still taken: the note goes and the saved actions appear', async ({ app, page }) => {
    await app.boot({ dbSeed: SEED, hang: { dbDelayMs: 1500 }, dropletConfig: FAST });
    await expect(page.locator('[data-note="store"]')).toContainText('Couldn’t load your saved items.');
    await expect(actionRow(page, 'Plan DoD follow-up meeting')).toHaveCount(1, { timeout: 4000 });
    await expect(page.locator('[data-note="store"]')).toHaveCount(0);
    await app.ready();
  });
});

test.describe('Persistence: your own actions always show after a reload', () => {
  test('every connector and Claude hang forever: the actions render within a few seconds; loading lines become notes', async ({ app, page }) => {
    await app.boot({ dbSeed: SEED, hang: { tools: true, sample: true }, dropletConfig: { callMs: 2500, pageMs: 3000, storeMs: 2500, sampleMs: 3000, rankDebounceMs: 50 } }, { wait: false });
    const t0 = Date.now();
    await expect(actionRow(page, 'Plan DoD follow-up meeting')).toHaveCount(1, { timeout: 2000 });
    await expect(actionRow(page, 'Review the SIEM test plan')).toHaveCount(1);
    expect(Date.now() - t0).toBeLessThan(2000);
    // While the connectors hang, each section says it is loading.
    await expect(page.locator('[data-loading="mail"]')).toHaveText('Loading mail…');
    await expect(page.locator('[data-loading="teams"]')).toBeVisible();
    await expect(page.locator('[data-loading="atl"]')).toBeVisible();
    // After the longest timeout every loading line has become a note.
    await expect(page.locator('[data-loading]')).toHaveCount(0, { timeout: 6000 });
    await expect(page.locator('[data-note="mail"]')).toContainText('no answer in time');
    await expect(page.locator('[data-note="teams"]')).toContainText('Couldn’t reach Teams');
    await expect(page.locator('[data-note="atl"]')).toContainText('Couldn’t reach Atlassian');
    await expect(actionRow(page, 'Plan DoD follow-up meeting')).toHaveCount(1);
    await app.ready();
  });

  test('add an action, reload with every connector hanging: it is still there', async ({ app, page }) => {
    await app.boot({ dropletConfig: FAST });
    await page.fill('#addIn', 'Plan DoD follow-up meeting, Friday');
    await page.press('#addIn', 'Enter');
    await app.ready();
    const db = await app.db();
    expect(Object.keys(db).filter((k) => k.startsWith('actions/'))).toHaveLength(1);
    await page.evaluate(() => sessionStorage.setItem('__droplet_stub_hang', JSON.stringify({ tools: true, sample: true })));
    await page.reload();
    await expect(actionRow(page, 'Plan DoD follow-up meeting')).toHaveCount(1, { timeout: 2000 });
    await expect(page.locator('[data-loading]')).toHaveCount(0, { timeout: 5000 });
    await expect(actionRow(page, 'Plan DoD follow-up meeting')).toHaveCount(1);
    await app.ready();
  });
});

test.describe('Progressive sources', () => {
  test('one source failing and one hanging do not block the others; mail shows before Teams settles', async ({ app, page }) => {
    await app.boot(both(({
      hang: { tools: ['chat_message_search'] }, faults: { atlassianUserInfo: 'server_unavailable' },
      dropletConfig: { callMs: 2500, pageMs: 2500, storeMs: 2500, sampleMs: 3000, rankDebounceMs: 50 }
    })), { wait: false });
    // Mail is ranked and shown while Teams is still on its way.
    await expect(page.locator('[data-id="a3-bram"]')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('[data-loading="teams"]')).toBeVisible();
    await expect(page.locator('[data-note="atl"]')).toContainText('Couldn’t reach Atlassian');
    await app.ready();
    await expect(page.locator('[data-note="teams"]')).toContainText('Couldn’t reach Teams');
    await expect(page.locator('[data-note="mail"]')).toHaveCount(0);
    expect(await app.focusIds()).toContain('a3-bram');
    expect(await has(page, 'conf:9001')).toBe(false);
    // Try again on Teams reloads only Teams.
    await page.evaluate(() => window.__stub.setHang(null));
    const inbox = async () => (await app.calls('mcp')).filter((c) => c.tool === 'outlook_email_search' && c.input.folderName === 'Inbox' && c.input.afterDateTime === '3 days ago').length;
    const before = await inbox();
    await page.click('[data-retry="teams"]');
    await app.ready();
    expect(await inbox()).toBe(before);
    expect(await has(page, TID('iris'))).toBe(true);
    await expect(page.locator('[data-note="teams"]')).toHaveCount(0);
  });
});

test.describe('Permissions', () => {
  test('"prompt": one calm line; request() only on the click, only once, then the line is gone', async ({ app, page }) => {
    await app.boot({ permissions: { mcp: 'prompt', 'mcp:Microsoft 365': 'prompt', sample: 'granted', db: 'granted' } });
    await expect(page.locator('[data-note="perm"]')).toContainText('Droplet needs access to your connectors.');
    await expect(page.locator('[data-note="perm"] button')).toHaveText('Allow');
    expect((await app.calls('perm')).filter((c) => c.op === 'request')).toEqual([]);
    expect(await app.focusIds()).toHaveLength(5); // "prompt" never gates rendering
    await page.click('[data-perm-allow]');
    await expect(page.locator('[data-note="perm"]')).toHaveCount(0);
    const req = (await app.calls('perm')).filter((c) => c.op === 'request');
    expect(req).toEqual([{ kind: 'perm', op: 'request', names: ['mcp'] }]);
    await app.ready();
    expect((await app.calls('perm')).filter((c) => c.op === 'request')).toHaveLength(1);
  });

  test('"prompt" that the viewer declines: the denied line, and no second request', async ({ app, page }) => {
    await app.boot({ permissions: { mcp: 'prompt', sample: 'prompt', db: 'granted' }, permAfterRequest: { mcp: 'denied', sample: 'granted' } });
    await page.click('[data-perm-allow]');
    await expect(page.locator('[data-note="perm"]')).toContainText('Allow Droplet to use Microsoft 365 in the artifact’s permissions, then reload.');
    await expect(page.locator('[data-note="perm"] button')).toHaveCount(0);
    await page.click('[data-sync]');
    await app.ready();
    expect((await app.calls('perm')).filter((c) => c.op === 'request')).toHaveLength(1);
  });

  test('denied permissions say which and how to fix it; nothing is requested', async ({ app, page }) => {
    await app.boot({ permissions: { mcp: 'denied', 'mcp:Microsoft 365': 'granted', 'mcp:Atlassian Rovo': 'denied', sample: 'denied', db: 'granted' } });
    await expect(page.locator('[data-note="perm"]')).toHaveText(/Allow Droplet to use Atlassian Rovo and Claude in the artifact’s permissions, then reload\./);
    await expect(page.locator('[data-perm-allow]')).toHaveCount(0);
    expect((await app.calls('perm')).filter((c) => c.op === 'request')).toEqual([]);
  });

  test('everything granted: no permissions line', async ({ app, page }) => {
    await app.boot({ permissions: { mcp: 'granted', sample: 'granted', db: 'granted' } });
    await expect(page.locator('[data-note="perm"]')).toHaveCount(0);
  });
});

test.describe('Diagnostics', () => {
  test('tapping the status strip shows each source; Copy details has states but no addresses or content', async ({ app, page }) => {
    await page.addInitScript(() => {
      window.__copied = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } } });
    });
    await app.boot(both(({
      hang: { servers: ['Atlassian Rovo'] },
      faults: { chat_message_search: { code: 'tool_error', message: 'Denied for sam.devries@planonsoftware.com see https://x.example/a' } },
      dropletConfig: FAST
    })));
    await expect(page.locator('#diag')).toBeHidden();
    await page.click('.status [data-dot="teams"]');
    await expect(page.locator('#diag')).toBeVisible();
    await expect(page.locator('#diagBtn')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-diag-src="mail"] .d-state')).toHaveText('ok');
    await expect(page.locator('[data-diag-src="saved"] .d-state')).toHaveText('ok');
    await expect(page.locator('[data-diag-src="atl"] .d-state')).toHaveText('timeout');
    await expect(page.locator('[data-diag-src="teams"] .d-state')).toHaveText('error · tool_error');
    await expect(page.locator('[data-diag-src="teams"] .d-msg')).toContainText('Denied for [address] see [link]');
    await expect(page.locator('[data-diag-src="mail"] .d-time')).toHaveText(/^\d\d:\d\d:\d\d$/);
    await expect(page.locator('#diag')).not.toContainText('@');

    await page.click('[data-diag-copy]');
    const copied = await page.evaluate(() => window.__copied);
    expect(copied).toHaveLength(1);
    const text = copied[0];
    expect(text).toContain('Mail: ok');
    expect(text).toContain('Jira and Confluence: timeout');
    expect(text).toContain('Teams: error · tool_error');
    expect(text).toMatch(/Items: mail \d+/);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/planonsoftware|https?:/);
    for (const subject of ['Session store', 'C4A tenant export', 'Bram', 'Anouk']) expect(text).not.toContain(subject);

    // Sync stays a Sync button, not a diagnostics toggle.
    await page.click('[data-sync]');
    await expect(page.locator('#diag')).toBeVisible();
    await app.ready();
  });
});
