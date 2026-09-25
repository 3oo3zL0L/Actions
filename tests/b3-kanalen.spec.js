// B3: Teams-kanalen. Kanalen komen uit recente chat_message_search-resultaten (teamId/channelId uit de uri, channelId
// URL-encoded); teams_list_teams mag niet voor Thomas. Thomas zet een kanaal op Volgen (prefs followedChannels); alleen
// gevolgde kanalen worden elke 3 minuten ververst met teams_list_channel_messages en hun nieuwe berichten staan in de Inbox
// met de kanaalnaam. Antwoorden op een kanaalbericht: teams_reply_channel_message, met dezelfde terugval bij Missing scope.
const { test: base, expect } = require("@playwright/test");
const { inboxMock, TEAM, CH_REL, CH_ARCH } = require("./fixtures/inbox");
const { openPage, mockLog, mcpCalls, dbDump, itemWith, goTo, detail, actionBar, feedbackBar, openItem } = require("./helpers");

const test = base.extend({
  open: async ({ page }, use) => {
    let problems = null;
    await use(async (mock, opts) => {
      await page.addInitScript(() => {
        window.__opened = [];
        window.open = (u) => { window.__opened.push(String(u)); return null; };
        window.__copied = [];
        try { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } } }); } catch (e) { /* */ }
      });
      problems = await openPage(page, mock, opts);
      return problems;
    });
    if (!problems || page.isClosed()) return;
    const log = await page.evaluate(() => window.__MOCK_LOG__).catch(() => null);
    if (log) {
      expect(log.violations, "contractschendingen").toEqual([]);
      expect(log.mcp.filter((c) => c.tool === "teams_list_teams"), "teams_list_teams mag niet voor Thomas").toEqual([]);
    }
    expect(problems.pageErrors, "uncaught exceptions").toEqual([]);
    expect(problems.consoleErrors, "console-errors").toEqual([]);
  },
});

const lijst = (page) => page.locator("#inbox-list");
const kanaal = (page, name) => lijst(page).getByRole("button", { name: new RegExp("^" + name + "\\s?, (gevolgd )?kanaal$") });
const channelCalls = (page) => mcpCalls(page, "teams_list_channel_messages");
const prefsDoc = async (page) => (await dbDump(page, "prefs/thomas"))["prefs/thomas"] || {};
const composerText = (page) => detail(page).getByRole("textbox", { name: "Tekst" });
async function kanalen(page) {
  await goTo(page, "Inbox");
  const toggle = lijst(page).getByRole("button", { name: "Teams-kanalen (2)" });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}
const FOLLOW_ARCH = { "prefs/thomas": { followedChannels: [{ teamId: TEAM, channelId: CH_ARCH, name: "Architectuur" }] } };

