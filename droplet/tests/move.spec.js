/* Layout C: cards move between Today and Later by drag, by the Later / Today
   buttons and with m; the move is saved in db places/<key>, survives a reload
   and a new ranking, and has Undo. */
const { test, expect } = require('./helpers/harness');

const restIds = (page) => page.$$eval('#restList .rr', (els) => els.map((e) => e.getAttribute('data-open')));
const places = async (app) => Object.entries(await app.db()).filter(([k]) => k.startsWith('places/'));

async function drag(page, from, to, opts = {}) {
  const a = await page.locator(from).boundingBox();
  const b = await page.locator(to).boundingBox();
  const x1 = b.x + b.width / 2, y1 = opts.top ? b.y + 6 : b.y + b.height / 2;
  await page.mouse.move(a.x + 40, a.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + 40 + (x1 - a.x - 40) * i / 8, a.y + 20 + (y1 - a.y - 20) * i / 8);
  if (opts.check) await opts.check();
  await page.mouse.up();
}

test.describe('Layout C: move between Today and Later', () => {
  test('the overview replaces Standing by; an open item covers it', async ({ app, page }) => {
    await app.boot();
    await expect(page.locator('#over')).toBeVisible();
    await expect(page.locator('#restPanel')).toBeVisible();
    await expect(page.locator('#doneToggle')).toBeVisible();
    await expect(page.locator('text=Standing by')).toHaveCount(0);
    const today = await app.focusIds();
    await app.openItem(today[0]);
    await expect(page.locator('#over')).toBeHidden();
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Escape');
    await expect(page.locator('#over')).toBeVisible();
  });

  test('drag a Today card onto Later: it moves, is saved, survives a reload; Undo puts it back', async ({ app, page }) => {
    await app.boot();
    const today = await app.focusIds();
    const id = today[1];
    await drag(page, `#focus [data-id="${id}"] .fi-open`, '#laterBox', {
      check: async () => {
        await expect(page.locator('.drag-ghost')).toHaveCount(1);
        await expect(page.locator('#laterBox')).toHaveClass(/drop-on/);
      }
    });
    await expect(page.locator('.drag-ghost')).toHaveCount(0);
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'list'); // the drag opened nothing
    expect(await app.focusIds()).not.toContain(id);
    expect(await restIds(page)).toContain(id);
    await expect(page.locator(`#restList [data-open="${id}"]`)).toContainText('moved by you');
    await expect(page.locator('.toast')).toContainText('Moved to Later.');
    const saved = await places(app);
    expect(saved).toHaveLength(1);
    expect(saved[0][1]).toMatchObject({ place: 'later' });
    // Undo.
    await page.click('[data-undo]');
    expect(await app.focusIds()).toContain(id);
    expect(await places(app)).toHaveLength(0);
    // Again, then reload: it stays in Later, and Today is not refilled with it.
    await drag(page, `#focus [data-id="${id}"] .fi-open`, '#laterBox');
    await page.reload(); await app.ready();
    await expect(page.locator(`#restList [data-open="${id}"]`)).toHaveCount(1);
    expect(await app.focusIds()).not.toContain(id);
  });

  test('drag a Later row into Today at a spot; it stays there after a reload', async ({ app, page }) => {
    await app.boot();
    const later = await restIds(page);
    const id = later[later.length - 1];
    const first = (await app.focusIds())[0];
    await drag(page, `#restList [data-open="${id}"]`, `#focus [data-id="${first}"]`, {
      top: true,
      check: async () => { await expect(page.locator(`#focus [data-id="${first}"]`)).toHaveClass(/drop-before/); }
    });
    expect((await app.focusIds())[0]).toBe(id);
    await expect(page.locator('.toast')).toContainText('Moved to Today.');
    await page.reload(); await app.ready();
    expect((await app.focusIds())[0]).toBe(id);
    expect(await restIds(page)).not.toContain(id);
  });

  test('reorder within Today by dragging', async ({ app, page }) => {
    await app.boot();
    const t = await app.focusIds();
    await drag(page, `#focus [data-id="${t[2]}"] .fi-open`, `#focus [data-id="${t[0]}"]`, { top: true });
    expect((await app.focusIds()).slice(0, 3)).toEqual([t[2], t[0], t[1]]);
    await expect(page.locator('.toast')).toContainText('Moved in Today.');
  });

  test('a click (no move) still opens the card; Esc cancels a drag', async ({ app, page }) => {
    await app.boot();
    const t = await app.focusIds();
    const box = await page.locator(`#focus [data-id="${t[1]}"] .fi-open`).boundingBox();
    await page.mouse.move(box.x + 40, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 43, box.y + 22); // under the 6 px threshold
    await page.mouse.up();
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'item');
    await expect(page.locator('#ivTitle')).toBeVisible();
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Escape');
    const lb = await page.locator('#laterBox').boundingBox();
    await page.mouse.move(box.x + 40, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(lb.x + 50, lb.y + 30, { steps: 6 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await app.focusIds()).toEqual(t);
    expect(await places(app)).toHaveLength(0);
  });

  test('without a mouse: the Later button, the Today button, and m', async ({ app, page }) => {
    await app.boot();
    const t = await app.focusIds();
    await page.click(`#focus [data-move="${t[0]}"]`);
    expect(await app.focusIds()).not.toContain(t[0]);
    expect(await restIds(page)).toContain(t[0]);
    await page.click(`[data-move-today="${t[0]}"]`);
    expect(await app.focusIds()).toContain(t[0]);
    // m on a focused Today card sends it to Later; m on the Later row brings it back.
    await page.locator(`#focus [data-id="${t[1]}"] .fi-open`).focus();
    await page.keyboard.press('m');
    expect(await app.focusIds()).not.toContain(t[1]);
    await expect(page.locator(`#restList [data-open="${t[1]}"]`)).toBeFocused();
    await page.keyboard.press('m');
    expect(await app.focusIds()).toContain(t[1]);
  });
});

test.describe('Layout C on a phone (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('Today first, then the overview; no horizontal scroll; Later in reach', async ({ app, page }) => {
    await app.boot();
    const sw = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await sw()).toBe(true);
    const f = await page.locator('#focus').boundingBox(), o = await page.locator('#over').boundingBox();
    expect(o.y).toBeGreaterThan(f.y + f.height - 1);
    const t = await app.focusIds();
    const mv = await page.locator(`#focus [data-move="${t[0]}"]`).boundingBox();
    expect(mv.height).toBeGreaterThanOrEqual(44);
    expect(mv.width).toBeGreaterThanOrEqual(44);
    await page.tap(`#focus [data-move="${t[0]}"]`);
    expect(await app.focusIds()).not.toContain(t[0]);
    await page.tap('#restToggle');
    const today = await page.locator(`[data-move-today="${t[0]}"]`).boundingBox();
    expect(today.height).toBeGreaterThanOrEqual(44);
    expect(await sw()).toBe(true);
  });
});
