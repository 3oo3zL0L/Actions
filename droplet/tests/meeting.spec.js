const { test, expect } = require('./helpers/harness');
const { TID, teamsConfig } = require('./helpers/fixtures');

const SAM = 'sam.devries@planonsoftware.com';
const WE = 'W. Europe Standard Time';
function ev(id, start, end, people, extra = {}) {
  return Object.assign({
    uri: 'calendar:///events/' + id, id, subject: 'Invented meeting ' + id, organizer: SAM, attendees: people.concat([SAM]),
    start, end, location: 'Room 1', showAs: 'busy', isAllDay: false, isCancelled: false, isOrganizer: true,
    webLink: 'https://outlook.office365.com/calendar/item/' + id
  }, extra);
}
const at = (hhmm, tz = WE, day = '2026-10-02') => ({ dateTime: `${day}T${hhmm}:00.0000000`, timeZone: tz });
const EVENTS = [
  ev('ev-iris', at('14:00'), at('14:30'), ['Iris.Meijer@PlanonSoftware.com']),             // case-insensitive match
  ev('ev-bram', at('12:30', 'UTC'), at('13:00', 'UTC'), ['bram.kok@planonsoftware.com'], { organizer: 'pm.lead@planonsoftware.com', isOrganizer: false }),
  ev('ev-anouk', at('11:00'), at('11:30'), ['anouk.visser@planonsoftware.com'], { isCancelled: true }),
  ev('ev-lena', at('11:00'), at('12:00'), ['lena.smit@planonsoftware.com'], { showAs: 'free' }),
  ev('ev-tom', at('00:00'), at('00:00', WE, '2026-10-03'), ['tom.bakker@planonsoftware.com'], { isAllDay: true }),
  ev('ev-kees', at('08:00'), at('08:30'), ['kees.mulder@planonsoftware.com']),               // already over at 10:00
  ev('ev-peter', at('16:00'), at('16:30'), ['peter@monitorco.example'], { showAs: 'tentative' })
];
const meetingTag = (page, id) => page.locator(`[data-id="${id}"] [data-meeting], [data-open="${id}"] .rr-sub`);

