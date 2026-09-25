// Fase 3: "Send to PO" (comments-capability, docs/contract/comments.d.ts) en het gebruikslog (db `gebruik`).
const { test: base, expect } = require("@playwright/test");
const { buildMock } = require("./fixtures");
const { openPage, mockLog, dbDump } = require("./helpers");

const SEND_TOOLS = /send_mail|send_draft|forward_mail|outlook_send/;
const test = base.extend({
  open: async ({ page }, use) => {
    let problems = null;
    await use(async (mock, opts) => (problems = await openPage(page, mock, opts)));
    if (!problems || page.isClosed()) return;
    const log = await page.evaluate(() => window.__MOCK_LOG__).catch(() => null);
    if (log) {
      expect(log.violations, "contractschendingen").toEqual([]);
      expect(log.mcp.filter((c) => SEND_TOOLS.test(c.tool))).toEqual([]);
    }
    expect(problems.pageErrors, "uncaught exceptions").toEqual([]);
  },
});

const ALL_CAPS = { mcp: true, sample: true, db: true, permissions: true, comments: true };
const withComments = (comments, caps = ALL_CAPS) => buildMock({ capabilities: caps, comments });
const commentsLog = async (page, verb) => (await mockLog(page)).comments.filter((c) => !verb || c.verb === verb);
const dialog = (page) => page.getByRole("dialog", { name: "Send to PO" });

async function feedbackDocs(page) {
  return Object.entries(await dbDump(page, "feedback/")).map(([path, d]) => ({ id: path.split("/")[1], ...d }));
}

test.describe("Send to PO", () => {
  test("available: bewaart feedback en stuurt via sendToClaude met de juiste tekst", async ({ page, open }) => {
    await open(withComments({ canSend: "available" }));
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    // Niet op load: canSendToClaude/anchorFor/sendToClaude pas na de klik.
    expect(await commentsLog(page)).toEqual([]);

    await page.getByRole("button", { name: "Send to PO", exact: true }).click();
    const dlg = dialog(page);
    await expect(dlg).toBeVisible();
    await expect(dlg.getByLabel("Onderdeel")).toHaveValue("Algemeen");
    await dlg.getByLabel(/wat zie je/i).fill("Nu-strip mag ook de volgende deadline tonen.");
    await dlg.getByLabel("Must").check();
    await dlg.getByRole("button", { name: "Verstuur naar PO" }).click();
    await expect(dlg.getByText("Verstuurd. De PO reageert in de opmerking bij dit onderdeel.")).toBeVisible();

    const [doc] = await feedbackDocs(page);
    expect(doc).toMatchObject({ onderdeel: "Algemeen", tekst: "Nu-strip mag ook de volgende deadline tonen.", prio: "Must", status: "nieuw" });
    expect(typeof doc.createdAt).toBe("string");
    await expect.poll(async () => (await feedbackDocs(page))[0].threadId).toBe("thread-1");

    const sends = await commentsLog(page, "sendToClaude");
    expect(sends).toHaveLength(1);
    expect(sends[0].args.text).toBe(
      `Send to PO\nOnderdeel: Algemeen · Prio: Must\n\nNu-strip mag ook de volgende deadline tonen.\n\nfeedback-id: ${doc.id}`);
    expect(sends[0].args.anchor.path).toBe("#top");
    expect((await commentsLog(page, "anchorFor")).length).toBe(1);
  });

  test("writers_only: alleen bewaard, met melding en zonder sendToClaude", async ({ page, open }) => {
    await open(withComments({ canSend: "writers_only" }));
    await page.getByRole("button", { name: "Send to PO", exact: true }).click();
    const dlg = dialog(page);
    await dlg.getByLabel(/wat zie je/i).fill("Tabs onthouden werkt fijn.");
    await dlg.getByRole("button", { name: "Verstuur naar PO" }).click();
    await expect(dlg.getByText(/Bewaard\. De PO pakt het op bij de volgende ronde\./)).toBeVisible();
    await expect(dlg.getByRole("status")).toContainText(/alleen als editor/i);
    expect(await commentsLog(page, "sendToClaude")).toEqual([]);
    const docs = await feedbackDocs(page);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ onderdeel: "Algemeen", prio: "Should", status: "nieuw" });
    expect(docs[0].threadId).toBeUndefined();
  });

  test("sectieknop vult het onderdeel voor en ankert op die sectie", async ({ page, open }) => {
    await open(withComments({ canSend: "available" }));
    await page.getByRole("button", { name: "Send to PO: Acties" }).click();
    const dlg = dialog(page);
    await expect(dlg.getByLabel("Onderdeel")).toHaveValue("Acties");
    await dlg.getByLabel(/wat zie je/i).fill("Groepering per programma is prima.");
    await dlg.getByRole("button", { name: "Verstuur naar PO" }).click();
    await expect(dlg.getByText(/Verstuurd/)).toBeVisible();
    const [send] = await commentsLog(page, "sendToClaude");
    expect(send.args.anchor.path).toBe("#acties");
    expect(send.args.text).toMatch(/^Send to PO\nOnderdeel: Acties · Prio: Should\n/);
    // Annuleren en Esc sluiten het paneel.
    await dlg.getByRole("button", { name: "Annuleren" }).click();
    await expect(dlg).toBeHidden();
    await page.getByRole("button", { name: "Send to PO: Claude" }).click();
    await expect(dlg.getByLabel("Onderdeel")).toHaveValue("Claude");
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
  });

  test("sendToClaude-fout: bewaard, fout in mensentaal, geen automatische herhaling", async ({ page, open }) => {
    await open(withComments({ canSend: "available", sendError: { code: "consent_required", message: "no consent" } }));
    await page.getByRole("button", { name: "Send to PO", exact: true }).click();
    const dlg = dialog(page);
    await dlg.getByLabel(/wat zie je/i).fill("Test");
    await dlg.getByRole("button", { name: "Verstuur naar PO" }).click();
    await expect(dlg.getByText(/Bewaard.*toestemming/)).toBeVisible();
    await page.waitForTimeout(500);
    expect(await commentsLog(page, "sendToClaude")).toHaveLength(1);
    expect(await feedbackDocs(page)).toHaveLength(1);
    await expect(dlg.getByLabel(/wat zie je/i)).toHaveValue("Test"); // concept blijft staan
  });

  test("comments null: alleen bewaren; comments en db null: knop verborgen", async ({ page, open }) => {
    await open(withComments(null));
    await page.getByRole("button", { name: "Send to PO", exact: true }).click();
    const dlg = dialog(page);
    await dlg.getByLabel(/wat zie je/i).fill("Alleen opslaan");
    await dlg.getByRole("button", { name: "Verstuur naar PO" }).click();
    await expect(dlg.getByText(/Bewaard\. De PO pakt het op bij de volgende ronde\./)).toBeVisible();
    expect(await feedbackDocs(page)).toHaveLength(1);
  });

  test("zonder comments en db geen Send to PO-knoppen", async ({ page, open }) => {
    await open(withComments(null, { mcp: true, sample: true }));
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Send to PO/ })).toHaveCount(0);
  });
});