test.describe("Kanalen vinden en volgen", () => {
  test("kanalen uit recente berichten met hun naam; niets wordt ververst zolang Thomas niets volgt", async ({ page, open }) => {
    await open(inboxMock());
    await kanalen(page);
    await expect(kanaal(page, "Releases")).toBeVisible();
    await expect(kanaal(page, "Architectuur")).toBeVisible();
    await expect(itemWith(page, "Niet gevolgd").first()).toBeVisible();
    expect((await mcpCalls(page, "teams_list_channels")).map((c) => c.input)).toEqual([{ teamId: TEAM }]);
    // Kanaalberichten uit de zoekresultaten staan al in de Inbox, met de kanaalnaam als context.
    await expect(itemWith(page, "Release 26.4 staat klaar")).toContainText("Releases: Release 26.4 staat klaar voor de acceptatietest.");
    await page.clock.runFor(400000);
    expect(await channelCalls(page)).toEqual([]);
  });

  test("Volgen (s): bewaard in prefs, haalt teams_list_channel_messages met de juiste ids, nieuwe berichten in de Inbox met kanaalnaam", async ({ page, open }) => {
    await open(inboxMock());
    await kanalen(page);
    await kanaal(page, "Architectuur").click();
    await expect(detail(page).getByRole("heading", { name: "Architectuur" })).toBeVisible();
    await expect(detail(page)).toContainText("Volg dit kanaal om nieuwe berichten in je Inbox te krijgen.");
    const labels = await actionBar(page).locator("button, a").evaluateAll((els) => els.map((e) => e.textContent.replace(/\s*↗.*$/, "").trim()));
    expect(labels).toEqual(["Volgen", "Vraag Claude", "Open in Teams"]);
    await expect(actionBar(page).getByRole("button", { name: "Volgen" })).toHaveAttribute("title", /\(s\)$/);
    await page.locator("body").press("s");
    await expect(feedbackBar(page)).toContainText("Je volgt Architectuur. Nieuwe berichten komen in je Inbox");
    await expect.poll(async () => (await prefsDoc(page)).followedChannels).toEqual([{ teamId: TEAM, channelId: CH_ARCH, name: "Architectuur" }]);
    await expect.poll(async () => (await channelCalls(page)).length).toBe(1);
    expect((await channelCalls(page))[0].input).toEqual({ teamId: TEAM, channelId: CH_ARCH }); // channelId gedecodeerd ("19:...")
    const nieuw = itemWith(page, "Nieuwe ADR voor de Object Store staat klaar.");
    await expect(nieuw).toContainText("Noor Mulder");
    await expect(nieuw).toContainText("Architectuur: Nieuwe ADR voor de Object Store staat klaar.");
    await expect(lijst(page)).not.toContainText("Heel oud bericht."); // alleen sinds gisteren
    await expect(kanaal(page, "Architectuur")).toBeVisible();
    await expect(itemWith(page, "Gevolgd · ververst elke 3 minuten")).toBeVisible();
    await expect(actionBar(page).getByRole("button", { name: "Niet meer volgen" })).toBeVisible();
    // Alleen het gevolgde kanaal wordt ververst, elke 3 minuten.
    await page.clock.runFor(181000);
    await expect.poll(async () => (await channelCalls(page)).length).toBe(2);
    expect((await channelCalls(page)).every((c) => c.input.channelId === CH_ARCH)).toBe(true);
  });

  test("volgen blijft na herladen; Niet meer volgen stopt het verversen en haalt de kanaalberichten weg", async ({ page, open }) => {
    await open(inboxMock({ db: { docs: FOLLOW_ARCH } }));
    await goTo(page, "Inbox");
    await expect(itemWith(page, "Nieuwe ADR voor de Object Store staat klaar.")).toBeVisible();
    await kanalen(page);
    await kanaal(page, "Architectuur").click();
    await actionBar(page).getByRole("button", { name: "Niet meer volgen" }).click();
    await expect(feedbackBar(page)).toContainText("Je volgt Architectuur niet meer");
    await expect(lijst(page).getByText("Nieuwe ADR voor de Object Store staat klaar.")).toHaveCount(0);
    await expect.poll(async () => (await prefsDoc(page)).followedChannels).toEqual([]);
    // Ongedaan maken (z) volgt weer.
    await page.locator("body").press("z");
    await expect(itemWith(page, "Nieuwe ADR voor de Object Store staat klaar.")).toBeVisible();
    await expect.poll(async () => (await prefsDoc(page)).followedChannels).toHaveLength(1);
    // Weer ontvolgen: daarna geen enkele verversing meer.
    await kanaal(page, "Architectuur").click();
    await actionBar(page).getByRole("button", { name: "Niet meer volgen" }).click();
    await expect(lijst(page).getByText("Nieuwe ADR voor de Object Store staat klaar.")).toHaveCount(0);
    const n = (await channelCalls(page)).length;
    await page.clock.runFor(400000);
    expect((await channelCalls(page)).length).toBe(n);
  });

  test("volgen kan ook vanuit een kanaalbericht (Meer, toets s)", async ({ page, open }) => {
    await open(inboxMock());
    await goTo(page, "Inbox");
    await openItem(page, "Release 26.4 staat klaar", "Daan de Vries in Releases");
    await actionBar(page).getByRole("button", { name: "Meer" }).click();
    await expect(detail(page).getByRole("group", { name: "Meer acties" }).getByRole("button", { name: "Volg kanaal" })).toHaveAttribute("title", /\(s\)$/);
    await page.keyboard.press("Escape");
    await page.locator("body").press("s");
    await expect(feedbackBar(page)).toContainText("Je volgt Releases");
    await expect.poll(async () => (await channelCalls(page)).map((c) => c.input)).toEqual([{ teamId: TEAM, channelId: CH_REL }]);
  });

  test("ophalen van een gevolgd kanaal mislukt: rij zegt het, detail toont de fout met Opnieuw proberen", async ({ page, open }) => {
    await open(inboxMock({ db: { docs: FOLLOW_ARCH }, tools: { "Microsoft 365": {
      teams_list_channel_messages: { sequence: [{ error: { code: "tool_error", message: "Channel not found" } }, { items: [], pagination: null }] } } } }));
    await kanalen(page);
    await expect(itemWith(page, "Gevolgd · ophalen lukte niet")).toBeVisible();
    await kanaal(page, "Architectuur").click();
    await expect(detail(page).getByRole("alert")).toBeVisible();
    await detail(page).getByRole("button", { name: "Opnieuw proberen" }).click();
    await expect.poll(async () => (await channelCalls(page)).length).toBe(2);
    await expect(itemWith(page, "Gevolgd · ververst elke 3 minuten")).toBeVisible();
  });
});

