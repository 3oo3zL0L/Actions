/* The approved states (docs/droplet/design/states.html): your move,
   elsewhere, waiting on, done; the completion moment; Recently done; the
   Today label; the add form; new actions pinned to Today. */
const { test, expect } = require('./helpers/harness');
const { teamsConfig, TID } = require('./helpers/fixtures');
const { waitsConfig, WAIT1, WAIT2 } = require('./helpers/fixtures3');

const PHONE = { width: 390, height: 844 };
const ORANGE = 'rgb(255, 138, 31)', STEEL = 'rgb(141, 180, 212)', GREEN = 'rgb(159, 215, 165)';
const css = (page, sel, prop) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p], prop);
async function captureCopyOpen(page) {
  await page.addInitScript(() => {
    window.__copied = []; window.__opened = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } } });
    window.open = (u) => { window.__opened.push(String(u)); return null; };
  });
}
const old = (days) => new Date(Date.parse('2026-10-02T08:00:00Z') - days * 864e5).toISOString();

test.describe('States', () => {
  test('your move: orange command on the first card, a quiet Done; header "N open"', async ({ app, page }) => {
    await app.boot();
    await expect(page.locator('.h1')).toHaveText('Today');
    await expect(page.locator('#sub')).toHaveText('5 open · 5 deferred');
    expect(await css(page, '#focus .fi.is-first .btn-act', 'backgroundColor')).toBe(ORANGE);
    await expect(page.locator('#focus .fi[data-id="a3-bram"] [data-card-done]')).toHaveText('Done');
    expect(await css(page, '#focus [data-card-done]', 'color')).not.toBe(ORANGE);
  });

  test('elsewhere (handed off to Teams): dashed, steel, chip on its own line, Copy again / I sent it; not counted as open', async ({ app, page }) => {
    await captureCopyOpen(page);
    await app.boot(teamsConfig());
    await app.openItem(TID('iris'));
    await page.click('#sendBtn');
    await page.click('[data-undo]'); // the done mark off: it stays handed off
    await page.click('[data-back]');
    const card = page.locator(`#focus [data-id="${TID('iris')}"]`);
    await expect(card).toHaveAttribute('data-state', 'handoff');
    await expect(card).toHaveClass(/is-held/);
    await expect(card.locator('.held-chip .st-hold')).toHaveText('In Teams · copied 10:00');
    await expect(card.locator('.held-act button')).toHaveText(['Copy again', 'I sent it']);
    expect(await card.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed');
    expect(await css(page, `#focus [data-id="${TID('iris')}"] .st-hold`, 'color')).toBe(STEEL);
    expect(await card.locator('.btn-act').count()).toBe(0);
    await expect(page.locator('#sub')).toContainText('open · 1 elsewhere');
    await card.locator('[data-held-copy]').click();
    await expect(page.locator('.toast')).toContainText('Copied again. Paste it in Teams.');
    await card.locator('[data-held-sent]').click();
    await expect(page.locator(`#focus [data-id="${TID('iris')}"]`)).toHaveCount(0);
    const key = await page.evaluate((i) => window.Droplet.state.byId[i].key, TID('iris'));
    expect((await app.db())['done/' + key]).toMatchObject({ how: 'teams', src: 'teams' });
  });

  test('elsewhere (sent · locked): after Undo of a send, with a quiet Mark done; no big outlined button, no faded card', async ({ app, page }) => {
    await app.boot();
    await page.click('[data-act="a3-bram"]');
    await page.click('#sendBtn');
    await expect(page.locator('#sendBtn.sent-chip')).toHaveText('Sent 10:00 · locked');
    expect(await page.locator('.btn-send.is-sent, .is-closed').count()).toBe(0);
    await page.click('[data-undo]');
    const card = page.locator('#focus [data-id="a3-bram"]');
    await expect(card).toHaveAttribute('data-state', 'locked');
    await expect(card.locator('.st-hold')).toHaveText('Sent 10:00 · locked');
    await expect(page.locator('#sub')).toContainText('1 elsewhere');
    await card.locator('[data-held-done]').click();
    await expect(page.locator('#focus [data-id="a3-bram"]')).toHaveCount(0);
  });

  test('waiting on: a steel chip; due after 3 working days with an orange Chase command, else "Day n of 3"', async ({ app, page }) => {
    await app.boot(waitsConfig());
    const card = page.locator(`#focus [data-id="${WAIT1}"]`);
    await expect(card.locator('[data-wait-chip]')).toHaveText('Waiting on Anna · 3 wd');
    expect(await css(page, `#focus [data-id="${WAIT1}"] [data-wait-chip]`, 'color')).toBe(STEEL);
    await expect(card.locator('.btn-act')).toHaveText('Chase Anna in Teams');
    const cmd = await page.locator(`#focus [data-id="${WAIT1}"] .btn-act`).evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
    expect([ORANGE, 'rgb(255, 157, 63)'].some((c) => cmd.includes(c))).toBe(true);
    await app.openRest();
    await page.fill('#q', 'Bas');
    await expect(page.locator(`#restList [data-open="${WAIT2}"] [data-wait-chip]`)).toHaveText('Day 2 of 3');
  });
});

test.describe('The moment of completion', () => {
  /* Records every class change of the green copy, with times. */
  async function watchGhost(page) {
    await page.evaluate(() => {
      window.__ghost = [];
      const t0 = performance.now();
      const seen = () => { const g = document.querySelector('#focus [data-leaving]'); window.__ghost.push({ t: performance.now() - t0, cls: g ? g.className : null }); };
      new MutationObserver(seen).observe(document.getElementById('focus'), { childList: true, subtree: true, attributes: true });
      seen();
    });
  }
  test('green "✓ … · done" line, strike, green corners, then a fold after 650 ms over 280 ms', async ({ app, page }) => {
    await app.boot();
    await watchGhost(page);
    await page.click('#focus [data-card-done="a2-anouk"]');
    const ghost = page.locator('#focus [data-leaving="a2-anouk"]');
    await expect(ghost.locator('[data-done-line]')).toHaveText('Done 10:00');
    const look = await ghost.evaluate((el) => ({
      cls: el.className, line: getComputedStyle(el.querySelector('[data-done-line]')).color,
      strike: getComputedStyle(el.querySelector('.fi-title')).textDecorationLine, corner: getComputedStyle(el, '::before').borderTopColor
    }));
    expect(look).toEqual({ cls: 'fi is-completing', line: GREEN, strike: 'line-through', corner: GREEN });
    expect(await app.focusIds()).not.toContain('a2-anouk'); // off the list at once; the copy is not an item
    await expect(ghost).toHaveCount(0, { timeout: 3000 });
    const log = await page.evaluate(() => window.__ghost);
    const fold = log.find((x) => x.cls && /is-leaving/.test(x.cls)), first = log.find((x) => x.cls), gone = log.filter((x) => x.cls).pop();
    expect(fold.t - first.t).toBeGreaterThanOrEqual(600);
    expect(fold.t - first.t).toBeLessThan(900);
    const end = log.find((x) => x.t > fold.t && !x.cls);
    expect(end.t - fold.t).toBeGreaterThanOrEqual(250);
    expect(gone).toBeTruthy();
    await expect(page.locator('#focus')).toBeVisible();
  });

  test('the fold is a 280 ms animation (only when motion is allowed)', async ({ app, page }) => {
    await app.boot();
    await page.click('#focus [data-card-done="a2-anouk"]');
    const ghost = page.locator('#focus [data-leaving="a2-anouk"].is-leaving');
    await expect(ghost).toHaveCount(1, { timeout: 1500 });
    expect(await ghost.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])).toEqual(['fold', '0.28s']);
  });

  test('reduced motion: the line shows, no fold, then it goes', async ({ app, page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app.boot();
    await watchGhost(page);
    await page.click('#focus [data-card-done="a2-anouk"]');
    await expect(page.locator('#focus [data-leaving] [data-done-line]')).toBeVisible();
    await expect(page.locator('#focus [data-leaving]')).toHaveCount(0, { timeout: 3000 });
    const log = await page.evaluate(() => window.__ghost);
    expect(log.some((x) => x.cls && /is-leaving/.test(x.cls))).toBe(false);
    const first = log.find((x) => x.cls), end = log.find((x) => x.t > first.t && !x.cls);
    expect(end.t - first.t).toBeGreaterThanOrEqual(550);
  });

  test('after: Undo toast, the "done today" tally ticks up, the Recently done count flashes', async ({ app, page }) => {
    await app.boot();
    await expect(page.locator('#tally')).toHaveText('00done today');
    await expect(page.locator('#doneCount')).toHaveText('0');
    await page.click('#focus [data-card-done="a2-anouk"]');
    await expect(page.locator('.toast [data-undo]')).toBeVisible();
    await expect(page.locator('#tally')).toHaveText('01done today');
    await expect(page.locator('#tally')).toHaveClass(/bump/);
    await expect(page.locator('#doneToggle')).toHaveClass(/flash/);
    await expect(page.locator('#doneCount')).toHaveText('1');
    await expect(page.locator('#doneToggle')).not.toHaveClass(/flash/, { timeout: 3000 });
    await page.click('[data-undo]');
    await expect(page.locator('#focus [data-leaving]')).toHaveCount(0); // back: no green copy left behind
    expect(await app.focusIds()).toContain('a2-anouk');
    await expect(page.locator('#tally')).toHaveText('00done today');
  });
});