test.describe('R5: meeting today', () => {
  test('a meeting today with the sender or a chat participant adds a tag and goes into the prompt; cancelled, free, all-day and past meetings do not', async ({ app, page }) => {
    await app.boot(teamsConfig({ events: EVENTS, dropletConfig: { rankBatch: 50 } }));
    const cal = (await app.calls('mcp')).filter((c) => c.tool === 'outlook_calendar_search' && c.input.afterDateTime === 'today'); // R5 only; R6 reads past meetings separately
    expect(cal.map((c) => c.input)).toEqual([{ query: '*', afterDateTime: 'today', beforeDateTime: 'tomorrow', limit: 25 }]);

    await expect(page.locator(`[data-id="${TID('iris')}"] [data-meeting]`)).toHaveText('Meeting 14:00');
    await expect(page.locator('[data-id="a3-bram"] [data-meeting]')).toHaveText('Meeting 14:30');
    for (const id of ['a2-anouk', 'a4-lena', 'a5-tom', 'jira:OIDC-77']) await expect(page.locator(`[data-id="${id}"] [data-meeting]`)).toHaveCount(0);
    await app.openRest();
    await expect(meetingTag(page, 'a6-peter')).toContainText('meeting 16:00');
    await expect(meetingTag(page, 'a8-kees')).not.toContainText('meeting');
    await expect(page.locator('[data-meeting]')).toHaveCount(2); // no meeting rows of its own

    const p = (await app.calls('sample'))[0].input;
    expect(p).toContain('R5. "Meeting today" on an item means the user meets that person today: raise that person\'s items and say so in why, e.g. "You meet Anouk at 14:00; answer before then."');
    const block = (id, kind) => { const s = p.indexOf(`id="${id}">>>`); return p.slice(s, p.indexOf(`<<<END ${kind}`, s)); };
    expect(block(TID('iris'), 'TEAMS')).toContain('Meeting today: 14:00 with Iris');
    expect(block('a3-bram', 'EMAIL')).toContain('Meeting today: 14:30 with Bram');
    for (const id of ['a2-anouk', 'a4-lena', 'a5-tom', 'a8-kees']) expect(block(id, 'EMAIL')).not.toContain('Meeting today');

    await app.openItem('a3-bram');
    await expect(page.locator('.iv-meta [data-meeting]')).toHaveText('Meeting 14:30');
  });

  test('the calendar is only read when there are open items', async ({ app }) => {
    await app.boot({ mail: [], events: EVENTS });
    expect((await app.calls('mcp')).filter((c) => c.tool === 'outlook_calendar_search' && c.input.afterDateTime === 'today')).toEqual([]);
  });

  test('a meeting that appears later asks Claude again for that person only', async ({ app, page }) => {
    await app.boot({ dropletConfig: { rankBatch: 50 } });
    await page.evaluate((e) => window.__stub.setEvents(e), [EVENTS[1]]);
    await page.click('[data-sync]');
    await app.ready();
    const samples = await app.calls('sample');
    expect(samples).toHaveLength(2);
    expect(samples[1].input).toContain('id="a3-bram"');
    expect(samples[1].input).toContain('Meeting today: 14:30 with Bram');
    expect(samples[1].input).not.toContain('id="a2-anouk"');
    await expect(page.locator('[data-id="a3-bram"] [data-meeting]')).toHaveText('Meeting 14:30');
  });

  test('a failing calendar read is one quiet line and ranking goes on', async ({ app, page }) => {
    await app.boot({ faults: { outlook_calendar_search: 'server_unavailable' } });
    await expect(page.locator('[data-note="cal"]')).toContainText('Couldn’t read today’s calendar');
    expect(await app.focusIds()).toEqual(['jira:OIDC-77', 'a3-bram', 'a2-anouk', 'a4-lena', 'a5-tom']);
  });

  test('Outlook wall-clock times convert correctly (W. Europe = Europe/Amsterdam, summer and winter)', async ({ app, page }) => {
    await app.boot();
    const iso = await page.evaluate(() => {
      const f = (dt, tz) => new Date(window.Droplet.meet.toInstant({ dateTime: dt, timeZone: tz })).toISOString();
      return [
        f('2026-10-02T09:00:00.0000000', 'W. Europe Standard Time'),
        f('2026-12-01T09:00:00.0000000', 'W. Europe Standard Time'),
        f('2026-10-25T03:30:00.0000000', 'W. Europe Standard Time'), // just after the switch back to winter time
        f('2026-10-02T09:00:00.0000000', 'UTC'),
        f('2026-10-02T09:00:00.0000000', 'Europe/Amsterdam'),
        f('2026-10-02T09:00:00Z', 'W. Europe Standard Time')
      ];
    });
    expect(iso).toEqual(['2026-10-02T07:00:00.000Z', '2026-12-01T08:00:00.000Z', '2026-10-25T02:30:00.000Z',
      '2026-10-02T09:00:00.000Z', '2026-10-02T07:00:00.000Z', '2026-10-02T09:00:00.000Z']);
    expect(await page.evaluate(() => isNaN(window.Droplet.meet.toInstant({ dateTime: '2026-10-02T09:00:00', timeZone: 'Nowhere Standard Time' })))).toBe(true);
  });
});

test.describe('R5 in another time zone', () => {
  test.use({ timezoneId: 'Europe/London' });
  test('times are shown in the viewer’s local time', async ({ app, page }) => {
    await app.boot(teamsConfig({ events: EVENTS }));
    await expect(page.locator(`[data-id="${TID('iris')}"] [data-meeting]`)).toHaveText('Meeting 13:00');
    await expect(page.locator('[data-id="a3-bram"] [data-meeting]')).toHaveText('Meeting 13:30');
  });
});
