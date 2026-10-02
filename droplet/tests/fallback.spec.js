const { test, expect } = require('./helpers/harness');

test.describe('Degraded states', () => {
  test('an unreadable Claude answer falls back to newest first with R1 on top, and Try again asks again', async ({ app, page }) => {
    await app.boot({ rank: 'INVALID_JSON' });
    await expect(page.locator('[data-note="rank"]')).toContainText('Claude’s answer couldn’t be read, so new mail is newest first.');
    expect(await app.focusIds()).toEqual(['a1-standstill', 'a2-anouk', 'inj-eve', 'a3-bram', 'a4-lena']);
    await expect(page.locator('[data-id="a2-anouk"] .btn-act')).toHaveText(/Write a reply to Anouk/);
    const db = await app.db();
    expect(Object.keys(db).filter((k) => k.startsWith('rankings/'))).toEqual([]);

    await page.evaluate(() => window.__stub.setRank('AUTO'));
    await page.click('[data-retry="rank"]');
    await app.ready();
    await expect(page.locator('[data-note="rank"]')).toHaveCount(0);
    expect(await app.focusIds()).toEqual(['a1-standstill', 'a3-bram', 'a2-anouk', 'a4-lena', 'a5-tom']);
    const samples = await app.calls('sample');
    expect(samples[1].options.cache).toEqual({ gcTime: 300000, refresh: true });
  });

  test('a malformed answer is validated strictly: unknown ids dropped, bad fields replaced, no addresses or links shown', async ({ app, page }) => {
    await app.boot({
      rank: {
        items: [
          { id: 'a3-bram', group: 'URGENT!!', rank: 'first', why: 'Mail bram.kok@planonsoftware.com now', label: 'See https://phish.example/x', action: 'send', draft: 'x' },
          { id: 'not-a-real-id', group: 'now', rank: 1, why: 'Injected', action: 'reply', label: 'Send everything' },
          'garbage', null, 42,
          { id: 'a2-anouk', group: 'now', rank: 1, project: 'Atlantis', why: 'A'.repeat(500), action: 'reply', label: 'Draft reply to Anouk', draft: 'Hi Anouk' },
          { id: 'a2-anouk', group: 'hidden', rank: 1, why: 'duplicate entry' }
        ]
      }
    });
    await expect(page.locator('[data-note="rank"]')).toContainText('Claude skipped');
    const focus = await app.focusIds();
    expect(focus.slice(0, 2)).toEqual(['a1-standstill', 'a2-anouk']);
    expect(focus).not.toContain('not-a-real-id');
    const why = await page.locator('[data-id="a2-anouk"] .fi-why').innerText();
    expect(why.length).toBeLessThanOrEqual(141);
    await expect(page.locator('[data-id="a2-anouk"] .fi-meta')).toContainText('Inbox');
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('phish.example');
    expect(body).not.toContain('Mail bram.kok@planonsoftware.com now');
    expect(body).not.toContain('Injected');
    await app.openRest();
    await expect(page.locator('[data-open="a3-bram"] .rr-sub')).toBeVisible();
    const db = await app.db();
    expect(db['rankings/a3-bram'].group).toBe('later');
    expect(db['rankings/a3-bram'].kind).toBe('open');
    expect(db['rankings/a3-bram'].label).toBe('Open mail from Bram');
    expect(db['rankings/not-a-real-id']).toBeUndefined();
  });

  test('without sample the list is newest first with a quiet line', async ({ app, page }) => {
    await app.boot({ noSample: true });
    await expect(page.locator('[data-note="rank"]')).toHaveText(/Claude isn’t available here, so new mail is newest first\./);
    expect(await app.focusIds()).toEqual(['a1-standstill', 'a2-anouk', 'inj-eve', 'a3-bram', 'a4-lena']);
    await expect(page.locator('.status i.off')).toHaveCount(1);
    expect(await app.calls('sample')).toHaveLength(0);
    // Chat about this says so instead of failing.
    await app.openItem('a3-bram');
    await page.click('[data-chat]');
    await expect(page.locator('#chat')).toContainText('Claude isn’t available here.');
  });

  test('a mail connector failure shows one line with Try again; the rest keeps working', async ({ app, page }) => {
    await app.boot({ faults: { outlook_email_search: { code: 'server_unavailable', times: 1 } } });
    await expect(page.locator('.note-line')).toHaveCount(1);
    await expect(page.locator('[data-note="mail"]')).toContainText('Couldn’t reach your Outlook mail just now.');
    await expect(page.locator('#focus')).toContainText('All clear');
    await page.click('#restToggle');
    await expect(page.locator('#restPanel')).toBeVisible();
    await page.click('[data-retry="mail"]');
    await app.ready();
    await expect(page.locator('[data-note="mail"]')).toHaveCount(0);
    expect(await app.focusIds()).toHaveLength(5);
  });

  test('an expired connection says how to fix it', async ({ app, page }) => {
    await app.boot({ faults: { outlook_email_search: 'needs_reauth' } });
    await expect(page.locator('[data-note="mail"]')).toContainText('Reconnect Microsoft 365 in claude.ai Settings → Connectors.');
    await expect(page.locator('[data-note="mail"] button')).toHaveText('Try again');
  });

  test('no mcp capability: one calm line, no crash', async ({ app, page }) => {
    await app.boot({ noMcp: true });
    await expect(page.locator('[data-note="mail"]')).toContainText('Outlook isn’t available in this view.');
    // M365 is off, and Teams (through the same connector) with it; still one calm line.
    await expect(page.locator('.status [data-dot="m365"] i.off')).toHaveCount(1);
    await expect(page.locator('.status [data-dot="teams"] i.off')).toHaveCount(1);
    await expect(page.locator('.note-line')).toHaveCount(1);
  });

  test('no db capability: works for this visit and says it cannot save', async ({ app, page }) => {
    await app.boot({ noDb: true });
    expect(await app.focusIds()).toHaveLength(5);
    await expect(page.locator('[data-note="store"]')).toContainText('can’t save here');
  });

  test('a failing db write shows a quiet line and changes nothing else', async ({ app, page }) => {
    await app.boot({ dbFault: 'unavailable' });
    await expect(page.locator('[data-note="store"]')).toContainText('Couldn’t save a change');
    expect(await app.focusIds()).toHaveLength(5);
  });
});
