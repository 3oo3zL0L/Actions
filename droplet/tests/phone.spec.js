const { test, expect } = require('./helpers/harness');

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function noSideScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);
}

test.describe('Phone (390 px)', () => {
  test('list: no horizontal scroll, 44 px targets', async ({ app, page }) => {
    await app.boot();
    expect(await noSideScroll(page)).toBe(true);
    await page.click('#restToggle');
    expect(await noSideScroll(page)).toBe(true);
    const heights = await page.$$eval('.btn-act, .fi-open, .rest-toggle, .rr, #q', (els) => els.map((e) => e.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  });

  test('item: its own screen, no horizontal scroll, Send in thumb reach without scrolling', async ({ app, page }) => {
    await app.boot();
    await page.tap('#restToggle');
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
    await expect(page.locator('#sendBtn')).toHaveText(/Sent ✓ 10:00/);
    expect(await noSideScroll(page)).toBe(true);
  });
});