test.describe("Antwoorden op een kanaalbericht", () => {
  test("met Teams-recht: teams_reply_channel_message met teamId, channelId (gedecodeerd) en messageId", async ({ page, open }) => {
    await open(inboxMock({ teamsSendBlocked: false }));
    await goTo(page, "Inbox");
    await openItem(page, "Release 26.4 staat klaar", "Daan de Vries in Releases");
    await expect(detail(page).getByRole("definition").filter({ hasText: "Releases" })).toBeVisible();
    await page.locator("body").press("r");
    await expect(detail(page).getByRole("heading", { name: "Antwoord in Releases" })).toBeVisible();
    await composerText(page).fill("Dank, ik plan de acceptatietest morgen.");
    await composerText(page).press("Control+Enter");
    await expect.poll(async () => (await mcpCalls(page, "teams_reply_channel_message")).length).toBe(1);
    expect((await mcpCalls(page, "teams_reply_channel_message"))[0].input).toEqual({ teamId: TEAM, channelId: CH_REL, messageId: "ib-c1",
      body: "Dank, ik plan de acceptatietest morgen." });
    await expect(feedbackBar(page)).toContainText("✓ Teams-bericht verzonden in Releases");
    expect(await mcpCalls(page, "teams_send_chat_message")).toEqual([]);
  });

  test("op een bericht uit een gevolgd kanaal: antwoord gaat naar dat kanaal en bericht", async ({ page, open }) => {
    await open(inboxMock({ teamsSendBlocked: false, db: { docs: FOLLOW_ARCH } }));
    await goTo(page, "Inbox");
    await openItem(page, "Nieuwe ADR voor de Object Store staat klaar.", "Noor Mulder in Architectuur");
    await page.locator("body").press("r");
    await composerText(page).fill("Ik lees hem vandaag.");
    await composerText(page).press("Control+Enter");
    await expect.poll(async () => (await mcpCalls(page, "teams_reply_channel_message")).length).toBe(1);
    expect((await mcpCalls(page, "teams_reply_channel_message"))[0].input).toEqual({ teamId: TEAM, channelId: CH_ARCH, messageId: "ib-k1", body: "Ik lees hem vandaag." });
  });

  test("zonder Teams-recht (standaard): één poging, dan klembord en het bericht openen in Teams; vlag gezet", async ({ page, open }) => {
    await open(inboxMock());
    await goTo(page, "Inbox");
    await openItem(page, "Release 26.4 staat klaar", "Daan de Vries in Releases");
    await actionBar(page).getByRole("button", { name: "Antwoord" }).click();
    await composerText(page).fill("Dank, ik plan de acceptatietest morgen.");
    await detail(page).getByRole("button", { name: "Verstuur" }).click();
    await expect(feedbackBar(page)).toContainText("Tekst gekopieerd. Plak hem in Teams");
    await expect(feedbackBar(page)).toContainText("IT moet toestemming geven");
    const [attempt] = await mcpCalls(page, "teams_reply_channel_message");
    expect(attempt.input).toMatchObject({ teamId: TEAM, channelId: CH_REL, messageId: "ib-c1" });
    expect(attempt.outcome).toBe("tool_error");
    expect(await page.evaluate(() => window.__copied)).toEqual(["Dank, ik plan de acceptatietest morgen."]);
    expect(await page.evaluate(() => window.__opened)).toEqual(["https://teams.example.com/l/message/releases/ib-c1"]);
    await expect.poll(async () => Boolean((await prefsDoc(page)).teamsSendBlocked)).toBe(true);
    await expect(actionBar(page).getByRole("button", { name: "Kopieer en open in Teams" })).toBeVisible();
  });

  test("Vraag Claude over een kanaalbericht geeft Claude de kanaal-ids mee", async ({ page, open }) => {
    await open(inboxMock({ sample: { rules: [{ match: "Vraag van Thomas over dit Teams-bericht", text: "Daan meldt dat de release klaarstaat." }] } }));
    await goTo(page, "Inbox");
    await openItem(page, "Release 26.4 staat klaar", "Daan de Vries in Releases");
    await page.locator("body").press("c");
    const box = page.getByRole("textbox", { name: "Bericht aan Claude" });
    await box.fill("Wat moet ik hiermee?");
    await box.press("Enter");
    await expect(page.getByText("Daan meldt dat de release klaarstaat.").first()).toBeVisible({ timeout: 8000 });
    const prompt = JSON.stringify((await mockLog(page)).sample.at(-1).input);
    expect(prompt).toContain("Kanaal: Releases");
    expect(prompt).toContain("teamId: " + TEAM);
    expect(prompt).toContain("channelId: " + CH_REL);
    expect(prompt).toContain("messageId: ib-c1");
  });
});
