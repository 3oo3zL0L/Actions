// B1: de schil. Drie zones (ingangen · lijst · detail), selectiemodel, actiebalk, feedbackbalk met z = ongedaan,
// voorkeuren in db-doc prefs/thomas, mobiele tabbalk en het Claude-paneel in de detailkolom.
// Test gedrag via rollen en teksten (docs/PLAN-FASE2.md, definition of done).
const { test: base, expect } = require("@playwright/test");
const { buildMock } = require("./fixtures");
const { openPage, mockLog, dbDump, itemWith, ENTRY_NAMES, nav, entryButton, goTo, detail, actionBar, feedbackBar, openItem, openClaude, inboxFilter } = require("./helpers");

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
    expect(problems.consoleErrors, "console-errors").toEqual([]);
  },
});

const overlaps = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
// De geselecteerde rij: haar selectieknop heeft aria-current="true".
const selectedRow = (page) => page.locator('#lijst button[aria-current="true"]');

// =========================================================================================
test.describe("Ingangen en tellers", () => {
  test("vijf ingangen met tellers; wisselen met klik en met 1-5", async ({ page, open }) => {
    await open(buildMock());
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    for (const name of ENTRY_NAMES) await expect(entryButton(page, name)).toBeVisible();
    await expect(entryButton(page, "Vandaag")).toHaveAttribute("aria-current", "page");
    // Tellers uit de fixtures: Vandaag = 4 afspraken nu/straks + 1 actie vandaag; Inbox = 2 ongelezen + 3 Teams;
    // Acties = 1 open; Werk = 3 issues; Agenda = 4 afspraken die nog komen of lopen.
    await expect(entryButton(page, "Vandaag")).toHaveAccessibleName("Vandaag 5");
    await expect(entryButton(page, "Inbox")).toHaveAccessibleName("Inbox 5");
    await expect(entryButton(page, "Acties")).toHaveAccessibleName("Acties 1");
    await expect(entryButton(page, "Werk")).toHaveAccessibleName("Werk 3");
    await expect(entryButton(page, "Agenda")).toHaveAccessibleName("Agenda 4");

    await entryButton(page, "Werk").click();
    await expect(page.getByRole("heading", { name: /^Werk/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Vandaag", exact: true })).toBeHidden();

    const keys = { "1": "Vandaag", "2": "Inbox", "3": "Acties", "4": "Werk", "5": "Agenda" };
    for (const [key, name] of Object.entries(keys)) {
      await page.locator("body").press(key);
      await expect(entryButton(page, name)).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { name: new RegExp("^" + name) }).first()).toBeVisible();
    }
    // Tooltips noemen de toets.
    await expect(entryButton(page, "Inbox")).toHaveAttribute("title", "Inbox (2)");
    // Cijfers werken niet tijdens typen.
    await goTo(page, "Acties");
    const add = page.getByRole("textbox", { name: "Nieuwe actie" });
    await add.fill("");
    await add.pressSequentially("2 offertes");
    await expect(add).toHaveValue("2 offertes");
    await expect(entryButton(page, "Acties")).toHaveAttribute("aria-current", "page");
  });

  test("tellers volgen de data: afhandelen verlaagt Inbox", async ({ page, open }) => {
    await open(buildMock());
    await expect(entryButton(page, "Inbox")).toHaveAccessibleName("Inbox 5");
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    await actionBar(page).getByRole("button", { name: "Afhandelen" }).click();
    await expect(entryButton(page, "Inbox")).toHaveAccessibleName("Inbox 4");
  });
});

// =========================================================================================
test.describe("Selectie en detail", () => {
  test("klik selecteert zonder dat de lijst verspringt; detail rechts met actiebalk in vaste volgorde", async ({ page, open }) => {
    await page.setViewportSize({ width: 1280, height: 520 });
    await open(buildMock());
    await goTo(page, "Inbox");
    await expect(page.getByText("Notulen architectuurboard").first()).toBeVisible();
    const list = page.locator("#lijst");
    // B2: mail en Teams in één lijst; de lijst is langer, dus een rij die na het scrollen in beeld staat.
    await list.evaluate((el) => { el.scrollTop = 120; });
    const before = await list.evaluate((el) => el.scrollTop);
    expect(before, "lijst scrolt niet in deze test").toBeGreaterThan(0);
    const row = itemWith(page, "Budget CI-runners Q4");
    await expect(row).toBeInViewport({ ratio: 1 });
    const yBefore = (await row.boundingBox()).y;
    await row.click({ position: { x: 60, y: 14 } });
    await expect(detail(page).getByRole("heading", { name: "Budget CI-runners Q4" })).toBeVisible();
    expect(await list.evaluate((el) => el.scrollTop), "lijst sprong").toBe(before);
    expect(Math.round((await row.boundingBox()).y)).toBe(Math.round(yBefore));
    await expect(selectedRow(page)).toHaveCount(1);
    await expect(row.locator('button[aria-current="true"]')).toBeVisible();

    // Actiebalk: primaire actie · Afhandelen · Maak actie · Vraag Claude · Open in Outlook ↗ · één extra (B2: Meer), geen grijze knoppen.
    const bar = actionBar(page);
    const labels = await bar.locator("button, a").evaluateAll((els) => els.map((e) => e.textContent.replace(/\s*↗.*$/, "").trim()));
    expect(labels).toEqual(["Beantwoord", "Afhandelen", "Maak actie", "Vraag Claude", "Open in Outlook", "Meer"]);
    expect(await bar.locator("button:disabled").count(), "grijze knop in de actiebalk").toBe(0);
    await expect(bar.getByRole("button", { name: "Afhandelen" })).toHaveAttribute("title", /\(e\)$/);
    await expect(bar.getByRole("button", { name: "Vraag Claude" })).toHaveAttribute("title", /\(c\)$/);
    await expect(bar.getByRole("link", { name: /Open in Outlook/ })).toHaveAttribute("target", "_blank");
  });

  test("één selectie per ingang, onthouden bij terugkeren", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    await openItem(page, "Vraag over OIDC-scope voor partnerportaal");
    await goTo(page, "Werk");
    await openItem(page, "Build-cache delen tussen runners");
    await goTo(page, "Inbox");
    await expect(detail(page).getByRole("heading", { name: "Vraag over OIDC-scope voor partnerportaal" })).toBeVisible();
    await expect(selectedRow(page)).toHaveCount(1);
    await goTo(page, "Werk");
    await expect(detail(page)).toContainText("Build-cache delen tussen runners");
  });

  test("j/k en pijltjes lopen door de lijst, niet tijdens typen", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    await page.keyboard.press("j");
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Vraag over OIDC-scope voor partnerportaal");
    await page.keyboard.press("ArrowDown"); // B2: één lijst, nieuwste eerst; daarna komt het Teams-bericht van Ruben
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Ruben Smit");
    await expect(detail(page)).toContainText("Nightly build was gisteren weer groen");
    await page.keyboard.press("k");
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Vraag over OIDC-scope voor partnerportaal");
    await page.keyboard.press("ArrowUp");
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Budget CI-runners Q4");
    // In een invoerveld: j is gewoon een letter.
    await actionBar(page).getByRole("button", { name: "Beantwoord" }).click();
    const ta = detail(page).getByRole("textbox", { name: "Tekst" });
    await ta.fill("");
    await ta.pressSequentially("jk");
    await expect(ta).toHaveValue(/jk$/);
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Budget CI-runners Q4");
  });

  test("Vraag Claude-toets c opent het paneel met het item als context; Esc geeft het detail terug", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Werk");
    await openItem(page, "Pipeline faalt op integratietests na upgrade");
    await page.keyboard.press("c");
    await expect(page.getByRole("textbox", { name: "Bericht aan Claude" })).toBeFocused();
    await expect(page.getByRole("group", { name: "Context voor je vraag" })).toContainText("Over: PCORE-101");
    await expect(page.locator("#detailView")).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.locator("#chat")).toBeHidden();
    await expect(detail(page)).toContainText("Pipeline faalt op integratietests na upgrade");
  });

  test("zonder Claude: geen Vraag Claude-knoppen (weglaten, niet grijs)", async ({ page, open }) => {
    await open(buildMock({ capabilities: { mcp: true, db: true } }));
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    await expect(actionBar(page).getByRole("button", { name: "Afhandelen" })).toBeVisible();
    await expect(actionBar(page).getByRole("button", { name: "Vraag Claude" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Vraag Claude" })).toHaveCount(0);
  });
});

// =========================================================================================
test.describe("Feedbackbalk", () => {
  test("afhandelen met toets e toont '✓ <onderwerp> afgehandeld · Ongedaan maken'; z maakt ongedaan", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    await page.keyboard.press("e");
    const bar = feedbackBar(page);
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("✓ Budget CI-runners Q4 afgehandeld"); // PO: de balk noemt het item
    await expect(bar.getByRole("button", { name: "Ongedaan maken" })).toHaveAttribute("title", "Ongedaan maken (z)");
    await expect(page.locator("#lijst").getByText("Budget CI-runners Q4")).toHaveCount(0);
    // Het detail gaat door naar de volgende mail.
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Vraag over OIDC-scope voor partnerportaal");
    await expect.poll(async () => Object.keys(await dbDump(page, "inbox_verborgen/")).length).toBe(1);

    await page.keyboard.press("z");
    await expect(itemWith(page, "Budget CI-runners Q4")).toBeVisible();
    await expect.poll(async () => Object.keys(await dbDump(page, "inbox_verborgen/")).length).toBe(0);
    await expect(bar).toContainText("Budget CI-runners Q4 terug in de lijst");
    await expect(bar.getByRole("button", { name: "Ongedaan maken" })).toHaveCount(0);
  });

  test("afvinken via de actiebalk en z zet de actie terug", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Acties");
    await openItem(page, "Akkoord geven op releaseplanning 26.4");
    await actionBar(page).getByRole("button", { name: "Vink af" }).click();
    await expect.poll(async () => (await dbDump(page, "acties/seed-001"))["acties/seed-001"].status).toBe("done");
    await expect(feedbackBar(page)).toContainText("Actie afgevinkt");
    await page.keyboard.press("z");
    await expect.poll(async () => (await dbDump(page, "acties/seed-001"))["acties/seed-001"].status).toBe("open");
  });

  test("API: uitstel met 'Annuleer (Ns)' stopt echt; zonder annuleren loopt de actie; 'Bekijk ↗' voor wat niet terug kan", async ({ page, open }) => {
    await open(buildMock());
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    const bar = feedbackBar(page);
    // 1. Annuleren binnen de tijd: de actie loopt niet.
    await page.evaluate(() => { window.__done = 0; window.__cancel = 0;
      feedback({ text: "Verzonden aan Sophie", countdown: 8, undo: () => { window.__cancel++; }, onCountdownDone: () => { window.__done++; } }); });
    await expect(bar).toContainText("✓ Verzonden aan Sophie");
    await expect(bar.getByRole("button", { name: "Annuleer (8s)" })).toBeVisible();
    await page.clock.runFor(2000);
    await expect(bar.getByRole("button", { name: "Annuleer (6s)" })).toBeVisible();
    await bar.getByRole("button", { name: /Annuleer/ }).click();
    await page.clock.runFor(10000);
    expect(await page.evaluate(() => [window.__cancel, window.__done])).toEqual([1, 0]);
    // 2. Niet annuleren: na de tijd loopt de actie precies één keer.
    await page.evaluate(() => feedback({ text: "Verzonden aan Ruben", countdown: 3, undo: () => { window.__cancel++; }, onCountdownDone: () => { window.__done++; } }));
    await page.clock.runFor(4000);
    expect(await page.evaluate(() => [window.__cancel, window.__done])).toEqual([1, 1]);
    await expect(bar.getByRole("button", { name: /Annuleer/ })).toHaveCount(0);
    // 3. Niet terug te draaien: Bekijk ↗ in plaats van nep-ongedaan.
    await page.evaluate(() => feedback({ text: "Teams-bericht verzonden", link: "https://teams.example.com/l/message/1" }));
    await expect(bar).toContainText("✓ Teams-bericht verzonden");
    const link = bar.getByRole("link", { name: /Bekijk/ });
    await expect(link).toHaveAttribute("href", "https://teams.example.com/l/message/1");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(bar.getByRole("button", { name: /Ongedaan|Annuleer/ })).toHaveCount(0);
  });
});

