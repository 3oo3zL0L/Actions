/* Drag, every way: each kind of card through every lane and back. The
   source is grabbed where Thomas would grab it; the target is the lane. */
const { test, expect } = require('./helpers/harness');
const { waitsConfig } = require('./helpers/fixtures3');

async function drag(page, from, to) {
  await page.locator(from).first().scrollIntoViewIfNeeded();
  await page.locator(to).first().scrollIntoViewIfNeeded().catch(() => {});
  const a = await page.locator(from).first().boundingBox();
  const b = await page.locator(to).first().boundingBox();
  const x0 = a.x + Math.min(40, a.width / 2), y0 = a.y + Math.min(14, a.height / 2);
  const x1 = b.x + b.width / 2, y1 = b.y + Math.min(b.height / 2, 120);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10);
  await page.mouse.up();
}
const TARGET = { today: '#focus', wait: '#laneWait', later: '#steerTray', off: '#laterBox', done: '#laneWeek' };
async function where(page, id) {
  const has = async (sel) => (await page.locator(sel).count()) > 0;
  if (await has(`#focus [data-id="${id}"]`)) return 'today';
  if (await has(`#waitList [data-open="${id}"]`)) return 'wait';
  if (await has(`#steerList [data-steer="${id}"]`)) return 'later';
  if (await has(`#offList [data-open="${id}"]`) || await has(`#restList [data-open="${id}"]`)) return 'off';
  return 'gone';
}
function handle(lane, id) {
  return { today: `#focus [data-id="${id}"] .fi-open`, wait: `#waitList [data-open="${id}"]`, later: `#steerList [data-steer="${id}"] .sc-sub`, off: `#offList [data-open="${id}"], #restList [data-open="${id}"]` }[lane];
}
const steerOpen = async (page, on) => {
  const open = (await page.getAttribute('#steerToggle', 'aria-expanded')) === 'true';
  if (open !== on) await page.click('#steerToggle');
};
async function walk(page, id, path) {
  await page.evaluate(() => { const t = document.getElementById('restToggle'); if (t.getAttribute('aria-expanded') !== 'true') t.click(); });
  let at = await where(page, id);
  for (const to of path) {
    await steerOpen(page, at === 'later');
    await drag(page, handle(at, id), TARGET[to]);
    await expect.poll(() => where(page, id), { message: `${id}: ${at} → ${to}` }).toBe(to === 'done' ? 'gone' : to);
    at = to;
    await page.evaluate(() => { const t = document.getElementById('restToggle'); if (t.getAttribute('aria-expanded') !== 'true') t.click(); });
  }
}

