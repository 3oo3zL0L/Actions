// B2: de Inbox. Mail en Teams in één lijst (nieuwste eerst, VIP bovenaan, meldingen ingeklapt), maildetail met de
// volledige inhoud, beantwoorden/doorsturen inline met 10 s verzenduitstel, afhandelen met ongedaan maken,
// Teams-antwoord met terugval (Missing scope -> kopieer en open in Teams), adresboek. Gedrag via rollen en teksten.
// Plan: docs/UX-PLAN.md (B2), bouwbrief: docs/PLAN-FASE2.md ("Teams antwoorden", "Adresboek", "Schrijfstijl").
const { test: base, expect } = require("@playwright/test");
const { inboxMock, LOTTE_CHAT, GROUP_CHAT } = require("./fixtures/inbox");
const { referenceNow } = require("./fixtures"); // "sinds" relatief aan de testklok, niet aan de echte datum
const { openPage, mockLog, mcpCalls, dbDump, itemWith, entryButton, goTo, detail, actionBar, feedbackBar, openItem, inboxFilter } = require("./helpers");

// In deze spec mag de app echt versturen (na Verstuur en de 10 s); wel: geen contractschendingen, geen fouten in de console.
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
    if (log) expect(log.violations, "contractschendingen").toEqual([]);
    expect(problems.pageErrors, "uncaught exceptions").toEqual([]);
    expect(problems.consoleErrors, "console-errors").toEqual([]);
  },
});

const lijst = (page) => page.locator("#inbox-list");
/** Selectieknop van een rij: naam "<wie>, <bron>[, ongelezen][, bovenaan]". */
const rowButton = (page, who, rest) => lijst(page).getByRole("button", { name: new RegExp("^" + who + ", " + rest + "$") });
const rowTexts = (page) => lijst(page).getByRole("listitem").filter({ visible: true }).allInnerTexts();
const prefsDoc = async (page) => (await dbDump(page, "prefs/thomas"))["prefs/thomas"] || {};
const SEND = /outlook_create_reply|outlook_send|outlook_forward|teams_send|teams_reply/;
const barLabels = (page) => actionBar(page).locator("[data-slot]").evaluateAll((els) => els.map((e) => e.childNodes[0].textContent.trim()));
const composerText = (page) => detail(page).getByRole("textbox", { name: "Tekst" });
/** De open invulkaart (antwoord, allen beantwoorden, doorsturen) in het detail. */
const composer = (page) => detail(page).getByRole("group", { name: /^(Antwoord|Allen beantwoorden|Doorsturen)/ });
async function inbox(page, mock) {
  await goTo(page, "Inbox");
  await expect(lijst(page).getByText("Voorstel roadmap Q1")).toBeVisible();
}
/** Index van de eerste zichtbare rij die `s` bevat. */
const indexOf = (texts, s) => texts.findIndex((t) => t.includes(s));

