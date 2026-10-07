/* Approved leave from the "Planon Verlof Goedkeurder" extension: only runs that
   approved something become a card in Today; Done takes it off. The report is
   stored, then acked to the extension. Droplet never approves or starts a run. */
const { test, expect } = require('./helpers/harness');

const REPORT = { id: 'run-1791300000000', startedAt: 1791300000000, finishedAt: 1791300060000, auto: true, approve: true, page: 'https://example.planoncloud.com/case/x',
  fatal: '', stopped: false, requests: [
    { number: '1201', requestor: 'Anna Jansen', type: 'Leave', fromText: '12-10-2026 09:00', tillText: '12-10-2026 17:00', from: '2026-10-12T07:00:00.000Z', till: '2026-10-12T15:00:00.000Z', hours: 8, expected: 8, ok: true, msg: '', outcome: 'approved' },
    { number: '1202', requestor: 'Bas Visser', type: 'Leave', fromText: '13-10-2026 09:00', tillText: '14-10-2026 17:00', from: '2026-10-13T07:00:00.000Z', till: '2026-10-14T15:00:00.000Z', hours: 16, expected: 16, ok: true, msg: '', outcome: 'approved' },
    { number: '1203', requestor: 'Cor de Wit', type: 'Leave', fromText: '15-10-2026 09:00', tillText: '15-10-2026 13:00', from: '2026-10-15T07:00:00.000Z', till: '2026-10-15T11:00:00.000Z', hours: 6, expected: 4, ok: false, msg: 'hours differ', outcome: 'check-failed' }
  ] };
const NOTHING = { id: 'run-1791300100000', startedAt: 1791300100000, finishedAt: 1791300160000, auto: false, requests: [
  { number: '1300', requestor: 'Dirk Smit', type: 'Leave', fromText: 'x', tillText: 'y', from: '', till: '', hours: null, outcome: 'not-done' }] };

async function bridge(page) {
  await page.addInitScript(() => {
    window.__toExt = [];
    window.addEventListener('message', (e) => { if (e.data && e.data.source === 'action-desk') window.__toExt.push(e.data); });
  });
}
const send = (page, reports) => page.evaluate((r) => window.postMessage({ source: 'leave-approver', type: 'reports', reports: r }, '*'), reports);

test.describe('Leave approvals', () => {
  test('a run with approved days is one card in Today (approved only); stored, acked; Done keeps it off after a reload', async ({ app, page }) => {
    await bridge(page);
    await app.boot();
    await expect.poll(() => page.evaluate(() => window.__toExt.some((m) => m.type === 'hello'))).toBe(true);
    await send(page, [REPORT, NOTHING, { id: 'bad', requests: 'x' }]);
    const card = page.locator('#focus .fi[data-id="leave:run-1791300000000"]');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Leave approved · 2 requests');
    await expect(card).toContainText('Anna Mon 12 Oct (8 h)');
    await expect(card).toContainText('Bas Tue 13 Oct – Wed 14 Oct (16 h)');
    await expect(page.locator('#focus')).not.toContainText('Cor');
    await expect(page.locator('#focus .fi[data-id="leave:run-1791300100000"]')).toHaveCount(0); // nothing approved: no card
    await expect(card.locator('[data-act]')).toHaveCount(0); // no action, only Done
    const db = await app.db();
    expect(Object.keys(db).filter((k) => k.startsWith('leave/')).sort()).toEqual(['leave/run-1791300000000', 'leave/run-1791300100000']);
    const acks = await page.evaluate(() => window.__toExt.filter((m) => m.type === 'leave-ack').flatMap((m) => m.ids));
    expect(acks.sort()).toEqual(['run-1791300000000', 'run-1791300100000']);
    // The item view lists who, when and hours.
    await card.locator('.fi-open').click();
    await expect(page.locator('#itemCol .leave-list li')).toHaveCount(2);
    await page.click('#sendBtn');
    await expect(page.locator('#focus .fi[data-id="leave:run-1791300000000"]')).toHaveCount(0);
    await page.reload(); await app.ready();
    await page.waitForTimeout(300);
    await expect(page.locator('#focus .fi[data-id="leave:run-1791300000000"]')).toHaveCount(0);
    // Sent again by the extension (not yet acked there): stored once, acked again, no new card.
    await send(page, [REPORT]);
    await expect.poll(() => page.evaluate(() => window.__toExt.filter((m) => m.type === 'leave-ack').length)).toBeGreaterThan(0);
    await expect(page.locator('#focus .fi[data-id="leave:run-1791300000000"]')).toHaveCount(0);
    expect(await app.writeTools()).toEqual([]);
  });
});
