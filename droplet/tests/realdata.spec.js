/* Regression: saved actions and inbox mail shaped exactly like the live data
   (field names, nulls and types as the real db and outlook_email_search
   return them; the values are invented). */
const { test, expect } = require('./helpers/harness');

const ACT = (text, created) => ({ created, done: false, doneAt: null, due: null, dueBy: null, notes: '', text });
const MAIL = (n, sender, subject, isRead, recipients) => ({
  uri: 'mail:///messages/AAMkAGTEST' + n + '%3D', id: 'AAMkAGTEST' + n + '=', subject, sender,
  recipients, receivedDateTime: '2026-10-02T07:1' + n + ':00.000Z', sentDateTime: '2026-10-02T07:1' + n + ':00.000Z',
  summary: 'Hi,\r\n\r\nCan you look at this before Friday?\r\n\r\nKR', hasAttachments: false, importance: 'normal', isRead,
  webLink: 'https://outlook.office365.com/owa/?ItemID=AAMkAGTEST' + n + '%3D&exvsurl=1&viewmodel=ReadMessageItem',
  internetMessageId: '<x' + n + '@example.test>', offset: n
});

test('live-shaped saved actions and inbox mail both show after a load', async ({ app, page }) => {
  await app.boot({
    dbSeed: {
      'actions/amtest000000001': ACT('Order lenses', '2026-10-02T07:37:34.790Z'),
      'actions/amtest000000002': ACT('hello', '2026-10-02T07:39:03.671Z')
    },
    mail: [
      MAIL(1, 'pat.lee@planonsoftware.com', 'Question about the DoD', false, ['Me.Person@planonsoftware.com']),
      MAIL(2, 'jira@planon.atlassian.net', 'Me Person, here is your weekly update for 1 Oct', false, null),
      MAIL(3, 'sam.ray@planonsoftware.com', 'Old thread', true, ['Me.Person@planonsoftware.com'])
    ]
  });
  const ids = await page.evaluate(() => window.Droplet.state.items.map((m) => m.id));
  expect(ids).toEqual(expect.arrayContaining(['AAMkAGTEST1=', 'mine:amtest000000001', 'mine:amtest000000002']));
  expect(ids).not.toContain('AAMkAGTEST2=');
  expect(ids).not.toContain('AAMkAGTEST3=');
  expect(app.errors).toEqual([]);
});