test.describe("Gebruikslog", () => {
  test("gebruik-doc per dag krijgt counts en events na de flush", async ({ page, open }) => {
    await open(buildMock());
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    await page.getByRole("button", { name: /alles verversen/i }).click();
    await page.getByRole("tab", { name: /teams/i }).click();
    const input = page.getByRole("textbox", { name: /nieuwe actie/i });
    await input.fill("Log-test actie");
    await input.press("Enter");
    await page.getByRole("textbox", { name: /vraag claude/i }).first().fill("Wat speelt er rond de release?");
    await page.getByRole("textbox", { name: /vraag claude/i }).first().press("Enter");
    await expect.poll(async () => (await mockLog(page)).db.filter((w) => w.path.startsWith("acties/")).length).toBeGreaterThan(0);
    expect(Object.keys(await dbDump(page, "gebruik/"))).toEqual([]); // nog niets geschreven
    await page.clock.fastForward("00:31");
    await expect.poll(async () => Object.keys(await dbDump(page, "gebruik/")).length).toBe(1);
    const [[path, doc]] = Object.entries(await dbDump(page, "gebruik/"));
    expect(path).toMatch(/^gebruik\/\d{4}-\d{2}-\d{2}$/);
    for (const e of ["open_pagina", "ververs_alles", "tab_teams", "actie_toegevoegd", "claude_vraag"]) {
      expect(doc.counts[e], `count ${e}`).toBeGreaterThanOrEqual(1);
    }
    expect(doc.events.find((e) => e.e === "claude_vraag").d).toBe("Wat speelt er rond de release?");
    expect(doc.events.length).toBeLessThanOrEqual(300);
    expect(JSON.stringify(doc)).not.toMatch(/@|example\.com/); // geen adressen of bronnamen
    expect(typeof doc.updatedAt).toBe("string");

    // Tweede flush telt op bij het bestaande doc.
    await page.keyboard.press("Escape"); // chatpaneel dicht
    await page.getByRole("button", { name: /alles verversen/i }).click();
    await page.clock.fastForward("00:31");
    await expect.poll(async () => Object.values(await dbDump(page, "gebruik/"))[0].counts.ververs_alles).toBe(2);
    expect(Object.values(await dbDump(page, "gebruik/"))[0].counts.open_pagina).toBe(1);
  });

  test("zonder db geen writes en geen fouten", async ({ page, open }) => {
    await open(buildMock({ capabilities: { mcp: true, sample: true } }));
    await page.getByRole("button", { name: /alles verversen/i }).click();
    await page.clock.fastForward("00:31");
    expect((await mockLog(page)).db).toEqual([]);
  });

  test("uitleg over het gebruikslog staat op de pagina", async ({ page, open }) => {
    await open(buildMock());
    await expect(page.getByText("Deze pagina houdt anoniem bij welke knoppen je gebruikt, voor verbeteringen. Alleen jij ziet dit.").first()).toBeVisible();
  });
});