// =========================================================================================
test.describe("Eén lijst", () => {
  test("mail en Teams samen, nieuwste eerst, bronicoon, VIP bovenaan, meldingen ingeklapt, eigen berichten niet", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await expect(lijst(page).getByRole("heading", { name: "Bovenaan" })).toBeVisible();
    await expect(lijst(page).getByRole("heading", { name: "Overige berichten" })).toBeVisible();
    const texts = await rowTexts(page);
    // Sanne vergadert vandaag met Thomas: bovenaan, ook al is haar mail ouder. Daarna nieuwste eerst, mail en Teams door elkaar.
    const order = ["Voorstel roadmap Q1", "Kun je de demo om 14:00", "Offerte licenties buildserver", "benchmarkcijfers", "Release 26.4 staat klaar",
      "Architectuurschets OIDC", "Contractverlenging Object Store", "storage-ADR"];
    expect(order.map((s) => indexOf(texts, s))).toEqual(order.map((_, i) => i));
    // Bronicoon voor elke rij; de naam van de rij noemt de bron (en ongelezen/bovenaan voor schermlezers).
    expect(texts.slice(0, 8).every((t) => /^(✉|💬)/.test(t.trim()))).toBe(true);
    await expect(rowButton(page, "Sanne Dekker", "mail, ongelezen, bovenaan")).toBeVisible();
    await expect(rowButton(page, "Lotte Visser", "Teams")).toBeVisible();
    await expect(rowButton(page, "Femke Bos", "mail")).toBeVisible();
    // Joost zit alleen in een grote sessie (20 deelnemers): niet bovenaan.
    await expect(rowButton(page, "Joost Kramer", "mail, ongelezen")).toBeVisible();
    // Eigen Teams-bericht van Thomas staat er niet in.
    await expect(lijst(page).getByText("Ik kijk er vanmiddag naar.")).toHaveCount(0);
    // Meldingen ingeklapt onder "Meldingen (1)".
    const toggle = lijst(page).getByRole("button", { name: "Meldingen (1)" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("Je wekelijkse samenvatting")).toBeHidden();
    await toggle.click();
    await expect(page.getByText("Je wekelijkse samenvatting")).toBeVisible();
  });

  test("rijen: één regel wie (vet als ongelezen), één regel context, tijd rechts; geen knoppen of links in de rij", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    const joost = itemWith(page, "Offerte licenties buildserver");
    await expect(joost).toContainText("Joost Kramer");
    await expect(joost).toContainText("10 min geleden");
    // Zichtbaar: icoon, wie, tijd, context (de sr-tekst voor schermlezers begint met een komma).
    const lines = (await joost.innerText()).split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith(","));
    expect(lines, lines.join(" | ")).toEqual(["✉", "Joost Kramer", "10 min geleden", "Offerte licenties buildserver"]);
    const lotte = itemWith(page, "Kun je de demo om 14:00");
    await expect(lotte).toContainText("Lotte Visser");
    await expect(lotte).not.toContainText("Lotte Visser:"); // 1-op-1 chat: context is alleen het bericht
    await expect(itemWith(page, "benchmarkcijfers")).toContainText("Object Store kernteam: Heeft iemand de benchmarkcijfers");
    const weight = (who, rest) => rowButton(page, who, rest).evaluate((b) => Number(getComputedStyle(b).fontWeight));
    expect(await weight("Joost Kramer", "mail, ongelezen")).toBeGreaterThanOrEqual(700);
    expect(await weight("Femke Bos", "mail")).toBeLessThan(700);
    for (const row of await lijst(page).getByRole("listitem").filter({ visible: true }).all()) {
      await expect(row.getByRole("link")).toHaveCount(0);
      await expect(row.getByRole("button")).toHaveCount(1); // alleen de selectieknop
    }
  });

  test("teller: ongelezen mail plus open Teams-berichten; filterknoppen tonen hun deel", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await expect(entryButton(page, "Inbox")).toHaveAccessibleName("Inbox 7"); // 3 ongelezen mail + 4 Teams (eigen bericht telt niet)
    await expect(inboxFilter(page).getByRole("button", { name: /^Mail/ })).toHaveText(/Mail\s*3/);
    await expect(inboxFilter(page).getByRole("button", { name: /^Teams/ })).toHaveText(/Teams\s*4/);
    await openItem(page, "Heeft iemand de benchmarkcijfers");
    await page.keyboard.press("e");
    await expect(entryButton(page, "Inbox")).toHaveAccessibleName("Inbox 6");
    await openItem(page, "Contractverlenging Object Store"); // gelezen mail afhandelen verandert de teller niet
    await page.keyboard.press("e");
    await expect(entryButton(page, "Inbox")).toHaveAccessibleName("Inbox 6");
  });

  test("filter Alles / Mail / Teams, onthouden na herladen; t wisselt, tooltips noemen de toets", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    const f = inboxFilter(page);
    await expect(f.getByRole("button", { name: "Alles" })).toHaveAttribute("aria-pressed", "true");
    await expect(f.getByRole("button", { name: /^Mail/ })).toHaveAttribute("title", /\(t wisselt\)/);
    await f.getByRole("button", { name: /^Mail/ }).click();
    await expect(f.getByRole("button", { name: /^Mail/ })).toHaveAttribute("aria-pressed", "true");
    await expect(lijst(page).getByText("Kun je de demo om 14:00")).toHaveCount(0);
    await expect(lijst(page).getByText("Offerte licenties buildserver")).toBeVisible();
    await expect.poll(async () => (await prefsDoc(page)).inboxFilter).toBe("mail");
    await page.reload();
    await goTo(page, "Inbox");
    await expect(f.getByRole("button", { name: /^Mail/ })).toHaveAttribute("aria-pressed", "true");
    await expect(lijst(page).getByText("Offerte licenties buildserver")).toBeVisible();
    await expect(lijst(page).getByText("Kun je de demo om 14:00")).toHaveCount(0);
    await page.locator("body").press("t");
    await expect(f.getByRole("button", { name: /^Teams/ })).toHaveAttribute("aria-pressed", "true");
    await expect(lijst(page).getByText("Kun je de demo om 14:00")).toBeVisible();
    await expect(lijst(page).getByText("Offerte licenties buildserver")).toHaveCount(0);
    await page.locator("body").press("t");
    await expect(f.getByRole("button", { name: "Alles" })).toHaveAttribute("aria-pressed", "true");
  });

  test("lege Inbox legt uit wat kan; V toont ook wat je al afhandelde, Terugzetten haalt het terug", async ({ page, open }) => {
    await open(inboxMock({ tools: { "Microsoft 365": {
      outlook_email_search: { items: [], pagination: { moreResults: false } }, chat_message_search: { items: [], pagination: { moreResults: false } } } } }));
    await goTo(page, "Inbox");
    await expect(lijst(page)).toContainText("Inbox leeg. Nieuwe mail en Teams-berichten verschijnen hier vanzelf; V toont ook wat je al afhandelde.");
  });

  test("V toont afgehandelde berichten; Terugzetten (e) zet de mail terug en haalt de categorie weg", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await openItem(page, "Offerte licenties buildserver");
    await page.keyboard.press("e");
    await expect(lijst(page).getByText("Offerte licenties buildserver")).toHaveCount(0);
    const toon = inboxFilter(page).getByRole("button", { name: "Afgehandeld" });
    await expect(toon).toHaveAttribute("title", "Toon ook wat je al afhandelde (v)");
    await page.locator("body").press("v");
    await expect(toon).toHaveAttribute("aria-pressed", "true");
    await expect(lijst(page).getByRole("heading", { name: "Afgehandeld (1)" })).toBeVisible();
    await openItem(page, "Afgehandeld · Offerte licenties buildserver", "Offerte licenties buildserver");
    await actionBar(page).getByRole("button", { name: "Terugzetten" }).click();
    await expect(lijst(page).getByRole("heading", { name: "Afgehandeld (0)" })).toBeVisible();
    await expect(itemWith(page, "Offerte licenties buildserver")).not.toContainText("Afgehandeld");
    await expect.poll(async () => (await mcpCalls(page, "outlook_modify_labels")).map((c) => c.input))
      .toEqual([{ messageId: "ib-m1", addCategories: ["Afgehandeld"] }, { messageId: "ib-m1", removeCategories: ["Afgehandeld"] }]);
    await toon.click();
    await expect(lijst(page).getByRole("heading", { name: /Afgehandeld/ })).toHaveCount(0);
  });
});

