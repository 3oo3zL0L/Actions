/* Layout B: Today plus three lanes (Waiting on, Later for STEERCO, Week).
   Cards move between Today and Later by drag, by the Later / Today buttons
   and with m; the move is saved in db places/<key>, survives a reload and a
   new ranking, and has Undo. Later collects STEERCO points with notes. */
const { test, expect } = require('./helpers/harness');

const restIds = (page) => page.$$eval('#restList .rr', (els) => els.map((e) => e.getAttribute('data-open')));
const steerIds = (page) => page.$$eval('#steerList [data-steer]', (els) => els.map((e) => e.getAttribute('data-steer')));
const places = async (app) => Object.entries(await app.db()).filter(([k]) => k.startsWith('places/'));

const toLater = (page, id) => drag(page, `#focus [data-id="${id}"] .fi-open`, '#steerList');
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

test.describe('Layout B: move between Today and Later', () => {
  test('three lanes next to Today; an open item is a drawer over them, Today stays', async ({ app, page }) => {
    await app.boot();
    await expect(page.locator('#over')).toBeVisible();
    const boxes = await Promise.all(['#listCol', '#laneWait', '#laterBox', '#laneWeek'].map((s) => page.locator(s).boundingBox()));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x + boxes[i - 1].width - 1);
    await expect(page.locator('#laneWeek #doneToggle')).toBeVisible();
    await expect(page.locator('text=Standing by')).toHaveCount(0);
    const today = await app.focusIds();
    await app.openItem(today[0]);
    // As in the mockup: a drawer over the three right lanes, up to 660 px wide; Today stays in view.
    const d = await page.locator('#itemCol').boundingBox(), w = await page.locator('#laneWait').boundingBox(), l = await page.locator('#listCol').boundingBox();
    expect(d.width).toBeLessThanOrEqual(661);
    expect(d.x).toBeGreaterThan(l.x + l.width);
    expect(d.x).toBeGreaterThan(w.x);
    await expect(page.locator('.b-scrim')).toBeVisible();
    await expect(page.locator('#listCol')).toBeVisible();
    await page.click('.b-scrim', { position: { x: 20, y: 300 } });
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'list');
    await app.openItem(today[0]);
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
    expect(await steerIds(page)).toEqual([id]);
    expect(await restIds(page)).not.toContain(id);
    await expect(page.locator('.toast')).toContainText('Moved to Later, for STEERCO.');
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
    await expect(page.locator(`#steerList [data-steer="${id}"]`)).toHaveCount(1);
    expect(await app.focusIds()).not.toContain(id);
  });

  test('drag an Everything else row into Today at a spot; it stays there after a reload', async ({ app, page }) => {
    await app.boot();
    await app.openRest();
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

  test('no Later / Today buttons on cards; without a mouse, m moves', async ({ app, page }) => {
    await app.boot();
    const t = await app.focusIds();
    await expect(page.locator('[data-move], [data-move-today], [data-point-today]')).toHaveCount(0);
    // m on a focused Today card sends it to Later; m on the Later row brings it back.
    await page.locator(`#focus [data-id="${t[1]}"] .fi-open`).focus();
    await page.keyboard.press('m');
    expect(await app.focusIds()).not.toContain(t[1]);
    await expect(page.locator(`#steerList [data-open="${t[1]}"]`)).toBeFocused();
    await page.keyboard.press('m');
    expect(await app.focusIds()).toContain(t[1]);
  });
});

test.describe('Layout B on a phone (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('Today first, then the lanes; a jump bar; no horizontal scroll; Later in reach', async ({ app, page }) => {
    await app.boot();
    const sw = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await sw()).toBe(true);
    const f = await page.locator('#focus').boundingBox(), o = await page.locator('#over').boundingBox();
    expect(o.y).toBeGreaterThan(f.y + f.height - 1);
    const t = await app.focusIds();
    const dn = await page.locator(`#focus [data-card-done="${t[0]}"]`).boundingBox();
    expect(dn.height).toBeGreaterThanOrEqual(44);
    expect(dn.width).toBeGreaterThanOrEqual(44);
    await page.tap('[data-jump="laterBox"]');
    expect(await sw()).toBe(true);
  });
});