test.describe('Drag matrix (laptop)', () => {
  test('a mail card: Today → Waiting → Later → Everything else → Waiting → Today → Later → Today → Done', async ({ app, page }) => {
    await app.boot();
    const id = (await app.focusIds())[1];
    await walk(page, id, ['wait', 'later', 'off', 'wait', 'today', 'later', 'today', 'done']);
    await expect(page.locator('#doneCount')).toHaveText('1');
  });

  test('an Everything else card: → Later → Waiting → Everything else → Today', async ({ app, page }) => {
    await app.boot();
    await expect(page.locator('#restToggle')).toHaveAttribute('aria-expanded', 'true');
    const id = await page.locator('#restList [data-open]').first().getAttribute('data-open');
    await walk(page, id, ['later', 'wait', 'off', 'today']);
  });

  test('a real wait (asked by mail): Today → Everything else → Waiting → Later → Today → Waiting', async ({ app, page }) => {
    await app.boot(waitsConfig());
    const id = 'wait:s1-ask-0';
    expect(await where(page, id)).toBe('today');
    await walk(page, id, ['off', 'wait', 'later', 'today', 'wait']);
  });

  test('with an item open, the drawer steps aside and every lane takes the card', async ({ app, page }) => {
    await app.boot();
    const t = await app.focusIds();
    await app.openItem(t[0]);
    // Every card starts in Today (the drawer covers the lanes until the drag starts).
    await walk(page, t[1], ['wait']);
    await walk(page, t[2], ['later']);
    await walk(page, t[3], ['off']);
    await walk(page, t[4], ['done']);
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'item');
  });

  test('own points: STEERCO → Waiting → STEERCO → Today (an action); Later says why not; Done', async ({ app, page }) => {
    await app.boot();
    const add = async (v) => { await page.fill('#steerIn', v); await page.press('#steerIn', 'Enter'); };
    await add('Point A');
    const inSteer = '#steerList [data-drag^="point:"] .sc-top', inWait = '#laneWait [data-drag^="point:"] .sc-top';
    await page.waitForTimeout(100);
    await page.evaluate(() => { window.Droplet.state.undo = null; });
    await steerOpen(page, true);
    await drag(page, inSteer, '#laterBox');
    await expect(page.locator('.toast')).toContainText('Your own points live in STEERCO or Waiting on.');
    await expect(page.locator('#steerList .sc.is-note')).toHaveCount(1);
    await steerOpen(page, true);
    await drag(page, inSteer, '#laneWait');
    await expect(page.locator('#waitList .sc.is-note')).toHaveCount(1);
    await steerOpen(page, false);
    await drag(page, inWait, '#steerTray');
    await expect(page.locator('#steerList .sc.is-note')).toHaveCount(1);
    await steerOpen(page, true);
    await drag(page, inSteer, '#laneWeek');
    await expect(page.locator('.sc.is-note')).toHaveCount(0);
    await add('Point B');
    await steerOpen(page, true);
    await drag(page, inSteer, '#focus');
    await expect(page.locator('#focus')).toContainText('Point B');
  });
});

test.describe('Drag by touch (hold, then move)', () => {
  test.use({ hasTouch: true });
  test('a Today card to Waiting on and a Later card back to Today, by finger', async ({ app, page }) => {
    await app.boot();
    const cdp = await page.context().newCDPSession(page);
    const touch = async (from, to) => {
      const a = await page.locator(from).boundingBox(), b = await page.locator(to).boundingBox();
      const x0 = a.x + 40, y0 = a.y + 14, x1 = b.x + b.width / 2, y1 = b.y + Math.min(b.height / 2, 120);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
      await page.waitForTimeout(450); // the hold
      for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 10, y: y0 + (y1 - y0) * i / 10 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const t = await app.focusIds();
    await touch(`#focus [data-id="${t[1]}"] .fi-open`, '#laneWait');
    await expect(page.locator(`#waitList [data-open="${t[1]}"]`)).toHaveCount(1);
    await touch(`#focus [data-id="${t[2]}"] .fi-open`, '#steerTray');
    await expect(page.locator(`#steerList [data-steer="${t[2]}"]`)).toHaveCount(1);
    await page.tap('#steerToggle');
    await touch(`#steerList [data-steer="${t[2]}"] .sc-sub`, '#focus');
    expect(await app.focusIds()).toContain(t[2]);
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'list'); // no card opened by the release
  });
});

test.describe('After a drop', () => {
  test('a keyboard click is never swallowed: Enter in a form right after a drag still submits', async ({ app, page }) => {
    await app.boot();
    await page.fill('#steerIn', 'Point B');
    // The state right after a drop, before the timer clears it (input can run first on a slow machine).
    await page.evaluate(() => { window.Droplet.state.dragSwallow = true; });
    await page.press('#steerIn', 'Enter');
    await expect(page.locator('#steerList .sc.is-note')).toHaveCount(1);
    // A real pointer click in that moment is still swallowed (no card opens by the release).
    await page.evaluate(() => { window.Droplet.state.dragSwallow = true; });
    const id = (await app.focusIds())[0];
    await page.click(`#focus [data-id="${id}"] .fi-open`);
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'list');
  });
});