// =========================================================================================
test.describe("Voorkeuren", () => {
  test("prefs/thomas: laatste ingang, thema en getPref/setPref overleven herladen (uit db)", async ({ page, open }) => {
    await open(buildMock());
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    expect(await page.evaluate(() => getPref("vip"))).toEqual([]);
    expect(await page.evaluate(() => getPref("followedChannels"))).toEqual([]);
    await goTo(page, "Werk");
    await page.getByRole("button", { name: /^Thema:/ }).click(); // Dark Forest -> Licht
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.evaluate(() => setPref("vip", ["Ruben Smit"]));
    await expect.poll(async () => (await dbDump(page, "prefs/thomas"))["prefs/thomas"] || {})
      .toMatchObject({ lastEntry: "werk", theme: "light", vip: ["Ruben Smit"] });
    // Lokale opslag weg: alles moet uit de db komen (zoals op een ander apparaat).
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(entryButton(page, "Werk")).toHaveAttribute("aria-current", "page");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => getPref("vip"))).toEqual(["Ruben Smit"]);
    await expect(page.getByRole("heading", { name: /^Werk/ })).toBeVisible();
  });

  test("Inbox-filter wordt als voorkeur bewaard", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    await inboxFilter(page).getByRole("button", { name: /^Teams/ }).click(); // B2: filterknop in plaats van tab
    await expect.poll(async () => ((await dbDump(page, "prefs/thomas"))["prefs/thomas"] || {}).inboxFilter).toBe("teams");
  });
});