test.describe('Later: for STEERCO', () => {
  test('a note on a collected card is saved, stays when it goes to Today and back, and is in Copy', async ({ app, page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await app.boot();
    const t = await app.focusIds();
    await toLater(page, t[2]);
    const note = page.locator(`[data-steer-note="${t[2]}"]`);
    await note.fill('Ask for a go/no-go.\nTwo extra devs.');
    await expect.poll(async () => (await places(app))[0][1].note).toBe('Ask for a go/no-go.\nTwo extra devs.');
    await expect(note).toBeFocused(); // a re-render while typing keeps the caret
    // To Today and back: the note comes along.
    await drag(page, `#steerList [data-steer="${t[2]}"] .sc-open`, '#focus');
    await toLater(page, t[2]);
    await expect(page.locator(`[data-steer-note="${t[2]}"]`)).toHaveValue('Ask for a go/no-go.\nTwo extra devs.');
    await page.reload(); await app.ready();
    await expect(page.locator(`[data-steer-note="${t[2]}"]`)).toHaveValue('Ask for a go/no-go.\nTwo extra devs.');
    // Copy puts the list on the clipboard; nothing is sent.
    await page.click('#steerCopy');
    await expect(page.locator('.toast')).toContainText('Copied 1 point');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('STEERCO points');
    expect(clip).toContain('  Two extra devs.');
    expect(await app.writeTools()).toEqual([]);
  });

  test('own points: add, edit, remove with Undo; saved in db steerco/', async ({ app, page }) => {
    await app.boot();
    await page.fill('#steerIn', 'Budget overrun Q4: decision needed');
    await page.press('#steerIn', 'Enter');
    await expect(page.locator('#steerList .sc.is-note')).toHaveCount(1);
    await expect(page.locator('#steerCount')).toHaveText('1');
    const pts = async () => Object.entries(await app.db()).filter(([k]) => k.startsWith('steerco/'));
    await expect.poll(async () => (await pts()).length).toBe(1);
    await page.locator('[data-steer-free]').fill('Budget overrun Q4: decision needed by 15 Oct');
    await expect.poll(async () => (await pts())[0][1].text).toBe('Budget overrun Q4: decision needed by 15 Oct');
    await page.reload(); await app.ready();
    await expect(page.locator('[data-steer-free]')).toHaveValue('Budget overrun Q4: decision needed by 15 Oct');
    await page.click('[data-steer-del]');
    await expect(page.locator('#steerList .sc')).toHaveCount(0);
    await page.click('[data-undo]');
    await expect(page.locator('#steerList .sc.is-note')).toHaveCount(1);
  });

  test('take a card off the list: it stays out of Today, under Everything else', async ({ app, page }) => {
    await app.boot();
    const t = await app.focusIds();
    await toLater(page, t[1]);
    await page.click(`[data-steer-off="${t[1]}"]`);
    await expect(page.locator('.toast')).toContainText('Taken off the STEERCO list.');
    expect(await steerIds(page)).toEqual([]);
    expect(await app.focusIds()).not.toContain(t[1]);
    await app.openRest();
    await expect(page.locator(`#restList [data-open="${t[1]}"]`)).toContainText('moved out of Today by you');
    // Drag it from Everything else into Later.
    await drag(page, `#restList [data-open="${t[1]}"]`, '#steerList');
    expect(await steerIds(page)).toEqual([t[1]]);
  });

  test('handle a collected card: Done takes it off every list; drag it to Recently done too', async ({ app, page }) => {
    await app.boot();
    const t = await app.focusIds();
    await toLater(page, t[1]);
    await page.click(`#steerList [data-card-done="${t[1]}"]`);
    expect(await steerIds(page)).toEqual([]);
    expect(await app.focusIds()).not.toContain(t[1]);
    await page.click('[data-undo]');
    expect(await steerIds(page)).toEqual([t[1]]);
    await drag(page, `#steerList [data-open="${t[1]}"]`, '#doneToggle');
    expect(await steerIds(page)).toEqual([]);
    await expect(page.locator('#doneCount')).toHaveText('1');
  });

  test('own points: Done, drag to Today (a new action), Undo, and drag to Today at a spot', async ({ app, page }) => {
    await app.boot();
    const add = async (v) => { await page.fill('#steerIn', v); await page.press('#steerIn', 'Enter'); };
    await add('Point one');
    await page.click('[data-point-done]');
    await expect(page.locator('#steerList .sc.is-note')).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('Point done.');
    await add('Ask Martijn about SIEM owner');
    await drag(page, '#steerList [data-drag^="point:"] .sc-top', '#focus');
    await expect(page.locator('#steerList .sc.is-note')).toHaveCount(0);
    await expect(page.locator('#focus')).toContainText('Ask Martijn about SIEM owner');
    await page.click('[data-undo]');
    await expect(page.locator('#focus')).not.toContainText('Ask Martijn about SIEM owner');
    await expect(page.locator('#steerList .sc.is-note')).toHaveCount(1);
    const first = (await app.focusIds())[0];
    await drag(page, '#steerList [data-drag^="point:"] .sc-top', `#focus [data-id="${first}"]`, { top: true });
    await expect(page.locator('#steerList .sc.is-note')).toHaveCount(0);
    await expect(page.locator('#focus .fi').first()).toContainText('Ask Martijn about SIEM owner');
  });

  test('Ask Claude on a Later card (about the item) and on an own point (prefilled)', async ({ app, page }) => {
    await app.boot();
    const t = await app.focusIds();
    await toLater(page, t[1]);
    await page.click(`[data-steer-ask="${t[1]}"]`);
    await expect(page.locator('#askSheet [data-ask-about]')).toBeVisible();
    await expect(page.locator('#chatIn')).toHaveValue('For STEERCO: ');
    await page.keyboard.press('Escape');
    await page.fill('#steerIn', 'Budget overrun Q4'); await page.press('#steerIn', 'Enter');
    await page.click('[data-point-ask]');
    await expect(page.locator('#chatIn')).toHaveValue('Help me prepare this STEERCO point: “Budget overrun Q4”. ');
    expect(await app.writeTools()).toEqual([]);
  });

  test('drag from Later to Waiting on and back, for cards and own points; the whole card is the handle', async ({ app, page }) => {
    await app.boot();
    const t = await app.focusIds();
    await toLater(page, t[1]);
    // Grab the card on its edge (not the title): it still drags.
    await drag(page, `#steerList [data-steer="${t[1]}"] .sc-act`, '#laneWait', {
      check: async () => {
        await expect(page.locator('#laneWait')).toHaveClass(/drop-on/);
        // The ghost floats under the pointer, over the Waiting lane, and the page keeps its height.
        const g = await page.locator('.drag-ghost').boundingBox(), w = await page.locator('#laneWait').boundingBox();
        expect(g.x + g.width / 2).toBeGreaterThan(w.x - 200);
        expect(await page.evaluate(() => getComputedStyle(document.querySelector('.drag-ghost')).position)).toBe('fixed');
      }
    });
    await expect(page.locator('.toast')).toContainText('Moved to Waiting on.');
    expect(await steerIds(page)).toEqual([]);
    await expect(page.locator(`#waitList [data-open="${t[1]}"]`)).toContainText('put in Waiting by you');
    expect((await places(app))[0][1]).toMatchObject({ place: 'wait' });
    // And from Waiting on to Today.
    await drag(page, `#waitList [data-open="${t[1]}"]`, '#focus');
    expect(await app.focusIds()).toContain(t[1]);
    // An own point: Later → Waiting on → Later.
    await page.fill('#steerIn', 'Hiring decision SIEM'); await page.press('#steerIn', 'Enter');
    await drag(page, '#steerList [data-drag^="point:"] .sc-top', '#laneWait');
    await expect(page.locator('#waitList .sc.is-note')).toContainText('Your point · waiting');
    await expect(page.locator('#steerList .sc.is-note')).toHaveCount(0);
    await drag(page, '#waitList [data-drag^="point:"] .sc-top', '#steerList');
    await expect(page.locator('#steerList .sc.is-note')).toHaveCount(1);
    await expect(page.locator('#steerList .sc-tag')).toHaveText('Your point');
    // Typing in a note never starts a drag.
    const ta = page.locator('#steerList [data-steer-free]');
    const b = await ta.boundingBox();
    await page.mouse.move(b.x + 10, b.y + 10); await page.mouse.down(); await page.mouse.move(b.x + 80, b.y + 12, { steps: 4 });
    await expect(page.locator('.drag-ghost')).toHaveCount(0);
    await page.mouse.up();
  });
});
