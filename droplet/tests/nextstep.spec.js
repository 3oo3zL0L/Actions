const { test, expect } = require('./helpers/harness');
const { meetingsConfig, ANNA, BAS, PETER, m, T } = require('./helpers/fixtures3');

const actionDocs = async (app) => Object.entries(await app.db()).filter(([k]) => k.startsWith('actions/')).map(([k, v]) => [k.slice(8), v]);
const events = async (app) => (await app.calls('mcp')).filter((c) => c.tool === 'outlook_create_event');
async function add(page, text) { await page.fill('#addIn', text); await page.press('#addIn', 'Enter'); }
async function openMeetingAction(app, page) {
  const [docId] = (await actionDocs(app))[0];
  await app.openItem('mine:' + docId);
  return docId;
}

test.describe('Find a time', () => {
  test('3 slots in working hours, avoiding busy times; the card is editable; create_event once, on click, with the mapped fields', async ({ app, page }) => {
    await app.boot(meetingsConfig());
    await openMeetingAction(app, page);
    expect(await events(app)).toHaveLength(0);
    await page.click('[data-ns-start="meeting"]');
    // Who: the meeting's own attendees, with their exact addresses.
    await expect(page.locator('[data-ns-person]')).toHaveText(['Anna Jansen · anna.jansen@planonsoftware.com×', 'Bas Visser · bas.visser@planonsoftware.com×']);
    await expect(page.locator('[data-ns-slot]')).toHaveCount(3);
    // Today 11:00–17:00, Mon until 10:00 and Tue until 12:00 are busy in your calendar; Anna is busy Wed until 09:30;
    // "free" time doesn't block. Bas's calendar can't be read: said so.
    await expect(page.locator('[data-ns-slot]')).toHaveText(['Mon 5 Oct · 10:00–10:30', 'Tue 6 Oct · 12:00–12:30', 'Wed 7 Oct · 09:30–10:00']);
    await expect(page.locator('[data-cal-note]')).toHaveText('Only your calendar was checked for Bas: theirs isn’t readable here.');
    const cal = (await app.calls('mcp')).filter((c) => c.tool === 'outlook_calendar_search' && c.input.afterDateTime === '2026-10-02' && !/^(steerco|release)$/.test(c.input.query));
    expect(cal.map((c) => c.input.calendarOwnerEmail || 'me').sort()).toEqual([ANNA.address, BAS.address, 'me']);
    await expect(page.locator('#nsTitle')).toHaveValue('DoD follow-up');
    await expect(page.locator('#nsAgenda')).toHaveValue('Agree the final DoD.\n\n- Walk through the draft\n- Decide what goes to PST');
    await expect(page.locator('#nsOnline')).toBeChecked();

    // Edit everything; still nothing is written.
    await page.click('[data-ns-slot="1"]');
    await expect(page.locator('[data-ns-slot="1"]')).toHaveAttribute('aria-pressed', 'true');
    await page.fill('#nsTitle', 'DoD sign-off');
    await page.fill('#nsAgenda', 'Sign off the DoD.');
    await page.uncheck('#nsOnline');
    expect(await events(app)).toHaveLength(0);

    await page.click('[data-ns-invite]');
    await expect(page.locator('[data-ns-sent]')).toContainText('Invite sent · Tue 6 Oct · 12:00–12:30');
    const ev = await events(app);
    expect(ev).toHaveLength(1);
    expect(ev[0].input).toEqual({
      subject: 'DoD sign-off',
      start: { dateTime: '2026-10-06T12:00:00', timeZone: 'Europe/Amsterdam' },
      end: { dateTime: '2026-10-06T12:30:00', timeZone: 'Europe/Amsterdam' },
      attendees: [{ email: ANNA.address, name: 'Anna Jansen', type: 'required' }, { email: BAS.address, name: 'Bas Visser', type: 'required' }],
      body: '<p>Sign off the DoD.</p>', bodyType: 'html', isOnlineMeeting: false
    });
    await expect(page.locator('[data-ns-invite]')).toHaveCount(0);
    expect(await app.writeTools()).toEqual(['outlook_create_event']);

    // The invite was the follow-up: the action is marked done by itself, with Undo.
    await expect(page.locator('.toast')).toContainText('Marked done: ');
    await expect(page.locator('[data-ns-done]')).toHaveCount(0);
    expect((await actionDocs(app))[0][1].done).toBe(true);
  });

  test('an unclear outcome says to check the calendar and needs two confirmations to send again', async ({ app, page }) => {
    await app.boot(meetingsConfig());
    await openMeetingAction(app, page);
    await page.click('[data-ns-start="meeting"]');
    await expect(page.locator('[data-ns-slot]')).toHaveCount(3);
    await page.evaluate(() => window.__stub.setEventFault('server_unavailable'));
    await page.click('[data-ns-invite]');
    await expect(page.locator('[data-problem="unclear"]')).toContainText('Check your calendar before sending again.');
    await expect(page.locator('[data-ns-invite]')).toHaveText('Send invite again anyway');
    await page.waitForTimeout(800);
    await page.click('[data-ns-invite]');
    await expect(page.locator('[data-ns-invite]')).toHaveText('Yes, send again');
    expect(await events(app)).toHaveLength(1);
    await page.waitForTimeout(800);
    await page.click('[data-ns-invite]');
    await expect(page.locator('[data-ns-sent]')).toBeVisible();
    expect(await events(app)).toHaveLength(2);
  });

  test('an ambiguous name asks; an unknown name never gets an invented address', async ({ app, page }) => {
    const mail = require('./helpers/fixtures').MAIL.concat([
      m('x-anna1', ANNA.address, 'Pilot', 'About the pilot.', T('07:00')), m('x-anna2', 'anna.dewit@planonsoftware.com', 'Budget', 'About the budget.', T('07:05'))
    ]);
    await app.boot({ mail, actionPlan: { 'Zoë': { group: 'now', rank: 1, why: 'Plan it.', next: 'Plan a meeting with Anna and Zoë', nextKind: 'meeting', nextWho: ['Anna', 'Zoë'] } } });
    await add(page, 'Plan a meeting with Anna and Zoë about the pilot');
    await app.ready();
    await openMeetingAction(app, page);
    await page.click('[data-ns-start="meeting"]');
    const amb = page.locator('[data-ns-ambiguous]');
    await expect(amb).toContainText('Which Anna?');
    await expect(amb.locator('[data-ns-pick]')).toHaveText(['Anna Dewit · anna.dewit@planonsoftware.com', 'Anna Jansen · anna.jansen@planonsoftware.com']);
    await expect(page.locator('[data-ns-unknown]')).toContainText('Droplet doesn’t know an address for Zoë.');
    await expect(page.locator('[data-ns-person]')).toHaveCount(0);
    await expect(page.locator('[data-ns-invite]')).toHaveAttribute('aria-disabled', 'true');
    expect((await app.calls('mcp')).filter((c) => c.tool === 'outlook_calendar_search' && c.input.afterDateTime === '2026-10-02' && !/^(steerco|release)$/.test(c.input.query))).toHaveLength(0); // no slot search yet
    expect(await page.locator('#itemCol').innerText()).not.toMatch(/zo[eë][^\s]*@/i);

    await amb.locator('[data-ns-pick]').nth(1).click();
    await page.fill('#nsAddr1', 'zoe');
    await page.click('[data-ns-use="1"]');
    await expect(page.locator('.ns-bad')).toHaveText('That isn’t an email address.');
    await page.click('[data-ns-unknown] [data-ns-drop]');
    await expect(page.locator('[data-ns-person]')).toHaveText(['Anna Jansen · anna.jansen@planonsoftware.com×']);
    await expect(page.locator('[data-ns-slot]')).toHaveCount(3);
    expect(await events(app)).toHaveLength(0);
  });

  test('field mapping follows the runtime schema when describeTool gives one', async ({ app, page }) => {
    await app.boot({ mail: [] });
    const got = await page.evaluate(() => {
      const ns = window.Droplet.ns;
      const inv = { subject: 'Sync', start: Date.parse('2026-10-05T08:00:00Z'), end: Date.parse('2026-10-05T08:30:00Z'),
        attendees: [{ email: 'a@planonsoftware.com', name: 'A' }, { email: 'not an address', name: 'B' }], agenda: 'Line 1\n\n<b>x</b>', online: true };
      return {
        none: ns.eventInput(inv, null),
        strings: ns.eventInput(inv, { properties: { subject: {}, start: { type: 'object' }, end: { type: 'object' }, attendees: { type: 'array', items: { type: 'string' } }, body: { type: 'string' }, bodyType: {}, isOnlineMeeting: {} } }),
        graph: ns.eventInput(inv, { properties: { subject: {}, start: { type: 'object' }, end: { type: 'object' }, attendees: { type: 'array', items: { type: 'object', properties: { emailAddress: {}, type: {} } } }, body: { type: 'object' } } }),
        flat: ns.eventInput(inv, { properties: { subject: {}, start: { type: 'string' }, end: { type: 'string' }, timeZone: {}, attendees: { type: 'array', items: { type: 'object', properties: { address: {} } } } } })
      };
    });
    expect(got.none).toEqual({ subject: 'Sync', start: { dateTime: '2026-10-05T10:00:00', timeZone: 'Europe/Amsterdam' }, end: { dateTime: '2026-10-05T10:30:00', timeZone: 'Europe/Amsterdam' },
      attendees: [{ email: 'a@planonsoftware.com', name: 'A', type: 'required' }], body: '<p>Line 1</p><p>&lt;b&gt;x&lt;/b&gt;</p>', bodyType: 'html', isOnlineMeeting: true });
    expect(got.strings.attendees).toEqual(['a@planonsoftware.com']);
    expect(got.strings.bodyType).toBe('html');
    expect(got.graph.attendees).toEqual([{ emailAddress: { address: 'a@planonsoftware.com', name: 'A' }, type: 'required' }]);
    expect(got.graph.body).toEqual({ contentType: 'html', content: '<p>Line 1</p><p>&lt;b&gt;x&lt;/b&gt;</p>' });
    expect(got.graph.isOnlineMeeting).toBeUndefined();
    expect(got.flat).toEqual({ subject: 'Sync', start: '2026-10-05T10:00:00', end: '2026-10-05T10:30:00', timeZone: 'Europe/Amsterdam', attendees: [{ address: 'a@planonsoftware.com' }] });
  });

  test('the runtime schema is asked for and used for the real call', async ({ app, page }) => {
    await app.boot(meetingsConfig({ eventSchema: { type: 'object', properties: { subject: {}, start: { type: 'object' }, end: { type: 'object' }, attendees: { type: 'array', items: { type: 'string' } }, body: { type: 'string' }, bodyType: {}, isOnlineMeeting: {} } } }));
    await openMeetingAction(app, page);
    await page.click('[data-ns-start="meeting"]');
    await expect(page.locator('[data-ns-slot]')).toHaveCount(3);
    await page.click('[data-ns-invite]');
    await expect(page.locator('[data-ns-sent]')).toBeVisible();
    expect((await events(app))[0].input.attendees).toEqual([ANNA.address, BAS.address]);
    expect((await app.calls('describe')).map((c) => c.tool)).toEqual(['outlook_create_event']);
  });
});

