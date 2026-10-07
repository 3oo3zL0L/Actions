/* Agenda in Today: today's Green / Blue / Red appointments (until they end),
   and STEERCO and the quarterly release plan from 14 days before. Read-only. */
const { test, expect } = require('./helpers/harness');

const WE = 'W. Europe Standard Time';
const at = (day, hhmm) => ({ dateTime: `${day}T${hhmm}:00.0000000`, timeZone: WE });
const ev = (id, subject, day, s, e, categories, extra = {}) => Object.assign({ id, subject, organizer: 'sam.devries@planonsoftware.com', attendees: ['anna.jansen@planonsoftware.com'],
  start: at(day, s), end: at(day, e), showAs: 'busy', isAllDay: false, isCancelled: false, categories, webLink: 'https://outlook.office365.com/calendar/item/' + id }, extra);
const cal = (id, subject, day, s, e, categories) => ({ id, subject, organizer: { name: 'Sam de Vries', address: 'sam.devries@planonsoftware.com' },
  people: [], start: at(day, s), end: at(day, e), categories });

const TODAY = [
  ev('g1', 'Catch up Bart / Sam', '2026-10-02', '14:00', '14:30', ['Green category']),
  ev('r1', 'Lunch', '2026-10-02', '12:00', '13:00', ['Orange category', 'Red category']),
  ev('b-ended', 'Early sync', '2026-10-02', '08:00', '09:00', ['Blue category']),
  ev('o1', 'Team standup', '2026-10-02', '11:00', '11:15', ['Orange category']),
  ev('n1', 'No colour', '2026-10-02', '15:00', '15:30', null),
  ev('bl', 'Architecture review', '2026-10-02', '16:00', '17:00', ['Blauwe categorie'])
];
const AHEAD = [
  cal('st', 'Steerco update', '2026-10-12', '11:00', '12:00', null),
  cal('q4', 'Release plan Q4', '2026-10-14', '10:00', '12:00', ['Red category']),
  cal('q1', 'Release plan Q1', '2026-10-28', '10:00', '12:00', ['Red category']),
  cal('rn', 'Release notes 26.4 review', '2026-10-06', '10:00', '11:00', null)
];
const ids = (page) => page.$$eval('#focus .fi[data-id^="cal:"] .fi-title', (els) => els.map((e) => e.textContent));

test.describe('Agenda in Today', () => {
  test('coloured appointments of today (not yet ended), in time order; STEERCO and release plan from 14 days ahead', async ({ app, page }) => {
    await app.boot({ events: TODAY, calendar: AHEAD });
    await expect.poll(() => ids(page)).toEqual(['Lunch', 'Catch up Bart / Sam', 'Architecture review', 'Steerco update', 'Release plan Q4']);
    const card = page.locator('#focus .fi', { hasText: 'Catch up Bart / Sam' });
    await expect(card.locator('.cal-dot.cal-green')).toHaveCount(1);
    await expect(card).toContainText('14:00–14:30');
    await expect(card.locator('[data-act]')).toHaveText('Open in Outlook');
    await expect(page.locator('#focus .fi', { hasText: 'Architecture review' }).locator('.cal-dot.cal-blue')).toHaveCount(1);
    const st = page.locator('#focus .fi', { hasText: 'Steerco update' });
    await expect(st).toContainText('In 10 days');
    await expect(st.locator('[data-act]')).toHaveText('Open STEERCO list');
    await st.locator('[data-act]').click();
    await expect(page.locator('#steerBox')).toBeVisible();
    // Orange, uncoloured, ended, outside 14 days and other "release" meetings stay out.
    for (const t of ['Team standup', 'No colour', 'Early sync', 'Release plan Q1', 'Release notes 26.4 review']) await expect(page.locator('#focus')).not.toContainText(t);
    expect(await app.writeTools()).toEqual([]);
  });

  test('Done takes an agenda card off, also after a reload; its item view shows the time and Outlook', async ({ app, page }) => {
    await app.boot({ events: TODAY, calendar: AHEAD });
    const card = page.locator('#focus .fi', { hasText: 'Lunch' });
    await expect(card).toHaveCount(1);
    await card.locator('.fi-open').click();
    await expect(page.locator('#ivTitle')).toHaveText('Lunch');
    await expect(page.locator('#itemCol a[href^="https://outlook.office365.com/"]')).toHaveCount(1);
    await page.click('#sendBtn');
    await expect(page.locator('#focus')).not.toContainText('Lunch');
    await page.reload(); await app.ready();
    await expect.poll(() => ids(page)).not.toContain('Lunch');
    await expect.poll(() => ids(page)).toContain('Catch up Bart / Sam');
  });
});