// =========================================================================================
test.describe("VIP", () => {
  test("Zet <naam> bovenaan (via Meer en toets b) zet de afzender bovenaan, bewaard in prefs; nogmaals haalt het weg", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await openItem(page, "Contractverlenging Object Store");
    await actionBar(page).getByRole("button", { name: "Meer acties" }).click();
    const meer = actionBar(page).getByRole("menu", { name: "Meer acties" });
    await expect(meer.getByRole("menuitem", { name: "Zet Femke Bos bovenaan (b)" })).toHaveAttribute("title", /\(b\)$/);
    await meer.getByRole("menuitem", { name: "Zet Femke Bos bovenaan (b)" }).click();
    await expect(feedbackBar(page)).toContainText("Femke Bos staat voortaan bovenaan");
    let texts = await rowTexts(page);
    expect(indexOf(texts, "Contractverlenging")).toBeLessThan(indexOf(texts, "Kun je de demo"));
    await expect(rowButton(page, "Femke Bos", "mail, bovenaan")).toBeVisible();
    await expect(detail(page)).toContainText("ja, door jou aangewezen");
    await expect.poll(async () => (await prefsDoc(page)).vip).toEqual(["Femke Bos"]);
    // Toets b werkt direct (zonder Meer te openen) en zet het terug.
    await page.locator("body").press("b");
    await expect(feedbackBar(page)).toContainText("Femke Bos staat niet meer bovenaan");
    await expect.poll(async () => (await prefsDoc(page)).vip).toEqual([]);
    texts = await rowTexts(page);
    expect(indexOf(texts, "Contractverlenging")).toBeGreaterThan(indexOf(texts, "Kun je de demo"));
    // Ongedaan maken zet hem weer bovenaan.
    await feedbackBar(page).getByRole("button", { name: "Ongedaan maken" }).click();
    await expect.poll(async () => (await prefsDoc(page)).vip).toEqual(["Femke Bos"]);
  });

  test("komt de agenda later binnen dan de mail, dan schuift wie Thomas vandaag spreekt alsnog naar boven", async ({ page, open }) => {
    const mock = inboxMock();
    mock.tools["Microsoft 365"].outlook_calendar_search.delayMs = 1500;
    await open(mock);
    await inbox(page);
    await expect(rowButton(page, "Sanne Dekker", "mail, ongelezen, bovenaan")).toBeVisible({ timeout: 6000 });
    await expect(lijst(page).getByRole("heading", { name: "Bovenaan" })).toBeVisible();
  });

  test("wie vandaag met Thomas vergadert staat bovenaan met uitleg; voorkeur vip uit de db werkt na herladen", async ({ page, open }) => {
    await open(inboxMock({ db: { docs: { "prefs/thomas": { vip: ["Joost Kramer"] } } } }));
    await inbox(page);
    await openItem(page, "Voorstel roadmap Q1");
    await expect(detail(page)).toContainText("ja, je vergadert vandaag met Sanne");
    const texts = await rowTexts(page);
    expect(indexOf(texts, "Offerte licenties")).toBeLessThan(indexOf(texts, "Kun je de demo")); // Joost via prefs vip
    await expect(rowButton(page, "Joost Kramer", "mail, ongelezen, bovenaan")).toBeVisible();
  });
});

// =========================================================================================
test.describe("Maildetail", () => {
  test("volledige inhoud via read_resource als nette tekst, ontvangers, bijlagen als vermelding met link naar Outlook", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await openItem(page, "Architectuurschets OIDC-koppeling");
    const d = detail(page);
    await expect(d).toContainText("Volledige tekst van ib-m2: tweede alinea met details & meer.");
    await expect(d).not.toContainText("<p>");
    await expect(d).not.toContainText("color:red");
    await expect(d).toContainText("Pieter Jansen <pieter.jansen@example.com>");
    await expect(d.getByRole("definition").filter({ hasText: "Thomas Testpersoon" })).toBeVisible(); // Aan
    await expect(d.getByRole("definition").filter({ hasText: "Noor Mulder" })).toBeVisible(); // Cc
    await expect(d).toContainText("Bijlagen: schets-oidc.pdf, sequentie.png.");
    const link = d.locator(".detail-body").getByRole("link", { name: /Open in Outlook/ });
    await expect(link).toHaveAttribute("href", "https://outlook.example.com/owa/?ItemID=ib-m2");
    await expect(link).toHaveAttribute("target", "_blank");
    expect((await mcpCalls(page, "read_resource")).map((c) => c.input)).toContainEqual({ uri: "mail:///messages/ib-m2" });
  });

  test("lukt de volledige mail niet: samenvatting met uitleg en Opnieuw proberen", async ({ page, open }) => {
    await open(inboxMock({ tools: { "Microsoft 365": { read_resource: { error: { code: "tool_error", message: "Resource unavailable" } } } } }));
    await inbox(page);
    await openItem(page, "Architectuurschets OIDC-koppeling");
    await expect(detail(page)).toContainText("Zie de schets in de bijlage.");
    await expect(detail(page)).toContainText("Dit is de samenvatting; de volledige mail ophalen lukte niet.");
    await page.evaluate(() => { delete window.__MOCK__.tools["Microsoft 365"].read_resource; window.__MOCK__.tools["Microsoft 365"].read_resource = { text: "Nu wel de volledige tekst." }; });
    await detail(page).getByRole("button", { name: "Opnieuw proberen" }).click();
    await expect(detail(page)).toContainText("Nu wel de volledige tekst.");
  });

  test("actiebalk op één regel: Beantwoord · Afhandelen · Maak actie · Vraag Claude · Open in Outlook · Meer ▾, elk met toets in de tooltip", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await openItem(page, "Offerte licenties buildserver");
    expect(await barLabels(page)).toEqual(["Beantwoord", "Afhandelen", "Maak actie", "Vraag Claude", "Open in Outlook"]);
    const tops = await actionBar(page).evaluate((bar) => [...bar.children].map((c) => Math.round(c.getBoundingClientRect().top)));
    expect(new Set(tops).size, "actiebalk op één regel bij 1280px").toBe(1);
    const keys = { Beantwoord: "r", Afhandelen: "e", "Maak actie": "a", "Vraag Claude": "c" };
    for (const [name, k] of Object.entries(keys)) await expect(actionBar(page).getByRole("button", { name, exact: true })).toHaveAttribute("title", new RegExp("\\(" + k + "\\)$"));
    await expect(actionBar(page).getByRole("link", { name: /Open in Outlook/ })).toHaveAttribute("title", /\(o\)$/);
    // Extra acties hebben geen eigen knop (slot "more"): ze staan in "Meer ▾" van de schil, met hun toets.
    await actionBar(page).getByRole("button", { name: "Meer acties" }).click();
    const meer = actionBar(page).getByRole("menu", { name: "Meer acties" });
    await expect(meer.getByRole("menuitem")).toHaveText(["Allen beantwoorden (l)", "Doorsturen (f)", "Zet Joost Kramer bovenaan (b)", "Nieuw Jira-issue (i)"]);
    await page.keyboard.press("Escape");
    await expect(meer).toBeHidden();
    await actionBar(page).getByRole("button", { name: "Meer acties" }).click(); // na Esc gaat Meer gewoon weer open
    await expect(meer).toBeVisible();
    await meer.getByRole("menuitem", { name: "Doorsturen (f)" }).click();
    await expect(detail(page).getByRole("combobox", { name: "Aan" })).toBeFocused();
  });
});

