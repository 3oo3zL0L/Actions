const { test, expect } = require('./helpers/harness');
const { m, T } = require('./helpers/fixtures');

test.describe('Learn', () => {
  test('Not important moves the item down now, is stored, and goes into the next ranking prompt', async ({ app, page }) => {
    await app.boot({ dropletConfig: { rankBatch: 50 } });
    await app.openItem('a4-lena');
    await page.click('[data-notimp]');
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'list');
    await expect(page.locator('.toast')).toContainText('Moved to Everything else.');
    expect(await app.focusIds()).toEqual(['jira:OIDC-77', 'a3-bram', 'a2-anouk', 'a5-tom', 'a8-kees']);
    await app.openRest();
    const rest = await page.$$eval('#restList .rr', (els) => els.map((e) => e.getAttribute('data-open')));
    expect(rest[rest.length - 1]).toBe('a4-lena');
    await expect(page.locator('[data-open="a4-lena"] .rr-sub')).toContainText('marked not important');
    expect((await app.db())['feedback/a4-lena']).toMatchObject({
      msgId: 'a4-lena', sender: 'lena.smit@planonsoftware.com', subject: 'DoD page: sign-off needed by Monday',
      project: 'Release management', verdict: 'down', at: '2026-10-02T08:00:00.000Z'
    });

    await page.evaluate((mail) => window.__stub.addMail(mail), m('a12-new', 'pieter.ros@planonsoftware.com', 'Release notes review', 'Can you review the notes?', T('07:55')));
    await page.click('[data-sync]');
    await app.ready();
    const prompts = (await app.calls('sample')).map((c) => c.input);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('- ↓ not important: from lena.smit@planonsoftware.com, subject "DoD page: sign-off needed by Monday", project Release management, 2026-10-02');

    await page.reload();
    await app.ready();
    expect(await app.focusIds()).not.toContain('a4-lena');
  });

  test('Undo takes Not important back', async ({ app, page }) => {
    await app.boot();
    await app.openItem('a4-lena');
    await page.keyboard.press('n');
    await page.click('[data-undo]');
    expect(await app.focusIds()).toContain('a4-lena');
    expect((await app.db())['feedback/a4-lena']).toBeUndefined();
  });

  test('★ Important is stored, lifts the item into the focus list, and toggles off', async ({ app, page }) => {
    await app.boot();
    await app.openRest();
    await page.click('[data-open="a7-yuki"]');
    await page.click('[data-star]');
    await expect(page.locator('[data-star]')).toHaveAttribute('aria-pressed', 'true');
    expect((await app.focusIds()).slice(0, 2)).toEqual(['jira:OIDC-77', 'a7-yuki']);
    await expect(page.locator('[data-id="a7-yuki"] .flag')).toHaveText('★ Important');
    expect((await app.db())['feedback/a7-yuki']).toMatchObject({ verdict: 'up', project: 'UI/UX' });
    await page.click('[data-star]');
    await expect(page.locator('[data-star]')).toHaveAttribute('aria-pressed', 'false');
    expect((await app.db())['feedback/a7-yuki']).toBeUndefined();
  });
});
