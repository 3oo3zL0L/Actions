/* Real envelopes differ from the stubs: Droplet reads every documented
   shape (and a few tolerated ones), never turns an unknown shape into an
   empty "ok", and Copy details carries a SHAPE line per source (keys,
   types, block lengths) without values or addresses. */
const { test, expect } = require('./helpers/harness');

const FAST = { callMs: 1500, pageMs: 2000, storeMs: 1500, useMs: 1500, sampleMs: 1500, rankDebounceMs: 50 };
const ACTION = (text, done = false) => ({ text, created: '2026-10-01T08:00:00.000Z', done, doneAt: done ? '2026-10-01T09:00:00.000Z' : null, due: null, dueBy: null, notes: '' });
const SEED = {
  'actions/act-one': ACTION('Plan DoD follow-up meeting'),
  'actions/act-two': ACTION('Review the SIEM test plan'),
  'actions/act-three': ACTION('Book the retro room'),
  'actions/act-four': ACTION('Old finished thing', true)
};
const OPEN_IDS = ['mine:act-one', 'mine:act-two', 'mine:act-three'];
const ids = (page) => page.evaluate(() => window.Droplet.state.items.map((m) => m.id));
const diag = (page) => page.evaluate(() => window.Droplet.diagText());
const line = (text, prefix) => text.split('\n').find((l) => l.startsWith(prefix)) || '';

test.describe('Saved items: every snapshot shape the db may answer with', () => {
  for (const shape of ['docs', 'array', 'forEach', 'dataObject', 'paged']) {
    test(`db snapshot "${shape}": the three open actions show, saved is ok`, async ({ app, page }) => {
      await app.boot({ dbSeed: SEED, dbShape: shape === 'docs' ? undefined : shape, dropletConfig: FAST });
      const got = await ids(page);
      for (const id of OPEN_IDS) expect(got).toContain(id);
      expect(got).not.toContain('mine:act-four'); // done stays stored, not listed
      const text = await diag(page);
      expect(text).toContain('Saved items: ok');
      expect(line(text, 'Saved raw: ')).toContain('actions 4 (open 3, done 1)');
      if (shape === 'paged') expect((await app.calls('db')).filter((c) => c.op === 'next' && c.path === 'actions')).toHaveLength(3);
    });
  }

  test('the collection read asks for the documented maximum page (limit 1000)', async ({ app }) => {
    await app.boot({ dbSeed: SEED, dropletConfig: FAST });
    const lim = (await app.calls('db')).filter((c) => c.op === 'limit' && c.path === 'actions');
    expect(lim).toEqual([{ kind: 'db', op: 'limit', path: 'actions', n: 1000 }]);
  });

  test('an unknown snapshot shape is "error · unknown_shape", never an empty ok', async ({ app, page }) => {
    await app.boot({ dbSeed: SEED, dbShape: 'unknown', dropletConfig: FAST });
    const text = await diag(page);
    expect(text).toContain('Saved items: error · unknown_shape');
    const raw = line(text, 'Saved raw: ');
    expect(raw).toMatch(/^Saved raw: \{items:\[4×\{key:str,value:\{…\}\}\],count:num\} · actions \(unknown shape\)/);
    expect(raw).not.toMatch(/Plan DoD|act-one|2026/);
    await page.click('#diagBtn');
    await expect(page.locator('[data-diag-src="saved"] .d-state')).toHaveText('error · unknown_shape');
  });

  test('a truly empty collection stays ok', async ({ app, page }) => {
    await app.boot({ dbSeed: {}, dropletConfig: FAST });
    const text = await diag(page);
    expect(text).toContain('Saved items: ok');
    expect(line(text, 'Saved raw: ')).toContain('actions 0 (open 0, done 0)');
  });
});