// =========================================================================================
test.describe("Beantwoorden met verzenduitstel", () => {
  test("r opent het antwoordveld inline; Claude schrijft in EMAIL_STYLE; Ctrl+Enter telt 10 s af en verstuurt dan echt", async ({ page, open }) => {
    await open(inboxMock({ sample: { rules: [{ match: "roadmap",
      text: "Hi Sanne,\n\nAkkoord — goed voorstel. That said, graag een datum voor de review.\n\nGroet,\nThomas" }] } }));
    await inbox(page);
    await openItem(page, "Voorstel roadmap Q1");
    await page.locator("body").press("r");
    const ta = composerText(page);
    await expect(ta).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0); // nooit een popup
    expect((await ta.boundingBox()).y).toBeGreaterThan((await actionBar(page).boundingBox()).y);
    await expect(detail(page).getByRole("heading", { name: "Antwoord aan Sanne Dekker" })).toBeVisible();
    await detail(page).getByRole("button", { name: "Laat Claude schrijven" }).click();
    await expect(ta).toHaveValue(/KR\nThomas$/, { timeout: 8000 });
    const value = await ta.inputValue();
    expect(value).not.toMatch(/—|–/);
    expect(value).toContain("That being said");
    expect(value).not.toMatch(/Groet/);
    const prompt = (await mockLog(page)).sample.map((c) => (typeof c.input === "string" ? c.input : "")).find((t) => /roadmap/.test(t));
    expect(prompt).toContain('Afsluiten met exact twee regels: "KR" en "Thomas". Nooit MVG/Groet.');
    expect(await mcpCalls(page, SEND)).toEqual([]);

    await ta.press("Control+Enter");
    const bar = feedbackBar(page);
    await expect(bar).toContainText("✓ Verzonden aan Sanne Dekker");
    await expect(bar.getByRole("button", { name: "Annuleer (10s)" })).toBeVisible();
    await expect(detail(page)).toContainText("Wordt zo verzonden aan Sanne Dekker");
    await page.clock.runFor(4000);
    await expect(bar.getByRole("button", { name: /^Annuleer \([56]s\)$/ })).toBeVisible(); // klok loopt ook echt door
    expect(await mcpCalls(page, SEND), "verstuurd voor de 10 seconden om waren").toEqual([]);
    await page.clock.runFor(7000);
    await expect.poll(async () => (await mcpCalls(page, "outlook_send_draft")).length).toBe(1);
    const [draft] = await mcpCalls(page, "outlook_create_reply_draft");
    expect(draft.input.messageId).toBe("ib-m3");
    expect(draft.input.bodyType).toBe("text");
    expect(draft.input.body).toBe(value);
    expect(draft.input.body).toMatch(/\n\nKR\nThomas$/);
    const [send] = await mcpCalls(page, "outlook_send_draft");
    expect(send.input.messageId).toMatch(/^mock-outlook_create_reply_draft-/);
    await expect(detail(page)).toContainText("✓ Verzonden aan Sanne Dekker");
    await expect(bar.getByRole("button", { name: /Annuleer|Ongedaan/ })).toHaveCount(0);
  });

  test("zelf getypte tekst krijgt ook de mailstijl (Hi blijft, KR/Thomas erbij, geen em-dash)", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await openItem(page, "Offerte licenties buildserver");
    await actionBar(page).getByRole("button", { name: "Beantwoord" }).click();
    await composerText(page).fill("Hi Joost,\n\nPrima — ga je gang.");
    await detail(page).getByRole("button", { name: "Verstuur" }).click();
    await page.clock.runFor(11000);
    await expect.poll(async () => (await mcpCalls(page, "outlook_create_reply_draft")).length).toBe(1);
    expect((await mcpCalls(page, "outlook_create_reply_draft"))[0].input.body).toBe("Hi Joost,\n\nPrima, ga je gang.\n\nKR\nThomas");
  });

  test("Annuleer binnen 10 s verstuurt niets (geen enkele call) en geeft de tekst terug; z annuleert ook", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await openItem(page, "Offerte licenties buildserver");
    await page.locator("body").press("r");
    await composerText(page).fill("Hi Joost,\n\nAkkoord met de offerte.");
    await composerText(page).press("Control+Enter");
    await page.clock.runFor(2000);
    await feedbackBar(page).getByRole("button", { name: /^Annuleer \(\d+s\)$/ }).click();
    await expect(feedbackBar(page)).toContainText("Niet verzonden aan Joost Kramer. Je tekst staat weer klaar");
    await expect(composerText(page)).toHaveValue("Hi Joost,\n\nAkkoord met de offerte.");
    await page.clock.runFor(20000);
    expect(await mcpCalls(page, SEND)).toEqual([]);
    // Nogmaals, nu met z.
    await composerText(page).press("Control+Enter");
    await page.clock.runFor(1000);
    await page.locator("body").press("z");
    await expect(composerText(page)).toHaveValue("Hi Joost,\n\nAkkoord met de offerte.");
    await page.clock.runFor(20000);
    expect(await mcpCalls(page, SEND)).toEqual([]);
  });

  test("een nieuwe melding tijdens het aftellen annuleert of versnelt niets; elke wachtende mail blijft te annuleren in zijn detail", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    // Twee antwoorden kort na elkaar.
    await openItem(page, "Voorstel roadmap Q1");
    await page.locator("body").press("r");
    await composerText(page).fill("Hi Sanne,\n\nAkkoord.");
    await composerText(page).press("Control+Enter");
    await page.clock.runFor(1000);
    await openItem(page, "Architectuurschets OIDC-koppeling");
    await page.locator("body").press("r");
    await composerText(page).fill("Hi Pieter,\n\nIk kijk ernaar.");
    await composerText(page).press("Control+Enter");
    await page.clock.runFor(1000);
    // Een andere handeling vervangt de balk.
    await openItem(page, "Contractverlenging Object Store");
    await page.locator("body").press("e");
    await expect(feedbackBar(page)).toContainText("Contractverlenging Object Store afgehandeld");
    await page.clock.runFor(2000);
    expect(await mcpCalls(page, SEND), "wachtende mail vervroegd verstuurd").toEqual([]);
    // Pieter annuleren via zijn eigen detail.
    await openItem(page, "Architectuurschets OIDC-koppeling");
    await expect(detail(page)).toContainText("Wordt zo verzonden aan Pieter Jansen");
    await detail(page).getByRole("button", { name: "Annuleer verzenden" }).click();
    await expect(composerText(page)).toHaveValue("Hi Pieter,\n\nIk kijk ernaar.");
    // Sanne gaat op haar eigen tijd, precies één keer.
    await page.clock.runFor(8000);
    await expect.poll(async () => (await mcpCalls(page, "outlook_send_draft")).length).toBe(1);
    await page.clock.runFor(15000);
    const drafts = await mcpCalls(page, "outlook_create_reply_draft");
    expect(drafts.map((c) => c.input.messageId)).toEqual(["ib-m3"]);
    expect(await mcpCalls(page, "outlook_send_draft")).toHaveLength(1);
  });

  test("Allen beantwoorden (l) gebruikt create_reply_all_draft en daarna send_draft", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await openItem(page, "Architectuurschets OIDC-koppeling");
    await page.locator("body").press("l");
    await expect(detail(page).getByRole("heading", { name: "Allen beantwoorden" })).toBeVisible();
    await expect(detail(page)).toContainText("Aan Pieter Jansen, Noor Mulder · Re: Architectuurschets OIDC-koppeling");
    await composerText(page).fill("Hi allen,\n\nDank, ik reageer vrijdag.");
    await composerText(page).press("Control+Enter");
    await expect(feedbackBar(page)).toContainText("Verzonden aan Pieter Jansen en anderen");
    await page.clock.runFor(11000);
    await expect.poll(async () => (await mcpCalls(page, "outlook_send_draft")).length).toBe(1);
    expect((await mcpCalls(page, "outlook_create_reply_all_draft"))[0].input).toEqual({ messageId: "ib-m2",
      body: "Hi allen,\n\nDank, ik reageer vrijdag.\n\nKR\nThomas", bodyType: "text" });
    expect(await mcpCalls(page, "outlook_create_reply_draft")).toEqual([]);
  });

  test("Doorsturen (f): Aan-veld met suggesties uit het adresboek, verstuurt na 10 s met outlook_forward_mail", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await openItem(page, "Offerte licenties buildserver");
    await page.locator("body").press("f");
    const aan = detail(page).getByRole("combobox", { name: "Aan" });
    await expect(aan).toBeFocused();
    await aan.pressSequentially("thom");
    await expect(detail(page).getByRole("option")).toHaveCount(0); // Thomas zelf staat niet in het adresboek
    await aan.fill("");
    await aan.pressSequentially("pie");
    const opties = detail(page).getByRole("listbox", { name: "Suggesties uit je adresboek" });
    await expect(opties.getByRole("option")).toHaveCount(1);
    await opties.getByRole("option", { name: /Pieter Jansen/ }).click();
    await expect(aan).toHaveValue("Pieter Jansen <pieter.jansen@example.com>, ");
    await composerText(page).fill("Kun jij hier naar kijken?");
    await composerText(page).press("Control+Enter");
    await expect(feedbackBar(page)).toContainText("Verzonden aan Pieter Jansen");
    await page.clock.runFor(5000);
    expect(await mcpCalls(page, SEND)).toEqual([]);
    await page.clock.runFor(6000);
    await expect.poll(async () => (await mcpCalls(page, "outlook_forward_mail")).length).toBe(1);
    expect((await mcpCalls(page, "outlook_forward_mail"))[0].input).toEqual({ messageId: "ib-m1", to: ["pieter.jansen@example.com"],
      comment: "Kun jij hier naar kijken?\n\nKR\nThomas" });
  });

  test("Doorsturen: onbekende ontvanger of leeg Aan-veld geeft een duidelijke melding en verstuurt niets; toetsen in de lijst kiezen", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await openItem(page, "Offerte licenties buildserver");
    await page.locator("body").press("f");
    await detail(page).getByRole("button", { name: "Verstuur" }).click();
    await expect(detail(page).getByRole("alert")).toContainText("Vul in aan wie je de mail doorstuurt.");
    const aan = detail(page).getByRole("combobox", { name: "Aan" });
    await aan.fill("Onbekend Iemand");
    await detail(page).getByRole("button", { name: "Verstuur" }).click();
    await expect(detail(page).getByRole("alert")).toContainText("Onbekende ontvanger: Onbekend Iemand. Kies iemand uit de suggesties of typ een e-mailadres.");
    // Pijltje en Enter kiezen een suggestie; Esc sluit eerst de suggesties, dan het veld.
    await aan.fill("");
    await aan.pressSequentially("san");
    await aan.press("ArrowDown");
    await expect(aan).toHaveAttribute("aria-expanded", "true");
    await aan.press("Enter");
    await expect(aan).toHaveValue("Sanne Dekker <sanne.dekker@example.com>, ");
    await page.clock.runFor(20000);
    expect(await mcpCalls(page, SEND)).toEqual([]);
    await aan.press("Escape");
    await expect(detail(page).getByRole("combobox", { name: "Aan" })).toHaveCount(0);
    // De tekst blijft bewaard als je het veld weer opent.
    await page.locator("body").press("f");
    await expect(detail(page).getByRole("combobox", { name: "Aan" })).toHaveValue("Sanne Dekker <sanne.dekker@example.com>, ");
  });

  test("fout bij versturen: mensentaal, tekst blijft staan, Opnieuw proberen gebruikt hetzelfde concept", async ({ page, open }) => {
    await open(inboxMock({ tools: { "Microsoft 365": { outlook_send_draft: { sequence: [
      { error: { code: "tool_error", message: "MailboxNotEnabledForRESTAPI" } }, { payload: { id: "sent-1" } }] } } } }));
    await inbox(page);
    await openItem(page, "Voorstel roadmap Q1");
    await page.locator("body").press("r");
    await composerText(page).fill("Hi Sanne,\n\nAkkoord.");
    await composerText(page).press("Control+Enter");
    await page.clock.runFor(11000);
    const bar = feedbackBar(page);
    await expect(bar).toContainText("⚠ Niet verzonden aan Sanne Dekker");
    await expect(bar).toContainText("Microsoft 365 weigerde het versturen. Je tekst blijft staan.");
    await expect(composerText(page)).toHaveValue("Hi Sanne,\n\nAkkoord.");
    await expect(detail(page).getByRole("alert")).toContainText("Microsoft 365 weigerde het versturen.");
    await bar.getByRole("button", { name: "Opnieuw proberen" }).click();
    await expect.poll(async () => (await mcpCalls(page, "outlook_send_draft")).length).toBe(2);
    await expect(bar).toContainText("✓ Verzonden aan Sanne Dekker");
    const sends = await mcpCalls(page, "outlook_send_draft");
    expect(sends[1].input).toEqual(sends[0].input);
    expect(await mcpCalls(page, "outlook_create_reply_draft")).toHaveLength(1);
    await expect(detail(page)).toContainText("✓ Verzonden aan Sanne Dekker");
  });
});