// =========================================================================================
test.describe("Mobiel 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("tabbalk onderaan, lijst en detail als twee schermen met Terug, actiebalk onder de inhoud, geen horizontale scroll", async ({ page, open }) => {
    await open(buildMock());
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    const noHScroll = async () => {
      const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, vw: window.innerWidth }));
      expect(m.doc, `documentbreedte ${m.doc} > ${m.vw}`).toBeLessThanOrEqual(m.vw);
      expect(m.body).toBeLessThanOrEqual(m.vw);
    };
    await noHScroll();
    const tabbar = await nav(page).boundingBox();
    expect(Math.round(tabbar.y + tabbar.height)).toBe(812);
    expect(Math.round(tabbar.width)).toBe(375);
    for (const name of ENTRY_NAMES) {
      const b = await entryButton(page, name).boundingBox();
      expect(b.y).toBeGreaterThanOrEqual(tabbar.y - 1);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    // Lijst -> detail
    await goTo(page, "Inbox");
    await expect(detail(page)).toBeHidden(); // nog niets geopend
    await itemWith(page, "Budget CI-runners Q4").click({ position: { x: 60, y: 14 } });
    await expect(detail(page)).toBeVisible();
    await expect(page.locator("#lijst")).toBeHidden();
    const back = detail(page).getByRole("button", { name: "Terug" });
    await expect(back).toBeVisible();
    const title = await detail(page).getByRole("heading", { name: "Budget CI-runners Q4" }).boundingBox();
    const bar = await actionBar(page).boundingBox();
    expect(bar.y, "actiebalk staat onder de inhoud").toBeGreaterThan(title.y + title.height);
    await noHScroll();
    // Terug naar de lijst
    await back.click();
    await expect(page.locator("#lijst")).toBeVisible();
    await expect(itemWith(page, "Budget CI-runners Q4")).toBeVisible();
    // Esc gaat ook terug
    await itemWith(page, "Vraag over OIDC-scope voor partnerportaal").click({ position: { x: 60, y: 14 } });
    await expect(detail(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#lijst")).toBeVisible();
  });

  test("Claude-paneel is het detailscherm en bedekt de tabbalk niet", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    await itemWith(page, "Budget CI-runners Q4").click({ position: { x: 60, y: 14 } });
    await actionBar(page).getByRole("button", { name: "Vraag Claude" }).click();
    const panel = page.locator("#chat");
    await expect(panel).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Bericht aan Claude" })).toBeInViewport();
    const p = await panel.boundingBox(), t = await nav(page).boundingBox();
    expect(overlaps(p, t), "paneel bedekt de tabbalk").toBe(false);
    expect(p.width).toBeLessThanOrEqual(375);
    await page.getByRole("button", { name: "Terug naar de lijst" }).click();
    await expect(panel).toBeHidden();
    await expect(page.locator("#lijst")).toBeVisible();
  });
});

// =========================================================================================
test.describe("Claude-paneel bedekt niets", () => {
  for (const vp of [{ width: 1280, height: 860 }, { width: 900, height: 900 }]) {
    test(`${vp.width}px: paneel binnen de detailkolom, geen overlap met nav, lijst en feedbackbalk`, async ({ page, open }) => {
      await page.setViewportSize(vp);
      await open(buildMock());
      await goTo(page, "Inbox");
      await openItem(page, "Budget CI-runners Q4");
      await actionBar(page).getByRole("button", { name: "Afhandelen" }).click(); // feedbackbalk zichtbaar
      await expect(feedbackBar(page)).toBeVisible();
      const col = await detail(page).boundingBox();
      await openClaude(page);
      const p = await page.locator("#chat").boundingBox();
      expect(p.x).toBeGreaterThanOrEqual(col.x - 1);
      expect(p.x + p.width).toBeLessThanOrEqual(col.x + col.width + 1);
      for (const [name, loc] of [["nav", nav(page)], ["lijst", page.locator("#lijst")], ["feedbackbalk", feedbackBar(page)]]) {
        expect(overlaps(await loc.boundingBox(), p), `paneel overlapt ${name}`).toBe(false);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
    });
  }
});
