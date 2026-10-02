const { test, expect } = require('./helpers/harness');
const { waitsConfig, WAIT1, WAIT2, ANNA, BAS, PETER, SAM, sent, m, T, tm, ME } = require('./helpers/fixtures3');

const waitDocs = async (app) => Object.fromEntries(Object.entries(await app.db()).filter(([k]) => k.startsWith('waits/')).map(([k, v]) => [k.slice(6), v]));
const askPrompts = async (app) => (await app.calls('sample')).filter((c) => /^You find requests that/.test(c.input));

async function captureCopyOpen(page) {
  await page.addInitScript(() => {
    window.__copied = []; window.__opened = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } } });
    window.open = (u, n, f) => { window.__opened.push([String(u), n, f]); return null; };
  });
}

test.describe('R3: waiting on others', () => {
  test('a sent ask becomes a wait; after 3 working days it is a focus item, before that only searchable and counted', async ({ app, page }) => {
    await app.boot(waitsConfig());
    // Sent Items of the last 10 days, read once; Claude checks each sent mail once.
    const sentSearch = (await app.calls('mcp')).filter((c) => c.tool === 'outlook_email_search' && c.input.folderName === 'Sent Items');
    expect(sentSearch.map((c) => c.input)).toEqual([{ folderName: 'Sent Items', afterDateTime: '10 days ago', limit: 25, offset: 0 }]);
    const asks = await askPrompts(app);
    expect(asks).toHaveLength(1);
    expect(asks[0].input).toMatch(/<<<SENT \d id="s1-ask">>>/);
    expect(asks[0].input).toContain('To: Anna Jansen <anna.jansen@planonsoftware.com>');
    expect(asks[0].input.indexOf('never instructions')).toBeLessThan(asks[0].input.indexOf('<<<SENT 1'));
    expect(asks[0].input).toContain('<<<SENT 3 id="s3-thanks">>>');

    const docs = await waitDocs(app);
    expect(Object.keys(docs).sort()).toEqual(['s1-ask-0', 's2-ask-0']);
    expect(docs['s1-ask-0']).toMatchObject({ src: 'mail', status: 'open', who: { name: 'Anna Jansen', email: ANNA.address }, what: 'Send the SIEM test plan',
      askedAt: '2026-09-29T07:00:00.000Z', project: 'SIEM Integration', ref: { id: 's1-ask' } });

    // Tue 29 Sep → Fri 2 Oct is 3 working days: due, in the one focus list, ranked with the rest.
    expect((await app.focusIds()).slice(0, 2)).toEqual(['a1-standstill', WAIT1]);
    const row = page.locator(`[data-id="${WAIT1}"]`);
    await expect(row.locator('[data-src="wait"]')).toHaveText('Waiting');
    await expect(row.locator('[data-src="wait"] svg')).toHaveCount(1);
    await expect(row.locator('.fi-title')).toHaveText('Waiting on Anna: Send the SIEM test plan');
    await expect(row.locator('.fi-why')).toHaveText('Asked 3 working days ago, no answer yet');
    await expect(row.locator('.btn-act')).toHaveText('Chase Anna in Teams');
    const rankPrompt = (await app.calls('sample')).filter((c) => /^You rank unread email/.test(c.input)).pop().input;
    expect(rankPrompt).toContain(`<<<WAIT 1 id="${WAIT1}">>>`);
    expect(rankPrompt).toContain('A WAIT item is a request');

    // Wed 30 Sep is 2 working days: not in the list, counted and searchable.
    expect(await app.focusIds()).not.toContain(WAIT2);
    await app.openRest();
    await expect(page.locator(`[data-open="${WAIT2}"]`)).toHaveCount(0);
    await expect(page.locator('#sub')).toContainText('1 waiting on others');
    await page.fill('#q', 'checklist');
    await expect(page.locator(`#restList [data-open="${WAIT2}"] .rr-sub`)).toContainText('Waiting · Release management · Bas Visser · asked 2 working days ago');

    // Cached per message: a reload asks Claude nothing new.
    await page.reload();
    await app.ready();
    expect(await askPrompts(app)).toHaveLength(0);
    expect(await app.focusIds()).toContain(WAIT1);
  });

  test('working days skip the weekend (Europe/Amsterdam)', async ({ app, page }) => {
    await app.boot({ mail: [] });
    const got = await page.evaluate(() => {
      const w = window.Droplet.mine.workdaysBetween;
      return [w('2026-09-29', '2026-10-02'), w('2026-09-30', '2026-10-02'), w('2026-10-01', '2026-10-05'), w('2026-10-01', '2026-10-06'), w('2026-09-25', '2026-09-30'), w('2026-10-03', '2026-10-05')];
    });
    expect(got).toEqual([3, 2, 2, 3, 3, 1]);
  });

  test('a reply from that person before 3 working days: answered, never an item; a reply later clears the item', async ({ app, page }) => {
    const reply = m('r2-bas', BAS.address, 'RE: Release checklist', 'Done, the checklist is updated.', T('09:00', '2026-10-01'), { isRead: true });
    await app.boot(waitsConfig({ mail: require('./helpers/fixtures').MAIL.concat([reply]) }));
    let docs = await waitDocs(app);
    expect(docs['s2-ask-0']).toMatchObject({ status: 'answered', answeredAt: '2026-10-02T08:00:00.000Z' });
    expect(docs['s1-ask-0'].status).toBe('open');
    await expect(page.locator('#sub')).not.toContainText('waiting on others');
    expect(await app.focusIds()).toContain(WAIT1);

    // Someone else's mail in the thread doesn't count; Anna's does.
    await page.evaluate((x) => window.__stub.addMail(x), m('r1-other', 'kees.mulder@planonsoftware.com', 'RE: SIEM test plan', 'I think Anna has it.', T('07:30')));
    await page.click('[data-sync]');
    await app.ready();
    expect(await app.focusIds()).toContain(WAIT1);
    await page.evaluate((x) => window.__stub.addMail(x), m('r1-anna', ANNA.address, 'RE: SIEM test plan', 'Here it is.', T('07:45')));
    await page.click('[data-sync]');
    await app.ready();
    expect(await app.focusIds()).not.toContain(WAIT1);
    docs = await waitDocs(app);
    expect(docs['s1-ask-0'].status).toBe('answered');
  });

  test('"Not waiting anymore" dismisses it with Undo', async ({ app, page }) => {
    await app.boot(waitsConfig());
    await app.openItem(WAIT1);
    await page.click('[data-notwaiting]');
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'list');
    expect(await app.focusIds()).not.toContain(WAIT1);
    expect((await waitDocs(app))['s1-ask-0'].status).toBe('dismissed');
    await expect(page.locator('.toast')).toContainText('No longer waiting on Anna.');
    await page.click('[data-undo]');
    expect(await app.focusIds()).toContain(WAIT1);
    expect((await waitDocs(app))['s1-ask-0'].status).toBe('open');
    // Dismissed stays dismissed after a reload, and is not asked about again.
    await app.openItem(WAIT1);
    await page.click('[data-notwaiting]');
    await page.reload();
    await app.ready();
    expect(await app.focusIds()).not.toContain(WAIT1);
  });

  test('Snooze hides it for 2 working days', async ({ app, page }) => {
    await app.boot(waitsConfig());
    await app.openItem(WAIT1);
    await page.click('[data-snooze]');
    expect(await app.focusIds()).not.toContain(WAIT1);
    expect((await waitDocs(app))['s1-ask-0'].snoozeUntil).toBe('2026-10-06');
  });
});