// =========================================================================================
test.describe("Afhandelen", () => {
  test("mail: categorie Afgehandeld + weg uit de lijst; Ongedaan maken en z halen de categorie weer weg", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await openItem(page, "Offerte licenties buildserver");
    await actionBar(page).getByRole("button", { name: "Afhandelen" }).click();
    await expect(lijst(page).getByText("Offerte licenties buildserver")).toHaveCount(0);
    await expect(feedbackBar(page)).toContainText("✓ Offerte licenties buildserver afgehandeld");
    await expect.poll(async () => (await mcpCalls(page, "outlook_modify_labels")).length).toBe(1);
    await feedbackBar(page).getByRole("button", { name: "Ongedaan maken" }).click();
    await expect(itemWith(page, "Offerte licenties buildserver")).toBeVisible();
    await expect.poll(async () => (await mcpCalls(page, "outlook_modify_labels")).length).toBe(2);
    await expect.poll(async () => Object.keys(await dbDump(page, "inbox_verborgen/")).length).toBe(0);
    await openItem(page, "Offerte licenties buildserver");
    await page.locator("body").press("e");
    await expect(lijst(page).getByText("Offerte licenties buildserver")).toHaveCount(0);
    await page.locator("body").press("z");
    await expect(itemWith(page, "Offerte licenties buildserver")).toBeVisible();
    await expect.poll(async () => (await mcpCalls(page, "outlook_modify_labels")).map((c) => c.input)).toEqual([
      { messageId: "ib-m1", addCategories: ["Afgehandeld"] }, { messageId: "ib-m1", removeCategories: ["Afgehandeld"] },
      { messageId: "ib-m1", addCategories: ["Afgehandeld"] }, { messageId: "ib-m1", removeCategories: ["Afgehandeld"] }]);
  });

  test("mail met categorie Afgehandeld uit Outlook staat niet in de lijst", async ({ page, open }) => {
    const mock = inboxMock();
    mock.tools["Microsoft 365"].outlook_email_search.items[0].categories = ["Afgehandeld"];
    await open(mock);
    await inbox(page);
    await expect(lijst(page).getByText("Offerte licenties buildserver")).toHaveCount(0);
  });
});

