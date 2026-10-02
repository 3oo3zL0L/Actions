const { test, expect } = require('./helpers/harness');
const { m, T } = require('./helpers/fixtures');

const restIds = (page) => page.$$eval('#restList .rr', (els) => els.map((e) => e.getAttribute('data-open')));
const actionDocs = async (app) => Object.entries(await app.db()).filter(([k]) => k.startsWith('actions/'));
const mineRow = (page, text) => page.locator('[data-open^="mine:"]', { hasText: text });
async function idOf(page, text) { return mineRow(page, text).first().getAttribute('data-open'); }
async function add(page, text, how = 'enter') {
  await page.fill('#addIn', text);
  if (how === 'enter') await page.press('#addIn', 'Enter'); else await page.click('.add-btn');
}

test.describe('Your own actions', () => {
  test('Enter saves first and shows it at once; Claude then sets project, why and due, and places it', async ({ app, page }) => {
    await app.boot({ actionPlan: { 'SIEM runbook': { group: 'later', rank: 7, project: 'SIEM Integration', why: 'SIEM go-live needs the runbook first.', due: '2026-10-08' } } });
    await page.evaluate(() => window.__stub.setRankDelay(600));
    await add(page, 'Review the SIEM runbook before go-live');
    // Saved and shown before Claude answers.
    await expect(page.locator('#focus [data-src="mine"]')).toHaveCount(1);
    await expect(page.locator('#focus .fi', { hasText: 'Review the SIEM runbook before go-live' }).locator('.fi-meta')).toContainText('My action');
    await expect(page.locator('#addIn')).toHaveValue('');
    await expect(page.locator('#addIn')).toBeFocused();
    const docs = await actionDocs(app);
    expect(docs).toHaveLength(1);
    expect(docs[0][1]).toMatchObject({ text: 'Review the SIEM runbook before go-live', created: '2026-10-02T08:00:00.000Z', done: false, due: null });
    expect(await page.evaluate(() => window.Droplet.state.ranking)).toBe(1);

    await app.ready();
    await expect(page.locator('.toast')).toHaveText('Added under Everything else (due thu 08 oct).');
    await expect(page.locator('#focus [data-src="mine"]')).toHaveCount(0);
    await app.openRest();
    const id = await idOf(page, 'SIEM runbook');
    await expect(page.locator(`[data-open="${id}"] .rr-sub`)).toHaveText('My action · SIEM Integration · You · due thu 08 oct');
    expect((await app.db())['actions/' + id.slice(5)]).toMatchObject({ due: '2026-10-08', dueBy: 'claude' });
    await app.openItem(id);
    await expect(page.locator('.iv-why')).toContainText('SIEM go-live needs the runbook first.');
    await expect(page.locator('#actDue')).toHaveValue('2026-10-08');

    const samples = await app.calls('sample');
    expect(samples).toHaveLength(2);
    const p = samples[1].input;
    expect(p).toMatch(/<<<ACTION 1 id="mine:[a-z0-9]+">>>/);
    expect(p).toContain('Text: Review the SIEM runbook before go-live');
    expect(p).not.toContain('<<<EMAIL');
    expect(p).toContain('Already ranked');
    expect(p).toContain('Today is 2026-10-02 (Europe/Amsterdam)');
    expect(p).toContain('Never put an ACTION in group "hidden"');
  });

  test('the Add button saves too; an empty line saves nothing', async ({ app, page }) => {
    await app.boot();
    await add(page, '   ', 'button');
    expect(await actionDocs(app)).toHaveLength(0);
    await add(page, 'Book the review room', 'button');
    await expect(mineRow(page, 'Book the review room')).toHaveCount(1);
    expect(await actionDocs(app)).toHaveLength(1);
  });

  test('"Friday" and "vrijdag" parse to the right date (Amsterdam time)', async ({ app, page }) => {
    await app.boot();
    const got = await page.evaluate(() => {
      const p = window.Droplet.mine.parseDue;
      const wed = new Date('2026-09-30T10:00:00+02:00');
      const late = new Date('2026-10-02T23:30:00Z'); // already Saturday in Amsterdam
      return {
        friday: p('Plan follow-up with Noor & Daan on DoD, Friday', wed), vrijdag: p('Vervolg plannen met Noor, vrijdag', wed),
        morgen: p('morgen', wed), tomorrow: p('Call Bas tomorrow', wed), overmorgen: p('overmorgen klaar', wed),
        nextFriday: p('next Friday', wed), volgendeVrijdag: p('volgende week vrijdag', wed), donderdag: p('donderdag', wed),
        oktober: p('uiterlijk 9 oktober', wed), oct: p('by Oct 12', wed), iso: p('due 2026-11-03', wed),
        none: p('Review 3 docs for release 26.4', wed), fridayOnFriday: p('Friday', new Date('2026-10-02T10:00:00+02:00')),
        lateMorgen: p('morgen', late), lateVrijdag: p('vrijdag', late)
      };
    });
    expect(got).toEqual({
      friday: '2026-10-02', vrijdag: '2026-10-02', morgen: '2026-10-01', tomorrow: '2026-10-01', overmorgen: '2026-10-02',
      nextFriday: '2026-10-09', volgendeVrijdag: '2026-10-09', donderdag: '2026-10-01',
      oktober: '2026-10-09', oct: '2026-10-12', iso: '2026-11-03', none: null, fridayOnFriday: '2026-10-02',
      lateMorgen: '2026-10-04', lateVrijdag: '2026-10-09'
    });
  });

  test('due today or earlier goes to Do now, even when Claude says later', async ({ app, page }) => {
    await app.boot({ actionPlan: { 'SIEM test plan': { group: 'later', rank: 30, project: 'SIEM Integration', why: 'Plan for the pilot.', due: '2026-10-02' } } });
    await add(page, 'Send the SIEM test plan by end of day');
    await app.ready();
    const row = page.locator('#focus .fi', { hasText: 'SIEM test plan' });
    await expect(row).toHaveCount(1);
    await expect(row.locator('[data-due]')).toHaveText('Due today');
  });

  test('★ Important forces it into the focus list', async ({ app, page }) => {
    await app.boot({ actionPlan: { 'tidy': { group: 'later', rank: 40, project: null, why: 'Can wait.' } } });
    await add(page, 'tidy the shared drive');
    await app.ready();
    await expect(page.locator('#focus [data-src="mine"]')).toHaveCount(0);
    await app.openRest();
    const id = await idOf(page, 'tidy the shared drive');
    await page.click(`[data-open="${id}"]`);
    await page.click('[data-star]');
    await expect(page.locator('[data-star]')).toHaveAttribute('aria-pressed', 'true');
    expect((await app.focusIds()).slice(0, 2)).toEqual(['a1-standstill', id]);
  });

  test('edited text and due date are saved on blur and survive a reload; a new text is ranked again', async ({ app, page }) => {
    await app.boot();
    await add(page, 'Check the hosting addendum');
    await app.ready();
    await app.openRest();
    const id = await idOf(page, 'Check the hosting addendum');
    await app.openItem(id);
    await page.fill('#actText', 'Check clause 4 of the hosting addendum');
    await page.keyboard.press('Tab');
    await expect(page.locator('.toast')).toHaveText('Saved.');
    await expect(page.locator(`[data-open="${id}"]`)).toHaveCount(1); // keeps its place while ranked again
    await page.fill('#actDue', '2026-10-09');
    await page.locator('#actDue').blur();
    await expect(page.locator('[data-due-by]')).toHaveText('set by you');
    await page.fill('#actNotes', 'Ask legal about the liability cap.');
    await page.locator('#actNotes').blur();
    await app.ready();
    expect((await app.db())['actions/' + id.slice(5)]).toMatchObject({ text: 'Check clause 4 of the hosting addendum', due: '2026-10-09', dueBy: 'you', notes: 'Ask legal about the liability cap.' });
    expect((await app.calls('sample')).filter((c) => /<<<ACTION/.test(c.input))).toHaveLength(2);

    await page.reload();
    await app.ready();
    await app.openRest();
    await app.openItem(id);
    await expect(page.locator('#actText')).toHaveValue('Check clause 4 of the hosting addendum');
    await expect(page.locator('#actDue')).toHaveValue('2026-10-09');
    await expect(page.locator('#actNotes')).toHaveValue('Ask legal about the liability cap.');
  });

  test('Done takes it off the list with Undo, and keeps it stored with doneAt', async ({ app, page }) => {
    await app.boot();
    await add(page, 'Sign the DoD page today');
    await app.ready();
    const id = await idOf(page, 'Sign the DoD page today');
    await app.openItem(id);
    await expect(page.locator('#sendBtn')).toHaveText('Done');
    await expect(page.locator('#draftText')).toHaveCount(0); // no Send card
    await page.click('#sendBtn');
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'list');
    await expect(page.locator(`[data-open="${id}"]`)).toHaveCount(0);
    expect((await app.db())['actions/' + id.slice(5)]).toMatchObject({ done: true, doneAt: '2026-10-02T08:00:00.000Z' });
    await page.click('[data-undo]');
    await expect(page.locator(`#focus [data-open="${id}"]`)).toHaveCount(1);
    expect((await app.db())['actions/' + id.slice(5)]).toMatchObject({ done: false, doneAt: null });

    await app.openItem(id);
    await page.keyboard.press('d');
    await page.reload();
    await app.ready();
    await expect(page.locator(`[data-open="${id}"]`)).toHaveCount(0);
    expect((await app.db())['actions/' + id.slice(5)]).toMatchObject({ done: true });
  });

  test('Delete asks inline first (no browser dialog)', async ({ app, page }) => {
    page.on('dialog', (d) => { throw new Error('unexpected dialog: ' + d.message()); });
    await app.boot();
    await add(page, 'Order new badges');
    await app.ready();
    await app.openRest();
    const id = await idOf(page, 'Order new badges');
    await app.openItem(id);
    await page.click('[data-delete]');
    await expect(page.locator('[data-confirm-delete]')).toContainText('Delete this action?');
    await expect(page.locator('[data-delete-no]')).toBeFocused();
    expect(await actionDocs(app)).toHaveLength(1);
    await page.click('[data-delete-no]');
    await expect(page.locator('[data-confirm-delete]')).toHaveCount(0);
    await page.click('[data-delete]');
    await page.click('[data-delete-yes]');
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'list');
    await expect(page.locator(`[data-open="${id}"]`)).toHaveCount(0);
    expect(await actionDocs(app)).toHaveLength(0);
  });

  test('without Claude: no project, due date from the local parser, placed by due date', async ({ app, page }) => {
    await app.boot({ noSample: true });
    await add(page, 'Draft the SIEM test plan Thursday');
    await expect(page.locator('.toast')).toHaveText('Added under Everything else (due thu 08 oct).');
    await add(page, 'Check the vendor addendum dinsdag');
    await add(page, 'Bel de leverancier vrijdag');
    await expect(page.locator('#focus .fi', { hasText: 'Bel de leverancier vrijdag' }).locator('[data-due]')).toHaveText('Due today');
    await app.openRest();
    const rest = await restIds(page);
    const a = await idOf(page, 'vendor addendum'), b = await idOf(page, 'SIEM test plan');
    expect(rest.indexOf(a)).toBeLessThan(rest.indexOf(b));
    await expect(page.locator(`[data-open="${b}"] .rr-sub`)).toHaveText('My action · Own · You · due thu 08 oct');
    await app.openItem(b);
    await expect(page.locator('.iv-why p')).toHaveText('Claude: Your own action. Due Thu 08 Oct.');
    await expect(page.locator('[data-due-by]')).toHaveText('read from your text');
    expect(await app.calls('sample')).toHaveLength(0);
  });

  test('the text is rendered as text, never HTML', async ({ app, page }) => {
    await app.boot();
    const evil = '<img src=x onerror="window.__pwned=1"><b>bold</b> & "quotes"';
    await page.evaluate(() => window.__stub.setRankDelay(400));
    await add(page, evil);
    await expect(page.locator('#focus [data-src="mine"]').locator('xpath=ancestor::li').locator('.fi-title')).toHaveText(evil);
    await app.ready();
    await app.openRest();
    await expect(page.locator('.rr-title', { hasText: 'bold' })).toHaveText(evil);
    expect(await page.locator('#focus img, #focus b, #restList img, #restList b').count()).toBe(0);
    const id = await idOf(page, '<b>bold</b>');
    await app.openItem(id);
    await expect(page.locator('#actText')).toHaveValue(evil);
    expect(await page.locator('#itemCol img, #itemCol b:not(.iv-crumb b)').count()).toBe(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });

  test('a clear next step shows as a quiet hint, with no Send card', async ({ app, page }) => {
    await app.boot();
    await add(page, 'Plan follow-up with Noor & Daan on DoD, Friday');
    await add(page, 'Mail Femke about the quote');
    await app.ready();
    await app.openItem(await idOf(page, 'Plan follow-up'));
    await expect(page.locator('[data-next]')).toHaveText('Next step: plan a meeting with Noor & Daan');
    await expect(page.locator('[data-send], [data-copyopen], #draftText')).toHaveCount(0);
    await page.click('[data-back]');
    await app.openRest();
    await page.click(`[data-open="${await idOf(page, 'Mail Femke')}"]`);
    await expect(page.locator('[data-next]')).toHaveText('Next step: draft a mail to Femke');
  });

  test('search finds your actions', async ({ app, page }) => {
    await app.boot();
    await add(page, 'Renew the parking permit next week');
    await app.ready();
    await app.openRest();
    await page.fill('#q', 'parking');
    expect((await restIds(page))).toHaveLength(1);
    await page.fill('#q', 'my action');
    expect((await restIds(page))).toHaveLength(1);
  });

  test('R8: an incoming mail about an open action merges into it under "Also in"', async ({ app, page }) => {
    await app.boot({ actionPlan: { 'release notes': { group: 'now', rank: 2, project: 'Release management', why: 'Release is close.' } } });
    await add(page, 'Answer Pieter about the release notes');
    await app.ready();
    const id = await idOf(page, 'release notes');
    expect(await app.focusIds()).toContain(id);
    await page.evaluate(([mail, aid]) => {
      window.__stub.addMail(mail);
      window.__stub.setRankPlan({ 'a12-new': { group: 'now', rank: 3, project: 'Release management', why: 'Same as your action.', action: 'reply', label: 'Reply', dupOf: aid } });
    }, [m('a12-new', 'pieter.ros@planonsoftware.com', 'Release notes review', 'Can you review the notes?', T('07:55')), id]);
    await page.click('[data-sync]');
    await app.ready();
    const last = (await app.calls('sample')).pop().input;
    expect(last).toContain('· ref ' + id);
    await expect(page.locator('[data-open="a12-new"]')).toHaveCount(0);
    await expect(page.locator(`[data-id="${id}"] [data-also]`)).toHaveText('Also in Mail');
    await app.openItem(id);
    await expect(page.locator('[data-also-in]')).toContainText('Release notes review');
  });

  test('"a" focuses the add line, but not while typing', async ({ app, page }) => {
    await app.boot();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('a');
    await expect(page.locator('#addIn')).toBeFocused();
    await expect(page.locator('#addIn')).toHaveValue('');
    await page.keyboard.press('Escape');
    await page.keyboard.press('/');
    await page.keyboard.type('a');
    await expect(page.locator('#q')).toBeFocused();
    await expect(page.locator('#q')).toHaveValue('a');
    await app.openItem('a3-bram');
    await page.click('#draftText');
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' a');
    await expect(page.locator('#draftText')).toBeFocused();
    await expect(page.locator('#draftText')).toHaveValue(/Sam a$/);
  });
});
