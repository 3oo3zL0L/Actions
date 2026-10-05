/* The real runtime hands out FROZEN objects: db snapshots and data(), mcp
   results, sample.json results (db.d.ts, mcp.d.ts). The stub freezes them
   too; Droplet works on its own copies. And ranking survives a passing
   "sampling is unavailable right now", in batches of at most 8. */
const { test, expect } = require('./helpers/harness');
const { m, T } = require('./helpers/fixtures');
const { waitsConfig, ANNA, WAIT1 } = require('./helpers/fixtures3');

const errs = (page) => page.evaluate(() => window.Droplet.state.errs.slice());
const rankCalls = async (app) => (await app.calls('sample')).filter((c) => /^You rank unread email/.test(c.input) || /You rank unread email/.test(String(c.input)));
const FAST = { rankRetryMs: [300, 600] };

test.describe('Frozen runtime data', () => {
  test('the stub really freezes db data, mcp results and sample.json results', async ({ app, page }) => {
    await app.boot({ dbSeed: { 'actions/a1': { text: 'x', created: '2026-10-01T08:00:00.000Z', done: false } } });
    const frozen = await page.evaluate(async () => {
      const db = await window.claude.use('db'), mcp = await window.claude.use('mcp'), sample = await window.claude.use('sample');
      const snap = await db.collection('actions').get();
      const r = await mcp.callTool('Microsoft 365', 'get_me', {});
      const j = await sample.json('You draft one new email for Sam');
      return [Object.isFrozen(snap.docs[0].data()), Object.isFrozen(r), Object.isFrozen(r.content[0]), Object.isFrozen(j)];
    });
    expect(frozen).toEqual([true, true, true, true]);
  });

  test('a cached ranking from the db (frozen) is attached and its draft brought into style, without an error', async ({ app, page }) => {
    await app.boot({ dbSeed: { 'rankings/a3-bram': { v: 1, pos: 1, rankedAt: '2026-10-02T07:00:00.000Z', group: 'now', rank: 1, project: 'Platform Stability', why: 'Top project.', kind: 'reply', label: 'Draft reply to Bram', draft: 'OK from me — go.\n\nSam', dupOf: null } } });
    expect(await app.focusIds()).toContain('a3-bram');
    await app.openItem('a3-bram');
    await expect(page.locator('#draftText')).toHaveValue('Hi Bram,\n\nOK from me, go.\n\nKR\nSam');
    await page.click('[data-sync]'); await app.ready(); // attach runs again on every source
    expect(await errs(page)).toEqual([]);
  });

  test('a wait read back from the db (frozen) can be answered, chased and dismissed', async ({ app, page }) => {
    await app.boot(waitsConfig());
    expect(await app.focusIds()).toContain(WAIT1);
    await page.reload(); await app.ready(); // the waits now come from the db, frozen
    await app.openItem(WAIT1);
    await page.click('[data-snooze]');
    expect((await app.db())['waits/s1-ask-0'].snoozeUntil).toBe('2026-10-06');
    await page.click('[data-undo]');
    await page.reload(); await app.ready();
    await page.evaluate((x) => window.__stub.addMail(x), m('r1-anna', ANNA.address, 'RE: SIEM test plan', 'Here it is.', T('07:45')));
    await page.click('[data-sync]'); await app.ready();
    expect((await app.db())['waits/s1-ask-0'].status).toBe('answered');
    expect(await app.focusIds()).not.toContain(WAIT1);
    expect(await errs(page)).toEqual([]);
  });

  test('own actions read from the db (frozen) can be edited, done and undone', async ({ app, page }) => {
    await app.boot({ dbSeed: { 'actions/a1': { text: 'Book the review room', created: '2026-10-01T08:00:00.000Z', done: false, doneAt: null, due: null, dueBy: null, notes: '', pinnedToday: true } } });
    await app.openItem('mine:a1');
    await page.fill('#actNotes', 'Room 4'); await page.locator('#actText').focus();
    await expect(page.locator('.toast')).toHaveText('Saved.');
    await page.click('[data-done-primary]');
    expect((await app.db())['actions/a1']).toMatchObject({ done: true, notes: 'Room 4' });
    await page.click('[data-undo]');
    expect((await app.db())['actions/a1'].done).toBe(false);
    expect(await errs(page)).toEqual([]);
  });
});

test.describe('Ranking resilience', () => {
  test('"sampling is unavailable right now" is tried again (after ~4 s, then ~15 s); the second try ranks', async ({ app, page }) => {
    await app.boot({ dropletConfig: FAST, rankFault: { code: 'upstream_error', message: 'sampling is unavailable right now — try again', times: 1 } });
    // 11 new items: a batch of 8 (failed once, then ranked) and a batch of 3.
    expect(await rankCalls(app)).toHaveLength(3);
    expect(await app.focusIds()).toEqual(['jira:OIDC-77', 'a3-bram', 'a2-anouk', 'a4-lena', 'a5-tom']);
    await expect(page.locator('[data-note="rank"]')).toHaveCount(0);
  });

  test('the default waits are about 4 s and 15 s', async ({ app, page }) => {
    await app.boot({ mail: [] });
    expect(await page.evaluate(() => window.Droplet.rt.cfg.rankRetryMs)).toEqual([4000, 15000]);
  });

  test('after two retries: the quiet line with Try again, the fallback order, and Try again ranks', async ({ app, page }) => {
    await app.boot({ dropletConfig: FAST, rankFault: { code: 'upstream_error', message: 'sampling is unavailable right now — try again', times: 3 } });
    expect(await rankCalls(app)).toHaveLength(3); // 1 + 2 retries, then it stops
    await expect(page.locator('[data-note="rank"]')).toContainText('Claude couldn’t answer just now, so new mail is newest first.');
    expect((await app.focusIds()).length).toBeGreaterThan(0);
    await page.click('[data-retry="rank"]');
    await app.ready();
    await expect(page.locator('[data-note="rank"]')).toHaveCount(0);
    expect(await app.focusIds()).toEqual(['jira:OIDC-77', 'a3-bram', 'a2-anouk', 'a4-lena', 'a5-tom']);
  });

  test('a code that is not passing (refused) is not tried again', async ({ app }) => {
    await app.boot({ dropletConfig: FAST, rankFault: { code: 'refused', times: 1 } });
    expect(await rankCalls(app)).toHaveLength(1);
  });

  test('at most 8 new items per ranking call; cached rankings are not asked again', async ({ app, page }) => {
    await app.boot();
    const calls = await rankCalls(app);
    const per = calls.map((c) => (c.input.match(/<<<(?:EMAIL|TEAMS|ACTION|WAIT|JIRA|PAGE) \d+ id=/g) || []).length);
    expect(per.every((n) => n <= 8)).toBe(true);
    expect(per.reduce((a, b) => a + b, 0)).toBe(11);
    expect(calls.length).toBe(2);
    // The second call knows what the first one ranked.
    expect(calls[1].input).toContain('Already ranked');
    await page.reload(); await app.ready();
    expect(await rankCalls(app)).toHaveLength(0);
  });
});