// =========================================================================================
test.describe("Teams-bericht", () => {
  test("detail: volledige tekst, chatnaam, link; actiebalk Antwoord · Afhandelen · Maak actie · Vraag Claude · Open in Teams", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await openItem(page, "Heeft iemand de benchmarkcijfers", "Mark Bakker in Object Store kernteam");
    const d = detail(page);
    await expect(d.getByRole("heading", { name: "Mark Bakker in Object Store kernteam" })).toBeVisible();
    await expect(d).toContainText("Heeft iemand de benchmarkcijfers van gisteren?");
    await expect(d.getByRole("definition").filter({ hasText: "Object Store kernteam" })).toBeVisible();
    expect(await barLabels(page)).toEqual(["Antwoord", "Afhandelen", "Maak actie", "Vraag Claude", "Open in Teams"]);
    await actionBar(page).getByRole("button", { name: "Meer acties" }).click();
    await expect(actionBar(page).getByRole("menuitem", { name: "Zet Mark Bakker bovenaan (b)" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(actionBar(page).getByRole("button", { name: "Antwoord" })).toHaveAttribute("title", /\(r\)$/);
    await expect(actionBar(page).getByRole("link", { name: /Open in Teams/ })).toHaveAttribute("href", `https://teams.example.com/l/message/${encodeURIComponent(GROUP_CHAT)}/ib-t2`);
  });

  test("Afhandelen (e) verbergt het bericht met ongedaan maken, bewaard in inbox_verborgen; geen Outlook-call", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await openItem(page, "Heeft iemand de benchmarkcijfers", "Mark Bakker");
    await page.locator("body").press("e");
    await expect(lijst(page).getByText("benchmarkcijfers")).toHaveCount(0);
    await expect(feedbackBar(page)).toContainText("✓ Bericht van Mark Bakker afgehandeld");
    await expect.poll(async () => await dbDump(page, "inbox_verborgen/")).toEqual({
      "inbox_verborgen/t-ib-t2": expect.objectContaining({ messageId: "ib-t2", soort: "teams", van: "Mark Bakker" }) });
    expect(await mcpCalls(page, "outlook_modify_labels")).toEqual([]);
    await page.reload();
    await goTo(page, "Inbox");
    await expect(lijst(page).getByText("Kun je de demo om 14:00")).toBeVisible();
    await expect(lijst(page).getByText("benchmarkcijfers")).toHaveCount(0);
  });

  test("Antwoord zonder Teams-recht (standaard): één poging, dan klembord + 1-op-1 chat met vooringevulde tekst; daarna direct 'Kopieer en open in Teams'", async ({ page, open }) => {
    await open(inboxMock({ sample: { rules: [{ match: "Teams-antwoord", text: "Ja, ik open de demo om 14:00 — prima.\n\nKR\nThomas" }] } }));
    await inbox(page);
    await openItem(page, "Kun je de demo om 14:00", "Lotte Visser");
    await page.locator("body").press("r");
    await detail(page).getByRole("button", { name: "Laat Claude schrijven" }).click();
    await expect(composerText(page)).toHaveValue("Ja, ik open de demo om 14:00, prima.", { timeout: 8000 }); // finishChat: geen KR/Thomas, geen em-dash
    const prompt = (await mockLog(page)).sample.map((c) => (typeof c.input === "string" ? c.input : "")).find((t) => /Teams-antwoord/.test(t));
    expect(prompt).toContain("Geen afsluiter: nooit \"KR\"");
    expect(prompt).toContain("that being said");
    await detail(page).getByRole("button", { name: "Verstuur" }).click();
    const bar = feedbackBar(page);
    await expect(bar).toContainText("Tekst gekopieerd. Plak hem in Teams");
    await expect(bar).toContainText("Teams staat direct versturen niet toe voor jouw account (IT moet toestemming geven).");
    const body = "Ja, ik open de demo om 14:00, prima.";
    const deeplink = "https://teams.microsoft.com/l/chat/0/0?users=lotte.visser@example.com&message=" + encodeURIComponent(body);
    await expect(bar.getByRole("link", { name: /Open Teams/ })).toHaveAttribute("href", deeplink);
    expect(await page.evaluate(() => window.__copied)).toEqual([body]);
    expect(await page.evaluate(() => window.__opened)).toEqual([deeplink]);
    const [tryCall] = await mcpCalls(page, "teams_send_chat_message");
    expect(tryCall.input).toEqual({ chatId: LOTTE_CHAT, body });
    expect(tryCall.outcome).toBe("tool_error");
    await expect.poll(async () => (await prefsDoc(page)).teamsSendBlocked?.since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Met de vlag: de knop heet direct zo en er is geen mislukte poging meer.
    await expect(actionBar(page).getByRole("button", { name: "Kopieer en open in Teams" })).toBeVisible();
    await expect(detail(page)).toContainText("✓ Tekst gekopieerd. Plak hem in Teams.");
    await actionBar(page).getByRole("button", { name: "Kopieer en open in Teams" }).click();
    await composerText(page).fill("Top, tot straks");
    await composer(page).getByRole("button", { name: "Kopieer en open in Teams" }).click();
    expect(await mcpCalls(page, "teams_send_chat_message")).toHaveLength(1);
    await expect.poll(async () => page.evaluate(() => window.__copied.at(-1))).toBe("Top, tot straks");
  });

  test("lukt kopiëren niet, dan zegt de balk dat eerlijk en staat de tekst geselecteerd klaar", async ({ page, open }) => {
    await page.addInitScript(() => { document.execCommand = () => false; });
    await open(inboxMock({ db: { docs: { "prefs/thomas": { teamsSendBlocked: { since: new Date(referenceNow() - 86400000).toISOString() } } } } }));
    await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("geen recht")) } }); });
    await inbox(page);
    await openItem(page, "Heeft iemand de benchmarkcijfers", "Mark Bakker");
    await actionBar(page).getByRole("button", { name: "Kopieer en open in Teams" }).click();
    await composerText(page).fill("Ik zoek ze op.");
    await composerText(page).press("Control+Enter");
    await expect(feedbackBar(page)).toContainText("⚠ Kopiëren lukte niet. Kopieer je tekst zelf en plak hem in Teams");
    const ta = detail(page).getByRole("textbox", { name: "Je tekst" });
    await expect(ta).toBeFocused();
    await expect(ta).toHaveValue("Ik zoek ze op.");
  });

  test("groepschat zonder Teams-recht: klembord en het bericht openen via zijn webUrl", async ({ page, open }) => {
    await open(inboxMock({ db: { docs: { "prefs/thomas": { teamsSendBlocked: { since: new Date(referenceNow() - 86400000).toISOString() } } } } }));
    await inbox(page);
    await openItem(page, "Heeft iemand de benchmarkcijfers", "Mark Bakker");
    await actionBar(page).getByRole("button", { name: "Kopieer en open in Teams" }).click();
    await composerText(page).fill("Ik zoek ze op.");
    await composerText(page).press("Control+Enter");
    await expect(feedbackBar(page)).toContainText("Tekst gekopieerd. Plak hem in Teams");
    expect(await page.evaluate(() => window.__opened)).toEqual([`https://teams.example.com/l/message/${encodeURIComponent(GROUP_CHAT)}/ib-t2`]);
    expect(await mcpCalls(page, "teams_send_chat_message")).toEqual([]);
  });

  test("vlag ouder dan 7 dagen: de app probeert direct versturen opnieuw; met recht gaat het bericht echt (Bekijk ↗, geen ongedaan)", async ({ page, open }) => {
    await open(inboxMock({ teamsSendBlocked: false, db: { docs: { "prefs/thomas": { teamsSendBlocked: { since: new Date(referenceNow() - 8 * 86400000).toISOString() } } } } }));
    await inbox(page);
    await openItem(page, "Heeft iemand de benchmarkcijfers", "Mark Bakker");
    await expect(actionBar(page).getByRole("button", { name: "Antwoord", exact: true })).toBeVisible();
    await page.locator("body").press("r");
    await composerText(page).fill("Ik zoek ze op — KR\nThomas");
    await composerText(page).press("Control+Enter");
    await expect.poll(async () => (await mcpCalls(page, "teams_send_chat_message")).length).toBe(1);
    expect((await mcpCalls(page, "teams_send_chat_message"))[0].input).toEqual({ chatId: GROUP_CHAT, body: "Ik zoek ze op" });
    const bar = feedbackBar(page);
    await expect(bar).toContainText("✓ Teams-bericht verzonden in Object Store kernteam");
    await expect(bar.getByRole("link", { name: /Bekijk/ })).toHaveAttribute("target", "_blank");
    await expect(bar.getByRole("button", { name: /Ongedaan|Annuleer/ })).toHaveCount(0);
    expect(await page.evaluate(() => window.__opened)).toEqual([]);
  });

  test("andere fout bij Teams versturen: melding in mensentaal, tekst blijft, geen klembord-terugval", async ({ page, open }) => {
    await open(inboxMock({ tools: { "Microsoft 365": { teams_send_chat_message: { error: { code: "rate_limited", message: "Too many requests" } } } } }));
    await inbox(page);
    await openItem(page, "Heeft iemand de benchmarkcijfers", "Mark Bakker");
    await page.locator("body").press("r");
    await composerText(page).fill("Ik zoek ze op.");
    await composerText(page).press("Control+Enter");
    await expect(detail(page).getByRole("alert")).toContainText("Versturen in Teams lukte niet. Je tekst blijft staan.");
    await expect(composerText(page)).toHaveValue("Ik zoek ze op.");
    await expect(feedbackBar(page)).toContainText("⚠ Teams-bericht niet verzonden");
    expect(await page.evaluate(() => window.__copied)).toEqual([]);
    expect((await prefsDoc(page)).teamsSendBlocked ?? null).toBeNull();
  });
});

