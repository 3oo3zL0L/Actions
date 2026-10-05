const { test, expect } = require('./helpers/harness');

/* Real connector formats, as seen live (invented ids of the same shape):
   create answers in plain text, read_resource in JSON with mixed-case
   recipients and a null sender, send answers in plain text. */
const IMM = 'AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0AZnzTVwCYQECtK1RmE-l8iwACkVSkqQAA';
const LINK = 'https://outlook.office365.com/owa/?ItemID=AAkALgAAAAAAHYQDEapmEc2byACqAC%2FEWg0AZnzTVwCYQECtK1RmE%2Fl8iwACkVSkqQAA&exvsurl=1&viewmodel=ReadMessageItem';
const CREATE_TEXT = 'Draft created with 1 recipient(s).\nid: ' + IMM + '\nwebLink: ' + LINK;
const SEND_TEXT = 'Draft sent to 1 recipient(s) and saved to Sent Items.';
const ORIG = 'AAMkAGInventedOriginal0000AAA=';

const sends = async (app) => (await app.calls('mcp')).filter((c) => c.tool === 'outlook_send_draft');
const draftReads = async (app) => (await app.calls('mcp')).filter((c) => c.tool === 'read_resource' && /AAkALg/.test(c.input.uri));
async function sendBram(page) {
  await page.click('[data-act="a3-bram"]');
  await expect(page.locator('#mailBody')).toContainText('Today please.');
  await page.click('#sendBtn');
}

test.describe('The MCP result envelope: every documented form', () => {
  test('resultText and resultObjects read text blocks, string payloads, structured content, text holders and bare strings', async ({ app, page }) => {
    await app.boot();
    const r = await page.evaluate(([CREATE_TEXT, SEND_TEXT]) => {
      const U = window.Droplet.util;
      const obj = { id: 'X1', subject: 's' };
      const forms = {
        blocks: { content: [{ type: 'text', text: CREATE_TEXT }], payload: CREATE_TEXT },
        multiBlock: { content: [{ type: 'text', text: CREATE_TEXT.slice(0, 35) }, { type: 'text', text: CREATE_TEXT.slice(35) }], payload: CREATE_TEXT.slice(0, 35) },
        payloadString: { content: [], payload: CREATE_TEXT },
        payloadOnly: { payload: CREATE_TEXT },
        holderText: { content: [], structuredContent: { text: CREATE_TEXT }, payload: { text: CREATE_TEXT } },
        holderResult: { content: [], payload: { result: CREATE_TEXT } },
        holderBlocks: { payload: { content: [{ type: 'text', text: CREATE_TEXT }] } },
        bare: CREATE_TEXT
      };
      const out = {};
      for (const [k, v] of Object.entries(forms)) out[k] = U.resultText(v);
      const json = JSON.stringify(obj);
      out.objects = {
        blocks: U.resultObjects({ content: [{ type: 'text', text: json }], payload: obj }),
        payloadString: U.resultObjects({ content: [], payload: json }),
        structured: U.resultObjects({ content: [], structuredContent: obj, payload: obj }),
        holder: U.resultObjects({ content: [], structuredContent: { text: json }, payload: { text: json } }),
        bare: U.resultObjects(json),
        bareObject: U.resultObjects(obj),
        plainText: U.resultObjects({ content: [{ type: 'text', text: SEND_TEXT }], payload: SEND_TEXT })
      };
      out.sendText = U.resultText({ content: [{ type: 'text', text: SEND_TEXT }], payload: SEND_TEXT });
      return out;
    }, [CREATE_TEXT, SEND_TEXT]);
    for (const k of ['blocks', 'payloadString', 'payloadOnly', 'holderText', 'holderResult', 'holderBlocks', 'bare']) expect(r[k], k).toBe(CREATE_TEXT);
    expect(r.multiBlock.replace(/\n/g, '')).toBe(CREATE_TEXT.replace(/\n/g, ''));
    for (const k of ['blocks', 'payloadString', 'structured', 'holder', 'bare', 'bareObject']) expect(r.objects[k], k).toEqual([{ id: 'X1', subject: 's' }]);
    expect(r.objects.plainText).toEqual([]);
    expect(r.sendText).toBe(SEND_TEXT);
  });

  for (const envelope of ['blocks', 'payloadString', 'holder', 'structured', 'multiBlock', 'bare']) {
    test(`the whole flow works when every answer comes as "${envelope}": load, read, send`, async ({ app, page }) => {
      await app.boot({ envelope });
      expect(await app.focusIds()).toEqual(['jira:OIDC-77', 'a3-bram', 'a2-anouk', 'a4-lena', 'a5-tom']);
      await sendBram(page);
      await expect(page.locator('#sendBtn')).toHaveText('Sent 10:00 · locked');
      const w = (await app.calls('mcp')).filter((c) => /create|send_draft/.test(c.tool) || (c.tool === 'read_resource' && /AAkALg/.test(c.input.uri)));
      expect(w.map((c) => c.tool)).toEqual(['outlook_create_reply_draft', 'read_resource', 'outlook_send_draft']);
      const id = await page.evaluate(() => Object.keys(window.__stub.drafts)[0]);
      expect(w[2].input).toEqual({ messageId: id });
    });
  }

  test('a tool failure rejects with tool_error; Outlook’s own words come from the envelope on .result', async ({ app, page }) => {
    await app.boot({ faults: { outlook_send_draft: { code: 'tool_error', message: 'Tool call failed', resultText: 'Mailbox quota exceeded', times: 1 } } });
    await sendBram(page);
    await expect(page.locator('[data-problem="failed"]')).toContainText('Outlook didn’t send it: Mailbox quota exceeded.');
    await expect(page.locator('[data-diag-msg]')).toHaveText('Mailbox quota exceeded');
  });
});

