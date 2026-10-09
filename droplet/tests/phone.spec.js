const { test, expect } = require('./helpers/harness');

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function noSideScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);
}

test.describe('Phone (390 px)', () => {
  test('list: no horizontal scroll, 44 px targets', async ({ app, page }) => {
    await app.boot();
    expect(await noSideScroll(page)).toBe(true);
    await app.openRest();
    expect(await noSideScroll(page)).toBe(true);
    const heights = await page.$$eval('.btn-act, .fi-open, .rest-toggle, .rr, #q', (els) => els.map((e) => e.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  });

  test('item: its own screen, no horizontal scroll, Send in thumb reach without scrolling', async ({ app, page }) => {
    await app.boot();
    await app.openRest();
    await page.tap('[data-open="a6-peter"]');
    await expect(page.locator('#ivTitle')).toBeVisible();
    await expect(page.locator('#listCol')).toBeHidden();
    expect(await noSideScroll(page)).toBe(true);
    const box = await page.locator('#sendBtn').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    expect(box.y).toBeGreaterThan(844 / 2);
    expect(box.width).toBeGreaterThan(300);
    const q = await page.$$eval('.qbtn, .btn-back', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
    for (const [w, h] of q) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
    // Long content scrolls under the sticky bar; Send stays put.
    await page.mouse.wheel(0, 2000);
    const box2 = await page.locator('#sendBtn').boundingBox();
    expect(box2.y + box2.height).toBeLessThanOrEqual(844);
    await page.tap('#sendBtn');
    await expect(page.locator('#sendBtn')).toHaveText(/Sent 10:00/);
    expect(await noSideScroll(page)).toBe(true);
  });
});

test.describe('Phone (390 px) with Teams and meetings', () => {
  test('a Teams item with tags: no horizontal scroll; Copy & open in thumb reach', async ({ app, page }) => {
    const { teamsConfig, TID } = require('./helpers/fixtures');
    await app.boot(teamsConfig({
      events: [{ id: 'ev1', subject: 'Sync', organizer: 'sam.devries@planonsoftware.com', attendees: ['iris.meijer@planonsoftware.com'],
        start: { dateTime: '2026-10-02T14:00:00.0000000', timeZone: 'W. Europe Standard Time' }, end: { dateTime: '2026-10-02T14:30:00.0000000', timeZone: 'W. Europe Standard Time' },
        showAs: 'busy', isAllDay: false, isCancelled: false }],
      planExtra: { 'a2-anouk': { group: 'now', rank: 3, why: 'Same as the Teams chat.', action: 'reply', label: 'Draft reply to Anouk', dupOf: TID('iris') } }
    }));
    await expect(page.locator(`[data-id="${TID('iris')}"] [data-meeting]`)).toHaveText('Meeting 14:00');
    expect(await noSideScroll(page)).toBe(true);
    await page.tap(`[data-act="${TID('iris')}"]`);
    await expect(page.locator('#ivTitle')).toBeVisible();
    await expect(page.locator('#listCol')).toBeHidden();
    await expect(page.locator('[data-also-in]')).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    const box = await page.locator('#sendBtn').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await expect(page.locator('#sendBtn')).toHaveText('Copy & open in Teams');
  });
});

test.describe('Phone (390 px): your own actions', () => {
  test('the add line is at the top and reachable; adding and opening an action never scrolls sideways', async ({ app, page }) => {
    await app.boot();
    const add = await page.locator('#addIn').boundingBox();
    const btn = await page.locator('.add-btn').boundingBox();
    const first = await page.locator('#focus .fi').first().boundingBox();
    expect(add.height).toBeGreaterThanOrEqual(44);
    expect(btn.height).toBeGreaterThanOrEqual(44);
    expect(btn.width).toBeGreaterThanOrEqual(44);
    expect(add.y).toBeLessThan(first.y);
    expect(btn.x + btn.width).toBeLessThanOrEqual(390);
    expect(await noSideScroll(page)).toBe(true);
    await page.tap('#addIn');
    await page.keyboard.type('Plan follow-up with Noor & Daan on DoD, Friday, and bring the long list of open points from the retro');
    await page.tap('.add-btn');
    const row = page.locator('#focus [data-src="mine"]');
    await expect(row).toHaveCount(1);
    expect(await noSideScroll(page)).toBe(true);
    await page.tap('#focus .fi:has([data-src="mine"]) .fi-open');
    await expect(page.locator('#actText')).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    const due = await page.locator('#actDue').boundingBox();
    expect(due.height).toBeGreaterThanOrEqual(44);
    const done = await page.locator('#sendBtn').boundingBox();
    expect(done.height).toBeGreaterThanOrEqual(44);
    expect(done.y + done.height).toBeLessThanOrEqual(844);
    const q = await page.$$eval('.qbtn', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
    for (const [w, h] of q) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
  });
});

test.describe('Phone (390 px), increment 3', () => {
  const { waitsConfig, WAIT1, meetingsConfig } = require('./helpers/fixtures3');
  test('a wait item and the invite card fit: no horizontal scroll, 44 px targets', async ({ app, page }) => {
    await app.boot(Object.assign(waitsConfig(), meetingsConfig()));
    expect(await noSideScroll(page)).toBe(true);
    await page.tap(`[data-act="${WAIT1}"]`);
    await expect(page.locator('#ivTitle')).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    const sizes = async (sel) => page.$$eval(sel, (els) => els.filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
    for (const [w, h] of await sizes('.qbtn, .btn-back, #sendBtn')) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
    const box = await page.locator('#sendBtn').boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(844);

    await page.tap('[data-back]');
    const id = await page.locator('[data-src="meeting"]').first().evaluate((e) => e.closest('[data-id]').getAttribute('data-id'));
    await page.tap(`[data-open="${id}"]`);
    await page.tap('[data-ns-start="meeting"]');
    await expect(page.locator('[data-ns-slot]')).toHaveCount(3);
    expect(await noSideScroll(page)).toBe(true);
    const card = await page.locator('[data-ns-card]').boundingBox();
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(390);
    for (const [w, h] of await sizes('[data-ns-card] button, [data-ns-card] input:not([type=checkbox]), .ns-toggle')) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
  });
});

test.describe('No λ mark', () => {
  test('the rendered page has no λ anywhere, on the list, the standby panel and an item', async ({ app, page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await app.boot();
    const has = () => page.evaluate(() => {
      const css = [...document.querySelectorAll('*')].some((e) => /λ/.test(getComputedStyle(e, '::before').content + getComputedStyle(e, '::after').content));
      return /λ/i.test(document.documentElement.outerHTML) || /lambda/i.test(document.documentElement.outerHTML) || css;
    });
    expect(await has()).toBe(false);
    await app.openItem('a3-bram');
    expect(await has()).toBe(false);
    await expect(page.locator('.brand-name')).toHaveText('Droplet');
  });
});