test.describe('Mail: tolerant inbox parsing, and never empty by accident', () => {
  test('a search answer without isRead keeps the mail (read state unknown) and says so', async ({ app, page }) => {
    await app.boot({ search: 'noReadFlag', dropletConfig: FAST });
    const got = await ids(page);
    expect(got).toContain('a3-bram');
    expect(got).toContain('a2-anouk');
    const text = await diag(page);
    expect(text).toContain('Mail: ok');
    expect(line(text, 'Mail raw: ')).toMatch(/unread \d+ \(no read flag \d+\)/);
  });

  test('a wrapper {value: [...], nextOffset} is opened, pages are followed', async ({ app, page }) => {
    await app.boot({ search: 'wrapper', dropletConfig: FAST });
    const got = await ids(page);
    expect(got).toContain('a3-bram');
    expect(got).toContain('a10-page2');
    expect(got.some((id) => /^read-/.test(id))).toBe(false);
  });

  test('results Droplet cannot read are "error · unparsed", not an empty ok', async ({ app, page }) => {
    await app.boot({ search: 'prose', dropletConfig: FAST });
    const got = await ids(page);
    expect(got.filter((id) => !/^(teams|mine|wait|jira|conf):/.test(id))).toEqual([]);
    const text = await diag(page);
    expect(text).toContain('Mail: error · unparsed');
    expect(line(text, 'Mail raw: ')).toMatch(/^Mail raw: \{content:\[text\(\d+\)\],payload:str\} · raw objects 0 · parsed 0 .*· unparsed$/);
    await expect(page.locator('[data-note="mail"]')).toBeVisible();
  });

  test('a truly empty inbox stays ok: an empty JSON list or "No emails found."', async ({ app, page }) => {
    await app.boot({ mail: [], dropletConfig: FAST });
    expect(await diag(page)).toContain('Mail: ok');
    await expect(page.locator('[data-note="mail"]')).toHaveCount(0);
  });
  test('"No emails found." is a recognised empty inbox', async ({ app, page }) => {
    await app.boot({ mail: [], search: 'noneText', dropletConfig: FAST });
    expect(await diag(page)).toContain('Mail: ok');
  });
});

test.describe('Copy details: one SHAPE line per source, no values', () => {
  test('shapes with block lengths and stage counts; no addresses, subjects, ids or links', async ({ app, page }) => {
    await page.addInitScript(() => {
      window.__copied = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } } });
    });
    await app.boot({ dbSeed: SEED, envelope: 'multiBlock', dropletConfig: FAST });
    await page.click('#diagBtn');
    await page.click('[data-diag-copy]');
    const text = (await page.evaluate(() => window.__copied))[0];
    const mailLine = line(text, 'Mail raw: ');
    expect(mailLine).toMatch(/^Mail raw: \{content:\[text\(\d+\),text\(\d+\)\],payload:str\} · raw objects 32 · parsed 31 · unread \d+ · after noise rules \d+ · jira \d+ · items \d+$/);
    expect(line(text, 'Saved raw: ')).toMatch(/^Saved raw: \{docs:\[4×\{id:str,exists:bool,data:fn,metadata:\{.*\}\}\],size:num,empty:bool,docChanges:fn,metadata:\{\}\} · actions 4 \(open 3, done 1\)/);
    expect(line(text, 'Profile raw: ')).toMatch(/^Profile raw: \{content:\[text\(\d+\)\],payload:\{displayName:str,mail:str,id:str\}\}$/);
    expect(line(text, 'Teams raw: ')).toMatch(/^Teams raw: (none yet|\{.*\}) · raw objects \d+ · messages \d+ · items \d+$/);
    expect(text).toContain('Jira raw: ');
    expect(text).toContain('Calendar raw: ');
    expect(text).not.toMatch(/@|https?:|planonsoftware|outlook\.office/);
    for (const v of ['Bram', 'Session store', 'Plan DoD', 'act-one', 'a3-bram', 'Sam de Vries', '2026-10-01T']) expect(text).not.toContain(v);
  });

  test('shapeOf: keys and types only, depth 3, 12 keys per level, data-like keys hidden', async ({ app, page }) => {
    await app.boot({ dropletConfig: FAST });
    const r = await page.evaluate(() => {
      const S = window.Droplet.util.shapeOf;
      const wide = {}; for (let i = 0; i < 15; i++) wide['k' + i] = i;
      return {
        env: S({ content: [{ type: 'text', text: 'x'.repeat(5321) }, { type: 'text', text: 'y'.repeat(812) }], isError: false }),
        deep: S({ a: { b: { c: { d: 1 } } } }),
        wide: S(wide),
        keys: S({ 'someone@example.com': 1, 'https://x.example/': 2, '@odata.nextLink': 'secret' }),
        arr: S([{ id: 'secret', n: 1 }, { id: 'other' }]),
        prim: [S('secret value'), S(3), S(null), S(true)]
      };
    });
    expect(r.env).toBe('{content:[text(5321),text(812)],isError:bool}');
    expect(r.deep).toBe('{a:{b:{c:{…}}}}');
    expect(r.wide).toBe('{k0:num,k1:num,k2:num,k3:num,k4:num,k5:num,k6:num,k7:num,k8:num,k9:num,k10:num,k11:num,…+3}');
    expect(r.keys).toBe('{#:num,#:num,#:str}');
    expect(r.arr).toBe('[2×{id:str,n:num}]');
    expect(r.prim).toEqual(['str', 'num', 'null', 'bool']);
  });
});
