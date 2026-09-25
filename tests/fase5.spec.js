// Ronde 5: gedockt Claude-paneel (niets bedekt), mail "Afhandelen", "Vraag Claude" opent direct het paneel met context.
const { test: base, expect } = require("@playwright/test");
const { buildMock, data } = require("./fixtures");
const { openPage, mockLog, mcpCalls, dbDump, itemWith, goTo, nav, detail, actionBar, openItem, openClaude } = require("./helpers");

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

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// =========================================================================================
// B1: het paneel is niet meer gedockt naast de pagina maar vervangt de detailkolom (plan 3a: nooit eroverheen).
test.describe("Claude-paneel in de detailkolom", () => {
  test("1400px: paneel vervangt het detail, bedekt nav en lijst niet, ✕ geeft het detail terug", async ({ page, open }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await open(buildMock());
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    const col = await detail(page).boundingBox();
    const listBefore = await page.locator("#lijst").boundingBox();

    await openClaude(page);
    const panel = page.locator("#chat");
    await expect(panel).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Vraag Claude" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /vastzetten|losmaken/i })).toHaveCount(0);
    await expect(page.locator("#detailView")).toBeHidden(); // vervangen, niet overlapt
    const p = await panel.boundingBox();
    expect(p.width).toBeGreaterThanOrEqual(420);
    expect(p.x).toBeGreaterThanOrEqual(col.x - 1);
    expect(p.x + p.width).toBeLessThanOrEqual(col.x + col.width + 1);
    expect(p.y + p.height).toBeLessThanOrEqual(900 + 1);

    for (const loc of [nav(page), page.locator("#lijst")]) {
      const b = await loc.boundingBox();
      expect(overlaps(b, p), "paneel overlapt nav of lijst").toBe(false);
    }
    const listNow = await page.locator("#lijst").boundingBox();
    expect(Math.round(listNow.x)).toBe(Math.round(listBefore.x));
    expect(Math.round(listNow.width)).toBe(Math.round(listBefore.width));
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1400);

    await page.getByRole("button", { name: "Sluit Claude-paneel" }).click();
    await expect(panel).toBeHidden();
    await expect(page.locator("#detailView")).toBeVisible();
    const listAfter = await page.locator("#lijst").boundingBox();
    expect(Math.round(listAfter.x)).toBe(Math.round(listBefore.x));
    expect(Math.round(listAfter.width)).toBe(Math.round(listBefore.width));
  });

  test("tablet: paneel in de detailkolom, geen scrim en geen dialoog", async ({ page, open }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await open(buildMock());
    await openClaude(page);
    await expect(page.locator("#chat")).toBeVisible();
    await expect(page.locator("#scrim")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Vraag Claude" })).toHaveCount(0);
    const p = await page.locator("#chat").boundingBox();
    for (const loc of [nav(page), page.locator("#lijst")]) expect(overlaps(await loc.boundingBox(), p)).toBe(false);
  });
});