// =========================================================================================
test.describe("Maak actie", () => {
  test("blijft in de Inbox: '✓ Actie toegevoegd bij <programma> · Bekijk'; Bekijk selecteert de nieuwe actie", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await openItem(page, "Architectuurschets OIDC-koppeling");
    await page.locator("body").press("a");
    const bar = feedbackBar(page);
    await expect(bar).toContainText("✓ Actie toegevoegd bij OIDC");
    await expect(entryButton(page, "Inbox")).toHaveAttribute("aria-current", "page");
    await expect.poll(async () => Object.values(await dbDump(page, "acties/")).filter((a) => a.text === "Architectuurschets OIDC-koppeling")).toEqual([
      expect.objectContaining({ bron: "mail", prog: "OIDC", van: "Pieter Jansen", status: "open",
        bronUrl: "https://outlook.example.com/owa/?ItemID=ib-m2" })]);
    await bar.getByRole("button", { name: "Bekijk" }).click();
    await expect(entryButton(page, "Acties")).toHaveAttribute("aria-current", "page");
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Architectuurschets OIDC-koppeling");
  });
});

// =========================================================================================
test.describe("Adresboek", () => {
  test("naam en e-mail uit mail, agenda en Teams in db 'adresboek'; geen inhoud, niet Thomas zelf, geen no-reply; search() voor anderen", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await page.clock.runFor(3000);
    await expect.poll(async () => Object.keys(await dbDump(page, "adresboek/")).length).toBeGreaterThanOrEqual(8);
    const docs = Object.values(await dbDump(page, "adresboek/"));
    for (const d of docs) expect(Object.keys(d).sort()).toEqual(["email", "gezien", "naam"]);
    const emails = docs.map((d) => d.email);
    for (const e of ["sanne.dekker@example.com", "joost.kramer@example.com", "pieter.jansen@example.com", "lotte.visser@example.com", "mark.bakker@example.com"]) expect(emails).toContain(e);
    expect(emails).not.toContain("thomas@example.com");
    expect(emails.some((e) => /noreply/.test(e))).toBe(false);
    expect(docs.find((d) => d.email === "lotte.visser@example.com").naam).toBe("Lotte Visser");
    expect(await page.evaluate(() => addressBook.search("sanne"))).toEqual([{ name: "Sanne Dekker", email: "sanne.dekker@example.com" }]);
  });

  test("maximaal 300 in de db; de oudste gaat eruit", async ({ page, open }) => {
    await open(inboxMock());
    await inbox(page);
    await page.evaluate(() => { for (let i = 0; i < 320; i++) addressBook.add("Test Persoon " + i, "persoon" + i + "@example.org", Date.now() - (320 - i) * 60000); });
    await page.clock.runFor(3000);
    await expect.poll(async () => Object.keys(await dbDump(page, "adresboek/")).length, { timeout: 10000 }).toBe(300);
    const emails = Object.values(await dbDump(page, "adresboek/")).map((d) => d.email);
    expect(emails).toContain("persoon319@example.org");
    expect(emails).not.toContain("persoon0@example.org");
  });
});