test.describe('Draft a mail', () => {
  test('create_draft → read back → send, in order and once, with the outside-Planon warning', async ({ app, page }) => {
    await app.boot({ actionPlan: { 'addendum': { group: 'now', rank: 1, why: 'Peter waits for it.', next: 'Draft a mail to Peter', nextKind: 'mail', nextWho: ['Peter'] } },
      newMailAnswer: { subject: 'Signed addendum', draft: 'Dear Peter,\n\nAttached is the signed addendum — clause 4 as agreed.\n\nRegards,\nSam' } });
    await add(page, 'Send the signed addendum to Peter');
    await app.ready();
    await openMeetingAction(app, page);
    await page.click('[data-ns-start="mail"]');
    await expect(page.locator('[data-ns-person]')).toHaveText(['Peter · ' + PETER + '×']);
    await expect(page.locator('#nsSubject')).toHaveValue('Signed addendum');
    await expect(page.locator('#nsBody')).toHaveValue('Hi Peter,\n\nAttached is the signed addendum, clause 4 as agreed.\n\nKR\nSam');
    await expect(page.locator('[data-ns-card] [data-outside]')).toHaveText('Goes outside Planon. Check before sending.');
    const mailPrompt = (await app.calls('sample')).find((c) => /^You draft one new email/.test(c.input)).input;
    expect(mailPrompt).toContain('Email style for every draft');
    expect(await app.writeTools()).toEqual([]);

    await page.click('[data-ns-send]');
    await expect(page.locator('[data-ns-sent]')).toContainText('Sent 10:00');
    const w = (await app.calls('mcp')).filter((c) => /create|send_draft/.test(c.tool) || (c.tool === 'read_resource' && /AAkALg/.test(c.input.uri)));
    expect(w.map((c) => c.tool)).toEqual(['outlook_create_draft', 'read_resource', 'outlook_send_draft']);
    expect(w[0].input).toEqual({ to: [PETER], subject: 'Signed addendum', body: '<p>Hi Peter,</p><p>Attached is the signed addendum, clause 4 as agreed.</p><p>KR<br>Sam</p>', bodyType: 'html' });
    expect(w[2].input.messageId).toMatch(/^AAkALg.*NewMail0001AAA$/);
    await expect(page.locator('[data-ns-send]')).toHaveCount(0);
    await expect(page.locator('.toast')).toHaveText('Sent. Marked done: Send the signed addendum to PeterUndo');
    expect((await actionDocs(app))[0][1].done).toBe(true);
  });
});