test.describe('Recently done', () => {
  const seed = {
    'done/a5-tom': { at: old(3), how: 'manual', title: 'SIEM pilot: which log sources first?', src: 'mail' },
    'done/x-old': { at: old(8), how: 'manual', title: 'Too old to show', src: 'mail' },
    'actions/a-done': { text: 'Book the review room', created: old(4), done: true, doneAt: old(1), due: null, dueBy: null, notes: '' }
  };
  test('collapsed under Everything else; 7 days; flat rows with a check, a strike, time, source, reason and a 44px Bring back', async ({ app, page }) => {
    await app.boot({ dbSeed: seed });
    await expect(page.locator('#doneToggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#donePanel')).toBeHidden();
    await expect(page.locator('#doneCount')).toHaveText('2');
    expect(await page.evaluate(() => document.getElementById('restToggle').compareDocumentPosition(document.getElementById('doneToggle')) & 4)).toBe(4);
    await page.click('#doneToggle');
    const rows = page.locator('#doneList .dr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('.dr-title')).toHaveText('Book the review room');
    await expect(rows.nth(1).locator('.dr-title')).toHaveText('SIEM pilot: which log sources first?');
    await expect(rows.nth(1).locator('.dr-sub')).toContainText('Mail');
    await expect(rows.nth(1).locator('.dr-why')).toHaveText('Marked done by you');
    expect(await css(page, '#doneList .dr-title', 'textDecorationLine')).toBe('line-through');
    await expect(rows.nth(0).locator('.dr-ic svg')).toHaveCount(1);
    const h = await rows.nth(0).locator('[data-bring]').evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
  });

  test('Bring back returns the item to where it was', async ({ app, page }) => {
    await app.boot({ dbSeed: seed });
    expect(await app.focusIds()).not.toContain('a5-tom');
    await page.click('#doneToggle');
    await page.click('[data-bring="done:a5-tom"]');
    await expect(page.locator('.toast')).toContainText('Back in the list.');
    await app.ready();
    expect(await app.focusIds()).toContain('a5-tom');
    expect((await app.db())['done/a5-tom']).toBeUndefined();
    await page.click('[data-bring="mine:a-done"]');
    await expect(page.locator('[data-open="mine:a-done"]')).toHaveCount(1);
    expect((await app.db())['actions/a-done'].done).toBe(false);
    await expect(page.locator('#doneCount')).toHaveText('0');
  });

  test('a sent reply brought back is "Sent · locked" (nothing is unsent)', async ({ app, page }) => {
    await app.boot();
    await page.click('[data-act="a3-bram"]');
    await page.click('#sendBtn');
    await page.click('[data-back]');
    await page.waitForTimeout(1000);
    await page.click('#doneToggle');
    await expect(page.locator('#doneList .dr', { hasText: 'Session store' }).locator('.dr-why')).toHaveText('You sent the reply');
    await page.click('[data-bring="done:a3-bram"]');
    await expect(page.locator('#focus [data-id="a3-bram"]')).toHaveAttribute('data-state', 'locked');
    expect(await app.writeTools()).toEqual(['outlook_create_reply_draft', 'outlook_send_draft']);
  });
});

test.describe('Today', () => {
  test('the label says Today: header, crumb, list label, toasts', async ({ app, page }) => {
    await app.boot();
    await expect(page.locator('.h1')).toHaveText('Today');
    await expect(page.locator('#focus')).toHaveAttribute('aria-label', 'Today');
    await app.openItem('a3-bram');
    await expect(page.locator('.iv-crumb .c-sec')).toHaveText('Today');
    expect(await page.locator('body').innerText()).not.toMatch(/Do now/i);
  });
});

test.describe('New action', () => {
  test('the add line opens an inline form: Title and optional Notes; Shift+Enter or Tab to Notes; the Add button saves both', async ({ app, page }) => {
    await app.boot();
    await expect(page.locator('#addNotes')).toBeHidden();
    await page.click('#addIn');
    await expect(page.locator('#addNotes')).toBeVisible();
    await page.fill('#addIn', 'Call the venue');
    await page.press('#addIn', 'Shift+Enter');
    await expect(page.locator('#addNotes')).toBeFocused();
    await page.fill('#addNotes', 'Ask about the projector.\nAnd parking.');
    await page.click('.add-btn');
    const docs = Object.entries(await app.db()).filter(([k]) => k.startsWith('actions/'));
    expect(docs).toHaveLength(1);
    expect(docs[0][1]).toMatchObject({ text: 'Call the venue', notes: 'Ask about the projector.\nAnd parking.', pinnedToday: true });
    await expect(page.locator('#addIn')).toHaveValue('');
    await expect(page.locator('#addNotes')).toHaveValue('');
    await page.fill('#addIn', 'Second one');
    await page.press('#addIn', 'Tab');
    await expect(page.locator('#addNotes')).toBeFocused();
    await page.press('#addNotes', 'Escape');
    await expect(page.locator('#addIn')).toHaveValue('');
    await expect(page.locator('#addNotes')).toBeHidden();
    await page.fill('#addIn', 'Third one');
    await page.press('#addIn', 'Enter');
    await app.ready();
    expect(Object.keys(await app.db()).filter((k) => k.startsWith('actions/'))).toHaveLength(2);
  });

  test('a title is required: an empty one saves nothing', async ({ app, page }) => {
    await app.boot();
    await page.click('#addIn');
    await page.fill('#addNotes', 'notes only');
    await page.click('.add-btn');
    expect(Object.keys(await app.db()).filter((k) => k.startsWith('actions/'))).toHaveLength(0);
  });

  test('phone: 44px targets and no horizontal scroll', async ({ app, page }) => {
    await page.setViewportSize(PHONE);
    await app.boot();
    await page.click('#addIn');
    for (const sel of ['#addIn', '.add-btn', '#addNotes']) {
      const b = await page.locator(sel).boundingBox();
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('a new action lands in Today even when Claude ranks it hidden or later; enriched, never demoted; survives a reload', async ({ app, page }) => {
    await app.boot({ actionPlan: { 'archive': { group: 'hidden', rank: 99, project: 'Contracts', why: 'Can wait a long time.' } } });
    await page.fill('#addIn', 'archive the old contracts'); await page.press('#addIn', 'Enter');
    await app.ready();
    const id = await page.locator('[data-open^="mine:"]').first().getAttribute('data-open');
    expect(await app.focusIds()).toContain(id);
    await expect(page.locator(`#focus [data-id="${id}"] .fi-why`)).toHaveText('Can wait a long time.');
    await expect(page.locator(`#focus [data-id="${id}"] .fi-meta`)).toContainText('Contracts');
    await page.reload(); await app.ready();
    expect(await app.focusIds()).toContain(id);
  });

  test('"Not today" clears the pin (and n does too); Undo pins it again', async ({ app, page }) => {
    await app.boot({ actionPlan: { 'archive': { group: 'later', rank: 99, why: 'Later.' } } });
    await page.fill('#addIn', 'archive the old contracts'); await page.press('#addIn', 'Enter');
    await app.ready();
    const id = await page.locator('[data-open^="mine:"]').first().getAttribute('data-open');
    await app.openItem(id);
    await expect(page.locator('[data-nottoday]')).toContainText('Not today');
    await page.keyboard.press('n');
    expect(await app.focusIds()).not.toContain(id);
    expect((await app.db())['actions/' + id.slice(5)].pinnedToday).toBe(false);
    await page.click('[data-undo]');
    expect(await app.focusIds()).toContain(id);
    expect((await app.db())['actions/' + id.slice(5)].pinnedToday).toBe(true);
  });
});