test.describe('Finding the new draft’s id', () => {
  test('extractDraft: the real plain-text answer, JSON, plain prose, and an id only in the ItemID of the link', async ({ app, page }) => {
    await app.boot();
    const r = await page.evaluate(([CREATE_TEXT, IMM, LINK, ORIG]) => {
      const f = window.Droplet.sendflow;
      const env = (t) => ({ content: [{ type: 'text', text: t }], payload: t });
      return {
        real: f.extractDraft(env(CREATE_TEXT), ORIG),
        realPayloadOnly: f.extractDraft({ content: [], payload: CREATE_TEXT }, ORIG),
        json: f.extractDraft(env(JSON.stringify({ id: IMM, webLink: LINK })), ORIG),
        jsonMessageId: f.extractDraft(env(JSON.stringify({ messageId: IMM })), ORIG),
        prose1: f.extractDraft(env('Created a reply draft. Message ID: ' + IMM + '. Open it in Outlook.'), ORIG),
        prose2: f.extractDraft(env('Your reply draft was created with id ' + IMM + ' in Drafts.'), ORIG),
        proseNotOriginal: f.extractDraft(env('Replied to message id ' + ORIG + '; the draft id is ' + IMM + '.'), ORIG),
        linkOnly: f.extractDraft(env('Draft created with 1 recipient(s).\nwebLink: ' + LINK), ORIG),
        linkInJson: f.extractDraft(env(JSON.stringify({ status: 'ok', webLink: LINK })), ORIG),
        onlyOriginal: f.extractDraft(env(JSON.stringify({ id: ORIG })), ORIG),
        nothing: f.extractDraft(env('Draft created with 1 recipient(s).'), ORIG),
        fromLink: f.idFromLink(LINK)
      };
    }, [CREATE_TEXT, IMM, LINK, ORIG]);
    for (const k of ['real', 'realPayloadOnly', 'json', 'linkOnly', 'linkInJson']) expect(r[k], k).toEqual({ id: IMM, link: LINK });
    for (const k of ['jsonMessageId', 'prose1', 'prose2', 'proseNotOriginal']) expect(r[k].id, k).toBe(IMM);
    // The link's ItemID is standard base64 (%2F = "/"); the Graph id is URL-safe ("-").
    expect(r.fromLink).toBe(IMM);
    expect(r.onlyOriginal.id).toBe('');
    expect(r.nothing).toEqual({ id: '', link: '' });
  });

  for (const createShape of ['json', 'prose', 'linkOnly']) {
    test(`Send works when the create answer is "${createShape}"`, async ({ app, page }) => {
      await app.boot({ createShape });
      await sendBram(page);
      await expect(page.locator('#sendBtn')).toHaveText('Sent 10:00 · locked');
      const id = await page.evaluate(() => Object.keys(window.__stub.drafts)[0]);
      expect((await sends(app))[0].input).toEqual({ messageId: id });
      expect((await draftReads(app))[0].input.uri).toBe('mail:///messages/' + id);
    });
  }

  test('no id in the answer: nothing is sent, and the card shows the step, the code, Outlook’s words and the answer’s shape', async ({ app, page }) => {
    await app.boot({ createShape: 'noId' });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://droplet.test' });
    await sendBram(page);
    await expect(page.locator('[data-problem="blocked"]')).toContainText('couldn’t find the draft’s id');
    await expect(page.locator('[data-diag-step]')).toHaveText('create draft');
    await expect(page.locator('[data-diag-code]')).toHaveText('no_draft_id');
    await expect(page.locator('[data-diag-msg]')).toHaveText('Draft created with 1 recipient(s).');
    expect(await sends(app)).toHaveLength(0);
    await page.click('[data-copydiag]');
    await expect(page.locator('.toast')).toContainText('Copied the details');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Droplet send blocked · step: create draft · code: no_draft_id · message: answer was plain text (34 chars)');
  });
});