test.describe('Chase in Teams (own action)', () => {
  test('copies and opens a 1:1 chat on teams.microsoft.com; nothing is written', async ({ app, page }) => {
    await page.addInitScript(() => {
      window.__copied = []; window.__opened = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } } });
      window.open = (u) => { window.__opened.push(String(u)); return null; };
    });
    await app.boot({ actionPlan: { 'Bram': { group: 'now', rank: 1, why: 'x', next: 'Chase Bram', nextKind: 'chase', nextWho: ['Bram'] } } });
    await add(page, 'Nudge Bram about the replica');
    await app.ready();
    await openMeetingAction(app, page);
    await page.click('[data-ns-start="chase"]');
    await expect(page.locator('#nsChase')).toHaveValue('Any news on this? I need it to plan the next step.');
    await page.click('[data-ns-chase]');
    expect(await page.evaluate(() => window.__opened)).toEqual(['https://teams.microsoft.com/l/chat/0/0?users=bram.kok%40planonsoftware.com']);
    expect(await page.evaluate(() => window.__copied)).toEqual(['Any news on this? I need it to plan the next step.']);
    expect(await app.writeTools()).toEqual([]);
    await expect(page.locator('.toast')).toContainText('Marked done: Nudge Bram about the replica');
    expect((await actionDocs(app))[0][1].done).toBe(true);
  });
});