// =========================================================================================
test.describe("Mock: rechten zoals bij Thomas", () => {
  test("Teams-schrijftools en search_people geven standaard 'Missing scope'; met teamsSendBlocked/peopleBlocked false werken ze", async ({ page, open }) => {
    await open(inboxMock());
    const call = (tool, input) => page.evaluate(([t, i]) => window.claude.use("mcp").then((m) => m.callTool("Microsoft 365", t, i))
      .then(() => "ok", (e) => e.code + ": " + e.message), [tool, input]);
    expect(await call("search_people", { query: "sanne" })).toMatch(/^tool_error: FORBIDDEN: Missing scope 'People\.Read'/);
    expect(await call("teams_reply_channel_message", { teamId: "t", channelId: "c", messageId: "m", body: "x" })).toMatch(/Missing scope 'ChannelMessage\.Send'/);
    expect(await call("teams_create_chat", { members: ["a@example.com"] })).toMatch(/Missing scope 'Chat\.Create'/);
    await page.evaluate(() => { window.__MOCK__.teamsSendBlocked = false; window.__MOCK__.peopleBlocked = false; });
    expect(await call("search_people", { query: "sanne" })).toBe("ok");
    expect(await call("teams_send_chat_message", { chatId: "c", body: "x" })).toBe("ok");
  });
});

// =========================================================================================
test.describe("Mobiel 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("lijst, detail met antwoordveld en actiebalk; geen horizontale scroll", async ({ page, open }) => {
    await open(inboxMock());
    await goTo(page, "Inbox");
    await expect(lijst(page).getByText("Voorstel roadmap Q1")).toBeVisible();
    const noH = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await noH();
    await itemWith(page, "Architectuurschets OIDC-koppeling").click({ position: { x: 60, y: 14 } });
    await expect(detail(page)).toBeVisible();
    await expect(detail(page)).toContainText("Volledige tekst van ib-m2");
    await actionBar(page).getByRole("button", { name: "Beantwoord" }).click();
    await expect(composerText(page)).toBeVisible();
    await noH();
    await page.keyboard.press("Escape"); // sluit het antwoordveld
    await expect(composerText(page)).toHaveCount(0);
  });
});