test.describe('Read-back against the real read_resource shape', () => {
  test('detailOf and verify: mixed-case recipients match the lowercase search sender; a null draft sender is fine', async ({ app, page }) => {
    await app.boot();
    const r = await page.evaluate(([IMM, LINK]) => {
      const D = window.Droplet;
      const real = {
        id: IMM, subject: 'RE: Session store', bodyPreview: 'Hi Bram, OK',
        body: { contentType: 'html', content: '\r\n<html><head><style>p{}</style></head><body><p>Hi Bram,</p><p>OK from me: go with the read replica.</p><p>KR<br>Sam</p><hr><p>From: x</p></body></html>' },
        sender: { name: null, address: null }, toRecipients: [{ name: 'Bram Kok', address: 'Bram.Kok@PlanonSoftware.com' }], ccRecipients: [{ name: 'Lena', address: 'Lena.Smit@planonsoftware.com' }],
        isDraft: true, conversationId: 'AAQkADconv1', webLink: LINK, internetMessageId: '<x@example>', parentFolderId: 'AAMkADdrafts'
      };
      const d = D.mail.detailOf(real);
      const o = { originalId: 'AAMkAGorig', conversationId: 'AAQkADconv1', text: 'Hi Bram,\n\nOK from me: go with the read replica.\n\nKR\nSam' };
      return {
        d,
        lower: D.sendflow.verify(d, Object.assign({ expectedTo: 'bram.kok@planonsoftware.com' }, o)),
        upper: D.sendflow.verify(d, Object.assign({ expectedTo: 'BRAM.KOK@planonsoftware.com ' }, o)),
        other: D.sendflow.verify(d, Object.assign({ expectedTo: 'anouk.visser@planonsoftware.com' }, o)),
        conv: D.sendflow.verify(d, Object.assign({}, o, { conversationId: 'AAQkADconv2', expectedTo: 'bram.kok@planonsoftware.com' }))
      };
    }, [IMM, LINK]);
    expect(r.d).toMatchObject({ id: IMM, isDraft: true, conversationId: 'AAQkADconv1', to: ['bram.kok@planonsoftware.com'], cc: ['lena.smit@planonsoftware.com'], fromName: '', fromAddress: '' });
    expect(r.d.text).toContain('OK from me: go with the read replica.');
    expect(r.lower).toEqual({ ok: true });
    expect(r.upper).toEqual({ ok: true });
    expect(r.other).toMatchObject({ ok: false, code: 'other_recipient' });
    expect(r.conv).toMatchObject({ ok: false, code: 'other_conversation' });
  });

  test('the stub draft has mixed-case recipients and the send still goes through', async ({ app, page }) => {
    await app.boot();
    await sendBram(page);
    await expect(page.locator('#sendBtn')).toHaveText('Sent 10:00 · locked');
    const to = await page.evaluate(() => Object.values(window.__stub.drafts)[0].toRecipients[0].address);
    expect(to).toBe('Bram.Kok@Planonsoftware.Com');
  });

  for (const [mode, cfg] of [['fails', { draftReadFail: 1 }], ['returns nothing', { draftReadEmpty: 1 }]]) {
    test(`a draft read that ${mode} once is tried again once, after 1.5 s, then sends`, async ({ app, page }) => {
      await app.boot(cfg);
      await sendBram(page);
      await expect(page.locator('#sendBtn')).toHaveText('Sent 10:00 · locked', { timeout: 6000 });
      const reads = await draftReads(app);
      expect(reads).toHaveLength(2);
      expect(reads[1].t - reads[0].t).toBeGreaterThanOrEqual(1400);
      expect(await sends(app)).toHaveLength(1);
    });
  }

  test('a draft that still can’t be read is not sent: Open draft in Outlook, a plain explanation, and Send again reuses it', async ({ app, page }) => {
    await app.boot({ draftReadFail: 2 });
    await sendBram(page);
    const card = page.locator('[data-problem="blocked"]');
    await expect(card).toContainText('Outlook made the draft, but Droplet couldn’t read it back to check it, so nothing was sent. Open the draft in Outlook to check it and send it from there.', { timeout: 6000 });
    const link = await page.evaluate(() => Object.values(window.__stub.drafts)[0].webLink);
    await expect(card.locator('a.draft-link')).toHaveText('Open draft in Outlook');
    await expect(card.locator('a.draft-link')).toHaveAttribute('href', link);
    await expect(card.locator('a.draft-link')).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('[data-diag-step]')).toHaveText('read back');
    await expect(page.locator('[data-diag-code]')).toHaveText('tool_error');
    await expect(page.locator('[data-diag-msg]')).toHaveText('The specified object was not found in the store.');
    expect(await draftReads(app)).toHaveLength(2);
    expect(await sends(app)).toHaveLength(0);
    expect((await app.db())['done/a3-bram']).toBeUndefined();
    // Trying again reads the same draft back (now readable) and sends it; no second draft.
    await page.click('#sendBtn');
    await expect(page.locator('#sendBtn')).toHaveText('Sent 10:00 · locked');
    expect((await app.calls('mcp')).filter((c) => c.tool === 'outlook_create_reply_draft')).toHaveLength(1);
  });
});