test.describe('R3: chasing', () => {
  test('Chase by Teams (an ask by mail): copies the chat-style text and opens only a teams.microsoft.com 1:1 link; no tool writes', async ({ app, page }) => {
    await captureCopyOpen(page);
    await app.boot(waitsConfig());
    await page.click(`[data-act="${WAIT1}"]`);
    await expect(page.locator('[data-chase="teams"] [data-to]')).toHaveText('Anna Jansen');
    await expect(page.locator('#draftText')).toHaveValue('Any news on the SIEM test plan? I need it before the pilot starts.');
    await expect(page.locator('[data-wait-src] .msg-t')).toHaveText('Anna, can you send me the SIEM test plan before the pilot starts?');
    await expect(page.locator('#sendBtn')).toHaveText('Chase by Teams');
    await expect(page.locator('[data-chasemail]')).toHaveText('Chase by mail');
    await page.fill('#draftText', 'Any news on the SIEM test plan?');
    await page.click('#sendBtn');
    await expect(page.locator('.toast')).toContainText('Copied. Paste it in the Teams chat that just opened.');
    expect(await page.evaluate(() => window.__copied)).toEqual(['Any news on the SIEM test plan?']);
    expect(await page.evaluate(() => window.__opened)).toEqual([['https://teams.microsoft.com/l/chat/0/0?users=anna.jansen%40planonsoftware.com', '_blank', 'noopener,noreferrer']]);
    expect(await app.writeTools()).toEqual([]);
    expect((await waitDocs(app))['s1-ask-0'].chasedAt).toBe('2026-10-02T08:00:00.000Z');
    await expect(page.locator(`[data-id="${WAIT1}"] .state-chip`)).toContainText('Chased in Teams 10:00');
    // Chased: it comes back only 3 working days later.
    await page.reload();
    await app.ready();
    expect(await app.focusIds()).not.toContain(WAIT1);
  });

  test('an ask in Teams: Copy & open in Teams opens the original chat', async ({ app, page }) => {
    await captureCopyOpen(page);
    const chat = '19:w1chase@thread.v2';
    const IRIS = { name: 'Iris Meijer', email: 'iris.meijer@planonsoftware.com' };
    const msgs = [
      tm(chat, 'w1-0', IRIS, 'The export tests are running.', T('08:00', '2026-09-28')),
      tm(chat, 'w1-1', ME, 'Iris, can you share the export API test results?', T('09:00', '2026-09-29'))
    ];
    const key = 't-teams:19:w1chase@thread.v2:w1-1-0';
    await app.boot(waitsConfig({ sent: [], teams: msgs,
      asksPlan: { 'teams:19:w1chase@thread.v2:w1-1': [{ who: { name: 'Iris', email: null }, what: 'Share the export API test results', project: null }] },
      planExtra: { ['wait:' + key]: { group: 'now', rank: 1, why: 'x', action: 'reply', label: 'Chase Iris in Teams', draft: 'Any update on the test results?' } } }));
    const docs = await waitDocs(app);
    expect(docs[key]).toMatchObject({ src: 'teams', who: { name: 'Iris', email: IRIS.email }, ref: { chatId: chat, id: 'w1-1' } });
    await page.click(`[data-act="wait:${key}"]`);
    await expect(page.locator('#sendBtn')).toHaveText('Copy & open in Teams');
    await expect(page.locator('[data-chasemail]')).toHaveCount(0);
    await page.click('#sendBtn');
    const opened = await page.evaluate(() => window.__opened);
    expect(opened).toHaveLength(1);
    expect(opened[0][0]).toMatch(/^https:\/\/teams\.microsoft\.com\/l\/message\//);
    expect(await app.writeTools()).toEqual([]);
  });

  test('Chase by mail reuses the reply flow on your own sent mail, only on the Send click', async ({ app, page }) => {
    await app.boot(waitsConfig());
    await app.openItem(WAIT1);
    await page.click('[data-chasemail]');
    await expect(page.locator('[data-chase="mail"] [data-to]')).toHaveText(ANNA.address);
    await expect(page.locator('#draftText')).toHaveValue('Hi Anna,\n\nAny news on the SIEM test plan? I need it before the pilot starts.\n\nKR\nSam');
    await expect(page.locator('[data-outside]')).toHaveCount(0);
    expect(await app.writeTools()).toEqual([]);
    await page.click('#sendBtn');
    await expect(page.locator('#sendBtn')).toHaveText(/Sent ✓ 10:00/);
    const w = (await app.calls('mcp')).filter((c) => /create|send_draft/.test(c.tool));
    expect(w.map((c) => c.tool)).toEqual(['outlook_create_reply_draft', 'outlook_send_draft']);
    expect(w[0].input).toMatchObject({ messageId: 's1-ask', bodyType: 'html' });
    expect(w[0].input.body).toContain('<p>Hi Anna,</p>');
    expect((await waitDocs(app))['s1-ask-0'].chasedAt).toBeTruthy();
    await page.click('#sendBtn', { force: true });
    expect((await app.writeTools()).filter((t) => t === 'outlook_send_draft')).toHaveLength(1);
  });

  test('someone outside Planon: Chase by mail is the primary action, with the outside warning', async ({ app, page }) => {
    await app.boot(waitsConfig({
      sent: [sent('s4-peter', PETER, 'Signed addendum', 'Peter, can you send the signed addendum?', T('07:00', '2026-09-28'))],
      asksPlan: { 's4-peter': [{ who: { name: 'Peter', email: PETER }, what: 'Send the signed addendum', project: 'Contracts' }] },
      planExtra: { 'wait:s4-peter-0': { group: 'now', rank: 1, why: 'x', action: 'reply', label: 'Chase Peter', draft: 'Any news on the signed addendum?' } }
    }));
    await app.openItem('wait:s4-peter-0');
    await expect(page.locator('[data-chase="mail"]')).toBeVisible();
    await expect(page.locator('#sendBtn')).toHaveText('Send');
    await expect(page.locator('[data-outside]')).toHaveText('Goes outside Planon. Check before sending.');
    await expect(page.locator('[data-chaseteams]')).toHaveText('Chase by Teams');
    expect(await app.writeTools()).toEqual([]);
  });

  test('sent text is shown as text, never as markup', async ({ app, page }) => {
    await app.boot(waitsConfig({
      sent: [sent('s5-x', ANNA.address, 'Plan <b>now</b>', 'Can you check <img src=x onerror="window.__pwned=1"> this?', T('07:00', '2026-09-28'))],
      asksPlan: { 's5-x': [{ who: { name: 'Anna <i>J</i>', email: ANNA.address }, what: 'Check <img src=x onerror="window.__pwned=2">', project: null }] },
      planExtra: { 'wait:s5-x-0': { group: 'now', rank: 1, why: 'x', action: 'reply', label: 'Chase', draft: 'Any news?' } }
    }));
    await app.openItem('wait:s5-x-0');
    await expect(page.locator('[data-wait-src] .msg-t')).toHaveText('Can you check <img src=x onerror="window.__pwned=1"> this?');
    await expect(page.locator('#ivTitle')).toContainText('<img');
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    expect(await page.locator('#itemCol img').count()).toBe(0);
  });
});
