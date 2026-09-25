// Fase 3: "Send to PO" (comments-capability, docs/contract/comments.d.ts) en het gebruikslog (db `gebruik`).
const { test: base, expect } = require("@playwright/test");
const { buildMock } = require("./fixtures");
const { openPage, mockLog, dbDump, goTo, openClaude, inboxFilter } = require("./helpers");

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

test.describe("Send to PO is verwijderd", () => {
  test("geen Send to PO-knoppen en geen comments-calls", async ({ page, open }) => {
    await open(buildMock({ capabilities: { comments: true } }));
    await expect(page.getByRole("button", { name: /Send to PO|→ PO/ })).toHaveCount(0);
    expect((await page.evaluate(() => (window.__MOCK_LOG__.comments || []).length))).toBe(0);
  });
});

test.describe("Gebruikslog", () => {
  test("gebruik-doc per dag krijgt counts en events na de flush", async ({ page, open }) => {
    await open(buildMock());
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    await page.getByRole("button", { name: /alles verversen/i }).click();
    await goTo(page, "Inbox");
    await inboxFilter(page).getByRole("button", { name: /^Teams/ }).click(); // B2: filterknop in plaats van tab
    await goTo(page, "Acties");
    const input = page.getByRole("textbox", { name: /nieuwe actie/i });
    await input.fill("Log-test actie");
    await input.press("Enter");
    const box = await openClaude(page); // B1: geen Claude-balk meer; Vraag Claude opent het paneel
    await box.fill("Wat speelt er rond de release?");
    await box.press("Enter");
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