// =========================================================================================
test.describe("Mail afhandelen", () => {
  test("verbergt direct, bewaart in inbox_verborgen, zet categorie en telt niet mee als ongelezen", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    const mailTab = page.getByRole("tab", { name: /mail/i });
    await expect(mailTab).toHaveText(/Mail\s*2/);
    // B1: selecteren, dan Afhandelen in de actiebalk; de melding staat in de feedbackbalk.
    await openItem(page, "Budget CI-runners Q4");
    await actionBar(page).getByRole("button", { name: /afhandelen/i }).click();
    await expect(page.getByText("Budget CI-runners Q4")).toHaveCount(0);
    await expect(mailTab).toHaveText(/Mail\s*1/);
    const bar = page.getByRole("status").filter({ hasText: "Mail afgehandeld" }).filter({ has: page.getByRole("button", { name: "Ongedaan maken" }) });
    await expect(bar).toBeVisible();
    await expect(bar).not.toContainText(/gelezen/i); // er is geen tool om op gelezen te zetten

    await expect.poll(async () => Object.values(await dbDump(page, "inbox_verborgen/"))).toHaveLength(1);
    const [[path, doc]] = Object.entries(await dbDump(page, "inbox_verborgen/"));
    expect(path).toMatch(/^inbox_verborgen\/[A-Za-z0-9_\-.~:@+]+$/);
    expect(doc).toMatchObject({ messageId: "mail-003", onderwerp: "Budget CI-runners Q4", van: "Ruben Smit" });
    expect(typeof doc.at).toBe("string");
    await expect.poll(async () => (await mcpCalls(page, "outlook_modify_labels")).length).toBe(1);
    const [call] = await mcpCalls(page, "outlook_modify_labels");
    expect(call.server).toBe("Microsoft 365");
    expect(call.input).toEqual({ messageId: "mail-003", addCategories: ["Afgehandeld"] });

    await page.clock.fastForward("00:31");
    await expect.poll(async () => Object.values(await dbDump(page, "gebruik/"))[0]?.counts?.mail_afgehandeld).toBe(1);
  });

  test("Ongedaan maken verwijdert het db-doc en toont de mail weer", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    await actionBar(page).getByRole("button", { name: /afhandelen/i }).click();
    await expect.poll(async () => Object.keys(await dbDump(page, "inbox_verborgen/")).length).toBe(1);
    await page.getByRole("button", { name: "Ongedaan maken" }).click();
    await expect(page.getByText("Budget CI-runners Q4").first()).toBeVisible();
    await expect.poll(async () => Object.keys(await dbDump(page, "inbox_verborgen/")).length).toBe(0);
    await expect(page.getByRole("tab", { name: /mail/i })).toHaveText(/Mail\s*2/);
  });

  test("categorie-fout: mail blijft verborgen met een kleine melding", async ({ page, open }) => {
    await open(buildMock({ tools: { "Microsoft 365": { outlook_modify_labels: { error: { code: "tool_error", message: "Category failed" } } } } }));
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    await actionBar(page).getByRole("button", { name: /afhandelen/i }).click();
    await expect(page.getByText("Verborgen, maar categorie in Outlook zetten lukte niet")).toBeVisible();
    await expect(page.getByText("Budget CI-runners Q4")).toHaveCount(0);
    expect(Object.keys(await dbDump(page, "inbox_verborgen/"))).toHaveLength(1);
  });

  test("eerder afgehandelde mails blijven weg na herladen", async ({ page, open }) => {
    const acties = JSON.parse(JSON.stringify(data.acties));
    delete acties._comment;
    await open(buildMock({ db: { docs: { ...acties, "inbox_verborgen/m-mail-003": { messageId: "mail-003", onderwerp: "Budget CI-runners Q4", van: "Ruben Smit", at: "2026-09-25T08:00:00.000Z" } } } }));
    await goTo(page, "Inbox");
    await expect(page.getByText("Planning release 26.4").first()).toBeVisible();
    await expect(page.getByText("Budget CI-runners Q4")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /mail/i })).toHaveText(/Mail\s*1/);
  });
});

// =========================================================================================
test.describe("Vraag Claude opent direct het paneel", () => {
  test("Jira-rij: paneel met contextkaart en focus in de chat-invoer, geen inline paneel", async ({ page, open }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await open(buildMock());
    await goTo(page, "Werk");
    const rij = await openItem(page, "Pipeline faalt op integratietests na upgrade");
    await actionBar(page).getByRole("button", { name: "Vraag Claude" }).click();
    await expect(page.getByRole("textbox", { name: "Bericht aan Claude" })).toBeFocused();
    const ctx = page.getByRole("group", { name: "Context voor je vraag" });
    await expect(ctx).toContainText("Over: PCORE-101 Pipeline faalt op integratietests na upgrade");
    await expect(rij.getByRole("textbox")).toHaveCount(0);
    // Paneel bedekt de rij niet (gedockt).
    const p = await page.locator("#chat").boundingBox();
    const r = await rij.boundingBox();
    expect(overlaps(p, r)).toBe(false);
    await page.getByRole("textbox", { name: "Bericht aan Claude" }).fill("Wat moet ik hiermee?");
    await page.getByRole("textbox", { name: "Bericht aan Claude" }).press("Enter");
    await expect.poll(async () => JSON.stringify((await mockLog(page)).sample.at(-1)?.input || "")).toContain("issueKey: PCORE-101");
  });
});