test.describe('Send diagnostics', () => {
  test('a refused draft shows step, code and Outlook’s words; Copy details copies one line without addresses or links', async ({ app, page }) => {
    await app.boot({ faults: { outlook_create_reply_draft: { code: 'tool_error', message: 'Tool call failed', resultText: 'Recipient Bram.Kok@planonsoftware.com rejected, see https://aka.example/x <b>now</b>' } } });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://droplet.test' });
    await sendBram(page);
    const card = page.locator('[data-problem="failed"]');
    await expect(card).toContainText('Outlook didn’t make the draft');
    await expect(page.locator('[data-diag-step]')).toHaveText('create draft');
    await expect(page.locator('[data-diag-code]')).toHaveText('tool_error');
    // Outlook's words, as text only.
    await expect(page.locator('[data-diag-msg]')).toHaveText('Recipient Bram.Kok@planonsoftware.com rejected, see https://aka.example/x <b>now</b>');
    expect(await card.locator('b, a[href*="aka.example"]').count()).toBe(0);
    await page.click('[data-copydiag]');
    const line = await page.evaluate(() => navigator.clipboard.readText());
    expect(line).toBe('Droplet send failed · step: create draft · code: tool_error · message: Recipient [address] rejected, see [link] <b>now</b>');
    expect(line).not.toMatch(/@|https?:|read replica|Hi Bram/);
    expect(await sends(app)).toHaveLength(0);
  });

  test('an unclear send names the send step and the code', async ({ app, page }) => {
    await app.boot({ faults: { outlook_send_draft: 'server_unavailable' } });
    await sendBram(page);
    await expect(page.locator('[data-problem="unclear"]')).toBeVisible();
    await expect(page.locator('[data-diag-step]')).toHaveText('send');
    await expect(page.locator('[data-diag-code]')).toHaveText('server_unavailable');
  });

  test('a failed check names the check step and a code; the copied line has no addresses', async ({ app, page }) => {
    await app.boot({ readBack: 'otherRecipient' });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://droplet.test' });
    await sendBram(page);
    await expect(page.locator('[data-diag-step]')).toHaveText('check');
    await expect(page.locator('[data-diag-code]')).toHaveText('other_recipient');
    await expect(page.locator('[data-diag-msg]')).toHaveCount(0);
    await page.click('[data-copydiag]');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Droplet send blocked · step: check · code: other_recipient');
  });

  test('Copy details still works without clipboard access (falls back to a selection copy)', async ({ app, page }) => {
    await app.boot({ readBack: 'mismatch' });
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); });
    await sendBram(page);
    await expect(page.locator('[data-diag-code]')).toHaveText('text_mismatch');
    await page.click('[data-copydiag]');
    await expect(page.locator('.toast')).toBeVisible();
  });

  test('nothing is logged to the console during a send, also when it fails', async ({ app, page }) => {
    const logs = [];
    page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
    await app.boot({ faults: { outlook_send_draft: { code: 'tool_error', message: 'x', resultText: 'Mailbox quota exceeded for bram.kok@planonsoftware.com', times: 1 } } });
    await sendBram(page);
    await expect(page.locator('[data-problem="failed"]')).toBeVisible();
    await page.click('#sendBtn');
    await expect(page.locator('#sendBtn')).toHaveText('Sent 10:00 · locked');
    expect(logs).toEqual([]);
  });
});
